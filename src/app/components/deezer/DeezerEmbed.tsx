// <DeezerEmbed trackId height hidden autoPlay startMs />
//
// Wrapper do iframe oficial do Deezer pra tocar uma music.
// URL pattern: https://widget.deezer.com/widget/{theme}/track/{id}?autoplay=true
//
// Diferenças vs SpotifyEmbed:
//   - Deezer NÃO expõe SDK JS pra controle programatico (play/pause/seek).
//     O iframe roda autônomo — passamos parâmetros na URL e o widget toca.
//   - autoplay=true funciona se houver gesto recente do user (mesma
//     política dos browsers).
//   - Pra "mute"/"pausar" via tap na foto, usamos HTML5 audio com preview_url
//     em paralelo (não dependemos do iframe) — pra paridade com Spotify.

import { useEffect, useRef } from 'react';

interface Props {
  trackId: string;
  /** Altura do embed: 90 (compact) ou 200 (com album art lateral). */
  height?: number;
  /** Quando true, posiciona offscreen invisível (igual SpotifyEmbed hidden). */
  hidden?: boolean;
  /** Inicia tocando ao carregar (browser pode bloquear sem gesto). */
  autoPlay?: boolean;
  /** Tema: dark | light | auto. */
  theme?: 'dark' | 'light' | 'auto';
}

export function DeezerEmbed({ trackId, height = 90, hidden = false, autoPlay = false, theme = 'auto' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Constroi URL do widget oficial Deezer
  // Parametros suportados:
  //   autoplay=true|false  - inicia tocando
  //   tracklist=true|false - mostra lista de tracks (false pra single track)
  //   app_id, format       - opcionais
  const widgetUrl = (() => {
    const u = new URL(`https://widget.deezer.com/widget/${theme}/track/${trackId}`);
    if (autoPlay) u.searchParams.set('autoplay', 'true');
    u.searchParams.set('tracklist', 'false');
    return u.toString();
  })();

  // O iframe Deezer NÃO usa SDK — não tem play/pause/seek programatico.
  // O autoplay é via querystring (autoplay=true).
  // Pra resetar (re-tocar), basta destruir/re-criar o iframe (key prop).
  useEffect(() => {
    // Nada a fazer — o iframe é declarativo.
  }, [trackId]);

  const hiddenStyle: React.CSSProperties = hidden
    ? {
        position: 'fixed',
        right: 0,
        bottom: 0,
        width: 320,
        height: 90,
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
        background: 'linear-gradient(135deg, rgba(0,166,255,0.10), rgba(0,166,255,0.04))',
        overflow: 'hidden',
        minWidth: 260,
        maxWidth: 340,
      };

  return (
    <div ref={containerRef} style={hiddenStyle}>
      <iframe
        title="Deezer Player"
        src={widgetUrl}
        width="100%"
        height={height}
        frameBorder="0"
        allowTransparency
        allow="encrypted-media; clipboard-write; autoplay"
        style={{ border: 'none', display: 'block' }}
      />
    </div>
  );
}
