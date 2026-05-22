// Lightbox reutilizavel pra visualizar imagens em tela cheia.
//
// Comportamento:
//   - Trava o scroll da pagina de fundo enquanto aberto (useLockBodyScroll)
//   - Swipe-down em mobile (> 80px) fecha o lightbox (estilo Instagram)
//   - Click no fundo OU no botao X fecha
//   - Anima o fade-out conforme o user arrasta
//   - createPortal pra escapar de qualquer overflow:hidden ancestor
//
// Usado em: FeedNews, UserProfileModal, MinhaContaTab, etc — qualquer
// lugar que abre uma foto em fullscreen.

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';

interface Props {
  src: string;
  onClose: () => void;
  /** z-index do overlay. Default 100000 (acima de quase tudo). */
  zIndex?: number;
  /** Cor do overlay. Default preto opaco. */
  background?: string;
  /** Conteudo extra a renderizar dentro (ex: caption, controles de carousel). */
  children?: React.ReactNode;
}

/**
 * Wrapper generico de lightbox: scroll lock + swipe-down-to-close.
 * Use quando o conteudo NAO eh apenas uma imagem (ex: video + caption,
 * carrossel, etc). Passa children customizado.
 */
export function MediaLightboxWrapper({
  onClose,
  zIndex = 100000,
  background = 'rgba(0,0,0,0.95)',
  children,
}: {
  onClose: () => void;
  zIndex?: number;
  background?: string;
  children?: React.ReactNode;
}) {
  useLockBodyScroll(true);
  const [dragY, setDragY] = useState(0);
  const dragStartRef = useRef<{ y: number; active: boolean } | null>(null);

  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length !== 1) return;
    dragStartRef.current = { y: e.touches[0].clientY, active: true };
  }
  function handleTouchMove(e: React.TouchEvent) {
    if (!dragStartRef.current?.active) return;
    const dy = e.touches[0].clientY - dragStartRef.current.y;
    if (dy > 0) setDragY(dy);
  }
  function handleTouchEnd() {
    if (dragStartRef.current?.active && dragY > 80) onClose();
    else setDragY(0);
    dragStartRef.current = null;
  }

  const overlayOpacity = dragY > 0 ? Math.max(0.4, 1 - dragY / 600) : 1;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        zIndex,
        background,
        opacity: overlayOpacity,
        transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
        transition: dragStartRef.current?.active ? 'none' : 'transform 0.25s ease-out, opacity 0.25s ease-out',
      }}
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {children}
    </div>,
    document.body,
  );
}

export function ImageLightbox({ src, onClose, zIndex = 100000, background = 'rgba(0,0,0,0.95)', children }: Props) {
  useLockBodyScroll(true);
  const [dragY, setDragY] = useState(0);
  const dragStartRef = useRef<{ y: number; active: boolean } | null>(null);

  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length !== 1) return;
    dragStartRef.current = { y: e.touches[0].clientY, active: true };
  }
  function handleTouchMove(e: React.TouchEvent) {
    if (!dragStartRef.current?.active) return;
    const dy = e.touches[0].clientY - dragStartRef.current.y;
    // So aceita arrasto pra baixo (> 0). Pra cima nao faz nada.
    if (dy > 0) setDragY(dy);
  }
  function handleTouchEnd() {
    if (dragStartRef.current?.active && dragY > 80) onClose();
    else setDragY(0);
    dragStartRef.current = null;
  }

  // Opacidade do overlay decai conforme arrasta (visual de "puxar pra fechar")
  const overlayOpacity = dragY > 0 ? Math.max(0.4, 1 - dragY / 600) : 1;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        zIndex,
        background,
        opacity: overlayOpacity,
        transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
        transition: dragStartRef.current?.active ? 'none' : 'transform 0.25s ease-out, opacity 0.25s ease-out',
      }}
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center z-10"
        style={{
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(6px)',
          top: 'calc(env(safe-area-inset-top) + 12px)',
        }}
        aria-label="Fechar"
      >
        <X className="w-5 h-5 text-white" />
      </button>
      <img
        src={src}
        alt=""
        className="max-w-full max-h-full object-contain rounded-xl select-none"
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />
      {children}
    </div>,
    document.body,
  );
}
