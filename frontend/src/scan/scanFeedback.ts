import type { ScanResult } from "../types";
import {
  playErrorPreset,
  playSuccessPreset,
  type ErrorPresetId,
  type SuccessPresetId,
} from "./scanSoundPresets";
import {
  getErrorVolumeGain,
  getScanSoundSettings,
  getSuccessVolumeGain,
} from "./scanSoundSettings";

export type ScanFeedbackKind = "success" | "error";

let flashEl: HTMLDivElement | null = null;
let flashHideTimer: ReturnType<typeof setTimeout> | null = null;
let audioCtx: AudioContext | null = null;
let audioUnlocked = false;

function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

export function unlockScanAudio(): void {
  if (audioUnlocked) return;
  if (getAudioContext()) audioUnlocked = true;
}

export function playScanSuccessSound(
  preset?: SuccessPresetId,
  gain?: number,
): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const settings = getScanSoundSettings();
  const volume = gain ?? getSuccessVolumeGain();
  playSuccessPreset(preset ?? settings.successPreset, volume, ctx);
}

export function playScanErrorSound(preset?: ErrorPresetId, gain?: number): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const settings = getScanSoundSettings();
  const volume = gain ?? getErrorVolumeGain();
  playErrorPreset(preset ?? settings.errorPreset, volume, ctx);
}

export function previewScanSuccessSound(preset?: SuccessPresetId): void {
  playScanSuccessSound(preset);
}

export function previewScanErrorSound(preset?: ErrorPresetId): void {
  playScanErrorSound(preset);
}

export function feedbackKindFromScan(
  r: Pick<ScanResult, "scan_type" | "status">,
): ScanFeedbackKind {
  if (r.scan_type === "normal" && r.status !== "over") return "success";
  return "error";
}

export function mountScanFlash(): void {
  if (flashEl) return;
  flashEl = document.createElement("div");
  flashEl.id = "scan-flash";
  flashEl.className = "scan-flash";
  flashEl.setAttribute("aria-live", "assertive");
  flashEl.innerHTML = `<div class="scan-flash__badge"><span class="scan-flash__icon"></span><span class="scan-flash__text"></span></div>`;
  document.body.appendChild(flashEl);

  document.addEventListener("pointerdown", unlockScanAudio, { once: true, passive: true });
}

export function showScanFlash(kind: ScanFeedbackKind, etiket?: string): void {
  if (!flashEl) mountScanFlash();
  if (!flashEl) return;

  const icon = flashEl.querySelector(".scan-flash__icon");
  const text = flashEl.querySelector(".scan-flash__text");
  if (!icon || !text) return;

  if (flashHideTimer) clearTimeout(flashHideTimer);

  flashEl.dataset.kind = kind;
  icon.textContent = kind === "success" ? "✓" : "✗";
  text.textContent =
    kind === "success"
      ? etiket
        ? `${etiket} · Okutuldu`
        : "Okutuldu"
      : etiket
        ? `${etiket} · Hatalı`
        : "Hatalı okutma";

  flashEl.classList.remove("scan-flash-visible");
  void flashEl.offsetWidth;
  flashEl.classList.add("scan-flash-visible");

  if (kind === "success") playScanSuccessSound();
  else playScanErrorSound();

  flashHideTimer = setTimeout(() => {
    flashEl?.classList.remove("scan-flash-visible");
  }, kind === "success" ? 420 : 620);
}

export function showScanFeedback(
  r: Pick<ScanResult, "scan_type" | "status" | "etiket">,
): void {
  showScanFlash(feedbackKindFromScan(r), r.etiket);
}
