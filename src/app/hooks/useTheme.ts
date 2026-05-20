// useTheme — segue AUTOMATICAMENTE a configuração do sistema operacional
// (iOS, Android, macOS, Windows) via prefers-color-scheme. SEM toggle
// manual no app, SEM persistência em localStorage. Se o user trocar o
// tema do aparelho, o app reage em tempo real.
//
// Aplica no <html>:
//   - data-theme="dark"/"light"
//   - classe .dark (compat com 225 regras legadas em index.css)
//   - meta name="theme-color" (PWA status bar)
//
// FOUC: index.html tem script inline que aplica o tema correto ANTES
// do React montar (lê só prefers-color-scheme).

import { useEffect, useState } from 'react';

// Mantida pra compat de callers antigos. Sempre retorna 'system'.
export type Theme = 'light' | 'dark' | 'system';

function resolveEffective(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyToDom(effective: 'light' | 'dark') {
  const root = document.documentElement;
  root.setAttribute('data-theme', effective);
  root.classList.toggle('dark', effective === 'dark');
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])')
    || document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = effective === 'dark' ? '#000000' : '#1f2937';
}

export function useTheme() {
  const [effective, setEffective] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    return resolveEffective();
  });

  useEffect(() => {
    applyToDom(resolveEffective());
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const next = resolveEffective();
      setEffective(next);
      applyToDom(next);
    };
    mq.addEventListener('change', onChange);

    // Guardião: algum código legado de terceiros remove a classe .dark
    // do <html> esporadicamente (víamos rootClasses="" mesmo com dark
    // ativo). MutationObserver re-aplica imediatamente sem flicker.
    const observer = new MutationObserver(() => {
      const eff = resolveEffective();
      if (eff === 'dark' && !document.documentElement.classList.contains('dark')) {
        document.documentElement.classList.add('dark');
      }
      if (document.documentElement.getAttribute('data-theme') !== eff) {
        document.documentElement.setAttribute('data-theme', eff);
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });

    return () => {
      mq.removeEventListener('change', onChange);
      observer.disconnect();
    };
  }, []);

  // API mantida (theme/setTheme) pra não quebrar callers existentes,
  // mas setTheme é no-op — o tema é 100% controlado pelo SO.
  return { theme: 'system' as Theme, setTheme: (_t: Theme) => {}, effective };
}
