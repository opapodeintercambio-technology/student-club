// FaceTexture — MAQUIAGEM PROCEDURAL profissional (estilo Instagram).
//
// Renderiza maquiagem realista via Canvas 2D usando:
//   - REGIOES FECHADAS dos landmarks do MediaPipe Face Mesh (468 pontos):
//     labios outer/inner, palpebra superior/inferior, sobrancelha, etc.
//   - GRADIENTES radiais e lineares (nao shapes solidos — pra parecer pele)
//   - BLEND MODES corretos:
//     * Batom: multiply (escurece a cor do labio respeitando textura)
//     * Blush: soft-light (mistura tonalidade sem cobrir)
//     * Sombra: multiply ou overlay
//     * Highlight: screen ou plus-lighter (clareia)
//     * Contorno: multiply (cria sombra natural)
//   - FEATHER nas bordas via shadowBlur ou gradient stops
//
// Cada filtro = um "look" composto por varios layers de makeup. Layers
// sao aplicados em ordem: contour → eyeshadow → eyeliner → blush →
// highlight → lipstick → brows. Ordem importa pro resultado parecer
// natural.

import type { FilterEngine, Landmark } from '../types';

// ─── LANDMARK INDICES (MediaPipe Face Mesh) ─────────────────────────
// Reference: https://github.com/google/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model_uv_visualization.png

// Labios — outer line (contorno externo dos labios)
const LIPS_OUTER = [
  61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291,
  409, 270, 269, 267, 0, 37, 39, 40, 185,
];
// Labios — inner line (linha interna, separa boca aberta de fechada)
const LIPS_INNER = [
  78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308,
  415, 310, 311, 312, 13, 82, 81, 80, 191,
];

// Olho esquerdo (do ponto de vista da camera)
const LEFT_EYE_UPPER = [33, 246, 161, 160, 159, 158, 157, 173, 133];
const LEFT_EYE_LOWER = [33, 7, 163, 144, 145, 153, 154, 155, 133];
// Palpebra superior (regiao acima do olho — pra sombra)
const LEFT_EYELID = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46, 33, 246, 161, 160, 159, 158, 157, 173, 133];
// Sobrancelha esquerda
const LEFT_BROW = [70, 63, 105, 66, 107];
const LEFT_BROW_LOWER = [55, 65, 52, 53, 46];

// Olho direito (espelhado)
const RIGHT_EYE_UPPER = [263, 466, 388, 387, 386, 385, 384, 398, 362];
const RIGHT_EYE_LOWER = [263, 249, 390, 373, 374, 380, 381, 382, 362];
const RIGHT_EYELID = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276, 263, 466, 388, 387, 386, 385, 384, 398, 362];
const RIGHT_BROW = [300, 293, 334, 296, 336];
const RIGHT_BROW_LOWER = [285, 295, 282, 283, 276];

// Bochechas — centro pra blush, mais wide pra contorno
const LEFT_CHEEK_BLUSH = 117;
const RIGHT_CHEEK_BLUSH = 346;
const LEFT_CHEEK_HIGH = 50;
const RIGHT_CHEEK_HIGH = 280;
const LEFT_CHEEK_CONTOUR = 234;
const RIGHT_CHEEK_CONTOUR = 454;

// Nariz e queixo (highlight + contorno)
const NOSE_BRIDGE = 168;
const NOSE_TIP = 1;
const FOREHEAD = 10;
const CHIN_TIP = 152;

// ─── DEFINICOES DE LOOKS ─────────────────────────────────────────────
// Cada look define uma combinacao de layers. Cores em rgba hex.

interface BrowSpec { color: string; intensity: number }
interface EyeshadowSpec { inner: string; outer: string; opacity: number }
interface EyelinerSpec { color: string; thickness: number; wing: boolean }
interface MascaraSpec { color: string }
interface BlushSpec { color: string; intensity: number; size: number }
interface LipstickSpec { color: string; gloss: boolean; opacity: number }
interface HighlightSpec { color: string; opacity: number; areas: ('cheekbone' | 'nosebridge' | 'cupidbow' | 'browbone' | 'chintip')[] }
interface ContourSpec { color: string; opacity: number }

interface MakeupLook {
  brows?: BrowSpec;
  eyeshadow?: EyeshadowSpec;
  eyeliner?: EyelinerSpec;
  mascara?: MascaraSpec;
  blush?: BlushSpec;
  lipstick?: LipstickSpec;
  highlight?: HighlightSpec;
  contour?: ContourSpec;
}

const LOOKS: Record<string, MakeupLook> = {
  // Sutil — peles natural, lips nude, blush rosado leve
  'natural': {
    brows: { color: '#5d4037', intensity: 0.3 },
    blush: { color: '#f48fb1', intensity: 0.35, size: 1.0 },
    lipstick: { color: '#c47b6f', gloss: true, opacity: 0.4 },
    highlight: { color: '#fff5d6', opacity: 0.3, areas: ['cheekbone', 'cupidbow', 'nosebridge'] },
    mascara: { color: '#1a1a1a' },
  },
  // Glam noite — vermelho dramatico + delineado pesado + sombra dourada
  'glam': {
    brows: { color: '#3e2723', intensity: 0.5 },
    eyeshadow: { inner: '#d4a574', outer: '#5d3a1a', opacity: 0.6 },
    eyeliner: { color: '#000000', thickness: 4, wing: true },
    mascara: { color: '#000000' },
    blush: { color: '#e91e63', intensity: 0.45, size: 1.1 },
    lipstick: { color: '#c41e3a', gloss: false, opacity: 0.85 },
    highlight: { color: '#ffd700', opacity: 0.5, areas: ['cheekbone', 'browbone', 'cupidbow'] },
    contour: { color: '#6d4c41', opacity: 0.35 },
  },
  // Soft pink — tons de rosa palido em tudo
  'soft-pink': {
    brows: { color: '#6d4c41', intensity: 0.3 },
    eyeshadow: { inner: '#f8bbd0', outer: '#ce93d8', opacity: 0.45 },
    eyeliner: { color: '#5d4037', thickness: 2, wing: false },
    mascara: { color: '#3e2723' },
    blush: { color: '#f06292', intensity: 0.5, size: 1.0 },
    lipstick: { color: '#ec407a', gloss: true, opacity: 0.6 },
    highlight: { color: '#fff0f6', opacity: 0.45, areas: ['cheekbone', 'cupidbow', 'nosebridge', 'browbone'] },
  },
  // Sunset — coral e laranja
  'sunset': {
    brows: { color: '#5d4037', intensity: 0.4 },
    eyeshadow: { inner: '#ffb74d', outer: '#e64a19', opacity: 0.55 },
    eyeliner: { color: '#5d4037', thickness: 2, wing: true },
    mascara: { color: '#3e2723' },
    blush: { color: '#ff7043', intensity: 0.5, size: 1.05 },
    lipstick: { color: '#e65100', gloss: true, opacity: 0.7 },
    highlight: { color: '#fff3e0', opacity: 0.45, areas: ['cheekbone', 'nosebridge', 'cupidbow'] },
  },
  // Bronze goddess — bronze, contorno acentuado
  'bronze': {
    brows: { color: '#3e2723', intensity: 0.5 },
    eyeshadow: { inner: '#bca58a', outer: '#6d4c41', opacity: 0.55 },
    eyeliner: { color: '#3e2723', thickness: 3, wing: true },
    mascara: { color: '#1a1a1a' },
    blush: { color: '#a1887f', intensity: 0.35, size: 1.1 },
    lipstick: { color: '#8d6e63', gloss: true, opacity: 0.6 },
    highlight: { color: '#ffe082', opacity: 0.55, areas: ['cheekbone', 'nosebridge', 'cupidbow', 'chintip'] },
    contour: { color: '#5d4037', opacity: 0.45 },
  },
  // Smoky eye — sombra escura + delineado preto + cílios fortes
  'smoky': {
    brows: { color: '#1a1a1a', intensity: 0.6 },
    eyeshadow: { inner: '#5d4037', outer: '#1a1a1a', opacity: 0.75 },
    eyeliner: { color: '#000000', thickness: 5, wing: true },
    mascara: { color: '#000000' },
    blush: { color: '#ec407a', intensity: 0.3, size: 1.0 },
    lipstick: { color: '#a52a2a', gloss: false, opacity: 0.7 },
    highlight: { color: '#fff8e1', opacity: 0.4, areas: ['cheekbone', 'browbone'] },
  },
};

interface FaceTextureParams {
  look?: keyof typeof LOOKS | string;
  // Compat com catalogo antigo
  texture?: string;
}

export class FaceTextureEngine implements FilterEngine {
  readonly id = 'texture' as const;
  private lookName: string = 'natural';
  private look: MakeupLook = LOOKS['natural'];

  async mount(_gl: any, params: Record<string, unknown>): Promise<void> {
    const p = params as FaceTextureParams;
    // params.look tem prioridade; compat com 'texture' do catalog antigo
    const requested = (p.look || p.texture || 'natural').replace(/\.png$/, '');
    // Mapeia nomes antigos pros novos
    const aliasMap: Record<string, string> = {
      'sardas': 'natural',
      'makeup': 'glam',
      'carnaval': 'sunset',
    };
    const key = aliasMap[requested] || requested;
    this.lookName = LOOKS[key] ? key : 'natural';
    this.look = LOOKS[this.lookName];
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

    // Aplica os layers em ordem natural (deepest first)
    if (this.look.contour) this.drawContour(ctx, landmarks, w, h, this.look.contour);
    if (this.look.eyeshadow) this.drawEyeshadow(ctx, landmarks, w, h, this.look.eyeshadow);
    if (this.look.eyeliner) this.drawEyeliner(ctx, landmarks, w, h, this.look.eyeliner);
    if (this.look.mascara) this.drawMascara(ctx, landmarks, w, h, this.look.mascara);
    if (this.look.brows) this.drawBrows(ctx, landmarks, w, h, this.look.brows);
    if (this.look.blush) this.drawBlush(ctx, landmarks, w, h, this.look.blush);
    if (this.look.highlight) this.drawHighlight(ctx, landmarks, w, h, this.look.highlight);
    if (this.look.lipstick) this.drawLipstick(ctx, landmarks, w, h, this.look.lipstick);
  }

  // ───────────── HELPERS DE PATH ─────────────────────────────────
  private pathPolygon(ctx: CanvasRenderingContext2D, indices: number[], lm: Landmark[], w: number, h: number) {
    ctx.beginPath();
    for (let i = 0; i < indices.length; i++) {
      const p = lm[indices[i]];
      if (!p) continue;
      const x = p.x * w; const y = p.y * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  // ───────────── BATOM ───────────────────────────────────────────
  private drawLipstick(ctx: CanvasRenderingContext2D, lm: Landmark[], w: number, h: number, spec: LipstickSpec) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = spec.opacity;
    // Path outer dos labios, recortando o inner (boca aberta)
    ctx.beginPath();
    LIPS_OUTER.forEach((idx, i) => {
      const p = lm[idx]; if (!p) return;
      const x = p.x * w; const y = p.y * h;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    // Subtract inner (so colore os labios externos, nao a boca)
    LIPS_INNER.slice().reverse().forEach((idx, i) => {
      const p = lm[idx]; if (!p) return;
      const x = p.x * w; const y = p.y * h;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = spec.color;
    ctx.fill('evenodd');

    // Gloss = layer de highlight no centro dos labios
    if (spec.gloss) {
      const lipsTop = lm[13]; const lipsBottom = lm[14];
      if (lipsTop && lipsBottom) {
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.35;
        const cx = ((lipsTop.x + lipsBottom.x) / 2) * w;
        const cy = ((lipsTop.y + lipsBottom.y) / 2) * h;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.04);
        grad.addColorStop(0, 'rgba(255,255,255,0.7)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(cx - w * 0.06, cy - w * 0.03, w * 0.12, w * 0.06);
      }
    }
    ctx.restore();
  }

  // ───────────── BLUSH ──────────────────────────────────────────
  private drawBlush(ctx: CanvasRenderingContext2D, lm: Landmark[], w: number, h: number, spec: BlushSpec) {
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = spec.intensity;
    const r = w * 0.06 * spec.size;
    for (const cheekIdx of [LEFT_CHEEK_BLUSH, RIGHT_CHEEK_BLUSH]) {
      const p = lm[cheekIdx]; if (!p) continue;
      const cx = p.x * w; const cy = p.y * h;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, spec.color);
      grad.addColorStop(0.6, this.hexWithAlpha(spec.color, 0.4));
      grad.addColorStop(1, this.hexWithAlpha(spec.color, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ───────────── SOMBRA ─────────────────────────────────────────
  private drawEyeshadow(ctx: CanvasRenderingContext2D, lm: Landmark[], w: number, h: number, spec: EyeshadowSpec) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = spec.opacity;
    for (const indices of [LEFT_EYELID, RIGHT_EYELID]) {
      const pts = indices.map(i => lm[i]).filter(Boolean);
      if (pts.length < 4) continue;
      // Calcula centro da palpebra pra gradient
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length * w;
      const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length * h;
      const r = w * 0.05;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, spec.inner);
      grad.addColorStop(1, spec.outer);
      ctx.fillStyle = grad;
      this.pathPolygon(ctx, indices, lm, w, h);
      ctx.fill();
    }
    ctx.restore();
  }

  // ───────────── DELINEADO ──────────────────────────────────────
  private drawEyeliner(ctx: CanvasRenderingContext2D, lm: Landmark[], w: number, h: number, spec: EyelinerSpec) {
    ctx.save();
    ctx.strokeStyle = spec.color;
    ctx.lineWidth = spec.thickness;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const upper of [LEFT_EYE_UPPER, RIGHT_EYE_UPPER]) {
      const pts = upper.map(i => lm[i]).filter(Boolean);
      if (pts.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(pts[0].x * w, pts[0].y * h);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * w, pts[i].y * h);
      // Wing — pequeno gancho pra fora
      if (spec.wing) {
        const last = pts[pts.length - 1];
        const prev = pts[pts.length - 2];
        const dx = (last.x - prev.x) * w;
        const dy = (last.y - prev.y) * h;
        const ang = Math.atan2(dy, dx);
        const wlen = w * 0.025;
        ctx.lineTo(last.x * w + Math.cos(ang - 0.3) * wlen, last.y * h + Math.sin(ang - 0.3) * wlen);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // ───────────── CILIOS ─────────────────────────────────────────
  private drawMascara(ctx: CanvasRenderingContext2D, lm: Landmark[], w: number, h: number, spec: MascaraSpec) {
    ctx.save();
    ctx.strokeStyle = spec.color;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    // Pequenos traços perpendiculares aos olhos = cílios
    for (const upper of [LEFT_EYE_UPPER, RIGHT_EYE_UPPER]) {
      for (let i = 1; i < upper.length - 1; i++) {
        const p = lm[upper[i]];
        const prev = lm[upper[i - 1]];
        if (!p || !prev) continue;
        const dx = (p.x - prev.x) * w;
        const dy = (p.y - prev.y) * h;
        const ang = Math.atan2(dy, dx) - Math.PI / 2;
        const len = w * 0.01 + Math.random() * w * 0.005;
        const x = p.x * w;
        const y = p.y * h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // ───────────── SOBRANCELHA ────────────────────────────────────
  private drawBrows(ctx: CanvasRenderingContext2D, lm: Landmark[], w: number, h: number, spec: BrowSpec) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = spec.intensity;
    ctx.fillStyle = spec.color;
    for (const [upper, lower] of [[LEFT_BROW, LEFT_BROW_LOWER], [RIGHT_BROW, RIGHT_BROW_LOWER]] as const) {
      ctx.beginPath();
      upper.forEach((idx, i) => {
        const p = lm[idx]; if (!p) return;
        if (i === 0) ctx.moveTo(p.x * w, p.y * h);
        else ctx.lineTo(p.x * w, p.y * h);
      });
      lower.slice().reverse().forEach((idx, _i) => {
        const p = lm[idx]; if (!p) return;
        ctx.lineTo(p.x * w, p.y * h);
      });
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // ───────────── HIGHLIGHT ──────────────────────────────────────
  private drawHighlight(ctx: CanvasRenderingContext2D, lm: Landmark[], w: number, h: number, spec: HighlightSpec) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = spec.opacity;
    const spots: Array<{ idx: number; size: number }> = [];
    if (spec.areas.includes('cheekbone')) {
      spots.push({ idx: LEFT_CHEEK_HIGH, size: 0.045 });
      spots.push({ idx: RIGHT_CHEEK_HIGH, size: 0.045 });
    }
    if (spec.areas.includes('nosebridge')) {
      spots.push({ idx: NOSE_BRIDGE, size: 0.025 });
      spots.push({ idx: NOSE_TIP, size: 0.02 });
    }
    if (spec.areas.includes('cupidbow')) {
      spots.push({ idx: 0, size: 0.022 }); // ponto entre nariz e labio
    }
    if (spec.areas.includes('browbone')) {
      spots.push({ idx: 105, size: 0.025 });
      spots.push({ idx: 334, size: 0.025 });
    }
    if (spec.areas.includes('chintip')) {
      spots.push({ idx: CHIN_TIP, size: 0.025 });
    }
    for (const spot of spots) {
      const p = lm[spot.idx]; if (!p) continue;
      const cx = p.x * w; const cy = p.y * h;
      const r = w * spot.size;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, spec.color);
      grad.addColorStop(0.7, this.hexWithAlpha(spec.color, 0.3));
      grad.addColorStop(1, this.hexWithAlpha(spec.color, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ───────────── CONTORNO ───────────────────────────────────────
  private drawContour(ctx: CanvasRenderingContext2D, lm: Landmark[], w: number, h: number, spec: ContourSpec) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = spec.opacity;
    for (const idx of [LEFT_CHEEK_CONTOUR, RIGHT_CHEEK_CONTOUR, FOREHEAD]) {
      const p = lm[idx]; if (!p) continue;
      const cx = p.x * w; const cy = p.y * h;
      const r = w * 0.045;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, spec.color);
      grad.addColorStop(0.5, this.hexWithAlpha(spec.color, 0.4));
      grad.addColorStop(1, this.hexWithAlpha(spec.color, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Helper: aplica alpha em cor hex
  private hexWithAlpha(hex: string, alpha: number): string {
    const m = hex.match(/^#([0-9a-f]{6})$/i);
    if (!m) return hex;
    const r = parseInt(m[1].slice(0, 2), 16);
    const g = parseInt(m[1].slice(2, 4), 16);
    const b = parseInt(m[1].slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  dispose(): void { /* sem GPU resources */ }
}
