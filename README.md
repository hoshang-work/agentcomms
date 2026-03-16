# AgentComms

**Async messaging for AI agents — like Slack, but for machines.**

AgentComms is a purpose-built communication infrastructure that lets autonomous AI agents discover each other, exchange structured messages, and collaborate on complex tasks in real time. Instead of brittle point-to-point HTTP calls, agents connect through a central message broker backed by Redis Streams, register their capabilities in a shared registry, and communicate using a well-defined message schema with built-in tracing, priorities, and cryptographic signing. A Next.js observability dashboard lets humans monitor every message, inspect agent status, and pause/resume the entire system with a single click.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AgentComms System                           │
│                                                                     │
│  ┌──────────┐   POST /messages    ┌──────────────┐   Redis Streams  │
│  │  Agent A  │ ──────────────────▶ │              │ ───────────────▶ │
│  │  (SDK)    │                     │    Broker    │                  │
│  │          │ ◀── SSE /subscribe ─ │  :3000       │ ◀── XREAD ───── │
│  └──────────┘                     │              │                  │
│                                    │  ┌────────┐ │   Redis Pub/Sub  │
│  ┌──────────┐   POST /messages    │  │ Redis  │ │ ───────────────▶ │
│  │  Agent B  │ ──────────────────▶ │  │        │ │                  │
│  │  (SDK)    │                     │  └────────┘ │                  │
│  │          │ ◀── SSE /subscribe ─ │              │                  │
│  └──────────┘                     └──────┬───────┘                  │
│                                          │                          │
│                                  permission check                   │
│                                          │                          │
│  ┌──────────┐   POST /agents/register   ┌▼─────────────┐           │
│  │  Agent C  │ ────────────────────────▶ │   Registry   │           │
│  │  (SDK)    │                           │   :3001      │           │
│  │          │ ◀── GET /agents ────────── │              │           │
│  └──────────┘                           │  ┌──────────┐│           │
│                                          │  │ Postgres ││           │
│  ┌──────────────────┐                   │  └──────────┘│           │
│  │    Dashboard      │ ◀── SSE + REST ── └──────────────┘           │
│  │    :3002          │                                              │
│  │  (Next.js 14)     │  Human override: pause / resume / inspect    │
│  └──────────────────┘                                              │
└─────────────────────────────────────────────────────────────────────┘
```

**Data flow:** Agents register with the Registry on startup, then send messages through the Broker. The Broker validates each message against the `AgentMessage` schema, checks permissions with the Registry, and publishes to Redis Streams. Subscribers receive messages in real time via Server-Sent Events (SSE). Channel messages also fan out through Redis Pub/Sub for instant delivery.

---

## Quickstart

### Prerequisites

- **Node.js** >= 18
- **pnpm** >= 9 (`corepack enable && corepack prepare pnpm@latest --activate`)
- **Docker** (for Redis and PostgreSQL)

### 1. Clone and install

```bash
git clone https://github.com/your-org/agentcomms.git
cd agentcomms
pnpm install
```

### 2. Start infrastructure

```bash
# Redis (broker message bus)
docker run -d --name agentcomms-redis -p 6379:6379 redis:7-alpine

# PostgreSQL (registry database)
docker run -d --name agentcomms-pg -p 5432:5432 \
  -e POSTGRES_USER=agentcomms \
  -e POSTGRES_PASSWORD=agentcomms \
  -e POSTGRES_DB=agentcomms \
  postgres:16-alpine
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env if your Redis/Postgres are on non-default ports
```

Default `.env`:

```env
BROKER_URL=http://localhost:3000
REGISTRY_URL=http://localhost:3001
NEXT_PUBLIC_BROKER_URL=http://localhost:3000
```

### 4. Push the database schema

```bash
pnpm --filter @agentcomms/registry db:push
```

### 5. Start all services

```bash
pnpm dev
```

This starts (via Turborepo):

| Service    | Port | Description                    |
| ---------- | ---- | ------------------------------ |
| Broker     | 3000 | Message bus (Fastify + Redis)  |
| Registry   | 3001 | Agent discovery (Fastify + PG) |
| Dashboard  | 3002 | Observability UI (Next.js 14)  |

### 6. Run the demo

In a second terminal:

```bash
cd apps/demo
cp .env.example .env
# Add your ANTHROPIC_API_KEY to apps/demo/.env

chmod +x run.sh
./run.sh "Write a short report on the future of AI agents"
```

Three AI agents (planner, worker, critic) will collaborate to complete the task. Watch the messages flow in real time at [http://localhost:3002](http://localhost:3002).

---

## Packages

| Package | Path | Description |
| --- | --- | --- |
| **@agentcomms/core** | `packages/core` | Shared TypeScript types and Zod validation schemas. Every message in the system conforms to the `AgentMessage` type defined here. |
| **@agentcomms/broker** | `packages/broker` | The message bus. A Fastify server that accepts messages via REST, persists them in Redis Streams, and delivers them to subscribers via SSE. Includes permission enforcement and human override (pause/resume/inspect) controls. |
| **@agentcomms/registry** | `packages/registry` | Agent discovery service. Agents register their capabilities and accepted intents on startup. Other agents query the registry to find collaborators. Backed by PostgreSQL via Drizzle ORM. Includes a heartbeat reaper for offline detection. |
| **@agentcomms/sdk** | `packages/sdk` | TypeScript client library. Handles registration, message signing (Ed25519), SSE subscription, trace propagation, and automatic reconnection with exponential backoff. |
| **agentcomms** (Python) | `packages/sdk-python` | Python client library. Async-first (`httpx` + `httpx-sse`), with the same API surface as the TypeScript SDK. |
| **@agentcomms/dashboard** | `apps/dashboard` | Next.js 14 observability UI with four pages: live message feed, agent status grid, trace viewer, and channel browser. Includes human override controls (pause, resume, inspect, edit, discard). |
| **@agentcomms/demo** | `apps/demo` | Three demo agents powered by the Anthropic Claude API — a planner that decomposes tasks, a worker that executes subtasks, and a critic that reviews the combined output. |

---

## Message Schema

Every message in AgentComms conforms to the `AgentMessage` type, validated at the broker with Zod:

```typescript
interface AgentMessage {
  id: string;          // UUID — unique message identifier
  trace_id: string;    // UUID — groups related messages into a conversation
  sender: string;      // "agent://<name>" — who sent it
  recipient: string;   // "agent://<name>" or "channel://<name>"
  channel?: string;    // Set for broadcast messages
  intent: Intent;      // "REQUEST" | "RESPONSE" | "BROADCAST" | "ERROR" | "HEARTBEAT"
  priority: number;    // 1 (lowest) to 5 (highest)
  ttl: number;         // Time-to-live in seconds
  payload: unknown;    // Arbitrary JSON — the message body
  timestamp: number;   // Unix epoch in milliseconds
  signature: string;   // Ed25519 signature of the message
}
```

### Example message

```json
{
  "id": "a1b2c3d4-5678-9abc-def0-1234567890ab",
  "trace_id": "f0e1d2c3-b4a5-9687-7654-3210fedcba98",
  "sender": "agent://planner",
  "recipient": "agent://worker",
  "intent": "REQUEST",
  "priority": 3,
  "ttl": 300,
  "payload": {
    "index": 0,
    "subtask": "Research current trends in AI agent technology"
  },
  "timestamp": 1710500000000,
  "signature": "a3f2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3..."
}
```

### Intents

| Intent | Description |
| --- | --- |
| `REQUEST` | Direct request to another agent |
| `RESPONSE` | Reply to a previous REQUEST |
| `BROADCAST` | Message sent to a channel (fan-out to all subscribers) |
| `ERROR` | Error notification |
| `HEARTBEAT` | Periodic agent liveness signal |

---

## Build Your Own Agent

### TypeScript

```bash
npm install @agentcomms/sdk
```

```typescript
import { AgentClient, generateKeypair } from "@agentcomms/sdk";

const kp = generateKeypair();
const agent = new AgentClient({
  agentId: "agent://my-agent",
  privateKey: kp.privateKey,
  brokerUrl: "http://localhost:3000",
  registryUrl: "http://localhost:3001",
});

await agent.register(["summarization"], ["REQUEST"]);

agent.on("REQUEST", async (msg) => {
  const result = await doWork(msg.payload);
  await agent.withTrace(msg.trace_id).send(msg.sender, "RESPONSE", { result });
});
```

### Python

```bash
pip install agentcomms
```

```python
import asyncio
from agentcomms import AgentClient, AgentClientOptions, Intent, generate_keypair

async def main():
    kp = generate_keypair()
    agent = AgentClient(AgentClientOptions(
        agent_id="agent://my-agent",
        private_key=kp.private_key,
        broker_url="http://localhost:3000",
        registry_url="http://localhost:3001",
    ))

    await agent.register(["summarization"], ["REQUEST"])

    async def handle(msg):
        result = await do_work(msg.payload)
        await agent.with_trace(msg.trace_id).send(msg.sender, Intent.RESPONSE, {"result": result})

    agent.on(Intent.REQUEST, handle)

asyncio.run(main())
```

### Key SDK concepts

- **`register(capabilities, acceptedIntents)`** — Announce your agent to the registry so others can discover it.
- **`send(recipient, intent, payload)`** — Send a direct message to another agent.
- **`broadcast(channel, intent, payload)`** — Publish to a channel; all subscribers receive it.
- **`on(intent, handler)`** — Subscribe to incoming messages by intent. Opens an SSE connection automatically.
- **`withTrace(traceId)`** — Returns a lightweight client clone that pins all outgoing messages to the given trace ID, keeping a whole conversation chain linked.
- **`discover(capability)`** — Query the registry for agents with a specific capability.
- **`disconnect()`** — Close the SSE connection and clean up.

---

## Human Override Controls

The broker includes a global pause mechanism that lets a human operator intercept all messages:

| Endpoint | Description |
| --- | --- |
| `POST /override/pause` | Pause all message delivery — new messages are queued |
| `POST /override/resume` | Flush the held queue and resume normal delivery |
| `POST /override/discard` | Discard all held messages (stays paused) |
| `GET /override/status` | Returns `{ paused, heldCount }` |
| `GET /override/held` | Returns the full held message queue |
| `POST /override/release/:id` | Release a single message, optionally with a modified payload |

The dashboard at [http://localhost:3002](http://localhost:3002) exposes these controls through a visual interface with inspect/edit capabilities.

---

## Development

```bash
pnpm build          # Build all packages (respects dependency order)
pnpm dev            # Start all services in watch mode
pnpm test           # Run all test suites
pnpm clean          # Remove all dist/ directories
```

Build a single package:

```bash
pnpm --filter @agentcomms/broker build
pnpm --filter @agentcomms/sdk test
```

---

## License

MIT
