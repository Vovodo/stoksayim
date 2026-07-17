import type { ItemStatus, ScanResult, ShelfItem, ShelfStats, ShelfSummary } from "../types";

export type ToastKind = "normal" | "unassigned" | "unknown" | "over" | "misplaced" | "found_missing";

export function toastKindFromScan(r: Pick<ScanResult, "scan_type" | "status" | "found_missing">): ToastKind {
  if (r.scan_type === "found_missing" || r.found_missing) return "found_missing";
  if (r.scan_type === "misplaced") return "misplaced";
  if (r.scan_type === "unknown") return "unknown";
  if (r.scan_type === "unassigned") return "unassigned";
  if (r.status === "over") return "over";
  return "normal";
}

const QTY_EPS = 1e-6;

export function computeStatus(expected: number, scanned: number): ItemStatus {
  if (scanned <= 0) return "pending";
  if (Math.abs(scanned - expected) <= QTY_EPS) return "complete";
  if (scanned < expected - QTY_EPS) return "short";
  return "over";
}

export function optimisticItemUpdate(item: ShelfItem): ShelfItem {
  const scanned = item.scanned <= 0 ? item.expected : item.scanned;
  return { ...item, scanned, status: computeStatus(item.expected, scanned) };
}

export interface ScanResponse extends ScanResult {
  updated_item?: ShelfItem | null;
  shelf_stats?: ShelfStats;
  shelves_summary?: ShelfSummary[];
  found_missing?: boolean;
}
