/**
 * API / WebSocket adresleri.
 * Render (tek servis): boş bırakın — aynı domain (/api, /ws).
 * Ayrı frontend host: VITE_API_URL ayarlayın.
 */
function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getApiBaseUrl(): string {
  return trimSlash(import.meta.env.VITE_API_URL ?? "");
}

export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const withApi = normalized.startsWith("/api") ? normalized : `/api${normalized}`;
  const base = getApiBaseUrl();
  return base ? `${base}${withApi}` : withApi;
}

export function getWsUrl(): string {
  const explicit = import.meta.env.VITE_WS_URL?.trim();
  if (explicit) return trimSlash(explicit);

  const apiBase = getApiBaseUrl();
  if (apiBase) {
    const url = new URL(apiBase);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/ws";
    url.search = "";
    url.hash = "";
    return trimSlash(url.toString());
  }

  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
}

export function isProductionDeploy(): boolean {
  return import.meta.env.PROD;
}
