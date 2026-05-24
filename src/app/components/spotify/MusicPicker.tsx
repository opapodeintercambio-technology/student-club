// <MusicPicker open onClose onSelect />
//
// Modal de busca de músicas reutilizável em STORY, POST e CHAT.
// O componente NÃO sabe onde está sendo usado — só busca, lista, e
// chama onSelect(track) com a track escolhida. O caller decide o que
// fazer (anexar ao story draft / post draft / mandar como mensagem).

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Play, Pause, Music } from 'lucide-react';
import { searchSpotifyTracks, type SpotifyTrack, SpotifyAuthError, formatDuration } from '../../lib/spotify';
import { useSpotifyConnection } from '../../hooks/useSpotifyConnection';
import { SpotifyLogo } from './SpotifyLogo';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (track: SpotifyTrack) => void;
  /** Pra onde mandar o user se ele não tiver Spotify conectado (default: /conexoes) */
  connectRedirect?: string;
}

export function MusicPicker({ open, onClose, onSelect, connectRedirect = '/conexoes' }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SpotifyTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { connected, isLoading: connLoading, connect } = useSpotifyConnection();

  // Debounce 300ms na busca
  useEffect(() => {
    if (!open || !connected) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || query.trim().length < 2) {
      setResults([]);
      setError(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const tracks = await searchSpotifyTracks(query.trim(), 10);
        setResults(tracks);
      } catch (e: any) {
        setResults([]);
        if (e instanceof SpotifyAuthError) {
          setError('Conexão com Spotify expirou. Reconecte em Conexões.');
        } else {
          setError(e?.message || 'Falha na busca');
        }
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, open, connected]);

  // Cleanup ao fechar
  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setError(null);
      setPreviewingId(null);
      if (audioRef.current) { try { audioRef.current.pause(); } catch {} audioRef.current = null; }
    }
  }, [open]);

  function previewTrack(track: SpotifyTrack) {
    // Para o áudio anterior
    if (audioRef.current) { try { audioRef.current.pause(); } catch {} audioRef.current = null; }
    // Toggle: se já era esse, só desliga
    if (previewingId === track.track_id) {
      setPreviewingId(null);
      return;
    }
    if (!track.preview_url) return;
    const audio = new Audio(track.preview_url);
    audio.play().then(() => {
      setPreviewingId(track.track_id);
    }).catch(() => {});
    audio.onended = () => { setPreviewingId(null); };
    audioRef.current = audio;
  }

  function selectTrack(track: SpotifyTrack) {
    if (audioRef.current) { try { audioRef.current.pause(); } catch {} audioRef.current = null; }
    setPreviewingId(null);
    onSelect(track);
    onClose();
  }

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col"
        style={{ maxHeight: '85vh', minHeight: '60vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-black/5 dark:border-white/10 flex items-center gap-3">
          <SpotifyLogo className="w-5 h-5" />
          <h3 className="text-base font-bold text-gray-800 dark:text-gray-100 flex-1">Adicionar música</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-100 dark:bg-zinc-800 active:scale-95 transition-transform"
            aria-label="Fechar"
          >
            <X className="w-4 h-4 text-gray-600 dark:text-gray-300" />
          </button>
        </div>

        {/* Conteúdo */}
        {connLoading ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
            Carregando…
          </div>
        ) : !connected ? (
          // Estado: não conectado
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
              <Music className="w-8 h-8 text-emerald-600" />
            </div>
            <div>
              <h4 className="text-base font-bold text-gray-800 dark:text-gray-100 mb-1">Conecte seu Spotify</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs leading-relaxed">
                Pra adicionar músicas em stories, posts e chats, conecte sua conta Spotify uma vez. É grátis.
              </p>
            </div>
            <button
              type="button"
              onClick={() => connect(connectRedirect)}
              className="px-5 py-2.5 rounded-full font-bold text-white text-sm transition-transform active:scale-95"
              style={{ background: '#1db954' }}
            >
              Conectar Spotify
            </button>
          </div>
        ) : (
          <>
            {/* Input de busca */}
            <div className="px-5 py-3 border-b border-black/5 dark:border-white/10">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Busque por música, artista ou álbum…"
                  className="w-full pl-10 pr-3 py-2.5 rounded-full text-sm bg-gray-100 dark:bg-zinc-800 outline-none border-2 border-transparent focus:border-emerald-500 transition-colors text-gray-800 dark:text-gray-100"
                />
              </div>
            </div>

            {/* Resultados */}
            <div className="flex-1 overflow-y-auto px-2 py-2">
              {error && (
                <div className="mx-3 my-2 px-4 py-3 rounded-2xl bg-red-50 border border-red-200">
                  <p className="text-xs text-red-700">{error}</p>
                </div>
              )}
              {!error && !loading && results.length === 0 && query.trim().length >= 2 && (
                <div className="text-center py-12 text-sm text-gray-500 dark:text-gray-400">
                  Nenhum resultado pra "{query}"
                </div>
              )}
              {!error && !loading && query.trim().length < 2 && (
                <div className="text-center py-12 text-sm text-gray-400 dark:text-gray-500 px-6 leading-relaxed">
                  Digite pelo menos 2 letras pra buscar músicas no Spotify
                </div>
              )}
              {loading && (
                <div className="text-center py-8 text-sm text-gray-500">Buscando…</div>
              )}
              {!loading && results.map((track) => {
                const isPreviewing = previewingId === track.track_id;
                return (
                  <button
                    key={track.track_id}
                    type="button"
                    onClick={() => selectTrack(track)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-zinc-800 active:scale-[0.99] transition-all text-left"
                  >
                    <img
                      src={track.album_cover_url}
                      alt=""
                      className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold truncate text-gray-800 dark:text-gray-100">{track.name}</div>
                      <div className="text-xs truncate text-gray-500 dark:text-gray-400">
                        {track.artist} · {formatDuration(track.duration_ms)}
                      </div>
                    </div>
                    {track.preview_url && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); previewTrack(track); }}
                        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-transform active:scale-90"
                        style={{ background: isPreviewing ? '#1db954' : 'rgba(0,0,0,0.06)' }}
                        aria-label={isPreviewing ? 'Pausar preview' : 'Tocar preview'}
                      >
                        {isPreviewing
                          ? <Pause className="w-4 h-4" fill="#fff" color="#fff" />
                          : <Play className="w-4 h-4 ml-0.5 text-gray-700 dark:text-gray-200" />}
                      </button>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Footer com branding */}
            <div className="px-5 py-3 border-t border-black/5 dark:border-white/10 flex items-center justify-center gap-2">
              <SpotifyLogo className="w-3 h-3" />
              <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
                Powered by Spotify
              </span>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
