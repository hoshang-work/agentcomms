/**
 * Manual integration test for @agentcomms/sdk.
 *
 * Prerequisites:
 *   - Redis running on localhost:6379
 *   - PostgreSQL running on localhost:5432
 *   - Broker running on http://localhost:3000  (pnpm dev from root)
 *   - Registry running on http://localhost:3001 (pnpm dev from root)
 *
 * Run:
 *   npx tsx test-manual.ts
 */

import { AgentClient, generateKeypair } from "./src/index.ts";

const BROKER_URL = "http://localhost:3000";
const REGISTRY_URL = "http://localhost:3001";

async function main() {
  // ── 1. Generate keypairs ──────────────────────────────────────────────
  const aliceKp = generateKeypair();
  const bobKp = generateKeypair();

  // ── 2. Create clients ────────────────────────────────────────────────
  const alice = new AgentClient({
    agentId: "agent://alice",
    privateKey: aliceKp.privateKey,
    brokerUrl: BROKER_URL,
    registryUrl: REGISTRY_URL,
  });

  const bob = new AgentClient({
    agentId: "agent://bob",
    privateKey: bobKp.privateKey,
    brokerUrl: BROKER_URL,
    registryUrl: REGISTRY_URL,
  });

  // ── 3. Register both agents ──────────────────────────────────────────
  console.log("[alice] Registering...");
  await alice.register(["task_delegation"], ["REQUEST", "RESPONSE"]);
  console.log("[alice] ✅ Registered");

  console.log("[bob]   Registering...");
  await bob.register(["summarization"], ["REQUEST"]);
  console.log("[bob]   ✅ Registered");

  // ── 4. Grant permission: bob allows alice to send REQUEST ────────────
  console.log("[setup] Granting permission: bob allows alice REQUEST...");
  const permRes = await fetch(`${REGISTRY_URL}/permissions/grant`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      granterAgentId: "agent://bob",
      granteeAgentId: "agent://alice",
      allowedIntents: ["REQUEST", "RESPONSE"],
      grantedByHuman: true,
    }),
  });
  console.log("[setup] ✅ Permission granted:", (await permRes.json() as Record<string, unknown>).id);

  // ── 5. Bob subscribes to incoming messages ───────────────────────────
  console.log("[bob]   Subscribing to REQUEST messages...");
  bob.on("REQUEST", (msg) => {
    console.log("\n[bob]   📨 Received REQUEST:");
    console.log("        From:     ", msg.sender);
    console.log("        Trace:   ", msg.trace_id);
    console.log("        Payload: ", JSON.stringify(msg.payload));
    console.log("        Signature:", msg.signature.slice(0, 20) + "...");
  });

  // Give SSE a moment to connect.
  await sleep(1000);

  // ── 6. Alice sends a REQUEST to Bob ──────────────────────────────────
  console.log("\n[alice] Sending REQUEST to agent://bob...");
  const msgId = await alice.send("agent://bob", "REQUEST", {
    task: "summarize this",
  });
  console.log(`[alice] ✅ Message sent (id: ${msgId})`);

  // ── 7. Alice discovers agents with "summarization" capability ────────
  console.log("\n[alice] Discovering agents with 'summarization' capability...");
  const agents = await alice.discover("summarization");
  console.log(`[alice] Found ${agents.length} agent(s):`);
  for (const a of agents) {
    console.log(`        - ${a.agentId} [${a.status}] capabilities: ${a.capabilities.join(", ")}`);
  }

  // ── 8. Test trace propagation ────────────────────────────────────────
  console.log("\n[alice] Sending two traced messages...");
  const traced = alice.withTrace("11111111-2222-3333-4444-555555555555");
  const id1 = await traced.send("agent://bob", "REQUEST", { task: "step 1" });
  const id2 = await traced.send("agent://bob", "REQUEST", { task: "step 2" });
  console.log(`[alice] ✅ Traced msg 1: ${id1}`);
  console.log(`[alice] ✅ Traced msg 2: ${id2}`);

  // Wait for Bob to receive the messages via SSE.
  await sleep(2000);

  // ── 9. Clean up ──────────────────────────────────────────────────────
  console.log("\n[cleanup] Disconnecting...");
  alice.disconnect();
  bob.disconnect();
  console.log("[cleanup] ✅ Done");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
