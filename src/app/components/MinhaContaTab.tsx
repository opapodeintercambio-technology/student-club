import { useState, useEffect, useRef } from 'react';
import { User, Mail, Phone, MapPin, Save, Eye, EyeOff, Loader2, Camera, ShieldCheck, Lock, Star, Pencil, Check, X, ArrowRightLeft, Gift, HeartHandshake, Trash2, Heart, MessageCircle as MessageIcon, Play, Copy } from 'lucide-react';
import { HlsVideo } from './HlsVideo';
import { CropImageModal } from './FeedNews';
import { supabase } from '../../lib/supabase';
import { deriveKey, encryptMsg, decryptMsg } from '../utils/chatCrypto';
import { useLang } from '../i18n';
import { CountryPicker } from './CountryPicker';
import { getOrigem, getDestino, setOrigem as saveOrigem, setDestino as saveDestino, hydrateTripFromRemote, getDataIntercambio, findCountry } from './countries';
import { getStudentProfile, setStudentProfile } from './studentProfile';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import { MediaLightboxWrapper } from './ImageLightbox';
import { getFriends, getFollowing, fetchFriendCountRemote, fetchFollowersCountRemote } from './friends';

interface DadosConta {
  nome: string;
  email: string;
  telefone: string;
  endereco: string;
  mostrar_telefone: boolean;
  email_verificado: boolean;
  telefone_verificado: boolean;
  foto_perfil: string;
}

interface MinhaContaTabProps {
  currentUser: string;
  userId: string;
  userEmail: string;
  userNome: string;
  userTelefone: string;
  userEndereco: string;
  userMostrarTelefone: boolean;
  userEmailVerificado: boolean;
  userTelefoneVerificado: boolean;
  fotoPerfil: string;
  scoreMedio?: number;
  totalAvaliacoes?: number;
  trocas?: number;
  doacoesFeitas?: number;
  doacoesRecebidas?: number;
  amostrasDadas?: number;
  amostrasRecebidas?: number;
  verificado?: boolean;
  docEnviado?: boolean;
  onFotoAtualizada?: (url: string) => void;
  onDadosAtualizados?: (d: Partial<DadosConta>) => void;
  onUsernameAtualizado?: (newUsername: string) => void;
  isPJ?: boolean;
  segmento?: string;
  onSegmentoChange?: (s: string) => void;
  /** 'profile' (default): foto + stats + meus posts.
   *  'security': dados pessoais, viagem, alterar senha + excluir conta. */
  view?: 'profile' | 'security';
  /** Callback quando a conta é deletada com sucesso (no view='security'). */
  onAccountDeleted?: () => void;
}

const SEGMENTOS_PJ = [
  'Tecnologia', 'Varejo / Comércio', 'Alimentação', 'Saúde e Bem-estar',
  'Educação', 'Moda e Vestuário', 'Serviços Gerais', 'Construção / Reforma',
  'Transportes / Logística', 'Arte e Design', 'Esportes / Lazer',
  'Beleza / Estética', 'Agricultura / Agronegócio', 'Outros',
];

export function MinhaContaTab({ currentUser, userId, userEmail, userNome, userTelefone, userEndereco, userMostrarTelefone, fotoPerfil, scoreMedio = 0, totalAvaliacoes = 0, trocas = 0, doacoesFeitas = 0, doacoesRecebidas = 0, amostrasDadas = 0, amostrasRecebidas = 0, verificado, docEnviado, onFotoAtualizada, onDadosAtualizados, onUsernameAtualizado, isPJ, segmento, onSegmentoChange, view = 'profile', onAccountDeleted }: MinhaContaTabProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const handleDeleteAccount = async () => {
    if (deleting) return;
    setDeleting(true);
    setDeleteError('');
    try {
      // Chama a RPC que apaga TUDO no banco (anuncios, mensagens, friends_demo,
      // follows_demo, feed_posts, etc) E também remove a row de auth.users.
      const { error } = await supabase.rpc('delete_my_account');
      if (error) throw error;
    } catch (e: any) {
      setDeleting(false);
      setDeleteError('Erro ao excluir: ' + (e?.message || 'tente novamente'));
      return;
    }
    // Limpa cache local e força reload limpo
    try {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('papo_') || k.startsWith('sb-')) localStorage.removeItem(k);
      });
    } catch {}
    await supabase.auth.signOut().catch(() => {});
    onAccountDeleted?.();
    window.location.href = '/';
  };
  const showProfile = view === 'profile';
  const showSecurity = view === 'security';
  const { AT } = useLang();
  const [nome, setNome] = useState(userNome);
  const [telefone, setTelefone] = useState(userTelefone);
  const [endereco, setEndereco] = useState(userEndereco);
  const [mostrarTelefone, setMostrarTelefone] = useState(userMostrarTelefone);
  // Bio e links sociais — estilo Instagram. Carregados do DB no mount.
  const [bio, setBio] = useState<string>('');
  const [socialInstagram, setSocialInstagram] = useState<string>('');
  const [socialTiktok, setSocialTiktok] = useState<string>('');
  const [socialYoutube, setSocialYoutube] = useState<string>('');
  const [socialLinkedin, setSocialLinkedin] = useState<string>('');
  const [socialOther, setSocialOther] = useState<string>('');
  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      try {
        const { data } = await supabase.from('usuarios').select('bio, social_links').eq('username', currentUser).maybeSingle();
        if (data) {
          setBio((data as any).bio || '');
          const sl = (data as any).social_links || {};
          setSocialInstagram(sl.instagram || '');
          setSocialTiktok(sl.tiktok || '');
          setSocialYoutube(sl.youtube || '');
          setSocialLinkedin(sl.linkedin || '');
          setSocialOther(sl.other || '');
        }
      } catch {}
    })();
  }, [currentUser]);
  const saveBioAndSocial = async () => {
    if (!userId) return;
    const social_links = {
      instagram: socialInstagram.trim() || undefined,
      tiktok: socialTiktok.trim() || undefined,
      youtube: socialYoutube.trim() || undefined,
      linkedin: socialLinkedin.trim() || undefined,
      other: socialOther.trim() || undefined,
    };
    try {
      await supabase.from('usuarios').update({ bio: bio.trim() || null, social_links: Object.values(social_links).some(v => v) ? social_links : null }).eq('id', userId);
    } catch {}
  };
  const [studentData, setStudentData] = useState(() => getStudentProfile(currentUser));
  const [escolaInput, setEscolaInput] = useState(() => getStudentProfile(currentUser).escola);
  const [consultorInput, setConsultorInput] = useState(() => getStudentProfile(currentUser).consultor);
  const [studentSaved, setStudentSaved] = useState(false);
  const [studentSaving, setStudentSaving] = useState(false);
  const [studentError, setStudentError] = useState('');
  const saveStudent = async () => {
    if (studentSaving) return;
    setStudentSaving(true);
    setStudentError('');
    // 1) salva local + dispara update no Supabase, AWAIT pra saber se foi
    const ok = await setStudentProfile(currentUser, {
      escola: escolaInput.trim(),
      consultor: consultorInput.trim(),
    });
    // 2) verifica explicitamente se o banco aceitou (RLS / rede / loop pending)
    let remoteOk = false;
    try {
      const { error } = await supabase
        .from('usuarios')
        .update({
          escola: escolaInput.trim() || null,
          consultor: consultorInput.trim() || null,
        })
        .eq('username', currentUser);
      remoteOk = !error;
      if (error) setStudentError('Erro ao salvar no banco: ' + error.message);
    } catch (e: any) {
      setStudentError('Erro de rede: ' + (e?.message || 'tente novamente'));
    }
    setStudentSaving(false);
    if (ok && remoteOk) {
      setStudentData(getStudentProfile(currentUser));
      setStudentSaved(true);
      setTimeout(() => setStudentSaved(false), 2200);
    }
  };
  const studentDirty =
    escolaInput.trim() !== studentData.escola ||
    consultorInput.trim() !== studentData.consultor;

  const [origem, setOrigemLocal] = useState(() => getOrigem(currentUser));
  const [destino, setDestinoLocal] = useState(() => getDestino(currentUser));
  const [tripSaved, setTripSaved] = useState(false);

  // Hidrata origem/destino do Supabase no mount (cross-device)
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    hydrateTripFromRemote(currentUser).then(({ origem: o, destino: d }) => {
      if (cancelled) return;
      if (o) setOrigemLocal(o);
      if (d) setDestinoLocal(d);
    });
    return () => { cancelled = true; };
  }, [currentUser]);

  // Hidrata escola/consultor do Supabase + migração one-shot:
  // se o banco está null mas o local tem valor, faz upload (legacy users).
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('usuarios')
          .select('escola, consultor')
          .eq('username', currentUser)
          .maybeSingle();
        if (cancelled) return;
        const remoteEscola = (data as any)?.escola;
        const remoteConsultor = (data as any)?.consultor;
        const local = getStudentProfile(currentUser);

        // Se remoto tem valor — usa (verdade)
        if (remoteEscola || remoteConsultor) {
          const merged = {
            ...local,
            escola: remoteEscola || local.escola || '',
            consultor: remoteConsultor || local.consultor || '',
          };
          localStorage.setItem(`papo_student_profile_${currentUser}`, JSON.stringify(merged));
          setStudentData(merged);
          setEscolaInput(merged.escola);
          setConsultorInput(merged.consultor);
        } else if (local.escola || local.consultor) {
          // Migração one-shot: local tem dados, remoto vazio → upload
          await supabase.from('usuarios').update({
            escola: local.escola || null,
            consultor: local.consultor || null,
          }).eq('username', currentUser).then(() => {}, () => {});
        }
      } catch { /* silencioso */ }
    })();
    return () => { cancelled = true; };
  }, [currentUser]);

  // ── Estatísticas do perfil + grade dos próprios posts ──────────────────
  type MyPost = {
    id: string;
    image_url: string | null;
    images_urls: string[] | null;
    video_url: string | null;
    text: string;
    likes: string[];
    comments: { id: string; user: string; text: string; createdAt: string }[];
    created_at: string;
  };

  // Deriva URL de thumbnail estatica do Cloudflare Stream a partir de uma
  // URL HLS ou de videodelivery.net. Usado pra exibir preview do video na
  // grade do perfil sem precisar carregar o player inteiro.
  function videoThumbUrl(url: string | null): string | null {
    if (!url) return null;
    const m = url.match(/(?:videodelivery\.net|cloudflarestream\.com)\/([a-f0-9]{16,})/i);
    if (!m) return null;
    return `https://videodelivery.net/${m[1]}/thumbnails/thumbnail.jpg?time=1s&height=480`;
  }
  const [myPosts, setMyPosts] = useState<MyPost[]>([]);
  const [selectedPost, setSelectedPost] = useState<MyPost | null>(null);
  const [postsCount, setPostsCount] = useState<number>(0);
  const [friendsCount, setFriendsCount] = useState<number>(() => getFriends(currentUser).length);
  const [followingCount, setFollowingCount] = useState<number>(() => getFollowing(currentUser).length);
  // Stories da trajetoria do usuario (sem TTL — historico completo)
  const [myStories, setMyStories] = useState<Array<{ id: string; kind: 'image' | 'video'; url: string; created_at: string }>>([]);
  const [selectedStory, setSelectedStory] = useState<{ id: string; kind: 'image' | 'video'; url: string; created_at: string } | null>(null);
  // Tab selecionada na grade de Atividade
  const [activityTab, setActivityTab] = useState<'fotos' | 'videos' | 'stories'>('fotos');
  // Modal de conexoes do user atual (lista amigos + seguidores). Click em
  // cada conexao abre o perfil; botao verde de balao envia mensagem.
  const [showConnections, setShowConnections] = useState(false);
  // BUG FIX: trava o scroll da pagina por baixo quando o modal de conexoes
  // esta aberto — antes a aba "Minha conta" continuava rolando atras com o
  // dedo no iOS (overscroll/scroll chaining).
  useLockBodyScroll(showConnections);
  // Modal de detalhes do(s) curso(s) de intercambio do usuario.
  const [showCoursesModal, setShowCoursesModal] = useState(false);
  // Ref pra rolar ate o card "Minha atividade" (Fotos/Videos/Stories)
  // quando o user clica no stat "Interacoes".
  const activitySectionRef = useRef<HTMLDivElement>(null);
  const [connections, setConnections] = useState<Array<{ username: string; nome: string | null; foto_perfil: string | null; relation: 'amigo' | 'seguidor' }>>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(false);
  useEffect(() => {
    if (!showConnections || !currentUser) return;
    setConnectionsLoading(true);
    (async () => {
      try {
        const [friendsRes, followersRes] = await Promise.all([
          supabase.from('friends_demo').select('friend').eq('owner', currentUser),
          supabase.from('follows_demo').select('follower').eq('followed', currentUser),
        ]);
        const friendList = ((friendsRes.data as any[]) || []).map(r => ({ username: r.friend, relation: 'amigo' as const }));
        const followerList = ((followersRes.data as any[]) || []).map(r => ({ username: r.follower, relation: 'seguidor' as const }));
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
  }, [showConnections, currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    (async () => {
      // Busca posts + stories + contadores remotos em paralelo
      const [postsRes, storiesRes, friendsRemote, followersRemote] = await Promise.all([
        supabase
          .from('feed_posts')
          .select('id, image_url, images_urls, video_url, text, likes, comments, created_at')
          .eq('username', currentUser)
          .order('created_at', { ascending: false })
          .limit(60),
        supabase
          .from('stories_demo')
          .select('id, kind, url, created_at')
          .eq('username', currentUser)
          .order('created_at', { ascending: false })
          .limit(60),
        fetchFriendCountRemote(currentUser),
        fetchFollowersCountRemote(currentUser),
      ]);
      if (cancelled) return;
      setMyPosts(((postsRes.data as any[]) || []).map(r => ({
        id: r.id,
        image_url: r.image_url,
        images_urls: Array.isArray(r.images_urls) && r.images_urls.length > 0 ? r.images_urls : null,
        video_url: r.video_url,
        text: r.text || '',
        likes: Array.isArray(r.likes) ? r.likes : [],
        comments: Array.isArray(r.comments) ? r.comments : [],
        created_at: r.created_at,
      })));
      setMyStories(((storiesRes.data as any[]) || []).map(r => ({
        id: r.id, kind: r.kind, url: r.url, created_at: r.created_at,
      })));
      setPostsCount((postsRes.data as any[] || []).length);
      setFriendsCount(friendsRemote || getFriends(currentUser).length);
      setFollowingCount(followersRemote);
    })();

    const refresh = () => {
      setFriendsCount(getFriends(currentUser).length);
      setFollowingCount(getFollowing(currentUser).length);
    };
    window.addEventListener('papo-friends-updated', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener('papo-friends-updated', refresh);
    };
  }, [currentUser]);
  const [tripError, setTripError] = useState('');
  const handleOrigem = (code: string) => {
    setOrigemLocal(code);
    const ok = saveOrigem(currentUser, code);
    if (ok) { setTripError(''); setTripSaved(true); setTimeout(() => setTripSaved(false), 2000); }
    else setTripError('Não foi possível salvar (armazenamento local indisponível).');
  };
  const handleDestino = (code: string) => {
    setDestinoLocal(code);
    const ok = saveDestino(currentUser, code);
    if (ok) { setTripError(''); setTripSaved(true); setTimeout(() => setTripSaved(false), 2000); }
    else setTripError('Não foi possível salvar (armazenamento local indisponível).');
  };
  const [segmentoLocal, setSegmentoLocal] = useState(segmento || '');
  const [segmentoSaving, setSegmentoSaving] = useState(false);
  const [segmentoOk, setSegmentoOk] = useState(false);
  const [segmentoErr, setSegmentoErr] = useState('');
  useEffect(() => { setSegmentoLocal(segmento || ''); }, [segmento]);

  const SEG_CHANGE_KEY = `papo_segmento_changed_${currentUser}`;
  const lastChangeMs = (() => { const v = Number(localStorage.getItem(SEG_CHANGE_KEY) || 0); return Number.isFinite(v) ? v : 0; })();
  const monthMs = 30 * 24 * 3600 * 1000;
  const elapsed = Date.now() - lastChangeMs;
  const lockedUntil = lastChangeMs > 0 ? lastChangeMs + monthMs : 0;
  const daysLeft = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 86400000));
  const segmentoLocked = lastChangeMs > 0 && elapsed < monthMs;
  const segmentoDirty = !!segmentoLocal && segmentoLocal !== segmento;

  const saveSegmento = async () => {
    if (!segmentoLocal || segmentoLocal === segmento) return;
    if (segmentoLocked) {
      setSegmentoErr(`Você só pode alterar o segmento uma vez por mês. Próxima alteração em ${daysLeft} dia${daysLeft === 1 ? '' : 's'}.`);
      return;
    }
    setSegmentoSaving(true); setSegmentoOk(false); setSegmentoErr('');
    try {
      const { error } = await supabase.from('usuarios').update({ segmento: segmentoLocal }).eq('username', currentUser);
      if (error) throw error;
      onSegmentoChange?.(segmentoLocal);
      localStorage.setItem(SEG_CHANGE_KEY, String(Date.now()));
      setSegmentoOk(true);
      setTimeout(() => setSegmentoOk(false), 2500);
    } catch (e: any) {
      setSegmentoErr(e?.message || 'Falha ao salvar o segmento.');
    }
    setSegmentoSaving(false);
  };
  const [editingUsername, setEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState(currentUser);
  const [usernameError, setUsernameError] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmSenha, setConfirmSenha] = useState('');
  const [showSenha, setShowSenha] = useState(false);
  const [savingSenha, setSavingSenha] = useState(false);
  const [senhaMsg, setSenhaMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const handleAlterarSenha = async () => {
    if (novaSenha.length < 6) { setSenhaMsg({ type: 'err', text: AT.accountPasswordTooShort }); return; }
    if (novaSenha !== confirmSenha) { setSenhaMsg({ type: 'err', text: AT.accountPasswordMismatch }); return; }
    setSavingSenha(true);
    setSenhaMsg(null);
    const { error } = await supabase.auth.updateUser({ password: novaSenha });
    setSavingSenha(false);
    if (error) { setSenhaMsg({ type: 'err', text: AT.accountPasswordError }); return; }
    setSenhaMsg({ type: 'ok', text: AT.accountPasswordSuccess });
    setNovaSenha('');
    setConfirmSenha('');
    setTimeout(() => setSenhaMsg(null), 4000);
  };
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [wallpaperUrl, setWallpaperUrl] = useState<string | null>(null);
  const [uploadingWallpaper, setUploadingWallpaper] = useState(false);
  const wallpaperRef = useRef<HTMLInputElement>(null);
  // dataURL temporario do wallpaper que o user acabou de selecionar — vai
  // pro CropImageModal pra ele ajustar zoom/pan (estilo WhatsApp) antes
  // do upload definitivo.
  const [pendingWallpaperSrc, setPendingWallpaperSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      try {
        const { data } = await supabase.from('usuarios').select('wallpaper_url').eq('username', currentUser).maybeSingle();
        if (data) setWallpaperUrl((data as any).wallpaper_url ?? null);
      } catch {}
    })();
  }, [currentUser]);
  // Wallpaper: limite 80MB (antes era 30MB). Apos selecionar arquivo,
  // abre o CropImageModal pra user ajustar zoom/pan estilo WhatsApp.
  // So depois do confirm que faz upload.
  const onWallpaperChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!userId) {
      alert('Sessão não identificada. Tente recarregar a página.');
      return;
    }
    if (file.size > 80 * 1024 * 1024) {
      alert('Wallpaper muito grande (máx 80MB).');
      return;
    }
    if (!file.type.startsWith('image/')) {
      alert('Selecione uma imagem.');
      return;
    }
    try {
      // Le como dataURL pra passar ao CropImageModal.
      const dataUrl: string = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = () => rej(r.error);
        r.readAsDataURL(file);
      });
      setPendingWallpaperSrc(dataUrl);
    } catch {
      alert('Erro ao ler a imagem.');
    }
  };

  // Apos user confirmar o crop do wallpaper, converte dataURL -> Blob e
  // faz upload pro Supabase Storage.
  const onWallpaperCropConfirm = async (croppedDataUrl: string) => {
    setPendingWallpaperSrc(null);
    if (!userId) { alert('Sessão não identificada.'); return; }
    setUploadingWallpaper(true);
    try {
      try { await supabase.auth.refreshSession(); } catch {}
      // dataURL -> Blob
      const m = croppedDataUrl.match(/^data:(.+?);base64,(.+)$/);
      if (!m) throw new Error('Crop invalido');
      const ct = m[1];
      const bin = atob(m[2]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: ct });
      const ext = ct.split('/')[1] || 'jpg';
      const key = `${userId}/wallpaper_${Date.now()}.${ext}`;
      const up = await supabase.storage.from('fotos').upload(key, blob, {
        contentType: ct,
        cacheControl: '3600',
        upsert: false,
      });
      if (up.error) {
        console.error('[wallpaper] upload falhou:', up.error);
        alert('Erro ao enviar wallpaper: ' + (up.error.message || 'desconhecido'));
        setUploadingWallpaper(false);
        return;
      }
      const { data: pub } = supabase.storage.from('fotos').getPublicUrl(key);
      const publicUrl = pub?.publicUrl;
      if (!publicUrl) {
        alert('Erro ao obter URL pública.');
        setUploadingWallpaper(false);
        return;
      }
      const upd = await supabase.from('usuarios').update({ wallpaper_url: publicUrl }).eq('id', userId);
      if (upd.error) {
        console.error('[wallpaper] update DB falhou:', upd.error);
        alert('Erro ao salvar no perfil: ' + (upd.error.message || 'desconhecido'));
        setUploadingWallpaper(false);
        return;
      }
      setWallpaperUrl(publicUrl);
    } catch (err: any) {
      console.error('[wallpaper] exception:', err);
      alert('Erro inesperado: ' + (err?.message || String(err)));
    }
    setUploadingWallpaper(false);
  };
  const removeWallpaper = async () => {
    if (!userId) return;
    setUploadingWallpaper(true);
    try {
      await supabase.from('usuarios').update({ wallpaper_url: null }).eq('id', userId);
      setWallpaperUrl(null);
    } catch {}
    setUploadingWallpaper(false);
  };
  const fotoRef = useRef<HTMLInputElement>(null);
  // dataURL temporario da foto que o user acabou de selecionar — vai pro
  // CropImageModal pra ele ajustar zoom/pan (estilo Instagram/WhatsApp)
  // antes do upload definitivo pro Supabase Storage.
  const [pendingFotoSrc, setPendingFotoSrc] = useState<string | null>(null);

  // SEMPRE sincroniza state local com props quando elas mudam.
  // O bug anterior bloqueava a 2ª sync (syncedRef), o que fazia os campos
  // ficarem com strings vazias após o fetch do banco — e ao salvar, os "" eram
  // gravados sobrescrevendo o que estava no banco.
  useEffect(() => {
    setNome(userNome || '');
    setTelefone(userTelefone || '');
    setEndereco(userEndereco || '');
    setMostrarTelefone(!!userMostrarTelefone);
  }, [userNome, userTelefone, userEndereco, userMostrarTelefone]);

  // Etapa 1: user escolhe arquivo — lemos como dataURL e abrimos o crop modal.
  // Upload pro Supabase Storage so acontece DEPOIS que o user confirma o crop.
  const handleFotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Selecione uma imagem.'); return; }
    if (file.size > 10 * 1024 * 1024) { alert('Imagem grande demais (máx 10MB).'); return; }
    if (!userId) { alert('Usuário não identificado. Tente novamente.'); return; }
    try {
      const dataUrl: string = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = () => rej(r.error);
        r.readAsDataURL(file);
      });
      setPendingFotoSrc(dataUrl);
    } catch {
      alert('Erro ao ler a imagem.');
    }
  };

  // Etapa 2: user confirmou o crop. Converte dataURL -> Blob, faz upload do
  // recorte (PNG, ja quadrado e dimensionado pelo CropImageModal) e atualiza
  // o foto_perfil no banco.
  const onFotoCropConfirm = async (croppedDataUrl: string) => {
    setPendingFotoSrc(null);
    if (!userId) { alert('Usuário não identificado. Tente novamente.'); return; }
    setUploadingFoto(true);
    try {
      await supabase.auth.refreshSession();
      // dataURL -> Blob (sem fetch pra evitar quirks de CSP em alguns navegadores)
      const m = croppedDataUrl.match(/^data:(.+?);base64,(.+)$/);
      if (!m) throw new Error('Crop invalido');
      const ct = m[1];
      const bin = atob(m[2]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: ct });
      const ext = ct.split('/')[1] || 'png';
      const key = `${userId}/avatar_${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('fotos')
        .upload(key, blob, { contentType: ct });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('fotos').getPublicUrl(key);
      const { error: dbError } = await supabase.from('usuarios')
        .update({ foto_perfil: publicUrl })
        .eq('username', currentUser);
      if (dbError) throw dbError;
      // Propaga pro feed_posts: snapshots antigos com a foto velha (ou
      // vazia) sao atualizados pra refletir a foto nova imediatamente,
      // mesmo pra componentes que leem fp.foto_perfil sem o enrich.
      // Best-effort: falhas aqui nao bloqueiam o update do perfil.
      supabase.from('feed_posts')
        .update({ foto_perfil: publicUrl })
        .eq('username', currentUser)
        .then(() => {}, () => {});
      onFotoAtualizada?.(publicUrl);
    } catch (err: any) {
      alert(`Erro ao enviar foto: ${err?.message || JSON.stringify(err)}`);
    }
    setUploadingFoto(false);
  };

  // ─── (DESATIVADO) Recovery effect ───
  // Mesmo bug do effect em App.tsx: tentava "reparar" convIds e na verdade
  // gerava lixo (achava sequência numérica DENTRO do username e usava como
  // productId, depois fazia .replace destrutivo). Rename de username é
  // tratado abaixo em handleSaveUsername (que atualiza mensagens direto).
  useEffect(() => {
    // noop — ver comentário acima
    return;
  }, [currentUser]);

  const handleSaveUsername = async () => {
    const trimmed = newUsername.trim().toLowerCase().replace(/\s+/g, '_');
    if (!trimmed) { setUsernameError(AT.accountUsernameEmpty); return; }
    if (!/^[a-z0-9_]+$/.test(trimmed)) { setUsernameError(AT.accountUsernameInvalid); return; }
    if (trimmed.length < 3) { setUsernameError(AT.accountUsernameTooShort); return; }
    if (trimmed === currentUser) { setEditingUsername(false); return; }
    if (!userId) {
      setUsernameError('Sessão não identificada. Recarregue a página e tente novamente.');
      return;
    }

    setSavingUsername(true);
    setUsernameError('');

    const { data: exists } = await supabase
      .from('usuarios').select('username').eq('username', trimmed).maybeSingle();
    if (exists) {
      setUsernameError(AT.accountUsernameTaken);
      setSavingUsername(false);
      return;
    }

    // BUG FIX (rename): grava username_history ANTES de tudo. Se qualquer
    // step abaixo falhar, ainda da pra reconstruir o link old->new via
    // username_history (e o nosso resolveCurrentUsername fallback). Antes
    // o INSERT estava no FINAL — se algo no meio quebrava, ficavam
    // mensagens migradas mas SEM registro historico -> conversas perdidas.
    try {
      const { error: histErr } = await supabase.from('username_history').insert({
        user_id: userId,
        old_username: currentUser,
        new_username: trimmed,
      });
      if (histErr) console.warn('[rename] username_history insert falhou:', histErr.message);
    } catch (e) { console.warn('[rename] username_history exception:', e); }

    try {
      await supabase.from('anuncios').update({ username: trimmed }).eq('username', currentUser);
      await supabase.from('matches').update({ product_owner: trimmed }).eq('product_owner', currentUser);
      await supabase.from('matches').update({ from_username: trimmed }).eq('from_username', currentUser);
      await supabase.from('mensagens').update({ remetente: trimmed }).eq('remetente', currentUser);
      const { data: convMsgs } = await supabase
        .from('mensagens').select('conversa_id').ilike('conversa_id', `%${currentUser}%`);
      if (convMsgs) {
        const uniqueIds = [...new Set(convMsgs.map((m: any) => m.conversa_id as string))];
        for (const oldId of uniqueIds) {
          // Grupos: prefix `group__` (com dois underscores). Sem renomear.
          // FIX BUG: antes era `group_` (1 underscore) que NAO matchea, mas
          // mantemos esse prefixo aqui por seguranca extra.
          if (oldId.startsWith('group__') || oldId.startsWith('group_')) continue;
          if (oldId.startsWith('self__')) continue;
          const parts = oldId.split('__');
          let newId: string;
          if (parts.length >= 3 && (parts[0] === currentUser || parts[1] === currentUser)) {
            // Formato canonico: A__B__productId. Troca o nome direto.
            const productId = parts.slice(2).join('__');
            const users = [parts[0], parts[1]].map((u: string) => u === currentUser ? trimmed : u);
            newId = users.sort().join('__') + '__' + productId;
          } else if (oldId.includes(currentUser)) {
            // FIX BUG: convId nao-padrao (ex: `userA__userB_direct__22` do bug
            // historico do "recovery"). Antes era silenciosamente pulado e
            // mensagens ficavam orfas. Agora migra preservando o restante do id.
            newId = oldId.split(currentUser).join(trimmed);
          } else {
            continue;
          }
          if (newId === oldId) continue;

          const { data: msgs } = await supabase
            .from('mensagens').select('id, conteudo').eq('conversa_id', oldId);

          if (msgs && msgs.length > 0) {
            const oldKey = await deriveKey(oldId);
            const newKey = await deriveKey(newId);
            for (const msg of msgs) {
              const plaintext = await decryptMsg(msg.conteudo, oldKey);
              if (plaintext === '[mensagem]') {
                await supabase.from('mensagens')
                  .update({ conversa_id: newId })
                  .eq('id', msg.id);
              } else {
                const newConteudo = await encryptMsg(plaintext, newKey);
                await supabase.from('mensagens')
                  .update({ conversa_id: newId, conteudo: newConteudo })
                  .eq('id', msg.id);
              }
            }
          } else {
            await supabase.from('mensagens').update({ conversa_id: newId }).eq('conversa_id', oldId);
          }
        }
      }
      // Tabelas onde meu username aparece como referencia — atualiza tudo
      // pra que amigos/seguidores/posts/feed/notifs nao percam ligacao.
      //
      // BUG FIX CRITICO: o UPDATE retorna 0 rows sem erro quando RLS
      // bloqueia OU quando o trigger cascade_username_rename crasha
      // (caso real do bug de produção: trigger usava @> jsonb em text[]
      //  e crashava — UPDATE fazia rollback silencioso). Pra detectar
      // isso, pedimos .select() e checamos se voltou linha.
      const { data: updated, error: updErr } = await supabase
        .from('usuarios').update({ username: trimmed }).eq('id', userId).select('username').maybeSingle();
      if (updErr) {
        console.error('[rename] UPDATE usuarios FALHOU:', updErr);
        throw new Error(`Erro ao trocar username: ${updErr.message}`);
      }
      if (!updated || updated.username !== trimmed) {
        // Trigger pode ter crashado silenciosamente (rollback automatico).
        // Confirma lendo direto do banco.
        const { data: check } = await supabase
          .from('usuarios').select('username').eq('id', userId).maybeSingle();
        if (!check || check.username !== trimmed) {
          console.error('[rename] UPDATE retornou OK mas banco continua com nome velho. Trigger crashou?', { check });
          throw new Error('O servidor não confirmou a troca de username. Tente de novo em alguns segundos.');
        }
      }

      // BUG FIX CRITICO (tela branca pos-rename):
      // localStorage.setItem('papo_username') ESTAVA no FINAL da funcao.
      // Se qualquer UPDATE abaixo (friends/follows/etc) crashasse, o
      // setItem NUNCA rodava — o user ficava com cache do nome VELHO no
      // localStorage mas o banco com o nome NOVO. Na proxima abertura,
      // o App carregava perfil pelo nome velho que nao existe -> crash.
      // Agora o localStorage eh atualizado AQUI, logo apos o UPDATE
      // confirmado em usuarios. Mesmo se algo abaixo falhar, o cliente
      // ja esta consistente com o banco.
      try {
        localStorage.setItem('papo_username', trimmed);
        // Atualiza tambem o cache do perfil (papo_profile.username)
        const cached = JSON.parse(localStorage.getItem('papo_profile') || '{}');
        localStorage.setItem('papo_profile', JSON.stringify({ ...cached, username: trimmed }));
      } catch {}
      await supabase.from('friends_demo').update({ owner:  trimmed }).eq('owner',  currentUser).then(() => {}, () => {});
      await supabase.from('friends_demo').update({ friend: trimmed }).eq('friend', currentUser).then(() => {}, () => {});
      await supabase.from('follows_demo').update({ follower: trimmed }).eq('follower', currentUser).then(() => {}, () => {});
      await supabase.from('follows_demo').update({ followed: trimmed }).eq('followed', currentUser).then(() => {}, () => {});
      await supabase.from('feed_posts').update({ username: trimmed }).eq('username', currentUser).then(() => {}, () => {});
      await supabase.from('friend_requests').update({ from_user: trimmed }).eq('from_user', currentUser).then(() => {}, () => {});
      await supabase.from('friend_requests').update({ to_user:   trimmed }).eq('to_user',   currentUser).then(() => {}, () => {});
      await supabase.from('app_notifications').update({ from_user: trimmed }).eq('from_user', currentUser).then(() => {}, () => {});
      await supabase.from('app_notifications').update({ to_user:   trimmed }).eq('to_user',   currentUser).then(() => {}, () => {});
      await supabase.from('stories_demo').update({ username: trimmed }).eq('username', currentUser).then(() => {}, () => {});
      await supabase.from('push_subscriptions').update({ username: trimmed }).eq('username', currentUser).then(() => {}, () => {});

      // (username_history ja foi inserido no INICIO da funcao pra
      // garantir que o registro de rename existe mesmo se algo abaixo
      // falhar — antes ficava no final e podia perder.)

      localStorage.setItem('papo_username', trimmed);
      onUsernameAtualizado?.(trimmed);
      setEditingUsername(false);

      // Dispara eventos pra invalidar caches em outros componentes:
      // - papo-username-renamed: usernameResolver limpa o cache
      // - papo-user-updated: ChatPanel, ChatsTab, UserProfileModal
      //   atualizam display do nome/foto em tempo real
      try {
        window.dispatchEvent(new CustomEvent('papo-username-renamed', {
          detail: { old_username: currentUser, new_username: trimmed, user_id: userId },
        }));
        window.dispatchEvent(new CustomEvent('papo-user-updated', {
          detail: { username: trimmed, old_username: currentUser, foto_perfil: fotoPerfil || null },
        }));
      } catch {}
    } catch (err: any) {
      // BUG FIX: antes setava AT.accountUsernameError generico sem
      // logar o erro real. Agora loga no console pra debug e mostra
      // mensagem mais informativa pro user.
      console.error('[rename] handleSaveUsername falhou:', err);
      setUsernameError((err?.message || AT.accountUsernameError).slice(0, 120));
    }
    setSavingUsername(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    const dados = { nome, telefone, endereco, mostrar_telefone: mostrarTelefone };
    if (!userId) { setSaveError('Usuário não identificado.'); setSaving(false); return; }
    // Upsert por id (auth.uid) — cria a linha se não existir, atualiza se existir
    const { error } = await supabase
      .from('usuarios')
      .upsert({ id: userId, username: currentUser, email: userEmail, ...dados }, { onConflict: 'id' });
    if (error) {
      setSaveError(AT.accountSaveError(error.message));
      setSaving(false);
      return;
    }
    onDadosAtualizados?.(dados);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  // Handler UNIFICADO: salva dados pessoais (handleSave) + escola/consultor
  // (saveStudent, so PF) + segmento (saveSegmento, so PJ) em UMA acao. Antes
  // tinha 3 botoes separados em Seguranca, user reclamou de confusao.
  // Roda em sequencia; se algum falhar, os outros ainda salvam o que der.
  const handleSaveAll = async () => {
    await handleSave();
    if (!isPJ && studentDirty) {
      try { await saveStudent(); } catch { /* erro ja tratado no proprio saveStudent */ }
    }
    if (isPJ && segmentoDirty && !segmentoLocked) {
      try { await saveSegmento(); } catch { /* idem */ }
    }
    // Salva bio + social_links no mesmo botao (so PF)
    try { await saveBioAndSocial(); } catch {}
  };

  const inputClass = 'w-full px-4 py-3 border-2 border-gray-200 rounded-2xl text-sm outline-none focus:border-purple-500 transition-colors bg-white';

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      {/* Título "👤 Minha Conta" removido. */}

      <div className="space-y-4">

        {showProfile && <>
        {/* 1 — Foto + Atividade do aluno.
            Wallpaper agora vive DENTRO do card como banner no topo, e a
            foto de perfil aparece sobreposta (margem negativa) com metade
            no banner e metade no fundo branco — visual Instagram/Facebook.
            Antes wallpaper era um card separado ACIMA do card de atividade,
            ficando visualmente desconectado da foto de perfil. */}
        <div className="glass overflow-hidden" style={{borderRadius:20}}>
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
            <User className="w-4 h-4 text-stone-500" />
            <h3 className="font-bold text-gray-700 text-sm uppercase tracking-wide">Minha atividade</h3>
          </div>
          {/* Banner wallpaper — altura moderada (140px) pra dar espaco
              pros stats abaixo sem sobreposicao. Fallback gradient quando
              o user nao tem wallpaper. */}
          <div className="relative w-full overflow-hidden" style={{ height: 140 }}>
            {wallpaperUrl ? (
              <>
                <img src={wallpaperUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 60%, rgba(0,0,0,0.18) 100%)' }} />
              </>
            ) : (
              <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #deede5, #f4f6f4)' }} />
            )}
          </div>

          {/* Layout estilo Instagram: foto a esquerda (com overlap parcial
              no banner) + stats em linha a direita. Stats NAO ficam mais
              sobrepostos ao wallpaper, vivem no fundo branco abaixo dele. */}
          <div className="px-5 pb-5">
            <div className="flex items-start gap-4">
              {/* Avatar — overlap parcial no banner (marginTop -40) */}
              <div className="relative flex-shrink-0" style={{ marginTop: -40 }}>
                <div className="w-20 h-20 rounded-full overflow-hidden bg-gradient-to-br from-purple-200 to-orange-200 flex items-center justify-center border-4 border-white shadow-lg">
                  {fotoPerfil
                    ? <img src={fotoPerfil} alt="Foto de perfil" className="w-full h-full object-cover" />
                    : <User className="w-8 h-8 text-purple-400" />
                  }
                </div>
                <button
                  onClick={() => {
                    if (!userId) { alert('Carregando sessão… tente em alguns segundos.'); return; }
                    fotoRef.current?.click();
                  }}
                  disabled={uploadingFoto || !userId}
                  className="absolute bottom-0 right-0 w-7 h-7 bg-purple-600 rounded-full flex items-center justify-center shadow-md hover:bg-purple-700 transition-colors border-2 border-white disabled:opacity-60"
                >
                  {uploadingFoto
                    ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                    : <Camera className="w-3.5 h-3.5 text-white" />
                  }
                </button>
              </div>

              {/* Stats em linha (Instagram-style): Interacoes | Conexoes | Cursos */}
              {(() => {
                const fotos = myPosts.filter(p => !!p.image_url).length;
                const videos = myPosts.filter(p => !!p.video_url && !p.image_url).length;
                const interacoes = fotos + videos + myStories.length;
                const cursos = studentData.cursosIntercambio + (getDataIntercambio(currentUser) ? 1 : 0);
                return (
                  <div className="flex-1 flex items-center justify-around pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        activitySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      disabled={interacoes === 0}
                      className="flex flex-col items-center active:scale-95 transition-transform disabled:opacity-60 disabled:cursor-default"
                    >
                      <span className="text-lg font-extrabold text-gray-800 leading-none">{interacoes}</span>
                      <span className="text-[11px] text-gray-500 mt-1">Interações</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowConnections(true)}
                      className="flex flex-col items-center active:scale-95 transition-transform"
                    >
                      <span className="text-lg font-extrabold text-gray-800 leading-none">{friendsCount + followingCount}</span>
                      <span className="text-[11px] text-gray-500 mt-1">Conexões</span>
                    </button>
                    {!isPJ && (
                      <button
                        type="button"
                        onClick={() => setShowCoursesModal(true)}
                        disabled={cursos === 0}
                        className="flex flex-col items-center active:scale-95 transition-transform disabled:opacity-60 disabled:cursor-default"
                      >
                        <span className="text-lg font-extrabold text-gray-800 leading-none">{cursos}</span>
                        <span className="text-[11px] text-gray-500 mt-1">Cursos</span>
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>

            <input ref={fotoRef} type="file" accept="image/*" className="hidden" onChange={handleFotoChange} />

            {/* Compras na Papo Store — card full-width abaixo da linha de stats */}
            {!isPJ && (
              <div className="flex items-center gap-3 bg-white/60 rounded-2xl py-3 px-4 shadow-sm border border-stone-200 mt-4">
                <span className="text-2xl">🛍️</span>
                <div className="flex-1">
                  <span className="text-xl font-extrabold text-gray-800 leading-none block">{studentData.comprasStore}</span>
                  <span className="text-[11px] text-gray-500 leading-tight">Compras na Papo Store</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 1.5 — Minha atividade (tabs Fotos/Videos/Stories).
            Mobile: swipe horizontal na grade troca de tab (Fotos -> Videos -> Stories e vice-versa).
            ref usado pelo stat "Interacoes" pra rolar ate aqui ao clicar. */}
        <div
          ref={activitySectionRef}
          className="glass overflow-hidden"
          style={{borderRadius:20, scrollMarginTop: 80}}
          onTouchStart={(e) => {
            if (e.touches.length !== 1) return;
            (e.currentTarget as any)._swipeStartX = e.touches[0].clientX;
            (e.currentTarget as any)._swipeStartY = e.touches[0].clientY;
          }}
          onTouchEnd={(e) => {
            const startX = (e.currentTarget as any)._swipeStartX;
            const startY = (e.currentTarget as any)._swipeStartY;
            if (startX == null) return;
            const endX = e.changedTouches[0].clientX;
            const endY = e.changedTouches[0].clientY;
            const dx = endX - startX;
            const dy = endY - startY;
            // So considera swipe horizontal (dx > dy) e magnitude > 50px
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
              const tabs: Array<'fotos' | 'videos' | 'stories'> = ['fotos', 'videos', 'stories'];
              const idx = tabs.indexOf(activityTab);
              if (dx < 0 && idx < 2) setActivityTab(tabs[idx + 1]);  // swipe left -> proxima
              if (dx > 0 && idx > 0) setActivityTab(tabs[idx - 1]);  // swipe right -> anterior
            }
            (e.currentTarget as any)._swipeStartX = null;
            (e.currentTarget as any)._swipeStartY = null;
          }}
        >
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
            <span className="text-sm" aria-hidden>📷</span>
            <h3 className="font-bold text-gray-700 text-sm uppercase tracking-wide">Minha atividade</h3>
          </div>
          {/* Tabs — derivadas dos dados em tempo render */}
          {(() => {
            const fotoPosts = myPosts.filter(p => !!p.image_url);
            const videoPosts = myPosts.filter(p => !!p.video_url && !p.image_url);
            return (
              <div className="flex gap-1 px-2 pt-2 border-b border-stone-100">
                {([
                  { key: 'fotos',   label: `Fotos · ${fotoPosts.length}` },
                  { key: 'videos',  label: `Vídeos · ${videoPosts.length}` },
                  { key: 'stories', label: `Stories · ${myStories.length}` },
                ] as const).map(t => {
                  const active = activityTab === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setActivityTab(t.key)}
                      className="flex-1 py-2 text-[11px] font-bold transition-colors relative"
                      style={{ color: active ? '#1e714a' : '#a8a29e', letterSpacing: '0.04em' }}
                    >
                      {t.label}
                      {active && <span className="absolute bottom-[-1px] left-0 right-0 h-[2px]" style={{ background: '#1e714a' }} />}
                    </button>
                  );
                })}
              </div>
            );
          })()}
          <div className="p-2">
            {(() => {
              const fotoPosts = myPosts.filter(p => !!p.image_url);
              const videoPosts = myPosts.filter(p => !!p.video_url && !p.image_url);
              const empty = (msg: string) => (
                <div className="py-10 text-center text-sm text-gray-400">{msg}</div>
              );
              if (activityTab === 'videos') {
                if (videoPosts.length === 0) return empty('Você ainda não publicou nenhum vídeo.');
                return (
                  <div className="grid grid-cols-3 gap-1">
                    {videoPosts.map(p => (
                      <button key={p.id} type="button" onClick={() => setSelectedPost(p)}
                        className="relative aspect-square bg-gray-100 overflow-hidden group" style={{ borderRadius: 6 }}>
                        {videoThumbUrl(p.video_url) ? (
                          <img src={videoThumbUrl(p.video_url) as string} alt="" className="w-full h-full object-cover" loading="lazy" />
                        ) : <div className="w-full h-full bg-black" />}
                        <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center pointer-events-none"
                          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
                          <Play className="w-3.5 h-3.5 text-white" fill="#fff" />
                        </div>
                      </button>
                    ))}
                  </div>
                );
              }
              if (activityTab === 'stories') {
                if (myStories.length === 0) return empty('Você ainda não postou nenhum story.');
                return (
                  <div className="grid grid-cols-3 gap-1">
                    {myStories.map(s => {
                      const m = s.url.match(/(?:videodelivery\.net|cloudflarestream\.com)\/([a-f0-9-]+)/);
                      const thumb = s.kind === 'image' ? s.url : (m ? `https://videodelivery.net/${m[1]}/thumbnails/thumbnail.jpg?time=0s&height=300` : '');
                      return (
                        <button key={s.id} type="button" onClick={() => setSelectedStory(s)}
                          className="relative aspect-square bg-gray-100 overflow-hidden" style={{ borderRadius: 6 }}>
                          {thumb ? (
                            <img src={thumb} alt="" className="w-full h-full object-cover" loading="lazy" />
                          ) : <div className="w-full h-full flex items-center justify-center text-stone-400 text-[10px]">vídeo</div>}
                          {s.kind === 'video' && (
                            <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center pointer-events-none"
                              style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
                              <Play className="w-3.5 h-3.5 text-white" fill="#fff" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              }
              // Default: fotos
              if (fotoPosts.length === 0) return empty('Você ainda não publicou nenhuma foto.');
              return (
                <div className="grid grid-cols-3 gap-1">
                  {fotoPosts.map(p => (
                    <button key={p.id} type="button" onClick={() => setSelectedPost(p)}
                      className="relative aspect-square bg-gray-100 overflow-hidden group"
                      style={{ borderRadius: 6 }} title={p.text.slice(0, 80)}>
                      <img src={p.image_url!} alt="" className="w-full h-full object-cover" loading="lazy" />
                      {p.images_urls && p.images_urls.length >= 2 && (
                        <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center pointer-events-none"
                          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
                          <Copy className="w-3 h-3 text-white" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100">
                        <span className="text-white text-sm font-bold flex items-center gap-1">
                          <Heart className="w-4 h-4" fill="white" /> {p.likes.length}
                        </span>
                        <span className="text-white text-sm font-bold flex items-center gap-1">
                          <MessageIcon className="w-4 h-4" fill="white" /> {p.comments.length}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Configurar perfil — bio + redes sociais (editavel direto na
            Minha Pagina, igual Instagram). Antes ficava em Seguranca. */}
        <div className="glass overflow-hidden" style={{ borderRadius: 20 }}>
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
            <span className="text-sm" aria-hidden>⚙️</span>
            <h3 className="font-bold text-gray-700 text-sm uppercase tracking-wide">Configurar perfil</h3>
          </div>
          <div className="px-5 py-4 space-y-3">
            {/* Wallpaper de fundo do perfil — banner atras da foto */}
            <div>
              <label className="text-xs font-bold text-gray-600 mb-1.5 block ml-1">Wallpaper do perfil</label>
              <div className="relative h-24 rounded-2xl overflow-hidden border border-gray-200 dark:border-stone-700">
                {wallpaperUrl ? (
                  <img src={wallpaperUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  /* Placeholder "Sem wallpaper": gradient claro em light,
                     escuro em dark (antes era hardcoded #deede5/#f4f6f4 ->
                     ficava branco em dark mode, sem contraste com o texto). */
                  <div className="w-full h-full flex items-center justify-center text-xs sc-wallpaper-placeholder">
                    Sem wallpaper
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => wallpaperRef.current?.click()}
                  disabled={uploadingWallpaper}
                  className="absolute bottom-2 right-2 px-3 py-1 rounded-full text-[11px] font-bold bg-white/95 dark:bg-stone-800/95 text-stone-800 dark:text-stone-100 shadow-sm active:scale-95"
                >
                  {uploadingWallpaper ? 'Enviando…' : (wallpaperUrl ? 'Trocar' : 'Adicionar')}
                </button>
                {wallpaperUrl && !uploadingWallpaper && (
                  <button
                    type="button"
                    onClick={removeWallpaper}
                    className="absolute bottom-2 left-2 px-3 py-1 rounded-full text-[11px] font-bold bg-white/95 dark:bg-stone-800/95 text-red-600 dark:text-red-400 shadow-sm active:scale-95"
                  >
                    Remover
                  </button>
                )}
              </div>
              <input ref={wallpaperRef} type="file" accept="image/*" className="hidden" onChange={onWallpaperChange} />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 mb-1.5 block ml-1">Bio</label>
              <textarea
                value={bio}
                onChange={e => setBio(e.target.value.slice(0, 150))}
                placeholder="Fale um pouco sobre você, sua viagem, seus sonhos…"
                rows={3}
                className={inputClass + ' resize-none leading-snug'}
                style={{ minHeight: 80 }}
              />
              <p className="text-[10px] text-gray-400 mt-1 ml-1 text-right">{bio.length}/150</p>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 mb-1.5 block ml-1">Redes sociais</label>
              <div className="space-y-2">
                <input value={socialInstagram} onChange={e => setSocialInstagram(e.target.value)}
                  placeholder="Instagram (ex: @seunome ou https://...)" className={inputClass} />
                <input value={socialTiktok} onChange={e => setSocialTiktok(e.target.value)}
                  placeholder="TikTok" className={inputClass} />
                <input value={socialYoutube} onChange={e => setSocialYoutube(e.target.value)}
                  placeholder="YouTube" className={inputClass} />
                <input value={socialLinkedin} onChange={e => setSocialLinkedin(e.target.value)}
                  placeholder="LinkedIn" className={inputClass} />
                <input value={socialOther} onChange={e => setSocialOther(e.target.value)}
                  placeholder="Outro link (site, portfólio…)" className={inputClass} />
              </div>
            </div>
            <button
              type="button"
              onClick={async () => { await saveBioAndSocial(); }}
              className="w-full py-2.5 rounded-2xl text-sm font-bold text-white active:scale-95 transition-transform"
              style={{ background: '#1e714a' }}
            >
              Salvar bio e redes
            </button>
          </div>
        </div>
        </>}

        {showSecurity && <>
        {/* (DataIntercambioSection foi movida para a aba "Meus Documentos",
            acima da barra Sua Viagem — mantém o controle perto do contexto
            de viagem/checklist em vez de misturar com dados de segurança.) */}

        {/* 2 — Usuário (editável) + Status */}
        <div className="glass overflow-hidden" style={{borderRadius:20}}>
          <div className="px-5 py-4 flex items-center gap-3">
            <User className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-400 font-medium mb-1">{AT.accountUsername}</p>
              {editingUsername ? (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 font-bold">@</span>
                  <input
                    value={newUsername}
                    onChange={e => { setNewUsername(e.target.value); setUsernameError(''); }}
                    className="flex-1 min-w-0 px-2 py-1 border-2 border-purple-400 rounded-xl text-sm font-bold text-gray-700 outline-none"
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveUsername(); if (e.key === 'Escape') { setEditingUsername(false); setNewUsername(currentUser); } }}
                  />
                  <button onClick={handleSaveUsername} disabled={savingUsername}
                    className="w-7 h-7 bg-purple-600 rounded-full flex items-center justify-center flex-shrink-0 hover:bg-purple-700 transition-colors disabled:opacity-50">
                    {savingUsername ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" /> : <Check className="w-3.5 h-3.5 text-white" />}
                  </button>
                  <button onClick={() => { setEditingUsername(false); setNewUsername(currentUser); setUsernameError(''); }}
                    className="w-7 h-7 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0 hover:bg-gray-300 transition-colors">
                    <X className="w-3.5 h-3.5 text-gray-600" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="font-bold text-gray-700">{currentUser}</p>
                  {/* Botao de editar username TRAVADO — alteracao agora so
                      pelo administrador da plataforma. Removido pra evitar
                      bugs de rename + manter consistencia entre conversas. */}
                </div>
              )}
              {usernameError && <p className="text-xs text-red-500 mt-1">{usernameError}</p>}
              {!editingUsername && (
                <p className="text-xs mt-1.5 leading-snug" style={{ color: '#6b7280' }}>
                  🔒 Alteração de nome somente com o administrador da plataforma. Escolha bem o seu username, ele será visto por todos da plataforma!
                </p>
              )}
            </div>
            {/* Selo de verificação ao lado do username removido. */}
          </div>
        </div>

        {/* Nome */}
        <div>
          <label className="text-xs font-bold text-gray-600 mb-1.5 block ml-1">{AT.accountFullName}</label>
          <input value={nome} onChange={e => setNome(e.target.value)}
            placeholder={AT.accountFullNamePlaceholder} className={inputClass} />
        </div>

        {/* (Bio e redes sociais foram movidas pra secao "Configurar perfil"
            dentro de Minha Pagina — view profile. Antes ficavam aqui em
            seguranca, mas o user pediu pra editar direto no perfil.) */}

        {/* Email */}
        <div>
          <label className="text-xs font-bold text-gray-600 mb-1.5 block ml-1">{AT.accountEmail}</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={userEmail} disabled
              className={`${inputClass} pl-10 bg-gray-50 text-gray-500 cursor-not-allowed`} />
          </div>
          <p className="text-xs text-gray-400 mt-1 ml-1">{AT.accountEmailNote2}</p>
        </div>

        {/* Telefone */}
        <div>
          <label className="text-xs font-bold text-gray-600 mb-1.5 block ml-1">{AT.accountPhone}</label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={telefone} onChange={e => setTelefone(e.target.value)}
              placeholder={AT.accountPhonePlaceholder} className={`${inputClass} pl-10`} />
          </div>
          <label className="flex items-center gap-3 mt-2.5 ml-1 cursor-pointer">
            <div onClick={() => setMostrarTelefone(v => !v)}
              className={`w-10 h-5 rounded-full transition-colors flex items-center px-0.5 ${mostrarTelefone ? 'bg-purple-600' : 'bg-gray-300'}`}>
              <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${mostrarTelefone ? 'translate-x-5' : 'translate-x-0'}`} />
            </div>
            <span className="text-xs text-gray-600 font-medium flex items-center gap-1">
              {mostrarTelefone ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              {mostrarTelefone ? AT.accountPhoneVisible : AT.accountPhoneHidden}
            </span>
          </label>
        </div>

        {/* Endereço */}
        <div>
          <label className="text-xs font-bold text-gray-600 mb-1.5 block ml-1">{AT.accountAddress}</label>
          <div className="relative">
            <MapPin className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" />
            <input value={endereco} onChange={e => setEndereco(e.target.value)}
              placeholder={AT.accountAddressPlaceholder} className={`${inputClass} pl-10`} />
          </div>
        </div>

        {/* Escola + Consultor (PF) */}
        {!isPJ && (
          <div>
            <label className="text-xs font-bold text-gray-600 mb-1.5 block ml-1">🎓 Intercâmbio</label>
            <input
              value={escolaInput}
              onChange={e => setEscolaInput(e.target.value)}
              placeholder="Escola onde está inscrito"
              className={`${inputClass} mb-2`}
            />
            <input
              value={consultorInput}
              onChange={e => setConsultorInput(e.target.value)}
              placeholder="Consultor que vendeu o curso"
              className={inputClass}
            />
            <p className="text-xs text-gray-400 ml-1 mt-2">
              Visível para outros alunos no perfil. Salvo junto com o botão "Salvar tudo" abaixo.
            </p>
            {studentError && (
              <p className="text-xs text-red-600 mt-2">{studentError}</p>
            )}
            {studentSaved && (
              <p className="text-xs text-green-600 mt-1">✓ Escola/consultor salvos</p>
            )}
          </div>
        )}

        {/* Viagem: origem e destino */}
        {!isPJ && (
          <div>
            <label className="text-xs font-bold text-gray-600 mb-1.5 block ml-1">✈️ Sua viagem</label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] text-gray-500 ml-1 block mb-1">De onde sai</span>
                <CountryPicker
                  label="País de origem"
                  value={origem}
                  onChange={handleOrigem}
                  className={`${inputClass} flex items-center gap-2 text-left`}
                />
              </div>
              <div>
                <span className="text-[10px] text-gray-500 ml-1 block mb-1">Pra onde vai</span>
                <CountryPicker
                  label="País de destino"
                  value={destino}
                  onChange={handleDestino}
                  className={`${inputClass} flex items-center gap-2 text-left`}
                />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-1 ml-1">
              Define as bandeiras da barra de progresso de documentos na home. Alteração salva automaticamente.
            </p>
            {tripSaved && <p className="text-xs text-green-600 mt-1 ml-1 font-semibold">✓ País salvo</p>}
            {tripError && <p className="text-xs text-red-500 mt-1 ml-1">⚠️ {tripError}</p>}
          </div>
        )}

        {/* Segmento (apenas PJ) */}
        {isPJ && (
          <div>
            <label className="text-xs font-bold text-gray-600 mb-1.5 block ml-1">Segmento da empresa</label>
            <select
              value={segmentoLocal}
              onChange={e => setSegmentoLocal(e.target.value)}
              disabled={segmentoLocked}
              className={`${inputClass} w-full ${segmentoLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <option value="">Selecione…</option>
              {SEGMENTOS_PJ.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {segmentoOk && <p className="text-xs text-green-600 mt-1 ml-1">✓ Segmento salvo</p>}
            {segmentoErr && <p className="text-xs text-red-500 mt-1 ml-1">⚠️ {segmentoErr}</p>}
            <p className="text-xs text-gray-400 mt-1 ml-1">
              Define o filtro do Match IA: só aparecem pedidos da sua área de atuação.
              {segmentoLocked
                ? ` Próxima alteração em ${daysLeft} dia${daysLeft === 1 ? '' : 's'}.`
                : ' Só pode ser alterado uma vez por mês.'}
            </p>
          </div>
        )}

        {/* Botão salvar */}
        {saveError && <p className="text-xs text-red-500 font-medium text-center">⚠️ {saveError}</p>}
        {saved ? (
          <div className="w-full py-3.5 rounded-2xl bg-green-500 text-white font-bold text-center flex items-center justify-center gap-2">
            <ShieldCheck className="w-5 h-5" /> {AT.accountSaved}
          </div>
        ) : (
          // Botao UNICO de salvar tudo — antes haviam 3 (escola/segmento/dados pessoais)
          // cada um em sua secao. Agora handleSaveAll executa todos em sequencia.
          <button onClick={handleSaveAll} disabled={saving || studentSaving || segmentoSaving}
            className="w-full py-3.5 rounded-2xl bg-purple-600 text-white font-bold hover:bg-purple-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
            {(saving || studentSaving || segmentoSaving) ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            {(saving || studentSaving || segmentoSaving) ? AT.accountSaving : 'Salvar tudo'}
          </button>
        )}

        {/* Alterar senha */}
        <div className="border-t border-gray-100 pt-4 mt-2">
          <div className="flex items-center gap-2 mb-3">
            <Lock className="w-4 h-4 text-gray-400" />
            <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">{AT.accountChangePassword}</p>
          </div>
          <div className="space-y-3">
            <div className="relative">
              <input
                type={showSenha ? 'text' : 'password'}
                value={novaSenha}
                onChange={e => setNovaSenha(e.target.value)}
                placeholder={AT.accountNewPassword}
                className={inputClass}
              />
              <button type="button" onClick={() => setShowSenha(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <input
              type={showSenha ? 'text' : 'password'}
              value={confirmSenha}
              onChange={e => setConfirmSenha(e.target.value)}
              placeholder={AT.accountConfirmPassword}
              className={inputClass}
            />
            {senhaMsg && (
              <p className={`text-xs font-medium ${senhaMsg.type === 'ok' ? 'text-green-600' : 'text-red-500'}`}>
                {senhaMsg.type === 'ok' ? '✅' : '⚠️'} {senhaMsg.text}
              </p>
            )}
            <button
              onClick={handleAlterarSenha}
              disabled={savingSenha || !novaSenha || !confirmSenha}
              className="w-full py-3 rounded-2xl bg-gray-800 text-white font-bold hover:bg-gray-900 transition-colors flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {savingSenha ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              {savingSenha ? AT.accountChangingPassword : AT.accountChangePasswordBtn}
            </button>
          </div>
        </div>

        {/* ── ZONA DE PERIGO — sempre o último card da aba Segurança ── */}
        <div className="glass overflow-hidden" style={{borderRadius:24, border:'1.5px solid rgba(239,68,68,0.25)'}}>
          <div className="px-5 py-4 border-b border-red-50 flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-red-400" />
            <h3 className="font-bold text-red-500 text-sm uppercase tracking-wide">Zona de perigo</h3>
          </div>
          <div className="px-5 py-5">
            {!showDeleteConfirm ? (
              <button
                onClick={() => { setShowDeleteConfirm(true); setDeleteError(''); }}
                className="w-full flex items-center justify-between px-5 py-4 rounded-2xl border-2 border-red-200 text-red-500 hover:bg-red-50 transition-colors font-semibold"
              >
                <div className="flex items-center gap-2">
                  <Trash2 className="w-4 h-4" />
                  Excluir minha conta
                </div>
                <span className="text-xs">›</span>
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-red-600 font-medium">
                  Esta ação é irreversível. Todos os seus dados serão removidos
                  permanentemente do servidor: anúncios, mensagens, posts,
                  amizades, fotos e seu perfil de login.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowDeleteConfirm(false); setDeleteError(''); }}
                    disabled={deleting}
                    className="flex-1 py-3 rounded-2xl border-2 border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition-colors disabled:opacity-40"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleting}
                    className="flex-1 py-3 rounded-2xl bg-red-500 text-white font-semibold text-sm hover:bg-red-600 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {deleting ? <><Loader2 className="w-4 h-4 animate-spin" /> Excluindo…</> : 'Sim, excluir tudo'}
                  </button>
                </div>
                {deleteError && <p className="text-xs text-red-600 mt-2">{deleteError}</p>}
              </div>
            )}
          </div>
        </div>
        </>}

      </div>

      {/* Modal "Minhas Conexoes" — lista amigos + seguidores. Click em
          cada item abre o perfil dessa pessoa (que tem botao Enviar msg). */}
      {showConnections && (
        <div className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowConnections(false)}>
          <div className="bg-white w-full max-w-sm max-h-[80vh] overflow-hidden rounded-3xl flex flex-col shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-800 text-base">Minhas conexões</h3>
              <button onClick={() => setShowConnections(false)} className="text-gray-400 text-2xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2">
              {connectionsLoading ? (
                <div className="py-8 text-center text-gray-400 text-sm">Carregando…</div>
              ) : connections.length === 0 ? (
                <div className="py-8 text-center text-gray-400 text-sm">Você ainda não tem conexões.</div>
              ) : connections.map(c => (
                <button
                  key={c.username}
                  type="button"
                  onClick={() => {
                    setShowConnections(false);
                    window.dispatchEvent(new CustomEvent('papo-open-profile', { detail: { username: c.username } }));
                  }}
                  className="w-full flex items-center gap-3 py-2.5 px-2 text-left active:scale-95 transition-transform hover:bg-stone-50 rounded-xl"
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
                  <span className="text-[10px] text-stone-400">Ver perfil →</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox de story selecionado da grade — usa MediaLightboxWrapper
          pra scroll lock + swipe-down-to-close. Sem botao X (fechar so
          arrastando pra baixo). */}
      {selectedStory && (
        <MediaLightboxWrapper onClose={() => setSelectedStory(null)} zIndex={10001}>
          <div onClick={e => e.stopPropagation()} className="max-w-md w-full px-4">
            {selectedStory.kind === 'image' ? (
              <img src={selectedStory.url} alt="" className="w-full h-auto rounded-2xl object-contain max-h-[80vh]" />
            ) : (
              <video src={selectedStory.url} controls autoPlay playsInline className="w-full h-auto rounded-2xl max-h-[80vh] bg-black" />
            )}
            <p className="text-center text-white/60 text-xs mt-3">
              {new Date(selectedStory.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          </div>
        </MediaLightboxWrapper>
      )}

      {/* Modal de detalhe do post (estilo Instagram) — clica em qualquer post da grade.
          Mobile: fullscreen com swipe-down pra fechar e altura fixa do video
          (antes carregava pequeno e expandia, agora abre direto no tamanho grande).
          Desktop: dialog centralizado, layout horizontal. */}
      {selectedPost && (
        <SelectedPostModalWrapper onClose={() => setSelectedPost(null)}>
          <div
            className="bg-white shadow-2xl w-full h-[100dvh] sm:h-auto sm:max-h-[90vh] sm:max-w-3xl sm:rounded-2xl overflow-hidden flex flex-col md:flex-row"
            onClick={e => e.stopPropagation()}
          >
            {/* Coluna midia — carrossel (>=2 fotos), foto unica, ou video.
                Mobile: altura FIXA 60vh (h-[60vh]) -> mais espaco pra info abaixo;
                Desktop: max-h-[80vh] como antes. min-height NAO usa mais, evita
                "expandir depois que video carrega". */}
            {selectedPost.images_urls && selectedPost.images_urls.length >= 2 ? (
              <div className="md:w-3/5 bg-black flex items-center justify-center h-[60vh] md:h-auto md:max-h-[80vh] overflow-x-auto snap-x snap-mandatory flex-shrink-0">
                {selectedPost.images_urls.map((src, i) => (
                  <img
                    key={i}
                    src={src}
                    alt=""
                    className="flex-shrink-0 w-full h-full md:max-h-[80vh] object-contain snap-center"
                  />
                ))}
              </div>
            ) : selectedPost.image_url ? (
              <div className="md:w-3/5 bg-black flex items-center justify-center h-[60vh] md:h-auto md:max-h-[80vh] flex-shrink-0">
                <img
                  src={selectedPost.image_url}
                  alt=""
                  className="max-w-full h-full md:max-h-[80vh] object-contain"
                />
              </div>
            ) : selectedPost.video_url ? (
              <div className="md:w-3/5 bg-black flex items-center justify-center h-[60vh] md:h-[80vh] flex-shrink-0">
                <HlsVideo
                  src={selectedPost.video_url}
                  controls
                  autoPlay
                  playsInline
                  className="w-full h-full object-contain"
                />
              </div>
            ) : null}
            {/* Coluna info — min-h-0 garante que o flex-1 do conteudo
                interno limite altura corretamente em flexbox (sem isso
                a lista de comentarios estoura o container e a pagina
                inteira rola em vez do scroll interno funcionar). */}
            <div className={((selectedPost.image_url || selectedPost.video_url || (selectedPost.images_urls && selectedPost.images_urls.length >= 2)) ? 'md:w-2/5' : 'w-full') + ' flex flex-col bg-white overflow-hidden min-h-0 flex-1'}>
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
                    {fotoPerfil ? <img src={fotoPerfil} alt="" className="w-full h-full object-cover" /> : <User className="w-4 h-4 text-gray-500 m-2" />}
                  </div>
                  <span className="font-bold text-sm truncate">{currentUser}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={async () => {
                      if (!confirm('Apagar este post permanentemente?')) return;
                      await supabase.from('feed_posts').delete().eq('id', selectedPost.id);
                      setMyPosts(prev => prev.filter(p => p.id !== selectedPost.id));
                      setPostsCount(c => Math.max(0, c - 1));
                      setSelectedPost(null);
                    }}
                    className="w-8 h-8 rounded-full hover:bg-red-50 flex items-center justify-center text-red-500"
                    title="Excluir post"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  {/* Botao X removido — fechar agora eh APENAS arrastando
                      pra baixo (swipe-down do MediaLightboxWrapper). */}
                </div>
              </div>

              {/* Texto + comentarios — flex-1 min-h-0 garante scroll
                  vertical proprio quando a lista cresce. WebKit smooth
                  scroll pra iOS. */}
              <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3" style={{ WebkitOverflowScrolling: 'touch' }}>
                {selectedPost.text && (
                  <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{selectedPost.text}</p>
                )}
                {selectedPost.comments.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Comentários</div>
                    {selectedPost.comments.map(c => (
                      <div key={c.id} className="flex items-start justify-between gap-2 py-1">
                        <div className="text-sm flex-1 min-w-0">
                          <span className="font-semibold mr-1">{c.user}</span>
                          <span className="text-gray-700 break-words">{c.text}</span>
                        </div>
                        <button
                          onClick={async () => {
                            const next = selectedPost.comments.filter(x => x.id !== c.id);
                            await supabase.from('feed_posts').update({ comments: next }).eq('id', selectedPost.id);
                            setSelectedPost({ ...selectedPost, comments: next });
                            setMyPosts(prev => prev.map(p => p.id === selectedPost.id ? { ...p, comments: next } : p));
                          }}
                          className="text-red-400 hover:text-red-600 flex-shrink-0"
                          title="Apagar comentário"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer com likes */}
              <div className="px-4 py-3 border-t border-gray-100 flex-shrink-0">
                <div className="flex items-center gap-3 mb-2">
                  <Heart className="w-5 h-5 text-red-500" fill="#ef4444" />
                  <span className="text-sm font-bold">{selectedPost.likes.length}</span>
                  <span className="text-sm text-gray-500">{selectedPost.likes.length === 1 ? 'curtida' : 'curtidas'}</span>
                </div>
                {selectedPost.likes.length > 0 && (
                  <div className="text-xs text-gray-500 flex flex-wrap gap-1">
                    {selectedPost.likes.slice(0, 8).map(u => (
                      <span key={u} className="bg-gray-100 px-2 py-0.5 rounded-full">{u}</span>
                    ))}
                    {selectedPost.likes.length > 8 && (
                      <span className="text-gray-400 px-2 py-0.5">+{selectedPost.likes.length - 8}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </SelectedPostModalWrapper>
      )}

      {/* Modal de detalhes dos cursos de intercambio — abre quando user
          clica no stat "Cursos". Mostra "Curso de idiomas em [Pais] na
          escola [Escola]". So aparece se cursos > 0 (button disabled
          quando 0). */}
      {showCoursesModal && (() => {
        const destinoCode = getDestino(currentUser);
        const destinoPais = findCountry(destinoCode);
        const escola = studentData.escola || 'a definir';
        return (
          <div
            className="fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center p-4"
            onClick={() => setShowCoursesModal(false)}
          >
            <div
              className="bg-white rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wide flex items-center gap-2">
                  <span>🎓</span> Meus cursos
                </h3>
                <button
                  type="button"
                  onClick={() => setShowCoursesModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                  aria-label="Fechar"
                >×</button>
              </div>
              <div className="px-5 py-5 space-y-3">
                {/* Card adapta light/dark via .sc-course-card (CSS vars) */}
                <div className="flex items-start gap-3 rounded-xl p-3 sc-course-card">
                  <span className="text-3xl">{destinoPais.flag}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold leading-tight" style={{ color: 'var(--sc-text-primary, #1f2937)' }}>
                      Curso de idiomas em {destinoPais.name}
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--sc-text-secondary, #4b5563)' }}>
                      Escola: <span className="font-semibold">{escola}</span>
                    </p>
                    {getDataIntercambio(currentUser) && (
                      <p className="text-[11px] mt-1" style={{ color: 'var(--sc-text-disabled, #6b7280)' }}>
                        Embarque: {new Date(getDataIntercambio(currentUser)!).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Crop modal pra ajustar zoom/pan da foto de perfil (Instagram/WhatsApp).
          Aberto quando o user escolhe um arquivo; ao confirmar, faz o upload. */}
      {pendingFotoSrc && (
        <CropImageModal
          src={pendingFotoSrc}
          onCancel={() => setPendingFotoSrc(null)}
          onConfirm={onFotoCropConfirm}
        />
      )}

      {/* Crop modal pro WALLPAPER — aspect ratio retangular (3:1, banner)
          que combina com a area onde o wallpaper aparece no perfil. */}
      {pendingWallpaperSrc && (
        <CropImageModal
          src={pendingWallpaperSrc}
          onCancel={() => setPendingWallpaperSrc(null)}
          onConfirm={onWallpaperCropConfirm}
          aspectRatio={3}
          title="Ajustar wallpaper"
          outputSize={1500}
        />
      )}
    </div>
  );
}

/**
 * Wrapper do modal de post selecionado.
 * Mobile: swipe pra baixo (>80px) fecha o modal (estilo Instagram).
 * Desktop: comportamento padrao (click no overlay fecha).
 */
function SelectedPostModalWrapper({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useLockBodyScroll(true);
  const [dragY, setDragY] = useState(0);
  const dragStartY = useRef<number | null>(null);
  const dragging = useRef(false);

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length !== 1) return;
    dragStartY.current = e.touches[0].clientY;
    dragging.current = false;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (dragStartY.current == null) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    if (dy > 0) {
      // So permite arrastar pra baixo (swipe-down fecha). Pra cima nao faz nada.
      dragging.current = true;
      setDragY(dy);
    }
  }
  function onTouchEnd() {
    if (dragging.current && dragY > 80) onClose();
    else setDragY(0);
    dragStartY.current = null;
    dragging.current = false;
  }

  return (
    <div
      className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center sm:p-4"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{
        transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
        transition: dragging.current ? 'none' : 'transform 0.25s ease-out',
        opacity: dragY > 0 ? Math.max(0.4, 1 - dragY / 600) : 1,
      }}
    >
      {children}
    </div>
  );
}

