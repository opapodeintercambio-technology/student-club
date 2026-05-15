import { useState } from 'react';
import { COUNTRIES, findCountry } from './countries';

interface Props {
  label: string;
  value: string;
  onChange: (code: string) => void;
  className?: string;
}

export function CountryPicker({ label, value, onChange, className }: Props) {
  const [open, setOpen] = useState(false);
  const c = findCountry(value);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ||
          'w-full px-3 py-2.5 border border-stone-300 bg-white rounded flex items-center gap-2 text-left text-[15px] text-stone-900 hover:border-stone-500 transition-colors'
        }
      >
        <span className="text-xl">{c.flag}</span>
        <span className="flex-1 truncate">{c.name}</span>
        <span className="text-xs text-stone-400">{c.code} ▾</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[9000] bg-black/60 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-lg max-w-sm w-full max-h-[70vh] overflow-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-3 border-b flex items-center justify-between">
              <span
                className="text-xs font-bold uppercase"
                style={{ fontFamily: '"Source Serif 4", Georgia, serif', letterSpacing: '0.18em', color: '#5a7a52' }}
              >
                {label}
              </span>
              <button type="button" onClick={() => setOpen(false)} className="text-stone-500 hover:text-stone-800 px-2">✕</button>
            </div>
            <div className="p-2">
              {COUNTRIES.map(opt => (
                <button
                  key={opt.code}
                  type="button"
                  onClick={() => { onChange(opt.code); setOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-stone-100 rounded text-left ${opt.code === value ? 'bg-stone-50' : ''}`}
                >
                  <span className="text-2xl">{opt.flag}</span>
                  <span className="text-sm text-stone-800 flex-1">{opt.name}</span>
                  <span className="text-xs text-stone-400">{opt.code}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
