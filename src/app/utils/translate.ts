// Tradução PT→EN/ES via proxy Vercel (/api/translate → Google Translate)
// Resultados cacheados em localStorage para evitar chamadas repetidas

const PREFIX = 'trok_t2_';
const MAX_CONCURRENT = 3;

let running = 0;
const queue: Array<() => void> = [];
const pending = new Map<string, Promise<string>>();

function runQueue() {
  while (running < MAX_CONCURRENT && queue.length > 0) {
    running++;
    queue.shift()!();
  }
}

function hash(text: string, target: string): string {
  let h = 5381;
  const full = `${target}:${text}`;
  for (let i = 0; i < Math.min(full.length, 160); i++) {
    h = ((h << 5) + h + full.charCodeAt(i)) | 0;
  }
  return PREFIX + (h >>> 0).toString(36);
}

// Limpa cache antigo da MyMemory (prefixo trok_t_) ao inicializar
try {
  const keys = Object.keys(localStorage).filter(k => k.startsWith('trok_t_'));
  for (const k of keys) localStorage.removeItem(k);
} catch {}

// Aceita 2-letter ('en', 'es') OU locale ('en-US', 'pt-BR', 'ja-JP', etc.).
// Google Translate gtx endpoint aceita ambos, mas normalizamos pro base
// code (split '-') pra deduplicar cache (en-US e en-GB compartilham cache).
export function toLang(text: string, target: string): Promise<string> {
  if (!text?.trim() || text.length < 2) return Promise.resolve(text);
  target = (target || 'en').split('-')[0].toLowerCase();
  const cKey = hash(text, target);

  try {
    const hit = localStorage.getItem(cKey);
    if (hit && hit !== text) return Promise.resolve(hit);
    if (hit === text) localStorage.removeItem(cKey); // cache de texto não-traduzido
  } catch {}

  const pendingKey = `${target}:${cKey}`;
  if (pending.has(pendingKey)) return pending.get(pendingKey)!;

  const p = new Promise<string>(resolve => {
    queue.push(async () => {
      try {
        const res = await fetch(
          `/api/translate?q=${encodeURIComponent(text.slice(0, 499))}&tl=${target}`,
          { signal: AbortSignal.timeout(8000) }
        );
        const data = await res.json();
        const t: string = data?.t ?? text;

        // Cacheia apenas se a tradução for diferente do original
        if (t && t !== text) {
          try { localStorage.setItem(cKey, t); } catch {}
          resolve(t);
        } else {
          resolve(text);
        }
      } catch {
        resolve(text);
      } finally {
        running--;
        pending.delete(pendingKey);
        runQueue();
      }
    });
    runQueue();
  });

  pending.set(pendingKey, p);
  return p;
}

export const toEn = (text: string) => toLang(text, 'en');
export const toEs = (text: string) => toLang(text, 'es');

