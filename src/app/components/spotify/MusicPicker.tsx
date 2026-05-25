// <MusicPicker open onClose onSelect />
//
// Modal de busca de músicas reutilizável em STORY, POST e CHAT.
// O componente NÃO sabe onde está sendo usado — só busca, lista, e
// chama onSelect(track) com a track escolhida. O caller decide o que
// fazer (anexar ao story draft / post draft / mandar como mensagem).

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Play, Pause, Music, AlertCircle, Mail, ArrowLeft, Check } from 'lucide-react';
import { searchSpotifyTracks, type SpotifyTrack, SpotifyAuthError, SpotifyTesterRequiredError, formatDuration } from '../../lib/spotify';
import { useSpotifyConnection } from '../../hooks/useSpotifyConnection';
import { SpotifyLogo } from './SpotifyLogo';

// Duração do trecho que toca (30s, igual Instagram)
const SNIPPET_SECONDS = 30;

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
  // Estado especifico de "user nao eh tester" — renderiza UI completamente
  // diferente (banner + botao "Pedir liberacao") em vez do banner generico.
  const [testerRequired, setTesterRequired] = useState(false);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  // Etapa de "escolher os 30s" — quando setado, MusicPicker mostra
  // tela dedicada com slider em vez da lista de resultados.
  const [trimTrack, setTrimTrack] = useState<SpotifyTrack | null>(null);
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
      setTesterRequired(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      setTesterRequired(false);
      try {
        const tracks = await searchSpotifyTracks(query.trim(), 10);
        setResults(tracks);
      } catch (e: any) {
        setResults([]);
        if (e instanceof SpotifyTesterRequiredError) {
          // Caso especial: app em Development Mode + user fora da
          // lista de testers. Mostra UI dedicada explicando.
          setTesterRequired(true);
          setError(null);
        } else if (e instanceof SpotifyAuthError) {
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
      setTesterRequired(false);
      setPreviewingId(null);
      setTrimTrack(null);
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
    // Em vez de confirmar direto, vai pra etapa de "escolher os 30s"
    if (audioRef.current) { try { audioRef.current.pause(); } catch {} audioRef.current = null; }
    setPreviewingId(null);
    setTrimTrack(track);
  }

  // Confirma a track com o start_ms escolhido na etapa de trim
  function confirmTrim(startMs: number) {
    if (!trimTrack) return;
    onSelect({ ...trimTrack, start_ms: startMs });
    onClose();
  }

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1000000] flex items-end sm:items-center justify-center"
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
          {trimTrack ? (
            <button
              type="button"
              onClick={() => setTrimTrack(null)}
              className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-100 dark:bg-zinc-800 active:scale-95 transition-transform"
              aria-label="Voltar"
            >
              <ArrowLeft className="w-4 h-4 text-gray-600 dark:text-gray-300" />
            </button>
          ) : (
            <SpotifyLogo className="w-5 h-5" />
          )}
          <h3 className="text-base font-bold text-gray-800 dark:text-gray-100 flex-1">
            {trimTrack ? 'Escolha os 30 segundos' : 'Adicionar música'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-100 dark:bg-zinc-800 active:scale-95 transition-transform"
            aria-label="Fechar"
          >
            <X className="w-4 h-4 text-gray-600 dark:text-gray-300" />
          </button>
        </div>

        {/* ETAPA TRIM — escolher o ponto inicial dos 30s */}
        {trimTrack && (
          <TrimStep
            track={trimTrack}
            onConfirm={confirmTrim}
          />
        )}

        {/* Conteúdo — esconde quando estiver na etapa de trim */}
        {trimTrack ? null : connLoading ? (
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
              {/* ESTADO ESPECIAL: app em Development Mode + user fora da
                  lista de testers. UI dedicada explicando + botao pra
                  pedir liberacao via email. */}
              {testerRequired && (
                <div className="mx-3 my-4 px-5 py-5 rounded-3xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900">
                  <div className="flex items-start gap-3 mb-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="text-sm font-bold text-amber-900 dark:text-amber-100 mb-1">
                        Beta privado — sua conta ainda não foi liberada
                      </h4>
                      <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
                        A integração com Spotify está em <b>modo beta privado</b> (Development Mode).
                        Só 5 usuários autorizados podem usar por enquanto. Estamos finalizando
                        a aprovação oficial pra liberar pra todo mundo.
                      </p>
                    </div>
                  </div>
                  <a
                    href={`mailto:suporte@studentclub.com.br?subject=${encodeURIComponent('Liberar minha conta Spotify')}&body=${encodeURIComponent('Oi! Quero ser liberado como tester da integração Spotify do Student Club.\n\nMeu email cadastrado no Spotify é: \n\nObrigado!')}`}
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-full text-sm font-bold text-white active:scale-95 transition-transform"
                    style={{ background: '#1db954' }}
                  >
                    <Mail className="w-4 h-4" />
                    Pedir liberação por email
                  </a>
                  <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-3 text-center leading-relaxed">
                    Enquanto isso, você pode usar todo o resto do Student Club normalmente. 🎓
                  </p>
                </div>
              )}
              {!testerRequired && error && (
                <div className="mx-3 my-2 px-4 py-3 rounded-2xl bg-red-50 border border-red-200">
                  <p className="text-xs text-red-700">{error}</p>
                </div>
              )}
              {!testerRequired && !error && !loading && results.length === 0 && query.trim().length >= 2 && (
                <div className="text-center py-12 text-sm text-gray-500 dark:text-gray-400">
                  Nenhum resultado pra "{query}"
                </div>
              )}
              {!testerRequired && !error && !loading && query.trim().length < 2 && (
                <div className="text-center py-12 text-sm text-gray-400 dark:text-gray-500 px-6 leading-relaxed">
                  Digite pelo menos 2 letras pra buscar músicas no Spotify
                </div>
              )}
              {!testerRequired && loading && (
                <div className="text-center py-8 text-sm text-gray-500">Buscando…</div>
              )}
              {!testerRequired && !loading && results.map((track) => {
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

// ─── TrimStep ─────────────────────────────────────────────────────────
// Tela de "escolher os 30s da música" — slider de 0 → (duration - 30s).
// Se a música tem preview_url (30s pré-fabricado da Spotify), permite
// pré-ouvir como vai ficar.
function TrimStep({ track, onConfirm }: { track: SpotifyTrack; onConfirm: (startMs: number) => void }) {
  // Default: começa no início da música. User pode arrastar pra escolher
  // outro trecho. Máximo = duração da música menos 30s (snippet completo).
  const maxStartMs = useMemo(() => Math.max(0, track.duration_ms - SNIPPET_SECONDS * 1000), [track.duration_ms]);
  const [startMs, setStartMs] = useState<number>(0);
  const [previewing, setPreviewing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function fmt(ms: number) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const ss = s % 60;
    return `${m}:${ss.toString().padStart(2, '0')}`;
  }

  function togglePreview() {
    // Preview só funciona se a música tem preview_url (Spotify removeu
    // pra maioria das tracks em 2024, então pode ser que nem todas
    // tenham). Quando tem, o preview já é os primeiros 30s da música —
    // não exatamente o ponto escolhido pelo user, mas dá uma ideia do
    // estilo. Pra preview exato do ponto, precisaria de Premium SDK.
    if (!track.preview_url) return;
    if (previewing) {
      try { audioRef.current?.pause(); } catch {}
      audioRef.current = null;
      setPreviewing(false);
      return;
    }
    const audio = new Audio(track.preview_url);
    audio.play().then(() => setPreviewing(true)).catch(() => {});
    audio.onended = () => { setPreviewing(false); audioRef.current = null; };
    audioRef.current = audio;
  }

  // Cleanup do audio ao desmontar
  useEffect(() => {
    return () => {
      if (audioRef.current) { try { audioRef.current.pause(); } catch {} }
    };
  }, []);

  const endMs = Math.min(startMs + SNIPPET_SECONDS * 1000, track.duration_ms);

  return (
    <div className="flex-1 flex flex-col overflow-y-auto">
      {/* Capa + info */}
      <div className="px-5 pt-6 pb-4 flex flex-col items-center text-center">
        <img
          src={track.album_cover_url}
          alt=""
          className="w-40 h-40 rounded-2xl object-cover shadow-2xl mb-4"
          style={{ animation: previewing ? 'spin 6s linear infinite' : 'none' }}
        />
        <h4 className="text-base font-bold text-gray-800 dark:text-gray-100 truncate max-w-full">{track.name}</h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-full mt-0.5">{track.artist}</p>
        {track.preview_url && (
          <button
            type="button"
            onClick={togglePreview}
            className="mt-3 inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold transition-transform active:scale-95"
            style={{ background: previewing ? '#1db954' : 'rgba(0,0,0,0.06)', color: previewing ? '#fff' : 'inherit' }}
          >
            {previewing ? <Pause className="w-3.5 h-3.5" fill="currentColor" /> : <Play className="w-3.5 h-3.5 ml-0.5" fill="currentColor" />}
            {previewing ? 'Pausar prévia' : 'Ouvir prévia'}
          </button>
        )}
      </div>

      {/* Slider de ponto inicial */}
      <div className="px-6 pb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Toca de
          </span>
          <span className="text-sm font-mono font-bold text-emerald-600">
            {fmt(startMs)} → {fmt(endMs)}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={maxStartMs}
          step={500}
          value={startMs}
          onChange={(e) => setStartMs(Number(e.target.value))}
          className="w-full accent-emerald-500"
          style={{ height: 24 }}
          aria-label="Escolher ponto inicial da música"
        />
        <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-500 font-mono mt-1">
          <span>0:00</span>
          <span>{fmt(track.duration_ms)}</span>
        </div>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-3 text-center leading-relaxed">
          Arraste pra escolher o trecho de 30 segundos que vai tocar.
        </p>
      </div>

      {/* Botão confirmar — sticky no footer */}
      <div className="mt-auto px-5 py-4 border-t border-black/5 dark:border-white/10">
        <button
          type="button"
          onClick={() => onConfirm(startMs)}
          className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-full text-sm font-bold text-white transition-transform active:scale-95"
          style={{ background: '#1db954' }}
        >
          <Check className="w-4 h-4" />
          Usar este trecho
        </button>
      </div>
    </div>
  );
}
