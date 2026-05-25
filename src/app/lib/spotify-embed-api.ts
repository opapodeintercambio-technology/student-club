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

// ─── AUDIO UNLOCK GLOBAL ─────────────────────────────────────────────
// Browsers (Chrome/Safari/Firefox) bloqueiam autoplay com som ate o
// usuario fazer um gesto (click/tap/key). Pra garantir que iframes
// Spotify criados DEPOIS do gesto inicial consigam tocar, escutamos
// o primeiro pointerdown da sessao e:
//   1. Destravamos o AudioContext da pagina (silent buffer)
//   2. Disparamos play() em TODOS os controllers Spotify ja registrados
//      mas que ainda nao estao tocando. Browser herda o gesto recem-feito
//      pra esses iframes.
// Sem isso, em SPAs onde o user clica em "Stories" e o iframe sobe DEPOIS,
// o autoplay pode ser bloqueado mesmo com retries — porque entre o
// gesto e o iframe ficar pronto, o gesto "esfria".
let audioUnlocked = false;
let unlockAudioCtx: AudioContext | null = null;

function performAudioUnlock() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  // 1. Destrava AudioContext da pagina (alguns browsers exigem isso
  //    pra liberar audio de qualquer fonte, inclusive iframes filhos)
  try {
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      unlockAudioCtx = new AudioCtx();
      if (unlockAudioCtx && unlockAudioCtx.state === 'suspended') {
        unlockAudioCtx.resume().catch(() => {});
      }
      // Toca um buffer silencioso de 1 sample
      const buffer = unlockAudioCtx.createBuffer(1, 1, 22050);
      const source = unlockAudioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(unlockAudioCtx.destination);
      source.start(0);
    }
  } catch {}
  // 2. Dispara play() em todos os controllers ja registrados
  activeControllers.forEach(c => {
    try { c.play(); } catch {}
  });
}

// Guard idempotente — sem isso, HMR no dev / re-import do modulo em
// Capacitor WebView reset / qualquer outro caso onde o modulo eh
// re-avaliado deixaria 4 listeners CAPTURE empilhados na window
// (cada um anexando playSpotify pra todos os controllers).
if (typeof window !== 'undefined' && !(window as any).__spotifyUnlockInstalled) {
  (window as any).__spotifyUnlockInstalled = true;
  const handler = () => {
    performAudioUnlock();
    // Remove listeners — so precisamos uma vez por sessao
    window.removeEventListener('pointerdown', handler, true);
    window.removeEventListener('touchstart', handler, true);
    window.removeEventListener('click', handler, true);
    window.removeEventListener('keydown', handler, true);
  };
  // Captura na fase de CAPTURE pra pegar antes de qualquer
  // stopPropagation feito por componentes filhos.
  window.addEventListener('pointerdown', handler, { capture: true });
  window.addEventListener('touchstart', handler, { capture: true, passive: true });
  window.addEventListener('click', handler, { capture: true });
  window.addEventListener('keydown', handler, { capture: true });
}

/** Retorna se o audio ja foi destravado nessa sessao. */
export function isAudioUnlocked() {
  return audioUnlocked;
}
