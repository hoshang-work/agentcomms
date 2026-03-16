import { describe, it, expect } from "vitest";
import { AgentMessageSchema, IntentEnum } from "./schema.js";
import { validate } from "./validate.js";

// ── helpers ──────────────────────────────────────────────────────────

function validMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
    trace_id: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    sender: "agent://planner",
    recipient: "agent://executor",
    intent: "REQUEST",
    priority: 1,
    ttl: 30000,
    payload: { task: "summarise document" },
    timestamp: Date.now(),
    signature: "abc123sig",
    ...overrides,
  };
}

// ── valid messages ───────────────────────────────────────────────────

describe("AgentMessageSchema – valid messages", () => {
  it("accepts a fully valid message", () => {
    const result = AgentMessageSchema.safeParse(validMessage());
    expect(result.success).toBe(true);
  });

  it("accepts a message with channel:// recipient", () => {
    const result = AgentMessageSchema.safeParse(
      validMessage({ recipient: "channel://general" }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts an optional channel field", () => {
    const result = AgentMessageSchema.safeParse(
      validMessage({ channel: "ops" }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts a message without channel (undefined)", () => {
    const msg = validMessage();
    delete (msg as Record<string, unknown>).channel;
    const result = AgentMessageSchema.safeParse(msg);
    expect(result.success).toBe(true);
  });

  it.each(["REQUEST", "RESPONSE", "BROADCAST", "ERROR", "HEARTBEAT"] as const)(
    "accepts intent %s",
    (intent) => {
      const result = AgentMessageSchema.safeParse(validMessage({ intent }));
      expect(result.success).toBe(true);
    },
  );

  it.each([1, 2, 3, 4, 5])("accepts priority %d", (priority) => {
    const result = AgentMessageSchema.safeParse(validMessage({ priority }));
    expect(result.success).toBe(true);
  });

  it("accepts null payload", () => {
    const result = AgentMessageSchema.safeParse(
      validMessage({ payload: null }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts string payload", () => {
    const result = AgentMessageSchema.safeParse(
      validMessage({ payload: "hello" }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts nested object payload", () => {
    const result = AgentMessageSchema.safeParse(
      validMessage({ payload: { nested: { deep: true } } }),
    );
    expect(result.success).toBe(true);
  });
});

// ── invalid messages ─────────────────────────────────────────────────

describe("AgentMessageSchema – invalid messages", () => {
  it("rejects a non-UUID id", () => {
    const result = AgentMessageSchema.safeParse(
      validMessage({ id: "not-a-uuid" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects a non-UUID trace_id", () => {
    const result = AgentMessageSchema.safeParse(
      validMessage({ trace_id: "bad" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects sender without agent:// prefix", () => {
    const result = AgentMessageSchema.safeParse(
      validMessage({ sender: "planner" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects sender with channel:// prefix", () => {
    const result = AgentMessageSchema.safeParse(
      validMessage({ sender: "channel://general" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects recipient without valid prefix", () => {
    const result = AgentMessageSchema.safeParse(
      validMessage({ recipient: "http://foo" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects unknown intent", () => {
    const result = AgentMessageSchema.safeParse(
      validMessage({ intent: "PING" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects priority 0", () => {
    const result = AgentMessageSchema.safeParse(
      validMessage({ priority: 0 }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects priority 6", () => {
    const result = AgentMessageSchema.safeParse(
      validMessage({ priority: 6 }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects fractional priority", () => {
    const result = AgentMessageSchema.safeParse(
      validMessage({ priority: 2.5 }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects negative ttl", () => {
    const result = AgentMessageSchema.safeParse(
      validMessage({ ttl: -1 }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects zero ttl", () => {
    const result = AgentMessageSchema.safeParse(
      validMessage({ ttl: 0 }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects negative timestamp", () => {
    const result = AgentMessageSchema.safeParse(
      validMessage({ timestamp: -100 }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects empty signature", () => {
    const result = AgentMessageSchema.safeParse(
      validMessage({ signature: "" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects missing required fields", () => {
    const result = AgentMessageSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      // Should flag multiple missing fields
      expect(result.error.issues.length).toBeGreaterThanOrEqual(5);
    }
  });

  it("rejects completely wrong types", () => {
    const result = AgentMessageSchema.safeParse(
      validMessage({
        id: 123,
        priority: "high",
        ttl: "forever",
        timestamp: "now",
        signature: null,
      }),
    );
    expect(result.success).toBe(false);
  });
});

// ── IntentEnum ───────────────────────────────────────────────────────

describe("IntentEnum", () => {
  it("contains exactly five values", () => {
    expect(IntentEnum.options).toEqual([
      "REQUEST",
      "RESPONSE",
      "BROADCAST",
      "ERROR",
      "HEARTBEAT",
    ]);
  });
});

// ── validate() helper ────────────────────────────────────────────────

describe("validate()", () => {
  it("returns { success: true, data } for a valid message", () => {
    const msg = validMessage();
    const result = validate(msg);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe(msg.id);
      expect(result.data.sender).toBe("agent://planner");
    }
  });

  it("returns { success: false, errors } for an invalid message", () => {
    const result = validate({ id: "bad" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThan(0);
      // Errors should be human-readable strings
      expect(typeof result.errors[0]).toBe("string");
    }
  });

  it("error messages include the field path", () => {
    const result = validate(validMessage({ id: "not-uuid" }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some((e) => e.startsWith("id:"))).toBe(true);
    }
  });

  it("returns multiple errors for multiple invalid fields", () => {
    const result = validate({
      id: "bad",
      trace_id: "bad",
      sender: "nope",
      recipient: "nope",
      intent: "INVALID",
      priority: 99,
      ttl: -1,
      payload: null,
      timestamp: -1,
      signature: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThanOrEqual(5);
    }
  });
});
