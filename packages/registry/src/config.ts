export interface RegistryConfig {
  /** PostgreSQL connection URL */
  databaseUrl: string;
  /** HTTP server port (default: 3002) */
  port: number;
  /** Host to bind to (default: 0.0.0.0) */
  host: string;
  /** How often to run the heartbeat reaper (ms, default: 15 000) */
  reaperIntervalMs: number;
  /** Agents with no heartbeat for this long are marked offline (ms, default: 60 000) */
  heartbeatTimeoutMs: number;
}

export function loadConfig(): RegistryConfig {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  return {
    databaseUrl,
    port: Number(process.env.PORT) || 3002,
    host: process.env.HOST ?? "0.0.0.0",
    reaperIntervalMs: Number(process.env.REAPER_INTERVAL_MS) || 15_000,
    heartbeatTimeoutMs: Number(process.env.HEARTBEAT_TIMEOUT_MS) || 60_000,
  };
}
