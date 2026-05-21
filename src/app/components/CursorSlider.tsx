// CursorSlider — barra de gesto estilo iOS para mover o cursor de um
// textarea via deslize horizontal. Aparece apenas durante edição de
// mensagem no chat (campo pequeno demais pra tocar com precisão).
//
// Uso:
//   <CursorSlider getTextarea={() => inputRef.current} text={editingText} />
//
// UX:
//   - Toca e arrasta horizontalmente → move selectionStart/End do textarea
//   - Sensibilidade: ~1 char por 8px de deslize (configurável)
//   - Feedback visual: barra fica destacada enquanto deslizando

import { useRef, useState, useCallback } from 'react';

interface Props {
  getTextarea: () => HTMLTextAreaElement | null;
  text: string;
}

const PX_PER_CHAR = 8; // sensibilidade — quanto menor, mais rapido o cursor anda

export function CursorSlider({ getTextarea, text }: Props) {
  const startXRef = useRef(0);
  const startCaretRef = useRef(0);
  const [active, setActive] = useState(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const ta = getTextarea();
    if (!ta) return;
    e.preventDefault();
    try { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); } catch {}
    startXRef.current = e.clientX;
    // Usa a posicao atual do cursor como ancora. Se nao houver selecao,
    // selectionStart equivale ao caret.
    startCaretRef.current = ta.selectionStart ?? text.length;
    setActive(true);
    // Mantém o foco no textarea pra teclado nao fechar
    try { ta.focus({ preventScroll: true }); } catch { ta.focus(); }
  }, [getTextarea, text]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!active) return;
    const ta = getTextarea();
    if (!ta) return;
    const dx = e.clientX - startXRef.current;
    const deltaChars = Math.round(dx / PX_PER_CHAR);
    const next = Math.max(0, Math.min(text.length, startCaretRef.current + deltaChars));
    // Move caret (sem selecao — selectionStart === selectionEnd)
    try {
      ta.setSelectionRange(next, next);
    } catch {}
  }, [active, getTextarea, text]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    setActive(false);
    try { (e.currentTarget as Element).releasePointerCapture?.(e.pointerId); } catch {}
  }, []);

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      role="slider"
      aria-label="Deslize para mover o cursor"
      style={{
        height: 28,
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderRadius: 14,
        background: active ? 'rgba(139,92,246,0.18)' : 'rgba(0,0,0,0.04)',
        border: active ? '1px solid rgba(139,92,246,0.45)' : '1px solid rgba(0,0,0,0.08)',
        transition: 'background 120ms, border-color 120ms',
        cursor: 'ew-resize',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={active ? '#7c3aed' : '#6b7280'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="15 18 9 12 15 6" />
      </svg>
      <span style={{
        fontSize: 11,
        fontWeight: 600,
        color: active ? '#6d28d9' : '#6b7280',
        letterSpacing: '0.04em',
      }}>
        deslize para mover o cursor
      </span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={active ? '#7c3aed' : '#6b7280'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </div>
  );
}
