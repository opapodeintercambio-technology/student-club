// @ts-nocheck
// POST /api/auth/spotify/refresh
//
// Endpoint utilitário pro frontend forçar refresh do access_token quando
// necessário (raramente — getValidSpotifyToken já faz refresh sob demanda
// quando outras rotas chamam APIs do Spotify).
//
// Retorna apenas { ok, expires_at } — NUNCA o token em si pro client.

import { getUserIdFromRequest, getValidSpotifyToken, disconnectSpotify, getSupabaseAdmin } from '../../../lib/server/spotify-auth.js';

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end('Method Not Allowed');
  }

  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    res.statusCode = 401;
    return res.json({ error: 'Unauthorized' });
  }

  try {
    const result = await getValidSpotifyToken(userId);
    if (!result) {
      res.statusCode = 404;
      return res.json({ error: 'Not connected' });
    }

    // Re-busca expires_at depois do refresh pra responder com timestamp atualizado
    const supa = getSupabaseAdmin();
    const { data } = await supa
      .from('usuarios')
      .select('spotify_token_expires_at, spotify_display_name')
      .eq('id', userId)
      .maybeSingle();

    res.statusCode = 200;
    return res.json({
      ok: true,
      refreshed: result.refreshed,
      expires_at: (data as any)?.spotify_token_expires_at || null,
      display_name: (data as any)?.spotify_display_name || null,
    });
  } catch (e: any) {
    // Refresh falhou — token revogado / inválido. Desconecta gracefully.
    console.error('[spotify/refresh] failed', e?.message || e);
    try { await disconnectSpotify(userId); } catch {}
    res.statusCode = 401;
    return res.json({ error: 'Refresh failed, please reconnect' });
  }
}
