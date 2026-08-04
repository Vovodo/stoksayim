import { useEffect, useState } from "react";
import { api } from "../api";

export function SupabaseStorageSettingsCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [supabaseUrl, setSupabaseUrl] = useState("");
  const [storageBucket, setStorageBucket] = useState("");
  const [serviceRoleKey, setServiceRoleKey] = useState("");
  const [serviceRoleKeyMasked, setServiceRoleKeyMasked] = useState<string | null>(null);
  const [status, setStatus] = useState<"disabled" | "ready" | "error">("disabled");
  const [lastError, setLastError] = useState<string | null>(null);

  // Database Connection Status
  const [dbStatus, setDbStatus] = useState<{
    connected: boolean;
    db_type: string;
    message: string;
  } | null>(null);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const [res, dbRes] = await Promise.all([
        api.getStorageSettings(),
        api.getDbStatus().catch(() => null),
      ]);
      setSupabaseUrl(res.supabase_url || "");
      setStorageBucket(res.storage_bucket || "");
      setServiceRoleKeyMasked(res.service_role_key_masked);
      setStatus(res.status);
      setLastError(res.last_error);
      if (dbRes) {
        setDbStatus({
          connected: dbRes.connected,
          db_type: dbRes.db_type,
          message: dbRes.message,
        });
      }
    } catch {
      // quiet fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await api.updateStorageSettings({
        supabase_url: supabaseUrl,
        storage_bucket: storageBucket,
        service_role_key: serviceRoleKey.trim() ? serviceRoleKey.trim() : undefined,
      });
      setServiceRoleKey("");
      setServiceRoleKeyMasked(res.service_role_key_masked);
      setStatus(res.status);
      setLastError(res.last_error);
      setMessage({ type: "success", text: "Supabase ayarları kaydedildi." });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Ayarlar kaydedilemedi",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setMessage(null);
    try {
      const res = await api.testStorageConnection();
      setStatus("ready");
      setLastError(null);
      setMessage({ type: "success", text: res.message });
    } catch (err) {
      setStatus("error");
      const msg = err instanceof Error ? err.message : "Bağlantı testi başarısız";
      setLastError(msg);
      setMessage({ type: "error", text: msg });
    } finally {
      setTesting(false);
    }
  };

  const handleClearKey = async () => {
    if (!confirm("Service Role Key anahtarını silmek istediğinize emin misiniz?")) return;
    setSaving(true);
    try {
      const res = await api.updateStorageSettings({ clear_service_role_key: true });
      setServiceRoleKey("");
      setServiceRoleKeyMasked(null);
      setStatus(res.status);
      setMessage({ type: "success", text: "Anahtar kaldırıldı." });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Anahtar kaldırılamadı",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 text-xs text-slate-400">
        Supabase ayarları yükleniyor…
      </div>
    );
  }

  return (
    <section className="manage-card rounded-2xl border border-slate-800 bg-slate-900/90 backdrop-blur-sm overflow-hidden space-y-0">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-slate-800/80">
        <div className="flex items-start justify-between gap-3 flex-wrap sm:flex-nowrap">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-950/70 border border-slate-700/60 text-lg">
              🗄️
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="font-semibold text-slate-100 tracking-tight text-base">
                  Dosya Depolama (Supabase)
                </h2>
                {status === "ready" && (
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Supabase aktif
                  </span>
                )}
                {status === "error" && (
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                    Bağlantı Hatası
                  </span>
                )}
                {status === "disabled" && (
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                    Aktif Değil
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Excel dosyaları ve stok belgeleri burada yapılandırılan Supabase Storage bucket&apos;ına kaydedilir.
                Ayar boşsa dosyalar sunucu diskinde (uploads/) kalır.
              </p>
            </div>
          </div>

          {/* Database connection badge */}
          {dbStatus && (
            <div className="shrink-0 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-right">
              <div className="flex items-center justify-end gap-1.5">
                <span
                  className={`h-2 w-2 rounded-full ${
                    dbStatus.connected ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" : "bg-red-400"
                  }`}
                />
                <span className="text-xs font-semibold text-slate-300">{dbStatus.db_type}</span>
              </div>
              <span className="text-[10px] text-slate-500">Veritabanı Aktif</span>
            </div>
          )}
        </div>
      </div>

      {/* Body Form */}
      <form onSubmit={(e) => void handleSave(e)} className="p-5 space-y-5">
        {/* Field 1: Supabase Project URL */}
        <div className="space-y-1.5">
          <label htmlFor="supabase-url" className="block text-xs font-medium text-slate-300">
            Supabase Project URL
          </label>
          <input
            id="supabase-url"
            type="text"
            placeholder="https://mqjwkchajrsyxssharaf.supabase.co"
            value={supabaseUrl}
            onChange={(e) => setSupabaseUrl(e.target.value)}
            className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-mono text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <p className="text-[11px] text-slate-500">
            Supabase → Project Settings → API → Project URL
          </p>
        </div>

        {/* Field 2: Storage Bucket Name */}
        <div className="space-y-1.5">
          <label htmlFor="supabase-bucket" className="block text-xs font-medium text-slate-300">
            Storage bucket adı
          </label>
          <input
            id="supabase-bucket"
            type="text"
            placeholder="apae1111"
            value={storageBucket}
            onChange={(e) => setStorageBucket(e.target.value)}
            className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-mono text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <p className="text-[11px] text-slate-500">
            Supabase → Storage → Files ekranındaki bucket adını birebir yazın.
          </p>
        </div>

        {/* Field 3: Service Role Key */}
        <div className="space-y-1.5">
          <label htmlFor="supabase-key" className="block text-xs font-medium text-slate-300">
            Service role key
          </label>
          <input
            id="supabase-key"
            type="password"
            placeholder={serviceRoleKeyMasked ? `Mevcut: ${serviceRoleKeyMasked}` : "eyJhbGciOiJIUzI1Ni..."}
            value={serviceRoleKey}
            onChange={(e) => setServiceRoleKey(e.target.value)}
            className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-mono text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <p className="text-[11px] text-slate-500">
            Supabase → Project Settings → API → service_role (anon key değil). Anahtar veritabanında saklanır.
          </p>
        </div>

        {/* Status Error Display if any */}
        {lastError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
            <span className="font-semibold">Son Hata: </span>
            {lastError}
          </div>
        )}

        {/* Feedback Message */}
        {message && (
          <div
            className={`rounded-xl border p-3 text-xs ${
              message.type === "success"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-red-500/30 bg-red-500/10 text-red-300"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs shadow-md transition-all cursor-pointer"
          >
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </button>

          <button
            type="button"
            disabled={testing || saving}
            onClick={() => void handleTestConnection()}
            className="px-4 py-2.5 rounded-xl border border-slate-700 hover:border-slate-600 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 font-semibold text-xs transition-all cursor-pointer"
          >
            {testing ? "Test Ediliyor…" : "Bağlantıyı Test Et"}
          </button>

          {serviceRoleKeyMasked && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleClearKey()}
              className="px-3 py-2.5 text-xs text-slate-400 hover:text-red-400 transition-colors cursor-pointer"
            >
              Anahtarı Kaldır
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
