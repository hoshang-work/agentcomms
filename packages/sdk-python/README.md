# agentlink — Python SDK

Python client for [AgentLink](../../CLAUDE.md), an async messaging system for AI agents. Mirrors the TypeScript SDK (`@agentlink/sdk`) API exactly.

## Install

```bash
pip install agentlink
# or from source
pip install -e packages/sdk-python
```

## Quickstart

```python
import asyncio
from agentlink import AgentClient, AgentClientOptions, Intent, generate_keypair

async def main():
    # 1. Generate keypairs
    alice_kp = generate_keypair()
    bob_kp = generate_keypair()

    # 2. Create clients
    alice = AgentClient(AgentClientOptions(
        agent_id="agent://alice",
        private_key=alice_kp.private_key,
        broker_url="http://localhost:3000",
        registry_url="http://localhost:3001",
    ))
    bob = AgentClient(AgentClientOptions(
        agent_id="agent://bob",
        private_key=bob_kp.private_key,
        broker_url="http://localhost:3000",
        registry_url="http://localhost:3001",
    ))

    # 3. Register with the registry (required before messaging)
    await alice.register(["task_delegation"], ["REQUEST", "RESPONSE"])
    await bob.register(["summarization"], ["REQUEST"])

    # 4. Subscribe bob to incoming REQUEST messages
    bob.on(Intent.REQUEST, lambda msg: print(f"Bob received: {msg.payload}"))

    # 5. Send a message from alice to bob
    msg_id = await alice.send("agent://bob", Intent.REQUEST, {"task": "summarize this"})
    print(f"Sent message: {msg_id}")

    # 6. Discover agents by capability
    agents = await alice.discover("summarization")
    print(f"Found {len(agents)} agent(s) with summarization")

    # 7. Trace propagation — pin a trace_id for a conversation chain
    traced = alice.with_trace("11111111-2222-3333-4444-555555555555")
    await traced.send("agent://bob", Intent.REQUEST, {"task": "step 1"})
    await traced.send("agent://bob", Intent.REQUEST, {"task": "step 2"})

    await asyncio.sleep(2)

    # 8. Clean up
    await alice.disconnect()
    await bob.disconnect()

asyncio.run(main())
```

## API Reference

### `generate_keypair() -> Keypair`

Returns a `Keypair(private_key: bytes, public_key: bytes)` with a fresh Ed25519 key.

### `AgentClient(opts: AgentClientOptions)`

| Method | Description |
|---|---|
| `await register(capabilities, accepted_intents)` | Register with the registry |
| `await send(recipient, intent, payload) -> str` | Send a direct message, returns message id |
| `await broadcast(channel, intent, payload) -> str` | Broadcast to a channel |
| `on(intent, handler)` | Subscribe to messages by intent (opens SSE) |
| `await discover(capability) -> list[AgentInfo]` | Find agents by capability |
| `with_trace(trace_id) -> AgentClient` | Clone with pinned trace_id |
| `await disconnect()` | Close SSE and clean up |

### Reliability Features

- **Reconnection**: SSE auto-reconnects with exponential backoff (1s → 30s max)
- **Deduplication**: Last 500 message IDs cached; duplicates silently dropped
- **Trace propagation**: `with_trace()` pins a trace_id across a conversation chain

## Requirements

- Python ≥ 3.10
- Running AgentLink broker and registry
- Redis + PostgreSQL (for the backing services)
