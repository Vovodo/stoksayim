import { memo } from "react";
import type { FoundMissingRecovery, MisplacementCorrection } from "../types";

interface MisplacementProps {
  correction: MisplacementCorrection;
  recovery?: never;
  onRevert?: (correction: MisplacementCorrection) => void;
  reverting?: boolean;
  compact?: boolean;
}

interface RecoveryProps {
  recovery: FoundMissingRecovery;
  correction?: never;
  onRevert?: never;
  reverting?: never;
  compact?: boolean;
}

type Props = MisplacementProps | RecoveryProps;

function MisplacedScanCardInner(props: Props) {
  const { compact = false } = props;

  if (props.recovery) {
    const r = props.recovery;
    const onCorrectShelf = r.final_status === "TEKRAR_BULUNDU";
    const detail = onCorrectShelf
      ? `Bulunamadı işaretliydi — ${r.expected_shelf} rafında tekrar bulundu`
      : `Bulunamadı işaretliydi — ${r.expected_shelf} yerine ${r.found_shelf} rafında bulundu`;
    const when = r.resolved_at || r.marked_at;
    const user = r.resolved_by || r.marked_by;

    return (
      <div className="px-3 py-2 rounded border border-amber-600/50 bg-amber-950/30 text-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="font-mono font-semibold text-slate-100">{r.etiket}</div>
            <div className="text-xs text-amber-200 mt-1">⚠ {detail}</div>
            {!compact ? (
              <>
                <div className="text-[10px] text-slate-500 mt-1">
                  {onCorrectShelf ? "Doğru rafta bulundu" : "Yanlış lokasyonda bulundu"}
                </div>
                <div className="text-[10px] text-slate-500">
                  {when ? new Date(when).toLocaleString("tr-TR") : "—"}
                  {user ? ` · ${user}` : ""}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const { correction, onRevert, reverting = false } = props;
  const isEmptyShelf = correction.status === "Boş raf bilgisi";
  const isUnknown = correction.status === "Raf bulunamadı";

  let detail = "";
  if (isEmptyShelf) {
    detail = `Excel'de raf/depo boş — ${correction.scanned_shelf} rafında okutuldu`;
  } else if (isUnknown) {
    detail = `Excel'de kayıt yok — ${correction.scanned_shelf} rafında okutuldu`;
  } else if (correction.correct_shelf) {
    detail = `${correction.correct_shelf} rafına ait — burada (${correction.scanned_shelf}) yanlış okutuldu`;
  } else {
    detail = `${correction.scanned_shelf} rafında okutuldu`;
  }

  const borderClass = isEmptyShelf
    ? "border-yellow-600/50 bg-yellow-950/30"
    : isUnknown
      ? "border-red-800/50 bg-red-950/30"
      : "border-orange-600/50 bg-orange-950/30";

  return (
    <div className={`px-3 py-2 rounded border text-sm ${borderClass}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-mono font-semibold text-slate-100">{correction.etiket}</div>
          <div className="text-xs text-slate-300 mt-1">⚠ {detail}</div>
          {!compact ? (
            <>
              <div className="text-[10px] text-slate-500 mt-1">{correction.status}</div>
              <div className="text-[10px] text-slate-500">
                {new Date(correction.created_at).toLocaleString("tr-TR")}
                {correction.username ? ` · ${correction.username}` : ""}
              </div>
            </>
          ) : null}
        </div>
        {onRevert ? (
          <button
            type="button"
            disabled={reverting}
            onClick={() => onRevert(correction)}
            className="shrink-0 text-[10px] px-2 py-1 rounded border border-slate-600 hover:bg-slate-800/80 text-slate-300 disabled:opacity-50 whitespace-nowrap"
            title="Bu anomaliyi geri al — kayıt silinir"
          >
            {reverting ? "…" : "Geri al"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export const MisplacedScanCard = memo(MisplacedScanCardInner);
