// <DeezerChatCard /> — card visual de musica Deezer no chat, estilo
// equivalente ao card do Spotify (capa + nome + artista + play/pause).
//
// Por que NAO o <DeezerEmbed> iframe: o iframe oficial do Deezer tem
// branding diferente do Spotify (azul/preto vs verde solido) e ocupa
// 90px de altura sem o feedback visual claro de "musica tocando" como
// o Spotify mostra. Pra ter consistencia UX no chat, renderizamos um
// card CUSTOM que usa HTML5 audio com preview_url — toca 30s de
// qualquer track Deezer (preview garantido pra todas as musicas).
//
// Coordena com outros audios: quando comeca a tocar, dispara
// notifySpotifyStartedPlaying() (mesmo evento que o Spotify usa) pra
// pausar mensagens de voz no chat.

import { useEffect, useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';
import type { DeezerTrack } from '../../lib/deezer';
import { deezerDeepLink } from '../../lib/deezer';
import { notifySpotifyStartedPlaying } from '../../lib/spotify-embed-api';

const DEEZER_GRADIENT = 'linear-gradient(135deg, #00C7F2 0%, #00A4D1 100%)';

interface Props {
  track: DeezerTrack;
}

export function DeezerChatCard({ track }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  // Cache do preview FRESH: o preview_url salvo na mensagem tem token
  // que expira (querystring `exp=...`), entao musicas antigas nao tocavam.
  // Quando o user clica play pela 1a vez, buscamos fresh via /api/deezer/track.
  const [freshPreviewUrl, setFreshPreviewUrl] = useState<string | null>(null);

  function fmt(s: number) {
    if (!isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return `${m}:${ss.toString().padStart(2, '0')}`;
  }

  async function ensureFreshPreview(): Promise<string | null> {
    // Se ja temos fresh, usa.
    if (freshPreviewUrl) return freshPreviewUrl;
    try {
      setLoading(true);
      const res = await fetch(`/api/deezer/track?id=${encodeURIComponent(track.track_id)}`);
      if (!res.ok) return track.preview_url || null;
      const data = await res.json();
      const url = data?.preview_url || track.preview_url || null;
      if (url) setFreshPreviewUrl(url);
      return url;
    } catch {
      return track.preview_url || null;
    } finally {
      setLoading(false);
    }
  }

  async function togglePlay(e: React.MouseEvent) {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try { notifySpotifyStartedPlaying(); } catch {}
      // Antes de tocar, garante preview FRESH (URL com token valido).
      const url = await ensureFreshPreview();
      if (url && audio.src !== url) {
        audio.src = url;
        audio.load();
      }
      // Aplica offset escolhido pelo user no trim (start_ms).
      // O preview Deezer tem 30s; start_ms vem de 0-15000 (max).
      const startSec = Math.min((track.start_ms || 0) / 1000, 29.5);
      if (startSec > 0) {
        // Se metadata ja carregada, seta direto. Senao, espera.
        if (audio.readyState >= 1) {
          try { audio.currentTime = startSec; } catch {}
        } else {
          audio.addEventListener('loadedmetadata', () => {
            try { audio.currentTime = startSec; } catch {}
          }, { once: true });
        }
      }
      audio.play().catch((err) => {
        console.warn('[DeezerChatCard] play failed:', err);
      });
    } else {
      audio.pause();
    }
  }

  function openDeezer(e: React.MouseEvent) {
    e.stopPropagation();
    window.open(deezerDeepLink(track), '_blank', 'noopener,noreferrer');
  }

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => {
      const dur = audio.duration || 30;
      const cur = audio.currentTime || 0;
      if (isFinite(dur) && dur > 0) {
        setProgress(Math.max(0, Math.min(1, cur / dur)));
        setCurrentTime(cur);
        setDuration(dur);
      }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => { setPlaying(false); setProgress(0); setCurrentTime(0); };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  // Guard defensivo (POST-hooks pra respeitar rules-of-hooks): se a track
  // vier null/incompleta (mensagem antiga, JSON corrompido), renderiza
  // fallback amigavel ao inves de crashar o ChatPanel inteiro via
  // ErrorBoundary global.
  if (!track || !track.track_id) {
    return (
      <div className="px-3 py-2 rounded-2xl text-xs italic" style={{
        background: 'rgba(255,255,255,0.06)',
        color: 'rgba(0,199,242,0.85)',
        border: '1px dashed rgba(0,199,242,0.3)',
        maxWidth: 280,
      }}>
        🎵 Música indisponível
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 rounded-2xl min-w-[240px] max-w-[340px]"
      style={{
        background: DEEZER_GRADIENT,
        color: '#fff',
        boxShadow: '0 4px 12px rgba(0,199,242,0.30)',
      }}
    >
      {/* HTML5 audio invisivel — toca o preview_url 30s. */}
      <audio ref={audioRef} src={track.preview_url} preload="metadata" playsInline />

      {/* Capa do album — clique abre o Deezer */}
      <img
        src={track.album_cover_url}
        alt=""
        className="w-12 h-12 rounded-lg object-cover flex-shrink-0 cursor-pointer"
        onClick={openDeezer}
        style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.20)' }}
      />

      {/* Nome da musica + artista + progresso */}
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-bold truncate leading-tight">{track.name}</div>
        <div className="text-[11px] opacity-90 truncate leading-tight">{track.artist}</div>
        {/* Progress bar fininha */}
        <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.25)' }}>
          <div
            className="h-full transition-all duration-100"
            style={{ width: `${progress * 100}%`, background: 'rgba(255,255,255,0.95)' }}
          />
        </div>
        <div className="flex items-center justify-between mt-1">
          {/* Branding Deezer no canto inferior esquerdo */}
          <span className="text-[8px] font-bold tracking-wider opacity-90">DEEZER</span>
          <span className="text-[10px] font-mono opacity-90">
            {fmt(currentTime)} / {fmt(duration || 30)}
          </span>
        </div>
      </div>

      {/* Botao play/pause grande, estilo Spotify */}
      <button
        type="button"
        onClick={togglePlay}
        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-transform active:scale-90"
        style={{ background: 'rgba(255,255,255,0.20)', color: '#fff' }}
        aria-label={playing ? 'Pausar' : 'Tocar preview'}
      >
        {playing
          ? <Pause className="w-4 h-4" fill="#fff" />
          : <Play className="w-4 h-4 ml-0.5" fill="#fff" />}
      </button>

      {/* Pra coordenacao com outros Spotify embeds, exporta o controle
          via window event — quando um Spotify comeca a tocar, este card
          deve pausar. Fica em useEffect global no ChatPanel. */}
    </div>
  );
}
