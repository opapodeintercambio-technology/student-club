// <PostMusicEngine> + <PostMusicTickerChip>
//
// Música no post do feed — estilo Instagram:
//   - Iframe Spotify HIDDEN (toca em background, sem player visível).
//   - Chip pequeno com ícone Spotify + nome da música em SCROLL INFINITO
//     (marquee horizontal). Renderizado AO LADO do username, no header
//     overlay DENTRO da foto.
//   - Autoplay quando o post entra no viewport (IntersectionObserver).
//   - Tap na foto = togglePlay (mute/unmute). Exposto via ref imperativa.
//
// Divisão em 2 componentes pra o pai posicionar cada parte onde quiser:
//   1. <PostMusicEngine> — iframe + lógica. Renderizar uma vez por post,
//      junto com o wrapper da foto. Expõe togglePlay via forwardRef.
//   2. <PostMusicTickerChip> — chip visual com marquee. Renderizar dentro
//      do header overlay da foto, ao lado do username. Puramente visual.
//
// O chip não conhece o engine — é só visual. Quem orquestra o play/pause
// é o pai (PostCard do FeedNews), que detecta o tap na foto e chama
// engineRef.current.togglePlay().

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { SpotifyTrack } from '../../lib/spotify';
import type { SpotifyEmbedController } from '../../lib/spotify-embed-api';
import { SpotifyEmbed } from './SpotifyEmbed';
import { SpotifyLogo } from './SpotifyLogo';

export interface PostMusicTickerHandle {
  togglePlay: () => void;
}

interface EngineProps {
  track: SpotifyTrack;
  /** Ref do wrapper visível da mídia (foto). Usado pelo IntersectionObserver
   *  pra detectar quando entrar no viewport. */
  visibleAnchorRef: React.RefObject<HTMLElement>;
}

export const PostMusicEngine = forwardRef<PostMusicTickerHandle, EngineProps>(
  function PostMusicEngine({ track, visibleAnchorRef }, ref) {
    const controllerRef = useRef<SpotifyEmbedController | null>(null);
    const [playing, setPlaying] = useState(true); // otimista
    const playingRef = useRef(true);
    const [inView, setInView] = useState(false);
    const inViewRef = useRef(false);
    const userPausedRef = useRef(false);
    const trackLoadedRef = useRef(false);

    // IntersectionObserver — autoplay quando a foto entra no viewport (>=50%)
    useEffect(() => {
      const el = visibleAnchorRef.current;
      if (!el) return;
      const io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            setInView(e.isIntersecting && e.intersectionRatio >= 0.5);
          }
        },
        { threshold: [0, 0.5, 1], rootMargin: '0px' },
      );
      io.observe(el);
      return () => io.disconnect();
    }, [visibleAnchorRef]);

    // Espelha inView no ref + toca/pausa o controller (se já estiver pronto)
    useEffect(() => {
      inViewRef.current = inView;
      const c = controllerRef.current;
      if (!c) return;
      if (inView) {
        if (!userPausedRef.current && trackLoadedRef.current) {
          try { c.play(); } catch {}
          if (track.start_ms && track.start_ms > 0) {
            try { c.seek(track.start_ms / 1000); } catch {}
          }
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
          setPlaying(!isPaused);
          playingRef.current = !isPaused;
        }
        if (!trackLoadedRef.current && duration > 0) {
          trackLoadedRef.current = true;
          if (inViewRef.current && !userPausedRef.current) {
            try { ctrl.play(); } catch {}
            if (track.start_ms && track.start_ms > 0) {
              try { ctrl.seek(track.start_ms / 1000); } catch {}
            }
          }
        }
        if (isPaused === false) hasEverPlayed = true;
        if (isPaused === true && inViewRef.current && hasEverPlayed) {
          userPausedRef.current = true;
        }
      });
    }

    // Expõe togglePlay pro pai (chamado quando o user tapa na foto).
    // Usa playingRef (não o state) pra ter o valor MAIS RECENTE — o
    // useImperativeHandle fica memoizado e o `playing` dele pode
    // estar stale entre renders.
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
    }), []);

    // ENGINE não renderiza UI visual — só o iframe oculto.
    // (O chip é renderizado pelo pai usando <PostMusicTickerChip />.)
    return (
      <SpotifyEmbed
        trackId={track.track_id}
        hidden
        autoPlay
        startMs={track.start_ms || 0}
        onReady={handleReady}
      />
    );
  }
);

// ── Chip visual — marquee horizontal infinito ─────────────────────────
// Componente puramente visual. Pode aparecer dentro do header overlay,
// ao lado do username. Não controla o player — só mostra o nome.
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
