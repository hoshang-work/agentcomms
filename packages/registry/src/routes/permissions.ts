import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../db/connection.js";
import { permissions } from "../db/schema.js";

// ── request schemas ──────────────────────────────────────────────────

const GrantBody = z.object({
  granterAgentId: z.string().min(1),
  granteeAgentId: z.string().min(1),
  allowedIntents: z.array(z.string()).min(1),
  grantedByHuman: z.boolean().default(false),
});

const RevokeBody = z.object({
  granterAgentId: z.string().min(1),
  granteeAgentId: z.string().min(1),
});

// ── routes ───────────────────────────────────────────────────────────

export async function permissionRoutes(
  app: FastifyInstance,
  db: Database,
): Promise<void> {
  // ── POST /permissions/grant ──────────────────────────────────────
  app.post("/permissions/grant", async (request, reply) => {
    const parsed = GrantBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid grant payload",
        details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }

    const body = parsed.data;

    const [perm] = await db
      .insert(permissions)
      .values({
        granterAgentId: body.granterAgentId,
        granteeAgentId: body.granteeAgentId,
        allowedIntents: body.allowedIntents,
        grantedByHuman: body.grantedByHuman,
      })
      .returning();

    return reply.status(201).send(perm);
  });

  // ── DELETE /permissions/revoke ───────────────────────────────────
  app.delete("/permissions/revoke", async (request, reply) => {
    const parsed = RevokeBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid revoke payload",
        details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }

    const { granterAgentId, granteeAgentId } = parsed.data;

    const deleted = await db
      .delete(permissions)
      .where(
        and(
          eq(permissions.granterAgentId, granterAgentId),
          eq(permissions.granteeAgentId, granteeAgentId),
        ),
      )
      .returning();

    if (deleted.length === 0) {
      return reply.status(404).send({
        error: `No permissions found from "${granterAgentId}" to "${granteeAgentId}"`,
      });
    }

    return reply.send({ revoked: deleted.length });
  });

  // ── GET /permissions/:agentId ────────────────────────────────────
  // Returns all permissions granted TO this agent (what it's allowed to do).
  app.get<{ Params: { agentId: string } }>(
    "/permissions/:agentId",
    async (request, reply) => {
      const { agentId } = request.params;

      const granted = await db
        .select()
        .from(permissions)
        .where(eq(permissions.granteeAgentId, agentId));

      return reply.send(granted);
    },
  );
}
