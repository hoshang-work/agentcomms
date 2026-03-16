import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AgentClient } from "../client.js";
import { generateKeypair } from "../crypto.js";

// ── Mock fetch globally ────────────────────────────────────────────────

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

// ── Mock EventSource ───────────────────────────────────────────────────

class FakeEventSource {
  url: string;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }

  /** Simulate receiving an SSE message. */
  simulateMessage(data: string) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent("message", { data }));
    }
  }

  static instances: FakeEventSource[] = [];
  static reset() {
    FakeEventSource.instances = [];
  }
}

vi.stubGlobal("EventSource", FakeEventSource);

// ── Helpers ────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeClient() {
  const kp = generateKeypair();
  return new AgentClient({
    agentId: "agent://test-agent",
    privateKey: kp.privateKey,
    brokerUrl: "http://localhost:3000",
    registryUrl: "http://localhost:3001",
  });
}

// ── Tests ──────────────────────────────────────────────────────────────

beforeEach(() => {
  fetchMock.mockReset();
  FakeEventSource.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AgentClient.register", () => {
  it("posts registration to the registry", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: "abc", agentId: "agent://test-agent" }, 201),
    );

    const client = makeClient();
    await client.register(["planning"], ["REQUEST"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:3001/agents/register");
    expect(opts.method).toBe("POST");

    const body = JSON.parse(opts.body as string);
    expect(body.agentId).toBe("agent://test-agent");
    expect(body.capabilities).toEqual(["planning"]);
    expect(body.acceptedIntents).toEqual(["REQUEST"]);
    expect(typeof body.publicKey).toBe("string");
    expect(body.publicKey.length).toBe(64); // 32 bytes hex
  });

  it("throws on non-OK response", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("bad request", { status: 400 }),
    );

    const client = makeClient();
    await expect(client.register()).rejects.toThrow("Registration failed (400)");
  });
});

describe("AgentClient.send", () => {
  it("builds a valid AgentMessage and posts to broker", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: "msg-1", entryId: "1-0", stream: "agent://other" }, 201),
    );

    const client = makeClient();
    const id = await client.send("agent://other", "REQUEST", { task: "hello" });

    expect(id).toBe("msg-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:3000/messages");

    const msg = JSON.parse(opts.body as string);
    expect(msg.sender).toBe("agent://test-agent");
    expect(msg.recipient).toBe("agent://other");
    expect(msg.intent).toBe("REQUEST");
    expect(msg.payload).toEqual({ task: "hello" });
    expect(msg.ttl).toBe(30_000);
    expect(msg.priority).toBe(3);
    // id and trace_id should be valid UUIDs
    expect(msg.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(msg.trace_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    // Signature should be a non-empty hex string
    expect(msg.signature).toMatch(/^[0-9a-f]+$/);
    expect(msg.signature.length).toBe(128);
    // Timestamp should be recent
    expect(msg.timestamp).toBeGreaterThan(Date.now() - 5000);
  });

  it("throws on publish failure", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Permission denied" }), { status: 403 }),
    );

    const client = makeClient();
    await expect(
      client.send("agent://other", "REQUEST", {}),
    ).rejects.toThrow("Publish failed (403)");
  });
});

describe("AgentClient.broadcast", () => {
  it("sets recipient to channel:// and includes channel field", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: "msg-2", entryId: "2-0", stream: "general" }, 201),
    );

    const client = makeClient();
    await client.broadcast("general", "BROADCAST", { text: "hi" });

    const msg = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    expect(msg.recipient).toBe("channel://general");
    expect(msg.channel).toBe("general");
    expect(msg.intent).toBe("BROADCAST");
  });

  it("does not double-prefix channel://", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: "msg-3", entryId: "3-0", stream: "alerts" }, 201),
    );

    const client = makeClient();
    await client.broadcast("channel://alerts", "BROADCAST", {});

    const msg = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    expect(msg.recipient).toBe("channel://alerts");
  });
});

describe("AgentClient.on", () => {
  it("opens an SSE connection and dispatches matching messages", () => {
    const client = makeClient();
    const handler = vi.fn();

    client.on("REQUEST", handler);

    // SSE should have been opened.
    expect(FakeEventSource.instances.length).toBe(1);
    const sse = FakeEventSource.instances[0]!;
    expect(sse.url).toContain("/messages/subscribe");
    expect(sse.url).toContain("agentId=agent%3A%2F%2Ftest-agent");

    // Simulate receiving a REQUEST message.
    const msg = {
      id: "aaa",
      trace_id: "bbb",
      sender: "agent://other",
      recipient: "agent://test-agent",
      intent: "REQUEST",
      priority: 3,
      ttl: 30000,
      payload: { x: 1 },
      timestamp: Date.now(),
      signature: "abc",
    };
    sse.simulateMessage(JSON.stringify(msg));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0].intent).toBe("REQUEST");

    // Simulate a RESPONSE message (different id) — handler should NOT fire.
    const msg2 = { ...msg, id: "ccc", intent: "RESPONSE" };
    sse.simulateMessage(JSON.stringify(msg2));
    expect(handler).toHaveBeenCalledTimes(1); // still 1
  });

  it("does not open a second SSE for additional on() calls", () => {
    const client = makeClient();
    client.on("REQUEST", vi.fn());
    client.on("RESPONSE", vi.fn());
    expect(FakeEventSource.instances.length).toBe(1);
  });
});

describe("AgentClient.discover", () => {
  it("queries registry and returns matching agents", async () => {
    const agents = [
      { id: "1", agentId: "agent://planner", capabilities: ["planning"] },
    ];
    fetchMock.mockResolvedValueOnce(jsonResponse(agents));

    const client = makeClient();
    const result = await client.discover("planning");

    expect(result).toEqual(agents);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("http://localhost:3001/agents?capability=planning");
  });

  it("throws on error response", async () => {
    fetchMock.mockResolvedValueOnce(new Response("not found", { status: 404 }));
    const client = makeClient();
    await expect(client.discover("foo")).rejects.toThrow("Discovery failed (404)");
  });
});

describe("AgentClient.disconnect", () => {
  it("closes the SSE connection", () => {
    const client = makeClient();
    client.on("REQUEST", vi.fn());

    const sse = FakeEventSource.instances[0]!;
    expect(sse.closed).toBe(false);

    client.disconnect();
    expect(sse.closed).toBe(true);
  });

  it("is safe to call multiple times", () => {
    const client = makeClient();
    client.on("REQUEST", vi.fn());
    client.disconnect();
    client.disconnect(); // no throw
  });
});

// ── Deduplication ────────────────────────────────────────────────────

describe("Message deduplication", () => {
  it("silently drops messages with duplicate ids", () => {
    const client = makeClient();
    const handler = vi.fn();
    client.on("REQUEST", handler);

    const sse = FakeEventSource.instances[0]!;
    const msg = {
      id: "dup-1",
      trace_id: "t-1",
      sender: "agent://other",
      recipient: "agent://test-agent",
      intent: "REQUEST",
      priority: 3,
      ttl: 30000,
      payload: {},
      timestamp: Date.now(),
      signature: "sig",
    };

    sse.simulateMessage(JSON.stringify(msg));
    sse.simulateMessage(JSON.stringify(msg)); // duplicate
    sse.simulateMessage(JSON.stringify(msg)); // duplicate

    expect(handler).toHaveBeenCalledTimes(1);

    client.disconnect();
  });

  it("delivers messages with different ids", () => {
    const client = makeClient();
    const handler = vi.fn();
    client.on("REQUEST", handler);

    const sse = FakeEventSource.instances[0]!;
    for (let i = 0; i < 5; i++) {
      sse.simulateMessage(
        JSON.stringify({
          id: `unique-${i}`,
          trace_id: "t",
          sender: "agent://other",
          recipient: "agent://test-agent",
          intent: "REQUEST",
          priority: 3,
          ttl: 30000,
          payload: {},
          timestamp: Date.now(),
          signature: "sig",
        }),
      );
    }

    expect(handler).toHaveBeenCalledTimes(5);
    client.disconnect();
  });
});

// ── Reconnection ─────────────────────────────────────────────────────

describe("SSE reconnection", () => {
  it("reconnects with exponential backoff when SSE errors", () => {
    vi.useFakeTimers();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const client = makeClient();
    client.on("REQUEST", vi.fn());

    const sse1 = FakeEventSource.instances[0]!;
    expect(FakeEventSource.instances.length).toBe(1);

    // Simulate SSE error.
    sse1.onerror!();
    expect(sse1.closed).toBe(true);

    // Advance 1s (first backoff).
    vi.advanceTimersByTime(1000);
    expect(FakeEventSource.instances.length).toBe(2);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("reconnect attempt 1"),
    );

    // Simulate another error.
    const sse2 = FakeEventSource.instances[1]!;
    sse2.onerror!();
    expect(sse2.closed).toBe(true);

    // Advance 2s (second backoff = 2^1 * 1000).
    vi.advanceTimersByTime(2000);
    expect(FakeEventSource.instances.length).toBe(3);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("reconnect attempt 2"),
    );

    client.disconnect();
    vi.useRealTimers();
    logSpy.mockRestore();
  });

  it("does not reconnect after intentional disconnect", () => {
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => {});

    const client = makeClient();
    client.on("REQUEST", vi.fn());
    client.disconnect();

    // Even if we advance time, no new SSE should be created.
    vi.advanceTimersByTime(60_000);
    expect(FakeEventSource.instances.length).toBe(1);

    vi.useRealTimers();
    vi.restoreAllMocks();
  });
});

// ── Trace propagation ────────────────────────────────────────────────

describe("AgentClient.withTrace", () => {
  it("pins trace_id on all outgoing messages", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: "m1" }, 201))
      .mockResolvedValueOnce(jsonResponse({ id: "m2" }, 201));

    const client = makeClient();
    const traced = client.withTrace("aaaa1111-bbbb-cccc-dddd-eeee2222ffff");

    await traced.send("agent://other", "REQUEST", { a: 1 });
    await traced.send("agent://other", "RESPONSE", { b: 2 });

    const msg1 = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    const msg2 = JSON.parse(
      (fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string,
    );

    // Both share the pinned trace_id.
    expect(msg1.trace_id).toBe("aaaa1111-bbbb-cccc-dddd-eeee2222ffff");
    expect(msg2.trace_id).toBe("aaaa1111-bbbb-cccc-dddd-eeee2222ffff");
    // But different message ids.
    expect(msg1.id).not.toBe(msg2.id);
  });

  it("does not affect the original client", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: "m1" }, 201))
      .mockResolvedValueOnce(jsonResponse({ id: "m2" }, 201));

    const client = makeClient();
    const traced = client.withTrace("aaaa1111-bbbb-cccc-dddd-eeee2222ffff");

    await traced.send("agent://other", "REQUEST", {});
    await client.send("agent://other", "REQUEST", {});

    const tracedMsg = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    const originalMsg = JSON.parse(
      (fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string,
    );

    expect(tracedMsg.trace_id).toBe("aaaa1111-bbbb-cccc-dddd-eeee2222ffff");
    // Original client generates random UUIDs.
    expect(originalMsg.trace_id).not.toBe("aaaa1111-bbbb-cccc-dddd-eeee2222ffff");
  });
});
