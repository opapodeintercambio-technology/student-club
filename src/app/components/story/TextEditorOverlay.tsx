// Overlay de edicao de legenda. Aparece quando o user clica em T (Type) OU
// em uma legenda existente pra editar.
//
// ── ARQUITETURA v2 (Jobs in-place editing) ──
//   Antes era um "balao" modal com backdrop translucido — o user via a midia
//   do story atras MAS o backdrop deixava feed/conteudo abaixo vazar
//   (especialmente quando o teclado subia e o portal nao cobria 100% da tela).
//
//   Agora a midia do story eh RENDERIZADA DENTRO do overlay como fundo
//   OPACO — nada por baixo vaza, nem com teclado aberto. A textarea fica
//   posicionada na ZONA EXATA da camada (top/middle/bottom), aplicando a
//   rotacao escolhida. Resultado: o que o user digita aparece EXATAMENTE
//   como vai ficar no story final. Zero "balao", zero leak.
//
// Layout:
//   - Fundo: <img> ou <video> da midia, full-screen
//   - Topo: botao "Pronto"
//   - Centro: textarea posicionada na zona da camada (com rotacao)
//   - Rodape: toolbars (align + bg + zona + rotacao + slider + fontes + cores)

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlignLeft, AlignCenter, AlignRight, Check, MoveVertical, RotateCw } from 'lucide-react';
import { FontPicker } from './FontPicker';
import { ColorPalette } from './ColorPalette';
import type { TextLayer, StoryTextZone } from '../storyLayers';
import { FONT_FAMILIES, autoContrastTextColor, fontStyleExtras, nextTextZone, nextTextRotation } from '../storyLayers';

interface Props {
  layer: TextLayer | null;
  onChange: (patch: Partial<TextLayer>) => void;
  onCommit: () => void;
  /** Midia de fundo (mesma do story sendo editado) — renderizada como
   *  background opaco do overlay pra impedir vazamento de qualquer conteudo
   *  por tras (feed, etc.) quando o teclado iOS sobe. */
  mediaSrc?: string;
  mediaKind?: 'image' | 'video';
}

const FONT_MIN = 18;
const FONT_MAX = 96;

export function TextEditorOverlay({ layer, onChange, onCommit, mediaSrc, mediaKind }: Props) {
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

  // Posicionamento WYSIWYG: textarea na ZONA da camada com a rotacao aplicada.
  // Quando o teclado sobe (bottomOffset > 0) e a zona eh 'bottom', deslocamos
  // a textarea pra cima do teclado pra ela ficar visivel — UX padrao Instagram.
  const zone: StoryTextZone = layer.zone || 'bottom';
  const textareaZoneStyle: React.CSSProperties = (() => {
    if (zone === 'top') {
      return {
        top: 'calc(env(safe-area-inset-top, 0px) + 90px)',
        left: 12, right: 12,
        display: 'flex', justifyContent: 'center',
      };
    }
    if (zone === 'middle') {
      return {
        top: '50%',
        left: 12, right: 12,
        transform: 'translateY(-50%)',
        display: 'flex', justifyContent: 'center',
      };
    }
    // bottom: se o teclado esta aberto, coloca acima dele; senao no rodape natural
    if (bottomOffset > 0) {
      return {
        bottom: bottomOffset + 220, // 220px = espaco pras toolbars + folga
        left: 12, right: 12,
        display: 'flex', justifyContent: 'center',
      };
    }
    return {
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 100px)',
      left: 12, right: 12,
      display: 'flex', justifyContent: 'center',
    };
  })();

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 100200,
        // Fundo OPACO PRETO — a midia do story sera renderizada DENTRO como
        // background. Nada por baixo vaza, nem com teclado aberto.
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
      {/* ── BACKGROUND: midia do story (imagem ou video) cobrindo full-screen.
            Garante que nada por tras (feed, etc.) vaza pelos cantos quando
            o teclado iOS sobe. Pointer-events: none pra clicks chegarem no
            container e dispararem onCommit. */}
      {mediaSrc && mediaKind === 'image' && (
        <img
          src={mediaSrc}
          alt=""
          draggable={false}
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'cover',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        />
      )}
      {mediaSrc && mediaKind === 'video' && (
        <video
          src={mediaSrc}
          muted
          playsInline
          autoPlay
          loop
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'cover',
            pointerEvents: 'none',
          }}
        />
      )}
      {/* Overlay sutil escuro pra contraste — preserva legibilidade do texto
          em fotos claras sem matar o WYSIWYG. */}
      <div
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.18)',
          pointerEvents: 'none',
        }}
      />

      {/* ── TOPO: botao Pronto */}
      <div
        className="absolute left-0 right-0 flex items-center justify-end px-3"
        style={{
          top: 0,
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)',
          zIndex: 2,
        }}
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

      {/* ── TEXTAREA na ZONA EXATA da camada (top/middle/bottom) com rotacao
            aplicada. WYSIWYG real: o que o user digita aparece exatamente
            como vai ficar no story final. */}
      <div
        className="absolute"
        style={{ ...textareaZoneStyle, zIndex: 2 }}
        onPointerDown={(e) => {
          // tap fora da textarea = nao commitar (deixa o usuario clicar nas
          // toolbars). So commita se clicar no container do overlay.
          e.stopPropagation();
        }}
      >
        <div style={{ transform: `rotate(${layer.rotation || 0}rad)`, transformOrigin: 'center center' }}>
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

      {/* ── TOOLBAR INFERIOR (acima do teclado). Inclui agora botoes de
            zona + rotacao alem dos controles ja existentes. */}
      <div
        className="absolute left-0 right-0 flex flex-col gap-1"
        style={{
          bottom: bottomOffset,
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 4px)',
          background: 'linear-gradient(0deg, rgba(0,0,0,0.65), rgba(0,0,0,0))',
          zIndex: 2,
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Linha 1: align + bg + zona + rotacao + slider de tamanho */}
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
          {/* ZONA: cicla topo -> meio -> base */}
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
          {/* ROTACAO: cicla 0deg -> +8deg -> -8deg */}
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
          {/* SLIDER de tamanho — ocupa o restante da linha */}
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
