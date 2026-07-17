import { useEffect, useRef } from "react";
import { getWsUrl } from "./config";

export function useWebSocket(onMessage: (event: string, data: unknown) => void) {
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (cancelled) return;
      ws = new WebSocket(getWsUrl());

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          handlerRef.current(msg.event, msg.data);
        } catch {
          /* ignore */
        }
      };

      ws.onclose = () => {
        if (!cancelled) {
          retryTimer = setTimeout(connect, 3000);
        }
      };
    };

    connect();

    const ping = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) ws.send("ping");
    }, 30000);

    return () => {
      cancelled = true;
      clearInterval(ping);
      if (retryTimer) clearTimeout(retryTimer);
      ws?.close();
    };
  }, []);
}

export function statusColor(status: string): string {
  switch (status) {
    case "complete":
      return "bg-emerald-600/20 border-emerald-500 text-emerald-300";
    case "short":
      return "bg-amber-500/20 border-amber-400 text-amber-200";
    case "over":
      return "bg-red-600/25 border-red-500 text-red-300";
    default:
      return "bg-slate-700/40 border-slate-600 text-slate-300";
  }
}

export function statusLabel(status: string): string {
  switch (status) {
    case "complete":
      return "Tamam";
    case "short":
      return "Eksik";
    case "over":
      return "Fazla";
    default:
      return "Bekliyor";
  }
}

export function trackingClasses(tracking?: string | null): string {
  if (tracking === "BULUNAMADI") {
    return "bg-red-950/40 border-red-500/80 text-red-200";
  }
  if (tracking === "SONRADAN_BULUNDU" || tracking === "TEKRAR_BULUNDU") {
    return "bg-amber-950/35 border-amber-500/70 text-amber-100";
  }
  return "";
}

export function trackingLabel(tracking?: string | null): string | null {
  if (tracking === "BULUNAMADI") return "Bulunamadı";
  if (tracking === "SONRADAN_BULUNDU") return "Sonradan bulundu";
  if (tracking === "TEKRAR_BULUNDU") return "Tekrar bulundu";
  return null;
}
