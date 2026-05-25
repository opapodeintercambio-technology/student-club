// <PostMusicEngine> + <PostMusicTickerChip> + <PostMusicSoundIcon>
//
// Música no post do feed — estilo Instagram:
//   - Iframe Spotify HIDDEN (toca em background, sem player visível).
//     Renderizado via createPortal em document.body pra escapar de
//     overflow:hidden de containers pais.
//   - Chip pequeno com ícone Spotify + nome em SCROLL INFINITO (marquee
//     horizontal). Renderizado dentro do header overlay, ao lado do username.
//   - Ícone de SOM (Volume2/VolumeX) — botão visual indicando se a música
//     está tocando. Tap toggla. Estilo Instagram.
//   - Autoplay quando o post entra no viewport (IntersectionObserver).
//   - Tap na foto = togglePlay (mute/unmute via pause/play).
//   - Pré-load: iframe começa a carregar quando o post está 600px ABAIXO
//     do viewport — assim quando o user chega, já está pronto.
//
// Divisão em 3 componentes que compartilham estado via ref imperativa:
//   1. <PostMusicEngine ref> — iframe + lógica. Expõe togglePlay + isPlaying.
//   2. <PostMusicTickerChip track playing> — chip visual com marquee.
//   3. <PostMusicSoundIcon playing onClick> — ícone de som clicável.

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Volume2, VolumeX } from 'lucide-react';
import { type MusicTrack, isDeezerTrack } from '../../lib/spotify';
import { getFreshDeezerPreviewUrl, playAudioWithGestureRetry, clampDeezerStartMs } from '../../lib/deezer';
import { getFeedMuted, setFeedMuted, subscribeFeedMuted } from '../../lib/feedAudio';
import type { SpotifyEmbedController } from '../../lib/spotify-embed-api';
import { SpotifyEmbed } from './SpotifyEmbed';
import { SpotifyLogo } from './SpotifyLogo';

export interface PostMusicTickerHandle {
  togglePlay: () => void;
  /** Retorna o estado atual de playback (true = tocando). */
  isPlaying: () => boolean;
}

interface EngineProps {
  track: MusicTrack;
  /** Ref do wrapper visível da mídia (foto). Usado pelo IntersectionObserver
   *  pra detectar quando entrar no viewport. */
  visibleAnchorRef: React.RefObject<HTMLElement>;
  /** Callback opcional pro pai reagir a mudancas de play/pause (renderiza
   *  icone de som on/off, etc). */
  onPlayingChange?: (playing: boolean) => void;
}

export const PostMusicEngine = forwardRef<PostMusicTickerHandle, EngineProps>(
  function PostMusicEngine({ track, visibleAnchorRef, onPlayingChange }, ref) {
    const controllerRef = useRef<SpotifyEmbedController | null>(null);
    const playingRef = useRef(true); // otimista
    const [inView, setInView] = useState(false);
    // Pre-load: o iframe carrega quando o post esta 600px abaixo do viewport
    // (rootMargin amplo). Assim, ao chegar o post, o iframe ja esta pronto.
    const [shouldMount, setShouldMount] = useState(false);
    const inViewRef = useRef(false);
    const userPausedRef = useRef(false);
    const trackLoadedRef = useRef(false);

    // Notifica o pai quando playing muda — pra ele atualizar icone de som etc.
    const notifyPlaying = useCallback((p: boolean) => {
      playingRef.current = p;
      if (onPlayingChange) onPlayingChange(p);
    }, [onPlayingChange]);

    // IntersectionObserver com 2 observers:
    //   A) PRE-LOAD: rootMargin 600px — iframe carrega bem antes do post chegar.
    //   B) AUTOPLAY: rootMargin -100px + threshold 0.3 — toca quando dominante
    //      no viewport.
    useEffect(() => {
      const el = visibleAnchorRef.current;
      if (!el) return;
      const ioPreload = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              setShouldMount(true);
              ioPreload.disconnect();
              return;
            }
          }
        },
        { threshold: 0, rootMargin: '600px 0px' },
      );
      const ioAutoplay = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            setInView(e.isIntersecting && e.intersectionRatio >= 0.3);
          }
        },
        { threshold: [0, 0.3, 0.6, 1], rootMargin: '-100px 0px' },
      );
      ioPreload.observe(el);
      ioAutoplay.observe(el);
      return () => {
        ioPreload.disconnect();
        ioAutoplay.disconnect();
      };
    }, [visibleAnchorRef]);

    // Função helper: SEEK pro startMs e depois PLAY. Ordem importa —
    // seek antes garante que comeca direto no ponto escolhido sem flash
    // de audio inicial do 0s.
    function seekAndPlay(c: SpotifyEmbedController) {
      const startMs = track.start_ms || 0;
      if (startMs > 0) {
        try { c.seek(startMs / 1000); } catch {}
      }
      try { c.play(); } catch {}
    }

    // Toca/pausa o controller quando inView muda. Respeita o estado
    // GLOBAL de mute do feed — se o feed esta mutado (user mutou algum
    // outro video/post, ou abriu story), nao da play automatico.
    useEffect(() => {
      inViewRef.current = inView;
      const c = controllerRef.current;
      if (!c) return;
      if (inView) {
        if (!userPausedRef.current && trackLoadedRef.current && !getFeedMuted()) {
          seekAndPlay(c);
        }
      } else {
        try { c.pause(); } catch {}
        userPausedRef.current = false;
      }
    }, [inView, track.start_ms]);

    // Subscribe ao mute global do feed: se outro player do feed mudar
    // o estado (ou Stories disparar mute), reagir aqui. Mute=pause.
    // Desmute NAO faz play sozinho — user precisa tocar pra evitar
    // estouro de audio inesperado.
    useEffect(() => {
      const unsub = subscribeFeedMuted((muted) => {
        const c = controllerRef.current;
        if (!c) return;
        if (muted) {
          try { c.pause(); } catch {}
          userPausedRef.current = true;
        } else {
          // Desmutou globalmente — se este post esta in view, retoma.
          userPausedRef.current = false;
          if (inViewRef.current && trackLoadedRef.current) {
            seekAndPlay(c);
          }
        }
      });
      return unsub;
    }, []);

    function handleReady(ctrl: SpotifyEmbedController) {
      controllerRef.current = ctrl;
      let hasEverPlayed = false;
      ctrl.addListener('playback_update', (e: any) => {
        const isPaused = e?.data?.isPaused;
        const duration = e?.data?.duration ?? 0;
        if (typeof isPaused === 'boolean') {
          notifyPlaying(!isPaused);
        }
        if (!trackLoadedRef.current && duration > 0) {
          trackLoadedRef.current = true;
          if (inViewRef.current && !userPausedRef.current) {
            seekAndPlay(ctrl);
          }
        }
        if (isPaused === false) hasEverPlayed = true;
        if (isPaused === true && inViewRef.current && hasEverPlayed) {
          userPausedRef.current = true;
        }
      });
    }

    // Handler ESTAVEL pro Deezer registrar play/pause. useCallback com
    // deps vazias garante referencia constante — nao causa re-run do
    // useEffect do DeezerAudioPlayer durante scroll.
    const registerDeezerHandler = useCallback((handler: { play: () => void; pause: () => void }) => {
      controllerRef.current = {
        play: handler.play,
        pause: handler.pause,
        togglePlay: () => playingRef.current ? handler.pause() : handler.play(),
        seek: () => {},
        loadUri: () => {},
        destroy: () => {},
        addListener: () => {},
        removeListener: () => {},
      } as any;
      // Marca como track loaded — Deezer carrega instantaneo via preview_url
      trackLoadedRef.current = true;
    }, []);

    // Expõe togglePlay + isPlaying pro pai. togglePlay tambem sincroniza
    // o ESTADO GLOBAL de mute do feed — se o user pausa um post, todos
    // ficam mudos; se desmuta, todos voltam a tocar (estado global).
    useImperativeHandle(ref, () => ({
      togglePlay: () => {
        const c = controllerRef.current;
        if (!c) return;
        if (playingRef.current) {
          try { c.pause(); } catch {}
          userPausedRef.current = true;
          setFeedMuted(true);
        } else {
          try { c.play(); } catch {}
          userPausedRef.current = false;
          setFeedMuted(false);
        }
      },
      isPlaying: () => playingRef.current,
    }), []);

    // Iframe oculto via portal — só monta depois do pre-load detectar
    // proximidade do post no viewport. Sem isso, posts FORA da tela
    // mantinham iframes ociosos consumindo memoria.
    if (!shouldMount || typeof document === 'undefined') return null;
    // DEEZER usa HTML5 audio com preview_url (30s MP3 direto) — nao
    // precisa de iframe / SDK. Player invisivel. Autoplay/pause/seek
    // controlados via DeezerAudioPlayer abaixo.
    if (isDeezerTrack(track)) {
      return createPortal(
        <DeezerAudioPlayer
          trackId={track.track_id}
          previewUrl={track.preview_url}
          startMs={track.start_ms || 0}
          inViewRef={inViewRef}
          userPausedRef={userPausedRef}
          notifyPlaying={notifyPlaying}
          // CRITICO: useCallback estavel. Antes era lambda inline,
          // criava nova referencia a cada render do PostMusicEngine
          // (que re-renderiza toda vez que inView muda durante scroll).
          // Isso fazia o useEffect do DeezerAudioPlayer re-rodar a cada
          // scroll, adicionando NOVOS event listeners no audio sem
          // remover os antigos — listeners empilhavam, audio tremia.
          registerToggleHandler={registerDeezerHandler}
          playingRef={playingRef}
        />,
        document.body,
      );
    }
    return createPortal(
      <SpotifyEmbed
        trackId={track.track_id}
        hidden
        autoPlay
        startMs={track.start_ms || 0}
        onReady={handleReady}
      />,
      document.body,
    );
  }
);

// ── Chip visual — marquee horizontal infinito ─────────────────────────
interface ChipProps {
  track: MusicTrack;
}

export function PostMusicTickerChip({ track }: ChipProps) {
  const tickerText = `${track.name} · ${track.artist}`;
  return (
    <div
      className="flex items-center gap-1.5 px-2 py-0.5 rounded-full select-none pointer-events-none"
      style={{
        background: 'rgba(255,255,255,0.18)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        maxWidth: 180,
        overflow: 'hidden',
      }}
      aria-label={`Tocando: ${tickerText}`}
    >
      <SpotifyLogo className="w-3 h-3 flex-shrink-0" mono />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          maskImage: 'linear-gradient(to right, transparent, #000 8%, #000 92%, transparent)',
          WebkitMaskImage: 'linear-gradient(to right, transparent, #000 8%, #000 92%, transparent)',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            color: '#fff',
            fontSize: 10,
            fontWeight: 600,
            paddingLeft: '100%',
            animation: 'postMusicTicker 14s linear infinite',
            textShadow: '0 1px 2px rgba(0,0,0,0.5)',
          }}
        >
          {tickerText}
        </span>
      </div>
    </div>
  );
}

// ── Ícone de som (Volume2/VolumeX) — visível dentro da foto ────────────
// Igual o do FeedVideo. Tap toggla play/pause da musica.
// Posicionado pelo pai (geralmente absolute bottom-right da foto).
// ── Deezer audio player — HTML5 audio invisivel pra preview_url ─────
// O Spotify usa iframe + SDK. Deezer usa <audio> nativo com o preview_url
// (MP3 30s direto) porque o iframe do Deezer nao expoe API programatica.
// Vantagem: autoplay funciona mais facil (HTML5 audio aceita autoplay
// se muted=false MAS user fez gesto recente; igual Spotify iframe).
function DeezerAudioPlayer({
  trackId,
  previewUrl,
  startMs,
  inViewRef,
  userPausedRef,
  notifyPlaying,
  registerToggleHandler,
  playingRef,
}: {
  trackId: string;
  previewUrl: string;
  startMs: number;
  inViewRef: React.MutableRefObject<boolean>;
  userPausedRef: React.MutableRefObject<boolean>;
  notifyPlaying: (playing: boolean) => void;
  registerToggleHandler: (h: { play: () => void; pause: () => void }) => void;
  playingRef: React.MutableRefObject<boolean>;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Cache do preview FRESH: o preview_url salvo no post tem token que
  // expira (querystring `exp=...`). Buscamos a URL valida via
  // /api/deezer/track quando o componente monta.
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);

  // Refs latentes pros handlers que podem mudar entre renders. Setup
  // pesado (event listeners, gesture retry) so depende de resolvedUrl/
  // startMs — se notifyPlaying/registerToggleHandler mudarem, NAO causam
  // re-run desnecessario do useEffect principal.
  const notifyPlayingRef = useRef(notifyPlaying);
  const registerToggleHandlerRef = useRef(registerToggleHandler);
  useEffect(() => { notifyPlayingRef.current = notifyPlaying; }, [notifyPlaying]);
  useEffect(() => { registerToggleHandlerRef.current = registerToggleHandler; }, [registerToggleHandler]);

  // Resolve preview FRESH na montagem do componente
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fresh = await getFreshDeezerPreviewUrl(trackId, previewUrl);
      if (cancelled) return;
      setResolvedUrl(fresh || previewUrl || null);
    })();
    return () => { cancelled = true; };
  }, [trackId, previewUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !resolvedUrl) return;
    // Loop pra musica continuar tocando enquanto post estiver visivel
    audio.loop = true;
    // Aplica offset escolhido pelo user no trim. Preview tem 30s — start_ms
    // valido fica em 0-15000. Posts antigos podem ter valor maior (ex: 56500
    // quando o trim era baseado na duracao da musica completa).
    // clampDeezerStartMs zera se invalido pra audio nao travar no final.
    const startSec = clampDeezerStartMs(startMs) / 1000;

    // Handlers nomeados pra removeEventListener no cleanup. ANTES eram
    // lambdas inline — impossivel de remover — e se acumulavam quando o
    // useEffect re-rodava, causando o audio a tremer/repetir.
    const seekNow = () => { try { if (startSec > 0) audio.currentTime = startSec; } catch {} };
    const minSnippetEnd = Math.min(startSec + 15, 30);
    const onTimeUpdate = () => {
      if (audio.currentTime >= minSnippetEnd - 0.05) {
        try { audio.currentTime = startSec; } catch {}
      }
    };
    const onPlay = () => {
      notifyPlayingRef.current?.(true);
      playingRef.current = true;
    };
    const onPause = () => {
      notifyPlayingRef.current?.(false);
      playingRef.current = false;
    };

    if (startSec > 0) {
      if (audio.readyState >= 1) seekNow();
      else audio.addEventListener('loadedmetadata', seekNow, { once: true });
      audio.addEventListener('ended', seekNow);
      audio.addEventListener('timeupdate', onTimeUpdate);
    }
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);

    // Registra handlers pro pai — via REF estavel (nao re-roda este effect)
    registerToggleHandlerRef.current?.({
      play: () => { audio.play().catch(() => {}); },
      pause: () => { audio.pause(); },
    });

    // Tenta autoplay quando o post esta visivel. playAudioWithGestureRetry
    // resolve o caso de autoplay bloqueado: tenta agora; se rejeitado,
    // registra listeners GLOBAIS pra qualquer proximo gesto do user e
    // re-tenta. cleanupRetry remove os listeners globais — CRITICO no
    // cleanup pra nao empilharem em re-renders.
    let cleanupRetry: (() => void) | null = null;
    if (inViewRef.current && !userPausedRef.current) {
      cleanupRetry = playAudioWithGestureRetry(
        audio,
        () => { notifyPlayingRef.current?.(true); playingRef.current = true; },
        () => { /* fail silenciosa — retry ainda esta armado */ },
      );
    }
    return () => {
      cleanupRetry?.();
      // Remove TODOS os listeners adicionados — sem isso, re-runs do
      // useEffect deixam handlers acumulados (cada re-run tinha listeners
      // novos somando aos antigos).
      audio.removeEventListener('loadedmetadata', seekNow);
      audio.removeEventListener('ended', seekNow);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      try { audio.pause(); } catch {}
    };
    // Deps INTENCIONALMENTE limitadas: refs sao estaveis, notifyPlaying/
    // registerToggleHandler entram via ref latent (notifyPlayingRef etc).
    // Se incluissemos as funcoes diretamente, o effect re-rodaria toda
    // vez que o pai re-renderizasse (ex: scroll), reproduzindo o bug.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedUrl, startMs]);

  if (!resolvedUrl) return null;

  return (
    <audio
      ref={audioRef}
      src={resolvedUrl}
      preload="auto"
      style={{
        position: 'fixed',
        right: 0,
        bottom: 0,
        width: 1,
        height: 1,
        opacity: 0,
        pointerEvents: 'none',
      }}
    />
  );
}

interface SoundIconProps {
  playing: boolean;
  onClick: (e: React.MouseEvent) => void;
}

export function PostMusicSoundIcon({ playing, onClick }: SoundIconProps) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
      className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-transform"
      style={{
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        color: '#fff',
      }}
      aria-label={playing ? 'Desligar som da música' : 'Ligar som da música'}
    >
      {playing
        ? <Volume2 className="w-4 h-4" />
        : <VolumeX className="w-4 h-4" />}
    </button>
  );
}
