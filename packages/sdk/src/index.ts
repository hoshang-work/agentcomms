export { AgentClient } from "./client.js";
export { generateKeypair } from "./crypto.js";
export type { Keypair } from "./crypto.js";
export type { AgentClientOptions, AgentInfo } from "./types.js";

// Re-export core types for convenience.
export type { AgentMessage, Intent } from "@agentlink/core";
