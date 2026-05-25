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

// ─── Busca de tracks via PROXY server-side (/api/deezer/search) ─────
// IMPORTANTE: NAO chama api.deezer.com direto do browser porque a API
// publica do Deezer NAO envia o header Access-Control-Allow-Origin —
// browsers bloqueiam com "Load failed". Nosso proxy server-side
// (api/deezer/search.ts) faz a chamada do Node (sem restricao CORS) e
// devolve o JSON com headers CORS apropriados.
export async function searchDeezerTracks(query: string, limit = 10): Promise<DeezerTrack[]> {
  if (!query.trim()) return [];
  const url = new URL('/api/deezer/search', window.location.origin);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', String(limit));
  const res = await fetch(url.toString(), { cache: 'no-store' });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j?.error || `Deezer search falhou: ${res.status}`);
  }
  const json = (await res.json()) as DeezerSearchResponse;
  if (!json.data) return [];
  return json.data.map(toDeezerTrack);
}

// ─── Trending — Top 25 do Deezer (sem auth, cache no servidor) ──────
export async function fetchDeezerTrending(limit = 10): Promise<DeezerTrack[]> {
  const url = new URL('/api/deezer/trending', window.location.origin);
  url.searchParams.set('limit', String(limit));
  const res = await fetch(url.toString());
  if (!res.ok) return [];
  const json = (await res.json()) as DeezerSearchResponse;
  if (!json.data) return [];
  return json.data.map(toDeezerTrack);
}

// ─── Preview FRESH (URL com token valido) ───────────────────────────
// CRITICO: o preview_url do Deezer tem token de tempo no querystring
// (`?exp=<unix>`). URLs antigas (salvas em posts/stories/chat) EXPIRAM
// — audio.play() falha silenciosamente.
//
// Este helper busca o preview novo via /api/deezer/track antes de tocar.
// Cache em memoria pra economizar requests durante a sessao.
const freshPreviewCache: Map<string, string> = new Map();

export async function getFreshDeezerPreviewUrl(trackId: string, fallback?: string): Promise<string | null> {
  if (!trackId) return fallback || null;
  const cached = freshPreviewCache.get(trackId);
  if (cached) return cached;
  try {
    const res = await fetch(`/api/deezer/track?id=${encodeURIComponent(trackId)}`);
    if (!res.ok) return fallback || null;
    const data = await res.json();
    const url = data?.preview_url as string | undefined;
    if (url) {
      freshPreviewCache.set(trackId, url);
      return url;
    }
    return fallback || null;
  } catch {
    return fallback || null;
  }
}

// ─── playAudioWithGestureRetry ──────────────────────────────────────
// Resolve o problema #1 do Deezer no story de TERCEIROS: o user clica
// pra abrir o story (gesto), o `<TrackPlayer autoPlay>` monta, e
// `getFreshDeezerPreviewUrl()` faz um fetch async ANTES do `audio.play()`.
// Esse fetch demora 200ms-1s+ — entre o gesto e o play(), o browser
// considera que o gesto "esfriou" e BLOQUEIA o autoplay.
//
// Resultado pra quem postou: o ja tem o audio em cache, fetch instantaneo,
// play() ocorre durante o gesto -> toca normal.
// Pra terceiros: cache vazio, fetch demora, play() rejeitado -> silencio.
//
// Este helper tenta play() agora; se for rejeitado por NotAllowedError,
// registra listeners GLOBAIS pra qualquer proximo gesto do user (touch/
// click/key/scroll) e re-tenta. Como o user ja esta INTERAGINDO com o
// story (tap pra avancar, swipe), o retry praticamente sempre da certo
// no proximo gesto.
//
// Devolve cleanup() que o caller chama no unmount pra remover listeners
// pendentes (evita re-play depois que o player saiu de cena).
export function playAudioWithGestureRetry(
  audio: HTMLAudioElement,
  onPlay?: () => void,
  onFail?: () => void,
): () => void {
  let cancelled = false;
  let listenersAttached = false;
  const detach = () => {
    if (!listenersAttached) return;
    listenersAttached = false;
    window.removeEventListener('pointerdown', retry, true);
    window.removeEventListener('touchstart', retry, true);
    window.removeEventListener('click', retry, true);
    window.removeEventListener('keydown', retry, true);
    window.removeEventListener('touchend', retry, true);
  };
  function retry() {
    detach();
    if (cancelled) return;
    audio.play().then(() => { if (onPlay && !cancelled) onPlay(); }).catch(() => {
      // Falhou de novo — re-arma listeners. Eventualmente vai funcionar
      // quando o user fizer algum gesto direto na pagina.
      if (cancelled) return;
      if (onFail) onFail();
      attach();
    });
  }
  function attach() {
    if (listenersAttached || cancelled) return;
    listenersAttached = true;
    window.addEventListener('pointerdown', retry, { capture: true });
    window.addEventListener('touchstart', retry, { capture: true, passive: true });
    window.addEventListener('click', retry, { capture: true });
    window.addEventListener('keydown', retry, { capture: true });
    window.addEventListener('touchend', retry, { capture: true, passive: true });
  }

  // Tenta agora — talvez o gesto ainda esteja "quente"
  audio.play().then(() => { if (onPlay && !cancelled) onPlay(); }).catch(() => {
    if (cancelled) return;
    if (onFail) onFail();
    attach();
  });

  return () => {
    cancelled = true;
    detach();
  };
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

// Constantes do preview Deezer (CDN limita a 30s do inicio da musica).
// Trim valido tem que ficar DENTRO dessa janela.
export const DEEZER_PREVIEW_MS = 30000;
export const DEEZER_SNIPPET_MS = 15000;
// Maximo start_ms valido pra Deezer = preview - snippet = 15000ms.
// Stories/posts antigos podem ter start_ms maior (ex: 56500 — quando o
// trim era baseado na duracao da musica completa, antes do fix). Esse
// helper CLAMPA pra valor seguro: se invalido, retorna 0 (toca do inicio
// do preview, comportamento default).
export function clampDeezerStartMs(startMs: number | undefined | null): number {
  const v = typeof startMs === 'number' && isFinite(startMs) ? startMs : 0;
  if (v < 0) return 0;
  if (v > DEEZER_PREVIEW_MS - DEEZER_SNIPPET_MS) return 0;
  return v;
}

export function formatDeezerDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${ss.toString().padStart(2, '0')}`;
}

// ─── OAuth flow (paralelo ao Spotify) ───────────────────────────────
import { supabase } from '../../lib/supabase';

async function getJwt(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  } catch { return null; }
}

/** Inicia o fluxo de login Deezer.
 *  Server gera state CSRF e devolve a URL do Deezer.
 *  Frontend navega pra essa URL (não 302 — pra preservar JWT no header). */
export async function startDeezerLogin(redirectTo: string = '/conexoes'): Promise<void> {
  const jwt = await getJwt();
  if (!jwt) throw new Error('Faça login no Student Club primeiro');
  const res = await fetch('/api/auth/deezer/login', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ redirect_to: redirectTo }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json?.error || `Erro ${res.status} ao iniciar OAuth`);
  }
  const { authorize_url } = await res.json();
  if (!authorize_url) throw new Error('Servidor não devolveu URL de autorização');
  window.location.href = authorize_url;
}

/** Remove a conexão Deezer do usuário atual. */
export async function disconnectDeezer(): Promise<void> {
  const jwt = await getJwt();
  if (!jwt) throw new Error('Faça login no Student Club primeiro');
  const res = await fetch('/api/auth/deezer/disconnect', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${jwt}` },
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json?.error || `Erro ${res.status} ao desconectar`);
  }
}
