import type { FastifyInstance } from "fastify";
import type Redis from "ioredis";
import { validate } from "@agentcomms/core";
import { publishMessage } from "../streams.js";
import { fanoutPublish } from "../channels.js";
import { checkPermission } from "../permissions.js";
import { isGloballyPaused, holdMessage } from "../hold.js";

export async function messageRoutes(
  app: FastifyInstance,
  redis: Redis,
  registryUrl: string,
): Promise<void> {
  app.post("/messages", async (request, reply) => {
    const result = validate(request.body);

    if (!result.success) {
      return reply.status(400).send({
        error: "Invalid AgentMessage",
        details: result.errors,
      });
    }

    const msg = result.data;

    // ── Permission check ──────────────────────────────────────────────
    // For direct agent-to-agent messages (recipient is agent://), verify
    // the sender has permission. Skipped for HEARTBEAT and BROADCAST.
    const perm = await checkPermission(registryUrl, msg);
    if (!perm.allowed) {
      return reply.status(403).send({
        error: "Permission denied",
        detail: perm.reason,
      });
    }

    // ── Pause check ────────────────────────────────────────────────
    // If the system is globally paused, hold the message for human
    // review instead of delivering it.
    const paused = await isGloballyPaused(redis);
    if (paused) {
      await holdMessage(redis, msg);
      return reply.status(202).send({
        id: msg.id,
        held: true,
        reason: "System is paused — message held for human review",
      });
    }

    const entryId = await publishMessage(redis, msg);

    // If the message targets a channel, fan it out via Redis pub/sub
    // so SSE subscribers receive it in real-time without polling.
    if (msg.channel) {
      await fanoutPublish(redis, msg.channel, JSON.stringify(msg));
    }

    return reply.status(201).send({
      id: msg.id,
      entryId,
      stream: msg.channel ?? msg.recipient,
    });
  });
}
