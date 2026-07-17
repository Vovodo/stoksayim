import type { ImgHTMLAttributes } from "react";

const LOGO_SRC = "/logo.png";

const SIZE_PX = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 56,
  xl: 80,
  "2xl": 120,
} as const;

export type AppLogoSize = keyof typeof SIZE_PX;

interface AppLogoProps {
  size?: AppLogoSize;
  className?: string;
  imgClassName?: string;
  showText?: boolean;
  textClassName?: string;
  subtitle?: string;
}

export function AppLogo({
  size = "sm",
  className = "",
  imgClassName = "",
  showText = false,
  textClassName = "",
  subtitle,
}: AppLogoProps) {
  const px = SIZE_PX[size];

  return (
    <div className={`flex items-center gap-2.5 min-w-0 ${className}`}>
      <img
        src={LOGO_SRC}
        alt="Depo Sayım Sistemi"
        width={px}
        height={px}
        className={`object-contain shrink-0 select-none ${imgClassName}`}
        style={{ width: px, height: px }}
        draggable={false}
      />
      {showText && (
        <div className="min-w-0">
          <div className={`font-semibold text-white leading-tight truncate ${textClassName}`}>
            Depo Sayım
          </div>
          {subtitle ? (
            <div className="text-[10px] text-slate-500 truncate">{subtitle}</div>
          ) : null}
        </div>
      )}
    </div>
  );
}

interface AppLogoWatermarkProps extends ImgHTMLAttributes<HTMLImageElement> {
  size?: number;
}

export function AppLogoWatermark({ size = 96, className = "", ...props }: AppLogoWatermarkProps) {
  return (
    <img
      src={LOGO_SRC}
      alt=""
      aria-hidden
      width={size}
      height={size}
      className={`object-contain opacity-[0.12] select-none pointer-events-none ${className}`}
      style={{ width: size, height: size }}
      draggable={false}
      {...props}
    />
  );
}
