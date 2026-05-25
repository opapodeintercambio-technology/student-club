// <MusicPicker open onClose onSelect />
//
// Modal de busca de músicas reutilizável em STORY, POST e CHAT.
// SUPORTA 2 FONTES: Spotify e Deezer. User escolhe no topo via tabs.
//
//   Spotify  — requer OAuth (Beta privado com 5 testers no Dev Mode)
//   Deezer   — sem OAuth, API publica, disponivel pra TODOS os users
//
// O componente devolve um MusicTrack via onSelect(track). O caller
// decide o que fazer (anexar ao story draft / post draft / mandar como
// mensagem). MusicTrack tem campo `source: 'spotify' | 'deezer'` que
// distingue qual embed renderizar nos players.

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Play, Pause, Music, AlertCircle, Mail, ArrowLeft, Check, Headphones } from 'lucide-react';
import {
  searchSpotifyTracks,
  fetchSpotifyTrending,
  type SpotifyTrack,
  type MusicTrack,
  SpotifyAuthError,
  SpotifyTesterRequiredError,
  formatDuration,
  isSpotifyTrack,
  isDeezerTrack,
} from '../../lib/spotify';
import {
  searchDeezerTracks,
  fetchDeezerTrending,
  type DeezerTrack,
  formatDeezerDuration,
} from '../../lib/deezer';
import { useSpotifyConnection } from '../../hooks/useSpotifyConnection';
import { SpotifyLogo } from './SpotifyLogo';
import { SpotifyEmbed } from './SpotifyEmbed';
import { DeezerEmbed } from '../deezer/DeezerEmbed';
import type { SpotifyEmbedController } from '../../lib/spotify-embed-api';

// Duração do trecho que toca (30s, igual Instagram)
const SNIPPET_SECONDS = 30;

type Source = 'spotify' | 'deezer';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Recebe MusicTrack (SpotifyTrack | DeezerTrack) — o caller deve
   *  tratar ambos os casos via isSpotifyTrack / isDeezerTrack. */
  onSelect: (track: MusicTrack) => void;
  /** Pra onde mandar o user se ele não tiver Spotify conectado (default: /conexoes) */
  connectRedirect?: string;
}

export function MusicPicker({ open, onClose, onSelect, connectRedirect = '/conexoes' }: Props) {
  // Aba selecionada (Spotify | Deezer). Default: Deezer (sem barreira de OAuth/testers)
  const [source, setSource] = useState<Source>('deezer');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MusicTrack[]>([]);
  // Tracks em ALTA (trending) — mostradas quando a query está vazia.
  // Cache local pra nao re-fetchar a cada abertura do modal.
  const [trendingDeezer, setTrendingDeezer] = useState<MusicTrack[]>([]);
  const [trendingSpotify, setTrendingSpotify] = useState<MusicTrack[]>([]);
  const [loadingTrending, setLoadingTrending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testerRequired, setTesterRequired] = useState(false);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [trimTrack, setTrimTrack] = useState<MusicTrack | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { connected, isLoading: connLoading, connect } = useSpotifyConnection();

  // Carrega TRENDING quando o picker abre + quando troca de aba.
  // Cacheado em state — so re-fetcha se a tab mudar e nao tiver cache ainda.
  useEffect(() => {
    if (!open) return;
    if (source === 'deezer' && trendingDeezer.length === 0) {
      setLoadingTrending(true);
      fetchDeezerTrending(10)
        .then(tracks => setTrendingDeezer(tracks))
        .catch(() => {})
        .finally(() => setLoadingTrending(false));
    } else if (source === 'spotify' && connected && trendingSpotify.length === 0) {
      setLoadingTrending(true);
      fetchSpotifyTrending(10)
        .then(tracks => setTrendingSpotify(tracks))
        .catch(() => {})
        .finally(() => setLoadingTrending(false));
    }
  }, [open, source, connected]);

  // Debounce 300ms na busca — busca na FONTE selecionada
  useEffect(() => {
    if (!open) return;
    // Spotify exige connection antes de buscar — pula se nao conectado
    if (source === 'spotify' && !connected) return;
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
        if (source === 'spotify') {
          const tracks = await searchSpotifyTracks(query.trim(), 10);
          setResults(tracks);
        } else {
          const tracks = await searchDeezerTracks(query.trim(), 10);
          setResults(tracks);
        }
      } catch (e: any) {
        setResults([]);
        if (e instanceof SpotifyTesterRequiredError) {
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
  }, [query, open, connected, source]);

  // Limpa resultados ao trocar de fonte (UI mais clara)
  useEffect(() => {
    setResults([]);
    setError(null);
    setTesterRequired(false);
  }, [source]);

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

  function previewTrack(track: MusicTrack) {
    if (audioRef.current) { try { audioRef.current.pause(); } catch {} audioRef.current = null; }
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

  function selectTrack(track: MusicTrack) {
    if (audioRef.current) { try { audioRef.current.pause(); } catch {} audioRef.current = null; }
    setPreviewingId(null);
    setTrimTrack(track);
  }

  function confirmTrim(startMs: number) {
    if (!trimTrack) return;
    onSelect({ ...trimTrack, start_ms: startMs } as MusicTrack);
    onClose();
  }

  if (!open) return null;

  const isSpotifyTab = source === 'spotify';
  const isDeezerTab = source === 'deezer';
  // Spotify exige conexao OAuth pra buscar. Deezer nao.
  const showSpotifyConnectFlow = isSpotifyTab && !connLoading && !connected;
  const showLoadingConn = isSpotifyTab && connLoading;
  const sourceLabel = isSpotifyTab ? 'Spotify' : 'Deezer';

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
            <Music className="w-5 h-5 text-gray-700 dark:text-gray-300" />
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

        {/* Tabs Spotify | Deezer — esconde quando estiver na etapa de trim */}
        {!trimTrack && (
          <div className="px-5 pt-3 pb-1 flex items-center gap-2 border-b border-black/5 dark:border-white/10">
            <TabBtn
              active={isDeezerTab}
              onClick={() => setSource('deezer')}
              label="Deezer"
              color="#00C7F2"
            />
            <TabBtn
              active={isSpotifyTab}
              onClick={() => setSource('spotify')}
              label="Spotify"
              color="#1db954"
            />
          </div>
        )}

        {/* Conteúdo principal */}
        {trimTrack ? null : showLoadingConn ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
            Carregando…
          </div>
        ) : showSpotifyConnectFlow ? (
          // Spotify nao conectado — pede conexao
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
              <SpotifyLogo className="w-8 h-8" />
            </div>
            <div>
              <h4 className="text-base font-bold text-gray-800 dark:text-gray-100 mb-1">Conecte seu Spotify</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs leading-relaxed">
                Conecte sua conta Spotify pra buscar musicas. Ou use o <b>Deezer</b> ao lado
                — sem cadastro, pra todos os users.
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
            <button
              type="button"
              onClick={() => setSource('deezer')}
              className="text-xs text-gray-500 underline"
            >
              Usar Deezer (sem cadastro)
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
                  placeholder={`Buscar em ${sourceLabel}…`}
                  className="w-full pl-10 pr-3 py-2.5 rounded-full text-sm bg-gray-100 dark:bg-zinc-800 outline-none border-2 border-transparent focus:border-emerald-500 transition-colors text-gray-800 dark:text-gray-100"
                />
              </div>
            </div>

            {/* Resultados */}
            <div className="flex-1 overflow-y-auto px-2 py-2">
              {testerRequired && (
                <div className="mx-3 my-4 px-5 py-5 rounded-3xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900">
                  <div className="flex items-start gap-3 mb-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="text-sm font-bold text-amber-900 dark:text-amber-100 mb-1">
                        Spotify em beta privado
                      </h4>
                      <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
                        Sua conta ainda não foi liberada como tester. Você pode usar o <b>Deezer</b> ao lado — disponível pra todos os users sem cadastro.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSource('deezer')}
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-full text-sm font-bold text-white active:scale-95 transition-transform"
                    style={{ background: '#00C7F2' }}
                  >
                    Mudar pra Deezer
                  </button>
                  <a
                    href={`mailto:suporte@studentclub.com.br?subject=${encodeURIComponent('Liberar minha conta Spotify')}&body=${encodeURIComponent('Oi! Quero ser liberado como tester da integração Spotify do Student Club.\n\nMeu email cadastrado no Spotify é: \n\nObrigado!')}`}
                    className="flex items-center justify-center gap-2 w-full py-2.5 mt-2 rounded-full text-sm font-bold border-2"
                    style={{ borderColor: '#1db954', color: '#1db954' }}
                  >
                    <Mail className="w-4 h-4" />
                    Pedir liberação Spotify
                  </a>
                </div>
              )}
              {!testerRequired && error && (
                <div className="mx-3 my-2 px-4 py-3 rounded-2xl bg-red-50 border border-red-200">
                  <p className="text-xs text-red-700">{error}</p>
                </div>
              )}
              {!testerRequired && !error && !loading && results.length === 0 && query.trim().length >= 2 && (
                <div className="text-center py-12 text-sm text-gray-500 dark:text-gray-400">
                  Nenhum resultado pra "{query}" em {sourceLabel}
                </div>
              )}
              {/* TRENDING — quando query vazia, mostra Top 10 do Deezer/Spotify.
                  Substitui o empty state genérico anterior. */}
              {!testerRequired && !error && !loading && query.trim().length < 2 && (
                <>
                  <div className="px-3 mt-2 mb-1 flex items-center gap-2">
                    <span className="text-base">🔥</span>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                      Em alta no {sourceLabel}
                    </h4>
                  </div>
                  {loadingTrending && (
                    <div className="text-center py-6 text-sm text-gray-500">Carregando…</div>
                  )}
                  {!loadingTrending && (() => {
                    const trending = source === 'deezer' ? trendingDeezer : trendingSpotify;
                    if (trending.length === 0) {
                      return (
                        <div className="text-center py-8 text-sm text-gray-400 dark:text-gray-500 px-6 leading-relaxed">
                          Não foi possível carregar o ranking agora. Digite o nome de uma música pra buscar.
                        </div>
                      );
                    }
                    return trending.map((track, idx) => {
                      const isPreviewing = previewingId === track.track_id;
                      const durMs = track.duration_ms;
                      const durStr = isDeezerTrack(track) ? formatDeezerDuration(durMs) : formatDuration(durMs);
                      return (
                        <button
                          key={track.track_id}
                          type="button"
                          onClick={() => selectTrack(track)}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-zinc-800 active:scale-[0.99] transition-all text-left"
                        >
                          <span className="text-[11px] font-bold w-5 text-center text-gray-400">{idx + 1}</span>
                          <img
                            src={track.album_cover_url}
                            alt=""
                            className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold truncate text-gray-800 dark:text-gray-100">{track.name}</div>
                            <div className="text-xs truncate text-gray-500 dark:text-gray-400">
                              {track.artist} · {durStr}
                            </div>
                          </div>
                          {track.preview_url && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); previewTrack(track); }}
                              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-transform active:scale-90"
                              style={{ background: isPreviewing ? (isDeezerTrack(track) ? '#00C7F2' : '#1db954') : 'rgba(0,0,0,0.06)' }}
                              aria-label={isPreviewing ? 'Pausar preview' : 'Tocar preview'}
                            >
                              {isPreviewing
                                ? <Pause className="w-4 h-4" fill="#fff" color="#fff" />
                                : <Play className="w-4 h-4 ml-0.5 text-gray-700 dark:text-gray-200" />}
                            </button>
                          )}
                        </button>
                      );
                    });
                  })()}
                </>
              )}
              {!testerRequired && loading && (
                <div className="text-center py-8 text-sm text-gray-500">Buscando…</div>
              )}
              {!testerRequired && !loading && query.trim().length >= 2 && results.map((track) => {
                const isPreviewing = previewingId === track.track_id;
                const durMs = track.duration_ms;
                const durStr = isDeezerTrack(track) ? formatDeezerDuration(durMs) : formatDuration(durMs);
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
                        {track.artist} · {durStr}
                      </div>
                    </div>
                    {track.preview_url && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); previewTrack(track); }}
                        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-transform active:scale-90"
                        style={{ background: isPreviewing ? (isDeezerTrack(track) ? '#00C7F2' : '#1db954') : 'rgba(0,0,0,0.06)' }}
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

            {/* Footer com branding (muda conforme tab) */}
            <div className="px-5 py-3 border-t border-black/5 dark:border-white/10 flex items-center justify-center gap-2">
              {isDeezerTab ? (
                <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
                  Powered by Deezer
                </span>
              ) : (
                <>
                  <SpotifyLogo className="w-3 h-3" />
                  <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
                    Powered by Spotify
                  </span>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

// ── Tab button ────────────────────────────────────────────────────────
function TabBtn({ active, onClick, label, color }: {
  active: boolean;
  onClick: () => void;
  label: string;
  color: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 rounded-full text-xs font-bold transition-all active:scale-95"
      style={{
        background: active ? color : 'transparent',
        color: active ? '#fff' : '#6b7280',
        border: `1.5px solid ${active ? color : '#d1d5db'}`,
      }}
    >
      {label}
    </button>
  );
}

// ─── TrimStep ─────────────────────────────────────────────────────────
// Tela de "escolher os 30 segundos" — slider de 0 → (duration - 30s).
// Suporta Spotify (com SpotifyEmbed + seek programatico) e Deezer
// (sem SDK — preview via HTML5 audio do preview_url).
function TrimStep({ track, onConfirm }: { track: MusicTrack; onConfirm: (startMs: number) => void }) {
  const maxStartMs = useMemo(() => Math.max(0, track.duration_ms - SNIPPET_SECONDS * 1000), [track.duration_ms]);
  const [startMs, setStartMs] = useState<number>(0);
  const [playing, setPlaying] = useState(false);
  // Spotify controller (so existe em trim de track Spotify)
  const spotifyControllerRef = useRef<SpotifyEmbedController | null>(null);
  // Deezer audio (HTML5 com preview_url — sem SDK programatico)
  const deezerAudioRef = useRef<HTMLAudioElement | null>(null);
  const playingRef = useRef(false);

  const trackIsSpotify = isSpotifyTrack(track);
  const trackIsDeezer = isDeezerTrack(track);

  function fmt(ms: number) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const ss = s % 60;
    return `${m}:${ss.toString().padStart(2, '0')}`;
  }

  function handleSpotifyReady(ctrl: SpotifyEmbedController) {
    spotifyControllerRef.current = ctrl;
    ctrl.addListener('playback_update', (e: any) => {
      const isPaused = e?.data?.isPaused;
      if (typeof isPaused === 'boolean') {
        setPlaying(!isPaused);
        playingRef.current = !isPaused;
      }
    });
  }

  function playSnippet() {
    if (trackIsSpotify) {
      const c = spotifyControllerRef.current;
      if (!c) return;
      try { c.seek(startMs / 1000); } catch {}
      try { c.play(); } catch {}
    } else if (trackIsDeezer) {
      // Deezer: usa preview_url + HTML5 audio
      // (Os 30s do preview do Deezer comecam do inicio da musica —
      //  o startMs nao se aplica pro PREVIEW em si. Mas o startMs ainda
      //  e salvo pra o iframe do player no story/feed/chat onde a
      //  musica completa esta disponivel.)
      if (!track.preview_url) return;
      if (deezerAudioRef.current) {
        try { deezerAudioRef.current.pause(); } catch {}
      }
      const audio = new Audio(track.preview_url);
      audio.play().then(() => {
        setPlaying(true);
        playingRef.current = true;
      }).catch(() => {});
      audio.onended = () => { setPlaying(false); playingRef.current = false; };
      deezerAudioRef.current = audio;
    }
  }

  function pauseSnippet() {
    if (trackIsSpotify) {
      const c = spotifyControllerRef.current;
      if (!c) return;
      try { c.pause(); } catch {}
    } else if (trackIsDeezer) {
      try { deezerAudioRef.current?.pause(); } catch {}
      setPlaying(false);
      playingRef.current = false;
    }
  }

  // Seek em tempo real quando user arrasta slider (so Spotify)
  useEffect(() => {
    if (!trackIsSpotify || !playingRef.current) return;
    const c = spotifyControllerRef.current;
    if (!c) return;
    try { c.seek(startMs / 1000); } catch {}
  }, [startMs, trackIsSpotify]);

  // Cleanup
  useEffect(() => {
    return () => {
      try { deezerAudioRef.current?.pause(); } catch {}
    };
  }, []);

  const endMs = Math.min(startMs + SNIPPET_SECONDS * 1000, track.duration_ms);
  const accentColor = trackIsDeezer ? '#00C7F2' : '#1db954';

  return (
    <div className="flex-1 flex flex-col overflow-y-auto">
      <div className="px-5 pt-5 pb-3 flex flex-col items-center text-center">
        <img
          src={track.album_cover_url}
          alt=""
          className="w-32 h-32 rounded-2xl object-cover shadow-2xl mb-3"
          style={{ animation: playing ? 'spin 6s linear infinite' : 'none' }}
        />
        <h4 className="text-base font-bold text-gray-800 dark:text-gray-100 truncate max-w-full">{track.name}</h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-full mt-0.5">{track.artist}</p>
      </div>

      {/* Player oficial — Spotify embed OU Deezer iframe */}
      <div className="px-5 pb-3 flex justify-center">
        <div style={{ width: '100%', maxWidth: 340 }}>
          {trackIsSpotify && (
            <SpotifyEmbed
              trackId={track.track_id}
              height={80}
              onReady={handleSpotifyReady}
            />
          )}
          {trackIsDeezer && (
            <DeezerEmbed
              trackId={track.track_id}
              height={90}
            />
          )}
        </div>
      </div>

      {/* Slider */}
      <div className="px-6 pb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Toca de
          </span>
          <span className="text-sm font-mono font-bold" style={{ color: accentColor }}>
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
          className="w-full"
          style={{ height: 24, accentColor }}
          aria-label="Escolher ponto inicial da música"
        />
        <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-500 font-mono mt-1">
          <span>0:00</span>
          <span>{fmt(track.duration_ms)}</span>
        </div>

        <button
          type="button"
          onClick={playing ? pauseSnippet : playSnippet}
          className="mt-3 w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-full text-sm font-bold transition-transform active:scale-95 border-2"
          style={{
            background: playing ? accentColor : 'transparent',
            color: playing ? '#fff' : accentColor,
            borderColor: accentColor,
          }}
        >
          {playing ? (
            <><Pause className="w-4 h-4" fill="currentColor" /> Pausar prévia</>
          ) : (
            <><Headphones className="w-4 h-4" /> Ouvir trecho escolhido</>
          )}
        </button>

        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-3 text-center leading-relaxed">
          Arraste o slider pra escolher os 30 segundos.<br />
          {trackIsSpotify
            ? 'Você pode arrastar enquanto a música toca pra achar o trecho ideal.'
            : 'A prévia do Deezer toca os 30s iniciais — o trecho escolhido será aplicado no story/feed/chat.'}
        </p>
      </div>

      {/* Botão confirmar */}
      <div className="mt-auto px-5 py-4 border-t border-black/5 dark:border-white/10">
        <button
          type="button"
          onClick={() => { pauseSnippet(); onConfirm(startMs); }}
          className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-full text-sm font-bold text-white transition-transform active:scale-95"
          style={{ background: accentColor }}
        >
          <Check className="w-4 h-4" />
          Usar este trecho
        </button>
      </div>
    </div>
  );
}
