#!/usr/bin/env bash
# Sunucuyu Railway'e yeniden yükler:  bash sunucu-guncelle.sh
cd "$(dirname "$0")" || exit 1
RW=railway; command -v railway >/dev/null 2>&1 || RW="npx -y @railway/cli"
$RW up --detach -s atolye-sunucu || { echo "HATA: yükleme başlatılamadı"; exit 1; }
URL=$(cat sunucu-adresi.txt 2>/dev/null)
sleep 20
for i in $(seq 1 60); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$URL/health")" = "200" ]; then
    echo "Sunucu hazır: $URL"
    # Panel yerel modda bırakıldıysa (server.txt.kapali) sunucu moduna geri al
    ERP="${ERP_DIR:-$HOME/Desktop/ERP-AI}"
    if [ -f "$ERP/server.txt.kapali" ] && [ ! -f "$ERP/server.txt" ]; then mv "$ERP/server.txt.kapali" "$ERP/server.txt" && echo "ERP-AI paneli tekrar sunucu moduna alındı."; fi
    exit 0
  fi
  sleep 8
done
echo "Sunucu hazır olmadı; railway.com → Deployments → Logs'a bakın."
