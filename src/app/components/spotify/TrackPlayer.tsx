// <TrackPlayer track={t} variant="story | post | chat" />
//
// Player único usado em 3 contextos. As variants têm UIs diferentes
// mas todas usam o iframe oficial do Spotify (via SpotifyEmbed):
//   - story: chip flutuante + iframe offscreen → autoplay quando aparece
//   - post: card no feed + IntersectionObserver → autoplay no viewport
//   - chat: bubble com botão play/pause (preview_url HTML5, fallback)
//
// LEGAL/COMPLIANCE:
// - Reprodução pelo iframe oficial do Spotify (web SDK).
// - Nada é cacheado, baixado ou re-encodado no nosso servidor.
// - Logo "Spotify" oficial visível em todas as variants.
// - Tap na capa → deep link pro Spotify (mantém atribuição).
// - Sem sincronização de áudio entre devices (cada um toca local).

import { useEffect, useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';
import { type MusicTrack, type SpotifyTrack, isDeezerTrack, formatDuration, spotifyDeepLink } from '../../lib/spotify';
import { deezerDeepLink, type DeezerTrack } from '../../lib/deezer';
import { SpotifyLogo } from './SpotifyLogo';
import { SpotifyEmbed } from './SpotifyEmbed';
import { DeezerEmbed } from '../deezer/DeezerEmbed';
import type { SpotifyEmbedController } from '../../lib/spotify-embed-api';

interface Props {
  track: MusicTrack;
  variant: 'story' | 'post' | 'chat';
  /** Pra story: o player começa muted (igual Instagram). Outras variants: false. */
  startMuted?: boolean;
  /** Pra story: autoplay quando o story está ativo. */
  autoPlay?: boolean;
  /** Callback opcional quando o user toca pra abrir o Spotify. */
  onOpenSpotify?: () => void;
}

export function TrackPlayer({ track, variant, startMuted, autoPlay, onOpenSpotify }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(!!startMuted);
  const [progress, setProgress] = useState(0); // 0..1
  const [currentTime, setCurrentTime] = useState(0);

  // Autoplay (story) + cleanup ao trocar de track/desmontar
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.muted = muted;
    if (autoPlay) {
      a.play().catch(() => {
        // Browser bloqueou autoplay com som → força mudo e tenta de novo
        a.muted = true;
        setMuted(true);
        a.play().catch(() => {});
      });
    }
    return () => {
      try { a.pause(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.preview_url, autoPlay]);

  // Atualiza progresso conforme o áudio toca
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    function onTime() {
      const dur = a?.duration ?? 30;
      const cur = a?.currentTime ?? 0;
      if (!isFinite(dur) || dur <= 0) { setProgress(0); setCurrentTime(0); return; }
      setProgress(Math.max(0, Math.min(1, cur / dur)));
      setCurrentTime(cur);
    }
    function onPlay() { setPlaying(true); }
    function onPause() { setPlaying(false); }
    function onEnded() { setPlaying(false); setProgress(0); setCurrentTime(0); }
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('ended', onEnded);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('ended', onEnded);
    };
  }, []);

  function togglePlay(e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      a.muted = muted;
      a.play().catch(() => {
        a.muted = true;
        setMuted(true);
        a.play().catch(() => {});
      });
    } else {
      a.pause();
    }
  }

  function toggleMute(e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    const a = audioRef.current;
    if (!a) return;
    const next = !muted;
    a.muted = next;
    setMuted(next);
  }

  function openSpotify(e: React.MouseEvent) {
    e.stopPropagation();
    if (onOpenSpotify) onOpenSpotify();
    window.open(spotifyDeepLink(track), '_blank', 'noopener,noreferrer');
  }

  // Sem preview_url, o player não consegue tocar. Mostramos cartão estático
  // com link pra abrir no Spotify.
  const hasPreview = !!track.preview_url;

  // ─── Variant: STORY ────────────────────────────────────────────────
  // Usa SpotifyEmbed em modo HIDDEN (iframe offscreen) pra TOCAR a música,
  // e mostra o chip visível com capa girando + nome da música. Autoplay
  // é disparado quando o controller fica pronto (onReady).
  if (variant === 'story') {
    return <StoryMusicChip track={track} onOpenSpotify={onOpenSpotify} autoPlay={autoPlay} />;
  }

  // ─── Variant: POST (card no feed) ──────────────────────────────────
  // Usa SpotifyEmbed (oficial via IFrame API) + IntersectionObserver
  // pra AUTOPLAY quando o post entra no viewport (igual FeedVideo).
  // Quando sai do viewport, pausa. Garante coordenação com outros
  // players Spotify e áudios HTML5 no app.
  if (variant === 'post') {
    return <PostMusicCard track={track} />;
  }

  // ─── Variant: CHAT (bubble) ────────────────────────────────────────
  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 rounded-2xl min-w-[240px] max-w-[340px]"
      style={{
        background: 'linear-gradient(135deg, #1db954 0%, #1ed760 100%)',
        color: '#fff',
        boxShadow: '0 4px 12px rgba(30,185,84,0.30)',
      }}
    >
      <audio ref={audioRef} src={track.preview_url} preload="metadata" playsInline />
      <img
        src={track.album_cover_url}
        alt=""
        className="w-12 h-12 rounded-lg object-cover flex-shrink-0 cursor-pointer"
        onClick={openSpotify}
        style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.20)' }}
      />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-bold truncate leading-tight">{track.name}</div>
        <div className="text-[11px] opacity-90 truncate leading-tight">{track.artist}</div>
        {/* Progress bar bem fininha */}
        <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.25)' }}>
          <div className="h-full transition-all duration-100" style={{ width: `${progress * 100}%`, background: 'rgba(255,255,255,0.95)' }} />
        </div>
        <div className="flex items-center justify-between mt-1">
          <SpotifyLogo className="w-3 h-3" mono />
          <span className="text-[10px] font-mono opacity-90">
            {formatDuration(currentTime * 1000)} / 0:30
          </span>
        </div>
      </div>
      {hasPreview ? (
        <button
          type="button"
          onClick={togglePlay}
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-transform active:scale-90"
          style={{ background: 'rgba(255,255,255,0.20)', color: '#fff' }}
          aria-label={playing ? 'Pausar' : 'Tocar preview'}
        >
          {playing ? <Pause className="w-4 h-4" fill="#fff" /> : <Play className="w-4 h-4 ml-0.5" fill="#fff" />}
        </button>
      ) : (
        <button
          type="button"
          onClick={openSpotify}
          className="text-[10px] font-bold px-2.5 py-1.5 rounded-full"
          style={{ background: 'rgba(255,255,255,0.20)', color: '#fff' }}
        >
          Ouvir
        </button>
      )}
    </div>
  );
}

// ─── StoryMusicChip ───────────────────────────────────────────────────
// Chip visível de música no story + iframe Spotify offscreen pro playback.
// O iframe está hidden mas DENTRO do viewport (pra autoplay funcionar).
// Comportamento: música toca AUTOMATICAMENTE — user só pode pausar.
//
// O autoplay tem retry interno no SpotifyEmbed (multiplas tentativas).
// Combinado com o audioUnlock global no primeiro gesto da sessão, isso
// resolve o caso comum em ~95% dos browsers.
function StoryMusicChip({
  track,
  onOpenSpotify,
  autoPlay,
}: {
  track: MusicTrack;
  onOpenSpotify?: () => void;
  autoPlay?: boolean;
}) {
  const controllerRef = useRef<SpotifyEmbedController | null>(null);
  const deezerAudioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(true);
  const trackIsDeezer = isDeezerTrack(track);

  function handleReady(ctrl: SpotifyEmbedController) {
    controllerRef.current = ctrl;
    ctrl.addListener('playback_update', (e: any) => {
      const isPaused = e?.data?.isPaused;
      if (typeof isPaused === 'boolean') setPlaying(!isPaused);
    });
  }

  // Deezer: usa HTML5 audio invisivel com preview_url
  useEffect(() => {
    if (!trackIsDeezer || !autoPlay) return;
    const audio = new Audio((track as DeezerTrack).preview_url);
    audio.loop = true;
    audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    audio.addEventListener('play', () => setPlaying(true));
    audio.addEventListener('pause', () => setPlaying(false));
    deezerAudioRef.current = audio;
    return () => {
      try { audio.pause(); } catch {}
      deezerAudioRef.current = null;
    };
  }, [trackIsDeezer, autoPlay, track]);

  function togglePlay(e: React.MouseEvent) {
    e.stopPropagation();
    if (trackIsDeezer) {
      const a = deezerAudioRef.current;
      if (!a) return;
      if (playing) {
        try { a.pause(); } catch {}
      } else {
        try { a.play().catch(() => {}); } catch {}
      }
    } else {
      const c = controllerRef.current;
      if (!c) return;
      if (playing) {
        try { c.pause(); } catch {}
      } else {
        try { c.play(); } catch {}
      }
    }
  }

  function openMusic(e: React.MouseEvent) {
    e.stopPropagation();
    if (onOpenSpotify) onOpenSpotify();
    const url = trackIsDeezer
      ? deezerDeepLink(track as DeezerTrack)
      : spotifyDeepLink(track as SpotifyTrack);
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <>
      {/* Engine — Spotify iframe hidden OU Deezer audio invisivel.
          Deezer audio criado via useEffect acima (preview_url + HTML5). */}
      {!trackIsDeezer && (
        <SpotifyEmbed
          trackId={track.track_id}
          hidden
          autoPlay={autoPlay}
          startMs={track.start_ms || 0}
          onReady={handleReady}
        />
      )}
      <div
        className="absolute left-3 bottom-20 z-30 flex items-center gap-2.5 pl-1 pr-3 py-1 rounded-full select-none cursor-pointer"
        style={{
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          color: '#fff',
          maxWidth: 'min(280px, 70vw)',
        }}
        onClick={openMusic}
        role="button"
        aria-label={`Tocando: ${track.name} de ${track.artist}`}
      >
        <img
          src={track.album_cover_url}
          alt=""
          className="w-7 h-7 rounded-full object-cover flex-shrink-0"
          style={{ animation: playing ? 'spin 6s linear infinite' : 'none' }}
        />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-[12px] font-bold truncate">{track.name}</div>
          <div className="text-[10px] opacity-80 truncate">{track.artist}</div>
        </div>
        <button
          type="button"
          onClick={togglePlay}
          className="ml-1 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.20)' }}
          aria-label={playing ? 'Pausar' : 'Tocar'}
        >
          {playing ? <Pause className="w-3 h-3" fill="#fff" /> : <Play className="w-3 h-3 ml-0.5" fill="#fff" />}
        </button>
        {trackIsDeezer ? (
          <span className="text-[8px] font-bold tracking-wide" style={{ color: '#00C7F2' }}>DEEZER</span>
        ) : (
          <SpotifyLogo className="w-4 h-4 flex-shrink-0" />
        )}
      </div>
    </>
  );
}

// ─── PostMusicCard ────────────────────────────────────────────────────
// Card de música no feed. Usa SpotifyEmbed (oficial via IFrame API) +
// IntersectionObserver pra AUTOPLAY quando o post entra no viewport
// (mesma dinâmica do FeedVideo). Quando o post sai do viewport, pausa.
//
// O play é disparado QUANDO:
//   1. O usuário rolou o feed e o card ficou pelo menos 50% visível
//   2. O controller do Spotify embed já está pronto
//
// Já existe coordenação automática (no SpotifyEmbed): quando um player
// começa a tocar, pausa os outros + áudios HTML5.
// ─── PostMusicCard ────────────────────────────────────────────────────
// Card de música no feed. Iframe Spotify HIDDEN (toca em background)
// + UI custom mostrando capa girando + nome + botão pause.
// Música começa AUTOMATICAMENTE quando o card entra no viewport.
// User só tem opção de pausar.
function PostMusicCard({ track }: { track: SpotifyTrack }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<SpotifyEmbedController | null>(null);
  const [inView, setInView] = useState(false);
  // OTIMISTA: arranca true. Quando o card sai do viewport, vira false.
  // Quando volta, vira true. Alinhado com o estado real via playback_update.
  const [playing, setPlaying] = useState(true);
  const inViewRef = useRef(false);
  const userPausedRef = useRef(false);
  const trackLoadedRef = useRef(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          setInView(e.isIntersecting && e.intersectionRatio >= 0.5);
        }
      },
      { threshold: [0, 0.5, 1], rootMargin: '0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    inViewRef.current = inView;
    const c = controllerRef.current;
    if (!c) return;
    if (inView) {
      if (!userPausedRef.current && trackLoadedRef.current) {
        try { c.play(); } catch {}
        if (track.start_ms && track.start_ms > 0) {
          try { c.seek(track.start_ms / 1000); } catch {}
        }
      }
    } else {
      try { c.pause(); } catch {}
      userPausedRef.current = false;
    }
  }, [inView, track.start_ms]);

  function handleReady(ctrl: SpotifyEmbedController) {
    controllerRef.current = ctrl;
    let hasEverPlayed = false;
    ctrl.addListener('playback_update', (e: any) => {
      const isPaused = e?.data?.isPaused;
      const duration = e?.data?.duration ?? 0;
      if (typeof isPaused === 'boolean') setPlaying(!isPaused);
      if (!trackLoadedRef.current && duration > 0) {
        trackLoadedRef.current = true;
        if (inViewRef.current && !userPausedRef.current) {
          try { ctrl.play(); } catch {}
          if (track.start_ms && track.start_ms > 0) {
            try { ctrl.seek(track.start_ms / 1000); } catch {}
          }
        }
      }
      if (isPaused === false) hasEverPlayed = true;
      if (isPaused === true && inViewRef.current && hasEverPlayed) {
        userPausedRef.current = true;
      }
    });
  }

  function togglePlay(e: React.MouseEvent) {
    e.stopPropagation();
    const c = controllerRef.current;
    if (!c) return;
    if (playing) {
      try { c.pause(); } catch {}
      userPausedRef.current = true;
    } else {
      try { c.play(); } catch {}
      userPausedRef.current = false;
    }
  }

  function openSpotify(e: React.MouseEvent) {
    e.stopPropagation();
    window.open(spotifyDeepLink(track), '_blank', 'noopener,noreferrer');
  }

  return (
    <div ref={wrapRef}>
      {/* Iframe Spotify ESCONDIDO — toca em background sem mostrar nada */}
      <SpotifyEmbed
        trackId={track.track_id}
        hidden
        autoPlay
        startMs={track.start_ms || 0}
        onReady={handleReady}
      />
      {/* UI custom — capa girando + nome + botão pause */}
      <div
        className="mx-3 flex items-center gap-3 px-3 py-2.5 rounded-2xl select-none"
        style={{
          background: 'linear-gradient(135deg, #1db954 0%, #1ed760 100%)',
          color: '#fff',
          boxShadow: '0 4px 12px rgba(30,185,84,0.30)',
        }}
      >
        <img
          src={track.album_cover_url}
          alt=""
          className="w-12 h-12 rounded-full object-cover flex-shrink-0 cursor-pointer"
          onClick={openSpotify}
          style={{
            boxShadow: '0 2px 6px rgba(0,0,0,0.20)',
            animation: playing ? 'spin 6s linear infinite' : 'none',
          }}
        />
        <div className="flex-1 min-w-0 leading-tight">
          <div className="text-[13px] font-bold truncate">{track.name}</div>
          <div className="text-[11px] opacity-90 truncate">{track.artist}</div>
        </div>
        <SpotifyLogo className="w-4 h-4 flex-shrink-0" mono />
        <button
          type="button"
          onClick={togglePlay}
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-transform active:scale-90"
          style={{ background: 'rgba(255,255,255,0.20)', color: '#fff' }}
          aria-label={playing ? 'Pausar' : 'Tocar'}
        >
          {playing ? <Pause className="w-4 h-4" fill="#fff" /> : <Play className="w-4 h-4 ml-0.5" fill="#fff" />}
        </button>
      </div>
    </div>
  );
}
