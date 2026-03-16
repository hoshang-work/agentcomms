/** Information about a registered agent, returned by the registry. */
export interface AgentInfo {
  id: string;
  agentId: string;
  capabilities: string[];
  acceptedIntents: string[];
  maxConcurrency: number;
  publicKey: string;
  status: "available" | "busy" | "offline";
  lastHeartbeat: string;
  createdAt: string;
}

/** Options accepted by the AgentClient constructor. */
export interface AgentClientOptions {
  /** This agent's URI, e.g. "agent://planner-1" */
  agentId: string;
  /** Ed25519 private key for signing messages. */
  privateKey: Uint8Array;
  /** Broker base URL, e.g. "http://localhost:3000" */
  brokerUrl: string;
  /** Registry base URL, e.g. "http://localhost:3001" */
  registryUrl: string;
  /** Default TTL in ms (default: 30 000). */
  defaultTtl?: number;
  /** Default priority 1–5 (default: 3). */
  defaultPriority?: number;
}
