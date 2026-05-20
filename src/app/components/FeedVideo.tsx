// Player Instagram-style pro feed:
//   - Autoplay MUDO quando o video entra no viewport (>= 50%)
//   - Pausa quando sai
//   - Click no video alterna mute/unmute
//   - Indicador de mute (canto) e play overlay quando pausado
//   - Sem barra de controles padrão — UX limpa estilo Reels
//
// Usa HlsVideo dentro pra tocar tanto HLS (Cloudflare Stream) quanto MP4 direto.
import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, Play } from 'lucide-react';
import { HlsVideo } from './HlsVideo';

interface Props {
  src: string;
  /** poster opcional — primeira renderização antes de carregar */
  poster?: string;
}

export function FeedVideo({ src, poster }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [inView, setInView] = useState(false);

  // Observa visibilidade — autoplay quando >= 50% visível, pausa quando sai.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const visible = e.isIntersecting && e.intersectionRatio >= 0.5;
          setInView(visible);
        }
      },
      { threshold: [0, 0.5, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (inView) {
      v.muted = muted;
      const p = v.play();
      if (p && typeof (p as any).then === 'function') {
        (p as Promise<void>).catch(() => {
          // Autoplay falhou (raro com muted=true). Ignora — user pode clicar pra tocar.
        });
      }
    } else {
      v.pause();
    }
  }, [inView, muted]);

  function toggleMute(e: React.MouseEvent) {
    e.stopPropagation();
    setMuted(m => !m);
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }

  return (
    <div
      ref={wrapRef}
      className="relative w-full overflow-hidden"
      style={{
        background: '#000',
        // Altura compacta — mobile 320px, desktop 420px. object-cover
        // garante que preenche sem faixa preta, cortando excesso vertical.
        height: 'clamp(280px, 55vw, 420px)',
      }}
      onClick={togglePlay}
    >
      <HlsVideo
        ref={videoRef}
        src={src}
        poster={poster}
        playsInline
        muted={muted}
        loop
        preload="metadata"
        className="block w-full h-full object-cover"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />

      {/* Botão de mute/unmute — canto inferior direito (estilo Reels) */}
      <button
        onClick={toggleMute}
        className="absolute bottom-3 right-3 w-9 h-9 rounded-full flex items-center justify-center active:scale-95 transition-transform"
        style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
        aria-label={muted ? 'Ativar som' : 'Silenciar'}
      >
        {muted ? <VolumeX className="w-4 h-4 text-white" /> : <Volume2 className="w-4 h-4 text-white" />}
      </button>

      {/* Overlay de play quando pausado — só aparece se NÃO está rolando */}
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
          >
            <Play className="w-6 h-6 text-white" fill="#fff" style={{ marginLeft: 2 }} />
          </div>
        </div>
      )}
    </div>
  );
}
