// <FilterCarouselBar /> — carrossel horizontal de filtros estilo Instagram.
//
// LAYOUT NA BOTTOM BAR:
//   Galeria | [-2][-1][BOTAO CAMERA + emoji ativo][+1][+2] | Spacer
//
// O botao da camera fica no CENTRO. O emoji do filtro ATIVO sobrepoe a
// bola branca do botao (substitui visualmente). Os 2 filtros adjacentes
// (esquerda e direita) aparecem como chips menores, indicando o que vem
// quando o user arrastar.
//
// INTERACAO (handled em StoryCamera.tsx via touch handlers globais):
//   - Tap nos chips laterais -> muda filtro pra aquele
//   - Swipe HORIZONTAL na ALTURA do botao da camera -> next/prev filtro
//     (NAO troca tab POST/STORY nem fecha a camera)
//   - Swipe FORA dessa altura -> comportamento original (troca tab, fecha)
//
// IMPLEMENTACAO: CSS `filter:` strings (brightness, contrast, saturate,
// hue-rotate, sepia, invert, blur, drop-shadow). Aplicadas no <video> da
// preview E no ctx.filter do canvas que captura/grava — assim a foto/video
// SALVOS ficam com o mesmo look que o user viu. O filtro fica "queimado"
// na midia final.

export interface CameraFilter {
  id: string;
  name: string;
  cssFilter: string;
  color: string;
  emoji: string;
}

// FILTRO NEUTRO — "sem filtro", id especial
export const FILTER_NONE: CameraFilter = {
  id: 'none',
  name: 'Normal',
  cssFilter: 'none',
  color: 'rgba(255,255,255,0.18)',
  emoji: '⚪',
};

// ─── 10 FILTROS FUN ─────────────────────────────────────────────────
export const FUN_FILTERS: CameraFilter[] = [
  {
    id: 'fun-vintage',
    name: 'Vintage',
    cssFilter: 'sepia(0.55) saturate(1.1) hue-rotate(-10deg) contrast(1.05) brightness(0.95)',
    color: '#c9a06b',
    emoji: '📼',
  },
  {
    id: 'fun-noir',
    name: 'Noir',
    cssFilter: 'grayscale(1) contrast(1.4) brightness(0.92)',
    color: '#374151',
    emoji: '🎬',
  },
  {
    id: 'fun-neon',
    name: 'Neon',
    cssFilter: 'saturate(1.8) contrast(1.25) brightness(1.05) hue-rotate(10deg)',
    color: '#ec4899',
    emoji: '🌈',
  },
  {
    id: 'fun-alien',
    name: 'Alien',
    cssFilter: 'hue-rotate(80deg) saturate(1.6) contrast(1.15)',
    color: '#22c55e',
    emoji: '👽',
  },
  {
    id: 'fun-comic',
    name: 'Comic',
    cssFilter: 'contrast(1.6) saturate(1.7) brightness(1.05)',
    color: '#f59e0b',
    emoji: '💥',
  },
  {
    id: 'fun-glitch',
    name: 'Glitch',
    cssFilter: 'hue-rotate(180deg) saturate(1.4) contrast(1.2)',
    color: '#8b5cf6',
    emoji: '🤖',
  },
  {
    id: 'fun-popart',
    name: 'Pop',
    cssFilter: 'saturate(2.2) contrast(1.3) brightness(1.08) hue-rotate(-5deg)',
    color: '#f472b6',
    emoji: '🍭',
  },
  {
    id: 'fun-dramatic',
    name: 'Drama',
    cssFilter: 'contrast(1.5) brightness(0.85) saturate(0.85)',
    color: '#1f2937',
    emoji: '🎭',
  },
  {
    id: 'fun-invert',
    name: 'Negativo',
    cssFilter: 'invert(1) hue-rotate(180deg)',
    color: '#7c3aed',
    emoji: '🌀',
  },
  {
    id: 'fun-summer',
    name: 'Verão',
    cssFilter: 'sepia(0.18) saturate(1.5) brightness(1.1) hue-rotate(-12deg)',
    color: '#fb923c',
    emoji: '🌴',
  },
];

// ─── 10 FILTROS BEAUTY ──────────────────────────────────────────────
export const BEAUTY_FILTERS: CameraFilter[] = [
  {
    id: 'beauty-glow',
    name: 'Glow',
    cssFilter: 'brightness(1.1) saturate(1.05) contrast(1.04) blur(0.3px)',
    color: '#fbbf24',
    emoji: '✨',
  },
  {
    id: 'beauty-soft',
    name: 'Suave',
    cssFilter: 'blur(0.6px) brightness(1.06) saturate(0.95) contrast(0.96)',
    color: '#fbcfe8',
    emoji: '🌸',
  },
  {
    id: 'beauty-blush',
    name: 'Blush',
    cssFilter: 'hue-rotate(-8deg) saturate(1.15) brightness(1.05) sepia(0.08)',
    color: '#f9a8d4',
    emoji: '💗',
  },
  {
    id: 'beauty-porcelain',
    name: 'Porcelana',
    cssFilter: 'brightness(1.14) saturate(0.85) contrast(0.95) blur(0.4px)',
    color: '#fef3c7',
    emoji: '🤍',
  },
  {
    id: 'beauty-bronze',
    name: 'Bronze',
    cssFilter: 'sepia(0.3) saturate(1.25) brightness(1.05) hue-rotate(-15deg)',
    color: '#d97706',
    emoji: '🌞',
  },
  {
    id: 'beauty-dewy',
    name: 'Dewy',
    cssFilter: 'brightness(1.18) saturate(1.1) contrast(1.02) blur(0.25px)',
    color: '#67e8f9',
    emoji: '💧',
  },
  {
    id: 'beauty-rosy',
    name: 'Rosé',
    cssFilter: 'hue-rotate(-15deg) saturate(1.2) brightness(1.06) sepia(0.12)',
    color: '#e879f9',
    emoji: '🌹',
  },
  {
    id: 'beauty-glamour',
    name: 'Glamour',
    cssFilter: 'brightness(1.12) contrast(1.06) sepia(0.18) saturate(1.1) blur(0.3px)',
    color: '#fde68a',
    emoji: '💄',
  },
  {
    id: 'beauty-blossom',
    name: 'Blossom',
    cssFilter: 'hue-rotate(-5deg) saturate(0.95) brightness(1.08) blur(0.4px) sepia(0.05)',
    color: '#fb7185',
    emoji: '🌷',
  },
  {
    id: 'beauty-pearl',
    name: 'Pérola',
    cssFilter: 'brightness(1.16) saturate(0.9) contrast(0.97) sepia(0.05) blur(0.35px)',
    color: '#f5d0fe',
    emoji: '🦪',
  },
];

// Ordem do carrossel — Beauty (esquerda) | None (centro) | Fun (direita).
// Carrossel comeca em NONE; user arrasta pra esquerda pra beauty, direita pra fun.
export const CAROUSEL_FILTERS: CameraFilter[] = [
  ...BEAUTY_FILTERS.slice().reverse(), // beauty-pearl primeiro, beauty-glow ultimo
  FILTER_NONE,
  ...FUN_FILTERS,
];

// Helpers pra avancar/retroceder
export function getNextFilter(currentId: string): CameraFilter {
  const idx = CAROUSEL_FILTERS.findIndex(f => f.id === currentId);
  const nextIdx = Math.min(CAROUSEL_FILTERS.length - 1, idx + 1);
  return CAROUSEL_FILTERS[nextIdx];
}
export function getPrevFilter(currentId: string): CameraFilter {
  const idx = CAROUSEL_FILTERS.findIndex(f => f.id === currentId);
  const prevIdx = Math.max(0, idx - 1);
  return CAROUSEL_FILTERS[prevIdx];
}

// ─── Componente UI ────────────────────────────────────────────────────
// Renderiza UMA LINHA horizontal com 5 slots: -2, -1, CENTER, +1, +2.
// O CENTER slot recebe `centerSlot` (o botao da camera). Os 4 chips
// laterais sao tap-aveis pra escolher aquele filtro diretamente.
//
// O slide entre filtros e animado via transform offset quando activeFilterId
// muda — efeito visual de "rolar" o carrossel.

interface Props {
  activeFilterId: string;
  onSelectFilter: (filter: CameraFilter) => void;
  hidden?: boolean;
  /** O conteudo central — geralmente o botao da camera. */
  centerSlot: React.ReactNode;
  /** Largura do slot central (= largura do botao da camera). Default 84px. */
  centerWidth?: number;
}

export function FilterCarouselBar({
  activeFilterId,
  onSelectFilter,
  hidden,
  centerSlot,
  centerWidth = 84,
}: Props) {
  if (hidden) {
    // Quando escondido (gravando, sem permissao), renderiza so o center slot.
    return <>{centerSlot}</>;
  }

  const activeIdx = Math.max(0, CAROUSEL_FILTERS.findIndex(f => f.id === activeFilterId));
  const active = CAROUSEL_FILTERS[activeIdx];

  // Pega filtros adjacentes (clamped pelos extremos do array)
  const left2 = CAROUSEL_FILTERS[activeIdx - 2];
  const left1 = CAROUSEL_FILTERS[activeIdx - 1];
  const right1 = CAROUSEL_FILTERS[activeIdx + 1];
  const right2 = CAROUSEL_FILTERS[activeIdx + 2];

  return (
    <div
      className="flex items-center justify-center gap-2"
      style={{
        width: '100%',
        // Limita o tamanho total pra ficar centrado entre galeria e o flip cam
        maxWidth: '88vw',
        // Pra coordenar o swipe global, sinalizamos visualmente que esta linha
        // e o "slot do carrossel" (handled em StoryCamera)
      }}
    >
      {/* Chip -2 (xs) */}
      <FilterChipSmall
        filter={left2}
        size="xs"
        onClick={() => left2 && onSelectFilter(left2)}
      />
      {/* Chip -1 (sm) */}
      <FilterChipSmall
        filter={left1}
        size="sm"
        onClick={() => left1 && onSelectFilter(left1)}
      />
      {/* CENTER — botao da camera. Emoji do filtro ativo sobrepoe no centro
          do botao (substitui a "bola branca"). Quando active = none, nao
          mostra emoji (mantem o visual default do botao). */}
      <div
        className="relative flex-shrink-0"
        style={{ width: centerWidth, height: centerWidth }}
      >
        {centerSlot}
        {active && active.id !== 'none' && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{
              // Slight inset pra emoji nao bater nas bordas do anel branco
              padding: 18,
            }}
          >
            <span
              style={{
                fontSize: 34,
                lineHeight: 1,
                filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.55))',
                userSelect: 'none',
              }}
              aria-hidden="true"
            >
              {active.emoji}
            </span>
          </div>
        )}
      </div>
      {/* Chip +1 (sm) */}
      <FilterChipSmall
        filter={right1}
        size="sm"
        onClick={() => right1 && onSelectFilter(right1)}
      />
      {/* Chip +2 (xs) */}
      <FilterChipSmall
        filter={right2}
        size="xs"
        onClick={() => right2 && onSelectFilter(right2)}
      />
      {/* Label do filtro ativo abaixo (so quando != none) */}
      {active && active.id !== 'none' && (
        <span
          className="absolute pointer-events-none text-[10px] font-bold uppercase tracking-wider"
          style={{
            bottom: -22,
            left: '50%',
            transform: 'translateX(-50%)',
            color: '#fff',
            textShadow: '0 1px 4px rgba(0,0,0,0.7)',
            letterSpacing: '0.08em',
            whiteSpace: 'nowrap',
          }}
        >
          {active.name}
        </span>
      )}
    </div>
  );
}

// ─── FilterChipSmall ──────────────────────────────────────────────────
// Chip lateral — circulo pequeno com emoji do filtro. Tap pra ativar.
// Renderiza espaco vazio (placeholder invisivel) quando filter e null
// (extremo do array — left2 inexistente quando activeIdx = 0).
function FilterChipSmall({
  filter,
  size,
  onClick,
}: {
  filter: CameraFilter | undefined;
  size: 'xs' | 'sm';
  onClick: () => void;
}) {
  const dim = size === 'xs' ? 28 : 40;
  if (!filter) {
    return <span className="flex-shrink-0" style={{ width: dim, height: dim }} />;
  }
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="flex-shrink-0 flex items-center justify-center active:scale-90 transition-transform"
      style={{
        width: dim,
        height: dim,
        borderRadius: '50%',
        background: filter.color,
        border: size === 'sm'
          ? '2px solid rgba(255,255,255,0.85)'
          : '1.5px solid rgba(255,255,255,0.65)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
        fontSize: size === 'sm' ? 18 : 13,
        padding: 0,
        opacity: size === 'xs' ? 0.85 : 1,
      }}
      aria-label={`Filtro ${filter.name}`}
    >
      {filter.emoji}
    </button>
  );
}
