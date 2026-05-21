// Player Instagram-style pro feed (estilo classico, sem fullscreen):
//   - Autoplay MUDO quando o video entra no viewport (>= 50%)
//   - Pausa quando sai
//   - 1 tap no video → liga/desliga o som (toggle mute)
//   - 2 taps → curte (heart burst) via onDoubleTapLike
//   - Long-press (segura) → 2x speed enquanto pressionado; solta → 1x
//   - Barra de duracao no rodape (estilo Reels classico)
//
// Sem modal fullscreen (revertido). UX limpa, tudo acontece no proprio post.
//
// Usa HlsVideo dentro pra tocar tanto HLS (Cloudflare Stream) quanto MP4 direto.
import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, Play, Heart } from 'lucide-react';
import { HlsVideo } from './HlsVideo';

interface Props {
  src: string;
  /** poster opcional — primeira renderização antes de carregar */
  poster?: string;
  /** Disparado em double-tap. Quando passado, FeedVideo diferencia 1 tap
   *  (toggle mute) de 2 taps (curte + heart burst). */
  onDoubleTapLike?: () => void;
  /** Estado externo de "ja curtido" — controla a animacao do burst. */
  liked?: boolean;
}

export function FeedVideo({ src, poster, onDoubleTapLike, liked }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [inView, setInView] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [heartBurst, setHeartBurst] = useState(false);
  // Progresso do video: 0..1 (fracao da duracao). Atualizado pelo ontimeupdate
  // do <video>. Usado pra desenhar a barra de duracao no rodape.
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  // Indicador visual "2x" enquanto o user segura o video. Tambem trava o
  // toggle-mute (porque o long-press nao deveria virar tap).
  const [is2x, setIs2x] = useState(false);
  // Tema atual (dark/light). Define cor da barra de duracao e do label de
  // tempo — branca no dark, preta no light. Atualiza ao trocar de tema
  // sem precisar remount (via MutationObserver no data-theme do <html>).
  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined'
      ? document.documentElement.dataset.theme !== 'light'
      : true
  );
  useEffect(() => {
    const html = document.documentElement;
    const update = () => setIsDark(html.dataset.theme !== 'light');
    update();
    const obs = new MutationObserver(update);
    obs.observe(html, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  // Tap detection refs (1 tap = mute, 2 taps = like)
  const lastTapRef = useRef<number>(0);
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Long-press refs — agenda o "2x" 350ms apos o pointerdown. Se o user
  // levantar o dedo antes disso, cancela e tratamos como tap normal.
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef<boolean>(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

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
    if (inView) {
      v.muted = muted;
      const p = v.play();
      if (p && typeof (p as any).then === 'function') {
        (p as Promise<void>).catch(() => {
          // Autoplay falhou (raro com muted=true). Ignora.
        });
      }
    } else {
      v.pause();
    }
  }, [inView, muted]);

  // Atualiza a barra de progresso conforme o video toca. ontimeupdate
  // dispara ~4 vezes/segundo (suficiente pra animar suave a barra).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    function onTime() {
      const dur = v?.duration ?? 0;
      const cur = v?.currentTime ?? 0;
      if (!isFinite(dur) || dur <= 0) {
        setProgress(0);
        setCurrentTime(0);
        setDuration(0);
        return;
      }
      setProgress(Math.max(0, Math.min(1, cur / dur)));
      setCurrentTime(cur);
      setDuration(dur);
    }
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('loadedmetadata', onTime);
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('loadedmetadata', onTime);
    };
  }, []);

  // Formata segundos em MM:SS (ex: 73 → "1:13"). Usado pro label de tempo.
  function fmt(s: number): string {
    if (!isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return `${m}:${ss.toString().padStart(2, '0')}`;
  }

  function triggerLikeBurst() {
    setHeartBurst(true);
    window.setTimeout(() => setHeartBurst(false), 700);
    onDoubleTapLike?.();
  }

  // 1 tap → toggle mute (com janela de 280ms pra detectar 2 taps que viram
  // curtida). Quando onDoubleTapLike NAO veio, 1 tap direto sem delay.
  function handleTapAsToggleMute() {
    if (!onDoubleTapLike) { setMuted(m => !m); return; }
    const now = Date.now();
    const since = now - lastTapRef.current;
    if (since > 0 && since < 320) {
      lastTapRef.current = 0;
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      triggerLikeBurst();
      return;
    }
    lastTapRef.current = now;
    if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
    singleTapTimerRef.current = setTimeout(() => {
      singleTapTimerRef.current = null;
      setMuted(m => !m);
    }, 280);
  }

  // ── Long-press → 2x speed enquanto pressionado ────────────────────
  function onPointerDown(e: React.PointerEvent) {
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    longPressFiredRef.current = false;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      longPressFiredRef.current = true;
      const v = videoRef.current;
      if (v) v.playbackRate = 2;
      setIs2x(true);
    }, 350);
  }
  function onPointerMove(e: React.PointerEvent) {
    const s = pointerStartRef.current;
    if (!s) return;
    const dx = Math.abs(e.clientX - s.x);
    const dy = Math.abs(e.clientY - s.y);
    // Se o dedo move > 10px antes do long-press disparar, cancela
    // (provavel scroll de feed em vez de hold no video).
    if ((dx > 10 || dy > 10) && !longPressFiredRef.current) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      pointerStartRef.current = null;
    }
  }
  function endPointer() {
    pointerStartRef.current = null;
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    // Se o long-press disparou, volta pra 1x e NAO trata como tap.
    if (longPressFiredRef.current) {
      const v = videoRef.current;
      if (v) v.playbackRate = 1;
      setIs2x(false);
      longPressFiredRef.current = false;
      return;
    }
    // Senao, era um tap normal — entra na detecao de 1/2 taps.
    handleTapAsToggleMute();
  }

  // Mobile precisa de altura um pouco maior — desktop continua 580px.
  // Desktop: clamp(560, 115vw, 580). Mobile: clamp(640, 135vw, 760).
  const wrapperHeight = isMobile
    ? 'clamp(640px, 135vw, 760px)'
    : 'clamp(560px, 115vw, 580px)';

  return (
    <div
      ref={wrapRef}
      className="relative w-full overflow-hidden select-none"
      style={{
        background: '#000',
        height: wrapperHeight,
        touchAction: 'manipulation',
        WebkitUserSelect: 'none',
        userSelect: 'none',
        WebkitTouchCallout: 'none',
        WebkitTapHighlightColor: 'transparent',
      } as React.CSSProperties}
      onContextMenu={(e) => e.preventDefault()}
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
        // CRITICO: pointer-events:none no <video> impede que QUALQUER touch
        // chegue ate o elemento nativo. Sem isso, o iOS Safari mostrava a
        // LUPA (loupe) no long-press, mesmo com webkit-touch-callout:none
        // — porque o <video> e um media element e o iOS tem behavior
        // proprio. Com events bloqueados, a captura toda passa pelo
        // overlay transparente acima (que tem nossos handlers).
        style={{
          pointerEvents: 'none',
          WebkitUserSelect: 'none',
          userSelect: 'none',
          WebkitTouchCallout: 'none',
          WebkitTapHighlightColor: 'transparent',
          WebkitUserDrag: 'none' as any,
        } as React.CSSProperties}
      />

      {/* OVERLAY DE EVENTOS — camada invisivel acima do <video> que captura
          todos os pointer events. O <video> em si fica com pointerEvents:none
          pra suprimir a lupa nativa do iOS no long-press. Esta camada tem
          a mesma area do video e dispara os nossos handlers (tap=mute,
          duplo tap=like, long-press=2x). z-index 5 (acima do video, abaixo
          dos botoes/overlays que tem z-10/20). */}
      <div
        className="absolute inset-0"
        style={{
          zIndex: 5,
          WebkitUserSelect: 'none',
          userSelect: 'none',
          WebkitTouchCallout: 'none',
          WebkitTapHighlightColor: 'transparent',
          touchAction: 'manipulation',
        } as React.CSSProperties}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onPointerLeave={endPointer}
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* Botão de mute/unmute — canto inferior direito (estilo Reels) */}
      <button
        onClick={(e) => { e.stopPropagation(); setMuted(m => !m); }}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        className="absolute bottom-5 right-3 w-9 h-9 rounded-full flex items-center justify-center active:scale-95 transition-transform z-20"
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

      {/* Indicador "2x" — aparece enquanto o user segura pra acelerar */}
      {is2x && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none z-20">
          <span
            className="px-3 py-1 rounded-full text-white text-xs font-bold"
            style={{
              background: 'rgba(0,0,0,0.65)',
              backdropFilter: 'blur(6px)',
              fontFamily: '"DM Sans", system-ui, sans-serif',
              letterSpacing: '0.08em',
            }}
          >
            ▶▶ 2x
          </span>
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

      {/* LABEL DE TEMPO MM:SS / MM:SS — canto inferior esquerdo, ACIMA
          da barra. Cor por tema (branca no dark, preta no light). */}
      <span
        className="absolute pointer-events-none"
        style={{
          left: 12,
          bottom: 22,
          fontFamily: '"DM Sans", system-ui, sans-serif',
          fontSize: 11,
          fontWeight: 600,
          color: isDark ? '#ffffff' : '#000000',
          textShadow: isDark
            ? '0 1px 2px rgba(0,0,0,0.55)'
            : '0 1px 2px rgba(255,255,255,0.55)',
          letterSpacing: '0.02em',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {fmt(currentTime)} / {fmt(duration)}
      </span>

      {/* BARRA DE DURACAO — fina, full width, um pouco acima do rodape
          (bottom:14 em vez de bottom:0). Cor adapta ao tema: branca no
          dark, preta no light. Pointer-events:none pra nao interferir
          nos taps do wrapper. */}
      <div
        className="absolute left-3 right-3 pointer-events-none"
        style={{
          bottom: 14,
          height: 3,
          borderRadius: 999,
          background: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${progress * 100}%`,
            background: isDark ? '#ffffff' : '#000000',
            transition: 'width 120ms linear',
            borderRadius: 999,
          }}
        />
      </div>
    </div>
  );
}
