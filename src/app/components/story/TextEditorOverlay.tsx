// Overlay de edicao de legenda. Aparece quando o user clica em Aa OU em
// uma legenda existente pra editar. Fullscreen com backdrop escuro,
// textarea centralizado, e toolbars de fonte/cor/bg/alinhamento.
//
// COMO RESOLVE OS PROBLEMAS DO iOS:
//
// 1) Teclado nao aparecia (foco fora do gesto):
//    useLayoutEffect chama focus() ANTES do paint, ainda dentro da janela
//    de "user activation" do iOS Safari. Isso eh a unica forma confiavel
//    de garantir que o teclado abre automaticamente.
//
// 2) Toolbars sumiam sob o teclado:
//    visualViewport API monitora a altura do teclado e ajusta o padding-
//    bottom do container. FontPicker e ColorPalette ficam sempre acima
//    do teclado.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlignLeft, AlignCenter, AlignRight, Check } from 'lucide-react';
import { FontPicker } from './FontPicker';
import { ColorPalette } from './ColorPalette';
import type { TextLayer } from '../storyLayers';
import { FONT_FAMILIES, autoContrastTextColor, fontStyleExtras } from '../storyLayers';

interface Props {
  /** Camada sendo editada. Quando null, o overlay nao renderiza. */
  layer: TextLayer | null;
  onChange: (patch: Partial<TextLayer>) => void;
  /** Chamado quando o user toca fora do textarea (commit). */
  onCommit: () => void;
}

export function TextEditorOverlay({ layer, onChange, onCommit }: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  // Altura do teclado iOS via visualViewport. Ajusta padding-bottom pra
  // toolbars nao ficarem escondidas.
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  // FOCUS sincrono apos o React commit — chave pra iOS abrir o teclado.
  useLayoutEffect(() => {
    if (!layer) return;
    const ta = taRef.current;
    if (!ta) return;
    ta.focus({ preventScroll: true });
    try {
      ta.setSelectionRange(ta.value.length, ta.value.length);
    } catch { /* nao critico */ }
    // Auto-resize inicial
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  }, [layer?.id]);

  // visualViewport API pra ajustar UI sob o teclado
  useEffect(() => {
    if (!layer) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardOffset(offset);
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
      // Quando vira solid: cor de fundo = cor atual; texto auto-contraste
      onChange({
        background: 'solid',
        backgroundColor: layer.color === '#ffffff' || layer.color === '#000000'
          ? '#1e714a' // brand verde se cor texto for B&W
          : layer.color,
        color: autoContrastTextColor(layer.color === '#ffffff' || layer.color === '#000000' ? '#1e714a' : layer.color),
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

  // Estilo do background do textarea
  const bgColor = layer.background === 'solid' ? layer.backgroundColor
    : layer.background === 'translucent' ? layer.backgroundColor
    : 'transparent';
  const textColor = layer.background === 'solid'
    ? autoContrastTextColor(layer.backgroundColor)
    : layer.color;

  return createPortal(
    <div
      className="fixed inset-0 z-[100200] flex flex-col"
      style={{
        // Backdrop ESCURO o suficiente pra deixar OBVIO que o user esta
        // em modo de edicao (sem isso parecia que "sumiu tudo").
        // 0.45 = ainda da pra ver a imagem do story por tras, mas tem
        // contraste forte pro textarea e botoes.
        background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
        touchAction: 'none',
        overscrollBehavior: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
      } as React.CSSProperties}
      // Tap fora do textarea/toolbars = commit
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onCommit();
      }}
    >
      {/* TOP: FontPicker + Align + Background + PRONTO */}
      <div
        className="flex items-center gap-2 px-2"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)' }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex-1 min-w-0">
          <FontPicker
            value={layer.fontStyle}
            onChange={(f) => onChange({ fontStyle: f })}
          />
        </div>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); cycleAlign(); }}
          onTouchEnd={(e) => { e.preventDefault(); cycleAlign(); }}
          className="w-9 h-9 rounded-full flex items-center justify-center text-white flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.18)' }}
          aria-label="Alinhamento"
        >
          <AlignIcon className="w-4 h-4" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); cycleBackground(); }}
          onTouchEnd={(e) => { e.preventDefault(); cycleBackground(); }}
          className="px-3 h-9 rounded-full text-white text-xs font-semibold flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.18)' }}
          aria-label="Fundo"
        >
          {layer.background === 'none' ? 'Sem fundo'
            : layer.background === 'solid' ? 'Sólido'
            : 'Translúcido'}
        </button>
        {/* BOTAO PRONTO — visivel e obvio. Tap nele commita a edicao.
            Alem do tap-fora, esse botao garante que o user SEMPRE tenha
            como confirmar o texto. */}
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); onCommit(); }}
          onTouchEnd={(e) => { e.preventDefault(); onCommit(); }}
          className="px-4 h-9 rounded-full text-black text-xs font-bold flex-shrink-0 flex items-center gap-1"
          style={{ background: '#ffffff' }}
          aria-label="Pronto"
        >
          <Check className="w-3.5 h-3.5" /> Pronto
        </button>
      </div>

      {/* CENTRO: textarea SEMPRE VISIVEL durante edicao.
          IMPORTANTE: garante minHeight pra nao colapsar com o flex-1 caso
          as toolbars superior/inferior cresçam mais do que o esperado em
          telas pequenas. Sem isso, em algumas resolucoes o middle ficava
          0px de altura e o textarea simplesmente nao aparecia. */}
      <div
        className="flex-1 flex items-center justify-center px-4"
        style={{ minHeight: 180 }}
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
            minWidth: 180,
            maxWidth: '90vw',
            fontFamily: FONT_FAMILIES[layer.fontStyle],
            fontSize: layer.fontSize,
            color: textColor,
            // SEMPRE adiciona um background visivel durante a edicao —
            // mesmo quando layer.background === 'none'. Isso garante que
            // o user VEJA onde digitar. Quando o user confirma (Pronto),
            // a camada renderiza com o background REAL escolhido (none =
            // sem caixa). Aqui o bg eh so um "chrome do editor".
            background: layer.background === 'none' ? 'rgba(0,0,0,0.45)' : bgColor,
            padding: '10px 18px',
            borderRadius: 12,
            // Borda branca fina pra deixar EVIDENTE que tem um campo aqui
            border: '2px solid rgba(255,255,255,0.55)',
            textAlign: layer.align,
            lineHeight: 1.2,
            outline: 'none',
            resize: 'none',
            overflow: 'hidden',
            textShadow: layer.background === 'none' && layer.fontStyle !== 'strong'
              ? '0 1px 4px rgba(0,0,0,0.5)' : undefined,
            caretColor: '#ffffff',
            WebkitUserSelect: 'text',
            userSelect: 'text',
          } as React.CSSProperties}
        />
      </div>

      {/* BOTTOM: paleta de cores */}
      <div
        style={{
          paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${keyboardOffset + 8}px)`,
          background: 'linear-gradient(0deg, rgba(0,0,0,0.55), rgba(0,0,0,0))',
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
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
