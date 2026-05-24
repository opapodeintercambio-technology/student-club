// Player Instagram-style pro feed (estilo classico, sem fullscreen):
//   - Autoplay MUDO quando o video entra no viewport (>= 50%)
//   - Pausa quando sai
//   - 1 tap em qualquer zona → liga/desliga o som (toggle mute, delay 320ms)
//   - 2 taps → curte (heart burst) via onDoubleTapLike
//   - PRESS & HOLD CENTRO  → PAUSA enquanto pressionado; solta → PLAY 1x
//   - PRESS & HOLD CANTO ESQUERDO → ⏴⏴ 2.5x REWIND continuo (rAF loop);
//     solta → PLAY 1x normal
//   - PRESS & HOLD CANTO DIREITO  → ⏵⏵ 2.5x FAST-FORWARD (playbackRate=2.5);
//     solta → playbackRate=1
//   - Barra de duracao no rodape (estilo Reels classico)
//
// Sem modal fullscreen (revertido). UX limpa, tudo acontece no proprio post.
//
// Usa HlsVideo dentro pra tocar tanto HLS (Cloudflare Stream) quanto MP4 direto.
import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, Play, Heart } from 'lucide-react';
import { HlsVideo } from './HlsVideo';

// PREFERENCIA DE AUDIO da sessao (FEED). Modulo-level pra persistir
// entre videos diferentes do feed. Default true: usuario QUER OUVIR o
// audio quando rola pra um video. Se o usuario tocar no botao de mute
// em qualquer video, atualiza pra false e os proximos tambem ficam
// mudos. Se desmutar de novo, todos os proximos voltam a tentar audio.
// Estilo Instagram/TikTok no mobile e desktop.
let feedUserWantsAudio = true;

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
  // Inicia respeitando a preferencia da sessao (default = audio aberto).
  // Antes era hard-coded `useState(true)` = sempre mudo no inicio. Agora
  // arranca tentando audio se o user nao mutou antes.
  const [muted, setMuted] = useState<boolean>(!feedUserWantsAudio);
  const [playing, setPlaying] = useState(false);
  const [inView, setInView] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [heartBurst, setHeartBurst] = useState(false);
  // Indicador "2.5x" que aparece enquanto o user segura um canto pra
  // fazer fast-forward (direita) ou rewind (esquerda). Some no release.
  const [fastMode, setFastMode] = useState<'forward' | 'backward' | null>(null);
  // requestAnimationFrame id + timestamp pra decrementar v.currentTime
  // manualmente quando o user segura o canto ESQUERDO (rewind 2.5x).
  // HTML5 video nao suporta playbackRate negativo de forma confiavel
  // entre browsers — entao simulamos via rAF.
  const rewindRafRef = useRef<number | null>(null);
  const rewindLastTsRef = useRef<number | null>(null);
  // Qual acao o long-press disparou (pause/forward/rewind) — usado pelo
  // endPointer pra saber qual rotina de "stop" chamar quando o user solta.
  const longPressActionRef = useRef<'pause' | 'forward' | 'rewind' | null>(null);
  // Progresso do video: 0..1 (fracao da duracao). Atualizado pelo ontimeupdate
  // do <video>. Usado pra desenhar a barra de duracao no rodape.
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  // (Removido: indicador visual "2x". Long-press acelera + vibra.)
  // (Removido: state isDark. Barra e label sao brancos em ambos os
  // modos agora, entao nao precisa observar o tema.)

  // Tap detection refs (1 tap = mute, 2 taps = like)
  const lastTapRef = useRef<number>(0);
  // Timer do single-tap → mute. Atrasamos 320ms a alternancia do mute pra
  // dar tempo de chegar um possivel 2o tap (que cancela o mute e dispara
  // a curtida). Sem esse delay, 2 taps rapidos ligariam o som E curtiriam.
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Long-press refs — agenda a pausa 350ms apos o pointerdown. Se o user
  // levantar o dedo antes disso, cancela e tratamos como tap normal.
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef<boolean>(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  // Marca se o user arrastou dentro do video (>10px) durante o toque atual.
  // Usado pra distinguir TAP (toggle mute / curte) de DRAG (so scroll, nao
  // dispara nada). Sem isso, scrollar o feed comecando dentro do video
  // ativava o som no fim do gesto.
  const draggedRef = useRef<boolean>(false);

  // Mobile = viewport ate 767px. Mobile precisa do video um pouco maior
  // (a pedido do user) enquanto desktop fica travado em 580px.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Observa visibilidade — autoplay quando o video esta NAS PROXIMIDADES
  // (rootMargin 300px antes de entrar no viewport).
  //
  // BUG FIX: antes era `intersectionRatio >= 0.5` (50% obrigatorio) + sem
  // rootMargin -> o video so comecava a buffer e tocar quando ja estava
  // metade aparecendo. Combinado com o tempo de play() async + buffer
  // dos primeiros frames HLS, o user via 300-800ms de tela preta/poster.
  //
  // Agora dispara play() ja quando o video esta 300px abaixo do viewport.
  // Como `playsInline + muted`, multiplos podem decodificar em paralelo
  // sem conflito de audio. Quando o user chega no video, ele ja esta
  // tocando ha ~300ms — sem mais delay perceptivel.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          setInView(e.isIntersecting);
        }
      },
      { threshold: 0, rootMargin: '300px 0px' },
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
          // Autoplay com som rejeitado pelo browser (iOS sem user gesture
          // recente, etc.). Fallback: forca mudo no <video> pra deixar
          // ele tocar, MAS atualiza tambem o state visual (muted=true)
          // pra o icone refletir a realidade (X). userWantsAudio fica
          // inalterado -> proximo video do feed que entra em view tenta
          // som de novo (gestos posteriores podem destravar).
          if (!muted) {
            v.muted = true;
            setMuted(true);
            v.play().catch(() => {});
          }
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

  // Cleanup do rAF do rewind ao desmontar — evita warning de "memory
  // leak" / callback rodando depois do unmount caso o user role o feed
  // saindo do video enquanto segura o canto esquerdo.
  useEffect(() => {
    return () => {
      if (rewindRafRef.current !== null) {
        cancelAnimationFrame(rewindRafRef.current);
        rewindRafRef.current = null;
      }
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

  // Detecta qual zona do video o pointer caiu (esquerda 0-25% / centro
  // 25-75% / direita 75-100%) a partir do clientX absoluto.
  function whichZone(clientX: number): 'left' | 'center' | 'right' {
    const el = wrapRef.current;
    if (!el) return 'center';
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return 'center';
    const relX = (clientX - rect.left) / rect.width;
    if (relX < 0.25) return 'left';
    if (relX > 0.75) return 'right';
    return 'center';
  }

  // ── FAST-FORWARD 2.5x (canto direito, enquanto pressionado) ─────────
  // playbackRate suporta valores positivos altos em todos os browsers
  // modernos; 2.5 eh seguro. Ao soltar, volta pra 1.
  function startFastForward() {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = 2.5;
    v.play().catch(() => {});
    setFastMode('forward');
  }
  function stopFastForward() {
    const v = videoRef.current;
    if (v) v.playbackRate = 1;
    setFastMode(null);
  }

  // ── REWIND 2.5x (canto esquerdo, enquanto pressionado) ──────────────
  // HTML5 video nao tem playbackRate negativo confiavel (Chrome/Firefox
  // nao suportam; Safari sim mas com glitches). Solucao: pausa o video
  // nativamente e decrementa currentTime via rAF, mantendo a taxa de
  // 2.5x (i.e., 2.5 segundos de video por 1 segundo real).
  function startRewind() {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    rewindLastTsRef.current = performance.now();
    const tick = () => {
      const last = rewindLastTsRef.current;
      if (last === null) return;
      const now = performance.now();
      const dt = (now - last) / 1000;
      rewindLastTsRef.current = now;
      if (v.currentTime > 0) {
        v.currentTime = Math.max(0, v.currentTime - dt * 2.5);
        rewindRafRef.current = requestAnimationFrame(tick);
      } else {
        // Chegou no zero — para sozinho e retoma play normal.
        stopRewind();
      }
    };
    rewindRafRef.current = requestAnimationFrame(tick);
    setFastMode('backward');
  }
  function stopRewind() {
    if (rewindRafRef.current !== null) {
      cancelAnimationFrame(rewindRafRef.current);
      rewindRafRef.current = null;
    }
    rewindLastTsRef.current = null;
    const v = videoRef.current;
    if (v) v.play().catch(() => {});
    setFastMode(null);
  }

  // Alterna mute/desmute no <video> + atualiza a preferencia da sessao.
  // Usado tanto pelo single-tap (handleTap) quanto pelo botao do icone.
  function toggleMute() {
    setMuted(prev => {
      const next = !prev;
      feedUserWantsAudio = !next; // next=true (mutado) -> wants=false
      const v = videoRef.current;
      if (v) {
        v.muted = next;
        // Se desmutando, faz replay imediato — gesto fresco do user
        // autoriza o iOS a tocar com audio agora.
        if (!next) v.play().catch(() => {});
      }
      return next;
    });
  }

  // Single tap em QUALQUER zona = toggle mute (delay 320ms pra disambiguar
  // do double-tap, que dispara like). Skip ±2.5s migrou pro press & hold
  // no canto (ver onPointerDown).
  function handleTap() {
    const now = Date.now();
    const since = now - lastTapRef.current;
    if (since > 0 && since < 320) {
      // 2o tap dentro da janela → CANCELA o mute pendente e CURTE.
      lastTapRef.current = 0;
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      if (onDoubleTapLike) triggerLikeBurst();
      return;
    }
    lastTapRef.current = now;
    if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
    singleTapTimerRef.current = setTimeout(() => {
      singleTapTimerRef.current = null;
      toggleMute();
    }, 320);
  }

  // ── Press & hold roteia por ZONA do video ────────────────────────────
  //   - CENTRO (25-75%)       → PAUSA enquanto pressionado; solta → PLAY
  //   - CANTO ESQUERDO (0-25%) → REWIND 2.5x continuo; solta → PLAY 1x
  //   - CANTO DIREITO (75-100%) → FAST-FORWARD 2.5x; solta → 1x
  // A zona eh decidida NO MOMENTO QUE o long-press dispara (350ms apos
  // pointerdown), a partir do X capturado no pointerdown.
  function onPointerDown(e: React.PointerEvent) {
    const startX = e.clientX;
    pointerStartRef.current = { x: startX, y: e.clientY };
    longPressFiredRef.current = false;
    longPressActionRef.current = null;
    draggedRef.current = false;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      longPressFiredRef.current = true;
      const zone = whichZone(startX);
      if (zone === 'left') {
        longPressActionRef.current = 'rewind';
        startRewind();
      } else if (zone === 'right') {
        longPressActionRef.current = 'forward';
        startFastForward();
      } else {
        longPressActionRef.current = 'pause';
        const v = videoRef.current;
        if (v) v.pause();
      }
      // Tremida leve (haptic feedback) sinalizando que o long-press
      // disparou. Funciona em Android e iOS 16.4+ (Safari 16.4 + PWA).
      try { navigator.vibrate?.([40]); } catch {}
    }, 350);
  }
  function onPointerMove(e: React.PointerEvent) {
    const s = pointerStartRef.current;
    if (!s) return;
    const dx = Math.abs(e.clientX - s.x);
    const dy = Math.abs(e.clientY - s.y);
    // Se o dedo move > 10px antes do long-press disparar:
    //   - Marca como drag (pra endPointer NAO chamar toggle mute)
    //   - Cancela o timer do long-press
    // Provavel scroll de feed em vez de hold no video.
    if ((dx > 10 || dy > 10) && !longPressFiredRef.current) {
      draggedRef.current = true;
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
    // Se o long-press JA disparou, NAO trata como tap. Chama a rotina
    // de "stop" correspondente a acao iniciada (cada uma cuida de
    // restaurar playbackRate=1 e retomar v.play()).
    if (longPressFiredRef.current) {
      const action = longPressActionRef.current;
      if (action === 'rewind') {
        stopRewind();
      } else if (action === 'forward') {
        stopFastForward();
      } else {
        // 'pause' (centro) ou fallback: retoma play normal.
        const v = videoRef.current;
        if (v) v.play().catch(() => {});
      }
      longPressFiredRef.current = false;
      longPressActionRef.current = null;
      draggedRef.current = false;
      return;
    }
    // Se foi DRAG (>10px de movimento), NAO trata como tap. So
    // tap genuino (sem arrastar) muda o estado do audio. Arrastar
    // dentro do video nao deve ligar/desligar o som — evita disparar
    // mute ao scrollar o feed.
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    // Tap genuino — single tap toggla mute (com delay 320ms pra dar
    // tempo do 2o tap chegar e disparar like em vez disso).
    handleTap();
  }

  // Aspect ratio responsivo (estilo Instagram):
  // - Mobile: 4:5 vertical (preenche tela do celular)
  // - Desktop: 1:1 quadrado (estilo Instagram web)
  // Substituiu o `clamp(...vw...)` antigo que dava alturas variaveis.
  const wrapperAspect = isMobile ? '4 / 5' : '1 / 1';

  return (
    <div
      ref={wrapRef}
      className="relative w-full overflow-hidden select-none"
      style={{
        background: '#000',
        aspectRatio: wrapperAspect,
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
        // BUG FIX: preload="auto" (era "metadata") -> o browser baixa os
        // primeiros segmentos do video assim que o componente monta, em
        // vez de esperar play(). Combinado com o IntersectionObserver com
        // rootMargin de 300px, quando o user chega no video, os bytes ja
        // estao bufferados — play arranca imediato.
        preload="auto"
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

      {/* Botão de mute/unmute — canto inferior direito (estilo Reels).
          Atualiza tambem feedUserWantsAudio (modulo-level) pra a
          preferencia persistir entre os videos do feed nessa sessao.
          Estado visual reflete a realidade do <video>: Volume2 = audio
          aberto, VolumeX = mudo. */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleMute();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        className="absolute bottom-5 right-3 w-9 h-9 rounded-full flex items-center justify-center active:scale-95 transition-transform z-20"
        style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
        aria-label={muted ? 'Ativar som' : 'Silenciar'}
        title={muted ? 'Ativar som' : 'Silenciar'}
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

      {/* FAST MODE INDICATOR — chip "2,5x" que aparece ENQUANTO o user
          segura um canto (rewind 2.5x no esquerdo, fast-forward 2.5x no
          direito). Some ao soltar. Posicionado no lado correspondente
          pra reforcar a direcao (esquerda=voltar, direita=avancar). */}
      {fastMode && (
        <div
          className="absolute top-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center"
          style={{
            [fastMode === 'forward' ? 'right' : 'left']: 16,
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            color: '#fff',
            fontFamily: '"DM Sans", system-ui, sans-serif',
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: '0.02em',
            fontVariantNumeric: 'tabular-nums',
            textShadow: '0 1px 2px rgba(0,0,0,0.6)',
            animation: 'skipFlashIn 220ms cubic-bezier(0.16, 1, 0.3, 1)',
          } as React.CSSProperties}
        >
          {fastMode === 'forward' ? '⏵⏵ ' : '⏴⏴ '}
          2,5x
        </div>
      )}

      {/* LABEL DE TEMPO MM:SS / MM:SS — canto inferior esquerdo, ACIMA
          da barra. Cor BRANCA em ambos os modos (a pedido do user).
          Sombra preta pra legibilidade sobre frames claros do video. */}
      <span
        className="absolute pointer-events-none"
        style={{
          left: 12,
          bottom: 22,
          fontFamily: '"DM Sans", system-ui, sans-serif',
          fontSize: 11,
          fontWeight: 600,
          color: '#ffffff',
          textShadow: '0 1px 3px rgba(0,0,0,0.7), 0 0 6px rgba(0,0,0,0.4)',
          letterSpacing: '0.02em',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {fmt(currentTime)} / {fmt(duration)}
      </span>

      {/* BARRA DE DURACAO — SCRUBBABLE (estilo audio do chat). User pode
          arrastar pra voltar / avancar no video. Container amplo (32px de
          altura) pra facilitar o toque; a faixa visual fica colada no
          rodape com 5px de espessura.
          z-index 10 → fica acima do overlay invisivel (z-5) que captura
          os taps do video. Sem isso o scrub nao recebia pointer events. */}
      <div
        className="absolute left-3 right-3"
        style={{
          bottom: 0,
          height: 32,
          display: 'flex',
          alignItems: 'flex-end',
          paddingBottom: 14,
          zIndex: 10,
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
          cursor: 'pointer',
        } as React.CSSProperties}
        onPointerDown={(e) => {
          e.stopPropagation();
          const v = videoRef.current;
          if (!v || !v.duration || !isFinite(v.duration)) return;
          const el = e.currentTarget as HTMLDivElement;
          el.setPointerCapture(e.pointerId);
          const seek = (clientX: number) => {
            const rect = el.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            const dur = v.duration;
            if (!isFinite(dur) || dur <= 0) return;
            v.currentTime = ratio * dur;
            setProgress(ratio);
            setCurrentTime(ratio * dur);
          };
          seek(e.clientX);
          const onMove = (ev: PointerEvent) => { ev.stopPropagation(); seek(ev.clientX); };
          const onUp = (ev: PointerEvent) => {
            ev.stopPropagation();
            try { el.releasePointerCapture(e.pointerId); } catch {}
            el.removeEventListener('pointermove', onMove);
            el.removeEventListener('pointerup', onUp);
            el.removeEventListener('pointercancel', onUp);
          };
          el.addEventListener('pointermove', onMove);
          el.addEventListener('pointerup', onUp);
          el.addEventListener('pointercancel', onUp);
        }}
        // stopPropagation nos touch events tambem pra impedir que o
        // overlay (z-5) abaixo receba como tap/long-press paralelo.
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        <div
          style={{
            width: '100%',
            height: 5,
            borderRadius: 999,
            background: 'rgba(0,0,0,0.35)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progress * 100}%`,
              background: '#ffffff',
              transition: 'width 120ms linear',
              borderRadius: 999,
            }}
          />
        </div>
      </div>
    </div>
  );
}
