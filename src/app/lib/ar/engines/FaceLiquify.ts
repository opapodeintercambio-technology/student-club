// FaceLiquify — deformacao SUTIL e LIMITADA.
//
// LIMITE DE SEGURANCA: intensity sempre clampada em [0, 0.3]. Sem
// possibilidade do user ou config burlarem. Antes de cada apply, validamos.
//
// MVP: implementacao via canvas 2D com tecnica de "pinch/push" em
// regioes especificas. Renderiza o video em tiles e desloca os tiles
// proximos ao target. Performance OK em mobile pq o numero de tiles
// e baixo (~32x32) e so re-desenha quando landmarks mudam.
//
// Para producao com perf melhor, substituir por shader WebGL com
// vertex displacement map (proxima iteracao).

import type { FilterEngine, Landmark } from '../types';

interface FaceLiquifyParams {
  target?: 'chin' | 'eyes' | 'cheeks';
  intensity?: number;
}

// Landmarks de referencia por target
const CHIN_POINTS = [152, 175, 396, 369, 400, 377, 378, 379, 365, 397, 288, 361]; // contorno do queixo
const EYES_POINTS = [33, 133, 159, 145, 263, 362, 386, 374]; // olhos esquerdo + direito
const CHEEKS_POINTS = [205, 425, 187, 411, 50, 280]; // macas do rosto

export class FaceLiquifyEngine implements FilterEngine {
  readonly id = 'liquify' as const;
  private target: 'chin' | 'eyes' | 'cheeks' = 'chin';
  private intensity = 0;

  async mount(_gl: any, params: Record<string, unknown>): Promise<void> {
    const p = params as FaceLiquifyParams;
    this.target = p.target || 'chin';
    // CLAMP DE SEGURANCA: max 0.3
    const raw = typeof p.intensity === 'number' ? p.intensity : 0.15;
    this.intensity = Math.max(0, Math.min(0.3, raw));
  }

  render({ video, landmarks, canvas }: {
    video: HTMLVideoElement;
    landmarks: Landmark[] | null;
    canvas: HTMLCanvasElement;
    timestamp: number;
  }): void {
    const ctx = canvas.getContext('2d');
    if (!ctx || video.videoWidth === 0) return;

    const w = canvas.width;
    const h = canvas.height;

    // Base: video direto
    ctx.drawImage(video, 0, 0, w, h);

    if (!landmarks || landmarks.length < 468 || this.intensity < 0.01) return;

    // Pega os landmarks de referencia
    const refIndices = this.target === 'chin' ? CHIN_POINTS
      : this.target === 'eyes' ? EYES_POINTS
      : CHEEKS_POINTS;
    const refLandmarks = refIndices.map(i => landmarks[i]).filter(Boolean);
    if (refLandmarks.length === 0) return;

    // Calcula centro de massa dos pontos de ref
    const cx = refLandmarks.reduce((s, p) => s + p.x, 0) / refLandmarks.length;
    const cy = refLandmarks.reduce((s, p) => s + p.y, 0) / refLandmarks.length;
    const cxPx = cx * w;
    const cyPx = cy * h;

    // Raio de influencia: largura facial * fator
    const radiusPx = w * 0.15;

    // Direcao do warp:
    //   chin = pull-up (pra reduzir queixo, puxa pra cima)
    //   eyes = push-out (aumenta olhos, empurra pra fora — fica sutil)
    //   cheeks = push-in (afina maças do rosto, empurra pra dentro)
    const warpStrength = this.intensity * 30; // pixels max

    // Implementacao simples: aplica radial warp em uma regiao circular
    // usando getImageData/putImageData. Custoso mas funcional pra MVP.
    // Pra perf real, usar shader WebGL.
    try {
      const x0 = Math.max(0, Math.floor(cxPx - radiusPx));
      const y0 = Math.max(0, Math.floor(cyPx - radiusPx));
      const x1 = Math.min(w, Math.ceil(cxPx + radiusPx));
      const y1 = Math.min(h, Math.ceil(cyPx + radiusPx));
      const rw = x1 - x0;
      const rh = y1 - y0;
      if (rw <= 0 || rh <= 0) return;
      const src = ctx.getImageData(x0, y0, rw, rh);
      const dst = ctx.createImageData(rw, rh);
      const srcData = src.data;
      const dstData = dst.data;
      const r2 = radiusPx * radiusPx;
      for (let y = 0; y < rh; y++) {
        for (let x = 0; x < rw; x++) {
          const dx = (x0 + x) - cxPx;
          const dy = (y0 + y) - cyPx;
          const dist2 = dx * dx + dy * dy;
          let sx = x;
          let sy = y;
          if (dist2 < r2 && dist2 > 0) {
            const dist = Math.sqrt(dist2);
            // Falloff suave do centro pra borda do raio
            const falloff = 1 - (dist / radiusPx);
            const k = falloff * warpStrength / Math.max(1, dist);
            // chin: pull-up (sy decrease)
            // eyes: scale-out (move away from center)
            // cheeks: pull-in (move toward center)
            let dxWarp = 0, dyWarp = 0;
            if (this.target === 'chin') {
              dyWarp = -k * Math.abs(dy); // puxa pra cima
            } else if (this.target === 'eyes') {
              dxWarp = -k * dx * 0.3;
              dyWarp = -k * dy * 0.3;
            } else if (this.target === 'cheeks') {
              dxWarp = k * dx * 0.4;
            }
            sx = Math.floor(x + dxWarp);
            sy = Math.floor(y + dyWarp);
            if (sx < 0) sx = 0; else if (sx >= rw) sx = rw - 1;
            if (sy < 0) sy = 0; else if (sy >= rh) sy = rh - 1;
          }
          const si = (sy * rw + sx) * 4;
          const di = (y * rw + x) * 4;
          dstData[di] = srcData[si];
          dstData[di + 1] = srcData[si + 1];
          dstData[di + 2] = srcData[si + 2];
          dstData[di + 3] = srcData[si + 3];
        }
      }
      ctx.putImageData(dst, x0, y0);
    } catch {}
  }

  dispose(): void { /* nothing GPU-allocated */ }
}
