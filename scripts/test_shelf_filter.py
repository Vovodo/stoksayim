import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from app.repositories.excel_repository import ExcelStockRepository
from app.utils.depo import normalize_depo

repo = ExcelStockRepository()
repo.load_from_excel(str(ROOT / "backend" / "uploads" / "tmp12641.xlsx"))

for rack in ["A01A", "A01E", "9999"]:
    items = repo.get_shelf_items(rack)
    print(f"=== {rack} -> {len(items)} lines ===")
    for it in items[:3]:
        e = it["extra"]
        tanim = str(e.get("Tanım", e.get("Tanim", "")))[:45]
        print(f"  etiket={it['etiket']} stok={e.get('Stok No')} depo={e.get('Depo')} tanim={tanim}")
    bad = [it for it in items if normalize_depo(it["extra"].get("Depo")) != normalize_depo(rack)]
    print(f"  WRONG DEPO: {len(bad)}")
