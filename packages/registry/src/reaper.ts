import { lt, eq, and, ne } from "drizzle-orm";
import type { Database } from "./db/connection.js";
import { agents } from "./db/schema.js";
import type { RegistryConfig } from "./config.js";

/**
 * Background job that marks agents as "offline" if their last heartbeat
 * is older than `heartbeatTimeoutMs` (default 60 s).
 *
 * Runs every `reaperIntervalMs` (default 15 s).
 */
export function startReaper(
  db: Database,
  config: RegistryConfig,
  log: { info: (msg: string) => void },
): NodeJS.Timeout {
  const timer = setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - config.heartbeatTimeoutMs);

      const stale = await db
        .update(agents)
        .set({ status: "offline" })
        .where(
          and(
            lt(agents.lastHeartbeat, cutoff),
            ne(agents.status, "offline"),
          ),
        )
        .returning({ agentId: agents.agentId });

      if (stale.length > 0) {
        log.info(
          `Reaper: marked ${stale.length} agent(s) offline — ${stale.map((a) => a.agentId).join(", ")}`,
        );
      }
    } catch (err) {
      // Log but don't crash the server.
      log.info(`Reaper error: ${String(err)}`);
    }
  }, config.reaperIntervalMs);

  return timer;
}
