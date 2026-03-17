import { useEffect, useCallback, useRef } from "react";
import type { WSEvent, WSCommand } from "@prism/shared";

const WS_URL = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`;

// ── Singleton WebSocket connection ──────────────────────────────────
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<(event: WSEvent) => void>();

function ensureConnection() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log("[ws] connected");
  };

  ws.onmessage = (msg) => {
    try {
      const event: WSEvent = JSON.parse(msg.data);
      if (event.type === "ping") {
        ws?.send(JSON.stringify({ type: "pong" }));
        return;
      }
      for (const listener of listeners) {
        listener(event);
      }
    } catch {
      console.error("[ws] invalid message");
    }
  };

  ws.onclose = () => {
    console.log("[ws] disconnected, reconnecting in 3s...");
    ws = null;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(ensureConnection, 3000);
  };
}

function sendCommand(command: WSCommand) {
  ws?.send(JSON.stringify(command));
}

// ── Hook ────────────────────────────────────────────────────────────
export function useWebSocket(onEvent?: (event: WSEvent) => void) {
  // Store the latest callback in a ref so we never re-subscribe
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;

  useEffect(() => {
    // Stable listener that always calls the latest callback
    const handler = (event: WSEvent) => {
      callbackRef.current?.(event);
    };

    listeners.add(handler);
    ensureConnection();

    return () => {
      listeners.delete(handler);
    };
  }, []); // Empty deps — only runs once per mount

  const send = useCallback((command: WSCommand) => {
    sendCommand(command);
  }, []);

  return { send };
}
