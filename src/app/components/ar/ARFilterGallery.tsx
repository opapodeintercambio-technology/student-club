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

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  // SPACER WIDTH em PIXELS — calculado a partir do clientWidth do scroller
  // depois que ele monta. Antes usavamos `width: calc(50% - 28px)` em CSS,
  // mas em iOS Safari porcentagem em FLEX ITEM dentro de overflow:scroll
  // computa pro min-content em vez do flex container width, resultando em
  // spacer 0px e os 1-2 ultimos chips ficando inalcancaveis. Computar via
  // JS garante valor pixel-exato e cobre 100% dos browsers.
  const [spacerPx, setSpacerPx] = useState(0);

  // SPACER WIDTH calculation. Roda no mount + a cada resize. ResizeObserver
  // mantem sincronizado com mudancas de viewport (rotacao de device, modal
  // overlay, etc).
  useLayoutEffect(() => {
    if (hidden) return;
    const sc = scrollerRef.current;
    if (!sc) return;
    const update = () => {
      const w = sc.clientWidth;
      if (w > 0) setSpacerPx(Math.max(0, Math.round((w - CHIP_WIDTH) / 2)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(sc);
    return () => ro.disconnect();
  }, [hidden]);

  // POSICIONAMENTO INICIAL — centra no chip ativo SO no primeiro mount.
  // Depois disso, o user controla o scroll livremente. Roda DEPOIS do
  // useLayoutEffect que seta spacerPx pra que offsetLeft do chip ja
  // contemple os spacers.
  useLayoutEffect(() => {
    if (hidden) return;
    if (spacerPx === 0) return; // espera primeiro layout
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
  }, [hidden, spacerPx]);

  // Visual highlight do chip central — atualizado a cada frame de scroll
  // via DOM direto (zero React re-renders pra o pai). O filtro REAL
  // (onSelectFilter) so eh disparado QUANDO O SCROLL PARA — sem isso,
  // user rolando entre 20 chips disparava 20 re-mounts da engine AR
  // (lazy import + GPU alloc) e travava a main thread → momentum nativo
  // do iOS/Android quebrava.
  //
  // useEffect com deps VAZIAS — listener instalado UMA vez, nao re-roda
  // quando activeFilterId muda. Versao anterior tinha activeFilterId na
  // dep e o listener era remontado mid-scroll, matando o momentum.
  useEffect(() => {
    if (hidden) return;
    const sc = scrollerRef.current;
    if (!sc) return;
    let rafId: number | null = null;
    let endTimer: ReturnType<typeof setTimeout> | null = null;

    const computeCenterIdx = (): number => {
      const scrollerWidth = sc.clientWidth;
      const center = sc.scrollLeft + scrollerWidth / 2;
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < chipRefs.current.length; i++) {
        const c = chipRefs.current[i];
        if (!c) continue;
        const chipCenter = c.offsetLeft + c.offsetWidth / 2;
        const d = Math.abs(chipCenter - center);
        if (d < bestDist) { bestDist = d; best = i; }
      }
      return best;
    };

    // VISUAL APENAS — destaca o chip no centro em tempo real via classes
    // DOM. NAO toca React state (zero re-render).
    const updateVisualHighlight = () => {
      rafId = null;
      const best = computeCenterIdx();
      for (let i = 0; i < chipRefs.current.length; i++) {
        const c = chipRefs.current[i];
        if (!c) continue;
        if (i === best) c.dataset.centered = '1';
        else delete c.dataset.centered;
      }
    };

    // COMMIT do filtro — chamado APENAS quando scroll PARA (debounce 140ms
    // apos ultimo evento de scroll). Evita re-mount da engine a cada
    // frame do momentum.
    const commitFilter = () => {
      if (programmaticRef.current) return;
      const best = computeCenterIdx();
      const target = all[best];
      if (target && target.id !== activeIdxRef.current.toString() && target.id !== all[activeIdxRef.current]?.id) {
        onSelectFilter(target);
      }
    };

    const onScroll = () => {
      if (rafId == null) rafId = requestAnimationFrame(updateVisualHighlight);
      if (endTimer) clearTimeout(endTimer);
      endTimer = setTimeout(commitFilter, 140);
    };
    sc.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      sc.removeEventListener('scroll', onScroll);
      if (rafId != null) cancelAnimationFrame(rafId);
      if (endTimer) clearTimeout(endTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidden]);

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
          // FIX: snap mandatory estava "prendendo" os 2 ultimos chips —
          // momentum do iOS termina antes do snap point final e o browser
          // volta pro snap anterior. Proximity deixa o user soltar onde
          // quiser e so atrai SE estiver bem perto. Combinado com padding
          // extra (CHIP_SLOT em vez de CHIP_WIDTH/2) garante range total.
          scrollSnapType: 'x proximity',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          touchAction: 'pan-x',
          overscrollBehaviorX: 'contain',
        }}
      >
        <style>{`
          .papo-ar-gallery::-webkit-scrollbar{display:none}
          .papo-ar-chip[data-centered="1"]{
            background: rgba(255,255,255,0.25) !important;
            border: 2.5px solid #fff !important;
            box-shadow: 0 0 14px rgba(255,255,255,0.6) !important;
            font-size: 26px !important;
            opacity: 1 !important;
          }
        `}</style>
        <div
          className="flex items-center"
          style={{
            // FIX "ultimos 2 chips nao alcancam":
            // ANTES: padding `0 calc(50% - 28px)` no flex container — em
            // iOS Safari + flex + scroll-snap, o padding NEM SEMPRE conta
            // pro scrollWidth quando os filhos sao flex items. Resultado:
            // scrollWidth efetivo curto e os 1-2 ultimos chips ficam
            // "fora" do range util do scrollLeft.
            // AGORA: spacers DOM reais (divs) com largura `calc(50% - 28px)`
            // em volta dos chips. Spacers sao itens de fluxo normal e
            // contam 100% pro scrollWidth. Mesmo efeito visual, sem o bug.
            gap: CHIP_GAP,
            minHeight: '100%',
            paddingInline: 0,
          }}
        >
          {/* Spacer esquerdo — empurra o primeiro chip pro centro. Como
              eh div de fluxo normal (nao padding), o iOS Safari computa
              scrollWidth corretamente e os ultimos chips ficam acessiveis. */}
          <div
            aria-hidden="true"
            style={{
              flexShrink: 0,
              flexGrow: 0,
              flexBasis: `${spacerPx}px`,
              width: `${spacerPx}px`,
              minWidth: `${spacerPx}px`,
              height: 1,
              pointerEvents: 'none',
            }}
          />
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
                className="papo-ar-chip flex-shrink-0 flex items-center justify-center active:scale-95 transition-transform"
                data-centered={active ? '1' : undefined}
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
          {/* Spacer direito — espelho do esquerdo. Garante que o ultimo
              chip tem espaco vazio depois dele pra alinhar no centro. */}
          <div
            aria-hidden="true"
            style={{
              flexShrink: 0,
              flexGrow: 0,
              flexBasis: `${spacerPx}px`,
              width: `${spacerPx}px`,
              minWidth: `${spacerPx}px`,
              height: 1,
              pointerEvents: 'none',
            }}
          />
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
