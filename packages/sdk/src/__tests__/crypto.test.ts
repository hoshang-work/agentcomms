import { describe, it, expect } from "vitest";
import { generateKeypair, sign } from "../crypto.js";

describe("crypto", () => {
  it("generateKeypair returns 32-byte private key and 32-byte public key", () => {
    const kp = generateKeypair();
    expect(kp.privateKey).toBeInstanceOf(Uint8Array);
    expect(kp.publicKey).toBeInstanceOf(Uint8Array);
    expect(kp.privateKey.length).toBe(32);
    expect(kp.publicKey.length).toBe(32);
  });

  it("generates different keypairs each time", () => {
    const a = generateKeypair();
    const b = generateKeypair();
    expect(a.privateKey).not.toEqual(b.privateKey);
  });

  it("sign returns a hex string", () => {
    const kp = generateKeypair();
    const data = new TextEncoder().encode("hello");
    const sig = sign(data, kp.privateKey);
    expect(typeof sig).toBe("string");
    expect(sig).toMatch(/^[0-9a-f]+$/);
    // Ed25519 signatures are 64 bytes = 128 hex chars
    expect(sig.length).toBe(128);
  });

  it("sign produces deterministic output for same input", () => {
    const kp = generateKeypair();
    const data = new TextEncoder().encode("test message");
    const sig1 = sign(data, kp.privateKey);
    const sig2 = sign(data, kp.privateKey);
    expect(sig1).toBe(sig2);
  });
});
