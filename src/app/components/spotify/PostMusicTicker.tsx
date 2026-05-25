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
import type { SpotifyTrack } from '../../lib/spotify';
import type { SpotifyEmbedController } from '../../lib/spotify-embed-api';
import { SpotifyEmbed } from './SpotifyEmbed';
import { SpotifyLogo } from './SpotifyLogo';

export interface PostMusicTickerHandle {
  togglePlay: () => void;
  /** Retorna o estado atual de playback (true = tocando). */
  isPlaying: () => boolean;
}

interface EngineProps {
  track: SpotifyTrack;
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
  track: SpotifyTrack;
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
