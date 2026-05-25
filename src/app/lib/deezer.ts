// Helpers client-side pra integração Deezer.
//
// Diferença CRÍTICA vs Spotify:
//   - Deezer NÃO exige OAuth nem Developer Mode com testers.
//   - A API publica (https://api.deezer.com/search?q=...) é livre.
//   - Cada track tem `preview` (URL MP3 de 30s) — funciona pra TODAS as
//     músicas (Deezer não removeu como Spotify fez em 2024).
//   - Ouvir track completa exige iframe widget oficial do Deezer.
//
// Como evitar CORS: a API do Deezer suporta JSONP mas tambem CORS direto
// em browser (eles aceitam Origin de qualquer domínio). Se em algum caso
// um navegador bloquear, podemos adicionar proxy. Por enquanto direto.

export interface DeezerTrack {
  track_id: string;          // id da musica no Deezer (number convertido pra string)
  name: string;              // titulo da musica
  artist: string;            // nome do artista
  album: string;             // nome do album
  album_cover_url: string;   // capa do album (URL https)
  preview_url: string;       // MP3 30s — Deezer fornece pra TODAS as tracks
  deezer_url: string;        // link pra abrir no Deezer (ex: https://deezer.com/track/123)
  duration_ms: number;       // duracao total em ms
  /** Ponto inicial em ms — o user pode escolher onde os 30s do preview
   *  comecam. Default 0 (do inicio). Spotify-like. */
  start_ms?: number;
  /** Marcador da fonte — distinguishes from SpotifyTrack quando salvo em DB. */
  source: 'deezer';
}

// Resposta crua da API Deezer (subset que usamos)
interface DeezerSearchResponseTrack {
  id: number;
  title: string;
  preview: string;
  duration: number; // em SEGUNDOS
  link: string;     // url do track no deezer
  artist: { name: string };
  album: { title: string; cover_medium: string; cover_big: string };
}

interface DeezerSearchResponse {
  data: DeezerSearchResponseTrack[];
  total?: number;
  next?: string;
}

// ─── Busca de tracks (chamada direta — sem nosso proxy) ─────────────
export async function searchDeezerTracks(query: string, limit = 10): Promise<DeezerTrack[]> {
  if (!query.trim()) return [];
  const url = new URL('https://api.deezer.com/search');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', String(limit));
  // output=jsonp da volta JSONP mas browsers modernos chupam JSON direto.
  // Deezer aceita CORS de qualquer origem na API publica.
  const res = await fetch(url.toString(), { cache: 'no-store' });
  if (!res.ok) throw new Error(`Deezer search falhou: ${res.status}`);
  const json = (await res.json()) as DeezerSearchResponse;
  if (!json.data) return [];
  return json.data.map(toDeezerTrack);
}

function toDeezerTrack(r: DeezerSearchResponseTrack): DeezerTrack {
  return {
    track_id: String(r.id),
    name: r.title,
    artist: r.artist?.name || '',
    album: r.album?.title || '',
    album_cover_url: r.album?.cover_medium || r.album?.cover_big || '',
    preview_url: r.preview || '',
    deezer_url: r.link || `https://www.deezer.com/track/${r.id}`,
    duration_ms: (r.duration || 0) * 1000,
    source: 'deezer',
  };
}

// ─── Helpers de UI ──────────────────────────────────────────────────
export function deezerDeepLink(track: DeezerTrack): string {
  return track.deezer_url || `https://www.deezer.com/track/${track.track_id}`;
}

export function formatDeezerDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${ss.toString().padStart(2, '0')}`;
}
