// Singleton que gerencia a Spotify IFrame API.
//
// A Spotify IFrame API permite controlar players embed via JS:
//   - Receber eventos playback_update (isPaused, position, duration)
//   - Pausar/tocar/seek programaticamente
//   - Coordenar múltiplos players (ex: pausar outros quando um toca)
//
// Carrega o script https://open.spotify.com/embed/iframe-api/v1 UMA vez
// e expõe um helper `getSpotifyAPI()` que resolve quando o API está pronto.
//
// Docs: https://developer.spotify.com/documentation/embeds/references/iframe-api

export interface SpotifyEmbedController {
  loadUri: (uri: string) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  /** Pula pra um ponto específico da música. Aceita SEGUNDOS (não ms). */
  seek: (seconds: number) => void;
  destroy: () => void;
  addListener: (event: string, callback: (e: any) => void) => void;
  removeListener: (event: string) => void;
}

export interface SpotifyIFrameAPI {
  createController: (
    element: HTMLElement,
    options: { uri: string; width?: string | number; height?: string | number; theme?: number },
    callback: (controller: SpotifyEmbedController) => void
  ) => void;
}

declare global {
  interface Window {
    onSpotifyIframeApiReady?: (api: SpotifyIFrameAPI) => void;
    Spotify?: any;
  }
}

let apiPromise: Promise<SpotifyIFrameAPI> | null = null;

export function getSpotifyAPI(): Promise<SpotifyIFrameAPI> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    // Se ja foi carregado em outro lugar
    if ((window as any).__spotifyIFrameAPI) {
      resolve((window as any).__spotifyIFrameAPI as SpotifyIFrameAPI);
      return;
    }
    // Define o callback ANTES de carregar o script
    window.onSpotifyIframeApiReady = (api: SpotifyIFrameAPI) => {
      (window as any).__spotifyIFrameAPI = api;
      resolve(api);
    };
    // Carrega o script da Spotify
    const existing = document.querySelector('script[src*="/embed/iframe-api"]');
    if (existing) return; // ja em carregamento
    const script = document.createElement('script');
    script.src = 'https://open.spotify.com/embed/iframe-api/v1';
    script.async = true;
    document.head.appendChild(script);
  });
  return apiPromise;
}

// ─── Registry global de controllers ativos ─────────────────────────
// Usado pra coordenar: quando Spotify A começa a tocar, pausa Spotify B
// (e também áudios HTML5 via callback registrado externamente).
const activeControllers: Set<SpotifyEmbedController> = new Set();
type AudioPauseCallback = () => void;
const audioPauseCallbacks: Set<AudioPauseCallback> = new Set();

export function registerSpotifyController(c: SpotifyEmbedController) {
  activeControllers.add(c);
}
export function unregisterSpotifyController(c: SpotifyEmbedController) {
  activeControllers.delete(c);
}

/** Pausa TODOS os outros controllers Spotify (exceto o passado).
 *  Chamado quando um player Spotify começa a tocar — garante que só um
 *  toca por vez no chat. */
export function pauseOtherSpotifyControllers(except: SpotifyEmbedController) {
  activeControllers.forEach(c => {
    if (c !== except) {
      try { c.pause(); } catch {}
    }
  });
}

/** Pausa TODOS os controllers Spotify ativos.
 *  Usado pelo ChatPanel quando um áudio HTML5 (mensagem de voz) começa
 *  a tocar — garante que som Spotify e voz não tocam juntos. */
export function pauseAllSpotifyControllers() {
  activeControllers.forEach(c => {
    try { c.pause(); } catch {}
  });
}

/** Registra um callback que será chamado quando QUALQUER Spotify embed
 *  começar a tocar. Usado pelo ChatPanel pra pausar áudios HTML5
 *  (mensagens de voz) quando uma música Spotify toca.
 *  Retorna função de cleanup pra deregistrar. */
export function onSpotifyPlay(cb: AudioPauseCallback): () => void {
  audioPauseCallbacks.add(cb);
  return () => audioPauseCallbacks.delete(cb);
}

/** Dispara todos os callbacks de "outro audio deve pausar".
 *  Chamado internamente quando um SpotifyEmbed dispara playback_update
 *  com isPaused=false. */
export function notifySpotifyStartedPlaying() {
  audioPauseCallbacks.forEach(cb => { try { cb(); } catch {} });
}
