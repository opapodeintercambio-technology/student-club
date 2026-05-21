import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { Search, Sparkles, ChevronDown, Gift, Calendar as CalendarIcon, Lock, Bell, Info, X as XIcon, Home, FileText, MessageCircle, LayoutGrid, GraduationCap, Globe, HelpCircle, Menu as MenuLucide, Heart, Camera, ShoppingBag } from 'lucide-react';
import { useTheme } from './hooks/useTheme';
import { useAutoUpdate } from './hooks/useAutoUpdate';
import { usePageTranslator } from './hooks/usePageTranslator';
import { retryPendingTrip } from './components/countries';
import { usePushNotification } from './hooks/usePushNotification';
import { supabase, incrementVisualizacoes, insertMatch, recordAnuncioView } from '../lib/supabase';
import { LoginScreen, distanciaKm } from './components/LoginScreen';
// (removido cleanup: ProductCard, CreateProduct — marketplace antigo)
import type { Product } from './types';
import { BlockedScreen } from './components/BlockedScreen';
import { ChatPanel } from './components/ChatPanel';
// (removido cleanup: RatingModal — sistema de avaliacao antigo)
import { ChatsTab } from './components/ChatsTab';
// (removido cleanup: MatchSuggestions, TradeAnalysis, SwipeMatch — marketplace antigo)
import { SocialProof } from './components/SocialProof';
import { AboutSection } from './components/AboutSection';
import { ContactSection } from './components/ContactSection';
import { PricingSection } from './components/PricingSection';
import { DocsProgressBar } from './components/DocsProgressBar';
// (removido cleanup: CommentsPanel — comments de anúncios do marketplace)
// (removido cleanup: ProductDetail — marketplace antigo)
import { FiltersPanel, FILTERS_DEFAULT } from './components/FiltersPanel';
import type { Filters } from './components/FiltersPanel';
import { Stories } from './components/Stories';
import { FeedNews } from './components/FeedNews';
import { StudentClubCard } from './components/StudentClubCard';
import { FriendsDrawer } from './components/FriendsDrawer';
import { fetchFriendsRemote, fetchSentRequestsRemote, getPendingRequests, reconcileUsernameChanges } from './components/friends';
import { NotificationsTab } from './components/NotificationsTab';
import { SearchUsers, FriendsTab } from './components/SearchUsers';
import { FriendsOnline } from './components/FriendsOnline';
import { VerificationScreen } from './components/VerificationScreen';

// PERFORMANCE: lazy loading dos componentes pesados que so abrem em
// rotas/modais especificas (e nunca na home padrao). Cada um vira um
// chunk separado e so e baixado quando o user navega ate la.
//   - PainelControle traz recharts inteiro (~500KB), so vista no painel admin
//   - MyDocs/InfoTab/PapoStore/Meets/Gastos: telas dedicadas
//   - LeadsTab/SettingsTab/MinhaContaTab: telas de admin/perfil
//   - PromoCarousel: so na home logada (mantemos eager... revisar depois)
const MyDocs = lazy(() => import('./components/MyDocs').then(m => ({ default: m.MyDocs })));
const InfoTab = lazy(() => import('./components/InfoTab').then(m => ({ default: m.InfoTab })));
const PapoStore = lazy(() => import('./components/PapoStore').then(m => ({ default: m.PapoStore })));
const Meets = lazy(() => import('./components/Meets').then(m => ({ default: m.Meets })));
const Gastos = lazy(() => import('./components/Gastos').then(m => ({ default: m.Gastos })));
// (removido cleanup: PainelControle, LeadsTab — features PJ do marketplace antigo)
const SettingsTab = lazy(() => import('./components/SettingsTab').then(m => ({ default: m.SettingsTab })));
const MinhaContaTabMemo = lazy(() => import('./components/MinhaContaTab').then(m => ({ default: m.MinhaContaTab })));
import { MenuDrawer, MenuIcon } from './components/MenuDrawer';
import { DesktopSidebar } from './components/DesktopSidebar';
import { SuggestionsSidebar } from './components/SuggestionsSidebar';
import { productMatchesSearch } from './utils/searchSemantic';
import { TutorialOverlay } from './components/TutorialOverlay';
import { PromoCarousel } from './components/PromoCarousel';
// (removido cleanup: TradeProposalModal — marketplace antigo)
import { ResetPasswordScreen } from './components/ResetPasswordScreen';
import { deriveKey, encryptMsg, decryptMsg } from './utils/chatCrypto';
import { sendEmailNotif } from './utils/notifyEmail';
import { sendPushToUser } from './utils/sendPush';
import { buildPlaceholderDataUrl } from './utils/placeholderImage';
import { isNudgeBlocked, syncLocalNudgeBlocksToRemote, syncArchivedFromRemote } from './utils/chatPrefs';
// (removido cleanup: DOACAO_PREFIX, parseDoacaoAcceptance, DoacaoData — fluxo doacao antigo)
import { UserProfileModal } from './components/UserProfileModal';
import { PostDetailModal } from './components/PostDetailModal';
import { useLang } from './i18n';


type Tab = 'home' | 'meus' | 'likes' | 'chat' | 'notif' | 'leads' | 'sobre' | 'planos' | 'contato' | 'ajustes' | 'conta' | 'gastos' | 'pesquisar' | 'amigos' | 'store' | 'meets' | 'studentclub' | 'seguranca';

// Notificação unificada (proposta de troca + doação aceita + novo aluno cadastrado)
type AppNotif = {
  id: string;
  type:
    | 'proposta' | 'doacao_aceita' | 'novo_aluno' | 'nova_mensagem' | 'amizade'
    // Tipos genéricos vindos da tabela app_notifications:
    | 'like' | 'comment' | 'story_like' | 'story_comment' | 'follow' | 'meet'
    | 'mention_post' | 'mention_story' | 'nudge';
  from: string;
  conversaId?: string;
  fromItem?: { title: string; image: string; trokValue: number };
  toProductTitle?: string;
  productTitle?: string;
  productImage?: string;
  preview?: string;
  escola?: string;
  consultor?: string;
  paisOrigem?: string;
  paisDestino?: string;
  // Para os tipos genéricos (like/comment/story_*/follow/meet) usamos title+body
  title?: string;
  body?: string;
  refId?: string;
  imageUrl?: string;
  timestamp: string; // ISO string
  read: boolean;
};

export default function App() {
  const { lang, setLang, AT } = useLang();
  const { theme, setTheme } = useTheme();
  // Auto-update: a cada 60s checa se há build novo publicado e recarrega.
  // Resolve cache de PWA — não precisa abrir aba anônima a cada deploy.
  useAutoUpdate();
  usePageTranslator(lang);
  const fireTroky = () => {}; // vinheta removida

  // Limpeza one-time: remove caches `papo_deleted_*` antigos que causavam mensagens
  // a sumirem ao recarregar (bug do delete-em-background). Executa só uma vez.
  useEffect(() => {
    if (localStorage.getItem('papo_deleted_cleanup_v1') === 'done') return;
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('papo_deleted_')) keys.push(k);
      }
      keys.forEach(k => localStorage.removeItem(k));
      localStorage.setItem('papo_deleted_cleanup_v1', 'done');
    } catch { /* noop */ }
  }, []);
  const [currentUser, setCurrentUser] = useState<string | null>(null);

  // (Removido) Login/loading não força mais light: o tema é controlado
  // exclusivamente pelo useTheme (localStorage + system preference). Antes
  // este efeito derrubava a classe .dark no boot da tela de login, o que
  // quebrava o dark mode pra qualquer fluxo onde currentUser fica null
  // mesmo brevemente.
  usePushNotification(currentUser);
  const [authLoading, setAuthLoading] = useState(true);
  const [chatKey, setChatKey] = useState(0); // incrementado após recovery para forçar re-fetch
  const [chatPanelKey, setChatPanelKey] = useState(0); // força remount do ChatPanel após migração
  const migrationUserRef = useRef<string | null>(null); // guarda o user para quem a migração já rodou
  // products: array vazio — Student Club não tem marketplace.
  // ChatsTab ainda recebe pra fallback em mensagens legadas (raro).
  const products: Product[] = [];
  const setProducts = (_updater: any) => { /* noop — marketplace removido */ };
  const [showFeedNews, setShowFeedNews] = useState(false);
  const [showPapoStore, setShowPapoStore] = useState(false);
  const [showMeets, setShowMeets] = useState(false);
  // Drawer da aba Chat: agora só abre via clique explícito (não mais por
  // swipe). Coluna lateral só aparece no Feed da home — fora dali, gesto
  // horizontal é reservado pro "voltar tela anterior".
  const [showChatFriendsDrawer, setShowChatFriendsDrawer] = useState(false);
  const [selectedChat, setSelectedChat] = useState<Product | null>(null);
  // (removido cleanup: showMatches — marketplace antigo)
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedGender, setSelectedGender] = useState('Todos');
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [transitioning, setTransitioning] = useState(false);
  // (removido cleanup: commentProduct / detailProduct — marketplace legado)
  const [userPlan, setUserPlan] = useState<'free' | 'pro' | 'plus'>('free');
  const [userCreatedAt, setUserCreatedAt] = useState<Date | null>(null);
  const [userId, setUserId] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>('');
  const [userVerificado, setUserVerificado] = useState(false);
  const [userDocEnviado, setUserDocEnviado] = useState(false);
  // (removido cleanup: userScoreMedio, userTotalAvaliacoes — sistema de avaliacao antigo)
  const [userTrocas, setUserTrocas] = useState(0);
  const [userDoacoesFeitas, setUserDoacoesFeitas] = useState(0);
  const [userDoacoesRecebidas, setUserDoacoesRecebidas] = useState(0);
  const [userAmostrasDadas, setUserAmostrasDadas] = useState(0);
  const [userAmostrasRecebidas, setUserAmostrasRecebidas] = useState(0);
  const [showVerifFlow, setShowVerifFlow] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cameraAnim, setCameraAnim] = useState<{ x: number; y: number } | null>(null);
  const [unreadChats, setUnreadChats] = useState<Set<string>>(new Set());
  const [unreadComments, setUnreadComments] = useState(0);
  const currentUserRef = useRef<string | null>(null);
  const edgeSwipeRef   = useRef<{ x: number; y: number } | null>(null);
  const [ptrY, setPtrY] = useState(0);
  const [ptrRefreshing, setPtrRefreshing] = useState(false);
  const ptrStartY = useRef(0);
  const ptrActive = useRef(false);
  // Quando a camera unificada (Post/Story) esta aberta, travamos o
  // pull-to-refresh. Sem isso, o gesto de "arrastar pra baixo pra sair
  // da camera" colidia com o PTR e a tela atualizava sem querer.
  // StoryCamera dispara papo-camera-state {open: true|false} no mount/unmount.
  const cameraOpenRef = useRef(false);
  useEffect(() => {
    const onState = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      cameraOpenRef.current = !!detail.open;
      // Se a camera abriu no meio de um PTR ja iniciado, cancela.
      if (cameraOpenRef.current) {
        ptrActive.current = false;
        setPtrY(0);
      }
    };
    window.addEventListener('papo-camera-state', onState);
    return () => window.removeEventListener('papo-camera-state', onState);
  }, []);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; cidade: string } | null>(null);
  const [filterPerto, setFilterPerto] = useState(false);
  const [filters, setFilters] = useState<Filters>(FILTERS_DEFAULT);
  const [showFilters, setShowFilters] = useState(false);
  // (removido cleanup: showSwipe, showInfoModal — Match IA/Swipe antigo)
  // (removido cleanup: showCreateDonation, showCreateDonationRequest,
  // showCreateSample, showCreatePromocao, showCreateSampleRequest,
  // showDonationChooser, amostraConsentProduct, amostraBlockedEmpresa —
  // fluxos de doacao/amostra/promocao do marketplace antigo)
  // (removido cleanup: ratingProduct, ratingFromItemId — RatingModal antigo)
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const [openPostId, setOpenPostId] = useState<string | null>(null);
  const [notifFilter, setNotifFilter] = useState<'all' | 'unread' | 'read'>('all');

  // (removido cleanup: showProposalModal, proposalTarget — propostas antigas)
  const [notifs, setNotifs] = useState<AppNotif[]>([]);

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [userStatuses, setUserStatuses] = useState<Record<string, { online: boolean; lastSeen?: Date }>>({});
  // Carrega perfil do cache localStorage imediatamente (se existir) → dados não somem em refresh
  const cachedProfile = (() => {
    try { return JSON.parse(localStorage.getItem('papo_profile') || '{}'); } catch { return {}; }
  })();
  const [fotoPerfilState, setFotoPerfilState] = useState<string>(cachedProfile.foto_perfil || '');
  // Wrapper: SEMPRE espelha no localStorage cache. Garante que a foto fique disponível
  // mesmo quando o React state não atualiza a tempo (Safari/iOS WebKit timing).
  const setFotoPerfil = useCallback((url: string) => {
    setFotoPerfilState(url);
    try {
      const prev = JSON.parse(localStorage.getItem('papo_profile') || '{}');
      localStorage.setItem('papo_profile', JSON.stringify({ ...prev, foto_perfil: url || '' }));
    } catch {}
  }, []);
  // Foto efetiva: usa state React; se vazio, cai no cache localStorage (recomputado
  // a cada render). Resolve race-conditions Safari/iOS onde o state não atualiza
  // a tempo mas o cache já foi escrito pela função setFotoPerfil acima.
  const fotoPerfil = fotoPerfilState || cachedProfile.foto_perfil || '';
  const [socialToast, setSocialToast] = useState(false);
  const showSocialToast = () => { setSocialToast(true); setTimeout(() => setSocialToast(false), 3000); };
  const [userNome, setUserNome] = useState(cachedProfile.nome || '');
  const [userTelefone, setUserTelefone] = useState(cachedProfile.telefone || '');
  const [userEndereco, setUserEndereco] = useState(cachedProfile.endereco || '');
  const [userMostrarTelefone, setUserMostrarTelefone] = useState(!!cachedProfile.mostrar_telefone);
  const [userEmailVerificado, setUserEmailVerificado] = useState(!!cachedProfile.email_verificado);
  const [userTelefoneVerificado, setUserTelefoneVerificado] = useState(!!cachedProfile.telefone_verificado);
  // (removido cleanup: userTipoConta, userSegmento, userNomeEmpresa —
  // Student Club so tem PF agora; PJ era do Trok Vibe antigo)
  // Stubs pra compat com codigo legado que ainda referencia (sai na etapa 6)
  const userTipoConta: 'pf' = 'pf';
  const setUserTipoConta = (_: 'pf' | 'pj') => { /* noop — so PF agora */ };
  void setUserTipoConta;
  const userSegmento = '';
  const setUserSegmento = (_: string) => { /* noop */ };
  void setUserSegmento;
  const userNomeEmpresa = '';
  const setUserNomeEmpresa = (_: string) => { /* noop */ };
  void setUserNomeEmpresa;
  // Pergunta-chave do cadastro: se true, esconde Sua Viagem e Meus Docs.
  const [jaNoIntercambio, setJaNoIntercambio] = useState<boolean>(!!cachedProfile.ja_no_intercambio);
  const [userStatusConta, setUserStatusConta] = useState<'ativa' | 'bloqueada'>('ativa');
  const [motivoBloqueio, setMotivoBloqueio] = useState<string | null>(null);

  // Helper: salva perfil no cache localStorage (chamado diretamente, nunca via effect reativo)
  const saveProfileCache = useCallback((patch: Record<string, any>) => {
    try {
      const prev = JSON.parse(localStorage.getItem('papo_profile') || '{}');
      localStorage.setItem('papo_profile', JSON.stringify({ ...prev, ...patch }));
    } catch {}
  }, []);

  // Refresh forcado do perfil. Incrementa profileRefreshKey, o useEffect
  // de profile-fetch tem essa key nas deps, entao re-roda e busca dados
  // FRESCOS do Supabase. Usado apos alterar nome/dados em MinhaContaTab —
  // garante que userNome/userTelefone/etc reflitam o que ta no banco.
  // Sem isso, o user via o estado local da pre-edicao em alguns pontos
  // do app ate fazer logout/login.
  const [profileRefreshKey, setProfileRefreshKey] = useState(0);
  const refreshProfile = useCallback(() => {
    setProfileRefreshKey(k => k + 1);
  }, []);

  // PROMO: todas as funcionalidades liberadas até 300 usuários orgânicos
  const PROMO_ACTIVE = true; // desativar quando atingir 300 usuários
  const PLAN_LIMITS: Record<string, number> = PROMO_ACTIVE ? { free: Infinity, pro: Infinity, plus: Infinity } : { free: 3, pro: 20, plus: Infinity };
  const myAdsCount = products.filter(p => p.username === currentUser).length;
  const hasMatchAccess = PROMO_ACTIVE ? true : (userPlan !== 'free');
  const hasAdvancedAccess = PROMO_ACTIVE ? true : (userPlan === 'plus');
  const trialDaysLeft = 0;
  const advancedTrialDaysLeft = 0;

  // Restaura sessão ao carregar — usa getSession() que lê do cache local (instantâneo)
  useEffect(() => {
    const init = async () => {
      // 1) Tenta cache local primeiro — zero latência
      const cached = localStorage.getItem('papo_username');

      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        if (cached) {
          // Usuário já conhecido — entra imediatamente com o username salvo
          setCurrentUser(cached);
          // Verifica se onboarding pendente (novo usuário que veio do cadastro)
          if (localStorage.getItem('papo_show_onboarding') === '1') {
            localStorage.removeItem('papo_show_onboarding');
            setTimeout(() => setShowOnboarding(true), 1200);
          }
        } else {
          // Busca username pelo email (mais confiável — evita problema de múltiplos rows com IDs diferentes)
          const { data: rows } = await supabase
            .from('usuarios')
            .select('username,created_at')
            .eq('email', session.user.email!)
            .order('created_at', { ascending: false })
            .limit(1);
          const username = rows?.[0]?.username || null;
          if (username) localStorage.setItem('papo_username', username);
          setCurrentUser(username);
        }
      } else {
        localStorage.removeItem('papo_username');
        setCurrentUser(null);
      }
      setAuthLoading(false);
    };

    init();

    // Escuta mudanças subsequentes (logout, expiração de token, recuperação de senha)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setShowResetPassword(true);
        setAuthLoading(false);
        return;
      }
      if (event === 'SIGNED_OUT') {
        localStorage.removeItem('papo_username');
        localStorage.removeItem('papo_profile');
        // Usa setters PRIMITIVOS aqui (NÃO o wrapper setFotoPerfil) porque o
        // wrapper grava no cache localStorage — o que recriaria papo_profile
        // logo após removeItem(), deixando {foto_perfil:""} polluindo o cache.
        // Esse cache poluído depois "vence" a URL real após relogin.
        setFotoPerfilState(''); setUserNome(''); setUserTelefone(''); setUserEndereco('');
        setUserMostrarTelefone(false); setUserEmailVerificado(false); setUserTelefoneVerificado(false);
        setCurrentUser(null);
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        // Token renovado silenciosamente — não faz nada, usuário já está logado
      }
    });

    return () => { subscription.unsubscribe(); };
  }, []);

  // Mantém ref atualizada para uso nos callbacks de real-time
  useEffect(() => {
    currentUserRef.current = currentUser;
    // Espelha localStorage da blocklist pro Supabase ao logar. Sem isso,
    // bloqueios feitos em versões antigas (só local) nunca chegam no DB e
    // o remetente acha que ninguém bloqueou.
    if (currentUser) syncLocalNudgeBlocksToRemote(currentUser);
    // Puxa as conversas arquivadas do servidor → cache local. Sem isso,
    // hard reload / re-login esvazia o localStorage e o user "perde" os
    // arquivos (na verdade so o cache foi perdido, mas a UI nao sabia).
    if (currentUser) {
      syncArchivedFromRemote(currentUser).then(() => {
        // Dispara o evento pra ChatsTab re-renderizar com o estado puxado
        window.dispatchEvent(new CustomEvent('papo-chat-prefs-updated'));
      });
    }
  }, [currentUser]);

  // Abre um chat 1-a-1 com um amigo. Se o amigo tem produto/anúncio,
  // abre o chat desse produto. Senão cria um "produto shim" — o ChatPanel
  // funciona com qualquer Product, basta ter id estável + username.
  // O id é ordenado alfabeticamente para que ambos os lados usem o MESMO
  // conversa_id (e portanto vejam as mesmas mensagens).
  async function openDirectChat(friendUsername: string) {
    if (!currentUser || !friendUsername || friendUsername === currentUser) return;
    // CANÔNICO: chat 1-1 entre dois usuários SEMPRE usa productId='direct'.
    // ConvId = [a,b].sort()__direct — mesmo antes de virarem amigos, mesmo
    // depois. Garante que as mensagens não somem nem aparecem 2 conversas
    // diferentes quando a amizade é aceita.
    //
    // MIGRAÇÃO SÍNCRONA (antes era em background — race condition):
    // Se rodasse em background, o ChatPanel abria antes da migração terminar,
    // fazia query no __direct e não achava nada (mensagens ainda no convId
    // antigo) → mostrava "Diga olá" vazio. Na segunda abertura já aparecia.
    // Agora AGUARDA a migração antes de abrir o chat. O SELECT é rápido
    // (~100ms); só há UPDATEs na primeira vez (já migrado = sem delay extra).
    const [u1, u2] = [currentUser, friendUsername].sort();
    const canonical = `${u1}__${u2}__direct`;
    const prefix = `${u1}__${u2}__`;
    try {
      // PERNA 1 — busca canonica: convIds com prefix `[a,b].sort()__`.
      // Cobre o caso normal e tambem productIds antigos ('22', uuid, etc.).
      const r1 = await supabase
        .from('mensagens')
        .select('conversa_id')
        .like('conversa_id', `${prefix}%`)
        .neq('conversa_id', canonical);

      // PERNA 2 — busca DEFENSIVA: convIds bagunçados que contem AMBOS os
      // usernames como substring (em qualquer ordem) — cobre bug histórico
      // onde '_direct' foi concatenado ao username, gerando convIds como
      // `userA__userB_direct__22` que NAO batem com o prefix canonico.
      // Restringe por remetente IN [u1, u2] pra reduzir varredura e excluir
      // grupos/self-chats por construção.
      const r2 = await supabase
        .from('mensagens')
        .select('conversa_id')
        .in('remetente', [currentUser, friendUsername])
        .like('conversa_id', `%${u1}%`)
        .like('conversa_id', `%${u2}%`)
        .neq('conversa_id', canonical)
        .not('conversa_id', 'like', 'group__%')
        .not('conversa_id', 'like', 'self__%');

      const otherConvIds = Array.from(new Set([
        ...((r1.data || []).map((r: any) => r.conversa_id as string)),
        ...((r2.data || []).map((r: any) => r.conversa_id as string)),
      ])).filter((id): id is string =>
        typeof id === 'string'
        && id !== canonical
        && !id.startsWith('group__')
        && !id.startsWith('self__')
      );

      for (const oldId of otherConvIds) {
        await supabase.from('mensagens').update({ conversa_id: canonical }).eq('conversa_id', oldId);
      }
      // Idem na tabela conversas_hidden (mantem o estado de "arquivado"
      // ao migrar o convId), caso exista.
      if (otherConvIds.length > 0) {
        try {
          await supabase.from('conversas_hidden').delete().in('conversa_id', otherConvIds);
        } catch {}
      }
    } catch {}
    setSelectedChat({
      id: 'direct',
      username: friendUsername,
      title: `Chat com @${friendUsername}`,
      image: '',
      description: '',
      wantsInExchange: '',
      category: 'direct-chat',
      tipo: 'troca',
    });
  }

  // Sincroniza a lista de amigos + pedidos enviados/recebidos com o Supabase.
  // Os dados ficam visíveis em qualquer dispositivo onde o aluno logar.
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  // Cutucar global — toca bing via WebAudio (AudioContext compartilhado pra
  // tocar TODA vez, sem fechar entre cliques), vibra (Android — iOS Safari
  // nao suporta vibrate API, vibracao chega via push notification do iOS) e
  // treme a tela.
  const audioCtxRef = useRef<AudioContext | null>(null);
  // NOTA: currentUserRef já é declarado e sincronizado mais acima (linhas
  // ~176 e ~323). Usamos ele no onNudge abaixo pra evitar captura stale.
  useEffect(() => {
    function getCtx(): AudioContext | null {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AC();
      }
      // iOS Safari deixa o ctx em 'suspended' ate primeiro user gesture
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
      return audioCtxRef.current;
    }
    function playBing() {
      // Som de "tuíte" — sweep rápido ascendente (passarinho/chirp).
      // Toca DUAS vezes com pequeno intervalo (~180ms entre tweets).
      const ctx = getCtx();
      if (!ctx) return;
      const start = ctx.currentTime;
      const tweet = (t0: number) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        // Sweep 1.4kHz → 3kHz → 2.2kHz em ~150ms (chirp de passarinho)
        osc.frequency.setValueAtTime(1400, t0);
        osc.frequency.exponentialRampToValueAtTime(3000, t0 + 0.07);
        osc.frequency.exponentialRampToValueAtTime(2200, t0 + 0.15);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
        osc.connect(g).connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.17);
      };
      tweet(start);
      tweet(start + 0.18);
    }
    // Unlock do AudioContext no primeiro gesto do user (iOS exige)
    const unlock = () => { getCtx(); };
    window.addEventListener('touchstart', unlock, { once: true, passive: true });
    window.addEventListener('click', unlock, { once: true });

    const onNudge = (e: Event) => {
      // Respeita bloqueio por usuário: lê o currentUser via REF (NÃO via
      // closure) porque o useEffect roda só uma vez na montagem — naquele
      // momento currentUser ainda pode ser vazio. O ref sempre tem o valor
      // atual graças ao useEffect que sincroniza abaixo.
      const me = currentUserRef.current;
      const from = (e as CustomEvent<{ from?: string }>).detail?.from;
      if (from && me && isNudgeBlocked(me, from)) return;
      try { navigator.vibrate?.([100, 50, 100, 50, 150]); } catch {}
      try { playBing(); } catch {}
      document.body.classList.remove('papo-nudge-shake');
      void document.body.offsetWidth;
      document.body.classList.add('papo-nudge-shake');
      window.setTimeout(() => document.body.classList.remove('papo-nudge-shake'), 2500);
    };
    window.addEventListener('papo-nudge', onNudge);
    return () => {
      window.removeEventListener('papo-nudge', onNudge);
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('click', unlock);
    };
  }, []);

  // ── Sync TEMPO REAL de foto_perfil ────────────────────────────────────
  // Subscreve UPDATEs na tabela usuarios via Realtime do Supabase. Quando
  // qualquer user trocar a foto (ou nome), dispara um evento global
  // `papo-user-updated` que listas/feeds/avatares consumindo aquele
  // username podem ouvir e refletir IMEDIATAMENTE — sem precisar reload.
  useEffect(() => {
    const ch = supabase
      .channel(`users:profile-changes:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'usuarios' }, (payload) => {
        const newRow = payload.new as { username?: string; foto_perfil?: string | null; nome?: string | null };
        if (!newRow?.username) return;
        window.dispatchEvent(new CustomEvent('papo-user-updated', {
          detail: {
            username: newRow.username,
            foto_perfil: newRow.foto_perfil ?? null,
            nome: newRow.nome ?? null,
          },
        }));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // Presença online GLOBAL — todo user logado se registra no canal
  // `presence:online`. App.tsx é o ÚNICO dono desse canal. Outros
  // componentes (ChatPanel) escutam o evento `papo-presence-changed`
  // com a lista de usernames online.
  //
  // CONSOLIDADO: antes havia DOIS canais de presenca (este +
  // 'global_presence' mais abaixo). Removido o duplicado. Este canal
  // agora cobre tanto papo-presence-changed (lista) quanto userStatuses
  // (map state).
  useEffect(() => {
    if (!currentUser) return;
    const pch = supabase.channel('presence:online', {
      config: { presence: { key: currentUser } },
    });
    const syncState = () => {
      const state = pch.presenceState<{ at?: number }>();
      const onlineUsers = Object.keys(state);
      const onlineSet = new Set(onlineUsers);
      // Mantem o state local userStatuses sincronizado (substitui
      // o canal global_presence que fazia a mesma coisa)
      setUserStatuses(prev => {
        const next = { ...prev };
        onlineSet.forEach(u => { next[u] = { online: true }; });
        Object.keys(prev).forEach(u => {
          if (!onlineSet.has(u) && prev[u].online) {
            next[u] = { online: false, lastSeen: new Date() };
          }
        });
        return next;
      });
      try {
        window.dispatchEvent(new CustomEvent('papo-presence-changed', { detail: { onlineUsers } }));
      } catch {}
    };
    pch
      .on('presence', { event: 'sync' }, syncState)
      .on('presence', { event: 'join' }, syncState)
      .on('presence', { event: 'leave' }, syncState)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') { await pch.track({ at: Date.now() }); syncState(); }
      });
    return () => { supabase.removeChannel(pch); };
  }, [currentUser]);

  // Canal pessoal do user `notif:<user>` — eh UMA conexao com 2 listeners:
  // 1) 'nudge' (cutucar global, MSN-style)
  // 2) 'new_notif' (proposta/doacao_aceita broadcast direto)
  // Antes existiam 2 useEffect separados criando 2 channels com o MESMO nome
  // — Supabase reusava a conexao mas duplicava callbacks. Unificado aqui.
  useEffect(() => {
    if (!currentUser) return;
    const ch = supabase
      .channel(`notif:${currentUser}`)
      .on('broadcast', { event: 'nudge' }, (payload) => {
        const from = (payload.payload as { from?: string })?.from;
        if (from === currentUser) return;
        window.dispatchEvent(new CustomEvent('papo-nudge', { detail: { from } }));
      })
      .on('broadcast', { event: 'new_notif' }, ({ payload }) => {
        const n = payload as AppNotif;
        if (!n?.id || !n?.type) return;
        const user = currentUserRef.current;
        if (!user) return;
        if (n.type === 'proposta') fireTroky();
        setNotifs(prev => {
          if (prev.some(x => x.id === n.id)) return prev;
          const updated: AppNotif[] = [{ ...n, read: false }, ...prev];
          localStorage.setItem(`papo_notifs_${user}`, JSON.stringify(updated));
          return updated;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    // Reconcilia renomeacoes ANTES de hidratar — se um amigo trocou de username,
    // atualiza o cache local pra usar o novo nome (em vez de criar conversa nova).
    reconcileUsernameChanges(currentUser).catch(() => {});
    fetchFriendsRemote(currentUser).catch(() => {});
    fetchSentRequestsRemote(currentUser).catch(() => {});
    const refreshPending = async () => {
      const list = await getPendingRequests(currentUser).catch(() => []);
      setPendingRequestsCount(list.length);
    };
    refreshPending();
    const onUpd = () => refreshPending();
    window.addEventListener('papo-friends-updated', onUpd);
    const id = window.setInterval(refreshPending, 30_000);
    return () => {
      window.removeEventListener('papo-friends-updated', onUpd);
      window.clearInterval(id);
    };
  }, [currentUser]);

  // Listener pra abrir perfil de um user (chips de mention nos posts, etc).
  useEffect(() => {
    function onOpenProfile(e: Event) {
      const detail = (e as CustomEvent).detail || {};
      const u = detail.username as string | undefined;
      if (u) setProfileUsername(u);
    }
    window.addEventListener('papo-open-profile', onOpenProfile);
    return () => window.removeEventListener('papo-open-profile', onOpenProfile);
  }, []);

  // ─── Recovery: repara conversa_ids corrompidos por rename de username ───
  // Formato correto: user1__user2__productId  (productId = numérico ou UUID)
  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      // productId válido = numérico OU UUID
      const isValidProductId = (s: string) =>
        /^\d+$/.test(s) ||
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

      // Busca mensagens enviadas E recebidas pelo usuário atual
      const [r1, r2] = await Promise.all([
        supabase.from('mensagens').select('conversa_id, remetente').ilike('conversa_id', `%${currentUser}%`),
        supabase.from('mensagens').select('conversa_id, remetente').eq('remetente', currentUser),
      ]);

      const all = [...(r1.data || []), ...(r2.data || [])];
      if (all.length === 0) return;

      // Agrupa por conversa_id → remetentes distintos (fonte de verdade dos usernames)
      const byId = new Map<string, Set<string>>();
      for (const m of all as Array<{ conversa_id: string; remetente: string }>) {
        if (!byId.has(m.conversa_id)) byId.set(m.conversa_id, new Set());
        byId.get(m.conversa_id)!.add(m.remetente);
      }

      let fixed = false;

      for (const [id, remetentes] of byId.entries()) {
        // Conversas de grupo NUNCA são "reparadas" — elas têm formato próprio
        // (group__<uuid>) e não dependem dos usernames no id. Tentar reparar
        // estraga o conversa_id e faz mensagens "sumirem" pra usuários que não
        // criaram o grupo.
        if (id.startsWith('group_')) continue;
        const parts = id.split('__');
        // Formato já correto: 3 partes, última é productId válido E id contém currentUser
        if (parts.length === 3 && isValidProductId(parts[2]) && id.includes(currentUser)) continue;

        // Extrai productId: numérico (prioritário) ou UUID
        const numMatch = id.match(/\d+/g)?.sort((a, b) => b.length - a.length)[0]; // maior sequência numérica
        const uuidMatch = id.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        const productId = uuidMatch?.[0] ?? numMatch;
        if (!productId) continue;

        // Usuarios: usa remetentes como fonte de verdade
        const users = [...remetentes].filter(u => u && u.length > 0);
        if (!users.includes(currentUser)) users.push(currentUser);

        if (users.length < 2) {
          // Conversa unilateral: extrai outro usuário do id removendo productId e currentUser
          const remaining = id.replace(productId, '').replace(currentUser, '');
          const otherUser = remaining.split('_').filter(p => p.length > 0).join('_');
          if (otherUser && otherUser !== currentUser && !users.includes(otherUser)) users.push(otherUser);
        }

        if (users.length < 2) continue;

        const newId = [...new Set(users)].sort().join('__') + '__' + productId;
        if (newId !== id) {
          await supabase.from('mensagens').update({ conversa_id: newId }).eq('conversa_id', id);
          fixed = true;
        }
      }

      // Se algum id foi reparado, força o ChatsTab a re-buscar com os dados corretos
      if (fixed) setChatKey(k => k + 1);
    })();
  }, [currentUser]);

  // ─── Migração: re-encripta mensagens que ficaram com chave antiga após rename de username.
  //     Para cada conversa_id no banco, gera todos os possíveis IDs antigos (combinando
  //     os usernames históricos) e testa qual chave funciona. É idempotente.
  useEffect(() => {
    if (!currentUser || migrationUserRef.current === currentUser) return;
    migrationUserRef.current = currentUser;

    // Histórico de renames: { novo: antigo }
    // Adicione aqui qualquer rename futuro que ocorra sem re-encrypt.
    const HISTORY: Record<string, string> = {
      'gui_10':     'gui',
      'pablo_caio': 'pablo marcal',
    };

    // Gera todas as variações antigas de um conversa_id substituindo usernames pelo antigo
    function oldCandidates(convId: string): string[] {
      const candidates = new Set<string>();
      const entries = Object.entries(HISTORY);

      // Substituições simples (um rename de cada vez)
      for (const [newU, oldU] of entries) {
        if (convId.includes(newU)) {
          candidates.add(convId.replace(newU, oldU));
        }
      }
      // Substituições duplas (dois renames simultâneos na mesma conversa)
      for (const [newU1, oldU1] of entries) {
        for (const [newU2, oldU2] of entries) {
          if (newU1 !== newU2 && convId.includes(newU1) && convId.includes(newU2)) {
            candidates.add(convId.replace(newU1, oldU1).replace(newU2, oldU2));
          }
        }
      }
      return [...candidates].filter(c => c !== convId);
    }

    (async () => {
      // Busca TODAS as conversas que contenham qualquer username renomeado
      const newUsernames = Object.keys(HISTORY);
      const allConvIds = new Set<string>();

      await Promise.all(newUsernames.map(async (u) => {
        const { data } = await supabase
          .from('mensagens').select('conversa_id').ilike('conversa_id', `%${u}%`);
        (data || []).forEach((m: any) => allConvIds.add(m.conversa_id));
      }));

      let anyfixed = false;

      for (const newConvId of allConvIds) {
        // Testa se já está corretamente encriptado
        const { data: sample } = await supabase
          .from('mensagens').select('id, conteudo').eq('conversa_id', newConvId).limit(1);
        if (!sample || sample.length === 0) continue;

        const newKey = await deriveKey(newConvId);
        const testNew = await decryptMsg(sample[0].conteudo, newKey);
        if (testNew !== '[mensagem]') continue; // já ok

        // Testa chaves antigas (uma por vez)
        const candidates = oldCandidates(newConvId);
        let workingOldKey: CryptoKey | null = null;

        for (const oldId of candidates) {
          const oldKey = await deriveKey(oldId);
          const test = await decryptMsg(sample[0].conteudo, oldKey);
          if (test !== '[mensagem]') { workingOldKey = oldKey; break; }
        }

        if (!workingOldKey) continue; // nenhuma chave funcionou

        // Re-encripta todas as mensagens da conversa com a chave nova
        const { data: allMsgs } = await supabase
          .from('mensagens').select('id, conteudo').eq('conversa_id', newConvId);
        for (const msg of allMsgs || []) {
          const plaintext = await decryptMsg(msg.conteudo, workingOldKey);
          if (plaintext === '[mensagem]') continue;
          const newConteudo = await encryptMsg(plaintext, newKey);
          await supabase.from('mensagens').update({ conteudo: newConteudo }).eq('id', msg.id);
        }
        anyfixed = true;
      }

      if (anyfixed) {
        setChatKey(k => k + 1);
        setChatPanelKey(k => k + 1);
      }
    })();
  }, [currentUser]);

  // ── LIMPEZA ÚNICA DE MENSAGENS QUEBRADAS ─────────────────────────────────
  // Apaga (uma vez por usuário) mensagens enviadas POR ELE cujo ciphertext
  // não consegue ser decifrado nem com a chave correta — ou seja, foram
  // gravadas com chave errada antes do fix do formato plaintext. RLS garante
  // que cada usuário só apaga as próprias mensagens; a contraparte é limpa
  // quando o outro lado fizer login.
  useEffect(() => {
    if (!currentUser) return;
    const FLAG = `papo_cleanup_brokenmsgs_v1_${currentUser}`;
    if (localStorage.getItem(FLAG) === 'done') return;

    (async () => {
      const { data: rows } = await supabase
        .from('mensagens')
        .select('id, conversa_id, conteudo')
        .eq('remetente', currentUser);
      if (!rows) return;

      const toDelete: string[] = [];
      // Cache de chaves por conversa
      const keyCache = new Map<string, CryptoKey>();
      for (const r of rows as { id: string; conversa_id: string; conteudo: string }[]) {
        // Mensagens novas (texto plano) — pula
        if (!r.conteudo || r.conteudo.startsWith('P1:')) continue;
        // Tenta decifrar com a chave correta
        let key = keyCache.get(r.conversa_id);
        if (!key) {
          key = await deriveKey(r.conversa_id);
          keyCache.set(r.conversa_id, key);
        }
        const plaintext = await decryptMsg(r.conteudo, key);
        if (plaintext === '[mensagem]') toDelete.push(r.id);
      }

      // Apaga em blocos de 100 para não estourar a query
      for (let i = 0; i < toDelete.length; i += 100) {
        const slice = toDelete.slice(i, i + 100);
        await supabase.from('mensagens').delete().in('id', slice).eq('remetente', currentUser);
      }

      localStorage.setItem(FLAG, 'done');
    })();
  }, [currentUser]);

  // Carrega localização, plano e data de criação do usuário ao logar
  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      // Carrega também userId da sessão
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) { setUserId(session.user.id); setUserEmail(session.user.email || ''); }

      // Busca por username primeiro, fallback por email da sessão (caso username no DB seja diferente)
      let { data } = await supabase
        .from('usuarios')
        .select('lat,lng,cidade,created_at,plano,verificado,selfie_url,foto_perfil,nome,telefone,endereco,mostrar_telefone,email_verificado,telefone_verificado,score_medio,total_avaliacoes,username,tipo_conta,status_conta,motivo_bloqueio,segmento,nome_empresa,origem,destino,escola,consultor,data_intercambio')
        .eq('username', currentUser)
        .maybeSingle();

      if (!data && session?.user?.email) {
        const { data: byEmail } = await supabase
          .from('usuarios')
          .select('lat,lng,cidade,created_at,plano,verificado,selfie_url,foto_perfil,nome,telefone,endereco,mostrar_telefone,email_verificado,telefone_verificado,score_medio,total_avaliacoes,username,tipo_conta,status_conta,motivo_bloqueio,segmento,nome_empresa,origem,destino,escola,consultor,data_intercambio')
          .eq('email', session.user.email)
          .maybeSingle();
        if (byEmail) {
          data = byEmail;
          // Sincroniza username no localStorage com o que está no banco
          if (byEmail.username && byEmail.username !== currentUser) {
            localStorage.setItem('papo_username', byEmail.username);
            setCurrentUser(byEmail.username);
          }
        }
      }

      if (data?.verificado) setUserVerificado(true);
      if (data?.selfie_url) setUserDocEnviado(true);
      // (removido cleanup: setUserScoreMedio/setUserTotalAvaliacoes — avaliacoes antigas)

      // Carrega contadores de transações (trocas, doações, amostras)
      try {
        const me = data?.username || currentUser;
        const { data: txs } = await supabase
          .from('transacoes')
          .select('tipo,doador_username,recebedor_username,anuncio_id')
          .or(`doador_username.eq.${me},recebedor_username.eq.${me}`);
        if (txs) {
          // Busca os tipos dos anúncios envolvidos (em paralelo, query única)
          // para identificar amostras mesmo quando a transação foi salva como 'doacao'
          const anuncioIds = Array.from(new Set(txs.map((t: any) => t.anuncio_id).filter(Boolean)));
          const tipoMap: Record<string, string> = {};
          if (anuncioIds.length > 0) {
            const { data: anuncios } = await supabase
              .from('anuncios')
              .select('id,tipo')
              .in('id', anuncioIds as string[]);
            (anuncios || []).forEach((a: any) => { if (a?.id) tipoMap[a.id] = a.tipo; });
          }

          let trocas = 0, df = 0, dr = 0, ad = 0, ar = 0;
          for (const t of txs as any[]) {
            const anuncioTipo = t.anuncio_id ? tipoMap[t.anuncio_id] : undefined;
            const effectiveTipo = anuncioTipo === 'amostra' ? 'amostra' : t.tipo;
            if (effectiveTipo === 'troca') trocas++;
            else if (effectiveTipo === 'amostra') {
              if (t.doador_username === me) ad++;
              else if (t.recebedor_username === me) ar++;
            } else if (effectiveTipo === 'doacao') {
              if (t.doador_username === me) df++;
              else if (t.recebedor_username === me) dr++;
            }
          }
          setUserTrocas(trocas);
          setUserDoacoesFeitas(df);
          setUserDoacoesRecebidas(dr);
          setUserAmostrasDadas(ad);
          setUserAmostrasRecebidas(ar);
        }
      } catch { /* tabela pode não existir ainda */ }
      // Atualiza estado e cache apenas com valores presentes no banco
      if (data) {
        const patch: Record<string, any> = {};
        // Só atualiza foto_perfil se o banco devolveu uma URL válida.
        // Se devolveu null, NÃO sobrescreve o cache local (preserva foto que já estava).
        if (data.foto_perfil) {
          setFotoPerfil(data.foto_perfil);
          patch.foto_perfil = data.foto_perfil;
        }
        if (data.nome != null)        { setUserNome(data.nome);          patch.nome = data.nome; }
        if (data.telefone != null)    { setUserTelefone(data.telefone);  patch.telefone = data.telefone; }
        if (data.endereco != null)    { setUserEndereco(data.endereco);  patch.endereco = data.endereco; }
        patch.mostrar_telefone    = !!data.mostrar_telefone;
        patch.email_verificado    = !!data.email_verificado;
        patch.telefone_verificado = !!data.telefone_verificado;
        if (data.tipo_conta) { setUserTipoConta(data.tipo_conta); patch.tipo_conta = data.tipo_conta; }
        // Pergunta-chave: se já está no intercâmbio → esconde Sua Viagem e Meus Docs.
        {
          const jni = !!(data as any).ja_no_intercambio;
          setJaNoIntercambio(jni);
          patch.ja_no_intercambio = jni;
        }
        if (data.segmento) { setUserSegmento(data.segmento); patch.segmento = data.segmento; }
        if (data.nome_empresa) { setUserNomeEmpresa(data.nome_empresa); patch.nome_empresa = data.nome_empresa; }
        setUserMostrarTelefone(patch.mostrar_telefone);
        setUserEmailVerificado(patch.email_verificado);
        setUserTelefoneVerificado(patch.telefone_verificado);
        saveProfileCache(patch);

        // ── Sincroniza origem/destino/escola/consultor no localStorage
        //    (DocsProgressBar, StudentClubCard, etc leem sincrono) ──
        try {
          if ((data as any).origem)            localStorage.setItem(`papo_origem_${currentUser}`,  (data as any).origem);
          if ((data as any).destino)           localStorage.setItem(`papo_destino_${currentUser}`, (data as any).destino);
          if ((data as any).data_intercambio)  localStorage.setItem(`papo_data_intercambio_${currentUser}`, (data as any).data_intercambio);
          if ((data as any).escola || (data as any).consultor) {
            const cur = JSON.parse(localStorage.getItem(`papo_student_profile_${currentUser}`) || '{}');
            const merged = {
              ...cur,
              ...((data as any).escola    ? { escola:    (data as any).escola }    : {}),
              ...((data as any).consultor ? { consultor: (data as any).consultor } : {}),
            };
            localStorage.setItem(`papo_student_profile_${currentUser}`, JSON.stringify(merged));
          }
          window.dispatchEvent(new CustomEvent('papo-trip-updated'));
          window.dispatchEvent(new CustomEvent('papo-student-updated', { detail: { user: currentUser } }));
        } catch { /* silencioso */ }

        // ── Retry de origem/destino que falharam em sessoes anteriores ──
        try { retryPendingTrip(currentUser).catch(() => {}); } catch {}

        // ── Migração one-shot escola/consultor (legacy: estavam só em
        //    localStorage). Se DB tem null mas o cache local tem valor, sobe.
        //    Roda em todo login — idempotente.
        try {
          const local = JSON.parse(localStorage.getItem(`papo_student_profile_${currentUser}`) || '{}');
          const needsUpload =
            (!data.escola && local.escola && String(local.escola).trim()) ||
            (!data.consultor && local.consultor && String(local.consultor).trim());
          if (needsUpload) {
            const remotePatch: Record<string, string | null> = {};
            if (!data.escola && local.escola)       remotePatch.escola    = String(local.escola).trim() || null;
            if (!data.consultor && local.consultor) remotePatch.consultor = String(local.consultor).trim() || null;
            await supabase.from('usuarios').update(remotePatch).eq('username', currentUser);
          }
        } catch { /* silencioso */ }
      }

      if (data?.lat && data?.lng) {
        setUserLocation({ lat: data.lat, lng: data.lng, cidade: data.cidade || '' });
      } else if (data?.cidade) {
        // Sem GPS: usa cidade do cadastro para comparação textual, lat/lng ficam nulos
        setUserLocation({ lat: null as any, lng: null as any, cidade: data.cidade });
      }

      if (data?.plano) setUserPlan(data.plano as 'free' | 'pro' | 'plus');
      if (data?.status_conta === 'bloqueada') {
        setUserStatusConta('bloqueada');
        setMotivoBloqueio(data.motivo_bloqueio || null);
      }

      // Data de criação — usa usuarios.created_at primeiro, depois Auth como fallback
      if (data?.created_at) {
        setUserCreatedAt(new Date(data.created_at));
      } else {
        const { data: { session } } = await supabase.auth.getSession();
        // Se nem a tabela nem o Auth têm data, usa agora (usuário novo = trial completo)
        setUserCreatedAt(session?.user?.created_at ? new Date(session.user.created_at) : new Date());
      }
    })();
    // profileRefreshKey nas deps → refreshProfile() re-roda este effect e
    // pega dados frescos do banco apos save em MinhaContaTab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, profileRefreshKey]);

  // (removido cleanup: recuperação de anúncio pendente — marketplace legado)
  useEffect(() => {
    if (!currentUser) return;
    // Limpa qualquer storage residual de anúncio pendente
    try { localStorage.removeItem('papo_pending_ad'); } catch {}
  }, [currentUser]);

  // (Canal 'global_presence' REMOVIDO — duplicava o canal 'presence:online'
  // acima, ambos com mesma key=currentUser e mesmo proposito de manter
  // userStatuses + emitir presence-changed. Agora um canal unico.)

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers de persistência: salva/carrega badges e notificações no localStorage
  // garantindo que sobrevivam a logout + login e a qualquer refresh de página.
  // ─────────────────────────────────────────────────────────────────────────

  // Carrega ao logar
  useEffect(() => {
    if (!currentUser) {
      setNotifs([]);
      setUnreadChats(new Set());
      setUnreadComments(0);
      return;
    }
    try {
      const n  = localStorage.getItem(`papo_notifs_${currentUser}`);
      const uc = localStorage.getItem(`papo_uchats_${currentUser}`);
      const ucom = localStorage.getItem(`papo_ucomments_${currentUser}`);
      if (n)   setNotifs(JSON.parse(n));
      if (uc)  setUnreadChats(new Set(JSON.parse(uc)));
      if (ucom) setUnreadComments(Number(ucom) || 0);
    } catch { /* ignora */ }
  }, [currentUser]);

  // Salva sempre que mudam (backup via useEffect além do save síncrono nos updaters)
  useEffect(() => {
    if (!currentUser) return;
    localStorage.setItem(`papo_notifs_${currentUser}`, JSON.stringify(notifs));
  }, [notifs, currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    localStorage.setItem(`papo_uchats_${currentUser}`, JSON.stringify([...unreadChats]));
  }, [unreadChats, currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    localStorage.setItem(`papo_ucomments_${currentUser}`, String(unreadComments));
  }, [unreadComments, currentUser]);

  // Real-time: notificações de mensagens e comentários
  // Reseta para página 1 sempre que qualquer filtro mudar
  useEffect(() => { setCurrentPage(1); }, [searchTerm, filters, selectedGender, filterPerto]);

  useEffect(() => {
    if (!currentUser) return;

    // Ouve novas mensagens direcionadas ao usuário.
    // FILTRO SERVER-SIDE: remetente!=currentUser corta ~50% do trafego
    // (mensagens enviadas pelo proprio user nao chegam aqui — economiza
    // bandwidth + cpu). Substring match em conversa_id eh feito no
    // client porque realtime do Supabase nao tem LIKE/ilike no filter.
    const msgChannel = supabase
      .channel('notif_mensagens_' + currentUser)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'mensagens',
        filter: `remetente=neq.${currentUser}`,
      }, async (payload) => {
        const m = payload.new as { id: string; conversa_id: string; remetente: string; conteudo: string; created_at: string };
        const user = currentUserRef.current;
        if (!user || m.remetente === user) return;

        // Mensagens de grupo: aceita se for grupo (group__uuid) — group membership é validada
        // posteriormente quando o user abre o chat. Conversas 1-1: precisa conter o user.
        const isGroupMsg = m.conversa_id.startsWith('group__');
        if (!isGroupMsg && !m.conversa_id.includes(user)) return;

        fireTroky(); // vinheta: nova mensagem recebida

        // Atualiza badge do Chat e persiste imediatamente
        setUnreadChats(prev => {
          const next = new Set([...prev, m.conversa_id]);
          localStorage.setItem(`papo_uchats_${user}`, JSON.stringify([...next]));
          return next;
        });

        // Dispara evento leve pra ChatsTab patch local (sem re-rodar load())
        try {
          window.dispatchEvent(new CustomEvent('papo-chat-new-msg', { detail: { conversaId: m.conversa_id } }));
        } catch {}

        // Detecta proposta de troca ou doação aceita → adiciona à aba Notificações
        try {
          const key = await deriveKey(m.conversa_id);
          // Usa decryptMsgWithFallback para lidar com renames de username
          const text = await decryptMsgWithFallback(m.conteudo, key, m.conversa_id);
          if (text === '[mensagem]') return; // falhou a decriptação, nada a detectar

          // Notificação genérica de nova mensagem
          const preview = text.length > 80 ? text.slice(0, 80) + '…' : text;
          setNotifs(prev => {
            if (prev.some(n => n.id === m.id)) return prev;
            const updated: AppNotif[] = [{
              id: m.id,
              type: 'nova_mensagem',
              from: m.remetente,
              conversaId: m.conversa_id,
              preview,
              timestamp: m.created_at,
              read: false,
            }, ...prev];
            localStorage.setItem(`papo_notifs_${user}`, JSON.stringify(updated));
            return updated;
          });

          // Push notification do navegador (foreground/in-page)
          try {
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              const n = new Notification(`Nova mensagem de @${m.remetente}`, {
                body: preview,
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                tag: `msg-${m.conversa_id}`,
              });
              n.onclick = () => { window.focus(); n.close(); };
            }
          } catch { /* noop */ }

          // (removido cleanup: notif 'proposta' e 'doacao_aceita' —
          // marketplace antigo)
        } catch { /* ignora erros de decrypt */ }
      })
      .subscribe();

    // Ouve novos comentários nos anúncios do usuário
    const commentChannel = supabase
      .channel('notif_comentarios_' + currentUser)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comentarios' }, async (payload) => {
        const c = payload.new as { anuncio_id: string; username: string };
        if (c.username === currentUserRef.current) return;
        const { data } = await supabase
          .from('anuncios')
          .select('username')
          .eq('id', c.anuncio_id)
          .single();
        if (data?.username === currentUserRef.current) {
          setUnreadComments(prev => {
            const next = prev + 1;
            localStorage.setItem(`papo_ucomments_${currentUserRef.current}`, String(next));
            return next;
          });
        }
      })
      .subscribe();

    // (Canal 'notif:<user>' duplicado REMOVIDO — agora vive no useEffect
    // unico la em cima, com handlers de nudge E new_notif na MESMA conexao.)

    // Canal de novos cadastros: notifica todos os alunos quando alguém novo se cadastra
    const newSignupChannel = supabase
      .channel('papo_new_signups')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'papo_new_signups' }, (payload) => {
        const s = payload.new as { username: string; escola?: string; consultor?: string; pais_origem?: string; pais_destino?: string };
        const user = currentUserRef.current;
        if (!user || !s?.username) return;
        if (s.username === user) return; // não notifica a si mesmo
        const notif: AppNotif = {
          id: `signup:${s.username}:${Date.now()}`,
          type: 'novo_aluno',
          from: s.username,
          escola: s.escola || undefined,
          consultor: s.consultor || undefined,
          paisOrigem: s.pais_origem || undefined,
          paisDestino: s.pais_destino || undefined,
          timestamp: new Date().toISOString(),
          read: false,
        };
        setNotifs(prev => {
          if (prev.some(x => x.id === notif.id)) return prev;
          const updated: AppNotif[] = [notif, ...prev];
          localStorage.setItem(`papo_notifs_${user}`, JSON.stringify(updated));
          return updated;
        });
      })
      .subscribe();

    // Notificações persistentes da tabela app_notifications (likes, comentários,
    // story likes/comments, friend req, follows, meets). Cobre cross-device:
    // se o usuário recebeu uma notif num device, vai aparecer no outro também.
    const loadAppNotifs = async () => {
      try {
        const { data } = await supabase
          .from('app_notifications')
          .select('*')
          .eq('to_user', currentUser)
          .order('created_at', { ascending: false })
          .limit(50);
        if (!data) return;
        const mapped: AppNotif[] = data.map((r: any) => ({
          id: r.id,
          type: r.type,
          from: r.from_user || '',
          title: r.title,
          body: r.body || '',
          refId: r.ref_id || undefined,
          imageUrl: r.image_url || undefined,
          timestamp: r.created_at,
          read: !!r.read,
        }));
        setNotifs(prev => {
          // Mescla por id (nunca duplica)
          const seen = new Set(prev.map(p => p.id));
          const merged = [...prev];
          for (const n of mapped) if (!seen.has(n.id)) merged.push(n);
          merged.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
          localStorage.setItem(`papo_notifs_${currentUser}`, JSON.stringify(merged));
          return merged;
        });
      } catch {}
    };
    loadAppNotifs();

    const appNotifChannel = supabase
      .channel(`app_notif:${currentUser}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'app_notifications',
        filter: `to_user=eq.${currentUser}`,
      }, (payload) => {
        const r = payload.new as any;
        const n: AppNotif = {
          id: r.id,
          type: r.type,
          from: r.from_user || '',
          title: r.title,
          body: r.body || '',
          refId: r.ref_id || undefined,
          imageUrl: r.image_url || undefined,
          timestamp: r.created_at,
          read: false,
        };
        setNotifs(prev => {
          if (prev.some(x => x.id === n.id)) return prev;
          const updated = [n, ...prev];
          localStorage.setItem(`papo_notifs_${currentUser}`, JSON.stringify(updated));
          return updated;
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(commentChannel);
      // notifBroadcastChannel foi consolidado no useEffect de 'notif:<user>'
      supabase.removeChannel(newSignupChannel);
      supabase.removeChannel(appNotifChannel);
    };
  }, [currentUser]);

  // (removido cleanup: loadProducts / realtime anuncios — marketplace legado Trok Vibe)
  // No Student Club não temos feed de anúncios. ChatsTab recebe products=[] vazio.
  const loadProducts = useCallback(() => { /* noop */ }, []);

  // ── Histórico de navegação (swipe back/forward) ──────────────────────
  const navHistoryRef  = useRef<Tab[]>([]);
  const navForwardRef  = useRef<Tab[]>([]);

  const goTo = (tab: Tab, extra?: () => void) => {
    // Re-tap em Início (já está na home) → rola pro topo (igual Instagram).
    if (tab === 'home' && activeTab === 'home') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    // Só empurra no histórico se for uma tab diferente da atual
    if (tab !== activeTab) {
      navHistoryRef.current = [...navHistoryRef.current, activeTab];
      navForwardRef.current = []; // limpa "futuro" ao navegar para nova tab
    }
    setTransitioning(true);
    setTimeout(() => {
      setActiveTab(tab);
      extra?.();
      setTransitioning(false);
      // Quando navega PRA Início, sempre garante o topo.
      if (tab === 'home') window.scrollTo({ top: 0, behavior: 'auto' });
    }, 150);
  };

  const goBack = () => {
    const prev = navHistoryRef.current.pop();
    if (!prev) return;
    navForwardRef.current = [activeTab, ...navForwardRef.current];
    setTransitioning(true);
    setTimeout(() => { setActiveTab(prev); setTransitioning(false); }, 150);
  };

  const goForward = () => {
    const next = navForwardRef.current.shift();
    if (!next) return;
    navHistoryRef.current = [...navHistoryRef.current, activeTab];
    setTransitioning(true);
    setTimeout(() => { setActiveTab(next); setTransitioning(false); }, 150);
  };

  const handleLogin = (username: string, isNewUser = false, tipoConta?: 'pf' | 'pj') => {
    localStorage.setItem('papo_username', username);
    setCurrentUser(username);
    // CARREGAMENTO IMEDIATO DA FOTO — não confia no effect de [currentUser] que
    // depende de session restore (race condition no Safari/iOS WebKit).
    // Faz uma query enxuta direto pra usuarios e força o state + cache.
    (async () => {
      try {
        const { data } = await supabase
          .from('usuarios')
          .select('foto_perfil')
          .eq('username', username)
          .maybeSingle();
        if ((data as any)?.foto_perfil) setFotoPerfil((data as any).foto_perfil);
      } catch { /* silencioso — o effect normal tenta de novo */ }
    })();
    if (tipoConta) {
      setUserTipoConta(tipoConta);
      try {
        const prev = JSON.parse(localStorage.getItem('papo_profile') || '{}');
        localStorage.setItem('papo_profile', JSON.stringify({ ...prev, tipo_conta: tipoConta }));
      } catch {}
    }
    setTimeout(() => fireTroky(), 800);
    if (isNewUser) {
      // Mostra onboarding imediatamente (sem delay longo)
      setTimeout(() => setShowOnboarding(true), 1200);
    } else if (localStorage.getItem('papo_show_onboarding') === '1') {
      // Flag pendente do cadastro (ex: usuário fechou e reabriu)
      localStorage.removeItem('papo_show_onboarding');
      setTimeout(() => setShowOnboarding(true), 1200);
    }
  };

  const handleUserBlocked = useCallback((reason: string) => {
    setUserStatusConta('bloqueada');
    setMotivoBloqueio(reason);
  }, []);

  // (removido cleanup: handleCreateProduct / handleDeleteProduct / countView /
  // handleOpenProduct — fluxos do marketplace legado Trok Vibe)

  const CATEGORY_TREE: { label: string; children?: string[] }[] = [
    { label: 'Todos' },
    { label: 'Eletrônicos' },
    { label: 'Games' },
    { label: 'Computadores' },
    { label: 'Celulares' },
    { label: 'Áudio' },
    { label: 'Roupas' },
    { label: 'Calçados' },
    { label: 'Acessórios' },
    { label: 'Bolsas & Mochilas' },
    { label: 'Relógios' },
    { label: 'Esportes' },
    { label: 'Livros' },
    { label: 'Casa & Decoração' },
    { label: 'Beleza' },
    { label: 'Infantil' },
    { label: 'Automóveis', children: ['Moto', 'Carro', 'Caminhão'] },
    { label: 'Animais', children: ['Cachorro', 'Gato'] },
    { label: 'Outros' },
  ];
  const categories = [
    'Todos','Eletrônicos','Games','Computadores','Celulares','Áudio',
    'Roupas','Calçados','Acessórios','Bolsas & Mochilas','Relógios',
    'Esportes','Livros','Casa & Decoração','Beleza','Infantil',
    'Automóveis','Moto','Carro','Caminhão',
    'Animais','Cachorro','Gato','Outros',
  ];
  const genderFilters = ['Todos', 'Masculino', 'Feminino', 'Unissex'];

  // Pai → filhos (inclui nomes antigos para compatibilidade)
  const categoryChildren: Record<string, string[]> = {
    'Automóveis': ['Moto','Carro','Caminhão','Veículos','veiculos','automoveis'],
    'Animais': ['Cachorro','Gato'],
  };
  // Filho → categorias que também devem ser incluídas (pai + sinônimos)
  const categoryAliases: Record<string, string[]> = {
    'Moto':     ['Moto','Automóveis','Veículos'],
    'Carro':    ['Carro','Automóveis','Veículos'],
    'Caminhão': ['Caminhão','Automóveis','Veículos'],
    'Cachorro': ['Cachorro','Animais'],
    'Gato':     ['Gato','Animais'],
  };

  // Dicionário de keywords por segmento — usado pelo filtro PJ e pelo Match IA
  const segmentKeywords: Record<string, RegExp> = {
    'Beleza / Estética': /\b(cabelo|corte|escova|barba|sobrancelha|salao|salão|barbearia|manicure|pedicure|unha|esmalte|maquiagem|make|batom|sombra|base|rimel|máscara|depilac|depilação|cera|laser|estetic|estética|facial|skincare|skin care|limpeza de pele|peeling|botox|toxina|preenchimento|harmoniza|drenagem|massagem|spa|perfume|fragranc|cosmetic|beleza)\b/i,
    'Saúde e Bem-estar': /\b(dentista|odonto|clareamento|aparelho|fisioterap|nutri|dieta|alimentar|medico|médico|consulta|exame|saude|saúde|terapia|psicolog|yoga|pilates|reabilit)\b/i,
    'Alimentação': /\b(comida|lanche|pizza|hamburg|burger|bolo|doce|brigadeiro|cupcake|confeit|padaria|panific|pao|pão|cafe|café|restaurante|delivery|marmita|sushi|cerveja|vinho|drink|buffet|cater|salgad|sorvet|gelat|food|chocolat|sorvet|açai)\b/i,
    'Moda e Vestuário': /\b(tenis|tênis|sapato|bota|sandalia|sandália|chinelo|bolsa|mochila|carteira|vestido|camisa|camiseta|blusa|jaqueta|casaco|moletom|calca|calça|jeans|short|bermuda|saia|oculos|óculos|moda|roupa|joia|jóia|aliança|anel|brinco|colar|pulseira|relogio|relógio)\b/i,
    'Esportes / Lazer': /\b(academia|musculac|crossfit|treino|fitness|personal|futebol|bola|chuteira|bicicleta|bike|ciclism|skate|patinete|escalada|surf|piscina|natac|tenis de quadra)\b/i,
    'Tecnologia': /\b(celular|smartphone|iphone|android|notebook|laptop|macbook|computador|pc|tablet|ipad|fone|headphone|headset|airpods|monitor|tv|television|televisão|camera|câmera|drone|playstation|ps5|ps4|xbox|nintendo|switch|console|game|software|app|sistema|site|landing)\b/i,
    'Construção / Reforma': /\b(pintura|pintor|reforma|pedreir|encanad|eletricist|tecnic|técnic|hidraulic|hidráulic|marceneir|gesso|porcelana|piso|azulej|drywall|alvenaria|construc|construç|obra)\b/i,
    'Transportes / Logística': /\b(frete|mudanca|mudança|carreto|transport|entrega|delivery moto|motoboy|guincho|caminhao|caminhão)\b/i,
    'Arte e Design': /\b(design|logo|logotipo|identidade visual|grafic|gráfic|ilustrac|ilustraç|tatuagem|tattoo|fotograf|book fotografic|video|edicao|edição|arte|pintura artística|artesanat)\b/i,
    'Educação': /\b(aula|curso|reforco|reforço|professor|matemat|portugu|ingles|inglês|espanhol|idioma|tutor|mentor|coach|coaching|treinamento|capacitação)\b/i,
    'Varejo / Comércio': /\b(produto|mercadoria|loja|atacad|varej|venda)\b/i,
    'Serviços Gerais': /\b(diarista|faxina|limpeza|jardim|jardinag|servic|serviç|consultoria|advoga|conta|contábil|marketing|trafego|tráfego|social media|assessoria)\b/i,
    'Agricultura / Agronegócio': /\b(agro|fazenda|planta|cultivo|colheita|gado|leite|hortali|legum|fruta|organ|orgân|sement)\b/i,
  };

  const inPJSegment = (p: Product): boolean => {
    if (userTipoConta !== 'pj') return true;
    const text = `${p.title || ''} ${p.description || ''} ${p.category || ''}`.toLowerCase();
    let re = segmentKeywords[userSegmento];
    if (!re && userSegmento) {
      const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      const target = norm(userSegmento);
      for (const key of Object.keys(segmentKeywords)) {
        const k = norm(key);
        if (k === target || k.includes(target) || target.includes(k)) { re = segmentKeywords[key]; break; }
      }
    }
    if (re && re.test(text)) return true;
    if (userSegmento) {
      const tokens = userSegmento.toLowerCase().split(/[\s/]+/).filter(t => t.length >= 4);
      if (tokens.some(t => text.includes(t))) return true;
    }
    return false;
  };

  // (removido cleanup: matchesPJSegment / filteredProducts / pagedProducts /
  // myAds / myMaxTrokValue / myWalletTroks / hasAd — marketplace legado)

  // (removido cleanup: matchedProducts, normalMatchProducts,
  // advancedMatchProducts, hasAdForAdvanced — Match IA antigo)

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <style>{`
            @keyframes swap-logo { 0%,100%{transform:scale(1)} 50%{transform:scale(1.06)} }
            .swap-logo-anim { animation: swap-logo 1.2s ease-in-out infinite; }
          `}</style>
          <img src="/logo-students.png" alt="Student Club" className="swap-logo-anim w-64 max-w-[80vw] mx-auto" />
          <p className="text-slate-500 text-sm mt-4 font-medium">Carregando...</p>
        </div>
      </div>
    );
  }

  if (showResetPassword) {
    return <ResetPasswordScreen onDone={() => { setShowResetPassword(false); supabase.auth.signOut(); }} />;
  }

  if (!currentUser) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  // Conta bloqueada — mostra tela de suspensão (só suporte disponível)
  if (userStatusConta === 'bloqueada') {
    return <BlockedScreen username={currentUser} motivo={motivoBloqueio} userEmail={userEmail} />;
  }

  // Chat em tela cheia — nada mais renderiza atrás
  if (selectedChat) {
    return (
      <div className="empresa-theme">
        {profileUsername && (
          <UserProfileModal
            username={profileUsername}
            currentUser={currentUser}
            onClose={() => setProfileUsername(null)}
            onChat={(u) => { setProfileUsername(null); openDirectChat(u); goTo('chat'); }}
          />
        )}
        <ChatPanel
          key={`${chatPanelKey}-${selectedChat.id}-${selectedChat.username}`}
          product={selectedChat}
          currentUser={currentUser}
          myAvatarUrl={fotoPerfil || undefined}
          onClose={() => setSelectedChat(null)}
          onFinalizar={async (p, fromItemId, opts) => {
            // Para doação só deletamos quando ambos os lados fecharam (skipDelete = true no primeiro clique)
            if (!opts?.skipDelete) {
              // Caso especial: amostra grátis com quantidade > 1 → decrementa em vez de deletar
              const isQuantityBased = p.tipo === 'amostra' && typeof p.quantity === 'number';
              const shouldDecrement = isQuantityBased && (p.quantity ?? 0) > 1 && !fromItemId;
              if (shouldDecrement) {
                const newQty = (p.quantity ?? 1) - 1;
                const upd = await supabase.from('anuncios').update({ quantity: newQty }).eq('id', p.id);
                if (!upd.error) {
                  setProducts(prev => prev.map(x => x.id === p.id ? { ...x, quantity: newQty } : x));
                  // Item da troca (se houver) ainda é deletado
                  if (fromItemId) {
                    await supabase.from('anuncios').update({ deleted_at: new Date().toISOString() }).eq('id', fromItemId);
                    setProducts(prev => prev.filter(x => x.id !== fromItemId));
                  }
                } else {
                  // Fallback: coluna quantity não existe → comportamento antigo
                  const idsToDelete = [p.id, fromItemId].filter(Boolean) as string[];
                  await supabase.from('anuncios').update({ deleted_at: new Date().toISOString() }).in('id', idsToDelete);
                  setProducts(prev => prev.filter(x => !idsToDelete.includes(x.id)));
                }
              } else {
                // Caminho padrão: deleta. Se for serviço com quantity exatamente 1, idem (acabou).
                const idsToDelete = [p.id, fromItemId].filter(Boolean) as string[];
                if (idsToDelete.length > 0) {
                  await supabase.from('anuncios').update({ deleted_at: new Date().toISOString() }).in('id', idsToDelete);
                  setProducts(prev => prev.filter(x => !idsToDelete.includes(x.id)));
                }
              }
              // Registra transação (somente quando finalizado de fato)
              try {
                const isAmostraTx = p.tipo === 'amostra';
                const tipo = fromItemId ? 'troca' : (isAmostraTx ? 'amostra' : 'doacao');
                // Tenta inserir com o tipo correto; se a coluna tiver CHECK constraint
                // que não aceita 'amostra', faz fallback para 'doacao' (a distinção é
                // recuperada depois via JOIN com anuncios.tipo).
                let res = await supabase.from('transacoes').insert({
                  doador_username: p.username,
                  recebedor_username: currentUser,
                  tipo,
                  anuncio_id: p.id,
                });
                if (res.error && isAmostraTx) {
                  await supabase.from('transacoes').insert({
                    doador_username: p.username,
                    recebedor_username: currentUser,
                    tipo: 'doacao',
                    anuncio_id: p.id,
                  });
                }
                // Atualiza contadores locais imediatamente
                if (isAmostraTx) {
                  if (p.username === currentUser) setUserAmostrasDadas(n => n + 1);
                  else {
                    setUserAmostrasRecebidas(n => n + 1);
                    // Quem recebe a amostra é o currentUser; quem deu é o p.username
                    // (atualização local apenas para o currentUser; o doador atualiza ao recarregar)
                  }
                }
              } catch { /* tabela pode não existir ainda */ }
            }
            setSelectedChat(null);
            // (removido cleanup: setRatingProduct/setRatingFromItemId — avaliacao antiga)
            void p; void fromItemId;
          }}
          onOpenProductById={async (_id) => {
            // (removido cleanup: abertura de ProductDetail por id — marketplace legado.
            // ChatPanel ainda invoca este callback ao clicar em cards antigos no histórico.)
            void _id;
          }}
          onViewProfile={(username) => setProfileUsername(username)}
        />
      </div>
    );
  }

  // ── Swipe de borda + Pull-to-refresh ───────────────────────────────────
  const handleAppTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0];
    // Swipe pra direita = goBack (app-wide). Bloqueado se touch comeca em
    // strip horizontal marcado com [data-no-swipe] (sugestoes, stories, etc),
    // inputs ou areas com swipe proprio (chat reply, etc).
    const target = e.target as HTMLElement | null;
    const inNoSwipe = !!target?.closest('[data-no-swipe], input, textarea, [contenteditable="true"]');
    if (inNoSwipe) {
      edgeSwipeRef.current = null;
    } else {
      edgeSwipeRef.current = { x: t.clientX, y: t.clientY };
    }
    // PTR: SO ativa quando o user esta NA HOME (feed) e na tela principal
    // (sem modal aberto). A pedido do user: arrastar-pra-baixo-pra-atualizar
    // nao deve disparar em telas de storys, info, settings, chat, etc.
    //
    // Bloqueios:
    //   - activeTab !== 'home' → fora da home (info, gastos, chat, etc)
    //   - cameraOpenRef → camera unificada (Post/Story) aberta
    //   - selectedChat → ChatPanel aberto
    //   - showFeedNews / showPapoStore / showMeets / showOnboarding
    //     / showVerifFlow → algum modal/sheet ocupando a tela
    //   - window.scrollY > 0 → user nao esta no topo (PTR so funciona ali)
    const someModalOpen = !!selectedChat || showFeedNews || showPapoStore
      || showMeets || showOnboarding || showVerifFlow;
    if (
      activeTab === 'home'
      && window.scrollY === 0
      && !ptrRefreshing
      && !cameraOpenRef.current
      && !someModalOpen
    ) {
      ptrStartY.current = t.clientY;
      ptrActive.current = true;
    }
  };
  const handleAppTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!ptrActive.current || ptrRefreshing) return;
    const dy = e.touches[0].clientY - ptrStartY.current;
    if (dy > 0 && window.scrollY === 0) {
      setPtrY(Math.min(dy * 0.38, 72));
    } else {
      ptrActive.current = false;
      setPtrY(0);
    }
  };
  const handleAppTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    // Gestos horizontais: dx>80 e principalmente horizontal (dx > 1.7x dy).
    //   - Na HOME (feed): swipe NAO abre mais o menu — menu so via icone
    //     na bottom nav (a pedido do user). FeedNews tem seus proprios
    //     handlers (swipe direita = camera, swipe esquerda = FriendsDrawer).
    //   - Fora da home: swipe pra direita → goBack (preserva comportamento).
    if (edgeSwipeRef.current) {
      const t = e.changedTouches[0];
      const dx = t.clientX - edgeSwipeRef.current.x;
      const dy = Math.abs(t.clientY - edgeSwipeRef.current.y);
      const isHorizontal = dx > 80 && Math.abs(dx) > dy * 1.7;
      if (isHorizontal && activeTab !== 'home') {
        goBack();
      }
      edgeSwipeRef.current = null;
    }
    // PTR
    if (!ptrActive.current) return;
    ptrActive.current = false;
    if (ptrY >= 60) {
      setPtrRefreshing(true);
      setPtrY(60);
      setTimeout(() => window.location.reload(), 900);
    } else {
      setPtrY(0);
    }
  };

  return (
    <div
      className={`min-h-screen app-root empresa-theme md:pl-[76px] ${activeTab === 'home' ? 'xl:pr-[340px]' : ''}`}
      onTouchStart={handleAppTouchStart}
      onTouchMove={handleAppTouchMove}
      onTouchEnd={handleAppTouchEnd}
    >
      {/* Sidebar lateral estilo Instagram — só desktop */}
      <DesktopSidebar
        activeTab={activeTab}
        goTo={(t) => goTo(t)}
        currentUser={currentUser}
        fotoPerfil={fotoPerfil}
        unreadChats={unreadChats.size}
        unreadNotifs={notifs.filter(n => !n.read).length}
        unreadComments={unreadComments}
        pendingRequestsCount={pendingRequestsCount}
        userTipoConta={userTipoConta}
        jaNoIntercambio={jaNoIntercambio}
        onOpenMenu={() => setMenuOpen(true)}
        onOpenMeets={() => { fireTroky(); setShowMeets(true); }}
        onOpenStore={() => setShowPapoStore(true)}
        onSignOut={() => supabase.auth.signOut()}
      />

      {/* Coluna direita — amigos online (só na home, xl+).
           top:0 + z-50 (acima do header z-40): cobre o trecho da top bar
           do lado direito, fazendo a coluna comecar no topo absoluto. */}
      {activeTab === 'home' && (
        <div
          className="hidden xl:block fixed right-0 top-0 bottom-0 z-50 overflow-y-auto bg-white"
          style={{
            width: 340,
            paddingTop: 'calc(env(safe-area-inset-top) + 8px)',
            paddingLeft: 24,
            paddingRight: 20,
          }}
        >
          <FriendsOnline
            currentUser={currentUser}
            userStatuses={userStatuses}
            onChat={(u) => { openDirectChat(u); goTo('chat'); }}
            onAddMore={() => goTo('amigos')}
          />
        </div>
      )}

      {/* Header */}
      <header className="bg-white sticky top-0 z-40">
        {/* Top bar: saudação — padding-top absorve Dynamic Island e notch */}
        <div className="bg-white text-gray-800 text-sm" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="max-w-[1400px] mx-auto px-4 py-1.5 flex items-center justify-between relative">
            {/* Avatar do usuário: só desktop (no mobile foi pra BottomNav) */}
            <span className="hidden sm:flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('conta')}
                className="flex-shrink-0 active:scale-90 transition-transform"
                title="Minha conta"
              >
                {fotoPerfil ? (
                  <img src={fotoPerfil} alt="" className="w-9 h-9 rounded-full object-cover border-2 border-white/60 shadow-sm hover:border-white transition-all" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-sm font-bold border-2 border-white/40 transition-all">
                    {currentUser.charAt(0).toUpperCase()}
                  </div>
                )}
              </button>
              <span className="text-xs text-white/80 truncate max-w-[70px] sm:max-w-none">
                {AT.hello(currentUser.length > 8 ? currentUser.slice(0, 7) + '…' : currentUser)}
              </span>
            </span>

            {/* Logo:
                - Mobile → à esquerda (static, no fluxo)
                - Desktop → centralizada (absolute) */}
            <div className="flex sm:absolute sm:left-1/2 sm:-translate-x-1/2 flex-col items-center pointer-events-none select-none">
              <h1
                className="text-lg sm:text-2xl font-bold flex items-center gap-1.5 cursor-pointer pointer-events-auto active:scale-95 transition-transform relative overflow-hidden match-ghost"
                onClick={() => { fireTroky(); setTimeout(() => window.location.reload(), 1600); }}
                title="Atualizar"
                style={{ borderRadius: 12 }}
              >
                <img src="/logo-students.png" alt="Student Club" className="h-8 sm:h-10 object-contain" />
              </h1>
            </div>

            <div className="flex items-center gap-2">
            {userTipoConta !== 'pj' && (<>
            {/* ── Idioma: globo com dropdown PT/EN/ES ── */}
            <div className="relative">
              <button
                onClick={() => setLangMenuOpen(o => !o)}
                className="flex items-center justify-center w-8 h-8 rounded-full transition-colors hover:bg-white/10 active:scale-90"
                title={lang === 'pt' ? 'Idioma' : lang === 'en' ? 'Language' : 'Idioma'}
              >
                <Globe className="w-4 h-4 text-white" strokeWidth={2.2} />
              </button>
              {langMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setLangMenuOpen(false)} />
                  <div
                    data-no-translate
                    className="absolute right-0 top-10 z-50 w-44 rounded-xl overflow-hidden shadow-xl"
                    style={{ background: '#fff', border: '1px solid #e5e7eb' }}
                  >
                    {(['pt','en','es'] as const).map(l => (
                      <button
                        key={l}
                        onClick={() => { setLang(l); setLangMenuOpen(false); }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-gray-50"
                        style={{ color: lang === l ? '#1e714a' : '#101814', fontWeight: lang === l ? 600 : 400 }}
                      >
                        <span className="text-base">{l === 'pt' ? '🇧🇷' : l === 'en' ? '🇺🇸' : '🇪🇸'}</span>
                        <span className="flex-1">{l === 'pt' ? 'Português' : l === 'en' ? 'English' : 'Español'}</span>
                        {lang === l && <span className="text-xs">✓</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            </>)}

            {/* ── Mobile: foto do usuario abre Minha Pagina; Desktop: HelpCircle tutorial ── */}
            <button
              onClick={() => { setMenuOpen(false); goTo('conta'); }}
              className="sm:hidden flex items-center justify-center w-8 h-8 rounded-full transition-colors hover:bg-white/10 active:scale-90"
              title="Minha Página"
            >
              {fotoPerfil ? (
                <img src={fotoPerfil} alt="" className="w-7 h-7 rounded-full object-cover" />
              ) : (
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: '#e5e7eb', color: '#374151' }}>
                  {currentUser?.charAt(0).toUpperCase()}
                </div>
              )}
            </button>
            <button
              onClick={() => setShowOnboarding(true)}
              className="hidden sm:flex items-center justify-center w-8 h-8 rounded-full transition-colors hover:bg-white/10 active:scale-90"
              title={AT.learnTutorial}
            >
              <HelpCircle className="w-4 h-4 text-white" strokeWidth={2.2} />
            </button>
            </div>{/* fim do grupo tema + info */}

          </div>
        </div>

        <div className="max-w-[1400px] mx-auto px-3 sm:px-4 py-1.5 sm:py-2">
          {/* Row 1: Menu + [mobile: Logo] [desktop: Search + Botões] */}
          <div className="flex items-center gap-3 mb-1.5 sm:mb-1">
            {/* Menu hamburger movido pra sidebar lateral no desktop. */}

            {/* Stories — desktop EM OUTRAS abas (na home renderiza dentro
                do conteudo pra alinhar perfeitamente com SUA VIAGEM/composer). */}
            {activeTab !== 'home' && (
              <div className="hidden sm:flex flex-1 min-w-0">
                <Stories currentUser={currentUser} />
              </div>
            )}
            {activeTab === 'home' && <div className="hidden sm:flex flex-1" />}

            {/* Search + Botões — mobile compacto + desktop. flex-shrink-0 deixa o
                Stories ocupar todo o espaço livre até encostar nos botões. */}
            <div className="flex flex-shrink-0 items-center gap-1.5 sm:gap-2 min-w-0">
              {/* (removido cleanup: botoes PJ Amostras/Promocoes — marketplace antigo) */}
            </div>
          </div>
        </div>

        {/* Barra de ação rápida (Meus Anúncios + Chat + Painel + Leads) movida pra sidebar lateral no desktop.
             Mantida apenas no mobile (hidden no desktop, mostrada via display:none aqui pois é sm:hidden). */}
        <div className="border-t border-gray-200 hidden">
          <div className="max-w-[1400px] mx-auto px-2 py-1 grid grid-cols-4 gap-1 sm:flex sm:flex-row sm:gap-2 sm:px-4 sm:py-1">
            {(() => {
              const isPJ = userTipoConta === 'pj';
              const tabStyle = (active: boolean) => isPJ
                ? (active
                    ? { background: '#ffffff', border: '1px solid #5a7a52', color: '#1a1a1a', borderRadius: 2, fontFamily: '"DM Sans", system-ui, sans-serif', letterSpacing: '0.18em', textTransform: 'uppercase' as const, fontSize: '10px', fontWeight: 500 }
                    : { background: '#ffffff', border: '1px solid #d6d3d1', color: '#78716c', borderRadius: 2, fontFamily: '"DM Sans", system-ui, sans-serif', letterSpacing: '0.18em', textTransform: 'uppercase' as const, fontSize: '10px', fontWeight: 500 })
                : (active
                    ? { background: 'linear-gradient(135deg, #4c1d95 0%, #6d28d9 50%, #7c3aed 100%)', border: '1px solid rgba(139,92,246,0.55)', color: '#fff' }
                    : { background: 'linear-gradient(135deg, #0a0a0a 0%, #1c1c1e 40%, #2a2a2e 70%, #111113 100%)', border: '1px solid rgba(255,255,255,0.13)', color: 'rgba(255,255,255,0.82)' });
              return (<>
            {/* Meus Anúncios */}
            <button
              data-tutorial="tab-meus"
              onClick={() => { goTo('meus', () => { setUnreadComments(0); localStorage.removeItem(`papo_ucomments_${currentUser}`); }); }}
              className={`tab-ghost flex items-center justify-center gap-1 px-1.5 py-1.5 sm:px-3 sm:py-1 text-xs sm:text-xs font-semibold transition-all relative overflow-hidden ${isPJ ? '' : 'rounded-full'}`}
              style={tabStyle(activeTab === 'meus')}
            >
              {!isPJ && '📋 '}<span className="truncate sm:whitespace-nowrap"><span className="sm:hidden">{AT.myAdsShort}</span><span className="hidden sm:inline">{AT.myAds}</span></span>
              {unreadComments > 0 && <span className={`text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${isPJ ? '' : 'bg-red-500'}`} style={isPJ ? { background: '#b8896a' } : undefined}>{unreadComments}</span>}
            </button>

            {/* Chat */}
            <button
              data-tutorial="tab-chat"
              onClick={() => goTo('chat')}
              className={`tab-ghost flex items-center justify-center gap-1 px-1.5 py-1.5 sm:px-3 sm:py-1 text-xs sm:text-xs font-semibold transition-all relative overflow-hidden ${isPJ ? '' : 'rounded-full'}`}
              style={tabStyle(activeTab === 'chat')}
            >
              {!isPJ && '💬 '}{AT.chat}
              {unreadChats.size > 0 && <span className={`text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${isPJ ? '' : 'bg-red-500'}`} style={isPJ ? { background: '#b8896a' } : undefined}>{unreadChats.size}</span>}
            </button>

            {/* Matchs */}
            <button
              data-tutorial="tab-likes"
              onClick={() => goTo('likes')}
              className={`tab-ghost flex items-center justify-center gap-1 px-1.5 py-1.5 sm:px-3 sm:py-1 text-xs sm:text-xs font-semibold transition-all relative overflow-hidden ${isPJ ? '' : 'rounded-full'}`}
              style={tabStyle(activeTab === 'likes')}
            >
              ℹ️ <span className="truncate">Informações</span>
            </button>

            {/* Painel (Gastos) — antes era condicional PJ→Leads, agora so PF→Painel */}
            <button
              onClick={() => goTo('gastos')}
              className="tab-ghost relative flex items-center justify-center gap-1 px-1.5 py-1.5 sm:px-3 sm:py-1 text-xs sm:text-xs font-semibold transition-all overflow-hidden rounded-full"
              style={tabStyle(activeTab === 'gastos')}
            >
              <span className="truncate">Painel</span>
            </button>
              </>);
            })()}
          </div>
        </div>

        {/* MOBILE: Stories dentro do header — gruda junto com ele no scroll
            (sticky com z menor causava recorte por baixo do header). */}
        {activeTab === 'home' && (
          <div className="sm:hidden bg-white">
            <Stories currentUser={currentUser} fotoPerfil={fotoPerfil} />
          </div>
        )}
      </header>

      {/* Pull-to-refresh indicator */}
      {(ptrY > 0 || ptrRefreshing) && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9998,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'flex-end',
          height: `${ptrRefreshing ? 60 : ptrY}px`,
          background: 'linear-gradient(180deg, #111827 0%, transparent 100%)',
          transition: ptrRefreshing ? 'none' : 'height 0.05s',
          paddingBottom: 6,
          opacity: ptrRefreshing ? 1 : ptrY / 60,
          pointerEvents: 'none',
        }}>
          <style>{`
            @keyframes ptr-spin { to { transform: rotate(360deg); } }
            @keyframes ptr-bounce { 0%,100%{transform:scale(1)} 50%{transform:scale(1.15)} }
            .ptr-spin { animation: ptr-spin 0.7s linear infinite; }
            .ptr-bounce { animation: ptr-bounce 0.7s ease-in-out infinite; }
          `}</style>
          <img
            src="/logo-students.png"
            alt=""
            className={ptrRefreshing ? 'ptr-bounce' : ''}
            style={{ width: 32, height: 32, objectFit: 'contain' }}
          />
        </div>
      )}

      {/* Menu Drawer */}
      <MenuDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        activeTab={activeTab}
        onGoTo={(tab) => {
          // Tabs especiais: abrem modais ou disparam acoes em vez de navegar
          if (tab === 'store') { setMenuOpen(false); setShowPapoStore(true); return; }
          if (tab === 'meets') { setMenuOpen(false); setShowMeets(true); return; }
          if (tab === 'composer') {
            // Abre composer de post (mesmo evento do botao Camera do BottomNav)
            setMenuOpen(false);
            goTo('home');
            window.dispatchEvent(new CustomEvent('papo-open-composer'));
            return;
          }
          goTo(tab, () => { if (tab === 'meus') { setUnreadComments(0); localStorage.removeItem(`papo_ucomments_${currentUser}`); } });
        }}
        unreadChats={unreadChats.size}
        unreadComments={unreadComments}
        unreadNotifs={notifs.filter(n => !n.read).length + pendingRequestsCount}
        verificado={userVerificado}
        docEnviado={userDocEnviado}
        onEnviarDocs={() => setShowVerifFlow(true)}
        onLogout={() => supabase.auth.signOut()}
        onOpenTutorial={() => setShowOnboarding(true)}
        currentUser={currentUser}
        fotoPerfil={fotoPerfil}
        isPJ={userTipoConta === 'pj'}
      />

      {/* Wrapper Suspense para os tabs carregados lazy. Fallback null mantem
          a tela em branco por menos de 100ms enquanto o chunk baixa — sem
          spinners "piscando" pra rotas que carregam rapido. */}
      <Suspense fallback={null}>
      {/* (removido cleanup: activeTab 'leads' + PainelControle — features PJ) */}
      {activeTab === 'likes' && <InfoTab userEmail={userEmail} currentUser={currentUser || undefined} />}
      {activeTab === 'meus' && (jaNoIntercambio ? (
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-purple-50 border border-purple-100 flex items-center justify-center mx-auto mb-3">🌍</div>
          <p className="text-gray-700 font-semibold mb-1">Você já está fazendo intercâmbio</p>
          <p className="text-sm text-gray-500">Meus Docs fica oculto pra quem já chegou no destino.</p>
        </div>
      ) : <MyDocs currentUser={currentUser} />)}
      {activeTab === 'gastos' && <Gastos currentUser={currentUser} />}
      {activeTab === 'chat' && (
        <div
          className="flex flex-col md:flex-row max-w-[1400px] mx-auto"
        >
          {/* Mobile: amigos online primeiro (barra horizontal compacta), depois conversas */}
          <div className="md:hidden order-1">
            <FriendsOnline
              currentUser={currentUser}
              userStatuses={userStatuses}
              onChat={openDirectChat}
              onAddMore={() => goTo('amigos')}
            />
          </div>
          <div className="flex-1 min-w-0 order-2 md:order-1">
            <ChatsTab
              key={chatKey}
              currentUser={currentUser}
              products={products}
              onOpenChat={(p) => { setSelectedChat(p); }}
              onOpenDirectChat={openDirectChat}
              unreadIds={unreadChats}
              onMarkRead={(id) => setUnreadChats(prev => {
                const n = new Set(prev); n.delete(id);
                localStorage.setItem(`papo_uchats_${currentUser}`, JSON.stringify([...n]));
                return n;
              })}
              onClearOrphanedUnreads={(ids) => setUnreadChats(prev => {
                const n = new Set(prev);
                ids.forEach(id => n.delete(id));
                localStorage.setItem(`papo_uchats_${currentUser}`, JSON.stringify([...n]));
                return n;
              })}
            />
          </div>
          {/* Desktop: sidebar de amigos online */}
          <div className="hidden md:block order-2">
            <FriendsOnline
              currentUser={currentUser}
              userStatuses={userStatuses}
              onChat={openDirectChat}
              onAddMore={() => goTo('amigos')}
            />
          </div>
        </div>
      )}
      {activeTab === 'pesquisar' && (
        <SearchUsers currentUser={currentUser} onOpenProfile={setProfileUsername} />
      )}
      {activeTab === 'amigos' && (
        <FriendsTab
          currentUser={currentUser}
          userStatuses={userStatuses}
          onOpenProfile={setProfileUsername}
          onChat={(u) => { openDirectChat(u); goTo('chat'); }}
        />
      )}
      {activeTab === 'sobre' && <AboutSection />}
      {activeTab === 'studentclub' && (
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-2xl font-bold text-gray-800">Student Club</h2>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Seu cartão Student Club e benefícios exclusivos.
          </p>
          <div className="max-w-md">
            <StudentClubCard currentUser={currentUser} nome={userNome} />
          </div>
          {/* TODO: aqui virão funções adicionais — histórico de uso, benefícios, regulamento etc. */}
          <div className="bg-stone-50 border border-stone-200 rounded-2xl p-5 text-sm text-stone-600">
            Em breve: histórico de benefícios usados, lista de parceiros e regulamento.
          </div>
        </div>
      )}
      {activeTab === 'planos' && <PricingSection trialDaysLeft={trialDaysLeft} advancedTrialDaysLeft={advancedTrialDaysLeft} userPlan={userPlan} userVerificado={userVerificado} onVerificar={() => setShowVerifFlow(true)} />}
      {activeTab === 'contato' && <ContactSection />}
      {activeTab === 'ajustes' && (
        <SettingsTab
          currentUser={currentUser}
          userId={userId}
          onOpenSeguranca={() => goTo('seguranca')}
          onOpenContato={() => goTo('contato')}
          theme={theme}
          onThemeChange={setTheme}
          lang={lang}
          onLangChange={setLang}
        />
      )}

      {/* Banner "Enviar Documentos" removido da aba Minha Conta. */}

      {activeTab === 'conta' && (
        <MinhaContaTabMemo
          currentUser={currentUser}
          userId={userId}
          userEmail={userEmail}
          userNome={userNome}
          userTelefone={userTelefone}
          userEndereco={userEndereco}
          userMostrarTelefone={userMostrarTelefone}
          userEmailVerificado={userEmailVerificado}
          userTelefoneVerificado={userTelefoneVerificado}
          fotoPerfil={fotoPerfil}
          trocas={userTrocas}
          doacoesFeitas={userDoacoesFeitas}
          doacoesRecebidas={userDoacoesRecebidas}
          amostrasDadas={userAmostrasDadas}
          amostrasRecebidas={userAmostrasRecebidas}
          verificado={userVerificado}
          docEnviado={userDocEnviado}
          isPJ={userTipoConta === 'pj'}
          segmento={userSegmento}
          onSegmentoChange={setUserSegmento}
          onUsernameAtualizado={(newUser) => {
            const oldUser = currentUser;
            setCurrentUser(newUser);
            saveProfileCache({ username: newUser });
            // Atualiza username nos produtos em state para MyAds re-renderizar corretamente
            setProducts(prev => prev.map(p => p.username === oldUser ? { ...p, username: newUser } : p));
            // forca re-fetch do perfil novo do banco
            refreshProfile();
          }}
          onFotoAtualizada={(url) => { setFotoPerfil(url); saveProfileCache({ foto_perfil: url }); }}
          onDadosAtualizados={(d) => {
            const patch: Record<string, any> = {};
            if (d.nome !== undefined)            { setUserNome(d.nome);                       patch.nome = d.nome; }
            if (d.telefone !== undefined)        { setUserTelefone(d.telefone);               patch.telefone = d.telefone; }
            if (d.endereco !== undefined)        { setUserEndereco(d.endereco);               patch.endereco = d.endereco; }
            if (d.mostrar_telefone !== undefined){ setUserMostrarTelefone(d.mostrar_telefone); patch.mostrar_telefone = d.mostrar_telefone; }
            saveProfileCache(patch);
            // FORCA re-fetch do perfil — garante que o nome (e demais
            // campos) reflitam o que ta no banco IMEDIATAMENTE, sem
            // depender de logout/login pra ver o valor salvo.
            refreshProfile();
          }}
        />
      )}

      {activeTab === 'seguranca' && (
        <MinhaContaTabMemo
          view="security"
          onAccountDeleted={() => setCurrentUser(null)}
          currentUser={currentUser}
          userId={userId}
          userEmail={userEmail}
          userNome={userNome}
          userTelefone={userTelefone}
          userEndereco={userEndereco}
          userMostrarTelefone={userMostrarTelefone}
          userEmailVerificado={userEmailVerificado}
          userTelefoneVerificado={userTelefoneVerificado}
          fotoPerfil={fotoPerfil}
          trocas={userTrocas}
          doacoesFeitas={userDoacoesFeitas}
          doacoesRecebidas={userDoacoesRecebidas}
          amostrasDadas={userAmostrasDadas}
          amostrasRecebidas={userAmostrasRecebidas}
          verificado={userVerificado}
          docEnviado={userDocEnviado}
          isPJ={userTipoConta === 'pj'}
          segmento={userSegmento}
          onSegmentoChange={setUserSegmento}
          onUsernameAtualizado={(newUser) => {
            const oldUser = currentUser;
            setCurrentUser(newUser);
            saveProfileCache({ username: newUser });
            setProducts(prev => prev.map(p => p.username === oldUser ? { ...p, username: newUser } : p));
            // forcando re-fetch tambem aqui (apos username change o profile
            // effect ja re-roda por causa de [currentUser], mas chamamos
            // explicito por seguranca)
            refreshProfile();
          }}
          onFotoAtualizada={(url) => { setFotoPerfil(url); saveProfileCache({ foto_perfil: url }); }}
          onDadosAtualizados={(d) => {
            const patch: Record<string, any> = {};
            if (d.nome !== undefined)            { setUserNome(d.nome);                       patch.nome = d.nome; }
            if (d.telefone !== undefined)        { setUserTelefone(d.telefone);               patch.telefone = d.telefone; }
            if (d.endereco !== undefined)        { setUserEndereco(d.endereco);               patch.endereco = d.endereco; }
            if (d.mostrar_telefone !== undefined){ setUserMostrarTelefone(d.mostrar_telefone); patch.mostrar_telefone = d.mostrar_telefone; }
            saveProfileCache(patch);
            refreshProfile();
          }}
        />
      )}
      </Suspense>

      {/* Tela de notificações */}
      {activeTab === 'notif' && (
        <div className="max-w-[640px] mx-auto px-3 py-6 w-full">
          {/* Pedidos de amizade pendentes — sempre no topo */}
          <NotificationsTab currentUser={currentUser} />
          <div className="flex items-center justify-end mb-4 mt-6">
            {notifs.length > 0 && (
              <button
                onClick={() => {
                  setNotifs([]);
                  // Apaga todas as notifs persistentes do usuario no DB
                  supabase.from('app_notifications').delete().eq('to_user', currentUser).then(() => {});
                }}
                className="text-xs font-semibold px-5 py-2 rounded-full border border-red-200 text-red-500 bg-red-50/40 hover:bg-red-50 transition-colors active:scale-95"
              >
                {AT.deleteAllNotifs}
              </button>
            )}
          </div>

          {/* Filtro Todas / Nao lidas / Lidas */}
          {notifs.length > 0 && (() => {
            const unreadCount = notifs.filter(x => !x.read).length;
            const readCount = notifs.length - unreadCount;
            const tabs: { id: 'all' | 'unread' | 'read'; label: string; count: number }[] = [
              { id: 'all', label: 'Todas', count: notifs.length },
              { id: 'unread', label: 'Não lidas', count: unreadCount },
              { id: 'read', label: 'Lidas', count: readCount },
            ];
            return (
              <div className="flex gap-2 mb-4 flex-wrap">
                {tabs.map(t => {
                  const active = notifFilter === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setNotifFilter(t.id)}
                      className="px-5 py-2 rounded-full text-xs font-semibold transition-all active:scale-95 inline-flex items-center gap-1.5"
                      style={{
                        background: active ? '#1e714a' : '#ffffff',
                        color: active ? '#fff' : '#5b6b63',
                        border: active ? '1px solid #1e714a' : '1px solid #e7e5e4',
                        boxShadow: active
                          ? '0 2px 8px rgba(30,113,74,0.25)'
                          : '0 1px 2px rgba(0,0,0,0.04)',
                      }}
                    >
                      <span>{t.label}</span>
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full"
                        style={{
                          background: active ? 'rgba(255,255,255,0.22)' : '#f4f6f4',
                          color: active ? '#fff' : '#5b6b63',
                        }}
                      >
                        {t.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })()}

          {(() => {
            const visibleNotifs = notifs.filter(n => {
              if (notifFilter === 'unread') return !n.read;
              if (notifFilter === 'read') return n.read;
              return true;
            });
            if (visibleNotifs.length === 0) {
              return (
                <div className="text-center py-20 text-gray-400">
                  <p className="text-5xl mb-4">❤️</p>
                  <p className="text-base font-medium">
                    {notifFilter === 'unread' ? 'Nenhuma notificação não lida'
                      : notifFilter === 'read' ? 'Nenhuma notificação lida'
                      : AT.noNotifs}
                  </p>
                  {notifFilter === 'all' && <p className="text-sm mt-1">{AT.noNotifsDesc}</p>}
                </div>
              );
            }
            return (
            <div className="space-y-3">
              {visibleNotifs.map(n => {
                const isSignup = n.type === 'novo_aluno';
                const isMsg = n.type === 'nova_mensagem';
                // Tipos genéricos vindos da tabela app_notifications: usam title+body
                const isGeneric = n.type === 'like' || n.type === 'comment'
                  || n.type === 'story_like' || n.type === 'story_comment'
                  || n.type === 'amizade' || n.type === 'follow' || n.type === 'meet'
                  || n.type === 'nudge'
                  || n.type === 'mention_post' || n.type === 'mention_story';
                const imgSrc = isSignup || isMsg
                  ? undefined
                  : isGeneric
                    ? n.imageUrl
                    : (n.type === 'proposta' ? n.fromItem?.image : n.productImage);
                const label = isGeneric
                  ? (n.title || `${n.from}`)
                  : isSignup
                    ? `Novo aluno: ${n.from} entrou no Student Club`
                    : isMsg
                      ? `Nova mensagem de ${n.from}`
                      : n.type === 'proposta'
                        ? AT.notifsProposal(n.from)
                        : AT.notifsAccepted(n.from);
                const sub = isGeneric
                  ? (n.body || '')
                  : isSignup
                    ? [n.escola && `🎓 ${n.escola}`, n.consultor && `🧑‍💼 ${n.consultor}`].filter(Boolean).join(' · ')
                    : isMsg
                      ? (n.preview ?? '')
                      : n.type === 'proposta'
                        ? `${n.fromItem?.title ?? ''}${(n.fromItem?.trokValue ?? 0) > 0 ? ` 🪙 ${n.fromItem!.trokValue.toLocaleString('pt-BR')}T` : ''} → ${n.toProductTitle ?? ''}`
                        : n.productTitle ?? '';
                // Cor de accent por tipo (usada como left-border colorida pra
                // manter identidade visual sem brigar com o dark mode override).
                const accentColor =
                  n.type === 'like' || n.type === 'story_like' ? '#f43f5e'
                  : n.type === 'comment' || n.type === 'story_comment' ? '#3b82f6'
                  : n.type === 'amizade' || n.type === 'follow' || isSignup ? '#1e714a'
                  : n.type === 'nudge' ? '#eab308'
                  : n.type === 'mention_post' || n.type === 'mention_story' ? '#92400e'
                  : isMsg ? '#3b82f6'
                  : n.type === 'doacao_aceita' ? '#f97316'
                  : '#7c3aed';
                const genericIcon =
                  n.type === 'like' || n.type === 'story_like' ? '❤️'
                  : n.type === 'comment' || n.type === 'story_comment' ? '💬'
                  : n.type === 'amizade' ? '🤝'
                  : n.type === 'follow' ? '👤'
                  : n.type === 'nudge' ? '👋'
                  : n.type === 'mention_post' || n.type === 'mention_story' ? '@'
                  : '📅';
                const tsDate = new Date(n.timestamp);
                const tsStr = tsDate.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

                const markRead = () => {
                  if (n.read) return;
                  setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
                  if (isGeneric) {
                    supabase.from('app_notifications').update({ read: true }).eq('id', n.id).then(() => {});
                  }
                };
                // Abre o conteudo referenciado pela notif (post, story, perfil, etc)
                const openContent = () => {
                  markRead();
                  if (n.type === 'amizade' || n.type === 'follow' || n.type === 'novo_aluno') {
                    if (n.from) setProfileUsername(n.from);
                    return;
                  }
                  if (n.type === 'meet') {
                    setShowMeets(true);
                    return;
                  }
                  if (n.type === 'like' || n.type === 'comment' || n.type === 'mention_post') {
                    // Abre o post em modal separado (sem sair da aba notif).
                    // mention_post: idem — refId aponta pro post mencionado.
                    if (n.refId) setOpenPostId(n.refId);
                    return;
                  }
                  if (n.type === 'story_like' || n.type === 'story_comment' || n.type === 'mention_story') {
                    // Dispara evento pra Stories abrir o viewer naquele story.
                    // mention_story: idem — refId aponta pro story mencionado.
                    window.dispatchEvent(new CustomEvent('papo-open-story', { detail: { storyId: n.refId } }));
                    return;
                  }
                  if (n.type === 'nova_mensagem' && n.from) {
                    // ROTA CANONICA: usa openDirectChat (productId='direct') em
                    // vez de pegar QUALQUER produto do remetente. Bug antigo:
                    // se o remetente tinha um anuncio, `prod.id` virava o uuid
                    // do anuncio -> convId = A__B__<uuid> diferente do
                    // A__B__direct usado pelo perfil/search. Resultado: duas
                    // conversas paralelas pra mesma dupla de users.
                    openDirectChat(n.from);
                    goTo('chat');
                    return;
                  }
                };
                return (
                  <div
                    key={n.id}
                    onClick={openContent}
                    className="flex items-center gap-3 p-4 rounded-2xl cursor-pointer transition-opacity"
                    style={{
                      // Usa tokens do tema — fica branco no light, #0c1014 no dark.
                      // Borda esquerda colorida (4px) mantem a identidade visual
                      // de cada tipo de notif sem precisar dos pasteis do Tailwind
                      // que sao forcados a cream em dark mode.
                      background: 'var(--sc-bg-card)',
                      border: '1px solid var(--sc-drawer-border, rgba(0,0,0,0.08))',
                      borderLeft: `4px solid ${accentColor}`,
                      opacity: n.read ? 0.6 : 1,
                    }}
                  >
                    {imgSrc ? (
                      // Thumbnail REDONDO (novo layout). Badge do tipo no
                      // canto inferior direito identifica a ação.
                      <div className="relative w-14 h-14 flex-shrink-0">
                        <img src={imgSrc} alt="" className="w-14 h-14 rounded-full object-cover" />
                        {isGeneric && (
                          <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-sm bg-white shadow"
                            style={{ border: '2px solid #fff' }}>
                            {genericIcon}
                          </span>
                        )}
                      </div>
                    ) : isGeneric && n.from ? (
                      // Sem foto — iniciais do remetente em círculo + badge.
                      <div className="relative w-14 h-14 flex-shrink-0">
                        <div className="w-14 h-14 rounded-full flex items-center justify-center text-white text-sm font-bold"
                          style={{ background: 'linear-gradient(135deg,#1e714a,#4ade80)' }}>
                          {n.from.slice(0, 2).toUpperCase()}
                        </div>
                        <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-sm bg-white shadow"
                          style={{ border: '2px solid #fff' }}>
                          {genericIcon}
                        </span>
                      </div>
                    ) : (
                      <div className="w-14 h-14 rounded-full flex-shrink-0 flex items-center justify-center text-2xl" style={{ background: isSignup ? 'linear-gradient(135deg,#1e714a,#4ade80)' : isMsg ? 'linear-gradient(135deg,#3b82f6,#06b6d4)' : 'linear-gradient(135deg,#7c3aed,#f97316)' }}>
                        {isSignup ? '🎒' : isMsg ? '💬' : n.type === 'doacao_aceita' ? '🎁' : '🔁'}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      {/* Cores via CSS vars do design system — adaptam ao tema. */}
                      <p className="text-sm font-semibold" style={{ color: 'var(--sc-text-primary)' }}>{label}</p>
                      {sub && <p className="text-xs truncate" style={{ color: 'var(--sc-text-secondary)' }}>{sub}</p>}
                      <p className="text-[11px] mt-0.5" style={{ color: 'var(--sc-text-secondary)', opacity: 0.7 }}>{tsStr}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          markRead();
                          if (isSignup) {
                            setProfileUsername(n.from);
                            return;
                          }
                          // Grupos: ainda usam o productId vindo do conversaId.
                          // 1-1: SEMPRE roteia via openDirectChat (productId='direct'),
                          // ignorando qualquer productId legado. Garante unicidade.
                          if (n.conversaId && n.conversaId.startsWith('group__')) {
                            const parts = n.conversaId.split('__');
                            const productId = parts[parts.length - 1];
                            const prod: Product = {
                              id: `group__${productId}`,
                              username: n.from,
                              title: n.toProductTitle ?? n.productTitle ?? '',
                              image: imgSrc ?? '',
                              description: '',
                              wantsInExchange: '',
                              category: 'group',
                            };
                            setSelectedChat(prod);
                          } else if (n.from) {
                            openDirectChat(n.from);
                          }
                          goTo('chat');
                        }}
                        className="text-xs font-bold text-purple-600 bg-white px-5 py-2 rounded-full border border-purple-200 hover:bg-purple-50 transition-colors active:scale-95"
                      >
                        {isSignup ? 'Ver perfil' : 'Ver chat'}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setNotifs(prev => prev.filter(x => x.id !== n.id));
                          // Tambem apaga do banco — sem isso o realtime
                          // traz a notif de volta no proximo reload.
                          supabase.from('app_notifications').delete().eq('id', n.id).then(() => {});
                        }}
                        className="text-gray-300 hover:text-red-400 transition-colors p-1.5 rounded-full hover:bg-red-50"
                        title="Apagar notificação"
                      >
                        <XIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            );
          })()}
        </div>
      )}

      {activeTab === 'home' && (
        <>
          {/* Conteúdo da home (visível em mobile e desktop) */}
          <div className="max-w-[1400px] mx-auto px-3 sm:px-4 pt-1 pb-3 sm:pt-2 sm:pb-3">
            {/* Stories desktop — dentro do home content pra alinhar exato
                com SUA VIAGEM e composer (mesmo container/padding).
                mb-6 da respiro entre stories e SUA VIAGEM. */}
            <div className="hidden sm:block mb-6">
              <Stories currentUser={currentUser} fotoPerfil={fotoPerfil} />
            </div>
            {/* Barra de progresso de documentos — origem → destino */}
            {!jaNoIntercambio && (
              <DocsProgressBar currentUser={currentUser} onGoToDocs={() => goTo('meus')} />
            )}

            {/* Cartao Student Club mobile removido — agora eh aba dedicada
                acessivel via bottom nav (icone GraduationCap laranja). */}

            {/* Carrossel promocional removido do desktop. */}

            {/* DESKTOP: Feed News inline (mesmo do mobile, mas dentro da home) */}
            <div className="hidden sm:block mt-6 max-w-[900px] mx-auto">
              <FeedNews
                currentUser={currentUser}
                fotoPerfil={fotoPerfil}
                inline
                onOpenChat={(u) => { openDirectChat(u); goTo('chat'); }}
                renderBetweenPosts={(idx) => {
                  // Sugestões de amizade injetadas entre posts a cada N (estilo Instagram).
                  if (idx !== 1 && idx !== 7) return null;
                  return (
                    <div className="bg-white rounded-2xl px-4 py-3 my-1">
                      <SuggestionsSidebar
                        currentUser={currentUser}
                        fotoPerfil={fotoPerfil}
                        onOpenProfile={(u) => { openDirectChat(u); goTo('chat'); }}
                      />
                    </div>
                  );
                }}
              />
            </div>



            {/* MOBILE: Feed News INLINE — postagens da comunidade direto na home
                 (loading IG-style fica dentro do componente, no fim do scroll).
                 Sugestoes de amizade injetadas entre posts igual desktop. */}
            <div className="sm:hidden mt-4 mb-2">
              <FeedNews
                currentUser={currentUser}
                fotoPerfil={fotoPerfil}
                inline
                onOpenChat={(u) => { openDirectChat(u); goTo('chat'); }}
                renderBetweenPosts={(idx) => {
                  if (idx !== 1 && idx !== 7) return null;
                  return (
                    <div className="bg-white rounded-2xl px-4 py-3 my-1">
                      <SuggestionsSidebar
                        currentUser={currentUser}
                        fotoPerfil={fotoPerfil}
                        onOpenProfile={(u) => { openDirectChat(u); goTo('chat'); }}
                      />
                    </div>
                  );
                }}
              />
            </div>

            {/* Papo Store removida da home (acesso somente via aba 'store') */}
          </div>

        </>
      )}

      {/* Overlay de transicao entre abas — minimalista, so um fade rapido */}
      {transitioning && (
        <div className="fixed inset-0 z-[9999] pointer-events-none" style={{ background: 'rgba(244,246,244,0.6)', animation: 'fadeIn 0.12s ease-out' }}>
          <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
        </div>
      )}

      {/* Flash REDONDO branco saindo do icone Camera — 1.5s.
          Sem raios, apenas halo + nucleo, ambos rounded-full puros. */}
      {cameraAnim && (
        <div className="fixed inset-0 z-[10001] pointer-events-none">
          <style>{`
            @keyframes papoFlashCore {
              0%   { transform: scale(0.2); opacity: 0; }
              20%  { transform: scale(2);   opacity: 1; }
              100% { transform: scale(12);  opacity: 0; }
            }
            @keyframes papoFlashHalo {
              0%   { transform: scale(0);   opacity: 1; }
              100% { transform: scale(80);  opacity: 0; }
            }
          `}</style>
          {/* Halo expandindo radial — branco puro, cobre a tela */}
          <div
            className="absolute rounded-full"
            style={{
              left: cameraAnim.x - 24,
              top: cameraAnim.y - 24,
              width: 48,
              height: 48,
              background: 'radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(255,255,255,0.8) 30%, rgba(255,255,255,0.4) 60%, transparent 85%)',
              animation: 'papoFlashHalo 1.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
              transformOrigin: 'center',
            }}
          />
          {/* Nucleo brilhante — branco puro */}
          <div
            className="absolute rounded-full"
            style={{
              left: cameraAnim.x - 20,
              top: cameraAnim.y - 20,
              width: 40,
              height: 40,
              background: 'radial-gradient(circle, #ffffff 0%, #ffffff 60%, rgba(255,255,255,0.6) 90%, transparent 100%)',
              boxShadow: '0 0 60px 20px rgba(255,255,255,0.9), 0 0 120px 40px rgba(255,255,255,0.5)',
              animation: 'papoFlashCore 1.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
              transformOrigin: 'center',
            }}
          />
        </div>
      )}
      {showOnboarding && currentUser && <TutorialOverlay username={currentUser} isEmpresa={userTipoConta === 'pj' || (() => { try { return JSON.parse(localStorage.getItem('papo_profile') || '{}').tipo_conta === 'pj'; } catch { return false; } })()} onClose={() => setShowOnboarding(false)} />}
      {showFilters && <FiltersPanel filters={filters} onApply={setFilters} onClose={() => setShowFilters(false)} userCidade={userLocation?.cidade} isPJ={userTipoConta === 'pj'} />}
      {showFeedNews && <FeedNews currentUser={currentUser} fotoPerfil={fotoPerfil} onClose={() => setShowFeedNews(false)} onOpenChat={(u) => { setShowFeedNews(false); goTo('chat'); requestAnimationFrame(() => openDirectChat(u)); }} />}
      <Suspense fallback={null}>
      {showPapoStore && (
        <div className="fixed inset-0 z-[9500] flex flex-col bg-white">
          {/* Topbar TRAVADA — fora da área de scroll (flex-shrink-0). Antes
              estava como `sticky top-0` dentro de overflow-y-auto, mas em
              alguns browsers mobile o sticky falha e o topbar scrollava
              junto, sobrepondo o conteúdo. Agora o scroll vive só no <div>
              de baixo (flex-1 overflow-y-auto). */}
          <div
            className="flex-shrink-0 bg-white border-b border-gray-200 flex items-center gap-3 px-3 shadow-sm"
            style={{
              paddingTop: 'calc(env(safe-area-inset-top) + 12px)',
              paddingBottom: 12,
            }}
          >
            <button
              onClick={() => setShowPapoStore(false)}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-gray-100 active:scale-90 transition-transform"
              aria-label="Voltar"
            >
              <XIcon className="w-5 h-5 text-gray-700" />
            </button>
            <h2 className="text-lg font-bold flex-1" style={{ fontFamily: '"DM Sans", system-ui, sans-serif', color: '#1a1a1a' }}>
              Papo Store
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-4 pb-24">
            <PapoStore currentUser={currentUser} />
          </div>
        </div>
      )}
      {showMeets && (
        <Meets
          currentUser={currentUser}
          fotoPerfil={fotoPerfil}
          onClose={() => setShowMeets(false)}
          onChat={(u) => { setShowMeets(false); openDirectChat(u); goTo('chat'); }}
          onOpenProfile={(u) => setProfileUsername(u)}
        />
      )}
      </Suspense>

      {/* Modal de perfil global — renderizado fora do fluxo de chat pra que
          'Ver perfil' funcione em qualquer aba (notificações, pesquisa, etc). */}
      {profileUsername && (
        <UserProfileModal
          username={profileUsername}
          currentUser={currentUser}
          onClose={() => setProfileUsername(null)}
          onChat={(u) => { setProfileUsername(null); openDirectChat(u); goTo('chat'); }}
        />
      )}

      {/* Modal de detalhe de post — aberto a partir de notif de like/comment.
          Suporta curtir e comentar dentro do proprio modal. */}
      {openPostId && (
        <PostDetailModal
          postId={openPostId}
          currentUser={currentUser}
          fotoPerfil={fotoPerfil || undefined}
          onClose={() => setOpenPostId(null)}
        />
      )}

      {/* Drawer mobile da aba Chat: mesma coluna de amigos, abre por swipe horizontal */}
      <FriendsDrawer
        currentUser={currentUser}
        open={showChatFriendsDrawer}
        onClose={() => setShowChatFriendsDrawer(false)}
        userStatuses={userStatuses}
        onChat={(u) => {
          openDirectChat(u);
          setShowChatFriendsDrawer(false);
          goTo('chat');
        }}
        onAddMore={() => goTo('amigos')}
      />
      {/* (removido cleanup: CreateProduct — marketplace antigo) */}
      {/* (removido cleanup: MatchSuggestions — Match IA antigo) */}
      {/* (removido cleanup: CommentsPanel — comments de anúncios do marketplace) */}
      {/* (removido cleanup: ProductDetail — marketplace antigo) */}

      {/* (removido cleanup: RatingModal — sistema de avaliacao antigo) */}

      {showVerifFlow && (
        <div className="fixed inset-0 z-[9999]">
          <VerificationScreen
            userId={userId || ''}
            username={currentUser || ''}
            onComplete={() => { setShowVerifFlow(false); setUserVerificado(true); setUserDocEnviado(true); }}
            onSkip={() => setShowVerifFlow(false)}
          />
        </div>
      )}
      {/* (removido cleanup: tradeTarget / TradeAnalysis — analise de troca antiga) */}

      {/* ───────── Bottom Nav — mobile com visual idêntico ao DesktopSidebar.
           No DARK herda --sc-bg (#0c1014) e os tokens de ativo via CSS vars. */}
      <nav
        className="sm:hidden fixed left-0 right-0 bottom-0 z-[60] bg-white"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)', background: 'var(--sc-bg)' }}
      >
        <div className="grid grid-cols-5 h-14 px-1.5 gap-1">
          {(() => {
            const items = [
              /* BottomNav: NÃO persiste estado ativo (a pedido do user).
                 Visualmente o pill aparece só durante o tap via active:scale.
                 Pra ver onde está, o user usa a DesktopSidebar / breadcrumbs. */
              { key: 'home',  label: 'Início',   Icon: Home,          active: false, onClick: () => { setMenuOpen(false); goTo('home'); } },
              { key: 'notif', label: 'Notif',    Icon: Heart,         active: false, onClick: () => { setMenuOpen(false); goTo('notif'); }, badge: notifs.filter(n => !n.read).length + pendingRequestsCount },
              { key: 'camera',label: 'Post',     Icon: Camera,        active: false, onClick: (e?: any) => {
                setMenuOpen(false);
                goTo('home');
                // Captura posicao do botao Camera pra animacao da onda partir dali
                const rect = (e?.currentTarget as HTMLElement | undefined)?.getBoundingClientRect();
                const origin = rect
                  ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
                  : { x: window.innerWidth / 2, y: window.innerHeight - 28 };
                setCameraAnim(origin);
                // Abre a CAMERA UNIFICADA direto (estilo Instagram), com a
                // tab POST selecionada por default. User troca pra STORY via
                // as tabs no rodape ou swipe lateral.
                window.dispatchEvent(new CustomEvent('papo-open-post-camera', { detail: { mode: 'feed' } }));
                setTimeout(() => setCameraAnim(null), 1500);
              } },
              { key: 'chat',  label: 'Chat',     Icon: MessageCircle, active: false, onClick: () => { setMenuOpen(false); goTo('chat'); }, badge: unreadChats.size },
              { key: 'menu',  label: 'Menu',     Icon: MenuLucide,    active: false, onClick: () => { setMenuOpen(true); } },
            ] as const;
            return items.map(it => (
              <button
                key={it.key}
                onClick={it.onClick}
                aria-label={it.label}
                title={it.label}
                className="relative flex items-center justify-center rounded-xl transition-colors active:scale-[0.96]"
                style={{ background: it.active ? 'var(--sc-active-pill)' : 'transparent' }}
              >
                <span className="relative">
                  <it.Icon
                    className="w-[30px] h-[30px]"
                    strokeWidth={it.active ? 3 : 2.75}
                    style={{ color: it.active ? 'var(--sc-active-text)' : 'var(--sc-inactive-text)' }}
                  />
                  {!!(it as any).badge && (it as any).badge > 0 && (
                    <span className="absolute -top-1 -right-1.5 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {(it as any).badge > 99 ? '99+' : (it as any).badge}
                    </span>
                  )}
                </span>
              </button>
            ));
          })()}
        </div>
      </nav>

      {/* Espaço pra não cobrir conteúdo com a bottom nav no mobile */}
      <div className="sm:hidden" style={{ height: 'calc(56px + env(safe-area-inset-bottom))' }} aria-hidden />

    </div>
  );
}
