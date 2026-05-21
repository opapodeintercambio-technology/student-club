// Camera viewfinder em tela cheia, estilo Instagram, pro fluxo de POSTAR STORY.
// Acionada quando o user toca no proprio circulo de story (com "+") na barra
// de stories do feed. Substitui o menu antigo (Tirar foto / Gravar video /
// Galeria) — agora abre direto pra camera ao vivo.
//
// Comportamento:
//   - Tap rapido no botao central -> tira foto (jpeg)
//   - Press + hold -> grava video (max 30s; anel de progresso ao redor do botao)
//   - Canto sup esq: X (cancela)
//   - Canto sup dir: trocar camera frontal/traseira
//   - Canto inf esq: icone galeria -> file picker (foto+video do device)
//   - Texto inferior: "História" (modo padrao; espacador pra UX futura
//     de Reel/Live, se implementarmos)
//
// Permissoes: pedidas so na primeira vez via getUserMedia. Se negada, mostra
// fallback com botao "Abrir galeria" pra nao bloquear o user.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Image as ImageIcon, RefreshCcw, AlertTriangle } from 'lucide-react';

interface Props {
  /** Disparado quando o user captura ou seleciona uma midia.
   *  kind eh determinado pelo MIME do arquivo retornado. */
  onCapture: (file: File, kind: 'image' | 'video') => void;
  onCancel: () => void;
}

const MAX_REC_SECONDS = 30;

export function StoryCamera({ onCapture, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunks = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordStartRef = useRef<number>(0);
  // Coordenada Y inicial do toque/clique no botao captura. Usada pro
  // gesto arrastar-pra-cima/baixo = ZOOM durante a gravacao (estilo IG).
  // Reseta no pointer up.
  const captureStartYRef = useRef<number>(0);

  const [facing, setFacing] = useState<'user' | 'environment'>('environment');
  const [permErr, setPermErr] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  // Zoom digital da preview do video. 1 = sem zoom, 4 = zoom maximo (4x).
  // Aplicado via CSS scale no <video> (digital zoom — qualidade cai mas
  // funciona em qualquer browser, ao contrario de track.applyConstraints).
  // Tambem queimado no canvas/MediaRecorder pra que a gravacao tenha o
  // mesmo enquadramento que o user viu.
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  // SWIPE-DOWN-TO-CLOSE: user arrasta a tela pra baixo pra sair da camera
  // (alem do botao X). Threshold 120px = fecha; abaixo = snap-back.
  const [swipeY, setSwipeY] = useState(0);
  const swipeRef = useRef<{ startY: number; startX: number; active: boolean } | null>(null);

  // PINCH-ZOOM no viewfinder: pinca com 2 dedos pra zoom in/out na preview
  // (alem do drag vertical durante a gravacao). Detectado manualmente via
  // TouchEvent.
  const pinchRef = useRef<{ startDist: number; baseZoom: number } | null>(null);

  // Trava o scroll do body enquanto a camera esta aberta
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = { html: html.style.overflow, body: body.style.overflow };
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prev.html;
      body.style.overflow = prev.body;
    };
  }, []);

  // Inicia/re-inicia a stream da camera ao trocar facing
  useEffect(() => {
    let cancelled = false;
    async function start() {
      setPermErr(null);
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Esse navegador nao suporta camera. Use a galeria.');
        }
        if (streamRef.current) {
          for (const t of streamRef.current.getTracks()) t.stop();
          streamRef.current = null;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: true,
        });
        if (cancelled) {
          for (const t of stream.getTracks()) t.stop();
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => { /* iOS pode falhar autoplay; ok */ });
        }
      } catch (e: any) {
        if (cancelled) return;
        const msg = e?.message || String(e);
        setPermErr(
          msg.includes('denied') || msg.includes('NotAllowed')
            ? 'Permissão da câmera negada. Habilite nas configurações do navegador ou use a galeria.'
            : msg.includes('NotFound') || msg.includes('not found')
              ? 'Nenhuma câmera encontrada nesse dispositivo. Use a galeria.'
              : msg
        );
      }
    }
    start();
    return () => {
      cancelled = true;
      const s = streamRef.current;
      if (s) {
        for (const t of s.getTracks()) t.stop();
        streamRef.current = null;
      }
    };
  }, [facing]);

  // Cleanup ao desmontar
  useEffect(() => {
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      const r = recorderRef.current;
      if (r && r.state !== 'inactive') {
        try { r.stop(); } catch {}
      }
    };
  }, []);

  function flipCamera() {
    if (recording) return;
    setFacing(f => (f === 'user' ? 'environment' : 'user'));
  }

  function snapPhoto() {
    const v = videoRef.current;
    if (!v) return;
    const w = v.videoWidth;
    const h = v.videoHeight;
    if (!w || !h) return;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Aplica o zoom CSS-equivalente NO CANVAS pra que a foto salva tenha
    // o mesmo enquadramento que o user viu na preview. Crop centralizado.
    const z = zoomRef.current || 1;
    if (z > 1) {
      const cropW = w / z;
      const cropH = h / z;
      const sx = (w - cropW) / 2;
      const sy = (h - cropH) / 2;
      if (facing === 'user') {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(v, sx, sy, cropW, cropH, 0, 0, w, h);
    } else {
      if (facing === 'user') {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(v, 0, 0, w, h);
    }
    canvas.toBlob(blob => {
      if (!blob) return;
      const file = new File([blob], `story-${Date.now()}.jpg`, { type: 'image/jpeg' });
      onCapture(file, 'image');
    }, 'image/jpeg', 0.92);
  }

  function startRecording() {
    const stream = streamRef.current;
    if (!stream || recorderRef.current) return;
    recordChunks.current = [];
    const mime = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus'
      : 'video/webm';
    try {
      const rec = new MediaRecorder(stream, { mimeType: mime });
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) recordChunks.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(recordChunks.current, { type: mime });
        const ext = mime.includes('mp4') ? 'mp4' : 'webm';
        const file = new File([blob], `story-${Date.now()}.${ext}`, { type: mime });
        recordChunks.current = [];
        recorderRef.current = null;
        if (file.size > 0) onCapture(file, 'video');
      };
      rec.start();
      recorderRef.current = rec;
      recordStartRef.current = Date.now();
      setRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => {
        const elapsed = (Date.now() - recordStartRef.current) / 1000;
        setRecordSeconds(elapsed);
        if (elapsed >= MAX_REC_SECONDS) stopRecording();
      }, 100);
    } catch (e) {
      console.error('[StoryCamera] startRecording failed', e);
    }
  }

  function stopRecording() {
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
    setRecording(false);
    const r = recorderRef.current;
    if (r && r.state !== 'inactive') {
      try { r.stop(); } catch {}
    }
    // Reseta zoom ao fim da gravacao — proxima sessao comeca em 1x.
    setZoom(1);
  }

  /** Aplica zoom via hardware quando suportado (camera physical zoom), com
   *  fallback pra CSS scale. Tenta os dois — alguns dispositivos suportam
   *  o constraint mas com range pequeno; CSS complementa. */
  function applyZoomToTrack(value: number) {
    const stream = streamRef.current;
    if (!stream) return;
    const track = stream.getVideoTracks?.()[0];
    if (!track) return;
    try {
      const caps = (track.getCapabilities?.() ?? {}) as any;
      if (caps && typeof caps.zoom === 'object' && caps.zoom != null) {
        const min = caps.zoom.min ?? 1;
        const max = caps.zoom.max ?? 1;
        if (max > min) {
          const mapped = min + ((value - 1) / 3) * (max - min);
          const clamped = Math.max(min, Math.min(max, mapped));
          track.applyConstraints({ advanced: [{ zoom: clamped } as any] }).catch(() => {});
        }
      }
    } catch { /* navegador sem suporte — CSS scale cobre */ }
  }

  function onCaptureBtnDown(e: React.PointerEvent) {
    e.preventDefault();
    if (recording) return;
    // Captura O POINTER no botao — eventos subsequentes (move/up) continuam
    // chegando aqui mesmo quando o dedo do user sai do botao (essencial pro
    // gesto de arrastar pra cima/baixo durante a gravacao = zoom).
    try { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); } catch {}
    captureStartYRef.current = e.clientY;
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      startRecording();
    }, 350);
  }

  function onCaptureBtnMove(e: React.PointerEvent) {
    if (!recording) return;
    // Y delta: NEGATIVO = arrastou pra CIMA (zoom in), POSITIVO = pra baixo (out)
    const dy = e.clientY - captureStartYRef.current;
    // 250px = 4x. Linear, clamped em [1, 4]. Tornou-se conveniente:
    // segurar e levantar uns 5cm da posicao inicial = zoom maximo.
    const next = Math.max(1, Math.min(4, 1 - dy / 250));
    setZoom(next);
    applyZoomToTrack(next);
  }

  function onCaptureBtnUp(e: React.PointerEvent) {
    e.preventDefault();
    try { (e.currentTarget as Element).releasePointerCapture?.(e.pointerId); } catch {}
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
      snapPhoto();
      return;
    }
    if (recording) stopRecording();
  }

  function openGallery() {
    const el = galleryRef.current;
    if (!el) return;
    el.value = '';
    el.click();
  }

  function handleGalleryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const kind: 'image' | 'video' = f.type.startsWith('video/') ? 'video' : 'image';
    onCapture(f, kind);
  }

  const recordPct = Math.min(1, recordSeconds / MAX_REC_SECONDS);
  // Calculo do strokeDashoffset pro anel de progresso (raio 38, circ ~239)
  const ringRadius = 38;
  const ringCirc = 2 * Math.PI * ringRadius;
  const ringOffset = ringCirc * (1 - recordPct);

  // ─── Handlers de TouchEvent no viewfinder ─────────────────────────
  // Coexistem com o capture button (que tem setPointerCapture e nao
  // deixa eventos vazarem). Tratam:
  //   - 1 dedo arrastando pra baixo = swipe-down pra fechar
  //   - 2 dedos = pinch zoom
  function onViewerTouchStart(e: React.TouchEvent) {
    if (recording) return; // durante gravacao, zoom eh via drag do botao
    if (e.touches.length === 2) {
      const t1 = e.touches[0], t2 = e.touches[1];
      const dx = t2.clientX - t1.clientX;
      const dy = t2.clientY - t1.clientY;
      pinchRef.current = {
        startDist: Math.hypot(dx, dy),
        baseZoom: zoom,
      };
      swipeRef.current = null; // pinch cancela swipe candidato
      return;
    }
    if (e.touches.length === 1) {
      swipeRef.current = {
        startY: e.touches[0].clientY,
        startX: e.touches[0].clientX,
        active: false,
      };
    }
  }
  function onViewerTouchMove(e: React.TouchEvent) {
    if (recording) return;
    // Pinch (2 dedos) tem prioridade
    if (e.touches.length === 2 && pinchRef.current) {
      if (e.cancelable) e.preventDefault();
      const t1 = e.touches[0], t2 = e.touches[1];
      const dx = t2.clientX - t1.clientX;
      const dy = t2.clientY - t1.clientY;
      const dist = Math.hypot(dx, dy);
      const ratio = dist / pinchRef.current.startDist;
      const newZoom = Math.max(1, Math.min(4, pinchRef.current.baseZoom * ratio));
      setZoom(newZoom);
      applyZoomToTrack(newZoom);
      return;
    }
    // Swipe down (1 dedo, vertical pra baixo)
    if (e.touches.length === 1 && swipeRef.current) {
      const dy = e.touches[0].clientY - swipeRef.current.startY;
      const dx = Math.abs(e.touches[0].clientX - swipeRef.current.startX);
      // Threshold: 20px pra baixo + movimento mais vertical que horizontal
      if (!swipeRef.current.active && dy > 20 && dy > dx) {
        swipeRef.current.active = true;
      }
      if (swipeRef.current.active) {
        if (e.cancelable) e.preventDefault();
        setSwipeY(Math.max(0, dy));
      }
    }
  }
  function onViewerTouchEnd(e: React.TouchEvent) {
    if (e.touches.length < 2 && pinchRef.current) {
      pinchRef.current = null;
    }
    if (e.touches.length === 0) {
      const sw = swipeRef.current;
      swipeRef.current = null;
      if (sw && sw.active) {
        if (swipeY > 120) {
          onCancel();
        } else {
          setSwipeY(0);
        }
      } else {
        setSwipeY(0);
      }
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100200] flex flex-col"
      style={{
        // Fade do backdrop conforme o user arrasta pra baixo
        background: `rgba(0,0,0,${Math.max(0.55, 1 - swipeY / 600)})`,
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
        // Translada o conteudo durante o swipe-down
        transform: swipeY > 0 ? `translateY(${swipeY}px)` : undefined,
        transition: swipeRef.current?.active ? 'none' : 'transform 220ms ease-out, background 200ms ease-out',
      } as React.CSSProperties}
      onTouchStart={onViewerTouchStart}
      onTouchMove={onViewerTouchMove}
      onTouchEnd={onViewerTouchEnd}
      onTouchCancel={onViewerTouchEnd}
    >
      {/* Video viewfinder fullscreen, espelhado quando camera frontal.
          O scale(zoom) eh aplicado AQUI pra dar feedback visual imediato
          do gesto de arrastar-pra-cima-pra-zoom. Se o hardware suporta
          track.applyConstraints({zoom}), ai a stream ja vem ampliada
          do device e o CSS scale eh sem efeito visual (porque ja esta
          em 100% do frame). Quando hardware nao suporta (caso comum em
          web), o CSS scale eh o que entrega o zoom (digital). */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: facing === 'user'
            ? `scaleX(-1) scale(${zoom})`
            : `scale(${zoom})`,
          transformOrigin: 'center center',
          transition: 'transform 60ms linear',
        }}
      />

      {/* Overlay com controles */}
      <div className="relative z-10 flex flex-col h-full">
        {/* Top bar */}
        <div
          className="flex items-center justify-between px-4"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
        >
          <button
            type="button"
            onClick={onCancel}
            className="w-10 h-10 rounded-full flex items-center justify-center active:scale-95"
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
            aria-label="Fechar câmera"
          >
            <X className="w-5 h-5 text-white" />
          </button>

          <button
            type="button"
            onClick={flipCamera}
            disabled={!!permErr || recording}
            className="w-10 h-10 rounded-full flex items-center justify-center active:scale-95 disabled:opacity-40"
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
            aria-label="Trocar câmera"
          >
            <RefreshCcw className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* TIMER DE GRAVACAO — visivel, centralizado no topo enquanto grava.
            Formato MM:SS. Bolinha vermelha pulsando dah feedback visual de
            "REC ativo". Substituiu o badge antigo que mostrava "02:3s"
            (formato confuso com decimo de segundo). */}
        {recording && (
          <div
            className="absolute z-30 left-1/2 -translate-x-1/2 pointer-events-none flex items-center gap-2 px-3 py-1.5 rounded-full"
            style={{
              top: 'calc(env(safe-area-inset-top, 0px) + 14px)',
              background: 'rgba(220,38,38,0.92)',
              backdropFilter: 'blur(6px)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            }}
          >
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span className="text-white text-sm font-bold tabular-nums" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
              {(() => {
                const total = Math.floor(recordSeconds);
                const mm = Math.floor(total / 60);
                const ss = total % 60;
                return `${mm}:${ss.toString().padStart(2, '0')}`;
              })()}
            </span>
          </div>
        )}

        {/* Spacer central — mostra fallback se permissao negada */}
        <div className="flex-1 flex items-center justify-center">
          {permErr && (
            <div
              className="mx-6 px-5 py-4 rounded-2xl text-center text-white"
              style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
            >
              <AlertTriangle className="w-7 h-7 mx-auto mb-2 text-yellow-400" />
              <p className="text-sm mb-3">{permErr}</p>
              <button
                type="button"
                onClick={openGallery}
                className="px-4 py-2 rounded-full font-semibold text-sm bg-white text-black"
              >
                Abrir galeria
              </button>
            </div>
          )}
        </div>

        {/* Indicador de zoom — so aparece DURANTE a gravacao quando o user
            esta arrastando pra ajustar. Badge com o nivel atual no canto
            direito + barra vertical com posicao. Estilo minimalista pra nao
            ofuscar a preview. */}
        {recording && zoom > 1.02 && (
          <div
            className="absolute right-3 z-30 pointer-events-none flex flex-col items-center gap-2"
            style={{ top: '50%', transform: 'translateY(-50%)' }}
          >
            <span
              className="px-2 py-0.5 rounded-full text-xs font-bold text-white font-mono tabular-nums"
              style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
            >
              {zoom.toFixed(1)}x
            </span>
            <div
              className="rounded-full overflow-hidden"
              style={{ width: 4, height: 160, background: 'rgba(255,255,255,0.18)' }}
            >
              <div
                style={{
                  width: '100%',
                  height: `${((zoom - 1) / 3) * 100}%`,
                  background: '#fff',
                  marginTop: 'auto',
                  position: 'relative',
                  top: `${100 - ((zoom - 1) / 3) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Bottom controls: galeria | botao captura | spacer (mantem alinhamento) */}
        <div
          className="flex items-center justify-around px-6"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)', paddingTop: 8 }}
        >
          {/* Galeria */}
          <button
            type="button"
            onClick={openGallery}
            className="w-12 h-12 rounded-2xl flex items-center justify-center active:scale-95"
            style={{ background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(6px)' }}
            aria-label="Abrir galeria"
          >
            <ImageIcon className="w-6 h-6 text-white" />
          </button>

          {/* Botao captura com anel de progresso. onPointerMove eh ATIVO
              enquanto o user mantem pressionado E esta gravando — rastreia
              Y pra calcular zoom (arrastar pra cima = zoom in). */}
          <button
            type="button"
            onPointerDown={onCaptureBtnDown}
            onPointerMove={onCaptureBtnMove}
            onPointerUp={onCaptureBtnUp}
            onPointerCancel={onCaptureBtnUp}
            // Bloqueia tambem o context menu do iOS (long-press normalmente
            // abre um menu de copiar/compartilhar — atrapalha gravar video)
            onContextMenu={(e) => e.preventDefault()}
            className="relative flex items-center justify-center"
            style={{
              width: 84, height: 84, touchAction: 'none',
              userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none',
            } as React.CSSProperties}
            aria-label={recording ? 'Parar gravação' : 'Tirar foto (segure pra gravar)'}
          >
            {/* Anel externo (estatico — branco) + progresso (vermelho) por cima */}
            <span
              className="absolute inset-0 rounded-full"
              style={{ border: '4px solid rgba(255,255,255,0.85)' }}
            />
            {recording && (
              <svg
                className="absolute inset-0"
                width={84}
                height={84}
                viewBox="0 0 84 84"
                style={{ transform: 'rotate(-90deg)' }}
              >
                <circle
                  cx={42}
                  cy={42}
                  r={ringRadius}
                  fill="none"
                  stroke="#dc2626"
                  strokeWidth={4}
                  strokeLinecap="round"
                  strokeDasharray={ringCirc}
                  strokeDashoffset={ringOffset}
                  style={{ transition: 'stroke-dashoffset 100ms linear' }}
                />
              </svg>
            )}
            {/* Bola interna SEMPRE VERMELHA (a pedido do user — destaque
                consistente em dark e light mode). Ao gravar, vira quadrado
                pra dar feedback visual de "gravacao em andamento". */}
            <span
              style={{
                width: recording ? 30 : 66,
                height: recording ? 30 : 66,
                borderRadius: recording ? 6 : '50%',
                background: '#dc2626',
                transition: 'all 180ms ease-out',
              }}
            />
          </button>

          {/* Spacer pra equilibrar o layout (galeria a esquerda, vazio aqui) */}
          <div className="w-12 h-12" />
        </div>

        {/* Label do modo atual (a pedido do user: "Story", nao "Historia") */}
        <div
          className="text-center pb-2"
          style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <span
            className="text-white/85 text-xs font-bold uppercase tracking-widest"
            style={{ fontFamily: '"DM Sans", system-ui, sans-serif', letterSpacing: '0.18em' }}
          >
            Story
          </span>
        </div>
      </div>

      {/* Input invisivel pra galeria.
          TRUQUE pra ENTRAR DIRETO NA GALERIA NO iOS (sem o sheet
          "Tirar Foto / Fototeca / Arquivos"):
          - `multiple` faz o iOS Safari pular o sheet de origem porque
            "Tirar Foto" so captura UMA imagem — nao faz sentido com multi.
            Resultado: o sistema abre direto a Photo Library.
          - accept="image/*,video/*" mantem foto E video selecionaveis na
            galeria.
          Mesmo declarando multiple, so usamos o PRIMEIRO arquivo (linha
          handleGalleryChange). A flag eh apenas pra mudar o comportamento
          do picker do iOS — a UX da story so suporta 1 midia por upload. */}
      <input
        ref={galleryRef}
        type="file"
        accept="image/*,video/*"
        multiple
        onChange={handleGalleryChange}
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
      />
    </div>,
    document.body,
  );
}
