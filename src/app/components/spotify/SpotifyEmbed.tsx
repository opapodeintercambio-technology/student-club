// <SpotifyEmbed track={track} />
//
// Wrapper do iframe oficial do Spotify usando a Spotify IFrame API.
// Permite controle programático do player + escutar eventos de
// playback (play/pause).
//
// Quando o player começa a tocar:
//   1. Pausa todos os OUTROS Spotify embeds (so um toca por vez)
//   2. Notifica callbacks registrados (ChatPanel usa pra pausar
//      mensagens de áudio HTML5 que estiverem tocando)

import { useEffect, useRef } from 'react';
import {
  getSpotifyAPI,
  registerSpotifyController,
  unregisterSpotifyController,
  pauseOtherSpotifyControllers,
  notifySpotifyStartedPlaying,
  type SpotifyEmbedController,
} from '../../lib/spotify-embed-api';

interface Props {
  trackId: string;
  /** Altura do embed: 80 (compact, default) ou 152 (com album art lateral). */
  height?: number;
  /** Quando true, o componente fica POSICIONADO offscreen mas renderizado
   *  (pra browsers permitirem playback). Usado nos stories — a UI visual
   *  é o chip de capa girando, o iframe toca em background. */
  hidden?: boolean;
  /** Quando true, o componente TENTA TOCAR sozinho assim que o track
   *  carrega. Inclui retries automáticos. Se o browser bloquear o
   *  autoplay, chama onAutoplayBlocked. */
  autoPlay?: boolean;
  /** Ponto inicial em milissegundos. Tocará desde aqui (ctrl.seek).
   *  Useado pra "selecionar os 30s da música" no editor. */
  startMs?: number;
  /** Chamado SE o autoplay falhar (browser bloqueou). Pai pode mostrar
   *  overlay "Tocar música" pro user dar gesto direto. */
  onAutoplayBlocked?: () => void;
  /** Callback chamado quando o controller fica pronto. Pai pode usar
   *  pra controlar play/pause programaticamente (ex: IntersectionObserver). */
  onReady?: (controller: SpotifyEmbedController) => void;
}

export function SpotifyEmbed({ trackId, height = 80, hidden = false, autoPlay = false, startMs = 0, onAutoplayBlocked, onReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let controller: SpotifyEmbedController | null = null;
    let wasPlaying = false;
    let trackLoaded = false;
    let didTryAutoplay = false;
    let didSeekStart = false;
    let autoplayBlockedTimer: ReturnType<typeof setTimeout> | null = null;

    (async () => {
      const api = await getSpotifyAPI();
      if (cancelled || !containerRef.current) return;
      api.createController(
        containerRef.current,
        {
          uri: `spotify:track:${trackId}`,
          width: '100%',
          height,
        },
        (ctrl) => {
          if (cancelled) {
            try { ctrl.destroy(); } catch {}
            return;
          }
          controller = ctrl;
          registerSpotifyController(ctrl);
          // Garante que o iframe permite autoplay. O SDK do Spotify
          // costuma setar isso, mas em alguns browsers (Safari iOS
          // principalmente) falta o flag e o autoplay é bloqueado
          // silenciosamente. Sem isso, story/feed exigem clique manual.
          try {
            const iframe = containerRef.current?.querySelector('iframe');
            if (iframe) {
              const current = iframe.getAttribute('allow') || '';
              if (!/autoplay/i.test(current)) {
                iframe.setAttribute('allow', `${current ? current + '; ' : ''}autoplay; encrypted-media; clipboard-write`);
              }
            }
          } catch {}

          // ── tryAutoplay + seek pra startMs ─────────────────────────
          // Estrategia: chama play() VARIAS vezes em retry. Cada retry
          // re-checa se realmente tocou (via playback_update).
          const tryAutoplay = () => {
            if (!autoPlay || didTryAutoplay) return;
            didTryAutoplay = true;
            try { ctrl.play(); } catch {}
            // Aplica startMs se fornecido
            if (startMs > 0 && !didSeekStart) {
              didSeekStart = true;
              try { ctrl.seek(startMs / 1000); } catch {}
            }
            // Watchdog: se em 2.5s ainda não está tocando, considera
            // autoplay bloqueado pelo browser e avisa o pai
            if (autoplayBlockedTimer) clearTimeout(autoplayBlockedTimer);
            autoplayBlockedTimer = setTimeout(() => {
              if (!wasPlaying && onAutoplayBlocked) {
                try { onAutoplayBlocked(); } catch {}
              }
            }, 2500);
          };

          // Listener pra detectar play/pause + AUTOPLAY + SEEK inicial
          ctrl.addListener('playback_update', (e: any) => {
            const isPaused = e?.data?.isPaused;
            const duration = e?.data?.duration ?? 0;
            // Track terminou de carregar? (primeira vez que vemos duration > 0)
            if (!trackLoaded && duration > 0) {
              trackLoaded = true;
              tryAutoplay();
            }
            if (isPaused === false && !wasPlaying) {
              // Começou a tocar — pausa outros Spotify + áudios HTML5
              wasPlaying = true;
              if (autoplayBlockedTimer) {
                clearTimeout(autoplayBlockedTimer);
                autoplayBlockedTimer = null;
              }
              pauseOtherSpotifyControllers(ctrl);
              notifySpotifyStartedPlaying();
            } else if (isPaused === true) {
              wasPlaying = false;
            }
          });

          // Tentativa imediata (caso o track já esteja em cache do navegador)
          if (autoPlay) tryAutoplay();

          // Expõe controller pro pai (se solicitado)
          if (onReady) onReady(ctrl);
        }
      );
    })().catch(err => {
      console.warn('[SpotifyEmbed] failed to init', err);
    });

    return () => {
      cancelled = true;
      if (autoplayBlockedTimer) clearTimeout(autoplayBlockedTimer);
      if (controller) {
        try { unregisterSpotifyController(controller); } catch {}
        try { controller.destroy(); } catch {}
      }
    };
  // onReady/onAutoplayBlocked intencionalmente fora das deps — só pega
  // na primeira mount. trackId/height/autoPlay/startMs disparam re-mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId, height, autoPlay, startMs]);

  // hidden=true: iframe fica DENTRO do viewport mas invisível (opacity
  // quase zero, pointer-events none, z-index negativo). Browsers
  // (especialmente Safari iOS) tendem a BLOQUEAR autoplay em iframes
  // 100% offscreen ou com display:none — então posicionamos in-viewport
  // mas escondido visualmente. O iframe ainda executa áudio.
  // Mantemos as dimensões 320x80 que o createController usa, com
  // overflow:hidden + clip pra não vazar nada visualmente.
  const hiddenStyle: React.CSSProperties = hidden
    ? {
        position: 'fixed',
        right: 0,
        bottom: 0,
        width: 320,
        height: 80,
        pointerEvents: 'none',
        opacity: 0.001,
        zIndex: -1,
        overflow: 'hidden',
        clipPath: 'inset(50%)',
      }
    : {
        width: '100%',
        height,
        borderRadius: 12,
        background: 'linear-gradient(135deg, rgba(30,185,84,0.10), rgba(30,185,84,0.04))',
        overflow: 'hidden',
        minWidth: 260,
        maxWidth: 340,
      };

  return <div ref={containerRef} style={hiddenStyle} />;
}
