// Overlay de edicao de legenda. Aparece quando o user clica em T (Type) OU
// em uma legenda existente pra editar.
//
// ── LAYOUT v3 (a pedido do user) ──
//   - TODAS as toolbars no TOPO (Pronto + align/bg/zone/rotate/size +
//     fontes + cores)
//   - TEXTAREA no CENTRO vertical da area visivel (acima do teclado)
//   - FUNDO PRETO OPACO cobrindo a tela toda (inclusive atras do teclado)
//     pra impedir que o feed apareça por baixo quando o teclado iOS sobe.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlignLeft, AlignCenter, AlignRight, Check, MoveVertical, RotateCw } from 'lucide-react';
import { FontPicker } from './FontPicker';
import { ColorPalette } from './ColorPalette';
import type { TextLayer } from '../storyLayers';
import { FONT_FAMILIES, autoContrastTextColor, fontStyleExtras, nextTextZone, nextTextRotation } from '../storyLayers';

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

  // visualViewport API: rastreia altura do teclado pra limitar a area da
  // textarea (o fundo preto vai ate o bottom da tela inteira pra nao deixar
  // o feed aparecer atras do teclado).
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

  function cycleZone() {
    if (!layer) return;
    onChange({ zone: nextTextZone(layer.zone) });
  }

  function cycleRotation() {
    if (!layer) return;
    onChange({ rotation: nextTextRotation(layer.rotation || 0) });
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
      // OVERLAY EXTERNO: cobre a tela inteira com FUNDO PRETO OPACO.
      // Vai ate bottom:0 (nao para no teclado) pra que atras do teclado
      // apareça SO o preto — nao o feed por baixo.
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 100200,
        background: '#000',
        touchAction: 'none',
        overscrollBehavior: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
      } as React.CSSProperties}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onCommit();
      }}
    >
      {/* CONTAINER INTERNO: posicionado SO ate o topo do teclado.
          Usa flex column: toolbars no topo (flex-shrink 0), textarea
          ocupa o restante e fica centralizada vertical. */}
      <div
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          bottom: bottomOffset,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* ── TOPO: PRONTO + todas as toolbars de edicao ── */}
        <div
          style={{
            flexShrink: 0,
            paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Botao Pronto (canto direito) */}
          <div className="flex items-center justify-end px-3">
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

          {/* Linha: align + bg + zona + rotacao + slider tamanho */}
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
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); cycleZone(); }}
              onTouchEnd={(e) => { e.preventDefault(); cycleZone(); }}
              className="w-8 h-8 rounded-full flex items-center justify-center text-white flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.20)' }}
              aria-label="Posicao"
            >
              <MoveVertical className="w-4 h-4" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); cycleRotation(); }}
              onTouchEnd={(e) => { e.preventDefault(); cycleRotation(); }}
              className="w-8 h-8 rounded-full flex items-center justify-center text-white flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.20)' }}
              aria-label="Rotacao"
            >
              <RotateCw className="w-4 h-4" />
            </button>
            <span className="text-[10px] font-bold text-white/70 flex-shrink-0">a</span>
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
            <span className="text-sm font-bold text-white/90 flex-shrink-0">A</span>
          </div>

          {/* Linha: FontPicker */}
          <div className="px-2">
            <FontPicker
              value={layer.fontStyle}
              onChange={(f) => onChange({ fontStyle: f })}
            />
          </div>

          {/* Linha: ColorPalette */}
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

        {/* ── TEXTAREA CENTRALIZADA — ocupa o espaco restante entre as
              toolbars (topo) e o teclado (rodape), centralizada vertical
              e horizontalmente. */}
        <div
          className="flex-1 flex items-center justify-center px-6 min-h-0"
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
      </div>
    </div>,
    document.body,
  );
}
