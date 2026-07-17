export type SuccessPresetId = "classic" | "chime" | "ping" | "soft" | "bell";
export type ErrorPresetId = "buzz" | "alert" | "drop" | "horn" | "knock";

export interface SuccessPresetOption {
  id: SuccessPresetId;
  label: string;
  hint: string;
}

export interface ErrorPresetOption {
  id: ErrorPresetId;
  label: string;
  hint: string;
}

export const SUCCESS_PRESETS: SuccessPresetOption[] = [
  { id: "classic", label: "Klasik", hint: "Çift kısa bip" },
  { id: "chime", label: "Zil", hint: "Yükselen üç nota" },
  { id: "ping", label: "Ping", hint: "Tek net ton" },
  { id: "soft", label: "Yumuşak", hint: "Hafif onay tonu" },
  { id: "bell", label: "Çan", hint: "Parlak çan sesi" },
];

export const ERROR_PRESETS: ErrorPresetOption[] = [
  { id: "buzz", label: "Buzzer", hint: "Alçak uyarı" },
  { id: "alert", label: "Alarm", hint: "Üçlü acil bip" },
  { id: "drop", label: "Düşüş", hint: "İnen tonlar" },
  { id: "horn", label: "Korna", hint: "Kalın uyarı" },
  { id: "knock", label: "Vuruntu", hint: "Kısa vurma" },
];

type ToneSpec = {
  frequency: number;
  durationMs: number;
  type?: OscillatorType;
  volumeMul?: number;
  delayMs?: number;
};

function scheduleTones(ctx: AudioContext, gain: number, tones: ToneSpec[]): void {
  const startBase = ctx.currentTime;
  for (const tone of tones) {
    const start = startBase + (tone.delayMs ?? 0) / 1000;
    const duration = tone.durationMs / 1000;
    const volume = gain * (tone.volumeMul ?? 1);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = tone.type ?? "sine";
    osc.frequency.value = tone.frequency;
    g.gain.setValueAtTime(Math.max(volume, 0.001), start);
    g.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }
}

export function playSuccessPreset(
  preset: SuccessPresetId,
  gain: number,
  ctx: AudioContext,
): void {
  if (gain <= 0) return;

  const presets: Record<SuccessPresetId, ToneSpec[]> = {
    classic: [
      { frequency: 880, durationMs: 55 },
      { frequency: 1175, durationMs: 45, volumeMul: 0.85, delayMs: 65 },
    ],
    chime: [
      { frequency: 660, durationMs: 50 },
      { frequency: 880, durationMs: 50, delayMs: 55 },
      { frequency: 1175, durationMs: 70, delayMs: 110 },
    ],
    ping: [{ frequency: 1400, durationMs: 90, volumeMul: 0.9 }],
    soft: [
      { frequency: 520, durationMs: 80, volumeMul: 0.75 },
      { frequency: 680, durationMs: 60, volumeMul: 0.55, delayMs: 75 },
    ],
    bell: [
      { frequency: 988, durationMs: 120, volumeMul: 0.85 },
      { frequency: 1480, durationMs: 90, volumeMul: 0.35, delayMs: 15 },
    ],
  };

  scheduleTones(ctx, gain, presets[preset] ?? presets.classic);
}

export function playErrorPreset(
  preset: ErrorPresetId,
  gain: number,
  ctx: AudioContext,
): void {
  if (gain <= 0) return;

  const presets: Record<ErrorPresetId, ToneSpec[]> = {
    buzz: [
      { frequency: 240, durationMs: 90, type: "square", volumeMul: 0.85 },
      { frequency: 190, durationMs: 110, type: "square", delayMs: 120 },
    ],
    alert: [
      { frequency: 820, durationMs: 45, type: "square", volumeMul: 0.7 },
      { frequency: 820, durationMs: 45, type: "square", delayMs: 90 },
      { frequency: 620, durationMs: 80, type: "square", delayMs: 180 },
    ],
    drop: [
      { frequency: 420, durationMs: 70, type: "triangle" },
      { frequency: 310, durationMs: 90, type: "triangle", delayMs: 75 },
      { frequency: 200, durationMs: 110, type: "triangle", delayMs: 165 },
    ],
    horn: [
      { frequency: 180, durationMs: 140, type: "sawtooth", volumeMul: 0.75 },
      { frequency: 150, durationMs: 160, type: "sawtooth", delayMs: 145 },
    ],
    knock: [
      { frequency: 120, durationMs: 35, type: "square", volumeMul: 1.1 },
      { frequency: 90, durationMs: 45, type: "square", delayMs: 55, volumeMul: 0.9 },
    ],
  };

  scheduleTones(ctx, gain, presets[preset] ?? presets.buzz);
}

export function isSuccessPresetId(value: string): value is SuccessPresetId {
  return SUCCESS_PRESETS.some((p) => p.id === value);
}

export function isErrorPresetId(value: string): value is ErrorPresetId {
  return ERROR_PRESETS.some((p) => p.id === value);
}
