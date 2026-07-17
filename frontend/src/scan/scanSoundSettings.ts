import type { ErrorPresetId, SuccessPresetId } from "./scanSoundPresets";
import { isErrorPresetId, isSuccessPresetId } from "./scanSoundPresets";

export interface ScanSoundSettings {
  successVolume: number;
  errorVolume: number;
  successPreset: SuccessPresetId;
  errorPreset: ErrorPresetId;
}

const STORAGE_KEY = "depo-sayim-scan-sound-v2";
const LEGACY_STORAGE_KEY = "depo-sayim-scan-sound-v1";

export const DEFAULT_SCAN_SOUND_SETTINGS: ScanSoundSettings = {
  successVolume: 85,
  errorVolume: 90,
  successPreset: "classic",
  errorPreset: "buzz",
};

const MAX_SUCCESS_GAIN = 0.55;
const MAX_ERROR_GAIN = 0.6;

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function normalizeSettings(raw: Partial<ScanSoundSettings>): ScanSoundSettings {
  const successPreset =
    raw.successPreset && isSuccessPresetId(raw.successPreset)
      ? raw.successPreset
      : DEFAULT_SCAN_SOUND_SETTINGS.successPreset;
  const errorPreset =
    raw.errorPreset && isErrorPresetId(raw.errorPreset)
      ? raw.errorPreset
      : DEFAULT_SCAN_SOUND_SETTINGS.errorPreset;

  return {
    successVolume: clampPercent(raw.successVolume ?? DEFAULT_SCAN_SOUND_SETTINGS.successVolume),
    errorVolume: clampPercent(raw.errorVolume ?? DEFAULT_SCAN_SOUND_SETTINGS.errorVolume),
    successPreset,
    errorPreset,
  };
}

function readLegacySettings(): Partial<ScanSoundSettings> | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<ScanSoundSettings>;
  } catch {
    return null;
  }
}

export function loadScanSoundSettings(): ScanSoundSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return normalizeSettings(JSON.parse(raw) as Partial<ScanSoundSettings>);
    }
    const legacy = readLegacySettings();
    if (legacy) {
      const migrated = normalizeSettings(legacy);
      saveScanSoundSettings(migrated);
      return migrated;
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_SCAN_SOUND_SETTINGS };
}

export function saveScanSoundSettings(settings: ScanSoundSettings): void {
  const normalized = normalizeSettings(settings);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
}

export function successVolumeToGain(percent: number): number {
  return (clampPercent(percent) / 100) * MAX_SUCCESS_GAIN;
}

export function errorVolumeToGain(percent: number): number {
  return (clampPercent(percent) / 100) * MAX_ERROR_GAIN;
}

export function getScanSoundSettings(): ScanSoundSettings {
  return loadScanSoundSettings();
}

export function getSuccessVolumeGain(): number {
  return successVolumeToGain(loadScanSoundSettings().successVolume);
}

export function getErrorVolumeGain(): number {
  return errorVolumeToGain(loadScanSoundSettings().errorVolume);
}
