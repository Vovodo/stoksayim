# Depo Sayım Sistemi

Excel tabanlı, QR/Barkod okuyucu destekli profesyonel depo sayım uygulaması.

## Özellikler

- Excel tek referans kaynağı (Referans, Depo, Miktar + ek sütunlar)
- Bellekte indekslenmiş O(1) barkod araması
- Otomatik raf geçişi
- Aynı referansın raf içinde birleştirilmesi
- Gerçek zamanlı sayım ve renklendirme (yeşil/sarı/kırmızı/gri)
- Atanmamış ürün ve bilinmeyen ürün yönetimi
- Raf bazlı canlı istatistikler
- Rol bazlı yetkilendirme (admin / operator)
- Excel ve PDF rapor dışa aktarımı
- WebSocket ile anlık güncelleme
- Veri erişim katmanı soyutlaması (Excel → gelecekte DB)

## Kurulum

### Tek tıkla başlat (önerilen)

Proje klasöründe **`baslat.bat`** dosyasına çift tıklayın. Backend ve frontend ayrı pencerelerde açılır; tarayıcı otomatik açılır.

Durdurmak için **`durdur.bat`** kullanın.

```cmd
baslat.bat
durdur.bat
```

PowerShell'de `npm` Execution Policy hatası veriyorsa `.bat` dosyaları `npm.cmd` kullanır.

### Render (Production — tek servis, önerilen)

Tek URL altında hem frontend hem backend çalışır (ör. `https://stoksayim.onrender.com`).

1. GitHub repo'yu Render'a bağlayın
2. **Blueprint** → kökteki `render.yaml` dosyasını kullanın  
   veya manuel Web Service oluşturup aşağıdaki komutları girin
3. **Persistent Disk** otomatik bağlanır: `/var/data` (SQLite, Excel, raporlar)

| Ayar | Değer |
|------|--------|
| Build Command | `bash scripts/build_render.sh` |
| Start Command | `bash scripts/start_render.sh` |
| Health Check | `/api/health` |

**Environment Variables:** `ENVIRONMENT=production`, `DATA_DIR=/var/data`, `SECRET_KEY` (Render otomatik üretebilir)

GitHub'a her push → Render otomatik deploy.

Yerel geliştirmede `baslat.bat` kullanmaya devam edin; `VITE_API_URL` boş bırakılır.

### Manuel kurulum

#### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python ..\scripts\create_sample_excel.py
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```cmd
cd frontend
npm.cmd install
npm.cmd run dev
```

Tarayıcı: http://localhost:5173

## Varsayılan Kullanıcılar

| Kullanıcı | Şifre | Rol |
|-----------|-------|-----|
| admin | admin123 | Yönetici — Excel yükleme, sayım başlat/bitir, rapor |
| operator | operator123 | Operatör — Barkod okutma, görüntüleme |

## Kullanım

1. **admin** ile giriş yapın
2. **Yönetim** sekmesinden Excel yükleyin (`sample-data/tmp12641/stok_ornek.xlsx`)
3. **Sayım Başlat** butonuna tıklayın
4. Barkod okuyucu ile okutmaya başlayın — sistem otomatik rafa geçer
5. Sayım bitince raporları **Rapor** sekmesinden indirin

## Örnek Excel

`sample-data/tmp12641/stok_ornek.xlsx` — spesifikasyondaki yapıya uygun örnek dosya.

Kendi dosyanızı `tmp12641` klasörüne koyup yönetim panelinden yükleyebilirsiniz.

## Mimari

```
backend/app/
  repositories/   # StockRepository, SessionRepository (soyut + Excel/SQLite)
  services/       # CountService, ReportService
  api/            # REST + WebSocket
frontend/src/     # React barkod odaklı UI
```

## Performans

- Excel yüklemede pandas + bellek indeksi
- Barkod okutma O(1) hash map erişimi
- Oturum verileri SQLite'ta kalıcı
- WebSocket ile anlık UI güncellemesi
