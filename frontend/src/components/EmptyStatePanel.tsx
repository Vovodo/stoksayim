import type { ReactNode } from "react";
import { AppLogoWatermark } from "./AppLogo";

interface Props {
  children: ReactNode;
  className?: string;
}

/** Boş durum ekranları için logo filigranı */
export function EmptyStatePanel({ children, className = "" }: Props) {
  return (
    <div className={`relative flex flex-col items-center justify-center text-center py-10 px-4 ${className}`}>
      <AppLogoWatermark size={112} className="absolute inset-0 m-auto" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
