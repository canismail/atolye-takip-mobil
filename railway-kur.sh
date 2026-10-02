#!/usr/bin/env bash
# Atölye sunucusunu Railway'e kurar. Tek komut:  bash railway-kur.sh
# Sizden istenenler: Railway girişi (tarayıcı açılır), uygulama için kullanıcı adı + şifre belirlemek.
cd "$(dirname "$0")" || exit 1
LOG="railway-kur.log"; : > "$LOG"
exec > >(tee -a "$LOG") 2>&1
SVC="atolye-sunucu"
say(){ printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die(){ printf '\n\033[31mHATA: %s\033[0m\nAyrıntı: %s\n' "$*" "$PWD/$LOG"; exit 1; }

say "1/7 Railway CLI"
if command -v railway >/dev/null 2>&1; then RW=(railway)
else
  command -v npm >/dev/null 2>&1 || die "npm bulunamadı."
  npm install -g @railway/cli >/dev/null 2>&1 && command -v railway >/dev/null 2>&1 && RW=(railway) || RW=(npx -y @railway/cli)
fi
"${RW[@]}" --version || die "Railway CLI çalışmadı."

say "2/7 Railway girişi"
if ! "${RW[@]}" whoami >/dev/null 2>&1; then
  echo "Tarayıcı açılacak; Railway hesabınızla giriş yapıp onaylayın."
  "${RW[@]}" login || die "Giriş yapılamadı."
fi
"${RW[@]}" whoami

say "3/7 Uygulama giriş bilgileri (telefondaki giriş ekranında kullanacaksınız)"
read -r -p "Kullanıcı adı [can]: " APP_USER; APP_USER=${APP_USER:-can}
while true; do
  read -r -s -p "Şifre (en az 8 karakter): " P1; echo
  read -r -s -p "Şifre (tekrar): " P2; echo
  [ "$P1" = "$P2" ] && [ "${#P1}" -ge 8 ] && break
  echo "Şifreler uyuşmuyor ya da 8 karakterden kısa."
done
SECRET=$(openssl rand -hex 32)

say "4/7 Proje ve servis"
if ! "${RW[@]}" status >/dev/null 2>&1; then
  "${RW[@]}" init --name atolye-yonetim || die "Proje oluşturulamadı."
fi
VARS=(--variables "APP_USERNAME=$APP_USER" --variables "APP_PASSWORD=$P1" --variables "TOKEN_SECRET=$SECRET"
      --variables "DATA_DIR=/data" --variables "RAILWAY_RUN_UID=0")
if ! "${RW[@]}" add --service "$SVC" "${VARS[@]}"; then
  echo "(add --variables desteklenmedi; değişkenler ayrıca ayarlanacak)"
  "${RW[@]}" add --service "$SVC" || die "Servis oluşturulamadı."
  for kv in "APP_USERNAME=$APP_USER" "APP_PASSWORD=$P1" "TOKEN_SECRET=$SECRET" "DATA_DIR=/data" "RAILWAY_RUN_UID=0"; do
    "${RW[@]}" variable set "$kv" -s "$SVC" >/dev/null 2>&1 || "${RW[@]}" variables --set "$kv" -s "$SVC" >/dev/null 2>&1 || echo "Değişken ayarlanamadı: ${kv%%=*}"
  done
fi

say "5/7 Kalıcı disk (/data)"
if ! "${RW[@]}" volume add --mount-path /data -s "$SVC" 2>/dev/null && ! "${RW[@]}" volume add -m /data -s "$SVC" 2>/dev/null; then
  echo "UYARI: Disk komutla eklenemedi. railway.com → projeniz → '$SVC' servisi → sağ tık/Settings → Volumes → Mount path: /data"
  echo "Eklediyseniz devam edin; eklemediyseniz veriler her yeniden başlatmada silinir."
  read -r -p "Diski eklediniz mi? Enter'a basın..." _
fi

say "6/7 Yükleniyor (birkaç dakika sürer)"
"${RW[@]}" up --detach -s "$SVC" || die "Yükleme başlatılamadı."

say "7/7 Adres"
DOMAIN_OUT=$("${RW[@]}" domain -s "$SVC" 2>&1); echo "$DOMAIN_OUT"
URL=$(echo "$DOMAIN_OUT" | grep -Eo 'https://[A-Za-z0-9._-]+' | head -1)
if [ -z "$URL" ]; then
  D=$(echo "$DOMAIN_OUT" | grep -Eo '[A-Za-z0-9-]+\.up\.railway\.app' | head -1); [ -n "$D" ] && URL="https://$D"
fi
[ -n "$URL" ] || die "Adres alınamadı. railway.com'da servis → Settings → Networking → Generate Domain yapın."
echo "$URL" > sunucu-adresi.txt

echo "Sunucunun ayağa kalkması bekleniyor..."
OK=0
for i in $(seq 1 60); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$URL/health")" = "200" ]; then OK=1; break; fi
  sleep 8
done
[ "$OK" = 1 ] || die "Sunucu 8 dakikada hazır olmadı. railway.com → servis → Deployments → Logs'a bakın."

python3 - "$URL" <<'PY'
import json, sys
p = 'app.json'; d = json.load(open(p))
d['expo'].setdefault('extra', {})['serverUrl'] = sys.argv[1]
json.dump(d, open(p, 'w'), indent=2, ensure_ascii=False)
PY

printf '\n\033[32mSunucu hazır: %s\033[0m\n' "$URL"
read -r -p "Masaüstündeki (Streamlit) verileri şimdi sunucuya aktaralım mı? (e/h) [e]: " ANS
if [ "${ANS:-e}" != "h" ]; then
  ERP="${ERP_DIR:-$HOME/Desktop/ERP-AI}"
  ERP_PASS="$P1" python3 tools/tasi.py --erp "$ERP" --url "$URL" --user "$APP_USER" --yes || echo "Aktarım yapılamadı; sonra 'python3 tools/tasi.py' ile tekrar deneyin."
fi
printf '\nBitti. Adres: %s  (sunucu-adresi.txt dosyasında da var)\n' "$URL"
