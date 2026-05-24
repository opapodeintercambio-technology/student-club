// @ts-nocheck
// GET /api/spotify/search?q=<query>&limit=<n>
//
// Proxy autenticado pra Spotify Web API /v1/search?type=track
// - Rate limit: 30 buscas / min / user
// - Cache em memória: TTL 5min (best effort, sobrevive em warm instances)
// - Token do user NUNCA exposto ao client
//
// Retorna lista normalizada de tracks no schema usado pelo app:
//   { track_id, name, artist, album, album_cover_url, preview_url,
//     spotify_url, duration_ms }

import {
  getUserIdFromRequest,
  getValidSpotifyToken,
  disconnectSpotify,
  checkRateLimit,
} from '../../lib/server/spotify-auth.js';

// Cache em memória (warm instance scope)
type CacheEntry = { data: any; expiresAt: number };
const searchCache: Map<string, CacheEntry> = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;
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

  // Rate limit per user
  if (!checkRateLimit(userId, RATE_LIMIT_PER_MIN, 60_000)) {
    res.statusCode = 429;
    return res.json({ error: 'Rate limit exceeded — tente em 1 minuto' });
  }

  const q = typeof req.query?.q === 'string' ? req.query.q.trim() : '';
  if (!q || q.length < 2) {
    res.statusCode = 400;
    return res.json({ error: 'Query must be at least 2 characters' });
  }
  // Cap em 10: apps em Development Mode no Spotify retornam 400
  // "Invalid limit" pra valores > 10 (restricao nao documentada).
  // Quando o app for aprovado pra Extended Quota Mode, podemos subir pra 50.
  const limit = Math.min(10, Math.max(1, Number(req.query?.limit) || 10));

  const cacheKey = `${userId}:${q.toLowerCase()}:${limit}`;
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.statusCode = 200;
    return res.json({ tracks: cached.data, cached: true });
  }

  // Pega token válido (refresh automático se necessário)
  let tokenResult;
  try {
    tokenResult = await getValidSpotifyToken(userId);
  } catch (e: any) {
    console.error('[spotify/search] refresh failed', e?.message || e);
    try { await disconnectSpotify(userId); } catch {}
    res.statusCode = 401;
    return res.json({ error: 'Spotify connection expired, reconnect' });
  }
  if (!tokenResult) {
    res.statusCode = 401;
    return res.json({ error: 'Not connected to Spotify' });
  }

  try {
    const url = new URL('https://api.spotify.com/v1/search');
    url.searchParams.set('q', q);
    url.searchParams.set('type', 'track');
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('market', 'BR'); // mercado BR pra preferir previews disponíveis no Brasil

    const spotifyRes = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${tokenResult.access_token}` },
    });

    if (spotifyRes.status === 401) {
      // Token deu erro mesmo após refresh — desconecta gracefully
      try { await disconnectSpotify(userId); } catch {}
      res.statusCode = 401;
      return res.json({ error: 'Spotify connection invalid, reconnect' });
    }
    if (spotifyRes.status === 403) {
      // 403 com app em Development Mode = user nao esta na lista de testers
      // (max 5 no User Management). Retornamos codigo especifico pro client
      // mostrar UI amigavel explicando como pedir liberacao.
      console.warn('[spotify/search] 403 Forbidden — user nao eh tester', userId);
      res.statusCode = 403;
      return res.json({
        error: 'not_in_tester_list',
        message: 'Sua conta Spotify ainda não foi liberada como tester do Student Club. O app está em modo beta privado (Development Mode) e tem limite de 5 testers. Para pedir liberação, contate o suporte.',
      });
    }
    if (!spotifyRes.ok) {
      const text = await spotifyRes.text();
      console.error('[spotify/search] Spotify error', spotifyRes.status, text);
      res.statusCode = 502;
      // Devolve detalhes do erro pro debug (status + body do Spotify).
      // Em prod estavel isso pode voltar pro generico, mas durante setup
      // ajuda a entender 403 Forbidden vs 429 Rate vs 400 BadRequest etc.
      return res.json({
        error: 'Spotify search failed',
        spotifyStatus: spotifyRes.status,
        spotifyBody: text.substring(0, 500),
      });
    }

    const data = await spotifyRes.json() as {
      tracks: { items: SpotifyTrack[] };
    };

    const tracks = (data.tracks?.items || []).map(normalizeTrack);
    // NAO filtramos mais por preview_url — desde 2024 o Spotify removeu
    // preview de quase todas as tracks (deprecated). Devolvemos todas e
    // o TrackPlayer renderiza botao "Ouvir no Spotify" (deep link) quando
    // preview_url estiver vazio.

    searchCache.set(cacheKey, { data: tracks, expiresAt: Date.now() + CACHE_TTL_MS });

    res.statusCode = 200;
    return res.json({ tracks, cached: false });
  } catch (e: any) {
    console.error('[spotify/search] exception', e);
    res.statusCode = 500;
    return res.json({ error: 'Internal error' });
  }
}

// ─── Spotify track shape (campos que usamos) ─────────────────────────
interface SpotifyTrack {
  id: string;
  name: string;
  artists: { name: string }[];
  album: {
    name: string;
    images: { url: string; height: number; width: number }[];
  };
  preview_url: string | null;
  duration_ms: number;
  external_urls: { spotify: string };
}

function normalizeTrack(t: SpotifyTrack) {
  // Pega a maior imagem do álbum (geralmente 640x640)
  const images = t.album?.images || [];
  const bestImg = images.sort((a, b) => (b.width || 0) - (a.width || 0))[0];
  return {
    track_id: t.id,
    name: t.name,
    artist: t.artists?.map(a => a.name).join(', ') || '',
    album: t.album?.name || '',
    album_cover_url: bestImg?.url || '',
    preview_url: t.preview_url || '',
    spotify_url: t.external_urls?.spotify || `https://open.spotify.com/track/${t.id}`,
    duration_ms: t.duration_ms || 0,
  };
}
