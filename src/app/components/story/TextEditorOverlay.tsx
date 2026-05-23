// Overlay de edicao de legenda. Aparece quando o user clica em T (Type) OU
// em uma legenda existente pra editar.
//
// ── LAYOUT v4 (a pedido do user) ──
//   - FUNDO da area editavel = a propria midia do story (foto/video) com
//     dim overlay sutil pra legibilidade do texto.
//   - FUNDO ATRAS DO TECLADO = preto solido (pra nao deixar o feed
//     aparecer atras do teclado translucido do iOS).
//   - TOOLBARS no TOPO da area editavel (Pronto + align/bg/zone/rotate/
//     size + fontes + cores) — usam visualViewport.offsetTop pra ficar
//     SEMPRE visiveis quando o teclado abre (antes "subiam" pra fora
//     da viewport por causa do scroll do layout no iOS).
//   - TEXTAREA centralizada vertical/horizontal na area editavel.
//   - Body overflow lockado enquanto o editor esta aberto pra impedir
//     o iOS de scrollar o layout quando o textarea ganha foco.

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
  /** Midia do story (URL ou data URL) — renderizada como fundo da area
   *  editavel pra preview WYSIWYG. */
  mediaSrc?: string;
  mediaKind?: 'image' | 'video';
}

const FONT_MIN = 18;
const FONT_MAX = 96;

export function TextEditorOverlay({ layer, onChange, onCommit, mediaSrc, mediaKind }: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  // visualViewport: altura do teclado + offset do topo (iOS scroll).
  const [bottomOffset, setBottomOffset] = useState(0);
  const [vvTop, setVvTop] = useState(0);

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

  // BUG FIX: lockar body overflow enquanto o editor esta aberto. Sem isso,
  // o iOS scroll-into-view ao focar o textarea sobe o layout e as toolbars
  // saem da viewport visivel.
  useEffect(() => {
    if (!layer) return;
    const prevOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    // Forca scroll pro topo caso o iOS ja tenha rolado
    window.scrollTo(0, 0);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, [layer]);

  // visualViewport API: rastreia altura do teclado E offsetTop (quando
  // iOS scrolla o layout, offsetTop > 0).
  useEffect(() => {
    if (!layer) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const off = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setBottomOffset(off);
      setVvTop(vv.offsetTop || 0);
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

  // (Removido: editableHeight string. Containers internos agora usam
  // bottom: bottomOffset que eh mais robusto contra quirks do iOS Safari.)

  return createPortal(
    <div
      // OVERLAY EXTERNO: fundo PRETO solido. Usa `height: 100lvh` (Large
      // Viewport Height) pra forcar cobertura COMPLETA do screen mesmo
      // quando o teclado iOS sobe. Em iOS PWA, `inset:0` as vezes pina
      // ao VISUAL viewport (excluindo teclado) -> feed da pagina vazava
      // por tras da barra translucida do acessorio do teclado iOS. Com
      // 100lvh forcamos a extensao ate o fundo fisico da tela.
      // Fallback `bottom: 0` cobre browsers que nao suportam lvh.
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0,
        bottom: 0,
        height: '100lvh',
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
      {/* ── MIDIA DO STORY como fundo da AREA EDITAVEL (acima do teclado).
          Cobre do topo da viewport visivel ate o topo do teclado. NAO se
          estende atras do teclado — la fica preto pelo overlay externo. */}
      {mediaSrc && (
        <div
          style={{
            position: 'absolute',
            top: vvTop,
            left: 0, right: 0,
            bottom: bottomOffset,
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        >
          {mediaKind === 'image' ? (
            <img
              src={mediaSrc}
              alt=""
              draggable={false}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <video
              src={mediaSrc}
              muted
              playsInline
              autoPlay
              loop
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )}
          {/* Dim sutil pra legibilidade do texto sobre a midia */}
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.30)' }} />
        </div>
      )}

      {/* ── BARRA PRETA DEFENSIVA atras do teclado iOS. Garante 100% que
          a area do teclado + accessory bar fique preta solida, mesmo
          que o iOS Safari faca algum truque com layout viewport. */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0, right: 0,
          // +80 extra cobre tambem o iOS form accessory bar (^v✓) e
          // qualquer area de transicao
          height: Math.max(bottomOffset + 80, 100),
          background: '#000',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />

      {/* ── INNER WRAPPER: posicionado na area visivel (excluindo teclado).
          Toolbars no topo + textarea centralizada no espaco que sobra.
          zIndex: 2 garante que fica ACIMA da barra preta defensiva. */}
      <div
        style={{
          position: 'absolute',
          top: vvTop,
          left: 0, right: 0,
          bottom: bottomOffset,
          display: 'flex',
          flexDirection: 'column',
          zIndex: 2,
        }}
      >
        {/* ── TOPO: PRONTO + todas as toolbars de edicao ──
            flexShrink:0 garante que NAO encolhem quando o teclado abre. */}
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
          {/* Botao Pronto (canto direito).
              BUG FIX: bg trocado de '#ffffff' pra 'rgba(255,255,255,1)' —
              a regra global de dark mode em index.css captura
              [style*="background:#ffffff"] e substitui por #0c1014, fazendo
              o botao ficar PRETO (mesma cor do texto) e invisivel.
              rgba(...,1) nao eh capturado pelo seletor e fica branco em
              ambos os modos. Cor do texto forcada inline pra evitar override. */}
          <div className="flex items-center justify-end px-3">
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onCommit(); }}
              onTouchEnd={(e) => { e.preventDefault(); onCommit(); }}
              className="px-4 h-10 rounded-full text-sm font-bold flex items-center gap-1.5"
              style={{
                background: 'rgba(255,255,255,1)',
                color: 'rgba(0,0,0,1)',
              }}
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
              style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
              aria-label="Alinhamento"
            >
              <AlignIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); cycleBackground(); }}
              onTouchEnd={(e) => { e.preventDefault(); cycleBackground(); }}
              className="px-2 h-8 rounded-full text-white text-[11px] font-semibold flex-shrink-0"
              style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
              aria-label="Fundo"
            >
              {layer.background === 'none' ? 'Aa' : layer.background === 'solid' ? 'Aa■' : 'Aa▢'}
            </button>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); cycleZone(); }}
              onTouchEnd={(e) => { e.preventDefault(); cycleZone(); }}
              className="w-8 h-8 rounded-full flex items-center justify-center text-white flex-shrink-0"
              style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
              aria-label="Posicao"
            >
              <MoveVertical className="w-4 h-4" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); cycleRotation(); }}
              onTouchEnd={(e) => { e.preventDefault(); cycleRotation(); }}
              className="w-8 h-8 rounded-full flex items-center justify-center text-white flex-shrink-0"
              style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
              aria-label="Rotacao"
            >
              <RotateCw className="w-4 h-4" />
            </button>
            <span
              className="text-[11px] font-bold text-white flex-shrink-0"
              style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}
            >a</span>
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
            <span
              className="text-sm font-bold text-white flex-shrink-0"
              style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}
            >A</span>
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
