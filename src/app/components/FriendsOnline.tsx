import { useState, useEffect } from 'react';
import { Circle, UserPlus, MessageCircle } from 'lucide-react';
import { getFriends } from './friends';
import { supabase } from '../../lib/supabase';

interface Props {
  currentUser: string;
  userStatuses: Record<string, { online: boolean; lastSeen?: Date }>;
  onChat?: (username: string) => void;
  onAddMore?: () => void;
}

function avatarColor(name: string): string {
  const COLORS = ['#7c3aed','#f97316','#ec4899','#10b981','#3b82f6','#f59e0b','#06b6d4','#8b5cf6'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function FriendsOnline({ currentUser, userStatuses, onChat, onAddMore }: Props) {
  const [friends, setFriends] = useState<string[]>(() => getFriends(currentUser));
  const [avatars, setAvatars] = useState<Record<string, string>>({});

  useEffect(() => {
    setFriends(getFriends(currentUser));
    const sync = () => setFriends(getFriends(currentUser));
    window.addEventListener('papo-friends-updated', sync);
    return () => window.removeEventListener('papo-friends-updated', sync);
  }, [currentUser]);

  // Carrega foto_perfil dos amigos do Supabase; cacheado em memoria
  // por sessao pra evitar refetch a cada render.
  useEffect(() => {
    if (friends.length === 0) return;
    const missing = friends.filter(u => !(u in avatars));
    if (missing.length === 0) return;
    (async () => {
      try {
        const { data } = await supabase
          .from('usuarios')
          .select('username, foto_perfil')
          .in('username', missing);
        if (!data) return;
        setAvatars(prev => {
          const next = { ...prev };
          for (const u of missing) next[u] = '';
          for (const row of data as any[]) {
            if (row.username) next[row.username] = row.foto_perfil || '';
          }
          return next;
        });
      } catch {}
    })();
  }, [friends, avatars]);

  const online = friends.filter(f => userStatuses[f]?.online);
  const offline = friends.filter(f => !userStatuses[f]?.online);

  return (
    <>
      {/* ─── Mobile: faixa horizontal de amigos (somente online em destaque)
          ─── BUG FIX v2: a versao anterior usava var(--sc-top-bar-bg) que eh
          rgba(255,255,255,0.72) em light -> parecia "barra branca" sobre o
          off-white da pagina; em dark eh rgba(15,18,22,0.72) sobre #0c1014
          -> parecia barra preta solida.
          Agora a barra eh COMPLETAMENTE TRANSPARENTE: herda 100% do bg da
          pagina (off-white em light, #0c1014 em dark) e sem cria bloco
          visual destoante. Mantemos so um border-bottom super sutil de 1px
          pra separar da lista de mensagens. */}
      <div
        className="md:hidden w-full overflow-x-auto px-3 py-3 flex-shrink-0"
        style={{
          background: 'transparent',
          borderBottom: '1px solid var(--sc-bottom-nav-border)',
          scrollbarWidth: 'none',
        }}
      >
        <style>{`.md\\:hidden::-webkit-scrollbar{display:none}`}</style>
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
            <span
              className="text-[9px] uppercase font-bold tracking-widest"
              style={{ color: '#5a7a52', fontFamily: '"DM Sans", system-ui, sans-serif', letterSpacing: '0.18em' }}
            >
              Amigos
            </span>
            <span className="text-[10px] text-stone-500">{online.length} online</span>
          </div>
          {friends.length === 0 ? (
            <button
              onClick={onAddMore}
              className="flex items-center gap-1.5 px-3 h-9 rounded-full text-[11px] font-bold text-white"
              style={{
                background: '#5a7a52',
                fontFamily: '"DM Sans", system-ui, sans-serif',
                letterSpacing: '0.14em',
              }}
            >
              <UserPlus className="w-3 h-3" /> Adicionar
            </button>
          ) : (
            <>
              {[...online, ...offline].map(u => (
                <button
                  key={u}
                  onClick={() => onChat?.(u)}
                  className="flex flex-col items-center gap-0.5 flex-shrink-0"
                  title={`${u}`}
                >
                  <div className="relative">
                    {avatars[u] ? (
                      <img
                        src={avatars[u]}
                        alt={u}
                        className="w-11 h-11 object-cover"
                        style={{ borderRadius: '50%', aspectRatio: '1 / 1' }}
                      />
                    ) : (
                      <div
                        className="w-11 h-11 flex items-center justify-center text-white text-xs font-bold"
                        style={{ background: avatarColor(u), borderRadius: '50%', aspectRatio: '1 / 1' }}
                      >
                        {u.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <span
                      className="absolute -bottom-0.5 -right-0.5"
                      style={{
                        width: 12, height: 12,
                        borderRadius: '50%',
                        background: userStatuses[u]?.online ? '#22c55e' : '#a8a29e',
                        border: '2px solid #fafaf7',
                        boxShadow: userStatuses[u]?.online ? '0 0 4px #22c55e' : 'none',
                      }}
                    />
                  </div>
                  <span className="text-[9px] text-stone-600 max-w-[52px] truncate"
                        style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
                    {u}
                  </span>
                </button>
              ))}
              {onAddMore && (
                <button
                  onClick={onAddMore}
                  className="flex flex-col items-center gap-0.5 flex-shrink-0"
                  title="Adicionar amigos"
                >
                  <div
                    className="w-11 h-11 flex items-center justify-center"
                    style={{
                      background: '#fff',
                      border: '2px dashed #b8896a',
                      borderRadius: '50%',
                      aspectRatio: '1 / 1',
                    }}
                  >
                    <UserPlus className="w-5 h-5" style={{ color: '#b8896a' }} />
                  </div>
                  <span className="text-[9px] text-stone-500" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
                    add
                  </span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ─── Desktop: sidebar vertical ─── BUG FIX: usa fundo transparente
          pra herdar a cor da pagina (off-white em light, #0c1014 em dark)
          em vez de #ffffff hard-coded. Border-left sutil pra separar
          visualmente da lista de chats. Mesma logica da barra mobile. */}
      <aside
        className="hidden md:flex md:flex-col flex-shrink-0"
        style={{
          width: 260,
          background: 'transparent',
          borderLeft: '1px solid var(--sc-bottom-nav-border)',
        }}
      >
      <div className="px-4 py-3">
        <p
          className="text-xs font-bold uppercase"
          style={{
            fontFamily: '"DM Sans", system-ui, sans-serif',
            letterSpacing: '0.18em',
            color: '#5a7a52',
          }}
        >
          Amigos
        </p>
        <div className="flex items-center gap-3 mt-1 text-[11px] text-stone-600">
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: '#22c55e' }} />
            <strong className="text-stone-800">{online.length}</strong> online
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: '#a8a29e' }} />
            <strong className="text-stone-800">{offline.length}</strong> offline
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {friends.length === 0 ? (
          <div className="px-3 py-6 text-center text-stone-500 text-xs">
            <UserPlus className="w-6 h-6 mx-auto mb-2 text-stone-400" />
            Você ainda não tem amigos. Use a aba <strong>Pesquisar</strong> no menu para adicionar alunos.
          </div>
        ) : (
          <>
            {online.length > 0 && (
              <div className="mb-2">
                <p
                  className="px-2 py-1 text-[10px] uppercase tracking-widest"
                  style={{ fontFamily: '"DM Sans", system-ui, sans-serif', color: '#5a7a52', letterSpacing: '0.18em', fontWeight: 700 }}
                >
                  Online · {online.length}
                </p>
                {online.map(u => (
                  <FriendRow key={u} username={u} avatar={avatars[u]} online onChat={onChat} />
                ))}
              </div>
            )}
            {offline.length > 0 && (
              <div>
                <p
                  className="px-2 py-1 text-[10px] uppercase tracking-widest"
                  style={{ fontFamily: '"DM Sans", system-ui, sans-serif', color: '#a8a29e', letterSpacing: '0.18em', fontWeight: 700 }}
                >
                  Offline · {offline.length}
                </p>
                {offline.map(u => (
                  <FriendRow key={u} username={u} avatar={avatars[u]} online={false} lastSeen={userStatuses[u]?.lastSeen} onChat={onChat} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {onAddMore && (
        <div className="p-2">
          <button
            onClick={onAddMore}
            className="w-full py-2.5 text-white text-xs font-bold flex items-center justify-center gap-1.5"
            style={{
              background: '#1e714a',
              fontFamily: 'Lato, system-ui, sans-serif',
              letterSpacing: '0.14em',
              borderRadius: 9999,
            }}
          >
            <UserPlus className="w-3.5 h-3.5" /> Conectar-se
          </button>
        </div>
      )}
      </aside>
    </>
  );
}

function FriendRow({ username, avatar, online, lastSeen, onChat }: {
  username: string;
  avatar?: string;
  online: boolean;
  lastSeen?: Date;
  onChat?: (u: string) => void;
}) {
  const bg = avatarColor(username);
  return (
    <button
      onClick={() => onChat?.(username)}
      className="w-full flex items-center gap-2 px-2 py-1.5 rounded transition-colors"
      style={{
        // Hover: subtle highlight que funciona em light e dark. Usa
        // rgba branco quase invisivel pra adicionar contraste sem
        // criar bloco solido.
        background: 'transparent',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(127,127,127,0.10)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <div className="relative flex-shrink-0">
        {avatar ? (
          <img
            src={avatar}
            alt={username}
            className="w-8 h-8 object-cover"
            style={{ borderRadius: '50%', aspectRatio: '1 / 1' }}
          />
        ) : (
          <div
            className="w-8 h-8 flex items-center justify-center text-white text-[11px] font-bold"
            style={{ background: bg, borderRadius: '50%', aspectRatio: '1 / 1' }}
          >
            {username.slice(0, 2).toUpperCase()}
          </div>
        )}
        <span
          className="absolute -bottom-0.5 -right-0.5"
          style={{
            width: 10, height: 10,
            borderRadius: '50%',
            background: online ? '#22c55e' : '#a8a29e',
            border: '2px solid #fafaf7',
          }}
        />
      </div>
      <div className="flex-1 min-w-0 text-left">
        <p className="text-sm font-semibold text-stone-800 truncate" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
          {username}
        </p>
        {!online && lastSeen && (
          <p className="text-[10px] text-stone-500 truncate">
            Visto {formatLastSeen(lastSeen)}
          </p>
        )}
      </div>
      <MessageCircle className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
    </button>
  );
}

function formatLastSeen(d: Date): string {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days}d`;
}

// Marca para nada não ficar como import morto noutros arquivos
export { Circle };
