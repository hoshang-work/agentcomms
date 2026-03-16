/**
 * agent://planner — Task decomposition agent.
 *
 * Accepts a user task from the command line, calls Claude to break it into
 * 3 subtasks, sends each to agent://worker, collects all 3 responses,
 * then broadcasts the combined results to channel://results.
 */

import Anthropic from "@anthropic-ai/sdk";
import { AgentClient, generateKeypair } from "@agentlink/sdk";
import type { AgentMessage, Intent } from "@agentlink/core";
import { ANTHROPIC_API_KEY, BROKER_URL, REGISTRY_URL } from "../config.js";

const task = process.argv[2];
if (!task) {
  console.error("Usage: npx tsx src/agents/planner.ts <task>");
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const kp = generateKeypair();

const client = new AgentClient({
  agentId: "agent://planner",
  privateKey: kp.privateKey,
  brokerUrl: BROKER_URL,
  registryUrl: REGISTRY_URL,
});

async function main() {
  // 1. Register
  console.log("[planner] Registering...");
  await client.register(["task_planning"], ["REQUEST", "RESPONSE"]);
  console.log("[planner] ✅ Registered");

  // 2. Grant permissions:
  //    - planner allows worker to send RESPONSE back
  //    - worker allows planner to send REQUEST (planner also grants this to avoid timing race)
  const grants = [
    { granterAgentId: "agent://planner", granteeAgentId: "agent://worker", allowedIntents: ["RESPONSE"] },
    { granterAgentId: "agent://worker", granteeAgentId: "agent://planner", allowedIntents: ["REQUEST"] },
  ];
  for (const grant of grants) {
    const res = await fetch(`${REGISTRY_URL}/permissions/grant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(grant),
    });
    if (res.ok) {
      console.log(`[planner] ✅ Granted ${grant.granteeAgentId} → ${grant.granterAgentId} ${grant.allowedIntents.join(",")} permission`);
    } else {
      const err = await res.text();
      console.error(`[planner] ⚠️  Grant failed: ${err}`);
    }
  }

  // 3. Call Claude to decompose the task into 3 subtasks
  console.log(`[planner] Decomposing task: "${task}"`);
  const decomposition = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Break the following task into exactly 3 independent subtasks. Return ONLY a JSON array of 3 strings, no other text.\n\nTask: ${task}`,
      },
    ],
  });

  const rawText =
    decomposition.content[0].type === "text"
      ? decomposition.content[0].text
      : "";
  let subtasks: string[];
  try {
    subtasks = JSON.parse(rawText) as string[];
    if (!Array.isArray(subtasks) || subtasks.length !== 3) {
      throw new Error("Expected array of 3");
    }
  } catch {
    console.error("[planner] ⚠️  Claude didn't return valid JSON, using raw chunks");
    // Fallback: split by newline and take first 3
    subtasks = rawText
      .split("\n")
      .map((s) => s.replace(/^\d+[\.\)]\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 3);
    while (subtasks.length < 3) subtasks.push(`Part ${subtasks.length + 1} of: ${task}`);
  }

  console.log("[planner] Subtasks:");
  subtasks.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));

  // 4. Pin a trace_id for this conversation chain
  const traceId = crypto.randomUUID();
  const traced = client.withTrace(traceId);
  console.log(`[planner] Trace ID: ${traceId}`);

  // 5. Collect responses
  const results = new Map<number, string>();
  let resolveAll: () => void;
  const allDone = new Promise<void>((r) => {
    resolveAll = r;
  });

  client.on("RESPONSE" as Intent, (msg: AgentMessage) => {
    if (msg.trace_id !== traceId) return; // ignore responses from other traces

    const payload = msg.payload as { index: number; result: string };
    console.log(
      `[planner] ✅ Received result for subtask ${payload.index + 1}`,
    );
    results.set(payload.index, payload.result);

    if (results.size === 3) {
      resolveAll();
    }
  });

  // 6. Send each subtask to agent://worker
  for (let i = 0; i < subtasks.length; i++) {
    console.log(`[planner] Sending subtask ${i + 1} to agent://worker...`);
    await traced.send("agent://worker", "REQUEST" as Intent, {
      index: i,
      subtask: subtasks[i],
    });
  }

  // 7. Wait for all 3 responses (with a timeout)
  console.log("[planner] Waiting for all 3 results...");
  const timeout = setTimeout(() => {
    console.error("[planner] ⏰ Timeout — only got", results.size, "of 3 results");
    process.exit(1);
  }, 120_000);

  await allDone;
  clearTimeout(timeout);

  // 8. Broadcast combined results to channel://results
  const combined = subtasks.map((s, i) => ({
    subtask: s,
    result: results.get(i) ?? "(missing)",
  }));

  console.log("[planner] Broadcasting combined results to channel://results...");

  // Ensure channel exists (ignore 409 if already exists)
  await fetch(`${BROKER_URL}/channels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "results", description: "Combined task results" }),
  });

  await traced.broadcast("results", "BROADCAST" as Intent, {
    originalTask: task,
    traceId,
    results: combined,
  });

  console.log("[planner] ✅ Results broadcast! Done.");

  // Give SSE time to flush, then clean up
  setTimeout(() => {
    client.disconnect();
    process.exit(0);
  }, 2000);
}

main().catch((err) => {
  console.error("[planner] Fatal error:", err);
  process.exit(1);
});
