// <StoryCameraFilters /> — 20 filtros estilo Instagram pra StoryCamera.
//
// 10 FUN (esquerda) e 10 BEAUTY (direita). Renderizados como dois rails
// verticais nas bordas laterais do viewfinder. Cada chip = nome curto + cor.
//
// IMPLEMENTACAO: CSS `filter:` strings (brightness, contrast, saturate,
// hue-rotate, sepia, invert, blur, drop-shadow). Aplicadas no <video> da
// preview E no ctx.filter do canvas que captura a foto/video — assim a
// foto SALVA fica com o mesmo look que o user viu.
//
// LIMITACAO: filtros sao CSS-only, NAO usam face detection. "Beauty" simula
// com brilho + saturate + leve blur (efeito "glow"), nao aplica maquiagem
// localizada. Pra maquiagem REAL precisariamos de TensorFlow/MediaPipe com
// landmarks faciais — fora do scope.
//
// Cada filtro tem:
//   - id: string unico
//   - name: label curto (max 7 chars pro chip)
//   - cssFilter: string que vai pro `filter:` CSS
//   - color: cor do badge do chip (so visual)
//   - emoji: icone visual

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
  emoji: '✨',
};

// ─── 10 FILTROS FUN (esquerda) ────────────────────────────────────────
// Efeitos chamativos, divertidos, distorcendo cores/tonalidades.
export const FUN_FILTERS: CameraFilter[] = [
  {
    id: 'fun-vintage',
    name: 'Vintage',
    // Sepia + leve dessat + warmth (hue pra amarelo)
    cssFilter: 'sepia(0.55) saturate(1.1) hue-rotate(-10deg) contrast(1.05) brightness(0.95)',
    color: '#c9a06b',
    emoji: '📼',
  },
  {
    id: 'fun-noir',
    name: 'Noir',
    // P&B duro estilo filme noir
    cssFilter: 'grayscale(1) contrast(1.4) brightness(0.92)',
    color: '#374151',
    emoji: '🎬',
  },
  {
    id: 'fun-neon',
    name: 'Neon',
    // Cores saturadas + contraste forte + leve hue shift cyber
    cssFilter: 'saturate(1.8) contrast(1.25) brightness(1.05) hue-rotate(10deg)',
    color: '#ec4899',
    emoji: '🌈',
  },
  {
    id: 'fun-alien',
    name: 'Alien',
    // Hue rotate verde pra simular alienigena
    cssFilter: 'hue-rotate(80deg) saturate(1.6) contrast(1.15)',
    color: '#22c55e',
    emoji: '👽',
  },
  {
    id: 'fun-comic',
    name: 'Comic',
    // Contrast pesado + saturate alto (estilo HQ)
    cssFilter: 'contrast(1.6) saturate(1.7) brightness(1.05)',
    color: '#f59e0b',
    emoji: '💥',
  },
  {
    id: 'fun-glitch',
    name: 'Glitch',
    // Hue rotate alto + invert leve = vibe cyberpunk
    cssFilter: 'hue-rotate(180deg) saturate(1.4) contrast(1.2)',
    color: '#8b5cf6',
    emoji: '🤖',
  },
  {
    id: 'fun-popart',
    name: 'Pop',
    // Cores brilhantes maxi (estilo Warhol)
    cssFilter: 'saturate(2.2) contrast(1.3) brightness(1.08) hue-rotate(-5deg)',
    color: '#f472b6',
    emoji: '🍭',
  },
  {
    id: 'fun-dramatic',
    name: 'Drama',
    // Contraste muito alto, leve dessat
    cssFilter: 'contrast(1.5) brightness(0.85) saturate(0.85)',
    color: '#1f2937',
    emoji: '🎭',
  },
  {
    id: 'fun-invert',
    name: 'Negativo',
    // Negativo total estilo raio-X / arte
    cssFilter: 'invert(1) hue-rotate(180deg)',
    color: '#7c3aed',
    emoji: '🌀',
  },
  {
    id: 'fun-summer',
    name: 'Verão',
    // Warmth maxima + saturate alto (vibe praia)
    cssFilter: 'sepia(0.18) saturate(1.5) brightness(1.1) hue-rotate(-12deg)',
    color: '#fb923c',
    emoji: '🌴',
  },
];

// ─── 10 FILTROS BEAUTY (direita) ──────────────────────────────────────
// Suavizam pele, dao brilho, glow — simulando efeito de maquiagem/beauty.
// Sao MAIS sutis que os fun (nao distorcem cor da pele).
export const BEAUTY_FILTERS: CameraFilter[] = [
  {
    id: 'beauty-glow',
    name: 'Glow',
    // Brilho suave + leve saturate + blur minimo pra "luz"
    cssFilter: 'brightness(1.1) saturate(1.05) contrast(1.04) blur(0.3px)',
    color: '#fbbf24',
    emoji: '✨',
  },
  {
    id: 'beauty-soft',
    name: 'Suave',
    // Soft focus suave (pele "polida")
    cssFilter: 'blur(0.6px) brightness(1.06) saturate(0.95) contrast(0.96)',
    color: '#fbcfe8',
    emoji: '🌸',
  },
  {
    id: 'beauty-blush',
    name: 'Blush',
    // Rosado quentinho (hue pra rosa) — efeito blush natural
    cssFilter: 'hue-rotate(-8deg) saturate(1.15) brightness(1.05) sepia(0.08)',
    color: '#f9a8d4',
    emoji: '💗',
  },
  {
    id: 'beauty-porcelain',
    name: 'Porcel.',
    // Pele clarinha estilo porcelana — brightness alto + low sat
    cssFilter: 'brightness(1.14) saturate(0.85) contrast(0.95) blur(0.4px)',
    color: '#fef3c7',
    emoji: '🤍',
  },
  {
    id: 'beauty-bronze',
    name: 'Bronze',
    // Tom dourado/bronzeado — sepia + warmth
    cssFilter: 'sepia(0.3) saturate(1.25) brightness(1.05) hue-rotate(-15deg)',
    color: '#d97706',
    emoji: '🌞',
  },
  {
    id: 'beauty-dewy',
    name: 'Dewy',
    // Brilho luminoso + saturate (pele molhada, fresca)
    cssFilter: 'brightness(1.18) saturate(1.1) contrast(1.02) blur(0.25px)',
    color: '#67e8f9',
    emoji: '💧',
  },
  {
    id: 'beauty-rosy',
    name: 'Rosé',
    // Mais rosa que blush, hue forte
    cssFilter: 'hue-rotate(-15deg) saturate(1.2) brightness(1.06) sepia(0.12)',
    color: '#e879f9',
    emoji: '🌹',
  },
  {
    id: 'beauty-glamour',
    name: 'Glamour',
    // Hollywood glow — brightness alto + contraste suave + sepia leve
    cssFilter: 'brightness(1.12) contrast(1.06) sepia(0.18) saturate(1.1) blur(0.3px)',
    color: '#fde68a',
    emoji: '💄',
  },
  {
    id: 'beauty-blossom',
    name: 'Blossom',
    // Floral suave — saturate baixo + hue rosa
    cssFilter: 'hue-rotate(-5deg) saturate(0.95) brightness(1.08) blur(0.4px) sepia(0.05)',
    color: '#fb7185',
    emoji: '🌷',
  },
  {
    id: 'beauty-pearl',
    name: 'Pérola',
    // Pele branca brilhante (efeito pérola/sephora)
    cssFilter: 'brightness(1.16) saturate(0.9) contrast(0.97) sepia(0.05) blur(0.35px)',
    color: '#f5d0fe',
    emoji: '🦪',
  },
];

// Cria array completo dos 21 filtros (none + 10 fun + 10 beauty)
export const ALL_CAMERA_FILTERS: CameraFilter[] = [FILTER_NONE, ...FUN_FILTERS, ...BEAUTY_FILTERS];

// ─── Componente UI ────────────────────────────────────────────────────
// 2 rails verticais nas laterais do viewfinder.
//   - Esquerda: 10 fun filters
//   - Direita: 10 beauty filters
// Cada chip eh um botao circular com emoji + nome curto. O ativo fica
// destacado (anel branco + scale 1.1).
//
// Props:
//   activeFilterId — qual filtro esta ativo
//   onSelectFilter — callback ao tocar num chip
//   hidden — quando true, oculta tudo (durante gravacao por ex)

interface Props {
  activeFilterId: string;
  onSelectFilter: (filter: CameraFilter) => void;
  hidden?: boolean;
}

export function StoryCameraFilters({ activeFilterId, onSelectFilter, hidden }: Props) {
  if (hidden) return null;

  return (
    <>
      {/* Botao Normal (centro inferior, acima da bottom bar) — pra resetar */}
      {activeFilterId !== 'none' && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSelectFilter(FILTER_NONE); }}
          className="absolute left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-full text-xs font-bold active:scale-95 transition-transform"
          style={{
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 175px)',
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(8px)',
            color: '#fff',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          }}
        >
          ✕ Remover filtro
        </button>
      )}

      {/* Rail ESQUERDO — filtros FUN */}
      <FilterRail
        side="left"
        filters={FUN_FILTERS}
        activeFilterId={activeFilterId}
        onSelectFilter={onSelectFilter}
        label="DIVERSÃO"
      />

      {/* Rail DIREITO — filtros BEAUTY */}
      <FilterRail
        side="right"
        filters={BEAUTY_FILTERS}
        activeFilterId={activeFilterId}
        onSelectFilter={onSelectFilter}
        label="BEAUTY"
      />
    </>
  );
}

// ─── FilterRail ───────────────────────────────────────────────────────
// Coluna vertical de chips em um dos lados. Scroll vertical interno se
// nao couberem todos na tela (10 chips x ~52px cada = 520px — pode ficar
// apertado em telas pequenas).
function FilterRail({
  side,
  filters,
  activeFilterId,
  onSelectFilter,
  label,
}: {
  side: 'left' | 'right';
  filters: CameraFilter[];
  activeFilterId: string;
  onSelectFilter: (f: CameraFilter) => void;
  label: string;
}) {
  return (
    <div
      className="absolute z-20 flex flex-col items-center gap-1.5 pointer-events-auto"
      style={{
        [side]: 6,
        top: 'calc(env(safe-area-inset-top, 0px) + 70px)',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 240px)',
        // Overflow scroll vertical — caso nao caiba todo mundo
        overflowY: 'auto',
        overflowX: 'hidden',
        // Some o scrollbar feio do webkit
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
        touchAction: 'pan-y',
      } as React.CSSProperties}
    >
      {/* Label do rail */}
      <span
        className="text-[8px] font-bold uppercase tracking-widest"
        style={{
          color: 'rgba(255,255,255,0.85)',
          textShadow: '0 1px 3px rgba(0,0,0,0.6)',
          marginBottom: 2,
        }}
      >
        {label}
      </span>

      {filters.map((f) => {
        const isActive = activeFilterId === f.id;
        return (
          <button
            key={f.id}
            type="button"
            onClick={(e) => { e.stopPropagation(); onSelectFilter(f); }}
            className="flex flex-col items-center gap-0.5 active:scale-90 transition-transform flex-shrink-0"
            style={{
              padding: 2,
              border: 'none',
              background: 'transparent',
            }}
            aria-label={`Filtro ${f.name}`}
          >
            <span
              className="flex items-center justify-center"
              style={{
                width: 42,
                height: 42,
                borderRadius: '50%',
                background: f.color,
                border: isActive ? '2.5px solid #fff' : '2px solid rgba(255,255,255,0.55)',
                boxShadow: isActive
                  ? '0 0 14px rgba(255,255,255,0.7), 0 2px 6px rgba(0,0,0,0.45)'
                  : '0 2px 6px rgba(0,0,0,0.45)',
                fontSize: 18,
                transform: isActive ? 'scale(1.08)' : 'scale(1)',
                transition: 'transform 140ms ease-out, box-shadow 180ms ease-out',
              }}
            >
              {f.emoji}
            </span>
            <span
              className="text-[8px] font-bold uppercase"
              style={{
                color: '#fff',
                textShadow: '0 1px 3px rgba(0,0,0,0.7)',
                letterSpacing: '0.05em',
                lineHeight: 1,
              }}
            >
              {f.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
