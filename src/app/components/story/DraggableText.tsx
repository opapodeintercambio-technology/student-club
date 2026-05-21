// Camada de TEXTO arrastavel + pinchavel no stage.
//
// IMPLEMENTACAO: TouchEvent + MouseEvent puro (SEM @use-gesture).
// Eh EXATAMENTE a mesma logica do DraggableLayer (stickers/emojis) que
// funciona perfeitamente. Decidimos abandonar o @use-gesture aqui porque
// o usePinch interpretava GestureEvents do iOS Safari como rotacao
// espuria, e o useDrag tinha conflito de props com onTouchStart manual.

import { useRef } from 'react';
import type { TextLayer } from '../storyLayers';
import { FONT_FAMILIES, autoContrastTextColor, fontStyleExtras } from '../storyLayers';

interface Props {
  layer: TextLayer;
  stageRef: React.RefObject<HTMLDivElement>;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (patch: Partial<TextLayer>) => void;
  onTap: () => void;
  onDragStart: () => void;
  onDragEnd: (overTrash: boolean) => void;
  onTrashHoverChange: (over: boolean) => void;
}

const TAP_THRESHOLD_PX = 6;
const TRASH_RADIUS_PX = 60;

export function DraggableText({
  layer, stageRef, selected, onSelect, onUpdate, onTap,
  onDragStart, onDragEnd, onTrashHoverChange,
}: Props) {
  // ESTRATEGIA (igual DraggableLayer dos stickers): TouchEvent eh fonte de
  // verdade. e.touches.length DETERMINA o gesto exatamente:
  //   - 1 touch = pan
  //   - 2 touches = pinch + rotate
  // Sem palm rejection, sem ambiguidade, sem @use-gesture.

  const gestureRef = useRef<{
    kind: 'pan' | 'pinch';
    // pan
    startX?: number; startY?: number; baseX?: number; baseY?: number;
    // pinch
    startDist?: number; startAngle?: number; baseScale?: number; baseRotation?: number;
  } | null>(null);
  const movedRef = useRef(false);

  function stageRect() {
    return stageRef.current?.getBoundingClientRect() ?? new DOMRect(0, 0, 1, 1);
  }

  /** Decide gesto baseado em quantos touches estao ativos AGORA. */
  function initGesture(touches: { x: number; y: number }[]) {
    if (touches.length >= 2) {
      const [a, b] = touches;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      gestureRef.current = {
        kind: 'pinch',
        startDist: Math.hypot(dx, dy),
        startAngle: Math.atan2(dy, dx),
        baseScale: layer.scale,
        baseRotation: layer.rotation,
      };
    } else if (touches.length === 1) {
      gestureRef.current = {
        kind: 'pan',
        startX: touches[0].x, startY: touches[0].y,
        baseX: layer.x, baseY: layer.y,
      };
    } else {
      gestureRef.current = null;
    }
  }

  function readTouches(list: React.TouchList | TouchList) {
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      out.push({ x: t.clientX, y: t.clientY });
    }
    return out;
  }

  function applyMove(touches: { x: number; y: number }[]) {
    const g = gestureRef.current;
    if (!g) return;
    const rect = stageRect();

    if (g.kind === 'pinch' && touches.length >= 2) {
      const [a, b] = touches;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      if (g.startDist && g.baseScale != null && g.startAngle != null && g.baseRotation != null) {
        const ratio = dist / g.startDist;
        const newScale = Math.max(0.3, Math.min(5, g.baseScale * ratio));
        const newRotation = g.baseRotation + (angle - g.startAngle);
        onUpdate({ scale: newScale, rotation: newRotation });
      }
    } else if (g.kind === 'pan' && touches.length >= 1) {
      const t = touches[0];
      if (g.startX != null && g.startY != null && g.baseX != null && g.baseY != null) {
        const dxPx = t.x - g.startX;
        const dyPx = t.y - g.startY;
        // Threshold pra distinguir TAP de DRAG (iOS dispara micro-moves)
        if (!movedRef.current && Math.hypot(dxPx, dyPx) < TAP_THRESHOLD_PX) return;
        const dxNorm = dxPx / rect.width;
        const dyNorm = dyPx / rect.height;
        const newX = Math.max(0, Math.min(1, g.baseX + dxNorm));
        const newY = Math.max(0, Math.min(1, g.baseY + dyNorm));
        const trashCx = rect.left + rect.width / 2;
        const trashCy = rect.bottom - 80;
        const overTrash = Math.hypot(t.x - trashCx, t.y - trashCy) < TRASH_RADIUS_PX;
        onTrashHoverChange(overTrash);
        onUpdate({ x: newX, y: newY });
        movedRef.current = true;
      }
    }
  }

  function isOverTrashZone(x: number, y: number) {
    const rect = stageRect();
    const trashCx = rect.left + rect.width / 2;
    const trashCy = rect.bottom - 80;
    return Math.hypot(x - trashCx, y - trashCy) < TRASH_RADIUS_PX;
  }

  // ── TOUCH HANDLERS (mobile) ───────────────────────────────────────
  function onTouchStart(e: React.TouchEvent) {
    e.stopPropagation();
    onSelect();
    if (e.touches.length === 1) onDragStart();
    movedRef.current = false;
    initGesture(readTouches(e.touches));
  }
  function onTouchMove(e: React.TouchEvent) {
    e.stopPropagation();
    if (e.cancelable) e.preventDefault();
    applyMove(readTouches(e.touches));
  }
  function onTouchEnd(e: React.TouchEvent) {
    e.stopPropagation();
    const last = e.changedTouches[0];
    const wasOver = last ? isOverTrashZone(last.clientX, last.clientY) : false;
    initGesture(readTouches(e.touches));
    if (e.touches.length === 0) {
      onDragEnd(wasOver);
      onTrashHoverChange(false);
      if (!movedRef.current) {
        onTap();
      }
    }
  }
  function onTouchCancel(e: React.TouchEvent) { onTouchEnd(e); }

  // ── MOUSE HANDLERS (desktop) ──────────────────────────────────────
  function onMouseDown(e: React.MouseEvent) {
    if ((e.nativeEvent as any).sourceCapabilities?.firesTouchEvents) return;
    e.stopPropagation();
    onSelect();
    onDragStart();
    movedRef.current = false;
    initGesture([{ x: e.clientX, y: e.clientY }]);

    const onMove = (ev: MouseEvent) => {
      applyMove([{ x: ev.clientX, y: ev.clientY }]);
    };
    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const wasOver = isOverTrashZone(ev.clientX, ev.clientY);
      onDragEnd(wasOver);
      onTrashHoverChange(false);
      gestureRef.current = null;
      if (!movedRef.current) {
        onTap();
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // Posicao em px relativa ao stage
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
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
      onMouseDown={onMouseDown}
      style={{
        position: 'absolute',
        left: px,
        top: py,
        // Mesmo transform que o DraggableLayer usa — radianos diretos
        transform: `translate(-50%, -50%) rotate(${layer.rotation}rad) scale(${layer.scale})`,
        transformOrigin: 'center center',
        touchAction: 'none',
        cursor: 'grab',
        // Hit area extra (padding) pra facilitar tap em textos curtos
        padding: 8,
        outline: selected ? '2px dashed rgba(255,255,255,0.45)' : 'none',
        outlineOffset: 2,
        borderRadius: 6,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
        willChange: 'transform',
      } as React.CSSProperties}
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
        {layer.text || ' '}
      </div>
    </div>
  );
}
