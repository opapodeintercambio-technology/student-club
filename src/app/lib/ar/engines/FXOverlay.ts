// FXOverlay — sprites/emojis animados ancorados em landmarks.
//
// MVP: usa emojis nativos como sprites (sem dependencia de PNG externos).
// Quando os spritesheets reais estiverem disponiveis em /public/filters/fx/,
// substituir pelos PNGs animados (frame por frame via timestamp).
//
// Filtros suportados:
//   - heart anchor=eyes: 2 coracoes pulsando sobre cada olho
//   - star anchor=around-face: 6 estrelas brilhando ao redor do rosto
//   - glitter anchor=eyes: particulas de gliter caindo dos olhos

import type { FilterEngine, Landmark } from '../types';

interface FXOverlayParams {
  sprite?: 'heart' | 'star' | 'glitter';
  anchor?: 'eyes' | 'around-face';
}

// Landmarks
const LEFT_EYE_CENTER = 468; // (refined) ou usa media de 33, 133, 159, 145
const RIGHT_EYE_CENTER = 473;
const FOREHEAD = 10;
const CHIN = 152;
const LEFT_CHEEK = 234;
const RIGHT_CHEEK = 454;

interface Particle {
  x: number; y: number;
  vy: number;
  size: number;
  life: number;
  emoji: string;
}

export class FXOverlayEngine implements FilterEngine {
  readonly id = 'fx' as const;
  private sprite: 'heart' | 'star' | 'glitter' = 'heart';
  private anchor: 'eyes' | 'around-face' = 'eyes';
  private particles: Particle[] = [];
  private lastT = 0;

  async mount(_gl: any, params: Record<string, unknown>): Promise<void> {
    const p = params as FXOverlayParams;
    this.sprite = p.sprite || 'heart';
    this.anchor = p.anchor || 'eyes';
    this.particles = [];
    this.lastT = 0;
  }

  render({ video, landmarks, canvas, timestamp }: {
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

    const dt = this.lastT === 0 ? 16 : (timestamp - this.lastT);
    this.lastT = timestamp;

    // Pega anchors
    const leftEye = this.getEyeCenter(landmarks, 'left');
    const rightEye = this.getEyeCenter(landmarks, 'right');

    if (this.sprite === 'heart' && this.anchor === 'eyes') {
      // Corações pulsando sobre os olhos
      const pulse = 1 + 0.15 * Math.sin(timestamp / 200);
      this.drawEmoji(ctx, '❤️', leftEye.x * w, leftEye.y * h, 50 * pulse);
      this.drawEmoji(ctx, '❤️', rightEye.x * w, rightEye.y * h, 50 * pulse);
    } else if (this.sprite === 'star' && this.anchor === 'around-face') {
      // 6 estrelas ao redor do rosto, rotacionando
      const forehead = landmarks[FOREHEAD];
      const chin = landmarks[CHIN];
      const leftCheek = landmarks[LEFT_CHEEK];
      const rightCheek = landmarks[RIGHT_CHEEK];
      if (forehead && chin && leftCheek && rightCheek) {
        const cx = (leftCheek.x + rightCheek.x) / 2 * w;
        const cy = (forehead.y + chin.y) / 2 * h;
        const radius = Math.hypot((leftCheek.x - rightCheek.x) * w, 0) * 1.2;
        for (let i = 0; i < 6; i++) {
          const angle = (timestamp / 1500) + (i * Math.PI * 2 / 6);
          const x = cx + Math.cos(angle) * radius;
          const y = cy + Math.sin(angle) * radius;
          const twinkle = 0.8 + 0.4 * Math.sin(timestamp / 200 + i);
          this.drawEmoji(ctx, '⭐', x, y, 36 * twinkle);
        }
      }
    } else if (this.sprite === 'glitter' && this.anchor === 'eyes') {
      // Particulas de glitter caindo dos olhos
      // Emit ~2 particulas por frame, gravidade leve
      for (const eye of [leftEye, rightEye]) {
        if (Math.random() < 0.4) {
          this.particles.push({
            x: eye.x * w + (Math.random() - 0.5) * 20,
            y: eye.y * h + 10,
            vy: 1 + Math.random() * 1.5,
            size: 14 + Math.random() * 10,
            life: 1.0,
            emoji: Math.random() < 0.5 ? '✨' : '💎',
          });
        }
      }
      // Atualiza + desenha particulas
      this.particles = this.particles.filter(p => p.life > 0);
      for (const p of this.particles) {
        p.y += p.vy * (dt / 16);
        p.vy += 0.05 * (dt / 16); // gravidade
        p.life -= 0.012 * (dt / 16);
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life);
        this.drawEmoji(ctx, p.emoji, p.x, p.y, p.size);
        ctx.restore();
      }
    }
  }

  private getEyeCenter(lm: Landmark[], side: 'left' | 'right'): Landmark {
    // Tenta refined landmark (468/473), cai pra media de outliers
    const refinedIdx = side === 'left' ? LEFT_EYE_CENTER : RIGHT_EYE_CENTER;
    if (lm[refinedIdx]) return lm[refinedIdx];
    const points = side === 'left' ? [33, 133, 159, 145] : [263, 362, 386, 374];
    const valid = points.map(i => lm[i]).filter(Boolean);
    if (!valid.length) return { x: 0.5, y: 0.5, z: 0 };
    return {
      x: valid.reduce((s, p) => s + p.x, 0) / valid.length,
      y: valid.reduce((s, p) => s + p.y, 0) / valid.length,
      z: 0,
    };
  }

  private drawEmoji(ctx: CanvasRenderingContext2D, emoji: string, x: number, y: number, size: number): void {
    ctx.save();
    ctx.font = `${size}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, x, y);
    ctx.restore();
  }

  dispose(): void { this.particles = []; }
}
