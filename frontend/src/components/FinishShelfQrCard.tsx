import { useMemo } from "react";
import { generateQrMatrix } from "../utils/qrCodeSvg";

const COMMAND_CODE = "CMD:FINISH_SHELF";

export function FinishShelfQrCard() {
  const matrix = useMemo(() => generateQrMatrix(COMMAND_CODE), []);
  const size = matrix.length;

  const handleDownloadPng = () => {
    const canvas = document.createElement("canvas");
    const scale = 16;
    const padding = 60;
    const headerHeight = 160;
    const footerHeight = 140;

    const qrSize = size * scale;
    canvas.width = qrSize + padding * 2;
    canvas.height = qrSize + headerHeight + footerHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Arka plan
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Başlık ve Çerçeve
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 4;
    ctx.strokeRect(16, 16, canvas.width - 32, canvas.height - 32);

    // Üst Başlık Metni
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 26px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("DEPO SAYIM SİSTEMİ", canvas.width / 2, 55);

    ctx.fillStyle = "#2563eb";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText("RAF SAYIMINI BİTİR KOMUTU", canvas.width / 2, 90);

    ctx.fillStyle = "#64748b";
    ctx.font = "14px sans-serif";
    ctx.fillText(
      "Bu QR kod okutulduğunda raftaki kalan ürünler 'Bulunamadı' işaretlenir.",
      canvas.width / 2,
      125
    );

    // QR Kod Çizimi
    const startX = padding;
    const startY = headerHeight;

    // QR Sessiz Alan
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(startX - 10, startY - 10, qrSize + 20, qrSize + 20);

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        ctx.fillStyle = matrix[r][c] ? "#000000" : "#ffffff";
        ctx.fillRect(startX + c * scale, startY + r * scale, scale, scale);
      }
    }

    // Alt Açıklama
    const footerY = headerHeight + qrSize + 40;
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 18px monospace";
    ctx.fillText(`KOMUT: ${COMMAND_CODE}`, canvas.width / 2, footerY);

    ctx.fillStyle = "#475569";
    ctx.font = "13px sans-serif";
    ctx.fillText(
      "Barkod Okuyucu veya Kamera ile Sayım Ekranında Okutunuz",
      canvas.width / 2,
      footerY + 35
    );

    // İndir
    const link = document.createElement("a");
    link.download = "raf_sayimini_bitir_qr.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const handlePrint = () => {
    const printWin = window.open("", "_blank");
    if (!printWin) return;

    const svgCells = matrix
      .flatMap((row, r) =>
        row.map((cell, c) =>
          cell
            ? `<rect x="${c}" y="${r}" width="1" height="1" fill="#000000" />`
            : ""
        )
      )
      .join("");

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Raf Sayımını Bitir QR Kodu</title>
          <style>
            @page { size: A4 portrait; margin: 20mm; }
            body {
              font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              color: #0f172a;
              margin: 0;
              padding: 40px 20px;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              text-align: center;
            }
            .card {
              border: 3px solid #1e293b;
              border-radius: 16px;
              padding: 40px;
              max-width: 500px;
              width: 100%;
              box-sizing: border-box;
              background: #ffffff;
              box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1);
            }
            .badge {
              display: inline-block;
              background: #eff6ff;
              color: #1d4ed8;
              border: 1px solid #bfdbfe;
              font-weight: 700;
              font-size: 13px;
              padding: 6px 16px;
              border-radius: 999px;
              letter-spacing: 0.05em;
              text-transform: uppercase;
              margin-bottom: 12px;
            }
            h1 {
              margin: 0 0 8px 0;
              font-size: 24px;
              color: #0f172a;
            }
            p.sub {
              margin: 0 0 28px 0;
              font-size: 14px;
              color: #475569;
              line-height: 1.5;
            }
            .qr-container {
              background: #ffffff;
              padding: 16px;
              border: 2px solid #e2e8f0;
              border-radius: 12px;
              display: inline-block;
              margin-bottom: 24px;
            }
            svg {
              width: 240px;
              height: 240px;
              display: block;
            }
            .code-box {
              background: #f8fafc;
              border: 1px solid #cbd5e1;
              border-radius: 8px;
              padding: 10px 16px;
              font-family: monospace;
              font-weight: bold;
              font-size: 16px;
              color: #0f172a;
              letter-spacing: 0.05em;
              margin-bottom: 24px;
            }
            ol.steps {
              text-align: left;
              font-size: 13px;
              color: #334155;
              padding-left: 20px;
              margin: 0;
              line-height: 1.7;
            }
            @media print {
              body { padding: 0; }
              .card { border-color: #000; box-shadow: none; }
            }
          </style>
        </head>
        <body>
          <div class="card">
            <span class="badge">Hızlı Sayım Komutu</span>
            <h1>Raf Sayımını Bitir</h1>
            <p class="sub">
              Sayımdaki raf için kalan tüm ürünleri otomatik olarak <strong>"Bulunamadı"</strong> işaretler.
            </p>
            <div class="qr-container">
              <svg viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">
                <rect width="${size}" height="${size}" fill="#ffffff" />
                ${svgCells}
              </svg>
            </div>
            <div class="code-box">KOMUT KODU: ${COMMAND_CODE}</div>
            <ol class="steps">
              <li>Raf sayımına başlayıp gördüğünüz ürünleri okutun.</li>
              <li>Fiziki ürünler bittiğinde bu QR kodu okutun.</li>
              <li>Sistem kalan eksik ürünleri Otomatik Bulunamadı olarak kaydeder.</li>
            </ol>
          </div>
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `;

    printWin.document.open();
    printWin.document.write(html);
    printWin.document.close();
  };

  return (
    <section className="manage-card rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/10 to-transparent bg-slate-900/80 backdrop-blur-sm overflow-hidden">
      <div className="px-5 pt-5 pb-4 border-b border-slate-800/80">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-950/60 border border-slate-700/60 text-lg">
              ⚡
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-slate-100 tracking-tight">
                  Raf Sayımını Bitir QR Kodu
                </h2>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  Otomatik Bulunamadı
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Bu QR kodu çıktı alıp barkod okuyucuyla okuttuğunuzda; aktif rafta kalan tüm
                sayılmamış ürünler tek tıkla <strong>"Bulunamadı"</strong> işaretlenir ve sayım durmaksızın sonraki rafa geçer.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-5 flex flex-col sm:flex-row items-center gap-6">
        {/* Visual QR Code Display */}
        <div className="shrink-0 flex flex-col items-center bg-white p-3 rounded-xl border border-slate-700 shadow-md shadow-black/40">
          <svg
            viewBox={`0 0 ${size} ${size}`}
            className="w-36 h-36 sm:w-40 sm:h-40"
            shapeRendering="crispEdges"
          >
            <rect width={size} height={size} fill="#ffffff" />
            {matrix.map((row, r) =>
              row.map((cell, c) =>
                cell ? (
                  <rect
                    key={`${r}-${c}`}
                    x={c}
                    y={r}
                    width={1}
                    height={1}
                    fill="#000000"
                  />
                ) : null
              )
            )}
          </svg>
          <span className="mt-2 text-[11px] font-mono font-bold text-slate-800 tracking-wider">
            {COMMAND_CODE}
          </span>
        </div>

        {/* Info & Action Buttons */}
        <div className="space-y-4 text-center sm:text-left flex-1 min-w-0">
          <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-3.5 space-y-1.5 text-xs text-slate-300">
            <p className="font-medium text-slate-200">Kullanım Senaryosu:</p>
            <p className="text-slate-400 leading-normal">
              Örn: Rafta 10 koli var ama fiziki 8 koli var. 8 ürünü okuttuktan sonra bu QR kodu
              okutarak kalan 2 koliyi hızlıca bulunamadı işaretleyip yeni rafa geçebilirsiniz.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
            <button
              type="button"
              onClick={handleDownloadPng}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-900/40 transition-all cursor-pointer"
            >
              📥 QR Kodu İndir (PNG)
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-600 hover:border-slate-500 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all cursor-pointer"
            >
              🖨️ A4 Yazdır / Çıktı Al
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
