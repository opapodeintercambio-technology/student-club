// <ChatMusicBubble />
//
// Wrapper específico do chat: renderiza TrackPlayer variant="chat" +
// texto opcional embaixo + status de leitura. Mantém compatibilidade
// com a UI existente de bubble do ChatPanel.

import { TrackPlayer } from './TrackPlayer';
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
      <TrackPlayer track={track} variant="chat" />
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
