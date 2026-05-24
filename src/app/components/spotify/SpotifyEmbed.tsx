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
}

export function SpotifyEmbed({ trackId, height = 80 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<SpotifyEmbedController | null>(null);

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
          controllerRef.current = ctrl;
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
        controllerRef.current = null;
      }
    };
  }, [trackId, height]);

  // O container vira o iframe via createController. Tem placeholder
  // visual enquanto o API nao carrega (fundo verde claro Spotify).
  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height,
        borderRadius: 12,
        background: 'linear-gradient(135deg, rgba(30,185,84,0.10), rgba(30,185,84,0.04))',
        overflow: 'hidden',
        minWidth: 260,
        maxWidth: 340,
      }}
    />
  );
}
