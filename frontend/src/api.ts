import { apiUrl } from "./config";

const TOKEN_KEY = "depo_sayim_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(apiUrl(path), { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "İstek başarısız");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  login: (username: string, password: string) =>
    request<{ access_token: string; role: string; username: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  register: (username: string, password: string) =>
    request<{ access_token: string; role: string; username: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  me: () => request<{ id: number; username: string; role: string }>("/auth/me"),

  uploadExcel: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<{
      filename: string;
      row_count: number;
      etiket_count: number;
      shelf_count: number;
      unassigned_count: number;
      columns: string[];
      message: string;
    }>("/excel/upload", { method: "POST", body: fd, headers: {} });
  },

  excelInfo: () => request<{ loaded: boolean; [k: string]: unknown }>("/excel/info"),

  startSession: (name?: string) =>
    request<import("./types").Session>("/sessions/start", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  endSession: () =>
    request<{
      message: string;
      report: import("./types").ReportSummary;
      report_filename?: string;
    }>("/sessions/end", {
      method: "POST",
    }),

  activeSession: () => request<import("./types").Session | null>("/sessions/active"),

  scan: (etiket: string) =>
    request<import("./types").ScanResult>("/scan", {
      method: "POST",
      body: JSON.stringify({ etiket }),
    }),

  shelves: () => request<import("./types").ShelfSummary[]>("/shelves"),

  shelf: (shelf: string) =>
    request<import("./types").ShelfDetail>(`/shelves/${encodeURIComponent(shelf)}`),

  activateShelf: (shelf: string) =>
    request<{ active_shelf: string }>(`/shelves/${encodeURIComponent(shelf)}/activate`, {
      method: "POST",
    }),

  unknownItems: () => request<import("./types").UnknownItem[]>("/unknown"),

  unassignedFound: () => request<import("./types").UnassignedFound[]>("/unassigned-found"),

  corrections: () => request<import("./types").MisplacementCorrection[]>("/corrections"),

  revertCorrection: (correctionId: number) =>
    request<void>(`/corrections/${correctionId}`, { method: "DELETE" }),

  markNotFound: (shelf: string, lineIds: string[]) =>
    request<{ marked_count: number; line_ids: string[] }>("/not-found/mark", {
      method: "POST",
      body: JSON.stringify({ shelf, line_ids: lineIds }),
    }),

  unmarkNotFound: (lineId: string) =>
    request<{ line_id: string; etiket: string; shelf: string }>("/not-found/unmark", {
      method: "POST",
      body: JSON.stringify({ line_id: lineId }),
    }),

  notFoundRecoveries: () =>
    request<import("./types").FoundMissingRecovery[]>("/not-found/recoveries"),

  reportSummary: () => request<import("./types").ReportSummary>("/reports/summary"),

  reportFiles: () => request<import("./types").ReportFileInfo[]>("/reports/files"),

  resetSystem: () =>
    request<{ message: string; files_removed: number }>("/admin/reset", { method: "POST" }),

  listUsers: () => request<import("./types").UserListItem[]>("/auth/users"),

  deleteUser: (userId: number) =>
    request<void>(`/auth/users/${userId}`, { method: "DELETE" }),

  resetUserPassword: (userId: number, password: string) =>
    request<{ username: string; password: string; message: string }>(
      `/auth/users/${userId}/password`,
      {
        method: "PATCH",
        body: JSON.stringify({ password }),
      },
    ),

  systemLogs: () => request<import("./types").SystemEvent[]>("/system/logs"),
};
