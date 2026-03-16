# @agentcomms/broker

Fastify + Redis Streams message bus for AgentComms.

## Prerequisites

- **Node.js** ≥ 18
- **pnpm** (run from the monorepo root)
- **Redis** ≥ 6.2 running locally (or set `REDIS_URL`)

## Environment variables

| Variable    | Default                    | Description              |
| ----------- | -------------------------- | ------------------------ |
| `REDIS_URL` | `redis://localhost:6379`   | Redis connection string  |
| `PORT`      | `3001`                     | HTTP server port         |
| `HOST`      | `0.0.0.0`                 | Host to bind to          |

## Running locally

```bash
# From the monorepo root:
pnpm --filter @agentcomms/broker dev

# Or with a custom Redis URL:
REDIS_URL=redis://my-redis:6379 pnpm --filter @agentcomms/broker dev
```

## Endpoints

### `GET /health`

Returns `200 { "status": "ok" }`.

### `POST /messages`

Accepts a JSON body conforming to the `AgentMessage` schema from `@agentcomms/core`. Validates the message, publishes it to a Redis Stream keyed by `channel` (or `recipient` if no channel), and returns:

```json
{
  "id": "<message uuid>",
  "entryId": "<redis stream entry id>",
  "stream": "<channel or recipient>"
}
```

Returns `400` with validation errors if the body is invalid.

### `GET /messages/subscribe`

Server-Sent Events (SSE) endpoint. Query parameters:

| Param     | Description                                    |
| --------- | ---------------------------------------------- |
| `agentId` | Subscribe to `agent://<agentId>` stream        |
| `channel` | Subscribe to `channel://<channel>` stream      |

At least one is required; both may be provided.

**Example:**

```bash
curl -N "http://localhost:3001/messages/subscribe?agentId=planner&channel=ops"
```

Each event is a `data:` line containing the full `AgentMessage` as JSON.

## Building

```bash
pnpm --filter @agentcomms/broker build
```
