// Helpers client-side pra integração Spotify.
//
// - searchSpotifyTracks: chama nosso proxy /api/spotify/search (o
//   token Spotify NUNCA é exposto ao client)
// - startSpotifyLogin: pede a URL do authorize ao backend e navega
// - disconnectSpotify / refreshSpotifyConnection
// - SpotifyTrack: type compartilhado por stories, posts e chat
// - Deep link + formatadores

import { supabase } from '../../lib/supabase';

export interface SpotifyTrack {
  track_id: string;
  name: string;
  artist: string;
  album: string;
  album_cover_url: string;
  preview_url: string;
  spotify_url: string;
  duration_ms: number;
  /** Ponto de início (em ms) escolhido pelo user — usado pra tocar
   *  só uma parte de 30s da música no story/feed/chat. Default = 0
   *  (começa do início da música). */
  start_ms?: number;
}

// ─── JWT do Supabase pra mandar nos requests autenticados ──────────
async function getJwt(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  } catch {
    return null;
  }
}

// ─── Erro especial — caller sabe que precisa pedir reconexão ───────
export class SpotifyAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpotifyAuthError';
  }
}

// ─── Erro especial — user não está na lista de testers do app ──────
// (App em Development Mode aceita só 5 testers. Quando a Spotify API
// retorna 403, capturamos no backend e devolvemos esse tipo de erro
// pra UI poder mostrar mensagem clara explicando como pedir liberação.)
export class SpotifyTesterRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpotifyTesterRequiredError';
  }
}

// ─── Busca de tracks (proxy autenticado) ───────────────────────────
export async function searchSpotifyTracks(query: string, limit = 10): Promise<SpotifyTrack[]> {
  const jwt = await getJwt();
  if (!jwt) throw new Error('Faça login no Student Club primeiro');

  const url = new URL('/api/spotify/search', window.location.origin);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', String(limit));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${jwt}` },
  });

  if (res.status === 401) {
    const json = await res.json().catch(() => ({}));
    throw new SpotifyAuthError(json?.error || 'Conecte seu Spotify pra buscar músicas');
  }
  if (res.status === 403) {
    // App em Development Mode → user nao esta na lista de 5 testers
    const json = await res.json().catch(() => ({}));
    throw new SpotifyTesterRequiredError(json?.message || 'Sua conta Spotify ainda não foi liberada como tester');
  }
  if (res.status === 429) {
    throw new Error('Muitas buscas — aguarde 1 minuto');
  }
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json?.error || `Erro ${res.status} na busca`);
  }
  const json = await res.json() as { tracks: SpotifyTrack[] };
  return json.tracks || [];
}

// ─── Inicia conexão OAuth ──────────────────────────────────────────
// Backend valida JWT, gera state, salva no DB e devolve a URL do
// Spotify. Frontend faz window.location.href = url.
export async function startSpotifyLogin(redirectTo: string = '/conexoes'): Promise<void> {
  const jwt = await getJwt();
  if (!jwt) throw new Error('Faça login no Student Club primeiro');

  const res = await fetch('/api/auth/spotify/login', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ redirect_to: redirectTo }),
  });

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json?.error || 'Falha ao iniciar conexão com Spotify');
  }
  const { authorize_url } = await res.json() as { authorize_url: string };
  if (!authorize_url) throw new Error('Resposta inválida do servidor');

  // Navegação completa pro accounts.spotify.com — o browser cuida do resto
  window.location.href = authorize_url;
}

// ─── Disconnect ────────────────────────────────────────────────────
export async function disconnectSpotify(): Promise<void> {
  const jwt = await getJwt();
  if (!jwt) throw new Error('Não autenticado');
  const res = await fetch('/api/auth/spotify/disconnect', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json?.error || 'Falha ao desconectar');
  }
}

// ─── Refresh manual (raramente necessário) ─────────────────────────
export async function refreshSpotifyConnection(): Promise<{ display_name: string | null; expires_at: string | null } | null> {
  const jwt = await getJwt();
  if (!jwt) return null;
  const res = await fetch('/api/auth/spotify/refresh', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (res.status === 404 || res.status === 401) return null;
  if (!res.ok) return null;
  return res.json();
}

// ─── Deep link ─────────────────────────────────────────────────────
export function spotifyDeepLink(track: SpotifyTrack): string {
  return track.spotify_url || `https://open.spotify.com/track/${track.track_id}`;
}

// ─── Formatação de duração (MM:SS) ─────────────────────────────────
export function formatDuration(ms: number): string {
  if (!isFinite(ms) || ms <= 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}
