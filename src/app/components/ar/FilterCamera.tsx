// <FilterCamera /> — viewfinder full-screen com galeria de filtros AR.
//
// Substitui o StoryCamera quando o usuario clica em "AR ON" (toggle no
// header). Estrutura:
//
//   ┌──────────────────────────────────┐
//   │ X (fechar)     🔄 (flip camera)  │ <- top bar
//   │                                  │
//   │       <video>  +  <canvas>       │ <- raw video por baixo
//   │       (face tracking ativo)      │    canvas com filtro por cima
//   │                                  │
//   │   "Posicione seu rosto"          │ <- placeholder enquanto detecta
//   │                                  │
//   │  ○ ○ ⦿ ○ ○  <- galeria          │
//   │  ⦿ (botao captura)               │
//   └──────────────────────────────────┘
//
// MVP: so foto. Video gravado vem em commit seguinte (canvas.captureStream).

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, RefreshCcw } from 'lucide-react';
import { useFaceTracking } from '../../hooks/useFaceTracking';
import { useFilterEngine } from '../../hooks/useFilterEngine';
import { FILTER_CATALOG, FILTER_NONE } from '../../lib/ar/catalog';
import type { FilterConfig, AppliedFilterMeta } from '../../lib/ar/types';

interface Props {
  onCapture: (file: File, filterMeta: AppliedFilterMeta | null) => void;
  onCancel: () => void;
}

export function FilterCamera({ onCapture, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [permErr, setPermErr] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterConfig>(FILTER_NONE);

  // MediaPipe tracking
  const { landmarks, detected, loading: trackingLoading, error: trackingError, fps } = useFaceTracking(videoRef, true);

  // Engine que renderiza video + filtro no <canvas>
  const { canvasRef } = useFilterEngine(
    videoRef,
    activeFilter.id === 'none' ? null : activeFilter,
    landmarks,
  );

  // ── INIT camera stream ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function start() {
      setPermErr(null);
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('navegador sem suporte de camera');
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => {});
        }
      } catch (e: any) {
        if (cancelled) return;
        setPermErr(e?.message?.includes('denied') || e?.name === 'NotAllowedError'
          ? 'Permita acesso à câmera nas configurações do navegador.'
          : (e?.message || 'erro de câmera'));
      }
    }
    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
  }, [facing]);

  // ── CAPTURA ─────────────────────────────────────────────────────────
  function snap() {
    const sourceCanvas = canvasRef.current; // canvas com filtro queimado
    const v = videoRef.current;
    if (!v || v.videoWidth === 0) return;

    // Se o filtro tem engine ativa, o canvas ja contem o frame filtrado.
    // Senao (filtro 'none'), captura direto do <video>.
    let outCanvas: HTMLCanvasElement;
    if (sourceCanvas && activeFilter.id !== 'none') {
      outCanvas = sourceCanvas;
    } else {
      outCanvas = document.createElement('canvas');
      outCanvas.width = v.videoWidth;
      outCanvas.height = v.videoHeight;
      const ctx = outCanvas.getContext('2d');
      if (!ctx) return;
      // Espelha se for camera frontal (igual o que o user ve no preview)
      if (facing === 'user') {
        ctx.translate(outCanvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(v, 0, 0);
    }

    outCanvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `ar-${Date.now()}.jpg`, { type: 'image/jpeg' });
      const filterMeta: AppliedFilterMeta | null = activeFilter.id === 'none' ? null : {
        filter_id: activeFilter.id,
        filter_name: activeFilter.name,
        category: activeFilter.category,
        has_face_modification: activeFilter.modifiesFace,
        applied_at: new Date().toISOString(),
      };
      onCapture(file, filterMeta);
    }, 'image/jpeg', 0.92);
  }

  // ── RENDER ──────────────────────────────────────────────────────────
  return createPortal(
    <div className="fixed inset-0 z-[100200] flex flex-col bg-black" style={{ touchAction: 'none' }}>
      {/* Video raw (escondido se houver filtro ativo) + canvas com filtro por cima */}
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
          // Camera frontal espelha (igual Instagram)
          transform: facing === 'user' ? 'scaleX(-1)' : 'none',
          opacity: activeFilter.id === 'none' ? 1 : 0,
        }}
      />
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: facing === 'user' ? 'scaleX(-1)' : 'none',
          opacity: activeFilter.id === 'none' ? 0 : 1,
        }}
      />

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top,0px) + 12px)' }}>
        <button
          type="button"
          onClick={onCancel}
          className="w-10 h-10 rounded-full flex items-center justify-center active:scale-95"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
          aria-label="Fechar"
        >
          <X className="w-5 h-5 text-white" />
        </button>
        <div className="flex flex-col items-center text-white text-xs">
          {trackingLoading && <span>Carregando…</span>}
          {trackingError === 'init-failed' && <span>Erro tracking</span>}
          {!trackingLoading && !detected && !trackingError && (
            <span style={{ background: 'rgba(0,0,0,0.55)', padding: '4px 12px', borderRadius: 999 }}>
              Posicione seu rosto
            </span>
          )}
          {detected && <span className="opacity-50">{fps} fps</span>}
        </div>
        <button
          type="button"
          onClick={() => setFacing(f => (f === 'user' ? 'environment' : 'user'))}
          className="w-10 h-10 rounded-full flex items-center justify-center active:scale-95"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
          aria-label="Trocar câmera"
        >
          <RefreshCcw className="w-5 h-5 text-white" />
        </button>
      </div>

      <div className="flex-1" />

      {/* Permission error */}
      {permErr && (
        <div className="relative z-10 px-6 pb-4">
          <div className="mx-auto max-w-md rounded-2xl p-4 text-white" style={{ background: 'rgba(0,0,0,0.7)' }}>
            <p className="text-sm">{permErr}</p>
          </div>
        </div>
      )}

      {/* Galeria horizontal de filtros */}
      <div
        className="relative z-10 pb-6"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 24px)' }}
      >
        <div
          className="overflow-x-auto px-3 mb-4"
          style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
        >
          <div className="flex items-center gap-2 w-max">
            {/* Sem filtro */}
            <FilterChip
              filter={FILTER_NONE}
              active={activeFilter.id === 'none'}
              onClick={() => setActiveFilter(FILTER_NONE)}
            />
            {FILTER_CATALOG.map(f => (
              <FilterChip
                key={f.id}
                filter={f}
                active={activeFilter.id === f.id}
                onClick={() => setActiveFilter(f)}
              />
            ))}
          </div>
        </div>

        {/* Botao captura */}
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={snap}
            className="relative flex items-center justify-center active:scale-95 transition-transform"
            style={{ width: 84, height: 84, background: 'transparent', border: 'none' }}
            aria-label="Tirar foto"
          >
            <span className="absolute inset-0 rounded-full" style={{ border: '4px solid rgba(255,255,255,0.85)' }} />
            <span style={{ width: 66, height: 66, borderRadius: '50%', background: '#fff' }} />
          </button>
        </div>

        {/* Nome do filtro ativo */}
        {activeFilter.id !== 'none' && (
          <div className="text-center mt-2">
            <span className="text-white text-xs font-bold uppercase tracking-widest" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}>
              {activeFilter.name}
            </span>
            {activeFilter.modifiesFace && (
              <div className="text-[10px] text-white/70 mt-0.5">✨ Filtro Aplicado</div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ─── FilterChip ──────────────────────────────────────────────────────
function FilterChip({ filter, active, onClick }: { filter: FilterConfig; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-shrink-0 active:scale-90 transition-transform"
      style={{
        width: 56, height: 56, borderRadius: '50%',
        background: active ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.45)',
        border: active ? '2.5px solid #fff' : '2px solid rgba(255,255,255,0.4)',
        backdropFilter: 'blur(6px)',
        boxShadow: active ? '0 0 14px rgba(255,255,255,0.5)' : '0 2px 6px rgba(0,0,0,0.5)',
        fontSize: 24,
        padding: 0,
      }}
      aria-label={filter.name}
    >
      {filter.emoji}
    </button>
  );
}
