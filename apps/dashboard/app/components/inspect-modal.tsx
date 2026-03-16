"use client";

import { useState } from "react";

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

interface InspectModalProps {
  message: WireMessage;
  onRelease: (messageId: string, payload?: unknown) => Promise<void>;
  onClose: () => void;
}

export function InspectModal({ message, onRelease, onClose }: InspectModalProps) {
  const [payloadText, setPayloadText] = useState(
    JSON.stringify(message.payload, null, 2),
  );
  const [parseError, setParseError] = useState<string | null>(null);
  const [releasing, setReleasing] = useState(false);

  const handleReleaseAsIs = async () => {
    setReleasing(true);
    await onRelease(message.id);
    onClose();
  };

  const handleReleaseEdited = async () => {
    try {
      const parsed = JSON.parse(payloadText) as unknown;
      setParseError(null);
      setReleasing(true);
      await onRelease(message.id, parsed);
      onClose();
    } catch {
      setParseError("Invalid JSON — please fix before releasing.");
    }
  };

  const fields: [string, string][] = [
    ["ID", message.id],
    ["Trace ID", message.trace_id],
    ["Sender", message.sender],
    ["Recipient", message.channel ?? message.recipient],
    ["Intent", message.intent],
    ["Priority", String(message.priority)],
    ["Timestamp", new Date(message.timestamp).toLocaleString()],
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="mx-4 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-gray-700 bg-gray-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Inspect Message</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Read-only fields */}
        <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {fields.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="font-medium text-gray-500">{label}</dt>
              <dd className="font-mono text-gray-300">{value}</dd>
            </div>
          ))}
        </dl>

        {/* Editable payload */}
        <label className="mb-1 block text-sm font-medium text-gray-400">
          Payload (editable)
        </label>
        <textarea
          value={payloadText}
          onChange={(e) => {
            setPayloadText(e.target.value);
            setParseError(null);
          }}
          rows={10}
          className="mb-1 w-full rounded-lg border border-gray-700 bg-gray-950 p-3 font-mono text-sm text-gray-200 focus:border-indigo-500 focus:outline-none"
        />
        {parseError && (
          <p className="mb-2 text-sm text-red-400">{parseError}</p>
        )}

        {/* Footer buttons */}
        <div className="mt-4 flex gap-3">
          <button
            disabled={releasing}
            onClick={() => void handleReleaseAsIs()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            Release As-Is
          </button>
          <button
            disabled={releasing}
            onClick={() => void handleReleaseEdited()}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
          >
            Release with Edits
          </button>
          <button
            onClick={onClose}
            className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-600"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
