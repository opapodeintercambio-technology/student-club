// useFilterEngine — orquestra a engine ativa de filtro AR.
//
// Carrega APENAS a engine necessaria pro filtro selecionado (dynamic
// import). Quando o user troca de filtro, dispose da engine antiga e
// mount da nova. Garante zero memory leak entre trocas.
//
// API:
//   const { canvasRef, ready } = useFilterEngine(videoRef, filter, landmarks);
//   <canvas ref={canvasRef} />
//
// O canvas recebe o video + filtro renderizado a cada frame.

import { useEffect, useRef, useState } from 'react';
import type { FilterConfig, FilterEngine, Landmark } from '../lib/ar/types';

export function useFilterEngine(
  videoRef: React.RefObject<HTMLVideoElement>,
  filter: FilterConfig | null,
  landmarks: Landmark[] | null,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<FilterEngine | null>(null);
  const rafRef = useRef<number | null>(null);
  const landmarksRef = useRef<Landmark[] | null>(landmarks);
  landmarksRef.current = landmarks;

  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!filter) {
      engineRef.current?.dispose();
      engineRef.current = null;
      setReady(false);
      return;
    }
    let cancelled = false;
    setReady(false);

    (async () => {
      // Dispose engine anterior (libera GPU resources)
      try { engineRef.current?.dispose(); } catch {}
      engineRef.current = null;

      // Lazy import da engine certa — cada engine vira chunk separado.
      let engine: FilterEngine;
      switch (filter.engine) {
        case 'skin': {
          const { SkinSmoothingEngine } = await import('../lib/ar/engines/SkinSmoothing');
          engine = new SkinSmoothingEngine();
          break;
        }
        case 'mask3d': {
          const { Mask3DEngine } = await import('../lib/ar/engines/Mask3D');
          engine = new Mask3DEngine();
          break;
        }
        case 'liquify': {
          const { FaceLiquifyEngine } = await import('../lib/ar/engines/FaceLiquify');
          engine = new FaceLiquifyEngine();
          break;
        }
        case 'texture': {
          const { FaceTextureEngine } = await import('../lib/ar/engines/FaceTexture');
          engine = new FaceTextureEngine();
          break;
        }
        case 'fx': {
          const { FXOverlayEngine } = await import('../lib/ar/engines/FXOverlay');
          engine = new FXOverlayEngine();
          break;
        }
        default:
          engine = createNoopEngine();
      }
      if (cancelled) return;

      const canvas = canvasRef.current;
      if (!canvas) return;
      // BUG CRITICO ANTERIOR: aqui pegavamos getContext('webgl2') do canvas
      // de OUTPUT — isso TRAVA o canvas em modo WebGL. Quando a engine
      // depois chamava canvas.getContext('2d') no render, retornava null
      // (porque o context type ja foi fixado). Resultado: tela preta em
      // todos os filtros que usam Canvas 2D (SkinSmoothing, FaceLiquify,
      // FaceTexture, FXOverlay, Mask3D que composita 2D + 3D offscreen).
      // Solucao: mount nao recebe context. Cada engine cria seu proprio
      // offscreen se precisar (Three.js cria WebGL no canvas offscreen
      // dele, Canvas 2D pega no render direto do canvas de output).
      try {
        await engine.mount(null as any, filter.params);
      } catch (e) {
        console.error('[useFilterEngine] mount failed', e);
        return;
      }
      if (cancelled) return;
      engineRef.current = engine;
      setReady(true);

      // Render loop
      const loop = () => {
        if (cancelled) return;
        const video = videoRef.current;
        const c = canvasRef.current;
        if (video && c && video.videoWidth > 0) {
          if (c.width !== video.videoWidth) c.width = video.videoWidth;
          if (c.height !== video.videoHeight) c.height = video.videoHeight;
          try {
            engine.render({
              video,
              landmarks: landmarksRef.current,
              canvas: c,
              timestamp: performance.now(),
            });
          } catch (e) { console.warn('[engine.render]', e); }
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    })();

    return () => {
      cancelled = true;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      try { engineRef.current?.dispose(); } catch {}
      engineRef.current = null;
    };
  }, [filter, videoRef]);

  return { canvasRef, ready };
}

function createNoopEngine(): FilterEngine {
  return {
    id: 'skin',
    async mount() {},
    render({ video, canvas }) {
      const ctx = canvas.getContext('2d');
      if (!ctx || video.videoWidth === 0) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    },
    dispose() {},
  };
}
