// @ts-nocheck
// GET /api/deezer/trending?limit=<n>
//
// Retorna o TOP de músicas do Deezer (BR). Usa o endpoint público
// api.deezer.com/chart/0/tracks (sem auth). Cache em memória 30min.
//
// Diferença vs /api/deezer/search: nao filtra por query — sempre devolve
// as mesmas tracks (chart geral). Por isso o cache eh mais agressivo.

type CacheEntry = { data: any; expiresAt: number };
let cached: CacheEntry | null = null;
const CACHE_TTL_MS = 30 * 60 * 1000;

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=600'); // 10min CDN cache

  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'GET') { res.statusCode = 405; return res.json({ error: 'Method Not Allowed' }); }

  const limitRaw = Number(req.query?.limit ?? 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 25) : 10;

  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    // Aplica limit no cache (cache armazena 25, devolvemos os N pedidos)
    const out = { ...cached.data, data: (cached.data.data || []).slice(0, limit) };
    res.statusCode = 200;
    return res.json(out);
  }

  try {
    // Top 25 do dia (devolvemos limit conforme query)
    const url = new URL('https://api.deezer.com/chart/0/tracks');
    url.searchParams.set('limit', '25');
    const r = await fetch(url.toString(), { method: 'GET' });
    if (!r.ok) {
      res.statusCode = 502;
      return res.json({ error: 'Deezer chart retornou erro', status: r.status });
    }
    const json = await r.json();
    cached = { data: json, expiresAt: now + CACHE_TTL_MS };
    const out = { ...json, data: (json.data || []).slice(0, limit) };
    res.statusCode = 200;
    return res.json(out);
  } catch (e: any) {
    console.error('[deezer/trending] failed', e);
    res.statusCode = 502;
    return res.json({ error: 'Falha ao chamar Deezer', detail: e?.message });
  }
}
