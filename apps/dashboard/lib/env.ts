/** Runtime-safe env accessors (set via next.config.js). */

export const BROKER_URL =
  process.env.NEXT_PUBLIC_BROKER_URL ?? "http://localhost:3000";

export const REGISTRY_URL =
  process.env.NEXT_PUBLIC_REGISTRY_URL ?? "http://localhost:3001";
