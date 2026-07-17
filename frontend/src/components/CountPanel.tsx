import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { ManualScanInput } from "./ManualScanInput";
import { MisplacedScanCard } from "./MisplacedScanCard";
import { EmptyStatePanel } from "./EmptyStatePanel";
import { ShelfItemRow } from "./ShelfItemRow";
import { scanQueue } from "../scan/scanQueue";
import {
  hintForItem,
  scansOnShelfNotInList,
  shelfCorrectionCount,
} from "../scan/misplacementHints";
import { mountScanFlash } from "../scan/scanFeedback";
import { mountScanToast, showScanMessage, showScanToast } from "../scan/toast";
import { filterShelvesByQuery } from "../utils/shelfLookup";
import { CountTrackingStatus } from "../types";
import type { MisplacementCorrection, ShelfDetail, ShelfItem, ShelfStats, ShelfSummary } from "../types";

interface Props {
  sessionActive: boolean;
  initialShelf: string;
  shelves: ShelfSummary[];
  corrections: MisplacementCorrection[];
  onShelvesUpdate: (s: ShelfSummary[]) => void;
  onRevertCorrection?: (correction: MisplacementCorrection) => Promise<void>;
  revertingCorrectionId?: number | null;
}
function clearShelfView(
  setItems: (v: ShelfItem[]) => void,
  setStats: (v: ShelfStats | null) => void,
  itemsMapRef: React.MutableRefObject<Map<string, ShelfItem>>,
  shelf: string,
) {
  itemsMapRef.current.clear();
  scanQueue.setShelfData(shelf, []);
  setItems([]);
  setStats(null);
}

export function CountPanel({
  sessionActive,
  initialShelf,
  shelves,
  corrections,
  onShelvesUpdate,
  onRevertCorrection,
  revertingCorrectionId = null,
}: Props) {  const [activeShelf, setActiveShelf] = useState(initialShelf);
  const [items, setItems] = useState<ShelfItem[]>([]);
  const [stats, setStats] = useState<ShelfStats | null>(null);
  const [loadingShelf, setLoadingShelf] = useState(false);
  const [highlight, setHighlight] = useState<string>("");
  const [shelfQuery, setShelfQuery] = useState("");
  const [actingLineId, setActingLineId] = useState<string | null>(null);
  const itemsMapRef = useRef<Map<string, ShelfItem>>(new Map());
  const highlightTimer = useRef<ReturnType<typeof setTimeout>>();
  const userPickedShelf = useRef(false);
  const loadSeq = useRef(0);
  const activeShelfRef = useRef(activeShelf);
  activeShelfRef.current = activeShelf;

  const loadShelf = useCallback(async (shelf: string) => {
    if (!shelf) return;
    const seq = ++loadSeq.current;
    setLoadingShelf(true);
    try {
      const detail: ShelfDetail = await api.shelf(shelf);
      if (seq !== loadSeq.current) return;

      itemsMapRef.current.clear();
      for (const it of detail.items) itemsMapRef.current.set(it.line_id, it);
      scanQueue.setShelfData(shelf, detail.items);
      setActiveShelf(shelf);
      setItems(detail.items);
      setStats(detail.stats);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      clearShelfView(setItems, setStats, itemsMapRef, shelf);
      const msg = err instanceof Error ? err.message : "Raf yüklenemedi";
      showScanToast(msg, "unknown");
    } finally {
      if (seq === loadSeq.current) setLoadingShelf(false);
    }
  }, []);

  useLayoutEffect(() => {
    scanQueue.setSessionActive(sessionActive);
  }, [sessionActive]);

  useEffect(() => {
    mountScanToast();
    mountScanFlash();
  }, []);

  useEffect(() => {
    if (userPickedShelf.current) return;
    if (initialShelf) void loadShelf(initialShelf);
  }, [initialShelf, loadShelf]);

  useEffect(() => {
    const unsub = scanQueue.subscribe((patch) => {
      if (patch.shelves) onShelvesUpdate(patch.shelves);

      if (patch.reloadShelf) {
        userPickedShelf.current = false;
        clearShelfView(setItems, setStats, itemsMapRef, patch.reloadShelf);
        setActiveShelf(patch.reloadShelf);
        void loadShelf(patch.reloadShelf);
        return;
      }

      if (patch.activeShelf && patch.activeShelf !== activeShelfRef.current) {
        userPickedShelf.current = false;
        clearShelfView(setItems, setStats, itemsMapRef, patch.activeShelf);
        setActiveShelf(patch.activeShelf);
        void loadShelf(patch.activeShelf);
        return;
      }

      if (patch.stats) setStats(patch.stats);

      if (patch.items) {
        const entries = Object.entries(patch.items);
        if (entries.length === 0) return;
        for (const [lineId, updated] of entries) {
          itemsMapRef.current.set(lineId, updated);
        }
        setItems((prev) => {
          const next = prev.slice();
          for (const [lineId, updated] of entries) {
            const idx = next.findIndex((i) => i.line_id === lineId);
            if (idx >= 0) next[idx] = updated;
          }
          return next;
        });
        setHighlight(entries[0][1].etiket);
        if (highlightTimer.current) clearTimeout(highlightTimer.current);
        highlightTimer.current = setTimeout(() => setHighlight(""), 300);
      }
    });
    return unsub;
  }, [loadShelf, onShelvesUpdate]);

  const selectShelf = useCallback(
    (shelf: string, options?: { fromInput?: boolean }) => {
      userPickedShelf.current = true;
      setActiveShelf(shelf);
      clearShelfView(setItems, setStats, itemsMapRef, shelf);
      void loadShelf(shelf);
      if (sessionActive) {
        void api.activateShelf(shelf).catch(() => {});
      }
      if (options?.fromInput) {
        showScanMessage(`📂 ${shelf} rafı açıldı`, "normal");
      }
    },
    [loadShelf, sessionActive],
  );

  const filteredShelves = useMemo(
    () => filterShelvesByQuery(shelves, shelfQuery),
    [shelves, shelfQuery],
  );

  const orphanedScans = useMemo(
    () => scansOnShelfNotInList(activeShelf, items, corrections),
    [activeShelf, items, corrections],
  );

  const totalProgress = useMemo(() => {
    const expected = shelves.reduce((sum, s) => sum + s.total_expected, 0);
    const scanned = shelves.reduce((sum, s) => sum + s.total_scanned, 0);
    if (expected <= 0) return shelves.length === 0 ? 0 : 100;
    return Math.round((scanned / expected) * 1000) / 10;
  }, [shelves]);

  const markOneNotFound = useCallback(
    async (lineId: string) => {
      if (!activeShelf || !sessionActive) return;
      setActingLineId(lineId);
      try {
        await api.markNotFound(activeShelf, [lineId]);
        await loadShelf(activeShelf);
        const sh = await api.shelves().catch(() => shelves);
        onShelvesUpdate(sh);
        showScanMessage("Ürün bulunamadı olarak işaretlendi", "unknown");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "İşaretleme başarısız";
        showScanToast(msg, "unknown");
      } finally {
        setActingLineId(null);
      }
    },
    [activeShelf, sessionActive, loadShelf, shelves, onShelvesUpdate],
  );

  const unmarkOneNotFound = useCallback(
    async (lineId: string) => {
      if (!sessionActive) return;
      setActingLineId(lineId);
      try {
        await api.unmarkNotFound(lineId);
        if (activeShelf) await loadShelf(activeShelf);
        const sh = await api.shelves().catch(() => shelves);
        onShelvesUpdate(sh);
        showScanMessage("Bulunamadı işareti geri alındı", "normal");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Geri alma başarısız";
        showScanToast(msg, "unknown");
      } finally {
        setActingLineId(null);
      }
    },
    [activeShelf, sessionActive, loadShelf, shelves, onShelvesUpdate],
  );

  const isMarkable = useCallback(
    (item: ShelfItem) =>
      sessionActive &&
      item.scanned <= 0 &&
      item.tracking_status !== CountTrackingStatus.BULUNAMADI,
    [sessionActive],
  );

  const isUnmarkable = useCallback(
    (item: ShelfItem) =>
      sessionActive && item.tracking_status === CountTrackingStatus.BULUNAMADI,
    [sessionActive],
  );

  return (    <main className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
      <ManualScanInput
        sessionActive={sessionActive}
        shelves={shelves.map((s) => s.shelf)}
        onShelfSelect={(shelf) => selectShelf(shelf, { fromInput: true })}
      />

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[200px_1fr_220px] gap-0 min-h-0 overflow-hidden">
        <aside className="min-h-0 overflow-y-auto overscroll-contain border-r border-slate-800">
          <div className="sticky top-0 z-10 bg-slate-950 border-b border-slate-800/50">
            <div className="px-2 pt-2 pb-1 text-xs uppercase tracking-wide text-slate-500">
              Raflar
              {shelfQuery.trim() && shelves.length > 0 ? (
                <span className="normal-case text-slate-600 ml-1">
                  ({filteredShelves.length}/{shelves.length})
                </span>
              ) : null}
            </div>
            {shelves.length > 0 && (
              <div className="px-2 pb-2">
                <input
                  type="search"
                  value={shelfQuery}
                  onChange={(e) => setShelfQuery(e.target.value)}
                  placeholder="Raf ara…"
                  aria-label="Raf ara"
                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-sm font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/70 focus:ring-1 focus:ring-blue-500/30"
                />
              </div>
            )}
          </div>
          {shelves.length === 0 && (
            <EmptyStatePanel className="px-2 py-8">
              <p className="text-xs text-slate-500">
                Excel yüklenmemiş veya sistem sıfırlandı. Yönetim sekmesinden Excel yükleyin.
              </p>
            </EmptyStatePanel>
          )}
          {shelves.length > 0 && filteredShelves.length === 0 && (
            <EmptyStatePanel className="px-2 py-6">
              <p className="text-xs text-slate-500">“{shelfQuery}” ile eşleşen raf yok.</p>
            </EmptyStatePanel>
          )}
          {filteredShelves.map((s) => {
            const warnCount = shelfCorrectionCount(s.shelf, corrections);
            return (
            <button
              key={s.shelf}
              type="button"
              onClick={() => selectShelf(s.shelf)}
              className={`w-full text-left px-2 py-1.5 border-b border-slate-800/50 text-sm cursor-pointer hover:bg-slate-800/60 ${
                activeShelf === s.shelf ? "bg-blue-900/40 border-l-2 border-l-blue-500" : ""
              } ${warnCount > 0 && activeShelf !== s.shelf ? "border-l-2 border-l-orange-600/50" : ""}`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="font-medium">{s.shelf}</span>
                {warnCount > 0 ? (
                  <span className="text-[10px] text-orange-400 font-semibold shrink-0" title="Raf uyumsuzluğu">
                    ⚠{warnCount}
                  </span>
                ) : null}
              </div>
              <div className="text-xs text-slate-400">
                {s.completed_etikets}/{s.total_etikets} · %{s.completion_pct}
              </div>
            </button>
            );
          })}        </aside>

        <section className="min-h-0 overflow-y-auto overscroll-contain p-3">
          <div className="mb-2">
            <h2 className="text-xl font-bold">{activeShelf || "—"}</h2>
            {stats && (
              <p className="text-xs text-slate-400">
                {stats.completed_etikets}/{stats.total_etikets} etiket · %{stats.completion_pct}
              </p>
            )}
          </div>
          <div className="grid gap-1">
            {orphanedScans.length > 0 && (
              <div className="mb-2 space-y-1">
                <p className="text-xs text-orange-400 font-semibold uppercase tracking-wide px-1">
                  Bu rafta tespit edilen anomaliler
                </p>
                {orphanedScans.map((c) => (
                  <MisplacedScanCard
                    key={`orphan-${c.id}`}
                    correction={c}
                    compact
                    onRevert={onRevertCorrection}
                    reverting={revertingCorrectionId === c.id}
                  />
                ))}
              </div>
            )}
            {loadingShelf && !items.length && !orphanedScans.length && (
              <EmptyStatePanel>
                <p className="text-slate-500 text-sm">Raf yükleniyor…</p>
              </EmptyStatePanel>
            )}
            {items.map((item) => (
              <ShelfItemRow
                key={item.line_id}
                item={item}
                highlight={highlight === item.etiket}
                misplacement={hintForItem(item.etiket, activeShelf, corrections)}
                canMarkNotFound={isMarkable(item)}
                canUnmarkNotFound={isUnmarkable(item)}
                acting={actingLineId === item.line_id}
                onMarkNotFound={() => void markOneNotFound(item.line_id)}
                onUnmarkNotFound={() => void unmarkOneNotFound(item.line_id)}
              />
            ))}
            {!loadingShelf && !items.length && !orphanedScans.length && (
              <EmptyStatePanel>
                <p className="text-slate-500 text-sm">Bu rafta ürün yok.</p>
              </EmptyStatePanel>
            )}
          </div>        </section>

        <aside className="min-h-0 overflow-y-auto overscroll-contain border-l border-slate-800 p-3 text-sm flex flex-col">
          <h3 className="text-xs font-semibold text-slate-400 mb-2">RAF ÖZETİ</h3>
          {stats ? (
            <dl className="space-y-0.5 text-xs">
              <div className="flex justify-between">
                <dt>Etiket</dt>
                <dd>{stats.total_etikets}</dd>
              </div>
              <div className="flex justify-between text-emerald-400">
                <dt>Tamam</dt>
                <dd>{stats.completed_etikets}</dd>
              </div>
              <div className="flex justify-between text-slate-400">
                <dt>Bekleyen</dt>
                <dd>{stats.pending_etikets}</dd>
              </div>
              {(stats.not_found_etikets ?? 0) > 0 && (
                <div className="flex justify-between text-red-400">
                  <dt>Bulunamadı</dt>
                  <dd>{stats.not_found_etikets}</dd>
                </div>
              )}
              <div className="flex justify-between font-semibold text-slate-300 pt-1 border-t border-slate-800">
                <dt>Raf %</dt>
                <dd>{stats.completion_pct}</dd>
              </div>
            </dl>
          ) : null}
        </aside>
      </div>

      {shelves.length > 0 && (
        <div className="shrink-0 border-t border-slate-800 bg-slate-950/95 px-5 py-4 flex justify-end items-end">
          <div className="text-right">
            <p className="text-[11px] font-medium uppercase tracking-widest text-slate-500 mb-1">
              Toplam İlerleme
            </p>
            <p className="text-5xl font-bold tabular-nums leading-none text-blue-400">
              %{totalProgress}
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
