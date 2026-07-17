export type ToastKind = "normal" | "unassigned" | "unknown" | "over" | "misplaced" | "found_missing";

const LABELS: Record<ToastKind, string> = {
  normal: "Normal okutma",
  unassigned: "Deposu boş bulundu",
  unknown: "Excel'de yok",
  over: "Fazla sayım",
  misplaced: "Raf uyumsuzluğu",
  found_missing: "Bulunamadı ürün bulundu",
};

const ICONS: Record<ToastKind, string> = {
  normal: "🟢",
  unassigned: "🟡",
  unknown: "🔴",
  over: "🔵",
  misplaced: "🟠",
  found_missing: "🟧",
};

let el: HTMLDivElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

export function mountScanToast(): void {
  if (el) return;
  el = document.createElement("div");
  el.id = "scan-toast";
  el.className = "scan-toast";
  el.setAttribute("aria-live", "polite");
  document.body.appendChild(el);
}

export function showScanToast(etiket: string, kind: ToastKind = "normal"): void {
  showScanMessage(`${ICONS[kind]} ${etiket} · ${LABELS[kind]}`, kind);
}

export function showScanMessage(message: string, kind: ToastKind = "normal"): void {
  if (!el) mountScanToast();
  if (!el) return;
  if (hideTimer) clearTimeout(hideTimer);
  el.textContent = message;
  el.dataset.kind = kind;
  el.classList.add("scan-toast-visible");
  hideTimer = setTimeout(() => {
    el?.classList.remove("scan-toast-visible");
  }, kind === "misplaced" || kind === "found_missing" ? 4500 : 750);
}
