import { useEffect } from 'react';

// Trava o scroll da página atrás de um modal/overlay enquanto o componente
// estiver montado. Funciona em desktop e em mobile (iOS Safari + Android Chrome).
//
// Estratégia (importante):
//   Versões anteriores usavam `body.position=fixed; body.top=-scrollY` pra
//   travar o iOS Safari (rubber-band). Isso, porém, fazia a URL bar do
//   Safari reaparecer ao abrir o overlay — a viewport encolhia e elementos
//   `position:fixed bottom:0` (ex.: BottomNav) "subiam" visualmente.
//
//   Trocamos por `overflow:hidden` no <html> e <body> + `overscroll-behavior:none`,
//   que trava o scroll SEM mudar a posição do body. A URL bar do Safari fica
//   onde estava e os fixed-bottom não se mexem. Para impedir rubber-band
//   dentro do overlay, os próprios drawers já têm handlers de touch.

let lockCount = 0;
let savedStyles: {
  htmlOverflow: string;
  htmlOverscroll: string;
  bodyOverflow: string;
  bodyOverscroll: string;
} | null = null;

export function useLockBodyScroll(active = true) {
  useEffect(() => {
    if (!active) return;

    if (lockCount === 0) {
      const html = document.documentElement;
      const body = document.body;
      savedStyles = {
        htmlOverflow: html.style.overflow,
        htmlOverscroll: (html.style as any).overscrollBehavior || '',
        bodyOverflow: body.style.overflow,
        bodyOverscroll: (body.style as any).overscrollBehavior || '',
      };
      html.style.overflow = 'hidden';
      (html.style as any).overscrollBehavior = 'none';
      body.style.overflow = 'hidden';
      (body.style as any).overscrollBehavior = 'none';
    }
    lockCount++;

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0 && savedStyles) {
        const html = document.documentElement;
        const body = document.body;
        html.style.overflow = savedStyles.htmlOverflow;
        (html.style as any).overscrollBehavior = savedStyles.htmlOverscroll;
        body.style.overflow = savedStyles.bodyOverflow;
        (body.style as any).overscrollBehavior = savedStyles.bodyOverscroll;
        savedStyles = null;
      }
    };
  }, [active]);
}
