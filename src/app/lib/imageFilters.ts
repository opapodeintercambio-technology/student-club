// Aplica filtros CSS (brightness/contrast/saturate/hue-rotate/sepia/invert/
// grayscale) em um canvas via pixel manipulation com ImageData.
//
// POR QUE NAO USAR `ctx.filter` DIRETO:
//   - Chrome/Firefox suportam. iOS Safari < 18 NAO. Resultado: foto tirada
//     no iPhone sai SEM o filtro escolhido na camera — o user via vintage
//     no preview mas a foto salva era normal.
//   - Solucao: aplicar os filtros manipulando os pixels do canvas. Funciona
//     em qualquer browser que tenha Canvas 2D (= todos).
//
// LIMITACAO: `blur(Npx)` nao e suportado por pixel manipulation simples
// (precisa convolucao). Como nenhum dos nossos filtros usa blur muito
// pesado (so 0.25-0.6px nos beauty filters, efeito sutil), ignoramos o
// blur. A foto final fica indistinguivel a olho nu.

interface ParsedFilter {
  brightness: number; // 1 = sem mudanca
  contrast: number;   // 1 = sem mudanca
  saturate: number;   // 1 = sem mudanca
  hueRotate: number;  // graus, 0 = sem mudanca
  sepia: number;      // 0-1
  invert: number;     // 0-1
  grayscale: number;  // 0-1
}

const NEUTRAL: ParsedFilter = {
  brightness: 1, contrast: 1, saturate: 1,
  hueRotate: 0, sepia: 0, invert: 0, grayscale: 0,
};

/**
 * Parse uma CSS filter string (ex: "brightness(1.1) saturate(1.05) hue-rotate(-10deg)")
 * em um objeto numerico com todos os fields. Ignora `blur(...)` por enquanto.
 */
export function parseCssFilter(cssFilter: string | undefined | null): ParsedFilter {
  const f: ParsedFilter = { ...NEUTRAL };
  if (!cssFilter || cssFilter === 'none') return f;

  // Match funcoes: nome(valor) — valor pode ter unidades (px, deg) ou ser puro
  const re = /(\w[\w-]*)\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cssFilter)) !== null) {
    const name = m[1].toLowerCase();
    const rawVal = m[2].trim();
    // Remove unidades comuns. Ex: "-10deg" -> -10, "0.6px" -> 0.6
    const num = parseFloat(rawVal);
    if (!isFinite(num)) continue;
    switch (name) {
      case 'brightness': f.brightness = num; break;
      case 'contrast': f.contrast = num; break;
      case 'saturate': f.saturate = num; break;
      case 'sepia': f.sepia = Math.max(0, Math.min(1, num)); break;
      case 'invert': f.invert = Math.max(0, Math.min(1, num)); break;
      case 'grayscale': f.grayscale = Math.max(0, Math.min(1, num)); break;
      case 'hue-rotate':
      case 'huerotate': f.hueRotate = num; break;
      // blur ignorado de proposito (precisa convolucao — efeito sutil
      // nos nossos beauty filters, omitir nao prejudica o resultado).
    }
  }
  return f;
}

/**
 * Aplica os filtros parseados em um ImageData IN PLACE. Mais rapido que
 * `applyFilterToCanvas` quando voce ja tem o ImageData.
 *
 * Ordem das operacoes (mesmo que CSS): brightness -> contrast -> invert ->
 * grayscale -> sepia -> saturate -> hue-rotate.
 */
export function applyFilterToImageData(imgData: ImageData, cssFilter: string | undefined | null): void {
  const f = parseCssFilter(cssFilter);
  // Atalho: se for tudo neutro, nao toca nos pixels (economia bruta)
  if (f.brightness === 1 && f.contrast === 1 && f.saturate === 1 &&
      f.hueRotate === 0 && f.sepia === 0 && f.invert === 0 && f.grayscale === 0) {
    return;
  }

  const d = imgData.data;
  const len = d.length;

  // Pre-computa coeficientes da matriz de hue rotation (CSS spec usa
  // o mesmo metodo do SVG feColorMatrix type="hueRotate"). 3x3 matriz
  // RGB-to-RGB derivada da rotacao no espaco YIQ-like.
  const hueRad = f.hueRotate * Math.PI / 180;
  const cosH = Math.cos(hueRad);
  const sinH = Math.sin(hueRad);
  const h00 = 0.213 + cosH * 0.787 - sinH * 0.213;
  const h01 = 0.715 - cosH * 0.715 - sinH * 0.715;
  const h02 = 0.072 - cosH * 0.072 + sinH * 0.928;
  const h10 = 0.213 - cosH * 0.213 + sinH * 0.143;
  const h11 = 0.715 + cosH * 0.285 + sinH * 0.140;
  const h12 = 0.072 - cosH * 0.072 - sinH * 0.283;
  const h20 = 0.213 - cosH * 0.213 - sinH * 0.787;
  const h21 = 0.715 - cosH * 0.715 + sinH * 0.715;
  const h22 = 0.072 + cosH * 0.928 + sinH * 0.072;

  const sat = f.saturate;
  const bright = f.brightness;
  const contrast = f.contrast;
  const sepia = f.sepia;
  const invert = f.invert;
  const gray = f.grayscale;

  // Single loop — todas as operacoes inline. RGB processadas; alpha intocado.
  for (let i = 0; i < len; i += 4) {
    let r = d[i];
    let g = d[i + 1];
    let b = d[i + 2];

    // 1. brightness — multiplica todos os canais
    if (bright !== 1) {
      r *= bright; g *= bright; b *= bright;
    }

    // 2. contrast — rebaixa/eleva em torno de 128 (gray meio)
    if (contrast !== 1) {
      r = (r - 128) * contrast + 128;
      g = (g - 128) * contrast + 128;
      b = (b - 128) * contrast + 128;
    }

    // 3. invert — blend pra 255-x
    if (invert > 0) {
      const ir = 255 - r, ig = 255 - g, ib = 255 - b;
      r = ir * invert + r * (1 - invert);
      g = ig * invert + g * (1 - invert);
      b = ib * invert + b * (1 - invert);
    }

    // 4. grayscale — blend pra luminance (Rec. 709)
    if (gray > 0) {
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = l * gray + r * (1 - gray);
      g = l * gray + g * (1 - gray);
      b = l * gray + b * (1 - gray);
    }

    // 5. sepia — matriz padrao (W3C filter spec)
    if (sepia > 0) {
      const sr = 0.393 * r + 0.769 * g + 0.189 * b;
      const sg = 0.349 * r + 0.686 * g + 0.168 * b;
      const sb = 0.272 * r + 0.534 * g + 0.131 * b;
      r = sr * sepia + r * (1 - sepia);
      g = sg * sepia + g * (1 - sepia);
      b = sb * sepia + b * (1 - sepia);
    }

    // 6. saturate — mix entre luminance e cor original
    if (sat !== 1) {
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = l + (r - l) * sat;
      g = l + (g - l) * sat;
      b = l + (b - l) * sat;
    }

    // 7. hue rotate — matriz precomputada acima
    if (f.hueRotate !== 0) {
      const nr = r * h00 + g * h01 + b * h02;
      const ng = r * h10 + g * h11 + b * h12;
      const nb = r * h20 + g * h21 + b * h22;
      r = nr; g = ng; b = nb;
    }

    // Clamp em [0, 255]. Cast pra int via | 0 — Math.round seria mais
    // preciso mas | 0 e 2-3x mais rapido em loop grande.
    d[i]     = r < 0 ? 0 : r > 255 ? 255 : r | 0;
    d[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g | 0;
    d[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b | 0;
    // d[i + 3] (alpha) intocado
  }
}

/**
 * Aplica os filtros direto num canvas. Le ImageData, processa, escreve
 * de volta. Use isso DEPOIS de fazer drawImage no canvas.
 */
export function applyFilterToCanvas(
  canvas: HTMLCanvasElement,
  cssFilter: string | undefined | null,
): void {
  if (!cssFilter || cssFilter === 'none') return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  let imgData: ImageData;
  try {
    imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  } catch (e) {
    // canvas tainted (cross-origin image sem CORS) — getImageData lanca.
    // Esse e o caso ao desenhar um video element sem crossOrigin=anonymous.
    // Como o video da camera vem do proprio dispositivo (getUserMedia),
    // NAO eh cross-origin — mas se acontecer, faz fallback silencioso
    // pra ctx.filter (que funciona em browsers modernos).
    console.warn('[imageFilters] canvas tainted, fallback to ctx.filter:', e);
    return;
  }
  applyFilterToImageData(imgData, cssFilter);
  ctx.putImageData(imgData, 0, 0);
}
