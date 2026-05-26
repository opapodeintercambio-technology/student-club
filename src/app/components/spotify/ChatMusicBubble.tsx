// <ChatMusicBubble />
//
// Bubble de mensagem de música no chat.
// Usa <SpotifyEmbed /> (que internamente usa a Spotify IFrame API)
// pra ter controle programático do player. Quando começa a tocar,
// pausa automaticamente:
//   - Outros embeds Spotify abertos no chat
//   - Áudios HTML5 (mensagens de voz) — via callback registrado no ChatPanel
//
// Também tem botão de curtir (♥) — estado local via localStorage.

import { useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
import { type MusicTrack, isDeezerTrack } from '../../lib/spotify';
import type { DeezerTrack } from '../../lib/deezer';
import { SpotifyEmbed } from './SpotifyEmbed';
import { DeezerChatCard } from '../deezer/DeezerChatCard';

interface Props {
  /** ID estável da mensagem. */
  messageId?: string;
  track: MusicTrack;
  /** Texto opcional acompanhando a música ("ouve essa 🎶"). */
  text?: string;
  /** Quando true, posiciona à direita (mensagem enviada por mim). */
  outgoing?: boolean;
  /** Hora formatada da mensagem (ex: "9:42"). */
  time?: string;
  /** Status de leitura — ícone ao lado do horário. */
  status?: 'sent' | 'delivered' | 'read' | null;
  /** Estado de curtida vindo do DB (mensagens.music_liked sincronizado
   *  via realtime). Quando undefined, cai pro localStorage como fallback
   *  pra mensagens sem id ou em ambientes offline. */
  liked?: boolean;
  /** Callback chamado quando o user clica no coracao. ChatPanel
   *  persiste no DB + notifica o sender via notifyUser. Quando ausente,
   *  cai pro localStorage local. */
  onToggleLike?: () => void;
}

// ─── Fallback localStorage (legacy / mensagens sem messageId) ────────
const LIKES_KEY = 'studentclub_chatmusic_likes_v1';

function loadLikes(): Record<string, 1> {
  try {
    const raw = localStorage.getItem(LIKES_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch { return {}; }
}
function saveLikes(m: Record<string, 1>) {
  try { localStorage.setItem(LIKES_KEY, JSON.stringify(m)); } catch {}
}

export function ChatMusicBubble({ messageId, track, text, outgoing, time, status, liked: likedProp, onToggleLike }: Props) {
  // Quando ChatPanel passa o prop (caso normal), usa direto. Senao cai
  // pro localStorage (fallback legacy). Estado local serve so pro
  // bouncing visual quando o prop ainda nao chegou via realtime.
  const [likedLocal, setLikedLocal] = useState(false);
  const [burst, setBurst] = useState(false);
  const liked = likedProp !== undefined ? likedProp : likedLocal;

  // Carrega o estado de "curtido" no mount via localStorage SO se nao
  // estamos recebendo `liked` via prop (fallback pra mensagens sem id).
  useEffect(() => {
    if (likedProp !== undefined) return;
    if (!messageId) return;
    const likes = loadLikes();
    setLikedLocal(!!likes[messageId]);
  }, [messageId, likedProp]);

  // Guard defensivo: se a track vier null/incompleta (mensagem antiga
  // com schema diferente, JSON corrompido, etc), renderiza fallback
  // amigavel ao inves de crashar o ChatPanel inteiro via ErrorBoundary.
  // Vai DEPOIS dos hooks pra respeitar as rules-of-hooks.
  if (!track || !track.track_id) {
    return (
      <div className={`flex flex-col ${outgoing ? 'items-end' : 'items-start'} gap-1`}>
        <div
          className="px-3 py-2 rounded-2xl text-xs italic"
          style={{
            background: 'rgba(0,0,0,0.06)',
            color: '#6b7280',
            border: '1px dashed rgba(0,0,0,0.12)',
            maxWidth: 280,
          }}
        >
          🎵 Música indisponível
        </div>
        {text && (
          <div
            className="px-3 py-2 rounded-2xl text-sm max-w-[340px]"
            style={{
              background: outgoing ? 'var(--sc-bubble-out, #dcf8c6)' : 'var(--sc-bubble-in, #ffffff)',
              color: 'var(--sc-text-primary, #0c1014)',
              border: !outgoing ? '1px solid rgba(0,0,0,0.06)' : 'none',
            }}
          >
            {text}
          </div>
        )}
      </div>
    );
  }

  function toggleLike() {
    // Callback do ChatPanel — persiste no DB + dispara notif. Quando
    // presente, eh sempre o caminho principal (o estado vem via realtime
    // como `liked` prop, nao precisamos mexer no localStorage).
    if (onToggleLike) {
      // Burst anima localmente como feedback visual instantaneo. Estado
      // real chega via realtime do Supabase em ~100ms.
      if (!liked) {
        setBurst(true);
        setTimeout(() => setBurst(false), 600);
      }
      onToggleLike();
      return;
    }
    // FALLBACK (legacy / mensagens sem id no DB) — localStorage.
    if (!messageId) {
      setLikedLocal(v => !v);
      setBurst(true);
      setTimeout(() => setBurst(false), 600);
      return;
    }
    const likes = loadLikes();
    if (likes[messageId]) {
      delete likes[messageId];
      setLikedLocal(false);
    } else {
      likes[messageId] = 1;
      setLikedLocal(true);
      setBurst(true);
      setTimeout(() => setBurst(false), 600);
    }
    saveLikes(likes);
  }

  return (
    <div className={`flex flex-col ${outgoing ? 'items-end' : 'items-start'} gap-1 relative`}>
      {/* Player oficial Spotify (toca direto no chat).
          Quando começa a tocar, pausa OUTROS players Spotify e áudios HTML5. */}
      <div style={{ position: 'relative' }}>
        {isDeezerTrack(track) ? (
          <DeezerChatCard track={track as DeezerTrack} />
        ) : (
          <SpotifyEmbed trackId={track.track_id} height={80} startMs={track.start_ms || 0} />
        )}
        {/* Botão curtir — CENTRALIZADO horizontalmente no rodape do player
            (estilo Instagram message reactions). left-1/2 + -translate-x-1/2
            posiciona o centro do botao na metade do card. */}
        <button
          type="button"
          onClick={toggleLike}
          className="absolute left-1/2 -bottom-3 w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-transform shadow-lg"
          style={{
            transform: 'translateX(-50%)',
            background: liked ? '#dc2626' : '#ffffff',
            border: liked ? 'none' : '1px solid rgba(0,0,0,0.1)',
            zIndex: 1,
          }}
          aria-label={liked ? 'Descurtir música' : 'Curtir música'}
        >
          <Heart
            className="w-4 h-4"
            fill={liked ? '#ffffff' : 'transparent'}
            color={liked ? '#ffffff' : '#6b7280'}
            strokeWidth={2.5}
          />
        </button>
        {/* Heart burst — anima quando o user curte (some em 600ms).
            Tambem centralizado pra acompanhar o botao. */}
        {burst && liked && (
          <div
            className="pointer-events-none absolute left-1/2 -bottom-3 flex items-center justify-center"
            style={{ transform: 'translateX(-50%)', width: 32, height: 32 }}
          >
            <Heart
              className="absolute"
              style={{
                width: 48,
                height: 48,
                color: '#dc2626',
                fill: '#dc2626',
                filter: 'drop-shadow(0 4px 12px rgba(220,38,38,0.6))',
                animation: 'heartBurst 600ms ease-out forwards',
              }}
            />
          </div>
        )}
      </div>
      {text && (
        <div
          className="px-3 py-2 rounded-2xl text-sm max-w-[340px] mt-3"
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
        <div className="flex items-center gap-1 px-1 text-[10px] text-gray-500 dark:text-gray-400 mt-2">
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
