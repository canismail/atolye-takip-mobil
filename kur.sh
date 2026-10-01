#!/bin/bash
# Tek komutla kurulum: bash kur.sh
cd "$(dirname "$0")"
LOG=kur.log
: > "$LOG"
run() { echo ">>> $*" | tee -a "$LOG"; "$@" 2>&1 | tee -a "$LOG"; return ${PIPESTATUS[0]}; }

if ! command -v npm >/dev/null; then echo "Node.js kurulu değil: https://nodejs.org (LTS) kurup Terminal'i yeniden aç."; exit 1; fi
rm -rf node_modules package-lock.json
cp package.json package.json.bak

# Sürümleri Expo'ya seçtirmek için paket listesini sadeleştir
node -e '
const fs=require("fs");const p=JSON.parse(fs.readFileSync("package.json"));
p.dependencies={expo:"~57.0.0",react:"19.2.3","react-dom":"19.2.3","react-native":"0.86.3"};
p.devDependencies={};p.overrides={"react-dom":"19.2.3"};
fs.writeFileSync("package.json",JSON.stringify(p,null,2));'

run npm install --no-audit --no-fund || { echo "HATA: npm install (adım 1). kur.log dosyasını bana gönder."; exit 1; }
run npx expo install expo-router expo-sqlite expo-image-picker expo-image expo-file-system expo-sharing \
  expo-document-picker expo-status-bar expo-constants expo-linking expo-font expo-splash-screen \
  @expo/vector-icons @react-native-community/datetimepicker react-native-screens react-native-safe-area-context \
  || { echo "HATA: expo install (adım 2). kur.log dosyasını bana gönder."; exit 1; }
run npm install -D typescript@~5.9.2 @types/react@~19.2.0 --no-audit --no-fund
run npx --no-install tsc --noEmit
echo; echo "Kurulum bitti. Başlatılıyor (QR kodu Expo Go ile okut)..."
npx expo start
