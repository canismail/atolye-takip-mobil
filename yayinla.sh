#!/bin/bash
# Uygulamayı Expo sunucusuna yükler: bash yayinla.sh
cd "$(dirname "$0")"
LOG=yayinla.log
: > "$LOG"
run() { echo ">>> $*" | tee -a "$LOG"; "$@" 2>&1 | tee -a "$LOG"; return ${PIPESTATUS[0]}; }
fail() { echo; echo "HATA: $1 — yayinla.log dosyasını bana gönder (içeriğini yapıştırmana gerek yok, 'hata aldım' yaz)."; exit 1; }

npx expo whoami >/dev/null 2>&1 || { echo "Önce giriş yap: npx expo login"; exit 1; }
echo "Hesap: $(npx expo whoami 2>/dev/null)"

run npx expo install expo-updates || fail "expo-updates kurulumu"
if ! grep -q '"projectId"' app.json; then
  run npx eas-cli@latest init --non-interactive --force || fail "eas init (proje oluşturma)"
fi
run npx eas-cli@latest update --branch production --message "ilk surum" --non-interactive || fail "eas update (yükleme)"

echo
echo "Yükleme bitti. Yukarıdaki çıktıda 'Update link' / QR görünür."
echo "iPhone'da: Expo Go -> aynı hesapla giriş -> 'Projects' sekmesinde 'atolye-yonetim' -> açılır."
