import { useEffect } from 'react';

// Student Club: apenas tema claro. Dark mode removido.
export type Theme = 'light';

export function useTheme() {
  useEffect(() => {
    // Garante que a classe .dark nunca esteja aplicada (limpa estado herdado)
    document.documentElement.classList.remove('dark');
    localStorage.removeItem('papo_theme');
  }, []);
  return { theme: 'light' as Theme, setTheme: (_t: Theme) => {} };
}
