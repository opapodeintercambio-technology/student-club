// @ts-nocheck
// GET /api/deezer/search?q=<query>&limit=<n>
//
// Proxy server-side pra api.deezer.com/search.
//
// Por que: a API pública do Deezer NÃO envia o header
// `Access-Control-Allow-Origin` — então chamadas direto do browser sao
// bloqueadas com erro "Load failed" / CORS. Aqui, o servidor Vercel
// (Node) chama a Deezer sem restricao CORS e devolve o JSON pro client
// com header CORS apropriado.
//
// Sem auth/OAuth — API pública do Deezer.
// Cache em memoria de 5min (warm instance) pra reduzir hits desnecessarios.

type CacheEntry = { data: any; expiresAt: number };
const searchCache: Map<string, CacheEntry> = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

export default async function handler(req: any, res: any) {
  // CORS: a chamada vem do mesmo origin (studentclub-br.vercel.app),
  // mas adicionamos os headers pra ser explicito.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.json({ error: 'Method Not Allowed' });
  }

  const q = typeof req.query?.q === 'string' ? req.query.q.trim() : '';
  if (!q || q.length < 2) {
    res.statusCode = 400;
    return res.json({ error: 'Query muito curta (mínimo 2 caracteres)' });
  }
  const limitRaw = Number(req.query?.limit ?? 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 25) : 10;

  // Cache key normalizada
  const cacheKey = `${q.toLowerCase()}|${limit}`;
  const now = Date.now();
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    res.statusCode = 200;
    return res.json(cached.data);
  }

  // Chama a Deezer
  try {
    const url = new URL('https://api.deezer.com/search');
    url.searchParams.set('q', q);
    url.searchParams.set('limit', String(limit));
    const r = await fetch(url.toString(), { method: 'GET' });
    if (!r.ok) {
      res.statusCode = 502;
      return res.json({ error: 'Deezer API retornou erro', status: r.status });
    }
    const json = await r.json();
    // Guarda no cache (TTL 5min)
    searchCache.set(cacheKey, { data: json, expiresAt: now + CACHE_TTL_MS });
    // Limpa cache se > 100 entries (best-effort LRU simples)
    if (searchCache.size > 100) {
      const oldest = [...searchCache.entries()]
        .sort((a, b) => a[1].expiresAt - b[1].expiresAt)
        .slice(0, 50);
      for (const [k] of oldest) searchCache.delete(k);
    }
    res.statusCode = 200;
    return res.json(json);
  } catch (e: any) {
    console.error('[deezer/search] failed', e);
    res.statusCode = 502;
    return res.json({ error: 'Falha ao chamar Deezer', detail: e?.message });
  }
}
