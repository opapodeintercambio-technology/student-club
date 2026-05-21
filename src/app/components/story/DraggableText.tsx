// Camada de TEXTO arrastavel + pinchavel no stage do story.
//
// MUDANCA DE ESTRATEGIA (apos varias tentativas com @use-gesture):
//   - DRAG (1 dedo): continua usando useDrag do @use-gesture (estavel).
//   - PINCH (2 dedos): DETECCAO MANUAL via TouchEvent direto. A versao
//     com usePinch do @use-gesture estava sofrendo de eventos espurios
//     no iOS Safari (gesturestart/change WebKit que dispara ate com 1
//     dedo). Mesma estrategia que ja funciona perfeitamente no
//     DraggableLayer dos stickers/emojis.
//
// motion.div pra animacoes suaves; transform via GPU (translate3d/scale/rotate).

import { useRef } from 'react';
import { motion } from 'motion/react';
import { useDrag } from '@use-gesture/react';
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
const TRASH_RADIUS_PX = 64;

export function DraggableText({
  layer, stageRef, selected, onSelect, onUpdate, onTap,
  onDragStart, onDragEnd, onTrashHoverChange,
}: Props) {
  const movedRef = useRef(false);
  const trashHoverRef = useRef(false);
  const baseRef = useRef({ x: layer.x, y: layer.y });

  // Estado do pinch manual via TouchEvent. NULL quando nao esta em pinch.
  const pinchRef = useRef<{
    startDist: number;
    startAngle: number;
    baseScale: number;
    baseRotation: number;
  } | null>(null);

  function stageRect() {
    return stageRef.current?.getBoundingClientRect() ?? new DOMRect(0, 0, 1, 1);
  }

  function isOverTrash(clientX: number, clientY: number): boolean {
    const r = stageRect();
    const tx = r.left + r.width / 2;
    const ty = r.bottom - 80;
    return Math.hypot(clientX - tx, clientY - ty) < TRASH_RADIUS_PX;
  }

  // ─── DRAG (1 dedo / mouse) via @use-gesture ──────────────────────
  const bind = useDrag(
    ({ movement: [mx, my], xy: [clientX, clientY], first, last }) => {
      // Se o pinch (2 dedos) esta ativo, IGNORA drag completamente.
      // pinchRef indica que estamos em modo multi-touch — soh sair pra
      // drag quando o pinch terminar (pinchRef volta a null).
      if (pinchRef.current) return;

      if (first) {
        movedRef.current = false;
        baseRef.current = { x: layer.x, y: layer.y };
        onSelect();
        onDragStart();
      }

      if (!movedRef.current && Math.hypot(mx, my) < TAP_THRESHOLD_PX) {
        if (last) {
          // Tap sem mover -> abre edicao
          onTap();
          onDragEnd(false);
        }
        return;
      }
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

      if (last) {
        const wasOver = isOverTrash(clientX, clientY);
        trashHoverRef.current = false;
        onTrashHoverChange(false);
        onDragEnd(wasOver);
      }
    },
    {
      filterTaps: false,
      pointer: { touch: true },
    },
  );

  // ─── PINCH MANUAL via TouchEvent ─────────────────────────────────
  // Detecta touchstart com >= 2 dedos -> inicia pinch. touchmove com 2
  // dedos -> calcula delta de distancia/angulo e aplica scale/rotation.
  // touchend ou < 2 dedos -> termina pinch. Garante zero falsos
  // positivos: NAO ha como entrar em pinch sem 2 dedos REAIS na tela.
  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length < 2) return; // 1 dedo = drag (useDrag handle)
    const t1 = e.touches[0], t2 = e.touches[1];
    const dx = t2.clientX - t1.clientX;
    const dy = t2.clientY - t1.clientY;
    pinchRef.current = {
      startDist: Math.hypot(dx, dy),
      startAngle: Math.atan2(dy, dx),
      baseScale: layer.scale,
      baseRotation: layer.rotation,
    };
    onSelect();
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!pinchRef.current || e.touches.length < 2) return;
    // Bloqueia rolagem/zoom nativo durante pinch
    if (e.cancelable) e.preventDefault();
    const t1 = e.touches[0], t2 = e.touches[1];
    const dx = t2.clientX - t1.clientX;
    const dy = t2.clientY - t1.clientY;
    const dist = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const ratio = dist / pinchRef.current.startDist;
    const newScale = Math.max(0.3, Math.min(5, pinchRef.current.baseScale * ratio));
    const newRotation = pinchRef.current.baseRotation + (angle - pinchRef.current.startAngle);
    onUpdate({ scale: newScale, rotation: newRotation });
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (e.touches.length < 2) {
      pinchRef.current = null;
    }
  }

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
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      style={{
        position: 'absolute',
        left: px,
        top: py,
        touchAction: 'none',
        cursor: 'grab',
        willChange: 'transform',
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
        {layer.text || ' '}
      </div>
    </motion.div>
  );
}
