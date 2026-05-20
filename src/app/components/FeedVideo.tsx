// Player Instagram-style pro feed:
//   - Autoplay MUDO quando o video entra no viewport (>= 50%)
//   - Pausa quando sai
//   - Click no video abre fullscreen com a proporção REAL do vídeo (estilo
//     Instagram quando você dá tap na thumb de um Reel no feed).
//   - Indicador de mute (canto)
//   - Sem barra de controles padrão — UX limpa estilo Reels
//
// Usa HlsVideo dentro pra tocar tanto HLS (Cloudflare Stream) quanto MP4 direto.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Volume2, VolumeX, Play, X, Heart } from 'lucide-react';
import { HlsVideo } from './HlsVideo';

interface Props {
  src: string;
  /** poster opcional — primeira renderização antes de carregar */
  poster?: string;
  /** Disparado em double-tap. Quando passado, FeedVideo diferencia 1 tap
   *  (abre fullscreen) de 2 taps (curte + heart burst). */
  onDoubleTapLike?: () => void;
  /** Estado externo de "ja curtido" — controla a animacao do burst. */
  liked?: boolean;
}

export function FeedVideo({ src, poster, onDoubleTapLike, liked }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fullVideoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [inView, setInView] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullMuted, setFullMuted] = useState(false);
  const [heartBurst, setHeartBurst] = useState(false);

  // Tap detection: 1 tap (delay ~280ms) abre fullscreen; 2 taps consecutivos
  // chamam onDoubleTapLike (curte). Se a prop onDoubleTapLike NAO veio, cai
  // pro fluxo antigo (1 tap = abre direto, sem delay).
  const lastTapRef = useRef<number>(0);
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mobile = viewport ate 767px. Mobile precisa do video um pouco maior
  // (a pedido do user) enquanto desktop fica travado em 580px.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

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
    // Quando o modal fullscreen abre, pausa o inline pra nao tocar dois audios
    if (fullscreen) { v.pause(); return; }
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
  }, [inView, muted, fullscreen]);

  function toggleMute(e: React.MouseEvent) {
    e.stopPropagation();
    setMuted(m => !m);
  }

  function openFullscreen(e?: React.MouseEvent) {
    e?.stopPropagation();
    setFullscreen(true);
    // Fullscreen comeca com som ligado (parecido com Instagram)
    setFullMuted(false);
  }

  function triggerLikeBurst() {
    setHeartBurst(true);
    window.setTimeout(() => setHeartBurst(false), 700);
    onDoubleTapLike?.();
  }

  // Handler unico do wrapper: distingue 1 tap (fullscreen) de 2 taps (like).
  // Quando onDoubleTapLike nao foi passado, mantemos o fluxo legado (1 tap
  // = fullscreen direto, sem delay).
  function handleWrapperClick(e: React.MouseEvent) {
    if (!onDoubleTapLike) { openFullscreen(e); return; }
    e.stopPropagation();
    const now = Date.now();
    const since = now - lastTapRef.current;
    if (since > 0 && since < 320) {
      // 2o tap dentro da janela → curte. Cancela o fullscreen pendente.
      lastTapRef.current = 0;
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      triggerLikeBurst();
      return;
    }
    // 1o tap: agenda o fullscreen pra daqui 280ms (margem suficiente pra
    // detectar um 2o tap). Se o 2o tap vier, o timer eh cancelado acima.
    lastTapRef.current = now;
    if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
    singleTapTimerRef.current = setTimeout(() => {
      singleTapTimerRef.current = null;
      openFullscreen();
    }, 280);
  }

  function closeFullscreen() {
    setFullscreen(false);
    // Reseta o offset do swipe-to-dismiss pra proxima abertura nao herdar
    setSwipeY(0);
  }

  // Swipe-down pra fechar (estilo Instagram/Reels). dragRef guarda o estado
  // do toque atual; swipeY eh o offset visual aplicado ao video durante o
  // arrasto pra feedback de "puxar pra baixo".
  const dragRef = useRef<{ y0: number; active: boolean } | null>(null);
  const [swipeY, setSwipeY] = useState(0);
  function onOverlayTouchStart(e: React.TouchEvent) {
    dragRef.current = { y0: e.touches[0].clientY, active: true };
  }
  function onOverlayTouchMove(e: React.TouchEvent) {
    const d = dragRef.current;
    if (!d || !d.active) return;
    const dy = e.touches[0].clientY - d.y0;
    // So responde a swipe pra BAIXO (dy > 0). Resistencia leve no comeco.
    if (dy <= 0) { setSwipeY(0); return; }
    setSwipeY(dy);
  }
  function onOverlayTouchEnd() {
    const d = dragRef.current;
    if (!d || !d.active) return;
    dragRef.current = null;
    // Threshold: 120px de arrasto fecha. Senao volta pra posicao original.
    if (swipeY > 120) {
      closeFullscreen();
    } else {
      setSwipeY(0);
    }
  }

  // ESC fecha o modal
  useEffect(() => {
    if (!fullscreen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeFullscreen();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  // Mobile precisa de altura um pouco maior — desktop continua 580px.
  // Desktop: clamp(560, 115vw, 580). Mobile: clamp(640, 135vw, 760).
  const wrapperHeight = isMobile
    ? 'clamp(640px, 135vw, 760px)'
    : 'clamp(560px, 115vw, 580px)';

  return (
    <>
      <div
        ref={wrapRef}
        className="relative w-full overflow-hidden"
        style={{
          background: '#000',
          height: wrapperHeight,
          cursor: 'zoom-in',
        }}
        onClick={handleWrapperClick}
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

        {/* Heart burst — disparado em double-tap (curte) */}
        {heartBurst && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Heart
              style={{
                width: 110,
                height: 110,
                color: '#fff',
                fill: liked ? '#f87171' : '#f87171',
                filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.6))',
                animation: 'heartBurst 700ms ease-out forwards',
              }}
            />
          </div>
        )}
      </div>

      {fullscreen && createPortal(
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center"
          // Background fica mais transparente conforme o user arrasta —
          // feedback visual de "tirando da tela" (estilo Instagram).
          style={{
            background: `rgba(0,0,0,${Math.max(0.55, 0.96 - swipeY / 600)})`,
            // touchAction:none impede o iOS Safari de fazer pull-to-refresh
            // ou rubber-band scroll por tras do overlay enquanto o user arrasta.
            touchAction: 'none',
          }}
          onClick={closeFullscreen}
          onTouchStart={onOverlayTouchStart}
          onTouchMove={onOverlayTouchMove}
          onTouchEnd={onOverlayTouchEnd}
        >
          {/* Wrapper do video — ocupa toda a tela e usa flex pra centralizar.
              IMPORTANTE: o video tem w-full h-full + object-contain pra que
              o ELEMENTO ja nasca no tamanho da tela (sem o flash "pequeno
              -> expande" que acontecia com w-auto h-auto enquanto metadata
              carregava). object-contain garante que a proporcao real do
              video seja respeitada DENTRO do container que ja eh full.
              translateY aplica o offset do swipe-to-dismiss em tempo real. */}
          <div
            className="w-full h-full flex items-center justify-center"
            style={{
              transform: `translateY(${swipeY}px)`,
              transition: dragRef.current?.active ? 'none' : 'transform 220ms ease-out',
            }}
          >
            <HlsVideo
              ref={fullVideoRef}
              src={src}
              poster={poster}
              playsInline
              muted={fullMuted}
              loop
              autoPlay
              controls
              preload="auto"
              className="w-full h-full object-contain"
              onClick={(e: any) => e.stopPropagation()}
            />
          </div>
          {/* X de fechar — RESPEITA safe-area-inset-top do iOS pra nao ficar
              embaixo do notch / status bar (bateria, rede, horario). */}
          <button
            onClick={(e) => { e.stopPropagation(); closeFullscreen(); }}
            className="absolute right-4 w-10 h-10 rounded-full flex items-center justify-center active:scale-95"
            style={{
              top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(6px)',
            }}
            aria-label="Fechar"
          >
            <X className="w-5 h-5 text-white" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setFullMuted(m => !m); }}
            className="absolute right-4 w-10 h-10 rounded-full flex items-center justify-center active:scale-95"
            style={{
              bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(6px)',
            }}
            aria-label={fullMuted ? 'Ativar som' : 'Silenciar'}
          >
            {fullMuted ? <VolumeX className="w-5 h-5 text-white" /> : <Volume2 className="w-5 h-5 text-white" />}
          </button>
        </div>,
        document.body
      )}
    </>
  );
}
