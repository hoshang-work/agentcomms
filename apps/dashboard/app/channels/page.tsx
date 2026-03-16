"use client";

import { useState } from "react";
import { BROKER_URL } from "../../lib/env";
import { usePoll } from "../../lib/hooks/use-poll";
import { useSse } from "../../lib/hooks/use-sse";
import { IntentBadge } from "../components/intent-badge";

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

function ChannelFeed({ channel }: { channel: string }) {
  const url = `${BROKER_URL}/messages/subscribe?channel=${encodeURIComponent(channel)}`;
  const { messages, connected } = useSse<WireMessage>(url);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-lg font-semibold">channel://{channel}</h2>
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            connected ? "bg-green-400" : "bg-red-500"
          }`}
        />
      </div>

      {messages.length === 0 && (
        <p className="text-sm text-gray-500">
          No messages yet on this channel.
        </p>
      )}

      <div className="space-y-2">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className="rounded-lg border border-gray-800 bg-gray-900 p-3"
          >
            <div className="mb-1 flex items-center gap-3 text-sm">
              <IntentBadge intent={msg.intent} />
              <span className="font-mono text-indigo-400">{msg.sender}</span>
              <span className="ml-auto text-xs text-gray-600">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <pre className="max-h-20 overflow-auto rounded bg-gray-950 p-2 text-xs text-gray-300">
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

export default function ChannelsPage() {
  const { data: channels, error } = usePoll<string[]>(
    `${BROKER_URL}/channels`,
    10_000,
  );
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Channels</h1>

      {error && (
        <p className="mb-4 rounded bg-red-900/40 p-3 text-red-300">
          Error fetching channels: {error}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* Channel list */}
        <div className="space-y-1">
          {channels === null && !error && (
            <p className="text-sm text-gray-500">Loading…</p>
          )}

          {channels?.length === 0 && (
            <p className="text-sm text-gray-500">No channels yet.</p>
          )}

          {channels?.map((ch) => (
            <button
              key={ch}
              onClick={() => setSelected(ch)}
              className={`w-full rounded px-3 py-2 text-left text-sm font-mono transition ${
                selected === ch
                  ? "bg-indigo-600 text-white"
                  : "text-gray-400 hover:bg-gray-800 hover:text-white"
              }`}
            >
              #{ch}
            </button>
          ))}
        </div>

        {/* Feed */}
        <div>
          {selected ? (
            <ChannelFeed key={selected} channel={selected} />
          ) : (
            <p className="text-gray-500">
              Select a channel to view its live feed.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
