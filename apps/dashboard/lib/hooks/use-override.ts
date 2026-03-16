"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { BROKER_URL } from "../env";

interface OverrideStatus {
  paused: boolean;
  heldCount: number;
}

interface WireMessage {
  id: string;
  trace_id: string;
  sender: string;
  recipient: string;
  intent: string;
  priority: number;
  ttl: number;
  payload: unknown;
  timestamp: number;
  signature: string;
  channel?: string;
}

/**
 * Hook for interacting with the broker's human-override API.
 *
 * Polls /override/status every 2s. When paused, also polls
 * /override/held every 3s to show the queued messages.
 */
export function useOverride() {
  const [paused, setPaused] = useState(false);
  const [heldCount, setHeldCount] = useState(0);
  const [heldMessages, setHeldMessages] = useState<WireMessage[]>([]);
  const statusTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const heldTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Poll status ────────────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${BROKER_URL}/override/status`);
      if (!res.ok) return;
      const data = (await res.json()) as OverrideStatus;
      setPaused(data.paused);
      setHeldCount(data.heldCount);
    } catch {
      // broker unreachable — leave state as-is
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
    statusTimer.current = setInterval(() => void fetchStatus(), 2_000);
    return () => {
      if (statusTimer.current) clearInterval(statusTimer.current);
    };
  }, [fetchStatus]);

  // ── Poll held messages when paused ─────────────────────────────
  const fetchHeld = useCallback(async () => {
    try {
      const res = await fetch(`${BROKER_URL}/override/held`);
      if (!res.ok) return;
      const data = (await res.json()) as WireMessage[];
      setHeldMessages(data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (paused) {
      void fetchHeld();
      heldTimer.current = setInterval(() => void fetchHeld(), 3_000);
    } else {
      setHeldMessages([]);
      if (heldTimer.current) clearInterval(heldTimer.current);
    }
    return () => {
      if (heldTimer.current) clearInterval(heldTimer.current);
    };
  }, [paused, fetchHeld]);

  // ── Mutation helpers ───────────────────────────────────────────
  const pause = useCallback(async () => {
    await fetch(`${BROKER_URL}/override/pause`, { method: "POST" });
    await fetchStatus();
  }, [fetchStatus]);

  const resume = useCallback(async () => {
    await fetch(`${BROKER_URL}/override/resume`, { method: "POST" });
    await fetchStatus();
  }, [fetchStatus]);

  const discard = useCallback(async () => {
    await fetch(`${BROKER_URL}/override/discard`, { method: "POST" });
    await fetchStatus();
    await fetchHeld();
  }, [fetchStatus, fetchHeld]);

  const release = useCallback(
    async (messageId: string, payload?: unknown) => {
      const body =
        payload !== undefined ? JSON.stringify({ payload }) : undefined;
      await fetch(`${BROKER_URL}/override/release/${messageId}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : {},
        body,
      });
      await fetchStatus();
      await fetchHeld();
    },
    [fetchStatus, fetchHeld],
  );

  return {
    paused,
    heldCount,
    heldMessages,
    pause,
    resume,
    discard,
    release,
  } as const;
}
