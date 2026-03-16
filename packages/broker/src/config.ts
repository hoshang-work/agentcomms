export interface BrokerConfig {
  /** Redis connection URL (default: redis://localhost:6379) */
  redisUrl: string;
  /** HTTP server port (default: 3001) */
  port: number;
  /** Host to bind to (default: 0.0.0.0) */
  host: string;
  /** Registry service URL for permission checks (default: http://localhost:3001) */
  registryUrl: string;
}

export function loadConfig(): BrokerConfig {
  return {
    redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
    port: Number(process.env.PORT) || 3001,
    host: process.env.HOST ?? "0.0.0.0",
    registryUrl: process.env.REGISTRY_URL ?? "http://localhost:3001",
  };
}
