import { api } from "../api";
import type { ItemStatus, ShelfItem, ShelfStats, ShelfSummary } from "../types";
import { isClassicEtiketCode } from "./etiketFormat";
import { feedbackKindFromScan, showScanFlash, showScanFeedback } from "./scanFeedback";
import { showScanMessage, showScanToast } from "./toast";
import {
  optimisticItemUpdate,
  toastKindFromScan,
  type ScanResponse,
  type ToastKind,
} from "./utils";

type ScanListener = (patch: ScanPatch) => void;

export interface ScanPatch {
  activeShelf?: string;
  shelfChanged?: boolean;
  items?: Record<string, ShelfItem>;
  stats?: ShelfStats;
  shelves?: ShelfSummary[];
  reloadShelf?: string;
}

class ScanQueue {
  private queue: string[] = [];
  private running = false;
  private listeners = new Set<ScanListener>();
  private items = new Map<string, ShelfItem>();
  private sessionActive = false;
  private onCorrectionRefresh: (() => void) | null = null;
  private optimisticFeedback = new Set<string>();
  private lastEnqueue: { code: string; at: number } | null = null;
  /** Barkod okuyucunun aynı etiketi milisaniyeler içinde tekrar göndermesini filtreler */
  private readonly dedupeMs = 450;

  setCorrectionListener(fn: (() => void) | null): void {
    this.onCorrectionRefresh = fn;
  }

  /** @deprecated use setCorrectionListener */
  setMisplacementListener(fn: (() => void) | null): void {
    this.setCorrectionListener(fn);
  }

  setSessionActive(active: boolean): void {
    this.sessionActive = active;
  }

  setShelfData(_shelf: string, items: ShelfItem[]): void {
    this.items.clear();
    for (const item of items) {
      this.items.set(item.line_id, item);
    }
  }

  subscribe(fn: ScanListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(patch: ScanPatch): void {
    for (const fn of this.listeners) fn(patch);
  }

  private updateFirstPendingByEtiket(
    etiket: string,
    updater: (item: ShelfItem) => ShelfItem,
  ): Record<string, ShelfItem> {
    const updates: Record<string, ShelfItem> = {};
    for (const [lineId, item] of this.items) {
      if (item.etiket !== etiket) continue;
      if (item.scanned > 0 && item.status === "complete") continue;
      const updated = updater(item);
      this.items.set(lineId, updated);
      updates[lineId] = updated;
      break;
    }
    return updates;
  }

  private updateByLineId(lineId: string, item: ShelfItem): Record<string, ShelfItem> {
    this.items.set(lineId, item);
    return { [lineId]: item };
  }

  enqueue(rawCode: string): void {
    const code = rawCode.trim();
    if (!code) return;

    const now = Date.now();
    if (
      this.lastEnqueue?.code === code &&
      now - this.lastEnqueue.at < this.dedupeMs
    ) {
      return;
    }
    this.lastEnqueue = { code, at: now };

    if (!this.sessionActive) {
      showScanToast("Sayım oturumu yok", "unknown");
      showScanFlash("error");
      return;
    }

    const hasLocal = [...this.items.values()].some((i) => i.etiket === code);
    if (hasLocal) {
      const pending = this.updateFirstPendingByEtiket(code, optimisticItemUpdate);
      if (Object.keys(pending).length > 0) {
        this.emit({ items: pending });
        showScanToast(code, "normal");
        showScanFlash("success", code);
        this.optimisticFeedback.add(code);
      } else {
        showScanToast(code, "over");
        showScanFlash("error", code);
        return;
      }
    } else if (!isClassicEtiketCode(code)) {
      return;
    }

    this.queue.push(code);
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    while (this.queue.length > 0) {
      const code = this.queue.shift()!;
      try {
        const result = (await api.scan(code)) as ScanResponse;
        this.applyServerResult(result);
      } catch {
        showScanToast(code, "unknown");
        showScanFlash("error", code);
      }
    }
    this.running = false;
  }

  private applyServerResult(result: ScanResponse): void {
    if (result.scan_type === "ignored") return;

    const kind: ToastKind = toastKindFromScan(result);
    if (result.scan_type === "misplaced") {
      showScanMessage(`🟠 ${result.message}`, "misplaced");
    } else if (result.scan_type === "found_missing" || result.found_missing) {
      showScanMessage(`🟧 ${result.message}`, "found_missing");
    } else if (result.scan_type === "unassigned") {
      showScanMessage(`🟡 ${result.message}`, "unassigned");
    } else if (result.scan_type === "unknown") {
      showScanMessage(`🔴 ${result.message}`, "unknown");
    } else {
      showScanToast(result.etiket, kind);
    }

    const hadOptimistic = this.optimisticFeedback.delete(result.etiket);
    if (!hadOptimistic || feedbackKindFromScan(result) === "error") {
      showScanFeedback(result);
    }

    const patch: ScanPatch = {
      activeShelf: result.active_shelf,
      shelfChanged: result.auto_switched_shelf,
      stats: result.shelf_stats,
      shelves: result.shelves_summary,
    };

    if (
      result.scan_type === "misplaced" ||
      result.scan_type === "unassigned" ||
      result.scan_type === "unknown"
    ) {
      this.onCorrectionRefresh?.();
      this.emit(patch);
      return;
    }

    if (result.scan_type === "found_missing" || result.found_missing) {
      this.onCorrectionRefresh?.();
      this.emit(patch);
      return;
    }

    if (result.auto_switched_shelf) {
      patch.reloadShelf = result.active_shelf;
      this.emit(patch);
      return;
    }

    if (result.updated_item) {
      const updated = result.updated_item;
      patch.items = this.updateByLineId(updated.line_id, {
        ...updated,
        status: updated.status as ItemStatus,
      });
    } else {
      const fallback: ShelfItem = {
        line_id: result.etiket,
        etiket: result.etiket,
        expected: result.expected,
        scanned: result.scanned,
        status: result.status as ItemStatus,
        extra: {},
      };
      this.items.set(fallback.line_id, fallback);
      patch.items = { [fallback.line_id]: fallback };
    }

    this.emit(patch);
  }

  reset(): void {
    this.queue = [];
    this.running = false;
    this.items.clear();
    this.sessionActive = false;
    this.optimisticFeedback.clear();
    this.lastEnqueue = null;
  }
}

export const scanQueue = new ScanQueue();

export function resetScanQueue(): void {
  scanQueue.reset();
}

/** Tek merkezi okutma hattı — barkod okuyucu ve manuel giriş buraya bağlanır. */
export function processScan(code: string): void {
  scanQueue.enqueue(code);
}
