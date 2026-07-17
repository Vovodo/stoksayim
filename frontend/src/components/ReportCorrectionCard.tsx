import { memo } from "react";
import type { ReportCorrectionEntry } from "../types";

interface Props {
  entry: ReportCorrectionEntry;
  rowNo?: number;
}

function categoryBorder(category: string): string {
  if (category === "Depo boş") return "border-yellow-600/50 bg-yellow-950/30";
  if (category === "Excel'de yok" || category === "Gerçek eksik") {
    return "border-red-800/50 bg-red-950/30";
  }
  if (category === "Yanlış lokasyonda bulundu" || category === "Doğru rafta bulundu") {
    return "border-amber-600/50 bg-amber-950/30";
  }
  return "border-orange-600/50 bg-orange-950/30";
}

function ReportCorrectionCardInner({ entry, rowNo }: Props) {
  return (
    <div className={`px-3 py-2 rounded border text-sm ${categoryBorder(entry.category)}`}>
      <div className="flex items-start gap-2">
        {rowNo != null ? (
          <span className="text-[10px] text-slate-500 font-mono shrink-0 pt-0.5">#{rowNo}</span>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="font-mono font-semibold text-slate-100">{entry.etiket}</div>
          <div className="text-xs text-slate-300 mt-1">⚠ {entry.message}</div>
          <div className="text-[10px] text-slate-500 mt-1">{entry.category}</div>
          {(entry.expected_shelf || entry.found_shelf) && (
            <div className="text-[10px] text-slate-500 mt-0.5">
              {entry.expected_shelf ? `Beklenen: ${entry.expected_shelf}` : null}
              {entry.expected_shelf && entry.found_shelf ? " · " : null}
              {entry.found_shelf ? `Bulunan: ${entry.found_shelf}` : null}
            </div>
          )}
          <div className="text-[10px] text-slate-500 mt-0.5">
            {entry.created_at ? new Date(entry.created_at).toLocaleString("tr-TR") : "—"}
            {entry.username ? ` · ${entry.username}` : ""}
          </div>
        </div>
      </div>
    </div>
  );
}

export const ReportCorrectionCard = memo(ReportCorrectionCardInner);
