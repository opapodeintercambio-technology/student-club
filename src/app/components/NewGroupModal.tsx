import { useEffect, useRef, useState } from 'react';
import { X, Users, Check, Camera } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getFriends } from './friends';

interface Props {
  currentUser: string;
  userId?: string;
  onClose: () => void;
  /** Chamado quando o grupo é criado com sucesso; recebe o group id. */
  onCreated: (groupId: string, groupName: string) => void;
}

interface FriendOption {
  username: string;
  nome?: string;
  foto_perfil?: string;
}

export function NewGroupModal({ currentUser, userId, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [friends, setFriends] = useState<FriendOption[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<'members' | 'name'>('members');
  const [creating, setCreating] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      await supabase.auth.refreshSession();
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const dir = userId || currentUser;
      const key = `${dir}/group_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('fotos').upload(key, file, { contentType: file.type || 'image/jpeg' });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('fotos').getPublicUrl(key);
      setAvatarUrl(publicUrl);
    } catch (err: any) {
      alert('Erro ao enviar imagem: ' + (err?.message || err));
    }
    setUploadingAvatar(false);
  }

  // Carrega amigos do user
  useEffect(() => {
    const usernames = getFriends(currentUser);
    if (usernames.length === 0) { setFriends([]); return; }
    supabase
      .from('usuarios')
      .select('username,nome,foto_perfil')
      .in('username', usernames)
      .then(({ data }) => {
        const list = usernames.map(u => {
          const row = (data as any[])?.find(d => d.username === u);
          return { username: u, nome: row?.nome, foto_perfil: row?.foto_perfil };
        });
        setFriends(list);
      });
  }, [currentUser]);

  function toggle(u: string) {
    const next = new Set(selected);
    if (next.has(u)) next.delete(u); else next.add(u);
    setSelected(next);
  }

  async function create() {
    if (creating) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    if (selected.size === 0) return;
    setCreating(true);
    const members = [currentUser, ...selected].sort();

    // PROTEÇÃO ANTI-DUPLICATA: busca grupos existentes do user com mesmo nome (case-insensitive)
    // e exatamente os mesmos membros. Se achar, abre o existente em vez de criar outro.
    const { data: existing } = await supabase
      .from('chat_groups')
      .select('id, name, members')
      .contains('members', [currentUser])
      .ilike('name', trimmed);
    const match = (existing as any[])?.find(g => {
      const m1 = [...(g.members || [])].sort();
      return m1.length === members.length && m1.every((u, i) => u === members[i]);
    });
    if (match) {
      setCreating(false);
      onCreated(match.id, match.name);
      onClose();
      return;
    }

    const { data, error } = await supabase
      .from('chat_groups')
      .insert({ name: trimmed, created_by: currentUser, members, avatar_url: avatarUrl })
      .select('id, name')
      .single();
    setCreating(false);
    if (error || !data) {
      alert('Erro ao criar grupo. Tente novamente.');
      return;
    }
    onCreated(data.id, data.name);
    onClose();
  }

  const initials = (s: string) => s.charAt(0).toUpperCase();

  return (
    <div className="fixed inset-0 z-[9600] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="w-full max-w-md max-h-[92vh] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <button
            onClick={() => step === 'name' ? setStep('members') : onClose()}
            className="w-9 h-9 rounded-full bg-gray-100 active:scale-90 transition-transform flex items-center justify-center"
            aria-label="Voltar"
          >
            <X className="w-4 h-4 text-gray-700" />
          </button>
          <h2 className="text-base font-bold flex items-center gap-2" style={{ color: '#1a1a1a', fontFamily: '"Source Serif 4", Georgia, serif' }}>
            <Users className="w-4 h-4" style={{ color: '#5a7a52' }} />
            {step === 'members' ? 'Novo grupo' : 'Nome do grupo'}
          </h2>
          <div className="w-9" />
        </div>

        {/* Conteúdo */}
        {step === 'members' ? (
          <>
            <div className="px-4 pt-3 pb-2">
              <p className="text-xs text-gray-500">
                {selected.size > 0
                  ? `${selected.size} amigo${selected.size > 1 ? 's' : ''} selecionado${selected.size > 1 ? 's' : ''}`
                  : 'Escolha os amigos pra adicionar ao grupo'}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto px-2">
              {friends.length === 0 ? (
                <div className="text-center py-12 px-6 text-gray-400 text-sm">
                  Você ainda não tem amigos.<br/>Adicione amigos na aba "Amigos" pra criar um grupo.
                </div>
              ) : (
                friends.map(f => (
                  <button
                    key={f.username}
                    onClick={() => toggle(f.username)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    {f.foto_perfil ? (
                      <img src={f.foto_perfil} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0" style={{ background: 'linear-gradient(135deg,#5a7a52,#b8896a)' }}>
                        {initials(f.username)}
                      </div>
                    )}
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{f.nome || `@${f.username}`}</p>
                      <p className="text-[11px] text-gray-500 truncate">@{f.username}</p>
                    </div>
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                      style={{
                        background: selected.has(f.username) ? '#5a7a52' : '#f5f5f4',
                        border: selected.has(f.username) ? '2px solid #5a7a52' : '2px solid #d6d3d1',
                      }}
                    >
                      {selected.has(f.username) && <Check className="w-3.5 h-3.5 text-white" />}
                    </div>
                  </button>
                ))
              )}
            </div>
            <div className="px-4 py-3 border-t border-gray-200">
              <button
                onClick={() => setStep('name')}
                disabled={selected.size === 0}
                className="w-full py-3 rounded-2xl font-bold text-sm transition-all disabled:opacity-40"
                style={{
                  background: 'linear-gradient(135deg, #5a7a52 0%, #b8896a 100%)',
                  color: '#fff',
                  fontFamily: '"Source Serif 4", Georgia, serif',
                  letterSpacing: '0.12em',
                }}
              >
                Próximo ({selected.size})
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-4 pt-5">
              <div className="flex flex-col items-center gap-3 mb-6">
                <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: 'none' }} />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="relative w-24 h-24 rounded-full overflow-hidden flex items-center justify-center text-white active:scale-95 transition-transform"
                  style={{ background: 'linear-gradient(135deg,#5a7a52,#b8896a)' }}
                  title="Adicionar imagem do grupo"
                >
                  {avatarUrl
                    ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                    : <Users className="w-9 h-9" />}
                  {!uploadingAvatar && (
                    <span
                      className="absolute bottom-0 right-0 w-8 h-8 rounded-full flex items-center justify-center bg-white shadow-md"
                      style={{ border: '2px solid #fff' }}
                    >
                      <Camera className="w-4 h-4" style={{ color: '#5a7a52' }} />
                    </span>
                  )}
                  {uploadingAvatar && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </button>
                <p className="text-xs text-gray-500">
                  {selected.size + 1} membros (você + {selected.size})
                </p>
              </div>
              <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase" style={{ letterSpacing: '0.1em' }}>
                Nome do grupo
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value.slice(0, 50))}
                placeholder="Ex: Galera de Dublin 2026"
                autoFocus
                className="w-full px-3 py-3 rounded-xl outline-none text-sm"
                style={{
                  background: '#f5f5f4',
                  border: '1px solid #d6d3d1',
                  color: '#1a1a1a',
                }}
              />
              <p className="text-[11px] text-gray-400 mt-2 text-right">{name.length}/50</p>
            </div>
            <div className="px-4 py-3 border-t border-gray-200">
              <button
                onClick={create}
                disabled={!name.trim() || creating}
                className="w-full py-3 rounded-2xl font-bold text-sm transition-all disabled:opacity-40"
                style={{
                  background: 'linear-gradient(135deg, #5a7a52 0%, #b8896a 100%)',
                  color: '#fff',
                  fontFamily: '"Source Serif 4", Georgia, serif',
                  letterSpacing: '0.12em',
                }}
              >
                {creating ? 'Criando...' : 'Criar grupo'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
