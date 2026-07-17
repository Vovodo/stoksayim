"""logo.png dosyasından favicon, PWA ve uygulama ikonlarını üretir."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "logo.png"
PUBLIC = ROOT / "frontend" / "public"

SIZES: dict[str, int] = {
    "favicon-16x16.png": 16,
    "favicon-32x32.png": 32,
    "apple-touch-icon.png": 180,
    "android-chrome-192x192.png": 192,
    "android-chrome-512x512.png": 512,
    "logo.png": 512,
    "logo-256.png": 256,
}


def fit_square(img: Image.Image, size: int) -> Image.Image:
    copy = img.copy()
    copy.thumbnail((size, size), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    offset = ((size - copy.width) // 2, (size - copy.height) // 2)
    canvas.paste(copy, offset, copy if copy.mode == "RGBA" else None)
    return canvas


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"Kaynak logo bulunamadı: {SOURCE}")

    PUBLIC.mkdir(parents=True, exist_ok=True)
    src = Image.open(SOURCE).convert("RGBA")

    for name, size in SIZES.items():
        out = fit_square(src, size)
        out.save(PUBLIC / name, optimize=True)

    ico_sizes = [16, 32, 48]
    ico_images = [fit_square(src, s) for s in ico_sizes]
    ico_images[0].save(
        PUBLIC / "favicon.ico",
        format="ICO",
        sizes=[(s, s) for s in ico_sizes],
        append_images=ico_images[1:],
    )

    print(f"Marka varlıkları oluşturuldu: {PUBLIC}")


if __name__ == "__main__":
    main()
