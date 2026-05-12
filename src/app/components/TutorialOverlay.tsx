import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useLang } from '../i18n';

interface Step {
  selector?: string;
  title: string;
  desc: string;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  onActivate?: () => void;
}

interface TutorialOverlayProps {
  username: string;
  isEmpresa?: boolean;
  onClose: () => void;
  onTabChange?: (tab: string) => void;
}

// Selectors list — matches the order in tutorialSteps translation array
const STEP_SELECTORS: (string | undefined)[] = [
  undefined,                           // 0 welcome
  '[data-tutorial="anunciar-btn"]',    // 1 create listing
  '[data-tutorial="search-bar"]',      // 2 search
  '[data-tutorial="category-filter"]', // 3 category filter
  '[data-tutorial="filtro-perto"]',    // 4 near me
  '[data-tutorial="product-card"]',    // 5 card
  '[data-tutorial="product-trokvalue"]', // 6 trokvalue
  '[data-tutorial="product-trocar"]',  // 7 trade button
  '[data-tutorial="product-chat"]',    // 8 chat
  '[data-tutorial="product-detail"]',  // 9 details
  '[data-tutorial="tab-likes"]',       // 10 likes tab
  '[data-tutorial="tab-chat"]',        // 11 chat tab
  '[data-tutorial="tab-meus"]',        // 12 my ads tab
  '[data-tutorial="match-ia-normal"]', // 13 ai match normal
  '[data-tutorial="match-ia-avancado"]', // 14 ai match advanced
  undefined,                           // 15 ratings
  undefined,                           // 16 push notifications
  '[data-tutorial="tab-conta"]',       // 17 my account
  '[data-tutorial="tab-ajustes"]',     // 18 settings
  undefined,                           // 19 identity verification
  undefined,                           // 20 photo tips
  undefined,                           // 21 all set
];

const STEP_POSITIONS: (Step['position'])[] = [
  'center', 'bottom', 'bottom', 'bottom', 'bottom',
  'top', 'top', 'top', 'top', 'top',
  'top', 'top', 'top', 'top', 'top',
  'center', 'center',
  'top', 'top',
  'center', 'center', 'center',
];

interface Rect { top: number; left: number; width: number; height: number; }

const PAD = 8;

export function TutorialOverlay({ username, isEmpresa, onClose, onTabChange }: TutorialOverlayProps) {
  const { AT } = useLang();

  const baseSteps: Step[] = AT.tutorialSteps.map((s, i) => ({
    title: s.title,
    desc: s.desc,
    selector: STEP_SELECTORS[i],
    position: STEP_POSITIONS[i],
  }));

  const empresaStep: Step = {
    title: AT.tutorialStepEmpresa.title,
    desc: AT.tutorialStepEmpresa.desc,
    position: 'center',
  };

  const steps = isEmpresa
    ? [baseSteps[0], empresaStep, ...baseSteps.slice(1)]
    : baseSteps;
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const current = steps[step];
  const total = steps.length;

  const findRect = useCallback(() => {
    if (!current.selector) { setRect(null); return; }
    const el = document.querySelector(current.selector);
    if (!el) { setRect(null); return; }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
    }, 300);
  }, [current.selector]);

  useEffect(() => { findRect(); }, [findRect]);

  // Reposition on resize/scroll
  useEffect(() => {
    const update = () => findRect();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [findRect]);

  const go = (dir: 1 | -1) => {
    const next = step + dir;
    if (next < 0 || next >= total) return;
    setRect(null);
    setStep(next);
  };

  const isLast = step === total - 1;
  const isFirst = step === 0;

  // Tooltip position logic — viewport-aware, never clips edges
  const tooltipStyle = (): React.CSSProperties => {
    if (!rect || current.position === 'center') {
      return { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 320, zIndex: 10002 };
    }
    const { top, left, width, height } = rect;
    const tw = Math.min(300, window.innerWidth - 16);
    const TOOLTIP_H = 290; // estimated max tooltip height
    const MARGIN = 10;
    const pos = current.position || 'bottom';
    const clampLeft = (x: number) => Math.max(MARGIN, Math.min(x, window.innerWidth - tw - MARGIN));

    if (pos === 'bottom') {
      const spaceBelow = window.innerHeight - (top + height + 16);
      if (spaceBelow < TOOLTIP_H && top > TOOLTIP_H + 16) {
        // flip to top
        const tTop = Math.max(MARGIN, top - 16 - TOOLTIP_H);
        return { position: 'fixed', top: tTop, left: clampLeft(left + width / 2 - tw / 2), width: tw, zIndex: 10002 };
      }
      const tTop = Math.min(top + height + 16, window.innerHeight - TOOLTIP_H - MARGIN);
      return { position: 'fixed', top: Math.max(MARGIN, tTop), left: clampLeft(left + width / 2 - tw / 2), width: tw, zIndex: 10002 };
    }

    if (pos === 'top') {
      const spaceAbove = top - 16;
      if (spaceAbove < TOOLTIP_H && window.innerHeight - (top + height) > TOOLTIP_H + 16) {
        // flip to bottom
        const tTop = Math.min(top + height + 16, window.innerHeight - TOOLTIP_H - MARGIN);
        return { position: 'fixed', top: Math.max(MARGIN, tTop), left: clampLeft(left + width / 2 - tw / 2), width: tw, zIndex: 10002 };
      }
      const tTop = Math.max(MARGIN, top - 16 - TOOLTIP_H);
      return { position: 'fixed', top: tTop, left: clampLeft(left + width / 2 - tw / 2), width: tw, zIndex: 10002 };
    }

    if (pos === 'left') {
      const tLeft = Math.max(MARGIN, left - tw - 16);
      const tTop = Math.max(MARGIN, Math.min(top + height / 2 - TOOLTIP_H / 2, window.innerHeight - TOOLTIP_H - MARGIN));
      return { position: 'fixed', top: tTop, left: tLeft, width: tw, zIndex: 10002 };
    }

    // right
    const tLeft = Math.min(left + width + 16, window.innerWidth - tw - MARGIN);
    const tTop = Math.max(MARGIN, Math.min(top + height / 2 - TOOLTIP_H / 2, window.innerHeight - TOOLTIP_H - MARGIN));
    return { position: 'fixed', top: tTop, left: tLeft, width: tw, zIndex: 10002 };
  };

  const arrowClass = () => {
    if (!rect || current.position === 'center') return '';
    return current.position || 'bottom';
  };

  return (
    <>
      {/* Dark overlay */}
      <div className="fixed inset-0 z-[10000] pointer-events-none" style={{ background: 'rgba(0,0,0,0.72)' }} />

      {/* Spotlight cutout */}
      {rect && (
        <div
          className="fixed z-[10001] pointer-events-none"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            borderRadius: 12,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.72)',
            border: '2.5px solid rgba(167,139,250,0.9)',
            background: 'transparent',
          }}
        />
      )}

      {/* Tooltip */}
      <div style={tooltipStyle()} className="tutorial-tooltip">
        <div className={`relative bg-white rounded-3xl shadow-2xl overflow-hidden tutorial-arrow-${arrowClass()}`}>
          {/* Header gradient */}
          <div className="bg-gradient-to-r from-purple-600 to-orange-500 px-5 py-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-white font-bold text-base leading-snug">{current.title}</h3>
              <button onClick={onClose} className="text-white/70 hover:text-white flex-shrink-0 mt-0.5">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="px-5 py-4">
            <p className="text-gray-700 text-sm leading-relaxed">{current.desc.replace('__USERNAME__', username)}</p>
          </div>

          {/* Progress dots */}
          <div className="flex justify-center gap-1 pb-2">
            {steps.map((_, i) => (
              <div key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-5 bg-purple-600' : 'w-1.5 bg-gray-200'}`} />
            ))}
          </div>

          {/* Footer */}
          <div className="px-5 pb-5 flex items-center justify-between gap-2">
            <span className="text-xs text-gray-400 font-medium">{AT.tutorialStep(step + 1, total)}</span>
            <div className="flex gap-2">
              {!isFirst && (
                <button onClick={() => go(-1)}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl bg-gray-100 text-gray-600 font-semibold text-xs hover:bg-gray-200 transition-colors">
                  <ChevronLeft className="w-3.5 h-3.5" /> {AT.tutorialBack}
                </button>
              )}
              <button onClick={() => isLast ? onClose() : go(1)}
                className="flex items-center gap-1 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-orange-500 text-white font-bold text-xs hover:opacity-90 transition-opacity">
                {isLast ? AT.tutorialStart : <>{AT.tutorialNext} <ChevronRight className="w-3.5 h-3.5" /></>}
              </button>
            </div>
          </div>

          {/* Skip */}
          {!isLast && (
            <button onClick={onClose} className="w-full pb-4 text-xs text-gray-400 hover:text-gray-600 transition-colors text-center">
              {AT.tutorialSkip}
            </button>
          )}
        </div>
      </div>

      {/* Click blocker (allow clicking next/prev but block rest) */}
      <div className="fixed inset-0 z-[9999]" onClick={(e) => e.stopPropagation()} />
    </>
  );
}
