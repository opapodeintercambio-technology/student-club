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
  /** Callback chamado quando o controller fica pronto. Pai pode usar
   *  pra controlar play/pause programaticamente (ex: IntersectionObserver). */
  onReady?: (controller: SpotifyEmbedController) => void;
}

export function SpotifyEmbed({ trackId, height = 80, hidden = false, onReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let controller: SpotifyEmbedController | null = null;
    let wasPlaying = false;

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
          // Listener pra detectar play/pause
          ctrl.addListener('playback_update', (e: any) => {
            const isPaused = e?.data?.isPaused;
            if (isPaused === false && !wasPlaying) {
              // Começou a tocar — pausa outros Spotify + áudios HTML5
              wasPlaying = true;
              pauseOtherSpotifyControllers(ctrl);
              notifySpotifyStartedPlaying();
            } else if (isPaused === true) {
              wasPlaying = false;
            }
          });
          // Expõe controller pro pai (se solicitado)
          if (onReady) onReady(ctrl);
        }
      );
    })().catch(err => {
      console.warn('[SpotifyEmbed] failed to init', err);
    });

    return () => {
      cancelled = true;
      if (controller) {
        try { unregisterSpotifyController(controller); } catch {}
        try { controller.destroy(); } catch {}
      }
    };
  // onReady intencionalmente fora das deps — só pega na primeira mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId, height]);

  // hidden=true: iframe vai pra fora da tela mas continua renderizado
  // (browsers exigem o iframe estar na DOM e visível pra permitir media).
  // Posição absoluta -9999px funciona — iframe não pinta, só roda áudio.
  const hiddenStyle: React.CSSProperties = hidden
    ? {
        position: 'fixed',
        left: '-9999px',
        top: '-9999px',
        width: 320,
        height: 80,
        pointerEvents: 'none',
        opacity: 0,
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
