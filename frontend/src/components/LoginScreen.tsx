import { useState } from "react";
import { AppLogo } from "./AppLogo";

type LoginMode = "login" | "register";

interface Props {
  mode: LoginMode;
  onModeChange: (mode: LoginMode) => void;
  username: string;
  password: string;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  error: string;
  onSubmit: (e: React.FormEvent) => void;
  submitting: boolean;
}

export function LoginScreen({
  mode,
  onModeChange,
  username,
  password,
  onUsernameChange,
  onPasswordChange,
  error,
  onSubmit,
  submitting,
}: Props) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="login-page min-h-screen flex">
      <div className="login-page__bg" aria-hidden />

      <aside className="hidden lg:flex lg:w-[44%] xl:w-[48%] relative z-10 flex-col justify-between p-12 xl:p-16 border-r border-white/5">
        <div>
          <AppLogo size="lg" showText subtitle="Depo Yönetimi" className="mb-10" />

          <h2 className="text-3xl xl:text-4xl font-bold text-white leading-tight max-w-md">
            Envanter sayımını hızlı ve hatasız yönetin
          </h2>
          <p className="mt-4 text-slate-400 text-sm leading-relaxed max-w-sm">
            Excel tabanlı raf envanteri, barkod okutma ve anlık raporlama — tek platformda.
          </p>
        </div>

        <ul className="space-y-3 text-sm text-slate-500">
          {["Excel ile raf envanteri yükleme", "Barkod okuyucu desteği", "Anlık sayım raporlama"].map(
            (item) => (
              <li key={item} className="flex items-center gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                {item}
              </li>
            ),
          )}
        </ul>
      </aside>

      <main className="flex-1 relative z-10 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[420px]">
          <div className="flex flex-col items-center mb-8 lg:hidden">
            <AppLogo size="xl" className="mb-3" />
            <p className="text-sm text-slate-400 text-center">Depo Sayım Sistemi</p>
          </div>

          <div className="login-card rounded-2xl border border-white/10 bg-slate-900/70 backdrop-blur-xl shadow-2xl shadow-black/40 p-8 sm:p-9">
            <div className="mb-7">
              <h2 className="text-2xl font-semibold text-white tracking-tight">
                {mode === "login" ? "Hoş geldiniz" : "Hesap oluşturun"}
              </h2>
              <p className="mt-1.5 text-sm text-slate-400">
                {mode === "login"
                  ? "Devam etmek için giriş yapın"
                  : "Yeni bir kullanıcı hesabı oluşturun"}
              </p>
            </div>

            <div
              className="flex p-1 rounded-xl bg-slate-950/80 border border-slate-700/50 mb-6"
              role="tablist"
            >
              {(["login", "register"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => onModeChange(m)}
                  className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors duration-150 ${
                    mode === m
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {m === "login" ? "Giriş Yap" : "Kayıt Ol"}
                </button>
              ))}
            </div>

            <form onSubmit={onSubmit} className="space-y-5">
              {error && (
                <div
                  className="flex gap-3 items-start rounded-lg border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-300"
                  role="alert"
                >
                  <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="login-username" className="block text-xs font-medium text-slate-400 uppercase tracking-wide">
                  Kullanıcı adı
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    </svg>
                  </span>
                  <input
                    id="login-username"
                    className="login-input w-full pl-10 pr-4 py-3 rounded-xl bg-slate-950/60 border border-slate-700/80 text-white placeholder:text-slate-600 text-sm focus:outline-none focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20 transition-shadow"
                    placeholder="kullaniciadi"
                    value={username}
                    onChange={(e) => onUsernameChange(e.target.value)}
                    autoComplete="username"
                    autoFocus
                    disabled={submitting}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="login-password" className="block text-xs font-medium text-slate-400 uppercase tracking-wide">
                  Şifre
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                      />
                    </svg>
                  </span>
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    className="login-input w-full pl-10 pr-11 py-3 rounded-xl bg-slate-950/60 border border-slate-700/80 text-white placeholder:text-slate-600 text-sm focus:outline-none focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20 transition-shadow"
                    placeholder={mode === "register" ? "En az 4 karakter" : "••••••••"}
                    value={password}
                    onChange={(e) => onPasswordChange(e.target.value)}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-1"
                    aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                  >
                    {showPassword ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858 5.858a3 3 0 104.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || !username.trim() || !password}
                className="login-submit w-full py-3.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-blue-900/30 transition-all duration-150 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    İşleniyor…
                  </>
                ) : mode === "login" ? (
                  "Giriş Yap"
                ) : (
                  "Hesap Oluştur"
                )}
              </button>
            </form>
          </div>

          <p className="mt-6 text-center text-xs text-slate-600">
            Depo Sayım Sistemi · Barkod tabanlı envanter yönetimi
          </p>
        </div>
      </main>
    </div>
  );
}
