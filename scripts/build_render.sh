#!/usr/bin/env bash
# Render build: frontend production build + backend bağımlılıkları + static kopyalama
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Frontend build"
cd frontend
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi
npm run build
cd "$ROOT"

echo "==> Static dosyalar backend/static altına kopyalanıyor"
rm -rf backend/static
mkdir -p backend/static
cp -r frontend/dist/* backend/static/

echo "==> Backend Python bağımlılıkları"
cd backend
pip install -r requirements.txt

echo "==> Build tamamlandı"
