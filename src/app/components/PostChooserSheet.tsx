// Bottom sheet UNIFICADO pra escolher entre postar Story ou Feed.
//
// Acionado por:
//   - Swipe horizontal no feed (substituiu o swipe-pra-abrir-FriendsDrawer)
//   - Botao "Post" (camera) da bottom nav
//
// Cada opcao dispara o evento global correspondente:
//   - papo-open-story-camera -> Stories.tsx abre o StoryCamera fullscreen
//   - papo-open-composer    -> FeedNews.tsx abre o composer de post do feed

import { createPortal } from 'react-dom';
import { Camera, Image as ImageIcon } from 'lucide-react';

interface Props {
  onClose: () => void;
}

export function PostChooserSheet({ onClose }: Props) {
  function openStory() {
    onClose();
    // Pequeno delay pra deixar o sheet fechar suave antes da camera abrir
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('papo-open-story-camera'));
    }, 50);
  }
  function openFeed() {
    onClose();
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('papo-open-composer'));
    }, 50);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100050] flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md rounded-t-3xl overflow-hidden"
        style={{ background: '#15151a', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <p
            className="text-xs uppercase tracking-widest font-semibold text-white/55"
            style={{ letterSpacing: '0.18em' }}
          >
            O que vamos postar?
          </p>
        </div>

        {/* STORY */}
        <button
          onClick={openStory}
          className="w-full flex items-center gap-3 px-4 py-4 text-left text-white hover:bg-white/5 active:bg-white/10 transition-colors"
        >
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, #1e714a 0%, #4ade80 100%)',
            }}
          >
            <Camera className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
              Story
            </p>
            <p className="text-xs text-white/55">Foto ou vídeo curto, expira em 24h</p>
          </div>
        </button>

        {/* FEED */}
        <button
          onClick={openFeed}
          className="w-full flex items-center gap-3 px-4 py-4 text-left text-white hover:bg-white/5 active:bg-white/10 transition-colors"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)',
            }}
          >
            <ImageIcon className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
              Feed
            </p>
            <p className="text-xs text-white/55">Foto, vídeo ou carrossel — fica permanente no perfil</p>
          </div>
        </button>

        <button
          onClick={onClose}
          className="w-full px-4 py-3 text-sm text-white/60"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          Cancelar
        </button>

        <div style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }} />
      </div>
    </div>,
    document.body,
  );
}
