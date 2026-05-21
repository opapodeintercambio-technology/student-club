// Overlay de edicao de legenda. Aparece quando o user clica em Aa OU em
// uma legenda existente pra editar.
//
// REDESIGN: textarea posicionado no RODAPE (onde a legenda final vai
// aparecer) — preview WYSIWYG. Toolbars (fontes/cores/align/bg/pronto)
// ficam apenas o necessario, com o overlay LIMITADO ao visualViewport
// (nao vai pro espaco do teclado).

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

export function TextEditorOverlay({ layer, onChange, onCommit }: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  // visualViewport: altura do teclado. Quando teclado abre, vv.height < window.innerHeight.
  // bottomOffset = quanto o teclado ocupa do bottom da viewport.
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

  // ── SIZE SLIDER ─────────────────────────────────────────────────────
  // Min/max fontSize do textarea (igual ao fontSize que vai pro layer).
  // 18 = legenda pequena (estilo descricao), 96 = bem grande (titulo).
  const FONT_MIN = 18;
  const FONT_MAX = 96;
  function setFontSize(next: number) {
    const clamped = Math.max(FONT_MIN, Math.min(FONT_MAX, Math.round(next)));
    onChange({ fontSize: clamped });
  }
  // Pinch-to-resize no proprio textarea — 2 dedos pra mudar tamanho
  // (mais natural que so o slider). Captura distancia inicial vs atual.
  const pinchRef = useRef<{ startDist: number; baseSize: number } | null>(null);
  function onPinchStart(e: React.TouchEvent) {
    if (e.touches.length !== 2 || !layer) return;
    const t1 = e.touches[0], t2 = e.touches[1];
    pinchRef.current = {
      startDist: Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY),
      baseSize: layer.fontSize,
    };
  }
  function onPinchMove(e: React.TouchEvent) {
    if (e.touches.length !== 2 || !pinchRef.current || !layer) return;
    if (e.cancelable) e.preventDefault();
    const t1 = e.touches[0], t2 = e.touches[1];
    const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    const ratio = dist / pinchRef.current.startDist;
    setFontSize(pinchRef.current.baseSize * ratio);
  }
  function onPinchEnd(e: React.TouchEvent) {
    if (e.touches.length < 2) pinchRef.current = null;
  }

  return createPortal(
    <div
      // LIMITADO ao visualViewport: bottom = altura do teclado. Assim
      // todo o conteudo fica DENTRO da area visivel, nunca atras do teclado.
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: bottomOffset,
        zIndex: 100200,
        // Backdrop bem sutil — mostra a imagem do story claramente por
        // tras (WYSIWYG). Tinha 0.35, agora 0.18 pra mais "preview real".
        background: 'rgba(0,0,0,0.18)',
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
      {/* TOP: PRONTO no canto direito */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-end px-3"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)', zIndex: 2 }}
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

      {/* SIZE SLIDER VERTICAL — lado esquerdo. Estilo Instagram. Range
          18–96 px. Maior em cima, menor embaixo. */}
      <div
        className="absolute left-3 flex flex-col items-center"
        style={{
          top: 'calc(env(safe-area-inset-top, 0px) + 64px)',
          bottom: 200, // espaco pra toolbar inferior
          zIndex: 2,
          width: 36,
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span className="text-[10px] font-bold text-white/80 mb-1" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>A</span>
        <input
          type="range"
          min={FONT_MIN}
          max={FONT_MAX}
          step={1}
          value={layer.fontSize}
          onChange={(e) => setFontSize(Number(e.target.value))}
          aria-label="Tamanho do texto"
          style={{
            // Vertical: rotaciona 270deg e usa width como "altura".
            // Truque cross-browser pra slider vertical funcional.
            writingMode: 'vertical-lr' as any,
            WebkitAppearance: 'slider-vertical' as any,
            width: 36,
            flex: 1,
            margin: 0,
            background: 'transparent',
            accentColor: '#ffffff',
          } as React.CSSProperties}
        />
        <span className="text-[10px] font-bold text-white/80 mt-1" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>a</span>
      </div>

      {/* CENTRO: textarea posicionado no MEIO da area visivel.
          Aparece exatamente como vai ficar no story final (WYSIWYG).
          Pinca com 2 dedos no proprio textarea pra mudar tamanho. */}
      <div
        className="absolute inset-0 flex items-center justify-center px-12"
        style={{ pointerEvents: 'none' }}
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
          onTouchStart={onPinchStart}
          onTouchMove={onPinchMove}
          onTouchEnd={onPinchEnd}
          onTouchCancel={onPinchEnd}
          placeholder="Digite a legenda…"
          rows={1}
          autoFocus
          inputMode="text"
          enterKeyHint="done"
          style={{
            ...fontStyleExtras(layer.fontStyle),
            pointerEvents: 'auto',
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
            textShadow: layer.background === 'none' && layer.fontStyle !== 'strong'
              ? '0 1px 4px rgba(0,0,0,0.6)' : undefined,
            caretColor: textColor === '#000000' ? '#000000' : '#ffffff',
            WebkitUserSelect: 'text',
            userSelect: 'text',
          } as React.CSSProperties}
        />
      </div>

      {/* TOOLBAR INFERIOR — fontes / align / bg / cores. Tudo COMPACTO
          em 2 linhas pra caber acima do teclado sem sobrepor o textarea.
          Posicao absolute no rodape pra ficar grudada na borda inferior
          (a outer agora usa absolute positioning, sem flex column). */}
      <div
        className="absolute left-0 right-0 bottom-0 flex flex-col gap-1"
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 4px)',
          background: 'linear-gradient(0deg, rgba(0,0,0,0.55), rgba(0,0,0,0))',
          zIndex: 2,
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Linha 1: align + bg + FontPicker (scroll) */}
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
          <div className="flex-1 min-w-0">
            <FontPicker
              value={layer.fontStyle}
              onChange={(f) => onChange({ fontStyle: f })}
            />
          </div>
        </div>

        {/* Linha 2: paleta de cores */}
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
