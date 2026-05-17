// Modal de detalhe de um post (aberto a partir de notificacao de like ou
// comment). Mostra o post completo + comentarios em um overlay full-screen,
// sem precisar navegar pra home e rolar.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Heart, MessageCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';

interface PostRow {
  id: string;
  username: string;
  foto_perfil: string | null;
  text: string | null;
  image_url: string | null;
  video_url: string | null;
  likes: string[];
  views: string[];
  comments: Array<{ id: string; user: string; fotoPerfil?: string; text: string; createdAt: string }>;
  created_at: string;
}

interface Props {
  postId: string;
  onClose: () => void;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function PostDetailModal({ postId, onClose }: Props) {
  useLockBodyScroll(true);
  const [post, setPost] = useState<PostRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('feed_posts')
          .select('*')
          .eq('id', postId)
          .maybeSingle();
        if (cancelled) return;
        if (error) { setError(error.message); setLoading(false); return; }
        if (!data) { setError('Post nao encontrado (pode ter sido apagado).'); setLoading(false); return; }
        setPost(data as PostRow);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'erro');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [postId]);

  const comments = post?.comments || [];

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-stretch sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.85)' }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-xl bg-black sm:rounded-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: '100dvh', height: '100dvh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 flex-shrink-0"
          style={{
            background: '#0a0a0b',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            paddingTop: 'calc(env(safe-area-inset-top) + 12px)',
            paddingBottom: 12,
          }}
        >
          <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.08)' }}>
            <X className="w-4 h-4 text-white" />
          </button>
          <span className="text-white text-sm font-semibold">Post</span>
          <div className="w-9" />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto" style={{ color: '#fafaf7' }}>
          {loading ? (
            <div className="p-12 text-center text-white/60">Carregando…</div>
          ) : error ? (
            <div className="p-12 text-center text-red-300 text-sm">{error}</div>
          ) : post ? (
            <>
              {/* Author */}
              <div className="flex items-center gap-3 px-4 py-3">
                {post.foto_perfil ? (
                  <img src={post.foto_perfil} alt="" className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold"
                    style={{ background: 'linear-gradient(135deg,#5a7a52,#b8896a)' }}>
                    {post.username.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">@{post.username}</p>
                  <p className="text-xs text-white/50">{timeAgo(post.created_at)}</p>
                </div>
              </div>

              {/* Image / Video */}
              {post.image_url && (
                <div className="w-full flex items-center justify-center" style={{ background: '#000' }}>
                  <img src={post.image_url} alt="" className="max-w-full max-h-[60vh] object-contain" />
                </div>
              )}
              {post.video_url && (
                <div className="w-full flex items-center justify-center" style={{ background: '#000' }}>
                  <video src={post.video_url} controls playsInline className="max-w-full max-h-[60vh] object-contain" />
                </div>
              )}

              {/* Stats */}
              <div className="flex items-center gap-4 px-4 py-3"
                style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="flex items-center gap-1.5 text-sm font-semibold text-white/75">
                  <Heart className="w-5 h-5" />
                  {post.likes?.length || 0}
                </div>
                <div className="flex items-center gap-1.5 text-sm font-semibold text-white/75">
                  <MessageCircle className="w-5 h-5" />
                  {comments.length}
                </div>
              </div>

              {/* Text */}
              {post.text && (
                <div className="px-4 pb-3 text-[15px] leading-relaxed whitespace-pre-wrap text-white/90">
                  {post.text}
                </div>
              )}

              {/* Comments */}
              {comments.length > 0 && (
                <div className="px-4 py-3 space-y-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <p className="text-xs uppercase tracking-widest text-white/40 font-semibold">
                    Comentarios ({comments.length})
                  </p>
                  {comments.map((c) => (
                    <div key={c.id} className="flex items-start gap-2.5">
                      {c.fotoPerfil ? (
                        <img src={c.fotoPerfil} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                          style={{ background: 'linear-gradient(135deg,#5a7a52,#b8896a)' }}>
                          {c.user.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white">
                          <span className="font-semibold">@{c.user}</span>{' '}
                          <span className="text-white/85">{c.text}</span>
                        </p>
                        <p className="text-[10px] text-white/40">{timeAgo(c.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="h-8" />
            </>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
