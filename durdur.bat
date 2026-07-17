@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
cd /d "%~dp0"

title Depo Sayim - Durduruluyor
color 0C

echo.
echo  Eski sunucu surecleri kapatiliyor...
echo.

:: Pencere basligina gore (baslat.bat ile acilan pencereler)
taskkill /FI "WINDOWTITLE eq Depo Sayim - Backend*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Depo Sayim - Frontend*" /F >nul 2>&1

:: Port 8000 ve 5173 dinleyen surecleri zorla kapat
powershell -NoProfile -Command ^
  "$ports = 8000,5173; foreach ($port in $ports) { Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }"

timeout /t 2 /nobreak >nul

echo  Backend (8000) ve Frontend (5173) durduruldu.
echo  Yeniden baslatmak icin baslat.bat calistirin.
echo.
pause
