// Overlay de edicao de legenda. Aparece quando o user clica em T (Type) OU
// em uma legenda existente pra editar.
//
// Layout: flex column. Top = Pronto. Centro = textarea (WYSIWYG — aparece
// como vai ficar no story). Bottom = toolbars (align/bg + slider de tamanho
// + fontes + cores).

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlignLeft, AlignCenter, AlignRight, Check } from 'lucide-react';
import { FontPicker } from './FontPicker';
import { ColorPalette } from './ColorPalette';
import type { TextLayer } from '../storyLayers';
import { FONT_FAMILIES, autoContrastTextColor, fontStyleExtras } from '../storyLayers';

interface Props {
  layer: TextLayer | null;
  onChange: (patch: Partial<TextLayer>) => void;
  onCommit: () => void;
}

const FONT_MIN = 18;
const FONT_MAX = 96;

export function TextEditorOverlay({ layer, onChange, onCommit }: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  // visualViewport: altura do teclado.
  const [bottomOffset, setBottomOffset] = useState(0);

  // FOCUS apos React commit — preserva user activation iOS pra abrir o teclado.
  useLayoutEffect(() => {
    if (!layer) return;
    const ta = taRef.current;
    if (!ta) return;
    ta.focus({ preventScroll: true });
    try {
      ta.setSelectionRange(ta.value.length, ta.value.length);
    } catch {}
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  }, [layer?.id]);

  // visualViewport API: rastreia altura do teclado pra limitar overlay
  useEffect(() => {
    if (!layer) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const off = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setBottomOffset(off);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [layer]);

  if (!layer) return null;

  function cycleBackground() {
    if (!layer) return;
    const order: TextLayer['background'][] = ['none', 'solid', 'translucent'];
    const idx = order.indexOf(layer.background);
    const next = order[(idx + 1) % order.length];
    if (next === 'solid') {
      const newBgColor = layer.color === '#ffffff' || layer.color === '#000000'
        ? '#1e714a'
        : layer.color;
      onChange({
        background: 'solid',
        backgroundColor: newBgColor,
        color: autoContrastTextColor(newBgColor),
      });
    } else if (next === 'translucent') {
      onChange({
        background: 'translucent',
        backgroundColor: 'rgba(0,0,0,0.45)',
      });
    } else {
      onChange({ background: 'none' });
    }
  }

  function cycleAlign() {
    if (!layer) return;
    const order: TextLayer['align'][] = ['center', 'left', 'right'];
    const idx = order.indexOf(layer.align);
    onChange({ align: order[(idx + 1) % order.length] });
  }

  function setFontSize(next: number) {
    const clamped = Math.max(FONT_MIN, Math.min(FONT_MAX, Math.round(next)));
    onChange({ fontSize: clamped });
  }

  const AlignIcon = layer.align === 'left' ? AlignLeft
    : layer.align === 'right' ? AlignRight
    : AlignCenter;

  // Background do textarea
  const bgColor = layer.background === 'solid' ? layer.backgroundColor
    : layer.background === 'translucent' ? layer.backgroundColor
    : 'transparent';
  const textColor = layer.background === 'solid'
    ? autoContrastTextColor(layer.backgroundColor)
    : layer.color;

  return createPortal(
    <div
      // LIMITADO ao visualViewport: bottom = altura do teclado.
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: bottomOffset,
        zIndex: 100200,
        // Backdrop QUASE invisivel (0.08) pra o user ver a imagem do
        // story claramente atras enquanto digita — WYSIWYG real estilo
        // Instagram. O dim grosso anterior (0.25) tirava a sensacao de
        // "preview do post final".
        background: 'rgba(0,0,0,0.08)',
        touchAction: 'none',
        overscrollBehavior: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
        display: 'flex',
        flexDirection: 'column',
      } as React.CSSProperties}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onCommit();
      }}
    >
      {/* TOP: PRONTO no canto direito */}
      <div
        className="flex items-center justify-end px-3"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)' }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); onCommit(); }}
          onTouchEnd={(e) => { e.preventDefault(); onCommit(); }}
          className="px-4 h-10 rounded-full text-black text-sm font-bold flex items-center gap-1.5"
          style={{ background: '#ffffff' }}
          aria-label="Pronto"
        >
          <Check className="w-4 h-4" /> Pronto
        </button>
      </div>

      {/* TEXTAREA — posicionado no RODAPE da area visivel (acima do
          teclado). Layer.y default eh 0.85 (proximo do fundo do story),
          entao colocando o textarea no fim do flex-1 ele aparece
          EXATAMENTE onde o texto vai ficar no story final. WYSIWYG. */}
      <div
        className="flex-1 flex items-end justify-center px-6 min-h-0"
        style={{ paddingBottom: 6 }}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) onCommit();
        }}
      >
        <textarea
          ref={taRef}
          value={layer.text}
          onChange={(e) => {
            onChange({ text: e.target.value });
            const ta = e.currentTarget;
            ta.style.height = 'auto';
            ta.style.height = ta.scrollHeight + 'px';
          }}
          placeholder="Digite a legenda…"
          rows={1}
          autoFocus
          inputMode="text"
          enterKeyHint="done"
          style={{
            ...fontStyleExtras(layer.fontStyle),
            display: 'block',
            width: 'auto',
            minWidth: 140,
            maxWidth: '76vw',
            fontFamily: FONT_FAMILIES[layer.fontStyle],
            fontSize: layer.fontSize,
            color: textColor,
            background: bgColor,
            padding: layer.background === 'none' ? '4px 8px' : '8px 14px',
            borderRadius: layer.background === 'none' ? 0 : 10,
            textAlign: layer.align,
            lineHeight: 1.2,
            outline: 'none',
            border: 'none',
            resize: 'none',
            overflow: 'hidden',
            WebkitAppearance: 'none' as any,
            textShadow: layer.background === 'none' && layer.fontStyle !== 'strong'
              ? '0 1px 4px rgba(0,0,0,0.6)' : undefined,
            caretColor: textColor === '#000000' ? '#000000' : '#ffffff',
            WebkitUserSelect: 'text',
            userSelect: 'text',
          } as React.CSSProperties}
        />
      </div>

      {/* TOOLBAR INFERIOR — align/bg + slider de tamanho + fontes + cores.
          3 linhas pra caber acima do teclado. */}
      <div
        className="flex flex-col gap-1"
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 4px)',
          background: 'linear-gradient(0deg, rgba(0,0,0,0.55), rgba(0,0,0,0))',
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Linha 1: align + bg + slider HORIZONTAL de tamanho */}
        <div className="flex items-center gap-2 px-2">
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); cycleAlign(); }}
            onTouchEnd={(e) => { e.preventDefault(); cycleAlign(); }}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.20)' }}
            aria-label="Alinhamento"
          >
            <AlignIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); cycleBackground(); }}
            onTouchEnd={(e) => { e.preventDefault(); cycleBackground(); }}
            className="px-2 h-8 rounded-full text-white text-[11px] font-semibold flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.20)' }}
            aria-label="Fundo"
          >
            {layer.background === 'none' ? 'Aa' : layer.background === 'solid' ? 'Aa■' : 'Aa▢'}
          </button>
          {/* SLIDER de tamanho — horizontal, ocupa o restante da linha.
              Range 18–96 px. accentColor branco pra match com o tema. */}
          <span className="text-[10px] font-bold text-white/70 flex-shrink-0" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>a</span>
          <input
            type="range"
            min={FONT_MIN}
            max={FONT_MAX}
            step={1}
            value={layer.fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            aria-label="Tamanho do texto"
            className="flex-1 min-w-0"
            style={{
              height: 24,
              background: 'transparent',
              accentColor: '#ffffff',
              margin: 0,
            } as React.CSSProperties}
          />
          <span className="text-sm font-bold text-white/90 flex-shrink-0" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>A</span>
        </div>

        {/* Linha 2: FontPicker (scroll horizontal) */}
        <div className="px-2">
          <FontPicker
            value={layer.fontStyle}
            onChange={(f) => onChange({ fontStyle: f })}
          />
        </div>

        {/* Linha 3: paleta de cores */}
        <ColorPalette
          value={layer.background === 'solid' ? layer.backgroundColor : layer.color}
          onChange={(c) => {
            if (layer.background === 'solid') {
              onChange({
                backgroundColor: c,
                color: autoContrastTextColor(c),
              });
            } else {
              onChange({ color: c });
            }
          }}
        />
      </div>
    </div>,
    document.body,
  );
}
