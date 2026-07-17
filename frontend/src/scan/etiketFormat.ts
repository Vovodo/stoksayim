/** Excel'den gelen etiket formatı — varsayılan: tam 10 haneli rakam */
let etiketPattern: RegExp = /^\d{10}$/;

export function setEtiketFormatFromMeta(meta: {
  etiket_pattern?: string;
  etiket_digit_length?: number;
}): void {
  if (meta.etiket_pattern) {
    etiketPattern = new RegExp(meta.etiket_pattern);
    return;
  }
  if (meta.etiket_digit_length) {
    etiketPattern = new RegExp(`^\\d{${meta.etiket_digit_length}}$`);
  }
}

export function resetEtiketFormat(): void {
  etiketPattern = /^\d{10}$/;
}

export function isClassicEtiketCode(code: string): boolean {
  return etiketPattern.test(code.trim());
}

export function getEtiketDigitLength(): number {
  const m = etiketPattern.source.match(/\\d\{(\d+)\}/);
  return m ? Number(m[1]) : 10;
}
