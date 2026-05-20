import { useState, useRef, useEffect } from 'react';
import { X, Info, ShieldCheck, LogOut, Search, Users, Calendar as CalendarIcon, LayoutGrid, GraduationCap, HelpCircle, Settings, ShoppingBag } from 'lucide-react';
import { useLang } from '../i18n';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';

type Tab = 'home' | 'meus' | 'likes' | 'chat' | 'sobre' | 'planos' | 'contato' | 'ajustes' | 'conta' | 'notif' | 'leads' | 'gastos' | 'pesquisar' | 'amigos' | 'store' | 'meets' | 'studentclub';

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
  onOpenTutorial?: () => void;
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
  verificado, docEnviado, onEnviarDocs, onLogout, onOpenTutorial, currentUser, fotoPerfil, isPJ,
}: MenuDrawerProps) {
  // Trava scroll do body ENQUANTO menu aberto. Sem isso, ao arrastar o
  // drawer pra baixo no iOS, a pagina por baixo rola junto.
  useLockBodyScroll(open);
  const { AT } = useLang();
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Ordem do menu MOBILE definida pelo usuário (difere do desktop):
  // Início foi pra BottomNav (substituiu o botão Menu). Aqui ficam:
  // Student Club, Meets, Pesquisas, Amigos, Painel, Informações (só não-PJ),
  // Configurações, Tutorial, Sair.
  const MENU_ITEMS: { tab: Tab; icon: React.ElementType; label: string; dividerBefore?: boolean }[] = [
    { tab: 'studentclub', icon: GraduationCap, label: 'Student Club' },
    { tab: 'store',       icon: ShoppingBag,   label: 'Papo Store' },
    { tab: 'meets',       icon: CalendarIcon,  label: 'Meets' },
    { tab: 'pesquisar',   icon: Search,        label: 'Pesquisas' },
    { tab: 'amigos',      icon: Users,         label: 'Amigos' },
    { tab: (isPJ ? 'likes' : 'gastos') as Tab, icon: LayoutGrid, label: 'Painel' },
    ...(!isPJ ? [{ tab: 'likes' as Tab, icon: Info, label: 'Informações' }] : []),
    { tab: 'ajustes',     icon: Settings,      label: 'Configurações', dividerBefore: true },
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

      {/* Drawer — IDÊNTICO ao DesktopSidebar (branco, ícones lucide + Source
          Serif 4). Mantém apenas o header com info do user pra mobile fazer
          sentido (no desktop o user é mostrado no avatar superior do app). */}
      <div
        ref={drawerRef}
        className="fixed top-0 left-0 h-full z-[70] flex flex-col overflow-hidden"
        style={{
          width: DRAWER_WIDTH,
          transform: `translateX(${translateX}px)`,
          transition: dragging ? 'none' : 'transform 0.35s cubic-bezier(0.4,0,0.2,1)',
          background: 'var(--sc-bg)',
          borderRight: '1px solid var(--sc-drawer-border)',
          boxShadow: '4px 0 28px rgba(0,0,0,0.08)',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Header branco com avatar + @user + X de fechar */}
        <div
          className="px-4 flex items-center justify-between flex-shrink-0"
          style={{
            background: '#ffffff',
            borderBottom: '1px solid #f1f5f9',
            paddingTop: 'calc(env(safe-area-inset-top) + 18px)',
            paddingBottom: 18,
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center"
              style={{ background: '#f3f4f6', border: '1px solid #e5e7eb' }}
            >
              {fotoPerfil
                ? <img src={fotoPerfil} alt="" className="w-full h-full object-cover" />
                : <span className="font-bold text-sm" style={{ color: '#0a0a0a' }}>{currentUser.slice(0, 2).toUpperCase()}</span>
              }
            </div>
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
                {currentUser}
              </p>
              {verificado && (
                <p className="flex items-center gap-1 text-[11px]" style={{ color: '#16a34a' }}>
                  <ShieldCheck className="w-3 h-3" /> {AT.menuVerified}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-gray-100 transition-colors"
            aria-label="Fechar menu"
          >
            <X className="w-5 h-5" style={{ color: '#262626' }} />
          </button>
        </div>

        <style>{`
          @keyframes papo-ping {
            0%   { transform: scale(1);   opacity: 0.7; }
            70%  { transform: scale(2.4); opacity: 0; }
            100% { transform: scale(2.4); opacity: 0; }
          }
        `}</style>

        {/* Items — IDÊNTICO ao DesktopSidebar: h-12 rounded-xl, ícone 24px,
            label Source Serif 4, cores #0a0a0a (ativo) / #262626 (inativo),
            Student Club destacado em laranja #f97316 */}
        <nav className="flex-1 overflow-y-auto py-2 px-3 space-y-1">
          {MENU_ITEMS.map(({ tab, icon: Icon, label, dividerBefore }, idx) => {
            const badge =
              tab === 'chat'  ? unreadChats :
              tab === 'meus'  ? unreadComments :
              tab === 'notif' ? unreadNotifs :
                                0;
            const isActive = activeTab === tab;
            const isStudent = tab === 'studentclub';
            return (
              <div key={`${tab}-${idx}`}>
                {dividerBefore && <div className="my-2 mx-1" style={{ height: 1, background: '#f1f5f9' }} />}
                <button
                  data-tutorial={tab === 'conta' ? 'tab-conta' : tab === 'ajustes' ? 'tab-ajustes' : undefined}
                  onClick={() => handleTab(tab)}
                  className="relative w-full h-12 rounded-xl flex items-center active:scale-[0.98] transition-colors"
                  style={{
                    background: isActive ? 'var(--sc-active-pill)' : 'transparent',
                    paddingLeft: 12,
                    paddingRight: 12,
                  }}
                  aria-label={label}
                >
                  <span className="relative w-6 h-6 flex items-center justify-center flex-shrink-0">
                    <Icon
                      className="w-[24px] h-[24px]"
                      strokeWidth={isActive ? 2.8 : 2.4}
                      style={{ color: isStudent ? '#f97316' : (isActive ? 'var(--sc-active-text)' : 'var(--sc-inactive-text)') }}
                    />
                    {badge > 0 && (
                      <span className="absolute -top-1 -right-1.5 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </span>
                  <span
                    className="ml-4 text-[15px] whitespace-nowrap flex items-center gap-2"
                    style={{
                      color: isStudent ? '#f97316' : (isActive ? 'var(--sc-active-text)' : 'var(--sc-inactive-text)'),
                      fontWeight: isStudent ? 600 : (isActive ? 600 : 400),
                      fontFamily: '"Source Serif 4", Georgia, serif',
                      letterSpacing: '0.01em',
                    }}
                  >
                    {label}
                    {tab === 'notif' && badge > 0 && (
                      <span className="relative inline-flex">
                        <span
                          className="absolute inline-flex w-2 h-2 rounded-full opacity-60"
                          style={{ background: '#ef4444', animation: 'papo-ping 1.4s ease-in-out infinite' }}
                        />
                        <span
                          className="relative inline-flex w-2 h-2 rounded-full"
                          style={{ background: '#ef4444' }}
                        />
                      </span>
                    )}
                  </span>
                </button>
              </div>
            );
          })}

          {/* Tutorial — callback opcional */}
          {onOpenTutorial && (
            <button
              onClick={() => { onClose(); onOpenTutorial(); }}
              className="relative w-full h-12 rounded-xl flex items-center hover:bg-gray-100 transition-colors active:scale-[0.98]"
              style={{ paddingLeft: 12, paddingRight: 12 }}
              aria-label="Tutorial"
            >
              <span className="relative w-6 h-6 flex items-center justify-center flex-shrink-0">
                <HelpCircle
                  className="w-[24px] h-[24px]"
                  strokeWidth={2.4}
                  style={{ color: '#262626' }}
                />
              </span>
              <span
                className="ml-4 text-[15px] whitespace-nowrap"
                style={{
                  color: '#262626',
                  fontWeight: 400,
                  fontFamily: '"Source Serif 4", Georgia, serif',
                  letterSpacing: '0.01em',
                }}
              >
                Tutorial
              </span>
            </button>
          )}

          {/* Sair — DENTRO do nav (garantia de visibilidade no mobile) */}
          <div className="my-2 mx-1" style={{ height: 1, background: '#f1f5f9' }} />
          <button
            onClick={() => {
              if (confirm('Sair da conta?')) { onClose(); onLogout(); }
            }}
            className="relative w-full h-12 rounded-xl flex items-center hover:bg-red-50 transition-colors active:scale-[0.98]"
            style={{ paddingLeft: 12, paddingRight: 12, marginBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
            aria-label="Sair"
          >
            <span className="w-6 h-6 flex items-center justify-center flex-shrink-0">
              <LogOut className="w-[22px] h-[22px]" strokeWidth={1.7} style={{ color: '#dc2626' }} />
            </span>
            <span
              className="ml-4 text-[15px] whitespace-nowrap"
              style={{
                color: '#dc2626',
                fontWeight: 500,
                fontFamily: '"Source Serif 4", Georgia, serif',
                letterSpacing: '0.01em',
              }}
            >
              {AT.menuLogout || 'Sair'}
            </span>
          </button>
        </nav>
      </div>
    </>
  );
}
