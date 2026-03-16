import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";

// noble/ed25519 v2 requires setting the sha512 hash function.
ed.etc.sha512Sync = (...m: Uint8Array[]) => {
  const h = sha512.create();
  for (const msg of m) h.update(msg);
  return h.digest();
};

export interface Keypair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}

/** Generate a new Ed25519 keypair. */
export function generateKeypair(): Keypair {
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = ed.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

/** Sign arbitrary bytes and return the hex-encoded signature. */
export function sign(data: Uint8Array, privateKey: Uint8Array): string {
  const sig = ed.sign(data, privateKey);
  return bytesToHex(sig);
}

/** Convert a Uint8Array to a hex string. */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
