@echo off
title Depo Sayim Sistemi - Baslatici
cd /d "%~dp0"

echo ==============================================
echo DEPO SAYIM SISTEMI BASLATILIYOR...
echo ==============================================
echo.

echo [1/4] Eski sunucu surecleri temizleniyor (5173 / 8000)...
powershell -NoProfile -Command "$ports = 5173,8000; foreach ($port in $ports) { Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }; Get-CimInstance Win32_Process -Filter 'Name = ''node.exe''' -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match 'vite' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; Start-Sleep -Seconds 1" >nul 2>&1

echo [2/4] Backend API (127.0.0.1:8000)...
cd backend
if not exist ".venv\Scripts\python.exe" (
    echo Backend sanal ortam hazirlaniyor...
    python -m venv .venv
    call .venv\Scripts\pip install -r requirements.txt httpx -q
)
start "Depo Sayim - Backend" cmd /k ".\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"

echo [3/4] Frontend UI (127.0.0.1:5173)...
cd ../frontend
if not exist "node_modules" (
    echo Frontend paketleri yukleniyor...
    call npm.cmd install
)
start "Depo Sayim - Frontend" cmd /k "npm.cmd run dev"

cd ..

echo [4/4] Tarayici otomatik aciliyor...
timeout /t 4 /nobreak > nul
start http://127.0.0.1:8000

echo.
echo ==============================================
echo   UYGULAMA BASARIYLA CALISTIRILDI
echo ==============================================
echo.
echo   Web Adresi   : http://127.0.0.1:8000 (veya http://127.0.0.1:5173)
echo   Giris        : apae1111 / twjsQ0_vay
echo.
echo   Acik pencereleri kapatmayiniz.
echo ==============================================
echo.
pause
