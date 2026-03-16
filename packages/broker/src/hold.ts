/**
 * Global pause state and held-message queue backed by Redis.
 *
 * Keys:
 *   agentcomms:paused:global  — "1" when paused, absent otherwise
 *   agentcomms:held           — Redis List of JSON-serialized AgentMessages
 */

import type Redis from "ioredis";
import type { AgentMessage } from "@agentcomms/core";

const PAUSE_KEY = "agentcomms:paused:global";
const HELD_KEY = "agentcomms:held";

/** Check whether the global pause flag is set. */
export async function isGloballyPaused(redis: Redis): Promise<boolean> {
  const val = await redis.get(PAUSE_KEY);
  return val === "1";
}

/** Set or clear the global pause flag. */
export async function setGlobalPause(
  redis: Redis,
  paused: boolean,
): Promise<void> {
  if (paused) {
    await redis.set(PAUSE_KEY, "1");
  } else {
    await redis.del(PAUSE_KEY);
  }
}

/** Enqueue a message into the held queue. */
export async function holdMessage(
  redis: Redis,
  msg: AgentMessage,
): Promise<void> {
  await redis.rpush(HELD_KEY, JSON.stringify(msg));
}

/** Return all messages currently in the held queue. */
export async function getHeldMessages(redis: Redis): Promise<AgentMessage[]> {
  const raw = await redis.lrange(HELD_KEY, 0, -1);
  return raw.map((entry) => JSON.parse(entry) as AgentMessage);
}

/**
 * Remove a single message from the held queue by its message ID.
 * Returns the message if found, or null if not present.
 */
export async function removeHeldMessage(
  redis: Redis,
  messageId: string,
): Promise<AgentMessage | null> {
  const raw = await redis.lrange(HELD_KEY, 0, -1);

  for (const entry of raw) {
    const parsed = JSON.parse(entry) as AgentMessage;
    if (parsed.id === messageId) {
      // LREM removes the first matching value.
      await redis.lrem(HELD_KEY, 1, entry);
      return parsed;
    }
  }

  return null;
}

/**
 * Discard all held messages. Returns the number discarded.
 * Does NOT change the pause state.
 */
export async function discardAllHeld(redis: Redis): Promise<number> {
  const count = await redis.llen(HELD_KEY);
  if (count > 0) {
    await redis.del(HELD_KEY);
  }
  return count;
}

/** Return the number of messages in the held queue. */
export async function heldCount(redis: Redis): Promise<number> {
  return redis.llen(HELD_KEY);
}
