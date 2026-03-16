"""Ed25519 keypair generation and signing."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from nacl.signing import SigningKey


@dataclass
class Keypair:
    """An Ed25519 keypair."""

    private_key: bytes  # 32 bytes
    public_key: bytes   # 32 bytes


def generate_keypair() -> Keypair:
    """Generate a new random Ed25519 keypair."""
    sk = SigningKey.generate()
    return Keypair(
        private_key=bytes(sk),
        public_key=bytes(sk.verify_key),
    )


def sign(data: bytes, private_key: bytes) -> str:
    """Sign arbitrary bytes and return the hex-encoded signature."""
    sk = SigningKey(private_key)
    signed = sk.sign(data)
    # signed.signature is the 64-byte detached signature.
    return signed.signature.hex()


def sign_message(msg_dict: dict[str, Any], private_key: bytes) -> str:
    """Sign a message dict (with signature='') and return the hex signature."""
    to_sign = {**msg_dict, "signature": ""}
    data = json.dumps(to_sign, separators=(",", ":"), sort_keys=False).encode()
    return sign(data, private_key)


def public_key_hex(private_key: bytes) -> str:
    """Derive the public key from a private key and return it as hex."""
    sk = SigningKey(private_key)
    return bytes(sk.verify_key).hex()
