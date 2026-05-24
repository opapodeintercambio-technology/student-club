// <ChatMusicBubble />
//
// Wrapper específico do chat: usa o EMBED OFICIAL do Spotify (iframe)
// pra tocar a música direto no chat. O embed:
//   - Toca preview 30s pra usuários gratuitos
//   - Toca a faixa COMPLETA pra usuários Spotify Premium logados
//   - Tem play/pause + progresso + capa + link "Open in Spotify"
//   - Respeita 100% as restrições do Spotify Developer ToS
//     (NÃO transmitimos áudio — o Spotify CDN entrega direto)
//
// O iframe substitui o TrackPlayer custom que dependia de preview_url
// (que o Spotify removeu de quase todas as tracks em 2024).

import type { SpotifyTrack } from '../../lib/spotify';

interface Props {
  track: SpotifyTrack;
  /** Texto opcional acompanhando a música ("ouve essa 🎶"). */
  text?: string;
  /** Quando true, posiciona à direita (mensagem enviada por mim). */
  outgoing?: boolean;
  /** Hora formatada da mensagem (ex: "9:42"). */
  time?: string;
  /** Status de leitura — ícone ao lado do horário. */
  status?: 'sent' | 'delivered' | 'read' | null;
}

export function ChatMusicBubble({ track, text, outgoing, time, status }: Props) {
  return (
    <div className={`flex flex-col ${outgoing ? 'items-end' : 'items-start'} gap-1`}>
      {/* Embed oficial do Spotify — toca direto no chat.
          Theme=0 → tema claro do Spotify, branding verde. */}
      <iframe
        title={`${track.name} - ${track.artist}`}
        src={`https://open.spotify.com/embed/track/${track.track_id}?utm_source=studentclub`}
        width="320"
        height="80"
        loading="lazy"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        style={{
          borderRadius: 12,
          border: 'none',
          maxWidth: '100%',
          minWidth: 260,
        }}
      />
      {text && (
        <div
          className="px-3 py-2 rounded-2xl text-sm max-w-[340px]"
          style={{
            background: outgoing
              ? 'var(--sc-bubble-out, #dcf8c6)'
              : 'var(--sc-bubble-in, #ffffff)',
            color: 'var(--sc-text-primary, #0c1014)',
            border: !outgoing ? '1px solid rgba(0,0,0,0.06)' : 'none',
          }}
        >
          {text}
        </div>
      )}
      {(time || status) && (
        <div className="flex items-center gap-1 px-1 text-[10px] text-gray-500 dark:text-gray-400">
          {time && <span>{time}</span>}
          {status && (
            <span className={status === 'read' ? 'text-blue-500' : ''}>
              {status === 'sent' && '✓'}
              {status === 'delivered' && '✓✓'}
              {status === 'read' && '✓✓'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
