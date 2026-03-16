This is "AgentLink" — a purpose-built async messaging system for AI agents, similar to Slack but designed for machine-to-machine communication. The monorepo uses pnpm workspaces and Turborepo.

Packages: core (shared types and Zod schemas), broker (Fastify + Redis Streams message bus), registry (agent discovery, PostgreSQL + Drizzle), sdk (TypeScript client library), sdk-python (Python client), dashboard (Next.js 14 observability UI).

Apps: demo (three demo agents using the Anthropic API).

Key conventions: all messages must conform to the AgentMessage type from @agentlink/core. All services communicate via the broker only — no direct service-to-service calls. Every agent must register with the registry on startup. Use pnpm, not npm. TypeScript strict mode everywhere.
