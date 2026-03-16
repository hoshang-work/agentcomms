import type { FastifyInstance } from "fastify";
import { eq, sql, arrayContains } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../db/connection.js";
import { agents } from "../db/schema.js";

// ── request schemas ──────────────────────────────────────────────────

const RegisterBody = z.object({
  agentId: z.string().min(1),
  capabilities: z.array(z.string()).default([]),
  acceptedIntents: z.array(z.string()).default([]),
  maxConcurrency: z.number().int().min(1).default(1),
  publicKey: z.string().default(""),
});

const StatusPatch = z.object({
  status: z.enum(["available", "busy", "offline"]),
});

// ── routes ───────────────────────────────────────────────────────────

export async function agentRoutes(
  app: FastifyInstance,
  db: Database,
): Promise<void> {
  // ── POST /agents/register ────────────────────────────────────────
  app.post("/agents/register", async (request, reply) => {
    const parsed = RegisterBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid registration payload",
        details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }

    const body = parsed.data;

    // Upsert: if the agent already exists, update its record.
    const [agent] = await db
      .insert(agents)
      .values({
        agentId: body.agentId,
        capabilities: body.capabilities,
        acceptedIntents: body.acceptedIntents,
        maxConcurrency: body.maxConcurrency,
        publicKey: body.publicKey,
        status: "available",
        lastHeartbeat: new Date(),
      })
      .onConflictDoUpdate({
        target: agents.agentId,
        set: {
          capabilities: body.capabilities,
          acceptedIntents: body.acceptedIntents,
          maxConcurrency: body.maxConcurrency,
          publicKey: body.publicKey,
          status: "available",
          lastHeartbeat: new Date(),
        },
      })
      .returning();

    return reply.status(201).send(agent);
  });

  // ── POST /agents/:agentId/heartbeat ──────────────────────────────
  app.post<{ Params: { agentId: string } }>(
    "/agents/:agentId/heartbeat",
    async (request, reply) => {
      const { agentId } = request.params;

      const [updated] = await db
        .update(agents)
        .set({ lastHeartbeat: new Date(), status: "available" })
        .where(eq(agents.agentId, agentId))
        .returning();

      if (!updated) {
        return reply.status(404).send({ error: `Agent "${agentId}" not found` });
      }

      return reply.send({ agentId, lastHeartbeat: updated.lastHeartbeat });
    },
  );

  // ── GET /agents ──────────────────────────────────────────────────
  // Optional query: ?capability=summarise
  app.get<{ Querystring: { capability?: string } }>(
    "/agents",
    async (request, reply) => {
      const { capability } = request.query;

      let result;
      if (capability) {
        result = await db
          .select()
          .from(agents)
          .where(arrayContains(agents.capabilities, [capability]));
      } else {
        result = await db.select().from(agents);
      }

      return reply.send(result);
    },
  );

  // ── GET /agents/:agentId ─────────────────────────────────────────
  app.get<{ Params: { agentId: string } }>(
    "/agents/:agentId",
    async (request, reply) => {
      const { agentId } = request.params;

      const [agent] = await db
        .select()
        .from(agents)
        .where(eq(agents.agentId, agentId))
        .limit(1);

      if (!agent) {
        return reply.status(404).send({ error: `Agent "${agentId}" not found` });
      }

      return reply.send(agent);
    },
  );

  // ── PATCH /agents/:agentId/status ────────────────────────────────
  app.patch<{ Params: { agentId: string } }>(
    "/agents/:agentId/status",
    async (request, reply) => {
      const { agentId } = request.params;
      const parsed = StatusPatch.safeParse(request.body);

      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid status",
          details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        });
      }

      const [updated] = await db
        .update(agents)
        .set({ status: parsed.data.status })
        .where(eq(agents.agentId, agentId))
        .returning();

      if (!updated) {
        return reply.status(404).send({ error: `Agent "${agentId}" not found` });
      }

      return reply.send(updated);
    },
  );
}
