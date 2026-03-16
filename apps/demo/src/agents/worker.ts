/**
 * agent://worker — Task execution agent.
 *
 * Listens for REQUEST messages. For each one, calls Claude with the subtask
 * as the prompt. Sends the result back to the sender as a RESPONSE with
 * the same trace_id.
 */

import Anthropic from "@anthropic-ai/sdk";
import { AgentClient, generateKeypair } from "@agentcomms/sdk";
import type { AgentMessage, Intent } from "@agentcomms/core";
import { ANTHROPIC_API_KEY, BROKER_URL, REGISTRY_URL } from "../config.js";

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const kp = generateKeypair();

const client = new AgentClient({
  agentId: "agent://worker",
  privateKey: kp.privateKey,
  brokerUrl: BROKER_URL,
  registryUrl: REGISTRY_URL,
});

async function main() {
  // 1. Register
  console.log("[worker] Registering...");
  await client.register(["task_execution"], ["REQUEST"]);
  console.log("[worker] ✅ Registered");

  // 2. Grant permission: worker allows planner to send REQUEST
  const res = await fetch(`${REGISTRY_URL}/permissions/grant`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      granterAgentId: "agent://worker",
      granteeAgentId: "agent://planner",
      allowedIntents: ["REQUEST"],
    }),
  });
  if (res.ok) {
    console.log("[worker] ✅ Granted planner REQUEST permission");
  } else {
    const err = await res.text();
    console.error("[worker] ⚠️  Grant failed:", err);
  }

  // 3. Subscribe to REQUEST messages
  console.log("[worker] Listening for tasks...");
  client.on("REQUEST" as Intent, (msg: AgentMessage) => {
    void handleRequest(msg);
  });
}

async function handleRequest(msg: AgentMessage) {
  const payload = msg.payload as { index: number; subtask: string };
  console.log(
    `[worker] Received subtask ${payload.index + 1}: "${payload.subtask}"`,
  );

  try {
    // Call Claude to execute the subtask
    const completion = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Complete the following task concisely (2-3 paragraphs max):\n\n${payload.subtask}`,
        },
      ],
    });

    const result =
      completion.content[0].type === "text" ? completion.content[0].text : "";

    console.log(
      `[worker] ✅ Completed subtask ${payload.index + 1} (${result.length} chars)`,
    );

    // Send the result back to the sender with the same trace_id
    const traced = client.withTrace(msg.trace_id);
    await traced.send(msg.sender, "RESPONSE" as Intent, {
      index: payload.index,
      subtask: payload.subtask,
      result,
    });
  } catch (err) {
    console.error(`[worker] ❌ Error processing subtask ${payload.index + 1}:`, err);
  }
}

main().catch((err) => {
  console.error("[worker] Fatal error:", err);
  process.exit(1);
});
