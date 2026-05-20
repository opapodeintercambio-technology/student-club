// ThemeToggle — seletor 3-estados (sol / lua / monitor)
// Consumido em SettingsTab. Visual minimalista com pills arredondadas
// e ícones Lucide. Animação de troca 200ms (color/background).
//
// Estados:
//   light  — sol      (força tema claro)
//   dark   — lua      (força tema escuro)
//   system — monitor  (segue prefers-color-scheme do SO)

import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme, type Theme } from '../hooks/useTheme';

interface Props {
  /** Compacto = só ícones; padrão = ícone + label. */
  compact?: boolean;
}

const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: 'light',  label: 'Claro',    Icon: Sun },
  { value: 'dark',   label: 'Escuro',   Icon: Moon },
  { value: 'system', label: 'Sistema',  Icon: Monitor },
];

export function ThemeToggle({ compact = false }: Props) {
  const { theme, setTheme } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="Tema"
      className="inline-flex items-center gap-1 p-1 rounded-full"
      style={{ background: 'var(--sc-bg-hover)', border: '1px solid var(--sc-border)' }}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(value)}
            className={`inline-flex items-center gap-1.5 rounded-full text-xs font-semibold transition-colors active:scale-95 ${compact ? 'w-9 h-9 justify-center' : 'px-3.5 py-1.5'}`}
            style={{
              background: active ? 'var(--sc-accent)' : 'transparent',
              color: active ? '#ffffff' : 'var(--sc-text-secondary)',
            }}
            title={label}
            aria-label={label}
          >
            <Icon className="w-3.5 h-3.5" strokeWidth={2.4} />
            {!compact && <span>{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
