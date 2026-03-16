"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BROKER_URL } from "../../../lib/env";
import { IntentBadge } from "../../components/intent-badge";

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

export default function TracePage() {
  const { traceId } = useParams<{ traceId: string }>();
  const [messages, setMessages] = useState<WireMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!traceId) return;

    async function fetchTrace() {
      try {
        const res = await fetch(
          `${BROKER_URL}/messages/trace/${encodeURIComponent(traceId)}`,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as WireMessage[];
        // Sort oldest → newest for timeline
        data.sort((a, b) => a.timestamp - b.timestamp);
        setMessages(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    void fetchTrace();
  }, [traceId]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Trace Viewer</h1>
      <p className="mb-6 font-mono text-sm text-gray-500">{traceId}</p>

      {loading && <p className="text-gray-500">Loading trace…</p>}
      {error && (
        <p className="rounded bg-red-900/40 p-3 text-red-300">
          Error: {error}
        </p>
      )}

      {!loading && messages.length === 0 && !error && (
        <p className="text-gray-500">
          No messages found for this trace ID.
        </p>
      )}

      {/* Vertical timeline */}
      <div className="relative border-l-2 border-gray-700 pl-6">
        {messages.map((msg, idx) => (
          <div key={msg.id} className="relative mb-6">
            {/* Dot on the timeline line */}
            <div className="absolute -left-[31px] top-1.5 h-3 w-3 rounded-full border-2 border-gray-700 bg-gray-900" />

            <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
                <span className="text-xs font-bold text-gray-600">
                  #{idx + 1}
                </span>
                <IntentBadge intent={msg.intent} />
                <span className="font-mono text-indigo-400">{msg.sender}</span>
                <span className="text-gray-500">→</span>
                <span className="font-mono text-indigo-400">
                  {msg.channel ?? msg.recipient}
                </span>
                <span className="ml-auto text-xs text-gray-600">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </span>
              </div>

              <pre className="max-h-32 overflow-auto rounded bg-gray-950 p-2 text-xs text-gray-300">
                {typeof msg.payload === "string"
                  ? msg.payload
                  : JSON.stringify(msg.payload, null, 2)}
              </pre>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
