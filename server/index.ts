/** Atölye Yönetim sunucusu. Telefondaki uygulamayla AYNI iş mantığını (src/repo) çalıştırır;
 *  uygulama `POST /rpc` ile repository metodlarını çağırır. Bağımlılık yok: Node 22 + node:sqlite. */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { initDb } from '../src/db/migrate';
import { createRepo } from '../src/repo';
import { openSqlite } from './sqliteAdapter';

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
const USERNAME = process.env.APP_USERNAME || '';
const PASSWORD = process.env.APP_PASSWORD || '';
const SECRET = process.env.TOKEN_SECRET || '';
const TOKEN_DAYS = 30;
const IMG_DIR = join(DATA_DIR, 'images');
const BACKUP_DIR = join(DATA_DIR, 'backups');
const DB_FILE = join(DATA_DIR, 'atolye.db');

if (!USERNAME || PASSWORD.length < 8 || SECRET.length < 24) {
  console.error('APP_USERNAME, APP_PASSWORD (en az 8 karakter) ve TOKEN_SECRET (en az 24 karakter) ayarlanmalı.');
  process.exit(1);
}
for (const d of [DATA_DIR, IMG_DIR, BACKUP_DIR]) mkdirSync(d, { recursive: true });

const db = openSqlite(DB_FILE);
await db.exec('PRAGMA journal_mode = WAL');
await initDb(db);
const repo = createRepo(db) as Record<string, Record<string, (...a: unknown[]) => Promise<unknown>>>;

// ---------------------------------------------------------------- yardımcılar
const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const sign = (s: string) => createHmac('sha256', SECRET).update(s).digest('base64url');
const safeEq = (a: string, b: string) => {
  const x = createHmac('sha256', 'k').update(a).digest(), y = createHmac('sha256', 'k').update(b).digest();
  return timingSafeEqual(x, y);
};
function makeToken(): string {
  const payload = b64(JSON.stringify({ u: USERNAME, exp: Date.now() + TOKEN_DAYS * 864e5 }));
  return `${payload}.${sign(payload)}`;
}
function verifyToken(t: string | null | undefined): boolean {
  if (!t) return false;
  const [payload, sig] = t.split('.');
  if (!payload || !sig || !safeEq(sig, sign(payload))) return false;
  try {
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return p.u === USERNAME && Number(p.exp) > Date.now();
  } catch {
    return false;
  }
}
const bearer = (req: IncomingMessage) => {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
};

// Giriş denemesi sınırı: IP başına 15 dakikada 10 hatalı deneme
const fails = new Map<string, { n: number; until: number }>();
const clientIp = (req: IncomingMessage) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

function send(res: ServerResponse, code: number, body: unknown, headers: Record<string, string> = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(data);
}
async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw Object.assign(new Error('İstek çok büyük.'), { code: 413 });
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks);
}

// Tüm veritabanı çağrıları sırayla çalışır: eşzamanlı isteklerin işlemleri (transaction) birbirine karışmasın.
let queue: Promise<unknown> = Promise.resolve();
const serial = <T>(fn: () => Promise<T>): Promise<T> => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
};

async function callOne(c: { repo?: string; method?: string; args?: unknown[] }) {
  const r = c.repo && Object.hasOwn(repo, c.repo) ? repo[c.repo] : null;
  const fn = r && c.method && Object.hasOwn(r, c.method) ? r[c.method] : null;
  if (typeof fn !== 'function') throw new Error(`Bilinmeyen çağrı: ${c.repo}.${c.method}`);
  // JSON'da `undefined` yoktur: istemci üst düzey undefined argümanları {"__u":1} olarak gönderir.
  const args = (Array.isArray(c.args) ? c.args : []).map((a) =>
    a && typeof a === 'object' && (a as { __u?: number }).__u === 1 && Object.keys(a).length === 1 ? undefined : a);
  const out = await fn(...args);
  if (c.repo === 'backup' && c.method === 'resetAll') clearImages(); // fotoğraflar da silinir
  return out;
}
function clearImages() {
  for (const f of readdirSync(IMG_DIR)) { try { unlinkSync(join(IMG_DIR, f)); } catch { /* yoksay */ } }
}

// ---------------------------------------------------------------- yedek (günde bir, 14 adet)
async function dailyBackup() {
  const stamp = new Date().toISOString().slice(0, 10);
  const file = join(BACKUP_DIR, `atolye_${stamp}.db`);
  if (existsSync(file)) return;
  await serial(async () => { await db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`); });
  const files = readdirSync(BACKUP_DIR).filter((f) => f.startsWith('atolye_') && f.endsWith('.db')).sort().reverse();
  for (const f of files.slice(14)) { try { unlinkSync(join(BACKUP_DIR, f)); } catch { /* yoksay */ } }
  console.log('Yedek alındı:', file);
}
dailyBackup().catch((e) => console.error('Yedek hatası', e));
setInterval(() => dailyBackup().catch((e) => console.error('Yedek hatası', e)), 6 * 3600 * 1000);

// ---------------------------------------------------------------- HTTP
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;
const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://x');
    const path = url.pathname;

    if (req.method === 'GET' && path === '/health') return send(res, 200, { ok: true });

    if (req.method === 'POST' && path === '/login') {
      const ip = clientIp(req);
      const f = fails.get(ip);
      if (f && f.n >= 10 && f.until > Date.now()) return send(res, 429, { error: 'Çok fazla deneme. Biraz bekleyin.' });
      const body = JSON.parse((await readBody(req, 10_000)).toString() || '{}');
      const ok = safeEq(String(body.username ?? ''), USERNAME) && safeEq(String(body.password ?? ''), PASSWORD);
      if (!ok) {
        const cur = f && f.until > Date.now() ? f : { n: 0, until: Date.now() + 15 * 60_000 };
        fails.set(ip, { n: cur.n + 1, until: cur.until });
        await new Promise((r) => setTimeout(r, 800));
        return send(res, 401, { error: 'Kullanıcı adı veya şifre hatalı.' });
      }
      fails.delete(ip);
      return send(res, 200, { token: makeToken() });
    }

    // Diğer her şey için oturum gerekir (fotoğraflarda ?t= ile de kabul edilir)
    const token = bearer(req) || (req.method === 'GET' && path.startsWith('/images/') ? url.searchParams.get('t') : null);
    if (!verifyToken(token)) return send(res, 401, { error: 'Oturum gerekli.' });

    if (req.method === 'POST' && path === '/rpc') {
      const body = JSON.parse((await readBody(req, 25_000_000)).toString() || '{}');
      const calls = Array.isArray(body) ? body : [body];
      if (calls.length > 100) return send(res, 400, { error: 'Çok fazla çağrı.' });
      const results = await serial(async () => {
        const out: unknown[] = [];
        for (const c of calls) {
          try { out.push({ result: (await callOne(c)) ?? null }); }
          catch (e) { out.push({ error: String((e as Error).message ?? e) }); }
        }
        return out;
      });
      return send(res, 200, Array.isArray(body) ? results : results[0]);
    }

    const m = /^\/images\/([^/]+)$/.exec(path);
    if (m) {
      const name = decodeURIComponent(m[1]);
      if (!NAME_RE.test(name)) return send(res, 400, { error: 'Geçersiz dosya adı.' });
      const file = join(IMG_DIR, name);
      if (req.method === 'GET') {
        if (!existsSync(file) || !statSync(file).isFile()) return send(res, 404, { error: 'Yok.' });
        const ext = name.split('.').pop()!.toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'private, max-age=86400',
          'X-Content-Type-Options': 'nosniff' });
        return res.end(readFileSync(file));
      }
      if (req.method === 'PUT') {
        const ext = name.split('.').pop()!.toLowerCase();
        if (!MIME[ext]) return send(res, 400, { error: 'Yalnızca jpg/png/webp.' });
        writeFileSync(file, await readBody(req, 15_000_000));
        return send(res, 200, { ok: true });
      }
      if (req.method === 'DELETE') {
        try { unlinkSync(file); } catch { /* zaten yok */ }
        return send(res, 200, { ok: true });
      }
    }
    return send(res, 404, { error: 'Bulunamadı.' });
  } catch (e) {
    const code = (e as { code?: number }).code === 413 ? 413 : 500;
    if (code === 500) console.error(e);
    send(res, code, { error: code === 413 ? 'İstek çok büyük.' : 'Sunucu hatası.' });
  }
}).listen(PORT, () => console.log(`Atölye sunucusu ${PORT} portunda. Veri: ${DATA_DIR}`));
