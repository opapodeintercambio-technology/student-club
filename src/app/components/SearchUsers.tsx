import { useState, useEffect } from 'react';
import { Search, UserPlus, UserCheck, UserMinus, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  getFriends, addFriend, removeFriend,
  getSentRequests, cancelFriendRequest,
} from './friends';
import { getStudentProfile } from './studentProfile';
import { findCountry, getOrigem, getDestino } from './countries';

interface User {
  username: string;
  email?: string;
}

interface Props {
  currentUser: string;
  onOpenProfile?: (username: string) => void;
}

function avatarColor(name: string): string {
  const COLORS = ['#7c3aed','#f97316','#ec4899','#10b981','#3b82f6','#f59e0b','#06b6d4','#8b5cf6'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function SearchUsers({ currentUser, onOpenProfile }: Props) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [friends, setFriends] = useState<Set<string>>(() => new Set(getFriends(currentUser)));

  useEffect(() => {
    setFriends(new Set(getFriends(currentUser)));
    const sync = () => setFriends(new Set(getFriends(currentUser)));
    window.addEventListener('papo-friends-updated', sync);
    return () => window.removeEventListener('papo-friends-updated', sync);
  }, [currentUser]);

  useEffect(() => {
    const term = q.trim();
    if (!term) { setResults([]); return; }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const { data } = await supabase
          .from('usuarios')
          .select('username,email')
          .ilike('username', `%${term}%`)
          .order('username')
          .limit(30);
        if (!cancelled) setResults((data || []).filter((u: any) => u.username !== currentUser));
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, currentUser]);

  function toggleFriend(u: string) {
    if (friends.has(u)) removeFriend(currentUser, u);
    else addFriend(currentUser, u);
  }

  return (
    <div className="max-w-[900px] mx-auto px-3 sm:px-4 py-4 space-y-4">
      <div>
        <h1
          className="text-2xl font-bold text-stone-800 flex items-center gap-2"
          style={{ fontFamily: '"DM Sans", system-ui, sans-serif', letterSpacing: '0.04em' }}
        >
          <Search className="w-6 h-6 text-[#5a7a52]" />
          Pesquisar alunos
        </h1>
        <p className="text-sm text-stone-500 mt-0.5">Encontre outros intercambistas, siga e adicione como amigo.</p>
      </div>

      <div
        className="flex items-center gap-2 px-3 py-2 rounded-full"
        style={{ background: '#ffffff', border: '1px solid #d6d3d1' }}
      >
        <Search className="w-4 h-4 text-stone-400 flex-shrink-0" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Digite o @username do aluno…"
          className="flex-1 outline-none text-sm bg-transparent"
        />
        {loading && <span className="text-[10px] text-stone-400 uppercase tracking-widest">…</span>}
      </div>

      {q.trim() === '' ? (
        <div
          className="rounded-xl py-10 text-center text-stone-500"
          style={{ background: '#fafaf9', border: '1px dashed #d6d3d1' }}
        >
          <Search className="w-8 h-8 mx-auto mb-2 text-stone-400" />
          <p className="text-sm">Comece a digitar para encontrar alunos.</p>
        </div>
      ) : results.length === 0 && !loading ? (
        <div
          className="rounded-xl py-10 text-center text-stone-500"
          style={{ background: '#fafaf9', border: '1px dashed #d6d3d1' }}
        >
          <p className="text-sm">Nenhum aluno encontrado com "{q}".</p>
        </div>
      ) : (
        <div className="space-y-2">
          {results.map(u => {
            const isFriend = friends.has(u.username);
            const profile = getStudentProfile(u.username);
            const origem = findCountry(getOrigem(u.username));
            const destino = findCountry(getDestino(u.username));
            return (
              <div
                key={u.username}
                className="rounded-xl p-3 flex items-center gap-3"
                style={{ background: '#fff', border: '1px solid #e7e5e4' }}
              >
                <button
                  onClick={() => onOpenProfile?.(u.username)}
                  className="flex-shrink-0"
                >
                  <div
                    className="w-12 h-12 flex items-center justify-center text-white text-sm font-bold"
                    style={{ background: avatarColor(u.username), borderRadius: '50%', aspectRatio: '1 / 1' }}
                  >
                    {u.username.slice(0, 2).toUpperCase()}
                  </div>
                </button>
                <button
                  onClick={() => onOpenProfile?.(u.username)}
                  className="flex-1 min-w-0 text-left"
                >
                  <p className="text-sm font-semibold text-stone-800" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
                    @{u.username}
                  </p>
                  <p className="text-[11px] text-stone-500 truncate flex items-center gap-1">
                    <span>{origem.flag}</span><span>→</span><span>{destino.flag}</span>
                    {profile.escola && <><span className="mx-1">·</span><span className="truncate">{profile.escola}</span></>}
                  </p>
                </button>
                <button
                  onClick={() => toggleFriend(u.username)}
                  className="px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1"
                  style={{
                    background: '#1e714a',
                    color: '#fff',
                    border: '1px solid #1e714a',
                    fontFamily: '"DM Sans", system-ui, sans-serif',
                    letterSpacing: '0.12em',
                  }}
                >
                  {isFriend ? <><UserCheck className="w-3 h-3" /> Conectado</> : <><UserPlus className="w-3 h-3" /> Conectar-se</>}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Aba "Amigos" — busca embedded no topo + listas de amigos/seguidos
export function FriendsTab({ currentUser, userStatuses, onOpenProfile, onChat }: {
  currentUser: string;
  userStatuses: Record<string, { online: boolean; lastSeen?: Date }>;
  onOpenProfile?: (u: string) => void;
  onChat?: (u: string) => void;
}) {
  const [friends, setFriends] = useState<string[]>(() => getFriends(currentUser));
  const [friendsSet, setFriendsSet] = useState<Set<string>>(() => new Set(getFriends(currentUser)));
  const [sentSet, setSentSet] = useState<Set<string>>(() => new Set(getSentRequests(currentUser)));
  // Cache de fotos de perfil dos amigos — uma única query em bulk + atualiza
  // em tempo real via evento `papo-user-updated` (Realtime de usuarios).
  const [photos, setPhotos] = useState<Record<string, string | null>>({});

  // Search state
  const [q, setQ] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setFriends(getFriends(currentUser));
      setFriendsSet(new Set(getFriends(currentUser)));
      setSentSet(new Set(getSentRequests(currentUser)));
    };
    refresh();
    window.addEventListener('papo-friends-updated', refresh);
    return () => window.removeEventListener('papo-friends-updated', refresh);
  }, [currentUser]);

  // Busca fotos dos amigos em bulk quando a lista mudar.
  useEffect(() => {
    if (friends.length === 0) { setPhotos({}); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('usuarios')
          .select('username, foto_perfil')
          .in('username', friends);
        if (cancelled) return;
        const map: Record<string, string | null> = {};
        for (const u of (data as any[]) || []) map[u.username] = u.foto_perfil ?? null;
        setPhotos(map);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [friends.join('|')]);

  // Realtime: foto de um amigo mudou → atualiza local sem refetch.
  useEffect(() => {
    const onUserUpdated = (e: Event) => {
      const d = (e as CustomEvent<{ username: string; foto_perfil: string | null }>).detail;
      if (!d?.username) return;
      setPhotos(prev => ({ ...prev, [d.username]: d.foto_perfil ?? null }));
    };
    window.addEventListener('papo-user-updated', onUserUpdated);
    return () => window.removeEventListener('papo-user-updated', onUserUpdated);
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (!term) { setResults([]); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const { data } = await supabase
          .from('usuarios')
          .select('username,email')
          .ilike('username', `%${term}%`)
          .order('username')
          .limit(30);
        if (!cancelled) setResults((data || []).filter((u: any) => u.username !== currentUser));
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, currentUser]);

  async function handleAddFriend(u: string) {
    if (friendsSet.has(u)) { removeFriend(currentUser, u); return; }
    if (sentSet.has(u)) { await cancelFriendRequest(currentUser, u); return; }
    await addFriend(currentUser, u);
    // Estado real (sentSet) sera atualizado via listener papo-friends-updated
    // disparado por writeSet em sendFriendRequest. Sem optimistic update no
    // friendsSet (que so reflete amizades confirmadas).
  }
  const onlineFriends = friends.filter(f => userStatuses[f]?.online);
  const offlineFriends = friends.filter(f => !userStatuses[f]?.online);

  return (
    <div className="max-w-[900px] mx-auto px-3 sm:px-4 py-4 space-y-5">
      <div>
        <h1
          className="text-2xl font-bold text-stone-800 flex items-center gap-2"
          style={{ fontFamily: '"DM Sans", system-ui, sans-serif', letterSpacing: '0.04em' }}
        >
          <UserPlus className="w-6 h-6 text-[#5a7a52]" />
          Amigos
        </h1>
        <p className="text-sm text-stone-500 mt-0.5">
          <strong className="text-stone-800">{onlineFriends.length}</strong> online · <strong className="text-stone-800">{offlineFriends.length}</strong> offline
        </p>
      </div>

      {/* Busca embedded — antes era aba separada 'Pesquisar' */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-full"
        style={{ background: '#ffffff', border: '1px solid #d6d3d1' }}
      >
        <Search className="w-4 h-4 text-stone-400 flex-shrink-0" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Pesquisar @username pra adicionar / seguir / conversar…"
          className="flex-1 outline-none text-sm bg-transparent"
        />
        {searching && <span className="text-[10px] text-stone-400 uppercase tracking-widest">…</span>}
      </div>

      {q.trim() !== '' && (
        <div>
          <p className="text-xs uppercase font-bold mb-2 text-stone-600" style={{ letterSpacing: '0.18em' }}>
            Resultados ({results.length})
          </p>
          {results.length === 0 && !searching ? (
            <div
              className="rounded-xl py-8 text-center text-stone-500"
              style={{ background: '#fafaf9', border: '1px dashed #d6d3d1' }}
            >
              <p className="text-sm">Nenhum aluno encontrado com "{q}".</p>
            </div>
          ) : (
            <div className="space-y-2">
              {results.map(u => {
                const isAlreadyFriend = friendsSet.has(u.username);
                const isPending = sentSet.has(u.username);
                return (
                  <div
                    key={u.username}
                    className="rounded-xl p-3 flex items-center gap-2"
                    style={{ background: '#fff', border: '1px solid #e7e5e4' }}
                  >
                    <button onClick={() => onOpenProfile?.(u.username)} className="flex-shrink-0">
                      <div
                        className="w-11 h-11 flex items-center justify-center text-white text-sm font-bold"
                        style={{ background: avatarColor(u.username), borderRadius: '50%', aspectRatio: '1 / 1' }}
                      >
                        {u.username.slice(0, 2).toUpperCase()}
                      </div>
                    </button>
                    <button onClick={() => onOpenProfile?.(u.username)} className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-semibold text-stone-800" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
                        @{u.username}
                      </p>
                    </button>
                    {/* Conversar — disponivel pra QUALQUER user, mesmo nao-conectado */}
                    <button
                      onClick={() => onChat?.(u.username)}
                      className="px-2.5 py-1.5 rounded-full text-[11px] font-bold flex-shrink-0"
                      style={{ background: '#5a7a52', color: '#fff', fontFamily: '"DM Sans", sans-serif', letterSpacing: '0.1em' }}
                    >
                      Conversar
                    </button>
                    {/* Conectar-se: unifica Adicionar+Seguir. 3 estados: Conectar-se | Pendente | Conectado */}
                    <button
                      onClick={() => handleAddFriend(u.username)}
                      className="px-2.5 py-1.5 rounded-full text-[11px] font-bold flex items-center gap-1 flex-shrink-0"
                      style={{
                        background: isAlreadyFriend ? '#1e714a' : isPending ? '#f5f2ec' : '#1e714a',
                        color: isAlreadyFriend ? '#fff' : isPending ? '#1e714a' : '#fff',
                        border: `1px solid #1e714a`,
                        fontFamily: '"DM Sans", sans-serif',
                      }}
                    >
                      {isAlreadyFriend
                        ? <><UserCheck className="w-3 h-3" /> Conectado</>
                        : isPending
                          ? <><Clock className="w-3 h-3" /> Pendente</>
                          : <><UserPlus className="w-3 h-3" /> Conectar-se</>}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {q.trim() === '' && (
        <>
          <Section title="Conectados online" subColor="#22c55e" items={onlineFriends} statuses={userStatuses} photos={photos} onOpenProfile={onOpenProfile} onChat={onChat} onRemove={(u) => removeFriend(currentUser, u)} removeLabel="Desconectar" />
          <Section title="Conectados offline" subColor="#a8a29e" items={offlineFriends} statuses={userStatuses} photos={photos} onOpenProfile={onOpenProfile} onChat={onChat} onRemove={(u) => removeFriend(currentUser, u)} removeLabel="Desconectar" />

          {friends.length === 0 && (
            <div
              className="rounded-xl py-10 text-center text-stone-500"
              style={{ background: '#fafaf9', border: '1px dashed #d6d3d1' }}
            >
              <UserPlus className="w-8 h-8 mx-auto mb-2 text-stone-400" />
              <p className="text-sm">Você ainda não está conectado com ninguém.</p>
              <p className="text-xs mt-1">Pesquise no campo acima pra encontrar outros alunos.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Section({ title, subColor, items, statuses, photos = {}, onOpenProfile, onChat, onRemove, removeLabel = 'Remover' }: {
  title: string;
  subColor: string;
  items: string[];
  statuses: Record<string, { online: boolean; lastSeen?: Date }>;
  photos?: Record<string, string | null>;
  onOpenProfile?: (u: string) => void;
  onChat?: (u: string) => void;
  onRemove: (u: string) => void;
  removeLabel?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p
        className="text-xs uppercase font-bold mb-2 flex items-center gap-1.5"
        style={{ fontFamily: '"DM Sans", system-ui, sans-serif', color: subColor, letterSpacing: '0.18em' }}
      >
        <span className="w-2 h-2 rounded-full" style={{ background: subColor }} />
        {title} · {items.length}
      </p>
      <div className="space-y-2">
        {items.map(u => (
          <div
            key={u}
            className="rounded-xl p-3 flex items-center gap-3"
            style={{ background: '#fff', border: '1px solid #e7e5e4' }}
          >
            <button onClick={() => onOpenProfile?.(u)} className="flex-shrink-0 relative">
              {photos[u] ? (
                <img
                  src={photos[u] as string}
                  alt={u}
                  className="w-11 h-11 rounded-full object-cover"
                  style={{ aspectRatio: '1 / 1' }}
                />
              ) : (
                <div
                  className="w-11 h-11 flex items-center justify-center text-white text-sm font-bold"
                  style={{ background: avatarColor(u), borderRadius: '50%', aspectRatio: '1 / 1' }}
                >
                  {u.slice(0, 2).toUpperCase()}
                </div>
              )}
              <span
                className="absolute -bottom-0.5 -right-0.5"
                style={{
                  width: 12, height: 12, borderRadius: '50%',
                  background: statuses[u]?.online ? '#22c55e' : '#a8a29e',
                  border: '2px solid #fff',
                }}
              />
            </button>
            <button onClick={() => onOpenProfile?.(u)} className="flex-1 min-w-0 text-left">
              <p className="text-sm font-semibold text-stone-800" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
                @{u}
              </p>
              <p className="text-[11px] text-stone-500">
                {statuses[u]?.online ? 'Online agora' : 'Offline'}
              </p>
            </button>
            <button
              onClick={() => onChat?.(u)}
              className="px-3 py-1.5 rounded-full text-xs font-bold"
              style={{
                background: '#5a7a52', color: '#fff',
                fontFamily: '"DM Sans", system-ui, sans-serif', letterSpacing: '0.12em',
              }}
            >
              Conversar
            </button>
            <button
              onClick={() => { if (confirm(`${removeLabel} @${u}?`)) onRemove(u); }}
              className="px-3 py-1.5 rounded-full text-xs font-bold"
              style={{
                background: '#ffffff', color: '#b91c1c',
                border: '1px solid #fecaca',
                fontFamily: '"DM Sans", system-ui, sans-serif', letterSpacing: '0.12em',
              }}
              title={removeLabel}
            >
              <UserMinus className="w-3 h-3 inline" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
