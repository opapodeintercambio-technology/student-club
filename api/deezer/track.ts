// @ts-nocheck
// GET /api/deezer/track?id=<trackId>
//
// Retorna info atualizada de um track Deezer — incluindo o preview_url
// que e RE-GERADO pela Deezer toda vez (a URL contem um token com
// expiracao no querystring `exp=...`). URLs preview salvas em mensagens
// antigas EXPIRAM, e o user via "play nao funciona".
//
// Este endpoint faz lookup direto na api.deezer.com/track/{id} (publica,
// sem auth) e devolve o preview_url FRESH pro client renderizar.

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'GET') { res.statusCode = 405; return res.json({ error: 'Method Not Allowed' }); }

  const id = String(req.query?.id || '').trim();
  if (!id || !/^[0-9]+$/.test(id)) {
    res.statusCode = 400;
    return res.json({ error: 'id inválido (esperado numérico)' });
  }

  try {
    const r = await fetch(`https://api.deezer.com/track/${id}`);
    if (!r.ok) {
      res.statusCode = 502;
      return res.json({ error: 'Deezer retornou erro', status: r.status });
    }
    const json = await r.json();
    if (json?.error) {
      res.statusCode = 404;
      return res.json({ error: 'Track não encontrado' });
    }
    res.statusCode = 200;
    return res.json({
      track_id: String(json.id),
      name: json.title,
      artist: json.artist?.name || '',
      album: json.album?.title || '',
      album_cover_url: json.album?.cover_medium || json.album?.cover_big || '',
      preview_url: json.preview || '',
      deezer_url: json.link || `https://www.deezer.com/track/${json.id}`,
      duration_ms: (json.duration || 0) * 1000,
      source: 'deezer',
    });
  } catch (e: any) {
    console.error('[deezer/track] failed', e);
    res.statusCode = 502;
    return res.json({ error: 'Falha ao chamar Deezer', detail: e?.message });
  }
}
