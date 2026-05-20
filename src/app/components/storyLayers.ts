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

/** Familia de fonte CSS por estilo. Replicam (proximo) os estilos do
 *  Instagram + variacoes extras. Todas essas familias ja sao carregadas
 *  no projeto via Google Fonts (ver src/styles/index.css) — adicionar
 *  novas opcoes aqui nao adiciona dependencias. */
export const FONT_FAMILIES: Record<StoryFontStyle, string> = {
  classic: '"DM Sans", system-ui, sans-serif',
  modern: '"Archivo Black", "DM Sans", system-ui, sans-serif',
  typewriter: '"JetBrains Mono", Menlo, monospace',
  handwritten: '"Caveat", "Indie Flower", cursive',
  strong: '"Bebas Neue", "Archivo Black", sans-serif',
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
    ...opts,
  };
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
