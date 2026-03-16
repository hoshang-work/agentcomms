"""AgentClient — Python SDK for AgentComms, mirroring the TypeScript SDK."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
import time
from collections import deque
from typing import Any, Callable

import httpx
from httpx_sse import aconnect_sse

from agentcomms.crypto import public_key_hex, sign_message
from agentcomms.types import AgentClientOptions, AgentInfo, AgentMessage, Intent

logger = logging.getLogger("agentcomms")

# ── Constants ───────────────────────────────────────────────────────────

_INITIAL_BACKOFF_S = 1.0
_MAX_BACKOFF_S = 30.0
_DEDUP_CACHE_SIZE = 500


class AgentClient:
    """Async Python client for the AgentComms broker and registry.

    Mirrors the TypeScript ``AgentClient`` API exactly:
    ``register()``, ``send()``, ``broadcast()``, ``on()``,
    ``discover()``, ``disconnect()``, ``with_trace()``.
    """

    def __init__(self, opts: AgentClientOptions) -> None:
        self._agent_id = opts.agent_id
        self._private_key = opts.private_key
        self._broker_url = opts.broker_url.rstrip("/")
        self._registry_url = opts.registry_url.rstrip("/")
        self._default_ttl = opts.default_ttl
        self._default_priority = opts.default_priority

        self._http = httpx.AsyncClient(timeout=30)
        self._handlers: dict[Intent, list[Callable[[AgentMessage], Any]]] = {}

        # SSE subscription state.
        self._sse_task: asyncio.Task[None] | None = None
        self._disconnecting = False

        # Reconnection.
        self._reconnect_attempt = 0

        # Message deduplication.
        self._seen_ids: set[str] = set()
        self._seen_id_order: deque[str] = deque(maxlen=_DEDUP_CACHE_SIZE)

        # Trace propagation.
        self._fixed_trace_id: str | None = None

    # ── Properties ──────────────────────────────────────────────────────

    @property
    def agent_id(self) -> str:
        return self._agent_id

    # ── Registry ────────────────────────────────────────────────────────

    async def register(
        self,
        capabilities: list[str] | None = None,
        accepted_intents: list[str] | None = None,
    ) -> None:
        """Register this agent with the registry."""
        res = await self._http.post(
            f"{self._registry_url}/agents/register",
            json={
                "agentId": self._agent_id,
                "capabilities": capabilities or [],
                "acceptedIntents": accepted_intents or [],
                "publicKey": public_key_hex(self._private_key),
            },
        )
        if res.status_code >= 400:
            raise RuntimeError(
                f"Registration failed ({res.status_code}): {res.text}"
            )

    # ── Messaging ───────────────────────────────────────────────────────

    async def send(
        self,
        recipient: str,
        intent: Intent,
        payload: Any,
    ) -> str:
        """Send a direct message. Returns the message id."""
        msg = self._build_message(recipient, intent, payload)
        return await self._publish(msg)

    async def broadcast(
        self,
        channel: str,
        intent: Intent,
        payload: Any,
    ) -> str:
        """Broadcast a message to a channel. Returns the message id."""
        recipient = channel if channel.startswith("channel://") else f"channel://{channel}"
        msg = self._build_message(recipient, intent, payload, channel=channel)
        return await self._publish(msg)

    # ── Subscription ────────────────────────────────────────────────────

    def on(self, intent: Intent, handler: Callable[[AgentMessage], Any]) -> None:
        """Subscribe to messages matching *intent*.

        Opens an SSE connection to the broker on first call.
        """
        self._handlers.setdefault(intent, []).append(handler)

        if self._sse_task is None:
            self._disconnecting = False
            self._reconnect_attempt = 0
            self._sse_task = asyncio.ensure_future(self._sse_loop())

    # ── Discovery ───────────────────────────────────────────────────────

    async def discover(self, capability: str) -> list[AgentInfo]:
        """Query the registry for agents with *capability*."""
        res = await self._http.get(
            f"{self._registry_url}/agents",
            params={"capability": capability},
        )
        if res.status_code >= 400:
            raise RuntimeError(
                f"Discovery failed ({res.status_code}): {res.text}"
            )
        return [AgentInfo.from_dict(a) for a in res.json()]

    # ── Trace propagation ───────────────────────────────────────────────

    def with_trace(self, trace_id: str) -> AgentClient:
        """Return a lightweight clone pinned to *trace_id*."""
        clone = object.__new__(AgentClient)
        clone.__dict__.update(self.__dict__)
        clone._fixed_trace_id = trace_id  # noqa: SLF001
        return clone

    # ── Lifecycle ───────────────────────────────────────────────────────

    async def disconnect(self) -> None:
        """Close the SSE connection and clean up."""
        self._disconnecting = True

        if self._sse_task is not None:
            self._sse_task.cancel()
            try:
                await self._sse_task
            except asyncio.CancelledError:
                pass
            self._sse_task = None

        self._handlers.clear()
        self._reconnect_attempt = 0
        await self._http.aclose()

    # ── Private helpers ─────────────────────────────────────────────────

    def _build_message(
        self,
        recipient: str,
        intent: Intent,
        payload: Any,
        *,
        channel: str | None = None,
    ) -> AgentMessage:
        msg = AgentMessage(
            id=str(uuid.uuid4()),
            trace_id=self._fixed_trace_id or str(uuid.uuid4()),
            sender=self._agent_id,
            recipient=recipient,
            intent=intent,
            priority=self._default_priority,
            ttl=self._default_ttl,
            payload=payload,
            timestamp=int(time.time() * 1000),
            signature="",
            channel=channel,
        )
        msg.signature = sign_message(msg.to_dict(), self._private_key)
        return msg

    async def _publish(self, msg: AgentMessage) -> str:
        res = await self._http.post(
            f"{self._broker_url}/messages",
            json=msg.to_dict(),
        )
        if res.status_code >= 400:
            raise RuntimeError(
                f"Publish failed ({res.status_code}): {res.text}"
            )
        data: dict[str, Any] = res.json()
        return data["id"]

    # ── SSE event loop with reconnection + dedup ────────────────────────

    async def _sse_loop(self) -> None:
        url = (
            f"{self._broker_url}/messages/subscribe"
            f"?agentId={self._agent_id}"
        )

        while not self._disconnecting:
            try:
                async with aconnect_sse(
                    self._http, "GET", url
                ) as event_source:
                    self._reconnect_attempt = 0  # connected OK
                    async for sse in event_source.aiter_sse():
                        if self._disconnecting:
                            return
                        self._handle_sse_data(sse.data)
            except asyncio.CancelledError:
                return
            except Exception as exc:
                if self._disconnecting:
                    return
                delay = min(
                    _INITIAL_BACKOFF_S * (2 ** self._reconnect_attempt),
                    _MAX_BACKOFF_S,
                )
                self._reconnect_attempt += 1
                logger.warning(
                    "[AgentClient] SSE reconnect attempt %d in %.1fs (%s)",
                    self._reconnect_attempt,
                    delay,
                    exc,
                )
                await asyncio.sleep(delay)

    def _handle_sse_data(self, raw: str) -> None:
        try:
            data = json.loads(raw)
            msg = AgentMessage.from_dict(data)
        except Exception:
            return  # malformed frame

        # Dedup.
        if msg.id in self._seen_ids:
            return
        self._track_seen_id(msg.id)

        handlers = self._handlers.get(msg.intent, [])
        for h in handlers:
            h(msg)

    def _track_seen_id(self, msg_id: str) -> None:
        self._seen_ids.add(msg_id)
        self._seen_id_order.append(msg_id)
        # deque(maxlen=N) auto-evicts, but we must also clean the set.
        if len(self._seen_ids) > _DEDUP_CACHE_SIZE:
            # The deque already dropped the oldest; remove it from the set.
            # Since deque auto-drops, we need to reconcile.
            self._seen_ids = set(self._seen_id_order)

    def __repr__(self) -> str:
        return f"AgentClient(agent_id={self._agent_id!r})"
