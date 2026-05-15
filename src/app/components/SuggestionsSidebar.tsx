import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { getFriends, sendFriendRequest, getPendingRequests } from './friends';

interface Suggestion {
  username: string;
  foto_perfil?: string | null;
  cidade?: string | null;
  escola?: string | null;
}

interface Props {
  currentUser: string;
  fotoPerfil: string | null;
  onOpenProfile?: (username: string) => void;
}

function avatarColor(name: string): string {
  const COLORS = ['#5a7a52','#b8896a','#7c3aed','#0ea5e9','#f59e0b','#ec4899','#10b981'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function SuggestionsSidebar({ currentUser, fotoPerfil, onOpenProfile }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<Set<string>>(new Set());
  const [sent, setSent] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      setLoading(true);
      try {
        const friends = new Set(getFriends(currentUser));
        const pending = new Set((await getPendingRequests(currentUser)).map(r => r.from));
        const sentReq = new Set<string>(); // já listadas via Set local

        // Pega até 40 usuários quaisquer, filtra eu/amigos/pendentes, fica com 5
        const { data } = await supabase
          .from('usuarios')
          .select('username, foto_perfil, cidade, escola')
          .neq('username', currentUser)
          .limit(40);

        const candidates = ((data as any[]) || [])
          .filter(u =>
            u.username
            && !friends.has(u.username)
            && !pending.has(u.username)
            && !sentReq.has(u.username))
          .slice(0, 5);

        setSuggestions(candidates);
      } finally {
        setLoading(false);
      }
    })();
  }, [currentUser]);

  async function handleFollow(u: string) {
    if (sending.has(u) || sent.has(u)) return;
    setSending(prev => new Set(prev).add(u));
    try {
      await sendFriendRequest(currentUser, u);
      setSent(prev => new Set(prev).add(u));
    } finally {
      setSending(prev => {
        const next = new Set(prev);
        next.delete(u);
        return next;
      });
    }
  }

  return (
    <aside
      className="flex flex-col"
      style={{ paddingLeft: 24, paddingRight: 20, paddingTop: 88 }}
      aria-label="Sugestões"
    >
      {/* Cartão do usuário */}
      <div className="flex items-center gap-3 mb-5">
        {fotoPerfil ? (
          <img src={fotoPerfil} alt="" className="w-14 h-14 rounded-full object-cover" />
        ) : (
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-white text-lg font-bold"
            style={{ background: avatarColor(currentUser) }}
          >
            {currentUser.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate text-gray-900">@{currentUser}</p>
          <p className="text-xs text-gray-500 truncate">Seu perfil</p>
        </div>
      </div>

      {/* Cabeçalho de sugestões */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-gray-500">Sugestões para você</span>
      </div>

      {/* Lista de sugestões */}
      {loading ? (
        <div className="space-y-3">
          {[0,1,2,3,4].map(i => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="w-10 h-10 rounded-full bg-gray-200" />
              <div className="flex-1">
                <div className="h-3 w-24 bg-gray-200 rounded mb-1" />
                <div className="h-2.5 w-32 bg-gray-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : suggestions.length === 0 ? (
        <p className="text-xs text-gray-400 mt-2">Nenhuma sugestão no momento.</p>
      ) : (
        <ul className="space-y-3">
          {suggestions.map(s => {
            const isSent = sent.has(s.username);
            const isSending = sending.has(s.username);
            return (
              <li key={s.username} className="flex items-center gap-3">
                <button
                  onClick={() => onOpenProfile?.(s.username)}
                  className="flex-shrink-0"
                  aria-label={`Ver perfil de @${s.username}`}
                >
                  {s.foto_perfil ? (
                    <img src={s.foto_perfil} alt="" className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold"
                      style={{ background: avatarColor(s.username) }}
                    >
                      {s.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                </button>
                <button
                  onClick={() => onOpenProfile?.(s.username)}
                  className="flex-1 min-w-0 text-left"
                >
                  <p className="text-sm font-semibold text-gray-900 truncate hover:underline">@{s.username}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {s.escola || s.cidade || 'Sugerido para você'}
                  </p>
                </button>
                <button
                  onClick={() => handleFollow(s.username)}
                  disabled={isSent || isSending}
                  className="text-xs font-semibold whitespace-nowrap transition-opacity disabled:opacity-50"
                  style={{ color: isSent ? '#9ca3af' : '#5a7a52' }}
                >
                  {isSent ? 'Enviado' : isSending ? '...' : 'Seguir'}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-8 pt-4 border-t border-gray-100">
        <p className="text-[10px] text-gray-400 leading-relaxed">
          © {new Date().getFullYear()} PAPO DE ALUNOS
        </p>
      </div>
    </aside>
  );
}
