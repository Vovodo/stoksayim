import { useCallback, useEffect, useMemo, useState } from "react";

import { api, clearToken, getToken, setToken } from "./api";
import { apiUrl } from "./config";

import { CountPanel } from "./components/CountPanel";
import { ReportCorrectionCard } from "./components/ReportCorrectionCard";
import { MisplacedScanCard } from "./components/MisplacedScanCard";
import { AppLogo } from "./components/AppLogo";
import { EmptyStatePanel } from "./components/EmptyStatePanel";
import { LoginScreen } from "./components/LoginScreen";
import { ManagePanel } from "./components/ManagePanel";
import { UsersAdminPanel } from "./components/UsersAdminPanel";
import { SplashScreen } from "./components/SplashScreen";

import { useWebSocket } from "./hooks";

import { resetScanQueue, scanQueue } from "./scan/scanQueue";
import { resetEtiketFormat, setEtiketFormatFromMeta } from "./scan/etiketFormat";

import type {
  ExcelInfo,
  FoundMissingRecovery,
  MisplacementCorrection,
  ReportSummary,
  ReportFileInfo,
  Session,
  ShelfSummary,
  SystemEvent,
  User,
  UserListItem,
} from "./types";

type Tab = "count" | "corrections" | "reports" | "logs" | "manage" | "users";

type CorrectionEntry =
  | { kind: "misplacement"; key: string; at: string; data: MisplacementCorrection }
  | { kind: "recovery"; key: string; at: string; data: FoundMissingRecovery };

const ACTION_LABELS: Record<string, string> = {
  excel_upload: "Excel Yükleme",
  session_start: "Sayım Başlatma",
  session_end: "Sayım Bitirme",
  system_reset: "Sistem Sıfırlama",
  user_delete: "Kullanıcı Silme",
  not_found_mark: "Bulunamadı İşaretleme",
  not_found_unmark: "Bulunamadı Geri Alma",
  not_found_recovery: "Bulunamadı Ürün Bulundu",
  user_password_reset: "Şifre Sıfırlama",
};



function isActiveSession(session: Session | null): boolean {

  return session?.status === "active";

}



export default function App() {

  const [user, setUser] = useState<User | null>(null);

  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [loginMode, setLoginMode] = useState<"login" | "register">("login");
  const [loginError, setLoginError] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);

  const [session, setSession] = useState<Session | null>(null);

  const [excelInfo, setExcelInfo] = useState<ExcelInfo>({ loaded: false });

  const [shelves, setShelves] = useState<ShelfSummary[]>([]);

  const [activeShelf, setActiveShelf] = useState<string>("");

  const [tab, setTab] = useState<Tab>("count");

  const [corrections, setCorrections] = useState<MisplacementCorrection[]>([]);
  const [recoveries, setRecoveries] = useState<FoundMissingRecovery[]>([]);
  const [recoveryFilter, setRecoveryFilter] = useState("");

  const [report, setReport] = useState<ReportSummary | null>(null);
  const [reportFiles, setReportFiles] = useState<ReportFileInfo[]>([]);

  const [reportLoading, setReportLoading] = useState(false);

  const [uploading, setUploading] = useState(false);

  const [resetting, setResetting] = useState(false);

  const [resetMessage, setResetMessage] = useState("");
  const [showSplash, setShowSplash] = useState(true);
  const [systemLogs, setSystemLogs] = useState<SystemEvent[]>([]);
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [revertingCorrectionId, setRevertingCorrectionId] = useState<number | null>(null);



  const sessionActive = isActiveSession(session);

  const filteredCorrectionEntries = useMemo(() => {
    const q = recoveryFilter.trim().toLowerCase();
    const entries: CorrectionEntry[] = [
      ...corrections.map((c) => ({
        kind: "misplacement" as const,
        key: `m-${c.id}`,
        at: c.created_at,
        data: c,
      })),
      ...recoveries.map((r) => ({
        kind: "recovery" as const,
        key: `r-${r.id}`,
        at: r.resolved_at || r.marked_at,
        data: r,
      })),
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    if (!q) return entries;

    return entries.filter((entry) => {
      if (entry.kind === "misplacement") {
        const c = entry.data;
        return (
          c.etiket.toLowerCase().includes(q) ||
          (c.correct_shelf || "").toLowerCase().includes(q) ||
          c.scanned_shelf.toLowerCase().includes(q) ||
          c.status.toLowerCase().includes(q) ||
          c.username.toLowerCase().includes(q)
        );
      }
      const r = entry.data;
      return (
        r.etiket.toLowerCase().includes(q) ||
        r.stok_no.toLowerCase().includes(q) ||
        r.product_name.toLowerCase().includes(q) ||
        r.expected_shelf.toLowerCase().includes(q) ||
        r.found_shelf.toLowerCase().includes(q) ||
        r.marked_by.toLowerCase().includes(q) ||
        r.resolved_by.toLowerCase().includes(q)
      );
    });
  }, [corrections, recoveries, recoveryFilter]);

  const correctionTabCount = corrections.length + recoveries.length;



  const clearClientState = useCallback(() => {
    resetScanQueue();
    resetEtiketFormat();
    setSession(null);

    setExcelInfo({ loaded: false });

    setShelves([]);

    setActiveShelf("");

    setCorrections([]);

    setRecoveries([]);

    setReport(null);

  }, []);



  const refreshMeta = useCallback(async () => {

    const [s, info] = await Promise.all([api.activeSession(), api.excelInfo()]);

    setSession(s);
    setExcelInfo(info as ExcelInfo);
    scanQueue.setSessionActive(isActiveSession(s));

    if (info.loaded) {
      setEtiketFormatFromMeta(info as ExcelInfo);
    } else {
      resetEtiketFormat();
    }

    if (!info.loaded) {
      setShelves([]);
      setActiveShelf("");
      setCorrections([]);
      return;
    }

    const sh = await api.shelves().catch(() => []);
    setShelves(sh);
    const shelf = s?.active_shelf || sh[0]?.shelf || "";
    setActiveShelf(shelf);
    api.corrections().then(setCorrections).catch(() => {});
    api.notFoundRecoveries().then(setRecoveries).catch(() => {});

  }, []);



  const loadReport = useCallback(async () => {
    setReportLoading(true);
    try {
      const [r, files] = await Promise.all([
        api.reportSummary().catch(() => null),
        api.reportFiles().catch(() => [] as ReportFileInfo[]),
      ]);
      setReport(r);
      setReportFiles(files);
    } finally {
      setReportLoading(false);
    }
  }, []);

  const loadSystemLogs = useCallback(async () => {
    const logs = await api.systemLogs().catch(() => []);
    setSystemLogs(logs);
  }, []);

  const loadUsers = useCallback(async () => {
    const list = await api.listUsers().catch(() => []);
    setUsers(list);
  }, []);

  const revertCorrection = useCallback(
    async (correction: MisplacementCorrection) => {
      const label = `${correction.etiket} (${correction.status})`;
      if (
        !window.confirm(
          `"${label}" anomalisini geri almak istiyor musunuz?\n\nKayıt silinir; ilgili hatalı okutma iptal edilmiş sayılır.`,
        )
      ) {
        return;
      }
      setRevertingCorrectionId(correction.id);
      try {
        await api.revertCorrection(correction.id);
        const [list, sh] = await Promise.all([
          api.corrections(),
          api.shelves().catch(() => [] as ShelfSummary[]),
        ]);
        setCorrections(list);
        setShelves(sh);
      } finally {
        setRevertingCorrectionId(null);
      }
    },
    [],
  );



  useEffect(() => {
    const timer = window.setTimeout(() => setShowSplash(false), 900);
    return () => window.clearTimeout(timer);
  }, []);



  useEffect(() => {

    if (getToken()) {

      api.me().then((u) => setUser({ ...u, role: u.role as User["role"] })).catch(() => clearToken());

    }

  }, []);



  useEffect(() => {

    if (user) void refreshMeta();

  }, [user, refreshMeta]);



  useEffect(() => {

    scanQueue.setCorrectionListener(() => {

      void api.corrections().then(setCorrections).catch(() => {});
      void api.notFoundRecoveries().then(setRecoveries).catch(() => {});

    });

    return () => scanQueue.setCorrectionListener(null);

  }, []);



  useEffect(() => {

    if (!user) return;

    if (tab === "corrections") {

      void api.corrections().then(setCorrections).catch(() => setCorrections([]));
      void api.notFoundRecoveries().then(setRecoveries).catch(() => setRecoveries([]));

    }

    if (tab === "reports") void loadReport();
    if (tab === "logs") void loadSystemLogs();
    if (tab === "users") void loadUsers();
  }, [user, tab, loadReport, loadSystemLogs, loadUsers]);



  useWebSocket((event, data) => {

    const d = data as Record<string, unknown>;

    if (event === "session_started") {

      setSession(d as unknown as Session);

      scanQueue.setSessionActive(true);

    }

    if (event === "session_ended" || event === "system_reset") {

      setSession(null);

      scanQueue.setSessionActive(false);

      if (event === "system_reset") clearClientState();

    }

    if (event === "shelf_activated" && tab !== "count") {

      setActiveShelf(d.shelf as string);

    }

    if (event === "misplacement" || event === "correction") {

      const list = d.corrections as MisplacementCorrection[] | undefined;

      if (list) setCorrections(list);

    }

    if (event === "found_missing") {
      const list = d.recoveries as FoundMissingRecovery[] | undefined;
      if (list) setRecoveries(list);
    }

    if (event === "shelves_updated") {
      const sh = d.shelves as ShelfSummary[] | undefined;
      if (sh) setShelves(sh);
    }

  });



  const authenticate = async (mode: "login" | "register") => {
    const fn = mode === "login" ? api.login : api.register;
    const res = await fn(loginForm.username, loginForm.password);
    setToken(res.access_token);
    const me = await api.me();
    setUser({ ...me, role: me.role as User["role"] });
    setLoginError("");
  };

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthSubmitting(true);
    try {
      await authenticate(loginMode);
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : "İşlem başarısız");
    } finally {
      setAuthSubmitting(false);
    }
  };



  const uploadExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {

    const file = e.target.files?.[0];

    if (!file) return;

    setUploading(true);

    try {

      await api.uploadExcel(file);
      await refreshMeta();
      void loadSystemLogs();

    } finally {

      setUploading(false);

    }

  };



  const downloadReport = async (type: "excel" | "pdf") => {

    const path = type === "excel" ? "/reports/export/excel" : "/reports/export/pdf";

    const res = await fetch(apiUrl(path), {

      headers: { Authorization: `Bearer ${getToken()}` },

    });

    if (!res.ok) return;

    const blob = await res.blob();

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = url;

    a.download =

      res.headers.get("content-disposition")?.split("filename=")[1]?.replace(/"/g, "") ||

      `rapor.${type === "excel" ? "xlsx" : "pdf"}`;

    a.click();

    URL.revokeObjectURL(url);

  };

  const downloadSavedReport = async (filename: string) => {
    const res = await fetch(apiUrl(`/reports/download/${encodeURIComponent(filename)}`), {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };



  if (showSplash) {
    return <SplashScreen />;
  }

  if (!user) {
    return (
      <LoginScreen
        mode={loginMode}
        onModeChange={(m) => {
          setLoginMode(m);
          setLoginError("");
        }}
        username={loginForm.username}
        password={loginForm.password}
        onUsernameChange={(v) => setLoginForm((f) => ({ ...f, username: v }))}
        onPasswordChange={(v) => setLoginForm((f) => ({ ...f, password: v }))}
        error={loginError}
        onSubmit={login}
        submitting={authSubmitting}
      />
    );
  }



  const isAdmin = user.role === "admin";



  return (

    <div className="h-full flex flex-col overflow-hidden">

      <header className="shrink-0 border-b border-slate-800 bg-slate-900/80 px-3 py-2 flex items-center justify-between gap-2">

        <div className="flex items-center gap-2 min-w-0">
          <AppLogo size="xs" showText subtitle="Envanter Sayım" textClassName="text-sm" />
          <span className="text-slate-500 hidden sm:inline">·</span>
          <span className="text-slate-400 text-xs truncate hidden sm:inline">
            {user.username} · {sessionActive ? session?.name : "Oturum yok"}
          </span>
        </div>

        <div className="flex gap-1 flex-wrap justify-end">

          {(["count", "corrections", "reports", "logs", "manage"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              tabIndex={-1}
              onClick={() => setTab(t)}
              className={`px-2 py-1 rounded text-xs ${tab === t ? "bg-blue-600" : "bg-slate-800"}`}
            >
              {t === "count"
                ? "Sayım"
                : t === "corrections"
                  ? `Düzeltmeler${correctionTabCount ? ` (${correctionTabCount})` : ""}`
                  : t === "reports"
                    ? "Rapor"
                    : t === "logs"
                      ? "Geçmiş"
                      : "Yönetim"}
            </button>
          ))}
          {isAdmin && (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setTab("users")}
              className={`px-2 py-1 rounded text-xs ${tab === "users" ? "bg-blue-600" : "bg-slate-800"}`}
            >
              Kullanıcılar
            </button>
          )}

          <button

            type="button"

            tabIndex={-1}

            onClick={() => {

              clearToken();

              setUser(null);

            }}

            className="px-2 py-1 rounded text-xs bg-slate-800"

          >

            Çıkış

          </button>

        </div>

      </header>



      {tab === "count" && (

        <CountPanel

          key={excelInfo.loaded ? String(excelInfo.filename) : "no-excel"}

          sessionActive={sessionActive}

          initialShelf={activeShelf}

          shelves={shelves}

          corrections={corrections}

          onShelvesUpdate={setShelves}

          onRevertCorrection={revertCorrection}

          revertingCorrectionId={revertingCorrectionId}

        />

      )}



      {tab === "corrections" && (

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 text-sm">

          <h2 className="font-bold mb-2">Düzeltmeler</h2>
          <p className="text-xs text-slate-500 mb-3">
            Raf uyumsuzlukları, bulunamadı sonrası bulunan ürünler ve diğer anomaliler.
          </p>
          <input
            type="search"
            value={recoveryFilter}
            onChange={(e) => setRecoveryFilter(e.target.value)}
            placeholder="Etiket, raf, durum veya kullanıcı ara…"
            className="w-full max-w-md mb-4 bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm"
          />

          {filteredCorrectionEntries.length === 0 ? (

            <EmptyStatePanel>

              <p className="text-slate-500">Henüz kayıt yok.</p>

            </EmptyStatePanel>

          ) : (

            <ul className="space-y-2 max-w-3xl">

              {filteredCorrectionEntries.map((entry) =>
                entry.kind === "misplacement" ? (
                  <li key={entry.key}>
                    <MisplacedScanCard
                      correction={entry.data}
                      onRevert={revertCorrection}
                      reverting={revertingCorrectionId === entry.data.id}
                    />
                  </li>
                ) : (
                  <li key={entry.key}>
                    <MisplacedScanCard recovery={entry.data} />
                  </li>
                ),
              )}

            </ul>

          )}

        </div>

      )}



      {tab === "reports" && (

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-4 text-sm">

          {reportLoading ? (

            <p className="text-slate-400">Rapor yükleniyor…</p>

          ) : !report ? (

            <EmptyStatePanel>

              <h2 className="font-bold text-slate-300 mb-2">Sayım Raporu</h2>

              <p className="text-slate-500 text-sm">Henüz rapor yok. Sayımı bitirdiğinizde özet burada görünür.</p>

            </EmptyStatePanel>

          ) : (

            <>

              <div className="flex items-start justify-between gap-4 flex-wrap">

                <div>

                  <h2 className="font-bold text-lg">Rapor — {report.session_name}</h2>

                  <p className="text-slate-400 text-xs mt-1">

                    Süre: {report.duration_minutes} dk · Performans: %{report.performance_pct}

                    {report.report_filename ? (
                      <span className="block mt-1 font-mono text-emerald-400/90">
                        Dosya: {report.report_filename}
                      </span>
                    ) : null}

                  </p>

                </div>

                <div className="flex gap-2">

                  <button type="button" tabIndex={-1} onClick={() => downloadReport("excel")} className="bg-emerald-700 hover:bg-emerald-600 px-3 py-1.5 rounded text-sm">

                    Excel İndir

                  </button>

                  <button type="button" tabIndex={-1} onClick={() => downloadReport("pdf")} className="bg-red-800 hover:bg-red-700 px-3 py-1.5 rounded text-sm">

                    PDF İndir

                  </button>

                </div>

              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2">

                {[

                  ["Tam", report.complete_count, "text-emerald-400"],

                  ["Eksik", report.short_count, "text-yellow-400"],

                  ["Fazla", report.over_count, "text-orange-400"],

                  ["Bekleyen", report.pending_count, "text-slate-400"],

                  ["Düzeltme", report.corrections_count, "text-red-400"],

                  ["Bulunamadı", report.not_found_count, "text-red-300"],

                  ["Sonradan Bulunan", report.found_after_missing_count, "text-amber-400"],

                  ["Yanlış Lokasyon", report.wrong_location_found_count, "text-orange-400"],

                  ["Gerçek Eksik", report.real_missing_count, "text-yellow-300"],

                  ["Lokasyon Hatası", report.location_error_count, "text-orange-300"],

                ].map(([label, val, color]) => (

                  <div key={String(label)} className="bg-slate-900 border border-slate-700 rounded p-3">

                    <div className="text-xs text-slate-400">{label}</div>

                    <div className={`text-xl font-bold ${color}`}>{val}</div>

                  </div>

                ))}

              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">

                {[

                  ["Toplam Etiket", report.total_etikets],

                  ["Beklenen Miktar", Math.round(report.total_expected)],

                  ["Okutulan Miktar", Math.round(report.total_scanned)],

                  ["Bilinmeyen", report.unknown_count],

                ].map(([label, val]) => (

                  <div key={String(label)} className="bg-slate-900/50 border border-slate-800 rounded p-2">

                    <div className="text-xs text-slate-500">{label}</div>

                    <div className="font-semibold">{val}</div>

                  </div>

                ))}

              </div>

              <section className="space-y-3 max-w-3xl">
                <div>
                  <h3 className="font-bold text-slate-200">Düzeltmeler — Kalem Kalem Bildirimler</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Sayım sırasında oluşan tüm anomaliler. Excel raporundaki &quot;Düzeltmeler&quot; sayfasıyla aynı içerik.
                  </p>
                </div>
                {(report.correction_entries ?? []).length === 0 ? (
                  <EmptyStatePanel>
                    <p className="text-slate-500 text-sm">Bu sayımda düzeltme kaydı yok.</p>
                  </EmptyStatePanel>
                ) : (
                  <ul className="space-y-2">
                    {(report.correction_entries ?? []).map((entry, idx) => (
                      <li key={`${entry.etiket}-${entry.created_at}-${idx}`}>
                        <ReportCorrectionCard entry={entry} rowNo={idx + 1} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {reportFiles.length > 0 && (
                <section className="space-y-2 max-w-3xl">
                  <h3 className="font-bold text-slate-200">Kayıtlı Raporlar</h3>
                  <p className="text-xs text-slate-500">
                    Sunucudaki raporlar dizininden indirilebilir Excel dosyaları.
                  </p>
                  <ul className="space-y-1">
                    {reportFiles.map((f) => (
                      <li
                        key={f.filename}
                        className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 border border-slate-800 rounded px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="font-mono text-xs text-emerald-400 truncate">{f.filename}</div>
                          <div className="text-[10px] text-slate-500">
                            {new Date(f.created_at).toLocaleString("tr-TR")}
                            {" · "}
                            {Math.round(f.size_bytes / 1024)} KB
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void downloadSavedReport(f.filename)}
                          className="text-xs px-2.5 py-1 rounded bg-emerald-800 hover:bg-emerald-700 shrink-0"
                        >
                          İndir
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

            </>

          )}

        </div>
      )}

      {tab === "logs" && (
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 text-sm">
          <h2 className="font-bold mb-3">Sistem Geçmişi</h2>
          <p className="text-slate-500 text-xs mb-4">
            Excel yükleme, sayım başlatma/bitirme ve sıfırlama kayıtları kalıcıdır; uygulama sıfırlansa bile silinmez.
          </p>
          {systemLogs.length === 0 ? (
            <p className="text-slate-500">Henüz kayıt yok.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-700">
                  <th className="py-2 pr-2">Tarih</th>
                  <th className="py-2 pr-2">Kullanıcı</th>
                  <th className="py-2 pr-2">İşlem</th>
                  <th className="py-2 pr-2">Dosya</th>
                  <th className="py-2">Detay</th>
                </tr>
              </thead>
              <tbody>
                {systemLogs.map((log) => (
                  <tr key={log.id} className="border-b border-slate-800">
                    <td className="py-2 pr-2 text-xs text-slate-400 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString("tr-TR")}
                    </td>
                    <td className="py-2 pr-2 font-medium">{log.username}</td>
                    <td className="py-2 pr-2">{ACTION_LABELS[log.action] || log.action}</td>
                    <td className="py-2 pr-2 font-mono text-xs text-emerald-400">
                      {log.filename || "—"}
                    </td>
                    <td className="py-2 text-slate-400">{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "users" && isAdmin && user && (
        <UsersAdminPanel
          users={users}
          currentUserId={user.id}
          onRefresh={() => void loadUsers()}
        />
      )}

      {tab === "manage" && (
        <ManagePanel
          excelInfo={excelInfo}
          uploading={uploading}
          onUploadExcel={uploadExcel}
          sessionActive={sessionActive}
          onStartSession={async () => {
            await api.startSession();
            await refreshMeta();
            void loadSystemLogs();
          }}
          onEndSession={async () => {
            const res = await api.endSession();
            setSession(null);
            scanQueue.setSessionActive(false);
            setReport(res.report);
            void loadReport();
            setTab("reports");
            await refreshMeta();
            void loadSystemLogs();
          }}
          resetting={resetting}
          resetMessage={resetMessage}
          onResetSystem={async () => {
            if (!window.confirm("Tüm sistem sıfırlanacak. Emin misiniz?")) return;
            setResetting(true);
            setResetMessage("");
            try {
              const res = await api.resetSystem();
              clearClientState();
              await refreshMeta();
              void loadSystemLogs();
              setTab("manage");
              setResetMessage(res.message);
            } catch (e) {
              setResetMessage(
                e instanceof Error
                  ? `Sıfırlama başarısız: ${e.message}. Backend penceresini kapatıp baslat.bat ile yeniden başlatın.`
                  : "Sıfırlama başarısız.",
              );
            } finally {
              setResetting(false);
            }
          }}
        />
      )}

    </div>

  );

}

