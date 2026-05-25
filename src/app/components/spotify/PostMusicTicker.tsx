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
import { getFreshDeezerPreviewUrl, playAudioWithGestureRetry } from '../../lib/deezer';
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

    // Toca/pausa o controller quando inView muda
    useEffect(() => {
      inViewRef.current = inView;
      const c = controllerRef.current;
      if (!c) return;
      if (inView) {
        if (!userPausedRef.current && trackLoadedRef.current) {
          seekAndPlay(c);
        }
      } else {
        try { c.pause(); } catch {}
        userPausedRef.current = false;
      }
    }, [inView, track.start_ms]);

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

    // Expõe togglePlay + isPlaying pro pai
    useImperativeHandle(ref, () => ({
      togglePlay: () => {
        const c = controllerRef.current;
        if (!c) return;
        if (playingRef.current) {
          try { c.pause(); } catch {}
          userPausedRef.current = true;
        } else {
          try { c.play(); } catch {}
          userPausedRef.current = false;
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
          registerToggleHandler={(handler) => {
            // Hack: expoe via controllerRef como Spotify pra reaproveitar
            // o togglePlay do useImperativeHandle acima.
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
          }}
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
    // vem de 0-15000 (max). Setamos via loadedmetadata pra garantir que
    // o audio ja tem duracao quando setamos currentTime. Re-aplicamos a
    // cada loop pra nao voltar pro 0.
    const startSec = Math.min((startMs || 0) / 1000, 29.5);
    const seekNow = () => { try { if (startSec > 0) audio.currentTime = startSec; } catch {} };
    if (startSec > 0) {
      if (audio.readyState >= 1) seekNow();
      else audio.addEventListener('loadedmetadata', seekNow, { once: true });
      audio.addEventListener('ended', seekNow);
      const minSnippetEnd = Math.min(startSec + 15, 30);
      audio.addEventListener('timeupdate', () => {
        if (audio.currentTime >= minSnippetEnd - 0.05) {
          try { audio.currentTime = startSec; } catch {}
        }
      });
    }
    audio.addEventListener('play', () => { notifyPlaying(true); playingRef.current = true; });
    audio.addEventListener('pause', () => { notifyPlaying(false); playingRef.current = false; });
    // Registra handlers pro pai
    registerToggleHandler({
      play: () => { audio.play().catch(() => {}); },
      pause: () => { audio.pause(); },
    });
    // Tenta autoplay quando o post esta visivel. playAudioWithGestureRetry
    // resolve o caso de autoplay bloqueado: tenta agora; se rejeitado,
    // registra listeners GLOBAIS pra qualquer proximo gesto do user e
    // re-tenta. Resolve o problema dos terceiros nao ouvirem audio quando
    // o fetch do preview_url demora demais e "esfria" o gesto inicial.
    let cleanupRetry: (() => void) | null = null;
    if (inViewRef.current && !userPausedRef.current) {
      cleanupRetry = playAudioWithGestureRetry(
        audio,
        () => { notifyPlaying(true); playingRef.current = true; },
        () => { /* fail silenciosa — retry ainda esta armado */ },
      );
    }
    return () => {
      cleanupRetry?.();
      try { audio.pause(); } catch {}
    };
  }, [resolvedUrl, startMs, inViewRef, userPausedRef, notifyPlaying, registerToggleHandler, playingRef]);

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
