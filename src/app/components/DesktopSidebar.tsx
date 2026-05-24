import { useEffect, useRef } from 'react';
import { Home, Search, MessageCircle, Heart, Users, LayoutGrid, FileText, ShoppingBag, Info, Calendar as CalendarIcon, Menu as MenuLucide, GraduationCap, Settings, LogOut, Camera, User as UserIcon, Lock, Mail, Star } from 'lucide-react';

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
  onOpenStore?: () => void;
  onSignOut?: () => void;
  /** Quando true (user já está no destino) esconde "Meus Docs". */
  jaNoIntercambio?: boolean;
}

interface Item {
  key: string;          // tab name OR 'menu'/'meets' for modal items
  label: string;
  icon: typeof Home;
  badge?: number;
  isModal?: boolean;    // true → use onOpenMenu/onOpenMeets em vez de goTo
  modalAction?: 'menu' | 'meets' | 'store' | 'composer';
  /** Quando presente, renderiza um header de secao acima deste item */
  sectionTitle?: string;
}

export function DesktopSidebar({
  activeTab, goTo, currentUser, fotoPerfil,
  unreadChats, unreadNotifs, unreadComments, pendingRequestsCount,
  userTipoConta, onOpenMenu, onOpenMeets, onOpenStore, onSignOut,
  jaNoIntercambio = false,
}: Props) {
  const isPJ = userTipoConta === 'pj';

  // Sidebar desktop usa as mesmas secoes/itens do MenuDrawer mobile —
  // unicidade de UX. sectionTitle desenha um header acima do item; visivel
  // apenas quando a sidebar expande no hover (240px).
  const items: Item[] = [
    // ── Navegacao ───────────────────────────────────────────────────────
    { key: 'home',        label: 'Início',         icon: Home,          sectionTitle: 'Navegação' },
    { key: 'composer',    label: 'Postar',         icon: Camera,        isModal: true, modalAction: 'composer' as const },
    { key: 'notif',       label: 'Notificações',   icon: Heart,         badge: unreadNotifs },
    { key: 'chat',        label: 'Mensagens',      icon: MessageCircle, badge: unreadChats },
    { key: 'pesquisar',   label: 'Pesquisar',      icon: Search },
    { key: 'amigos',      label: 'Amigos',         icon: Users },

    // ── Intercambio ─────────────────────────────────────────────────────
    { key: 'studentclub', label: 'Student Club',   icon: GraduationCap, sectionTitle: 'Intercâmbio' },
    { key: 'store',       label: 'Papo Store',     icon: ShoppingBag, isModal: true, modalAction: 'store' as const },
    { key: 'meets',       label: 'Meets',          icon: CalendarIcon, isModal: true, modalAction: 'meets' as const },
    ...(isPJ || !jaNoIntercambio
      ? [{ key: 'meus' as string, label: isPJ ? 'Anúncios' : 'Meus Docs', icon: FileText, badge: unreadComments }]
      : []),
    ...(!isPJ ? [{ key: 'likes' as string, label: 'Informações', icon: Info }] : []),
    { key: isPJ ? 'likes' : 'gastos', label: 'Painel', icon: LayoutGrid },

    // ── Conta ───────────────────────────────────────────────────────────
    { key: 'conta',       label: 'Minha Página',   icon: UserIcon,      sectionTitle: 'Conta' },
    { key: 'ajustes',     label: 'Configurações',  icon: Settings },
    { key: 'seguranca',   label: 'Segurança',      icon: Lock },

    // ── Suporte ─────────────────────────────────────────────────────────
    // Aba "Sobre" removida do menu a pedido do user.
    { key: 'planos',      label: 'Planos',         icon: Star,          sectionTitle: 'Suporte' },
    { key: 'contato',     label: 'Contato',        icon: Mail },
  ];

  // Trava o scroll da página quando o ponteiro está sobre a sidebar.
  // overscroll-behavior:contain não basta no macOS — o trackpad com inércia
  // ainda propaga o "elastic bounce" pra <html>. Aqui interceptamos o wheel
  // num listener NÃO-passivo (React.onWheel é passivo por padrão e não
  // consegue chamar preventDefault no Safari/Chrome modernos), redirecionamos
  // o delta pra própria nav e bloqueamos o resto.
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      el.scrollTop += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel as any);
  }, []);

  return (
    <aside
      className="hidden md:flex group/sidebar fixed left-0 top-0 bottom-0 z-50 flex-col papo-menu-glass overflow-hidden transition-[width,box-shadow] duration-300 ease-out w-[76px] hover:w-[240px] hover:shadow-xl"
      style={{
        // Sidebar comeca no topo absoluto. z-50 (acima do header z-40) faz
        // ela visualmente cobrir o trecho da top bar do lado esquerdo —
        // primeiro icone (Inicio) aparece logo no topo do viewport.
        paddingTop: 'calc(env(safe-area-inset-top) + 8px)',
        paddingBottom: 18,
      }}
      aria-label="Navegação principal"
    >
      <nav
        ref={navRef}
        className="flex-1 flex flex-col gap-3 w-full px-3 overflow-y-auto"
        style={{ overscrollBehavior: 'contain', scrollbarWidth: 'thin' }}
      >
        {items.map((it, idx) => {
          const active = !it.isModal && activeTab === it.key;
          const Icon = it.icon;
          const sectionHeader = it.sectionTitle ? (
            <div
              key={`sec-${it.sectionTitle}-${idx}`}
              className="px-3 pb-1 uppercase opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-200 delay-75"
              style={{
                fontSize: 10,
                letterSpacing: '0.14em',
                color: '#8e8e8e',
                fontFamily: '"Lato", system-ui, sans-serif',
                fontWeight: 700,
                paddingTop: idx === 0 ? 0 : 12,
              }}
            >
              {it.sectionTitle}
            </div>
          ) : null;
          const button = (
            <button
              key={`${it.key}-${idx}`}
              onClick={() => {
                if (it.isModal) {
                  if (it.modalAction === 'menu') onOpenMenu();
                  else if (it.modalAction === 'meets') onOpenMeets();
                  else if (it.modalAction === 'store') onOpenStore?.();
                  else if (it.modalAction === 'composer') {
                    // Mesma logica do botao Camera do BottomNav mobile
                    goTo('home');
                    window.dispatchEvent(new CustomEvent('papo-open-composer'));
                  }
                  return;
                }
                goTo(it.key);
              }}
              className="sc-sidebar-item relative h-12 rounded-xl flex items-center transition-colors duration-150 active:scale-[0.98]"
              style={{
                /* Sem pill persistente em nenhum item — pedido do user.
                   Pill só aparece em :hover via CSS. */
                background: undefined,
                paddingLeft: 12,
                paddingRight: 12,
              }}
              aria-label={it.label}
            >
              <span className="relative w-6 h-6 flex items-center justify-center flex-shrink-0">
                <Icon
                  className="w-[24px] h-[24px]"
                  strokeWidth={active ? 2.8 : 2.4}
                  style={{
                    // Student Club destacado em laranja pra chamar atencao do aluno
                    color: it.key === 'studentclub' ? '#f97316' : (active ? 'var(--sc-active-text)' : 'var(--sc-inactive-text)'),
                  }}
                />
                {!!it.badge && it.badge > 0 && (
                  <span className="absolute -top-1 -right-1.5 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {it.badge > 99 ? '99+' : it.badge}
                  </span>
                )}
              </span>
              <span
                className="ml-4 text-[15px] whitespace-nowrap opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-200 delay-75"
                style={{
                  color: it.key === 'studentclub' ? '#f97316' : (active ? '#0a0a0a' : '#262626'),
                  fontWeight: it.key === 'studentclub' ? 600 : (active ? 600 : 400),
                  fontFamily: '"Source Serif 4", Georgia, serif',
                  letterSpacing: '0.01em',
                }}
              >
                {it.label}
              </span>
            </button>
          );
          return (
            <div key={`grp-${it.key}-${idx}`}>
              {sectionHeader}
              {button}
            </div>
          );
        })}
      </nav>

      {/* Sair — destacado em vermelho. Pede confirmação pra evitar logout
          acidental, especialmente em sessões compartilhadas. */}
      {onSignOut && (
        <button
          onClick={() => {
            if (confirm('Sair da conta?')) onSignOut();
          }}
          className="relative h-12 rounded-xl flex items-center mt-1 mx-3 hover:bg-red-50 transition-colors"
          style={{ paddingLeft: 12, paddingRight: 12 }}
          aria-label="Sair"
        >
          <span className="w-6 h-6 flex items-center justify-center flex-shrink-0">
            <LogOut className="w-[22px] h-[22px]" strokeWidth={1.7} style={{ color: '#dc2626' }} />
          </span>
          <span
            className="ml-4 text-[15px] whitespace-nowrap opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-200 delay-75"
            style={{
              color: '#dc2626',
              fontWeight: 500,
              fontFamily: '"Source Serif 4", Georgia, serif',
              letterSpacing: '0.01em',
            }}
          >
            Sair
          </span>
        </button>
      )}
    </aside>
  );
}
