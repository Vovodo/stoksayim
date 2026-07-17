import { memo } from "react";
import { statusColor, statusLabel, trackingClasses, trackingLabel } from "../hooks";
import { CountTrackingStatus } from "../types";
import type { MisplacementHint } from "../scan/misplacementHints";
import type { ShelfItem } from "../types";

interface Props {
  item: ShelfItem;
  highlight?: boolean;
  misplacement?: MisplacementHint | null;
  canMarkNotFound?: boolean;
  canUnmarkNotFound?: boolean;
  acting?: boolean;
  onMarkNotFound?: () => void;
  onUnmarkNotFound?: () => void;
}

function misplacementClasses(kind: MisplacementHint["kind"] | undefined): string {
  if (kind === "scanned_elsewhere") {
    return "border-orange-500/70 bg-orange-950/25 ring-1 ring-orange-500/30";
  }
  if (kind === "wrongly_here") {
    return "border-amber-500/70 bg-amber-950/25 ring-1 ring-amber-500/30";
  }
  return "";
}

function ShelfItemRowInner({
  item,
  highlight,
  misplacement,
  canMarkNotFound,
  canUnmarkNotFound,
  acting,
  onMarkNotFound,
  onUnmarkNotFound,
}: Props) {
  const subtitle = formatSubtitle(item);
  const mpClass = misplacement ? misplacementClasses(misplacement.kind) : "";
  const trackClass = trackingClasses(item.tracking_status);
  const baseColor = trackClass || statusColor(item.status);
  const trackText = trackingLabel(item.tracking_status);
  const isNotFound = item.tracking_status === CountTrackingStatus.BULUNAMADI;

  return (
    <div
      data-etiket={item.etiket}
      data-line-id={item.line_id}
      className={`flex items-center justify-between gap-2 px-3 py-2 rounded border ${baseColor} ${mpClass}${
        highlight ? " ring-1 ring-white/30" : ""
      }`}
      style={{ contain: "layout style paint" }}
    >
      <div className="min-w-0 flex-1">
        <div className="font-mono text-base font-semibold truncate">{item.etiket}</div>
        {subtitle ? <div className="text-xs text-slate-400 truncate">{subtitle}</div> : null}
        {misplacement ? (
          <div
            className={`text-xs mt-1 font-medium truncate ${
              misplacement.kind === "scanned_elsewhere" ? "text-orange-300" : "text-amber-300"
            }`}
          >
            ⚠ {misplacement.message}
          </div>
        ) : null}
        {trackText ? (
          <div className={`text-xs mt-1 font-semibold ${isNotFound ? "text-red-300" : "text-amber-300"}`}>
            {trackText}
          </div>
        ) : null}
      </div>
      <div className="text-right shrink-0 ml-2 flex flex-col items-end gap-1">
        <div className="text-xs">{trackText || statusLabel(item.status)}</div>
        <div className="font-mono text-sm">
          <span className="font-bold">{item.scanned}</span>
          <span className="text-slate-400">/{item.expected}</span>
        </div>
        {canUnmarkNotFound && onUnmarkNotFound ? (
          <button
            type="button"
            disabled={acting}
            onClick={onUnmarkNotFound}
            className="text-[10px] px-2 py-0.5 rounded border border-slate-600 hover:bg-slate-800/80 text-slate-300 disabled:opacity-40 whitespace-nowrap"
          >
            {acting ? "…" : "Geri al"}
          </button>
        ) : null}
        {canMarkNotFound && onMarkNotFound ? (
          <button
            type="button"
            disabled={acting}
            onClick={onMarkNotFound}
            className="text-[10px] px-2 py-0.5 rounded border border-red-700/60 bg-red-950/40 text-red-200 hover:bg-red-950/60 disabled:opacity-40 whitespace-nowrap"
          >
            {acting ? "…" : "Bulunamadı"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function pickExtra(item: ShelfItem, keys: string[]): string {
  for (const key of keys) {
    const val = item.extra?.[key];
    if (val !== undefined && val !== null && String(val).trim()) {
      return String(val).trim();
    }
  }
  return "";
}

function formatSubtitle(item: ShelfItem): string {
  const stok = pickExtra(item, ["Stok No", "Stok No.", "Stok Kodu", "Stok Kod"]);
  const tanim = pickExtra(item, ["Tanım", "Tanim", "Ürün Adı", "Urun Adi", "Açıklama"]);
  if (stok && tanim) return `${stok} / ${tanim}`;
  return stok || tanim;
}

export const ShelfItemRow = memo(ShelfItemRowInner, (a, b) =>
  a.item.line_id === b.item.line_id &&
  a.item.scanned === b.item.scanned &&
  a.item.status === b.item.status &&
  a.item.tracking_status === b.item.tracking_status &&
  a.highlight === b.highlight &&
  a.misplacement?.message === b.misplacement?.message &&
  a.canMarkNotFound === b.canMarkNotFound &&
  a.canUnmarkNotFound === b.canUnmarkNotFound &&
  a.acting === b.acting
);
