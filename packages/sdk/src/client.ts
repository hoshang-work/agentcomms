import type { AgentMessage, Intent } from "@agentlink/core";
import { EventSource as EvtSource } from "eventsource";
import { sign } from "./crypto.js";
import type { AgentClientOptions, AgentInfo } from "./types.js";

// ── helpers ────────────────────────────────────────────────────────────

function uuid(): string {
  return crypto.randomUUID();
}

function encodeMessage(msg: AgentMessage): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(msg));
}

// ── Reconnection constants ─────────────────────────────────────────────

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const DEDUP_CACHE_SIZE = 500;

// ── AgentClient ────────────────────────────────────────────────────────

export class AgentClient {
  readonly agentId: string;
  private readonly privateKey: Uint8Array;
  private readonly brokerUrl: string;
  private readonly registryUrl: string;
  private readonly defaultTtl: number;
  private readonly defaultPriority: number;

  /** Active SSE connection (lazily created by `on()`). */
  private sse: EventSource | null = null;
  private handlers = new Map<Intent, ((msg: AgentMessage) => void)[]>();

  /** Reconnection state. */
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private intentionalDisconnect = false;

  /** Message deduplication — keeps the last N message ids. */
  private seenIds = new Set<string>();
  private seenIdOrder: string[] = [];

  /** Fixed trace_id used by withTrace() clones; null = generate fresh each time. */
  private fixedTraceId: string | null = null;

  constructor(opts: AgentClientOptions) {
    this.agentId = opts.agentId;
    this.privateKey = opts.privateKey;
    this.brokerUrl = opts.brokerUrl.replace(/\/+$/, "");
    this.registryUrl = opts.registryUrl.replace(/\/+$/, "");
    this.defaultTtl = opts.defaultTtl ?? 30_000;
    this.defaultPriority = opts.defaultPriority ?? 3;
  }

  // ── Registry ───────────────────────────────────────────────────────

  /**
   * Register this agent with the registry.
   * Must be called before sending or receiving messages (per CLAUDE.md conventions).
   */
  async register(
    capabilities: string[] = [],
    acceptedIntents: string[] = [],
  ): Promise<void> {
    const res = await fetch(`${this.registryUrl}/agents/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: this.agentId,
        capabilities,
        acceptedIntents,
        publicKey: bytesToHex(
          // Derive public key so the registry can verify signatures later.
          (await import("@noble/ed25519")).getPublicKey(this.privateKey),
        ),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `Registration failed (${res.status}): ${body}`,
      );
    }
  }

  // ── Messaging ──────────────────────────────────────────────────────

  /**
   * Send a direct message to another agent.
   * Returns the broker-assigned message id.
   */
  async send(
    recipient: string,
    intent: Intent,
    payload: unknown,
  ): Promise<string> {
    const msg = this.buildMessage(recipient, intent, payload);
    return this.publish(msg);
  }

  /**
   * Broadcast a message to a channel.
   * The recipient is set to `channel://<channelName>`.
   */
  async broadcast(
    channel: string,
    intent: Intent,
    payload: unknown,
  ): Promise<string> {
    const recipient = channel.startsWith("channel://")
      ? channel
      : `channel://${channel}`;
    const msg = this.buildMessage(recipient, intent, payload, channel);
    return this.publish(msg);
  }

  // ── Subscription ───────────────────────────────────────────────────

  /**
   * Subscribe to messages matching a particular intent.
   * Opens an SSE connection to the broker on first call.
   */
  on(intent: Intent, handler: (msg: AgentMessage) => void): void {
    const existing = this.handlers.get(intent) ?? [];
    existing.push(handler);
    this.handlers.set(intent, existing);

    // Open SSE if not already connected.
    if (!this.sse) {
      this.openSse();
    }
  }

  // ── Discovery ──────────────────────────────────────────────────────

  /**
   * Query the registry for agents with a specific capability.
   */
  async discover(capability: string): Promise<AgentInfo[]> {
    const url = `${this.registryUrl}/agents?capability=${encodeURIComponent(capability)}`;
    const res = await fetch(url);

    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `Discovery failed (${res.status}): ${body}`,
      );
    }

    return (await res.json()) as AgentInfo[];
  }

  // ── Trace propagation ──────────────────────────────────────────────

  /**
   * Returns a lightweight clone of this client that pins every outgoing
   * message to the given `traceId`.  Useful for keeping a whole
   * conversation chain under a single trace.
   *
   * The returned instance shares the same SSE connection and handlers.
   */
  withTrace(traceId: string): AgentClient {
    const clone = Object.create(AgentClient.prototype) as AgentClient;
    // Copy all private fields by reference (shallow).
    Object.assign(clone, this);
    // Pin the trace id.
    clone.fixedTraceId = traceId;
    return clone;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────

  /** Close the SSE connection, cancel pending reconnects, and clear handlers. */
  disconnect(): void {
    this.intentionalDisconnect = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.sse) {
      this.sse.close();
      this.sse = null;
    }

    this.handlers.clear();
    this.reconnectAttempt = 0;
  }

  // ── Private helpers ────────────────────────────────────────────────

  private buildMessage(
    recipient: string,
    intent: Intent,
    payload: unknown,
    channel?: string,
  ): AgentMessage {
    const msg: AgentMessage = {
      id: uuid(),
      trace_id: this.fixedTraceId ?? uuid(),
      sender: this.agentId,
      recipient,
      intent,
      priority: this.defaultPriority,
      ttl: this.defaultTtl,
      payload,
      timestamp: Date.now(),
      signature: "", // placeholder — signed below
    };
    if (channel) {
      msg.channel = channel;
    }
    // Sign the message (everything except the signature field itself).
    msg.signature = sign(encodeMessage({ ...msg, signature: "" }), this.privateKey);
    return msg;
  }

  private async publish(msg: AgentMessage): Promise<string> {
    const res = await fetch(`${this.brokerUrl}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(msg),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `Publish failed (${res.status}): ${body}`,
      );
    }

    const data = (await res.json()) as { id: string };
    return data.id;
  }

  private openSse(): void {
    this.intentionalDisconnect = false;
    this.reconnectAttempt = 0;
    this.connectSse();
  }

  private connectSse(): void {
    const url = `${this.brokerUrl}/messages/subscribe?agentId=${encodeURIComponent(this.agentId)}`;

    // Use the global EventSource if available (browsers), otherwise the polyfill.
    const Ctor =
      typeof globalThis.EventSource !== "undefined"
        ? globalThis.EventSource
        : (EvtSource as unknown as typeof globalThis.EventSource);

    this.sse = new Ctor(url);

    this.sse.onmessage = (event: MessageEvent) => {
      // Reset backoff on successful message.
      this.reconnectAttempt = 0;

      try {
        const msg = JSON.parse(event.data as string) as AgentMessage;

        // ── Deduplication ──────────────────────────────────────────
        if (this.seenIds.has(msg.id)) {
          return; // silently drop duplicate
        }
        this.trackSeenId(msg.id);

        const handlers = this.handlers.get(msg.intent);
        if (handlers) {
          for (const h of handlers) {
            h(msg);
          }
        }
      } catch {
        // Ignore malformed SSE frames.
      }
    };

    this.sse.onerror = () => {
      if (this.intentionalDisconnect) return;

      // Close the broken connection before scheduling a retry.
      if (this.sse) {
        this.sse.close();
        this.sse = null;
      }

      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    const delay = Math.min(
      INITIAL_BACKOFF_MS * Math.pow(2, this.reconnectAttempt),
      MAX_BACKOFF_MS,
    );
    this.reconnectAttempt++;

    console.log(
      `[AgentClient] SSE reconnect attempt ${this.reconnectAttempt} in ${delay}ms`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.intentionalDisconnect) {
        this.connectSse();
      }
    }, delay);
  }

  /** Track a message id for dedup, evicting the oldest when full. */
  private trackSeenId(id: string): void {
    this.seenIds.add(id);
    this.seenIdOrder.push(id);

    if (this.seenIdOrder.length > DEDUP_CACHE_SIZE) {
      const evict = this.seenIdOrder.shift()!;
      this.seenIds.delete(evict);
    }
  }
}

// ── internal util ──────────────────────────────────────────────────────

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
