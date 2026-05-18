import { useState, useRef, useEffect } from 'react';
import { X, Home, Package, MessageCircle, Info, Phone, ShieldCheck, FileImage, UserCircle, Settings, LogOut, Heart, Wallet, Search, Users, ShoppingBag, Calendar, LayoutGrid } from 'lucide-react';
import { useLang } from '../i18n';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';

type Tab = 'home' | 'meus' | 'likes' | 'chat' | 'sobre' | 'planos' | 'contato' | 'ajustes' | 'conta' | 'notif' | 'leads' | 'gastos' | 'pesquisar' | 'amigos' | 'store' | 'meets';

interface MenuDrawerProps {
  open: boolean;
  onClose: () => void;
  activeTab: Tab;
  onGoTo: (tab: Tab) => void;
  unreadChats: number;
  unreadComments: number;
  unreadNotifs?: number;
  verificado: boolean;
  docEnviado: boolean;
  onEnviarDocs: () => void;
  onLogout: () => void;
  currentUser: string;
  fotoPerfil?: string;
  isPJ?: boolean;
}

const DRAWER_WIDTH = 300;

export function MenuIcon({ hasAlert }: { hasAlert: boolean; isPJ?: boolean }) {
  // Tema Cassidy unificado: musgo + cobre
  const top = '#5a7a52';
  const bot = '#b8896a';
  return (
    <div className="relative w-8 h-8 flex flex-col justify-center gap-[5px] cursor-pointer select-none">
      <span className="block h-[3px] w-6 rounded-full" style={{ background: top }} />
      <span className="block h-[3px] w-6 rounded-full" style={{ background: top }} />
      <span className="block h-[3px] w-6 rounded-full" style={{ background: bot }} />
      <span className="block h-[3px] w-6 rounded-full" style={{ background: bot }} />
      {hasAlert && (
        <>
          <style>{`
            @keyframes papo-icon-ping {
              0%   { transform: scale(1);   opacity: 0.7; }
              70%  { transform: scale(2.2); opacity: 0; }
              100% { transform: scale(2.2); opacity: 0; }
            }
          `}</style>
          <span
            className="absolute -top-1.5 -right-1 w-3 h-3 rounded-full"
            style={{ background: '#ef4444', animation: 'papo-icon-ping 1.4s ease-in-out infinite' }}
          />
          <span
            className="absolute -top-1.5 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white"
            style={{ boxShadow: '0 0 6px rgba(239,68,68,0.7)' }}
          />
        </>
      )}
    </div>
  );
}

export function MenuDrawer({
  open, onClose, activeTab, onGoTo, unreadChats, unreadComments, unreadNotifs = 0,
  verificado, docEnviado, onEnviarDocs, onLogout, currentUser, fotoPerfil, isPJ,
}: MenuDrawerProps) {
  // Trava scroll do body ENQUANTO menu aberto. Sem isso, ao arrastar o
  // drawer pra baixo no iOS, a pagina por baixo rola junto.
  useLockBodyScroll(open);
  const { AT } = useLang();
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Remove emojis dos rótulos (todos começam com emoji + espaço no i18n)
  const stripEmoji = (s: string) => s.replace(/^\p{Extended_Pictographic}(?:️)?\s*/u, '').trim();
  const label = (s: string) => stripEmoji(s);

  // Build menu items using translated labels — ordem reorganizada
  // Itens removidos do drawer (já acessíveis via bottom nav no mobile / sidebar no desktop):
  //   home (Início), meus (Meus Docs/Anúncios), gastos (Painel), chat (Mensagens)
  const MENU_ITEMS: { tab: Tab; icon: React.ElementType; label: string; dividerBefore?: boolean }[] = [
    { tab: 'store',     icon: ShoppingBag,   label: 'Store' },
    { tab: 'likes',     icon: Info,          label: isPJ ? 'Painel de Controle' : 'Informações' },
    { tab: 'meus',      icon: FileImage,     label: isPJ ? 'Anúncios' : 'Meus Docs' },
    { tab: 'meets',     icon: Calendar,      label: 'Meets' },
    { tab: 'pesquisar', icon: Search,        label: 'Pesquisar' },
    { tab: 'amigos',    icon: Users,         label: 'Amigos' },
    { tab: 'notif',     icon: Heart,         label: 'Notificações' },
    { tab: 'conta',     icon: UserCircle,    label: label(AT.menuAccount), dividerBefore: true },
    { tab: 'ajustes',   icon: Settings,      label: label(AT.menuSettings) },
    { tab: 'sobre',     icon: Info,          label: label(AT.menuAbout) },
    { tab: 'contato',   icon: Phone,         label: label(AT.menuContact) },
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
      {/* Backdrop glass — tema Cassidy */}
      <div
        className="fixed inset-0 z-50"
        style={{
          backdropFilter: `blur(${(progress * 20).toFixed(1)}px) saturate(180%)`,
          WebkitBackdropFilter: `blur(${(progress * 20).toFixed(1)}px) saturate(180%)`,
          backgroundColor: `rgba(60, 60, 50, ${(progress * 0.22).toFixed(2)})`,
          transition: dragging ? 'none' : 'backdrop-filter 0.35s, background-color 0.35s',
          pointerEvents: progress > 0.05 ? 'auto' : 'none',
        }}
        onClick={onClose}
      />

      {/* Drawer — tema Cassidy (papel/cobre) */}
      <div
        ref={drawerRef}
        className="fixed top-0 left-0 h-full z-50 flex flex-col overflow-hidden"
        style={{
          width: DRAWER_WIDTH,
          transform: `translateX(${translateX}px)`,
          transition: dragging ? 'none' : 'transform 0.35s cubic-bezier(0.4,0,0.2,1)',
          background: '#fafaf7',
          borderRight: '1px solid #d6d3d1',
          boxShadow: '4px 0 40px rgba(90, 122, 82, 0.12)',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Header — paddingTop respeita Dynamic Island / status bar do iPhone PWA */}
        <div
          className="px-5 flex items-center justify-between flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, #1e714a 0%, #4ade80 100%)',
            borderBottom: '1px solid rgba(255,255,255,0.18)',
            paddingTop: 'calc(env(safe-area-inset-top) + 24px)',
            paddingBottom: 24,
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
              <p
                className="text-white font-bold text-sm"
                style={{ fontFamily: '"DM Sans", system-ui, sans-serif', letterSpacing: '0.08em' }}
              >
                Student Club
              </p>
              <p className="text-white/85 text-xs" style={{ letterSpacing: '0.04em' }}>@{currentUser}</p>
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

        <style>{`
          @keyframes papo-ping {
            0%   { transform: scale(1);   opacity: 0.7; }
            70%  { transform: scale(2.4); opacity: 0; }
            100% { transform: scale(2.4); opacity: 0; }
          }
        `}</style>
        {/* Nav items — tema Cassidy */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {MENU_ITEMS.map(({ tab, label, dividerBefore }) => {
            const badge =
              tab === 'chat'  ? unreadChats :
              tab === 'meus'  ? unreadComments :
              tab === 'notif' ? unreadNotifs :
                                0;
            const isActive = activeTab === tab;
            return (
              <div key={tab}>
                {dividerBefore && <div className="my-2" style={{ height: 1, background: '#e7e5e4' }} />}
                <button
                  data-tutorial={tab === 'conta' ? 'tab-conta' : tab === 'ajustes' ? 'tab-ajustes' : undefined}
                  onClick={() => handleTab(tab)}
                  className="w-full flex items-center justify-between px-4 py-3 transition-all"
                  style={{
                    borderRadius: 2,
                    background: isActive ? '#ffffff' : 'transparent',
                    color: isActive ? '#1a1a1a' : '#57534e',
                    border: isActive ? '1px solid #b8896a' : '1px solid transparent',
                    fontFamily: '"DM Sans", system-ui, sans-serif',
                    fontSize: 11,
                    fontWeight: 500,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    boxShadow: 'none',
                  }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = '#f5f2ec'; }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <span className="flex items-center gap-2">
                    {label}
                    {/* Ping vermelho pulsante quando há notificações pendentes */}
                    {tab === 'notif' && badge > 0 && (
                      <span className="relative inline-flex">
                        <span
                          className="absolute inline-flex w-2.5 h-2.5 rounded-full opacity-60"
                          style={{ background: '#ef4444', animation: 'papo-ping 1.4s ease-in-out infinite' }}
                        />
                        <span
                          className="relative inline-flex w-2.5 h-2.5 rounded-full"
                          style={{ background: '#ef4444', boxShadow: '0 0 6px #ef4444' }}
                        />
                      </span>
                    )}
                  </span>
                  {badge > 0 && (
                    <span
                      className="text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center"
                      style={{
                        background: tab === 'notif' ? '#ef4444' : '#b8896a',
                        boxShadow: tab === 'notif' ? '0 0 6px rgba(239,68,68,0.6)' : 'none',
                      }}
                    >
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </button>
              </div>
            );
          })}

          <div className="my-2" style={{ height: 1, background: '#e7e5e4' }} />

          {/* "Enviar Documentos" foi movido pra dentro da aba "Minha Conta" */}

          {verificado && (
            <div
              className="flex items-center gap-2 px-4 py-3"
              style={{
                color: '#5a7a52',
                fontFamily: '"DM Sans", system-ui, sans-serif',
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
              }}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{AT.menuVerified}</span>
            </div>
          )}

          <div className="my-2" style={{ height: 1, background: '#e7e5e4' }} />

          <button
            onClick={() => { onClose(); onLogout(); }}
            className="w-full flex items-center gap-2 px-4 py-3 transition-all"
            style={{
              borderRadius: 2,
              color: '#b91c1c',
              border: '1px solid transparent',
              fontFamily: '"DM Sans", system-ui, sans-serif',
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#fbeae9'; }}
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
