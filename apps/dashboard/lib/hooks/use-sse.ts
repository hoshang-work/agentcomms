"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Generic hook that connects to an SSE endpoint and accumulates parsed
 * JSON messages. Returns the message array and a connected flag.
 */
export function useSse<T>(url: string | null) {
  const [messages, setMessages] = useState<T[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const clear = useCallback(() => setMessages([]), []);

  useEffect(() => {
    if (!url) return;

    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (evt) => {
      try {
        const parsed = JSON.parse(evt.data) as T;
        setMessages((prev) => [parsed, ...prev].slice(0, 500));
      } catch {
        // ignore non-JSON heartbeats
      }
    };

    es.onerror = () => {
      setConnected(false);
    };

    return () => {
      es.close();
      esRef.current = null;
      setConnected(false);
    };
  }, [url]);

  return { messages, connected, clear } as const;
}
