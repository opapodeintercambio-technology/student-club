import { useState, useEffect, useRef, useMemo, Fragment, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Image as ImageIcon, Send, Heart, MessageCircle, Eye,
  UserPlus, Search, Check, MoreHorizontal, Trash2, Video as VideoIcon, Loader2,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { Stories, fetchUsernamesWithStories } from './Stories';
import { FeedVideo } from './FeedVideo';
import { MentionAutocompleteTextarea } from './MentionAutocompleteTextarea';
import { VideoEditor } from './VideoEditor';
import { uploadVideoToStream } from '../utils/streamUpload';
import { supabase } from '../../lib/supabase';
import { isFriend, addFriend, removeFriend, getFriends, sendFriendRequest, cancelFriendRequest, hasSentRequest, getSentRequests } from './friends';
import { useLang } from '../i18n';
import { FriendsDrawer, useSwipeOpen } from './FriendsDrawer';
import { SAMPLE_POSTS } from '../utils/feedSamples';
import { notifyUser } from '../utils/notify';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import { AutoText } from './AutoText';

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
  image?: string;     // dataURL ou objectURL (single foto OU primeira do carrossel)
  /** Carrossel de fotos (estilo Instagram, ate 8). Quando length >= 2, o post
   *  e renderizado como carrossel com swipe + dots. image segue armazenando
   *  a primeira foto pra compat. */
  images?: string[];
  video?: string;     // dataURL ou URL externa
  /** Usernames mencionados (@) no post — recebem notif tipo mention_post. */
  mentions?: string[];
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

// ─── Interações em posts demo (samples) ────────────────────────────────
// Posts SAMPLE_POSTS não existem no DB; suas curtidas/comentários ficam só
// no localStorage para permitir engajamento até termos volume real.
const SAMPLE_INTERACTIONS_KEY = 'papo_feed_samples_interactions_v1';
type SampleInteraction = { likes: string[]; comments: FeedComment[] };
function loadSampleInteractions(): Record<string, SampleInteraction> {
  try {
    const raw = localStorage.getItem(SAMPLE_INTERACTIONS_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : {};
  } catch { return {}; }
}
function saveSampleInteractions(map: Record<string, SampleInteraction>) {
  try { localStorage.setItem(SAMPLE_INTERACTIONS_KEY, JSON.stringify(map)); } catch {}
}
const isSampleId = (id: string) => id.startsWith('sample-');

function rowToPost(r: any): FeedPost {
  const imagesArr: string[] | undefined = Array.isArray(r.images_urls) && r.images_urls.length > 0
    ? r.images_urls
    : undefined;
  return {
    id: r.id,
    username: r.username,
    fotoPerfil: r.foto_perfil ?? undefined,
    text: r.text || '',
    image: r.image_url ?? (imagesArr ? imagesArr[0] : undefined),
    images: imagesArr,
    video: r.video_url ?? undefined,
    mentions: Array.isArray(r.mentions) && r.mentions.length > 0 ? r.mentions : undefined,
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
    images_urls: p.images && p.images.length > 0 ? p.images : null,
    video_url: p.video ?? null,
    mentions: p.mentions && p.mentions.length > 0 ? p.mentions : null,
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

  // ENRICH: alguns posts ficam com foto_perfil snapshot velho ou vazio
  // (ex.: user postou ANTES de subir foto de perfil — fp.foto_perfil ficou
  // como string vazia, e ao salvar foto depois ninguem atualizou o feed_posts).
  // Buscamos a foto ATUAL dos autores em uma unica query bulk e sobrescrevemos.
  // Tambem cobre comments[].fotoPerfil de cada post.
  try {
    const usernames = Array.from(new Set([
      ...posts.map(p => p.username),
      ...posts.flatMap(p => (p.comments || []).map(c => c.user)),
    ].filter((u): u is string => !!u)));
    if (usernames.length > 0) {
      const { data: usersData } = await supabase
        .from('usuarios')
        .select('username, foto_perfil')
        .in('username', usernames);
      const fotoByUser = new Map<string, string | undefined>();
      for (const u of (usersData as any[] || [])) {
        if (u.foto_perfil) fotoByUser.set(u.username, u.foto_perfil);
      }
      for (const p of posts) {
        const fresh = fotoByUser.get(p.username);
        if (fresh) p.fotoPerfil = fresh;
        if (Array.isArray(p.comments)) {
          p.comments = p.comments.map(c => {
            const f = fotoByUser.get(c.user);
            return f ? { ...c, fotoPerfil: f } : c;
          });
        }
      }
    }
  } catch { /* sem rede no enrich — usa snapshots */ }

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
  // Modo modal (full-screen) trava o scroll da pagina por baixo no mobile.
  useLockBodyScroll(!inline);
  const { AT } = useLang();
  const [posts, setPosts] = useState<FeedPost[]>(() => loadFeedCache());
  const [sampleInteractions, setSampleInteractions] = useState<Record<string, SampleInteraction>>(() => loadSampleInteractions());
  const [newText, setNewText] = useState('');
  // newImages: array de dataURLs (1 = post foto unica, 2-8 = carrossel).
  // Compat: ao publicar, image = newImages[0] e images = newImages (se >=2).
  const [newImages, setNewImages] = useState<string[]>([]);
  const MAX_CAROUSEL = 8;
  const [newVideoFile, setNewVideoFile] = useState<File | null>(null);
  // Usernames mencionados (@). Ao publicar, cada um recebe notif mention_post.
  // Populado automaticamente pelo autocomplete inline da legenda quando o
  // user digita @ e seleciona alguem da sugestao (estilo Instagram).
  const [newMentions, setNewMentions] = useState<string[]>([]);
  const [newVideoPreview, setNewVideoPreview] = useState<string | null>(null);
  const [editingVideo, setEditingVideo] = useState<File | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [showFriends, setShowFriends] = useState(false);
  const [showFriendsDrawer, setShowFriendsDrawer] = useState(false);
  const [composerModalOpen, setComposerModalOpen] = useState(false);
  // Swipe da ESQUERDA pra direita (dedo vai da borda esquerda em direcao
  // a direita) → abre a CAMERA UNIFICADA em modo 'feed'. Visualmente, a
  // camera "entra pela esquerda" da tela.
  const swipeRightHandlers = useSwipeOpen(() => {
    window.dispatchEvent(new CustomEvent('papo-open-post-camera', { detail: { mode: 'feed' } }));
  }, 'right');
  // Swipe da DIREITA pra esquerda → abre o FriendsDrawer (coluna de
  // amigos online). Visualmente, o drawer "entra pela direita".
  const swipeLeftHandlers = useSwipeOpen(() => setShowFriendsDrawer(true), 'left');
  // Combina os dois sets de handlers num so onTouchStart/onTouchEnd —
  // chamam ambos em sequencia. Cada hook decide internamente se o gesto
  // bate com sua direcao alvo.
  const swipeHandlers = {
    onTouchStart: (e: React.TouchEvent) => {
      swipeRightHandlers.onTouchStart(e);
      swipeLeftHandlers.onTouchStart(e);
    },
    onTouchEnd: (e: React.TouchEvent) => {
      swipeRightHandlers.onTouchEnd(e);
      swipeLeftHandlers.onTouchEnd(e);
    },
  };
  const fileRef = useRef<HTMLInputElement>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);

  // Usernames que tem story ativo. Usado pra desenhar o anel da bandeira
  // da Irlanda em volta do avatar nos posts (estilo Instagram: se o user
  // tem story nao expirado, a foto de perfil ganha o ring colorido).
  const [storyUsers, setStoryUsers] = useState<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      const map = await fetchUsernamesWithStories();
      if (!cancelled) setStoryUsers(new Set(map.keys()));
    }
    refresh();
    const onUpd = () => refresh();
    window.addEventListener('papo-stories-updated', onUpd);
    return () => {
      cancelled = true;
      window.removeEventListener('papo-stories-updated', onUpd);
    };
  }, []);

  // TEMPO REAL: foto de perfil mudou → reflete em posts e comentários
  // do user afetado, sem precisar reload.
  useEffect(() => {
    const onUserUpdated = (e: Event) => {
      const d = (e as CustomEvent<{ username: string; foto_perfil: string | null }>).detail;
      if (!d?.username) return;
      setPosts(prev => prev.map(p => {
        const next = { ...p };
        if (p.username === d.username) next.fotoPerfil = d.foto_perfil ?? undefined;
        if (Array.isArray(p.comments)) {
          next.comments = p.comments.map(c =>
            c.user === d.username ? { ...c, fotoPerfil: d.foto_perfil ?? undefined } : c
          );
        }
        return next;
      }));
    };
    window.addEventListener('papo-user-updated', onUserUpdated);
    return () => window.removeEventListener('papo-user-updated', onUserUpdated);
  }, []);
  const seenRef = useRef<Set<string>>(new Set());

  // Botao camera mobile dispara este evento. Abre o composer modal (com
  // botoes Foto + Video + textarea + Mencionar). User escolhe Foto/Video
  // DENTRO do composer; o picker do dispositivo se abre a partir dali.
  // (Voltamos a este fluxo apos testes mostrarem que a camera live custom
  // nao tava boa o suficiente em iOS PWA.)
  useEffect(() => {
    const open = () => { setComposerModalOpen(true); };
    window.addEventListener('papo-open-composer', open);
    return () => window.removeEventListener('papo-open-composer', open);
  }, []);

  // Quando a camera unificada captura midia em modo POST, dispara este
  // evento com o arquivo. Logica INLINE (nao usa handlePickImage/Video
  // via closure stale) e BYPASSA a checagem newImages.length === 0 que
  // estava fazendo a foto cair no fluxo de carrossel (sem crop) quando
  // o estado nao estava 100% limpo.
  //
  // Camera/Gallery do StoryCamera sempre traz UMA midia → sempre fluxo
  // single-photo (crop modal) ou single-video (editor de trim).
  useEffect(() => {
    async function handler(e: Event) {
      const detail = (e as CustomEvent).detail || {};
      const file: File | undefined = detail.file;
      if (!file) return;
      const isVideo = file.type.startsWith('video/');
      if (isVideo) {
        if (file.size > 100 * 1024 * 1024) { alert('Vídeo grande demais (máx 100MB).'); return; }
        // Probe duracao pra avisar ANTES de abrir o editor (UX melhor)
        const dur = await new Promise<number>((res) => {
          const v = document.createElement('video');
          v.preload = 'metadata';
          v.onloadedmetadata = () => { res(v.duration || 0); URL.revokeObjectURL(v.src); };
          v.onerror = () => { res(0); };
          v.src = URL.createObjectURL(file);
        });
        if (dur > 60) {
          const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
          alert(
            `Seu vídeo tem ${fmt(dur)} — o limite de postagem no feed é 1:00 (1 minuto).\n\n` +
            `Vamos abrir o editor pra você cortar o trecho que quer postar (máximo 60s).`
          );
        }
        // Limpa fotos previas (foto e video sao mutuamente exclusivos)
        setNewImages([]);
        setEditingVideo(file);
        return;
      }
      // FOTO — sempre vai pro crop modal (single-photo flow).
      // CHAVE: usa URL.createObjectURL (SINCRONO) em vez de fileToDataURL
      // (async com FileReader). Mesma logica que o handleFile de Stories
      // pro fluxo do "+" badge (que funciona de primeira). O await do
      // FileReader anterior introduzia delay/race no primeiro tap — agora
      // setCropSrc dispara IMEDIATAMENTE apos onCapture, sem await.
      if (!file.type.startsWith('image/')) { alert('Selecione uma imagem.'); return; }
      if (file.size > 8 * 1024 * 1024) { alert('Imagem grande demais (máx 8MB).'); return; }
      const url = URL.createObjectURL(file);
      // Limpa estado previo: foto vinda da camera sempre comeca um post novo
      setNewImages([]);
      setCropSrc(url);
    }
    window.addEventListener('papo-composer-with-file', handler);
    return () => window.removeEventListener('papo-composer-with-file', handler);
  }, []);

  // ── Paginação: mostra 6 inicialmente, carrega mais 6 quando scroll trigger entra na viewport
  const PAGE_SIZE = 6;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Listener pra abrir um post especifico (vindo de click em notificacao).
  // Expande visibleCount se necessario pra que o post esteja renderizado,
  // depois rola ate o anchor #post-{id}.
  useEffect(() => {
    function onOpenPost(e: Event) {
      const detail = (e as CustomEvent).detail || {};
      const postId = detail.postId as string | undefined;
      if (!postId) return;
      const idx = posts.findIndex(p => p.id === postId);
      if (idx >= 0 && idx + 1 > visibleCount) {
        setVisibleCount(Math.min(posts.length, idx + 6));
      }
      // pequeno delay pra o DOM atualizar
      setTimeout(() => {
        const el = document.getElementById(`post-${postId}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 250);
    }
    window.addEventListener('papo-open-post', onOpenPost);
    return () => window.removeEventListener('papo-open-post', onOpenPost);
  }, [posts, visibleCount]);

  // Mescla posts reais + samples (samples no final, ordenados por data).
  // Hidrata samples com interações persistidas em localStorage (likes/comments
  // adicionados pelo user fluem no feed mesmo que o post não exista no DB).
  const allPosts = useMemo(() => {
    const realIds = new Set(posts.map(p => p.id));
    const samples = SAMPLE_POSTS
      .filter(s => !realIds.has(s.id))
      .map(s => {
        const extra = sampleInteractions[s.id];
        if (!extra) return s as unknown as FeedPost;
        return {
          ...s,
          // baseline do arquivo + interações reais do user (sem duplicar usernames)
          likes: Array.from(new Set([...(s.likes || []), ...(extra.likes || [])])),
          comments: [...(extra.comments || [])],
        } as unknown as FeedPost;
      });
    return [...posts, ...samples];
  }, [posts, sampleInteractions]);

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

  // Sync com Supabase no mount + REALTIME via postgres_changes em
  // feed_posts (INSERT/UPDATE/DELETE) + polling de fallback (60s).
  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      const fresh = await fetchFeed();
      if (!cancelled) setPosts(fresh);
    };
    sync();

    // Realtime: novo post, like, comentário, ou delete → atualiza state
    // local imediatamente sem refetch (entrega em ms pra todos).
    // Nome do canal com sufixo aleatório → evita o erro "cannot add
    // postgres_changes callbacks after subscribe()" quando o useEffect
    // re-roda em StrictMode e o Supabase devolve um canal já-inscrito do
    // cache interno se o nome bater.
    const ch = supabase
      .channel(`feed_posts:changes:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'feed_posts' }, (payload) => {
        const newPost = rowToPost(payload.new as any);
        setPosts(prev => prev.some(p => p.id === newPost.id) ? prev : [newPost, ...prev]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'feed_posts' }, (payload) => {
        const updated = rowToPost(payload.new as any);
        setPosts(prev => prev.map(p => p.id === updated.id ? updated : p));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'feed_posts' }, (payload) => {
        const id = (payload.old as any)?.id;
        if (id) setPosts(prev => prev.filter(p => p.id !== id));
      })
      .subscribe();

    // Polling como fallback (caso a sub realtime caia)
    const id = window.setInterval(sync, 60_000);
    window.addEventListener('papo-feed-updated', sync);
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
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
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    // Pick UNICO → fluxo original com crop (estilo InstagramSquare).
    if (files.length === 1 && newImages.length === 0) {
      const f = files[0];
      if (!f.type.startsWith('image/')) { alert('Selecione uma imagem.'); return; }
      if (f.size > 8 * 1024 * 1024) { alert('Imagem grande demais (máx 8MB).'); return; }
      try {
        const url = await fileToDataURL(f);
        setCropSrc(url);
      } catch { alert('Erro ao ler a imagem.'); }
      return;
    }

    // Pick MULTIPLO (ou append a carrossel ja iniciado) → carrossel sem crop.
    const room = MAX_CAROUSEL - newImages.length;
    const toAdd = files.slice(0, room);
    if (files.length > room) {
      alert(`Limite de ${MAX_CAROUSEL} fotos por carrossel. Apenas as primeiras ${room} foram adicionadas.`);
    }
    const dataUrls: string[] = [];
    for (const f of toAdd) {
      if (!f.type.startsWith('image/')) continue;
      if (f.size > 8 * 1024 * 1024) { alert(`"${f.name}" muito grande (máx 8MB por foto).`); continue; }
      try {
        dataUrls.push(await fileToDataURL(f));
      } catch { /* ignora */ }
    }
    if (dataUrls.length > 0) setNewImages(prev => [...prev, ...dataUrls]);
  }

  // Video usa Cloudflare Stream (Supabase não tem transcode HLS). Limites:
  //   - Tamanho: 100MB max
  //   - Duracao: 60s max (1 minuto, igual Reels)
  // Se passar de 60s, mostramos aviso e abrimos o editor pra user cortar.
  async function handlePickVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('video/')) { alert('Selecione um vídeo.'); return; }
    if (f.size > 100 * 1024 * 1024) { alert('Vídeo grande demais (máx 100MB).'); return; }

    // Probe duracao pra avisar ANTES de abrir o editor (UX melhor).
    const dur = await new Promise<number>((res) => {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => { res(v.duration || 0); URL.revokeObjectURL(v.src); };
      v.onerror = () => { res(0); };
      v.src = URL.createObjectURL(f);
    });
    if (dur > 60) {
      const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
      alert(
        `Seu vídeo tem ${fmt(dur)} — o limite de postagem no feed é 1:00 (1 minuto).\n\n` +
        `Vamos abrir o editor pra você cortar o trecho que quer postar (máximo 60s).`
      );
    }

    // Foto e vídeo são mutuamente exclusivos no post — limpa imagens se houver.
    setNewImages([]);
    // Abre o editor (trim + filtros). Só depois do confirm é que o arquivo
    // entra como newVideoFile e ganha preview.
    setEditingVideo(f);
  }

  function onVideoEditConfirm(edited: File) {
    setEditingVideo(null);
    setNewVideoFile(edited);
    if (newVideoPreview) URL.revokeObjectURL(newVideoPreview);
    setNewVideoPreview(URL.createObjectURL(edited));
    // Mobile: depois do editor de video, abre o composer pra legenda +
    // publicar (mesma logica do cropper de imagem). Desktop: composer eh
    // inline no feed, nao precisa de modal.
    if (window.matchMedia('(max-width: 639px)').matches) {
      setComposerModalOpen(true);
    }
  }

  function clearVideo() {
    if (newVideoPreview) URL.revokeObjectURL(newVideoPreview);
    setNewVideoPreview(null);
    setNewVideoFile(null);
  }

  async function publish() {
    if (!newText.trim() && newImages.length === 0 && !newVideoFile) return;
    setPosting(true);
    try {
      let videoUrl: string | undefined;
      if (newVideoFile) {
        setUploadPct(0);
        const result = await uploadVideoToStream(newVideoFile, (pct) => setUploadPct(pct));
        videoUrl = result.hlsUrl;
        setUploadPct(null);
      }
      const post: FeedPost = {
        id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        username: currentUser,
        fotoPerfil,
        text: newText.trim(),
        // image = primeira foto pra compat retroativa; images = array completo
        // quando >= 2 (carrossel). PostCard usa images quando length>=2.
        image: newImages[0],
        images: newImages.length >= 2 ? newImages : undefined,
        video: videoUrl,
        mentions: newMentions.length > 0 ? newMentions : undefined,
        createdAt: new Date().toISOString(),
        likes: [],
        views: [],
        comments: [],
      };
      // Otimista: aparece imediato. Depois envia pro banco.
      const next = [post, ...posts];
      setPosts(next);
      saveFeedCache(next);
      const mentionsToNotify = newMentions.slice();
      setNewText('');
      setNewImages([]);
      setNewMentions([]);
      clearVideo();
      setComposerModalOpen(false);
      await insertPostRemote(post);
      // Notif pra cada user mencionado. Thumb usa a primeira midia visivel
      // (foto/video thumbnail/dataURL pequeno). notifyUser ja faz downscale.
      if (mentionsToNotify.length > 0) {
        const preview = post.image || (post.video ? undefined : undefined);
        notifyUser(
          mentionsToNotify,
          currentUser,
          'mention_post',
          '📷 Mencionado em um post',
          `${currentUser} te mencionou em uma postagem`,
          { refId: post.id, imageUrl: preview },
        ).catch(() => {});
      }
    } catch (e: any) {
      alert('Erro ao publicar: ' + (e?.message || 'tente novamente'));
      setUploadPct(null);
    } finally {
      setPosting(false);
    }
  }

  function toggleLike(postId: string) {
    // Posts demo (SAMPLE_POSTS) não existem no DB — interações vão pro
    // localStorage paralelo e re-renderizam via sampleInteractions.
    if (isSampleId(postId)) {
      setSampleInteractions(prev => {
        const cur = prev[postId] || { likes: [], comments: [] };
        const has = cur.likes.includes(currentUser);
        const nextLikes = has
          ? cur.likes.filter(u => u !== currentUser)
          : [...cur.likes, currentUser];
        const next = { ...prev, [postId]: { ...cur, likes: nextLikes } };
        saveSampleInteractions(next);
        return next;
      });
      return;
    }
    let nextLikes: string[] | null = null;
    let didLike = false;
    let postOwner = '';
    const next = posts.map(p => {
      if (p.id !== postId) return p;
      const has = p.likes.includes(currentUser);
      didLike = !has;
      postOwner = p.username;
      nextLikes = has ? p.likes.filter(u => u !== currentUser) : [...p.likes, currentUser];
      return { ...p, likes: nextLikes };
    });
    setPosts(next);
    saveFeedCache(next);
    if (nextLikes) updatePostRemote(postId, { likes: nextLikes }).catch(() => {});
    // Push só quando CURTE (não quando descurte) e não é o próprio post
    if (didLike && postOwner && postOwner !== currentUser) {
      const post = posts.find(p => p.id === postId);
      // Prefere a foto do post (preview do que foi curtido). Se for post de
      // texto, cai pra avatar do remetente — assim o destinatário ainda vê
      // QUEM curtiu visualmente.
      notifyUser(postOwner, currentUser, 'like', '❤️ Nova curtida', `${currentUser} curtiu seu post`, {
        refId: postId,
        imageUrl: post?.image || fotoPerfil,
      });
    }
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
    const c: FeedComment = {
      id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      user: currentUser,
      fotoPerfil,
      text: text.trim(),
      createdAt: new Date().toISOString(),
      parentId,
      replyTo,
    };
    if (isSampleId(postId)) {
      setSampleInteractions(prev => {
        const cur = prev[postId] || { likes: [], comments: [] };
        const next = { ...prev, [postId]: { ...cur, comments: [...cur.comments, c] } };
        saveSampleInteractions(next);
        return next;
      });
      return;
    }
    let nextComments: FeedComment[] | null = null;
    let postOwner = '';
    const next = posts.map(p => {
      if (p.id !== postId) return p;
      postOwner = p.username;
      nextComments = [...p.comments, c];
      return { ...p, comments: nextComments };
    });
    setPosts(next);
    saveFeedCache(next);
    if (nextComments) updatePostRemote(postId, { comments: nextComments }).catch(() => {});
    // Push pro dono do post + também pro autor do comentário pai (se for resposta)
    const targets: string[] = [];
    if (postOwner && postOwner !== currentUser) targets.push(postOwner);
    if (replyTo && replyTo !== currentUser && !targets.includes(replyTo)) targets.push(replyTo);
    if (targets.length > 0) {
      const preview = text.trim().slice(0, 100);
      const title = replyTo ? '💬 Nova resposta' : '💬 Novo comentário';
      const post = posts.find(p => p.id === postId);
      notifyUser(targets, currentUser, 'comment', title, `${currentUser}: ${preview}`, {
        refId: postId,
        imageUrl: post?.image || fotoPerfil,
      });
    }
  }

  function deleteComment(postId: string, commentId: string) {
    if (isSampleId(postId)) {
      setSampleInteractions(prev => {
        const cur = prev[postId];
        if (!cur) return prev;
        const next = { ...prev, [postId]: { ...cur, comments: cur.comments.filter(c => c.id !== commentId) } };
        saveSampleInteractions(next);
        return next;
      });
      return;
    }
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

  // inline: SEM overflow-hidden — isso estava clipando o -mx-3 do PostCard,
  // impedindo que os posts no mobile fossem edge-to-edge (sobravam ~12px
  // pretos nas laterais). Sem overflow-hidden o post estende ate a borda da
  // tela. O home container pai (max-w-[1400px] mx-auto px-3) ja contem o
  // layout, entao remover overflow-hidden daqui nao gera scroll horizontal.
  const containerProps = inline
    ? { className: 'flex flex-col', style: { background: 'transparent', color: 'inherit', minHeight: 400 } as React.CSSProperties }
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
            style={{ fontFamily: '"DM Sans", system-ui, sans-serif', letterSpacing: '0.18em', color: '#fafaf7' }}
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

      {/* Stories e Friends bar — escondidos no inline (home).
          No inline (home), o Stories vem do header global (App.tsx).
          A barra de amigos so aparece quando FeedNews abre standalone. */}
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
        {/* Composer — escondido no mobile quando inline (vai abrir via modal pela bottom nav camera) */}
        <div
          className={inline ? 'composer-card mt-1 mb-3 p-3 space-y-2 hidden sm:block' : 'composer-card mx-3 mt-3 mb-4 p-3 space-y-2'}
          style={inline
            ? { background: '#ffffff', borderRadius: 28 }
            : { background: '#15151a', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 28 }}
        >
          <div className="flex items-start gap-2.5">
            <Avatar username={currentUser} fotoPerfil={fotoPerfil} size={36} />
            <MentionAutocompleteTextarea
              value={newText}
              onChange={setNewText}
              currentUser={currentUser}
              onMentionAdd={(u) => setNewMentions(prev => prev.includes(u) ? prev : [...prev, u])}
              popupTheme={inline ? 'light' : 'dark'}
              placeholder={AT.feedPlaceholder}
              rows={2}
              className="composer-textarea w-full px-4 py-2.5 text-sm outline-none resize-none"
              style={inline
                ? { background: '#f5f5f4', color: '#1a1a1a', border: '1px solid #e5e7eb', borderRadius: 22 }
                : { background: 'rgba(255,255,255,0.04)', color: '#fafaf7', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 22 }}
            />
          </div>
          {newImages.length > 0 && (
            <div className="space-y-2">
              {/* Preview principal — primeira foto em tamanho normal */}
              <div className="relative rounded-xl overflow-hidden">
                <img src={newImages[0]} alt="" className="w-full max-h-72 object-cover" />
                {newImages.length >= 2 && (
                  <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                    style={{ background: 'rgba(0,0,0,0.55)' }}>
                    Carrossel · {newImages.length}/{MAX_CAROUSEL}
                  </span>
                )}
                <button
                  onClick={() => setNewImages(prev => prev.filter((_, i) => i !== 0))}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(0,0,0,0.6)' }}
                  aria-label="Remover primeira foto"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
              {/* Strip horizontal das demais fotos do carrossel + botao Add */}
              {(newImages.length >= 2 || newImages.length === 1) && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {newImages.slice(1).map((src, i) => (
                    <div key={i} className="relative flex-shrink-0">
                      <img src={src} alt="" className="w-16 h-16 rounded-lg object-cover" />
                      <button
                        onClick={() => setNewImages(prev => prev.filter((_, idx) => idx !== i + 1))}
                        className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ background: '#dc2626' }}
                        aria-label={`Remover foto ${i + 2}`}
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  ))}
                  {newImages.length < MAX_CAROUSEL && (
                    <button
                      onClick={() => { const el = fileRef.current; if (!el) return; el.value = ''; el.click(); }}
                      className="w-16 h-16 rounded-lg flex flex-col items-center justify-center flex-shrink-0"
                      style={{ background: '#f3f4f6', border: '1px dashed #1e714a', color: '#1e714a' }}
                      aria-label="Adicionar mais fotos"
                    >
                      <ImageIcon className="w-4 h-4" />
                      <span className="text-[9px] font-bold mt-0.5">+ Foto</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {newVideoPreview && (
            <div className="relative rounded-xl overflow-hidden" style={{ background: '#000' }}>
              <video src={newVideoPreview} className="w-full max-h-72 object-contain" muted playsInline controls />
              <button
                onClick={clearVideo}
                className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(0,0,0,0.6)' }}
                aria-label="Remover vídeo"
              >
                <X className="w-4 h-4 text-white" />
              </button>
              {uploadPct !== null && (
                <div className="absolute bottom-0 left-0 right-0 px-3 py-2 flex items-center gap-2 text-white text-xs font-semibold" style={{ background: 'rgba(0,0,0,0.6)' }}>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Enviando vídeo… {Math.round(uploadPct * 100)}%
                </div>
              )}
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handlePickImage}
              style={{ display: 'none' }}
            />
            <input
              ref={videoFileRef}
              type="file"
              accept="video/mp4,video/quicktime,video/x-m4v,video/3gpp,video/webm,video/*,.mp4,.mov,.m4v,.3gp,.webm"
              // multiple aqui é truque pro iOS: com multiple+accept generico,
              // o Safari pula a action sheet "Take Photo or Video / Library /
              // Files" (que pede autorizacao da camera) e abre direto a galeria.
              // No onChange so usamos o files[0] — ignoramos os outros.
              multiple
              onChange={handlePickVideo}
              style={{ display: 'none' }}
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => { const el = fileRef.current; if (!el) return; el.value = ''; el.click(); }}
                disabled={!!newVideoFile || newImages.length >= MAX_CAROUSEL}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold disabled:opacity-40"
                style={inline
                  ? { background: '#deede5', color: '#1e714a', border: '1px solid #1e714a', borderRadius: 9999 }
                  : { background: 'rgba(255,255,255,0.06)', color: '#bcbcc0', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 9999 }}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                {AT.feedPhoto}
              </button>
              <button
                onClick={() => { const el = videoFileRef.current; if (!el) return; el.value = ''; el.click(); }}
                disabled={newImages.length > 0}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold disabled:opacity-40"
                style={inline
                  ? { background: '#eef2ff', color: '#3730a3', border: '1px solid #3730a3', borderRadius: 9999 }
                  : { background: 'rgba(255,255,255,0.06)', color: '#bcbcc0', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 9999 }}
                aria-label="Adicionar vídeo"
              >
                <VideoIcon className="w-3.5 h-3.5" />
                Vídeo
              </button>
              {/* Botao "@ Mencionar" foi REMOVIDO. Agora a mencao acontece
                  inline: ao digitar @ na legenda, um popup com sugestoes
                  aparece e o user escolhe quem quer marcar — estilo IG. */}
            </div>
            <button
              onClick={publish}
              disabled={posting || (!newText.trim() && newImages.length === 0 && !newVideoFile)}
              className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold disabled:opacity-40"
              style={{
                background: '#1e714a',
                color: '#fff',
                fontFamily: 'Lato, system-ui, sans-serif',
                letterSpacing: '0.14em',
                borderRadius: 9999,
              }}
            >
              {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
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
                <div id={`post-${p.id}`} style={{ scrollMarginTop: 80 }} />
                <PostCard
                  post={p}
                  currentUser={currentUser}
                  fotoPerfil={fotoPerfil}
                  hasStory={storyUsers.has(p.username)}
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

      {/* Drawer da coluna de amigos online — abre por swipe da DIREITA
          pra esquerda. Mesma coluna do desktop, mas em formato drawer. */}
      <FriendsDrawer
        currentUser={currentUser}
        open={showFriendsDrawer}
        onClose={() => setShowFriendsDrawer(false)}
        dark
        onAddMore={() => setShowFriends(true)}
        onChat={(u) => { setShowFriendsDrawer(false); onOpenChat?.(u); }}
      />

      {editingVideo && createPortal(
        <VideoEditor
          file={editingVideo}
          maxDuration={60}
          onCancel={() => setEditingVideo(null)}
          onConfirm={onVideoEditConfirm}
        />,
        document.body
      )}

      {cropSrc && (
        <CropImageModal
          src={cropSrc}
          onCancel={() => setCropSrc(null)}
          onConfirm={(dataUrl) => {
            // Push em newImages (foto unica vai como newImages[0]; se user
            // depois adicionar mais, vira carrossel)
            setNewImages(prev => [...prev, dataUrl]);
            setCropSrc(null);
            // Mobile: depois do crop, abre o composer pra escrever caption + publicar.
            // Desktop: composer ja eh inline no feed, nao precisa abrir modal.
            if (window.matchMedia('(max-width: 639px)').matches) {
              setComposerModalOpen(true);
            }
          }}
        />
      )}

      {/* Composer modal — abre via botao camera da bottom nav mobile.
          Fecha INSTANTANEAMENTE via display:none imperativo (bypassa o
          render-cycle do React que tava deixando o usuario pensar que
          o tap nao funcionou e tap-de-novo). */}
      {composerModalOpen && createPortal(
        <ComposerModalBody
          currentUser={currentUser}
          fotoPerfil={fotoPerfil}
          newText={newText}
          setNewText={setNewText}
          newImages={newImages}
          setNewImages={setNewImages}
          maxCarousel={MAX_CAROUSEL}
          onMentionAdd={(u) => setNewMentions(prev => prev.includes(u) ? prev : [...prev, u])}
          newVideoPreview={newVideoPreview}
          newVideoFile={newVideoFile}
          uploadPct={uploadPct}
          onPickVideo={handlePickVideo}
          onClearVideo={clearVideo}
          videoFileRef={videoFileRef}
          posting={posting}
          AT={AT}
          fileRef={fileRef}
          onPublish={publish}
          onClose={() => setComposerModalOpen(false)}
        />,
        document.body
      )}
    </div>
  );

  return inline ? content : createPortal(content, document.body);
}

// ─── ComposerModalBody ─────────────────────────────────────────────────
// Modal isolado de "Novo post" — sem IIFE / closures recriados. O close
// usa o truque de esconder via display:none imperativo ANTES do setState,
// garantindo feedback visual instantaneo mesmo se o React render atrasar
// (o que causava o famoso "duplo tap no X" em iOS Safari).
interface ComposerModalBodyProps {
  currentUser: string;
  fotoPerfil: string | null | undefined;
  newText: string;
  setNewText: (v: string) => void;
  newImages: string[];
  setNewImages: React.Dispatch<React.SetStateAction<string[]>>;
  maxCarousel: number;
  /** Callback quando uma mencao eh selecionada via autocomplete inline. */
  onMentionAdd: (username: string) => void;
  newVideoPreview: string | null;
  newVideoFile: File | null;
  uploadPct: number | null;
  onPickVideo: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearVideo: () => void;
  videoFileRef: React.RefObject<HTMLInputElement>;
  posting: boolean;
  AT: any;
  fileRef: React.RefObject<HTMLInputElement>;
  onPublish: () => void;
  onClose: () => void;
}

function ComposerModalBody({
  currentUser, fotoPerfil, newText, setNewText, newImages, setNewImages, maxCarousel,
  onMentionAdd,
  newVideoPreview, newVideoFile, uploadPct, onPickVideo, onClearVideo, videoFileRef,
  posting, AT, fileRef, onPublish, onClose,
}: ComposerModalBodyProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  // closeNow: esconde IMPERATIVAMENTE primeiro, blur teclado, depois desmonta
  // via setState. Bypassa o atraso de render do React + iOS keyboard intercept.
  const closeNow = () => {
    if (rootRef.current) rootRef.current.style.display = 'none';
    const ae = document.activeElement as HTMLElement | null;
    if (ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT')) ae.blur();
    onClose();
  };

  // No iOS Safari, com teclado aberto, o primeiro tap no X só fechava o
  // teclado (sistema "engole" o evento pra blur). onPointerDown dispara antes
  // do blur do sistema — pegamos o gesto na descida do dedo.
  const onClosePointer = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    closeNow();
  };

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) closeNow(); }}
    >
      <div className="w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl bg-white p-4 space-y-3" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-stone-800">Novo post</h3>
          <button
            type="button"
            onPointerDown={onClosePointer}
            onClick={closeNow}
            className="w-12 h-12 rounded-full hover:bg-stone-100 flex items-center justify-center -mr-2 active:bg-stone-200"
            aria-label="Fechar"
          >
            <X className="w-6 h-6 text-stone-600" />
          </button>
        </div>
        <div className="flex items-start gap-2.5">
          <Avatar username={currentUser} fotoPerfil={fotoPerfil || undefined} size={36} />
          <MentionAutocompleteTextarea
            value={newText}
            onChange={setNewText}
            currentUser={currentUser}
            onMentionAdd={onMentionAdd}
            popupTheme="light"
            placeholder={AT.feedPlaceholder}
            rows={4}
            className="w-full px-4 py-2.5 text-sm outline-none resize-none"
            style={{ background: '#f5f5f4', color: '#1a1a1a', border: '1px solid #e5e7eb', borderRadius: 22 }}
          />
        </div>
        {newImages.length > 0 && (
          <div className="space-y-2">
            <div className="relative rounded-xl overflow-hidden">
              <img src={newImages[0]} alt="" className="w-full max-h-72 object-cover" />
              {newImages.length >= 2 && (
                <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                  style={{ background: 'rgba(0,0,0,0.55)' }}>
                  Carrossel · {newImages.length}/{maxCarousel}
                </span>
              )}
              <button onClick={() => setNewImages(prev => prev.filter((_, i) => i !== 0))} className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} aria-label="Remover">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {newImages.slice(1).map((src, i) => (
                <div key={i} className="relative flex-shrink-0">
                  <img src={src} alt="" className="w-16 h-16 rounded-lg object-cover" />
                  <button
                    onClick={() => setNewImages(prev => prev.filter((_, idx) => idx !== i + 1))}
                    className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ background: '#dc2626' }}
                    aria-label={`Remover foto ${i + 2}`}
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ))}
              {newImages.length < maxCarousel && (
                <button
                  onClick={() => { const el = fileRef.current; if (!el) return; el.value = ''; el.click(); }}
                  className="w-16 h-16 rounded-lg flex flex-col items-center justify-center flex-shrink-0"
                  style={{ background: '#f3f4f6', border: '1px dashed #1e714a', color: '#1e714a' }}
                  aria-label="Adicionar mais fotos"
                >
                  <ImageIcon className="w-4 h-4" />
                  <span className="text-[9px] font-bold mt-0.5">+ Foto</span>
                </button>
              )}
            </div>
          </div>
        )}
        {newVideoPreview && (
          <div className="relative rounded-xl overflow-hidden" style={{ background: '#000' }}>
            <video src={newVideoPreview} className="w-full max-h-72 object-contain" muted playsInline controls />
            <button onClick={onClearVideo} className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} aria-label="Remover vídeo">
              <X className="w-4 h-4 text-white" />
            </button>
            {uploadPct !== null && (
              <div className="absolute bottom-0 left-0 right-0 px-3 py-2 flex items-center gap-2 text-white text-xs font-semibold" style={{ background: 'rgba(0,0,0,0.6)' }}>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Enviando vídeo… {Math.round(uploadPct * 100)}%
              </div>
            )}
          </div>
        )}
        <input ref={videoFileRef} type="file" accept="video/mp4,video/quicktime,video/x-m4v,video/3gpp,video/webm,video/*,.mp4,.mov,.m4v,.3gp,.webm" multiple onChange={onPickVideo} style={{ display: 'none' }} />
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => { const el = fileRef.current; if (!el) return; el.value = ''; el.click(); }}
              disabled={!!newVideoFile || newImages.length >= maxCarousel}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold disabled:opacity-40"
              style={{ background: '#deede5', color: '#1e714a', border: '1px solid #1e714a', borderRadius: 9999 }}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              {AT.feedPhoto}
            </button>
            <button
              onClick={() => { const el = videoFileRef.current; if (!el) return; el.value = ''; el.click(); }}
              disabled={newImages.length > 0}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold disabled:opacity-40"
              style={{ background: '#eef2ff', color: '#3730a3', border: '1px solid #3730a3', borderRadius: 9999 }}
              aria-label="Adicionar vídeo"
            >
              <VideoIcon className="w-3.5 h-3.5" />
              Vídeo
            </button>
            {/* Botao "@ Mencionar" foi REMOVIDO. Mencao agora eh inline: o
                user digita @ na legenda e um popup aparece com sugestoes. */}
          </div>
          <button
            onClick={onPublish}
            disabled={posting || (!newText.trim() && newImages.length === 0 && !newVideoFile)}
            className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold disabled:opacity-40"
            style={{ background: '#1e714a', color: '#fff', fontFamily: 'Lato, system-ui, sans-serif', letterSpacing: '0.14em', borderRadius: 9999 }}
          >
            {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {posting ? AT.feedPosting : AT.feedPost}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CropImageModal ───────────────────────────────────────────────────
// Estilo Instagram: imagem em viewport quadrado, drag + zoom, recorte
// final em 1080×1080 JPEG. Mantém todos os posts no mesmo aspecto e evita
// poluição visual no feed.
export function CropImageModal({ src, onCancel, onConfirm }: {
  src: string;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void;
}) {
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  // Mapa de pointers ATIVOS (touch/mouse). Suporta pinch-to-zoom: 2 dedos
  // simultaneos calculam a distancia e ajustam o zoom proporcionalmente.
  // 1 dedo so faz pan (arrasta a imagem).
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  // Snapshot do estado no inicio de cada gesto (ao trocar de 1 -> 2 dedos
  // ou ao por o primeiro dedo). Permite calcular delta sem acumular erro.
  const gestureRef = useRef<{
    kind: 'pan' | 'pinch';
    // pan
    startX?: number; startY?: number; offX?: number; offY?: number;
    // pinch
    startDist?: number; startZoom?: number;
  } | null>(null);
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

  // Trava o scroll do body (incl. iOS rubber-band) enquanto o modal abre.
  useLockBodyScroll(true);

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

  // Inicia (ou re-inicia) um gesto baseado em quantos dedos estao ativos.
  // Chamado ao adicionar/remover pointer da mapa, garantindo que a transicao
  // 1->2 dedos (e vice-versa) capture o estado correto SEM "saltar".
  function startGesture() {
    const pts = Array.from(pointersRef.current.values());
    if (pts.length === 2) {
      const [a, b] = pts;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      gestureRef.current = {
        kind: 'pinch',
        startDist: Math.hypot(dx, dy),
        startZoom: zoom,
      };
    } else if (pts.length === 1) {
      const p = pts[0];
      gestureRef.current = {
        kind: 'pan',
        startX: p.x, startY: p.y,
        offX: offset.x, offY: offset.y,
      };
    } else {
      gestureRef.current = null;
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    startGesture();
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!pointersRef.current.has(e.pointerId)) return;
    e.preventDefault();
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gestureRef.current;
    if (!g) return;
    if (g.kind === 'pinch' && pointersRef.current.size >= 2) {
      const pts = Array.from(pointersRef.current.values());
      const [a, b] = pts;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (g.startDist && g.startZoom) {
        const ratio = dist / g.startDist;
        const newZoom = Math.max(1, Math.min(4, g.startZoom * ratio));
        setZoom(newZoom);
        if (imgSize) {
          const w = imgSize.w * baseScale * newZoom;
          const h = imgSize.h * baseScale * newZoom;
          setOffset(o => clampWith(o, w, h));
        }
      }
    } else if (g.kind === 'pan' && pointersRef.current.size === 1) {
      const p = Array.from(pointersRef.current.values())[0];
      if (g.startX != null && g.startY != null && g.offX != null && g.offY != null) {
        const dx = p.x - g.startX;
        const dy = p.y - g.startY;
        setOffset(clampWith({ x: g.offX + dx, y: g.offY + dy }, drawnW, drawnH));
      }
    }
  }
  function onPointerUp(e: React.PointerEvent) {
    pointersRef.current.delete(e.pointerId);
    // Apos soltar 1 dos 2 dedos, re-inicia o gesto pra capturar o estado
    // novo do dedo restante (evita pulo brusco da imagem).
    startGesture();
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

        {/* Footer — hint de gestos. SEM slider de zoom: o zoom eh feito
            com pinch (2 dedos) na propria area do crop, estilo Instagram.
            O hint so aparece o suficiente pra orientar quem nao sabe. */}
        <div
          className="px-4 flex items-center justify-center flex-shrink-0"
          style={{
            background: '#111',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            paddingTop: 12,
            paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)',
          }}
        >
          <span className="text-white/45 text-xs">
            Arraste pra reposicionar · pinça com 2 dedos pra dar zoom
          </span>
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
  /** Se o user que postou tem story ativo (foto de perfil ganha anel da Irlanda) */
  hasStory?: boolean;
  onToggleLike: () => void;
  onAddComment: (text: string, parentId?: string, replyTo?: string) => void;
  onDeleteComment: (cid: string) => void;
  onDeletePost: () => void;
}

function PostCard({ post, currentUser, fotoPerfil, hasStory, onToggleLike, onAddComment, onDeleteComment, onDeletePost }: PostCardProps) {
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
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Pinch-zoom na imagem do post (2 dedos)
  const [imgScale, setImgScale] = useState(1);
  const [imgTx, setImgTx] = useState(0);
  const [imgTy, setImgTy] = useState(0);
  const pinchImgRef = useRef<{ dist: number; cx: number; cy: number; scale: number; tx: number; ty: number } | null>(null);
  // Carrossel: index atual (declarado mais abaixo, mas usado dentro de
  // handleImageTap pra saber qual imagem abrir no lightbox).
  const [carouselIdx, setCarouselIdx] = useState(0);
  // Lightbox: abre a imagem em tamanho original (square, sem o crop 5:4 do
  // feed). NO DESKTOP, click simples na foto abre. No mobile mantemos
  // tap=nada / duplo-tap=curtir (a pedido do user).
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  // Click/tap na imagem do post (mesmo comportamento em desktop e mobile):
  // - Duplo-toque (intervalo < 300ms) → curte (heart burst)
  // - Toque unico → abre lightbox com a imagem em TAMANHO ORIGINAL
  //   (square 1:1 do CropImageModal, sem o crop 5:4 do feed)
  // Timer de 320ms distingue 1 tap de 2 taps consecutivos.
  function handleImageTap() {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      // Duplo-tap: cancela qualquer single-tap pendente e curte
      lastTapRef.current = 0;
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      if (!liked) onToggleLike();
      setHeartBurst(true);
      window.setTimeout(() => setHeartBurst(false), 700);
      return;
    }
    lastTapRef.current = now;
    // Agenda single-tap → abre lightbox em ambos os modos (a pedido do user)
    if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
    singleTapTimerRef.current = setTimeout(() => {
      singleTapTimerRef.current = null;
      // Pra carrossel, usa a imagem do slide atual; pra foto unica, post.image
      const isCarouselNow = !!(post.images && post.images.length >= 2);
      const target = isCarouselNow ? post.images?.[carouselIdx] : post.image;
      if (target) setLightboxSrc(target);
    }, 320);
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
    setComment(`${user} `);
    setExpandedReplies(prev => new Set(prev).add(parentId));
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function submitComment() {
    const text = comment.trim();
    if (!text) return;
    if (replyTarget) {
      // Strip prefill do nome (com ou sem @) — antes era prefixado @user,
      // agora apenas user (a pedido do user, sem @ no display)
      const stripped = text.replace(new RegExp(`^@?${replyTarget.user}\\s*`), '');
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

  const isCarousel = !!(post.images && post.images.length >= 2);
  const hasMedia = !!(post.image || post.video || isCarousel);

  // ── Carrossel: tracking de slide atual via scroll position ──────────
  // (carouselIdx ja foi declarado em cima, junto com lightboxSrc)
  const carouselRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isCarousel) return;
    const el = carouselRef.current;
    if (!el) return;
    function onScroll() {
      if (!el) return;
      const idx = Math.round(el.scrollLeft / el.clientWidth);
      setCarouselIdx(idx);
    }
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [isCarousel]);
  function goToSlide(i: number) {
    const el = carouselRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  }

  // Header (avatar + username + menu apagar). Quando ha midia, vira overlay
  // sobre o topo da foto/video; quando NAO ha midia, fica como header normal
  // acima do texto. Conteudo identico nos dois casos — muda so o styling.
  const headerInner = (
    <>
      <div className="flex items-center gap-2.5">
        <Avatar username={post.username} fotoPerfil={post.fotoPerfil} size={36} hasStory={hasStory} onMedia={hasMedia} />
        <div>
          <p
            className="text-sm font-semibold"
            style={{
              color: hasMedia ? '#ffffff' : '#262626',
              textShadow: hasMedia ? '0 1px 3px rgba(0,0,0,0.55)' : undefined,
            }}
          >
            {post.username}
          </p>
          <p
            className="text-[10px]"
            style={{
              color: hasMedia ? 'rgba(255,255,255,0.85)' : '#8e8e8e',
              textShadow: hasMedia ? '0 1px 2px rgba(0,0,0,0.5)' : undefined,
            }}
          >
            {timeAgo(post.createdAt)}
          </p>
        </div>
      </div>
      {isOwn && (
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setShowMenu(m => !m); }}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{
              color: hasMedia ? '#ffffff' : '#262626',
              background: hasMedia ? 'rgba(0,0,0,0.35)' : 'transparent',
              backdropFilter: hasMedia ? 'blur(6px)' : undefined,
            }}
            aria-label="Mais opções"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {showMenu && (
            <div
              className="absolute right-0 top-9 rounded-lg overflow-hidden z-30"
              style={{ background: '#ffffff', border: '1px solid #dbdbdb', minWidth: 140 }}
            >
              <button
                onClick={(e) => { e.stopPropagation(); setShowMenu(false); onDeletePost(); }}
                className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-white/5"
                style={{ color: '#dc2626' }}
              >
                <Trash2 className="w-3.5 h-3.5" /> Apagar post
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );

  return (
    // Mobile: edge-to-edge (-mx-3 cancela o px-3 do container pai do App.tsx,
    // posts ocupam 100% da largura da tela — zero espaco nas laterais, igual
    // Instagram). Desktop: respeita o container max-w centralizado.
    // Cantos totalmente QUADRADOS em mobile E desktop (rounded-none global).
    <div className="overflow-hidden -mx-3 sm:mx-0 rounded-none" style={{ background: '#ffffff' }}>
      {/* Header normal acima — SO quando NAO ha midia.
          Com midia o header vira overlay sobre a foto/video (ver abaixo). */}
      {!hasMedia && (
        <div className="flex items-center justify-between px-3 pt-3 pb-2">
          {headerInner}
        </div>
      )}

      {/* Carrossel de fotos (2-8 itens) — scroll-snap horizontal nativo
           pra swipe em mobile. Dots indicador + chevrons em desktop. Cada
           slide ocupa 100% da largura (snap-center). aspect-square pra
           manter altura uniforme entre slides de proporcoes diferentes. */}
      {isCarousel && (
        <div className="relative w-full" style={{ background: '#000' }}>
          <div
            ref={carouselRef}
            className="flex w-full overflow-x-auto snap-x snap-mandatory"
            style={{ scrollbarWidth: 'none' }}
            onClick={handleImageTap}
          >
            {post.images!.map((src, i) => (
              <div
                key={i}
                className="flex-shrink-0 w-full snap-center flex items-center justify-center"
                style={{ aspectRatio: '5 / 4' }}
              >
                <img
                  src={src}
                  alt=""
                  className="w-full h-full object-cover pointer-events-none"
                  loading={i === 0 ? 'eager' : 'lazy'}
                  draggable={false}
                />
              </div>
            ))}
          </div>

          {/* Badge contador "1/8" — canto superior direito */}
          <div
            className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-white text-[11px] font-bold pointer-events-none"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', zIndex: 2 }}
          >
            {carouselIdx + 1}/{post.images!.length}
          </div>

          {/* Chevrons prev/next (desktop) — invisivel quando no extremo */}
          {carouselIdx > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); goToSlide(carouselIdx - 1); }}
              className="hidden sm:flex absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full items-center justify-center active:scale-95"
              style={{ background: 'rgba(255,255,255,0.85)', zIndex: 2 }}
              aria-label="Anterior"
            >
              <ChevronLeft className="w-5 h-5" style={{ color: '#262626' }} />
            </button>
          )}
          {carouselIdx < post.images!.length - 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); goToSlide(carouselIdx + 1); }}
              className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full items-center justify-center active:scale-95"
              style={{ background: 'rgba(255,255,255,0.85)', zIndex: 2 }}
              aria-label="Proximo"
            >
              <ChevronRight className="w-5 h-5" style={{ color: '#262626' }} />
            </button>
          )}

          {/* Gradient escuro do topo (header overlay) */}
          <div
            className="absolute top-0 left-0 right-0 pointer-events-none"
            style={{
              height: 92,
              background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 100%)',
              zIndex: 1,
            }}
          />
          {/* Header overlay — username + apagar */}
          <div
            className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 pt-3 pb-2"
            style={{ zIndex: 2 }}
          >
            {headerInner}
          </div>

          {/* Heart burst on double-tap */}
          {heartBurst && (
            <Heart
              className="absolute left-1/2 top-1/2 pointer-events-none"
              style={{
                width: 110, height: 110, marginLeft: -55, marginTop: -55,
                color: '#fff', fill: '#f87171',
                filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.6))',
                animation: 'heartBurst 700ms ease-out forwards',
                zIndex: 3,
              }}
            />
          )}
        </div>
      )}

      {/* Dots indicator do carrossel — abaixo da midia, mesmo nivel dos botoes */}
      {isCarousel && (
        <div className="flex items-center justify-center gap-1.5 py-2" style={{ background: '#ffffff' }}>
          {post.images!.map((_, i) => (
            <button
              key={i}
              onClick={() => goToSlide(i)}
              className="w-1.5 h-1.5 rounded-full transition-all"
              style={{
                background: i === carouselIdx ? '#1e714a' : '#d4d4d4',
                transform: i === carouselIdx ? 'scale(1.2)' : 'scale(1)',
              }}
              aria-label={`Foto ${i + 1}`}
            />
          ))}
        </div>
      )}

      {/* Image — w-full + height:auto pra imagem preencher 100% da largura
           do post sem deixar letterbox preto nas laterais. A altura segue a
           proporcao natural da imagem (estilo Instagram: cada post tem altura
           propria conforme aspect ratio da foto). So renderiza se NAO ha
           carrossel (carrossel renderiza por conta propria com aspect-square). */}
      {!isCarousel && post.image && (
        <div
          className="relative w-full select-none overflow-hidden"
          style={{ background: '#ffffff', cursor: 'pointer', touchAction: 'pan-y' }}
          onClick={handleImageTap}
          onTouchStart={(e) => {
            if (e.touches.length === 2) {
              const t1 = e.touches[0], t2 = e.touches[1];
              const dx = t2.clientX - t1.clientX;
              const dy = t2.clientY - t1.clientY;
              pinchImgRef.current = {
                dist: Math.hypot(dx, dy),
                cx: (t1.clientX + t2.clientX) / 2,
                cy: (t1.clientY + t2.clientY) / 2,
                scale: imgScale,
                tx: imgTx,
                ty: imgTy,
              };
            }
          }}
          onTouchMove={(e) => {
            if (e.touches.length === 2 && pinchImgRef.current) {
              e.preventDefault();
              const t1 = e.touches[0], t2 = e.touches[1];
              const dx = t2.clientX - t1.clientX;
              const dy = t2.clientY - t1.clientY;
              const newDist = Math.hypot(dx, dy);
              const ratio = newDist / pinchImgRef.current.dist;
              const newScale = Math.max(1, Math.min(4, pinchImgRef.current.scale * ratio));
              setImgScale(newScale);
              const newCx = (t1.clientX + t2.clientX) / 2;
              const newCy = (t1.clientY + t2.clientY) / 2;
              setImgTx(pinchImgRef.current.tx + (newCx - pinchImgRef.current.cx));
              setImgTy(pinchImgRef.current.ty + (newCy - pinchImgRef.current.cy));
            }
          }}
          onTouchEnd={() => {
            if (pinchImgRef.current) {
              pinchImgRef.current = null;
              if (imgScale <= 1.05) {
                setImgScale(1); setImgTx(0); setImgTy(0);
              }
            }
          }}
        >
          <img
            src={post.image}
            alt=""
            className="block w-full pointer-events-none"
            loading="lazy"
            draggable={false}
            style={{
              // Antes: h-auto = altura natural (square do CropImageModal → muito
              // alta na vertical, igual a largura). A pedido do user, agora usa
              // aspect 5:4 com object-cover — 80% da altura square, crop suave
              // de 10% no topo + 10% no rodape pra manter o miolo da imagem.
              aspectRatio: '5 / 4',
              objectFit: 'cover',
              objectPosition: 'center',
              transform: imgScale > 1.001 ? `translate(${imgTx}px, ${imgTy}px) scale(${imgScale})` : undefined,
              transformOrigin: 'center',
              transition: imgScale === 1 && !pinchImgRef.current ? 'transform 0.2s ease' : undefined,
              willChange: imgScale > 1.001 ? 'transform' : undefined,
            }}
          />

          {/* Gradient escuro do topo pra dar contraste pro header overlay */}
          <div
            className="absolute top-0 left-0 right-0 pointer-events-none"
            style={{
              height: 92,
              background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 100%)',
            }}
          />

          {/* Header overlay — username e botao apagar DENTRO da foto */}
          <div
            className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 pt-3 pb-2"
            style={{ zIndex: 2 }}
          >
            {headerInner}
          </div>

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

      {/* Video — wrapper relativo pra acomodar o header overlay por cima.
           1 tap = abre fullscreen, 2 taps = curte (heart burst). */}
      {post.video && (
        <div className="relative w-full">
          <FeedVideo
            src={post.video}
            liked={liked}
            onDoubleTapLike={() => { if (!liked) onToggleLike(); }}
          />

          {/* Gradient escuro do topo pra dar contraste pro header overlay */}
          <div
            className="absolute top-0 left-0 right-0 pointer-events-none"
            style={{
              height: 92,
              background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 100%)',
              zIndex: 1,
            }}
          />

          {/* Header overlay — username e botao apagar DENTRO do video */}
          <div
            className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 pt-3 pb-2"
            style={{ zIndex: 2 }}
          >
            {headerInner}
          </div>
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center gap-4 px-3 py-2.5">
        <button
          onClick={onToggleLike}
          className="flex items-center gap-1.5 text-sm font-semibold transition-all active:scale-90"
          style={{ color: liked ? '#ed4956' : '#262626' }}
        >
          <Heart className="w-5 h-5" fill={liked ? '#f87171' : 'transparent'} />
          {post.likes.length > 0 && <span>{post.likes.length}</span>}
        </button>
        <div className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: '#262626' }}>
          <MessageCircle className="w-5 h-5" />
          {post.comments.length > 0 && <span>{post.comments.length}</span>}
        </div>
        <div className="flex items-center gap-1.5 text-sm font-semibold ml-auto" style={{ color: '#8e8e8e' }}>
          <Eye className="w-4 h-4" />
          <span className="text-xs">{post.views.length}</span>
        </div>
      </div>

      {/* Caption — agora ABAIXO dos botoes de like/comentar (estilo Instagram) */}
      {post.text && (
        <AutoText
          as="p"
          text={post.text}
          className="text-sm leading-relaxed px-3 pb-2"
          style={{
            color: '#262626',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        />
      )}

      {/* Mentions — chips logo abaixo do caption, com "Com X, Y..." estilo
          Instagram. Clique no chip abre o perfil do user mencionado. */}
      {post.mentions && post.mentions.length > 0 && (
        <div className="px-3 pb-2 flex items-center gap-1.5 flex-wrap" style={{ color: '#8e8e8e' }}>
          <span className="text-xs">Com</span>
          {post.mentions.map((u, i) => (
            <button
              key={u}
              onClick={(e) => {
                e.stopPropagation();
                window.dispatchEvent(new CustomEvent('papo-open-profile', { detail: { username: u } }));
              }}
              className="text-xs font-semibold hover:underline"
              style={{ color: '#1e714a' }}
            >
              {u}{i < post.mentions!.length - 1 ? ',' : ''}
            </button>
          ))}
        </div>
      )}

      {/* Comments */}
      {topLevel.length > 0 && (
        <div className="px-3 pb-2 space-y-2" style={{ borderTop: '1px solid #efefef' }}>
          {!showAll && topLevel.length > 2 && (
            <button
              onClick={() => setShowAll(true)}
              className="text-xs pt-2"
              style={{ color: '#8e8e8e' }}
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
                        style={{ color: '#8e8e8e' }}
                      >
                        <span style={{ width: 22, height: 1, background: '#dbdbdb' }} />
                        Ver {replies.length} resposta{replies.length === 1 ? '' : 's'}
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => toggleReplies(c.id)}
                          className="text-[11px] flex items-center gap-1.5 py-1"
                          style={{ color: '#8e8e8e' }}
                        >
                          <span style={{ width: 22, height: 1, background: '#dbdbdb' }} />
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
      <div className="px-3 py-2" style={{ borderTop: '1px solid #efefef' }}>
        {replyTarget && (
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px]" style={{ color: '#8e8e8e' }}>
              Respondendo a <span className="font-semibold" style={{ color: '#1e714a' }}>{replyTarget.user}</span>
            </span>
            <button
              onClick={() => { setReplyTarget(null); setComment(''); }}
              className="text-[11px]"
              style={{ color: '#8e8e8e' }}
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
            style={{ background: '#fafafa', color: '#262626', border: '1px solid #efefef' }}
          />
          {comment.trim() && (
            <button
              onClick={submitComment}
              className="text-xs font-bold"
              style={{ color: '#0095f6', fontFamily: 'Lato, system-ui, sans-serif', letterSpacing: '0' }}
            >
              Publicar
            </button>
          )}
        </div>
      </div>
      {/* LIGHTBOX desktop — abre a foto em tamanho original (square,
          sem o crop 5:4 do feed). Mobile mantem so duplo-toque pra curtir. */}
      {lightboxSrc && createPortal(
        <div
          className="fixed inset-0 z-[999] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.92)' }}
          onClick={() => setLightboxSrc(null)}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setLightboxSrc(null); }}
            className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center z-10"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
            aria-label="Fechar"
          >
            <X className="w-5 h-5 text-white" />
          </button>
          <img
            src={lightboxSrc}
            alt=""
            className="max-w-full max-h-full object-contain rounded-xl select-none"
            onClick={(e) => e.stopPropagation()}
            draggable={false}
          />
        </div>,
        document.body
      )}
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
      style={{ background: '#101012', borderBottom: '1px solid #efefef', scrollbarWidth: 'none' }}
    >
      <style>{`.lg\\:hidden::-webkit-scrollbar{display:none}`}</style>
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
          <span
            className="text-[9px] uppercase font-bold tracking-widest"
            style={{ color: '#1e714a', fontFamily: '"DM Sans", system-ui, sans-serif', letterSpacing: '0.18em' }}
          >
            Amigos
          </span>
          <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: '#262626' }}>
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
            <span className="text-[9px] truncate max-w-[52px]" style={{ color: '#262626' }}>
              {f.username}
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
        style={{ borderBottom: '1px solid #efefef' }}
      >
        <p
          className="text-xs font-bold uppercase"
          style={{ fontFamily: '"DM Sans", system-ui, sans-serif', letterSpacing: '0.18em', color: '#1e714a' }}
        >
          Amigos do Chat
        </p>
        <div className="flex items-center gap-3 mt-1 text-[11px]" style={{ color: '#8e8e8e' }}>
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
          <div className="px-3 py-8 text-center text-xs" style={{ color: '#8e8e8e' }}>
            <UserPlus className="w-6 h-6 mx-auto mb-2" style={{ color: 'rgba(255,255,255,0.3)' }} />
            Você ainda não tem amigos. Toque no <strong style={{ color: '#1e714a' }}>+ no topo</strong> pra adicionar alunos.
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
          {f.nome || `${f.username}`}
        </p>
        <p className="text-[10px] truncate" style={{ color: f.online ? '#22c55e' : 'rgba(255,255,255,0.4)' }}>
          {f.online ? 'Online agora' : f.username}
        </p>
      </div>
      <MessageCircle className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100" style={{ color: '#8e8e8e' }} />
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
          <span className="font-semibold" style={{ color: '#262626' }}>{c.user}</span>{' '}
          {c.replyTo && (
            <span className="font-semibold" style={{ color: '#1e714a' }}>{c.replyTo} </span>
          )}
          <AutoText text={c.text} style={{ color: '#262626' }} />
        </p>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-[10px]" style={{ color: '#a8a8a8' }}>{timeAgo(c.createdAt)}</span>
          <button
            onClick={onReply}
            className="text-[10px] font-semibold"
            style={{ color: '#8e8e8e' }}
          >
            Responder
          </button>
          {(c.user === currentUser || isOwnPost) && (
            <button
              onClick={onDelete}
              className="text-[10px]"
              style={{ color: '#a8a8a8' }}
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
// hasStory: desenha anel da bandeira da Irlanda em volta da foto (verde/branco/laranja)
//           com animacao rotativa, mesma logica do Instagram quando o user tem story ativo.
//           Clicar no avatar dispara papo-open-stories-for-user → abre o viewer
//           de stories filtrado pra esse user (mesmo evento usado em outros lugares).
// onMedia:  pequeno halo escuro pra dar contraste quando o avatar fica em cima
//           de uma imagem/video (header overlay).
function Avatar({ username, fotoPerfil, size, hasStory, onMedia }: { username: string; fotoPerfil?: string; size: number; hasStory?: boolean; onMedia?: boolean }) {
  const openStories = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('papo-open-stories-for-user', { detail: { username } }));
  };
  const inner = (
    <div
      className="flex items-center justify-center text-white font-bold flex-shrink-0 overflow-hidden"
      style={{
        width: size,
        height: size,
        background: 'linear-gradient(135deg, #1e714a 0%, #91a199 100%)',
        fontSize: Math.max(10, size * 0.32),
        borderRadius: '50%',
        aspectRatio: '1 / 1',
      }}
    >
      {fotoPerfil ? (
        <img src={fotoPerfil} alt={username} className="w-full h-full object-cover" style={{ borderRadius: '50%' }} />
      ) : (
        <span>{username.slice(0, 2).toUpperCase()}</span>
      )}
    </div>
  );

  if (!hasStory) {
    // Sem story: opcionalmente envolve num halo escuro p/ contraste sobre midia
    return onMedia ? (
      <div
        className="flex-shrink-0 rounded-full"
        style={{ padding: 2, background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(2px)' }}
      >
        {inner}
      </div>
    ) : inner;
  }

  // Com story: anel gradiente da Irlanda. SO O ANEL GIRA — a foto/avatar
  // dentro fica parada. Estrutura em camadas absolutas:
  //   - ring gradiente (gira, position absolute)
  //   - circulo branco estatico no meio (cobre o centro pra ring virar annulus)
  //   - avatar estatico por cima (nao tem animacao)
  // wrapperSize = size + 8 → avatar (inset 4) tem largura exata = size.
  // Clicavel → abre stories do user (estilo Instagram).
  const wrapperSize = size + 8;
  return (
    <div
      className="flex-shrink-0 cursor-pointer"
      onClick={openStories}
      role="button"
      aria-label={`Ver stories de ${username}`}
      style={{ position: 'relative', width: wrapperSize, height: wrapperSize }}
    >
      {/* Anel gradiente — UNICO elemento com animacao */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: 'conic-gradient(from 0deg, #169b62 0% 33%, #ffffff 33% 66%, #ff883e 66% 100%)',
          animation: 'papo-irish-spin 4s linear infinite',
        }}
      />
      {/* Circulo branco estatico (gap entre anel e foto) */}
      <div
        style={{
          position: 'absolute',
          inset: 2,
          borderRadius: '50%',
          background: '#ffffff',
        }}
      />
      {/* Foto/avatar estatico — fica posicionado por cima sem animacao */}
      <div
        style={{
          position: 'absolute',
          inset: 4,
          borderRadius: '50%',
          overflow: 'hidden',
        }}
      >
        {inner}
      </div>
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

  // Busca debounced por email, nome ou username — ignora maiúsculas.
  // Faz 3 queries em paralelo (uma por coluna) e mescla, evitando quirks
  // do parser .or() do PostgREST com valores que contêm . @ % etc.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) { setResults([]); return; }
    setLoading(true);
    const id = setTimeout(async () => {
      try {
        const like = `%${trimmed}%`;
        const cols = 'username,nome,foto_perfil,email';
        const [byEmail, byNome, byUser] = await Promise.all([
          supabase.from('usuarios').select(cols).ilike('email', like).neq('username', currentUser).limit(20),
          supabase.from('usuarios').select(cols).ilike('nome', like).neq('username', currentUser).limit(20),
          supabase.from('usuarios').select(cols).ilike('username', like).neq('username', currentUser).limit(20),
        ]);
        const merged = new Map<string, SearchableUser>();
        for (const res of [byEmail, byNome, byUser]) {
          for (const row of ((res.data as SearchableUser[]) || [])) {
            if (!merged.has(row.username)) merged.set(row.username, row);
          }
        }
        setResults(Array.from(merged.values()).slice(0, 20));
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
            style={{ color: '#fafaf7', fontFamily: '"DM Sans", system-ui, sans-serif', letterSpacing: '0.12em' }}
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
            <Search className="w-4 h-4" style={{ color: '#8e8e8e' }} />
            <input
              autoFocus
              type="text"
              autoCapitalize="off"
              autoCorrect="off"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Nome, usuário ou e-mail…"
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: '#fafaf7' }}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && (
            <p className="text-center py-8 text-sm" style={{ color: '#8e8e8e' }}>buscando…</p>
          )}
          {!loading && query.trim() && results.length === 0 && (
            <p className="text-center py-8 text-sm" style={{ color: '#8e8e8e' }}>
              Nenhum aluno encontrado.
            </p>
          )}
          {!loading && !query.trim() && (
            <p className="text-center py-8 text-xs px-6" style={{ color: '#8e8e8e' }}>
              Digite <strong>nome</strong>, <strong>usuário</strong> ou <strong>e-mail</strong> pra encontrar e adicionar como amigo.
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
                    {u.nome || `${u.username}`}
                  </p>
                  {u.email && (
                    <p className="text-[11px] truncate" style={{ color: '#8e8e8e' }}>
                      {u.email}
                    </p>
                  )}
                  <p className="text-[10px] truncate" style={{ color: '#a8a8a8' }}>
                    {u.username}
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
                                'linear-gradient(135deg, #1e714a 0%, #4ade80 100%)',
                    color:
                      already ? '#22c55e' :
                      pending ? 'rgba(255,255,255,0.65)' :
                                '#fff',
                    border:
                      already ? '1px solid rgba(34,197,94,0.5)' :
                      pending ? '1px solid rgba(255,255,255,0.18)' :
                                'none',
                    fontFamily: '"DM Sans", system-ui, sans-serif',
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
