#!/bin/bash
# ERP-Mobile -> https://github.com/canismail/atolye-takip-mobil
cd "$(dirname "$0")"
find .git -name '*.lock' -delete 2>/dev/null
find .git/objects -name 'tmp_obj_*' -delete 2>/dev/null
git rm -q --cached package.json.bak 2>/dev/null
git add -A
git diff --cached --quiet || git commit -q -m "Yeni: makine bazli uretim plani (makineler, sok-tak, gun bazli cizelge, elle tasima), stok maliyet/net kar

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LRVec6Am2Z9Cr9LwEXxnCv"
git remote get-url origin >/dev/null 2>&1 || git remote add origin https://github.com/canismail/atolye-takip-mobil.git
git branch -M main
if git push -u origin main; then
  echo "✅ GitHub'a gönderildi: https://github.com/canismail/atolye-takip-mobil"
else
  echo "❌ Push başarısız. GitHub girişi gerekiyorsa: 'gh auth login' çalıştırıp bu scripti tekrar çalıştırın."
fi
