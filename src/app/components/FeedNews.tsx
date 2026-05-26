import { useState, useEffect, useRef, useMemo, memo, Fragment, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Image as ImageIcon, Send, Heart, MessageCircle, Eye,
  UserPlus, Search, Check, MoreHorizontal, Trash2, Video as VideoIcon, Loader2,
  ChevronLeft, ChevronRight, Youtube as YoutubeIcon,
} from 'lucide-react';
import { Stories, fetchUsernamesWithStories } from './Stories';
import { FeedVideo } from './FeedVideo';
import { ImageLightbox } from './ImageLightbox';
import { MentionAutocompleteTextarea } from './MentionAutocompleteTextarea';
import { VideoEditor } from './VideoEditor';
import { uploadVideoToStream } from '../utils/streamUpload';
import { supabase } from '../../lib/supabase';
import { isFriend, addFriend, removeFriend, getFriends, sendFriendRequest, cancelFriendRequest, hasSentRequest, getSentRequests } from './friends';
import { useLang } from '../i18n';
import { FriendsDrawer, useSwipeOpen } from './FriendsDrawer';
import { SAMPLE_POSTS } from '../utils/feedSamples';
import { notifyUser } from '../utils/notify';
import { MusicPicker } from './spotify/MusicPicker';
import { PostMusicEngine, PostMusicTickerChip, PostMusicSoundIcon, type PostMusicTickerHandle } from './spotify/PostMusicTicker';
import type { MusicTrack } from '../lib/spotify';
import { Music as MusicIcon } from 'lucide-react';
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
  likes?: string[];        // usernames que curtiram este comentário
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
  /** YouTube embed: URL do video (qualquer formato — watch?v=, youtu.be/,
   *  shorts/, embed/). Mutuamente exclusivo com image/images/video. Render
   *  via iframe direto do YouTube, zero custo Cloudflare. */
  youtube_url?: string;
  /** Usernames mencionados (@) no post — recebem notif tipo mention_post. */
  mentions?: string[];
  createdAt: string;
  likes: string[];
  views: string[];
  comments: FeedComment[];
  /** Música opcional do Spotify (apenas metadados — preview de 30s tocado
   *  pelo TrackPlayer variant="post"). Nada de áudio salvo no servidor. */
  spotify_track?: import('../lib/spotify').MusicTrack | null;
}

// ─── YouTube URL helpers ───────────────────────────────────────────────
// Extrai video ID de qualquer formato comum:
//   https://www.youtube.com/watch?v=ID
//   https://youtu.be/ID
//   https://www.youtube.com/shorts/ID
//   https://www.youtube.com/embed/ID
//   https://youtube.com/watch?v=ID&t=10s  (com query extras OK)
export function extractYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const s = url.trim();
  const patterns = [
    /youtube\.com\/watch\?v=([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /youtube\.com\/shorts\/([\w-]{11})/,
    /youtube\.com\/embed\/([\w-]{11})/,
    /youtube\.com\/v\/([\w-]{11})/,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) return m[1];
  }
  // ID puro (11 chars validos sem URL ao redor)
  if (/^[\w-]{11}$/.test(s)) return s;
  return null;
}
export function youTubeEmbedUrl(id: string): string {
  // playsinline=1 + modestbranding=1 = player mais discreto. rel=0 sugere
  // remover videos relacionados (YouTube ignora parcialmente em 2024+).
  return `https://www.youtube.com/embed/${id}?playsinline=1&modestbranding=1&rel=0`;
}
export function youTubeThumbnailUrl(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
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
const FEED_KEY = 'papo_feed_news_v2';

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
    youtube_url: r.youtube_url ?? undefined,
    mentions: Array.isArray(r.mentions) && r.mentions.length > 0 ? r.mentions : undefined,
    createdAt: r.created_at,
    likes: Array.isArray(r.likes) ? r.likes : [],
    views: Array.isArray(r.views) ? r.views : [],
    comments: Array.isArray(r.comments) ? r.comments : [],
    spotify_track: r.spotify_track || null,
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
    youtube_url: p.youtube_url ?? null,
    mentions: p.mentions && p.mentions.length > 0 ? p.mentions : null,
    likes: p.likes,
    views: p.views,
    comments: p.comments,
    created_at: p.createdAt,
    spotify_track: p.spotify_track || null,
  };
}

function loadFeedCache(): FeedPost[] {
  try {
    const raw = localStorage.getItem(FEED_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    // BUG FIX CRITICO: o FeedPost tem campo `createdAt` (camelCase),
    // nao `created_at` (snake_case). O sort anterior comparava
    // undefined com undefined -> 0 sempre -> ordem do localStorage
    // permanecia. Resultado: post antigo aparecia primeiro ao
    // recarregar. Agora ordena pelo campo CORRETO em camelCase.
    return arr.sort((a, b) => {
      const ta = new Date(a?.createdAt || a?.created_at || 0).getTime();
      const tb = new Date(b?.createdAt || b?.created_at || 0).getTime();
      return tb - ta;
    });
  } catch { return []; }
}

// CRÍTICO: NÃO disparar evento aqui — o listener `papo-feed-updated`
// chama fetchFeed → que chamava saveFeedCache → que disparava o evento
// → fetchFeed → LOOP INFINITO. O evento só deve ser emitido em ações
// do usuário (publicar/curtir/comentar/apagar), não em sync de leitura.
function saveFeedCache(list: FeedPost[], notify = true) {
  // Defer pra proximo tick — JSON.stringify de uma lista grande de posts
  // bloqueava a UI por ~50-200ms (visivel ao curtir/comentar). Async libera
  // o render imediato e faz o cache em background.
  // Sempre ordena por createdAt DESC antes de salvar — defense in depth.
  // BUG FIX: usa createdAt (camelCase), nao created_at (snake_case).
  Promise.resolve().then(() => {
    try {
      const sorted = [...list].sort((a, b) => {
        const ta = new Date(a?.createdAt || (a as any)?.created_at || 0).getTime();
        const tb = new Date(b?.createdAt || (b as any)?.created_at || 0).getTime();
        return tb - ta;
      });
      localStorage.setItem(FEED_KEY, JSON.stringify(sorted));
    } catch {}
    if (notify) window.dispatchEvent(new CustomEvent('papo-feed-updated'));
  });
}

async function fetchFeed(onEarlyPosts?: (posts: FeedPost[]) => void): Promise<FeedPost[]> {
  // FAST PATH: prefetch disparado no index.html antes do React montar.
  // Consome a primeira chamada — depois vira null pra cair no path normal.
  let data: any[] | null = null;
  const pre = (typeof window !== 'undefined') ? (window as any).__feedPromise : null;
  if (pre) {
    try { data = await pre; } catch { data = null; }
    (window as any).__feedPromise = null;
  }
  if (!data) {
    const r = await supabase
      .from('feed_posts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (r.error || !r.data) return loadFeedCache();
    data = r.data as any[];
  }
  const posts = data.map(rowToPost);
  // EARLY-SET: entrega os posts JA ordenados imediatamente.
  onEarlyPosts?.(posts);
  // Persiste cache JA com a ordem correta — proximo reload pega fresh
  // mesmo se o enrich nao terminar.
  saveFeedCache(posts, false);

  // BUG FIX CRITICO: ENRICH agora roda em BACKGROUND (fire-and-forget).
  // Antes: era awaitado em serie -> fetchFeed so retornava apos T1+T2
  // (~350ms query + ~400ms enrich = ~750ms total no mobile 4G). Agora
  // retorna em ~350ms e o enrich avisa via evento quando terminar.
  // Ganho: ~400ms a menos pro post novo aparecer no topo.
  (async () => {
    try {
      const usernames = Array.from(new Set([
        ...posts.map(p => p.username),
        ...posts.flatMap(p => (p.comments || []).map(c => c.user)),
      ].filter((u): u is string => !!u)));
      if (usernames.length === 0) return;
      const { data: usersData } = await supabase
        .from('usuarios')
        .select('username, foto_perfil')
        .in('username', usernames);
      const fotoByUser = new Map<string, string | undefined>();
      for (const u of (usersData as any[] || [])) {
        if (u.foto_perfil) fotoByUser.set(u.username, u.foto_perfil);
      }
      // Cria novo array de posts (imutavel) com fotos atualizadas
      const enriched = posts.map(p => {
        const fresh = fotoByUser.get(p.username);
        let nextComments = p.comments;
        if (Array.isArray(p.comments)) {
          nextComments = p.comments.map(c => {
            const f = fotoByUser.get(c.user);
            return f ? { ...c, fotoPerfil: f } : c;
          });
        }
        if (fresh) return { ...p, fotoPerfil: fresh, comments: nextComments };
        if (nextComments !== p.comments) return { ...p, comments: nextComments };
        return p;
      });
      saveFeedCache(enriched, false);
      // Dispatch pro FeedNews atualizar o state sem refazer fetchFeed
      window.dispatchEvent(new CustomEvent('papo-feed-enriched', { detail: enriched }));
    } catch { /* sem rede no enrich — usa snapshots */ }
  })();

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
  // IDs dos posts que o currentUser ja repostou — usado pra esconder o botao
  // "Repostar" desses posts (nao da pra repostar o mesmo conteudo 2 vezes).
  // Persiste em localStorage pra sobreviver a reloads/sessoes.
  const REPOSTED_KEY = 'studentclub_reposted_post_ids_v1';
  const [repostedIds, setRepostedIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(REPOSTED_KEY);
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch {}
    return new Set();
  });
  const [sampleInteractions, setSampleInteractions] = useState<Record<string, SampleInteraction>>(() => loadSampleInteractions());
  const [newText, setNewText] = useState('');
  // Música opcional anexada ao post (Spotify). Aparece como card embaixo
  // do post via <TrackPlayer variant="post" />. Não consome upload de
  // mídia — é só metadado + preview público do Spotify.
  const [newMusicTrack, setNewMusicTrack] = useState<MusicTrack | null>(null);
  const [musicPickerOpen, setMusicPickerOpen] = useState(false);
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
  // YouTube URL anexada ao post. Mutuamente exclusiva com newImages/
  // newVideoFile — quando setada, o post sera renderizado como iframe
  // YouTube em vez de foto/video. Zero custo Cloudflare.
  const [newYoutubeUrl, setNewYoutubeUrl] = useState<string>('');
  const [editingVideo, setEditingVideo] = useState<File | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  // REOPEN-CAMERA-ON-CANCEL: quando o user tira foto/video via StoryCamera
  // (modo feed) e CANCELA no crop/video editor, queremos voltar pra camera —
  // nao mandar pra home. Esta ref marca se a midia em edicao veio da camera.
  // Limpada quando o post eh publicado, quando o user confirma o crop ou
  // quando cancela manualmente. Dispara o evento 'papo-reopen-post-camera'
  // que o Stories.tsx escuta pra remontar a StoryCamera em modo feed.
  const cropFromCameraRef = useRef(false);
  const [posting, setPosting] = useState(false);
  const [showFriends, setShowFriends] = useState(false);
  const [showFriendsDrawer, setShowFriendsDrawer] = useState(false);
  const [composerModalOpen, setComposerModalOpen] = useState(false);
  // YouTube modal aberto quando user clica YOUTUBE no carrossel de tabs
  // do StoryCamera (substitui camera por modal dedicado pra colar link).
  const [youtubeModalOpen, setYoutubeModalOpen] = useState(false);
  useEffect(() => {
    const onOpen = () => {
      if (!isActiveForViewport()) return; // outra instancia processa
      setYoutubeModalOpen(true);
    };
    window.addEventListener('papo-open-youtube-modal', onOpen);
    return () => window.removeEventListener('papo-open-youtube-modal', onOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
      const d = (e as CustomEvent<{ username: string; old_username: string | null; foto_perfil: string | null }>).detail;
      if (!d?.username) return;
      // matches: o post pode ter sido feito com nome antigo (old) ou novo.
      const matches = (u: string) => u === d.username || (d.old_username && u === d.old_username);
      setPosts(prev => prev.map(p => {
        const next = { ...p };
        if (matches(p.username)) {
          next.fotoPerfil = d.foto_perfil ?? undefined;
          // Em rename, atualiza tambem o username do post pra refletir o novo
          if (d.old_username && p.username === d.old_username) next.username = d.username;
        }
        if (Array.isArray(p.comments)) {
          next.comments = p.comments.map(c =>
            matches(c.user)
              ? { ...c, user: d.username, fotoPerfil: d.foto_perfil ?? undefined }
              : c
          );
        }
        return next;
      }));
    };
    window.addEventListener('papo-user-updated', onUserUpdated);
    return () => window.removeEventListener('papo-user-updated', onUserUpdated);
  }, []);
  const seenRef = useRef<Set<string>>(new Set());

  // CHAVE: app monta DOIS <FeedNews> simultaneamente (desktop hidden
  // sm:block + mobile sm:hidden — App.tsx linhas 3122 e 3303). CSS
  // esconde um, mas AMBOS estao na arvore React e AMBOS registram
  // event listeners. Resultado anterior: ambos os handlers rodavam pra
  // CADA evento, ambos setavam cropSrc/composerModalOpen → 2 modais
  // empilhados (createPortal bypassa o CSS visibility do parent) →
  // estado conflitante → user tinha que bater 2x pra "limpar" o estado.
  //
  // Fix: cada instancia checa se eh a "ativa" pro viewport atual
  // antes de processar. Mobile (max-width: 639px) processa apenas a
  // FeedNews montada em sm:hidden; desktop processa a hidden sm:block.
  // Detecta via DOM lookup do wrapper que tem display:none ou nao.
  const wrapperRef = useRef<HTMLDivElement>(null);
  function isActiveForViewport(): boolean {
    // Se a propria FeedNews esta com display:none (escondida pelo CSS
    // do parent), NAO processa eventos — deixa pra instancia visivel.
    // Usa getBoundingClientRect — width/height == 0 = display:none/hidden.
    const el = wrapperRef.current;
    if (!el) return true; // se ref nao montou ainda, processa por seguranca
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  // Botao camera mobile dispara este evento. Abre o composer modal (com
  // botoes Foto + Video + textarea + Mencionar). User escolhe Foto/Video
  // DENTRO do composer; o picker do dispositivo se abre a partir dali.
  // (Voltamos a este fluxo apos testes mostrarem que a camera live custom
  // nao tava boa o suficiente em iOS PWA.)
  useEffect(() => {
    const open = () => {
      if (!isActiveForViewport()) return;
      setComposerModalOpen(true);
    };
    window.addEventListener('papo-open-composer', open);
    return () => window.removeEventListener('papo-open-composer', open);
  }, []);

  // Quando a camera unificada captura midia em modo POST, dispara este
  // evento com o arquivo. So a instancia VISIVEL pro viewport processa
  // (evita duplicacao quando ha 2 FeedNews montados — desktop/mobile).
  useEffect(() => {
    async function handler(e: Event) {
      if (!isActiveForViewport()) return; // outra instancia processa
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
        // Veio da camera — cancelar no editor reabre a camera (modo feed).
        cropFromCameraRef.current = true;
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
      if (file.size > 100 * 1024 * 1024) { alert('Imagem grande demais (máx 100MB).'); return; }
      const url = URL.createObjectURL(file);
      // Limpa estado previo: foto vinda da camera sempre comeca um post novo
      setNewImages([]);
      // Veio da camera — cancelar no crop reabre a camera (modo feed).
      cropFromCameraRef.current = true;
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

  // Mescla posts reais + samples e ORDENA O ARRAY COMBINADO por createdAt DESC.
  // Hidrata samples com interações persistidas em localStorage (likes/comments
  // adicionados pelo user fluem no feed mesmo que o post não exista no DB).
  //
  // BUG FIX CRITICO: antes era `[...posts, ...samples]` sem sort do combinado.
  // Em qualquer cenario com cache vazio (PWA reinstalado, iOS purgou storage,
  // primeira visita no device), `posts` = [] e o resultado virava SO os
  // samples — mariana_dublin (sample-1) sempre no topo. Agora samples se
  // misturam por data ANTIGA (base 2024-01-01 em feedSamples.ts) e QUALQUER
  // post real vence qualquer sample no sort.
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
    return [...posts, ...samples].sort((a, b) => {
      const ta = new Date(a?.createdAt || 0).getTime();
      const tb = new Date(b?.createdAt || 0).getTime();
      return tb - ta;
    });
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
      // Early-set: assim que os posts chegam (sem esperar pelo enrich
      // de fotos), ja atualiza a tela. Ordem correta garantida.
      // BUG FIX: enrich agora eh fire-and-forget DENTRO de fetchFeed,
      // entao o resultado retornado JA eh o "early" — fetchFeed retorna
      // em ~350ms (so primeira query). Enrich atualiza posts via evento
      // `papo-feed-enriched` quando termina, sem bloquear o boot.
      const fresh = await fetchFeed((earlyPosts) => {
        if (cancelled) return;
        setPosts(earlyPosts);
      });
      if (!cancelled) setPosts(fresh);
    };
    sync();

    // Enrich completou em background -> atualiza state com fotos atuais
    // sem refazer query. Listener separado pra nao bloquear `sync`.
    const onEnriched = (e: Event) => {
      if (cancelled) return;
      const detail = (e as CustomEvent<FeedPost[]>).detail;
      if (Array.isArray(detail)) setPosts(detail);
    };
    window.addEventListener('papo-feed-enriched', onEnriched);

    // PTR (pull-to-refresh) — user puxa pra baixo no feed, dispara
    // refetch dos posts. Soft refresh, mantem scroll/estado.
    const onPtrRefresh = () => { void sync(); };
    window.addEventListener('papo-ptr-refresh', onPtrRefresh);

    // Realtime: novo post, like, comentário, ou delete → atualiza state
    // local imediatamente sem refetch (entrega em ms pra todos).
    // Nome do canal com sufixo aleatório → evita o erro "cannot add
    // postgres_changes callbacks after subscribe()" quando o useEffect
    // re-roda em StrictMode e o Supabase devolve um canal já-inscrito do
    // cache interno se o nome bater.
    //
    // BUG FIX CRITICO: cada handler agora PERSISTE no cache do localStorage
    // alem de atualizar o state. Antes: novo post chegava via Realtime ->
    // state atualizava -> user via na tela, MAS cache nao era atualizado.
    // Quando o user recarregava, cache ainda tinha posts antigos -> mostrava
    // mariana_dublin (post velho) primeiro ate fetchFeed terminar (~500ms-1s
    // no mobile). Agora cache fica sempre fresh enquanto app aberto.
    const ch = supabase
      .channel(`feed_posts:changes:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'feed_posts' }, (payload) => {
        const newPost = rowToPost(payload.new as any);
        setPosts(prev => {
          if (prev.some(p => p.id === newPost.id)) return prev;
          const next = [newPost, ...prev];
          // Cache fresh: proximo reload ja pega o post novo no topo
          saveFeedCache(next, false);
          return next;
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'feed_posts' }, (payload) => {
        // FIX BUG: payload.new em UPDATE traz APENAS as colunas alteradas + PK
        // (sem REPLICA IDENTITY FULL). Quando user curte, recebe so { id, likes }.
        // Antes rowToPost(payload.new) gerava um post com username/image/etc
        // undefined e o map substituia o post inteiro — o post "sumia" visualmente.
        // Agora fazemos MERGE: preserva campos do post local e atualiza so o que
        // veio na payload.
        const raw = payload.new as any;
        if (!raw?.id) return;
        setPosts(prev => {
          const next = prev.map(p => {
            if (p.id !== raw.id) return p;
            const merged: any = { ...p };
            if (Array.isArray(raw.likes)) merged.likes = raw.likes;
            if (Array.isArray(raw.views)) merged.views = raw.views;
            if (Array.isArray(raw.comments)) merged.comments = raw.comments;
            if (Array.isArray(raw.mentions) && raw.mentions.length > 0) merged.mentions = raw.mentions;
            if (raw.text !== undefined && raw.text !== null) merged.text = raw.text || '';
            if (raw.foto_perfil) merged.fotoPerfil = raw.foto_perfil;
            if (raw.image_url) merged.image = raw.image_url;
            if (Array.isArray(raw.images_urls) && raw.images_urls.length > 0) merged.images = raw.images_urls;
            if (raw.video_url) merged.video = raw.video_url;
            return merged;
          });
          saveFeedCache(next, false);
          return next;
        });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'feed_posts' }, (payload) => {
        const id = (payload.old as any)?.id;
        if (!id) return;
        setPosts(prev => {
          const next = prev.filter(p => p.id !== id);
          saveFeedCache(next, false);
          return next;
        });
      })
      .subscribe();

    // Polling como fallback (caso a sub realtime caia). Pausa em background
    // pra nao queimar bateria nem queries do Supabase quando o user nao ta
    // vendo o feed.
    const id = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      sync();
    }, 60_000);

    // BUG FIX: visibilitychange — quando o user volta pra aba apos ficar
    // longe (trocou de aba, voltou do background no mobile), sincroniza
    // IMEDIATAMENTE em vez de esperar ate 60s pelo proximo tick do polling.
    // Isso garante que ao "recarregar/voltar" pra pagina, o ultimo post
    // aparece sem delay perceptivel.
    const onVisible = () => {
      if (typeof document !== 'undefined' && !document.hidden) sync();
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisible);
    }

    // FIX BUG: listener 'papo-feed-updated' removido. Disparava em todo
    // saveFeedCache (like/comment/post novo) → sync() refazia fetchFeed →
    // setPosts(fresh) re-renderizava o feed inteiro → scroll resetava
    // bouncing. O Realtime do Supabase + polling 60s ja garantem sync
    // entre devices; o evento local so causava lag visual.
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
      window.clearInterval(id);
      window.removeEventListener('papo-feed-enriched', onEnriched);
      window.removeEventListener('papo-ptr-refresh', onPtrRefresh);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisible);
      }
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
      if (f.size > 100 * 1024 * 1024) { alert('Imagem grande demais (máx 100MB).'); return; }
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
      if (f.size > 100 * 1024 * 1024) { alert(`"${f.name}" muito grande (máx 100MB por foto).`); continue; }
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
    // Confirmou o editor — user seguiu adiante, limpa o flag de reopen.
    cropFromCameraRef.current = false;
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

  // Override opcional vindo do YouTubeComposerModal — bypass do state
  // newYoutubeUrl/newText (que sao async e ainda nao atualizaram quando
  // o modal chama publish logo apos setState). Quando override.youtubeUrl
  // esta presente, ignoramos state e usamos direto. Garante posts do
  // modal nao perderem URL/legenda por race condition.
  async function publish(override?: { youtubeUrl?: string; caption?: string }) {
    const trimmedYt = (override?.youtubeUrl ?? newYoutubeUrl).trim();
    const effectiveText = (override?.caption ?? newText).trim();
    const ytId = trimmedYt ? extractYouTubeId(trimmedYt) : null;
    if (trimmedYt && !ytId) {
      alert('Link do YouTube inválido. Cole uma URL no formato:\n• https://www.youtube.com/watch?v=...\n• https://youtu.be/...\n• https://youtube.com/shorts/...');
      return;
    }
    if (!effectiveText && newImages.length === 0 && !newVideoFile && !ytId) return;
    // Bloqueia mistura: YouTube + foto/video upload nao faz sentido (so renderiza um deles).
    if (ytId && (newImages.length > 0 || newVideoFile)) {
      alert('Você não pode misturar YouTube com foto/vídeo no mesmo post. Remove uma das mídias.');
      return;
    }
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
        text: effectiveText,
        // image = primeira foto pra compat retroativa; images = array completo
        // quando >= 2 (carrossel). PostCard usa images quando length>=2.
        image: newImages[0],
        images: newImages.length >= 2 ? newImages : undefined,
        video: videoUrl,
        // YouTube: salva URL completa (PostCard extrai ID de novo). Permite
        // ate user editar a URL no futuro sem perder query params (timestamp).
        youtube_url: ytId ? trimmedYt : undefined,
        mentions: newMentions.length > 0 ? newMentions : undefined,
        createdAt: new Date().toISOString(),
        likes: [],
        views: [],
        comments: [],
        spotify_track: newMusicTrack,
      };
      // Otimista: aparece imediato. Depois envia pro banco.
      const next = [post, ...posts];
      setPosts(next);
      saveFeedCache(next);
      const mentionsToNotify = newMentions.slice();
      setNewText('');
      setNewImages([]);
      setNewMentions([]);
      setNewMusicTrack(null);
      setNewYoutubeUrl('');
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
    // Defer remote update + notify pra DEPOIS do paint — antes o curtir
    // ficava travado uns 100-200ms porque updatePostRemote + downscaleDataUrl
    // do notifyUser rodavam na mesma microtask do setState.
    if (nextLikes) {
      const nl = nextLikes;
      setTimeout(() => { updatePostRemote(postId, { likes: nl }).catch(() => {}); }, 0);
    }
    if (didLike && postOwner && postOwner !== currentUser) {
      const post = next.find(p => p.id === postId);
      const imageUrl = post?.image || fotoPerfil;
      setTimeout(() => {
        notifyUser(postOwner, currentUser, 'like', '❤️ Nova curtida', `${currentUser} curtiu seu post`, {
          refId: postId,
          imageUrl,
        });
      }, 0);
    }
  }

  function deletePost(postId: string) {
    if (!confirm('Apagar este post?')) return;
    const next = posts.filter(p => p.id !== postId);
    setPosts(next);
    saveFeedCache(next);
    deletePostRemote(postId).catch(() => {});
  }

  // REPOSTAR — cria um novo post no feed do currentUser com o mesmo
  // conteudo do original (foto/video/imagens/legenda), prefixando o
  // texto com "🔁 Repostado de @autor". So eh acionado se o currentUser
  // foi mencionado no post original (via @username).
  async function repostPost(original: FeedPost) {
    const prefix = `🔁 Repostado de @${original.username}`;
    const text = original.text ? `${prefix}\n\n${original.text}` : prefix;
    const repost: FeedPost = {
      id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      username: currentUser,
      fotoPerfil,
      text,
      image: original.image,
      images: original.images,
      video: original.video,
      mentions: undefined, // nao copia mentions; o repost eh do currentUser
      createdAt: new Date().toISOString(),
      likes: [],
      views: [],
      comments: [],
    };
    const next = [repost, ...posts];
    setPosts(next);
    saveFeedCache(next);
    // Marca o post original como "ja repostado por mim" — esconde o botao
    // Repostar daquele post pra evitar repostes duplicados.
    setRepostedIds(prev => {
      const updated = new Set(prev);
      updated.add(original.id);
      try { localStorage.setItem(REPOSTED_KEY, JSON.stringify(Array.from(updated))); } catch {}
      return updated;
    });
    try {
      await insertPostRemote(repost);
    } catch (e) {
      console.warn('[repost] falhou:', e);
    }
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
    if (nextComments) {
      const nc = nextComments;
      setTimeout(() => { updatePostRemote(postId, { comments: nc }).catch(() => {}); }, 0);
    }
    const targets: string[] = [];
    if (postOwner && postOwner !== currentUser) targets.push(postOwner);
    if (replyTo && replyTo !== currentUser && !targets.includes(replyTo)) targets.push(replyTo);
    if (targets.length > 0) {
      const preview = text.trim().slice(0, 100);
      const title = replyTo ? '💬 Nova resposta' : '💬 Novo comentário';
      const post = next.find(p => p.id === postId);
      const imageUrl = post?.image || fotoPerfil;
      setTimeout(() => {
        notifyUser(targets, currentUser, 'comment', title, `${currentUser}: ${preview}`, {
          refId: postId,
          imageUrl,
        });
      }, 0);
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

  // Toggle de like em um comentario individual de post. Atualiza optimistic
  // + persiste a array comments atualizada no banco.
  function toggleCommentLike(postId: string, commentId: string) {
    const flip = (comments: FeedComment[]) => comments.map(c => {
      if (c.id !== commentId) return c;
      const cur = c.likes ?? [];
      const has = cur.includes(currentUser);
      return { ...c, likes: has ? cur.filter(u => u !== currentUser) : [...cur, currentUser] };
    });
    if (isSampleId(postId)) {
      setSampleInteractions(prev => {
        const cur = prev[postId];
        if (!cur) return prev;
        const next = { ...prev, [postId]: { ...cur, comments: flip(cur.comments) } };
        saveSampleInteractions(next);
        return next;
      });
      return;
    }
    let nextComments: FeedComment[] | null = null;
    const next = posts.map(p => {
      if (p.id !== postId) return p;
      nextComments = flip(p.comments);
      return { ...p, comments: nextComments };
    });
    setPosts(next);
    saveFeedCache(next);
    if (nextComments) {
      const nc = nextComments;
      setTimeout(() => { updatePostRemote(postId, { comments: nc }).catch(() => {}); }, 0);
    }
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
    <div ref={wrapperRef} {...containerProps}>
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
          className={inline ? 'composer-card mt-1 mb-3 p-3 space-y-2 hidden' : 'composer-card mx-3 mt-3 mb-4 p-3 space-y-2'}
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
          {/* PREVIEW do YouTube — thumbnail + remover. Validacao ja foi
              feita ao colar via setNewYoutubeUrl wrapper inline. */}
          {(() => {
            const ytId = extractYouTubeId(newYoutubeUrl);
            return ytId ? (
              <div className="relative rounded-xl overflow-hidden" style={{ background: '#000' }}>
                <img
                  src={youTubeThumbnailUrl(ytId)}
                  alt="YouTube preview"
                  className="w-full max-h-72 object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,0,0,0.85)' }}>
                    <YoutubeIcon className="w-8 h-8 text-white" />
                  </div>
                </div>
                <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ background: 'rgba(255,0,0,0.85)' }}>
                  YouTube
                </span>
                <button
                  onClick={() => setNewYoutubeUrl('')}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(0,0,0,0.6)' }}
                  aria-label="Remover YouTube"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            ) : null;
          })()}
          {/* PREVIEW da música anexada (Spotify) — chip pequeno com X */}
          {newMusicTrack && (
            <div
              className="flex items-center gap-2 px-2 py-1.5 rounded-2xl"
              style={{
                background: 'linear-gradient(135deg, rgba(30,185,84,0.10), rgba(30,185,84,0.04))',
                border: '1px solid rgba(30,185,84,0.30)',
              }}
            >
              <img src={newMusicTrack.album_cover_url} className="w-10 h-10 rounded-lg" alt="" />
              <div className="flex-1 min-w-0 leading-tight">
                <div className="text-xs font-bold truncate" style={{ color: 'var(--sc-text-primary, #0c1014)' }}>
                  {newMusicTrack.name}
                </div>
                <div className="text-[11px] truncate" style={{ color: 'var(--sc-text-secondary, #6b7280)' }}>
                  {newMusicTrack.artist}
                </div>
              </div>
              <button
                onClick={() => setNewMusicTrack(null)}
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(0,0,0,0.06)' }}
                aria-label="Remover música"
              >
                <X className="w-3.5 h-3.5 text-gray-700" />
              </button>
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
                disabled={!!newVideoFile || newImages.length >= MAX_CAROUSEL || !!extractYouTubeId(newYoutubeUrl)}
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
                disabled={newImages.length > 0 || !!extractYouTubeId(newYoutubeUrl)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold disabled:opacity-40"
                style={inline
                  ? { background: '#eef2ff', color: '#3730a3', border: '1px solid #3730a3', borderRadius: 9999 }
                  : { background: 'rgba(255,255,255,0.06)', color: '#bcbcc0', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 9999 }}
                aria-label="Adicionar vídeo"
              >
                <VideoIcon className="w-3.5 h-3.5" />
                Vídeo
              </button>
              {/* MÚSICA (Spotify) — anexa um track ao post como card.
                  Não conta como mídia (não usa upload), pode coexistir com
                  foto, vídeo ou só texto. */}
              <button
                onClick={() => setMusicPickerOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold"
                style={inline
                  ? { background: '#dcfce7', color: '#15803d', border: '1px solid #15803d', borderRadius: 9999 }
                  : { background: 'rgba(255,255,255,0.06)', color: '#bcbcc0', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 9999 }}
                aria-label="Adicionar música do Spotify"
              >
                <MusicIcon className="w-3.5 h-3.5" />
                Música
              </button>
              {/* YOUTUBE — abre prompt pedindo URL. Embed iframe gratis, zero
                  custo Cloudflare. Mutex com foto/video upload. */}
              <button
                onClick={() => {
                  const cur = extractYouTubeId(newYoutubeUrl);
                  if (cur) {
                    // Ja tem — clica de novo limpa (atalho UX)
                    setNewYoutubeUrl('');
                    return;
                  }
                  if (newImages.length > 0 || newVideoFile) {
                    alert('Você já tem foto/vídeo no post. Remove antes de adicionar YouTube.');
                    return;
                  }
                  const url = window.prompt('Cole o link do YouTube:\n(youtube.com/watch?v=, youtu.be/, youtube.com/shorts/)');
                  if (!url) return;
                  if (!extractYouTubeId(url)) {
                    alert('Link inválido. Tenta de novo com uma URL completa do YouTube.');
                    return;
                  }
                  setNewYoutubeUrl(url.trim());
                }}
                disabled={newImages.length > 0 || !!newVideoFile}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold disabled:opacity-40"
                style={inline
                  ? { background: '#fee2e2', color: '#b91c1c', border: '1px solid #b91c1c', borderRadius: 9999 }
                  : { background: 'rgba(255,255,255,0.06)', color: '#bcbcc0', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 9999 }}
                aria-label="Adicionar vídeo do YouTube"
              >
                <YoutubeIcon className="w-3.5 h-3.5" />
                YouTube
              </button>
              {/* Botao "@ Mencionar" foi REMOVIDO. Agora a mencao acontece
                  inline: ao digitar @ na legenda, um popup com sugestoes
                  aparece e o user escolhe quem quer marcar — estilo IG. */}
            </div>
            <button
              onClick={publish}
              disabled={posting || (!newText.trim() && newImages.length === 0 && !newVideoFile && !extractYouTubeId(newYoutubeUrl))}
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
                  onToggleCommentLike={(cid) => toggleCommentLike(p.id, cid)}
                  onDeletePost={() => deletePost(p.id)}
                  onRepost={() => repostPost(p)}
                  alreadyReposted={repostedIds.has(p.id)}
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
          onCancel={() => {
            setEditingVideo(null);
            // Se o video veio da camera, REABRE em vez de mandar pra home.
            if (cropFromCameraRef.current) {
              cropFromCameraRef.current = false;
              window.dispatchEvent(new CustomEvent('papo-reopen-post-camera', { detail: { mode: 'feed' } }));
            }
          }}
          onConfirm={onVideoEditConfirm}
        />,
        document.body
      )}

      {cropSrc && (
        <CropImageModal
          src={cropSrc}
          onCancel={() => {
            setCropSrc(null);
            // Se a foto veio da camera, REABRE em vez de mandar pra home.
            if (cropFromCameraRef.current) {
              cropFromCameraRef.current = false;
              window.dispatchEvent(new CustomEvent('papo-reopen-post-camera', { detail: { mode: 'feed' } }));
            }
          }}
          onConfirm={(dataUrl) => {
            // Confirmou o crop — limpa o flag (usuario seguiu pro composer).
            cropFromCameraRef.current = false;
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
          newMusicTrack={newMusicTrack}
          setNewMusicTrack={setNewMusicTrack}
          onOpenMusicPicker={() => setMusicPickerOpen(true)}
          newYoutubeUrl={newYoutubeUrl}
          setNewYoutubeUrl={setNewYoutubeUrl}
        />,
        document.body
      )}

      {/* MusicPicker (Spotify) — global pro composer inline E modal */}
      <MusicPicker
        open={musicPickerOpen}
        onClose={() => setMusicPickerOpen(false)}
        onSelect={(t) => setNewMusicTrack(t)}
      />

      {/* YouTube Modal — disparado pelo botao YOUTUBE no StoryCamera.
          Modal dedicado pra colar link + legenda. Reusa o publish(): seta
          newYoutubeUrl + newText, fecha modal, chama publish (que limpa state). */}
      {youtubeModalOpen && createPortal(
        <YouTubeComposerModal
          currentUser={currentUser}
          fotoPerfil={fotoPerfil}
          posting={posting}
          onClose={() => setYoutubeModalOpen(false)}
          onPost={async (url, caption) => {
            // Passa override direto pra publish — evita race condition de
            // setState async. publish constroi o post com esses valores e
            // faz reset do state interno depois.
            await publish({ youtubeUrl: url, caption });
            setYoutubeModalOpen(false);
          }}
        />,
        document.body
      )}
    </div>
  );

  return inline ? content : createPortal(content, document.body);
}

// ─── YouTubeComposerModal ──────────────────────────────────────────────
// Modal dedicado pra postar video do YouTube SEM passar pela camera.
// Aberto pelo botao YOUTUBE no carrossel de tabs do StoryCamera (evento
// papo-open-youtube-modal). Layout limpo: URL → preview → legenda → Postar.
interface YouTubeComposerModalProps {
  currentUser: string;
  fotoPerfil: string | null | undefined;
  posting: boolean;
  onClose: () => void;
  onPost: (url: string, caption: string) => Promise<void> | void;
}

function YouTubeComposerModal({ currentUser, fotoPerfil, posting, onClose, onPost }: YouTubeComposerModalProps) {
  useLockBodyScroll(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // iOS Safari scroll-lock BULLETPROOF: useLockBodyScroll usa overflow:hidden
  // mas iOS ainda permite scroll do body via momentum. Esta camada extra
  // usa position:fixed no body com top:-scrollY (e reverte no unmount).
  // Combinado com a fullscreen overlay opaca, o fundo fica COMPLETAMENTE
  // imovel e invisivel enquanto o modal esta aberto.
  useEffect(() => {
    const scrollY = window.scrollY;
    const body = document.body;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
    };
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      window.scrollTo(0, scrollY);
    };
  }, []);

  const ytId = extractYouTubeId(url);
  const valid = !!ytId;

  // closeNow: esconde imperativamente antes do unmount (igual ComposerModalBody).
  const closeNow = () => {
    if (rootRef.current) rootRef.current.style.display = 'none';
    const ae = document.activeElement as HTMLElement | null;
    if (ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT')) ae.blur();
    onClose();
  };
  const onClosePointer = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    closeNow();
  };

  const handlePost = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    try {
      await onPost(url.trim(), caption.trim());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center"
      style={{
        // FUNDO 100% OPACO — user pediu que a pagina principal NAO apareca
        // por tras do modal. Mobile: preto solido full-bleed. Desktop:
        // backdrop escuro pra dar foco no card central.
        background: '#000',
        touchAction: 'none',
        overscrollBehavior: 'contain',
      }}
      onTouchMove={(e) => {
        // Se touch comecou na overlay (nao no conteudo do modal), previne
        // qualquer scroll. Permite scroll DENTRO do form (stopPropagation).
        if (e.target === e.currentTarget) e.preventDefault();
      }}
    >
      <div
        className="bg-white w-full sm:w-[480px] sm:rounded-3xl sm:max-h-[90vh] overflow-hidden flex flex-col"
        style={{
          // Mobile: ocupa tela toda (height 100dvh) — page atras totalmente
          // coberta. Desktop: card centralizado com max-h 90vh (override no
          // sm: acima). touchAction:auto deixa textareas/inputs responderem.
          height: '100dvh',
          touchAction: 'auto',
          overscrollBehavior: 'contain',
        }}
        onTouchMove={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b border-gray-100"
          style={{ background: 'linear-gradient(135deg, #ff0000 0%, #cc0000 100%)' }}
        >
          <div className="flex items-center gap-2 text-white">
            <YoutubeIcon className="w-5 h-5" />
            <span className="text-sm font-bold tracking-wide">Postar do YouTube</span>
          </div>
          <button
            type="button"
            onPointerDown={onClosePointer}
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.18)' }}
            aria-label="Fechar"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Body scrollavel. overscrollBehavior:contain previne scroll-chain
            pro body do iOS quando user rola alem do topo/fundo do modal. */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ overscrollBehavior: 'contain' }}>
          <div className="flex items-center gap-2.5">
            <Avatar username={currentUser} fotoPerfil={fotoPerfil ?? undefined} size={36} />
            <div className="flex-1">
              <p className="text-sm font-bold text-gray-800">@{currentUser}</p>
              <p className="text-[11px] text-gray-500">Postando no feed</p>
            </div>
          </div>

          {/* Input da URL */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
              Link do YouTube
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full px-4 py-2.5 text-sm outline-none rounded-2xl border border-gray-200 focus:border-red-400 transition-colors"
              autoFocus
            />
            <p className="text-[11px] text-gray-400 mt-1.5 leading-snug">
              Aceita: youtube.com/watch · youtu.be · youtube.com/shorts
            </p>
          </div>

          {/* Preview */}
          {valid && (
            <div className="relative rounded-2xl overflow-hidden" style={{ background: '#000' }}>
              <img
                src={youTubeThumbnailUrl(ytId)}
                alt="YouTube preview"
                className="w-full aspect-video object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,0,0,0.9)' }}>
                  <YoutubeIcon className="w-8 h-8 text-white" />
                </div>
              </div>
            </div>
          )}
          {url && !valid && (
            <div className="rounded-xl px-3 py-2 text-xs bg-red-50 border border-red-200 text-red-700">
              Link inválido. Verifica a URL do YouTube.
            </div>
          )}

          {/* Legenda */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
              Legenda (opcional)
            </label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Comenta sobre o video..."
              rows={3}
              className="w-full px-4 py-2.5 text-sm outline-none rounded-2xl border border-gray-200 focus:border-red-400 resize-none transition-colors"
            />
          </div>
        </div>

        {/* Footer com Postar */}
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={closeNow}
            className="px-4 py-2 text-xs font-semibold text-gray-600 rounded-full"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handlePost}
            disabled={!valid || submitting || posting}
            className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold rounded-full disabled:opacity-40"
            style={{
              background: 'linear-gradient(135deg, #ff0000, #cc0000)',
              color: '#fff',
              fontFamily: 'Lato, system-ui, sans-serif',
              letterSpacing: '0.14em',
            }}
          >
            {(submitting || posting) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {submitting || posting ? 'POSTANDO' : 'POSTAR'}
          </button>
        </div>
      </div>
    </div>
  );
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
  /** Música (Spotify) opcional anexada. Mostra preview com X pra remover. */
  newMusicTrack: MusicTrack | null;
  setNewMusicTrack: (t: MusicTrack | null) => void;
  onOpenMusicPicker: () => void;
  /** YouTube URL opcional. Mutex com foto/video. */
  newYoutubeUrl: string;
  setNewYoutubeUrl: (v: string) => void;
}

function ComposerModalBody({
  currentUser, fotoPerfil, newText, setNewText, newImages, setNewImages, maxCarousel,
  onMentionAdd,
  newVideoPreview, newVideoFile, uploadPct, onPickVideo, onClearVideo, videoFileRef,
  posting, AT, fileRef, onPublish, onClose,
  newMusicTrack, setNewMusicTrack, onOpenMusicPicker,
  newYoutubeUrl, setNewYoutubeUrl,
}: ComposerModalBodyProps) {
  // Trava o scroll do body enquanto o composer modal esta aberto — antes
  // a tela debaixo rolava junto.
  useLockBodyScroll(true);
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
              disabled={!!newVideoFile || newImages.length >= maxCarousel || !!extractYouTubeId(newYoutubeUrl)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold disabled:opacity-40"
              style={{ background: '#deede5', color: '#1e714a', border: '1px solid #1e714a', borderRadius: 9999 }}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              {AT.feedPhoto}
            </button>
            <button
              onClick={() => { const el = videoFileRef.current; if (!el) return; el.value = ''; el.click(); }}
              disabled={newImages.length > 0 || !!extractYouTubeId(newYoutubeUrl)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold disabled:opacity-40"
              style={{ background: '#eef2ff', color: '#3730a3', border: '1px solid #3730a3', borderRadius: 9999 }}
              aria-label="Adicionar vídeo"
            >
              <VideoIcon className="w-3.5 h-3.5" />
              Vídeo
            </button>
            {/* MÚSICA (Spotify) — anexa track ao post */}
            <button
              onClick={onOpenMusicPicker}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold"
              style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #15803d', borderRadius: 9999 }}
              aria-label="Adicionar música do Spotify"
            >
              <MusicIcon className="w-3.5 h-3.5" />
              Música
            </button>
            {/* YOUTUBE — embed gratis, zero custo Cloudflare. Mutex foto/video. */}
            <button
              onClick={() => {
                if (extractYouTubeId(newYoutubeUrl)) { setNewYoutubeUrl(''); return; }
                if (newImages.length > 0 || newVideoFile) {
                  alert('Remove a foto/vídeo antes de adicionar YouTube.');
                  return;
                }
                const url = window.prompt('Cole o link do YouTube:');
                if (!url) return;
                if (!extractYouTubeId(url)) { alert('Link inválido.'); return; }
                setNewYoutubeUrl(url.trim());
              }}
              disabled={newImages.length > 0 || !!newVideoFile}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold disabled:opacity-40"
              style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #b91c1c', borderRadius: 9999 }}
              aria-label="Adicionar vídeo do YouTube"
            >
              <YoutubeIcon className="w-3.5 h-3.5" />
              YouTube
            </button>
            {/* Botao "@ Mencionar" foi REMOVIDO. Mencao agora eh inline: o
                user digita @ na legenda e um popup aparece com sugestoes. */}
          </div>
          <button
            onClick={onPublish}
            disabled={posting || (!newText.trim() && newImages.length === 0 && !newVideoFile && !newMusicTrack && !extractYouTubeId(newYoutubeUrl))}
            className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold disabled:opacity-40"
            style={{ background: '#1e714a', color: '#fff', fontFamily: 'Lato, system-ui, sans-serif', letterSpacing: '0.14em', borderRadius: 9999 }}
          >
            {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {posting ? AT.feedPosting : AT.feedPost}
          </button>
        </div>
        {/* PREVIEW da música anexada (Spotify) no modal composer */}
        {newMusicTrack && (
          <div
            className="flex items-center gap-2 px-2 py-1.5 rounded-2xl mt-3"
            style={{
              background: 'linear-gradient(135deg, rgba(30,185,84,0.10), rgba(30,185,84,0.04))',
              border: '1px solid rgba(30,185,84,0.30)',
            }}
          >
            <img src={newMusicTrack.album_cover_url} className="w-10 h-10 rounded-lg" alt="" />
            <div className="flex-1 min-w-0 leading-tight">
              <div className="text-xs font-bold truncate text-gray-800">{newMusicTrack.name}</div>
              <div className="text-[11px] truncate text-gray-500">{newMusicTrack.artist}</div>
            </div>
            <button
              onClick={() => setNewMusicTrack(null)}
              className="w-7 h-7 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.06)' }}
              aria-label="Remover música"
            >
              <X className="w-3.5 h-3.5 text-gray-700" />
            </button>
          </div>
        )}
        {/* PREVIEW do YouTube no modal — thumbnail + play overlay + X */}
        {(() => {
          const ytId = extractYouTubeId(newYoutubeUrl);
          return ytId ? (
            <div className="relative rounded-xl overflow-hidden mt-3" style={{ background: '#000' }}>
              <img src={youTubeThumbnailUrl(ytId)} alt="YouTube preview" className="w-full max-h-72 object-cover" />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,0,0,0.85)' }}>
                  <YoutubeIcon className="w-8 h-8 text-white" />
                </div>
              </div>
              <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ background: 'rgba(255,0,0,0.85)' }}>
                YouTube
              </span>
              <button
                onClick={() => setNewYoutubeUrl('')}
                className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(0,0,0,0.6)' }}
                aria-label="Remover YouTube"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          ) : null;
        })()}
      </div>
    </div>
  );
}

// ─── CropImageModal ───────────────────────────────────────────────────
// Estilo Instagram: imagem em viewport quadrado, drag + zoom, recorte
// final em 1080×1080 JPEG. Mantém todos os posts no mesmo aspecto e evita
// poluição visual no feed.
export function CropImageModal({ src, onCancel, onConfirm, aspectRatio = 1, title = 'Ajustar foto', outputSize = 1080 }: {
  src: string;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void;
  /** width / height do recorte. 1 = quadrado (foto perfil). ~1.78 (16/9) ou 2 (banner) pra wallpaper. */
  aspectRatio?: number;
  /** Titulo no header. Default "Ajustar foto". */
  title?: string;
  /** Tamanho do output (lado maior, em pixels). Default 1080. */
  outputSize?: number;
}) {
  // Avisa o App pra desabilitar pull-to-refresh enquanto o crop esta aberto
  // (sem isso, arrastar pra baixo no crop disparava refresh da pagina e
  // o user perdia o ajuste de foto).
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('papo-camera-state', { detail: { open: true } }));
    return () => {
      window.dispatchEvent(new CustomEvent('papo-camera-state', { detail: { open: false } }));
    };
  }, []);
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
  // viewport com aspect ratio configuravel (default 1 = quadrado). Preenche o
  // espaco entre header e footer no mobile, cap em 440 no desktop. Pra wallpaper
  // (aspectRatio > 1), o viewport eh horizontal (mais largo que alto).
  const [view, setView] = useState<{ w: number; h: number }>({ w: 360, h: 360 });

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    img.src = src;
  }, [src]);

  // Calcula o tamanho do viewport conforme o espaço disponível e aspectRatio.
  // - aspectRatio 1: quadrado (min(w, h))
  // - aspectRatio > 1 (banner): w maior que h, cabe na largura
  useEffect(() => {
    function recalc() {
      const el = cropAreaRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // Margem interna pra nao colar nas bordas
      const availW = Math.max(200, r.width - 24);
      const availH = Math.max(200, r.height - 24);
      // Tenta caber baseado na largura: w = availW, h = w / aspectRatio
      let w = availW;
      let h = w / aspectRatio;
      // Se passar da altura disponivel, recalcula baseado na altura
      if (h > availH) {
        h = availH;
        w = h * aspectRatio;
      }
      setView({ w: Math.round(w), h: Math.round(h) });
    }
    recalc();
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [imgSize, aspectRatio]);

  // Trava o scroll do body (incl. iOS rubber-band) enquanto o modal abre.
  useLockBodyScroll(true);

  // calcula a escala "cover" base — imagem precisa cobrir o viewport
  // (W e H). Pega o MAIOR ratio entre view.w/img.w e view.h/img.h.
  const baseScale = useMemo(() => {
    if (!imgSize) return 1;
    return Math.max(view.w / imgSize.w, view.h / imgSize.h);
  }, [imgSize, view]);

  const drawnW = imgSize ? imgSize.w * baseScale * zoom : 0;
  const drawnH = imgSize ? imgSize.h * baseScale * zoom : 0;

  function clampWith(o: { x: number; y: number }, w: number, h: number) {
    const maxX = Math.max(0, (w - view.w) / 2);
    const maxY = Math.max(0, (h - view.h) / 2);
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
    // Output dimensions: lado maior = outputSize, mantem aspect ratio.
    const outW = aspectRatio >= 1 ? outputSize : Math.round(outputSize * aspectRatio);
    const outH = aspectRatio >= 1 ? Math.round(outputSize / aspectRatio) : outputSize;
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Tamanho do crop no espaco original da imagem
    const cropW = view.w / (baseScale * zoom);
    const cropH = view.h / (baseScale * zoom);
    const cx = imgSize.w / 2 - offset.x / (baseScale * zoom);
    const cy = imgSize.h / 2 - offset.y / (baseScale * zoom);
    const sx = cx - cropW / 2;
    const sy = cy - cropH / 2;
    const tmp = new Image();
    tmp.onload = () => {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, outW, outH);
      ctx.drawImage(tmp, sx, sy, cropW, cropH, 0, 0, outW, outH);
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
          <span className="text-white text-sm font-semibold">{title}</span>
          <button onClick={confirm} className="text-sm font-bold px-2 py-1 -mx-2" style={{ color: '#3b82f6' }}>Confirmar</button>
        </div>

        {/* Área do crop — preenche o meio. O ref dá o tamanho disponível;
            o viewport quadrado é centralizado dentro. overflow:hidden garante
            que a imagem ampliada não vaze nem dê impressão de "esticar". */}
        <div ref={cropAreaRef} className="flex-1 flex items-center justify-center min-h-0" style={{ background: '#000' }}>
          <div
            className="relative select-none"
            style={{ width: view.w, height: view.h, background: '#000', cursor: 'grab', touchAction: 'none', overflow: 'hidden' }}
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
  onToggleCommentLike: (cid: string) => void;
  onDeletePost: () => void;
  /** Repostar o post no proprio feed (so visivel se o user atual foi
   *  mencionado no post via @username). */
  onRepost: () => void;
  /** Se o currentUser ja repostou este post (esconde o botao Repostar
   *  pra evitar repostes duplicados). */
  alreadyReposted?: boolean;
}

function PostCardImpl({ post, currentUser, fotoPerfil, hasStory, onToggleLike, onAddComment, onDeleteComment, onToggleCommentLike, onDeletePost, onRepost, alreadyReposted }: PostCardProps) {
  const [showAll, setShowAll] = useState(false);
  const [comment, setComment] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [replyTarget, setReplyTarget] = useState<{ parentId: string; user: string } | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  // Mesmo media query que o FeedVideo usa pra wrapperAspect — usado pelo
  // iframe do YouTube pra ter o MESMO tamanho do video do Cloudflare
  // (4:5 mobile, 1:1 desktop) e nao o 16:9 padrao do YouTube.
  const [isMobileView, setIsMobileView] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobileView(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  // Modal "Visualizadores" — abre quando o dono do post clica no olho.
  const [showViewers, setShowViewers] = useState(false);
  // Modal "Curtidas" — abre quando clica no contador de curtidas (estilo Instagram).
  const [showLikes, setShowLikes] = useState(false);
  // Trava o scroll do body enquanto o modal de viewers/likes esta aberto —
  // sem isso, o scroll do feed atras rolava junto com o scroll da
  // lista (overscroll do iOS / scroll chaining no Android).
  useLockBodyScroll(showViewers || showLikes);
  // Map de username -> foto_perfil dos viewers/likers (lazy fetch quando modal abre)
  const [viewerPhotos, setViewerPhotos] = useState<Record<string, string | null>>({});
  const [likerPhotos, setLikerPhotos] = useState<Record<string, string | null>>({});
  useEffect(() => {
    if (!showViewers || post.views.length === 0) return;
    const missing = post.views.filter(u => !(u in viewerPhotos));
    if (missing.length === 0) return;
    supabase.from('usuarios').select('username, foto_perfil').in('username', missing).then(({ data }) => {
      if (!data) return;
      setViewerPhotos(prev => {
        const next = { ...prev };
        (data as any[]).forEach(u => { next[u.username] = u.foto_perfil || null; });
        missing.forEach(u => { if (!(u in next)) next[u] = null; });
        return next;
      });
    });
  }, [showViewers, post.views, viewerPhotos]);
  // Mesmo padrao do viewers — busca fotos das pessoas que curtiram quando o
  // modal "Curtidas" abre. Mantemos cache separado pra nao duplicar requisicoes.
  useEffect(() => {
    if (!showLikes || post.likes.length === 0) return;
    const missing = post.likes.filter(u => !(u in likerPhotos));
    if (missing.length === 0) return;
    supabase.from('usuarios').select('username, foto_perfil').in('username', missing).then(({ data }) => {
      if (!data) return;
      setLikerPhotos(prev => {
        const next = { ...prev };
        (data as any[]).forEach(u => { next[u.username] = u.foto_perfil || null; });
        missing.forEach(u => { if (!(u in next)) next[u] = null; });
        return next;
      });
    });
  }, [showLikes, post.likes, likerPhotos]);
  const inputRef = useRef<HTMLInputElement>(null);
  const liked = post.likes.includes(currentUser);
  const isOwn = post.username === currentUser;
  // Estado pra exibir botao "Conectar-se" no header do post (estilo IG).
  // Atualiza tanto na carga quanto em eventos papo-friends-updated.
  const [connectState, setConnectState] = useState(() => ({
    isFriend: isFriend(currentUser, post.username),
    hasPending: hasSentRequest(currentUser, post.username),
  }));
  // Trava scroll do body enquanto o sheet de comentarios esta aberto —
  // assim o feed atras nao rola quando o user le os comentarios.
  useLockBodyScroll(showAll);
  useEffect(() => {
    const sync = () => setConnectState({
      isFriend: isFriend(currentUser, post.username),
      hasPending: hasSentRequest(currentUser, post.username),
    });
    sync();
    window.addEventListener('papo-friends-updated', sync);
    return () => window.removeEventListener('papo-friends-updated', sync);
  }, [currentUser, post.username]);
  const [heartBurst, setHeartBurst] = useState(false);
  const lastTapRef = useRef<number>(0);
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ref imperativa pro PostMusicTicker — usada pelo handleImageTap pra
  // alternar pause/play da musica quando o user toca na foto (Instagram-style).
  const musicTickerRef = useRef<PostMusicTickerHandle>(null);
  // ref do wrapper visivel da foto (passado pro IntersectionObserver do
  // PostMusicTicker pra detectar entrada no viewport).
  const photoWrapRef = useRef<HTMLDivElement>(null);
  // Estado de playing da musica do post — usado pra renderizar o icone
  // de som (Volume2 = tocando, VolumeX = mutado). Atualizado pelo engine
  // via callback onPlayingChange. Otimista true.
  const [musicPlaying, setMusicPlaying] = useState(true);
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
    // Double-tap (intervalo < 300ms) — CURTE com heart burst.
    if (now - lastTapRef.current < 300) {
      lastTapRef.current = 0;
      // Cancela o single-tap pendente (se houver) — evita togglePlay
      // como efeito colateral indesejado do primeiro tap.
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
    // Single-tap (com delay 300ms pra dar tempo do 2o tap chegar):
    // se o post tem musica, alterna pause/play (mute Instagram-style).
    // Se nao tem musica, nao faz nada (mantem o comportamento anterior).
    if (post.spotify_track) {
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = window.setTimeout(() => {
        singleTapTimerRef.current = null;
        musicTickerRef.current?.togglePlay();
      }, 300);
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
  // YouTube embed renderizado como iframe — count como midia pra hasMedia.
  const youTubeId = extractYouTubeId(post.youtube_url);
  const hasMedia = !!(post.image || post.video || isCarousel || youTubeId);

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
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent('papo-open-profile', { detail: { username: post.username } }));
          }}
          className="flex-shrink-0"
          aria-label={`Ver perfil de ${post.username}`}
        >
          <Avatar username={post.username} fotoPerfil={post.fotoPerfil} size={36} hasStory={hasStory} onMedia={hasMedia} />
        </button>
        <div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              window.dispatchEvent(new CustomEvent('papo-open-profile', { detail: { username: post.username } }));
            }}
            className="text-sm font-semibold hover:underline active:scale-95"
            style={{
              color: hasMedia ? '#ffffff' : '#262626',
              textShadow: hasMedia ? '0 1px 3px rgba(0,0,0,0.55)' : undefined,
            }}
          >
            {post.username}
          </button>
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
        {/* Chip de musica DENTRO da foto, ao lado do username — estilo
            Instagram: nome+artista em scroll horizontal infinito (marquee).
            So aparece se o post tem foto/video (hasMedia) — sem media nao
            tem onde sobrepor o chip. O iframe Spotify hidden eh montado
            separadamente perto do wrapper da media (ver render mais abaixo). */}
        {hasMedia && post.spotify_track && (
          <div className="ml-1 flex-shrink min-w-0">
            <PostMusicTickerChip track={post.spotify_track} />
          </div>
        )}
        {/* Botao "Conectar-se" estilo Instagram — aparece SO se o post nao
            eh meu, e o autor nao eh amigo nem tem pedido pendente. */}
        {!isOwn && !connectState.isFriend && !connectState.hasPending && (
          <button
            type="button"
            onClick={async (e) => {
              e.stopPropagation();
              if (!currentUser) return;
              setConnectState(s => ({ ...s, hasPending: true }));
              await sendFriendRequest(currentUser, post.username, { from_nome: currentUser });
            }}
            className="ml-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold active:scale-95 transition-all"
            style={{ background: hasMedia ? 'rgba(255,255,255,0.92)' : '#1e714a', color: hasMedia ? '#1e714a' : '#fff', border: hasMedia ? '1px solid #1e714a' : '1px solid #1e714a' }}
          >
            Conectar-se
          </button>
        )}
        {!isOwn && connectState.hasPending && !connectState.isFriend && (
          <span
            className="ml-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold"
            style={{ background: 'transparent', color: hasMedia ? 'rgba(255,255,255,0.9)' : '#8e8e8e', border: hasMedia ? '1px solid rgba(255,255,255,0.6)' : '1px solid #d6d3d1' }}
          >
            Pedido enviado
          </span>
        )}
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
           manter altura uniforme entre slides de proporcoes diferentes.
           data-no-swipe: user pediu que ao deslizar horizontalmente NUM
           carrossel, a gestura SO faca o carousel scroll — sem abrir a
           camera (swipe direita) nem o FriendsDrawer (swipe esquerda).
           useSwipeOpen detecta esse attr no target.closest e ignora a
           gesta. */}
      {isCarousel && (
        <div ref={photoWrapRef} data-no-swipe="1" className="relative w-full" style={{ background: '#000' }}>
          <div
            ref={carouselRef}
            data-no-swipe="1"
            className="flex w-full overflow-x-auto snap-x snap-mandatory"
            style={{ scrollbarWidth: 'none' }}
            onClick={handleImageTap}
          >
            {post.images!.map((src, i) => (
              <div
                key={i}
                className="flex-shrink-0 w-full snap-center flex items-center justify-center aspect-[4/5] sm:aspect-square"
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

          {/* Heart burst on double-tap — centralizado na midia */}
          {heartBurst && (
            <div
              className="absolute left-1/2 top-1/2 pointer-events-none flex items-center justify-center"
              style={{
                width: 110, height: 110, marginLeft: -55, marginTop: -55,
                animation: 'heartBurst 700ms ease-out forwards',
                zIndex: 3,
              }}
            >
              <Heart
                style={{
                  width: 110, height: 110,
                  color: '#fff', fill: '#f87171',
                  filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.6))',
                }}
              />
            </div>
          )}
          {/* Icone de som no carrossel (igual o da foto unica) */}
          {post.spotify_track && (
            <div className="absolute bottom-3 right-3" style={{ zIndex: 4 }}>
              <PostMusicSoundIcon
                playing={musicPlaying}
                onClick={() => musicTickerRef.current?.togglePlay()}
              />
            </div>
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
          ref={photoWrapRef}
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
            className="block w-full pointer-events-none aspect-[4/5] sm:aspect-square"
            loading="lazy"
            draggable={false}
            style={{
              // Aspect ratio responsivo: mobile = 4:5 (vertical, estilo
              // Instagram mobile). Desktop sm:+ = 1:1 quadrado (estilo
              // Instagram web, ~600px). Posts uniformes em ambos os modos.
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
            <div
              className="absolute left-1/2 top-1/2 pointer-events-none flex items-center justify-center"
              style={{
                width: 110, height: 110, marginLeft: -55, marginTop: -55,
                animation: 'heartBurst 700ms ease-out forwards',
                zIndex: 3,
              }}
            >
              <Heart
                style={{
                  width: 110, height: 110,
                  color: '#fff', fill: '#f87171',
                  filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.6))',
                }}
              />
            </div>
          )}
          {/* Icone de som (Volume2/VolumeX) DENTRO da foto — bottom-right.
              Mesmo padrao do FeedVideo (ver botao de mute la). Tap toggla
              play/pause (Spotify embed nao expoe mute, entao pause==mute
              funcionalmente). Visual claro pra o user identificar se o som
              esta on/off no post. */}
          {post.spotify_track && (
            <div className="absolute bottom-3 right-3" style={{ zIndex: 3 }}>
              <PostMusicSoundIcon
                playing={musicPlaying}
                onClick={() => musicTickerRef.current?.togglePlay()}
              />
            </div>
          )}
        </div>
      )}

      {/* YouTube embed — full-bleed estilo Instagram. NENHUM espaco lateral.
          Tecnica: iframe maior que o container (sized via aspectRatio
          16/9 com height 100%), posicionado absolute centralizado, e
          container overflow:hidden corta as sobras. Sem wrapper extra —
          simplifica e elimina edge cases iOS Safari onde % em wrappers
          aninhados ficava 0px. Lazy load via loading="lazy". */}
      {youTubeId && (
        <div
          ref={photoWrapRef}
          className="relative w-full overflow-hidden"
          style={{ background: '#000', aspectRatio: isMobileView ? '4 / 5' : '1 / 1' }}
        >
          <iframe
            src={youTubeEmbedUrl(youTubeId)}
            title="YouTube video"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            loading="lazy"
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              // Height 100% + aspectRatio 16/9 → iframe width auto-calculada
              // pelo browser pra preservar 16:9. Resultado: iframe sempre
              // mais largo que o container (em qualquer aspect), e overflow
              // hidden corta as laterais. Sem barras pretas.
              height: '100%',
              width: 'auto',
              aspectRatio: '16 / 9',
              minWidth: '100%',
              border: 0,
              display: 'block',
            }}
          />
          {/* Gradient + header overlay no topo (mesma pattern do video) */}
          <div
            className="absolute top-0 left-0 right-0 pointer-events-none"
            style={{ height: 92, background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 100%)', zIndex: 1 }}
          />
          <div
            className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 pt-3 pb-2"
            style={{ zIndex: 30 }}
          >
            {headerInner}
          </div>
        </div>
      )}

      {/* Video — wrapper relativo pra acomodar o header overlay por cima.
           1 tap = abre fullscreen, 2 taps = curte (heart burst). */}
      {post.video && (
        <div ref={photoWrapRef} className="relative w-full">
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

          {/* Header overlay — username/avatar/conectar/apagar DENTRO do video.
              BUG FIX: z-index agora 30 (era 2) pra vencer a camada de
              captura de eventos do FeedVideo que fica em z-5 e intercepta
              taps na area do video. Sem isso, click no avatar/story da
              autora ou no botao "Conectar-se" eram engolidos pelo overlay
              do video — os taps nem chegavam nos botoes.
              Trade-off conhecido: a faixa de ~60px do topo do video deixa
              de responder a tap-to-mute / double-tap-to-like (esses gestos
              ficam disponiveis no resto do video, que eh a maior parte). */}
          <div
            className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 pt-3 pb-2"
            style={{ zIndex: 30 }}
          >
            {headerInner}
          </div>
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center gap-4 px-3 py-2.5">
        {/* Heart (toggle like) + contador clicavel separado pra abrir modal
            "Curtidas" (estilo Instagram). Antes era um botao unico que
            sempre togglevava — agora o coracao continua togglando mas o
            numero abre a lista de quem curtiu. */}
        <button
          onClick={onToggleLike}
          className="flex items-center gap-1.5 text-sm font-semibold transition-all active:scale-90"
          style={{ color: liked ? '#ed4956' : '#262626' }}
          aria-label={liked ? 'Descurtir' : 'Curtir'}
        >
          <Heart className="w-5 h-5" fill={liked ? '#f87171' : 'transparent'} />
        </button>
        {post.likes.length > 0 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowLikes(true); }}
            className="-ml-3 text-sm font-semibold transition-all active:scale-90"
            style={{ color: liked ? '#ed4956' : '#262626' }}
            aria-label="Ver quem curtiu"
          >
            {post.likes.length}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            // Toggle lista de comentarios (igual Instagram). Se nao havia
            // nenhum, foca o input pra escrever um. Se ja tinha, mostra
            // todos + foca o input em seguida.
            setShowAll(prev => !prev);
            const el = inputRef.current;
            if (!el) return;
            try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
            setTimeout(() => { try { el.focus({ preventScroll: true }); } catch { el.focus(); } }, 120);
          }}
          className="flex items-center gap-1.5 text-sm font-semibold transition-all active:scale-90"
          style={{ color: '#262626' }}
          aria-label="Comentar"
        >
          <MessageCircle className="w-5 h-5" />
          {post.comments.length > 0 && <span>{post.comments.length}</span>}
        </button>
        {/* Eye: clicavel SO pro dono do post -> abre modal com lista
            de viewers (estilo Instagram). Pra quem nao eh dono, eh
            apenas um contador estatico. */}
        {isOwn ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowViewers(true); }}
            className="flex items-center gap-1.5 text-sm font-semibold ml-auto active:scale-95 transition-transform"
            style={{ color: '#8e8e8e' }}
            title={`${post.views.length} visualizações`}
          >
            <Eye className="w-4 h-4" />
            <span className="text-xs">{post.views.length}</span>
          </button>
        ) : (
          <div className="flex items-center gap-1.5 text-sm font-semibold ml-auto" style={{ color: '#8e8e8e' }}>
            <Eye className="w-4 h-4" />
            <span className="text-xs">{post.views.length}</span>
          </div>
        )}
      </div>

      {/* "Curtido por @user e mais X pessoas" — estilo Instagram. Click
          abre o modal com lista completa de quem curtiu. Mostra o primeiro
          username em destaque + contagem dos demais. So aparece quando ha
          pelo menos 1 curtida. */}
      {post.likes.length > 0 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setShowLikes(true); }}
          className="px-3 pb-1.5 text-left active:opacity-70"
          style={{ color: '#262626' }}
          aria-label="Ver quem curtiu"
        >
          <span className="text-sm">
            Curtido por{' '}
            <span className="font-semibold">{post.likes[0]}</span>
            {post.likes.length > 1 && (
              <>
                {' e mais '}
                <span className="font-semibold">
                  {post.likes.length - 1} {post.likes.length - 1 === 1 ? 'pessoa' : 'pessoas'}
                </span>
              </>
            )}
          </span>
        </button>
      )}

      {/* ENGINE da musica Spotify — iframe HIDDEN (toca em background, sem
          UI visivel). O nome da musica aparece DENTRO da foto (chip marquee
          no header overlay, ver headerInner). Tap na foto pausa/retoma
          (handleImageTap chama musicTickerRef.current?.togglePlay()).
          So monta se ha musica E ha midia visivel pra ancorar o IO. */}
      {post.spotify_track && hasMedia && (
        <PostMusicEngine
          ref={musicTickerRef}
          track={post.spotify_track}
          visibleAnchorRef={photoWrapRef}
          onPlayingChange={setMusicPlaying}
        />
      )}

      {/* Caption — abaixo dos botoes like/comentar.
          hideMentions: a lista "Com X" aparece separada abaixo, evita duplicar. */}
      {post.text && (
        <AutoText
          as="p"
          text={post.text}
          hideMentions={!!(post.mentions && post.mentions.length > 0)}
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

      {/* REPOSTAR — aparece SO se o user atual foi mencionado no post via @
          (e nao eh o autor original). Cria um post novo com o mesmo conteudo
          assinado pelo currentUser, prefixando "🔁 Repostado de @autor".
          NAO aparece se:
            - o post ja eh um repost (text comeca com "🔁 Repostado de @"), OU
            - o currentUser ja repostou esse post antes (flag alreadyReposted). */}
      {post.mentions?.includes(currentUser)
        && post.username !== currentUser
        && !alreadyReposted
        && !post.text?.startsWith('🔁 Repostado de @') && (
        <div className="px-3 pb-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Repostar este post de @${post.username} no seu feed?`)) {
                onRepost();
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold active:scale-95 transition-transform"
            style={{
              background: '#1e714a',
              color: '#ffffff',
              border: '1px solid #1e714a',
            }}
            aria-label="Repostar"
          >
            🔁 Repostar
          </button>
        </div>
      )}

      {/* Bottom Sheet de COMENTARIOS + COMPOSER — abre via showAll (icone
          do balao). Antes ficavam inline no feed; agora aparece em sheet
          modal estilo Instagram, sobreposta a partir de baixo. */}
      {showAll && createPortal(
        <div
          className="fixed inset-0 z-[1000] flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={() => setShowAll(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-t-2xl shadow-2xl flex flex-col"
            style={{ maxHeight: '80vh', minHeight: '40vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Handle + header */}
            <div className="px-4 pt-2.5 pb-2 border-b border-gray-100 flex flex-col items-center">
              <span className="w-10 h-1 rounded-full bg-gray-300 mb-2" aria-hidden />
              <p className="text-sm font-bold text-gray-800">
                {topLevel.length === 0 ? 'Nenhum comentário ainda' : `Comentários · ${topLevel.length}`}
              </p>
            </div>
            {/* Lista scrollavel — min-h-0 garante que o flex-1 limite
                a altura corretamente em flexbox e o overflow-y-auto
                ative o scroll proprio quando ha muitos comentarios. */}
            <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-2" style={{ WebkitOverflowScrolling: 'touch' }}>
              {topLevel.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">Seja o primeiro a comentar.</p>
              ) : visibleTopLevel.map(c => {
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
                      onToggleLike={() => onToggleCommentLike(c.id)}
                    />
                    {replies.length > 0 && (
                      <div className="ml-9 mt-1">
                        {!showReplies ? (
                          <button onClick={() => toggleReplies(c.id)} className="text-[11px] flex items-center gap-1.5 py-1" style={{ color: '#8e8e8e' }}>
                            <span style={{ width: 22, height: 1, background: '#dbdbdb' }} />
                            Ver {replies.length} resposta{replies.length === 1 ? '' : 's'}
                          </button>
                        ) : (
                          <>
                            <button onClick={() => toggleReplies(c.id)} className="text-[11px] flex items-center gap-1.5 py-1" style={{ color: '#8e8e8e' }}>
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
                                  onToggleLike={() => onToggleCommentLike(r.id)}
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
            {/* Composer foi REMOVIDO daqui — agora aparece sempre embaixo
                do post no card (igual era antes do sheet). User digita
                ali e o sheet so mostra a lista de leitura. */}
          </div>
        </div>,
        document.body
      )}

      {/* Comment composer FIXO no card (fora do sheet, igual antes).
          Sheet de comentarios so mostra a lista de leitura — composer
          fica sempre visivel embaixo do post. */}
      <div className="px-3 py-2" style={{ borderTop: '1px solid #efefef' }}>
        {replyTarget && (
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px]" style={{ color: '#8e8e8e' }}>
              Respondendo a <span className="font-semibold" style={{ color: '#1e714a' }}>{replyTarget.user}</span>
            </span>
            <button onClick={() => { setReplyTarget(null); setComment(''); }} className="text-[11px]" style={{ color: '#8e8e8e' }}>
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
            <button onClick={submitComment} className="text-xs font-bold" style={{ color: '#0095f6' }}>
              Publicar
            </button>
          )}
        </div>
      </div>

      {/* LIGHTBOX — abre a foto em tamanho original. Usa componente
          compartilhado com scroll lock + swipe-down pra fechar. */}
      {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}

      {/* Modal "Curtidas" — abre quando clica no contador de likes (estilo
          Instagram). Mostra lista de usernames + fotos dos users que
          curtiram. Tap em um item abre o perfil. */}
      {showLikes && createPortal(
        <div
          className="fixed inset-0 z-[10005] bg-black/60 flex items-end sm:items-center justify-center"
          onClick={() => setShowLikes(false)}
        >
          <div
            className="bg-white w-full max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[80dvh] overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wide flex items-center gap-2">
                <Heart className="w-4 h-4" fill="#ed4956" stroke="#ed4956" />
                {post.likes.length} {post.likes.length === 1 ? 'curtida' : 'curtidas'}
              </h3>
              <button
                type="button"
                onClick={() => setShowLikes(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                aria-label="Fechar"
              >×</button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2" style={{ WebkitOverflowScrolling: 'touch' }}>
              {post.likes.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">Ninguém curtiu ainda.</p>
              ) : (
                post.likes.map(liker => {
                  const photo = likerPhotos[liker];
                  return (
                    <button
                      key={liker}
                      type="button"
                      onClick={() => {
                        setShowLikes(false);
                        window.dispatchEvent(new CustomEvent('papo-open-profile', { detail: { username: liker } }));
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors text-left"
                    >
                      <Avatar username={liker} fotoPerfil={photo || undefined} size={40} />
                      <span className="flex-1 text-sm font-semibold text-gray-800 truncate">{liker}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal "Visualizadores" — abre quando o dono clica no olho. Mostra
          lista de usernames + fotos dos users que visualizaram o post. */}
      {showViewers && createPortal(
        <div
          className="fixed inset-0 z-[10005] bg-black/60 flex items-end sm:items-center justify-center"
          onClick={() => setShowViewers(false)}
        >
          <div
            className="bg-white w-full max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[80dvh] overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wide flex items-center gap-2">
                <Eye className="w-4 h-4" />
                {post.views.length} {post.views.length === 1 ? 'visualização' : 'visualizações'}
              </h3>
              <button
                type="button"
                onClick={() => setShowViewers(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                aria-label="Fechar"
              >×</button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2" style={{ WebkitOverflowScrolling: 'touch' }}>
              {post.views.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">Ninguém visualizou ainda.</p>
              ) : (
                post.views.map(viewer => {
                  const photo = viewerPhotos[viewer];
                  return (
                    <button
                      key={viewer}
                      type="button"
                      onClick={() => {
                        setShowViewers(false);
                        window.dispatchEvent(new CustomEvent('papo-open-profile', { detail: { username: viewer } }));
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors text-left"
                    >
                      <Avatar username={viewer} fotoPerfil={photo || undefined} size={40} />
                      <span className="flex-1 text-sm font-semibold text-gray-800 truncate">{viewer}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

/**
 * PostCard envolvido em memo() com comparacao customizada — re-renderiza
 * SOMENTE quando os dados visiveis do post mudam (post / hasStory /
 * fotoPerfil / currentUser). Callbacks (onToggleLike, onAddComment, etc.)
 * sao recriadas a cada render do FeedNews mas sao ignoradas aqui: como o
 * setPosts no FeedNews usa map() preservando referencias de objetos nao
 * alterados, curtir/comentar 1 post NAO re-renderiza os outros 49.
 *
 * Ganho medido: curtir um post no feed grande deixa de re-renderizar
 * todos os PostCards visiveis -> sem aquele micro-travamento.
 */
const PostCard = memo(PostCardImpl, (prev, next) =>
  prev.post === next.post &&
  prev.hasStory === next.hasStory &&
  prev.fotoPerfil === next.fotoPerfil &&
  prev.currentUser === next.currentUser
);

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
    // Tick a cada 5 minutos (era 60s). simulateOnline so muda no minuto,
    // mas o componente nao precisa refletir isso em tempo real — economia
    // grande de queries Supabase em paralelo com a sidebar desktop.
    const tick = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      reload();
    }, 300_000);
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
    // Re-checa status simulado a cada 5 minutos (era 60s). Junto com a
    // variante mobile, antes faziamos 2 queries Supabase a cada 60s mesmo
    // com tab em background — agora pausa quando hidden e roda 5x menos.
    const tick = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      reload();
    }, 300_000);
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
  onToggleLike: () => void;
}
function CommentRow({ c, currentUser, isOwnPost, small, onReply, onDelete, onToggleLike }: CommentRowProps) {
  const avatarSize = small ? 22 : 26;
  const cLikes = c.likes ?? [];
  const iLiked = !!currentUser && cLikes.includes(currentUser);
  return (
    <div className="flex items-start gap-2 pt-1.5">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          window.dispatchEvent(new CustomEvent('papo-open-profile', { detail: { username: c.user } }));
        }}
        aria-label={`Ver perfil de ${c.user}`}
      >
        <Avatar username={c.user} fotoPerfil={c.fotoPerfil} size={avatarSize} />
      </button>
      <div className="flex-1 min-w-0">
        <p className={small ? 'text-[11px]' : 'text-xs'}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              window.dispatchEvent(new CustomEvent('papo-open-profile', { detail: { username: c.user } }));
            }}
            className="font-semibold hover:underline"
            style={{ color: '#262626' }}
          >{c.user}</button>{' '}
          {c.replyTo && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                window.dispatchEvent(new CustomEvent('papo-open-profile', { detail: { username: c.replyTo } }));
              }}
              className="font-semibold hover:underline"
              style={{ color: '#1e714a' }}
            >{c.replyTo}</button>
          )}{c.replyTo ? ' ' : ''}
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
          {cLikes.length > 0 && (
            <span className="text-[10px]" style={{ color: '#8e8e8e' }}>
              {cLikes.length} {cLikes.length === 1 ? 'curtida' : 'curtidas'}
            </span>
          )}
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
      {/* Botao de curtir comentario — coracao a direita, estilo Instagram */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleLike(); }}
        className="flex-shrink-0 p-1 active:scale-90 transition-transform"
        aria-label={iLiked ? 'Descurtir comentario' : 'Curtir comentario'}
      >
        <Heart
          className="w-3 h-3"
          style={{
            color: iLiked ? '#ef4444' : '#a8a8a8',
            fill: iLiked ? '#ef4444' : 'transparent',
          }}
          strokeWidth={2.2}
        />
      </button>
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
