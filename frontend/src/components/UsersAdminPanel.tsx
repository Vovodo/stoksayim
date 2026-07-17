import { useCallback, useState } from "react";
import { api } from "../api";
import type { UserListItem } from "../types";

interface Props {
  users: UserListItem[];
  currentUserId: number;
  onRefresh: () => void;
}

export function UsersAdminPanel({ users, currentUserId, onRefresh }: Props) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [resetTarget, setResetTarget] = useState<UserListItem | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetResult, setResetResult] = useState<{ username: string; password: string } | null>(
    null,
  );
  const [error, setError] = useState("");

  const handleDelete = useCallback(
    async (u: UserListItem) => {
      if (u.id === currentUserId) {
        setError("Kendi hesabınızı silemezsiniz.");
        return;
      }
      if (u.username.toLowerCase() === "admin") {
        setError("Ana admin hesabı silinemez.");
        return;
      }
      if (!window.confirm(`"${u.username}" hesabı kalıcı olarak silinsin mi?`)) return;

      setBusyId(u.id);
      setError("");
      try {
        await api.deleteUser(u.id);
        onRefresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Silme başarısız");
      } finally {
        setBusyId(null);
      }
    },
    [currentUserId, onRefresh],
  );

  const openReset = (u: UserListItem) => {
    setResetTarget(u);
    setNewPassword("");
    setResetResult(null);
    setError("");
  };

  const closeReset = () => {
    setResetTarget(null);
    setNewPassword("");
    setResetResult(null);
  };

  const submitReset = async () => {
    if (!resetTarget) return;
    if (newPassword.length < 4) {
      setError("Şifre en az 4 karakter olmalı.");
      return;
    }
    setBusyId(resetTarget.id);
    setError("");
    try {
      const res = await api.resetUserPassword(resetTarget.id, newPassword);
      setResetResult({ username: res.username, password: res.password });
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Şifre güncellenemedi");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <header>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-400/80">
            Yönetim
          </p>
          <h2 className="text-xl font-bold text-slate-50 mt-1">Kullanıcılar</h2>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Şifreler güvenlik için şifrelenmiş saklanır; mevcut şifre okunamaz. Yeni şifre
            belirleyerek kullanıcıya iletebilirsiniz.
          </p>
        </header>

        {error && !resetTarget ? (
          <p className="text-sm text-red-400 bg-red-950/30 border border-red-900/50 rounded-lg px-3 py-2">
            {error}
          </p>
        ) : null}

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-800 bg-slate-950/50">
                <th className="py-3 px-4">Kullanıcı</th>
                <th className="py-3 px-4 hidden sm:table-cell">Rol</th>
                <th className="py-3 px-4 hidden md:table-cell">Kayıt</th>
                <th className="py-3 px-4 text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === currentUserId;
                const isMainAdmin = u.username.toLowerCase() === "admin";
                const loading = busyId === u.id;
                return (
                  <tr key={u.id} className="border-b border-slate-800/80 hover:bg-slate-800/20">
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-200">{u.username}</div>
                      <div className="text-[11px] text-slate-500 sm:hidden">
                        {u.role === "admin" ? "Admin" : "Kullanıcı"}
                      </div>
                    </td>
                    <td className="py-3 px-4 hidden sm:table-cell">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          u.role === "admin"
                            ? "bg-amber-500/15 text-amber-300"
                            : "bg-slate-700/50 text-slate-300"
                        }`}
                      >
                        {u.role === "admin" ? "Admin" : "Kullanıcı"}
                      </span>
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell text-xs text-slate-500">
                      {new Date(u.created_at).toLocaleString("tr-TR")}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex justify-end gap-2 flex-wrap">
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => openReset(u)}
                          className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-600 hover:bg-slate-800 text-slate-300 disabled:opacity-50"
                        >
                          Şifre sıfırla
                        </button>
                        <button
                          type="button"
                          disabled={loading || isSelf || isMainAdmin}
                          onClick={() => void handleDelete(u)}
                          className="text-xs px-2.5 py-1.5 rounded-lg border border-red-800/60 hover:bg-red-950/40 text-red-400 disabled:opacity-40 disabled:cursor-not-allowed"
                          title={
                            isSelf
                              ? "Kendi hesabınız"
                              : isMainAdmin
                                ? "Ana admin silinemez"
                                : "Hesabı sil"
                          }
                        >
                          Sil
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {users.length === 0 ? (
            <p className="text-center text-slate-500 text-sm py-8">Kayıtlı kullanıcı yok.</p>
          ) : null}
        </div>
      </div>

      {resetTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div
            className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-password-title"
          >
            {resetResult ? (
              <>
                <h3 id="reset-password-title" className="font-semibold text-emerald-400">
                  Şifre güncellendi
                </h3>
                <p className="text-sm text-slate-400 mt-2">
                  Aşağıdaki bilgileri kullanıcıya iletin. Eski şifre artık geçersiz.
                </p>
                <div className="mt-4 rounded-xl bg-slate-950 border border-slate-700 p-4 font-mono text-sm space-y-2">
                  <div>
                    <span className="text-slate-500 text-xs">Kullanıcı</span>
                    <div className="text-slate-100">{resetResult.username}</div>
                  </div>
                  <div>
                    <span className="text-slate-500 text-xs">Yeni şifre</span>
                    <div className="text-emerald-300 select-all">{resetResult.password}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeReset}
                  className="mt-4 w-full rounded-xl bg-blue-600 hover:bg-blue-500 py-2.5 text-sm font-medium"
                >
                  Tamam
                </button>
              </>
            ) : (
              <>
                <h3 id="reset-password-title" className="font-semibold text-slate-100">
                  Şifre sıfırla — {resetTarget.username}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Mevcut şifre görüntülenemez. Yeni bir şifre belirleyin.
                </p>
                {error ? <p className="text-sm text-red-400 mt-2">{error}</p> : null}
                <input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Yeni şifre (min. 4 karakter)"
                  autoComplete="new-password"
                  className="mt-4 w-full bg-slate-950 border border-slate-600 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-blue-500"
                />
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={closeReset}
                    className="flex-1 rounded-xl border border-slate-600 py-2.5 text-sm hover:bg-slate-800"
                  >
                    İptal
                  </button>
                  <button
                    type="button"
                    disabled={busyId === resetTarget.id}
                    onClick={() => void submitReset()}
                    className="flex-1 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 py-2.5 text-sm font-medium"
                  >
                    {busyId === resetTarget.id ? "Kaydediliyor…" : "Kaydet"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
