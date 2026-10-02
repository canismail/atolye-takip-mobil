import { monthKey } from '../domain/format';
import type { Repo } from './index';

/** Sunucudaki `createRepo` ile aynı şekle sahip istemci. Çağrılar aynı "tick" içinde toplanıp tek istekte gider. */
export function createApiRepo(getBase: () => { url: string; token: string } | null, onAuthError: () => void): Repo {
  type Pending = { repo: string; method: string; args: unknown[]; resolve: (v: unknown) => void; reject: (e: Error) => void };
  let queue: Pending[] = [];
  let scheduled = false;

  const enc = (a: unknown) => (a === undefined ? { __u: 1 } : a);

  async function flush() {
    scheduled = false;
    const batch = queue;
    queue = [];
    if (!batch.length) return;
    const s = getBase();
    if (!s) return batch.forEach((p) => p.reject(new Error('Oturum yok.')));
    try {
      let res: Response;
      try {
        res = await fetch(`${s.url}/rpc`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.token}` },
          body: JSON.stringify(batch.map((p) => ({ repo: p.repo, method: p.method, args: p.args.map(enc) }))),
        });
      } catch {
        throw new Error('Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.');
      }
      if (res.status === 401) { onAuthError(); throw new Error('Oturum süresi doldu, yeniden giriş yapın.'); }
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? `Sunucu hatası (${res.status}).`);
      }
      const out = (await res.json()) as { result?: unknown; error?: string }[];
      batch.forEach((p, i) => {
        const o = out[i];
        if (!o) p.reject(new Error('Sunucudan eksik yanıt.'));
        else if (o.error) p.reject(new Error(o.error));
        else p.resolve(o.result ?? undefined);
      });
    } catch (e) {
      batch.forEach((p) => p.reject(e as Error));
    }
  }

  const call = (repo: string, method: string, args: unknown[]) =>
    new Promise((resolve, reject) => {
      queue.push({ repo, method, args, resolve, reject });
      if (!scheduled) { scheduled = true; setTimeout(flush, 0); }
    });

  const group = (repo: string) =>
    new Proxy({}, {
      get: (_t, method) => {
        if (typeof method !== 'string' || method === 'then') return undefined;
        // Eşzamanlı (senkron) çalışan tek metot: yerel saate göre bu ay (sunucu saati UTC olabilir).
        if (repo === 'metrics' && method === 'thisMonth') return () => monthKey(new Date());
        return (...args: unknown[]) => call(repo, method, args);
      },
    });

  return new Proxy({}, {
    get: (_t, repo) => (typeof repo === 'string' && repo !== 'then' ? group(repo) : undefined),
  }) as Repo;
}
