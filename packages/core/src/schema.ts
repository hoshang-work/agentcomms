import { z } from "zod";

// ── helpers ──────────────────────────────────────────────────────────
const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const agentUri = /^agent:\/\/.+$/;
const recipientUri = /^(agent|channel):\/\/.+$/;

// ── intent enum ──────────────────────────────────────────────────────
export const IntentEnum = z.enum([
  "REQUEST",
  "RESPONSE",
  "BROADCAST",
  "ERROR",
  "HEARTBEAT",
]);

export type Intent = z.infer<typeof IntentEnum>;

// ── main schema ──────────────────────────────────────────────────────
export const AgentMessageSchema = z.object({
  /** Unique message identifier (UUID v4) */
  id: z
    .string()
    .regex(uuidRegex, "id must be a valid UUID"),

  /** Links messages in a conversation chain (UUID v4) */
  trace_id: z
    .string()
    .regex(uuidRegex, "trace_id must be a valid UUID"),

  /** Sending agent URI, e.g. "agent://planner" */
  sender: z
    .string()
    .regex(agentUri, 'sender must match "agent://<name>"'),

  /** Recipient URI — either agent:// or channel:// */
  recipient: z
    .string()
    .regex(recipientUri, 'recipient must match "agent://<name>" or "channel://<name>"'),

  /** Optional channel the message is posted to */
  channel: z.string().optional(),

  /** Message intent */
  intent: IntentEnum,

  /** Priority 1 (highest) – 5 (lowest) */
  priority: z
    .number()
    .int()
    .min(1)
    .max(5),

  /** Time-to-live in milliseconds */
  ttl: z.number().int().positive(),

  /** Arbitrary message payload */
  payload: z.unknown(),

  /** Unix epoch timestamp in milliseconds */
  timestamp: z.number().int().positive(),

  /** Cryptographic signature of the message */
  signature: z.string().min(1, "signature must not be empty"),
});

export type AgentMessage = z.infer<typeof AgentMessageSchema>;
