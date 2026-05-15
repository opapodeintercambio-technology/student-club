import { useState, useEffect, useRef, useMemo, Fragment, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Image as ImageIcon, Send, Heart, MessageCircle, Eye,
  UserPlus, Search, Check, MoreHorizontal, Trash2,
} from 'lucide-react';
import { Stories } from './Stories';
import { supabase } from '../../lib/supabase';
import { isFriend, addFriend, removeFriend, getFriends, sendFriendRequest, cancelFriendRequest, hasSentRequest, getSentRequests } from './friends';
import { useLang } from '../i18n';
import { FriendsDrawer, useSwipeOpen } from './FriendsDrawer';
import { SAMPLE_POSTS } from '../utils/feedSamples';

// ─── Tipos ─────────────────────────────────────────────────────────────
interface FeedComment {
  id: string;
  user: string;
  fotoPerfil?: string;
  text: string;
  createdAt: string;
  parentId?: string;       // id do comentário pai quando for resposta
  replyTo?: string;        // username citado na resposta (pra renderizar "@user xxx")
}

interface FeedPost {
  id: string;
  username: string;
  fotoPerfil?: string;
  text: string;
  image?: string;     // dataURL ou objectURL
  video?: string;     // dataURL ou URL externa
  createdAt: string;
  likes: string[];
  views: string[];
  comments: FeedComment[];
}

interface SearchableUser {
  username: string;
  nome?: string | null;
  foto_perfil?: string | null;
  email?: string | null;
}

// ─── Storage (Supabase + cache local) ──────────────────────────────────
// Os posts vivem na tabela public.feed_posts no Supabase, visível pra todos.
// localStorage é usado APENAS como cache pra UI instantânea no boot.
const FEED_KEY = 'papo_feed_news_v1';

function rowToPost(r: any): FeedPost {
  return {
    id: r.id,
    username: r.username,
    fotoPerfil: r.foto_perfil ?? undefined,
    text: r.text || '',
    image: r.image_url ?? undefined,
    video: r.video_url ?? undefined,
    createdAt: r.created_at,
    likes: Array.isArray(r.likes) ? r.likes : [],
    views: Array.isArray(r.views) ? r.views : [],
    comments: Array.isArray(r.comments) ? r.comments : [],
  };
}

function postToRow(p: FeedPost) {
  return {
    id: p.id,
    username: p.username,
    foto_perfil: p.fotoPerfil ?? null,
    text: p.text || '',
    image_url: p.image ?? null,
    video_url: p.video ?? null,
    likes: p.likes,
    views: p.views,
    comments: p.comments,
    created_at: p.createdAt,
  };
}

function loadFeedCache(): FeedPost[] {
  try {
    const raw = localStorage.getItem(FEED_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

// CRÍTICO: NÃO disparar evento aqui — o listener `papo-feed-updated`
// chama fetchFeed → que chamava saveFeedCache → que disparava o evento
// → fetchFeed → LOOP INFINITO. O evento só deve ser emitido em ações
// do usuário (publicar/curtir/comentar/apagar), não em sync de leitura.
function saveFeedCache(list: FeedPost[], notify = true) {
  try { localStorage.setItem(FEED_KEY, JSON.stringify(list)); } catch {}
  if (notify) window.dispatchEvent(new CustomEvent('papo-feed-updated'));
}

async function fetchFeed(): Promise<FeedPost[]> {
  const { data, error } = await supabase
    .from('feed_posts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error || !data) return loadFeedCache();
  const posts = data.map(rowToPost);
  saveFeedCache(posts, false); // silent — não dispara evento, evita loop
  return posts;
}

async function insertPostRemote(p: FeedPost): Promise<void> {
  await supabase.from('feed_posts').insert(postToRow(p));
}

async function updatePostRemote(id: string, patch: Partial<{ likes: string[]; views: string[]; comments: FeedComment[] }>): Promise<void> {
  await supabase.from('feed_posts').update(patch).eq('id', id);
}

async function deletePostRemote(id: string): Promise<void> {
  await supabase.from('feed_posts').delete().eq('id', id);
}

// ─── Helpers ───────────────────────────────────────────────────────────
function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

async function fileToDataURL(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
}

// ─── Componente ────────────────────────────────────────────────────────
interface Props {
  currentUser: string;
  fotoPerfil?: string;
  onClose?: () => void;
  onOpenChat?: (username: string) => void;
  /** Renderiza inline (sem portal/fullscreen) — usado na home mobile */
  inline?: boolean;
  /** Função opcional chamada após cada post pra injetar conteúdo customizado
   *  (ex.: sugestões de amizade estilo Instagram). Retorne null pra não injetar. */
  renderBetweenPosts?: (afterIndex: number) => ReactNode;
}

export function FeedNews({ currentUser, fotoPerfil, onClose, onOpenChat, inline = false, renderBetweenPosts }: Props) {
  const { AT } = useLang();
  const [posts, setPosts] = useState<FeedPost[]>(() => loadFeedCache());
  const [newText, setNewText] = useState('');
  const [newImage, setNewImage] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [showFriends, setShowFriends] = useState(false);
  const [showFriendsDrawer, setShowFriendsDrawer] = useState(false);
  const swipeHandlers = useSwipeOpen(() => setShowFriendsDrawer(true));
  const fileRef = useRef<HTMLInputElement>(null);
  const seenRef = useRef<Set<string>>(new Set());

  // ── Paginação: mostra 6 inicialmente, carrega mais 6 quando scroll trigger entra na viewport
  const PAGE_SIZE = 6;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Mescla posts reais + samples (samples no final, ordenados por data)
  const allPosts = useMemo(() => {
    const realIds = new Set(posts.map(p => p.id));
    const samples = SAMPLE_POSTS.filter(s => !realIds.has(s.id)) as unknown as FeedPost[];
    return [...posts, ...samples];
  }, [posts]);

  const visiblePosts = useMemo(() => allPosts.slice(0, visibleCount), [allPosts, visibleCount]);
  const hasMore = visibleCount < allPosts.length;

  // IntersectionObserver — quando o sentinel entra em vista, carrega mais
  useEffect(() => {
    if (!hasMore || !loadMoreRef.current) return;
    const el = loadMoreRef.current;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !loadingMore) {
        setLoadingMore(true);
        // simula tempo de carregamento (UX) — 600ms
        setTimeout(() => {
          setVisibleCount(c => Math.min(c + PAGE_SIZE, allPosts.length));
          setLoadingMore(false);
        }, 600);
      }
    }, { rootMargin: '120px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadingMore, allPosts.length]);

  // Sync com Supabase no mount + a cada 30s + após eventos locais.
  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      const fresh = await fetchFeed();
      if (!cancelled) setPosts(fresh);
    };
    sync();
    const id = window.setInterval(sync, 30_000);
    window.addEventListener('papo-feed-updated', sync);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener('papo-feed-updated', sync);
    };
  }, []);

  // Marca como visualizado todo post renderizado uma única vez.
  useEffect(() => {
    let dirty = false;
    const next = posts.map(p => {
      if (p.username === currentUser) return p;
      if (seenRef.current.has(p.id)) return p;
      seenRef.current.add(p.id);
      if (p.views.includes(currentUser)) return p;
      dirty = true;
      const updated = { ...p, views: [...p.views, currentUser] };
      // Persiste assíncrono no Supabase
      updatePostRemote(p.id, { views: updated.views }).catch(() => {});
      return updated;
    });
    if (dirty) { setPosts(next); saveFeedCache(next); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts.length, currentUser]);

  async function handlePickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) { alert('Selecione uma imagem.'); return; }
    if (f.size > 8 * 1024 * 1024) { alert('Imagem grande demais (máx 8MB).'); return; }
    try {
      const url = await fileToDataURL(f);
      setCropSrc(url);
    } catch {
      alert('Erro ao ler a imagem.');
    }
  }

  async function publish() {
    if (!newText.trim() && !newImage) return;
    setPosting(true);
    try {
      const post: FeedPost = {
        id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        username: currentUser,
        fotoPerfil,
        text: newText.trim(),
        image: newImage || undefined,
        createdAt: new Date().toISOString(),
        likes: [],
        views: [],
        comments: [],
      };
      // Otimista: aparece imediato. Depois envia pro banco.
      const next = [post, ...posts];
      setPosts(next);
      saveFeedCache(next);
      setNewText('');
      setNewImage(null);
      await insertPostRemote(post);
    } finally {
      setPosting(false);
    }
  }

  function toggleLike(postId: string) {
    let nextLikes: string[] | null = null;
    const next = posts.map(p => {
      if (p.id !== postId) return p;
      const has = p.likes.includes(currentUser);
      nextLikes = has ? p.likes.filter(u => u !== currentUser) : [...p.likes, currentUser];
      return { ...p, likes: nextLikes };
    });
    setPosts(next);
    saveFeedCache(next);
    if (nextLikes) updatePostRemote(postId, { likes: nextLikes }).catch(() => {});
  }

  function deletePost(postId: string) {
    if (!confirm('Apagar este post?')) return;
    const next = posts.filter(p => p.id !== postId);
    setPosts(next);
    saveFeedCache(next);
    deletePostRemote(postId).catch(() => {});
  }

  function addComment(postId: string, text: string, parentId?: string, replyTo?: string) {
    if (!text.trim()) return;
    let nextComments: FeedComment[] | null = null;
    const next = posts.map(p => {
      if (p.id !== postId) return p;
      const c: FeedComment = {
        id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        user: currentUser,
        fotoPerfil,
        text: text.trim(),
        createdAt: new Date().toISOString(),
        parentId,
        replyTo,
      };
      nextComments = [...p.comments, c];
      return { ...p, comments: nextComments };
    });
    setPosts(next);
    saveFeedCache(next);
    if (nextComments) updatePostRemote(postId, { comments: nextComments }).catch(() => {});
  }

  function deleteComment(postId: string, commentId: string) {
    let nextComments: FeedComment[] | null = null;
    const next = posts.map(p => {
      if (p.id !== postId) return p;
      nextComments = p.comments.filter(c => c.id !== commentId);
      return { ...p, comments: nextComments };
    });
    setPosts(next);
    saveFeedCache(next);
    if (nextComments) updatePostRemote(postId, { comments: nextComments }).catch(() => {});
  }

  const containerProps = inline
    ? { className: 'flex flex-col overflow-hidden', style: { background: 'transparent', color: '#1a1a1a', minHeight: 400 } as React.CSSProperties }
    : { className: 'fixed inset-0 z-[9500] flex flex-col', style: { background: '#0a0a0b', color: '#fafaf7' } as React.CSSProperties };

  const content = (
    <div {...containerProps}>
      {/* Top bar — só no modo modal/dark. No inline (home) é omitida. */}
      {!inline && (
        <div
          className="flex items-center justify-between px-3 flex-shrink-0"
          style={{
            background: '#0a0a0b',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            paddingTop: 'calc(env(safe-area-inset-top) + 10px)',
            paddingBottom: 10,
          }}
        >
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
            aria-label="Fechar"
          >
            <X className="w-4 h-4" style={{ color: '#fafaf7' }} />
          </button>
          <h1
            className="text-base font-bold tracking-wide"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif', letterSpacing: '0.18em', color: '#fafaf7' }}
          >
            {AT.feedTitle}
          </h1>
          <button
            onClick={() => setShowFriends(true)}
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
            aria-label="Adicionar amigos"
            title="Adicionar / pesquisar amigos"
          >
            <UserPlus className="w-4 h-4" style={{ color: '#fafaf7' }} />
          </button>
        </div>
      )}

      {/* Stories e Friends bar — escondidos no inline (home) */}
      {!inline && (
        <>
          <div className="flex-shrink-0" style={{ background: '#101012', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <Stories currentUser={currentUser} compact dark />
          </div>
          <FriendsBarMobile currentUser={currentUser} onOpenChat={(u) => { onOpenChat?.(u); }} />
        </>
      )}

      {/* Scrollable content — 2 colunas em desktop (feed + amigos), 1 em mobile.
          Em mobile, swipe horizontal (para qualquer direção) abre o drawer
          com a mesma coluna de amigos do desktop. */}
      <div
        className={inline ? '' : 'flex-1 overflow-y-auto'}
        style={inline ? { background: 'transparent' } : { background: '#0a0a0b' }}
        onTouchStart={swipeHandlers.onTouchStart}
        onTouchEnd={swipeHandlers.onTouchEnd}
      >
        <div className={inline ? '' : 'max-w-[1080px] mx-auto flex gap-4 px-0 lg:px-4'}>
        <div className="flex-1 min-w-0">
        {/* Composer */}
        <div
          className={inline ? 'mt-1 mb-3 rounded-2xl p-3 space-y-2' : 'mx-3 mt-3 mb-4 rounded-2xl p-3 space-y-2'}
          style={inline
            ? { background: '#ffffff', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }
            : { background: '#15151a', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="flex items-start gap-2.5">
            <Avatar username={currentUser} fotoPerfil={fotoPerfil} size={36} />
            <textarea
              value={newText}
              onChange={e => setNewText(e.target.value)}
              placeholder={AT.feedPlaceholder}
              rows={2}
              className="flex-1 px-3 py-2 rounded-lg text-sm outline-none resize-none"
              style={inline
                ? { background: '#f5f5f4', color: '#1a1a1a', border: '1px solid #e5e7eb' }
                : { background: 'rgba(255,255,255,0.04)', color: '#fafaf7', border: '1px solid rgba(255,255,255,0.08)' }}
            />
          </div>
          {newImage && (
            <div className="relative rounded-xl overflow-hidden">
              <img src={newImage} alt="" className="w-full max-h-72 object-cover" />
              <button
                onClick={() => setNewImage(null)}
                className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(0,0,0,0.6)' }}
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          )}
          <div className="flex items-center justify-between">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handlePickImage}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
              style={inline
                ? { background: '#f5f5f4', color: '#5a7a52', border: '1px solid #e5e7eb' }
                : { background: 'rgba(255,255,255,0.06)', color: '#bcbcc0', border: '1px solid rgba(255,255,255,0.10)' }}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              {AT.feedPhoto}
            </button>
            <button
              onClick={publish}
              disabled={posting || (!newText.trim() && !newImage)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold disabled:opacity-40"
              style={{
                background: 'linear-gradient(135deg, #5a7a52 0%, #b8896a 100%)',
                color: '#fff',
                fontFamily: '"Source Serif 4", Georgia, serif',
                letterSpacing: '0.14em',
              }}
            >
              <Send className="w-3.5 h-3.5" />
              {posting ? AT.feedPosting : AT.feedPost}
            </button>
          </div>
        </div>

        {/* Feed */}
        {allPosts.length === 0 ? (
          <div className="text-center py-12 px-6" style={{ color: inline ? '#78716c' : 'rgba(255,255,255,0.45)' }}>
            <p className="text-sm">{AT.feedEmptyTitle}</p>
            <p className="text-xs mt-1">{AT.feedEmptyHint}</p>
          </div>
        ) : (
          <div className={inline ? 'space-y-3 pb-4' : 'space-y-3 px-3 pb-8'}>
            {visiblePosts.map((p, idx) => (
              <Fragment key={p.id}>
                <PostCard
                  post={p}
                  currentUser={currentUser}
                  fotoPerfil={fotoPerfil}
                  onToggleLike={() => toggleLike(p.id)}
                  onAddComment={(text, parentId, replyTo) => addComment(p.id, text, parentId, replyTo)}
                  onDeleteComment={(cid) => deleteComment(p.id, cid)}
                  onDeletePost={() => deletePost(p.id)}
                />
                {renderBetweenPosts ? renderBetweenPosts(idx) : null}
              </Fragment>
            ))}
            {/* Sentinel + Loading IG-style — só aparece se houver mais pra carregar */}
            {hasMore && (
              <div ref={loadMoreRef} className="flex items-center justify-center py-6">
                <div className="w-7 h-7 rounded-full border-2 border-gray-200 border-t-gray-500 animate-spin" />
              </div>
            )}
          </div>
        )}
        </div>

        {/* Sidebar de amigos online — escondida no inline */}
        {!inline && (
          <FriendsSidebar currentUser={currentUser} onOpenChat={(u) => { onOpenChat?.(u); }} />
        )}
        </div>
      </div>

      {showFriends && (
        <FriendsSearchModal currentUser={currentUser} onClose={() => setShowFriends(false)} />
      )}

      {/* Drawer mobile: mesma coluna de amigos do desktop, abre por swipe horizontal. */}
      <FriendsDrawer
        currentUser={currentUser}
        open={showFriendsDrawer}
        onClose={() => setShowFriendsDrawer(false)}
        dark
        onAddMore={() => setShowFriends(true)}
        onChat={(u) => { setShowFriendsDrawer(false); onOpenChat?.(u); }}
      />
      {cropSrc && (
        <CropImageModal
          src={cropSrc}
          onCancel={() => setCropSrc(null)}
          onConfirm={(dataUrl) => { setNewImage(dataUrl); setCropSrc(null); }}
        />
      )}
    </div>
  );

  return inline ? content : createPortal(content, document.body);
}

// ─── CropImageModal ───────────────────────────────────────────────────
// Estilo Instagram: imagem em viewport quadrado, drag + zoom, recorte
// final em 1080×1080 JPEG. Mantém todos os posts no mesmo aspecto e evita
// poluição visual no feed.
function CropImageModal({ src, onCancel, onConfirm }: {
  src: string;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void;
}) {
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const cropAreaRef = useRef<HTMLDivElement>(null);
  // viewport quadrado calculado dinamicamente — preenche o espaço entre header
  // e footer no mobile, cap em 440 no desktop
  const [view, setView] = useState(360);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    img.src = src;
  }, [src]);

  // Calcula o tamanho do viewport quadrado conforme o espaço disponível.
  useEffect(() => {
    function recalc() {
      const el = cropAreaRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const side = Math.max(200, Math.min(r.width, r.height));
      setView(side);
    }
    recalc();
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [imgSize]);

  // Trava o scroll do body enquanto o modal estiver aberto — evita que arrastar
  // a foto pra cima ou pra baixo role a página inteira (era isso que sumia
  // header e footer no mobile/desktop).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // calcula a escala "cover" base — menor lado da imagem cobre o viewport
  const baseScale = useMemo(() => {
    if (!imgSize) return 1;
    return view / Math.min(imgSize.w, imgSize.h);
  }, [imgSize, view]);

  const drawnW = imgSize ? imgSize.w * baseScale * zoom : 0;
  const drawnH = imgSize ? imgSize.h * baseScale * zoom : 0;

  function clampWith(o: { x: number; y: number }, w: number, h: number) {
    const maxX = Math.max(0, (w - view) / 2);
    const maxY = Math.max(0, (h - view) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, o.x)),
      y: Math.max(-maxY, Math.min(maxY, o.y)),
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    e.preventDefault();
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    setOffset(clampWith({ x: dragRef.current.ox + dx, y: dragRef.current.oy + dy }, drawnW, drawnH));
  }
  function onPointerUp() { dragRef.current = null; }

  function handleZoomChange(z: number) {
    setZoom(z);
    if (imgSize) {
      const w = imgSize.w * baseScale * z;
      const h = imgSize.h * baseScale * z;
      setOffset(o => clampWith(o, w, h));
    }
  }

  function confirm() {
    if (!imgSize) return;
    const OUT = 1080;
    const canvas = document.createElement('canvas');
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const cropSidePx = view / (baseScale * zoom);
    const cx = imgSize.w / 2 - offset.x / (baseScale * zoom);
    const cy = imgSize.h / 2 - offset.y / (baseScale * zoom);
    const sx = cx - cropSidePx / 2;
    const sy = cy - cropSidePx / 2;
    const tmp = new Image();
    tmp.onload = () => {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, OUT, OUT);
      ctx.drawImage(tmp, sx, sy, cropSidePx, cropSidePx, 0, 0, OUT, OUT);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
      onConfirm(dataUrl);
    };
    tmp.src = src;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.92)' }}
    >
      <div
        className="flex flex-col w-full sm:rounded-2xl overflow-hidden"
        style={{
          background: '#111',
          maxWidth: 'min(100vw, 440px)',
          height: '100dvh',
          maxHeight: '100dvh',
        }}
      >
        {/* Header — fixo no topo, respeita notch/Dynamic Island */}
        <div
          className="flex items-center justify-between px-4 flex-shrink-0"
          style={{
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            paddingTop: 'calc(env(safe-area-inset-top) + 12px)',
            paddingBottom: 12,
            background: '#111',
          }}
        >
          <button onClick={onCancel} className="text-white/80 text-sm font-medium px-2 py-1 -mx-2">Cancelar</button>
          <span className="text-white text-sm font-semibold">Ajustar foto</span>
          <button onClick={confirm} className="text-sm font-bold px-2 py-1 -mx-2" style={{ color: '#3b82f6' }}>Confirmar</button>
        </div>

        {/* Área do crop — preenche o meio. O ref dá o tamanho disponível;
            o viewport quadrado é centralizado dentro. overflow:hidden garante
            que a imagem ampliada não vaze nem dê impressão de "esticar". */}
        <div ref={cropAreaRef} className="flex-1 flex items-center justify-center min-h-0" style={{ background: '#000' }}>
          <div
            className="relative select-none"
            style={{ width: view, height: view, background: '#000', cursor: 'grab', touchAction: 'none', overflow: 'hidden' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {imgSize && (
              <img
                src={src}
                alt=""
                draggable={false}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: drawnW,
                  height: drawnH,
                  transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                  pointerEvents: 'none',
                  userSelect: 'none',
                  maxWidth: 'none',
                }}
              />
            )}
            {/* moldura quadrada (3x3) */}
            <div className="absolute inset-0 pointer-events-none" style={{
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.35)',
              backgroundImage:
                'linear-gradient(to right, transparent 33.33%, rgba(255,255,255,0.18) 33.33%, rgba(255,255,255,0.18) 33.66%, transparent 33.66%, transparent 66.33%, rgba(255,255,255,0.18) 66.33%, rgba(255,255,255,0.18) 66.66%, transparent 66.66%),' +
                'linear-gradient(to bottom, transparent 33.33%, rgba(255,255,255,0.18) 33.33%, rgba(255,255,255,0.18) 33.66%, transparent 33.66%, transparent 66.33%, rgba(255,255,255,0.18) 66.33%, rgba(255,255,255,0.18) 66.66%, transparent 66.66%)',
            }} />
          </div>
        </div>

        {/* Footer — slider de zoom, fixo, respeita home indicator */}
        <div
          className="px-4 flex items-center gap-3 flex-shrink-0"
          style={{
            background: '#111',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            paddingTop: 12,
            paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)',
          }}
        >
          <span className="text-white/60 text-xs">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
            className="flex-1 accent-blue-500"
          />
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── PostCard ──────────────────────────────────────────────────────────
interface PostCardProps {
  post: FeedPost;
  currentUser: string;
  fotoPerfil?: string;
  onToggleLike: () => void;
  onAddComment: (text: string, parentId?: string, replyTo?: string) => void;
  onDeleteComment: (cid: string) => void;
  onDeletePost: () => void;
}

function PostCard({ post, currentUser, fotoPerfil, onToggleLike, onAddComment, onDeleteComment, onDeletePost }: PostCardProps) {
  const [showAll, setShowAll] = useState(false);
  const [comment, setComment] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [replyTarget, setReplyTarget] = useState<{ parentId: string; user: string } | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const liked = post.likes.includes(currentUser);
  const isOwn = post.username === currentUser;
  const [heartBurst, setHeartBurst] = useState(false);
  const lastTapRef = useRef<number>(0);

  // Duplo-toque na imagem do post → curte (estilo Instagram).
  // Usa timestamp em vez de onDoubleClick pra funcionar bem em touch.
  function handleImageTap() {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      lastTapRef.current = 0;
      if (!liked) onToggleLike();
      setHeartBurst(true);
      window.setTimeout(() => setHeartBurst(false), 700);
    } else {
      lastTapRef.current = now;
    }
  }

  // Organiza comentários em árvore (top-level + replies indexadas pelo parentId)
  const topLevel = post.comments.filter(c => !c.parentId);
  const repliesByParent = useMemo(() => {
    const map = new Map<string, FeedComment[]>();
    for (const c of post.comments) {
      if (c.parentId) {
        const list = map.get(c.parentId) || [];
        list.push(c);
        map.set(c.parentId, list);
      }
    }
    return map;
  }, [post.comments]);

  const visibleTopLevel = showAll ? topLevel : topLevel.slice(-2);

  function startReply(parentId: string, user: string) {
    setReplyTarget({ parentId, user });
    setComment(`@${user} `);
    setExpandedReplies(prev => new Set(prev).add(parentId));
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function submitComment() {
    const text = comment.trim();
    if (!text) return;
    if (replyTarget) {
      const stripped = text.replace(new RegExp(`^@${replyTarget.user}\\s*`), '');
      onAddComment(stripped || text, replyTarget.parentId, replyTarget.user);
    } else {
      onAddComment(text);
    }
    setComment('');
    setReplyTarget(null);
  }

  function toggleReplies(parentId: string) {
    setExpandedReplies(prev => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#15151a', border: '1px solid rgba(255,255,255,0.06)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <div className="flex items-center gap-2.5">
          <Avatar username={post.username} fotoPerfil={post.fotoPerfil} size={36} />
          <div>
            <p className="text-sm font-semibold" style={{ color: '#fafaf7' }}>@{post.username}</p>
            <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.45)' }}>{timeAgo(post.createdAt)}</p>
          </div>
        </div>
        {isOwn && (
          <div className="relative">
            <button
              onClick={() => setShowMenu(m => !m)}
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ color: 'rgba(255,255,255,0.6)' }}
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {showMenu && (
              <div
                className="absolute right-0 top-9 rounded-lg overflow-hidden z-10"
                style={{ background: '#1f1f25', border: '1px solid rgba(255,255,255,0.10)', minWidth: 140 }}
              >
                <button
                  onClick={() => { setShowMenu(false); onDeletePost(); }}
                  className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-white/5"
                  style={{ color: '#fca5a5' }}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Apagar post
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Text */}
      {post.text && (
        <p
          className="text-sm leading-relaxed px-3 pb-2"
          style={{ color: 'rgba(255,255,255,0.88)', fontFamily: '"Source Serif 4", Georgia, serif', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
        >
          {post.text}
        </p>
      )}

      {/* Image — object-contain mantém a proporção original e mostra a foto inteira
           (com letterbox preto se a aspect ratio do container não bater). Antes era
           object-cover, que cropava no desktop e fazia parecer "expandida". */}
      {post.image && (
        <div
          className="relative w-full flex items-center justify-center select-none"
          style={{ background: '#000', cursor: 'pointer' }}
          onClick={handleImageTap}
          onDoubleClick={(e) => {
            e.preventDefault();
            if (!liked) onToggleLike();
            setHeartBurst(true);
            window.setTimeout(() => setHeartBurst(false), 700);
          }}
        >
          <img
            src={post.image}
            alt=""
            className="max-w-full max-h-[600px] object-contain pointer-events-none"
            loading="lazy"
            draggable={false}
          />
          {heartBurst && (
            <Heart
              className="absolute pointer-events-none"
              style={{
                width: 110,
                height: 110,
                color: '#fff',
                fill: '#f87171',
                filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.6))',
                animation: 'heartBurst 700ms ease-out forwards',
              }}
            />
          )}
        </div>
      )}

      {/* Video — mesmo tratamento */}
      {post.video && (
        <div className="w-full flex items-center justify-center" style={{ background: '#000' }}>
          <video
            src={post.video}
            controls
            playsInline
            preload="metadata"
            className="max-w-full max-h-[600px] object-contain"
          />
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center gap-4 px-3 py-2.5" style={{ borderTop: post.image || post.text ? '1px solid rgba(255,255,255,0.05)' : undefined }}>
        <button
          onClick={onToggleLike}
          className="flex items-center gap-1.5 text-sm font-semibold transition-all active:scale-90"
          style={{ color: liked ? '#f87171' : 'rgba(255,255,255,0.75)' }}
        >
          <Heart className="w-5 h-5" fill={liked ? '#f87171' : 'transparent'} />
          {post.likes.length > 0 && <span>{post.likes.length}</span>}
        </button>
        <div className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.75)' }}>
          <MessageCircle className="w-5 h-5" />
          {post.comments.length > 0 && <span>{post.comments.length}</span>}
        </div>
        <div className="flex items-center gap-1.5 text-sm font-semibold ml-auto" style={{ color: 'rgba(255,255,255,0.4)' }}>
          <Eye className="w-4 h-4" />
          <span className="text-xs">{post.views.length}</span>
        </div>
      </div>

      {/* Comments */}
      {topLevel.length > 0 && (
        <div className="px-3 pb-2 space-y-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          {!showAll && topLevel.length > 2 && (
            <button
              onClick={() => setShowAll(true)}
              className="text-xs pt-2"
              style={{ color: 'rgba(255,255,255,0.5)' }}
            >
              Ver todos os {topLevel.length} comentário{topLevel.length === 1 ? '' : 's'}
            </button>
          )}
          {visibleTopLevel.map(c => {
            const replies = repliesByParent.get(c.id) || [];
            const showReplies = expandedReplies.has(c.id);
            return (
              <div key={c.id}>
                <CommentRow
                  c={c}
                  currentUser={currentUser}
                  isOwnPost={isOwn}
                  onReply={() => startReply(c.id, c.user)}
                  onDelete={() => onDeleteComment(c.id)}
                />
                {replies.length > 0 && (
                  <div className="ml-9 mt-1">
                    {!showReplies ? (
                      <button
                        onClick={() => toggleReplies(c.id)}
                        className="text-[11px] flex items-center gap-1.5 py-1"
                        style={{ color: 'rgba(255,255,255,0.45)' }}
                      >
                        <span style={{ width: 22, height: 1, background: 'rgba(255,255,255,0.18)' }} />
                        Ver {replies.length} resposta{replies.length === 1 ? '' : 's'}
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => toggleReplies(c.id)}
                          className="text-[11px] flex items-center gap-1.5 py-1"
                          style={{ color: 'rgba(255,255,255,0.45)' }}
                        >
                          <span style={{ width: 22, height: 1, background: 'rgba(255,255,255,0.18)' }} />
                          Esconder respostas
                        </button>
                        <div className="space-y-1.5">
                          {replies.map(r => (
                            <CommentRow
                              key={r.id}
                              c={r}
                              currentUser={currentUser}
                              isOwnPost={isOwn}
                              small
                              onReply={() => startReply(c.id, r.user)}
                              onDelete={() => onDeleteComment(r.id)}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Comment composer */}
      <div className="px-3 py-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        {replyTarget && (
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Respondendo a <span className="font-semibold" style={{ color: '#b8896a' }}>@{replyTarget.user}</span>
            </span>
            <button
              onClick={() => { setReplyTarget(null); setComment(''); }}
              className="text-[11px]"
              style={{ color: 'rgba(255,255,255,0.4)' }}
            >
              cancelar
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Avatar username={currentUser} fotoPerfil={fotoPerfil} size={26} />
          <input
            ref={inputRef}
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder={replyTarget ? `Responder a @${replyTarget.user}…` : 'Comentar…'}
            onKeyDown={e => { if (e.key === 'Enter') submitComment(); }}
            className="flex-1 px-3 py-1.5 rounded-full text-xs outline-none"
            style={{ background: 'rgba(255,255,255,0.05)', color: '#fafaf7', border: '1px solid rgba(255,255,255,0.08)' }}
          />
          {comment.trim() && (
            <button
              onClick={submitComment}
              className="text-xs font-bold"
              style={{ color: '#b8896a', fontFamily: '"Source Serif 4", Georgia, serif', letterSpacing: '0.14em' }}
            >
              Publicar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── FriendsSidebar ────────────────────────────────────────────────────
interface FriendInfo {
  username: string;
  nome?: string | null;
  foto_perfil?: string | null;
  online: boolean;
  lastSeen?: string;
}

// Status simulado — em produção viraria Supabase Realtime Presence.
// Usa hash determinístico do username pra que o mesmo amigo apareça sempre online
// ou offline na mesma sessão (consistente até o reload).
function simulateOnline(username: string): boolean {
  let h = 0;
  for (let i = 0; i < username.length; i++) h = (h * 31 + username.charCodeAt(i)) >>> 0;
  // Junta com o minuto atual pra dar variação suave (~60% online).
  const tick = Math.floor(Date.now() / 60000);
  return ((h + tick) % 10) < 6;
}

// Variante mobile: faixa horizontal compacta com amigos (online primeiro).
function FriendsBarMobile({ currentUser, onOpenChat }: { currentUser: string; onOpenChat?: (u: string) => void }) {
  const [friends, setFriends] = useState<FriendInfo[]>([]);

  useEffect(() => {
    let cancelled = false;
    const reload = async () => {
      const usernames = getFriends(currentUser);
      if (usernames.length === 0) { if (!cancelled) setFriends([]); return; }
      let dbData: Record<string, { nome: string | null; foto_perfil: string | null }> = {};
      try {
        const { data } = await supabase
          .from('usuarios')
          .select('username,nome,foto_perfil')
          .in('username', usernames);
        for (const u of (data as any[]) || []) dbData[u.username] = { nome: u.nome, foto_perfil: u.foto_perfil };
      } catch {}
      if (cancelled) return;
      const list: FriendInfo[] = usernames.map(u => ({
        username: u,
        nome: dbData[u]?.nome,
        foto_perfil: dbData[u]?.foto_perfil,
        online: simulateOnline(u),
      }));
      list.sort((a, b) => {
        if (a.online !== b.online) return a.online ? -1 : 1;
        return a.username.localeCompare(b.username);
      });
      setFriends(list);
    };
    reload();
    const refresh = () => reload();
    window.addEventListener('papo-friends-updated', refresh);
    const tick = window.setInterval(reload, 60_000);
    return () => {
      cancelled = true;
      window.removeEventListener('papo-friends-updated', refresh);
      window.clearInterval(tick);
    };
  }, [currentUser]);

  if (friends.length === 0) return null;
  const onlineCount = friends.filter(f => f.online).length;

  return (
    <div
      className="lg:hidden flex-shrink-0 overflow-x-auto px-3 py-2.5"
      style={{ background: '#101012', borderBottom: '1px solid rgba(255,255,255,0.06)', scrollbarWidth: 'none' }}
    >
      <style>{`.lg\\:hidden::-webkit-scrollbar{display:none}`}</style>
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
          <span
            className="text-[9px] uppercase font-bold tracking-widest"
            style={{ color: '#b8896a', fontFamily: '"Source Serif 4", Georgia, serif', letterSpacing: '0.18em' }}
          >
            Amigos
          </span>
          <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: 'rgba(255,255,255,0.6)' }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#22c55e', boxShadow: '0 0 4px #22c55e' }} />
            {onlineCount} online
          </span>
        </div>
        {friends.map(f => (
          <button
            key={f.username}
            onClick={() => onOpenChat?.(f.username)}
            className="flex flex-col items-center gap-0.5 flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
            title={`Conversar com @${f.username}`}
          >
            <div className="relative">
              <Avatar username={f.username} fotoPerfil={f.foto_perfil || undefined} size={42} />
              <span
                className="absolute -bottom-0.5 -right-0.5 rounded-full"
                style={{
                  width: 12, height: 12,
                  background: f.online ? '#22c55e' : '#52525b',
                  border: '2px solid #101012',
                  boxShadow: f.online ? '0 0 4px #22c55e' : 'none',
                }}
              />
            </div>
            <span className="text-[9px] truncate max-w-[52px]" style={{ color: 'rgba(255,255,255,0.7)' }}>
              @{f.username}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function FriendsSidebar({ currentUser, onOpenChat }: { currentUser: string; onOpenChat?: (u: string) => void }) {
  const [friends, setFriends] = useState<FriendInfo[]>([]);

  useEffect(() => {
    let cancelled = false;
    const reload = async () => {
      const usernames = getFriends(currentUser);
      if (usernames.length === 0) { if (!cancelled) setFriends([]); return; }
      let dbData: Record<string, { nome: string | null; foto_perfil: string | null }> = {};
      try {
        const { data } = await supabase
          .from('usuarios')
          .select('username,nome,foto_perfil')
          .in('username', usernames);
        for (const u of (data as any[]) || []) {
          dbData[u.username] = { nome: u.nome, foto_perfil: u.foto_perfil };
        }
      } catch { /* sem rede — segue só com username */ }
      if (cancelled) return;
      const list: FriendInfo[] = usernames.map(u => ({
        username: u,
        nome: dbData[u]?.nome,
        foto_perfil: dbData[u]?.foto_perfil,
        online: simulateOnline(u),
      }));
      // Ordena: online primeiro, depois alfabético
      list.sort((a, b) => {
        if (a.online !== b.online) return a.online ? -1 : 1;
        return a.username.localeCompare(b.username);
      });
      setFriends(list);
    };
    reload();
    const refresh = () => reload();
    window.addEventListener('papo-friends-updated', refresh);
    // Re-checa status simulado a cada minuto
    const tick = window.setInterval(reload, 60_000);
    return () => {
      cancelled = true;
      window.removeEventListener('papo-friends-updated', refresh);
      window.clearInterval(tick);
    };
  }, [currentUser]);

  const onlineCount = friends.filter(f => f.online).length;

  return (
    <aside
      className="hidden lg:flex flex-col flex-shrink-0 sticky top-0 self-start"
      style={{
        width: 280,
        maxHeight: 'calc(100vh - 100px)',
        background: '#101012',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 16,
        marginTop: 12,
        marginBottom: 12,
        overflow: 'hidden',
      }}
    >
      <div
        className="px-4 py-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <p
          className="text-xs font-bold uppercase"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif', letterSpacing: '0.18em', color: '#b8896a' }}
        >
          Amigos do Chat
        </p>
        <div className="flex items-center gap-3 mt-1 text-[11px]" style={{ color: 'rgba(255,255,255,0.55)' }}>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
            <strong style={{ color: '#fafaf7' }}>{onlineCount}</strong> online
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.25)' }} />
            <strong style={{ color: '#fafaf7' }}>{friends.length - onlineCount}</strong> offline
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-1 py-1.5" style={{ scrollbarWidth: 'thin' }}>
        {friends.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
            <UserPlus className="w-6 h-6 mx-auto mb-2" style={{ color: 'rgba(255,255,255,0.3)' }} />
            Você ainda não tem amigos. Toque no <strong style={{ color: '#b8896a' }}>+ no topo</strong> pra adicionar alunos.
          </div>
        ) : (
          friends.map(f => <FriendRow key={f.username} f={f} onClick={() => onOpenChat?.(f.username)} />)
        )}
      </div>
    </aside>
  );
}

function FriendRow({ f, onClick }: { f: FriendInfo; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all hover:bg-white/5 cursor-pointer"
      title={f.online ? 'Online' : (f.lastSeen ? `Visto: ${f.lastSeen}` : 'Offline')}
    >
      <div className="relative flex-shrink-0">
        <Avatar username={f.username} fotoPerfil={f.foto_perfil || undefined} size={36} />
        <span
          className="absolute bottom-0 right-0 rounded-full"
          style={{
            width: 11, height: 11,
            background: f.online ? '#22c55e' : '#52525b',
            border: '2px solid #101012',
            boxShadow: f.online ? '0 0 6px #22c55e' : 'none',
          }}
        />
      </div>
      <div className="flex-1 min-w-0 text-left">
        <p className="text-xs font-semibold truncate" style={{ color: '#fafaf7' }}>
          {f.nome || `@${f.username}`}
        </p>
        <p className="text-[10px] truncate" style={{ color: f.online ? '#22c55e' : 'rgba(255,255,255,0.4)' }}>
          {f.online ? 'Online agora' : '@' + f.username}
        </p>
      </div>
      <MessageCircle className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100" style={{ color: 'rgba(255,255,255,0.5)' }} />
    </button>
  );
}

// ─── CommentRow ────────────────────────────────────────────────────────
interface CommentRowProps {
  c: FeedComment;
  currentUser: string;
  isOwnPost: boolean;
  small?: boolean;
  onReply: () => void;
  onDelete: () => void;
}
function CommentRow({ c, currentUser, isOwnPost, small, onReply, onDelete }: CommentRowProps) {
  const avatarSize = small ? 22 : 26;
  return (
    <div className="flex items-start gap-2 pt-1.5">
      <Avatar username={c.user} fotoPerfil={c.fotoPerfil} size={avatarSize} />
      <div className="flex-1 min-w-0">
        <p className={small ? 'text-[11px]' : 'text-xs'}>
          <span className="font-semibold" style={{ color: '#fafaf7' }}>@{c.user}</span>{' '}
          {c.replyTo && (
            <span className="font-semibold" style={{ color: '#b8896a' }}>@{c.replyTo} </span>
          )}
          <span style={{ color: 'rgba(255,255,255,0.85)' }}>{c.text}</span>
        </p>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{timeAgo(c.createdAt)}</span>
          <button
            onClick={onReply}
            className="text-[10px] font-semibold"
            style={{ color: 'rgba(255,255,255,0.55)' }}
          >
            Responder
          </button>
          {(c.user === currentUser || isOwnPost) && (
            <button
              onClick={onDelete}
              className="text-[10px]"
              style={{ color: 'rgba(255,255,255,0.35)' }}
            >
              remover
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Avatar ────────────────────────────────────────────────────────────
function Avatar({ username, fotoPerfil, size }: { username: string; fotoPerfil?: string; size: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 overflow-hidden"
      style={{
        width: size,
        height: size,
        background: 'linear-gradient(135deg, #5a7a52 0%, #b8896a 100%)',
        fontSize: Math.max(10, size * 0.32),
      }}
    >
      {fotoPerfil ? (
        <img src={fotoPerfil} alt={username} className="w-full h-full object-cover" />
      ) : (
        <span>{username.slice(0, 2).toUpperCase()}</span>
      )}
    </div>
  );
}

// ─── FriendsSearchModal ────────────────────────────────────────────────
interface FriendsSearchProps {
  currentUser: string;
  onClose: () => void;
}

function FriendsSearchModal({ currentUser, onClose }: FriendsSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchableUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [friendsTick, setFriendsTick] = useState(0);

  // Busca debounced pelo EMAIL do aluno. Tira espaços e ignora maiúsculas.
  // Se o usuário digitou o e-mail completo, tenta match exato primeiro;
  // senão faz busca parcial (ilike) em qualquer parte do e-mail.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) { setResults([]); return; }
    setLoading(true);
    const id = setTimeout(async () => {
      try {
        let { data } = await supabase
          .from('usuarios')
          .select('username,nome,foto_perfil,email')
          .ilike('email', `%${trimmed}%`)
          .neq('username', currentUser)
          .limit(20);
        setResults((data as SearchableUser[]) || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => clearTimeout(id);
  }, [query, currentUser]);

  useEffect(() => {
    const refresh = () => setFriendsTick(t => t + 1);
    window.addEventListener('papo-friends-updated', refresh);
    return () => window.removeEventListener('papo-friends-updated', refresh);
  }, []);

  const friendUsernames = useMemo(() => new Set(loadFriendsLocal(currentUser)), [currentUser, friendsTick]);
  const sentRequests = useMemo(() => new Set(getSentRequests(currentUser)), [currentUser, friendsTick]);

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[90vh] sm:max-h-[80vh] flex flex-col rounded-t-3xl sm:rounded-3xl overflow-hidden"
        style={{ background: '#101012', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
        >
          <h2
            className="text-base font-bold"
            style={{ color: '#fafaf7', fontFamily: '"Source Serif 4", Georgia, serif', letterSpacing: '0.12em' }}
          >
            Procurar amigos
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.08)', color: '#fafaf7' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="flex items-center gap-2 px-3 py-2 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}>
            <Search className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.45)' }} />
            <input
              autoFocus
              type="email"
              autoCapitalize="off"
              autoCorrect="off"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Digite o e-mail do aluno…"
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: '#fafaf7' }}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && (
            <p className="text-center py-8 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>buscando…</p>
          )}
          {!loading && query.trim() && results.length === 0 && (
            <p className="text-center py-8 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Nenhum aluno encontrado com esse e-mail.
            </p>
          )}
          {!loading && !query.trim() && (
            <p className="text-center py-8 text-xs px-6" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Digite o <strong>e-mail</strong> do aluno pra encontrar e adicionar como amigo.
            </p>
          )}
          {results.map(u => {
            const already = friendUsernames.has(u.username);
            const pending = sentRequests.has(u.username);
            return (
              <div
                key={u.username}
                className="flex items-center gap-3 px-4 py-3"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
              >
                <Avatar username={u.username} fotoPerfil={u.foto_perfil || undefined} size={42} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: '#fafaf7' }}>
                    {u.nome || `@${u.username}`}
                  </p>
                  {u.email && (
                    <p className="text-[11px] truncate" style={{ color: 'rgba(255,255,255,0.55)' }}>
                      {u.email}
                    </p>
                  )}
                  <p className="text-[10px] truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    @{u.username}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    if (already) {
                      await removeFriend(currentUser, u.username);
                    } else if (pending) {
                      await cancelFriendRequest(currentUser, u.username);
                    } else {
                      await sendFriendRequest(currentUser, u.username, {
                        from_email: undefined, // será preenchido pelo App se quiser
                      });
                    }
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap"
                  style={{
                    background:
                      already ? 'rgba(34,197,94,0.18)' :
                      pending ? 'rgba(255,255,255,0.06)' :
                                'linear-gradient(135deg, #5a7a52 0%, #b8896a 100%)',
                    color:
                      already ? '#22c55e' :
                      pending ? 'rgba(255,255,255,0.65)' :
                                '#fff',
                    border:
                      already ? '1px solid rgba(34,197,94,0.5)' :
                      pending ? '1px solid rgba(255,255,255,0.18)' :
                                'none',
                    fontFamily: '"Source Serif 4", Georgia, serif',
                    letterSpacing: '0.12em',
                  }}
                >
                  {already
                    ? <><Check className="w-3 h-3" /> Amigo</>
                    : pending
                      ? <>Pendente</>
                      : <><UserPlus className="w-3 h-3" /> Pedir amizade</>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function loadFriendsLocal(user: string): string[] {
  try {
    const raw = localStorage.getItem(`papo_friends_${user}`);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

// Helper para o componente também aceitar a regra: friend status
export function isFriendCurrent(user: string, target: string): boolean {
  return isFriend(user, target);
}
