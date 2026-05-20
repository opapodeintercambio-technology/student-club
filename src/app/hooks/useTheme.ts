// useTheme — gerencia o tema do app com 3 estados:
//   - 'light' : força claro
//   - 'dark'  : força escuro
//   - 'system': segue a preferência do SO (matchMedia prefers-color-scheme)
//
// Persiste em localStorage (chave 'theme'). Aplica:
//   - data-theme="dark" ou data-theme="light" no <html>
//   - classe .dark no <html> (compat com regras legadas em index.css)
//   - meta name="theme-color" dinâmico (PWA status bar)
//
// FOUC prevention: existe um script inline em index.html que roda ANTES
// do React montar e aplica o tema correto direto no <html>. Esse hook
// só re-sincroniza depois.

import { useEffect, useState, useCallback } from 'react';

export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'theme';

function readStored(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {}
  return 'system';
}

function resolveEffective(t: Theme): 'light' | 'dark' {
  if (t === 'system') {
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return t;
}

function applyToDom(effective: 'light' | 'dark') {
  const root = document.documentElement;
  root.setAttribute('data-theme', effective);
  // Compat com regras legadas em index.css que usam .dark
  root.classList.toggle('dark', effective === 'dark');
  // Atualiza meta theme-color (PWA status bar).
  // Atualiza só a tag SEM media query — a com media (prefers-color-scheme:dark)
  // é dica pro navegador quando o user nunca abriu o app; depois do load
  // a tag sem media tem prioridade.
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])')
    || document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = effective === 'dark' ? '#000000' : '#1f2937';
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'system';
    return readStored();
  });

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
    applyToDom(resolveEffective(next));
  }, []);

  // Aplica no mount + sincroniza com mudanças do sistema quando theme==='system'
  useEffect(() => {
    applyToDom(resolveEffective(theme));
    if (theme !== 'system' || typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyToDom(resolveEffective('system'));
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const effective: 'light' | 'dark' = resolveEffective(theme);
  return { theme, setTheme, effective };
}
