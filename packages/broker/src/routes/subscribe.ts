import type { FastifyInstance } from "fastify";
import type Redis from "ioredis";
import type { BrokerConfig } from "../config.js";
import { createRedisClient } from "../redis.js";
import { streamKey, readMessages } from "../streams.js";
import { pubsubChannel } from "../channels.js";

interface SubscribeQuery {
  agentId?: string;
  channel?: string;
}

/**
 * Parse a comma-separated query param into a trimmed, deduped list.
 */
function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return [...new Set(value.split(",").map((s) => s.trim()).filter(Boolean))];
}

/**
 * GET /messages/subscribe — Server-Sent Events endpoint.
 *
 * Query params:
 *   agentId  — subscribe to the agent's direct stream (agent://<name>)
 *   channel  — comma-separated list of channels to subscribe to
 *
 * At least one must be provided; both may be supplied to listen on
 * multiple streams simultaneously.
 *
 * Delivery uses two complementary mechanisms:
 *   1. Redis Streams (XREAD BLOCK) — durable, ordered history
 *   2. Redis pub/sub — real-time fan-out for channel messages
 *
 * The pub/sub path delivers messages immediately while the XREAD loop
 * acts as a catch-up / fallback.  Duplicates are suppressed by tracking
 * seen message IDs.
 */
export async function subscribeRoutes(
  app: FastifyInstance,
  config: BrokerConfig,
): Promise<void> {
  app.get<{ Querystring: SubscribeQuery }>(
    "/messages/subscribe",
    async (request, reply) => {
      const { agentId } = request.query as SubscribeQuery;
      const channels = parseList((request.query as SubscribeQuery).channel);

      if (!agentId && channels.length === 0) {
        return reply.status(400).send({
          error:
            "At least one of `agentId` or `channel` query params is required",
        });
      }

      // Build the map of streams → last-seen IDs.
      // "$" means "only new messages from now on".
      const lastIds = new Map<string, string>();
      if (agentId) {
        // agentId may arrive with or without the "agent://" prefix.
        const normalizedAgent = agentId.startsWith("agent://")
          ? agentId
          : `agent://${agentId}`;
        lastIds.set(streamKey(normalizedAgent), "$");
      }
      for (const ch of channels) {
        lastIds.set(streamKey(`channel://${ch}`), "$");
      }

      // ── dedicated connections ────────────────────────────────────
      // One for blocking XREAD, one for pub/sub (which also blocks).
      const xreadClient = createRedisClient(config);
      await xreadClient.connect();

      let pubsubClient: Redis | null = null;

      // ── SSE headers ──────────────────────────────────────────────
      // CORS headers must be set manually because reply.hijack()
      // bypasses Fastify's plugin pipeline (including @fastify/cors).
      const origin = request.headers.origin ?? "*";
      void reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
      });
      reply.raw.flushHeaders?.();
      reply.hijack();

      // Track seen message IDs to deduplicate across pub/sub and XREAD.
      const seen = new Set<string>();
      const MAX_SEEN = 10_000;

      function writeSse(json: string, msgId: string): void {
        if (seen.has(msgId)) return;
        seen.add(msgId);
        // Prevent unbounded memory growth.
        if (seen.size > MAX_SEEN) {
          const first = seen.values().next().value;
          if (first !== undefined) seen.delete(first);
        }
        reply.raw.write(`data: ${json}\n\n`);
      }

      // ── pub/sub for real-time channel fan-out ────────────────────
      if (channels.length > 0) {
        pubsubClient = createRedisClient(config);
        await pubsubClient.connect();

        const pubsubChannels = channels.map((ch) => pubsubChannel(ch));

        pubsubClient.subscribe(...pubsubChannels, (err) => {
          if (err) {
            request.log.error(err, "pub/sub subscribe failed");
          }
        });

        pubsubClient.on("message", (_ch: string, data: string) => {
          try {
            const parsed = JSON.parse(data) as { id: string };
            writeSse(data, parsed.id);
          } catch {
            // ignore malformed pub/sub messages
          }
        });
      }

      // ── cleanup on disconnect ────────────────────────────────────
      let closed = false;

      request.raw.on("close", () => {
        closed = true;
        xreadClient.disconnect();
        pubsubClient?.disconnect();
      });

      // ── XREAD loop (catch-up / durable delivery) ─────────────────
      const BLOCK_MS = 5000;

      while (!closed) {
        try {
          const entries = await readMessages(xreadClient, lastIds, BLOCK_MS);

          for (const entry of entries) {
            const key = streamKey(
              entry.message.channel ?? entry.message.recipient,
            );
            lastIds.set(key, entry.entryId);

            writeSse(JSON.stringify(entry.message), entry.message.id);
          }
        } catch {
          // Connection lost or closed — exit gracefully.
          break;
        }
      }

      reply.raw.end();
    },
  );
}
