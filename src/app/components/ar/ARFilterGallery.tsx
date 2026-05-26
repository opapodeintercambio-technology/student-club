// <ARFilterGallery /> — carrossel scroll-snap horizontal estilo Instagram.
//
// SEM LOOP de scroll programatico — o user controla o scroll, momentum
// nativo do iOS/Android cuida da fisica. Activator atualizado conforme
// cada chip cruza o centro. ScrollTo SO em duas situacoes:
//   1. No mount inicial (posicionar no chip ativo dado pela prop)
//   2. Quando o user TAP num chip especifico (centraliza nele)
//
// Sem o ciclo: onScroll → setActiveFilter (pai) → useEffect scrollTo →
// onScroll → ... que travava o carrossel em iOS Safari (momentum
// interrompido pelo programatico).

import { useEffect, useLayoutEffect, useRef } from 'react';
import type { FilterConfig } from '../../lib/ar/types';
import { FILTER_CATALOG, FILTER_NONE } from '../../lib/ar/catalog';

interface Props {
  activeFilterId: string;
  onSelectFilter: (filter: FilterConfig) => void;
  centerSlot: React.ReactNode;
  centerWidth?: number;
  hidden?: boolean;
}

const CHIP_WIDTH = 56;
const CHIP_GAP = 8;
const CHIP_SLOT = CHIP_WIDTH + CHIP_GAP;

export function ARFilterGallery({
  activeFilterId,
  onSelectFilter,
  centerSlot,
  centerWidth = 84,
  hidden,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const all = [FILTER_NONE, ...FILTER_CATALOG];
  const activeIdx = Math.max(0, all.findIndex(f => f.id === activeFilterId));
  const activeIdxRef = useRef(activeIdx);
  activeIdxRef.current = activeIdx;
  // Ref dos refs dos chips pra scrollIntoView quando user tap
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // Flag — true quando o scroll esta sendo controlado programaticamente
  // (tap em chip ou mount). Onscroll ignora updates enquanto isso pra
  // nao entrar em loop com o pai.
  const programmaticRef = useRef(false);

  // POSICIONAMENTO INICIAL — centra no chip ativo SO no primeiro mount.
  // Depois disso, o user controla o scroll livremente.
  useLayoutEffect(() => {
    if (hidden) return;
    const sc = scrollerRef.current;
    const chip = chipRefs.current[activeIdxRef.current];
    if (!sc || !chip) return;
    programmaticRef.current = true;
    // jumpTo (sem behavior smooth) — instantaneo, sem animacao
    const target = chip.offsetLeft - (sc.clientWidth / 2 - chip.offsetWidth / 2);
    sc.scrollLeft = target;
    // Reset apos 1 frame
    requestAnimationFrame(() => { programmaticRef.current = false; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidden]);

  // Listener do scroll — atualiza filtro central conforme user rola.
  // SEM scrollTo programatico aqui (evita loop com momentum nativo).
  useEffect(() => {
    if (hidden) return;
    const sc = scrollerRef.current;
    if (!sc) return;
    let rafId: number | null = null;

    const update = () => {
      rafId = null;
      if (programmaticRef.current) return;
      const scrollerWidth = sc.clientWidth;
      const center = sc.scrollLeft + scrollerWidth / 2;
      // Acha o chip mais perto do centro
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < chipRefs.current.length; i++) {
        const c = chipRefs.current[i];
        if (!c) continue;
        const chipCenter = c.offsetLeft + c.offsetWidth / 2;
        const d = Math.abs(chipCenter - center);
        if (d < bestDist) { bestDist = d; best = i; }
      }
      if (all[best] && all[best].id !== activeFilterId) {
        onSelectFilter(all[best]);
      }
    };

    const onScroll = () => {
      if (rafId == null) rafId = requestAnimationFrame(update);
    };
    sc.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      sc.removeEventListener('scroll', onScroll);
      if (rafId != null) cancelAnimationFrame(rafId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidden, activeFilterId]);

  if (hidden) return <>{centerSlot}</>;

  return (
    <div className="relative w-full" style={{ height: centerWidth + 28 }}>
      {/* Scroller horizontal com snap-to-center.
          touch-action: pan-x — captura SO scroll horizontal, libera
          vertical pro container pai. -webkit-overflow-scrolling: touch
          dah a inercia/momentum nativa do iOS. */}
      <div
        ref={scrollerRef}
        className="absolute inset-0 overflow-x-auto overflow-y-hidden papo-ar-gallery"
        style={{
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          touchAction: 'pan-x',
          overscrollBehaviorX: 'contain',
        }}
      >
        <style>{`.papo-ar-gallery::-webkit-scrollbar{display:none}`}</style>
        <div
          className="flex items-center"
          style={{
            padding: `0 calc(50% - ${CHIP_WIDTH / 2}px)`,
            gap: CHIP_GAP,
            minHeight: '100%',
          }}
        >
          {all.map((f, i) => {
            const active = i === activeIdx;
            return (
              <button
                key={f.id}
                ref={el => { chipRefs.current[i] = el; }}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  // Tap em chip → centra ele suavemente. Flag programatico
                  // evita que o onScroll dispare update do filtro durante
                  // a animacao (que ja vem do prop logo apos).
                  const sc = scrollerRef.current;
                  const chip = chipRefs.current[i];
                  if (sc && chip) {
                    programmaticRef.current = true;
                    const target = chip.offsetLeft - (sc.clientWidth / 2 - chip.offsetWidth / 2);
                    sc.scrollTo({ left: target, behavior: 'smooth' });
                    setTimeout(() => { programmaticRef.current = false; }, 500);
                  }
                  onSelectFilter(f);
                }}
                className="flex-shrink-0 flex items-center justify-center active:scale-95 transition-transform"
                style={{
                  width: CHIP_WIDTH,
                  height: CHIP_WIDTH,
                  borderRadius: '50%',
                  scrollSnapAlign: 'center',
                  background: active ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.55)',
                  border: active ? '2.5px solid #fff' : '1.5px solid rgba(255,255,255,0.5)',
                  boxShadow: active ? '0 0 14px rgba(255,255,255,0.6)' : '0 2px 8px rgba(0,0,0,0.5)',
                  fontSize: active ? 26 : 22,
                  padding: 0,
                  opacity: active ? 1 : 0.85,
                  transition: 'background 140ms, border 140ms, box-shadow 180ms, font-size 140ms, opacity 140ms',
                }}
                aria-label={f.name}
                title={f.name}
              >
                {f.emoji}
              </button>
            );
          })}
        </div>
      </div>

      {/* Botao da camera sobreposto NO CENTRO, sempre tap-avel */}
      <div
        className="absolute pointer-events-none flex items-center justify-center"
        style={{
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: centerWidth,
          height: centerWidth,
        }}
      >
        <div className="pointer-events-auto" style={{ width: centerWidth, height: centerWidth }}>
          {centerSlot}
        </div>
      </div>

      {/* Nome do filtro ativo */}
      {all[activeIdx] && all[activeIdx].id !== 'none' && (
        <div className="absolute pointer-events-none text-center" style={{ bottom: -22, left: 0, right: 0 }}>
          <span
            className="text-[10px] font-bold uppercase tracking-wider"
            style={{ color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.7)', whiteSpace: 'nowrap' }}
          >
            {all[activeIdx].name}
            {all[activeIdx].modifiesFace && <span className="ml-1 opacity-75">✨</span>}
          </span>
        </div>
      )}
    </div>
  );
}
