// Node'un TS soyutlama (strip-types) modunda uzantısız göreli import'ları (./x -> ./x.ts) çözer.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && context.parentURL && !/\.[a-z]+$/.test(specifier)) {
    const base = new URL(specifier, context.parentURL);
    for (const ext of ['.ts', '/index.ts']) {
      const p = base.href + ext;
      if (existsSync(fileURLToPath(p))) return next(p, context);
    }
  }
  return next(specifier, context);
}
