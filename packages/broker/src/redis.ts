import Redis from "ioredis";
import type { BrokerConfig } from "./config.js";

/**
 * Create a new ioredis client from the broker config.
 * Each caller gets its own connection — required because
 * blocking XREAD ties up its connection.
 */
export function createRedisClient(config: BrokerConfig): Redis {
  return new Redis(config.redisUrl, {
    maxRetriesPerRequest: null, // required for blocking commands
    lazyConnect: true,
  });
}
