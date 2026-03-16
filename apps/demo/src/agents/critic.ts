/**
 * agent://critic — Quality review agent.
 *
 * Subscribes to channel://results. For each BROADCAST it receives,
 * calls Claude to evaluate the quality of the combined output and
 * logs a structured critique to the console.
 */

import Anthropic from "@anthropic-ai/sdk";
import { AgentClient, generateKeypair } from "@agentcomms/sdk";
import type { AgentMessage, Intent } from "@agentcomms/core";
import { ANTHROPIC_API_KEY, BROKER_URL, REGISTRY_URL } from "../config.js";

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const kp = generateKeypair();

const client = new AgentClient({
  agentId: "agent://critic",
  privateKey: kp.privateKey,
  brokerUrl: BROKER_URL,
  registryUrl: REGISTRY_URL,
});

async function main() {
  // 1. Register
  console.log("[critic] Registering...");
  await client.register(["quality_review"], ["BROADCAST"]);
  console.log("[critic] ✅ Registered");

  // 2. Ensure channel exists (ignore 409)
  await fetch(`${BROKER_URL}/channels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "results", description: "Combined task results" }),
  });

  // 3. Subscribe to BROADCAST messages on channel://results
  console.log("[critic] Listening for results on channel://results...");
  client.on("BROADCAST" as Intent, (msg: AgentMessage) => {
    void handleBroadcast(msg);
  });
}

interface ResultPayload {
  originalTask: string;
  traceId: string;
  results: Array<{ subtask: string; result: string }>;
}

async function handleBroadcast(msg: AgentMessage) {
  const payload = msg.payload as ResultPayload;
  console.log(`\n[critic] 📋 Received results for: "${payload.originalTask}"`);
  console.log(`[critic]    Trace: ${payload.traceId}`);
  console.log(`[critic]    ${payload.results.length} subtask result(s)`);

  // Build a summary of the work for Claude to evaluate
  const workSummary = payload.results
    .map(
      (r, i) =>
        `## Subtask ${i + 1}: ${r.subtask}\n\n${r.result}`,
    )
    .join("\n\n---\n\n");

  try {
    const critique = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `You are a quality reviewer. Evaluate the following work that was produced by breaking a task into subtasks and completing each independently.

Original task: "${payload.originalTask}"

${workSummary}

Provide a structured critique with:
1. Overall quality score (1-10)
2. Strengths (2-3 bullet points)
3. Weaknesses (2-3 bullet points)
4. Whether the subtask results coherently address the original task (yes/no with explanation)
5. One concrete suggestion for improvement

Format your response as a clean, readable report.`,
        },
      ],
    });

    const review =
      critique.content[0].type === "text" ? critique.content[0].text : "";

    console.log("\n" + "═".repeat(60));
    console.log("  QUALITY REVIEW");
    console.log("═".repeat(60));
    console.log(`  Task: ${payload.originalTask}`);
    console.log(`  Trace: ${payload.traceId}`);
    console.log("─".repeat(60));
    console.log(review);
    console.log("═".repeat(60) + "\n");
  } catch (err) {
    console.error("[critic] ❌ Error generating critique:", err);
  }
}

main().catch((err) => {
  console.error("[critic] Fatal error:", err);
  process.exit(1);
});
