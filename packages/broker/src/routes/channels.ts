import type { FastifyInstance } from "fastify";
import type Redis from "ioredis";
import {
  createChannel,
  listChannels,
  deleteChannel,
  channelExists,
} from "../channels.js";

interface CreateChannelBody {
  name?: string;
  description?: string;
}

export async function channelRoutes(
  app: FastifyInstance,
  redis: Redis,
): Promise<void> {
  // ── POST /channels ───────────────────────────────────────────────
  app.post<{ Body: CreateChannelBody }>("/channels", async (request, reply) => {
    const { name, description } = request.body as CreateChannelBody;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return reply.status(400).send({ error: "`name` is required" });
    }

    const trimmed = name.trim();

    if (await channelExists(redis, trimmed)) {
      return reply
        .status(409)
        .send({ error: `Channel "${trimmed}" already exists` });
    }

    const meta = await createChannel(redis, trimmed, description ?? "");
    return reply.status(201).send(meta);
  });

  // ── GET /channels ────────────────────────────────────────────────
  app.get("/channels", async (_request, reply) => {
    const channels = await listChannels(redis);
    return reply.send(channels);
  });

  // ── DELETE /channels/:name ───────────────────────────────────────
  app.delete<{ Params: { name: string } }>(
    "/channels/:name",
    async (request, reply) => {
      const { name } = request.params;
      const deleted = await deleteChannel(redis, name);

      if (!deleted) {
        return reply
          .status(404)
          .send({ error: `Channel "${name}" not found` });
      }

      return reply.status(200).send({ deleted: name });
    },
  );
}
