import type Redis from "ioredis";

const CHANNEL_HASH_PREFIX = "agentlink:channel:";
const CHANNEL_INDEX_KEY = "agentlink:channels";
const PUBSUB_PREFIX = "agentlink:pubsub:";

export interface ChannelMeta {
  name: string;
  description: string;
  createdAt: number;
}

/** Redis hash key for a channel's metadata. */
function channelKey(name: string): string {
  return `${CHANNEL_HASH_PREFIX}${name}`;
}

/** Redis pub/sub channel name for fan-out. */
export function pubsubChannel(channelName: string): string {
  return `${PUBSUB_PREFIX}${channelName}`;
}

/**
 * Create a channel. Stores metadata in a Redis hash and adds the name
 * to a Redis set for enumeration.
 */
export async function createChannel(
  redis: Redis,
  name: string,
  description = "",
): Promise<ChannelMeta> {
  const meta: ChannelMeta = {
    name,
    description,
    createdAt: Date.now(),
  };

  const key = channelKey(name);
  await redis.hset(key, {
    name: meta.name,
    description: meta.description,
    createdAt: String(meta.createdAt),
  });
  await redis.sadd(CHANNEL_INDEX_KEY, name);

  return meta;
}

/** Check whether a channel exists. */
export async function channelExists(
  redis: Redis,
  name: string,
): Promise<boolean> {
  return (await redis.sismember(CHANNEL_INDEX_KEY, name)) === 1;
}

/** List all channels with their metadata. */
export async function listChannels(redis: Redis): Promise<ChannelMeta[]> {
  const names = await redis.smembers(CHANNEL_INDEX_KEY);
  if (names.length === 0) return [];

  const pipeline = redis.pipeline();
  for (const n of names) {
    pipeline.hgetall(channelKey(n));
  }
  const results = await pipeline.exec();
  if (!results) return [];

  const channels: ChannelMeta[] = [];
  for (const [err, data] of results) {
    if (err || !data || typeof data !== "object") continue;
    const d = data as Record<string, string>;
    if (d.name) {
      channels.push({
        name: d.name,
        description: d.description ?? "",
        createdAt: Number(d.createdAt) || 0,
      });
    }
  }

  return channels;
}

/** Delete a channel's metadata and remove it from the index. */
export async function deleteChannel(
  redis: Redis,
  name: string,
): Promise<boolean> {
  const existed = await redis.srem(CHANNEL_INDEX_KEY, name);
  await redis.del(channelKey(name));
  return existed === 1;
}

/**
 * Publish an AgentMessage JSON string to the pub/sub channel for fan-out.
 * This is in addition to the Streams write and allows real-time push
 * to all SSE subscribers of that channel.
 */
export async function fanoutPublish(
  redis: Redis,
  channelName: string,
  messageJson: string,
): Promise<void> {
  await redis.publish(pubsubChannel(channelName), messageJson);
}
