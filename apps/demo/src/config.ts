/**
 * Shared configuration loaded from environment variables.
 * Agents import this to avoid repeating env reads.
 */

import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "..", ".env"), override: true });

export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
export const BROKER_URL = process.env.BROKER_URL ?? "http://localhost:3000";
export const REGISTRY_URL = process.env.REGISTRY_URL ?? "http://localhost:3001";

if (!ANTHROPIC_API_KEY) {
  console.error("❌ ANTHROPIC_API_KEY is not set. Add it to apps/demo/.env");
  process.exit(1);
}
