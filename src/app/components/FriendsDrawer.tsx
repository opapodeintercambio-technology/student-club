import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, UserPlus, MessageCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getFriends } from './friends';

interface Props {
  currentUser: string;
  open: boolean;
  onClose: () => void;
  dark?: boolean;
  onChat?: (username: string) => void;
  onAddMore?: () => void;
  /** Status de presença real do app (Supabase Realtime). Quando omitido, simula. */
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

function simulateOnline(username: string): boolean {
  let h = 0;
  for (let i = 0; i < username.length; i++) h = (h * 31 + username.charCodeAt(i)) >>> 0;
  const tick = Math.floor(Date.now() / 60000);
  return ((h + tick) % 10) < 6;
}

export function FriendsDrawer({ currentUser, open, onClose, dark, onChat, onAddMore, userStatuses }: Props) {
  const [friends, setFriends] = useState<F[]>([]);

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
        online: userStatuses?.[u]?.online ?? simulateOnline(u),
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

  const onlineCount = friends.filter(f => f.online).length;
  const bg = dark ? '#101012' : '#fafaf7';
  const border = dark ? 'rgba(255,255,255,0.08)' : '#e7e5e4';
  const textColor = dark ? '#fafaf7' : '#1c1917';
  const subColor = dark ? 'rgba(255,255,255,0.55)' : '#78716c';
  const cardBg = dark ? '#15151a' : '#fff';
  const onlineDotBorder = dark ? '#101012' : '#fafaf7';

  return createPortal(
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-[10000] transition-opacity duration-200"
        style={{
          background: 'rgba(0,0,0,0.45)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
        }}
      />
      {/* Painel deslizante */}
      <aside
        className="fixed z-[10001] flex flex-col transition-transform duration-300 ease-out"
        style={{
          // Bordas arredondadas no mobile + margem das bordas da tela
          // (estilo cartão flutuante, igual app nativo)
          top: 8,
          right: 8,
          bottom: 8,
          width: 'min(85vw, 320px)',
          background: bg,
          borderRadius: 28,
          overflow: 'hidden',
          transform: open ? 'translateX(0)' : 'translateX(110%)',
          boxShadow: open ? '-12px 0 32px rgba(0,0,0,0.35)' : 'none',
        }}
      >
        <div
          className="flex items-center justify-between px-4 flex-shrink-0"
          style={{
            borderBottom: `1px solid ${border}`,
            paddingTop: 'calc(env(safe-area-inset-top) + 12px)',
            paddingBottom: 12,
          }}
        >
          <div>
            <p
              className="text-xs font-bold uppercase"
              style={{
                fontFamily: '"DM Sans", system-ui, sans-serif',
                letterSpacing: '0.18em',
                color: dark ? '#b8896a' : '#5a7a52',
              }}
            >
              Amigos do Chat
            </p>
            <div className="flex items-center gap-3 mt-1 text-[11px]" style={{ color: subColor }}>
              <span className="inline-flex items-center gap-1">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: '#22c55e', boxShadow: '0 0 6px #22c55e' }}
                />
                <strong style={{ color: textColor }}>{onlineCount}</strong> online
              </span>
              <span className="inline-flex items-center gap-1">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: dark ? 'rgba(255,255,255,0.25)' : '#a8a29e' }}
                />
                <strong style={{ color: textColor }}>{friends.length - onlineCount}</strong> offline
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{
              background: dark ? 'rgba(255,255,255,0.08)' : '#fff',
              border: `1px solid ${border}`,
              color: textColor,
            }}
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {friends.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs" style={{ color: subColor }}>
              <UserPlus className="w-6 h-6 mx-auto mb-2" style={{ color: subColor, opacity: 0.6 }} />
              Você ainda não tem amigos. Toque no botão abaixo pra adicionar.
            </div>
          ) : (
            friends.map(f => (
              <button
                key={f.username}
                onClick={() => onChat?.(f.username)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all"
                style={{ background: 'transparent' }}
              >
                <div className="relative flex-shrink-0">
                  {f.foto_perfil ? (
                    <img
                      src={f.foto_perfil}
                      alt={f.username}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold"
                      style={{ background: avatarColor(f.username) }}
                    >
                      {f.username.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <span
                    className="absolute bottom-0 right-0 rounded-full"
                    style={{
                      width: 12,
                      height: 12,
                      background: f.online ? '#22c55e' : '#52525b',
                      border: `2px solid ${onlineDotBorder}`,
                      boxShadow: f.online ? '0 0 6px #22c55e' : 'none',
                    }}
                  />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-semibold truncate" style={{ color: textColor }}>
                    {f.nome || `@${f.username}`}
                  </p>
                  <p className="text-[11px] truncate" style={{ color: f.online ? '#22c55e' : subColor }}>
                    {f.online ? 'Online agora' : '@' + f.username}
                  </p>
                </div>
                <MessageCircle className="w-4 h-4 flex-shrink-0" style={{ color: subColor }} />
              </button>
            ))
          )}
        </div>

        {onAddMore && (
          <div
            className="px-3 pt-3 flex-shrink-0"
            style={{
              borderTop: `1px solid ${border}`,
              // Mais respiro embaixo pra não ficar cortado pela curva do iPhone
              paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)',
            }}
          >
            <button
              onClick={() => { onClose(); onAddMore(); }}
              className="w-full py-2.5 rounded-full text-white text-xs font-bold flex items-center justify-center gap-1.5"
              style={{
                background: '#1e714a',
                fontFamily: 'Lato, system-ui, sans-serif',
                letterSpacing: '0.14em',
              }}
            >
              <UserPlus className="w-3.5 h-3.5" /> Conectar-se
            </button>
          </div>
        )}
      </aside>
    </>,
    document.body,
  );
}

// ─── Hook: detecta swipe horizontal e dispara callback ────────────────────
// Ignora swipes iniciados em elementos com [data-no-swipe] ou descendentes
// (ex: strip horizontal de sugestoes de amizade, stories, qualquer carrossel).
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
    // Apenas swipe PRA ESQUERDA abre o drawer (dx < -70). Swipe pra direita
    // é reservado pra "voltar à tela anterior" (gesto iOS de back).
    const swipeLeft = dx < -70 && Math.abs(dx) > Math.abs(dy) * 1.7;
    if (swipeLeft && dt < 700) onOpen();
  }
  return { onTouchStart, onTouchEnd };
}
