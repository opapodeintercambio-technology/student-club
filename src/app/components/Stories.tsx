import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X, Camera, Video as VideoIcon, Volume2, VolumeX, Heart, MessageCircle, Image as ImageIcon } from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ───── Tipos ─────
export interface Story {
  id: string;
  username: string;
  kind: 'image' | 'video';
  blobKey: string;       // chave no IndexedDB
  duration: number;      // segundos (vídeo) ou 5 (imagem)
  text?: string;         // legenda opcional (até 240 chars)
  createdAt: string;     // ISO
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
  kind: 'image' | 'video';
  url: string;
  text?: string;
  duration: number;
  createdAt: string;
}

async function fetchRemoteStories(): Promise<RemoteStory[]> {
  try {
    const cutoff = new Date(Date.now() - STORY_TTL_HOURS * 3600_000).toISOString();
    const { data, error } = await supabase
      .from('stories_demo')
      .select('id,username,kind,url,text,duration,created_at')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error || !data) return [];
    return data.map((r: any) => ({
      id: r.id,
      username: r.username,
      kind: r.kind,
      url: r.url,
      text: r.text || undefined,
      duration: r.duration ?? 5,
      createdAt: r.created_at,
    }));
  } catch { return []; }
}

async function uploadStoryBlob(blob: Blob, fileName: string): Promise<string | null> {
  try {
    const path = `stories/${fileName}`;
    const { error } = await supabase.storage
      .from('fotos')
      .upload(path, blob, { upsert: false, contentType: blob.type || 'application/octet-stream' });
    if (error) { console.warn('[stories] upload falhou', error); return null; }
    const { data } = supabase.storage.from('fotos').getPublicUrl(path);
    return data.publicUrl;
  } catch { return null; }
}

async function insertRemoteStory(story: Story, url: string): Promise<void> {
  try {
    await supabase.from('stories_demo').insert({
      id: story.id,
      username: story.username,
      kind: story.kind,
      url,
      text: story.text || null,
      duration: story.duration,
      created_at: story.createdAt,
    });
  } catch {}
}

async function deleteRemoteStory(id: string): Promise<void> {
  try { await supabase.from('stories_demo').delete().eq('id', id); } catch {}
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
  localStorage.setItem(REACT_KEY(storyId), JSON.stringify(r));
  window.dispatchEvent(new CustomEvent('papo-story-react-updated', { detail: storyId }));
}

// Checa se um vídeo tem trilha de áudio. Combina três heurísticas pra cobrir os
// principais navegadores (Firefox/Safari/Chrome). Se nenhuma souber responder,
// assume que tem (`true`) — assim não atrapalha o fluxo normal.
async function checkVideoHasAudio(file: File): Promise<boolean> {
  return new Promise((res) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.src = url;
    v.muted = true;
    v.playsInline = true;
    v.onloadedmetadata = () => {
      const w = v as any;
      // Firefox
      if (typeof w.mozHasAudio === 'boolean') {
        URL.revokeObjectURL(url);
        return res(w.mozHasAudio);
      }
      // Padrão: audioTracks
      const t = w.audioTracks;
      if (t && typeof t.length === 'number') {
        URL.revokeObjectURL(url);
        return res(t.length > 0);
      }
      // Safari/Chrome — força decode brevemente
      if (typeof w.webkitAudioDecodedByteCount === 'number') {
        v.play().then(() => {
          setTimeout(() => {
            const has = (v as any).webkitAudioDecodedByteCount > 0;
            try { v.pause(); } catch {}
            URL.revokeObjectURL(url);
            res(has);
          }, 250);
        }).catch(() => { URL.revokeObjectURL(url); res(true); });
        return;
      }
      URL.revokeObjectURL(url);
      res(true);
    };
    v.onerror = () => { URL.revokeObjectURL(url); res(true); };
  });
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

// Divide um vídeo em pedaços de até maxSec usando MediaRecorder.
// Cada pedaço é um Blob WebM independente, próprio pra virar um story separado.
async function splitVideo(file: File, maxSec = 30): Promise<{ blob: Blob; duration: number }[]> {
  const total = await probeVideoDuration(file);
  if (total <= maxSec + 0.5) return [{ blob: file, duration: total }];

  // Detecta um mimeType suportado
  let mime = 'video/webm';
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c)) {
      mime = c; break;
    }
  }

  const sourceUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.src = sourceUrl;
  video.muted = false;       // precisa estar unmuted para o captureStream pegar o áudio
  video.volume = 1;
  video.playsInline = true;
  (video as any).preservesPitch = false;

  await new Promise<void>((res, rej) => {
    video.onloadedmetadata = () => res();
    video.onerror = () => rej(new Error('Falha ao carregar vídeo'));
  });

  // captureStream pode não estar disponível no Safari antigo
  const captureFn = (video as any).captureStream || (video as any).mozCaptureStream;
  if (!captureFn) {
    URL.revokeObjectURL(sourceUrl);
    throw new Error('Seu navegador não suporta divisão automática de vídeo. Corte para até 30s e tente novamente.');
  }

  const chunks: { blob: Blob; duration: number }[] = [];
  let start = 0;

  while (start < total - 0.05) {
    const length = Math.min(maxSec, total - start);

    // Posiciona o playback no início do trecho
    await new Promise<void>(res => {
      const onSeeked = () => { video.removeEventListener('seeked', onSeeked); res(); };
      video.addEventListener('seeked', onSeeked);
      video.currentTime = start;
    });

    const stream: MediaStream = captureFn.call(video);

    // Garante que TODAS as trilhas (vídeo + áudio) estejam ativas no stream antes de gravar.
    // Em alguns navegadores a trilha de áudio só vira disponível quando o elemento começa a tocar.
    if (stream.getAudioTracks().length === 0) {
      // Tenta novamente depois de iniciar o play — em alguns navegadores a trilha
      // só aparece após o video estar tocando.
      const playPromise = video.play();
      try { await playPromise; } catch {}
      // Pequeno delay pra trilha de áudio aparecer
      await new Promise<void>(r => setTimeout(r, 60));
    }

    const recorder = new MediaRecorder(stream, { mimeType: mime });
    const buf: Blob[] = [];
    recorder.ondataavailable = e => { if (e.data && e.data.size > 0) buf.push(e.data); };
    const stopped = new Promise<void>(res => { recorder.onstop = () => res(); });

    recorder.start(250);
    try { await video.play(); } catch {}

    await new Promise<void>(res => setTimeout(res, Math.ceil(length * 1000) + 80));

    try { recorder.stop(); } catch {}
    video.pause();
    await stopped;

    chunks.push({ blob: new Blob(buf, { type: mime }), duration: length });
    start += length;
  }

  URL.revokeObjectURL(sourceUrl);
  return chunks;
}

// ───── Componente Strip ─────
interface StoriesProps {
  currentUser?: string;
  compact?: boolean;
  dark?: boolean;
  fotoPerfil?: string;
}

export function Stories({ currentUser, compact, dark, fotoPerfil }: StoriesProps) {
  const [stories, setStories] = useState<Story[]>([]);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [posting, setPosting] = useState(false);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [composer, setComposer] = useState<{ file: File; url: string; kind: 'image' | 'video'; duration: number; parts?: { blob: Blob; duration: number }[] } | null>(null);
  const [splitting, setSplitting] = useState(false);
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
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
        remoteThumbs[r.id] = r.url;
        return {
          id: r.id,
          username: r.username,
          kind: r.kind,
          blobKey: '__remote__:' + r.url, // marca que o conteúdo é remoto
          duration: r.duration,
          text: r.text,
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
      // 3) une — local tem prioridade quando o id já existe
      const localIds = new Set(fresh.map(s => s.id));
      const merged: Story[] = [
        ...fresh,
        ...remoteStories.filter(r => !localIds.has(r.id)),
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
    const interval = window.setInterval(syncAndPurge, 60 * 1000);
    window.addEventListener('papo-stories-updated', syncAndPurge);
    return () => {
      cancelled = true;
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
        if (s.blobKey.startsWith('__remote__:')) {
          thumbsRef.current[s.id] = s.blobKey.slice('__remote__:'.length);
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

  async function handleFile(file: File) {
    if (!currentUser) { alert('Faça login para postar um story.'); return; }
    const isImg = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImg && !isVideo) { alert('Envie uma imagem ou vídeo.'); return; }
    if (file.size > 200 * 1024 * 1024) { alert('Arquivo muito grande (máx 200MB).'); return; }

    let duration = 5;
    let parts: { blob: Blob; duration: number }[] | undefined;
    if (isVideo) {
      // Checa se o vídeo tem áudio — alerta o usuário se vier mudo.
      const hasAudio = await checkVideoHasAudio(file).catch(() => true);
      if (!hasAudio) {
        const proceed = confirm(
          'Atenção: este vídeo não tem áudio.\n\n' +
          'Pode ser que o microfone estivesse desligado, o sistema esteja silenciando aplicativos, ' +
          'ou o vídeo foi salvo sem trilha sonora.\n\nDeseja postar mesmo assim sem som?'
        );
        if (!proceed) return;
      }
      const d = await probeVideoDuration(file).catch(() => 0);
      if (d > 30.5) {
        const confirmed = confirm(`Vídeo de ${d.toFixed(1)}s — vamos dividir em ${Math.ceil(d / 30)} stories de até 30 segundos. Continuar?`);
        if (!confirmed) return;
        setSplitting(true);
        try {
          parts = await splitVideo(file, 30);
        } catch (e: any) {
          alert(e?.message || 'Falha ao dividir o vídeo. Corte para 30s e tente novamente.');
          setSplitting(false);
          return;
        }
        setSplitting(false);
        duration = parts[0]?.duration || 30;
      } else {
        duration = d || 5;
      }
    }

    // Preview: se foi dividido, mostra o primeiro pedaço; senão mostra o arquivo original
    const previewBlob = parts ? parts[0].blob : file;
    const url = URL.createObjectURL(previewBlob);
    setComposer({ file, url, kind: isVideo ? 'video' : 'image', duration, parts });
  }

  async function publishComposer(text: string) {
    if (!composer || !currentUser) return;
    setPosting(true);
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

      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const ext = segments.length > 1 ? 'webm' : (composer.file.name.split('.').pop() || 'bin');
        const blobKey = `${currentUser}__${ts}_${i}_${rand}__${baseName}.${ext}`;
        await putBlob(blobKey, seg.blob);
        const labelN = segments.length > 1 ? ` (${i + 1}/${segments.length})` : '';
        const story: Story = {
          id: blobKey,
          username: currentUser,
          kind: composer.kind,
          blobKey,
          duration: seg.duration,
          text: captionTrim ? `${captionTrim}${labelN}` : (labelN ? labelN.trim() : undefined),
          createdAt: new Date(ts + i).toISOString(),
        };
        // Cada story é gravado individualmente — NUNCA sobrescreve os existentes.
        await saveOne(story);
        newStories.push(story);

        // Sync com Supabase: upload do blob + insert na tabela stories_demo.
        // Roda em paralelo (sem await) para não bloquear a UI.
        (async () => {
          const fileName = blobKey.replace(/[^a-zA-Z0-9._-]/g, '_');
          const publicUrl = await uploadStoryBlob(seg.blob, fileName);
          if (publicUrl) await insertRemoteStory(story, publicUrl);
        })();
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

  const sz = compact ? 40 : 64;       // diâmetro do círculo
  const badge = compact ? 14 : 20;    // botão +
  const labelSize = compact ? '8px' : '10px';
  const wrapPad = compact ? 'py-0' : 'py-3';
  const wrapPx = compact ? '' : 'px-3 sm:px-4';
  const gap = compact ? 'gap-1.5' : 'gap-3';

  // cores adaptam ao tema
  const labelColor = dark ? 'rgba(255,255,255,0.78)' : '#57534e';
  const labelSecondaryColor = dark ? 'rgba(255,255,255,0.45)' : '#a8a29e';
  const innerBorder = dark ? '2px solid #0a0a0b' : '2px solid #fafaf7';
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
      if (idx >= 0) { setViewerIndex(idx); return; }
    }
    // Caso contrário, abre o menu de upload
    setShowUploadMenu(true);
  }

  return (
    <div className={`${wrapPx} ${wrapPad} flex-1 min-w-0`}>
      <div className={`flex items-center ${gap} overflow-x-auto papo-story-strip`} style={{ scrollbarWidth: 'none' }}>
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
                background: ownBucket
                  ? 'linear-gradient(135deg, #b8896a 0%, #5a7a52 100%)'
                  : 'linear-gradient(135deg, #5a7a52 0%, #b8896a 100%)',
                padding: ownBucket ? 2 : 0,
                fontSize: compact ? 11 : 14,
              }}
            >
              <div
                className="relative flex items-center justify-center text-white font-bold overflow-hidden"
                style={{
                  width: '100%', height: '100%',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #5a7a52 0%, #b8896a 100%)',
                  border: ownBucket ? innerBorder : '2px solid #ffffff',
                }}
              >
                {ownBucket && thumbs[ownBucket.latest.id] ? (
                  ownBucket.latest.kind === 'video' ? (
                    <video src={thumbs[ownBucket.latest.id]} muted playsInline preload="metadata"
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                  ) : (
                    <img src={thumbs[ownBucket.latest.id]} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                  )
                ) : (
                  renderOwnAvatarInner()
                )}
              </div>
            </div>
            {/* Badge "+" sempre visível (estilo Instagram) — abre o menu de upload */}
            <span
              onClick={e => { e.stopPropagation(); if (!posting && !splitting) setShowUploadMenu(true); }}
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
              className="uppercase font-semibold max-w-[68px] truncate"
              style={{ fontFamily: '"Source Serif 4", Georgia, serif', letterSpacing: '0.1em', fontSize: labelSize, color: labelColor }}
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
          return (
            <button
              key={latest.username}
              onClick={() => setViewerIndex(idx)}
              className="flex flex-col items-center gap-0.5 flex-shrink-0"
              title={`@${latest.username}`}
            >
              <div
                className="flex items-center justify-center"
                style={{
                  width: sz, height: sz,
                  borderRadius: '50%',
                  aspectRatio: '1 / 1',
                  padding: 2,
                  background: 'linear-gradient(135deg, #b8896a 0%, #5a7a52 100%)',
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
                  {thumbs[latest.id] ? (
                    latest.kind === 'video' ? (
                      <video src={thumbs[latest.id]} muted playsInline preload="metadata"
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                    ) : (
                      <img src={thumbs[latest.id]} alt={`@${latest.username}`}
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                    )
                  ) : (
                    latest.kind === 'video'
                      ? <VideoIcon style={{ width: compact ? 12 : 16, height: compact ? 12 : 16 }} />
                      : <span>{latest.username.slice(0, 2).toUpperCase()}</span>
                  )}
                </div>
              </div>
              {!compact && (
                <span
                  className="uppercase font-semibold max-w-[68px] truncate"
                  style={{ fontFamily: '"Source Serif 4", Georgia, serif', letterSpacing: '0.1em', fontSize: labelSize, color: labelColor }}
                >
                  @{latest.username}
                  {all.length > 1 && <span className="ml-0.5" style={{ color: labelSecondaryColor }}>·{all.length}</span>}
                </span>
              )}
            </button>
          );
        })}

        {others.length === 0 && !ownBucket && !compact && (
          <span className="text-xs ml-1" style={{ fontFamily: '"Source Serif 4", Georgia, serif', color: placeholderHint }}>
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
          <p className="text-sm font-semibold" style={{ fontFamily: '"Source Serif 4", Georgia, serif', letterSpacing: '0.06em' }}>
            Dividindo seu vídeo em pedaços de 30 segundos…
          </p>
          <p className="text-xs text-white/60 mt-1">Não feche o app.</p>
        </div>,
        document.body
      )}

      {composer && createPortal(
        <StoryComposer
          src={composer.url}
          kind={composer.kind}
          posting={posting}
          partsCount={composer.parts?.length}
          onCancel={cancelComposer}
          onPost={publishComposer}
        />,
        document.body
      )}

      {viewerIndex !== null && createPortal(
        <StoryViewer
          stories={flatViewerList}
          startIndex={viewerIndex}
          currentUser={currentUser}
          onClose={() => setViewerIndex(null)}
          onDelete={async (id) => {
            const target = stories.find(x => x.id === id);
            if (target && !target.blobKey.startsWith('__remote__:')) {
              try { await delBlob(target.blobKey); } catch {}
            }
            try { await deleteOne(id); } catch {}
            try { await deleteRemoteStory(id); } catch {}
            setStories(prev => prev.filter(x => x.id !== id));
            setViewerIndex(null);
          }}
        />,
        document.body
      )}
    </div>
  );
}

// ───── Composer ─────
function StoryComposer({ src, kind, posting, partsCount, onCancel, onPost }: {
  src: string;
  kind: 'image' | 'video';
  posting: boolean;
  partsCount?: number;
  onCancel: () => void;
  onPost: (text: string) => void;
}) {
  const [text, setText] = useState('');
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
            independente do teclado virtual. */}
        <div
          className="flex items-center justify-between px-3 py-2.5 gap-2 flex-shrink-0 z-20"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: '#000' }}
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
              style={{ fontFamily: '"Source Serif 4", Georgia, serif', letterSpacing: '0.06em' }}
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
            onClick={() => onPost(text)}
            disabled={posting}
            className="px-4 py-2 rounded-full text-white font-bold text-xs disabled:opacity-50 flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, #5a7a52 0%, #b8896a 100%)',
              fontFamily: '"Source Serif 4", Georgia, serif',
              letterSpacing: '0.14em',
            }}
          >
            {posting ? 'Postando…' : 'Postar →'}
          </button>
        </div>

        {/* Preview — flex-1 com min-h-0 para encolher quando o teclado abre. */}
        <div className="flex-1 min-h-0 relative flex items-center justify-center overflow-hidden">
          {kind === 'video' ? (
            <video src={src} autoPlay loop muted playsInline className="max-w-full max-h-full" />
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
                fontFamily: '"Source Serif 4", Georgia, serif',
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

        {/* Caption — somente o textarea fica embaixo; o botão de postar já está no topo. */}
        <div
          className="p-3 bg-black flex flex-col gap-1.5 flex-shrink-0"
          style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
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
    </div>
  );
}

// ───── Viewer fullscreen ─────
interface ViewerProps {
  stories: Story[];
  startIndex: number;
  currentUser?: string;
  onClose: () => void;
  onDelete: (id: string) => void;
}

function StoryViewer({ stories, startIndex, currentUser, onClose, onDelete }: ViewerProps) {
  const [idx, setIdx] = useState(startIndex);
  const [url, setUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  // Preferência de áudio persistida — começa SEM mudo (com som). Se o navegador
  // bloquear o autoplay com som, fazemos fallback para mudo automaticamente.
  const [muted, setMuted] = useState<boolean>(() => {
    try { return localStorage.getItem('papo_stories_muted') === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('papo_stories_muted', muted ? '1' : '0'); } catch {}
  }, [muted]);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [reactions, setReactions] = useState<StoryReactions>({ likes: [], comments: [] });
  const [commentText, setCommentText] = useState('');
  const [showComments, setShowComments] = useState(false);
  const [paused, setPaused] = useState(false);

  const current = stories[idx];

  // Carrega reações ao mudar de story
  useEffect(() => {
    if (!current) return;
    setReactions(loadReactions(current.id));
    setCommentText('');
    setShowComments(false);
  }, [current?.id]);

  // Pausa o auto-advance enquanto comentários abertos ou input em foco
  useEffect(() => {
    setPaused(showComments);
  }, [showComments]);

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
  }

  function sendComment() {
    if (!current || !currentUser || !commentText.trim()) return;
    const r = loadReactions(current.id);
    const c: StoryComment = {
      id: `sc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      user: currentUser,
      text: commentText.trim(),
      createdAt: new Date().toISOString(),
    };
    const next: StoryReactions = { ...r, comments: [...r.comments, c] };
    saveReactions(current.id, next);
    setReactions(next);
    setCommentText('');
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

  // Tenta tocar com SOM. Se o navegador bloquear (autoplay policy),
  // cai pra mudo automaticamente para o vídeo conseguir tocar.
  useEffect(() => {
    if (current?.kind !== 'video') return;
    const v = videoRef.current;
    if (!v || !url) return;
    v.muted = muted;
    v.volume = 1;
    const tryPlay = async () => {
      try { await v.play(); }
      catch {
        // Autoplay com som bloqueado — força mudo e tenta de novo.
        if (!v.muted) {
          v.muted = true;
          setMuted(true);
          try { await v.play(); } catch {}
        }
      }
    };
    tryPlay();
  }, [url, current?.id, muted]);

  // Avanço automático — pausa quando estiver com comentários abertos.
  useEffect(() => {
    if (!current || !url || paused) return;
    const totalMs = Math.max(1, current.duration) * 1000;
    startRef.current = performance.now() - progress * totalMs; // retoma do ponto atual
    const tick = (t: number) => {
      const p = Math.min(1, (t - startRef.current) / totalMs);
      setProgress(p);
      if (p >= 1) advance();
      else rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, url, paused]);

  function advance() {
    if (idx + 1 < stories.length) setIdx(idx + 1);
    else onClose();
  }
  function back() {
    if (idx > 0) setIdx(idx - 1);
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

  return (
    <div
      className="fixed inset-0 z-[100000] bg-black flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md h-full sm:max-h-[92vh] sm:rounded-2xl overflow-hidden"
        style={{ background: '#000' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Barras de progresso */}
        <div
          className="absolute left-2 right-2 flex gap-1 z-10"
          style={{ top: 'calc(env(safe-area-inset-top) + 8px)' }}
        >
          {stories.map((_, i) => (
            <div key={i} className="flex-1 h-0.5 rounded-full bg-white/30 overflow-hidden">
              <div
                className="h-full bg-white"
                style={{ width: i < idx ? '100%' : i === idx ? `${progress * 100}%` : '0%' }}
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
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
              style={{ background: 'linear-gradient(135deg, #5a7a52, #b8896a)' }}
            >
              {current.username.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="text-white text-sm font-semibold">@{current.username}</p>
              <p className="text-white/70 text-[10px]">{new Date(current.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isOwn && (
              <button
                onClick={() => { if (confirm('Apagar este story?')) onDelete(current.id); }}
                className="text-white/80 hover:text-red-400 text-xs font-bold px-2 py-1"
              >
                Apagar
              </button>
            )}
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center">
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        {/* Conteúdo */}
        <div className="absolute inset-0 flex items-center justify-center">
          {!url ? (
            <span className="text-white/70 text-sm">Carregando…</span>
          ) : current.kind === 'video' ? (
            <video
              ref={videoRef}
              src={url}
              autoPlay
              playsInline
              muted={muted}
              className="max-w-full max-h-full"
            />
          ) : (
            <img src={url} alt="" className="max-w-full max-h-full object-contain" />
          )}
        </div>

        {/* Botão de áudio — só para vídeos. Toque pra ligar/desligar o som. */}
        {current.kind === 'video' && url && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMuted(m => !m);
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
              fontFamily: '"Source Serif 4", Georgia, serif',
              fontSize: 15,
              fontWeight: 600,
              lineHeight: 1.3,
              letterSpacing: '0.02em',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              textShadow: '0 1px 2px rgba(0,0,0,0.5)',
            }}
          >
            {current.text}
          </div>
        )}

        {/* Áreas de toque para avançar/voltar — ficam ACIMA do conteúdo MAS abaixo
            da barra de reações para que o tap no like/coment não avance o story. */}
        <button
          onClick={(e) => { e.stopPropagation(); back(); }}
          className="absolute left-0 z-30"
          style={{ background: 'transparent', top: 'calc(env(safe-area-inset-top) + 56px)', bottom: 'calc(env(safe-area-inset-bottom) + 72px)', width: '33%' }}
          aria-label="Anterior"
        />
        <button
          onClick={(e) => { e.stopPropagation(); advance(); }}
          className="absolute right-0 z-30"
          style={{ background: 'transparent', top: 'calc(env(safe-area-inset-top) + 56px)', bottom: 'calc(env(safe-area-inset-bottom) + 72px)', width: '67%' }}
          aria-label="Próximo"
        />

        {/* Setas visíveis (fallback explícito) */}
        {idx > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); back(); }}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-40 w-9 h-9 rounded-full flex items-center justify-center text-white"
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.25)' }}
            aria-label="Story anterior"
          >
            ‹
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); advance(); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-40 w-9 h-9 rounded-full flex items-center justify-center text-white"
          style={{
            background: 'rgba(0,0,0,0.45)',
            backdropFilter: 'blur(6px)',
            border: '1px solid rgba(255,255,255,0.25)',
            fontSize: 22, lineHeight: 1, fontWeight: 700,
          }}
          aria-label="Próximo story"
        >
          ›
        </button>

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
                       style={{ background: 'linear-gradient(135deg, #5a7a52 0%, #b8896a 100%)' }}>
                    {c.user.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs">
                      <span className="font-semibold text-white">@{c.user}</span>{' '}
                      <span className="text-white/85">{c.text}</span>
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
                  background: 'linear-gradient(135deg, #5a7a52 0%, #b8896a 100%)',
                  fontFamily: '"Source Serif 4", Georgia, serif',
                  letterSpacing: '0.14em',
                }}
              >
                Enviar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
