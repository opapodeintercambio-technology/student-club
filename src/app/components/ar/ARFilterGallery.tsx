// <ARFilterGallery /> — galeria horizontal de filtros AR, no rodape da
// camera (substitui o FilterCarouselBar antigo de filtros CSS).
//
// Layout: galeria de chips circulares scrollavel HORIZONTAL. Centro
// snap-to-active. Botao da camera vem no centro DENTRO da galeria
// (igual o estilo do Instagram + TikTok).
//
// Cada chip = 56x56 com emoji do filtro. Filtro ativo destacado com
// anel branco maior + nome do filtro abaixo.

import type { FilterConfig } from '../../lib/ar/types';
import { FILTER_CATALOG, FILTER_NONE } from '../../lib/ar/catalog';

interface Props {
  activeFilterId: string;
  onSelectFilter: (filter: FilterConfig) => void;
  /** Botao central — geralmente o botao de captura da camera. */
  centerSlot: React.ReactNode;
  centerWidth?: number;
  hidden?: boolean;
}

export function ARFilterGallery({
  activeFilterId,
  onSelectFilter,
  centerSlot,
  centerWidth = 84,
  hidden,
}: Props) {
  if (hidden) return <>{centerSlot}</>;

  const all = [FILTER_NONE, ...FILTER_CATALOG];
  const activeIdx = Math.max(0, all.findIndex(f => f.id === activeFilterId));
  const active = all[activeIdx];

  // Mostra 5 slots: -2, -1, CENTER, +1, +2
  const left2 = all[activeIdx - 2];
  const left1 = all[activeIdx - 1];
  const right1 = all[activeIdx + 1];
  const right2 = all[activeIdx + 2];

  return (
    <div className="flex items-center justify-center gap-2 relative" style={{ width: '100%', maxWidth: '88vw' }}>
      <FilterChip filter={left2} size="xs" onClick={() => left2 && onSelectFilter(left2)} />
      <FilterChip filter={left1} size="sm" onClick={() => left1 && onSelectFilter(left1)} />
      <div className="relative flex-shrink-0" style={{ width: centerWidth, height: centerWidth }}>
        {centerSlot}
      </div>
      <FilterChip filter={right1} size="sm" onClick={() => right1 && onSelectFilter(right1)} />
      <FilterChip filter={right2} size="xs" onClick={() => right2 && onSelectFilter(right2)} />
      {active && active.id !== 'none' && (
        <span
          className="absolute pointer-events-none text-[10px] font-bold uppercase tracking-wider"
          style={{
            bottom: -22,
            left: '50%',
            transform: 'translateX(-50%)',
            color: '#fff',
            textShadow: '0 1px 4px rgba(0,0,0,0.7)',
            whiteSpace: 'nowrap',
          }}
        >
          {active.name}
          {active.modifiesFace && (
            <span className="ml-1 opacity-75">✨</span>
          )}
        </span>
      )}
    </div>
  );
}

function FilterChip({
  filter,
  size,
  onClick,
}: {
  filter: FilterConfig | undefined;
  size: 'xs' | 'sm';
  onClick: () => void;
}) {
  const dim = size === 'xs' ? 28 : 40;
  if (!filter) return <span className="flex-shrink-0" style={{ width: dim, height: dim }} />;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="flex-shrink-0 flex items-center justify-center active:scale-90 transition-transform"
      style={{
        width: dim,
        height: dim,
        borderRadius: '50%',
        background: 'rgba(0,0,0,0.55)',
        border: size === 'sm' ? '2px solid rgba(255,255,255,0.85)' : '1.5px solid rgba(255,255,255,0.65)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
        fontSize: size === 'sm' ? 18 : 13,
        padding: 0,
        opacity: size === 'xs' ? 0.85 : 1,
      }}
      aria-label={filter.name}
    >
      {filter.emoji}
    </button>
  );
}
