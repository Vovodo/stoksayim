import { useState } from "react";
import { AppLogo } from "./AppLogo";
import { ScanSoundSettings } from "./ScanSoundSettings";
import type { ExcelInfo } from "../types";

interface ManagePanelProps {
  excelInfo: ExcelInfo;
  uploading: boolean;
  onUploadExcel: (e: React.ChangeEvent<HTMLInputElement>) => void;
  sessionActive: boolean;
  onStartSession: () => Promise<void>;
  onEndSession: () => Promise<void>;
  resetting: boolean;
  resetMessage: string;
  onResetSystem: () => Promise<void>;
}

function StatusPill({
  ok,
  label,
  detail,
}: {
  ok: boolean;
  label: string;
  detail: string;
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-2.5 min-w-0 ${
        ok
          ? "border-emerald-500/30 bg-emerald-500/10"
          : "border-slate-700 bg-slate-800/40"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`h-2 w-2 rounded-full shrink-0 ${ok ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" : "bg-slate-500"}`}
        />
        <span className={`text-xs font-semibold ${ok ? "text-emerald-300" : "text-slate-400"}`}>
          {label}
        </span>
      </div>
      <p className="text-[11px] text-slate-500 mt-1 truncate">{detail}</p>
    </div>
  );
}

function SectionCard({
  icon,
  title,
  description,
  accent = "blue",
  children,
}: {
  icon: string;
  title: string;
  description?: string;
  accent?: "blue" | "emerald" | "red" | "violet";
  children: React.ReactNode;
}) {
  const accentMap = {
    blue: "from-blue-500/15 to-transparent border-blue-500/20",
    emerald: "from-emerald-500/15 to-transparent border-emerald-500/20",
    red: "from-red-500/12 to-transparent border-red-500/25",
    violet: "from-violet-500/15 to-transparent border-violet-500/20",
  };

  return (
    <section
      className={`manage-card rounded-2xl border bg-gradient-to-br ${accentMap[accent]} bg-slate-900/80 backdrop-blur-sm overflow-hidden`}
    >
      <div className="px-5 pt-5 pb-4 border-b border-slate-800/80">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-950/60 border border-slate-700/60 text-lg">
            {icon}
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-slate-100 tracking-tight">{title}</h2>
            {description ? (
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{description}</p>
            ) : null}
          </div>
        </div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function ManagePanel({
  excelInfo,
  uploading,
  onUploadExcel,
  sessionActive,
  onStartSession,
  onEndSession,
  resetting,
  resetMessage,
  onResetSystem,
}: ManagePanelProps) {
  const [sessionBusy, setSessionBusy] = useState(false);

  const handleStart = async () => {
    setSessionBusy(true);
    try {
      await onStartSession();
    } finally {
      setSessionBusy(false);
    }
  };

  const handleEnd = async () => {
    setSessionBusy(true);
    try {
      await onEndSession();
    } finally {
      setSessionBusy(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain manage-page">
      <div className="manage-page__glow pointer-events-none" aria-hidden />

      <div className="relative max-w-3xl mx-auto px-4 py-6 sm:px-6 space-y-6">
        <header className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-400/80">
            Kontrol Merkezi
          </p>
          <h1 className="text-2xl font-bold text-slate-50 tracking-tight">Yönetim</h1>
          <p className="text-sm text-slate-500">
            Excel, sayım oturumu ve sistem ayarlarını buradan yönetin.
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <StatusPill
            ok={excelInfo.loaded}
            label="Excel"
            detail={
              excelInfo.loaded
                ? `${excelInfo.filename ?? "Yüklü"} · ${excelInfo.etiket_count ?? 0} etiket`
                : "Henüz dosya yüklenmedi"
            }
          />
          <StatusPill
            ok={sessionActive}
            label="Sayım"
            detail={sessionActive ? "Oturum aktif — okutma açık" : "Sayım başlatılmadı"}
          />
        </div>

        <SectionCard
          icon="📊"
          title="Excel Yükleme"
          description="Stok listesini .xlsx veya .xls formatında yükleyin."
          accent="blue"
        >
          <div className="space-y-4">
            {excelInfo.loaded ? (
              <div className="rounded-xl bg-slate-950/50 border border-slate-700/60 px-4 py-3">
                <p className="text-xs text-slate-500 uppercase tracking-wide">Aktif dosya</p>
                <p className="text-sm font-medium text-slate-200 mt-1 truncate">
                  {excelInfo.filename}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {excelInfo.etiket_count} etiket · {excelInfo.shelf_count ?? "—"} raf
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                Sayıma başlamadan önce Excel dosyanızı yükleyin.
              </p>
            )}

            <label
              className={`manage-upload flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 cursor-pointer transition-colors ${
                uploading
                  ? "border-blue-500/40 bg-blue-500/5 opacity-70 pointer-events-none"
                  : "border-slate-600 hover:border-blue-500/50 hover:bg-blue-500/5"
              }`}
            >
              <span className="text-2xl">📁</span>
              <span className="text-sm font-medium text-slate-200">
                {uploading ? "Yükleniyor…" : "Dosya seç veya sürükle"}
              </span>
              <span className="text-xs text-slate-500">.xlsx, .xls</span>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={onUploadExcel}
                disabled={uploading}
                className="sr-only"
              />
            </label>
          </div>
        </SectionCard>

        <SectionCard
          icon="▶️"
          title="Sayım Oturumu"
          description="Sayımı başlattıktan sonra okutma ekranı aktif olur."
          accent="emerald"
        >
          {!sessionActive ? (
            <button
              type="button"
              disabled={!excelInfo.loaded || sessionBusy}
              onClick={() => void handleStart()}
              className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 text-white font-semibold py-3 px-4 shadow-lg shadow-blue-900/30 transition-all"
            >
              {sessionBusy ? "Başlatılıyor…" : "Sayım Başlat"}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/25 px-4 py-3 text-sm text-emerald-300">
                Sayım devam ediyor. Bitirdiğinizde rapor otomatik oluşturulur.
              </div>
              <button
                type="button"
                disabled={sessionBusy}
                onClick={() => void handleEnd()}
                className="w-full rounded-xl bg-gradient-to-r from-red-700 to-red-600 hover:from-red-600 hover:to-red-500 disabled:opacity-50 text-white font-semibold py-3 px-4 transition-all"
              >
                {sessionBusy ? "Bitiriliyor…" : "Sayımı Bitir"}
              </button>
            </div>
          )}
        </SectionCard>

        <ScanSoundSettings />

        <SectionCard
          icon="⚠️"
          title="Sistemi Sıfırla"
          description="Excel belleği, oturum, okutma kayıtları ve yüklenen dosyalar silinir."
          accent="red"
        >
          <button
            type="button"
            disabled={resetting}
            onClick={() => void onResetSystem()}
            className="rounded-xl border border-red-500/40 bg-red-950/40 hover:bg-red-900/40 disabled:opacity-50 text-red-300 font-medium py-2.5 px-4 transition-colors"
          >
            {resetting ? "Sıfırlanıyor…" : "Tüm Yapıyı Sıfırla"}
          </button>
          {resetMessage ? (
            <p
              className={`text-xs mt-3 ${resetMessage.includes("başarısız") ? "text-red-400" : "text-emerald-400"}`}
            >
              {resetMessage}
            </p>
          ) : null}
        </SectionCard>

        <section className="manage-card rounded-2xl border border-slate-800 bg-slate-900/60 px-6 py-8 text-center">
          <AppLogo size="2xl" className="justify-center mx-auto mb-4" />
          <h2 className="font-semibold text-slate-200">Depo Sayım Sistemi</h2>
          <p className="text-xs text-slate-500 mt-2 max-w-sm mx-auto leading-relaxed">
            Excel tabanlı raf envanteri, barkod okutma ve anlık raporlama.
          </p>
          <p className="text-[10px] text-slate-600 mt-3">Sürüm 1.0</p>
        </section>
      </div>
    </div>
  );
}
