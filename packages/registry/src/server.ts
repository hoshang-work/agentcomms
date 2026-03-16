import Fastify from "fastify";
import cors from "@fastify/cors";
import type { RegistryConfig } from "./config.js";
import { createDatabase } from "./db/connection.js";
import { healthRoutes } from "./routes/health.js";
import { agentRoutes } from "./routes/agents.js";
import { permissionRoutes } from "./routes/permissions.js";
import { startReaper } from "./reaper.js";

export async function buildServer(config: RegistryConfig) {
  const app = Fastify({ logger: true });

  const db = createDatabase(config.databaseUrl);

  // Start the heartbeat reaper background job.
  const reaperTimer = startReaper(db, config, app.log);

  // Stop the reaper on shutdown.
  app.addHook("onClose", async () => {
    clearInterval(reaperTimer);
  });

  // Allow cross-origin requests from the dashboard.
  await app.register(cors, { origin: true });

  // Register routes.
  await healthRoutes(app);
  await agentRoutes(app, db);
  await permissionRoutes(app, db);

  return app;
}
