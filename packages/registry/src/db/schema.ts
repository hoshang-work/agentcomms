import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  boolean,
  pgEnum,
} from "drizzle-orm/pg-core";

// ── enums ────────────────────────────────────────────────────────────

export const agentStatusEnum = pgEnum("agent_status", [
  "available",
  "busy",
  "offline",
]);

// ── agents ───────────────────────────────────────────────────────────

export const agents = pgTable("agents", {
  id: uuid("id").defaultRandom().primaryKey(),
  agentId: text("agent_id").notNull().unique(),
  capabilities: text("capabilities").array().notNull().default([]),
  acceptedIntents: text("accepted_intents").array().notNull().default([]),
  maxConcurrency: integer("max_concurrency").notNull().default(1),
  publicKey: text("public_key").notNull().default(""),
  status: agentStatusEnum("status").notNull().default("available"),
  lastHeartbeat: timestamp("last_heartbeat", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── permissions ──────────────────────────────────────────────────────

export const permissions = pgTable("permissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  granterAgentId: text("granter_agent_id").notNull(),
  granteeAgentId: text("grantee_agent_id").notNull(),
  allowedIntents: text("allowed_intents").array().notNull().default([]),
  grantedByHuman: boolean("granted_by_human").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
