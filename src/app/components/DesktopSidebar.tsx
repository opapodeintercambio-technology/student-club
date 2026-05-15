import { Home, Search, MessageCircle, Heart, Users, LayoutGrid, FileText, ShoppingBag, Info, Calendar as CalendarIcon, Menu as MenuLucide, GraduationCap, User as UserIcon } from 'lucide-react';

interface Props {
  activeTab: string;
  goTo: (t: any) => void;
  currentUser: string;
  fotoPerfil: string | null;
  unreadChats: number;
  unreadNotifs: number;
  unreadComments: number;
  pendingRequestsCount: number;
  userTipoConta: 'pf' | 'pj';
  onOpenMenu: () => void;
  onOpenMeets: () => void;
}

interface Item {
  key: string;          // tab name OR 'menu'/'meets' for modal items
  label: string;
  icon: typeof Home;
  badge?: number;
  isModal?: boolean;    // true → use onOpenMenu/onOpenMeets em vez de goTo
  modalAction?: 'menu' | 'meets';
}

export function DesktopSidebar({
  activeTab, goTo, currentUser, fotoPerfil,
  unreadChats, unreadNotifs, unreadComments, pendingRequestsCount,
  userTipoConta, onOpenMenu, onOpenMeets,
}: Props) {
  const isPJ = userTipoConta === 'pj';

  const items: Item[] = [
    { key: 'home',        label: 'Início',         icon: Home },
    { key: 'studentclub', label: 'Student Club',   icon: GraduationCap },
    { key: 'pesquisar',   label: 'Pesquisar',      icon: Search },
    { key: 'chat',        label: 'Mensagens',      icon: MessageCircle, badge: unreadChats },
    { key: 'notif',       label: 'Notificações',   icon: Heart,         badge: unreadNotifs },
    { key: 'amigos',      label: 'Amigos',         icon: Users },
    { key: 'meus',        label: isPJ ? 'Anúncios' : 'Meus Docs', icon: FileText, badge: unreadComments },
    // PJ: Painel = likes (PainelControle). PF: Painel = gastos (Gastos).
    { key: isPJ ? 'likes' : 'gastos', label: 'Painel', icon: LayoutGrid },
    // Informações (apenas PF — abre InfoTab que vive na rota 'likes')
    ...(!isPJ ? [{ key: 'likes' as string, label: 'Informações', icon: Info }] : []),
    { key: 'store',       label: 'Papo Store',     icon: ShoppingBag },
    { key: 'meets',       label: 'Meets',          icon: CalendarIcon, isModal: true, modalAction: 'meets' as const },
    { key: 'menu',        label: 'Menu',           icon: MenuLucide,   isModal: true, modalAction: 'menu' as const, badge: pendingRequestsCount },
  ];

  return (
    <aside
      className="hidden md:flex fixed left-0 top-0 bottom-0 z-40 flex-col items-center bg-white border-r border-gray-200"
      style={{ width: 76, paddingTop: 18, paddingBottom: 18 }}
      aria-label="Navegação principal"
    >
      <nav className="flex-1 flex flex-col items-center gap-1.5 w-full px-2">
        {items.map((it, idx) => {
          const active = !it.isModal && activeTab === it.key;
          const Icon = it.icon;
          return (
            <button
              key={`${it.key}-${idx}`}
              onClick={() => {
                if (it.isModal) {
                  if (it.modalAction === 'menu') onOpenMenu();
                  else if (it.modalAction === 'meets') onOpenMeets();
                  return;
                }
                goTo(it.key);
              }}
              className="group relative w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-150 hover:bg-gray-100 active:scale-95"
              style={{
                background: active ? '#f3f4f6' : 'transparent',
              }}
              aria-label={it.label}
            >
              <Icon
                className="w-[24px] h-[24px] transition-transform duration-200 group-hover:scale-110"
                strokeWidth={active ? 2.4 : 1.7}
                style={{ color: active ? '#0a0a0a' : '#262626' }}
              />
              {!!it.badge && it.badge > 0 && (
                <span className="absolute top-1 right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {it.badge > 99 ? '99+' : it.badge}
                </span>
              )}
              <span
                className="pointer-events-none absolute left-[58px] top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-md text-xs font-medium text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                style={{ background: '#1f2937', transitionDelay: '120ms' }}
              >
                {it.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Avatar = Conta */}
      <button
        onClick={() => goTo('conta')}
        className="group relative w-12 h-12 rounded-xl flex items-center justify-center mt-2 hover:bg-gray-100 transition-colors"
        style={{ background: activeTab === 'conta' ? '#f3f4f6' : 'transparent' }}
        aria-label="Minha Página"
      >
        {fotoPerfil ? (
          <img
            src={fotoPerfil}
            alt=""
            className="w-8 h-8 rounded-full object-cover"
            style={{ border: activeTab === 'conta' ? '2px solid #1f2937' : '2px solid transparent' }}
          />
        ) : (
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
            style={{
              background: '#e5e7eb',
              color: '#374151',
              border: activeTab === 'conta' ? '2px solid #1f2937' : '2px solid transparent',
            }}
          >
            {currentUser?.charAt(0).toUpperCase() || <UserIcon className="w-4 h-4" />}
          </div>
        )}
        <span
          className="pointer-events-none absolute left-[58px] top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-md text-xs font-medium text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
          style={{ background: '#1f2937', transitionDelay: '120ms' }}
        >
          Minha Página
        </span>
      </button>
    </aside>
  );
}
