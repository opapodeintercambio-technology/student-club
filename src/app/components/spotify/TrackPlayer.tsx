// <TrackPlayer track={t} variant="story | post | chat" />
//
// Player único compartilhado pelos 3 contextos onde aparece música:
// stories, feed posts e mensagens do chat. As 3 variants são puramente
// VISUAIS — a lógica de play/pause/timeline é unificada.
//
// LEGAL/COMPLIANCE:
// - Áudio vem direto do CDN do Spotify (preview_url MP3 30s público).
// - Nada é cacheado, baixado ou re-encodado no nosso servidor.
// - Logo "Spotify" oficial visível em todas as variants.
// - Tap na capa → deep link pro Spotify (mantém atribuição).
// - Sem sincronização de áudio entre devices (cada um toca local).

import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';
import type { SpotifyTrack } from '../../lib/spotify';
import { formatDuration, spotifyDeepLink } from '../../lib/spotify';
import { SpotifyLogo } from './SpotifyLogo';

interface Props {
  track: SpotifyTrack;
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
  if (variant === 'story') {
    return (
      <>
        <audio ref={audioRef} src={track.preview_url} loop preload="auto" playsInline />
        <div
          className="absolute left-3 bottom-20 z-30 flex items-center gap-2.5 pl-1 pr-3 py-1 rounded-full select-none"
          style={{
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            color: '#fff',
            maxWidth: 'min(280px, 70vw)',
          }}
          onClick={openSpotify}
          role="button"
          aria-label={`Tocando: ${track.name} de ${track.artist}`}
        >
          {/* Capa girando enquanto toca */}
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
          {hasPreview && (
            <button
              type="button"
              onClick={toggleMute}
              className="ml-1 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.15)' }}
              aria-label={muted ? 'Ativar som' : 'Silenciar'}
            >
              {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
          )}
          <SpotifyLogo className="w-4 h-4 flex-shrink-0" />
        </div>
      </>
    );
  }

  // ─── Variant: POST (card no feed) ──────────────────────────────────
  // Usa o embed OFICIAL do Spotify (iframe). Toca direto no feed, sem
  // depender de preview_url (que Spotify removeu da maioria das tracks
  // em 2024). Premium users ouvem a faixa completa; free escuta 30s.
  if (variant === 'post') {
    return (
      <div className="mx-3 mb-3 rounded-2xl overflow-hidden">
        <iframe
          title={`${track.name} - ${track.artist}`}
          src={`https://open.spotify.com/embed/track/${track.track_id}?utm_source=studentclub`}
          width="100%"
          height="80"
          loading="lazy"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          style={{ border: 'none', borderRadius: 12 }}
        />
      </div>
    );
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
