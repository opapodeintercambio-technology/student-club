// SkinSmoothing — suaviza pele preservando contornos (olhos, boca, etc).
//
// MVP usa Canvas 2D com `ctx.filter = 'blur(Npx)'` + compositing pra
// limitar o blur a regiao da face. Funciona em qualquer browser com
// canvas 2D (mais portavel que WebGL shader custom). Quando a perf for
// medida em mobile real, migramos pra shader WebGL com bilateral filter.
//
// Como funciona:
//   1. Desenha o frame do video normal no canvas (base)
//   2. Pinta uma copia BLURRADA por cima (so na regiao da face, via path
//      dos landmarks)
//   3. Mascara olhos/boca/sobrancelha — esses ficam SEM blur (preservar
//      definicao facial)
//
// Intensidade:
//   - 0.0 = sem efeito
//   - 0.5 = suave (Suave)
//   - 1.0 = forte (Forte)

import type { FilterEngine, Landmark } from '../types';

// Indices dos landmarks MediaPipe que delimitam a oval do rosto.
// (Subset do face oval connection — verticesssss 10, 338, 297... etc.)
// Lista oficial: https://google.github.io/mediapipe/solutions/face_mesh.html
const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];

// Regioes a EXCLUIR do blur (olhos + boca + sobrancelhas)
const LEFT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const RIGHT_EYE = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398];
const MOUTH = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];

interface SkinSmoothingParams {
  intensity?: number; // 0..1, default 0.4
  brightness?: number; // -50 a +50, somado ao canal RGB
}

export class SkinSmoothingEngine implements FilterEngine {
  readonly id = 'skin' as const;
  private intensity = 0.4;
  private brightness = 0;
  // Canvas auxiliar pra desenhar a versao blurada do video
  private blurCanvas: HTMLCanvasElement | null = null;
  private blurCtx: CanvasRenderingContext2D | null = null;

  async mount(_gl: WebGL2RenderingContext | WebGLRenderingContext, params: Record<string, unknown>): Promise<void> {
    const p = params as SkinSmoothingParams;
    this.intensity = Math.max(0, Math.min(1, p.intensity ?? 0.4));
    this.brightness = Math.max(-50, Math.min(50, p.brightness ?? 0));
    // Canvas offscreen pro blur — recriado se mudar tamanho do video
    this.blurCanvas = document.createElement('canvas');
    this.blurCtx = this.blurCanvas.getContext('2d');
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

    // 1) Base: video sem filtro
    ctx.save();
    ctx.drawImage(video, 0, 0, w, h);
    ctx.restore();

    // Se nao tem landmarks ainda, so brightness (sem blur)
    if (!landmarks || landmarks.length < 468) {
      if (this.brightness !== 0) {
        this.applyBrightness(ctx, w, h);
      }
      return;
    }

    // 2) Blur layer — desenha video num offscreen canvas com filter blur
    const blurPx = this.intensity * 6; // 0..6px
    if (blurPx < 0.5) {
      if (this.brightness !== 0) this.applyBrightness(ctx, w, h);
      return;
    }

    const blurCanvas = this.blurCanvas!;
    const blurCtx = this.blurCtx!;
    if (blurCanvas.width !== w || blurCanvas.height !== h) {
      blurCanvas.width = w;
      blurCanvas.height = h;
    }
    blurCtx.filter = `blur(${blurPx}px)`;
    blurCtx.drawImage(video, 0, 0, w, h);
    blurCtx.filter = 'none';

    // 3) Mascara: desenha o blur SO dentro da oval da face, MENOS olhos/boca
    ctx.save();
    ctx.beginPath();
    this.pathPolygon(ctx, FACE_OVAL, landmarks, w, h);
    // Cutout dos olhos/boca
    this.pathPolygon(ctx, LEFT_EYE, landmarks, w, h, true);
    this.pathPolygon(ctx, RIGHT_EYE, landmarks, w, h, true);
    this.pathPolygon(ctx, MOUTH, landmarks, w, h, true);
    ctx.clip('evenodd');
    ctx.drawImage(blurCanvas, 0, 0);
    ctx.restore();

    if (this.brightness !== 0) {
      this.applyBrightness(ctx, w, h);
    }
  }

  private pathPolygon(
    ctx: CanvasRenderingContext2D,
    indices: number[],
    landmarks: Landmark[],
    w: number,
    h: number,
    moveFirst = false,
  ): void {
    if (moveFirst) ctx.moveTo(landmarks[indices[0]].x * w, landmarks[indices[0]].y * h);
    indices.forEach((idx, i) => {
      const p = landmarks[idx];
      if (!p) return;
      if (i === 0 && !moveFirst) ctx.moveTo(p.x * w, p.y * h);
      else if (i === 0 && moveFirst) ctx.moveTo(p.x * w, p.y * h);
      else ctx.lineTo(p.x * w, p.y * h);
    });
    ctx.closePath();
  }

  private applyBrightness(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    // Brightness via globalCompositeOperation 'lighter' com retangulo
    // semi-transparente — mais barato que pixel manipulation pra MVP.
    ctx.save();
    ctx.globalCompositeOperation = this.brightness > 0 ? 'lighter' : 'multiply';
    const alpha = Math.abs(this.brightness) / 100;
    const c = this.brightness > 0 ? 255 : 0;
    ctx.fillStyle = `rgba(${c},${c},${c},${alpha})`;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  dispose(): void {
    this.blurCanvas = null;
    this.blurCtx = null;
  }
}
