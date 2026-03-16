"""Shared types mirroring @agentlink/core."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class Intent(str, Enum):
    """Message intent — must match the core IntentEnum."""

    REQUEST = "REQUEST"
    RESPONSE = "RESPONSE"
    BROADCAST = "BROADCAST"
    ERROR = "ERROR"
    HEARTBEAT = "HEARTBEAT"


@dataclass
class AgentMessage:
    """Wire format for every message in the system."""

    id: str
    trace_id: str
    sender: str
    recipient: str
    intent: Intent
    priority: int
    ttl: int
    payload: Any
    timestamp: int
    signature: str
    channel: str | None = None

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "id": self.id,
            "trace_id": self.trace_id,
            "sender": self.sender,
            "recipient": self.recipient,
            "intent": self.intent.value,
            "priority": self.priority,
            "ttl": self.ttl,
            "payload": self.payload,
            "timestamp": self.timestamp,
            "signature": self.signature,
        }
        if self.channel is not None:
            d["channel"] = self.channel
        return d

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> AgentMessage:
        return cls(
            id=data["id"],
            trace_id=data["trace_id"],
            sender=data["sender"],
            recipient=data["recipient"],
            intent=Intent(data["intent"]),
            priority=data["priority"],
            ttl=data["ttl"],
            payload=data["payload"],
            timestamp=data["timestamp"],
            signature=data["signature"],
            channel=data.get("channel"),
        )


@dataclass
class AgentInfo:
    """Agent record returned by the registry."""

    id: str
    agent_id: str
    capabilities: list[str]
    accepted_intents: list[str]
    max_concurrency: int
    public_key: str
    status: str
    last_heartbeat: str
    created_at: str

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> AgentInfo:
        return cls(
            id=data["id"],
            agent_id=data["agentId"],
            capabilities=data.get("capabilities", []),
            accepted_intents=data.get("acceptedIntents", []),
            max_concurrency=data.get("maxConcurrency", 1),
            public_key=data.get("publicKey", ""),
            status=data.get("status", "available"),
            last_heartbeat=data.get("lastHeartbeat", ""),
            created_at=data.get("createdAt", ""),
        )


@dataclass
class AgentClientOptions:
    """Options for constructing an AgentClient."""

    agent_id: str
    """This agent's URI, e.g. 'agent://planner-1'."""

    private_key: bytes
    """Ed25519 private key (32 bytes) for signing messages."""

    broker_url: str = "http://localhost:3000"
    """Broker base URL."""

    registry_url: str = "http://localhost:3001"
    """Registry base URL."""

    default_ttl: int = 30_000
    """Default TTL in ms."""

    default_priority: int = 3
    """Default priority 1–5."""
