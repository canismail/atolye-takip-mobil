#!/usr/bin/env bash
# Tek komut: bash hepsini-gonder.sh
#   1) sunucuyu (Railway) günceller  2) mobil uygulamayı yayınlar  3) iki GitHub deposunu gönderir
cd "$(dirname "$0")" || exit 1
echo "==> 1/4 Sunucu güncelleniyor"
bash sunucu-guncelle.sh || { echo "❌ Sunucu güncellemesi başarısız (GitHub'a gönderim yapılmadı)"; exit 1; }
echo "==> 2/4 Mobil uygulama yayınlanıyor"
bash yayinla.sh || { echo "❌ Uygulama yayını başarısız (GitHub'a gönderim yapılmadı)"; exit 1; }
echo "==> 3/4 GitHub: mobil + sunucu"
bash github-push.sh
echo "==> 4/4 GitHub: web (ERP-AI)"
bash ../ERP-AI/github-push.sh
echo "✅ Bitti."
