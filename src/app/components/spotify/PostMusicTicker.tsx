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
import { createPortal } from 'react-dom';
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

    // IntersectionObserver — autoplay quando o post entra no viewport.
    // Threshold 0.3 (era 0.5) — comeca a tocar JA quando 30% do post
    // aparece, antes do user ter dado scroll completo. rootMargin -200px
    // top/bottom: descarta um pouco da margem pra evitar play prematuro
    // quando o post tá quase saindo da tela. Resultado pratico: o feed
    // toca a musica do post DOMINANTE no viewport — mais natural.
    useEffect(() => {
      const el = visibleAnchorRef.current;
      if (!el) return;
      const io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            setInView(e.isIntersecting && e.intersectionRatio >= 0.3);
          }
        },
        { threshold: [0, 0.3, 0.6, 1], rootMargin: '-100px 0px' },
      );
      io.observe(el);
      return () => io.disconnect();
    }, [visibleAnchorRef]);

    // Função helper: SEEK pro startMs e depois PLAY. Ordem importa —
    // se chamarmos play() primeiro, a musica comeca do 0s, soa por uns
    // milissegundos, e depois pula pro startMs. Inverte: seek -> play
    // garante que comeca diretamente no ponto escolhido sem flash de
    // audio inicial.
    function seekAndPlay(c: SpotifyEmbedController) {
      const startMs = track.start_ms || 0;
      if (startMs > 0) {
        try { c.seek(startMs / 1000); } catch {}
      }
      try { c.play(); } catch {}
    }

    // Espelha inView no ref + toca/pausa o controller (se já estiver pronto)
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
          setPlaying(!isPaused);
          playingRef.current = !isPaused;
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
    // CRITICAL: usa createPortal pra renderizar o iframe direto em
    // document.body, ESCAPANDO de qualquer overflow:hidden / stacking
    // context dos containers pais do post. Sem isso, o root do PostCard
    // (que tem `overflow-hidden`) clipava o iframe Spotify e ele aparecia
    // VISÍVEL no fluxo do feed em vez de invisível.
    if (typeof document === 'undefined') return null;
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
