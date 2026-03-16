"use client";

import { useState } from "react";
import { IntentBadge } from "./intent-badge";
import { InspectModal } from "./inspect-modal";

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

interface HeldMessagesProps {
  messages: WireMessage[];
  onRelease: (messageId: string, payload?: unknown) => Promise<void>;
}

export function HeldMessages({ messages, onRelease }: HeldMessagesProps) {
  const [inspecting, setInspecting] = useState<WireMessage | null>(null);

  if (messages.length === 0) {
    return (
      <p className="mb-4 text-sm text-gray-500">
        No messages held — queue is empty.
      </p>
    );
  }

  return (
    <>
      <div className="mb-4 space-y-2">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className="rounded-lg border border-amber-800/50 bg-amber-950/20 p-4"
          >
            <div className="mb-1 flex flex-wrap items-center gap-3 text-sm">
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

            <pre className="mb-2 max-h-20 overflow-auto rounded bg-gray-950 p-2 text-xs text-gray-300">
              {typeof msg.payload === "string"
                ? msg.payload
                : JSON.stringify(msg.payload, null, 2)}
            </pre>

            <div className="flex gap-2">
              <button
                onClick={() => setInspecting(msg)}
                className="rounded bg-gray-700 px-3 py-1 text-xs font-medium text-gray-300 hover:bg-gray-600"
              >
                Inspect
              </button>
              <button
                onClick={() => void onRelease(msg.id)}
                className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500"
              >
                Release
              </button>
            </div>
          </div>
        ))}
      </div>

      {inspecting && (
        <InspectModal
          message={inspecting}
          onRelease={onRelease}
          onClose={() => setInspecting(null)}
        />
      )}
    </>
  );
}
