// Paleta de cores horizontal no rodape do editor de texto.
// Tap em um swatch aplica a cor imediatamente.

import { STORY_COLORS } from '../storyLayers';

interface Props {
  value: string;
  onChange: (color: string) => void;
}

export function ColorPalette({ value, onChange }: Props) {
  return (
    <div
      className="flex gap-2 overflow-x-auto px-3 py-2 color-palette-strip"
      style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <style>{`.color-palette-strip::-webkit-scrollbar{display:none}`}</style>
      {STORY_COLORS.map(c => (
        <button
          key={c}
          type="button"
          // mousedown/touchend pra nao roubar foco do textarea (mantem o
          // teclado aberto no iOS enquanto o user escolhe a cor).
          onMouseDown={(e) => { e.preventDefault(); onChange(c); }}
          onTouchEnd={(e) => { e.preventDefault(); onChange(c); }}
          className="rounded-full flex-shrink-0 active:scale-95 transition-transform"
          style={{
            width: 32,
            height: 32,
            background: c,
            border: value === c ? '3px solid #fff' : '2px solid rgba(255,255,255,0.35)',
            boxShadow: value === c ? '0 0 0 2px rgba(0,0,0,0.4)' : undefined,
          }}
          aria-label={`Cor ${c}`}
        />
      ))}
    </div>
  );
}
