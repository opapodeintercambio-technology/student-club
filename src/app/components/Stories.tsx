import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X, Camera, Video as VideoIcon, Volume2, VolumeX, Heart, MessageCircle, Image as ImageIcon } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import { notifyUser } from '../utils/notify';
import { AutoText } from './AutoText';
import { uploadVideoToStream } from '../utils/streamUpload';
import { HlsVideo } from './HlsVideo';
import { VideoEditor } from './VideoEditor';
import { MentionPicker } from './MentionPicker';
import { StoryCamera } from './StoryCamera';
import { StoryEditor, LayerVisual } from './StoryEditor';
import { TrackPlayer } from './spotify/TrackPlayer';
import { extractMentions, extractHashtags, type StoryLayer } from './storyLayers';

// ───── Tipos ─────
export interface Story {
  id: string;
  username: string;
  /** ID estavel do user que postou — usado pra resolver foto mesmo
   *  apos rename(s) de username. Opcional pra compatibilidade com
   *  stories antigos pre-migration. */
  userId?: string;
  kind: 'image' | 'video';
  blobKey: string;       // chave no IndexedDB
  duration: number;      // segundos (vídeo) ou 5 (imagem)
  text?: string;         // legenda opcional (até 240 chars) — LEGADO; o
                         // editor novo usa "layers" em vez de text plano
  mentions?: string[];   // usernames mencionados (@) — recebem notif mention_story
  hashtags?: string[];   // hashtags (#) — extraidas das camadas no publish
  layers?: import('./storyLayers').StoryLayer[]; // sobreposicoes interativas
  views?: string[];      // usernames que visualizaram (estilo Instagram)
  createdAt: string;     // ISO
  /** Música opcional do Spotify (apenas metadados; nunca cacheamos áudio). */
  spotify_track?: import('../lib/spotify').SpotifyTrack | null;
}

// ───── Storage ─────
// Cada story é gravado como UM registro próprio (key = story.id) — gravações são
// atômicas e independentes, então postar um novo NUNCA apaga os anteriores.
// Mantém compatibilidade com o formato antigo (array sob META_KEY) via migração.
const DB_NAME = 'papo-stories';
const STORE_META = 'meta';
const STORE_BLOB = 'blobs';
const META_KEY = 'all';                  // legado — só para migração
const STORY_TTL_HOURS = 24;

// PREFERENCIA DE AUDIO da sessao — persiste entre stories no mesmo
// viewer e entre aberturas/fechamentos do viewer na mesma sessao.
// Default true: usuario quer ouvir o video. Se o iOS bloquear ou se
// o usuario tocar no icone pra mutar, atualiza pra false. Proxima
// story respeita esta preferencia.
let userWantsAudio = true;

// ───── Demos: avatares hardcoded + regra de auto-purge ─────
// Os users demo_* nao existem em `usuarios` (FK aponta pra auth.users). Sem
// foto_perfil no DB, mostraria iniciais. Mapeamos avatares AI direto no
// client. Quando houver REAL_STORIES_THRESHOLD stories de users REAIS ativos
// (< 24h), os demos sao OCULTADOS automaticamente e o TTL volta a ser
// aplicado normalmente — feed fica so com stories reais.
const REAL_STORIES_THRESHOLD = 30;
const DEMO_AVATARS: Record<string, string> = {
  demo_ana_lisboa:      'https://i.pravatar.cc/300?img=47',
  demo_bruno_dublin:    'https://i.pravatar.cc/300?img=12',
  demo_camila_paris:    'https://i.pravatar.cc/300?img=44',
  demo_diego_london:    'https://i.pravatar.cc/300?img=15',
  demo_eduarda_ny:      'https://i.pravatar.cc/300?img=49',
  demo_felipe_toronto:  'https://i.pravatar.cc/300?img=33',
  demo_gabriela_berlim: 'https://i.pravatar.cc/300?img=45',
  demo_helena_sydney:   'https://i.pravatar.cc/300?img=48',
  demo_ivan_tokio:      'https://i.pravatar.cc/300?img=51',
  demo_julia_madrid:    'https://i.pravatar.cc/300?img=32',
  demo_kaio_barcelona:  'https://i.pravatar.cc/300?img=58',
  demo_laura_amsterda:  'https://i.pravatar.cc/300?img=43',
  demo_marcelo_dubai:   'https://i.pravatar.cc/300?img=68',
};
const isDemoUser = (u: string) => u.startsWith('demo_');

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META);
      if (!db.objectStoreNames.contains(STORE_BLOB)) db.createObjectStore(STORE_BLOB);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function isStory(x: any): x is Story {
  return x && typeof x === 'object' && typeof x.id === 'string' && typeof x.username === 'string'
    && typeof x.blobKey === 'string' && typeof x.createdAt === 'string';
}

async function loadAll(): Promise<Story[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readwrite');
    const store = tx.objectStore(STORE_META);
    const req = store.getAll();
    let result: Story[] = [];
    req.onsuccess = () => {
      const items = req.result as unknown[];
      const map = new Map<string, Story>();
      let legacyArray: Story[] | null = null;
      for (const item of items) {
        if (Array.isArray(item)) {
          legacyArray = item.filter(isStory) as Story[];
        } else if (isStory(item)) {
          map.set(item.id, item);
        }
      }
      // Migração: explode array legado em registros individuais e remove META_KEY
      if (legacyArray && legacyArray.length > 0) {
        for (const s of legacyArray) {
          if (!map.has(s.id)) {
            store.put(s, s.id);
            map.set(s.id, s);
          }
        }
        store.delete(META_KEY);
      } else if (legacyArray) {
        store.delete(META_KEY);
      }
      result = Array.from(map.values())
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    };
    req.onerror = () => { db.close(); reject(req.error); };
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function saveOne(story: Story): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readwrite');
    tx.objectStore(STORE_META).put(story, story.id);
    tx.oncomplete = () => {
      db.close();
      resolve();
      window.dispatchEvent(new CustomEvent('papo-stories-updated'));
    };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function deleteOne(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readwrite');
    tx.objectStore(STORE_META).delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
      window.dispatchEvent(new CustomEvent('papo-stories-updated'));
    };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function putBlob(key: string, blob: Blob): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BLOB, 'readwrite');
    tx.objectStore(STORE_BLOB).put(blob, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function getBlob(key: string): Promise<Blob | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BLOB, 'readonly');
    const r = tx.objectStore(STORE_BLOB).get(key);
    r.onsuccess = () => { db.close(); resolve((r.result as Blob) ?? null); };
    r.onerror = () => { db.close(); reject(r.error); };
  });
}

async function delBlob(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BLOB, 'readwrite');
    tx.objectStore(STORE_BLOB).delete(key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

// ───── Sync remoto com Supabase (stories_demo) ─────
// Stories postados localmente são duplicados na tabela stories_demo com URL pública
// gerada via upload no bucket 'fotos'. Stories remotos ficam visíveis pra qualquer
// visitante do site, sem depender do IndexedDB do navegador deles.
interface RemoteStory {
  id: string;
  username: string;
  userId?: string;       // ID estavel (sobrevive a renames)
  kind: 'image' | 'video';
  url: string;
  text?: string;
  mentions?: string[];
  hashtags?: string[];
  layers?: import('./storyLayers').StoryLayer[];
  views?: string[];      // usernames que visualizaram
  duration: number;
  createdAt: string;
}

// Deriva uma URL de imagem (JPG/PNG) que serve como preview do story.
// Usado nas notificacoes pra mostrar EXATAMENTE o que foi curtido/comentado.
//   - Imagem: a propria URL do story (ja eh JPG/PNG)
//   - Video Cloudflare Stream: extrai uid e monta a URL do thumbnail JPG
//   - Outros: retorna null pra caller usar fallback (avatar)
function storyPreviewUrl(story: Story, currentUrl: string | null): string | null {
  if (story.kind === 'image') {
    return currentUrl || null;
  }
  // Video: tenta extrair uid de uma URL Cloudflare (videodelivery.net ou
  // customer-XXX.cloudflarestream.com)
  const sourceUrl = currentUrl || (story.blobKey.startsWith('__remote__:') ? story.blobKey.slice('__remote__:'.length) : '');
  const m = sourceUrl.match(/(?:videodelivery\.net|cloudflarestream\.com)\/([a-f0-9]{16,})/i);
  if (m) {
    return `https://videodelivery.net/${m[1]}/thumbnails/thumbnail.jpg?time=1s&height=200`;
  }
  return null;
}

// Helper exportado: retorna lista de usernames distintos que tem stories
// (remotos). Usado pra desenhar o "ring da Irlanda" em avatares ao redor
// do app quando o currentUser tem stories nao vistos daquele user.
export async function fetchUsernamesWithStories(): Promise<Map<string, string[]>> {
  try {
    const { data } = await supabase
      .from('stories_demo')
      .select('id, username')
      .order('created_at', { ascending: false })
      .limit(500);
    const map = new Map<string, string[]>();
    for (const r of ((data as any[]) || [])) {
      const arr = map.get(r.username) || [];
      arr.push(r.id);
      map.set(r.username, arr);
    }
    return map;
  } catch { return new Map(); }
}

// Re-exporta o loader de seen p/ outros componentes saberem o que ja foi visto
export function getSeenStories(currentUser: string): Set<string> {
  return loadSeen(currentUser);
}

async function fetchRemoteStories(): Promise<RemoteStory[]> {
  try {
    // TEMPORARIO: TTL desabilitado a pedido do usuario — todos os stories
    // ficam permanentes (nao expiram em 24h). Quando ele pedir pra voltar
    // o TTL normal, restaurar o filtro:
    //   const cutoff = new Date(Date.now() - STORY_TTL_HOURS * 3600_000).toISOString();
    //   .or(`created_at.gte.${cutoff},username.like.demo_%`)
    // Tenta primeiro com colunas novas (layers, hashtags). Se nao existirem
    // ainda no DB (migracao pendente), faz fallback pro select legado.
    let data: any[] | null = null;
    let error: any = null;
    const rich = await supabase
      .from('stories_demo')
      .select('id,user_id,username,kind,url,text,mentions,hashtags,layers,views,duration,created_at,spotify_track')
      .order('created_at', { ascending: false })
      .limit(200);
    if (rich.error && /column .* does not exist/i.test(rich.error.message || '')) {
      const legacy = await supabase
        .from('stories_demo')
        .select('id,username,kind,url,text,mentions,duration,created_at')
        .order('created_at', { ascending: false })
        .limit(200);
      data = legacy.data as any[] | null;
      error = legacy.error;
    } else {
      data = rich.data as any[] | null;
      error = rich.error;
    }
    if (error || !data) return [];
    return data.map((r: any) => ({
      id: r.id,
      username: r.username,
      userId: r.user_id || undefined,
      kind: r.kind,
      url: r.url,
      text: r.text || undefined,
      mentions: Array.isArray(r.mentions) && r.mentions.length > 0 ? r.mentions : undefined,
      hashtags: Array.isArray(r.hashtags) && r.hashtags.length > 0 ? r.hashtags : undefined,
      layers: Array.isArray(r.layers) && r.layers.length > 0 ? r.layers : undefined,
      views: Array.isArray(r.views) ? r.views : [],
      duration: r.duration ?? 5,
      createdAt: r.created_at,
      spotify_track: r.spotify_track || null,
    }));
  } catch { return []; }
}

async function uploadStoryBlob(blob: Blob, fileName: string, kind: 'image' | 'video'): Promise<{ url: string | null; error?: string }> {
  try {
    const path = `stories/${fileName}`;
    // Para video sempre forcamos video/mp4 — iPhone .MOV (que vem como
    // video/quicktime) tem H.264 dentro e toca no Chrome/Android quando
    // servido como video/mp4. Sem isso, Android Chrome rejeita o player.
    let ct: string;
    if (kind === 'video') {
      ct = 'video/mp4';
    } else {
      ct = blob.type && blob.type !== 'application/octet-stream' ? blob.type : 'image/jpeg';
    }
    const { error } = await supabase.storage
      .from('fotos')
      .upload(path, blob, { upsert: false, contentType: ct, cacheControl: '3600' });
    if (error) {
      console.warn('[stories] upload falhou', error);
      return { url: null, error: error.message || 'upload falhou' };
    }
    const { data } = supabase.storage.from('fotos').getPublicUrl(path);
    return { url: data.publicUrl };
  } catch (e: any) {
    return { url: null, error: e?.message || 'erro inesperado no upload' };
  }
}

async function insertRemoteStory(story: Story, url: string): Promise<{ ok: boolean; error?: string }> {
  // Tenta inserir COM as colunas novas (layers/hashtags) primeiro. Se a
  // coluna nao existir no schema do Supabase (migracao pendente), o insert
  // falha — caimos pro insert SEM essas colunas (so o legado: text+mentions).
  // Isso garante que o feature funciona com texto plano mesmo sem migrar
  // o DB, e ganha interatividade total assim que a migracao rodar.
  const baseRow: any = {
    id: story.id,
    username: story.username,
    kind: story.kind,
    url,
    text: story.text || null,
    mentions: story.mentions && story.mentions.length > 0 ? story.mentions : null,
    duration: Math.round(story.duration || 0),
    created_at: story.createdAt,
  };
  // user_id eh estavel: se o user renomear depois, ainda achamos a foto
  // dele atraves do JOIN com usuarios.id. Coluna opcional pra back-compat.
  if (story.userId) baseRow.user_id = story.userId;
  const richRow: any = {
    ...baseRow,
    layers: story.layers && story.layers.length > 0 ? story.layers : null,
    hashtags: story.hashtags && story.hashtags.length > 0 ? story.hashtags : null,
    spotify_track: story.spotify_track || null,
  };
  try {
    const { error } = await supabase.from('stories_demo').insert(richRow);
    if (!error) return { ok: true };
    // Fallback: se foi "column does not exist", tenta sem layers/hashtags
    const msg = (error as any)?.message || '';
    if (/column .* does not exist/i.test(msg) || /unknown column/i.test(msg)) {
      console.warn('[stories] sem coluna layers/hashtags no DB — inserindo sem (legado)');
      const r2 = await supabase.from('stories_demo').insert(baseRow);
      if (!r2.error) return { ok: true };
      console.error('[stories] insertRemoteStory fallback falhou:', r2.error);
      return { ok: false, error: r2.error.message };
    }
    console.error('[stories] insertRemoteStory failed:', error);
    return { ok: false, error: msg };
  } catch (e: any) {
    console.error('[stories] insertRemoteStory exception:', e);
    return { ok: false, error: e?.message || 'unknown' };
  }
}

async function deleteRemoteStory(id: string): Promise<{ ok: boolean; error?: string }> {
  // FIX BUG: antes engolia erro com `catch {}`. Se RLS rejeitar, conta
  // deletada ou rede caiu, o story aparecia como apagado no client mas
  // continuava visivel pros outros users. Agora retorna ok/erro pra
  // o caller poder reagir (mostrar alert ou re-tentar).
  try {
    const { error } = await supabase.from('stories_demo').delete().eq('id', id);
    if (error) {
      console.warn('[stories] deleteRemoteStory falhou:', error.message, 'id=', id);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e: any) {
    console.warn('[stories] deleteRemoteStory exception:', e?.message || e);
    return { ok: false, error: e?.message || 'unknown' };
  }
}

// ───── Reações de Story (likes + comments) ─────
// Persistido em localStorage; uma chave por story id. Sobrevive ao TTL do próprio
// story (que é apagado em 24h) sem confundir nada, porque o id é único.
interface StoryComment { id: string; user: string; text: string; createdAt: string }
interface StoryReactions { likes: string[]; comments: StoryComment[] }

const REACT_KEY = (storyId: string) => `papo_story_react_${storyId}`;

function loadReactions(storyId: string): StoryReactions {
  try {
    const raw = localStorage.getItem(REACT_KEY(storyId));
    if (!raw) return { likes: [], comments: [] };
    const obj = JSON.parse(raw);
    return {
      likes: Array.isArray(obj.likes) ? obj.likes : [],
      comments: Array.isArray(obj.comments) ? obj.comments : [],
    };
  } catch { return { likes: [], comments: [] }; }
}

function saveReactions(storyId: string, r: StoryReactions) {
  // FIX BUG: iOS modo privado lanca QuotaExceeded — antes throw interrompia
  // o flow de curtir/comentar story.
  try { localStorage.setItem(REACT_KEY(storyId), JSON.stringify(r)); } catch (e) {
    console.warn('[stories] saveReactions falhou:', e);
  }
  try { window.dispatchEvent(new CustomEvent('papo-story-react-updated', { detail: storyId })); } catch {}
}

// Mede a duração de um vídeo via tag <video>
function probeVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(v.duration); };
    v.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler o vídeo')); };
    v.src = url;
  });
}


// ───── Componente Strip ─────
interface StoriesProps {
  currentUser?: string;
  compact?: boolean;
  dark?: boolean;
  fotoPerfil?: string;
  /** Quando true, remove o padding horizontal interno (px-3 sm:px-4) do
   *  wrap. Usado quando o pai ja eh full-width e quer os avatares
   *  encostando nas bordas. */
  noPadding?: boolean;
}

// Stories já vistos pelo currentUser (Instagram-style).
// Persistido em localStorage; ao abrir um story marcamos como visto e o ring
// roxo deixa de aparecer.
const SEEN_KEY = (u: string) => `papo_seen_stories_${u}`;
function loadSeen(user: string): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY(user));
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch { return new Set(); }
}
function saveSeen(user: string, set: Set<string>) {
  try { localStorage.setItem(SEEN_KEY(user), JSON.stringify([...set])); } catch {}
}

export function Stories({ currentUser, compact, dark, fotoPerfil, noPadding }: StoriesProps) {
  const [stories, setStories] = useState<Story[]>([]);
  // ID estavel do usuario logado — usado pra gravar user_id em cada story
  // novo. Sobrevive a renames. Carregado uma vez no mount via auth.getUser.
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!cancelled) setCurrentUserId(data?.user?.id || null);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [currentUser]);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  // Quando o viewer abre via clique no avatar do feed, restringimos a fila
  // a APENAS os stories desse user (escopo unico). null = comportamento
  // padrao (todos os users em sequencia). Reset no onClose.
  const [viewerStories, setViewerStories] = useState<Story[] | null>(null);
  const [posting, setPosting] = useState(false);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  // Foto de perfil de cada usuario com story ativo. Estilo Instagram: o
  // circulo do story NAO mostra a previa do conteudo postado, mostra a
  // foto de perfil do dono — o conteudo so aparece quando o viewer abre.
  // Cache username -> foto_perfil (null = sem foto, mostra iniciais).
  const [userAvatars, setUserAvatars] = useState<Record<string, string | null>>({});
  const [seen, setSeen] = useState<Set<string>>(() => currentUser ? loadSeen(currentUser) : new Set());

  // Recarrega seen quando usuario muda
  useEffect(() => {
    if (currentUser) setSeen(loadSeen(currentUser));
  }, [currentUser]);

  // Marca um story (e todos do mesmo usuario que vieram antes dele) como visto.
  // Chamado quando o viewer abre.
  function markSeen(storyIds: string[]) {
    if (!currentUser || storyIds.length === 0) return;
    setSeen(prev => {
      const next = new Set(prev);
      let changed = false;
      for (const id of storyIds) if (!next.has(id)) { next.add(id); changed = true; }
      if (changed) saveSeen(currentUser, next);
      return next;
    });
  }
  const [composer, setComposer] = useState<{ file: File; url: string; kind: 'image' | 'video'; duration: number; parts?: { blob: Blob; duration: number }[] } | null>(null);
  const [editingVideo, setEditingVideo] = useState<File | null>(null);
  const [splitting, setSplitting] = useState(false);
  // showUploadMenu: legado — mantido como fallback se algo der errado com a
  // camera live. O fluxo NOVO usa showCamera (StoryCamera fullscreen).
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  // Qual tab vem selecionada por default ao abrir a camera. user pode trocar
  // depois via as tabs POST/STORY no rodape. Default 'story' (quando o user
  // toca no proprio circulo). Eventos globais sobrescrevem com 'feed' ou
  // 'story' conforme a origem.
  const [cameraDefaultMode, setCameraDefaultMode] = useState<'feed' | 'story'>('story');
  // Quando lockedMode esta setado, as tabs POST/STORY somem na camera
  // (modo dedicado). Usado pelo "+" badge de stories — entrada SO pra
  // postar story, sem chance de virar post de feed. Eventos globais
  // (botao Post do feed, swipe da home) NAO travam o modo — la as tabs
  // aparecem e o user pode trocar livremente.
  const [cameraLockedMode, setCameraLockedMode] = useState<'feed' | 'story' | undefined>(undefined);
  const fileRef = useRef<HTMLInputElement>(null);
  // Wrapper pra detectar se ESTA instancia esta visivel no viewport.
  // App.tsx monta DOIS <Stories> simultaneamente (mobile vs desktop via
  // sm:hidden / hidden sm:block) — sem este guard, AMBAS abrem StoryCamera
  // e disparam getUserMedia em paralelo, conflito que travava o primeiro
  // snap (iOS so permite 1 stream ativa por vez).
  const storiesWrapperRef = useRef<HTMLDivElement>(null);
  const isActiveForViewport = useCallback((): boolean => {
    const el = storiesWrapperRef.current;
    if (!el) return false; // se ref nao montou, NAO processa
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }, []);

  // Listeners pra abrir a camera vindo do BotaoPost/swipe horizontal/etc.
  // Eventos sempre destravam o modo (lockedMode=undefined) pra mostrar as tabs.
  useEffect(() => {
    const open = (e: Event) => {
      if (!isActiveForViewport()) return; // outra instancia (visivel) processa
      const detail = (e as CustomEvent).detail || {};
      const m: 'feed' | 'story' = detail.mode === 'feed' ? 'feed' : 'story';
      setCameraDefaultMode(m);
      setCameraLockedMode(undefined); // tabs visiveis
      setShowCamera(true);
    };
    window.addEventListener('papo-open-story-camera', open);
    window.addEventListener('papo-open-post-camera', open);
    return () => {
      window.removeEventListener('papo-open-story-camera', open);
      window.removeEventListener('papo-open-post-camera', open);
    };
  }, [isActiveForViewport]);
  const thumbsRef = useRef<Record<string, string>>({}); // single source of truth pra revogar object URLs sem fechar sobre estado stale

  // Carrega + purga stories > 24h. Inclui SYNC com Supabase (stories_demo)
  // pra que todo visitante veja os mesmos stories.
  useEffect(() => {
    let cancelled = false;
    const remoteThumbs: Record<string, string> = {};

    const buildFromRemote = (remote: RemoteStory[]): Story[] =>
      remote.map(r => {
        // O blobKey precisa coincidir com algo que getBlob(...) saiba resolver.
        // Truque: gravamos o thumb direto via objectURL fingido — a chave é a URL.
        // Para videos no Cloudflare Stream, derivamos a URL do thumbnail (a
        // URL de playback eh .m3u8 e nao serve como <img src>).
        const m = r.url.match(/videodelivery\.net\/([^/]+)/);
        const thumbForBubble = m
          ? `https://videodelivery.net/${m[1]}/thumbnails/thumbnail.gif?time=0s&duration=3s&height=160&fps=8`
          : r.url;
        remoteThumbs[r.id] = thumbForBubble;
        return {
          id: r.id,
          username: r.username,
          userId: r.userId,
          kind: r.kind,
          blobKey: '__remote__:' + r.url, // marca que o conteúdo é remoto
          duration: r.duration,
          text: r.text,
          mentions: r.mentions,
          hashtags: r.hashtags,
          layers: r.layers,
          views: r.views || [],
          createdAt: r.createdAt,
        };
      });

    const syncAndPurge = async () => {
      // 1) carrega do IndexedDB local (stories postados nesse navegador)
      const local = await loadAll().catch(() => [] as Story[]);
      const now = Date.now();
      const fresh: Story[] = [];
      const expired: Story[] = [];
      for (const s of local) {
        if (now - new Date(s.createdAt).getTime() < STORY_TTL_HOURS * 3600_000) fresh.push(s);
        else expired.push(s);
      }
      for (const e of expired) {
        try { await delBlob(e.blobKey); } catch {}
        try { await deleteOne(e.id); } catch {}
      }
      // 2) busca stories remotos (visíveis pra todo mundo)
      const remote = await fetchRemoteStories();
      const remoteStories = buildFromRemote(remote);

      // 3) AUTO-PURGE DOS DEMOS: assim que houver REAL_STORIES_THRESHOLD
      // stories REAIS ainda ATIVOS (< 24h), os demos somem do feed e o TTL
      // de 24h volta a valer pra TODOS (inclusive futuras postagens).
      const ttlCutoff = now - STORY_TTL_HOURS * 3600_000;
      const realStoriesActive = remoteStories.filter(s =>
        !isDemoUser(s.username) && new Date(s.createdAt).getTime() >= ttlCutoff
      );
      const purgeDemos = realStoriesActive.length >= REAL_STORIES_THRESHOLD;
      const ttlEnabled = purgeDemos; // TTL 24h volta a ser aplicado nos remotos

      const filteredRemote = remoteStories.filter(r => {
        if (purgeDemos && isDemoUser(r.username)) return false;
        if (ttlEnabled && new Date(r.createdAt).getTime() < ttlCutoff) return false;
        return true;
      });

      // 4) une — local tem prioridade quando o id já existe
      const localIds = new Set(fresh.map(s => s.id));
      const merged: Story[] = [
        ...fresh,
        ...filteredRemote.filter(r => !localIds.has(r.id)),
      ];
      // 4) coloca as URLs remotas no ref de thumbnails (sem object URL)
      for (const id of Object.keys(remoteThumbs)) {
        if (!thumbsRef.current[id]) thumbsRef.current[id] = remoteThumbs[id];
      }
      if (!cancelled) {
        setStories(merged);
        setThumbs({ ...thumbsRef.current });
      }
    };
    syncAndPurge();
    // REALTIME: novo story ou deletado → re-sync imediato (em vez de
    // esperar o polling de 60s). Garante entrega ~ms pra todos os users.
    const ch = supabase
      .channel(`stories_demo:changes:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stories_demo' }, () => { syncAndPurge(); })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'stories_demo' }, () => { syncAndPurge(); })
      .subscribe();
    // Polling de stories: roda 60s mas pausa em background pra economizar
    // bateria + queries Supabase em tab inativa. Realtime + evento local
    // ja cobrem os cenarios de update.
    const interval = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      syncAndPurge();
    }, 60 * 1000);
    window.addEventListener('papo-stories-updated', syncAndPurge);
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
      window.clearInterval(interval);
      window.removeEventListener('papo-stories-updated', syncAndPurge);
    };
  }, []);

  // Gera thumbnails (object URLs) para cada story — usa ref pra evitar closure stale
  useEffect(() => {
    let cancelled = false;
    const idSet = new Set(stories.map(s => s.id));

    // 1) Revoga URLs de stories que sairam (ex: expiraram após 24h ou foram apagados)
    for (const [id, url] of Object.entries(thumbsRef.current)) {
      if (!idSet.has(id)) {
        URL.revokeObjectURL(url);
        delete thumbsRef.current[id];
      }
    }

    (async () => {
      let changed = false;
      for (const s of stories) {
        if (thumbsRef.current[s.id]) continue; // já carregado, mantém URL existente
        // Stories remotos: blobKey começa com __remote__:URL — usa URL direto.
        // Para Cloudflare Stream (videodelivery.net), deriva a URL do thumbnail.
        if (s.blobKey.startsWith('__remote__:')) {
          const url = s.blobKey.slice('__remote__:'.length);
          const m = url.match(/videodelivery\.net\/([^/]+)/);
          thumbsRef.current[s.id] = m
            ? `https://videodelivery.net/${m[1]}/thumbnails/thumbnail.gif?time=0s&duration=3s&height=160&fps=8`
            : url;
          changed = true;
          continue;
        }
        const blob = await getBlob(s.blobKey).catch(() => null);
        if (cancelled) return;
        if (!blob) continue;
        const url = URL.createObjectURL(blob);
        thumbsRef.current[s.id] = url;
        changed = true;
      }
      if (!cancelled && changed) setThumbs({ ...thumbsRef.current });
      else if (!cancelled) setThumbs({ ...thumbsRef.current }); // garante sync após purge
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stories.map(s => s.id).join(',')]);

  // Cleanup global ao desmontar — revoga tudo
  useEffect(() => () => {
    for (const url of Object.values(thumbsRef.current)) {
      try { URL.revokeObjectURL(url); } catch {}
    }
    thumbsRef.current = {};
  }, []);

  // Busca foto de perfil dos usuarios que tem story ativo. Estrategia em
  // 3 camadas pra cobrir rename de username sempre:
  //   1) JOIN via user_id do story (estavel, NUNCA falha apos rename)
  //   2) Lookup direto por username em usuarios
  //   3) Lookup via username_history (.or old=X, new=X) pra orfaos
  // Roda quando a lista de usernames com story muda.
  useEffect(() => {
    const usernames = Array.from(new Set(stories.map(s => s.username))).filter(Boolean);
    const missing = usernames.filter(u => !(u in userAvatars));
    if (missing.length === 0) return;
    // Mapa username → user_id (do proprio array stories)
    const usernameToUserId: Record<string, string> = {};
    for (const s of stories) {
      if (s.userId && s.username && missing.includes(s.username)) {
        usernameToUserId[s.username] = s.userId;
      }
    }
    let cancelled = false;
    (async () => {
      try {
        // Lookup 0 (PRIMARIO): via user_id quando o story tem (preferencial).
        const userIdsToLookup = Array.from(new Set(Object.values(usernameToUserId)));
        const fotoByUserId = new Map<string, string | null>();
        if (userIdsToLookup.length > 0) {
          const { data: byIdRows } = await supabase
            .from('usuarios')
            .select('id,foto_perfil')
            .in('id', userIdsToLookup);
          (byIdRows as any[] || []).forEach(r => fotoByUserId.set(r.id, r.foto_perfil || null));
        }

        // Lookup 1: pelos nomes diretamente (cobre stories sem user_id)
        const { data: directRows } = await supabase
          .from('usuarios')
          .select('username,foto_perfil')
          .in('username', missing);
        if (cancelled) return;
        const found = new Set<string>((directRows as any[] || []).map(r => r.username));
        // Considera "achado" tambem o que ja veio via user_id
        for (const u of missing) {
          const uid = usernameToUserId[u];
          if (uid && fotoByUserId.has(uid)) found.add(u);
        }
        const stillMissing = missing.filter(u => !found.has(u));

        // Lookup 2: pra usernames orfaos, usa username_history como ponte.
        // O nome pode aparecer como old_username (rename normal) OU como
        // new_username (caso onde user reverteu pro nome antigo, ou cliente
        // renomeou de novo com currentUser stale). Usamos user_id direto
        // pra achar o user atual.
        const historyMap: Record<string, string | null> = {};
        if (stillMissing.length > 0) {
          // FIX BUG: .or() concatenado quebra com username com . ou , — uso
          // 2 .in() paralelas e merge no client (mais robusto).
          const [byOldHS, byNewHS] = await Promise.all([
            supabase.from('username_history').select('user_id, old_username, new_username').in('old_username', stillMissing),
            supabase.from('username_history').select('user_id, old_username, new_username').in('new_username', stillMissing),
          ]);
          const hist = [...((byOldHS.data as any[]) || []), ...((byNewHS.data as any[]) || [])];
          if (hist.length > 0) {
            // Mapeia orfao → user_id (qualquer entry que cite o nome)
            const orphanToUserId: Record<string, string> = {};
            (hist as any[]).forEach(r => {
              for (const orphan of stillMissing) {
                if ((r.old_username === orphan || r.new_username === orphan) && r.user_id) {
                  orphanToUserId[orphan] = r.user_id;
                }
              }
            });
            const userIds = Array.from(new Set(Object.values(orphanToUserId)));
            if (userIds.length > 0) {
              const { data: rows } = await supabase
                .from('usuarios')
                .select('id,foto_perfil')
                .in('id', userIds);
              const fotoById = new Map<string, string | null>();
              (rows as any[] || []).forEach(r => fotoById.set(r.id, r.foto_perfil || null));
              for (const [orphan, uid] of Object.entries(orphanToUserId)) {
                historyMap[orphan] = fotoById.get(uid) ?? null;
              }
            }
          }
        }

        if (cancelled) return;
        setUserAvatars(prev => {
          const next = { ...prev };
          for (const u of missing) next[u] = null;
          // Aplica em ordem de prioridade: user_id > username > history
          for (const row of (directRows as any[]) || []) {
            next[row.username] = row.foto_perfil || null;
          }
          for (const [orphan, foto] of Object.entries(historyMap)) {
            next[orphan] = foto;
          }
          // user_id sobrescreve tudo (fonte mais confiavel)
          for (const [u, uid] of Object.entries(usernameToUserId)) {
            if (fotoByUserId.has(uid)) next[u] = fotoByUserId.get(uid) ?? null;
          }
          // FALLBACK FINAL: users demo_* tem avatar AI hardcoded — usa sempre
          // que ainda nao temos foto valida (DB tem FK rigida pra auth.users).
          for (const u of missing) {
            if (!next[u] && DEMO_AVATARS[u]) next[u] = DEMO_AVATARS[u];
          }
          return next;
        });
      } catch { /* sem rede — segue sem avatar, mostra iniciais */ }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stories.map(s => s.username).join(',')]);

  // TEMPO REAL: foto/nome de outro user mudou → atualiza userAvatars +
  // migra stories.username quando ha rename, sem refetch.
  useEffect(() => {
    const onUserUpdated = (e: Event) => {
      const d = (e as CustomEvent<{ username: string; old_username: string | null; foto_perfil: string | null }>).detail;
      if (!d?.username) return;
      setUserAvatars(prev => {
        const next = { ...prev };
        next[d.username] = d.foto_perfil ?? null;
        if (d.old_username) {
          delete next[d.old_username];
        }
        return next;
      });
      // Em rename: migra os stories que estavam com nome antigo
      if (d.old_username) {
        const oldU = d.old_username;
        setStories(prev => prev.map(s =>
          s.username === oldU ? { ...s, username: d.username } : s
        ));
      }
    };
    window.addEventListener('papo-user-updated', onUserUpdated);
    return () => window.removeEventListener('papo-user-updated', onUserUpdated);
  }, []);

  async function handleFile(file: File) {
    if (!currentUser) { alert('Faça login para postar um story.'); return; }
    const isImg = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImg && !isVideo) { alert('Envie uma imagem ou vídeo.'); return; }
    if (file.size > 200 * 1024 * 1024) { alert('Arquivo muito grande (máx 200MB).'); return; }

    if (isVideo) {
      // Abre o editor (trim + filtros). User pode cortar pra caber em 60s
      // e aplicar filtro. Depois do confirm volta aqui via onEditedVideo.
      setEditingVideo(file);
      return;
    }

    // Imagem → composer direto
    const url = URL.createObjectURL(file);
    setComposer({ file, url, kind: 'image', duration: 5, parts: undefined });
  }

  async function onEditedVideo(edited: File) {
    setEditingVideo(null);
    const d = await probeVideoDuration(edited).catch(() => 0);
    if (d > 60.5) {
      alert(`Vídeo de ${d.toFixed(1)}s — limite máximo de 60 segundos por story. Corte ainda mais e tente de novo.`);
      return;
    }
    const url = URL.createObjectURL(edited);
    setComposer({ file: edited, url, kind: 'video', duration: d || 5, parts: undefined });
  }

  async function publishComposer(
    text: string,
    mentions: string[] = [],
    layers?: import('./storyLayers').StoryLayer[],
    spotifyTrack?: import('../lib/spotify').SpotifyTrack | null,
  ) {
    if (!composer || !currentUser) return;
    setPosting(true);
    // Refresh do JWT antes do upload — em contas recem criadas o token pode
    // estar no estado pre-confirmacao e o Supabase Storage rejeita o upload
    // silenciosamente. refreshSession() forca um JWT valido. Sem isso, o
    // upload da foto falha pra usuarios novos (bug reportado).
    try { await supabase.auth.refreshSession(); } catch { /* sem rede */ }
    try {
      const baseName = composer.file.name.replace(/\.[^/.]+$/, '');
      const captionTrim = text.trim();
      const newStories: Story[] = [];

      // Se o vídeo foi dividido em partes, posta cada parte como um story separado.
      const segments = composer.parts && composer.parts.length > 0
        ? composer.parts
        : [{ blob: composer.file, duration: composer.duration }];

      // Timestamp + sufixo aleatório garantem unicidade ABSOLUTA do id, mesmo
      // postando o mesmo arquivo várias vezes ou em milissegundos consecutivos.
      const ts = Date.now();
      const rand = Math.random().toString(36).slice(2, 8);

      // Falhas de upload são acumuladas pra mostrar UM alerta no fim.
      const uploadErrors: string[] = [];

      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const ext = composer.kind === 'image' ? 'jpg' : 'mp4';
        const blobKey = `${currentUser}__${ts}_${i}_${rand}__${baseName}.${ext}`;
        await putBlob(blobKey, seg.blob);
        const labelN = segments.length > 1 ? ` (${i + 1}/${segments.length})` : '';

        let publicUrl: string | null = null;
        let uploadErr: string | undefined;

        if (composer.kind === 'video') {
          // VIDEO -> Cloudflare Stream (transcode auto pra HLS multi-bitrate
          // que toca em Safari/Chrome/iOS/Android sem dor de cabeça).
          try {
            const blob = seg.blob;
            const f = blob instanceof File ? blob : new File([blob], `story.${ext}`, { type: blob.type || 'video/mp4' });
            const result = await uploadVideoToStream(f);
            publicUrl = result.hlsUrl;
            console.log('[stories] video upload OK, hls url:', publicUrl);
          } catch (e: any) {
            uploadErr = e?.message || 'falha no Cloudflare Stream';
            console.error('[stories] video upload failed:', e);
          }
        } else {
          // IMAGEM -> Supabase Storage (continua como antes — funcionando ha tempos)
          const fileName = blobKey.replace(/[^a-zA-Z0-9._-]/g, '_');
          const result = await uploadStoryBlob(seg.blob, fileName, composer.kind);
          publicUrl = result.url;
          uploadErr = result.error;
        }

        // hashtags: extraidos das camadas (caso esse story tenha sido
        // criado pelo StoryEditor novo). No legado, fica vazio.
        const allHashtags = extractHashtags(layers);
        const story: Story = {
          id: blobKey,
          username: currentUser,
          userId: currentUserId || undefined,
          kind: composer.kind,
          // Para video em Stream, blobKey aponta direto pra URL HLS — sem copia local
          blobKey: publicUrl && composer.kind === 'video' ? '__remote__:' + publicUrl : blobKey,
          duration: seg.duration,
          text: captionTrim ? `${captionTrim}${labelN}` : (labelN ? labelN.trim() : undefined),
          mentions: mentions.length > 0 ? mentions : undefined,
          hashtags: allHashtags.length > 0 ? allHashtags : undefined,
          // Replica as MESMAS camadas em cada parte do video (todas tem o
          // mesmo conteudo visual sobreposto). Pra foto unica, eh so a
          // camada original mesmo.
          layers: layers && layers.length > 0 ? layers : undefined,
          createdAt: new Date(ts + i).toISOString(),
          spotify_track: spotifyTrack || null,
        };
        await saveOne(story);
        newStories.push(story);

        if (publicUrl) {
          const ins = await insertRemoteStory(story, publicUrl);
          if (!ins.ok) {
            uploadErrors.push(`Parte ${i + 1}: salvou no Cloudflare mas DB falhou — ${ins.error}`);
          }
          // Notifica usuarios mencionados (so na primeira parte se for video
          // dividido — evita duplicar notif pro mesmo usuario varias vezes).
          if (i === 0 && mentions.length > 0) {
            notifyUser(
              mentions,
              currentUser,
              'mention_story',
              '👋 Mencionado em um story',
              `${currentUser} te mencionou em um story`,
              { refId: story.id, imageUrl: publicUrl },
            ).catch(() => {});
          }
        } else {
          uploadErrors.push(`Parte ${i + 1}: ${uploadErr || 'falha desconhecida'}`);
        }
      }

      if (uploadErrors.length > 0) {
        // Log detalhado pra Sentry/console — facilita diagnosticar bugs
        // reportados de "story nao chegou pros outros".
        console.error('[Stories] uploadErrors', { user: currentUser, errors: uploadErrors });
        alert(
          'Seu story foi salvo no seu aparelho, mas NÃO foi publicado pros outros alunos.\n\n' +
          'Motivo: ' + uploadErrors.join(' / ') + '\n\n' +
          'O que fazer:\n' +
          '• Confira sua conexão e tente postar de novo\n' +
          '• Se o arquivo for muito grande, reduza o tamanho\n' +
          '• Se persistir, saia e entre de novo no app'
        );
      }

      // Atualiza o state local fundindo com o que já existia (functional update
      // evita closure stale entre posts em sequência).
      setStories(prev => {
        const newIds = new Set(newStories.map(s => s.id));
        return [...newStories.slice().reverse(), ...prev.filter(s => !newIds.has(s.id))];
      });
      URL.revokeObjectURL(composer.url);
      setComposer(null);
    } catch (e: any) {
      console.error('[Stories] publish failed', e);
      alert('Erro ao postar: ' + (e?.message || e));
    } finally {
      setPosting(false);
    }
  }

  function cancelComposer() {
    if (composer) URL.revokeObjectURL(composer.url);
    setComposer(null);
  }

  // Agrupar por username — separa o próprio user dos demais para garantir
  // que o bubble do usuário logado fique SEMPRE em primeiro (estilo Instagram).
  const byUser = new Map<string, { latest: Story; all: Story[] }>();
  for (const s of stories) {
    const bucket = byUser.get(s.username);
    if (bucket) {
      bucket.all.push(s);
      if (+new Date(s.createdAt) > +new Date(bucket.latest.createdAt)) bucket.latest = s;
    } else {
      byUser.set(s.username, { latest: s, all: [s] });
    }
  }
  const ownBucket = currentUser ? byUser.get(currentUser) : undefined;
  const others = Array.from(byUser.entries())
    .filter(([u]) => u !== currentUser)
    .map(([, v]) => v)
    .sort((a, b) => +new Date(b.latest.createdAt) - +new Date(a.latest.createdAt));

  // Ordena os stories DENTRO de cada user em ordem CRONOLÓGICA crescente
  // (mais antigo primeiro). É como o Instagram: ao abrir um bubble você vê
  // do primeiro story postado até o mais recente daquela pessoa, e só depois
  // pula pro próprio bubble do próximo usuário.
  function sortAscending(list: Story[]) {
    return list.slice().sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  }
  const orderedUserBuckets: Story[][] = [];
  if (ownBucket) orderedUserBuckets.push(sortAscending(ownBucket.all));
  for (const o of others) orderedUserBuckets.push(sortAscending(o.all));
  const flatViewerList: Story[] = orderedUserBuckets.flat();

  // Listener pra abrir o viewer no story especifico (vindo de notif)
  useEffect(() => {
    function onOpenStory(e: Event) {
      const detail = (e as CustomEvent).detail || {};
      const storyId = detail.storyId as string | undefined;
      if (!storyId) return;
      const idx = flatViewerList.findIndex(s => s.id === storyId);
      if (idx >= 0) setViewerIndex(idx);
    }
    window.addEventListener('papo-open-story', onOpenStory);

    // Listener pra abrir todos os stories de um usuario especifico
    // (clique no avatar com ring da Irlanda no feed). Escopo UNICO ao user
    // clicado: viewer mostra so os stories dele, e ao terminar/fechar volta
    // automaticamente pra posicao do post que estava sendo visualizado (o
    // viewer eh fixed/portal, scroll do feed nao se mexe enquanto aberto).
    function onOpenStoriesFor(e: Event) {
      const detail = (e as CustomEvent).detail || {};
      const user = detail.username as string | undefined;
      if (!user) return;
      const userStories = flatViewerList.filter(s => s.username === user);
      if (userStories.length === 0) return;
      // Ordena por createdAt asc (mesma ordem do flatViewerList por user)
      const ordered = userStories.slice().sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
      markSeen(ordered.map(s => s.id));
      setViewerStories(ordered);
      setViewerIndex(0);
    }
    window.addEventListener('papo-open-stories-for-user', onOpenStoriesFor);
    return () => {
      window.removeEventListener('papo-open-story', onOpenStory);
      window.removeEventListener('papo-open-stories-for-user', onOpenStoriesFor);
    };
  }, [flatViewerList]);

  const sz = compact ? 64 : 96;       // diâmetro do círculo — desktop 96px (Instagram-like, era 84)
  const badge = compact ? 18 : 28;    // botão +
  const labelSize = compact ? '10px' : '13px';
  const wrapPad = compact ? 'py-0' : 'pt-1 pb-3';
  const wrapPx = compact || noPadding ? '' : 'px-3 sm:px-4';
  const gap = compact ? 'gap-1.5' : 'gap-3';

  // cores adaptam ao tema
  const labelColor = dark ? 'rgba(255,255,255,0.78)' : '#57534e';
  const labelSecondaryColor = dark ? 'rgba(255,255,255,0.45)' : '#a8a29e';
  // Borda interna entre o anel colorido e a foto do story. Usa var(--sc-bg)
  // que vale #fff no light e #0c1014 no dark — sempre invisível contra o bg
  // da página, independente do tema. Antes era hardcoded #fafaf7 (branco)
  // quando prop dark não vinha, gerando linha branca visível no dark mode.
  const innerBorder = '3px solid var(--sc-bg)';
  void dark; // prop mantida na API por compat
  const placeholderHint = dark ? 'rgba(255,255,255,0.4)' : '#a8a29e';

  // Função que abre o seletor de arquivo no modo desejado
  function triggerPicker(mode: 'gallery' | 'camera-photo' | 'camera-video') {
    setShowUploadMenu(false);
    const inputId = mode === 'gallery' ? 'papo-story-input' :
                    mode === 'camera-photo' ? 'papo-story-cam-photo' :
                    'papo-story-cam-video';
    const el = document.getElementById(inputId) as HTMLInputElement | null;
    if (el) el.click();
  }

  // Avatar central do "Seu story": foto do perfil (preferida) ou iniciais
  function renderOwnAvatarInner() {
    if (fotoPerfil) {
      return (
        <img
          src={fotoPerfil}
          alt={currentUser}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
        />
      );
    }
    if (currentUser) return <span>{currentUser.slice(0, 2).toUpperCase()}</span>;
    return <Camera style={{ width: compact ? 14 : 20, height: compact ? 14 : 20 }} />;
  }

  function handleOwnClick() {
    if (posting || splitting) return;
    // Se o usuário JÁ tem story, abre o viewer começando no PRIMEIRO (mais antigo)
    // dos próprios stories — Instagram-style.
    if (ownBucket) {
      const oldest = sortAscending(ownBucket.all)[0];
      const idx = flatViewerList.findIndex(s => s.id === oldest.id);
      if (idx >= 0) {
        markSeen(ownBucket.all.map(s => s.id));
        setViewerIndex(idx);
        return;
      }
    }
    // Sem stories ainda: abre a camera live (estilo Instagram). Aqui o
    // user clicou NO PROPRIO CIRCULO de story → modo travado em 'story'
    // (sem tabs POST/STORY visiveis). Entrada dedicada pra postar story.
    setCameraDefaultMode('story');
    setCameraLockedMode('story');
    setShowCamera(true);
  }

  return (
    <div ref={storiesWrapperRef} className={`${wrapPx} ${wrapPad} flex-1 min-w-0`}>
      <div className={`flex items-center ${gap} overflow-x-auto papo-story-strip`} style={{ scrollbarWidth: 'none' }} data-no-swipe>
        <style>{`.papo-story-strip::-webkit-scrollbar{display:none}`}</style>

        {/* "Seu story" — sempre primeiro. Mostra a foto do perfil; se já houver
            stories postados, o clique abre o viewer; senão abre o menu de upload. */}
        <div
          className="relative flex flex-col items-center gap-0.5 flex-shrink-0 select-none"
          style={{ opacity: (posting || splitting) ? 0.5 : 1, pointerEvents: (posting || splitting) ? 'none' : 'auto' }}
        >
          <button
            type="button"
            onClick={handleOwnClick}
            className="relative"
            style={{ width: sz, height: sz }}
            aria-label={ownBucket ? 'Ver seu story' : 'Postar story'}
          >
            <div
              className="relative flex items-center justify-center text-white font-bold overflow-hidden"
              style={{
                width: sz, height: sz,
                borderRadius: '50%',
                aspectRatio: '1 / 1',
                background: 'linear-gradient(135deg, #1e714a 0%, #4ade80 100%)',
                padding: ownBucket ? 4 : 0,  /* anel mais grosso quando há story próprio */
                fontSize: compact ? 11 : 14,
              }}
            >
              <div
                className="relative flex items-center justify-center text-white font-bold overflow-hidden"
                style={{
                  width: '100%', height: '100%',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #1e714a 0%, #4ade80 100%)',
                  border: ownBucket ? innerBorder : '2px solid #ffffff',
                }}
              >
                {/* Estilo Instagram: SEMPRE mostra a foto de perfil do
                    dono no circulo do story — nunca a previa do conteudo
                    postado. A previa so aparece quando o viewer abre. O
                    anel verde (padding:4) ja indica que ha story ativo. */}
                {renderOwnAvatarInner()}
              </div>
            </div>
            {/* Badge "+" sempre visível (estilo Instagram) — abre a CAMERA AO VIVO */}
            <span
              onClick={e => { e.stopPropagation(); if (!posting && !splitting) { setCameraDefaultMode('story'); setCameraLockedMode('story'); setShowCamera(true); } }}
              className="absolute flex items-center justify-center text-white cursor-pointer"
              style={{
                bottom: -2, right: -2,
                width: badge, height: badge,
                borderRadius: '50%',
                background: '#5a7a52',
                border: '2px solid #fff',
              }}
              aria-label="Adicionar story"
            >
              <Plus style={{ width: compact ? 8 : 12, height: compact ? 8 : 12 }} />
            </span>
          </button>
          {!compact && (
            <span
              className="font-semibold max-w-[68px] truncate"
              style={{ fontFamily: '"DM Sans", system-ui, sans-serif', letterSpacing: '0.02em', fontSize: labelSize, color: labelColor }}
            >
              {posting ? 'Postando…' : splitting ? 'Dividindo…' : 'Seu story'}
            </span>
          )}
        </div>

        {/* Inputs invisíveis: galeria, câmera-foto (capture environment) e câmera-vídeo */}
        <input
          id="papo-story-input"
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none', clip: 'rect(0,0,0,0)' }}
          onChange={async e => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try { await handleFile(f); }
            catch (err: any) {
              console.error('[Stories] upload error', err);
              alert('Erro ao postar: ' + (err?.message || err));
              setSplitting(false);
              setPosting(false);
            }
          }}
        />
        <input
          id="papo-story-cam-photo"
          type="file"
          accept="image/*"
          capture="environment"
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none', clip: 'rect(0,0,0,0)' }}
          onChange={async e => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try { await handleFile(f); } catch (err: any) { alert('Erro ao postar: ' + (err?.message || err)); }
          }}
        />
        <input
          id="papo-story-cam-video"
          type="file"
          accept="video/*"
          capture="user"
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none', clip: 'rect(0,0,0,0)' }}
          onChange={async e => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try { await handleFile(f); } catch (err: any) { alert('Erro ao postar: ' + (err?.message || err)); }
          }}
        />

        {/* Stories dos OUTROS usuários (próprio já foi renderizado em primeiro). */}
        {others.map(({ latest, all }) => {
          // Inicia sempre no PRIMEIRO (mais antigo) story do user clicado.
          const oldestOfUser = sortAscending(all)[0];
          const idx = flatViewerList.findIndex(s => s.id === oldestOfUser.id);
          // Algum story desse usuário ainda não visto → ring roxo animado
          const hasUnseen = all.some(s => !seen.has(s.id));
          return (
            <button
              key={latest.username}
              onClick={() => { markSeen(all.map(s => s.id)); setViewerIndex(idx); }}
              className="flex flex-col items-center gap-0.5 flex-shrink-0"
              title={`${latest.username}`}
            >
              <div
                className="flex items-center justify-center"
                style={{
                  width: sz, height: sz,
                  borderRadius: '50%',
                  aspectRatio: '1 / 1',
                  // Anel "novo" = bandeira IE + animacao. Apos VISUALIZAR,
                  // perde por completo as cores e a animacao — vira so um
                  // halo cinza fino, deixando claro que o user ja viu.
                  padding: hasUnseen ? 4 : 2,
                  background: hasUnseen
                    ? 'linear-gradient(135deg, #169b62 0%, #ffffff 50%, #ff883e 100%)'
                    : (dark ? 'rgba(255,255,255,0.22)' : '#c7c7c7'),
                  animation: hasUnseen ? 'papo-story-ring 1.6s ease-in-out infinite' : undefined,
                  transition: 'padding 220ms ease, background 220ms ease',
                }}
              >
                <div
                  className="relative flex items-center justify-center text-white font-bold overflow-hidden"
                  style={{
                    width: '100%', height: '100%',
                    borderRadius: '50%',
                    aspectRatio: '1 / 1',
                    background: latest.kind === 'video'
                      ? 'linear-gradient(135deg, #0a1f4c 0%, #1e3a8a 100%)'
                      : 'linear-gradient(135deg, #5a7a52 0%, #6b8e3d 100%)',
                    border: innerBorder,
                    fontSize: compact ? 9 : 12,
                  }}
                >
                  {/* Estilo Instagram: foto de perfil do dono no circulo,
                      NUNCA a previa do story. Fallback pras iniciais se
                      o user nao tem foto. (O thumb do story nao eh mais
                      usado aqui — so existe pra abrir o viewer mesmo.) */}
                  {userAvatars[latest.username] ? (
                    <img src={userAvatars[latest.username] as string} alt={`${latest.username}`}
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                  ) : (
                    <span>{latest.username.slice(0, 2).toUpperCase()}</span>
                  )}
                </div>
              </div>
              {!compact && (
                <span
                  className="font-semibold max-w-[68px] truncate"
                  style={{ fontFamily: '"DM Sans", system-ui, sans-serif', letterSpacing: '0.02em', fontSize: labelSize, color: labelColor }}
                >
                  {latest.username}
                  {all.length > 1 && <span className="ml-0.5" style={{ color: labelSecondaryColor }}>·{all.length}</span>}
                </span>
              )}
            </button>
          );
        })}

        {others.length === 0 && !ownBucket && !compact && (
          <span className="text-xs ml-1" style={{ fontFamily: '"DM Sans", system-ui, sans-serif', color: placeholderHint }}>
            Seja o primeiro a postar um story (foto ou vídeo até 30s).
          </span>
        )}
      </div>

      {/* Mini-menu pra escolher origem do upload (câmera ou galeria) */}
      {showUploadMenu && createPortal(
        <div
          className="fixed inset-0 z-[100050] flex items-end sm:items-center justify-center p-3"
          style={{ background: 'rgba(0,0,0,0.65)' }}
          onClick={() => setShowUploadMenu(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl overflow-hidden"
            style={{ background: '#15151a', border: '1px solid rgba(255,255,255,0.08)' }}
            onClick={e => e.stopPropagation()}
          >
            <p className="px-4 pt-4 pb-2 text-xs uppercase tracking-widest font-semibold"
               style={{ color: 'rgba(255,255,255,0.5)', letterSpacing: '0.18em' }}>
              Novo story
            </p>
            <button
              onClick={() => triggerPicker('camera-photo')}
              className="w-full flex items-center gap-3 px-4 py-3 text-left text-white hover:bg-white/5"
            >
              <Camera className="w-5 h-5" /> <span className="text-sm font-semibold">Tirar foto</span>
            </button>
            <button
              onClick={() => triggerPicker('camera-video')}
              className="w-full flex items-center gap-3 px-4 py-3 text-left text-white hover:bg-white/5"
            >
              <VideoIcon className="w-5 h-5" /> <span className="text-sm font-semibold">Gravar vídeo</span>
            </button>
            <button
              onClick={() => triggerPicker('gallery')}
              className="w-full flex items-center gap-3 px-4 py-3 text-left text-white hover:bg-white/5"
              style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
            >
              <ImageIcon className="w-5 h-5" /> <span className="text-sm font-semibold">Galeria</span>
            </button>
            <button
              onClick={() => setShowUploadMenu(false)}
              className="w-full px-4 py-3 text-sm text-white/60"
              style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
            >
              Cancelar
            </button>
          </div>
        </div>,
        document.body,
      )}

      {splitting && createPortal(
        <div className="fixed inset-0 z-[100000] bg-black/85 flex flex-col items-center justify-center text-white p-4">
          <div className="w-12 h-12 mb-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />
          <p className="text-sm font-semibold" style={{ fontFamily: '"DM Sans", system-ui, sans-serif', letterSpacing: '0.06em' }}>
            Dividindo o vídeo em stories… (na primeira vez baixamos um codec — ~30 MB)
          </p>
          <p className="text-xs text-white/60 mt-1">Não feche o app.</p>
        </div>,
        document.body
      )}

      {/* Camera AO VIVO — abre por:
          - Tap no proprio circulo "Seu story" (defaultMode='story')
          - Botao Post da bottom nav (defaultMode='feed')
          - Swipe horizontal no feed (defaultMode='feed')
          As tabs POST | STORY no rodape deixam o user trocar a qualquer
          momento. Estilo Instagram. */}
      {showCamera && (
        <StoryCamera
          defaultMode={cameraDefaultMode}
          lockedMode={cameraLockedMode}
          onCancel={() => setShowCamera(false)}
          onCapture={(file, _kind, mode) => {
            // FIX: usar requestAnimationFrame em vez de setTimeout 0 garante
            // que o setShowCamera(false) JA TENHA RENDERIZADO antes do
            // dispatch. Sem isso, o user via a camera ficar aberta apos
            // tirar foto — o cropSrc era setado mas a camera (z-100200)
            // ficava por cima do CropImageModal (z-10000) ate o user
            // arrastar a camera pra fechar manualmente.
            setShowCamera(false);
            requestAnimationFrame(() => {
              if (mode === 'feed') {
                // Modo POST → manda o arquivo pro FeedNews abrir o composer
                // ja com a midia pre-carregada. Sem passar por StoryEditor.
                window.dispatchEvent(new CustomEvent('papo-composer-with-file', { detail: { file } }));
              } else {
                // Modo STORY → fluxo existente (video -> editor; imagem ->
                // composer direto).
                void handleFile(file);
              }
            });
          }}
        />
      )}

      {composer && (
        <StoryEditor
          src={composer.url}
          kind={composer.kind}
          currentUser={currentUser}
          posting={posting}
          partsCount={composer.parts?.length}
          onCancel={cancelComposer}
          onPost={(layers, spotifyTrack) => {
            // Adapta o publishComposer (text+mentions) pra usar layers.
            // text fica vazio (legenda inline mora dentro das camadas de
            // texto); mentions sao extraidas das camadas pra disparar notif.
            const allMentions = extractMentions(layers);
            void extractHashtags(layers); // ja gravado em insertRemoteStory
            publishComposer('', allMentions, layers, spotifyTrack || null);
          }}
        />
      )}

      {editingVideo && createPortal(
        <VideoEditor
          file={editingVideo}
          maxDuration={60}
          onCancel={() => setEditingVideo(null)}
          onConfirm={onEditedVideo}
        />,
        document.body
      )}

      {viewerIndex !== null && createPortal(
        <StoryViewer
          // Se viewerStories esta setado, viewer fica restrito aos stories
          // daquele user (aberto via click no avatar do feed). Caso contrario,
          // usa flatViewerList completo (entrada padrao pelos bubbles).
          stories={viewerStories ?? flatViewerList}
          startIndex={viewerIndex}
          currentUser={currentUser}
          myAvatar={fotoPerfil}
          onClose={() => { setViewerIndex(null); setViewerStories(null); }}
          onDelete={async (id) => {
            const target = stories.find(x => x.id === id);
            if (target && !target.blobKey.startsWith('__remote__:')) {
              try { await delBlob(target.blobKey); } catch {}
            }
            try { await deleteOne(id); } catch {}
            try { await deleteRemoteStory(id); } catch {}
            setStories(prev => prev.filter(x => x.id !== id));
            setViewerIndex(null);
            setViewerStories(null);
          }}
        />,
        document.body
      )}
    </div>
  );
}

// ───── Composer ─────
function StoryComposer({ src, kind, posting, partsCount, currentUser, onCancel, onPost }: {
  src: string;
  kind: 'image' | 'video';
  posting: boolean;
  partsCount?: number;
  currentUser: string;
  onCancel: () => void;
  onPost: (text: string, mentions: string[]) => void;
}) {
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState<string[]>([]);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  return (
    <div className="fixed inset-0 z-[100000] bg-black flex items-center justify-center p-0 sm:p-2" onClick={onCancel}>
      <div
        className="relative w-full max-w-md sm:rounded-2xl overflow-hidden flex flex-col"
        // 100dvh = altura visível dinâmica → encolhe quando o teclado mobile abre,
        // garantindo que TODA a UI (incluindo botões) fique sempre acessível.
        style={{ background: '#000', height: '100dvh', maxHeight: '100dvh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header — botões Cancelar (esq.) e Postar (dir.) SEMPRE visíveis no topo,
            independente do teclado virtual. paddingTop respeita o notch/Dynamic
            Island do iPhone quando rodando como PWA na tela inicial. */}
        <div
          className="flex items-center justify-between px-3 gap-2 flex-shrink-0 z-20"
          style={{
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            background: '#000',
            paddingTop: 'calc(env(safe-area-inset-top) + 10px)',
            paddingBottom: 10,
          }}
        >
          <button
            onClick={onCancel}
            className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center flex-shrink-0"
            aria-label="Cancelar"
          >
            <X className="w-4 h-4 text-white" />
          </button>

          <div className="flex-1 min-w-0 flex flex-col items-center text-center">
            <span
              className="text-white text-sm font-semibold truncate"
              style={{ fontFamily: '"DM Sans", system-ui, sans-serif', letterSpacing: '0.06em' }}
            >
              Novo story
            </span>
            {partsCount && partsCount > 1 && (
              <span
                className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full mt-0.5"
                style={{ background: '#5a7a52', color: '#fff', letterSpacing: '0.14em' }}
              >
                Será dividido em {partsCount} partes
              </span>
            )}
          </div>

          <button
            onClick={() => onPost(text, mentions)}
            disabled={posting}
            className="px-4 py-2 rounded-full text-white font-bold text-xs disabled:opacity-50 flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, #1e714a 0%, #4ade80 100%)',
              fontFamily: '"DM Sans", system-ui, sans-serif',
              letterSpacing: '0.14em',
            }}
          >
            {posting ? 'Postando…' : 'Postar →'}
          </button>
        </div>

        {/* Botao Mencionar — abre picker de amigos conectados */}
        <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0" style={{ background: '#000', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            onClick={() => setShowMentionPicker(true)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5"
            style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.18)' }}
          >
            @ Mencionar{mentions.length > 0 ? ` · ${mentions.length}` : ''}
          </button>
          {mentions.length > 0 && (
            <div className="flex-1 flex items-center gap-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              {mentions.map(u => (
                <span key={u} className="px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0"
                  style={{ background: 'rgba(30, 113, 74, 0.4)', color: '#fff' }}>
                  {u}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Preview — flex-1 com min-h-0 para encolher quando o teclado abre. */}
        <div className="flex-1 min-h-0 relative flex items-center justify-center overflow-hidden">
          {kind === 'video' ? (
            <video src={src} autoPlay loop playsInline controls={false} className="max-w-full max-h-full"
              ref={(el) => { if (el) { el.muted = false; el.volume = 1; el.play().catch(() => { el.muted = true; el.play().catch(() => {}); }); } }}
            />
          ) : (
            <img src={src} alt="" className="max-w-full max-h-full object-contain" />
          )}
          {/* Overlay do texto digitado em tempo real */}
          {text.trim() && (
            <div
              className="absolute left-3 right-3 bottom-3 px-3 py-2 rounded-xl text-center"
              style={{
                background: 'rgba(0,0,0,0.55)',
                backdropFilter: 'blur(4px)',
                color: '#fff',
                fontFamily: '"DM Sans", system-ui, sans-serif',
                fontSize: 15,
                fontWeight: 600,
                lineHeight: 1.3,
                letterSpacing: '0.02em',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {text}
            </div>
          )}
        </div>

        {/* Caption — somente o textarea fica embaixo; o botão de postar já está no topo.
            paddingBottom respeita o home indicator do iPhone em PWA. */}
        <div
          className="px-3 bg-black flex flex-col gap-1.5 flex-shrink-0"
          style={{
            borderTop: '1px solid rgba(255,255,255,0.08)',
            paddingTop: 12,
            paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)',
          }}
        >
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            maxLength={240}
            rows={2}
            placeholder="Escreva uma legenda (opcional)…"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
            style={{
              background: 'rgba(255,255,255,0.10)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.18)',
            }}
          />
          <span className="text-white/50 text-[10px] uppercase tracking-widest text-center">
            Expira em 24h · {text.length}/240
          </span>
        </div>
      </div>

      {showMentionPicker && (
        <MentionPicker
          currentUser={currentUser}
          initial={mentions}
          onCancel={() => setShowMentionPicker(false)}
          onConfirm={(users) => { setMentions(users); setShowMentionPicker(false); }}
        />
      )}
    </div>
  );
}

// ───── Viewer fullscreen ─────
interface ViewerProps {
  stories: Story[];
  startIndex: number;
  currentUser?: string;
  myAvatar?: string; // avatar do liker, usado como fallback nas notifs
  onClose: () => void;
  onDelete: (id: string) => void;
}

// Chave do localStorage que rastreia IDs de stories ja repostados pelo
// currentUser — usado pra esconder o botao "Repostar" daquele story.
const REPOSTED_STORY_KEY = 'studentclub_reposted_story_ids_v1';

function loadRepostedStoryIds(): Set<string> {
  try {
    const raw = localStorage.getItem(REPOSTED_STORY_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {}
  return new Set();
}

function saveRepostedStoryIds(s: Set<string>) {
  try { localStorage.setItem(REPOSTED_STORY_KEY, JSON.stringify(Array.from(s))); } catch {}
}

function StoryViewer({ stories, startIndex, currentUser, myAvatar, onClose, onDelete }: ViewerProps) {
  useLockBodyScroll(true);
  const [idx, setIdx] = useState(startIndex);
  const [url, setUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  // IDs dos stories ja repostados pelo currentUser nessa sessao/dispositivo
  // — esconde o botao "Repostar" pra evitar reposte duplicado.
  const [repostedStoryIds, setRepostedStoryIds] = useState<Set<string>>(() => loadRepostedStoryIds());
  // Avatar do dono do story atual — busca do supabase quando troca de user
  const [ownerAvatar, setOwnerAvatar] = useState<string | null>(null);
  // SEMPRE comeca com som (estilo Instagram). Se o navegador bloquear o
  // autoplay com som, cai pra mudo automaticamente — mas TODA vez que o
  // usuario muda de story, tentamos com som de novo. Sem persistencia.
  // Inicia respeitando a preferencia de audio da sessao. Default = usuario
  // quer audio (modulo-level var userWantsAudio = true). Se o usuario ja
  // mutou em algum video anterior dessa sessao, o proximo video tambem
  // arranca mudo.
  const [muted, setMuted] = useState<boolean>(!userWantsAudio);
  // videoReady=true so quando o video efetivamente comecou a renderizar
  // frames. Antes disso, a barra de progresso fica congelada em 0 — sem
  // isso a barra correria sobre tela preta enquanto HLS carrega o primeiro
  // chunk e o usuario via o story antes mesmo dele aparecer.
  const [videoReady, setVideoReady] = useState(false);
  // imageReady=true so quando o <img> dispara onLoad. Antes a barra de
  // progresso de stories de FOTO comecava IMEDIATAMENTE ao mudar story
  // (mesmo bug que o video tinha) — usuario via barra correndo antes
  // da imagem aparecer e a foto era "pulada" enquanto carregava lenta
  // em 3G/4G.
  const [imageReady, setImageReady] = useState(false);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [reactions, setReactions] = useState<StoryReactions>({ likes: [], comments: [] });
  const [commentText, setCommentText] = useState('');
  const [showComments, setShowComments] = useState(false);
  const [paused, setPaused] = useState(false);
  // SWIPE-DOWN-TO-CLOSE (estilo Instagram). User arrasta a tela pra baixo
  // pra sair do viewer. Substitui o botao X (removido a pedido do user).
  // swipeY = deslocamento atual em px; quando solta acima do threshold,
  // chama onClose.
  const [swipeY, setSwipeY] = useState(0);
  const swipeRef = useRef<{ startY: number; active: boolean } | null>(null);
  // SWIPE-UP tracking — abre o modal de viewers (Quem viu este story)
  // estilo Instagram. So funciona se o user atual eh DONO do story.
  const [swipeYUp, setSwipeYUp] = useState(0);
  const swipeUpRef = useRef<{ startY: number; active: boolean } | null>(null);
  // SWIPE-HORIZONTAL tracking — esquerda pula pra proxima pessoa, direita
  // volta pra anterior (estilo Instagram). Diferente do tap-left/tap-right
  // que so passa story-a-story dentro do mesmo user.
  const [swipeX, setSwipeX] = useState(0);
  const swipeXRef = useRef<{ startX: number; active: boolean } | null>(null);
  // Zoom + hold-to-pause state
  const [zoomScale, setZoomScale] = useState(1);
  const [zoomTx, setZoomTx] = useState(0);
  const [zoomTy, setZoomTy] = useState(0);
  const pinchRef = useRef<{ dist: number; cx: number; cy: number; scale: number; tx: number; ty: number } | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapStartRef = useRef<{ x: number; y: number; t: number; held: boolean } | null>(null);

  const current = stories[idx];
  // Barras de progresso devem refletir SOMENTE os stories do usuario corrente
  // (estilo Instagram): se ele tem 2 stories, mostra 2 barras. Antes mostrava
  // barras p/ todos os stories de todos os users (3+ users -> 10+ barras).
  const currentUserStories = current ? stories.filter(s => s.username === current.username) : [];
  const currentUserIdx = current ? currentUserStories.findIndex(s => s.id === current.id) : -1;

  // Busca foto do dono do story atual (do Supabase ou do proprio user logado)
  useEffect(() => {
    if (!current) { setOwnerAvatar(null); return; }
    if (current.username === currentUser) {
      setOwnerAvatar(myAvatar || null);
      return;
    }
    let cancelled = false;
    setOwnerAvatar(null);
    (async () => {
      try {
        const { data } = await supabase
          .from('usuarios')
          .select('foto_perfil')
          .eq('username', current.username)
          .maybeSingle();
        if (!cancelled) setOwnerAvatar(data?.foto_perfil || null);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [current?.username, currentUser, myAvatar]);

  // Carrega reações ao mudar de story
  useEffect(() => {
    if (!current) return;
    setReactions(loadReactions(current.id));
    setCommentText('');
    setShowComments(false);
  }, [current?.id]);

  // Marca view do story atual (so se nao for o proprio dono e ainda nao
  // estava na lista). Faz append direto no banco via array_append.
  // Optimistic: atualiza state local imediatamente; UPDATE em background.
  useEffect(() => {
    if (!current || !currentUser || current.username === currentUser) return;
    if (current.views?.includes(currentUser)) return;
    // optimistic
    current.views = [...(current.views || []), currentUser];
    (async () => {
      try {
        // Busca lista atual + append + UPDATE (race-free pra arrays pequenos)
        const { data } = await supabase
          .from('stories_demo')
          .select('views')
          .eq('id', current.id)
          .maybeSingle();
        const cur = (data as any)?.views || [];
        if (cur.includes(currentUser)) return;
        const next = [...cur, currentUser];
        await supabase.from('stories_demo').update({ views: next }).eq('id', current.id);
      } catch (e) { console.warn('[story-view] falhou:', e); }
    })();
  }, [current?.id, currentUser]);

  // Modal "Visualizadores" — abre quando o dono clica no contador.
  // Swipe-down no modal fecha (volta pro story). Tap no backdrop tambem.
  const [showStoryViewers, setShowStoryViewers] = useState(false);
  const [storyViewerPhotos, setStoryViewerPhotos] = useState<Record<string, string | null>>({});
  const [viewerModalDragY, setViewerModalDragY] = useState(0);
  const viewerModalDragRef = useRef<{ startY: number; active: boolean } | null>(null);
  useEffect(() => {
    if (!showStoryViewers || !current?.views?.length) return;
    const missing = current.views.filter(u => !(u in storyViewerPhotos));
    if (missing.length === 0) return;
    supabase.from('usuarios').select('username, foto_perfil').in('username', missing).then(({ data }) => {
      if (!data) return;
      setStoryViewerPhotos(prev => {
        const next = { ...prev };
        (data as any[]).forEach(u => { next[u.username] = u.foto_perfil || null; });
        missing.forEach(u => { if (!(u in next)) next[u] = null; });
        return next;
      });
    });
  }, [showStoryViewers, current?.views, storyViewerPhotos]);

  // Reseta modal quando troca story
  useEffect(() => { setShowStoryViewers(false); }, [current?.id]);

  // Reseta drag quando o modal abre/fecha
  useEffect(() => {
    if (!showStoryViewers) {
      setViewerModalDragY(0);
      viewerModalDragRef.current = null;
    }
  }, [showStoryViewers]);

  // Pausa o auto-advance enquanto qualquer overlay esta aberto:
  // - showComments: input/lista de comentarios
  // - showStoryViewers: modal de quem visualizou (estilo IG, gesto swipe-up)
  // O story so retoma o progress depois que o user fecha o overlay.
  useEffect(() => {
    setPaused(showComments || showStoryViewers);
  }, [showComments, showStoryViewers]);

  // REPOSTAR — cria um story novo do currentUser usando a MESMA URL
  // de midia do story original (sem reupload). So acessivel se o
  // currentUser foi mencionado neste story (via @ ou layer 'mention').
  async function repostCurrentStory() {
    if (!current || !currentUser) return;
    if (!confirm(`Repostar este story de @${current.username} no seu story?`)) return;
    // Resolve a URL real da midia: stories antigos podem ter blobKey
    // local (`b_...`); o que vai pro DB eh o url passado em
    // insertRemoteStory. Usamos o blobKey se ja for `__remote__:` ou
    // pegamos o url visualizado atualmente (var `url` do state da viewer).
    const remoteUrl = current.blobKey?.startsWith('__remote__:')
      ? current.blobKey.slice('__remote__:'.length)
      : (url || current.blobKey);
    const newStory: Story = {
      id: `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      username: currentUser,
      kind: current.kind,
      blobKey: `__remote__:${remoteUrl}`,
      duration: current.duration,
      text: `🔁 Repostado de @${current.username}`,
      createdAt: new Date().toISOString(),
    };
    try {
      const res = await insertRemoteStory(newStory, remoteUrl);
      if (res.ok) {
        // Marca o story original como "ja repostado por mim" — o botao
        // Repostar nao aparece mais nele ate o localStorage ser limpo.
        setRepostedStoryIds(prev => {
          const updated = new Set(prev);
          updated.add(current.id);
          saveRepostedStoryIds(updated);
          return updated;
        });
        window.dispatchEvent(new CustomEvent('papo-story-posted', { detail: { username: currentUser } }));
        onClose();
      } else {
        alert('Nao foi possivel repostar agora. Tente novamente.');
      }
    } catch (e) {
      console.warn('[repost-story]', e);
      alert('Erro ao repostar.');
    }
  }

  // Detecta se o currentUser foi mencionado neste story (via @ no
  // mentions[] OU via layer do tipo 'mention').
  const isMentionedInStory = !!currentUser && (
    (current?.mentions?.includes(currentUser)) ||
    (current?.layers?.some((l: any) => l.type === 'mention' && l.username === currentUser) ?? false)
  );

  function toggleLikeCurrent() {
    if (!current || !currentUser) return;
    const r = loadReactions(current.id);
    const has = r.likes.includes(currentUser);
    const next: StoryReactions = {
      ...r,
      likes: has ? r.likes.filter(u => u !== currentUser) : [...r.likes, currentUser],
    };
    saveReactions(current.id, next);
    setReactions(next);
    // Avisa o dono do story só quando CURTE (não quando descurte).
    // Sempre mandamos uma thumbnail real do story — pra video usamos a
    // thumb JPG do Cloudflare Stream derivada da URL HLS.
    if (!has && current.username !== currentUser) {
      notifyUser(current.username, currentUser, 'story_like', '❤️ Curtiu seu story', `${currentUser} curtiu seu story`, {
        refId: current.id,
        imageUrl: storyPreviewUrl(current, url) || myAvatar || undefined,
      });
    }
  }

  function sendComment() {
    if (!current || !currentUser || !commentText.trim()) return;
    const r = loadReactions(current.id);
    const txt = commentText.trim();
    const c: StoryComment = {
      id: `sc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      user: currentUser,
      text: txt,
      createdAt: new Date().toISOString(),
    };
    const next: StoryReactions = { ...r, comments: [...r.comments, c] };
    saveReactions(current.id, next);
    setReactions(next);
    setCommentText('');
    if (current.username !== currentUser) {
      notifyUser(current.username, currentUser, 'story_comment', '💬 Comentou seu story', `${currentUser}: ${txt.slice(0, 100)}`, {
        refId: current.id,
        imageUrl: storyPreviewUrl(current, url) || myAvatar || undefined,
      });
    }
  }

  useEffect(() => {
    let cancelled = false;
    setUrl(null); setProgress(0);
    if (!current) return;
    // Story remoto: blobKey é uma URL embutida, usa direto.
    if (current.blobKey.startsWith('__remote__:')) {
      setUrl(current.blobKey.slice('__remote__:'.length));
      return;
    }
    (async () => {
      const blob = await getBlob(current.blobKey);
      if (!blob || cancelled) return;
      const u = URL.createObjectURL(blob);
      setUrl(u);
    })();
    return () => { cancelled = true; };
  }, [current?.id]);

  useEffect(() => () => {
    // Só revoga URLs locais (object URLs); remotas não precisam.
    if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
  }, [url]);

  // Reseta videoReady/imageReady/progress quando muda story.
  // BUG FIX: tambem reseta startRef + flag de "primeira vez". Sem
  // isso, o tick effect lia o `progress` STALE do story anterior
  // (setProgress eh async) e calculava startRef = now - progress*ms
  // -> barra do story novo comecava onde o anterior parou. Agora
  // o flag forca startRef = now (comeco do zero) ao trocar.
  useEffect(() => {
    setVideoReady(false);
    setImageReady(false);
    setProgress(0);
    startRef.current = 0; // 0 = "precisa recomecar do zero"
  }, [current?.id]);

  // Toda a logica de autoplay com som + deteccao de "ready" agora baseada
  // em eventos do <video>. SEM esse tratamento, dois bugs aconteciam:
  //   1) Tentavamos play() antes do HLS attachar o source -> autoplay com
  //      som rejeitava por motivo errado e caiamos em mudo
  //   2) A barra de progresso comecava antes do video aparecer -> tela
  //      preta com barra correndo
  useEffect(() => {
    if (current?.kind !== 'video') return;
    const v = videoRef.current;
    if (!v || !url) return;

    let cancelled = false;
    // Respeita a PREFERENCIA da sessao: se o user quer audio, tenta com
    // som; se ja mutou antes, arranca mudo. Antes era hard-coded
    // `v.muted = false; setMuted(false)` em todo story, o que ignorava
    // a escolha do user de mutar (cada novo story voltava a tentar som).
    v.muted = !userWantsAudio;
    v.volume = 1;
    setMuted(!userWantsAudio);

    const tryPlay = async () => {
      if (cancelled || !v) return;
      try {
        await v.play();
      } catch {
        // Browser bloqueou autoplay (com ou sem som). Fallback: forca
        // mudo no <video> pra deixar o video tocando — mas NAO altera
        // userWantsAudio. Assim que houver proximo gesto do user
        // (touch no video), tentamos desmutar de novo no listener.
        if (cancelled || !v) return;
        v.muted = true;
        setMuted(true);
        try { await v.play(); } catch {}
      }
    };

    // canplay = primeiro frame ja decodificado (pode comecar a tocar agora)
    // playing = realmente tocando (frame esta na tela)
    const onCanPlay = () => { tryPlay(); };
    const onPlaying = () => { setVideoReady(true); };
    const onWaiting = () => { setVideoReady(false); };

    v.addEventListener('canplay', onCanPlay);
    v.addEventListener('playing', onPlaying);
    v.addEventListener('waiting', onWaiting);

    // Se o video ja estava pronto antes do effect rodar (cache, etc), tenta direto
    if (v.readyState >= 3) tryPlayWithSound();

    return () => {
      cancelled = true;
      v.removeEventListener('canplay', onCanPlay);
      v.removeEventListener('playing', onPlaying);
      v.removeEventListener('waiting', onWaiting);
    };
  }, [url, current?.id]);

  // Avanço automático — pausa quando estiver com comentários abertos OU
  // quando o conteudo ainda nao esta pronto pra renderizar.
  // Sem o gate, a barra corria enquanto a tela ficava preta/branca
  // esperando HLS bufferar ou imagem carregar, e o story sumia antes
  // do usuario conseguir ver. Cada tipo tem seu gate proprio:
  //  - video: videoReady (evento 'playing')
  //  - imagem: imageReady (evento 'load' do <img>)
  useEffect(() => {
    if (!current || !url || paused) return;
    const ready = current.kind === 'video' ? videoReady : imageReady;
    if (!ready) return;
    const totalMs = Math.max(1, current.duration) * 1000;
    // BUG FIX: se startRef === 0, eh um story NOVO (acabou de trocar)
    // -> comeca do ZERO (now). Senao, eh retomada de pausa -> preserva
    // o progresso atual subtraindo o tempo ja decorrido.
    if (startRef.current === 0) {
      startRef.current = performance.now();
    } else {
      startRef.current = performance.now() - progress * totalMs;
    }
    const tick = (t: number) => {
      const p = Math.min(1, (t - startRef.current) / totalMs);
      setProgress(p);
      if (p >= 1) advance();
      else rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, url, paused, videoReady, imageReady]);

  function advance() {
    if (idx + 1 < stories.length) setIdx(idx + 1);
    else onClose();
  }
  function back() {
    if (idx > 0) setIdx(idx - 1);
  }
  // Pula direto pra primeira story do PROXIMO user (estilo Instagram swipe-left).
  // Se ja eh o ultimo user, fecha o viewer.
  function nextUser() {
    const curUser = current?.username;
    if (!curUser) { onClose(); return; }
    for (let i = idx + 1; i < stories.length; i++) {
      if (stories[i].username !== curUser) {
        setIdx(i);
        return;
      }
    }
    onClose();
  }
  // Pula direto pra primeira story do USER ANTERIOR (estilo Instagram swipe-right).
  // Se ja eh o primeiro user, fica no story atual (nao volta antes).
  function prevUser() {
    const curUser = current?.username;
    if (!curUser) return;
    // Procura pra tras o ultimo story de um user diferente
    let prevUserName: string | null = null;
    let lastIdxOfPrevUser = -1;
    for (let i = idx - 1; i >= 0; i--) {
      if (stories[i].username !== curUser) {
        prevUserName = stories[i].username;
        lastIdxOfPrevUser = i;
        break;
      }
    }
    if (!prevUserName) return; // nao ha user anterior
    // Volta ate o PRIMEIRO story desse user anterior
    let firstIdxOfPrevUser = lastIdxOfPrevUser;
    for (let i = lastIdxOfPrevUser - 1; i >= 0; i--) {
      if (stories[i].username === prevUserName) firstIdxOfPrevUser = i;
      else break;
    }
    setIdx(firstIdxOfPrevUser);
  }

  // ───── Navegação por teclado (desktop) ─────
  // ←  → para voltar / avançar story
  // Esc para fechar o viewer
  // Space para pausar/retomar (toggle pausa via comments — afeta auto-advance)
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Ignora se foco está num input/textarea (usuário pode estar comentando)
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        advance();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        back();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === ' ') {
        e.preventDefault();
        setPaused(p => !p);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, stories.length]);

  if (!current) { onClose(); return null; }
  const isOwn = currentUser && currentUser === current.username;

  // Swipe-down pra fechar: INTEGRADO nos handlers de touch da area de
  // CONTEUDO do story (mais abaixo no JSX). Aqui no painel externo NAO
  // ha handlers porque a area de conteudo chama stopPropagation (precisa,
  // pra pinch/zoom/hold-to-pause funcionarem sem vazar pro feed). Por
  // isso os handlers vivem dentro da area de conteudo.

  return (
    <div
      className="fixed inset-0 z-[100000] bg-black flex items-center justify-center"
      // Fade do backdrop conforme o user arrasta — feedback "esta saindo"
      style={{
        background: `rgba(0,0,0,${Math.max(0.55, 1 - swipeY / 600)})`,
        transition: swipeRef.current?.active ? 'none' : 'background 200ms ease-out',
      }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md h-full sm:max-h-[92vh] sm:rounded-2xl overflow-hidden"
        style={{
          background: '#000',
          // swipeY > 0: arrasta pra baixo (fechar).
          // swipeYUp < 0: arrasta pra cima (abrir viewers).
          // swipeX != 0: arrasta horizontal (esquerda=proxima pessoa,
          // direita=pessoa anterior). Damos feedback visual.
          transform: swipeXRef.current?.active && swipeX !== 0
            ? `translateX(${swipeX}px)`
            : swipeY > 0
              ? `translateY(${swipeY}px)`
              : swipeYUp < 0
                ? `translateY(${Math.max(swipeYUp, -120)}px)`
                : undefined,
          transition: (swipeRef.current?.active || swipeUpRef.current?.active || swipeXRef.current?.active) ? 'none' : 'transform 220ms ease-out',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Barras de progresso */}
        <div
          className="absolute left-2 right-2 flex gap-1 z-10"
          style={{ top: 'calc(env(safe-area-inset-top) + 8px)' }}
        >
          {currentUserStories.map((_, i) => (
            <div key={i} className="flex-1 h-0.5 rounded-full bg-white/30 overflow-hidden">
              <div
                className="h-full bg-white"
                style={{ width: i < currentUserIdx ? '100%' : i === currentUserIdx ? `${progress * 100}%` : '0%' }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div
          className="absolute left-3 right-3 flex items-center justify-between z-10 pt-1.5"
          style={{ top: 'calc(env(safe-area-inset-top) + 20px)' }}
        >
          <div className="flex items-center gap-2">
            {ownerAvatar ? (
              <img
                src={ownerAvatar}
                alt={current.username}
                className="w-8 h-8 rounded-full object-cover"
                style={{ border: '1.5px solid rgba(255,255,255,0.6)' }}
              />
            ) : (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                style={{ background: 'linear-gradient(135deg, #1e714a, #4ade80)' }}
              >
                {current.username.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-white text-sm font-semibold">{current.username}</p>
              <p className="text-white/70 text-[10px]">{new Date(current.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isOwn && (
              <>
                {/* Contador de viewers — clicavel pra abrir lista.
                    DESKTOP: visivel (estilo desktop). MOBILE: oculto, user
                    abre via swipe-up no story (hint na base). */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setShowStoryViewers(true); }}
                  className="hidden sm:flex items-center gap-1 text-white/85 hover:text-white text-xs font-bold px-2 py-1 active:scale-95 transition-transform"
                  title="Ver quem visualizou"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                  <span>{(current.views || []).length}</span>
                </button>
                <button
                  onClick={() => { if (confirm('Apagar este story?')) onDelete(current.id); }}
                  className="text-white/80 hover:text-red-400 text-xs font-bold px-2 py-1"
                >
                  Apagar
                </button>
              </>
            )}
            {/* Botao X REMOVIDO a pedido do user. Pra sair do viewer:
                - Mobile: arraste a tela pra baixo (swipe-down handler ja
                  registrado no container interno).
                - Desktop: clique no backdrop preto (onClick={onClose} do
                  container externo). */}
          </div>
        </div>

        {/* Conteúdo — key na username faz React re-montar o container quando
            cruza fronteira entre usuarios, disparando animacao de "virar pagina"
            estilo Instagram. Stories do mesmo user NAO disparam (sem key change). */}
        <style>{`
          @keyframes papoStoryFlip {
            0%   { transform: perspective(1200px) rotateY(80deg); opacity: 0; transform-origin: left center; }
            60%  { opacity: 1; }
            100% { transform: perspective(1200px) rotateY(0deg); opacity: 1; }
          }
          .papo-story-flip { animation: papoStoryFlip 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards; will-change: transform, opacity; }
        `}</style>
        <div
          key={current.username}
          className="papo-story-flip absolute inset-0 flex items-center justify-center"
          style={{
            transform: zoomScale > 1.001 ? `translate(${zoomTx}px, ${zoomTy}px) scale(${zoomScale})` : undefined,
            transformOrigin: 'center',
            transition: zoomScale === 1 && !pinchRef.current ? 'transform 0.18s ease' : undefined,
            willChange: zoomScale > 1.001 ? 'transform' : undefined,
          }}
        >
          {!url ? (
            <span className="text-white/70 text-sm">Carregando…</span>
          ) : current.kind === 'video' ? (
            <>
              <HlsVideo
                ref={videoRef}
                src={url}
                autoPlay
                playsInline
                muted={muted}
                style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
              />
              {/* Spinner enquanto buffera — some assim que video.playing dispara */}
              {!videoReady && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-10 h-10 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                </div>
              )}
            </>
          ) : (
            <>
              <img
                src={url}
                alt=""
                className="max-w-full max-h-full object-contain"
                onLoad={() => setImageReady(true)}
                onError={() => setImageReady(true) /* mesmo erro -> destrava */}
              />
              {/* Spinner enquanto imagem nao carregou — barra de progresso
                  ja esta gateada (imageReady=false) entao nao corre antes
                  do user ver a foto. */}
              {!imageReady && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-10 h-10 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                </div>
              )}
            </>
          )}

          {/* CAMADAS sobrepostas — render das stickers/textos/mencoes/etc
              que o autor adicionou no editor. Coords sao normalizadas
              (0-1) pelo tamanho da midia → re-escalam em qualquer tela.
              BUG FIX: key={current.id} forca remount limpo quando troca
              de story. Sem isso, durante a transicao (pulo manual antes
              da barra terminar), os layers/emojis do story anterior
              ficavam visiveis por um frame sobre o proximo story. */}
          {current.layers && current.layers.length > 0 && (
            <StoryLayersOverlay key={current.id} layers={current.layers} />
          )}
          {/* MÚSICA — TrackPlayer toca em loop muted (igual Instagram).
              User pode ativar som no botão dentro do player. */}
          {current.spotify_track && (
            <TrackPlayer
              key={`music-${current.id}`}
              track={current.spotify_track}
              variant="story"
              autoPlay
              startMuted
            />
          )}
        </div>

        {/* Botão de áudio — só para vídeos. Toque pra ligar/desligar o som.
            Atualiza tambem userWantsAudio (modulo-level) pra que a preferencia
            persista entre os proximos stories da sessao. */}
        {current.kind === 'video' && url && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMuted(prev => {
                const next = !prev;
                userWantsAudio = !next; // next=true (mutado) -> userWantsAudio=false
                const v = videoRef.current;
                if (v) {
                  v.muted = next;
                  // Se ESTA desmutando, tenta replay — gesto fresco do user
                  // permite ao iOS aceitar audio agora.
                  if (!next) {
                    v.play().catch(() => {});
                  }
                }
                return next;
              });
            }}
            className="absolute z-40 w-9 h-9 rounded-full flex items-center justify-center text-white"
            style={{
              top: 'calc(env(safe-area-inset-top) + 64px)', right: 12,
              background: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(6px)',
              border: '1px solid rgba(255,255,255,0.25)',
            }}
            aria-label={muted ? 'Ativar som' : 'Silenciar'}
            title={muted ? 'Ativar som' : 'Silenciar'}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        )}

        {/* Contador regressivo de segundos — so para video. Acompanha o
            progress bar do topo. Aparece embaixo do botao de audio. */}
        {current.kind === 'video' && url && videoReady && (
          <div
            className="absolute z-40 px-2.5 py-1 rounded-full text-white text-xs font-bold tabular-nums pointer-events-none"
            style={{
              top: 'calc(env(safe-area-inset-top) + 110px)', right: 12,
              background: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(6px)',
              border: '1px solid rgba(255,255,255,0.25)',
            }}
          >
            0:{String(Math.max(0, Math.ceil(current.duration * (1 - progress)))).padStart(2, '0')}
          </div>
        )}

        {/* Legenda do story (texto sobreposto) — POSICIONADA ACIMA da barra
             de input/curtir/comentar (z-50, ~60px de altura) e com z-index
             maior que as áreas de toque (z-30) pra ficar realmente visível. */}
        {current.text && (
          <div
            className="absolute left-3 right-3 px-3 py-2 rounded-xl text-center z-[45] pointer-events-none"
            style={{
              bottom: 'calc(env(safe-area-inset-bottom) + 76px)',
              background: 'rgba(0,0,0,0.65)',
              backdropFilter: 'blur(4px)',
              color: '#fff',
              fontFamily: '"DM Sans", system-ui, sans-serif',
              fontSize: 15,
              fontWeight: 600,
              lineHeight: 1.3,
              letterSpacing: '0.02em',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              textShadow: '0 1px 2px rgba(0,0,0,0.5)',
            }}
          >
            <AutoText text={current.text} />
          </div>
        )}

        {/* Mentions overlay chips REMOVIDO — estava duplicando os nomes:
            a mention aparecia 1) como layer dentro do StoryLayersOverlay
            (posicionado pelo autor) e 2) novamente aqui em chips fixos
            no rodape. Como o StoryLayersOverlay ja renderiza mentions
            corretamente e na posicao escolhida pelo autor, este bloco
            foi removido pra eliminar a duplicacao.

            Fallback pra stories LEGADOS (postados antes do editor de
            layers) que tem mentions[] mas SEM layers — so renderiza
            chip se nao houver layers do tipo 'mention'. */}
        {current.mentions && current.mentions.length > 0
          && (!current.layers || !current.layers.some(l => l.type === 'mention')) && (
          <div
            className="absolute left-3 z-[46] flex items-center gap-1.5 flex-wrap"
            style={{ bottom: 'calc(env(safe-area-inset-bottom) + 120px)' }}
          >
            {current.mentions.map(u => (
              <button
                key={u}
                onClick={(e) => {
                  e.stopPropagation();
                  window.dispatchEvent(new CustomEvent('papo-open-profile', { detail: { username: u } }));
                }}
                className="px-2 py-1 rounded-full text-[11px] font-bold text-white"
                style={{
                  background: 'rgba(0,0,0,0.6)',
                  backdropFilter: 'blur(6px)',
                  textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                }}
              >
                {u}
              </button>
            ))}
          </div>
        )}

        {/* Overlay unico de gestos: tap (back/advance), hold-to-pause, pinch-zoom.
            z-40 garante que fica ACIMA do conteudo (.papo-story-flip e Apagar btn). */}
        <div
          className="absolute inset-0 z-40"
          style={{
            top: 'calc(env(safe-area-inset-top) + 56px)',
            bottom: 'calc(env(safe-area-inset-bottom) + 72px)',
            touchAction: 'none',
            WebkitTouchCallout: 'none',
            WebkitUserSelect: 'none',
            userSelect: 'none',
          }}
          onContextMenu={(e) => e.preventDefault()}
          onTouchStart={(e) => {
            e.stopPropagation();
            // Detecta pinch (2+ dedos) em qualquer evento — iOS pode disparar
            // touchstart separado pra cada dedo aterrissar.
            if (e.touches.length >= 2) {
              const t1 = e.touches[0], t2 = e.touches[1];
              const dx = t2.clientX - t1.clientX;
              const dy = t2.clientY - t1.clientY;
              pinchRef.current = {
                dist: Math.hypot(dx, dy),
                cx: (t1.clientX + t2.clientX) / 2,
                cy: (t1.clientY + t2.clientY) / 2,
                scale: zoomScale,
                tx: zoomTx,
                ty: zoomTy,
              };
              if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
              tapStartRef.current = null;
              // Cancela swipe — eh pinch, nao swipe-down
              swipeRef.current = null;
              setSwipeY(0);
              setPaused(true);
              return;
            }
            // 1 dedo: arma hold-to-pause + tracking de swipe-down pra fechar.
            const t = e.touches[0];
            tapStartRef.current = { x: t.clientX, y: t.clientY, t: Date.now(), held: false };
            // SWIPE tracking (down=fecha, up=abre viewers, esq=proxima pessoa,
            // dir=pessoa anterior): registra startY/X. Soh ativa quando o delta
            // ultrapassar threshold (no onTouchMove), pra nao competir com tap/
            // hold-to-pause em movimentos pequenos.
            swipeRef.current = { startY: t.clientY, active: false };
            swipeUpRef.current = { startY: t.clientY, active: false };
            swipeXRef.current = { startX: t.clientX, active: false };
            if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
            holdTimerRef.current = setTimeout(() => {
              if (tapStartRef.current) {
                tapStartRef.current.held = true;
                setPaused(true);
              }
              holdTimerRef.current = null;
            }, 150);
          }}
          onTouchMove={(e) => {
            e.stopPropagation();
            if (e.touches.length >= 2 && pinchRef.current) {
              e.preventDefault();
              const t1 = e.touches[0], t2 = e.touches[1];
              const dx = t2.clientX - t1.clientX;
              const dy = t2.clientY - t1.clientY;
              const newDist = Math.hypot(dx, dy);
              const ratio = newDist / pinchRef.current.dist;
              const newScale = Math.max(1, Math.min(4, pinchRef.current.scale * ratio));
              setZoomScale(newScale);
              const newCx = (t1.clientX + t2.clientX) / 2;
              const newCy = (t1.clientY + t2.clientY) / 2;
              setZoomTx(pinchRef.current.tx + (newCx - pinchRef.current.cx));
              setZoomTy(pinchRef.current.ty + (newCy - pinchRef.current.cy));
              return;
            }
            // 1 dedo: avalia swipe-down (fecha), swipe-up (abre viewers se dono),
            // swipe-horizontal (proxima/anterior pessoa) + cancelamento de tap/hold
            const t = e.touches[0];
            const s = swipeRef.current;
            const su = swipeUpRef.current;
            const sx = swipeXRef.current;
            if (s) {
              const dy = t.clientY - s.startY;
              const dx = sx ? (t.clientX - sx.startX) : 0;
              const dxAbs = Math.abs(dx);
              const dyAbs = Math.abs(dy);
              // SWIPE-HORIZONTAL — precisa 30px lateral, mais horizontal que vertical.
              // Esq (dx < 0) = proxima pessoa, dir (dx > 0) = pessoa anterior.
              if (sx && !sx.active && dxAbs > 30 && dxAbs > dyAbs) {
                sx.active = true;
                if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
                tapStartRef.current = null;
                setPaused(true);
              }
              if (sx && sx.active) {
                if (e.cancelable) e.preventDefault();
                setSwipeX(dx);
                return;
              }
              // SWIPE-DOWN — precisa 20px pra baixo, mais vertical que horizontal
              if (!s.active && dy > 20 && dy > dxAbs) {
                s.active = true;
                if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
                tapStartRef.current = null;
                setPaused(false);
              }
              if (s.active) {
                if (e.cancelable) e.preventDefault();
                setSwipeY(Math.max(0, dy));
                return;
              }
              // SWIPE-UP — precisa 20px pra cima E dono do story (mostra viewers)
              if (su && !su.active && dy < -20 && -dy > dxAbs && isOwn) {
                su.active = true;
                if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
                tapStartRef.current = null;
                setPaused(true);
              }
              if (su && su.active) {
                if (e.cancelable) e.preventDefault();
                setSwipeYUp(Math.min(0, dy));
                return;
              }
            }
            if (tapStartRef.current && !tapStartRef.current.held) {
              const dx = Math.abs(t.clientX - tapStartRef.current.x);
              const dy = Math.abs(t.clientY - tapStartRef.current.y);
              if (dx > 10 || dy > 10) {
                if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
                tapStartRef.current = null;
              }
            }
          }}
          onTouchEnd={(e) => {
            e.stopPropagation();
            if (pinchRef.current && e.touches.length < 2) {
              pinchRef.current = null;
              if (zoomScale <= 1.05) {
                setZoomScale(1); setZoomTx(0); setZoomTy(0);
                setPaused(false);
              }
              return;
            }
            // FIM DO SWIPE-HORIZONTAL: se passou de 80px, pula pessoa.
            const swx = swipeXRef.current;
            if (swx && swx.active) {
              swipeRef.current = null;
              swipeUpRef.current = null;
              swipeXRef.current = null;
              const finalDx = swipeX;
              setSwipeX(0);
              if (finalDx < -80) nextUser();
              else if (finalDx > 80) prevUser();
              setPaused(false);
              return;
            }
            // FIM DO SWIPE-DOWN: se chegou no threshold, fecha. Senao snap-back.
            const sw = swipeRef.current;
            if (sw && sw.active) {
              swipeRef.current = null;
              swipeUpRef.current = null;
              swipeXRef.current = null;
              if (swipeY > 120) {
                onClose();
              } else {
                setSwipeY(0);
              }
              return;
            }
            // FIM DO SWIPE-UP: se passou de -80, abre modal viewers e
            // MANTEM o story pausado. Quando o user fechar o modal o
            // useEffect [showStoryViewers] reseta paused. Snap-back se
            // o gesto foi cancelado.
            const swu = swipeUpRef.current;
            if (swu && swu.active) {
              swipeRef.current = null;
              swipeUpRef.current = null;
              swipeXRef.current = null;
              const shouldOpen = swipeYUp < -80;
              setSwipeYUp(0);
              if (shouldOpen) {
                setShowStoryViewers(true);
                // NAO despausa — paused permanece true enquanto modal aberto
              } else {
                setPaused(false);
              }
              return;
            }
            swipeRef.current = null;
            swipeUpRef.current = null;
            swipeXRef.current = null;
            if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
            const start = tapStartRef.current;
            tapStartRef.current = null;
            if (!start) return;
            if (start.held) {
              setPaused(false);
              return;
            }
            if (zoomScale > 1.05) return;
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            const xRel = start.x - rect.left;
            if (xRel < rect.width * 0.33) back();
            else advance();
          }}
          onTouchCancel={() => {
            if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
            tapStartRef.current = null;
            pinchRef.current = null;
            setPaused(false);
          }}
        />

        {/* Setas visiveis removidas — navegacao so por toque nas areas
            invisiveis esquerda/direita (estilo Instagram puro). */}

        {/* Hint visual "Atividade ↑" — so visivel no MOBILE pro DONO do
            story. Indica o gesto de swipe-up que abre o modal de viewers
            (estilo Instagram). Posicao acima do input bar. */}
        {isOwn && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowStoryViewers(true); }}
            className="sm:hidden absolute left-1/2 -translate-x-1/2 z-[55] flex flex-col items-center gap-0.5 text-white active:scale-95"
            style={{
              bottom: 'calc(env(safe-area-inset-bottom) + 64px)',
              opacity: 0.85,
              pointerEvents: 'auto',
              textShadow: '0 1px 3px rgba(0,0,0,0.6)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15"/>
            </svg>
            <span className="text-[11px] font-bold tracking-wide">
              Atividade · {(current.views || []).length}
            </span>
          </button>
        )}

        {/* Barra inferior — input de comentário + like — sempre visível */}
        <div
          className="absolute left-0 right-0 bottom-0 z-50 px-3 flex items-center gap-2"
          onClick={e => e.stopPropagation()}
          style={{
            background: 'linear-gradient(to top, rgba(0,0,0,0.6), rgba(0,0,0,0))',
            paddingTop: 10,
            paddingBottom: 'calc(env(safe-area-inset-bottom) + 10px)',
          }}
        >
          <input
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            onFocus={() => setShowComments(true)}
            onKeyDown={e => { if (e.key === 'Enter') sendComment(); }}
            placeholder={`Responder pra @${current.username}…`}
            className="flex-1 px-4 py-2.5 rounded-full text-sm outline-none"
            style={{
              background: 'rgba(255,255,255,0.10)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.25)',
              backdropFilter: 'blur(8px)',
            }}
          />
          {/* REPOSTAR — aparece SO se o currentUser foi mencionado neste
              story (via @ ou layer 'mention') e nao eh o dono do story.
              Cria um story novo do currentUser usando a mesma midia.
              NAO aparece se:
                - o story ja eh um repost (text comeca com "🔁 Repostado de @"), OU
                - o currentUser ja repostou esse story antes. */}
          {isMentionedInStory
            && current.username !== currentUser
            && !repostedStoryIds.has(current.id)
            && !current.text?.startsWith('🔁 Repostado de @') && (
            <button
              onClick={(e) => { e.stopPropagation(); repostCurrentStory(); }}
              className="h-10 px-3 rounded-full flex items-center gap-1 text-white text-[12px] font-bold transition-all active:scale-90"
              style={{ background: '#1e714a', border: '1px solid #1e714a' }}
              aria-label="Repostar"
            >
              🔁 Repostar
            </button>
          )}
          <button
            onClick={toggleLikeCurrent}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90"
            style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.25)', backdropFilter: 'blur(8px)' }}
            aria-label="Curtir"
          >
            <Heart
              className="w-5 h-5"
              fill={currentUser && reactions.likes.includes(currentUser) ? '#f87171' : 'transparent'}
              color={currentUser && reactions.likes.includes(currentUser) ? '#f87171' : '#fff'}
            />
          </button>
          <button
            onClick={() => setShowComments(s => !s)}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90"
            style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.25)', backdropFilter: 'blur(8px)' }}
            aria-label="Ver comentários"
          >
            <MessageCircle className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Contadores discretos acima do input */}
        {(reactions.likes.length > 0 || reactions.comments.length > 0) && (
          <div
            className="absolute right-3 z-50 flex items-center gap-2 text-xs text-white/80"
            style={{ bottom: 64, pointerEvents: 'none' }}
          >
            {reactions.likes.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,0,0,0.45)' }}>
                <Heart className="w-3 h-3" fill="#f87171" color="#f87171" /> {reactions.likes.length}
              </span>
            )}
            {reactions.comments.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,0,0,0.45)' }}>
                <MessageCircle className="w-3 h-3" /> {reactions.comments.length}
              </span>
            )}
          </div>
        )}

        {/* Painel deslizante de comentários */}
        {showComments && (
          <div
            onClick={e => e.stopPropagation()}
            className="absolute left-0 right-0 bottom-0 z-[55] rounded-t-2xl flex flex-col"
            style={{
              background: '#101012',
              border: '1px solid rgba(255,255,255,0.10)',
              maxHeight: '60%',
              minHeight: '30%',
            }}
          >
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="text-sm font-semibold text-white">
                {reactions.comments.length} comentário{reactions.comments.length === 1 ? '' : 's'}
              </p>
              <button onClick={() => setShowComments(false)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
              {reactions.comments.length === 0 && (
                <p className="text-xs text-white/50 text-center py-4">Seja o primeiro a comentar.</p>
              )}
              {reactions.comments.map(c => (
                <div key={c.id} className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                       style={{ background: 'linear-gradient(135deg, #1e714a 0%, #4ade80 100%)' }}>
                    {c.user.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs">
                      <span className="font-semibold text-white">{c.user}</span>{' '}
                      <AutoText text={c.text} className="text-white/85" />
                    </p>
                    <p className="text-[10px] text-white/40 mt-0.5">
                      {new Date(c.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-3 py-2.5 flex items-center gap-2" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <input
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') sendComment(); }}
                placeholder="Adicione um comentário…"
                className="flex-1 px-4 py-2.5 rounded-full text-sm outline-none"
                style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.18)' }}
              />
              <button
                onClick={sendComment}
                disabled={!commentText.trim()}
                className="px-4 py-2 rounded-full text-xs font-bold text-white disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg, #1e714a 0%, #4ade80 100%)',
                  fontFamily: '"DM Sans", system-ui, sans-serif',
                  letterSpacing: '0.14em',
                }}
              >
                Enviar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal "Visualizadores do story" — estilo Instagram:
          - Mobile: bottom sheet com miniaturas dos stories do dono no
            topo (scroll horizontal, story atual destacado com chevron)
            + lista de viewers abaixo
          - Desktop: dialog centralizado, mesma estrutura */}
      {showStoryViewers && current && isOwn && (
        <div
          className="fixed inset-0 z-[100050] flex items-end sm:items-center justify-center cursor-pointer"
          style={{
            // Mobile: overlay translucido (35%) pra o user VER o story
            // atras e ENTENDER que tocando ali ele volta pro story.
            // Desktop: opaco (70%) tradicional.
            background: 'rgba(0,0,0,0.35)',
          }}
          // BUG FIX: stopPropagation pra evitar que o click do overlay
          // VAZE pro StoryViewer atras (que tinha onClick={onClose} no
          // backdrop -> fechava o viewer inteiro e voltava pro feed).
          // Agora SO fecha o modal de viewers, mantendo o story aberto.
          onClick={(e) => {
            e.stopPropagation();
            setShowStoryViewers(false);
          }}
          // Tambem cancela touch events pra nao acionar swipes do viewer
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          <div
            className="bg-white w-full max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90dvh] overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
            style={{
              transform: viewerModalDragY > 0 ? `translateY(${viewerModalDragY}px)` : undefined,
              transition: viewerModalDragRef.current?.active ? 'none' : 'transform 220ms ease-out',
            }}
            // Swipe-down APENAS na area do header (handle bar + miniaturas)
            // pra nao conflitar com scroll vertical da lista de viewers.
            onTouchStart={(e) => {
              const target = e.target as HTMLElement;
              if (target.closest('[data-modal-content]')) return; // ignora se foi na lista
              viewerModalDragRef.current = { startY: e.touches[0].clientY, active: false };
            }}
            onTouchMove={(e) => {
              const ref = viewerModalDragRef.current;
              if (!ref) return;
              const dy = e.touches[0].clientY - ref.startY;
              if (!ref.active && dy > 12) ref.active = true;
              if (ref.active && dy > 0) setViewerModalDragY(dy);
            }}
            onTouchEnd={() => {
              const ref = viewerModalDragRef.current;
              if (ref?.active && viewerModalDragY > 80) {
                setShowStoryViewers(false);
              } else {
                setViewerModalDragY(0);
              }
              viewerModalDragRef.current = null;
            }}
          >
            {/* Handle bar — indica que pode arrastar pra baixo pra fechar */}
            <div className="flex justify-center pt-2 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>
            {/* Header com miniaturas dos stories — scroll horizontal */}
            <div className="pt-2 pb-3 flex-shrink-0 border-b border-gray-100">
              <div className="flex items-center justify-center gap-2 px-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                <style>{`.story-thumbs-row::-webkit-scrollbar{display:none}`}</style>
                <div className="story-thumbs-row flex items-end justify-center gap-2 flex-shrink-0">
                  {currentUserStories.map((s, i) => {
                    const isActive = s.id === current.id;
                    const thumbViews = (s.views || []).length;
                    // Deriva thumb da URL do story
                    const m = s.blobKey.match(/(?:videodelivery\.net|cloudflarestream\.com)\/([a-f0-9-]+)/);
                    const isRemoteUrl = s.blobKey.startsWith('__remote__:');
                    const remoteUrl = isRemoteUrl ? s.blobKey.slice('__remote__:'.length) : null;
                    const thumb = s.kind === 'image'
                      ? (remoteUrl || '')
                      : (m ? `https://videodelivery.net/${m[1]}/thumbnails/thumbnail.jpg?time=0s&height=200` : '');
                    return (
                      <div key={s.id} className="flex flex-col items-center gap-1">
                        <button
                          type="button"
                          onClick={() => { setIdx(stories.findIndex(x => x.id === s.id)); }}
                          className="relative flex-shrink-0 overflow-hidden bg-gray-100 active:scale-95 transition-transform"
                          style={{
                            width: isActive ? 60 : 44,
                            height: isActive ? 90 : 64,
                            borderRadius: 8,
                            border: isActive ? '2px solid #1e714a' : '2px solid transparent',
                          }}
                        >
                          {thumb ? (
                            <img src={thumb} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-purple-200 to-orange-200" />
                          )}
                          {/* Badge de viewers em cada miniatura */}
                          <div
                            className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full"
                            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
                          >
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                              <circle cx="9" cy="7" r="4"/>
                              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                            </svg>
                            <span className="text-[9px] font-bold text-white">{thumbViews}</span>
                          </div>
                        </button>
                        {/* Chevron embaixo do story ativo (estilo IG) */}
                        {isActive && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="#1e714a" stroke="none">
                            <polygon points="12,6 22,18 2,18" />
                          </svg>
                        )}
                        {!isActive && <div style={{ height: 14 }} />}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Contador grande + linha verde */}
              <div className="mt-2 px-5 flex items-center justify-between">
                <div className="flex items-center gap-2 pb-1.5" style={{ borderBottom: '2px solid #1e714a' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1f2937" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                  <span className="font-bold text-gray-800 text-sm">{(current.views || []).length}</span>
                </div>
                {/* Botao X removido — pra fechar: arrastar o modal pra
                    baixo OU clicar no story (backdrop) atras. */}
              </div>
            </div>

            {/* Titulo da seção */}
            <p className="px-5 pt-4 pb-2 text-sm font-bold text-gray-800 flex-shrink-0">
              Quem viu este story
            </p>

            {/* Lista de viewers — scrollavel.
                data-modal-content: marca essa area pra o swipe-down do
                modal IGNORAR toques aqui (deixa o scroll normal da
                lista funcionar, sem conflito com o gesto de fechar). */}
            <div data-modal-content className="flex-1 min-h-0 overflow-y-auto px-2 pb-2" style={{ WebkitOverflowScrolling: 'touch' }}>
              {(current.views || []).length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">Ninguém visualizou ainda.</p>
              ) : (
                (current.views || []).map(viewer => {
                  const photo = storyViewerPhotos[viewer];
                  const hasLiked = reactions.likes.includes(viewer);
                  return (
                    <button
                      key={viewer}
                      type="button"
                      onClick={() => {
                        setShowStoryViewers(false);
                        window.dispatchEvent(new CustomEvent('papo-open-profile', { detail: { username: viewer } }));
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors text-left"
                    >
                      <div className="relative">
                        <div className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0 bg-gradient-to-br from-purple-200 to-orange-200 flex items-center justify-center">
                          {photo
                            ? <img src={photo} alt="" className="w-full h-full object-cover" />
                            : <span className="font-bold text-xs text-purple-500">{viewer.slice(0, 2).toUpperCase()}</span>
                          }
                        </div>
                        {/* Badge de coracao se curtiu (estilo IG) */}
                        {hasLiked && (
                          <div className="absolute -bottom-0.5 -left-0.5 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center border-2 border-white">
                            <Heart className="w-2.5 h-2.5 text-white" fill="#fff" />
                          </div>
                        )}
                      </div>
                      <span className="flex-1 text-sm font-semibold text-gray-800 truncate">{viewer}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// StoryLayersOverlay — renderiza as camadas (texto/sticker/mencao/etc)
// por cima da midia no viewer. Reusa <LayerVisual> do StoryEditor pra
// garantir que a aparencia eh EXATAMENTE a mesma do editor (consistencia
// visual entre autor e visualizador).
//
// Coords sao normalizadas (0-1) ao salvar — aqui multiplicamos pelo
// tamanho do container (que ja ocupa toda a area da midia). Mencoes/hash
// recebem onClick pra ficarem interativas.
// ──────────────────────────────────────────────────────────────────────
function StoryLayersOverlay({ layers }: { layers: StoryLayer[] }) {
  return (
    <div className="absolute inset-0 pointer-events-none z-30">
      {layers.map(layer => {
        // TEXTO: legenda em UMA DE 3 ZONAS FIXAS (topo/meio/base), de acordo
        // com layer.zone (default 'bottom'). NAO usa x/y/scale/rotation
        // salvos. Consistente com o editor (decisao de produto: drag livre
        // foi removido pra contornar bugs de pinch/palm-rejection do iOS PWA).
        if (layer.type === 'text') {
          const zone = (layer as any).zone || 'bottom';
          const zoneStyle: React.CSSProperties = (() => {
            if (zone === 'top') return { top: 'calc(env(safe-area-inset-top, 0px) + 90px)' };
            if (zone === 'middle') return { top: '50%', transform: 'translateY(-50%)' };
            return { bottom: 'calc(env(safe-area-inset-bottom, 0px) + 100px)' };
          })();
          return (
            <div
              key={layer.id}
              className="absolute"
              style={{
                left: 12,
                right: 12,
                display: 'flex',
                justifyContent: 'center',
                pointerEvents: 'none',
                ...zoneStyle,
              }}
            >
              {/* Rotacao aplicada em wrapper interno pra preservar zoneStyle. */}
              <div style={{ transform: `rotate(${layer.rotation || 0}rad)`, transformOrigin: 'center center' }}>
                <LayerVisual layer={layer} />
              </div>
            </div>
          );
        }
        // Demais tipos: position de acordo com x/y/scale/rotation
        return (
          <div
            key={layer.id}
            className="absolute"
            style={{
              left: `${layer.x * 100}%`,
              top: `${layer.y * 100}%`,
              transform: `translate(-50%, -50%) rotate(${layer.rotation}rad) scale(${layer.scale})`,
              transformOrigin: 'center center',
              pointerEvents: (layer.type === 'mention' || layer.type === 'hashtag') ? 'auto' : 'none',
            }}
            onClick={(e) => {
              if (layer.type === 'mention') {
                e.stopPropagation();
                window.dispatchEvent(new CustomEvent('papo-open-profile', { detail: { username: (layer as any).username } }));
              }
            }}
          >
            <LayerVisual layer={layer} />
          </div>
        );
      })}
    </div>
  );
}
