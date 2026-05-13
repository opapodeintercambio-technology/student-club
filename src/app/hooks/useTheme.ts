import { useState, useEffect } from 'react';

export type Theme = 'light' | 'dark' | 'system';

function getAutoTheme(): 'light' | 'dark' {
  const hour = new Date().getHours();
  return hour >= 18 || hour < 7 ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  const resolved = theme === 'system' ? getAutoTheme() : theme;
  document.documentElement.classList.toggle('dark', resolved === 'dark');
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('papo_theme') as Theme) || 'system';
  });

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem('papo_theme', theme);
  }, [theme]);

  // Quando automático: verifica a cada minuto se mudou o horário
  useEffect(() => {
    if (theme !== 'system') return;

    const tick = () => applyTheme('system');

    // Calcula ms até o próximo minuto exato para sincronizar
    const now = new Date();
    const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();

    let interval: ReturnType<typeof setInterval>;
    const timeout = setTimeout(() => {
      tick();
      interval = setInterval(tick, 60_000);
    }, msUntilNextMinute);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [theme]);

  return { theme, setTheme };
}
