// Tipos e helpers das CAMADAS (sobreposicoes interativas) de um story.
//
// Decisao tecnica: Opcao B — midia fica como esta (foto/video original),
// e as sobreposicoes ficam SEPARADAS em JSON. O viewer renderiza as
// camadas em runtime por cima da midia. Isso mantem mencoes/hashtags/
// enquetes INTERATIVAS quando o story eh visualizado.
//
// Coordenadas: todas as posicoes (x, y) sao NORMALIZADAS pelo tamanho
// da midia (0 a 1) — assim funcionam em qualquer tela/resolucao quando
// o viewer for renderizar. scale eh multiplicador (1 = tamanho base);
// rotation eh em radianos.

export type StoryFontStyle =
  | 'classic' | 'modern' | 'typewriter' | 'handwritten' | 'strong'
  | 'elegant' | 'script' | 'comic' | 'soft' | 'tech' | 'retro';
export type StoryTextBg = 'none' | 'solid' | 'translucent';
export type StoryTextAlign = 'left' | 'center' | 'right';

interface BaseLayer {
  id: string;
  /** Posicao do CENTRO da camada (0 a 1, relativo a midia). */
  x: number;
  y: number;
  /** Multiplicador de escala (1 = tamanho base). */
  scale: number;
  /** Rotacao em radianos. */
  rotation: number;
}

/** Posicao FIXA da legenda no story. Decisao de produto (Jobs):
 *  em vez de drag livre (que quebrava no iOS PWA por causa de pinch/
 *  palm-rejection), legenda fica em 1 de 3 zonas pre-definidas.
 *  Botao "girar zona" cicla topo -> meio -> base -> topo. */
export type StoryTextZone = 'top' | 'middle' | 'bottom';

export interface TextLayer extends BaseLayer {
  type: 'text';
  text: string;
  fontStyle: StoryFontStyle;
  color: string;
  background: StoryTextBg;
  /** Cor do fundo da caixa (so usado quando background !== 'none'). */
  backgroundColor: string;
  align: StoryTextAlign;
  /** Tamanho base da fonte em px (referencia: largura da midia = 1080). */
  fontSize: number;
  /** Zona vertical pre-definida (default 'bottom' = comportamento atual). */
  zone?: StoryTextZone;
}

export interface StickerLayer extends BaseLayer {
  type: 'sticker';
  emoji: string;
  /** Tamanho base em px (referencia: largura da midia = 1080). */
  size: number;
}

export interface MentionLayer extends BaseLayer {
  type: 'mention';
  username: string;
  color: string;
  fontStyle: StoryFontStyle;
  background: StoryTextBg;
  backgroundColor: string;
  fontSize: number;
}

export interface HashtagLayer extends BaseLayer {
  type: 'hashtag';
  tag: string;
  color: string;
  fontStyle: StoryFontStyle;
  background: StoryTextBg;
  backgroundColor: string;
  fontSize: number;
}

export interface TimeLayer extends BaseLayer {
  type: 'time';
  /** ISO timestamp congelado no momento da criacao do sticker. */
  capturedAt: string;
  color: string;
  background: StoryTextBg;
  backgroundColor: string;
  fontSize: number;
}

export type StoryLayer = TextLayer | StickerLayer | MentionLayer | HashtagLayer | TimeLayer;

/** Familia de fonte CSS por estilo. Os 5 principais (classic, modern,
 *  typewriter, handwritten, strong) seguem o padrao Instagram com Inter/
 *  Oswald/JetBrains Mono/Caveat/Anton. Os 6 extras sao variacoes opcionais. */
export const FONT_FAMILIES: Record<StoryFontStyle, string> = {
  classic: '"Inter", system-ui, sans-serif',
  modern: '"Oswald", "Inter", sans-serif',
  typewriter: '"JetBrains Mono", Menlo, monospace',
  handwritten: '"Caveat", "Indie Flower", cursive',
  strong: '"Anton", "Bebas Neue", sans-serif',
  elegant: '"Playfair Display", Georgia, serif',
  script: '"Dancing Script", cursive',
  comic: '"Comic Sans MS", "Comic Sans", cursive',
  soft: '"Quicksand", "Manrope", sans-serif',
  tech: '"Share Tech Mono", monospace',
  retro: '"Press Start 2P", "Share Tech Mono", monospace',
};

export const FONT_LABELS: Record<StoryFontStyle, string> = {
  classic: 'Clássico',
  modern: 'Moderno',
  typewriter: 'Datilografado',
  handwritten: 'Manuscrito',
  strong: 'Forte',
  elegant: 'Elegante',
  script: 'Cursiva',
  comic: 'Comic',
  soft: 'Suave',
  tech: 'Tech',
  retro: 'Retro',
};

/** Paleta de cores pro texto / fundo das camadas. Inclui o brand verde
 *  como destaque (cor de mencao default — igual a do app). */
export const STORY_COLORS = [
  '#ffffff', '#000000',
  '#1e714a', '#4ade80', // brand
  '#f43f5e', '#ec4899', '#a855f7', '#3b82f6',
  '#0ea5e9', '#22d3ee', '#10b981', '#84cc16',
  '#eab308', '#f59e0b', '#f97316', '#ef4444',
  '#78716c', '#a8a29e',
];

/** Cor padrao usada quando uma mencao eh inserida — combina com o brand
 *  verde do app pra dar destaque consistente com o resto da UI. */
export const MENTION_COLOR = '#4ade80';

/** Auto-contraste pro texto quando fundo eh solido. Retorna '#000' ou
 *  '#ffffff' baseado em luminancia YIQ do background. Suporta #hex e
 *  rgba(...). Usado pra garantir legibilidade quando o user escolhe um
 *  fundo solido pra legenda. */
export function autoContrastTextColor(hex: string): string {
  let r = 0, g = 0, b = 0;
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) {
    const m = hex.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const parts = m[1].split(',').map(s => parseFloat(s.trim()));
      [r, g, b] = parts as [number, number, number];
    }
  } else {
    const h = hex.replace('#', '');
    const v = h.length === 3
      ? h.split('').map(c => parseInt(c + c, 16))
      : [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    [r, g, b] = v as [number, number, number];
  }
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? '#000000' : '#ffffff';
}

/** CSS extras especificos por estilo (text-shadow no "strong", letter-
 *  spacing no "modern"). Aplicado em editor + viewer pra consistencia. */
export function fontStyleExtras(s: StoryFontStyle): { textShadow?: string; letterSpacing?: string } {
  if (s === 'strong') {
    return {
      textShadow: '0 2px 6px rgba(0,0,0,0.65), 0 0 14px rgba(0,0,0,0.45)',
      letterSpacing: '0.04em',
    };
  }
  if (s === 'modern') {
    return { letterSpacing: '0.03em' };
  }
  return {};
}

/** Cria um TextLayer novo com defaults sensatos. */
export function newTextLayer(text: string, opts: Partial<TextLayer> = {}): TextLayer {
  return {
    id: 'l_' + Math.random().toString(36).slice(2, 10),
    type: 'text',
    text,
    x: 0.5,
    y: 0.5,
    scale: 1,
    rotation: 0,
    fontStyle: 'classic',
    color: '#ffffff',
    background: 'none',
    backgroundColor: '#000000',
    align: 'center',
    fontSize: 48,
    zone: 'bottom',
    ...opts,
  };
}

/** Cicla zona topo -> meio -> base -> topo. Usado pelo botao "girar zona". */
export function nextTextZone(z: StoryTextZone | undefined): StoryTextZone {
  if (z === 'top') return 'middle';
  if (z === 'middle') return 'bottom';
  return 'top';
}

export function newStickerLayer(emoji: string, opts: Partial<StickerLayer> = {}): StickerLayer {
  return {
    id: 'l_' + Math.random().toString(36).slice(2, 10),
    type: 'sticker',
    emoji,
    x: 0.5,
    y: 0.5,
    scale: 1,
    rotation: 0,
    size: 120,
    ...opts,
  };
}

export function newMentionLayer(username: string, opts: Partial<MentionLayer> = {}): MentionLayer {
  return {
    id: 'l_' + Math.random().toString(36).slice(2, 10),
    type: 'mention',
    username,
    x: 0.5,
    y: 0.5,
    scale: 1,
    rotation: 0,
    color: MENTION_COLOR,
    fontStyle: 'classic',
    background: 'solid',
    backgroundColor: 'rgba(0,0,0,0.55)',
    fontSize: 42,
    ...opts,
  };
}

export function newHashtagLayer(tag: string, opts: Partial<HashtagLayer> = {}): HashtagLayer {
  return {
    id: 'l_' + Math.random().toString(36).slice(2, 10),
    type: 'hashtag',
    tag,
    x: 0.5,
    y: 0.5,
    scale: 1,
    rotation: 0,
    color: '#ffffff',
    fontStyle: 'classic',
    background: 'solid',
    backgroundColor: 'rgba(0,0,0,0.55)',
    fontSize: 42,
    ...opts,
  };
}

export function newTimeLayer(): TimeLayer {
  return {
    id: 'l_' + Math.random().toString(36).slice(2, 10),
    type: 'time',
    capturedAt: new Date().toISOString(),
    x: 0.5,
    y: 0.25,
    scale: 1,
    rotation: 0,
    color: '#ffffff',
    background: 'translucent',
    backgroundColor: 'rgba(0,0,0,0.45)',
    fontSize: 48,
  };
}

/** Formata o horario congelado do TimeLayer pra exibir (HH:mm). */
export function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

/** Extrai todos os usernames mencionados nas camadas de texto/mencao.
 *  Usado pra:
 *   1) gravar em stories_demo.mentions (notif pros mencionados)
 *   2) renderizar no viewer como chips clicaveis abaixo do conteudo */
export function extractMentions(layers: StoryLayer[] | undefined): string[] {
  if (!layers) return [];
  const set = new Set<string>();
  for (const l of layers) {
    if (l.type === 'mention') set.add(l.username);
    if (l.type === 'text') {
      // Tambem captura @user que o usuario digitou inline no texto
      const matches = l.text.match(/@([a-zA-Z0-9_.]+)/g);
      if (matches) for (const m of matches) set.add(m.slice(1));
    }
  }
  return Array.from(set);
}

/** Extrai hashtags das camadas (similar a extractMentions). */
export function extractHashtags(layers: StoryLayer[] | undefined): string[] {
  if (!layers) return [];
  const set = new Set<string>();
  for (const l of layers) {
    if (l.type === 'hashtag') set.add(l.tag);
    if (l.type === 'text') {
      const matches = l.text.match(/#([a-zA-Z0-9_]+)/g);
      if (matches) for (const m of matches) set.add(m.slice(1));
    }
  }
  return Array.from(set);
}
