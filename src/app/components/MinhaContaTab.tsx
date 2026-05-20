import { useState, useEffect, useRef } from 'react';
import { User, Mail, Phone, MapPin, Save, Eye, EyeOff, Loader2, Camera, ShieldCheck, Lock, Star, Pencil, Check, X, ArrowRightLeft, Gift, HeartHandshake, Trash2, Heart, MessageCircle as MessageIcon, Play, Copy } from 'lucide-react';
import { HlsVideo } from './HlsVideo';
import { supabase } from '../../lib/supabase';
import { deriveKey, encryptMsg, decryptMsg } from '../utils/chatCrypto';
import { useLang } from '../i18n';
import { CountryPicker } from './CountryPicker';
import { getOrigem, getDestino, setOrigem as saveOrigem, setDestino as saveDestino, hydrateTripFromRemote, getDataIntercambio, setDataIntercambio } from './countries';
import { getStudentProfile, setStudentProfile } from './studentProfile';
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

  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    (async () => {
      // Busca posts + contadores remotos em paralelo
      const [postsRes, friendsRemote, followersRemote] = await Promise.all([
        supabase
          .from('feed_posts')
          .select('id, image_url, images_urls, video_url, text, likes, comments, created_at')
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
  const fotoRef = useRef<HTMLInputElement>(null);

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

  const handleFotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!userId) { alert('Usuário não identificado. Tente novamente.'); return; }
    setUploadingFoto(true);
    try {
      await supabase.auth.refreshSession();
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const key = `${userId}/avatar_${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('fotos')
        .upload(key, file, { contentType: file.type || 'image/jpeg' });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('fotos').getPublicUrl(key);
      const { error: dbError } = await supabase.from('usuarios')
        .update({ foto_perfil: publicUrl })
        .eq('username', currentUser);
      if (dbError) throw dbError;
      onFotoAtualizada?.(publicUrl);
    } catch (err: any) {
      alert(`Erro ao enviar foto: ${err?.message || JSON.stringify(err)}`);
    }
    setUploadingFoto(false);
  };

  useEffect(() => {
    if (!currentUser) return;
    const recover = async () => {
      const { data: msgs } = await supabase
        .from('mensagens')
        .select('conversa_id, remetente')
        .ilike('conversa_id', `%${currentUser}%`);

      if (!msgs || msgs.length === 0) return;

      const byId = new Map<string, Set<string>>();
      for (const m of msgs as Array<{ conversa_id: string; remetente: string }>) {
        if (!byId.has(m.conversa_id)) byId.set(m.conversa_id, new Set());
        byId.get(m.conversa_id)!.add(m.remetente);
      }

      const isUUID = (s: string) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

      for (const [id, remetentes] of byId.entries()) {
        const parts = id.split('__');
        if (parts.length === 3 && isUUID(parts[2])) continue;

        const uuidMatch = id.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        if (!uuidMatch) continue;
        const productId = uuidMatch[0];

        let users = [...remetentes].filter(u => u && u.length > 0);

        if (users.length < 2) {
          const remaining = id.replace(productId, '').replace(currentUser, '');
          const otherUser = remaining.split('_').filter((p: string) => p.length > 0).join('_');
          if (otherUser && !users.includes(otherUser)) users.push(otherUser);
        }

        if (users.length < 2) continue;

        const newId = [...new Set(users)].sort().join('__') + '__' + productId;
        if (newId !== id) {
          await supabase.from('mensagens').update({ conversa_id: newId }).eq('conversa_id', id);
        }
      }
    };
    recover();
  }, [currentUser]);

  const handleSaveUsername = async () => {
    const trimmed = newUsername.trim().toLowerCase().replace(/\s+/g, '_');
    if (!trimmed) { setUsernameError(AT.accountUsernameEmpty); return; }
    if (!/^[a-z0-9_]+$/.test(trimmed)) { setUsernameError(AT.accountUsernameInvalid); return; }
    if (trimmed.length < 3) { setUsernameError(AT.accountUsernameTooShort); return; }
    if (trimmed === currentUser) { setEditingUsername(false); return; }

    setSavingUsername(true);
    setUsernameError('');

    const { data: exists } = await supabase
      .from('usuarios').select('username').eq('username', trimmed).maybeSingle();
    if (exists) {
      setUsernameError(AT.accountUsernameTaken);
      setSavingUsername(false);
      return;
    }

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
          // Conversas de grupo: NÃO renomear (formato group__<uuid> não contém username)
          if (oldId.startsWith('group_')) continue;
          const parts = oldId.split('__');
          if (parts.length < 3) continue;
          const productId = parts.slice(2).join('__');
          const users = [parts[0], parts[1]].map((u: string) => u === currentUser ? trimmed : u);
          const newId = users.sort().join('__') + '__' + productId;
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
      await supabase.from('usuarios').update({ username: trimmed }).eq('id', userId);
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

      // Registra historico — outros usuarios usam isso pra atualizar
      // suas listas locais (amigos/seguidos) no proximo login.
      await supabase.from('username_history').insert({
        user_id: userId,
        old_username: currentUser,
        new_username: trimmed,
      }).then(() => {}, () => {});

      localStorage.setItem('papo_username', trimmed);
      onUsernameAtualizado?.(trimmed);
      setEditingUsername(false);
    } catch (err: any) {
      setUsernameError(AT.accountUsernameError);
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

  const inputClass = 'w-full px-4 py-3 border-2 border-gray-200 rounded-2xl text-sm outline-none focus:border-purple-500 transition-colors bg-white';

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      {/* Título "👤 Minha Conta" removido. */}

      <div className="space-y-4">

        {showProfile && <>
        {/* 1 — Foto + Atividade do aluno */}
        <div className="glass overflow-hidden" style={{borderRadius:20}}>
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
            <User className="w-4 h-4 text-stone-500" />
            <h3 className="font-bold text-gray-700 text-sm uppercase tracking-wide">Minha atividade</h3>
          </div>
          <div className="px-5 py-5 flex flex-col items-center">
            <div className="relative mb-3">
              <div className="w-24 h-24 rounded-full overflow-hidden bg-gradient-to-br from-purple-200 to-orange-200 flex items-center justify-center border-4 border-white shadow-lg">
                {fotoPerfil
                  ? <img src={fotoPerfil} alt="Foto de perfil" className="w-full h-full object-cover" />
                  : <User className="w-10 h-10 text-purple-400" />
                }
              </div>
              <button
                onClick={() => fotoRef.current?.click()}
                disabled={uploadingFoto}
                className="absolute bottom-0 right-0 w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center shadow-md hover:bg-purple-700 transition-colors border-2 border-white"
              >
                {uploadingFoto
                  ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                  : <Camera className="w-4 h-4 text-white" />
                }
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-4">{AT.accountPhotoHint}</p>
            <input ref={fotoRef} type="file" accept="image/*" className="hidden" onChange={handleFotoChange} />

            {/* Stats: Posts | Conexões (amigos confirmados + seguidores). */}
            <div className="grid grid-cols-2 gap-2 w-full mb-4">
              <div className="flex flex-col items-center py-2">
                <span className="text-2xl font-extrabold text-gray-800 leading-none">{postsCount}</span>
                <span className="text-[11px] text-gray-500 mt-1">Posts</span>
              </div>
              <div className="flex flex-col items-center py-2 border-l border-gray-100">
                <span className="text-2xl font-extrabold text-gray-800 leading-none">{friendsCount + followingCount}</span>
                <span className="text-[11px] text-gray-500 mt-1">Conexões</span>
              </div>
            </div>

            {!isPJ && (
              <div className="grid grid-cols-2 gap-2 w-full">
                <div className="flex flex-col items-center bg-white/60 rounded-2xl py-3 px-2 shadow-sm border border-stone-200">
                  <span className="text-2xl mb-0.5">🛍️</span>
                  <span className="text-xl font-extrabold text-gray-800 leading-none">{studentData.comprasStore}</span>
                  <span className="text-[10px] text-gray-500 mt-1 text-center leading-tight">Compras na Papo Store</span>
                </div>
                <div className="flex flex-col items-center bg-white/60 rounded-2xl py-3 px-2 shadow-sm border border-stone-200">
                  <span className="text-2xl mb-0.5">🎓</span>
                  <span className="text-xl font-extrabold text-gray-800 leading-none">{studentData.cursosIntercambio}</span>
                  <span className="text-[10px] text-gray-500 mt-1 text-center leading-tight">Cursos de intercâmbio</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 1.5 — Meus posts (grade estilo Instagram) */}
        <div className="glass overflow-hidden" style={{borderRadius:20}}>
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
            <span className="text-sm" aria-hidden>📷</span>
            <h3 className="font-bold text-gray-700 text-sm uppercase tracking-wide">Meus posts</h3>
            <span className="ml-auto text-xs text-gray-400 font-medium">{postsCount}</span>
          </div>
          <div className="p-2">
            {myPosts.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">
                Você ainda não publicou nenhum post.
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1">
                {myPosts.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPost(p)}
                    className="relative aspect-square bg-gray-100 overflow-hidden group"
                    style={{ borderRadius: 6 }}
                    title={p.text.slice(0, 80)}
                  >
                    {p.image_url ? (
                      <>
                        <img src={p.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                        {/* Badge de carrossel — quando p.images_urls tem >= 2 fotos */}
                        {p.images_urls && p.images_urls.length >= 2 && (
                          <div
                            className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center pointer-events-none"
                            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
                            title={`Carrossel com ${p.images_urls.length} fotos`}
                          >
                            <Copy className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </>
                    ) : p.video_url ? (
                      <>
                        {videoThumbUrl(p.video_url) ? (
                          <img
                            src={videoThumbUrl(p.video_url) as string}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full bg-black" />
                        )}
                        {/* Badge de video — canto superior direito */}
                        <div
                          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center pointer-events-none"
                          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
                        >
                          <Play className="w-3.5 h-3.5 text-white" fill="#fff" />
                        </div>
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-500 px-1 text-center leading-tight">
                        {p.text.slice(0, 80) || '—'}
                      </div>
                    )}
                    {/* Overlay com likes/comments no hover (estilo Instagram) */}
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
            )}
          </div>
        </div>
        </>}

        {showSecurity && <>
        {/* Data de inicio do intercambio (countdown na barra SUA VIAGEM) */}
        <DataIntercambioSection currentUser={currentUser} />

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
                  <button onClick={() => { setEditingUsername(true); setNewUsername(currentUser); }}
                    className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center hover:bg-purple-100 transition-colors">
                    <Pencil className="w-3 h-3 text-gray-500" />
                  </button>
                </div>
              )}
              {usernameError && <p className="text-xs text-red-500 mt-1">{usernameError}</p>}
              {!editingUsername && <p className="text-xs text-gray-400 mt-0.5">{AT.accountEmailNote}</p>}
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
            <div className="mt-2 flex items-center justify-between">
              <p className="text-xs text-gray-400 ml-1">
                Visível para outros alunos no perfil.
              </p>
              <button
                type="button"
                onClick={saveStudent}
                disabled={!studentDirty || studentSaving}
                className="px-3 py-1.5 rounded-2xl bg-gray-900 text-white text-xs font-bold disabled:opacity-40 flex items-center gap-1"
              >
                {studentSaving ? <><Loader2 className="w-3 h-3 animate-spin" />Salvando…</> : studentSaved ? '✓ Salvo' : 'Salvar'}
              </button>
            </div>
            {studentError && (
              <p className="text-xs text-red-600 mt-2">{studentError}</p>
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
            <div className="flex gap-2 items-center">
              <select
                value={segmentoLocal}
                onChange={e => setSegmentoLocal(e.target.value)}
                disabled={segmentoLocked}
                className={`${inputClass} flex-1 ${segmentoLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <option value="">Selecione…</option>
                {SEGMENTOS_PJ.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button
                type="button"
                onClick={saveSegmento}
                disabled={!segmentoLocal || segmentoLocal === segmento || segmentoSaving || segmentoLocked}
                className="px-4 py-3 rounded-2xl bg-gray-900 text-white font-semibold text-sm disabled:opacity-50 whitespace-nowrap"
              >
                {segmentoSaving ? 'Salvando…' : segmentoOk ? '✓ Salvo' : 'Salvar'}
              </button>
            </div>
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
          <button onClick={handleSave} disabled={saving}
            className="w-full py-3.5 rounded-2xl bg-purple-600 text-white font-bold hover:bg-purple-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            {saving ? AT.accountSaving : AT.accountSave}
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

      {/* Modal de detalhe do post (estilo Instagram) — clica em qualquer post da grade */}
      {selectedPost && (
        <div
          className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setSelectedPost(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col md:flex-row shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Coluna midia — carrossel (>=2 fotos), foto unica, ou video */}
            {selectedPost.images_urls && selectedPost.images_urls.length >= 2 ? (
              <div className="md:w-3/5 bg-black flex items-center justify-center min-h-[260px] max-h-[80vh] overflow-x-auto snap-x snap-mandatory">
                {selectedPost.images_urls.map((src, i) => (
                  <img
                    key={i}
                    src={src}
                    alt=""
                    className="flex-shrink-0 w-full max-h-[80vh] object-contain snap-center"
                  />
                ))}
              </div>
            ) : selectedPost.image_url ? (
              <div className="md:w-3/5 bg-black flex items-center justify-center min-h-[260px] max-h-[80vh]">
                <img
                  src={selectedPost.image_url}
                  alt=""
                  className="max-w-full max-h-[80vh] object-contain"
                />
              </div>
            ) : selectedPost.video_url ? (
              <div className="md:w-3/5 bg-black flex items-center justify-center min-h-[260px] max-h-[80vh]">
                <HlsVideo
                  src={selectedPost.video_url}
                  controls
                  autoPlay
                  playsInline
                  className="max-w-full max-h-[80vh] object-contain"
                />
              </div>
            ) : null}
            {/* Coluna info */}
            <div className={((selectedPost.image_url || selectedPost.video_url || (selectedPost.images_urls && selectedPost.images_urls.length >= 2)) ? 'md:w-2/5' : 'w-full') + ' flex flex-col bg-white overflow-hidden'}>
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
                  <button
                    onClick={() => setSelectedPost(null)}
                    className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500"
                    title="Fechar"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Texto + comentários (scroll) */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
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
        </div>
      )}
    </div>
  );
}

// Seção de data de intercâmbio — edição da data que alimenta a contagem
// regressiva exibida na barra SUA VIAGEM da home.
function DataIntercambioSection({ currentUser }: { currentUser: string }) {
  const [iso, setIso] = useState<string>(() => {
    const d = getDataIntercambio(currentUser);
    if (!d) return '';
    // input type=date espera YYYY-MM-DD
    return d.toISOString().slice(0, 10);
  });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const sync = () => {
      const d = getDataIntercambio(currentUser);
      setIso(d ? d.toISOString().slice(0, 10) : '');
    };
    window.addEventListener('papo-trip-updated', sync);
    return () => window.removeEventListener('papo-trip-updated', sync);
  }, [currentUser]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    const fullIso = iso ? new Date(iso + 'T00:00:00').toISOString() : null;
    setDataIntercambio(currentUser, fullIso);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };

  return (
    <div className="glass overflow-hidden" style={{ borderRadius: 20 }}>
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
        <span className="text-base">✈️</span>
        <h3 className="font-bold text-gray-700 text-sm uppercase tracking-wide">Data do intercâmbio</h3>
      </div>
      <div className="px-5 py-5 space-y-3">
        <p className="text-xs text-gray-500">
          Defina a data que você chega no país do intercâmbio. Vai aparecer uma contagem regressiva na barra <strong>SUA VIAGEM</strong> da página inicial.
        </p>
        <input
          type="date"
          value={iso}
          onChange={(e) => setIso(e.target.value)}
          className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl text-sm outline-none focus:border-purple-500 transition-colors bg-white"
        />
        {saved ? (
          <div className="w-full py-3 rounded-2xl bg-green-500 text-white font-bold text-center text-sm flex items-center justify-center gap-2">
            <ShieldCheck className="w-4 h-4" /> Data salva!
          </div>
        ) : (
          <button
            onClick={save}
            disabled={saving}
            className="w-full py-3 rounded-2xl bg-purple-600 text-white font-bold text-sm hover:bg-purple-700 transition-colors disabled:opacity-50"
          >
            {saving ? 'Salvando…' : (iso ? 'Salvar data' : 'Limpar data')}
          </button>
        )}
      </div>
    </div>
  );
}
