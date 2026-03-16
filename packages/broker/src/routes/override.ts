/**
 * Human override routes — pause, resume, discard, inspect, release.
 *
 * All routes live under /override/* to keep them separate from the
 * regular message and channel APIs.
 */

import type { FastifyInstance } from "fastify";
import type Redis from "ioredis";
import {
  isGloballyPaused,
  setGlobalPause,
  getHeldMessages,
  discardAllHeld,
  heldCount,
  removeHeldMessage,
} from "../hold.js";
import { publishMessage } from "../streams.js";
import { fanoutPublish } from "../channels.js";

export async function overrideRoutes(
  app: FastifyInstance,
  redis: Redis,
): Promise<void> {
  // ── POST /override/pause ─────────────────────────────────────────
  app.post("/override/pause", async (_request, reply) => {
    await setGlobalPause(redis, true);
    return reply.send({ paused: true });
  });

  // ── POST /override/resume ────────────────────────────────────────
  // Flushes all held messages (publishes in FIFO order), then unpauses.
  app.post("/override/resume", async (_request, reply) => {
    const held = await getHeldMessages(redis);

    // Publish each held message in order.
    for (const msg of held) {
      await publishMessage(redis, msg);
      if (msg.channel) {
        await fanoutPublish(redis, msg.channel, JSON.stringify(msg));
      }
    }

    // Clear the queue and unpause.
    await discardAllHeld(redis);
    await setGlobalPause(redis, false);

    return reply.send({ paused: false, flushed: held.length });
  });

  // ── POST /override/discard ───────────────────────────────────────
  // Clears the held queue without delivering. System stays paused.
  app.post("/override/discard", async (_request, reply) => {
    const count = await discardAllHeld(redis);
    return reply.send({ discarded: count });
  });

  // ── GET /override/status ─────────────────────────────────────────
  app.get("/override/status", async (_request, reply) => {
    const paused = await isGloballyPaused(redis);
    const count = await heldCount(redis);
    return reply.send({ paused, heldCount: count });
  });

  // ── GET /override/held ───────────────────────────────────────────
  app.get("/override/held", async (_request, reply) => {
    const messages = await getHeldMessages(redis);
    return reply.send(messages);
  });

  // ── POST /override/release/:messageId ────────────────────────────
  // Release a single held message. Optionally override its payload.
  app.post<{
    Params: { messageId: string };
    Body: { payload?: unknown };
  }>("/override/release/:messageId", async (request, reply) => {
    const { messageId } = request.params;
    const body = (request.body ?? {}) as { payload?: unknown };

    const msg = await removeHeldMessage(redis, messageId);
    if (!msg) {
      return reply.status(404).send({
        error: `Message "${messageId}" not found in held queue`,
      });
    }

    // Override payload if provided.
    const modified = body.payload !== undefined;
    if (modified) {
      msg.payload = body.payload;
    }

    // Publish the (possibly modified) message.
    await publishMessage(redis, msg);
    if (msg.channel) {
      await fanoutPublish(redis, msg.channel, JSON.stringify(msg));
    }

    return reply.send({ released: messageId, modified });
  });
}
