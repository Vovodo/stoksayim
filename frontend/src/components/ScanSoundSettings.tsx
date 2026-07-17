import { useState } from "react";
import {
  previewScanErrorSound,
  previewScanSuccessSound,
  unlockScanAudio,
} from "../scan/scanFeedback";
import {
  ERROR_PRESETS,
  SUCCESS_PRESETS,
  type ErrorPresetId,
  type SuccessPresetId,
} from "../scan/scanSoundPresets";
import {
  DEFAULT_SCAN_SOUND_SETTINGS,
  loadScanSoundSettings,
  saveScanSoundSettings,
  type ScanSoundSettings,
} from "../scan/scanSoundSettings";

function VolumeSlider({
  id,
  label,
  value,
  accentClass,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  accentClass: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium text-slate-400 uppercase tracking-wide">
          {label}
        </label>
        <span className="text-xs tabular-nums font-semibold text-slate-300">%{value}</span>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`w-full h-2 rounded-full appearance-none bg-slate-800 ${accentClass}`}
      />
    </div>
  );
}

function PresetGrid<T extends string>({
  presets,
  selected,
  kind,
  onSelect,
  onPreview,
}: {
  presets: { id: T; label: string; hint: string }[];
  selected: T;
  kind: "success" | "error";
  onSelect: (id: T) => void;
  onPreview: (id: T) => void;
}) {
  const selectedRing =
    kind === "success"
      ? "border-emerald-500/70 bg-emerald-500/10 ring-1 ring-emerald-500/30"
      : "border-red-500/70 bg-red-500/10 ring-1 ring-red-500/30";

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {presets.map((preset) => {
        const active = preset.id === selected;
        return (
          <div
            key={preset.id}
            className={`rounded-xl border p-3 transition-all ${
              active ? selectedRing : "border-slate-700/80 bg-slate-950/40 hover:border-slate-600"
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect(preset.id)}
              className="w-full text-left"
            >
              <span className={`text-sm font-medium ${active ? "text-slate-100" : "text-slate-300"}`}>
                {preset.label}
              </span>
              <span className="block text-[10px] text-slate-500 mt-0.5">{preset.hint}</span>
            </button>
            <button
              type="button"
              onClick={() => onPreview(preset.id)}
              className="mt-2 text-[10px] font-medium text-blue-400 hover:text-blue-300"
            >
              ▶ Dinle
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function ScanSoundSettings() {
  const [settings, setSettings] = useState<ScanSoundSettings>(() => loadScanSoundSettings());

  const update = (patch: Partial<ScanSoundSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveScanSoundSettings(next);
  };

  const reset = () => {
    const next = { ...DEFAULT_SCAN_SOUND_SETTINGS };
    setSettings(next);
    saveScanSoundSettings(next);
  };

  const previewSuccess = (preset: SuccessPresetId) => {
    unlockScanAudio();
    previewScanSuccessSound(preset);
  };

  const previewError = (preset: ErrorPresetId) => {
    unlockScanAudio();
    previewScanErrorSound(preset);
  };

  return (
    <section className="manage-card rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 to-transparent bg-slate-900/80 backdrop-blur-sm overflow-hidden">
      <div className="px-5 pt-5 pb-4 border-b border-slate-800/80">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-950/60 border border-slate-700/60 text-lg">
              🔊
            </div>
            <div>
              <h2 className="font-semibold text-slate-100 tracking-tight">Okutma Sesleri</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Ses tipi ve seviye kalıcı olarak kaydedilir — uygulama her açıldığında hatırlanır.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={reset}
            className="shrink-0 text-[11px] px-2.5 py-1.5 rounded-lg border border-slate-600 hover:bg-slate-800 text-slate-400"
          >
            Varsayılan
          </button>
        </div>
      </div>

      <div className="p-5 space-y-6">
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-400/90">
            Başarı sesi
          </h3>
          <PresetGrid
            presets={SUCCESS_PRESETS}
            selected={settings.successPreset}
            kind="success"
            onSelect={(successPreset) => update({ successPreset })}
            onPreview={previewSuccess}
          />
          <VolumeSlider
            id="scan-success-volume"
            label="Ses seviyesi"
            value={settings.successVolume}
            accentClass="accent-emerald-500"
            onChange={(successVolume) => update({ successVolume })}
          />
        </div>

        <div className="border-t border-slate-800/80 pt-5 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-red-400/90">
            Hata sesi
          </h3>
          <PresetGrid
            presets={ERROR_PRESETS}
            selected={settings.errorPreset}
            kind="error"
            onSelect={(errorPreset) => update({ errorPreset })}
            onPreview={previewError}
          />
          <VolumeSlider
            id="scan-error-volume"
            label="Ses seviyesi"
            value={settings.errorVolume}
            accentClass="accent-red-500"
            onChange={(errorVolume) => update({ errorVolume })}
          />
        </div>
      </div>
    </section>
  );
}
