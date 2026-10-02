#!/usr/bin/env python3
"""Masaüstü (Streamlit) sürümündeki erp.db verisini ve fotoğrafları sunucuya taşır.
Yalnızca Python 3 standart kütüphanesini kullanır.
Kullanım:  python3 tools/tasi.py [--erp ~/Desktop/ERP-AI] [--url https://...]  (--db dosya.db ile doğrudan db de verilebilir)
UYARI: Sunucudaki mevcut veri, masaüstündeki verilerle DEĞİŞTİRİLİR."""
import argparse, getpass, json, os, sqlite3, sys, urllib.request, urllib.error
from datetime import datetime, timezone

TABLES = ['settings', 'customers', 'products', 'stock_items', 'stock_movements',
          'product_materials', 'product_operations', 'sales', 'transactions', 'work_orders']


def req(url, method='GET', body=None, token=None, ctype='application/json'):
    data = body if isinstance(body, (bytes, type(None))) else json.dumps(body).encode()
    r = urllib.request.Request(url, data=data, method=method)
    if data is not None: r.add_header('Content-Type', ctype)
    if token: r.add_header('Authorization', 'Bearer ' + token)
    try:
        with urllib.request.urlopen(r, timeout=120) as resp:
            raw = resp.read()
            return json.loads(raw) if raw and resp.headers.get('Content-Type', '').startswith('application/json') else raw
    except urllib.error.HTTPError as e:
        try: msg = json.loads(e.read()).get('error')
        except Exception: msg = None
        sys.exit(f'Sunucu hatası {e.code}: {msg or e.reason}')
    except urllib.error.URLError as e:
        sys.exit(f'Sunucuya ulaşılamadı: {e.reason}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--erp', default=os.path.expanduser('~/Desktop/ERP-AI'))
    ap.add_argument('--db'); ap.add_argument('--url'); ap.add_argument('--user'); ap.add_argument('--yes', action='store_true')
    ap.add_argument('--json-only', help='Yedeği bu dosyaya yaz, yükleme yapma')
    a = ap.parse_args()
    db_path = a.db or os.path.join(a.erp, 'data', 'erp.db')
    img_dir = os.path.join(os.path.dirname(db_path), 'images')
    if not os.path.exists(db_path): sys.exit(f'Veritabanı bulunamadı: {db_path}')

    con = sqlite3.connect(f'file:{db_path}?mode=ro', uri=True); con.row_factory = sqlite3.Row
    have = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    tables = {t: [dict(r) for r in con.execute(f'SELECT * FROM {t}')] for t in TABLES if t in have}
    backup = {'app': 'atolye-yonetim', 'version': 1, 'exported_at': datetime.now(timezone.utc).isoformat(), 'tables': tables}
    print('Okunan kayıtlar:', ', '.join(f'{t}={len(v)}' for t, v in tables.items()))
    if a.json_only:
        json.dump(backup, open(a.json_only, 'w'), ensure_ascii=False); print('Yazıldı:', a.json_only); return

    url = (a.url or input('Sunucu adresi (https://...): ')).strip().rstrip('/')
    if not url.startswith('http'): url = 'https://' + url
    user = a.user or input('Kullanıcı adı: ').strip()
    pw = os.environ.get('ERP_PASS') or getpass.getpass('Şifre: ')
    tok = req(url + '/login', 'POST', {'username': user, 'password': pw}).get('token')
    if not a.yes:
        if input('Sunucudaki veri bu verilerle DEĞİŞTİRİLECEK. Devam? (evet/hayır): ').strip().lower() not in ('evet', 'e', 'yes', 'y'):
            sys.exit('Vazgeçildi.')
    r = req(url + '/rpc', 'POST', {'repo': 'backup', 'method': 'importAll', 'args': [backup]}, tok)
    if r.get('error'): sys.exit('Aktarım hatası: ' + r['error'])
    print('Veriler aktarıldı.')

    names = set()
    for t in ('products', 'stock_items'):
        for row in tables.get(t, []):
            if row.get('image'): names.add(row['image'])
    sent = miss = 0
    for n in sorted(names):
        p = os.path.join(img_dir, n)
        if not os.path.isfile(p): miss += 1; continue
        req(f'{url}/images/{urllib.request.quote(n)}', 'PUT', open(p, 'rb').read(), tok, 'image/jpeg'); sent += 1
    print(f'Fotoğraflar: {sent} yüklendi, {miss} dosya bulunamadı.')
    print('Tamam.')

main()
