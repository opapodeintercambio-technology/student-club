// FaceTexture — textura 2D mapeada em regioes especificas do rosto.
//
// MVP: posiciona PNG transparente em landmarks especificos. Sem UV map
// completo do MediaPipe Face Mesh (que exigiria Three.js renderizando a
// face geometry inteira). Em vez disso, "sticker simples":
//
//   - Sardas: stamps pequenos no nariz e bochechas (multiplos pontos)
//   - Maquiagem: shapes nas regioes de blush + olhos + labios
//   - Carnaval: shapes coloridos nas bochechas
//
// Placeholders sem PNG real: usamos primitive drawing (circulos coloridos,
// shapes). Quando os assets reais chegarem em /public/filters/textures/,
// substituimos por ctx.drawImage da textura.

import type { FilterEngine, Landmark } from '../types';

interface FaceTextureParams {
  texture?: 'sardas.png' | 'makeup.png' | 'carnaval.png';
}

// Landmarks
const NOSE_TIP = 1;
const NOSE_BRIDGE = 168;
const LEFT_CHEEK_CENTER = 117;
const RIGHT_CHEEK_CENTER = 346;
const LEFT_EYE_OUTER = 263;
const RIGHT_EYE_OUTER = 33;
const LIPS_UPPER = 13;
const LIPS_LOWER = 14;
const LIPS_LEFT = 78;
const LIPS_RIGHT = 308;

export class FaceTextureEngine implements FilterEngine {
  readonly id = 'texture' as const;
  private textureName: 'sardas.png' | 'makeup.png' | 'carnaval.png' = 'sardas.png';

  async mount(_gl: any, params: Record<string, unknown>): Promise<void> {
    const p = params as FaceTextureParams;
    this.textureName = p.texture || 'sardas.png';
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
    ctx.drawImage(video, 0, 0, w, h);

    if (!landmarks || landmarks.length < 468) return;

    switch (this.textureName) {
      case 'sardas.png': this.drawSardas(ctx, landmarks, w, h); break;
      case 'makeup.png': this.drawMakeup(ctx, landmarks, w, h); break;
      case 'carnaval.png': this.drawCarnaval(ctx, landmarks, w, h); break;
    }
  }

  private drawSardas(ctx: CanvasRenderingContext2D, lm: Landmark[], w: number, h: number) {
    // Sardas: pontinhos marrons espalhados no nariz e bochecha
    const noseTip = lm[NOSE_TIP];
    const lc = lm[LEFT_CHEEK_CENTER];
    const rc = lm[RIGHT_CHEEK_CENTER];
    if (!noseTip || !lc || !rc) return;
    ctx.save();
    ctx.fillStyle = 'rgba(101, 67, 33, 0.55)';
    const positions = [
      // nariz
      { x: noseTip.x - 0.02, y: noseTip.y - 0.01 },
      { x: noseTip.x + 0.015, y: noseTip.y - 0.02 },
      { x: noseTip.x - 0.01, y: noseTip.y + 0.01 },
      { x: noseTip.x + 0.02, y: noseTip.y + 0.005 },
      // bochecha esquerda
      { x: lc.x - 0.01, y: lc.y - 0.01 },
      { x: lc.x + 0.015, y: lc.y + 0.005 },
      { x: lc.x - 0.02, y: lc.y + 0.015 },
      { x: lc.x + 0.005, y: lc.y - 0.015 },
      // bochecha direita
      { x: rc.x - 0.015, y: rc.y - 0.01 },
      { x: rc.x + 0.01, y: rc.y + 0.005 },
      { x: rc.x - 0.005, y: rc.y + 0.018 },
      { x: rc.x + 0.02, y: rc.y - 0.005 },
    ];
    for (const pos of positions) {
      ctx.beginPath();
      ctx.arc(pos.x * w, pos.y * h, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawMakeup(ctx: CanvasRenderingContext2D, lm: Landmark[], w: number, h: number) {
    // Blush rosado nas bochechas + delineado nos olhos + batom
    const lc = lm[LEFT_CHEEK_CENTER];
    const rc = lm[RIGHT_CHEEK_CENTER];
    const lipsL = lm[LIPS_LEFT];
    const lipsR = lm[LIPS_RIGHT];
    const lipsT = lm[LIPS_UPPER];
    const lipsB = lm[LIPS_LOWER];

    ctx.save();
    // Blush
    if (lc && rc) {
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = 'rgba(255, 105, 135, 0.5)';
      ctx.beginPath();
      ctx.ellipse(lc.x * w, lc.y * h, 30, 18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(rc.x * w, rc.y * h, 30, 18, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Batom
    if (lipsL && lipsR && lipsT && lipsB) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = 'rgba(196, 30, 58, 0.55)';
      const lipsLandmarks = [
        61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291,
        409, 270, 269, 267, 0, 37, 39, 40, 185,
      ].map(i => lm[i]).filter(Boolean);
      if (lipsLandmarks.length > 4) {
        ctx.beginPath();
        ctx.moveTo(lipsLandmarks[0].x * w, lipsLandmarks[0].y * h);
        for (let i = 1; i < lipsLandmarks.length; i++) {
          ctx.lineTo(lipsLandmarks[i].x * w, lipsLandmarks[i].y * h);
        }
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private drawCarnaval(ctx: CanvasRenderingContext2D, lm: Landmark[], w: number, h: number) {
    // Pintura colorida nas bochechas — estrelas + corações
    const lc = lm[LEFT_CHEEK_CENTER];
    const rc = lm[RIGHT_CHEEK_CENTER];
    if (!lc || !rc) return;
    ctx.save();
    this.drawStar(ctx, lc.x * w, lc.y * h, 18, '#fbbf24');
    this.drawHeart(ctx, rc.x * w, rc.y * h, 18, '#ec4899');
    ctx.restore();
  }

  private drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const angle = (Math.PI / 5) * i - Math.PI / 2;
      const radius = i % 2 === 0 ? r : r * 0.45;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
  private drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y + size / 3);
    ctx.bezierCurveTo(x, y, x - size, y, x - size, y + size / 3);
    ctx.bezierCurveTo(x - size, y + size / 1.5, x, y + size * 1.2, x, y + size * 1.4);
    ctx.bezierCurveTo(x, y + size * 1.2, x + size, y + size / 1.5, x + size, y + size / 3);
    ctx.bezierCurveTo(x + size, y, x, y, x, y + size / 3);
    ctx.closePath();
    ctx.fill();
  }

  dispose(): void { /* nothing */ }
}
