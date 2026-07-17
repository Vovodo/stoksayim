import { AppLogo } from "./AppLogo";

export function SplashScreen() {
  return (
    <div className="splash-screen fixed inset-0 z-[10000] flex flex-col items-center justify-center bg-slate-950">
      <div className="splash-screen__glow" aria-hidden />
      <AppLogo size="2xl" className="splash-screen__logo flex-col gap-4" />
      <p className="mt-6 text-sm text-slate-400 tracking-wide">Depo Sayım Sistemi</p>
      <div className="mt-8 h-1 w-28 rounded-full bg-slate-800 overflow-hidden">
        <div className="splash-screen__bar h-full w-1/3 rounded-full bg-blue-500" />
      </div>
    </div>
  );
}
