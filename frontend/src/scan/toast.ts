export type ToastKind =
  | "normal"
  | "unassigned"
  | "unknown"
  | "over"
  | "misplaced"
  | "found_missing"
  | "not_found";

export interface AnomalyToastPayload {
  kind: "misplaced" | "unknown" | "unassigned" | "found_missing" | "not_found" | "over";
  title?: string;
  etiket?: string;
  message: string;
  durationMs?: number;
}

const LABELS: Record<ToastKind, string> = {
  normal: "Normal okutma",
  unassigned: "Deposu boş bulundu",
  unknown: "Excel'de yok",
  over: "Fazla sayım",
  misplaced: "Raf uyumsuzluğu",
  found_missing: "Bulunamadı ürün bulundu",
  not_found: "Bulunamadı işaretlendi",
};

const ICONS: Record<ToastKind, string> = {
  normal: "🟢",
  unassigned: "🟡",
  unknown: "🔴",
  over: "🔵",
  misplaced: "🟠",
  found_missing: "🟧",
  not_found: "📌",
};

let el: HTMLDivElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

let anomalyEl: HTMLDivElement | null = null;
let anomalyTimer: ReturnType<typeof setTimeout> | null = null;

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
  }, 750);
}

export function mountAnomalyToast(): void {
  if (anomalyEl) return;
  anomalyEl = document.createElement("div");
  anomalyEl.id = "anomaly-toast";
  anomalyEl.className = "anomaly-toast";
  anomalyEl.setAttribute("aria-live", "assertive");
  document.body.appendChild(anomalyEl);
}

export function hideAnomalyToast(): void {
  if (anomalyTimer) {
    clearTimeout(anomalyTimer);
    anomalyTimer = null;
  }
  if (anomalyEl) {
    anomalyEl.classList.remove("anomaly-toast-visible");
  }
}

export function showAnomalyToast(payload: AnomalyToastPayload): void {
  if (!anomalyEl) mountAnomalyToast();
  if (!anomalyEl) return;

  if (anomalyTimer) {
    clearTimeout(anomalyTimer);
    anomalyTimer = null;
  }

  const kind = payload.kind;
  const duration = payload.durationMs || 8000;

  const metaMap: Record<string, { icon: string; title: string; badge: string }> = {
    misplaced: { icon: "⚠️", title: "RAF UYUMSUZLUĞU", badge: "DÜZELTME GEREKTİREN ANOMALİ" },
    unknown: { icon: "🚨", title: "TANIMSIZ BARKOD", badge: "EXCEL LİSTESİNDE BULUNAMADI" },
    unassigned: { icon: "⚠️", title: "DEPOSU BOŞ / ATANMAMIŞ ÜRÜN", badge: "EXCEL'DE RAF BİLGİSİ YOK" },
    found_missing: { icon: "🎉", title: "SONRADAN BULUNAN ÜRÜN", badge: "BULUNAMADI İŞARETLİ ETİKET BULUNDU" },
    not_found: { icon: "📌", title: "BULUNAMADI OLARAK İŞARETLENDİ", badge: "ETİKET BULUNAMADI KAYDEDİLDİ" },
    over: { icon: "ℹ️", title: "FAZLA SAYIM UYARISI", badge: "BEKLENEN MİKTARDAN FAZLA OKUTMA" },
  };

  const meta = metaMap[kind] || { icon: "⚠️", title: "DÜZELTME / ANOMALİ UYARISI", badge: "DÜZELTMELER BÖLÜMÜ" };
  const displayTitle = payload.title || meta.title;

  const etiketHtml = payload.etiket
    ? `<div class="anomaly-toast-etiket-tag"><span class="label">Etiket / Barkod:</span> <span class="val">${payload.etiket}</span></div>`
    : "";

  anomalyEl.innerHTML = `
    <div class="anomaly-toast-card">
      <div class="anomaly-toast-top">
        <div class="anomaly-toast-icon-wrap">${meta.icon}</div>
        <div class="anomaly-toast-header-text">
          <div class="anomaly-toast-badge">${meta.badge}</div>
          <div class="anomaly-toast-main-title">${displayTitle}</div>
        </div>
        <button class="anomaly-toast-close" type="button" aria-label="Kapat">&times;</button>
      </div>
      <div class="anomaly-toast-content">
        ${etiketHtml}
        <div class="anomaly-toast-desc">${payload.message}</div>
      </div>
      <div class="anomaly-toast-progress-bar" style="animation-duration: ${duration}ms;"></div>
    </div>
  `;

  anomalyEl.dataset.kind = kind;
  void anomalyEl.offsetWidth;
  anomalyEl.classList.add("anomaly-toast-visible");

  const closeBtn = anomalyEl.querySelector(".anomaly-toast-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", hideAnomalyToast);
  }

  anomalyTimer = setTimeout(hideAnomalyToast, duration);
}
