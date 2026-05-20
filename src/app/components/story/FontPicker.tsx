// Carrossel horizontal de fontes — exibido ACIMA do teclado quando o user
// esta digitando uma legenda. Cada chip mostra o label na propria fonte
// pra preview visual imediato.

import type { StoryFontStyle } from '../storyLayers';
import { FONT_FAMILIES, FONT_LABELS } from '../storyLayers';

const ORDER: StoryFontStyle[] = ['classic', 'modern', 'typewriter', 'handwritten', 'strong'];

interface Props {
  value: StoryFontStyle;
  onChange: (next: StoryFontStyle) => void;
}

export function FontPicker({ value, onChange }: Props) {
  return (
    <div
      className="flex gap-2 overflow-x-auto px-3 py-2 font-picker-strip"
      style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <style>{`.font-picker-strip::-webkit-scrollbar{display:none}`}</style>
      {ORDER.map(f => {
        const active = f === value;
        return (
          <button
            key={f}
            type="button"
            // onMouseDown/onTouchEnd em vez de onClick pra nao roubar foco
            // do textarea (que fecharia o teclado iOS).
            onMouseDown={(e) => { e.preventDefault(); onChange(f); }}
            onTouchEnd={(e) => { e.preventDefault(); onChange(f); }}
            className="px-3 py-1.5 rounded-full text-xs font-bold flex-shrink-0 transition-colors"
            style={{
              background: active ? '#fff' : 'rgba(255,255,255,0.18)',
              color: active ? '#000' : '#fff',
              fontFamily: FONT_FAMILIES[f],
              letterSpacing: '0.04em',
              border: active ? '2px solid #fff' : '2px solid transparent',
              minWidth: 80,
            }}
          >
            {FONT_LABELS[f]}
          </button>
        );
      })}
    </div>
  );
}
