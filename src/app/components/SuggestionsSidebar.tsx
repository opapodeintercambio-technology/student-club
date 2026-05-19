import { useState, useEffect, useRef } from 'react';
import { X, Check, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getFriends, sendFriendRequest, cancelFriendRequest, getPendingRequests, getSentRequests } from './friends';
import { fetchUsernamesWithStories, getSeenStories } from './Stories';

interface Suggestion {
  username: string;
  nome?: string | null;
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

// Persistencia de dismisses por usuario. Conta quantas vezes o user atual
// dispensou cada sugestao. >=7 -> esconde permanentemente. <7 -> some
// nesta instancia mas pode voltar em outra strip / proxima sessao.
const DISMISS_KEY = (u: string) => `papo_sugg_dismissed_${u}`;
const DISMISS_THRESHOLD = 7;

function loadDismissCounts(currentUser: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(DISMISS_KEY(currentUser));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

function bumpDismiss(currentUser: string, target: string): number {
  const counts = loadDismissCounts(currentUser);
  const next = (counts[target] || 0) + 1;
  counts[target] = next;
  try { localStorage.setItem(DISMISS_KEY(currentUser), JSON.stringify(counts)); } catch {}
  return next;
}

export function SuggestionsSidebar({ currentUser, fotoPerfil: _fotoPerfil, onOpenProfile }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<Set<string>>(new Set());
  const [sent, setSent] = useState<Set<string>>(() => new Set(getSentRequests(currentUser)));
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [usersWithUnseenStories, setUsersWithUnseenStories] = useState<Set<string>>(new Set());
  const [friendsSet, setFriendsSet] = useState<Set<string>>(() => new Set(getFriends(currentUser)));
  const scrollRef = useRef<HTMLDivElement>(null);

  // Carrega usuarios que tem stories nao-vistos (so renderiza ring nos
  // suggestion cards de quem ja eh conexao + tem story nao visto).
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    (async () => {
      const byUser = await fetchUsernamesWithStories();
      if (cancelled) return;
      const seen = getSeenStories(currentUser);
      const unseen = new Set<string>();
      byUser.forEach((storyIds, username) => {
        if (username === currentUser) return;
        if (storyIds.some(id => !seen.has(id))) unseen.add(username);
      });
      setUsersWithUnseenStories(unseen);
    })();
    return () => { cancelled = true; };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const friends = new Set(getFriends(currentUser));
        const pending = new Set((await getPendingRequests(currentUser)).map(r => r.from));
        const alreadySent = new Set(getSentRequests(currentUser));

        const { data } = await supabase
          .from('usuarios')
          .select('username, nome, foto_perfil, cidade, escola')
          .neq('username', currentUser)
          .limit(40);

        if (cancelled) return;
        // Filtra: amigos confirmados, pedidos pendentes recebidos, e usuarios
        // que ja foram dispensados 7+ vezes (blacklist permanente).
        // NAO filtra alreadySent: usuario que ja recebeu meu pedido continua
        // visivel com o botao em estado "Pendente" — sumir so quando clicar no X.
        const dismissCounts = loadDismissCounts(currentUser);
        const candidates = ((data as any[]) || [])
          .filter(u =>
            u.username
            && !friends.has(u.username)
            && !pending.has(u.username)
            && (dismissCounts[u.username] || 0) < DISMISS_THRESHOLD)
          .slice(0, 20);

        setSuggestions(candidates);
        setSent(alreadySent);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    // Re-sync local sent + friends state quando outro lugar modifica
    const refresh = () => {
      setSent(new Set(getSentRequests(currentUser)));
      setFriendsSet(new Set(getFriends(currentUser)));
    };
    window.addEventListener('papo-friends-updated', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener('papo-friends-updated', refresh);
    };
  }, [currentUser]);

  async function handleConnect(u: string) {
    if (sending.has(u)) return;
    const isAlreadySent = sent.has(u);
    setSending(prev => new Set(prev).add(u));
    try {
      if (isAlreadySent) await cancelFriendRequest(currentUser, u);
      else await sendFriendRequest(currentUser, u);
      // Estado real atualizado via listener papo-friends-updated
    } finally {
      setSending(prev => {
        const next = new Set(prev);
        next.delete(u);
        return next;
      });
    }
  }

  function handleDismiss(u: string) {
    bumpDismiss(currentUser, u);
    setDismissed(prev => new Set(prev).add(u));
    // Avisa outras instancias (outras strips no feed) que dismiss counts mudaram —
    // pra que elas tambem possam reagir se o limite foi atingido.
    window.dispatchEvent(new CustomEvent('papo-sugg-dismissed', { detail: { username: u } }));
  }

  const visibleSuggestions = suggestions.filter(s => !dismissed.has(s.username));
  if (!loading && visibleSuggestions.length === 0) return null;

  return (
    <section aria-label="Sugestões de amizade" className="w-full" data-no-swipe>
      <div className="flex items-center justify-between mb-2 px-1">
        <p className="text-xs font-bold uppercase tracking-wider text-stone-600">Sugestões para você</p>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1"
        style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
      >
        <style>{`
          [aria-label="Sugestões de amizade"] > div::-webkit-scrollbar { display: none; }
        `}</style>

        {loading
          ? [0,1,2,3,4,5].map(i => (
              <div key={i} className="flex-shrink-0 w-[140px] rounded-2xl bg-white p-3 animate-pulse">
                <div className="w-full aspect-square rounded-full bg-stone-200 mb-2" />
                <div className="h-3 w-20 bg-stone-200 rounded mb-2 mx-auto" />
                <div className="h-7 w-full bg-stone-100 rounded-full" />
              </div>
            ))
          : visibleSuggestions.map(s => {
              const isSent = sent.has(s.username);
              const isSending = sending.has(s.username);
              const displayName = (s.nome && s.nome.trim()) || `@${s.username}`;
              // Ring da bandeira da Irlanda: aparece SE o user ja eh conexao
              // E tem story nao visto pelo currentUser. Clique abre o viewer.
              const isConnected = friendsSet.has(s.username);
              const hasUnseenStory = isConnected && usersWithUnseenStories.has(s.username);
              const avatarOnClick = () => {
                if (hasUnseenStory) {
                  window.dispatchEvent(new CustomEvent('papo-open-stories-for-user', { detail: { username: s.username } }));
                } else {
                  onOpenProfile?.(s.username);
                }
              };
              return (
                <div
                  key={s.username}
                  className="flex-shrink-0 w-[140px] rounded-2xl bg-white p-3 relative flex flex-col items-center text-center"
                >
                  <button
                    onClick={() => handleDismiss(s.username)}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full hover:bg-stone-100 flex items-center justify-center text-stone-400 hover:text-stone-700"
                    aria-label="Dispensar sugestão"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={avatarOnClick}
                    className="w-full aspect-square rounded-full overflow-hidden mb-2 mt-1 relative"
                    aria-label={hasUnseenStory ? `Ver story de @${s.username}` : `Ver perfil de @${s.username}`}
                    style={hasUnseenStory ? {
                      // Ring bandeira da Irlanda — verde / branco / laranja
                      padding: 3,
                      background: 'linear-gradient(135deg, #009A44 0%, #009A44 30%, #ffffff 50%, #FF7900 70%, #FF7900 100%)',
                    } : undefined}
                  >
                    {s.foto_perfil ? (
                      <img src={s.foto_perfil} alt="" className="w-full h-full object-cover rounded-full" style={hasUnseenStory ? { border: '2px solid #fff' } : undefined} />
                    ) : (
                      <div
                        className="w-full h-full rounded-full flex items-center justify-center text-white text-2xl font-bold"
                        style={{ background: avatarColor(s.username), border: hasUnseenStory ? '2px solid #fff' : undefined }}
                      >
                        {s.username.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </button>

                  <button
                    onClick={() => onOpenProfile?.(s.username)}
                    className="text-[12px] font-semibold text-stone-800 truncate w-full hover:underline"
                    title={displayName}
                  >
                    {displayName}
                  </button>

                  <button
                    onClick={() => handleConnect(s.username)}
                    disabled={isSending}
                    className="mt-2 w-full py-1.5 rounded-full text-[11px] font-bold flex items-center justify-center gap-1 disabled:opacity-50 transition-colors"
                    style={{
                      background: isSent ? '#f5f2ec' : '#1e714a',
                      color: isSent ? '#1e714a' : '#fff',
                      border: isSent ? '1px solid #1e714a' : '1px solid #1e714a',
                      fontFamily: '"DM Sans", system-ui, sans-serif',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {isSending
                      ? '...'
                      : isSent
                        ? <><Clock className="w-3 h-3" /> Pendente</>
                        : <><Check className="w-3 h-3" /> Conectar-se</>}
                  </button>
                </div>
              );
            })}
      </div>
    </section>
  );
}
