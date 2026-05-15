import { useEffect } from 'react';

// Trava o scroll da página atrás de um modal/overlay enquanto o componente
// estiver montado. Funciona em desktop e em mobile (iOS Safari + Android Chrome).
//
// Por que não basta `body.style.overflow='hidden'`?
//   No iOS Safari isso não impede o "rubber band" — o usuário arrasta o
//   conteúdo do modal e a PÁGINA por baixo escorrega junto. A receita que
//   funciona no iOS é trocar o body para position:fixed e compensar o offset
//   pra evitar o "salto" pro topo. Ao desmontar, restauramos o scrollY.
//
// Múltiplos modais empilhados? Mantemos um contador global — só destrava
// quando o último fechar.
let lockCount = 0;
let savedScrollY = 0;
let savedStyles: { overflow: string; position: string; top: string; width: string; left: string; right: string } | null = null;

export function useLockBodyScroll(active = true) {
  useEffect(() => {
    if (!active) return;

    if (lockCount === 0) {
      savedScrollY = window.scrollY || window.pageYOffset || 0;
      const body = document.body;
      savedStyles = {
        overflow: body.style.overflow,
        position: body.style.position,
        top: body.style.top,
        width: body.style.width,
        left: body.style.left,
        right: body.style.right,
      };
      // overflow:hidden cobre desktop; position:fixed cobre iOS
      body.style.overflow = 'hidden';
      body.style.position = 'fixed';
      body.style.top = `-${savedScrollY}px`;
      body.style.left = '0';
      body.style.right = '0';
      body.style.width = '100%';
    }
    lockCount++;

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0 && savedStyles) {
        const body = document.body;
        body.style.overflow = savedStyles.overflow;
        body.style.position = savedStyles.position;
        body.style.top = savedStyles.top;
        body.style.left = savedStyles.left;
        body.style.right = savedStyles.right;
        body.style.width = savedStyles.width;
        // Restaura sem animação para evitar pulo visível
        window.scrollTo(0, savedScrollY);
        savedStyles = null;
      }
    };
  }, [active]);
}
