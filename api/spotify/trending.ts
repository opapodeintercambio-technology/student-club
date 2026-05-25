// @ts-nocheck
// GET /api/spotify/trending?limit=<n>
//
// Retorna o TOP de musicas do Spotify Brasil. Usa a playlist editorial
// "Top 50 - Brazil" (ID 37i9dQZEVXbMXbN3EUUhlg — playlist publica oficial
// do Spotify, atualizada diariamente).
//
// Requer auth (Spotify exige token pra qualquer chamada API). Reutiliza
// o token OAuth do user atual (mesma logica do /search).
//
// Diferenca vs Deezer /trending: aqui PRECISA do token do user (Spotify
// nao tem endpoint publico). Por isso so funciona pra users conectados.

import {
  getUserIdFromRequest,
  getValidSpotifyToken,
  disconnectSpotify,
  checkRateLimit,
} from '../../lib/server/spotify-auth.js';

const TOP_50_BR_PLAYLIST_ID = '37i9dQZEVXbMXbN3EUUhlg';
type CacheEntry = { data: any; expiresAt: number };
let cached: CacheEntry | null = null;
const CACHE_TTL_MS = 30 * 60 * 1000;
const RATE_LIMIT_PER_MIN = 30;

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.json({ error: 'Method Not Allowed' });
  }

  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    res.statusCode = 401;
    return res.json({ error: 'Unauthorized' });
  }

  if (!checkRateLimit(userId, RATE_LIMIT_PER_MIN, 60_000)) {
    res.statusCode = 429;
    return res.json({ error: 'Rate limit exceeded' });
  }

  const limit = Math.min(10, Math.max(1, Number(req.query?.limit) || 10));

  // Cache global (todos os users veem o mesmo Top 50 BR)
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    res.statusCode = 200;
    return res.json({ tracks: cached.data.slice(0, limit), cached: true });
  }

  let tokenResult;
  try {
    tokenResult = await getValidSpotifyToken(userId);
  } catch (e: any) {
    try { await disconnectSpotify(userId); } catch {}
    res.statusCode = 401;
    return res.json({ error: 'Spotify connection expired' });
  }
  if (!tokenResult) {
    res.statusCode = 401;
    return res.json({ error: 'Not connected to Spotify' });
  }

  try {
    const url = new URL(`https://api.spotify.com/v1/playlists/${TOP_50_BR_PLAYLIST_ID}/tracks`);
    url.searchParams.set('market', 'BR');
    url.searchParams.set('limit', '25'); // pega 25, devolve N
    url.searchParams.set('fields', 'items(track(id,name,artists(name),album(name,images),preview_url,duration_ms,external_urls))');

    const r = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${tokenResult.access_token}` },
    });

    if (r.status === 401) {
      try { await disconnectSpotify(userId); } catch {}
      res.statusCode = 401;
      return res.json({ error: 'Spotify token invalid' });
    }
    if (r.status === 403) {
      res.statusCode = 403;
      return res.json({ error: 'not_in_tester_list' });
    }
    if (!r.ok) {
      const text = await r.text();
      console.error('[spotify/trending] Spotify error', r.status, text);
      res.statusCode = 502;
      return res.json({ error: 'Spotify trending failed', spotifyStatus: r.status });
    }
    const data = await r.json();
    const tracks = (data.items || [])
      .map((item: any) => item.track)
      .filter((t: any) => t && t.id)
      .map(normalizeTrack);

    cached = { data: tracks, expiresAt: now + CACHE_TTL_MS };
    res.statusCode = 200;
    return res.json({ tracks: tracks.slice(0, limit), cached: false });
  } catch (e: any) {
    console.error('[spotify/trending] exception', e);
    res.statusCode = 500;
    return res.json({ error: 'Internal error' });
  }
}

function normalizeTrack(t: any) {
  const images = t.album?.images || [];
  const bestImg = images.sort((a: any, b: any) => (b.width || 0) - (a.width || 0))[0];
  return {
    track_id: t.id,
    name: t.name,
    artist: t.artists?.map((a: any) => a.name).join(', ') || '',
    album: t.album?.name || '',
    album_cover_url: bestImg?.url || '',
    preview_url: t.preview_url || '',
    spotify_url: t.external_urls?.spotify || `https://open.spotify.com/track/${t.id}`,
    duration_ms: t.duration_ms || 0,
  };
}
