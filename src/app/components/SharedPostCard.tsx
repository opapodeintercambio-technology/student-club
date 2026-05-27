// Card de POST compartilhado no chat (estilo Instagram DM).
// Renderiza thumbnail + author + caption. Click dispara papo-open-post
// (App.tsx escuta e abre o PostDetailModal por cima do chat).
//
// FALLBACK RETROATIVO: shares antigos (anteriores ao fix do thumbnail
// Cloudflare Stream em FeedNews/buildSharePayload) chegaram no DB sem
// o campo `thumbnail`. Pra esses, buscamos o post no Supabase e
// derivamos o thumbnail a partir do video_url. Cache em memoria por
// postId pra nao refetchar.
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { SharedPostData } from '../utils/chatCrypto';

interface Props {
  shared: SharedPostData;
  isMine: boolean;
}

// Extrai o thumbnail do Cloudflare Stream a partir do video_url HLS.
// URL: https://videodelivery.net/<32-hex>/manifest/video.m3u8
// Thumb: https://videodelivery.net/<id>/thumbnails/thumbnail.jpg
function deriveCloudflareThumb(videoUrl: string | null | undefined): string | undefined {
  if (!videoUrl) return undefined;
  const m = videoUrl.match(/videodelivery\.net\/([a-f0-9]+)\//i);
  return m ? `https://videodelivery.net/${m[1]}/thumbnails/thumbnail.jpg` : undefined;
}

// Cache em memoria: postId -> thumbnail derivado (ou null se nao tem video).
const _thumbCache = new Map<string, string | null>();

export function SharedPostCard({ shared, isMine }: Props) {
  const [fallbackThumb, setFallbackThumb] = useState<string | undefined>(
    () => _thumbCache.get(shared.postId) || undefined,
  );

  useEffect(() => {
    // Ja tem thumbnail no payload? nao precisa fetchar.
    if (shared.thumbnail) return;
    // Cache hit? usa direto.
    if (_thumbCache.has(shared.postId)) {
      const cached = _thumbCache.get(shared.postId);
      if (cached) setFallbackThumb(cached);
      return;
    }
    // So vale a pena fetchar pra video (foto/youtube ja teriam o thumb).
    if (shared.postType !== 'video') return;

    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('feed_posts')
          .select('video_url')
          .eq('id', shared.postId)
          .maybeSingle();
        const t = deriveCloudflareThumb((data as any)?.video_url);
        _thumbCache.set(shared.postId, t || null);
        if (!cancelled && t) setFallbackThumb(t);
      } catch { /* silently ignore */ }
    })();
    return () => { cancelled = true; };
  }, [shared.postId, shared.thumbnail, shared.postType]);

  const openPost = () => {
    window.dispatchEvent(new CustomEvent('papo-open-post', {
      detail: { postId: shared.postId },
    }));
  };

  const thumb = shared.thumbnail || fallbackThumb;
  const isVideo = shared.postType === 'video' || shared.postType === 'youtube';

  return (
    <button
      type="button"
      onClick={openPost}
      className="overflow-hidden rounded-md active:scale-[0.98] transition-transform text-left block"
      style={{
        background: isMine ? 'rgba(255,255,255,0.10)' : 'var(--sc-bg-card)',
        border: '1px solid rgba(0,0,0,0.10)',
        maxWidth: 260,
        padding: 0,
        cursor: 'pointer',
        width: '100%',
        touchAction: 'manipulation',
      }}
      aria-label="Ver post"
    >
      {/* Thumbnail (foto/video poster/YT thumb) */}
      {thumb && (
        <div
          style={{
            width: '100%',
            aspectRatio: '1 / 1',
            background: `#000 url(${thumb}) center/cover no-repeat`,
            position: 'relative',
          }}
        >
          {isVideo && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                background: 'rgba(0,0,0,0.6)', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
              </div>
            </div>
          )}
        </div>
      )}
      {/* Footer: author + caption */}
      <div className="px-2.5 py-2 flex items-center gap-2">
        {shared.authorPhoto ? (
          <img src={shared.authorPhoto} alt={shared.authorUsername} className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-6 h-6 rounded-full flex-shrink-0" style={{ background: 'linear-gradient(135deg, #1e714a, #91a199)' }} />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold truncate" style={{ color: isMine ? '#fff' : 'var(--sc-text-primary)' }}>
            {shared.authorUsername}
          </p>
          {shared.caption && (
            <p className="text-[11px] truncate" style={{ color: isMine ? 'rgba(255,255,255,0.75)' : 'var(--sc-text-secondary)' }}>
              {shared.caption}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}
