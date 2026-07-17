import type { MisplacementCorrection, ShelfItem } from "../types";

export type MisplacementHintKind = "scanned_elsewhere" | "wrongly_here";

export interface MisplacementHint {
  kind: MisplacementHintKind;
  message: string;
}

/** Ürün satırı için çapraz raf uyarısı (en güncel kayıt). */
export function hintForItem(
  etiket: string,
  shelf: string,
  corrections: MisplacementCorrection[],
): MisplacementHint | null {
  for (const c of corrections) {
    if (c.etiket !== etiket) continue;
    if (c.status === "Boş raf bilgisi" && c.scanned_shelf === shelf) {
      return {
        kind: "wrongly_here",
        message: "Excel'de depo/raf bilgisi boş — burada okutuldu",
      };
    }
    if (c.correct_shelf === shelf && c.scanned_shelf !== shelf) {
      return {
        kind: "scanned_elsewhere",
        message: `Bu ürün ${c.scanned_shelf} rafında okutuldu`,
      };
    }
    if (c.scanned_shelf === shelf && c.correct_shelf !== shelf) {
      return {
        kind: "wrongly_here",
        message: `${c.correct_shelf} rafına ait — burada yanlış okutuldu`,
      };
    }
  }
  return null;
}

/** Bu rafta tespit edilen ama ürün listesinde olmayan düzeltmeler. */
export function correctionsOnShelfNotInList(
  shelf: string,
  items: ShelfItem[],
  corrections: MisplacementCorrection[],
): MisplacementCorrection[] {
  const onList = new Set(items.map((i) => i.etiket));
  const seen = new Set<string>();
  const result: MisplacementCorrection[] = [];
  for (const c of corrections) {
    if (c.scanned_shelf !== shelf || onList.has(c.etiket) || seen.has(c.etiket)) continue;
    seen.add(c.etiket);
    result.push(c);
  }
  return result;
}

/** @deprecated scansOnShelfNotInList alias */
export const scansOnShelfNotInList = correctionsOnShelfNotInList;

/** Sol raf listesinde uyarı göstermek için ilgili düzeltme sayısı. */
export function shelfCorrectionCount(
  shelf: string,
  corrections: MisplacementCorrection[],
): number {
  const keys = new Set<string>();
  for (const c of corrections) {
    if (c.correct_shelf === shelf || c.scanned_shelf === shelf) {
      keys.add(c.etiket);
    }
  }
  return keys.size;
}
