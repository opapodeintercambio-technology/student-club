// useTheme — segue automaticamente o setting do sistema operacional
// (iOS, Android, macOS, Windows). Sem override manual por enquanto:
// se o user ativar Dark Mode no aparelho, o app inteiro vai pra dark.
//
// Implementacao:
//   - matchMedia('(prefers-color-scheme: dark)') detecta o estado atual
//   - addEventListener('change') atualiza quando o user muda no SO
//   - Aplica .dark no <html> -> Tailwind dark: variants + CSS .dark global
//     em styles/index.css cuidam do visual
import { useEffect } from 'react';

export type Theme = 'light' | 'dark' | 'system';

export function useTheme() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.classList.toggle('dark', mq.matches);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  // Mantemos a API antiga (theme/setTheme) pra nao quebrar callers,
  // mas o setTheme eh no-op — sempre segue o SO.
  return { theme: 'system' as Theme, setTheme: (_t: Theme) => {} };
}
