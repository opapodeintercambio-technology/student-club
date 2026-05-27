// Tradução PT→EN/ES/etc via proxy Vercel (/api/translate)
// Pipeline otimizado:
//   1) Cache EM MEMÓRIA (Map) — lookup instantâneo, sem JSON parse
//   2) Cache localStorage como fallback persistente
//   3) Batching automático com debounce 30ms — múltiplos toLang() em
//      uma única request HTTP via /api/translate-batch
//   4) Concorrência 10 (era 3) — HTTP/2 aguenta bem
//   5) Pending dedup — duas chamadas idênticas compartilham 1 fetch
//
// Performance esperada:
//   Antes: 20 textos → 20 requests, ~6-15s no feed inicial
//   Depois: 20 textos → 1-2 requests batched, ~300-800ms

import { apiBase } from './apiUrl';

const PREFIX = 'trok_t2_';
const MAX_CONCURRENT = 10;
const BATCH_DEBOUNCE_MS = 30;
const BATCH_MAX_SIZE = 50;

// In-memory cache: substitui acesso a localStorage no hot path.
// Populated com cache do localStorage no startup pra não perder hits frios.
const memCache = new Map<string, string>();

let running = 0;
const queue: Array<() => void> = [];
const pending = new Map<string, Promise<string>>();

// Batching: textos aguardando ser enviados em um único request batched.
interface BatchItem {
  text: string;
  target: string;
  cKey: string;
  pendingKey: string;
  resolve: (value: string) => void;
}
let batchQueue: BatchItem[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;

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

// Carrega cache do localStorage pra memCache no startup.
// Limpa também o cache antigo da MyMemory (prefixo trok_t_).
try {
  const keys = Object.keys(localStorage);
  for (const k of keys) {
    if (k.startsWith('trok_t_')) {
      localStorage.removeItem(k); // limpa cache legado
    } else if (k.startsWith(PREFIX)) {
      const v = localStorage.getItem(k);
      if (v) memCache.set(k, v);
    }
  }
} catch {}

async function flushBatch() {
  batchTimer = null;
  if (batchQueue.length === 0) return;
  const items = batchQueue.splice(0, BATCH_MAX_SIZE);

  try {
    const res = await fetch(`${apiBase()}/api/translate-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: items.map(it => ({ q: it.text.slice(0, 499), tl: it.target })) }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`batch ${res.status}`);
    const data = await res.json();
    const results: string[] = data?.results ?? [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const t = results[i] ?? it.text;
      if (t && t !== it.text) {
        memCache.set(it.cKey, t);
        try { localStorage.setItem(it.cKey, t); } catch {}
      }
      pending.delete(it.pendingKey);
      it.resolve(t || it.text);
    }
  } catch {
    // Fallback: chama endpoint single pra cada texto
    for (const it of items) {
      try {
        const res = await fetch(
          `${apiBase()}/api/translate?q=${encodeURIComponent(it.text.slice(0, 499))}&tl=${it.target}`,
          { signal: AbortSignal.timeout(8000) }
        );
        const data = await res.json();
        const t: string = data?.t ?? it.text;
        if (t && t !== it.text) {
          memCache.set(it.cKey, t);
          try { localStorage.setItem(it.cKey, t); } catch {}
        }
        pending.delete(it.pendingKey);
        it.resolve(t || it.text);
      } catch {
        pending.delete(it.pendingKey);
        it.resolve(it.text);
      }
    }
  } finally {
    running--;
    runQueue();
  }

  // Se chegou mais batch enquanto este rodava, agenda próximo flush
  if (batchQueue.length > 0 && !batchTimer) {
    batchTimer = setTimeout(flushBatch, BATCH_DEBOUNCE_MS);
  }
}

// Aceita 2-letter ('en', 'es') OU locale ('en-US', 'pt-BR', 'ja-JP', etc.).
export function toLang(text: string, target: string): Promise<string> {
  if (!text?.trim() || text.length < 2) return Promise.resolve(text);
  target = (target || 'en').split('-')[0].toLowerCase();
  const cKey = hash(text, target);

  // 1) Cache em memória (instantâneo)
  const memHit = memCache.get(cKey);
  if (memHit && memHit !== text) return Promise.resolve(memHit);

  const pendingKey = `${target}:${cKey}`;
  if (pending.has(pendingKey)) return pending.get(pendingKey)!;

  const p = new Promise<string>(resolve => {
    queue.push(() => {
      batchQueue.push({ text, target, cKey, pendingKey, resolve });
      if (!batchTimer) {
        batchTimer = setTimeout(flushBatch, BATCH_DEBOUNCE_MS);
      }
    });
    runQueue();
  });

  pending.set(pendingKey, p);
  return p;
}

export const toEn = (text: string) => toLang(text, 'en');
export const toEs = (text: string) => toLang(text, 'es');
