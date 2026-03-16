# AgentLink

**Purpose-built async messaging infrastructure for AI agents.**

<p>
  <a href="#quickstart">Quickstart</a> &middot;
  <a href="#packages">Packages</a> &middot;
  <a href="#build-your-own-agent">Build an Agent</a> &middot;
  <a href="#human-override-controls">Human Override</a> &middot;
  <a href="#roadmap">Roadmap</a>
</p>

---

Today's AI agents talk to each other through brittle point-to-point HTTP calls, shared databases, or hand-rolled queues that break the moment you add a third agent. AgentLink fixes this with a proper messaging layer: a central broker backed by Redis Streams for durable delivery, a registry where agents advertise capabilities and discover collaborators, a typed message schema with tracing and Ed25519 signing, and a real-time dashboard where humans can monitor, pause, inspect, and edit every message before it lands. Think of it as Slack for machines — structured channels, direct messages, permissions, and full observability out of the box.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  ┌───────────┐                    ┌───────────────┐                 │
│  │  Agent A   │── POST /messages ▶│               │                 │
│  │  (TS SDK)  │◀──── SSE ────────│   Broker      │◀── Redis ──┐   │
│  └───────────┘                   │   :3000       │            │   │
│                                   │               │── Streams ─┘   │
│  ┌───────────┐                   │               │── Pub/Sub ──▶  │
│  │  Agent B   │── POST /messages ▶│               │                 │
│  │  (Py SDK)  │◀──── SSE ────────└───────┬───────┘                 │
│  └───────────┘                           │                          │
│                                   permission check                  │
│                                           │                          │
│  ┌───────────┐                    ┌──────▼────────┐                 │
│  │  Agent C   │── POST /agents ──▶│   Registry    │                 │
│  │  (TS SDK)  │◀── GET /agents ──│   :3001       │                 │
│  └───────────┘                   │   (Postgres)  │                 │
│                                    └──────┬────────┘                 │
│                                           │                          │
│                                    ┌──────▼────────┐                 │
│                                    │   Dashboard   │                 │
│                                    │   :3002       │                 │
│                                    │  (Next.js 14) │                 │
│                                    │               │                 │
│                                    │  pause/resume │                 │
│                                    │  inspect/edit │                 │
│                                    └───────────────┘                 │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**How it works:** Agents register with the **Registry**, then exchange messages through the **Broker**. The Broker validates every message against the `AgentMessage` Zod schema, checks sender permissions via the Registry, persists to Redis Streams, and delivers to subscribers over SSE. Channel broadcasts fan out instantly via Redis Pub/Sub. The **Dashboard** taps into all three to give humans full visibility and control.

---

## Quickstart

### Prerequisites

- **Node.js** >= 18 &nbsp;&middot;&nbsp; **pnpm** >= 9 &nbsp;&middot;&nbsp; **Docker**

### 1. Clone & install

```bash
git clone https://github.com/hoshang-work/agentlink.git
cd agentlink
pnpm install
```

### 2. Start Redis & PostgreSQL

```bash
docker run -d --name agentlink-redis -p 6379:6379 redis:7-alpine

docker run -d --name agentlink-pg -p 5432:5432 \
  -e POSTGRES_USER=agentlink \
  -e POSTGRES_PASSWORD=agentlink \
  -e POSTGRES_DB=agentlink \
  postgres:16-alpine
```

### 3. Configure & migrate

```bash
cat > .env << 'EOF'
BROKER_URL=http://localhost:3000
REGISTRY_URL=http://localhost:3001
NEXT_PUBLIC_BROKER_URL=http://localhost:3000
EOF

pnpm --filter @agentlink/registry db:push
```

### 4. Start everything

```bash
pnpm dev
```

| Service       | Port | Stack                   |
|---------------|------|-------------------------|
| **Broker**    | 3000 | Fastify + Redis Streams |
| **Registry**  | 3001 | Fastify + PostgreSQL    |
| **Dashboard** | 3002 | Next.js 14 + Tailwind   |

Open **[localhost:3002](http://localhost:3002)** to see the dashboard.

### 5. Run the demo

```bash
cd apps/demo

cat > .env << 'EOF'
ANTHROPIC_API_KEY=sk-ant-...your-key...
BROKER_URL=http://localhost:3000
REGISTRY_URL=http://localhost:3001
EOF

./run.sh "Write a short report on the future of AI agents"
```

Three Claude-powered agents — **planner**, **worker**, **critic** — decompose the task, execute subtasks in parallel, and review the output. Watch it happen live in the dashboard.

---

## Packages

| Package | Path | What it does |
|---------|------|-------------|
| **@agentlink/core** | `packages/core` | Shared TypeScript types and Zod schemas. The `AgentMessage` type lives here. |
| **@agentlink/broker** | `packages/broker` | Message bus — REST ingest, Redis Streams persistence, SSE delivery, permission enforcement, human override controls. |
| **@agentlink/registry** | `packages/registry` | Agent discovery — capability registration, intent declarations, permission grants, heartbeat reaping. PostgreSQL + Drizzle. |
| **@agentlink/sdk** | `packages/sdk` | TypeScript client — registration, Ed25519 signing, SSE subscriptions, trace propagation, auto-reconnect. |
| **agentlink** *(Python)* | `packages/sdk-python` | Python client — async-first (`httpx` + `httpx-sse`), mirrors the TS SDK's full API. |
| **@agentlink/dashboard** | `apps/dashboard` | Next.js 14 UI — live message feed, agent grid, trace viewer, channel browser, pause/inspect/edit controls. |
| **@agentlink/demo** | `apps/demo` | Three Anthropic Claude agents (planner → worker → critic) that collaborate end-to-end. |

---

## Message Schema

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
  "signature": "a3f2b1c0d9e8f7a6..."
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Unique message identifier |
| `trace_id` | UUID | Groups related messages into a conversation chain |
| `sender` | `agent://<name>` | Who sent it |
| `recipient` | `agent://<name>` or `channel://<name>` | Where it's going |
| `intent` | `REQUEST` · `RESPONSE` · `BROADCAST` · `ERROR` · `HEARTBEAT` | Message type |
| `priority` | 1–5 | 1 = lowest, 5 = highest |
| `ttl` | seconds | Time-to-live |
| `payload` | any JSON | The message body |
| `timestamp` | ms epoch | When it was created |
| `signature` | string | Ed25519 signature |

---

## Build Your Own Agent

### TypeScript

```bash
pnpm add @agentlink/sdk
```

```typescript
import { AgentClient, generateKeypair } from "@agentlink/sdk";

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
pip install agentlink
```

```python
import asyncio
from agentlink import AgentClient, AgentClientOptions, Intent, generate_keypair

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

### SDK Methods

| Method | Description |
|--------|-------------|
| `register(capabilities, intents)` | Announce your agent to the registry |
| `send(recipient, intent, payload)` | Send a direct message |
| `broadcast(channel, intent, payload)` | Publish to a channel |
| `on(intent, handler)` | Subscribe by intent (auto-opens SSE) |
| `withTrace(traceId)` | Pin outgoing messages to a trace |
| `discover(capability)` | Find agents by capability |
| `disconnect()` | Close SSE and clean up |

---

## Human Override Controls

The broker includes a global kill switch. Pause the system, and every new message is held in a queue for human review. Inspect payloads, edit them, release individually, or discard the batch.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/override/pause` | POST | Pause delivery — messages queue up |
| `/override/resume` | POST | Flush held queue, resume delivery |
| `/override/discard` | POST | Drop all held messages, stay paused |
| `/override/status` | GET | `{ paused, heldCount }` |
| `/override/held` | GET | Full held message array |
| `/override/release/:id` | POST | Release one message (optionally with edited payload) |

All of this is exposed in the [dashboard](http://localhost:3002) with a visual inspect/edit interface.

---

## Roadmap

- [ ] **npm / PyPI publishing** — Publish `@agentlink/sdk` to npm and `agentlink` to PyPI so agents can install with a single command
- [ ] **Vector memory layer** — Shared semantic memory backed by a vector store, allowing agents to persist and retrieve knowledge across conversations
- [ ] **Hosted cloud version** — Managed AgentLink-as-a-service with zero infrastructure setup — just point your agents at a URL and go

---

## Development

```bash
pnpm build    # Build all packages (dependency-aware)
pnpm dev      # Watch mode — all services
pnpm test     # Run all test suites
pnpm clean    # Remove dist/ everywhere
```

Single package:

```bash
pnpm --filter @agentlink/broker build
pnpm --filter @agentlink/sdk test
pnpm --filter @agentlink/registry db:push
```

---

## Contributing

1. **Fork** and branch from `main`
2. **`pnpm install`** — this is a pnpm workspace, do not use npm or yarn
3. **Follow conventions** — TypeScript strict mode, all communication through the broker, messages conform to `AgentMessage`
4. **Test** — `pnpm test` must pass
5. **Build** — `pnpm build` must compile with zero errors
6. **PR** — open against `main` with a clear description

**Guidelines:** One feature per PR. New broker endpoints need permission checks. New SDK methods go in both TypeScript and Python. Dashboard uses Tailwind v4.

---

## License

MIT
