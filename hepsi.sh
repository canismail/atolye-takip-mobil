#!/usr/bin/env bash
# Tek komut: bash hepsi.sh   → bağımlılık + tip kontrolü + Railway sunucusu + veri aktarımı + uygulama yayını
cd "$(dirname "$0")" || exit 1
set -o pipefail
echo "==> Yeni bağımlılık (expo-secure-store)"
npx expo install expo-secure-store || { echo "HATA: expo install başarısız"; exit 1; }
echo "==> Tip kontrolü"
npx --no-install tsc --noEmit || { echo "HATA: tip kontrolü başarısız"; exit 1; }
if [ ! -s sunucu-adresi.txt ]; then
  bash railway-kur.sh || exit 1
else
  echo "==> Sunucu zaten kurulu: $(cat sunucu-adresi.txt)"
fi
echo "==> Uygulama yayınlanıyor"
bash yayinla.sh
