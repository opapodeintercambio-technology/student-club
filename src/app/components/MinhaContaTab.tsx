import { useState, useEffect, useRef } from 'react';
import { User, Mail, Phone, MapPin, Save, Eye, EyeOff, Loader2, Camera, ShieldCheck, Lock, Star, Pencil, Check, X, ArrowRightLeft, Gift, HeartHandshake } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { deriveKey, encryptMsg, decryptMsg } from '../utils/chatCrypto';
import { useLang } from '../i18n';

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
}

const SEGMENTOS_PJ = [
  'Tecnologia', 'Varejo / Comércio', 'Alimentação', 'Saúde e Bem-estar',
  'Educação', 'Moda e Vestuário', 'Serviços Gerais', 'Construção / Reforma',
  'Transportes / Logística', 'Arte e Design', 'Esportes / Lazer',
  'Beleza / Estética', 'Agricultura / Agronegócio', 'Outros',
];

export function MinhaContaTab({ currentUser, userId, userEmail, userNome, userTelefone, userEndereco, userMostrarTelefone, fotoPerfil, scoreMedio = 0, totalAvaliacoes = 0, trocas = 0, doacoesFeitas = 0, doacoesRecebidas = 0, amostrasDadas = 0, amostrasRecebidas = 0, verificado, docEnviado, onFotoAtualizada, onDadosAtualizados, onUsernameAtualizado, isPJ, segmento, onSegmentoChange }: MinhaContaTabProps) {
  const { AT } = useLang();
  const [nome, setNome] = useState(userNome);
  const [telefone, setTelefone] = useState(userTelefone);
  const [endereco, setEndereco] = useState(userEndereco);
  const [mostrarTelefone, setMostrarTelefone] = useState(userMostrarTelefone);
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
  const syncedRef = useRef(false);

  useEffect(() => {
    if (syncedRef.current) return;
    if (userNome || userTelefone || userEndereco || fotoPerfil) {
      setNome(userNome);
      setTelefone(userTelefone);
      setEndereco(userEndereco);
      setMostrarTelefone(userMostrarTelefone);
      syncedRef.current = true;
    }
  }, [userNome, userTelefone, userEndereco, fotoPerfil, userMostrarTelefone]);

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
      await supabase.from('usuarios').update({ username: trimmed }).eq('id', userId);

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
    const { error } = await supabase.from('usuarios').update(dados).eq('username', currentUser);
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
      <h2 className="text-2xl font-bold text-gray-800 mb-6">{AT.accountTitle}</h2>

      <div className="space-y-4">

        {/* 1 — Reputação + Foto */}
        <div className="glass overflow-hidden" style={{borderRadius:20}}>
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
            <Star className="w-4 h-4 text-yellow-500" />
            <h3 className="font-bold text-gray-700 text-sm uppercase tracking-wide">{AT.accountReputation}</h3>
          </div>
          <div className="px-5 py-5 flex flex-col items-center">
            <div className="relative mb-4">
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
            <div className="flex gap-1 mb-1">
              {[1,2,3,4,5].map(n => {
                const rounded = Math.round(scoreMedio);
                return <Star key={n} className={`w-7 h-7 ${n <= rounded ? 'fill-yellow-400 text-yellow-400' : 'fill-gray-200 text-gray-200'}`} />;
              })}
            </div>
            <p className="text-2xl font-bold text-gray-800">{scoreMedio > 0 ? scoreMedio.toFixed(1) : '—'}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {totalAvaliacoes > 0
                ? AT.settingsReputationScore(totalAvaliacoes)
                : AT.accountNoRatings}
            </p>
            {scoreMedio > 0 && (
              <div className="mt-2 px-3 py-1 rounded-full text-xs font-semibold" style={{
                background: scoreMedio >= 4.5 ? '#dcfce7' : scoreMedio >= 3.5 ? '#fef9c3' : '#fee2e2',
                color: scoreMedio >= 4.5 ? '#16a34a' : scoreMedio >= 3.5 ? '#ca8a04' : '#dc2626',
              }}>
                {scoreMedio >= 4.5 ? AT.accountRepExcellent : scoreMedio >= 3.5 ? AT.accountRepGood : AT.accountRepLow}
              </div>
            )}

            {/* Contadores — PF: trocas + doações + amostras recebidas. PJ: só "Amostras concedidas" (detalhe vai no Painel) */}
            {isPJ ? (
              <div className="mt-5 grid grid-cols-1 gap-2 w-full">
                <div className="flex flex-col items-center bg-white/60 rounded-2xl py-3 px-2 shadow-sm border border-emerald-200">
                  <span className="text-lg mb-0.5">🍃</span>
                  <span className="text-lg font-extrabold text-gray-800 leading-none">{amostrasDadas}</span>
                  <span className="text-[10px] text-gray-500 mt-1 text-center leading-tight">Amostras concedidas</span>
                </div>
                <p className="text-[11px] text-gray-400 text-center mt-1">Veja KPIs detalhados (views, prospecção, gráficos) no <strong>Painel de Controle</strong>.</p>
              </div>
            ) : (
              <>
                <div className="mt-5 grid grid-cols-3 gap-2 w-full">
                  <div className="flex flex-col items-center bg-white/60 rounded-2xl py-3 px-2 shadow-sm border border-purple-100">
                    <ArrowRightLeft className="w-5 h-5 text-purple-500 mb-1" />
                    <span className="text-lg font-extrabold text-gray-800 leading-none">{trocas}</span>
                    <span className="text-[10px] text-gray-500 mt-1 text-center leading-tight">{AT.accountTrocas}</span>
                  </div>
                  <div className="flex flex-col items-center bg-white/60 rounded-2xl py-3 px-2 shadow-sm border border-pink-100">
                    <Gift className="w-5 h-5 text-pink-500 mb-1" />
                    <span className="text-lg font-extrabold text-gray-800 leading-none">{doacoesFeitas}</span>
                    <span className="text-[10px] text-gray-500 mt-1 text-center leading-tight">{AT.accountDoacoesFeitas}</span>
                  </div>
                  <div className="flex flex-col items-center bg-white/60 rounded-2xl py-3 px-2 shadow-sm border border-orange-100">
                    <HeartHandshake className="w-5 h-5 text-orange-500 mb-1" />
                    <span className="text-lg font-extrabold text-gray-800 leading-none">{doacoesRecebidas}</span>
                    <span className="text-[10px] text-gray-500 mt-1 text-center leading-tight">{AT.accountDoacoesRecebidas}</span>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 w-full">
                  <div className="flex flex-col items-center bg-white/60 rounded-2xl py-3 px-2 shadow-sm border border-emerald-200">
                    <span className="text-lg mb-0.5">🎟️</span>
                    <span className="text-lg font-extrabold text-gray-800 leading-none">{amostrasRecebidas}</span>
                    <span className="text-[10px] text-gray-500 mt-1 text-center leading-tight">Amostras recebidas</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

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
                  <p className="font-bold text-gray-700">@{currentUser}</p>
                  <button onClick={() => { setEditingUsername(true); setNewUsername(currentUser); }}
                    className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center hover:bg-purple-100 transition-colors">
                    <Pencil className="w-3 h-3 text-gray-500" />
                  </button>
                </div>
              )}
              {usernameError && <p className="text-xs text-red-500 mt-1">{usernameError}</p>}
              {!editingUsername && <p className="text-xs text-gray-400 mt-0.5">{AT.accountEmailNote}</p>}
            </div>
            <span className={`text-xs font-bold px-3 py-1 rounded-full flex-shrink-0 ${
              verificado ? 'bg-green-100 text-green-700' :
              docEnviado ? 'bg-yellow-100 text-yellow-700' :
              'bg-orange-100 text-orange-700'
            }`}>
              {verificado ? AT.accountVerified : docEnviado ? AT.accountPending : AT.accountNotVerified}
            </span>
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

      </div>
    </div>
  );
}
