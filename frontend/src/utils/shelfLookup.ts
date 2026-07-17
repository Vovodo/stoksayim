/** Depo/raf kodu — backend normalize_depo ile uyumlu */
export function normalizeShelfCode(code: string): string {
  return code.trim().toUpperCase();
}

/** Girilen kod listedeki bir raf ile birebir eşleşiyorsa o raf adını döner */
export function findShelfByCode(query: string, shelves: string[]): string | null {
  const normalized = normalizeShelfCode(query);
  if (!normalized) return null;
  for (const shelf of shelves) {
    if (normalizeShelfCode(shelf) === normalized) return shelf;
  }
  return null;
}

/** Raf listesini arama metnine göre filtreler */
export function filterShelvesByQuery<T extends { shelf: string }>(
  shelves: T[],
  query: string,
): T[] {
  const q = normalizeShelfCode(query);
  if (!q) return shelves;
  return shelves.filter((s) => normalizeShelfCode(s.shelf).includes(q));
}
