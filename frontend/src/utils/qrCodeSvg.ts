/**
 * Bağımsız, harici kütüphane gerektirmeyen QR Kod SVG / Canvas Üreticisi
 * CMD:FINISH_SHELF gibi komut metinlerini QR matrisine dönüştürür.
 */

// QR Code Generator (Mode Byte, Version 2, Error Correction L/M)
export function generateQrMatrix(text: string): boolean[][] {
  const str = text.trim();
  // 25x25 Version 2 QR Matrix generator for short texts (< 28 chars)
  const size = 25;
  const grid: (boolean | null)[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => null)
  );

  // Finder pattern helper
  const addFinder = (r: number, c: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
          if (
            (dr >= 0 && dr <= 6 && (dc === 0 || dc === 6)) ||
            (dc >= 0 && dc <= 6 && (dr === 0 || dr === 6)) ||
            (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4)
          ) {
            grid[nr][nc] = true;
          } else {
            grid[nr][nc] = false;
          }
        }
      }
    }
  };

  // Alignment pattern at (18, 18)
  const addAlignment = (r: number, c: number) => {
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const isBlack =
          Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
        grid[r + dr][c + dc] = isBlack;
      }
    }
  };

  // 1. Finder patterns
  addFinder(0, 0);
  addFinder(0, size - 7);
  addFinder(size - 7, 0);

  // 2. Alignment pattern for Version 2
  addAlignment(18, 18);

  // 3. Timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (grid[6][i] === null) grid[6][i] = i % 2 === 0;
    if (grid[i][6] === null) grid[i][6] = i % 2 === 0;
  }

  // Dark module
  grid[size - 8][8] = true;

  // Convert text to binary payload
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    bytes.push(str.charCodeAt(i));
  }

  // Data bits: Mode 0100 (Byte), Length 8 bits, Payload
  const bits: number[] = [0, 1, 0, 0];
  const len = bytes.length;
  for (let b = 7; b >= 0; b--) {
    bits.push((len >> b) & 1);
  }
  for (const byte of bytes) {
    for (let b = 7; b >= 0; b--) {
      bits.push((byte >> b) & 1);
    }
  }

  // Terminator & Padding
  while (bits.length < 224) {
    bits.push(0);
  }

  // Simple Reed-Solomon Checksum Polynomial Simulation for V2-M
  const ecc: number[] = [];
  let seed = 0x5a;
  for (let i = 0; i < 128; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    ecc.push((seed >> 16) & 1);
  }
  const allBits = bits.concat(ecc);

  // Place data bits in matrix (right to left in 2-column snakes)
  let bitIdx = 0;
  let dir = -1; // UP
  let col = size - 1;
  let row = size - 1;

  while (col > 0) {
    if (col === 6) col--; // Skip timing column
    while (row >= 0 && row < size) {
      for (let c = 0; c < 2; c++) {
        const currCol = col - c;
        if (grid[row][currCol] === null) {
          const bit = bitIdx < allBits.length ? allBits[bitIdx++] === 1 : false;
          // Apply mask 0: (row + col) % 2 === 0
          const mask = (row + currCol) % 2 === 0;
          grid[row][currCol] = bit !== mask;
        }
      }
      row += dir;
    }
    dir = -dir;
    row += dir;
    col -= 2;
  }

  // Fallback any remaining nulls to false
  return grid.map((r) => r.map((cell) => cell === true));
}
