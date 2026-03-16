import type Redis from "ioredis";
import type { AgentMessage } from "@agentcomms/core";

/** Prefix all stream keys to avoid collisions. */
const STREAM_PREFIX = "agentcomms:stream:";

/**
 * Derive the Redis Stream key for a message.
 * If the message has a `channel` field we use that, otherwise we
 * fall back to the `recipient` URI.
 */
export function streamKeyFor(msg: AgentMessage): string {
  const target = msg.channel ?? msg.recipient;
  return `${STREAM_PREFIX}${target}`;
}

/** Build a stream key from a raw target string (agentId or channel). */
export function streamKey(target: string): string {
  return `${STREAM_PREFIX}${target}`;
}

/**
 * Publish an AgentMessage to its Redis Stream.
 * Returns the Redis-generated entry ID.
 */
export async function publishMessage(
  redis: Redis,
  msg: AgentMessage,
): Promise<string> {
  const key = streamKeyFor(msg);
  // Store the full message as a single JSON field for simplicity.
  const entryId = await redis.xadd(key, "*", "data", JSON.stringify(msg));
  if (!entryId) {
    throw new Error(`Failed to publish message ${msg.id} to stream ${key}`);
  }
  return entryId;
}

export interface StreamEntry {
  entryId: string;
  message: AgentMessage;
}

/**
 * Blocking read from one or more streams.
 * Returns parsed entries, or an empty array on timeout.
 *
 * @param blockMs  How long to block (0 = forever).
 * @param lastIds  Map of streamKey → last-seen entry ID ("$" for new-only).
 */
export async function readMessages(
  redis: Redis,
  lastIds: Map<string, string>,
  blockMs: number = 5000,
  count: number = 10,
): Promise<StreamEntry[]> {
  const keys = [...lastIds.keys()];
  const ids = [...lastIds.values()];

  // XREAD BLOCK <ms> COUNT <n> STREAMS key1 key2 ... id1 id2 ...
  const result = await redis.xread(
    "COUNT",
    count,
    "BLOCK",
    blockMs,
    "STREAMS",
    ...keys,
    ...ids,
  );

  if (!result) return [];

  const entries: StreamEntry[] = [];

  for (const [, records] of result) {
    for (const [entryId, fields] of records) {
      // fields is [field, value, field, value, …]
      const dataIndex = fields.indexOf("data");
      if (dataIndex === -1 || dataIndex + 1 >= fields.length) continue;
      try {
        const message = JSON.parse(fields[dataIndex + 1]) as AgentMessage;
        entries.push({ entryId, message });
      } catch {
        // skip unparseable entries
      }
    }
  }

  return entries;
}
