import { useState, useRef, useEffect } from 'react';
import { X, Home, Package, Heart, MessageCircle, Info, CreditCard, Phone, ShieldCheck, FileImage, UserCircle, Settings, LogOut, Bell } from 'lucide-react';
import { useLang } from '../i18n';

type Tab = 'home' | 'meus' | 'likes' | 'chat' | 'sobre' | 'planos' | 'contato' | 'ajustes' | 'conta' | 'notif' | 'leads';

interface MenuDrawerProps {
  open: boolean;
  onClose: () => void;
  activeTab: Tab;
  onGoTo: (tab: Tab) => void;
  unreadChats: number;
  unreadComments: number;
  verificado: boolean;
  docEnviado: boolean;
  onEnviarDocs: () => void;
  onLogout: () => void;
  currentUser: string;
  fotoPerfil?: string;
  isPJ?: boolean;
}

const DRAWER_WIDTH = 300;

export function MenuIcon({ hasAlert, isPJ }: { hasAlert: boolean; isPJ?: boolean }) {
  const top = isPJ ? '#5a7a52' : '#7c3aed';
  const bot = isPJ ? '#b8896a' : '#f97316';
  return (
    <div className="relative w-8 h-8 flex flex-col justify-center gap-[5px] cursor-pointer select-none">
      <span className="block h-[3px] w-6 rounded-full" style={{ background: top }} />
      <span className="block h-[3px] w-6 rounded-full" style={{ background: top }} />
      <span className="block h-[3px] w-6 rounded-full" style={{ background: bot }} />
      <span className="block h-[3px] w-6 rounded-full" style={{ background: bot }} />
      {hasAlert && (
        <span className="absolute -top-1.5 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white" />
      )}
    </div>
  );
}

export function MenuDrawer({
  open, onClose, activeTab, onGoTo, unreadChats, unreadComments,
  verificado, docEnviado, onEnviarDocs, onLogout, currentUser, fotoPerfil, isPJ,
}: MenuDrawerProps) {
  const { AT } = useLang();
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Remove emojis dos rótulos (todos começam com emoji + espaço no i18n)
  const stripEmoji = (s: string) => s.replace(/^\p{Extended_Pictographic}(?:️)?\s*/u, '').trim();
  const label = (s: string) => isPJ ? stripEmoji(s) : s;

  // Build menu items using translated labels
  const MENU_ITEMS: { tab: Tab; icon: React.ElementType; label: string; dividerBefore?: boolean }[] = [
    { tab: 'home',    icon: Home,           label: label(AT.menuHome) },
    { tab: 'meus',    icon: Package,        label: label(AT.menuMyAds) },
    { tab: 'likes',   icon: Heart,          label: isPJ ? 'Painel de Controle' : AT.menuLikes },
    { tab: 'chat',    icon: MessageCircle,  label: label(AT.menuChat) },
    { tab: 'notif',   icon: Bell,           label: isPJ ? 'Notificações' : 'Notificações' },
    { tab: 'conta',   icon: UserCircle,     label: label(AT.menuAccount) },
    { tab: 'planos',  icon: CreditCard,     label: label(AT.menuPlans) },
    { tab: 'ajustes', icon: Settings,       label: label(AT.menuSettings), dividerBefore: true },
    { tab: 'sobre',   icon: Info,           label: label(AT.menuAbout) },
    { tab: 'contato', icon: Phone,          label: label(AT.menuContact) },
  ];

  useEffect(() => {
    if (open) setDragX(0);
  }, [open]);

  const onTouchStart = (e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
    setDragging(true);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging) return;
    const delta = startXRef.current - e.touches[0].clientX;
    setDragX(Math.max(0, Math.min(DRAWER_WIDTH, delta)));
  };

  const onTouchEnd = () => {
    setDragging(false);
    if (dragX > DRAWER_WIDTH * 0.4) onClose();
    else setDragX(0);
  };

  const progress = open ? 1 - dragX / DRAWER_WIDTH : 0;
  const translateX = open ? -dragX : -DRAWER_WIDTH;

  if (!open && dragX === 0) return null;

  const handleTab = (tab: Tab) => { onGoTo(tab); onClose(); };

  return (
    <>
      {/* Backdrop glass */}
      <div
        className="fixed inset-0 z-50"
        style={{
          backdropFilter: `blur(${(progress * 20).toFixed(1)}px) saturate(180%)`,
          WebkitBackdropFilter: `blur(${(progress * 20).toFixed(1)}px) saturate(180%)`,
          backgroundColor: `rgba(120, 60, 180, ${(progress * 0.18).toFixed(2)})`,
          transition: dragging ? 'none' : 'backdrop-filter 0.35s, background-color 0.35s',
          pointerEvents: progress > 0.05 ? 'auto' : 'none',
        }}
        onClick={onClose}
      />

      {/* Drawer — glass panel */}
      <div
        ref={drawerRef}
        className="fixed top-0 left-0 h-full z-50 flex flex-col overflow-hidden"
        style={{
          width: DRAWER_WIDTH,
          transform: `translateX(${translateX}px)`,
          transition: dragging ? 'none' : 'transform 0.35s cubic-bezier(0.4,0,0.2,1)',
          backdropFilter: 'blur(40px) saturate(200%)',
          WebkitBackdropFilter: 'blur(40px) saturate(200%)',
          background: 'linear-gradient(160deg, rgba(255,255,255,0.82) 0%, rgba(245,240,255,0.78) 50%, rgba(255,245,235,0.80) 100%)',
          borderRight: '1.5px solid rgba(255,255,255,0.55)',
          boxShadow: '4px 0 40px rgba(120,60,180,0.18), 0 0 0 0.5px rgba(255,255,255,0.3) inset',
          borderRadius: '0 32px 32px 0',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Header gradient */}
        <div
          className="px-5 py-6 flex items-center justify-between flex-shrink-0"
          style={{
            background: isPJ
              ? 'linear-gradient(135deg, #5a7a52 0%, #b8896a 100%)'
              : 'linear-gradient(135deg, rgba(124,58,237,0.92) 0%, rgba(249,115,22,0.88) 100%)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderBottom: '1px solid rgba(255,255,255,0.25)',
            borderRadius: isPJ ? 0 : '0 32px 0 0',
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-2xl overflow-hidden flex-shrink-0 flex items-center justify-center"
              style={{
                background: 'rgba(255,255,255,0.25)',
                border: '1.5px solid rgba(255,255,255,0.45)',
                backdropFilter: 'blur(10px)',
              }}
            >
              {fotoPerfil
                ? <img src={fotoPerfil} alt="" className="w-full h-full object-cover" />
                : <span className="text-white font-bold text-sm">{currentUser.slice(0, 2).toUpperCase()}</span>
              }
            </div>
            <div>
              <p className="text-white font-bold text-sm drop-shadow-sm">Papo de Alunos</p>
              <p className="text-white/80 text-xs">@{currentUser}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-all"
            style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)' }}
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Alertas */}
        {!verificado && !docEnviado && (
          <div
            className="mx-4 mt-4 px-4 py-3 rounded-2xl"
            style={{ background: 'rgba(254,226,226,0.7)', border: '1px solid rgba(252,165,165,0.5)', backdropFilter: 'blur(10px)' }}
          >
            <p className="text-red-600 text-xs font-semibold">{AT.menuAccountLimited}</p>
          </div>
        )}
        {!verificado && docEnviado && (
          <div
            className="mx-4 mt-4 px-4 py-3 rounded-2xl"
            style={{ background: 'rgba(254,249,195,0.7)', border: '1px solid rgba(253,224,71,0.5)', backdropFilter: 'blur(10px)' }}
          >
            <p className="text-yellow-700 text-xs font-semibold">{AT.menuDocsPending}</p>
          </div>
        )}

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {MENU_ITEMS.map(({ tab, label, dividerBefore }) => {
            const badge = tab === 'chat' ? unreadChats : tab === 'meus' ? unreadComments : 0;
            const isActive = activeTab === tab;
            return (
              <div key={tab}>
                {dividerBefore && <div className="my-2" style={{ height: 1, background: 'rgba(139,92,246,0.15)' }} />}
                <button
                  data-tutorial={tab === 'conta' ? 'tab-conta' : tab === 'ajustes' ? 'tab-ajustes' : undefined}
                  onClick={() => handleTab(tab)}
                  className="w-full flex items-center justify-between px-4 py-3 transition-all"
                  style={isPJ ? {
                    borderRadius: 2,
                    background: isActive ? '#ffffff' : 'transparent',
                    color: isActive ? '#1a1a1a' : '#4b5563',
                    border: isActive ? '1px solid #b8896a' : '1px solid transparent',
                    fontFamily: '"Source Serif 4", Georgia, serif',
                    fontSize: 11,
                    fontWeight: 500,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    boxShadow: 'none',
                  } : {
                    borderRadius: 18,
                    background: isActive
                      ? 'linear-gradient(135deg, rgba(124,58,237,0.85) 0%, rgba(249,115,22,0.80) 100%)'
                      : 'transparent',
                    color: isActive ? '#fff' : '#4b5563',
                    backdropFilter: isActive ? 'blur(10px)' : 'none',
                    border: isActive ? '1px solid rgba(255,255,255,0.3)' : '1px solid transparent',
                    boxShadow: isActive ? '0 4px 15px rgba(124,58,237,0.25)' : 'none',
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = isPJ ? '#f5f2ec' : 'rgba(139,92,246,0.08)'; }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <span>{label}</span>
                  {badge > 0 && (
                    <span className="bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </button>
              </div>
            );
          })}

          <div className="my-2" style={{ height: 1, background: 'rgba(139,92,246,0.15)' }} />

          {!verificado && (
            <button
              onClick={() => { onEnviarDocs(); onClose(); }}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold transition-all"
              style={{ borderRadius: 18, color: '#7c3aed', border: '1px solid transparent' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(139,92,246,0.08)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <div className="flex items-center gap-2">
                <FileImage className="w-4 h-4 text-purple-500" />
                <span>{AT.menuSendDocs}</span>
              </div>
              {!docEnviado && (
                <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{AT.menuAttention}</span>
              )}
            </button>
          )}

          {verificado && (
            <div className="flex items-center gap-2 px-4 py-3 text-green-600 text-sm font-semibold">
              <ShieldCheck className="w-4 h-4" />
              <span>{AT.menuVerified}</span>
            </div>
          )}

          <div className="my-2" style={{ height: 1, background: 'rgba(239,68,68,0.15)' }} />

          <button
            onClick={() => { onClose(); onLogout(); }}
            className="w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold transition-all"
            style={{ borderRadius: 18, color: '#ef4444', border: '1px solid transparent' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.07)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <LogOut className="w-4 h-4" />
            <span>{AT.menuLogout}</span>
          </button>
        </nav>
      </div>
    </>
  );
}
