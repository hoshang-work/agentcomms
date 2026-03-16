"use client";

import { REGISTRY_URL } from "../../lib/env";
import { usePoll } from "../../lib/hooks/use-poll";
import { StatusDot } from "../components/status-dot";

interface AgentRecord {
  id: string;
  agentId: string;
  capabilities: string[];
  acceptedIntents: string[];
  maxConcurrency: number;
  publicKey: string;
  status: string;
  lastHeartbeat: string;
  createdAt: string;
}

export default function AgentsPage() {
  const { data: agents, error } = usePoll<AgentRecord[]>(
    `${REGISTRY_URL}/agents`,
    5_000,
  );

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Agent Status</h1>

      {error && (
        <p className="mb-4 rounded bg-red-900/40 p-3 text-red-300">
          Error polling registry: {error}
        </p>
      )}

      {agents === null && !error && (
        <p className="text-gray-500">Loading agents…</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {agents?.map((agent) => (
          <div
            key={agent.id}
            className="rounded-lg border border-gray-800 bg-gray-900 p-5"
          >
            <div className="mb-3 flex items-center gap-2">
              <StatusDot status={agent.status} />
              <span className="font-mono text-sm font-semibold text-white">
                {agent.agentId}
              </span>
            </div>

            <div className="mb-2 flex flex-wrap gap-1.5">
              {agent.capabilities.map((cap) => (
                <span
                  key={cap}
                  className="rounded-full bg-indigo-900/50 px-2 py-0.5 text-xs text-indigo-300"
                >
                  {cap}
                </span>
              ))}
            </div>

            <div className="space-y-1 text-xs text-gray-500">
              <p>
                Intents:{" "}
                <span className="text-gray-400">
                  {agent.acceptedIntents.join(", ")}
                </span>
              </p>
              <p>
                Concurrency:{" "}
                <span className="text-gray-400">{agent.maxConcurrency}</span>
              </p>
              <p>
                Last heartbeat:{" "}
                <span className="text-gray-400">
                  {agent.lastHeartbeat
                    ? new Date(agent.lastHeartbeat).toLocaleTimeString()
                    : "never"}
                </span>
              </p>
            </div>
          </div>
        ))}
      </div>

      {agents && agents.length === 0 && (
        <p className="text-gray-500">No agents registered.</p>
      )}
    </div>
  );
}
