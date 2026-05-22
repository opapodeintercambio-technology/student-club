import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Flag, Ban, GraduationCap, UserCircle2, MessageCircle, Plane, Clock, Heart, Send } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ReportModal } from './ReportModal';
import { getStudentProfile, fetchStudentProfile, type StudentProfile } from './studentProfile';
import { findCountry } from './countries';
import { fetchFriendCountRemote, fetchFollowersCountRemote } from './friends';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import { MediaLightboxWrapper } from './ImageLightbox';

interface UserPostComment {
  id: string;
  user: string;
  fotoPerfil?: string;
  text: string;
  createdAt: string;
  /** Lista de usernames que curtiram este comentario (array de strings). */
  likes?: string[];
}

interface UserPost {
  id: string;
  text: string | null;
  image: string | null;
  video: string | null;
  created_at: string;
  likes?: string[] | null;
  comments?: UserPostComment[] | null;
}

interface ArchivedStory {
  id: string;
  kind: 'image' | 'video';
  url: string;
  created_at: string;
}

interface UserProfileModalProps {
  username: string;
  currentUser?: string;
  onClose: () => void;
  onBlocked?: () => void;
  onChat?: (username: string) => void;
}

// Cache de trip (origem/destino) por username. Persistente durante a
// sessao. Antes a primeira abertura do popup mostrava EUA (state inicial
// 'US') ate o banco responder. Agora: 2a abertura em diante eh
// instantanea + a 1a abertura mostra null/oculto ate ter dado real.
type TripCache = { origem: string | null; destino: string | null };
const TRIP_CACHE = new Map<string, TripCache>();

/**
 * Permite componentes externos (SearchUsers, FriendsDrawer, ChatPanel,
 * etc) pre-popularem o cache quando ja tem o dado em maos — aceleram
 * abertura do modal pra INSTANTANEA, sem nem o flash de loading.
 */
export function primeUserTripCache(username: string, trip: { origem: string | null; destino: string | null }) {
  if (!username) return;
  TRIP_CACHE.set(username, trip);
}

function avatarColor(username: string): [string, string] {
  const COLORS: [string, string][] = [
    ['#7c3aed', '#ede9fe'], ['#f97316', '#fff7ed'], ['#ec4899', '#fdf2f8'],
    ['#10b981', '#ecfdf5'], ['#3b82f6', '#eff6ff'], ['#f59e0b', '#fffbeb'],
    ['#06b6d4', '#ecfeff'], ['#8b5cf6', '#f5f3ff'],
  ];
  let h = 0;
  for (let i = 0; i < username.length; i++) h = (h * 31 + username.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function UserProfileModal({ username, currentUser, onClose, onBlocked, onChat }: UserProfileModalProps) {
  useLockBodyScroll(true);
  const [showReport, setShowReport] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [posts, setPosts] = useState<UserPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const isOwnProfile = currentUser === username;

  const handleBlock = async () => {
    if (!currentUser) return;
    setBlocking(true);
    try {
      await supabase.from('usuarios_bloqueados').insert({
        bloqueador: currentUser,
        bloqueado: username,
      });
      onBlocked?.();
      onClose();
    } catch {
      // Pode já existir; silencia
      onBlocked?.();
      onClose();
    } finally {
      setBlocking(false);
    }
  };

  const [fotoPerfil, setFotoPerfil] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [postsCount, setPostsCount] = useState<number>(0);
  const [friendsCount, setFriendsCount] = useState<number>(0);
  const [followingCount, setFollowingCount] = useState<number>(0);
  const [student, setStudent] = useState<StudentProfile>(() => getStudentProfile(username));
  // Dados da viagem do user (countdown)
  const [dataIntercambio, setDataIntercambio] = useState<string | null>(null);
  const [bio, setBio] = useState<string>('');
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>({});
  const [wallpaperUrl, setWallpaperUrl] = useState<string | null>(null);
  const [jaNoIntercambio, setJaNoIntercambio] = useState<boolean>(false);
  const [paisAtual, setPaisAtual] = useState<string | null>(null);
  // Stories arquivados (todos que o user ja postou)
  const [archivedStories, setArchivedStories] = useState<ArchivedStory[]>([]);
  const [storyOpen, setStoryOpen] = useState<ArchivedStory | null>(null);
  // Modal de conexoes do user (lista amigos + seguidores)
  const [showConnections, setShowConnections] = useState(false);
  const [showCoursesModal, setShowCoursesModal] = useState(false);
  // Ref pra rolar ate o card de midia (Fotos/Videos/Stories) quando user
  // clica no stat "Interacoes".
  const mediaSectionRef = useRef<HTMLDivElement>(null);
  const [connections, setConnections] = useState<Array<{ username: string; nome: string | null; foto_perfil: string | null; relation: 'amigo' | 'seguidor' }>>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(false);
  useEffect(() => {
    if (!showConnections) return;
    setConnectionsLoading(true);
    (async () => {
      try {
        const [friendsRes, followersRes] = await Promise.all([
          supabase.from('friends_demo').select('friend').eq('owner', username),
          supabase.from('follows_demo').select('follower').eq('followed', username),
        ]);
        const friendList = ((friendsRes.data as any[]) || []).map(r => ({ username: r.friend, relation: 'amigo' as const }));
        const followerList = ((followersRes.data as any[]) || []).map(r => ({ username: r.follower, relation: 'seguidor' as const }));
        // Dedup mantendo prioridade pra amigo
        const map = new Map<string, { username: string; relation: 'amigo' | 'seguidor' }>();
        for (const c of [...friendList, ...followerList]) {
          if (!map.has(c.username)) map.set(c.username, c);
        }
        const usernames = [...map.keys()];
        if (usernames.length === 0) { setConnections([]); setConnectionsLoading(false); return; }
        const usersRes = await supabase.from('usuarios').select('username,nome,foto_perfil').in('username', usernames);
        const byName = new Map<string, any>();
        (usersRes.data as any[] || []).forEach(u => byName.set(u.username, u));
        const final = usernames.map(u => {
          const meta = byName.get(u) || {};
          const base = map.get(u)!;
          return { username: u, nome: meta.nome ?? null, foto_perfil: meta.foto_perfil ?? null, relation: base.relation };
        }).sort((a, b) => a.username.localeCompare(b.username));
        setConnections(final);
      } catch {}
      setConnectionsLoading(false);
    })();
  }, [showConnections, username]);
  const [postOpen, setPostOpen] = useState<UserPost | null>(null);
  const [activeMediaTab, setActiveMediaTab] = useState<'fotos' | 'videos' | 'stories'>('fotos');
  const [commentDraft, setCommentDraft] = useState('');
  const [savingComment, setSavingComment] = useState(false);

  // Like inline no modal de post — atualiza optimistic + persiste no banco.
  // Mantem postOpen e posts sincronizados pra UI refletir imediatamente.
  const toggleLikeOnOpenedPost = async () => {
    if (!postOpen || !currentUser) return;
    const cur = postOpen.likes ?? [];
    const has = cur.includes(currentUser);
    const next = has ? cur.filter(u => u !== currentUser) : [...cur, currentUser];
    const updated = { ...postOpen, likes: next };
    setPostOpen(updated);
    setPosts(prev => prev.map(p => p.id === postOpen.id ? updated : p));
    try { await supabase.from('feed_posts').update({ likes: next }).eq('id', postOpen.id); } catch {}
  };

  // Toggle de like em um comentario individual. Atualiza optimistic +
  // persiste no banco (substitui a array comments inteira em feed_posts).
  const toggleLikeOnComment = async (commentId: string) => {
    if (!postOpen || !currentUser) return;
    const nextComments = (postOpen.comments ?? []).map(c => {
      if (c.id !== commentId) return c;
      const curLikes = c.likes ?? [];
      const has = curLikes.includes(currentUser);
      return { ...c, likes: has ? curLikes.filter(u => u !== currentUser) : [...curLikes, currentUser] };
    });
    const updated = { ...postOpen, comments: nextComments };
    setPostOpen(updated);
    setPosts(prev => prev.map(p => p.id === postOpen.id ? updated : p));
    try { await supabase.from('feed_posts').update({ comments: nextComments }).eq('id', postOpen.id); } catch {}
  };

  const addCommentOnOpenedPost = async () => {
    const txt = commentDraft.trim();
    if (!txt || !postOpen || !currentUser || savingComment) return;
    setSavingComment(true);
    const newComment: UserPostComment = {
      id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      user: currentUser,
      text: txt,
      createdAt: new Date().toISOString(),
    };
    const nextComments = [...(postOpen.comments ?? []), newComment];
    const updated = { ...postOpen, comments: nextComments };
    setPostOpen(updated);
    setPosts(prev => prev.map(p => p.id === postOpen.id ? updated : p));
    setCommentDraft('');
    try { await supabase.from('feed_posts').update({ comments: nextComments }).eq('id', postOpen.id); } catch {}
    setSavingComment(false);
  };

  const mediaSwipeRef = useRef<{ x: number; y: number } | null>(null);
  // Deriva listas filtradas
  const fotoPosts = useMemo(() => posts.filter(p => !!p.image && !p.video), [posts]);
  const videoPosts = useMemo(() => posts.filter(p => !!p.video), [posts]);
  // Tick pra atualizar countdown a cada minuto
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  // Calcula countdown formatado (dias, horas, minutos)
  const countdown = useMemo(() => {
    if (!dataIntercambio || jaNoIntercambio) return null;
    const target = new Date(dataIntercambio).getTime();
    const diff = target - nowTick;
    if (diff <= 0) return null;
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    return { days, hours, minutes };
  }, [dataIntercambio, jaNoIntercambio, nowTick]);
  // origem/destino: lidos do BANCO (usuarios.origem/destino), nao do
  // localStorage. localStorage so tem dados do user LOGADO, ao olhar
  // perfil do outro caia no fallback 'US' e mostrava sempre EUA.
  // Estrategia:
  //  - Inicia com cache em memoria (instantaneo, sem flash) OU null
  //    (oculta bandeiras ate o fetch responder).
  //  - Apos load completo, se vier vazio do banco, usa fallback 'BR'/'US'
  //    so na renderizacao (nao no state) -> sempre mostra bandeira pra
  //    user existente, mas sem flash de EUA na primeira abertura.
  const cached = TRIP_CACHE.get(username);
  const [origemCode, setOrigemCode] = useState<string | null>(cached?.origem ?? null);
  const [destinoCode, setDestinoCode] = useState<string | null>(cached?.destino ?? null);
  // Quando loading termina, usa fallback BR/US se ainda for null (user
  // existe mas nao preencheu origem/destino). Antes do load, mantem
  // null pra renderizacao decidir ocultar.
  const origem = origemCode ? findCountry(origemCode) : null;
  const destino = destinoCode ? findCountry(destinoCode) : null;

  const [bg, fg] = avatarColor(username);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setPostsLoading(true);
      try {
        // 1) Tenta achar user direto por username (inclui bio + social_links)
        let userRow = (await supabase.from('usuarios')
          .select('id, foto_perfil, data_intercambio, ja_no_intercambio, pais_atual, bio, social_links, wallpaper_url, origem, destino')
          .eq('username', username).maybeSingle()).data as any;
        // 2) Se nao achar (rename), busca user_id via username_history
        if (!userRow) {
          // FIX BUG: .or() do PostgREST quebra com usernames que tem
          // caracteres especiais (ponto, virgula). Usa 2 queries .eq()
          // paralelas e pega a mais recente.
          const [byOld, byNew] = await Promise.all([
            supabase.from('username_history').select('user_id, changed_at')
              .eq('old_username', username).order('changed_at', { ascending: false }).limit(1).maybeSingle(),
            supabase.from('username_history').select('user_id, changed_at')
              .eq('new_username', username).order('changed_at', { ascending: false }).limit(1).maybeSingle(),
          ]);
          const dOld = byOld.data as any; const dNew = byNew.data as any;
          const winner = (dOld && dNew)
            ? (new Date(dOld.changed_at) >= new Date(dNew.changed_at) ? dOld : dNew)
            : (dOld || dNew);
          const hist = { data: winner };
          if (hist.data?.user_id) {
            userRow = (await supabase.from('usuarios')
              .select('id, foto_perfil, data_intercambio, ja_no_intercambio, pais_atual, bio, social_links, wallpaper_url, origem, destino')
              .eq('id', hist.data.user_id).maybeSingle()).data as any;
          }
        }
        // Lista de usernames historicos do mesmo user_id — usado pra buscar
        // posts/stories que ficaram com nome antigo.
        const allUsernames = new Set<string>([username]);
        if (userRow?.id) {
          const histAll = await supabase
            .from('username_history')
            .select('old_username, new_username')
            .eq('user_id', userRow.id);
          (histAll.data as any[] || []).forEach(r => {
            if (r.old_username) allUsernames.add(r.old_username);
            if (r.new_username) allUsernames.add(r.new_username);
          });
        }
        const usernameList = Array.from(allUsernames);

        const [postsRes, profile, friends, followers, postsList, storiesList] = await Promise.all([
          supabase.from('feed_posts').select('id', { count: 'exact', head: true }).in('username', usernameList),
          fetchStudentProfile(username),
          fetchFriendCountRemote(username),
          fetchFollowersCountRemote(username),
          supabase.from('feed_posts')
            .select('id, text, image_url, video_url, created_at, likes, comments')
            .in('username', usernameList)
            .order('created_at', { ascending: false })
            .limit(60),
          supabase.from('stories_demo')
            .select('id, kind, url, created_at')
            .in('username', usernameList)
            .order('created_at', { ascending: false })
            .limit(60),
        ]);
        // Reusa userRow no shape esperado pelo handler abaixo
        const userRes: any = { data: userRow };
        if (!cancelled) {
          if (userRes.data) {
            setFotoPerfil((userRes.data as any).foto_perfil ?? null);
            setDataIntercambio((userRes.data as any).data_intercambio ?? null);
            setBio((userRes.data as any).bio ?? '');
            setSocialLinks((userRes.data as any).social_links ?? {});
            setWallpaperUrl((userRes.data as any).wallpaper_url ?? null);
            const o = (userRes.data as any).origem ?? null;
            const d = (userRes.data as any).destino ?? null;
            setOrigemCode(o);
            setDestinoCode(d);
            // Cache pra proximas aberturas serem instantaneas (sem flash).
            TRIP_CACHE.set(username, { origem: o, destino: d });
            setJaNoIntercambio(!!(userRes.data as any).ja_no_intercambio);
            setPaisAtual((userRes.data as any).pais_atual ?? null);
          }
          setPostsCount(postsRes.count ?? 0);
          setStudent(profile);
          setFriendsCount(friends);
          setFollowingCount(followers);
          // Mapeia image_url + video_url (cols DB) → image/video (campos UserPost).
          setPosts(((postsList.data as any[]) || []).map(r => ({
            id: r.id,
            text: r.text,
            image: r.image_url ?? null,
            video: r.video_url ?? null,
            created_at: r.created_at,
            likes: r.likes ?? [],
            comments: Array.isArray(r.comments) ? r.comments : [],
          })));
          setArchivedStories(((storiesList.data as any[]) || []).map(r => ({
            id: r.id,
            kind: r.kind,
            url: r.url,
            created_at: r.created_at,
          })));
          setPostsLoading(false);
        }
      } catch {}
      finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [username]);

  // Swipe-from-left-edge pra fechar: faixa fina (16px) sobre a borda
  // esquerda captura o gesto inicial. Antes os handlers ficavam no
  // wrapper inteiro -> bloqueavam o scroll vertical do conteudo.
  // Agora so a faixa absorve touches; resto da tela rola normal.
  const edgeSwipe = useRef<{ x0: number; y0: number; active: boolean } | null>(null);
  const [edgeDx, setEdgeDx] = useState(0);

  return (
    <div
      className="fixed inset-0 bg-white overflow-y-auto"
      style={{
        zIndex: 9999,
        paddingBottom: 'env(safe-area-inset-bottom)',
        transform: edgeDx > 0 ? `translateX(${edgeDx}px)` : undefined,
        transition: edgeSwipe.current?.active ? 'none' : 'transform 0.18s ease-out',
      }}
    >
      {/* Faixa invisivel na borda esquerda — captura swipe-to-close
          sem afetar scroll do resto da tela. z-[60] fica acima do
          conteudo mas abaixo do menu dropdown (z-30). */}
      <div
        className="fixed left-0 top-0 bottom-0 w-4"
        style={{ zIndex: 60 }}
        onTouchStart={(e) => {
          if (e.touches.length !== 1) return;
          edgeSwipe.current = { x0: e.touches[0].clientX, y0: e.touches[0].clientY, active: true };
        }}
        onTouchMove={(e) => {
          if (!edgeSwipe.current?.active) return;
          const dx = e.touches[0].clientX - edgeSwipe.current.x0;
          const dy = Math.abs(e.touches[0].clientY - edgeSwipe.current.y0);
          if (dy > Math.abs(dx)) { edgeSwipe.current.active = false; setEdgeDx(0); return; }
          if (dx > 0) setEdgeDx(dx);
        }}
        onTouchEnd={() => {
          if (edgeSwipe.current?.active && edgeDx > 80) onClose();
          else setEdgeDx(0);
          edgeSwipe.current = null;
        }}
      />
      <div
        className="bg-white w-full max-w-2xl mx-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header — estilo "pagina inteira" (sticky no topo, com botao Voltar
            e bg-white solido + paddingTop safe-area pra cobrir notch sem
            deixar conteudo aparecer atras. */}
        <div
          className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 sticky bg-white z-10"
          style={{
            top: 0,
            paddingTop: 'calc(env(safe-area-inset-top) + 12px)',
          }}
        >
          <button
            onClick={onClose}
            className="w-9 h-9 -ml-1 flex items-center justify-center rounded-full active:scale-90 transition-transform"
            aria-label="Voltar"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#262626" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h2 className="font-bold text-gray-800 text-base truncate flex-1">{username}</h2>
          {/* Menu '...' — opcoes Denunciar / Bloquear (so se nao for proprio perfil) */}
          {currentUser && !isOwnProfile && (
            <div className="relative">
              <button
                onClick={() => setMoreMenuOpen(o => !o)}
                className="w-9 h-9 flex items-center justify-center rounded-full active:scale-90 transition-transform"
                aria-label="Mais opções"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#262626"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
              </button>
              {moreMenuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMoreMenuOpen(false)} />
                  <div className="absolute right-0 top-10 z-40 w-44 rounded-xl overflow-hidden shadow-xl"
                    style={{ background: '#fff', border: '1px solid #e5e7eb' }}>
                    <button
                      onClick={() => { setMoreMenuOpen(false); setShowReport(true); }}
                      className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left text-sm hover:bg-orange-50 transition-colors"
                      style={{ color: '#ea580c' }}
                    >
                      <Flag className="w-4 h-4" /> Denunciar
                    </button>
                    <button
                      onClick={() => { setMoreMenuOpen(false); setConfirmBlock(true); }}
                      className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left text-sm hover:bg-red-50 transition-colors border-t border-gray-100"
                      style={{ color: '#dc2626' }}
                    >
                      <Ban className="w-4 h-4" /> Bloquear
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* WALLPAPER de fundo — banner full-width ALTO (220px) com a foto
            de perfil CENTRALIZADA dentro dele. Quando nao tem wallpaper,
            gradient sutil. Nome + bandeiras aparecem abaixo. */}
        <div className="relative w-full" style={{ height: 220 }}>
          {wallpaperUrl ? (
            <img src={wallpaperUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #deede5 0%, #f4f6f4 100%)' }} />
          )}
          {/* Overlay sutil pra dar contraste na foto sobre wallpapers claros */}
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 50%, rgba(0,0,0,0.18) 100%)' }} />
          {/* Avatar centralizado verticalmente dentro do banner */}
          <div className="absolute inset-0 flex items-center justify-center">
            {fotoPerfil ? (
              <button
                type="button"
                onClick={() => setPhotoOpen(true)}
                className="block group"
                aria-label="Ver foto em tamanho grande"
                title="Clique para ampliar"
              >
                <img
                  src={fotoPerfil}
                  alt={username}
                  className="w-28 h-28 rounded-full object-cover ring-4 ring-white shadow-xl transition-transform group-hover:scale-105 group-active:scale-95"
                />
              </button>
            ) : (
              <div
                className="w-28 h-28 rounded-full flex items-center justify-center font-bold text-3xl ring-4 ring-white shadow-xl"
                style={{ background: bg, color: fg }}
              >
                {username.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>
        </div>

        <div className="px-5 pt-5 pb-5 space-y-5">
          {/* Nome + bandeiras abaixo do banner (avatar ja foi renderizado
              centralizado dentro do wallpaper acima). */}
          <div className="flex flex-col items-center gap-3">
            <div className="text-center">
              <p className="font-bold text-gray-900 text-lg">{username}</p>
              {/* Bandeiras:
                  - Durante load (loading=true) E sem cache -> oculta
                    (evita flash de "EUA" antes do fetch).
                  - Apos load: usa fallback BR/US se o banco retornou
                    vazio (user existe mas nao preencheu trip). */}
              {(!loading || (origem && destino)) && (
                <div className="text-sm text-stone-500 mt-1 flex items-center justify-center gap-1">
                  <span className="text-base">{(origem || findCountry('BR')).flag}</span>
                  <span className="text-xs">→</span>
                  <span className="text-base">{(destino || findCountry('US')).flag}</span>
                </div>
              )}
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8 text-gray-400 text-sm">Carregando…</div>
          ) : (
            <>
              {/* Bio + links sociais — estilo Instagram. Bio em cima, chips
                  de redes sociais abaixo (cada chip eh um <a target=_blank>). */}
              {bio && (
                <p className="text-sm text-stone-700 whitespace-pre-wrap leading-snug px-1">{bio}</p>
              )}
              {Object.values(socialLinks).some(v => v) && (
                <div className="flex flex-wrap gap-1.5">
                  {([
                    ['instagram', '📷 Instagram'],
                    ['tiktok', '🎵 TikTok'],
                    ['youtube', '▶ YouTube'],
                    ['linkedin', '💼 LinkedIn'],
                    ['other', '🔗 Link'],
                  ] as const).map(([k, label]) => {
                    const raw = (socialLinks[k] || '').trim();
                    if (!raw) return null;
                    const href = /^https?:\/\//i.test(raw)
                      ? raw
                      : k === 'instagram' ? `https://instagram.com/${raw.replace(/^@/, '')}`
                      : k === 'tiktok'    ? `https://tiktok.com/@${raw.replace(/^@/, '')}`
                      : k === 'youtube'   ? `https://youtube.com/@${raw.replace(/^@/, '')}`
                      : k === 'linkedin'  ? `https://linkedin.com/in/${raw.replace(/^@/, '')}`
                      : `https://${raw}`;
                    return (
                      <a
                        key={k}
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 rounded-full text-[11px] font-semibold active:scale-95 transition-transform"
                        style={{ background: '#deede5', color: '#1e714a', border: '1px solid #1e714a' }}
                      >
                        {label}
                      </a>
                    );
                  })}
                </div>
              )}

              {/* Stats: Interacoes (fotos + videos + stories) | Conexoes.
                  Antes era "Posts" contando so feed_posts.
                  Interacoes clicavel -> rola ate a secao Fotos/Videos/Stories. */}
              <div className="grid grid-cols-2 bg-stone-50 rounded-2xl py-3">
                <button
                  type="button"
                  onClick={() => {
                    mediaSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  disabled={(fotoPosts.length + videoPosts.length + archivedStories.length) === 0}
                  className="flex flex-col items-center active:scale-95 transition-transform disabled:opacity-60 disabled:cursor-default"
                >
                  <span className="text-xl font-extrabold text-stone-800 leading-none">{fotoPosts.length + videoPosts.length + archivedStories.length}</span>
                  <span className="text-[11px] text-stone-500 mt-1">Interações</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowConnections(true)}
                  className="flex flex-col items-center border-l border-stone-200 active:scale-95 transition-transform"
                  aria-label="Ver conexões"
                >
                  <span className="text-xl font-extrabold text-stone-800 leading-none">{friendsCount + followingCount}</span>
                  <span className="text-[11px] text-stone-500 mt-1 underline-offset-2 hover:underline">Conexões</span>
                </button>
              </div>

              {/* Botao: Enviar mensagem (sempre disponivel se nao for proprio perfil) */}
              {currentUser && !isOwnProfile && onChat && (
                <button
                  onClick={() => { onChat(username); onClose(); }}
                  className="w-full py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-colors"
                  style={{ background: '#1e714a', color: '#fff', fontFamily: '"DM Sans", system-ui, sans-serif', letterSpacing: '0.08em' }}
                >
                  <MessageCircle className="w-4 h-4" />
                  Enviar mensagem
                </button>
              )}

              {/* Countdown da viagem (so se a data foi setada e ainda nao chegou) */}
              {countdown && (
                <div
                  className="rounded-2xl p-3.5 flex items-center gap-3"
                  style={{
                    background: 'linear-gradient(135deg, rgba(249,115,22,0.08) 0%, rgba(249,115,22,0.02) 100%)',
                    border: '1px solid rgba(249,115,22,0.22)',
                  }}
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#f97316' }}>
                    <Plane className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-orange-700 font-semibold">Faltam para o intercâmbio</p>
                    <p className="text-base font-bold text-stone-800 leading-tight">
                      {countdown.days > 0 && <>{countdown.days}<span className="text-xs font-medium text-stone-500"> dia{countdown.days !== 1 ? 's' : ''}</span></>}
                      {countdown.days > 0 && (countdown.hours > 0 || countdown.minutes > 0) && <span className="text-stone-400"> · </span>}
                      {countdown.hours > 0 && <>{countdown.hours}<span className="text-xs font-medium text-stone-500">h</span> </>}
                      {countdown.minutes > 0 && <>{countdown.minutes}<span className="text-xs font-medium text-stone-500">min</span></>}
                    </p>
                  </div>
                </div>
              )}
              {/* Ja em intercambio: mostra pais atual */}
              {jaNoIntercambio && paisAtual && (
                <div
                  className="rounded-2xl p-3.5 flex items-center gap-3"
                  style={{
                    background: 'linear-gradient(135deg, rgba(30,113,74,0.08) 0%, rgba(30,113,74,0.02) 100%)',
                    border: '1px solid rgba(30,113,74,0.22)',
                  }}
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#1e714a' }}>
                    <Clock className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-emerald-800 font-semibold">Já em intercâmbio</p>
                    <p className="text-base font-bold text-stone-800 leading-tight">{paisAtual}</p>
                  </div>
                </div>
              )}

              {/* Stats: compras Papo Store + cursos de intercâmbio */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-stone-50 rounded-2xl p-3 text-center">
                  <span className="text-xl block mb-0.5">🛍️</span>
                  <p className="text-2xl font-bold text-stone-800">{student.comprasStore}</p>
                  <p className="text-[11px] text-stone-500 font-medium leading-tight">Compras na Papo Store</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCoursesModal(true)}
                  disabled={(student.cursosIntercambio + (dataIntercambio ? 1 : 0)) === 0}
                  className="bg-stone-50 rounded-2xl p-3 text-center active:scale-95 transition-transform disabled:opacity-60 disabled:cursor-default"
                >
                  <span className="text-xl block mb-0.5">🎓</span>
                  {/* Cursos de intercambio: +1 se o user tem data_intercambio
                      preenchida (intercambio em andamento conta como curso).
                      Clicavel -> abre modal com detalhes do curso. */}
                  <p className="text-2xl font-bold text-stone-800">{student.cursosIntercambio + (dataIntercambio ? 1 : 0)}</p>
                  <p className="text-[11px] text-stone-500 font-medium leading-tight">Cursos de intercâmbio</p>
                </button>
              </div>

              {/* Escola + Consultor */}
              <div className="space-y-2">
                <div className="bg-white rounded-2xl px-4 py-3 border border-stone-200 flex items-start gap-3">
                  <GraduationCap className="w-5 h-5 text-stone-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">Escola</p>
                    <p className="text-sm font-semibold text-stone-800 truncate">{student.escola || '—'}</p>
                  </div>
                </div>
                <div className="bg-white rounded-2xl px-4 py-3 border border-stone-200 flex items-start gap-3">
                  <UserCircle2 className="w-5 h-5 text-stone-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">Consultor</p>
                    <p className="text-sm font-semibold text-stone-800 truncate">{student.consultor || '—'}</p>
                  </div>
                </div>
              </div>

              {/* Tabs: FOTOS / VÍDEOS / STORIES (estilo Instagram)
                  + Swipe horizontal pra trocar entre tabs.
                  ref usado pelo stat "Interacoes" pra rolar ate aqui. */}
              <div
                ref={mediaSectionRef}
                style={{ scrollMarginTop: 80 }}
                onTouchStart={e => {
                  (mediaSwipeRef.current as any) = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                }}
                onTouchEnd={e => {
                  const s = mediaSwipeRef.current;
                  if (!s) return;
                  mediaSwipeRef.current = null;
                  const t = e.changedTouches[0];
                  const dx = t.clientX - s.x;
                  const dy = Math.abs(t.clientY - s.y);
                  if (Math.abs(dx) < 60 || dy > Math.abs(dx) * 0.7) return;
                  const order: Array<'fotos' | 'videos' | 'stories'> = ['fotos', 'videos', 'stories'];
                  const idx = order.indexOf(activeMediaTab);
                  const next = dx < 0 ? Math.min(order.length - 1, idx + 1) : Math.max(0, idx - 1);
                  if (next !== idx) setActiveMediaTab(order[next]);
                }}
              >
                <div className="flex gap-1 mb-2 border-b border-stone-200">
                  {([
                    { key: 'fotos',   label: `Fotos · ${fotoPosts.length}` },
                    { key: 'videos',  label: `Vídeos · ${videoPosts.length}` },
                    { key: 'stories', label: `Stories · ${archivedStories.length}` },
                  ] as const).map(t => {
                    const active = activeMediaTab === t.key;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setActiveMediaTab(t.key)}
                        className="flex-1 py-2 text-[11px] font-bold transition-colors relative"
                        style={{
                          color: active ? '#1e714a' : '#a8a29e',
                          letterSpacing: '0.04em',
                        }}
                      >
                        {t.label}
                        {active && (
                          <span className="absolute bottom-[-1px] left-0 right-0 h-[2px]" style={{ background: '#1e714a' }} />
                        )}
                      </button>
                    );
                  })}
                </div>
                {postsLoading ? (
                  <div className="grid grid-cols-3 gap-1">
                    {[0,1,2,3,4,5].map(i => (
                      <div key={i} className="aspect-square bg-stone-100 animate-pulse rounded-md" />
                    ))}
                  </div>
                ) : (() => {
                  const empty = (label: string) => (
                    <div className="text-center py-6 text-stone-400 text-xs bg-stone-50 rounded-2xl">{label}</div>
                  );
                  if (activeMediaTab === 'fotos') {
                    if (fotoPosts.length === 0) return empty('Nenhuma foto postada ainda.');
                    return (
                      <div className="grid grid-cols-3 gap-1">
                        {fotoPosts.map(p => (
                          <button
                            type="button"
                            key={p.id}
                            onClick={() => setPostOpen(p)}
                            className="aspect-square overflow-hidden bg-stone-100 relative active:scale-95 transition-transform"
                            style={{ borderRadius: 4 }}
                          >
                            <img src={p.image!} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                          </button>
                        ))}
                      </div>
                    );
                  }
                  if (activeMediaTab === 'videos') {
                    if (videoPosts.length === 0) return empty('Nenhum vídeo postado ainda.');
                    return (
                      <div className="grid grid-cols-3 gap-1">
                        {videoPosts.map(p => {
                          const m = (p.video || '').match(/(?:videodelivery\.net|cloudflarestream\.com)\/([a-f0-9-]+)/);
                          const thumb = p.image || (m ? `https://videodelivery.net/${m[1]}/thumbnails/thumbnail.jpg?time=0s&height=300` : '');
                          return (
                            <button
                              type="button"
                              key={p.id}
                              onClick={() => setPostOpen(p)}
                              className="aspect-square overflow-hidden bg-stone-100 relative active:scale-95 transition-transform"
                              style={{ borderRadius: 4 }}
                            >
                              {thumb ? (
                                <img src={thumb} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-stone-400 text-[10px]">vídeo</div>
                              )}
                              <span className="absolute top-1 right-1 text-white text-[9px] px-1 py-0.5 rounded" style={{ background: 'rgba(0,0,0,0.55)' }}>▶</span>
                            </button>
                          );
                        })}
                      </div>
                    );
                  }
                  // stories
                  if (archivedStories.length === 0) return empty('Nenhum story postado ainda.');
                  return (
                    <div className="grid grid-cols-3 gap-1">
                      {archivedStories.map(s => {
                        const m = s.url.match(/(?:videodelivery\.net|cloudflarestream\.com)\/([a-f0-9-]+)/);
                        const thumb = s.kind === 'image' ? s.url : (m ? `https://videodelivery.net/${m[1]}/thumbnails/thumbnail.jpg?time=0s&height=300` : '');
                        return (
                          <button
                            type="button"
                            key={s.id}
                            onClick={() => setStoryOpen(s)}
                            className="aspect-square overflow-hidden bg-stone-100 relative active:scale-95 transition-transform"
                            style={{ borderRadius: 4 }}
                          >
                            {thumb ? (
                              <img src={thumb} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-stone-400 text-[10px]">vídeo</div>
                            )}
                            {s.kind === 'video' && (
                              <span className="absolute top-1 right-1 text-white text-[9px] px-1 py-0.5 rounded" style={{ background: 'rgba(0,0,0,0.55)' }}>▶</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* (Stories agora dentro das tabs acima — junto com Fotos/Videos) */}

              {/* Botoes de Denunciar / Bloquear foram movidos pro menu '...'
                  no header da pagina, a pedido do user (estilo Instagram). */}
              {false && currentUser && !isOwnProfile && (
                <div className="pt-2 border-t border-gray-100 space-y-2">
                  <button onClick={() => setShowReport(true)} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-orange-200 text-orange-600 font-semibold text-sm">
                    <Flag className="w-4 h-4" />Denunciar usuário
                  </button>
                  <button onClick={() => setConfirmBlock(true)} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-red-200 text-red-600 font-semibold text-sm">
                    <Ban className="w-4 h-4" />Bloquear usuário
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modal de denúncia */}
      {showReport && currentUser && (
        <ReportModal
          denunciante={currentUser}
          alvoTipo="usuario"
          alvoId={username}
          alvoNome={`${username}`}
          onClose={() => setShowReport(false)}
        />
      )}

      {/* Modal de conexões do user — lista amigos + seguidores */}
      {showConnections && (
        <div
          className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowConnections(false)}
        >
          <div
            className="bg-white w-full max-w-sm max-h-[80vh] overflow-hidden rounded-3xl flex flex-col shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-800 text-base">Conexões de {username}</h3>
              <button onClick={() => setShowConnections(false)} className="text-gray-400">×</button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2">
              {connectionsLoading ? (
                <div className="py-8 text-center text-gray-400 text-sm">Carregando…</div>
              ) : connections.length === 0 ? (
                <div className="py-8 text-center text-gray-400 text-sm">Nenhuma conexão ainda.</div>
              ) : connections.map(c => (
                <div key={c.username} className="flex items-center gap-3 py-2.5 px-2">
                  <button
                    type="button"
                    onClick={() => {
                      // Abre o perfil dessa conexao — fecha o modal de conexoes
                      // e dispara papo-open-profile (que troca o profileUsername no App).
                      setShowConnections(false);
                      window.dispatchEvent(new CustomEvent('papo-open-profile', { detail: { username: c.username } }));
                    }}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left active:scale-95 transition-transform"
                  >
                    {c.foto_perfil ? (
                      <img src={c.foto_perfil} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-stone-200 flex items-center justify-center text-stone-600 text-sm font-bold flex-shrink-0">
                        {c.username.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{c.username}</p>
                      <p className="text-[10px] text-stone-500 truncate">{c.nome || (c.relation === 'amigo' ? 'Amigo' : 'Seguidor')}</p>
                    </div>
                  </button>
                  {currentUser && c.username !== currentUser && onChat && (
                    <button
                      type="button"
                      onClick={() => { setShowConnections(false); onClose(); onChat(c.username); }}
                      className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors active:scale-90"
                      style={{ background: '#deede5', color: '#1e714a' }}
                      title="Enviar mensagem"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox do post (foto OU video) — abre via thumb da grid.
          MediaLightboxWrapper traz scroll lock + swipe-down pra fechar.
          Inclui interacoes estilo Instagram: like, ver curtidas, comentar. */}
      {postOpen && (
        <MediaLightboxWrapper onClose={() => setPostOpen(null)} zIndex={10003}>
          {/* Botao X removido — fechar so via swipe-down. */}
          <div
            onClick={e => e.stopPropagation()}
            onTouchStart={e => e.stopPropagation()}
            onTouchMove={e => e.stopPropagation()}
            onTouchEnd={e => e.stopPropagation()}
            className="max-w-md w-full px-4 flex flex-col"
            style={{ height: 'calc(100dvh - 80px)' }}
          >
            {/* Midia (cap height pra deixar espaco pros comentarios) */}
            <div className="flex-shrink-0">
              {postOpen.video ? (
                <video src={postOpen.video} controls autoPlay playsInline className="w-full h-auto rounded-2xl max-h-[50vh] bg-black" />
              ) : postOpen.image ? (
                <img src={postOpen.image} alt="" className="w-full h-auto rounded-2xl object-contain max-h-[50vh]" />
              ) : null}
              {postOpen.text && (
                <p className="text-white/90 text-sm mt-2 px-1 leading-relaxed whitespace-pre-wrap">{postOpen.text}</p>
              )}
            </div>

            {/* Barra de acoes: like + contador */}
            <div className="flex items-center gap-4 mt-3 px-1 flex-shrink-0">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); toggleLikeOnOpenedPost(); }}
                className="flex items-center gap-1.5 active:scale-90 transition-transform"
                aria-label={postOpen.likes?.includes(currentUser || '') ? 'Descurtir' : 'Curtir'}
              >
                <Heart
                  className="w-7 h-7"
                  style={{
                    color: postOpen.likes?.includes(currentUser || '') ? '#ef4444' : '#fff',
                    fill: postOpen.likes?.includes(currentUser || '') ? '#ef4444' : 'transparent',
                  }}
                />
                <span className="text-white text-sm font-semibold">{(postOpen.likes ?? []).length}</span>
              </button>
              <div className="flex items-center gap-1.5">
                <MessageCircle className="w-7 h-7 text-white" />
                <span className="text-white text-sm font-semibold">{(postOpen.comments ?? []).length}</span>
              </div>
              <span className="ml-auto text-white/60 text-xs">
                {new Date(postOpen.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
              </span>
            </div>

            {/* Lista de comentarios — flex-1 + min-h-0 garante que ela
                CRESCE pra ocupar espaco mas TAMBEM encolhe (e scrolla)
                quando ha muitos comentarios. Sem min-h-0 o flex-1 nao
                limita altura e a pagina inteira rola. */}
            <div className="mt-3 flex-1 min-h-0 overflow-y-auto px-1 space-y-2" style={{ WebkitOverflowScrolling: 'touch' }}>
              {(postOpen.comments ?? []).length === 0 ? (
                <p className="text-white/40 text-xs italic">Seja o primeiro a comentar</p>
              ) : (
                (postOpen.comments ?? []).map(c => {
                  const cLikes = c.likes ?? [];
                  const iLiked = !!currentUser && cLikes.includes(currentUser);
                  return (
                    <div key={c.id} className="flex items-start gap-2 text-sm">
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-white">{c.user}</span>
                        <span className="text-white/85 break-words ml-1.5">{c.text}</span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); toggleLikeOnComment(c.id); }}
                        className="flex flex-col items-center gap-0.5 flex-shrink-0 active:scale-90 transition-transform pt-0.5"
                        aria-label={iLiked ? 'Descurtir comentario' : 'Curtir comentario'}
                      >
                        <Heart
                          className="w-3.5 h-3.5"
                          style={{
                            color: iLiked ? '#ef4444' : 'rgba(255,255,255,0.6)',
                            fill: iLiked ? '#ef4444' : 'transparent',
                          }}
                          strokeWidth={2.2}
                        />
                        {cLikes.length > 0 && (
                          <span className="text-[9px] text-white/60 leading-none">{cLikes.length}</span>
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Input de comentario */}
            {currentUser && currentUser !== username && (
              <div className="mt-3 flex items-center gap-2 flex-shrink-0 pb-2">
                <input
                  type="text"
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addCommentOnOpenedPost(); } }}
                  placeholder="Adicione um comentário..."
                  className="flex-1 bg-white/10 text-white text-sm px-3 py-2 rounded-full placeholder-white/50 focus:outline-none focus:bg-white/15"
                  onClick={(e) => e.stopPropagation()}
                />
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); addCommentOnOpenedPost(); }}
                  disabled={!commentDraft.trim() || savingComment}
                  className="w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-30 active:scale-95"
                  style={{ background: '#1e714a' }}
                  aria-label="Enviar comentário"
                >
                  <Send className="w-4 h-4 text-white" />
                </button>
              </div>
            )}
          </div>
        </MediaLightboxWrapper>
      )}

      {/* Lightbox do story arquivado — abre quando clica em uma thumb da grid.
          Sem botao X — fechar so via swipe-down. */}
      {storyOpen && (
        <MediaLightboxWrapper onClose={() => setStoryOpen(null)} zIndex={10003}>
          <div onClick={e => e.stopPropagation()} className="max-w-md w-full px-4">
            {storyOpen.kind === 'image' ? (
              <img src={storyOpen.url} alt="" className="w-full h-auto rounded-2xl object-contain max-h-[80vh]" />
            ) : (
              <video src={storyOpen.url} controls autoPlay playsInline className="w-full h-auto rounded-2xl max-h-[80vh] bg-black" />
            )}
            <p className="text-center text-white/60 text-xs mt-3">
              {new Date(storyOpen.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          </div>
        </MediaLightboxWrapper>
      )}

      {/* Lightbox da foto de perfil — abre quando clica no avatar do modal.
          Sem botao X — fechar so via swipe-down. */}
      {photoOpen && fotoPerfil && (
        <MediaLightboxWrapper onClose={() => setPhotoOpen(false)} zIndex={10002} background="rgba(0,0,0,0.9)">
          <img
            src={fotoPerfil}
            alt={username}
            className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain"
            onClick={e => e.stopPropagation()}
          />
        </MediaLightboxWrapper>
      )}

      {/* Modal de detalhes do(s) curso(s) de intercambio do user.
          Abre ao clicar no stat "Cursos de intercambio". Mostra
          "Curso de idiomas em [Pais] na escola [Escola]". */}
      {showCoursesModal && (() => {
        const destinoCountry = destino || findCountry('US');
        const escola = student.escola || 'a definir';
        return (
          <div
            className="fixed inset-0 z-[10001] bg-black/60 flex items-center justify-center p-4"
            onClick={() => setShowCoursesModal(false)}
          >
            <div
              className="bg-white rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wide flex items-center gap-2">
                  <span>🎓</span> Cursos de {username}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowCoursesModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                  aria-label="Fechar"
                >×</button>
              </div>
              <div className="px-5 py-5 space-y-3">
                <div className="flex items-start gap-3 rounded-xl p-3" style={{ background: '#f5f9f6', border: '1px solid #d6e8dc' }}>
                  <span className="text-3xl">{destinoCountry.flag}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-800 leading-tight">
                      Curso de idiomas em {destinoCountry.name}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">
                      Escola: <span className="font-semibold">{escola}</span>
                    </p>
                    {dataIntercambio && (
                      <p className="text-[11px] text-gray-500 mt-1">
                        Embarque: {new Date(dataIntercambio).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Confirmação de bloqueio */}
      {confirmBlock && (
        <div
          className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60"
          style={{
            paddingTop: 'max(16px, calc(env(safe-area-inset-top) + 12px))',
            paddingBottom: 'max(16px, calc(env(safe-area-inset-bottom) + 12px))',
            paddingLeft: 'max(16px, env(safe-area-inset-left))',
            paddingRight: 'max(16px, env(safe-area-inset-right))',
          }}
          onClick={() => setConfirmBlock(false)}
        >
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="w-14 h-14 mx-auto mb-3 bg-red-100 rounded-full flex items-center justify-center">
              <Ban className="w-7 h-7 text-red-600" />
            </div>
            <h3 className="text-center font-bold text-gray-800 mb-2">Bloquear {username}?</h3>
            <p className="text-center text-sm text-gray-500 mb-5">
              Você não verá mais anúncios nem mensagens deste usuário. Ele também não poderá te contatar.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmBlock(false)}
                className="flex-1 py-3 rounded-2xl border-2 border-gray-200 text-gray-700 font-bold text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleBlock}
                disabled={blocking}
                className="flex-1 py-3 rounded-2xl bg-red-500 text-white font-bold text-sm disabled:opacity-50"
              >
                {blocking ? 'Bloqueando...' : 'Bloquear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
