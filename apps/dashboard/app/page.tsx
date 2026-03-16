"use client";

import { BROKER_URL } from "../lib/env";
import { useSse } from "../lib/hooks/use-sse";
import { useOverride } from "../lib/hooks/use-override";
import { IntentBadge } from "./components/intent-badge";
import { OverrideBar } from "./components/override-bar";
import { HeldMessages } from "./components/held-messages";
import Link from "next/link";

interface WireMessage {
  id: string;
  trace_id: string;
  sender: string;
  recipient: string;
  intent: string;
  priority: number;
  ttl: number;
  payload: unknown;
  timestamp: number;
  signature: string;
  channel?: string;
}

export default function MessagesPage() {
  // Subscribe as a passive observer — no agentId, no channel filter.
  // The broker requires at least agentId or channel, so we use a
  // dashboard-specific agent ID that never sends messages.
  const url = `${BROKER_URL}/messages/subscribe?agentId=agent://dashboard-observer`;
  const { messages, connected } = useSse<WireMessage>(url);

  const {
    paused,
    heldCount,
    heldMessages,
    pause,
    resume,
    discard,
    release,
  } = useOverride();

  return (
    <div>
      {/* Human override controls */}
      <OverrideBar
        paused={paused}
        heldCount={heldCount}
        onPause={pause}
        onResume={resume}
        onDiscard={discard}
      />

      {/* Held messages (visible only when paused) */}
      {paused && (
        <div className="mb-6">
          <h2 className="mb-2 text-lg font-semibold text-amber-400">
            Held for Review
          </h2>
          <HeldMessages messages={heldMessages} onRelease={release} />
        </div>
      )}

      {/* Live feed header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Live Message Feed</h1>
        <span className="flex items-center gap-2 text-sm">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              connected ? "bg-green-400" : "bg-red-500"
            }`}
          />
          {connected ? "Connected" : "Disconnected"}
        </span>
      </div>

      {messages.length === 0 && (
        <p className="text-gray-500">
          No messages yet. Waiting for agent activity…
        </p>
      )}

      <div className="space-y-2">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className="rounded-lg border border-gray-800 bg-gray-900 p-4"
          >
            <div className="mb-1 flex flex-wrap items-center gap-3 text-sm">
              <IntentBadge intent={msg.intent} />
              <span className="font-mono text-indigo-400">{msg.sender}</span>
              <span className="text-gray-500">→</span>
              <span className="font-mono text-indigo-400">
                {msg.channel ?? msg.recipient}
              </span>
              <Link
                href={`/trace/${msg.trace_id}`}
                className="ml-auto text-xs text-gray-500 hover:text-indigo-400"
                title="View trace"
              >
                trace:{msg.trace_id.slice(0, 8)}…
              </Link>
              <span className="text-xs text-gray-600">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <pre className="max-h-24 overflow-auto rounded bg-gray-950 p-2 text-xs text-gray-300">
              {typeof msg.payload === "string"
                ? msg.payload
                : JSON.stringify(msg.payload, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
