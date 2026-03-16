import Fastify from "fastify";
import cors from "@fastify/cors";
import type { BrokerConfig } from "./config.js";
import { createRedisClient } from "./redis.js";
import { healthRoutes } from "./routes/health.js";
import { messageRoutes } from "./routes/messages.js";
import { channelRoutes } from "./routes/channels.js";
import { subscribeRoutes } from "./routes/subscribe.js";
import { overrideRoutes } from "./routes/override.js";

export async function buildServer(config: BrokerConfig) {
  const app = Fastify({ logger: true });

  // Main Redis client for publishing.
  const redis = createRedisClient(config);
  await redis.connect();

  // Graceful shutdown.
  app.addHook("onClose", async () => {
    await redis.quit();
  });

  // Allow cross-origin requests from the dashboard.
  await app.register(cors, { origin: true });

  // Register routes.
  await healthRoutes(app);
  await messageRoutes(app, redis, config.registryUrl);
  await channelRoutes(app, redis);
  await subscribeRoutes(app, config);
  await overrideRoutes(app, redis);

  return app;
}
