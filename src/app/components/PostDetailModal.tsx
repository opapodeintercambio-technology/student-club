// Modal de detalhe de um post (aberto via notif de like/comment).
// Suporta curtir e comentar dentro do proprio modal — usuario nao
// precisa sair pra interagir.
import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Heart, MessageCircle, Send } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import { notifyUser } from '../utils/notify';
import { AutoText } from './AutoText';
import { HlsVideo } from './HlsVideo';
import { extractYouTubeId } from './FeedNews';

interface FeedComment {
  id: string;
  user: string;
  fotoPerfil?: string;
  text: string;
  createdAt: string;
  parentId?: string;
  replyTo?: string;
}

interface PostRow {
  id: string;
  username: string;
  foto_perfil: string | null;
  text: string | null;
  image_url: string | null;
  video_url: string | null;
  youtube_url: string | null;
  likes: string[];
  views: string[];
  comments: FeedComment[];
  created_at: string;
}

interface Props {
  postId: string;
  currentUser: string;
  fotoPerfil?: string;
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

export function PostDetailModal({ postId, currentUser, fotoPerfil, onClose }: Props) {
  useLockBodyScroll(true);
  const [post, setPost] = useState<PostRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [commentText, setCommentText] = useState('');
  const [posting, setPosting] = useState(false);
  const commentInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('feed_posts').select('*').eq('id', postId).maybeSingle();
        if (cancelled) return;
        if (error) { setError(error.message); setLoading(false); return; }
        if (!data) { setError('Post nao encontrado (pode ter sido apagado).'); setLoading(false); return; }
        setPost({
          ...(data as any),
          likes: Array.isArray((data as any).likes) ? (data as any).likes : [],
          comments: Array.isArray((data as any).comments) ? (data as any).comments : [],
        });
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'erro');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [postId]);

  const liked = !!(post && post.likes.includes(currentUser));

  async function toggleLike() {
    if (!post) return;
    const has = post.likes.includes(currentUser);
    const nextLikes = has ? post.likes.filter(u => u !== currentUser) : [...post.likes, currentUser];
    setPost({ ...post, likes: nextLikes });
    await supabase.from('feed_posts').update({ likes: nextLikes }).eq('id', post.id);
    // Push pra dono do post quando curte (nao quando descurte)
    if (!has && post.username !== currentUser) {
      notifyUser(post.username, currentUser, 'like', '❤️ Nova curtida',
        `${currentUser} curtiu seu post`,
        { refId: post.id, imageUrl: post.image_url || fotoPerfil });
    }
  }

  async function sendComment() {
    if (!post || !commentText.trim() || posting) return;
    setPosting(true);
    const text = commentText.trim();
    const c: FeedComment = {
      id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      user: currentUser,
      fotoPerfil,
      text,
      createdAt: new Date().toISOString(),
    };
    const nextComments = [...post.comments, c];
    setPost({ ...post, comments: nextComments });
    setCommentText('');
    try {
      await supabase.from('feed_posts').update({ comments: nextComments }).eq('id', post.id);
      if (post.username !== currentUser) {
        notifyUser(post.username, currentUser, 'comment', '💬 Novo comentário',
          `${currentUser}: ${text.slice(0, 100)}`,
          { refId: post.id, imageUrl: post.image_url || fotoPerfil });
      }
    } finally {
      setPosting(false);
    }
  }

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

        {/* Body scrollavel */}
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
                    style={{ background: 'linear-gradient(135deg,#1e714a,#4ade80)' }}>
                    {post.username.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{post.username}</p>
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
                  {/* HlsVideo wrapper: <video src=".m3u8"> so toca em Safari.
                      Cloudflare Stream entrega tudo via HLS, entao Chrome/
                      Firefox/Edge precisam do hls.js demuxar. Sem isso o
                      video do feed nao tocava no modal. */}
                  <HlsVideo
                    src={post.video_url}
                    controls
                    playsInline
                    className="max-w-full max-h-[60vh] object-contain"
                  />
                </div>
              )}
              {/* YouTube embed — feed tem MUITOS posts de YouTube Shorts.
                  PostDetailModal antes ignorava youtube_url e so mostrava
                  a legenda. Iframe com controls=1 + autoplay=0 (user da
                  play manualmente quando abrir o modal). */}
              {!post.video_url && post.youtube_url && (() => {
                const ytId = extractYouTubeId(post.youtube_url);
                if (!ytId) return null;
                return (
                  <div className="w-full" style={{ background: '#000', aspectRatio: '9 / 16', maxHeight: '70vh' }}>
                    <iframe
                      src={`https://www.youtube.com/embed/${ytId}?controls=1&rel=0&modestbranding=1&playsinline=1`}
                      title="YouTube video"
                      className="w-full h-full"
                      style={{ border: 0 }}
                      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                      allowFullScreen
                    />
                  </div>
                );
              })()}

              {/* Acoes — curtir + abrir input de comentario */}
              <div className="flex items-center gap-4 px-4 py-3"
                style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <button
                  onClick={toggleLike}
                  className="flex items-center gap-1.5 text-sm font-semibold transition-all active:scale-90"
                  style={{ color: liked ? '#f87171' : 'rgba(255,255,255,0.75)' }}
                >
                  <Heart className="w-5 h-5" fill={liked ? '#f87171' : 'transparent'} />
                  {post.likes.length}
                </button>
                <button
                  onClick={() => commentInputRef.current?.focus()}
                  className="flex items-center gap-1.5 text-sm font-semibold transition-all active:scale-90"
                  style={{ color: 'rgba(255,255,255,0.75)' }}
                >
                  <MessageCircle className="w-5 h-5" />
                  {post.comments.length}
                </button>
              </div>

              {/* Text */}
              {post.text && (
                <AutoText
                  as="div"
                  text={post.text}
                  className="px-4 pb-3 text-[15px] leading-relaxed whitespace-pre-wrap text-white/90"
                />
              )}

              {/* Comments */}
              {post.comments.length > 0 && (
                <div className="px-4 py-3 space-y-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <p className="text-xs uppercase tracking-widest text-white/40 font-semibold">
                    Comentarios ({post.comments.length})
                  </p>
                  {post.comments.map((c) => (
                    <div key={c.id} className="flex items-start gap-2.5">
                      {c.fotoPerfil ? (
                        <img src={c.fotoPerfil} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                          style={{ background: 'linear-gradient(135deg,#1e714a,#4ade80)' }}>
                          {c.user.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white">
                          <span className="font-semibold">{c.user}</span>{' '}
                          <AutoText text={c.text} className="text-white/85" />
                        </p>
                        <p className="text-[10px] text-white/40">{timeAgo(c.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="h-4" />
            </>
          ) : null}
        </div>

        {/* Footer fixo — input de comentario */}
        {post && !loading && !error && (
          <form
            onSubmit={(e) => { e.preventDefault(); sendComment(); }}
            className="flex items-center gap-2 px-3 flex-shrink-0"
            style={{
              background: '#0a0a0b',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              paddingTop: 10,
              paddingBottom: 'calc(env(safe-area-inset-bottom) + 10px)',
            }}
          >
            {fotoPerfil ? (
              <img src={fotoPerfil} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                style={{ background: 'linear-gradient(135deg,#1e714a,#4ade80)' }}>
                {currentUser.slice(0, 2).toUpperCase()}
              </div>
            )}
            <input
              ref={commentInputRef}
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Adicionar comentário…"
              className="flex-1 px-3 py-2 rounded-full text-sm outline-none"
              style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)' }}
            />
            <button
              type="submit"
              disabled={posting || !commentText.trim()}
              className="w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-40 transition-opacity"
              style={{ background: 'linear-gradient(135deg, #1e714a, #154732)' }}
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
