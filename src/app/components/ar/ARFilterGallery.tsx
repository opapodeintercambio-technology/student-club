// <ARFilterGallery /> — carrossel scroll-snap horizontal estilo Instagram.
//
// Diferencas vs ARFilterGallery v1:
//   - SCROLL HORIZONTAL CONTINUO com inercia (-webkit-overflow-scrolling).
//     User passa o dedo, momentum scroll segue, filtro central muda
//     automaticamente conforme cada chip cruza o ponto central.
//   - SNAP TO CENTER: ao soltar, o chip mais perto do meio gruda no
//     centro (igual reels/instagram).
//   - Botao da camera fica EM CIMA do chip ativo central (posicao
//     absoluta sobreposta), sempre tap-avel.
//
// Implementacao:
//   - `overflow-x: auto` + `scroll-snap-type: x mandatory` (nativo do browser)
//   - Cada chip = `scroll-snap-align: center`
//   - Padding lateral de 50% pra que primeiro/ultimo chip consigam centralizar
//   - Detecta chip central via scrollLeft + offset — atualiza activeFilter
//     enquanto o user rola (debounce simples)

import { useEffect, useRef } from 'react';
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

  // Centraliza o chip ativo no scroller quando muda externamente
  useEffect(() => {
    const sc = scrollerRef.current;
    if (!sc || hidden) return;
    const scrollerWidth = sc.clientWidth;
    const target = activeIdx * CHIP_SLOT + (centerWidth + CHIP_GAP) / 2 - scrollerWidth / 2;
    // scrollTo smooth — pra mudancas externas (tap em chip, swipe). Quando
    // o user esta arrastando, esse useEffect nao roda (activeIdx so muda
    // depois do scroll terminar).
    sc.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx, hidden]);

  // Listener do scroll — atualiza filtro central enquanto user arrasta.
  // Debounce via rAF pra perf.
  useEffect(() => {
    const sc = scrollerRef.current;
    if (!sc || hidden) return;
    let rafId: number | null = null;
    let scrollEndTimer: ReturnType<typeof setTimeout> | null = null;

    const update = () => {
      rafId = null;
      const scrollerWidth = sc.clientWidth;
      const center = sc.scrollLeft + scrollerWidth / 2;
      // Indice do chip mais perto do centro
      // Cada chip ocupa CHIP_SLOT, mas tem padding inicial de scrollerWidth/2 - CHIP_WIDTH/2
      const padStart = scrollerWidth / 2 - CHIP_WIDTH / 2;
      const idx = Math.round((center - padStart - CHIP_WIDTH / 2) / CHIP_SLOT);
      const clamped = Math.max(0, Math.min(all.length - 1, idx));
      if (all[clamped] && all[clamped].id !== activeFilterId) {
        onSelectFilter(all[clamped]);
      }
    };

    const onScroll = () => {
      if (rafId == null) rafId = requestAnimationFrame(update);
      // Re-arma timer de "scroll terminou" — snap nativo do CSS faz
      // o ajuste fino sozinho.
      if (scrollEndTimer) clearTimeout(scrollEndTimer);
      scrollEndTimer = setTimeout(update, 120);
    };
    sc.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      sc.removeEventListener('scroll', onScroll);
      if (rafId != null) cancelAnimationFrame(rafId);
      if (scrollEndTimer) clearTimeout(scrollEndTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidden, activeFilterId]);

  if (hidden) return <>{centerSlot}</>;

  return (
    <div className="relative w-full" style={{ height: centerWidth + 24 }}>
      {/* Scroller horizontal com snap-to-center.
          padding lateral = 50% da largura do container pra que primeiro/
          ultimo chip consigam ficar no centro. */}
      <div
        ref={scrollerRef}
        className="absolute inset-0 overflow-x-auto overflow-y-hidden papo-ar-gallery"
        style={{
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          scrollPaddingInline: '50%',
        }}
      >
        <style>{`.papo-ar-gallery::-webkit-scrollbar{display:none}`}</style>
        <div
          className="flex items-center"
          style={{
            // Padding lateral generoso pra que primeiro/ultimo chip cheguem ao centro
            padding: '0 calc(50% - 28px)',
            gap: CHIP_GAP,
            minHeight: '100%',
          }}
        >
          {all.map((f, i) => {
            const active = i === activeIdx;
            return (
              <button
                key={f.id}
                type="button"
                onClick={(e) => { e.stopPropagation(); onSelectFilter(f); }}
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

      {/* Botao da camera sobreposto NO CENTRO. Fica em cima do chip ativo. */}
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

      {/* Nome + badge do filtro ativo, abaixo do botao */}
      {all[activeIdx] && all[activeIdx].id !== 'none' && (
        <div
          className="absolute pointer-events-none text-center"
          style={{
            bottom: -22,
            left: 0, right: 0,
          }}
        >
          <span
            className="text-[10px] font-bold uppercase tracking-wider"
            style={{
              color: '#fff',
              textShadow: '0 1px 4px rgba(0,0,0,0.7)',
              whiteSpace: 'nowrap',
            }}
          >
            {all[activeIdx].name}
            {all[activeIdx].modifiesFace && <span className="ml-1 opacity-75">✨</span>}
          </span>
        </div>
      )}
    </div>
  );
}
