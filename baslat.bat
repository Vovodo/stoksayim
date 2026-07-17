@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
cd /d "%~dp0"

set "NODE_OPTIONS=--use-system-ca"
set "APP_URL=http://localhost:5173"
set "API_URL=http://127.0.0.1:8000"

title Depo Sayim Sistemi - Baslatiliyor
color 0A
cls

echo.
echo  ========================================================
echo    DEPO SAYIM SISTEMI
echo  ========================================================
echo.

:: --- Eski sunuculari kapat (port 8000/5173 tutan eski backend sorununu onler) ---
echo [0/4] Eski sunucu surecleri kontrol ediliyor...
taskkill /FI "WINDOWTITLE eq Depo Sayim - Backend*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Depo Sayim - Frontend*" /F >nul 2>&1
powershell -NoProfile -Command "$ports = 8000,5173; foreach ($port in $ports) { Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }"
timeout /t 2 /nobreak >nul
echo       Tamam.

:: --- Backend kurulum ---
if not exist "backend\.venv\Scripts\python.exe" (
    echo [1/4] Backend sanal ortami kuruluyor...
    cd backend
    python -m venv .venv
    if errorlevel 1 (
        echo HATA: Python bulunamadi. Python 3.10+ yukleyin.
        pause
        exit /b 1
    )
    call .venv\Scripts\pip install -r requirements.txt httpx -q
    cd ..
    echo       Tamam.
) else (
    echo [1/4] Backend hazir.
)

:: --- Frontend kurulum ---
if not exist "frontend\node_modules" (
    echo [2/4] Frontend bagimliliklari kuruluyor...
    cd frontend
    call npm.cmd install
    if errorlevel 1 (
        echo.
        echo HATA: npm install basarisiz oldu.
        pause
        exit /b 1
    )
    cd ..
    echo       Tamam.
) else (
    echo [2/4] Frontend hazir.
)

:: --- Ornek Excel ---
if not exist "sample-data\tmp12641\stok_ornek.xlsx" (
    echo [3/4] Ornek Excel dosyasi olusturuluyor...
    backend\.venv\Scripts\python scripts\create_sample_excel.py
    echo       Tamam.
) else (
    echo [3/4] Ornek Excel mevcut.
)

:: --- Klasorler ---
if not exist "backend\data" mkdir "backend\data"
if not exist "backend\uploads" mkdir "backend\uploads"
if not exist "backend\reports" mkdir "backend\reports"
if not exist "backend\logs" mkdir "backend\logs"

echo [4/4] Sunucular baslatiliyor...
echo.

:: Backend penceresi
start "Depo Sayim - Backend" cmd /k "title Depo Sayim - Backend ^| %API_URL% && cd /d "%~dp0backend" && .venv\Scripts\uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"

:: Backend hazir olana kadar bekle (max 30 sn)
set /a WAIT=0
:WAIT_BACKEND
curl -s -o nul -w "%%{http_code}" "%API_URL%/api/health" 2>nul | findstr "200" >nul
if !errorlevel! equ 0 (
  curl -s "%API_URL%/openapi.json" 2>nul | findstr /C:"admin/reset" >nul
  if !errorlevel! equ 0 goto BACKEND_OK
)
set /a WAIT+=1
if !WAIT! geq 30 (
  echo UYARI: Backend gecikti veya eski surum calisiyor olabilir.
  echo        durdur.bat calistirip tekrar deneyin.
  goto BACKEND_OK
)
timeout /t 1 /nobreak >nul
goto WAIT_BACKEND

:BACKEND_OK
echo       Backend hazir: %API_URL%

:: Frontend penceresi
start "Depo Sayim - Frontend" cmd /k "title Depo Sayim - Frontend ^| %APP_URL% && cd /d "%~dp0frontend" && set NODE_OPTIONS=--use-system-ca && npm.cmd run dev"

:: Frontend hazir olana kadar bekle (max 45 sn)
set /a WAIT=0
:WAIT_FRONTEND
curl -s -o nul "%APP_URL%" 2>nul
if !errorlevel! equ 0 goto FRONTEND_OK
set /a WAIT+=1
if !WAIT! geq 45 (
    echo UYARI: Frontend gecikti, tarayici yine de acilacak...
    goto FRONTEND_OK
)
timeout /t 1 /nobreak >nul
goto WAIT_FRONTEND

:FRONTEND_OK
echo       Frontend hazir: %APP_URL%
echo.

:: Tarayiciyi ac
start "" "%APP_URL%"

cls
echo.
echo  ========================================================
echo    UYGULAMA CALISIYOR
echo  ========================================================
echo.
echo  Tarayici acildi: %APP_URL%
echo  Backend API   : %API_URL%
echo.
echo  GIRIS BILGILERI:
echo    Yonetici  -> admin    / admin123
echo    Operator  -> operator / operator123
echo.
echo  ILK KULLANIM:
echo    1. admin ile giris yapin
echo    2. Yonetim sekmesinden Excel yukleyin
echo       (ornek: sample-data\tmp12641\stok_ornek.xlsx)
echo    3. Sayim Baslat'a tiklayin
echo    4. Barkod okuyucu ile okutmaya baslayin
echo.
echo  Backend ve Frontend ayri pencerelerde calisiyor.
echo  Uygulamayi kapatmak icin o pencereleri kapatin.
echo.
echo  ========================================================
echo.
pause
