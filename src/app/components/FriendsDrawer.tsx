import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, UserPlus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getFriends } from './friends';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';

interface Props {
  currentUser: string;
  open: boolean;
  onClose: () => void;
  dark?: boolean; // mantido na assinatura por compat; não usado mais (visual unificado)
  onChat?: (username: string) => void;
  onAddMore?: () => void;
  userStatuses?: Record<string, { online: boolean; lastSeen?: Date }>;
}

interface F {
  username: string;
  nome?: string | null;
  foto_perfil?: string | null;
  online: boolean;
}

function avatarColor(name: string): string {
  const COLORS = ['#7c3aed', '#f97316', '#ec4899', '#10b981', '#3b82f6', '#f59e0b', '#06b6d4', '#8b5cf6'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

// Presença é SEMPRE real (vem do canal Supabase Realtime via userStatuses).
// Antes tínhamos um simulateOnline() de fallback que dava resultado aleatório
// por hash do username — fazia o drawer dizer "X online" enquanto o ChatsTab
// dizia 0. Removido pra evitar inconsistência. Sem dado real → offline.

// MESMA largura do MenuDrawer pra consistência visual entre os dois drawers.
const DRAWER_WIDTH = 300;

export function FriendsDrawer({ currentUser, open, onClose, onChat, onAddMore, userStatuses }: Props) {
  const [friends, setFriends] = useState<F[]>([]);
  useLockBodyScroll(open);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const reload = async () => {
      const usernames = getFriends(currentUser);
      if (usernames.length === 0) { if (!cancelled) setFriends([]); return; }
      let dbData: Record<string, { nome: string | null; foto_perfil: string | null }> = {};
      try {
        const { data } = await supabase
          .from('usuarios')
          .select('username,nome,foto_perfil')
          .in('username', usernames);
        for (const u of (data as any[]) || []) {
          dbData[u.username] = { nome: u.nome, foto_perfil: u.foto_perfil };
        }
      } catch {}
      if (cancelled) return;
      const list: F[] = usernames.map(u => ({
        username: u,
        nome: dbData[u]?.nome,
        foto_perfil: dbData[u]?.foto_perfil,
        online: userStatuses?.[u]?.online ?? false,
      }));
      list.sort((a, b) => {
        if (a.online !== b.online) return a.online ? -1 : 1;
        return a.username.localeCompare(b.username);
      });
      setFriends(list);
    };
    reload();
    const sync = () => reload();
    window.addEventListener('papo-friends-updated', sync);
    const tick = window.setInterval(reload, 60_000);
    return () => {
      cancelled = true;
      window.removeEventListener('papo-friends-updated', sync);
      window.clearInterval(tick);
    };
  }, [currentUser, userStatuses]);

  useEffect(() => { if (open) setDragX(0); }, [open]);

  // TEMPO REAL: foto de perfil de um amigo mudou → atualiza a lista.
  useEffect(() => {
    const onUserUpdated = (e: Event) => {
      const d = (e as CustomEvent<{ username: string; foto_perfil: string | null }>).detail;
      if (!d?.username) return;
      setFriends(prev => prev.map(f =>
        f.username === d.username ? { ...f, foto_perfil: d.foto_perfil ?? null } : f
      ));
    };
    window.addEventListener('papo-user-updated', onUserUpdated);
    return () => window.removeEventListener('papo-user-updated', onUserUpdated);
  }, []);

  // Swipe pra DIREITA fecha o drawer (drawer entra da direita).
  const onTouchStart = (e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
    setDragging(true);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging) return;
    const delta = e.touches[0].clientX - startXRef.current;
    setDragX(Math.max(0, Math.min(DRAWER_WIDTH, delta)));
  };
  const onTouchEnd = () => {
    setDragging(false);
    if (dragX > DRAWER_WIDTH * 0.4) onClose();
    else setDragX(0);
  };

  const progress = open ? 1 - dragX / DRAWER_WIDTH : 0;
  const translateX = open ? dragX : DRAWER_WIDTH;

  if (!open && dragX === 0) return null;

  const onlineCount = friends.filter(f => f.online).length;

  return createPortal(
    <>
      {/* Backdrop glass — idêntico ao MenuDrawer (tema Cassidy) */}
      <div
        className="fixed inset-0 z-[70]"
        style={{
          backdropFilter: `blur(${(progress * 20).toFixed(1)}px) saturate(180%)`,
          WebkitBackdropFilter: `blur(${(progress * 20).toFixed(1)}px) saturate(180%)`,
          backgroundColor: `rgba(60, 60, 50, ${(progress * 0.22).toFixed(2)})`,
          transition: dragging ? 'none' : 'backdrop-filter 0.35s, background-color 0.35s',
          pointerEvents: progress > 0.05 ? 'auto' : 'none',
        }}
        onClick={onClose}
      />

      {/* Drawer — IDÊNTICO ao MenuDrawer (branco, Source Serif 4), só que
          desliza da DIREITA. Mesma largura, mesmas sombras/bordas. */}
      <div
        className="fixed top-0 right-0 h-full z-[70] flex flex-col overflow-hidden"
        style={{
          width: DRAWER_WIDTH,
          transform: `translateX(${translateX}px)`,
          transition: dragging ? 'none' : 'transform 0.35s cubic-bezier(0.4,0,0.2,1)',
          background: 'var(--sc-bg)',
          borderLeft: '1px solid var(--sc-drawer-border)',
          boxShadow: '-4px 0 28px rgba(0,0,0,0.08)',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Header — mesmo paddingTop com safe-area do MenuDrawer */}
        <div
          className="px-4 flex items-center justify-between flex-shrink-0"
          style={{
            background: '#ffffff',
            borderBottom: '1px solid #f1f5f9',
            paddingTop: 'calc(env(safe-area-inset-top) + 18px)',
            paddingBottom: 18,
          }}
        >
          <div className="min-w-0">
            <p
              className="text-[15px] truncate"
              style={{
                color: '#0a0a0a',
                fontFamily: '"Source Serif 4", Georgia, serif',
                fontWeight: 600,
                letterSpacing: '0.01em',
              }}
            >
              Amigos do Chat
            </p>
            <div className="flex items-center gap-3 mt-1 text-[11px]" style={{ color: '#78716c' }}>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
                <strong style={{ color: '#0a0a0a' }}>{onlineCount}</strong> online
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ background: '#a8a29e' }} />
                <strong style={{ color: '#0a0a0a' }}>{friends.length - onlineCount}</strong> offline
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-gray-100 transition-colors"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" style={{ color: '#262626' }} />
          </button>
        </div>

        {/* Lista — items h-12 rounded-xl, idêntico ao MenuDrawer */}
        <nav className="flex-1 overflow-y-auto py-2 px-3 space-y-1">
          {friends.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs" style={{ color: '#78716c' }}>
              <UserPlus className="w-6 h-6 mx-auto mb-2" style={{ opacity: 0.6 }} />
              Você ainda não tem amigos. Toque no botão abaixo pra adicionar.
            </div>
          ) : friends.map(f => (
            <button
              key={f.username}
              onClick={() => onChat?.(f.username)}
              className="relative w-full h-12 rounded-xl flex items-center active:scale-[0.98] transition-colors hover:bg-gray-100"
              style={{ background: 'transparent', paddingLeft: 12, paddingRight: 12 }}
              aria-label={f.username}
            >
              <span className="relative w-7 h-7 flex items-center justify-center flex-shrink-0">
                {f.foto_perfil ? (
                  <img src={f.foto_perfil} alt="" className="w-7 h-7 rounded-full object-cover" />
                ) : (
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                    style={{ background: avatarColor(f.username) }}
                  >
                    {f.username.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <span
                  className="absolute -bottom-0.5 -right-0.5 rounded-full"
                  style={{
                    width: 10,
                    height: 10,
                    background: f.online ? '#22c55e' : '#a8a29e',
                    border: '2px solid #ffffff',
                    boxShadow: f.online ? '0 0 6px #22c55e' : 'none',
                  }}
                />
              </span>
              <span
                className="ml-3 text-[15px] whitespace-nowrap flex-1 text-left truncate"
                style={{
                  color: '#262626',
                  fontWeight: 400,
                  fontFamily: '"Source Serif 4", Georgia, serif',
                  letterSpacing: '0.01em',
                }}
              >
                {f.nome || `${f.username}`}
              </span>
            </button>
          ))}
        </nav>

        {/* Conectar-se — mesmo padrão do MenuDrawer (botão final com divider).
            flex-shrink-0 + bg branco garante que o botão fica fixo no rodapé
            sem ser sobreposto pelos itens da lista quando ela tem scroll. */}
        {onAddMore && (
          <div className="px-3 pb-3 flex-shrink-0" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)', background: '#ffffff' }}>
            <div className="my-2 mx-1" style={{ height: 1, background: '#f1f5f9' }} />
            <button
              onClick={() => { onClose(); onAddMore(); }}
              className="relative w-full h-12 rounded-xl flex items-center justify-center gap-2 transition-colors active:scale-[0.98]"
              style={{
                background: '#1e714a',
                color: '#ffffff',
              }}
              aria-label="Conectar-se"
            >
              <UserPlus className="w-4 h-4" />
              <span
                className="text-[15px] whitespace-nowrap"
                style={{
                  fontWeight: 600,
                  fontFamily: '"Source Serif 4", Georgia, serif',
                  letterSpacing: '0.01em',
                }}
              >
                Conectar-se
              </span>
            </button>
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}

// ─── Hook: detecta swipe horizontal e dispara callback ────────────────────
export function useSwipeOpen(onOpen: () => void) {
  const start = useRef<{ x: number; y: number; t: number } | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    const target = e.target as HTMLElement | null;
    if (target && target.closest('[data-no-swipe]')) {
      start.current = null;
      return;
    }
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (!start.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.current.x;
    const dy = t.clientY - start.current.y;
    const dt = Date.now() - start.current.t;
    start.current = null;
    const swipeLeft = dx < -70 && Math.abs(dx) > Math.abs(dy) * 1.7;
    if (swipeLeft && dt < 700) onOpen();
  }
  return { onTouchStart, onTouchEnd };
}
