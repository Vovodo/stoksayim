"""Örnek Excel dosyası oluşturur — tmp12641 klasörüne yazar."""
from pathlib import Path

from openpyxl import Workbook

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "sample-data" / "tmp12641"
OUT_DIR.mkdir(parents=True, exist_ok=True)

rows = [
    ["Etiket", "Depo", "Kalan Miktar", "Stok No", "Tanım"],
    [2004220202, "A01A", "32,51", "5410331-09", "Ornek Urun X"],
    [2004220202, "A01A", "10", "5410331-09", "Ornek Urun X"],
    [2605140130, "A01A", "2000", "4878889.20", "Ornek Urun Y"],
    [2605150160, "A01B", "85", "4878889.21", "Ornek Urun Z"],
    [2605150161, "A01B", "500", "4878889.22", "Ornek Urun W"],
    [2605150162, "A02A", "300", "4878889.23", "Ornek Urun U"],
    [2605150163, "", "50", "4878889.24", "Atanmamis Urun"],
    [2605150164, "A02A", "75", "4878889.25", "Ornek Urun T"],
]

wb = Workbook()
ws = wb.active
ws.title = "Stok"
for row in rows:
    ws.append(row)

out_path = OUT_DIR / "stok_ornek.xlsx"
wb.save(out_path)
print(f"Olusturuldu: {out_path}")
