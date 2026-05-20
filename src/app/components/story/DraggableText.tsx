// Camada de TEXTO arrastavel/pinchavel no stage do story.
//
// Usa @use-gesture/react pra drag (1 dedo) + pinch (2 dedos, simultaneo
// com rotacao). Substitui a logica manual de TouchEvent que tinha problemas
// de palm rejection no iOS.
//
// motion.div pra animacoes suaves; transform via GPU (translate3d/scale/
// rotate) — nunca top/left direto.

import { useRef } from 'react';
import { motion } from 'motion/react';
import { useGesture } from '@use-gesture/react';
import type { TextLayer } from '../storyLayers';
import { FONT_FAMILIES, autoContrastTextColor, fontStyleExtras } from '../storyLayers';

interface Props {
  layer: TextLayer;
  stageRef: React.RefObject<HTMLDivElement>;
  selected: boolean;
  /** Disparado quando o user comeca a tocar (mesmo sem mover). */
  onSelect: () => void;
  /** Atualiza propriedades da camada. */
  onUpdate: (patch: Partial<TextLayer>) => void;
  /** Tap simples (sem mover) -> abre edicao. */
  onTap: () => void;
  /** Inicio do arrasto. */
  onDragStart: () => void;
  /** Fim do arrasto. Inclui se soltou sobre a lixeira. */
  onDragEnd: (overTrash: boolean) => void;
  /** Hover sobre lixeira durante o drag. */
  onTrashHoverChange: (over: boolean) => void;
}

const TAP_THRESHOLD_PX = 6;
const TRASH_RADIUS_PX = 64;

export function DraggableText({
  layer, stageRef, selected, onSelect, onUpdate, onTap,
  onDragStart, onDragEnd, onTrashHoverChange,
}: Props) {
  const movedRef = useRef(false);
  const trashHoverRef = useRef(false);
  // Posicao base (antes do drag atual) — usada pelo onDrag pra calcular
  // a posicao nova a partir do offset acumulado de @use-gesture.
  const baseRef = useRef({ x: layer.x, y: layer.y });

  function stageRect() {
    return stageRef.current?.getBoundingClientRect() ?? new DOMRect(0, 0, 1, 1);
  }

  function isOverTrash(clientX: number, clientY: number): boolean {
    const r = stageRect();
    const tx = r.left + r.width / 2;
    const ty = r.bottom - 80;
    return Math.hypot(clientX - tx, clientY - ty) < TRASH_RADIUS_PX;
  }

  const bind = useGesture(
    {
      onDragStart: () => {
        movedRef.current = false;
        baseRef.current = { x: layer.x, y: layer.y };
        onSelect();
        onDragStart();
      },
      onDrag: ({ movement: [mx, my], xy: [clientX, clientY] }) => {
        if (!movedRef.current && Math.hypot(mx, my) < TAP_THRESHOLD_PX) return;
        movedRef.current = true;

        const rect = stageRect();
        const newX = Math.max(0, Math.min(1, baseRef.current.x + mx / rect.width));
        const newY = Math.max(0, Math.min(1, baseRef.current.y + my / rect.height));
        onUpdate({ x: newX, y: newY });

        const over = isOverTrash(clientX, clientY);
        if (over !== trashHoverRef.current) {
          trashHoverRef.current = over;
          onTrashHoverChange(over);
        }
      },
      onDragEnd: ({ xy: [clientX, clientY] }) => {
        const wasOver = isOverTrash(clientX, clientY);
        trashHoverRef.current = false;
        onTrashHoverChange(false);
        if (!movedRef.current) {
          onTap();
        }
        onDragEnd(wasOver);
      },

      onPinchStart: ({ touches }) => {
        // iOS Safari dispara gestureevent ate em single-touch as vezes —
        // exige 2 dedos REAIS pra entrar em pinch. Sem essa guarda, drag
        // de 1 dedo virava resize/rotate.
        if ((touches ?? 0) < 2) return;
        movedRef.current = true;
        onSelect();
      },
      onPinch: ({ offset: [s, r], touches }) => {
        if ((touches ?? 0) < 2) return; // bloqueia false pinch
        const newScale = Math.max(0.3, Math.min(5, s));
        const newRotation = (r * Math.PI) / 180;
        onUpdate({ scale: newScale, rotation: newRotation });
      },
    },
    {
      drag: {
        filterTaps: false,
        pointer: { touch: true },
      },
      pinch: {
        from: () => [layer.scale, (layer.rotation * 180) / Math.PI],
        rubberband: true,
      },
    },
  );

  // Posicao em px relativo ao stage
  const rect = stageRef.current?.getBoundingClientRect();
  const stageW = rect?.width ?? 0;
  const stageH = rect?.height ?? 0;
  const px = layer.x * stageW;
  const py = layer.y * stageH;

  // Estilo do background
  const bgColor = layer.background === 'solid' ? layer.backgroundColor
    : layer.background === 'translucent' ? layer.backgroundColor
    : 'transparent';
  const padding = layer.background === 'none' ? '4px 8px' : '8px 14px';
  const textColor = layer.background === 'solid'
    ? autoContrastTextColor(layer.backgroundColor)
    : layer.color;

  return (
    <motion.div
      {...bind()}
      style={{
        position: 'absolute',
        left: px,
        top: py,
        touchAction: 'none',
        cursor: 'grab',
        willChange: 'transform',
        // Hit area extra (padding) facilita tap em textos curtos
        padding: 8,
        outline: selected ? '2px dashed rgba(255,255,255,0.4)' : 'none',
        outlineOffset: 2,
        borderRadius: 6,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
      } as React.CSSProperties}
      animate={{
        rotate: (layer.rotation * 180) / Math.PI,
        scale: layer.scale,
      }}
      transformTemplate={({ rotate, scale }) =>
        `translate3d(-50%, -50%, 0) rotate(${rotate}) scale(${scale})`
      }
      transition={{ type: 'tween', duration: 0 }}
    >
      <div
        style={{
          fontFamily: FONT_FAMILIES[layer.fontStyle],
          fontSize: layer.fontSize,
          color: textColor,
          background: bgColor,
          padding,
          borderRadius: layer.background === 'none' ? 0 : 10,
          textAlign: layer.align,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxWidth: '85vw',
          lineHeight: 1.2,
          textShadow: layer.background === 'none' && layer.fontStyle !== 'strong'
            ? '0 1px 4px rgba(0,0,0,0.5)' : undefined,
          ...fontStyleExtras(layer.fontStyle),
        }}
      >
        {layer.text || ' ' /* nbsp pra manter altura quando vazio */}
      </div>
    </motion.div>
  );
}
