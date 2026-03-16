<p align="center">
  <h1 align="center">AgentComms</h1>
  <p align="center"><strong>Async messaging for AI agents — like Slack, but for machines.</strong></p>
</p>

<p align="center">
  <a href="#quickstart">Quickstart</a> &middot;
  <a href="#packages">Packages</a> &middot;
  <a href="#build-your-own-agent">Build an Agent</a> &middot;
  <a href="#human-override-controls">Human Override</a> &middot;
  <a href="#contributing">Contributing</a>
</p>

---

AgentComms is a purpose-built communication infrastructure that lets autonomous AI agents discover each other, exchange structured messages, and collaborate on complex tasks in real time. Instead of brittle point-to-point HTTP calls, agents connect through a central message broker backed by Redis Streams, register their capabilities in a shared registry, and communicate using a well-defined message schema with built-in tracing, priorities, and cryptographic signing. A Next.js observability dashboard lets humans monitor every message, inspect agent status, and pause the entire system with a single click.

## Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                                                                        │
│   ┌───────────┐  POST /messages   ┌───────────────┐                   │
│   │  Agent A   │ ────────────────▶│               │  Redis Streams    │
│   │  (TS SDK)  │                  │    Broker     │ ──────────────▶   │
│   │            │◀── SSE ─────────│   :3000       │                   │
│   └───────────┘                  │               │◀── XREAD ──────   │
│                                   │  ┌─────────┐ │                   │
│   ┌───────────┐  POST /messages   │  │  Redis  │ │  Redis Pub/Sub   │
│   │  Agent B   │ ────────────────▶│  └─────────┘ │ ──────────────▶   │
│   │  (Py SDK)  │                  │               │                   │
│   │            │◀── SSE ─────────│               │                   │
│   └───────────┘                  └───────┬───────┘                   │
│                                          │ permission check           │
│                                          ▼                            │
│   ┌───────────┐  POST /agents    ┌───────────────┐                   │
│   │  Agent C   │ ───────────────▶│   Registry    │                   │
│   │  (TS SDK)  │                  │   :3001       │                   │
│   │            │◀── GET /agents ─│  ┌──────────┐│                   │
│   └───────────┘                  │  │ Postgres ││                   │
│                                   │  └──────────┘│                   │
│   ┌──────────────────────┐       └───────────────┘                   │
│   │  Dashboard  :3002     │◀── SSE + REST ──────┘                    │
│   │  (Next.js 14)         │                                           │
│   │  pause / resume /     │                                           │
│   │  inspect / edit       │                                           │
│   └──────────────────────┘                                           │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

Agents register with the **Registry** on startup, then send messages through the **Broker**. The Broker validates every message against the `AgentMessage` schema, checks permissions with the Registry, and publishes to Redis Streams. Subscribers receive messages in real time via Server-Sent Events. Channel broadcasts also fan out through Redis Pub/Sub for instant delivery.

---

## Quickstart

### Prerequisites

| Tool | Version |
|------|---------|
| Node.js | >= 18 |
| pnpm | >= 9 |
| Docker | any recent version |

```bash
# Enable pnpm if you haven't already
corepack enable && corepack prepare pnpm@latest --activate
```

### 1. Clone & install

```bash
git clone https://github.com/hoshang-work/agentcomms.git
cd agentcomms
pnpm install
```

### 2. Start Docker dependencies

```bash
# Redis — powers the broker's message streams and pub/sub
docker run -d --name agentcomms-redis -p 6379:6379 redis:7-alpine

# PostgreSQL — stores agent registrations and permissions
docker run -d --name agentcomms-pg -p 5432:5432 \
  -e POSTGRES_USER=agentcomms \
  -e POSTGRES_PASSWORD=agentcomms \
  -e POSTGRES_DB=agentcomms \
  postgres:16-alpine
```

### 3. Configure & migrate

```bash
# Create your environment file
cat > .env << 'EOF'
BROKER_URL=http://localhost:3000
REGISTRY_URL=http://localhost:3001
NEXT_PUBLIC_BROKER_URL=http://localhost:3000
EOF

# Push the database schema
pnpm --filter @agentcomms/registry db:push
```

### 4. Start all services

```bash
pnpm dev
```

This launches via Turborepo:

| Service | Port | Stack |
|---------|------|-------|
| **Broker** | 3000 | Fastify + Redis Streams |
| **Registry** | 3001 | Fastify + PostgreSQL |
| **Dashboard** | 3002 | Next.js 14 + Tailwind |

Open **[http://localhost:3002](http://localhost:3002)** to see the dashboard.

### 5. Run the demo

In a second terminal:

```bash
cd apps/demo

# Add your Anthropic API key
cat > .env << 'EOF'
ANTHROPIC_API_KEY=sk-ant-...your-key-here...
BROKER_URL=http://localhost:3000
REGISTRY_URL=http://localhost:3001
EOF

chmod +x run.sh
./run.sh "Write a short report on the future of AI agents"
```

Three Claude-powered agents — **planner**, **worker**, and **critic** — will collaborate to decompose the task, execute subtasks in parallel, and review the combined output. Watch the messages flow live in the dashboard.

---

## Packages

| Package | Path | Description |
|---------|------|-------------|
| **@agentcomms/core** | `packages/core` | Shared TypeScript types and Zod validation schemas. The `AgentMessage` type that every message conforms to lives here. |
| **@agentcomms/broker** | `packages/broker` | The message bus. Accepts messages via REST, persists them in Redis Streams, and delivers them to subscribers via SSE. Enforces permissions and supports human override (pause/resume/inspect). |
| **@agentcomms/registry** | `packages/registry` | Agent discovery service. Agents register capabilities and accepted intents; other agents query by capability to find collaborators. PostgreSQL + Drizzle ORM. Includes a heartbeat reaper for offline detection. |
| **@agentcomms/sdk** | `packages/sdk` | TypeScript client library. Registration, Ed25519 message signing, SSE subscription, trace propagation, and automatic reconnection with exponential backoff. |
| **agentcomms** *(Python)* | `packages/sdk-python` | Python client library. Async-first with `httpx` + `httpx-sse`, mirroring the TypeScript SDK's full API surface. |
| **@agentcomms/dashboard** | `apps/dashboard` | Next.js 14 observability UI. Live message feed, agent status grid, trace viewer, channel browser, and human override controls. |
| **@agentcomms/demo** | `apps/demo` | Three demo agents using the Anthropic Claude API — a planner, a worker, and a critic that collaborate end-to-end. |

---

## Message Schema

Every message conforms to the `AgentMessage` type, validated at the broker with Zod:

```typescript
interface AgentMessage {
  id:        string   // UUID — unique message identifier
  trace_id:  string   // UUID — groups related messages into a conversation
  sender:    string   // "agent://<name>" — who sent it
  recipient: string   // "agent://<name>" or "channel://<name>"
  channel?:  string   // Present on broadcast messages
  intent:    Intent   // REQUEST | RESPONSE | BROADCAST | ERROR | HEARTBEAT
  priority:  number   // 1 (lowest) to 5 (highest)
  ttl:       number   // Time-to-live in seconds
  payload:   unknown  // Arbitrary JSON body
  timestamp: number   // Unix epoch in milliseconds
  signature: string   // Ed25519 signature
}
```

### Example

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
  "signature": "a3f2b1c0d9e8f7a6b5c4d3e2f1..."
}
```

### Intents

| Intent | Description |
|--------|-------------|
| `REQUEST` | Direct request to another agent |
| `RESPONSE` | Reply to a previous `REQUEST` |
| `BROADCAST` | Fan-out to all channel subscribers |
| `ERROR` | Error notification |
| `HEARTBEAT` | Periodic liveness signal |

---

## Build Your Own Agent

### TypeScript

```bash
pnpm add @agentcomms/sdk
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
        await agent.with_trace(msg.trace_id).send(
            msg.sender, Intent.RESPONSE, {"result": result}
        )

    agent.on(Intent.REQUEST, handle)

asyncio.run(main())
```

### SDK Reference

| Method | Description |
|--------|-------------|
| `register(capabilities, intents)` | Announce your agent to the registry |
| `send(recipient, intent, payload)` | Send a direct message |
| `broadcast(channel, intent, payload)` | Publish to a channel |
| `on(intent, handler)` | Subscribe to messages by intent (opens SSE automatically) |
| `withTrace(traceId)` | Pin all outgoing messages to a trace ID |
| `discover(capability)` | Find agents by capability |
| `disconnect()` | Close the SSE connection and clean up |

---

## Human Override Controls

The broker includes a global pause mechanism that lets a human operator intercept, inspect, edit, and release messages before they reach their destination.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/override/pause` | POST | Pause all delivery — new messages are queued |
| `/override/resume` | POST | Flush held queue and resume |
| `/override/discard` | POST | Discard all held messages (stays paused) |
| `/override/status` | GET | Returns `{ paused, heldCount }` |
| `/override/held` | GET | Returns the full held message queue |
| `/override/release/:id` | POST | Release one message, optionally with modified payload |

The [dashboard](http://localhost:3002) exposes these controls through a visual interface — pause the system, click into any held message, edit its payload, and release it.

---

## Development

```bash
pnpm build          # Build all packages (respects dependency order)
pnpm dev            # Start all services in watch mode
pnpm test           # Run all test suites
pnpm clean          # Remove all dist/ directories
```

Work on a single package:

```bash
pnpm --filter @agentcomms/broker build
pnpm --filter @agentcomms/sdk test
pnpm --filter @agentcomms/registry db:push
```

---

## Contributing

Contributions are welcome! Here's how to get started:

1. **Fork** the repo and create a feature branch from `main`.
2. **Install dependencies** with `pnpm install` — this is a pnpm workspace, do not use npm or yarn.
3. **Follow existing conventions** — TypeScript strict mode everywhere, all inter-agent communication goes through the broker (no direct service-to-service calls), and every message must conform to `AgentMessage` from `@agentcomms/core`.
4. **Write tests** — run `pnpm test` to make sure everything passes.
5. **Build** — run `pnpm build` to verify the full workspace compiles with zero errors.
6. **Open a PR** against `main` with a clear description of what changed and why.

### Guidelines

- Keep PRs focused — one feature or fix per PR.
- New broker endpoints should include permission checks where appropriate.
- New SDK methods should be added to both the TypeScript and Python clients.
- Dashboard changes should work with Tailwind CSS v4 (no custom CSS unless necessary).

---

## License

MIT
