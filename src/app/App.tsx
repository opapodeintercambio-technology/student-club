import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Search, Sparkles, ChevronDown, Gift, Calendar as CalendarIcon, Lock, Bell, Info, X as XIcon, Home, FileText, MessageCircle, LayoutGrid, GraduationCap, Globe, HelpCircle } from 'lucide-react';
import { useTheme } from './hooks/useTheme';
import { usePageTranslator } from './hooks/usePageTranslator';
import { retryPendingTrip } from './components/countries';
import { usePushNotification } from './hooks/usePushNotification';
import { supabase, incrementVisualizacoes, insertMatch, recordAnuncioView } from '../lib/supabase';
import { LoginScreen, distanciaKm } from './components/LoginScreen';
import { ProductCard } from './components/ProductCard';
import type { Product } from './components/ProductCard';
import { CreateProduct } from './components/CreateProduct';
import { BlockedScreen } from './components/BlockedScreen';
import { ChatPanel } from './components/ChatPanel';
import { RatingModal } from './components/RatingModal';
import { ChatsTab } from './components/ChatsTab';
import { MatchSuggestions } from './components/MatchSuggestions';
import { SocialProof } from './components/SocialProof';
import { AboutSection } from './components/AboutSection';
import { ContactSection } from './components/ContactSection';
import { PricingSection } from './components/PricingSection';
import { MyDocs } from './components/MyDocs';
import { DocsProgressBar } from './components/DocsProgressBar';
import { CommentsPanel } from './components/CommentsPanel';
import { TradeAnalysis } from './components/TradeAnalysis';
import { ProductDetail } from './components/ProductDetail';
import { FiltersPanel, FILTERS_DEFAULT } from './components/FiltersPanel';
import type { Filters } from './components/FiltersPanel';
import { SwipeMatch } from './components/SwipeMatch';
import { InfoTab } from './components/InfoTab';
import { PapoStore } from './components/PapoStore';
import { Stories } from './components/Stories';
import { FeedNews } from './components/FeedNews';
import { StudentClubCard } from './components/StudentClubCard';
import { Meets } from './components/Meets';
import { FriendsDrawer, useSwipeOpen } from './components/FriendsDrawer';
import { fetchFriendsRemote, fetchSentRequestsRemote, getPendingRequests, reconcileUsernameChanges } from './components/friends';
import { NotificationsTab } from './components/NotificationsTab';
import { Gastos } from './components/Gastos';
import { SearchUsers, FriendsTab } from './components/SearchUsers';
import { FriendsOnline } from './components/FriendsOnline';
import { PainelControle } from './components/PainelControle';
import { LeadsTab } from './components/LeadsTab';
import { SettingsTab } from './components/SettingsTab';
import { MinhaContaTab as MinhaContaTabMemo } from './components/MinhaContaTab';
import { VerificationScreen } from './components/VerificationScreen';
import { MenuDrawer, MenuIcon } from './components/MenuDrawer';
import { DesktopSidebar } from './components/DesktopSidebar';
import { SuggestionsSidebar } from './components/SuggestionsSidebar';
import { productMatchesSearch } from './utils/searchSemantic';
import { TutorialOverlay } from './components/TutorialOverlay';
import { PromoCarousel } from './components/PromoCarousel';
import { TradeProposalModal } from './components/TradeProposalModal';
import { ResetPasswordScreen } from './components/ResetPasswordScreen';
import { deriveKey, encryptMsg, decryptMsg, PROPOSTA_PREFIX, parseProposal, DOACAO_PREFIX, parseDoacaoAcceptance } from './utils/chatCrypto';
import { sendEmailNotif } from './utils/notifyEmail';
import { sendPushToUser } from './utils/sendPush';
import { buildPlaceholderDataUrl } from './utils/placeholderImage';
import type { ProposalData, DoacaoData } from './utils/chatCrypto';
import { UserProfileModal } from './components/UserProfileModal';
import { PostDetailModal } from './components/PostDetailModal';
import { useLang } from './i18n';

const INITIAL_PRODUCTS: Product[] = [
  { id: '1', title: 'iPhone 13 Pro 256GB', image: 'https://images.unsplash.com/photo-1632661674596-df8be070a5c5?w=400', description: 'iPhone 13 Pro em perfeito estado, azul sierra, sem arranhões, bateria 92%', wantsInExchange: 'PlayStation 5, MacBook Air M1, ou Notebook Gamer', category: 'Celulares', gender: 'Unissex', username: 'joao_tech', matchScore: 0, trokValue: 2500 },
  { id: '2', title: 'PlayStation 5 Digital', image: 'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=400', description: 'PS5 Digital Edition, 1 ano de uso, com 2 controles e 5 jogos', wantsInExchange: 'iPhone 13/14, Xbox Series X, ou TV 55 polegadas', category: 'Games', gender: 'Unissex', username: 'maria_games', matchScore: 85, trokValue: 3000 },
  { id: '3', title: 'Tênis Nike Air Max 90', image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400', description: 'Tênis Nike Air Max 90 branco, tamanho 42, usado 2 vezes, praticamente novo', wantsInExchange: 'Tênis Adidas Ultraboost, Vans Old Skool, ou Relógio Casio', category: 'Calçados', gender: 'Masculino', username: 'carlos_sneakers', matchScore: 0, trokValue: 500 },
  { id: '4', title: 'Mochila Herschel Little America', image: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400', description: 'Mochila Herschel original, preta, super espaçosa, compartimento para laptop', wantsInExchange: 'Mochila Fjallraven Kanken, Bolsa tiracolo masculina, ou Tênis', category: 'Bolsas & Mochilas', gender: 'Unissex', username: 'pedro_travel', matchScore: 78, trokValue: 350 },
  { id: '5', title: 'Vestido Zara Longo Floral', image: 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=400', description: 'Vestido longo Zara, tamanho M, estampa floral, usado uma vez em casamento', wantsInExchange: 'Bolsa Michael Kors, Sandália schutz, ou Maquiagem Mac', category: 'Roupas', gender: 'Feminino', username: 'julia_fashion', matchScore: 0, trokValue: 200 },
  { id: '6', title: 'Relógio Apple Watch Series 8', image: 'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=400', description: 'Apple Watch Series 8 45mm grafite, com 3 pulseiras extras, perfeito estado', wantsInExchange: 'AirPods Pro 2, iPad, ou iPhone 12/13', category: 'Relógios', gender: 'Unissex', username: 'ana_tech', matchScore: 0, trokValue: 2800 },
  { id: '7', title: 'Jaqueta Jeans Levis Oversized', image: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=400', description: 'Jaqueta jeans Levis oversized tamanho M, modelo vintage, estado impecável', wantsInExchange: 'Moletom Nike, Calça cargo, ou Tênis Converse', category: 'Roupas', gender: 'Masculino', username: 'rafael_style', matchScore: 0, trokValue: 300 },
  { id: '8', title: 'Bolsa Michael Kors Jet Set', image: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=400', description: 'Bolsa Michael Kors original, bege, tamanho médio, com nota fiscal', wantsInExchange: 'Bolsa Coach, Sapato Schutz, ou Perfume importado', category: 'Bolsas & Mochilas', gender: 'Feminino', username: 'camila_bags', matchScore: 0, trokValue: 700 },
  { id: '9', title: 'Kit 5 Livros Fantasia', image: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=400', description: 'Box Harry Potter completo + Percy Jackson, todos em ótimo estado', wantsInExchange: 'Kindle, livros de ficção científica, ou quadrinhos Marvel', category: 'Livros', gender: 'Unissex', username: 'beatriz_books', matchScore: 0, trokValue: 120 },
  { id: '10', title: 'Bola Nike Futsal Profissional', image: 'https://images.unsplash.com/photo-1614632537423-1e6c2e7e0aac?w=400', description: 'Bola Nike futsal profissional, nova, modelo 2024', wantsInExchange: 'Chuteira society, rede de gol, ou bomba de ar', category: 'Esportes', gender: 'Unissex', username: 'diego_sports', matchScore: 0, trokValue: 150 },
];

type Tab = 'home' | 'meus' | 'likes' | 'chat' | 'notif' | 'leads' | 'sobre' | 'planos' | 'contato' | 'ajustes' | 'conta' | 'gastos' | 'pesquisar' | 'amigos' | 'store' | 'meets' | 'studentclub' | 'seguranca';

// Notificação unificada (proposta de troca + doação aceita + novo aluno cadastrado)
type AppNotif = {
  id: string;
  type:
    | 'proposta' | 'doacao_aceita' | 'novo_aluno' | 'nova_mensagem' | 'amizade'
    // Tipos genéricos vindos da tabela app_notifications:
    | 'like' | 'comment' | 'story_like' | 'story_comment' | 'follow' | 'meet';
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

  // Login/loading sempre em modo claro — remove dark independente do horário
  useEffect(() => {
    if (!currentUser) {
      document.documentElement.classList.remove('dark');
    }
  }, [currentUser]);
  usePushNotification(currentUser);
  const [authLoading, setAuthLoading] = useState(true);
  const [chatKey, setChatKey] = useState(0); // incrementado após recovery para forçar re-fetch
  const [chatPanelKey, setChatPanelKey] = useState(0); // força remount do ChatPanel após migração
  const migrationUserRef = useRef<string | null>(null); // guarda o user para quem a migração já rodou
  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [showCreateProduct, setShowCreateProduct] = useState(false);
  const [showFeedNews, setShowFeedNews] = useState(false);
  const [showPapoStore, setShowPapoStore] = useState(false);
  const [showMeets, setShowMeets] = useState(false);
  const [showChatFriendsDrawer, setShowChatFriendsDrawer] = useState(false);
  const chatSwipe = useSwipeOpen(() => setShowChatFriendsDrawer(true));
  const [selectedChat, setSelectedChat] = useState<Product | null>(null);
  const [showMatches, setShowMatches] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedGender, setSelectedGender] = useState('Todos');
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [transitioning, setTransitioning] = useState(false);
  const [commentProduct, setCommentProduct] = useState<Product | null>(null);
  const [tradeTarget, setTradeTarget] = useState<Product | null>(null);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [userPlan, setUserPlan] = useState<'free' | 'pro' | 'plus'>('free');
  const [userCreatedAt, setUserCreatedAt] = useState<Date | null>(null);
  const [userId, setUserId] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>('');
  const [userVerificado, setUserVerificado] = useState(false);
  const [userDocEnviado, setUserDocEnviado] = useState(false);
  const [userScoreMedio, setUserScoreMedio] = useState(0);
  const [userTotalAvaliacoes, setUserTotalAvaliacoes] = useState(0);
  const [userTrocas, setUserTrocas] = useState(0);
  const [userDoacoesFeitas, setUserDoacoesFeitas] = useState(0);
  const [userDoacoesRecebidas, setUserDoacoesRecebidas] = useState(0);
  const [userAmostrasDadas, setUserAmostrasDadas] = useState(0);
  const [userAmostrasRecebidas, setUserAmostrasRecebidas] = useState(0);
  const [showVerifFlow, setShowVerifFlow] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [unreadChats, setUnreadChats] = useState<Set<string>>(new Set());
  const [unreadComments, setUnreadComments] = useState(0);
  const currentUserRef = useRef<string | null>(null);
  const edgeSwipeRef   = useRef<{ x: number; y: number } | null>(null);
  const [ptrY, setPtrY] = useState(0);
  const [ptrRefreshing, setPtrRefreshing] = useState(false);
  const ptrStartY = useRef(0);
  const ptrActive = useRef(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; cidade: string } | null>(null);
  const [filterPerto, setFilterPerto] = useState(false);
  const [filters, setFilters] = useState<Filters>(FILTERS_DEFAULT);
  const [showFilters, setShowFilters] = useState(false);
  const [showSwipe, setShowSwipe] = useState<false | 'normal' | 'advanced'>(false);
  const [showInfoModal, setShowInfoModal] = useState<null | 'normal' | 'advanced'>(null);
  const [showCreateDonation, setShowCreateDonation] = useState(false);
  const [showCreateDonationRequest, setShowCreateDonationRequest] = useState(false);
  const [showCreateSample, setShowCreateSample] = useState(false);
  const [showCreatePromocao, setShowCreatePromocao] = useState(false);
  const [showCreateSampleRequest, setShowCreateSampleRequest] = useState(false);
  const [showDonationChooser, setShowDonationChooser] = useState(false);
  const [amostraConsentProduct, setAmostraConsentProduct] = useState<Product | null>(null);
  const [amostraBlockedEmpresa, setAmostraBlockedEmpresa] = useState<string | null>(null);
  const [ratingProduct, setRatingProduct] = useState<import('./components/ProductCard').Product | null>(null);
  const [ratingFromItemId, setRatingFromItemId] = useState<string | undefined>(undefined);
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const [openPostId, setOpenPostId] = useState<string | null>(null);
  const [notifFilter, setNotifFilter] = useState<'all' | 'unread' | 'read'>('all');

  const [showProposalModal, setShowProposalModal] = useState(false);
  const [proposalTarget, setProposalTarget] = useState<Product | null>(null);
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
  const [userTipoConta, setUserTipoConta] = useState<'pf' | 'pj'>(cachedProfile.tipo_conta || 'pf');
  const [userSegmento, setUserSegmento] = useState<string>(cachedProfile.segmento || '');
  const [userNomeEmpresa, setUserNomeEmpresa] = useState<string>(cachedProfile.nome_empresa || '');
  const [userStatusConta, setUserStatusConta] = useState<'ativa' | 'bloqueada'>('ativa');
  const [motivoBloqueio, setMotivoBloqueio] = useState<string | null>(null);

  // Helper: salva perfil no cache localStorage (chamado diretamente, nunca via effect reativo)
  const saveProfileCache = useCallback((patch: Record<string, any>) => {
    try {
      const prev = JSON.parse(localStorage.getItem('papo_profile') || '{}');
      localStorage.setItem('papo_profile', JSON.stringify({ ...prev, ...patch }));
    } catch {}
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
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);

  // Abre um chat 1-a-1 com um amigo. Se o amigo tem produto/anúncio,
  // abre o chat desse produto. Senão cria um "produto shim" — o ChatPanel
  // funciona com qualquer Product, basta ter id estável + username.
  // O id é ordenado alfabeticamente para que ambos os lados usem o MESMO
  // conversa_id (e portanto vejam as mesmas mensagens).
  async function openDirectChat(friendUsername: string) {
    if (!currentUser || !friendUsername || friendUsername === currentUser) return;
    // 1) Tenta achar conversa anterior — busca mensagens onde currentUser ou
    //    friendUsername sao remetente, e filtra client-side pelo prefixo
    //    canonico [a,b].sort()__ (evita bug do LIKE com _ wildcard SQL).
    const prefix = [currentUser, friendUsername].sort().join('__') + '__';
    try {
      const { data } = await supabase
        .from('mensagens')
        .select('conversa_id, created_at')
        .or(`remetente.eq.${currentUser},remetente.eq.${friendUsername}`)
        .order('created_at', { ascending: false })
        .limit(300);
      const lastConv = data?.find(r =>
        typeof r.conversa_id === 'string' && r.conversa_id.startsWith(prefix)
      )?.conversa_id;
      if (lastConv) {
        const productId = lastConv.slice(prefix.length);
        const existingProd = products.find(p => p.id === productId && p.username === friendUsername);
        if (existingProd) { setSelectedChat(existingProd); return; }
        setSelectedChat({
          id: productId,
          username: friendUsername,
          title: `Chat com @${friendUsername}`,
          image: '',
          description: '',
          wantsInExchange: '',
          category: 'direct-chat',
          tipo: 'troca',
        });
        return;
      }
    } catch {}
    // 2) Sem conversa anterior — usa produto visivel do amigo se houver
    const existing = products.find(p => p.username === friendUsername);
    if (existing) {
      setSelectedChat(existing);
      return;
    }
    // 3) Fallback final: chat 'direct' (primeira mensagem entre os dois)
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
      const ctx = getCtx();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.18);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.4, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.38);
      // Nao fecha o ctx — proximo bing reutiliza o mesmo
    }
    // Unlock do AudioContext no primeiro gesto do user (iOS exige)
    const unlock = () => { getCtx(); };
    window.addEventListener('touchstart', unlock, { once: true, passive: true });
    window.addEventListener('click', unlock, { once: true });

    const onNudge = () => {
      try { navigator.vibrate?.([100, 50, 100, 50, 150]); } catch {}
      try { playBing(); } catch {}
      document.body.classList.remove('papo-nudge-shake');
      void document.body.offsetWidth;
      document.body.classList.add('papo-nudge-shake');
      window.setTimeout(() => document.body.classList.remove('papo-nudge-shake'), 700);
    };
    window.addEventListener('papo-nudge', onNudge);
    return () => {
      window.removeEventListener('papo-nudge', onNudge);
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('click', unlock);
    };
  }, []);

  // Cutucar global — subscreve canal pessoal do user pra receber nudge mesmo
  // FORA do chat (no feed, em configs, em qualquer aba).
  useEffect(() => {
    if (!currentUser) return;
    const ch = supabase
      .channel(`notif:${currentUser}`)
      .on('broadcast', { event: 'nudge' }, (payload) => {
        const from = (payload.payload as { from?: string })?.from;
        if (from === currentUser) return;
        window.dispatchEvent(new CustomEvent('papo-nudge', { detail: { from } }));
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
      if (data?.score_medio) setUserScoreMedio(data.score_medio);
      if (data?.total_avaliacoes) setUserTotalAvaliacoes(data.total_avaliacoes);

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
  }, [currentUser]);

  // Recupera anúncio pendente caso o usuário tenha saído durante a análise
  useEffect(() => {
    if (!currentUser) return;
    const raw = localStorage.getItem('papo_pending_ad');
    if (!raw) return;
    try {
      const { product, username, startedAt } = JSON.parse(raw);
      if (username !== currentUser) return;
      localStorage.removeItem('papo_pending_ad');
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, 15_000 - elapsed);
      // Aguarda o tempo restante da análise (ou zero se já passou) e publica
      setTimeout(() => {
        handleCreateProduct(product);
      }, remaining);
    } catch {
      localStorage.removeItem('papo_pending_ad');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  // Canal de presença global — rastreia quem está online
  useEffect(() => {
    if (!currentUser) return;
    const ch = supabase.channel('global_presence', {
      config: { presence: { key: currentUser } },
    });
    ch
      .on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState<{ online_at: string }>();
        setUserStatuses(prev => {
          const next = { ...prev };
          const onlineKeys = new Set(Object.keys(state));
          onlineKeys.forEach(u => { next[u] = { online: true }; });
          Object.keys(prev).forEach(u => {
            if (!onlineKeys.has(u) && prev[u].online) {
              next[u] = { online: false, lastSeen: new Date() };
            }
          });
          return next;
        });
      })
      .on('presence', { event: 'leave' }, ({ key }: { key: string }) => {
        setUserStatuses(prev => ({ ...prev, [key]: { online: false, lastSeen: new Date() } }));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await ch.track({ online_at: new Date().toISOString() });
        }
      });
    return () => { supabase.removeChannel(ch); };
  }, [currentUser]);

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

    // Ouve novas mensagens direcionadas ao usuário
    const msgChannel = supabase
      .channel('notif_mensagens_' + currentUser)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensagens' }, async (payload) => {
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

        // Detecta proposta de troca ou doação aceita → adiciona à aba Notificações
        try {
          const key = await deriveKey(m.conversa_id);
          // Usa decryptMsgWithFallback para lidar com renames de username
          const text = await decryptMsgWithFallback(m.conteudo, key, m.conversa_id);
          if (text === '[mensagem]') return; // falhou a decriptação, nada a detectar

          // Notificação genérica de nova mensagem (para qualquer texto não-proposta/doação)
          const proposalCheck = parseProposal(text);
          const doacaoCheck = parseDoacaoAcceptance(text);
          if (!proposalCheck && !doacaoCheck) {
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
          }

          const proposal = proposalCheck;
          if (proposal) {
            setNotifs(prev => {
              if (prev.some(n => n.id === m.id)) return prev;
              const updated: AppNotif[] = [{
                id: m.id,
                type: 'proposta',
                from: m.remetente,
                conversaId: m.conversa_id,
                fromItem: { title: proposal.fromItem.title, image: proposal.fromItem.image, trokValue: proposal.fromItem.trokValue },
                toProductTitle: proposal.toProduct.title,
                timestamp: m.created_at,
                read: false,
              }, ...prev];
              // Save síncrono — garante persistência mesmo se página for fechada logo em seguida
              localStorage.setItem(`papo_notifs_${user}`, JSON.stringify(updated));
              return updated;
            });
          }

          const doacao = doacaoCheck;
          if (doacao) {
            fireTroky(); // vinheta: doação aceita
            setNotifs(prev => {
              if (prev.some(n => n.id === m.id)) return prev;
              const updated: AppNotif[] = [{
                id: m.id,
                type: 'doacao_aceita',
                from: m.remetente,
                conversaId: m.conversa_id,
                productTitle: doacao.product.title,
                productImage: doacao.product.image,
                timestamp: m.created_at,
                read: false,
              }, ...prev];
              localStorage.setItem(`papo_notifs_${user}`, JSON.stringify(updated));
              return updated;
            });
          }
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

    // Canal de broadcast de notificações (proposta + doação aceita)
    // O remetente envia diretamente para notif:<username> — sem decriptação
    const notifBroadcastChannel = supabase
      .channel(`notif:${currentUser}`)
      .on('broadcast', { event: 'new_notif' }, ({ payload }) => {
        const n = payload as AppNotif;
        if (!n?.id || !n?.type) return;
        const user = currentUserRef.current;
        if (!user) return;
        if (n.type === 'proposta') fireTroky(); // vinheta: proposta de troca recebida
        setNotifs(prev => {
          if (prev.some(x => x.id === n.id)) return prev;
          const updated: AppNotif[] = [{ ...n, read: false }, ...prev];
          localStorage.setItem(`papo_notifs_${user}`, JSON.stringify(updated));
          return updated;
        });
      })
      .subscribe();

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
      supabase.removeChannel(notifBroadcastChannel);
      supabase.removeChannel(newSignupChannel);
      supabase.removeChannel(appNotifChannel);
    };
  }, [currentUser]);

  // Carrega anúncios do Supabase — exclui campo image (pode ser base64 pesado)
  // e usa imagem inline guardada em images[] ou fallback
  const loadProducts = useCallback(async () => {
    // Query 1: anúncios (nunca falha por join)
    // Tenta buscar com quantity (coluna nova p/ doações de serviço). Se a coluna não existir, faz fallback.
    let data: any[] | null = null;
    let error: any = null;
    {
      const r1 = await supabase
        .from('anuncios')
        .select('id, username, title, description, wants_in_exchange, category, gender, image, images, video, match_score, trok_value, tipo, created_at, deleted_at, cidade, lat, lng, visualizacoes, quantity')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (r1.error) {
        // Fallback sem quantity (coluna ainda não criada na DB)
        const r2 = await supabase
          .from('anuncios')
          .select('id, username, title, description, wants_in_exchange, category, gender, image, images, video, match_score, trok_value, tipo, created_at, deleted_at, cidade, lat, lng, visualizacoes')
          .is('deleted_at', null)
          .order('created_at', { ascending: false });
        data = r2.data; error = r2.error;
      } else {
        data = r1.data; error = r1.error;
      }
    }

    if (error) { console.error('loadProducts error:', error); return; }
    if (!data) return;

    // Filtra usuários bloqueados (em ambas direções: bloqueador <-> bloqueado)
    const blockedSet = new Set<string>();
    if (currentUser) {
      try {
        const { data: blocks } = await supabase
          .from('usuarios_bloqueados')
          .select('bloqueador, bloqueado')
          .or(`bloqueador.eq.${currentUser},bloqueado.eq.${currentUser}`);
        (blocks || []).forEach((b: any) => {
          if (b.bloqueador === currentUser) blockedSet.add(b.bloqueado);
          if (b.bloqueado === currentUser) blockedSet.add(b.bloqueador);
        });
      } catch {}
    }

    // Query 2: dados dos usuários (plano + localização) — separada para nunca bloquear anúncios
    const { data: userPlans } = await supabase
      .from('usuarios')
      .select('username, plano, cidade, lat, lng, score_medio, total_avaliacoes');
    const planMap: Record<string, 'free' | 'pro' | 'plus'> = {};
    const locMap: Record<string, { cidade: string; lat: number | null; lng: number | null }> = {};
    const scoreMap: Record<string, { scoreMedio: number; totalAvaliacoes: number }> = {};
    (userPlans || []).forEach((u: any) => {
      planMap[u.username] = u.plano || 'free';
      locMap[u.username] = { cidade: u.cidade || '', lat: u.lat || null, lng: u.lng || null };
      scoreMap[u.username] = { scoreMedio: u.score_medio || 0, totalAvaliacoes: u.total_avaliacoes || 0 };
    });

    const loaded: Product[] = data.filter((r: any) => !blockedSet.has(r.username)).map((r: any) => {
      let imgs: string[] = [];
      try { imgs = JSON.parse(r.images || '[]'); } catch { imgs = []; }
      // Sem foto: gera placeholder SVG inferido pelo título/descrição/categoria.
      // (em vez de cair num Unsplash fixo, geralmente desconexo do anúncio.)
      const inferredPlaceholder = buildPlaceholderDataUrl({ title: r.title, description: r.description, category: r.category });
      const rawImg = r.image || inferredPlaceholder;
      const safeImgs = imgs.length > 0 ? imgs : (r.image ? [r.image] : [inferredPlaceholder]);
      return {
        id: r.id,
        title: r.title,
        description: r.description,
        wantsInExchange: r.wants_in_exchange,
        category: r.category,
        gender: r.gender,
        image: safeImgs[0] || rawImg,
        username: r.username,
        matchScore: r.match_score || 0,
        trokValue: r.trok_value || 0,
        images: safeImgs,
        video: r.video || undefined,
        ownerPlan: planMap[r.username] || 'free',
        tipo: r.tipo || (((r.wants_in_exchange || '').toLowerCase().replace(/ç/g,'c').replace(/ã/g,'a').trim() === 'doacao') ? 'doacao' : 'troca'),
        scoreMedio: scoreMap[r.username]?.scoreMedio || 0,
        totalAvaliacoes: scoreMap[r.username]?.totalAvaliacoes || 0,
        visualizacoes: r.visualizacoes || 0,
        // Prioridade: campo do anúncio → campo do usuário → vazio
        cidade: r.cidade || locMap[r.username]?.cidade || '',
        lat: r.lat ?? locMap[r.username]?.lat ?? null,
        lng: r.lng ?? locMap[r.username]?.lng ?? null,
        createdAt: r.created_at || undefined,
        quantity: typeof r.quantity === 'number' ? r.quantity : undefined,
      };
    });

    // Boost: Pro = 1 slot no topo do feed, Plus = 3 slots
    let feedBoostsUsed = 0;
    const withBoost = loaded.map(p => {
      const limit = p.ownerPlan === 'plus' ? 3 : p.ownerPlan === 'pro' ? 1 : 0;
      if (limit > 0 && feedBoostsUsed < limit) {
        feedBoostsUsed++;
        return { ...p, boosted: true };
      }
      return p;
    });

    // Boosted primeiro, depois restantes — fictícios no fim
    setProducts(() => {
      const ids = new Set(withBoost.map(p => p.id));
      const examples = INITIAL_PRODUCTS.filter(p => !ids.has(p.id));
      const boosted = withBoost.filter(p => p.boosted);
      const normal = withBoost.filter(p => !p.boosted);
      return [...boosted, ...normal, ...examples];
    });
  }, []);

  useEffect(() => {
    if (currentUser) {
      loadProducts();
      // Atualiza a cada 60s como fallback
      // Refresh periódico apenas como fallback — o subscribe realtime já dispara loadProducts em INSERT/UPDATE/DELETE.
      // 60s era agressivo demais (egress excedido); 5 min é suficiente como rede de segurança.
      const interval = setInterval(loadProducts, 300000);
      // Recarrega quando a aba volta a ficar visível
      const onVisible = () => { if (document.visibilityState === 'visible') loadProducts(); };
      document.addEventListener('visibilitychange', onVisible);
      // Realtime: contadores de transações do usuário atual
      const txCh = supabase
        .channel('transacoes-' + currentUser)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transacoes' }, (payload) => {
          const t: any = payload.new;
          if (!t) return;
          if (t.doador_username !== currentUser && t.recebedor_username !== currentUser) return;
          if (t.tipo === 'troca') setUserTrocas(n => n + 1);
          else if (t.tipo === 'doacao') {
            if (t.doador_username === currentUser) setUserDoacoesFeitas(n => n + 1);
            else if (t.recebedor_username === currentUser) setUserDoacoesRecebidas(n => n + 1);
          }
        })
        .subscribe();
      // Realtime: novos anúncios aparecem imediatamente + produtos editados/deletados
      const ch = supabase
        .channel('anuncios-feed')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'anuncios' }, () => {
          loadProducts();
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'anuncios' }, () => {
          loadProducts();
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'anuncios' }, (payload) => {
          const deletedId = (payload.old as { id: string }).id;
          setProducts(prev => prev.filter(p => p.id !== deletedId));
        })
        .subscribe();
      return () => {
        clearInterval(interval);
        document.removeEventListener('visibilitychange', onVisible);
        supabase.removeChannel(ch);
        supabase.removeChannel(txCh);
      };
    }
  }, [currentUser, loadProducts]);

  // ── Histórico de navegação (swipe back/forward) ──────────────────────
  const navHistoryRef  = useRef<Tab[]>([]);
  const navForwardRef  = useRef<Tab[]>([]);

  const goTo = (tab: Tab, extra?: () => void) => {
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
    }, 650);
  };

  const goBack = () => {
    const prev = navHistoryRef.current.pop();
    if (!prev) return;
    navForwardRef.current = [activeTab, ...navForwardRef.current];
    setTransitioning(true);
    setTimeout(() => { setActiveTab(prev); setTransitioning(false); }, 650);
  };

  const goForward = () => {
    const next = navForwardRef.current.shift();
    if (!next) return;
    navHistoryRef.current = [...navHistoryRef.current, activeTab];
    setTransitioning(true);
    setTimeout(() => { setActiveTab(next); setTransitioning(false); }, 650);
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
    setShowCreateProduct(false);
    setShowCreateDonation(false);
    setShowCreateDonationRequest(false);
    setShowCreateSample(false);
    setShowDonationChooser(false);
  }, []);

  const handleCreateProduct = async (newProduct: Omit<Product, 'id' | 'username'>) => {
    const limit = PLAN_LIMITS[userPlan] ?? Infinity;
    if (myAdsCount >= limit) { goTo('planos'); return; }
    const id = Date.now().toString();
    const product: Product = { ...newProduct, id, username: currentUser!, matchScore: 0 };

    // Salva no Supabase. Para doações de serviço com quantidade, tenta com `quantity`;
    // se a coluna ainda não existir no banco, faz fallback sem ela (sem perder o anúncio).
    const baseInsert: any = {
      id,
      username: currentUser!,
      title: newProduct.title,
      description: newProduct.description,
      wants_in_exchange: newProduct.wantsInExchange,
      category: newProduct.category,
      gender: newProduct.gender,
      image: newProduct.image,
      images: JSON.stringify(newProduct.images || [newProduct.image]),
      video: newProduct.video || null,
      match_score: 0,
      trok_value: newProduct.trokValue || 0,
      tipo: newProduct.tipo || 'troca',
      cidade: newProduct.cidade || userLocation?.cidade || null,
      lat: newProduct.lat ?? userLocation?.lat ?? null,
      lng: newProduct.lng ?? userLocation?.lng ?? null,
    };
    if (typeof newProduct.quantity === 'number' && newProduct.quantity > 0) {
      const r1 = await supabase.from('anuncios').insert({ ...baseInsert, quantity: newProduct.quantity });
      if (r1.error) {
        // Coluna `quantity` ainda não criada — insere sem ela
        await supabase.from('anuncios').insert(baseInsert);
      }
    } else {
      await supabase.from('anuncios').insert(baseInsert);
    }

    setProducts(prev => [product, ...prev]);
    setShowCreateProduct(false);
    setShowCreateDonation(false);
    setShowCreateDonationRequest(false);
    setShowCreateSample(false);
    goTo('meus');
  };

  const handleEditProduct = async (id: string, data: import('./components/EditProduct').EditData) => {
    const baseUpdate: any = {
      title: data.title,
      description: data.description,
      wants_in_exchange: data.wantsInExchange,
      category: data.category,
      gender: data.gender,
      trok_value: data.trokValue,
      image: data.images[0],
      images: JSON.stringify(data.images),
      video: data.video || null,
    };
    let { error } = await supabase.from('anuncios').update(
      typeof data.quantity === 'number' ? { ...baseUpdate, quantity: data.quantity } : baseUpdate
    ).eq('id', id);
    // Fallback caso coluna `quantity` ainda não exista
    if (error && typeof data.quantity === 'number') {
      const r = await supabase.from('anuncios').update(baseUpdate).eq('id', id);
      error = r.error;
    }
    if (!error) {
      setProducts(prev => prev.map(p => p.id === id ? {
        ...p,
        title: data.title,
        description: data.description,
        wantsInExchange: data.wantsInExchange,
        category: data.category,
        gender: data.gender,
        trokValue: data.trokValue,
        image: data.images[0],
        images: data.images,
        video: data.video,
        ...(typeof data.quantity === 'number' ? { quantity: data.quantity } : {}),
      } : p));
    } else {
      console.error('Erro ao salvar:', error);
      alert('Erro ao salvar. Tente novamente.');
    }
  };

  const handleDeleteProduct = async (id: string) => {
    // Soft delete: marca como deletado mas mantém no banco (crédito não volta)
    await supabase.from('anuncios').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    setProducts(prev => prev.filter(p => p.id !== id));
  };

  // Helper: conta visualização via fetch direto (sem JWT → RLS não bloqueia)
  const countView = (product: Product) => {
    const isMock = ['1','2','3','4','5','6','7','8','9','10'].includes(product.id);
    if (isMock || product.username === currentUser) return;
    incrementVisualizacoes(product.id); // fetch direto com anon key pura
    // Para amostra/promoção (anúncios de empresas PJ), registra QUEM visualizou
    // — isso alimenta o sistema de prospecção do Painel de Controle.
    if ((product.tipo === 'amostra' || product.tipo === 'promocao') && currentUser) {
      recordAnuncioView({ anuncio_id: product.id, viewer_username: currentUser });
    }
    setProducts(prev => prev.map(p =>
      p.id === product.id ? { ...p, visualizacoes: (p.visualizacoes ?? 0) + 1 } : p
    ));
  };

  const handleOpenProduct = (product: Product) => {
    countView(product);
    setDetailProduct(product);
  };

  // Verifica se o usuário PF já aceitou amostra dessa empresa no mês corrente
  const checkAmostraMonthlyLimit = async (product: Product): Promise<boolean> => {
    if (!currentUser || product.username === currentUser) return true;
    const start = new Date();
    start.setDate(1); start.setHours(0, 0, 0, 0);
    try {
      const { data: ids } = await supabase
        .from('anuncios')
        .select('id')
        .eq('username', product.username)
        .eq('tipo', 'amostra');
      const anuncioIds = (ids || []).map((x: any) => x.id);
      if (anuncioIds.length === 0) return true;
      const { data: txs } = await supabase
        .from('transacoes')
        .select('id')
        .eq('recebedor_username', currentUser)
        .in('anuncio_id', anuncioIds)
        .gte('created_at', start.toISOString())
        .limit(1);
      return !(txs && txs.length > 0);
    } catch { return true; }
  };

  const handleChatProduct = async (product: Product) => {
    countView(product);
    // Bloqueia "Oferecer amostra" se o pedido está fora do segmento da PJ atual
    if (userTipoConta === 'pj' && product.tipo === 'pedido_amostra' && product.username !== currentUser && !matchesPJSegment(product)) {
      alert('Este pedido está fora do segmento da sua empresa. Você só pode oferecer amostras compatíveis com sua área de atuação.');
      return;
    }
    if (product.tipo === 'amostra' && product.username !== currentUser) {
      const ok = await checkAmostraMonthlyLimit(product);
      if (!ok) { setAmostraBlockedEmpresa(product.username); return; }
      setAmostraConsentProduct(product);
      return;
    }
    if (isProductDoacao(product) && product.username !== currentUser) {
      handleAcceitarDoacao(product);
    } else {
      setSelectedChat(product);
    }
  };

  const isProductDoacao = (p: Product) =>
    p.tipo === 'doacao' ||
    p.tipo === 'amostra' ||
    (p.wantsInExchange || '').trim().toLowerCase().startsWith('doa') ||
    (p.wantsInExchange || '').trim().toLowerCase().startsWith('amostra');

  const handleMatch = async (productId: string) => {
    const target = products.find(p => p.id === productId);
    if (!target || target.username === currentUser) return;
    countView(target);
    // Amostra: limite mensal + consentimento
    if (target.tipo === 'amostra') {
      const ok = await checkAmostraMonthlyLimit(target);
      if (!ok) { setAmostraBlockedEmpresa(target.username); return; }
      setAmostraConsentProduct(target);
      return;
    }
    // Doação: envia card de aceitação e abre o chat
    if (isProductDoacao(target)) {
      handleAcceitarDoacao(target);
      return;
    }
    // Registra match imediatamente no clique (acumulativo, sem dedup)
    if (currentUser) {
      insertMatch({
        product_id: target.id,
        product_owner: target.username,
        from_username: currentUser,
      });
      // Email + Push para o dono do anúncio
      sendEmailNotif(target.username, 'match', currentUser, { productTitle: target.title, productImage: target.image });
      sendPushToUser(target.username, currentUser, `🔄 @${currentUser} curtiu seu anúncio e quer trocar!`);
    }
    setProposalTarget(target);
    setShowProposalModal(true);
  };

  const handleSendProposal = async (myItems: Product[]) => {
    if (!proposalTarget || !currentUser || myItems.length === 0) return;
    const convId = [currentUser, proposalTarget.username].sort().join('__') + '__' + proposalTarget.id;
    const fromItems = myItems.map(p => ({ id: p.id, title: p.title, image: p.image, trokValue: p.trokValue ?? 0, category: p.category }));
    const payload: ProposalData = {
      fromItems,
      fromItem: fromItems[0], // backward compat
      toProduct: { id: proposalTarget.id, title: proposalTarget.title, image: proposalTarget.image, trokValue: proposalTarget.trokValue ?? 0 },
      fromUser: currentUser,
    };
    const text = PROPOSTA_PREFIX + JSON.stringify(payload);
    const key = await deriveKey(convId);
    const conteudo = await encryptMsg(text, key);
    const { data } = await supabase
      .from('mensagens')
      .insert({ conversa_id: convId, remetente: currentUser, conteudo })
      .select('id, created_at')
      .single();
    if (data) {
      const ch = supabase.channel('msg:' + convId);
      ch.send({ type: 'broadcast', event: 'new_msg', payload: { id: data.id, remetente: currentUser, conteudo, created_at: data.created_at } });
      supabase.removeChannel(ch);
    }
    const firstItem = myItems[0];
    const totalTrok = myItems.reduce((s, p) => s + (p.trokValue ?? 0), 0);
    const notifPayload: AppNotif = {
      id: data?.id ?? `${Date.now()}`,
      type: 'proposta',
      from: currentUser,
      conversaId: convId,
      fromItem: { title: myItems.length > 1 ? `${myItems.length} itens (${totalTrok} T)` : firstItem.title, image: firstItem.image, trokValue: totalTrok },
      toProductTitle: proposalTarget.title,
      timestamp: data?.created_at ?? new Date().toISOString(),
      read: false,
    };
    const notifCh = supabase.channel(`notif:${proposalTarget.username}`);
    notifCh.subscribe(() => {
      notifCh.send({ type: 'broadcast', event: 'new_notif', payload: notifPayload });
      setTimeout(() => supabase.removeChannel(notifCh), 1000);
    });

    sendEmailNotif(proposalTarget.username, 'proposal', currentUser, {
      fromItemTitle: myItems.length > 1 ? `${myItems.length} itens (${totalTrok} T)` : firstItem.title,
      fromItemImage: firstItem.image,
      productTitle: proposalTarget.title,
      productImage: proposalTarget.image,
    });
    sendPushToUser(proposalTarget.username, currentUser, `📦 @${currentUser} enviou uma proposta de troca para "${proposalTarget.title}"`);

    setShowProposalModal(false);
    setSelectedChat(proposalTarget);
  };

  const handleAcceitarDoacao = async (product: Product) => {
    if (!currentUser || product.username === currentUser) { setSelectedChat(product); return; }
    const convId = [currentUser, product.username].sort().join('__') + '__' + product.id;
    const payload: DoacaoData = {
      product: { id: product.id, title: product.title, image: product.image, category: product.category },
      fromUser: currentUser,
    };
    const text = DOACAO_PREFIX + JSON.stringify(payload);
    const key = await deriveKey(convId);
    const conteudo = await encryptMsg(text, key);
    const { data } = await supabase
      .from('mensagens')
      .insert({ conversa_id: convId, remetente: currentUser, conteudo })
      .select('id, created_at')
      .single();
    if (data) {
      const ch = supabase.channel('msg:' + convId);
      ch.send({ type: 'broadcast', event: 'new_msg', payload: { id: data.id, remetente: currentUser, conteudo, created_at: data.created_at } });
      supabase.removeChannel(ch);
    }
    // Abre o chat depois que a mensagem já está no banco — garante que apareça mesmo se realtime estiver degradado
    setSelectedChat(product);
    // Notifica o dono da doação via broadcast
    const doacaoNotifPayload: AppNotif = {
      id: data?.id ?? `${Date.now()}`,
      type: 'doacao_aceita',
      from: currentUser,
      conversaId: convId,
      productTitle: product.title,
      productImage: product.image,
      timestamp: data?.created_at ?? new Date().toISOString(),
      read: false,
    };
    const doacaoNotifCh = supabase.channel(`notif:${product.username}`);
    doacaoNotifCh.subscribe(() => {
      doacaoNotifCh.send({ type: 'broadcast', event: 'new_notif', payload: doacaoNotifPayload });
      setTimeout(() => supabase.removeChannel(doacaoNotifCh), 1000);
    });

    // Email + Push para o dono da doação (avisando que foi aceita)
    sendEmailNotif(product.username, 'donation', currentUser, { productTitle: product.title, productImage: product.image });
    sendPushToUser(product.username, currentUser, `🎁 @${currentUser} aceitou sua doação "${product.title}"`);
  };

  const handleConfirmTrade = () => {
    if (!tradeTarget) return;
    setTradeTarget(null);
    setSelectedChat(tradeTarget);
  };

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

  const matchesPJSegment = (p: Product): boolean => {
    if (userTipoConta !== 'pj') return true;
    if (p.tipo !== 'pedido_amostra') return false;
    return inPJSegment(p) || (
      !!userNomeEmpresa &&
      new RegExp(`\\b${userNomeEmpresa.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').split(/\s+/).filter(Boolean).join('|')}\\b`, 'i')
        .test(`${p.title || ''} ${p.description || ''} ${p.category || ''}`.toLowerCase())
    );
  };

  const filteredProducts = products.filter(p => {
    // PJ feed: apenas amostra, promocao e pedido_amostra
    if (userTipoConta === 'pj') {
      if (p.tipo !== 'amostra' && p.tipo !== 'promocao' && p.tipo !== 'pedido_amostra') return false;
    }
    const matchesSearch = productMatchesSearch(p, searchTerm);
    const cat = filters.categoria || 'Todos';
    // Filtros especiais do PJ: "Produtos/Serviços do meu segmento"
    let matchesCategory: boolean;
    if (cat === 'Produtos do meu segmento') {
      matchesCategory = p.category === 'Produto' && inPJSegment(p);
    } else if (cat === 'Serviços do meu segmento') {
      matchesCategory = p.category === 'Serviço' && inPJSegment(p);
    } else {
      const children = categoryChildren[cat];
      const aliases  = categoryAliases[cat];
      matchesCategory = cat === 'Todos'
        || (aliases  ? aliases.includes(p.category)  : false)
        || (children ? children.includes(p.category) : false)
        || p.category === cat;
    }
    const matchesGender = selectedGender === 'Todos' || p.gender === selectedGender;
    // Filtro por proximidade: mesmo cidade ou raio de 100km
    let matchesPerto = true;
    if (filterPerto && userLocation) {
      if (userLocation.lat && userLocation.lng && (p as any).lat && (p as any).lng) {
        matchesPerto = distanciaKm(userLocation.lat, userLocation.lng, (p as any).lat, (p as any).lng) <= 100;
      } else if (userLocation.cidade && (p as any).cidade) {
        matchesPerto = (p as any).cidade.toLowerCase() === userLocation.cidade.toLowerCase();
      }
    }
    // Filtros avançados
    const trok = p.trokValue ?? 0;
    const matchesTrokMin = !filters.trokMin || trok >= Number(filters.trokMin);
    const matchesTrokMax = !filters.trokMax || trok <= Number(filters.trokMax);
    const matchesTroca = !filters.querTrocarPor || p.wantsInExchange.toLowerCase().includes(filters.querTrocarPor.toLowerCase());
    let matchesCidade = true;
    if (filters.cidade) {
      if ((p as any).lat && userLocation?.lat) {
        matchesCidade = distanciaKm(userLocation.lat, userLocation.lng, (p as any).lat, (p as any).lng) <= filters.raioKm;
      } else {
        matchesCidade = ((p as any).cidade || '').toLowerCase().includes(filters.cidade.toLowerCase());
      }
    }
    const matchesGeneroFilter = !filters.genero || filters.genero === 'Todos' || p.gender === filters.genero;
    const matchesTipo = !filters.tipo || filters.tipo === 'todos' || (p as any).tipo === filters.tipo;
    return matchesSearch && matchesCategory && matchesGender && matchesPerto && matchesTrokMin && matchesTrokMax && matchesTroca && matchesCidade && matchesGeneroFilter && matchesTipo;
  }).sort((a, b) => {
    if (filters.ordenar === 'trok_maior') return (b.trokValue ?? 0) - (a.trokValue ?? 0);
    if (filters.ordenar === 'trok_menor') return (a.trokValue ?? 0) - (b.trokValue ?? 0);
    if (filters.ordenar === 'antigo') return Number(a.id) - Number(b.id);
    return Number(b.id) - Number(a.id); // recente
  });

  const PAGE_SIZE = 10;
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedProducts = filteredProducts.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const myAds = products.filter(p => p.username === currentUser);
  const myMaxTrokValue = myAds.length > 0 ? Math.max(...myAds.map(p => p.trokValue ?? 0)) : 0;
  // Carteira de Troks = soma total dos meus anúncios (poder de compra/troca)
  const myWalletTroks = myAds.reduce((sum, p) => sum + (p.trokValue ?? 0), 0);
  const hasAd = myAds.length > 0;

  // Match IA Normal: exige anúncio próprio + mesmo valor ou menor + qualquer raio
  const matchedProducts = products.filter(p => p.matchScore && p.matchScore > 70 && p.username !== currentUser);


  // PJ: Match IA Normal = pedidos de amostra coerentes com o segmento, qualquer raio
  // PF: comportamento antigo (anúncios alheios com valor ≤ meu maior anúncio)
  const normalMatchProducts = userTipoConta === 'pj'
    ? products.filter(p => p.username !== currentUser && matchesPJSegment(p))
    : (hasAd ? products.filter(p => {
        if (p.username === currentUser) return false;
        const pTrok = p.trokValue ?? 0;
        if (myMaxTrokValue > 0 && pTrok > myMaxTrokValue) return false;
        return true;
      }) : []);

  // PJ: Match IA Avançado = mesmo filtro de segmento + raio 5km
  // PF: comportamento antigo (carteira de Troks + 5km)
  const hasAdForAdvanced = hasAd;
  const advancedMatchProducts = userTipoConta === 'pj'
    ? products.filter(p => {
        if (p.username === currentUser) return false;
        if (!matchesPJSegment(p)) return false;
        if (!userLocation?.lat || !userLocation?.lng) return false;
        if (!p.lat || !p.lng) return false;
        if (distanciaKm(userLocation.lat, userLocation.lng, p.lat, p.lng) > 5) return false;
        return true;
      })
    : (hasAd ? products.filter(p => {
        if (p.username === currentUser) return false;
        const pTrok = p.trokValue ?? 0;
        if (myWalletTroks > 0 && pTrok > myWalletTroks) return false;
        if (!userLocation?.lat || !userLocation?.lng) return false;
        if (!p.lat || !p.lng) return false;
        if (distanciaKm(userLocation.lat, userLocation.lng, p.lat, p.lng) > 5) return false;
        return true;
      }) : []);

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
          <UserProfileModal username={profileUsername} onClose={() => setProfileUsername(null)} />
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
            setRatingProduct(p);
            setRatingFromItemId(fromItemId);
          }}
          onOpenProductById={async (id) => {
            let p = products.find(x => x.id === id);
            if (!p) {
              // Busca mesmo deletados para ver do chat
              const { data } = await supabase.from('anuncios').select('id,username,title,description,wants_in_exchange,category,gender,image,images,video,trok_value,tipo,cidade').eq('id', id).maybeSingle();
              if (data) p = { id: data.id, username: data.username, title: data.title, description: data.description, wantsInExchange: data.wants_in_exchange, category: data.category, image: data.image, trokValue: data.trok_value };
            }
            if (p) { setSelectedChat(null); setTimeout(() => setDetailProduct(p!), 100); }
          }}
          onViewProfile={(username) => setProfileUsername(username)}
        />
      </div>
    );
  }

  // ── Swipe de borda + Pull-to-refresh ───────────────────────────────────
  const handleAppTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0];
    const edgeZone = 28;
    if (t.clientX <= edgeZone || t.clientX >= window.innerWidth - edgeZone) {
      edgeSwipeRef.current = { x: t.clientX, y: t.clientY };
    } else {
      edgeSwipeRef.current = null;
    }
    // PTR: só ativa quando página está no topo
    if (window.scrollY === 0 && !ptrRefreshing) {
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
    // Edge swipe
    if (edgeSwipeRef.current) {
      const t = e.changedTouches[0];
      const dx = t.clientX - edgeSwipeRef.current.x;
      const dy = Math.abs(t.clientY - edgeSwipeRef.current.y);
      if (Math.abs(dx) >= 50 && dy <= 80) {
        if (dx > 0 && edgeSwipeRef.current.x <= 28) goBack();
        if (dx < 0 && edgeSwipeRef.current.x >= window.innerWidth - 28) goForward();
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
            onAddMore={() => goTo('pesquisar')}
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

            {/* ── Tutorial: icone sobrio (HelpCircle) ── */}
            <button
              onClick={() => setShowOnboarding(true)}
              className="flex items-center justify-center w-8 h-8 rounded-full transition-colors hover:bg-white/10 active:scale-90"
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
              {/* Botões Store + Meets foram pra dentro do menu no mobile.
                   Só PJ ainda tem atalhos rápidos no top bar. */}
              {userTipoConta === 'pj' && (<>
                <button
                  data-tutorial="anunciar-btn"
                  onClick={() => { fireTroky(); setShowCreateSample(true); }}
                  className="sm:hidden flex-shrink-0 px-2.5 py-1.5 whitespace-nowrap flex items-center gap-1"
                  style={{ background: '#ffffff', border: '1px solid #5a7a52', color: '#1a1a1a', borderRadius: 2, fontFamily: '"DM Sans", system-ui, sans-serif', letterSpacing: '0.18em', textTransform: 'uppercase', fontSize: '10px', fontWeight: 500 }}
                >
                  <span>Amostras</span>
                </button>
                <button
                  onClick={() => { fireTroky(); setShowCreatePromocao(true); }}
                  className="sm:hidden flex-shrink-0 px-2 py-1.5 whitespace-nowrap flex items-center gap-1"
                  style={{ background: '#ffffff', border: '1px solid #b8896a', color: '#1a1a1a', borderRadius: 2, fontFamily: '"DM Sans", system-ui, sans-serif', letterSpacing: '0.18em', textTransform: 'uppercase', fontSize: '10px', fontWeight: 500 }}
                >
                  <span>Promoções</span>
                </button>
              </>)}

              {/* Botões Store/Meets removidos do header desktop — agora na sidebar lateral.
                   PJ ainda tem atalhos rápidos no mobile acima. */}
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
              onClick={() => { loadProducts(); goTo('meus', () => { setUnreadComments(0); localStorage.removeItem(`papo_ucomments_${currentUser}`); }); }}
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
              {!isPJ && 'ℹ️ '}<span className="truncate">{isPJ ? 'Painel' : 'Informações'}</span>
            </button>

            {/* PJ: + Leads (substitui Notificações no tab bar — notif foi para o menu) */}
            {isPJ ? (
              <button
                onClick={() => goTo('leads')}
                className="tab-ghost relative flex items-center justify-center gap-1 px-1.5 py-1.5 sm:px-3 sm:py-1 text-xs sm:text-xs font-semibold transition-all overflow-hidden"
                style={tabStyle(activeTab === 'leads')}
              >
                <span className="truncate">+ Leads</span>
              </button>
            ) : (
              <button
                onClick={() => goTo('gastos')}
                className="tab-ghost relative flex items-center justify-center gap-1 px-1.5 py-1.5 sm:px-3 sm:py-1 text-xs sm:text-xs font-semibold transition-all overflow-hidden rounded-full"
                style={tabStyle(activeTab === 'gastos')}
              >
                <span className="truncate">Painel</span>
              </button>
            )}
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
          // Tabs especiais: abrem modais em vez de navegar
          if (tab === 'store') { setMenuOpen(false); setShowPapoStore(true); return; }
          if (tab === 'meets') { setMenuOpen(false); setShowMeets(true); return; }
          goTo(tab, () => { if (tab === 'meus') { setUnreadComments(0); localStorage.removeItem(`papo_ucomments_${currentUser}`); } });
        }}
        unreadChats={unreadChats.size}
        unreadComments={unreadComments}
        unreadNotifs={notifs.filter(n => !n.read).length + pendingRequestsCount}
        verificado={userVerificado}
        docEnviado={userDocEnviado}
        onEnviarDocs={() => setShowVerifFlow(true)}
        onLogout={() => supabase.auth.signOut()}
        currentUser={currentUser}
        fotoPerfil={fotoPerfil}
        isPJ={userTipoConta === 'pj'}
      />

      {activeTab === 'leads' && userTipoConta === 'pj' && (
        <LeadsTab currentUser={currentUser} userEmail={userEmail} userTelefone={userTelefone} userNomeEmpresa={userNomeEmpresa} />
      )}
      {activeTab === 'likes' && (userTipoConta === 'pj'
        ? <PainelControle currentUser={currentUser} products={products} />
        : <InfoTab userEmail={userEmail} currentUser={currentUser || undefined} />)}
      {activeTab === 'meus' && <MyDocs currentUser={currentUser} />}
      {activeTab === 'gastos' && <Gastos currentUser={currentUser} />}
      {activeTab === 'chat' && (
        <div
          className="flex flex-col md:flex-row max-w-[1400px] mx-auto"
          onTouchStart={chatSwipe.onTouchStart}
          onTouchEnd={chatSwipe.onTouchEnd}
        >
          {/* Mobile: amigos online primeiro (barra horizontal compacta), depois conversas */}
          <div className="md:hidden order-1">
            <FriendsOnline
              currentUser={currentUser}
              userStatuses={userStatuses}
              onChat={openDirectChat}
              onAddMore={() => goTo('pesquisar')}
            />
          </div>
          <div className="flex-1 min-w-0 order-2 md:order-1">
            <ChatsTab
              key={chatKey}
              currentUser={currentUser}
              products={products}
              onOpenChat={(p) => { setSelectedChat(p); }}
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
              onAddMore={() => goTo('pesquisar')}
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
          scoreMedio={userScoreMedio}
          totalAvaliacoes={userTotalAvaliacoes}
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
          scoreMedio={userScoreMedio}
          totalAvaliacoes={userTotalAvaliacoes}
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
          }}
          onFotoAtualizada={(url) => { setFotoPerfil(url); saveProfileCache({ foto_perfil: url }); }}
          onDadosAtualizados={(d) => {
            const patch: Record<string, any> = {};
            if (d.nome !== undefined)            { setUserNome(d.nome);                       patch.nome = d.nome; }
            if (d.telefone !== undefined)        { setUserTelefone(d.telefone);               patch.telefone = d.telefone; }
            if (d.endereco !== undefined)        { setUserEndereco(d.endereco);               patch.endereco = d.endereco; }
            if (d.mostrar_telefone !== undefined){ setUserMostrarTelefone(d.mostrar_telefone); patch.mostrar_telefone = d.mostrar_telefone; }
            saveProfileCache(patch);
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
          scoreMedio={userScoreMedio}
          totalAvaliacoes={userTotalAvaliacoes}
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
          }}
          onFotoAtualizada={(url) => { setFotoPerfil(url); saveProfileCache({ foto_perfil: url }); }}
          onDadosAtualizados={(d) => {
            const patch: Record<string, any> = {};
            if (d.nome !== undefined)            { setUserNome(d.nome);                       patch.nome = d.nome; }
            if (d.telefone !== undefined)        { setUserTelefone(d.telefone);               patch.telefone = d.telefone; }
            if (d.endereco !== undefined)        { setUserEndereco(d.endereco);               patch.endereco = d.endereco; }
            if (d.mostrar_telefone !== undefined){ setUserMostrarTelefone(d.mostrar_telefone); patch.mostrar_telefone = d.mostrar_telefone; }
            saveProfileCache(patch);
          }}
        />
      )}

      {/* Tela de notificações */}
      {activeTab === 'notif' && (
        <div className="max-w-[640px] mx-auto px-3 py-6 w-full">
          {/* Pedidos de amizade pendentes — sempre no topo */}
          <NotificationsTab currentUser={currentUser} />
          <div className="flex items-center justify-between mb-4 mt-6">
            <h2 className="text-lg font-bold text-gray-800">❤️ {AT.notifications}</h2>
            {notifs.length > 0 && (
              <button
                onClick={() => {
                  setNotifs([]);
                  // Apaga todas as notifs persistentes do usuario no DB
                  supabase.from('app_notifications').delete().eq('to_user', currentUser).then(() => {});
                }}
                className="text-xs text-red-400 hover:text-red-600 font-medium px-3 py-1.5 rounded-xl hover:bg-red-50 border border-red-100 transition-colors"
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
              <div className="flex gap-2 mb-4">
                {tabs.map(t => {
                  const active = notifFilter === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setNotifFilter(t.id)}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
                      style={{
                        background: active ? '#1e714a' : '#f4f6f4',
                        color: active ? '#fff' : '#5b6b63',
                        border: active ? '1px solid #1e714a' : '1px solid #cdd5d1',
                      }}
                    >
                      {t.label}
                      <span className={`ml-1 text-[10px] ${active ? 'opacity-80' : 'opacity-60'}`}>
                        ({t.count})
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
                  || n.type === 'nudge';
                const imgSrc = isSignup || isMsg
                  ? undefined
                  : isGeneric
                    ? n.imageUrl
                    : (n.type === 'proposta' ? n.fromItem?.image : n.productImage);
                const label = isGeneric
                  ? (n.title || `@${n.from}`)
                  : isSignup
                    ? `Novo aluno: @${n.from} entrou no Student Club`
                    : isMsg
                      ? `Nova mensagem de @${n.from}`
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
                const genericBg =
                  n.type === 'like' || n.type === 'story_like' ? 'bg-rose-50 border-rose-100'
                  : n.type === 'comment' || n.type === 'story_comment' ? 'bg-blue-50 border-blue-100'
                  : n.type === 'amizade' || n.type === 'follow' ? 'bg-emerald-50 border-emerald-100'
                  : n.type === 'nudge' ? 'bg-yellow-50 border-yellow-200'
                  : 'bg-amber-50 border-amber-100';
                const genericIcon =
                  n.type === 'like' || n.type === 'story_like' ? '❤️'
                  : n.type === 'comment' || n.type === 'story_comment' ? '💬'
                  : n.type === 'amizade' ? '🤝'
                  : n.type === 'follow' ? '👤'
                  : n.type === 'nudge' ? '👋'
                  : '📅';
                const bgColor = isGeneric
                  ? genericBg
                  : isSignup
                    ? 'bg-emerald-50 border-emerald-100'
                    : isMsg
                      ? 'bg-blue-50 border-blue-100'
                      : n.type === 'doacao_aceita' ? 'bg-orange-50 border-orange-100' : 'bg-purple-50 border-purple-100';
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
                  if (n.type === 'like' || n.type === 'comment') {
                    // Abre o post em modal separado (sem sair da aba notif)
                    if (n.refId) setOpenPostId(n.refId);
                    return;
                  }
                  if (n.type === 'story_like' || n.type === 'story_comment') {
                    // Dispara evento pra Stories abrir o viewer naquele story
                    window.dispatchEvent(new CustomEvent('papo-open-story', { detail: { storyId: n.refId } }));
                    return;
                  }
                  if (n.type === 'nova_mensagem' && n.from) {
                    const prod = products.find(p => p.username === n.from);
                    if (prod) { setSelectedChat(prod); goTo('chat'); }
                    return;
                  }
                };
                return (
                  <div
                    key={n.id}
                    onClick={openContent}
                    className={`flex items-center gap-3 p-4 rounded-2xl border ${bgColor} cursor-pointer transition-opacity`}
                    style={{ opacity: n.read ? 0.6 : 1 }}
                  >
                    {imgSrc ? (
                      // Foto previa do que foi curtido/comentado/etc. Badge
                      // do tipo no canto inferior direito ajuda a identificar
                      // a acao mesmo a imagem sendo de um post.
                      <div className="relative w-14 h-14 flex-shrink-0">
                        <img src={imgSrc} alt="" className="w-14 h-14 rounded-xl object-cover" />
                        {isGeneric && (
                          <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-sm bg-white shadow"
                            style={{ border: '2px solid #fff' }}>
                            {genericIcon}
                          </span>
                        )}
                      </div>
                    ) : isGeneric && n.from ? (
                      // Sem foto previa — mostra iniciais do remetente com
                      // badge do tipo de evento. Mais informativo que so
                      // o icone generico.
                      <div className="relative w-14 h-14 flex-shrink-0">
                        <div className="w-14 h-14 rounded-xl flex items-center justify-center text-white text-sm font-bold"
                          style={{ background: 'linear-gradient(135deg,#1e714a,#4ade80)' }}>
                          {n.from.slice(0, 2).toUpperCase()}
                        </div>
                        <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-sm bg-white shadow"
                          style={{ border: '2px solid #fff' }}>
                          {genericIcon}
                        </span>
                      </div>
                    ) : (
                      <div className="w-14 h-14 rounded-xl flex-shrink-0 flex items-center justify-center text-2xl" style={{ background: isSignup ? 'linear-gradient(135deg,#1e714a,#4ade80)' : isMsg ? 'linear-gradient(135deg,#3b82f6,#06b6d4)' : 'linear-gradient(135deg,#7c3aed,#f97316)' }}>
                        {isSignup ? '🎒' : isMsg ? '💬' : n.type === 'doacao_aceita' ? '🎁' : '🔁'}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{label}</p>
                      {sub && <p className="text-xs text-gray-500 truncate">{sub}</p>}
                      <p className="text-[11px] text-gray-400 mt-0.5">{tsStr}</p>
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
                          if (n.conversaId) {
                            const parts = n.conversaId.split('__');
                            const productId = parts[parts.length - 1];
                            const prod: Product = {
                              id: productId,
                              username: n.from,
                              title: n.toProductTitle ?? n.productTitle ?? '',
                              image: imgSrc ?? '',
                              description: '',
                              wantsInExchange: '',
                              category: '',
                            };
                            setSelectedChat(prod);
                          } else {
                            const prod = products.find(p => p.username === n.from);
                            if (prod) setSelectedChat(prod);
                          }
                          goTo('chat');
                        }}
                        className="text-xs font-bold text-purple-600 bg-white px-3 py-1.5 rounded-xl border border-purple-200 hover:bg-purple-50 transition-colors"
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
            <DocsProgressBar currentUser={currentUser} onGoToDocs={() => goTo('meus')} />

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

            {/* (Match IA removido) */}
            {false && <>
            {/* Match IA — dois banners lado a lado */}
            <style>{`
              /* Varredura fantasma genérica */
              @keyframes ghost-sweep {
                0%   { transform: translateX(-130%) skewX(-18deg); opacity: 0; }
                20%  { opacity: 1; }
                80%  { opacity: 1; }
                100% { transform: translateX(230%) skewX(-18deg); opacity: 0; }
              }
              /* Pulsação sutil de borda fogo laranja */
              @keyframes fire-glow {
                0%, 100% { box-shadow: 0 0 10px 2px rgba(251,146,60,0.35), 0 0 24px 4px rgba(239,68,68,0.18), inset 0 1px 0 rgba(255,255,255,0.08); }
                50%       { box-shadow: 0 0 18px 5px rgba(251,146,60,0.55), 0 0 36px 8px rgba(239,68,68,0.28), inset 0 1px 0 rgba(255,255,255,0.12); }
              }
              /* Pulsação sutil de borda fogo azul */
              @keyframes fire-glow-blue {
                0%, 100% { box-shadow: 0 0 10px 2px rgba(56,189,248,0.30), 0 0 24px 4px rgba(99,102,241,0.18), inset 0 1px 0 rgba(255,255,255,0.08); }
                50%       { box-shadow: 0 0 18px 5px rgba(56,189,248,0.50), 0 0 36px 8px rgba(99,102,241,0.30), inset 0 1px 0 rgba(255,255,255,0.12); }
              }
              /* ── Liquid Glass — Anunciar & Doações ── */
              .liquid-glass-orange {
                background: linear-gradient(135deg, rgba(255,160,60,0.72) 0%, rgba(234,88,12,0.82) 60%, rgba(249,115,22,0.78) 100%);
                backdrop-filter: blur(18px) saturate(1.6);
                -webkit-backdrop-filter: blur(18px) saturate(1.6);
                border: 1px solid rgba(255,210,140,0.50) !important;
                box-shadow:
                  inset 0 1.5px 0 rgba(255,255,255,0.50),
                  inset 0 -1px 0 rgba(160,50,0,0.18),
                  inset 1px 0 0 rgba(255,255,255,0.22),
                  0 4px 22px rgba(249,115,22,0.35),
                  0 1px 4px rgba(0,0,0,0.14);
                color: #fff !important;
                transition: opacity .2s, transform .15s;
              }
              .liquid-glass-orange:hover { opacity: .9; }
              .liquid-glass-orange:active { transform: scale(.96); }

              .liquid-glass-purple {
                background: linear-gradient(135deg, rgba(167,139,250,0.68) 0%, rgba(109,40,217,0.82) 55%, rgba(124,58,237,0.78) 100%);
                backdrop-filter: blur(18px) saturate(1.6);
                -webkit-backdrop-filter: blur(18px) saturate(1.6);
                border: 1px solid rgba(210,190,255,0.48) !important;
                box-shadow:
                  inset 0 1.5px 0 rgba(255,255,255,0.48),
                  inset 0 -1px 0 rgba(60,0,180,0.18),
                  inset 1px 0 0 rgba(255,255,255,0.20),
                  0 4px 22px rgba(124,58,237,0.32),
                  0 1px 4px rgba(0,0,0,0.14);
                color: #fff !important;
                transition: opacity .2s, transform .15s;
              }
              .liquid-glass-purple:hover { opacity: .9; }
              .liquid-glass-purple:active { transform: scale(.96); }

              /* Efeito fantasma — varredura branca translúcida — tabs */
              .tab-ghost::after {
                content: '';
                position: absolute;
                top: 0; left: 0;
                width: 40%;
                height: 100%;
                background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.10) 50%, transparent 100%);
                animation: ghost-sweep 4s ease-in-out infinite;
                pointer-events: none;
                border-radius: inherit;
              }
              /* Efeito fantasma — varredura branca translúcida */
              .match-ghost-fire::after,
              .match-ghost-blue::after {
                content: '';
                position: absolute;
                top: 0; left: 0;
                width: 40%;
                height: 100%;
                background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%);
                animation: ghost-sweep 3.2s ease-in-out infinite;
                pointer-events: none;
                border-radius: inherit;
              }
              .match-ghost-blue::after {
                background: linear-gradient(90deg, transparent 0%, rgba(148,210,255,0.20) 50%, transparent 100%);
                animation-delay: 1.6s;
              }
              /* Animações combinadas */
              .match-ghost-fire {
                animation: fire-glow 2.6s ease-in-out infinite;
              }
              .match-ghost-blue {
                animation: fire-glow-blue 2.6s ease-in-out infinite;
              }
            `}</style>
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              {/* Match IA Avançado — preto/cinza escuro + fogo laranja fantasma */}
              <div
                data-tutorial="match-ia-avancado"
                onClick={() => {
                  if (userTipoConta !== 'pj' && !hasAdForAdvanced) { alert('Crie um anúncio primeiro para usar o Match IA Avançado!'); goTo('meus'); return; }
                  setShowSwipe('advanced');
                }}
                className="match-ghost-fire flex-1 min-w-0 text-white px-5 py-2 sm:py-1.5 cursor-pointer hover:opacity-90 hover:scale-[1.01] active:scale-95 transition-all rounded-full flex items-center justify-between gap-2 overflow-hidden relative"
                style={{
                  background: 'linear-gradient(135deg, #0a0a0a 0%, #1c1c1e 40%, #2a2a2e 70%, #111113 100%)',
                  border: '1px solid rgba(251,146,60,0.25)',
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xl flex-shrink-0">{!hasAdForAdvanced ? '📢' : '🔥'}</span>
                  <h2 className="text-sm sm:text-base font-bold leading-tight tracking-tight">Match IA Avançado</h2>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={e => { e.stopPropagation(); setShowInfoModal('advanced'); }}
                    className="w-6 h-6 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                    style={{ background: 'rgba(255,255,255,0.10)', border: '1.5px solid rgba(255,255,255,0.25)' }}
                  >
                    <Info className="w-3.5 h-3.5 text-white" />
                  </button>
                  <span className="text-base font-bold opacity-70">→</span>
                </div>
              </div>

              {/* Match IA — preto/cinza escuro + fogo azul fantasma */}
              <div
                data-tutorial="match-ia-normal"
                onClick={() => {
                  if (userTipoConta !== 'pj' && !hasAd) { alert('Crie um anúncio primeiro para usar o Match IA!'); goTo('meus'); return; }
                  setShowSwipe('normal');
                }}
                className="match-ghost-blue flex-1 min-w-0 text-white px-5 py-2 sm:py-1.5 cursor-pointer hover:opacity-90 hover:scale-[1.01] active:scale-95 transition-all rounded-full flex items-center justify-between gap-2 overflow-hidden relative"
                style={{
                  background: 'linear-gradient(135deg, #0a0a0a 0%, #0d1117 40%, #111827 70%, #0a0a0a 100%)',
                  border: '1px solid rgba(56,189,248,0.22)',
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xl flex-shrink-0">{!hasAd ? '📢' : '✦'}</span>
                  <h2 className="text-sm sm:text-base font-bold leading-tight tracking-tight">Match IA</h2>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={e => { e.stopPropagation(); setShowInfoModal('normal'); }}
                    className="w-6 h-6 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                    style={{ background: 'rgba(255,255,255,0.10)', border: '1.5px solid rgba(255,255,255,0.25)' }}
                  >
                    <Info className="w-3.5 h-3.5 text-white" />
                  </button>
                  <span className="text-base font-bold opacity-70">→</span>
                </div>
              </div>
            </div>
            </>}



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

      {/* Overlay de transição entre abas */}
      {transitioning && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
          <style>{`
            @keyframes swap-logo { 0%,100%{transform:scale(1)} 50%{transform:scale(1.06)} }
            .swap-logo-anim2 { animation: swap-logo 1.2s ease-in-out infinite; }
          `}</style>
          <img src="/logo-students.png" alt="Student Club" className="swap-logo-anim2 w-56 max-w-[70vw] object-contain" />
          <p className="text-sm mt-4 font-medium animate-pulse text-slate-500">Carregando...</p>
        </div>
      )}
      {showOnboarding && currentUser && <TutorialOverlay username={currentUser} isEmpresa={userTipoConta === 'pj' || (() => { try { return JSON.parse(localStorage.getItem('papo_profile') || '{}').tipo_conta === 'pj'; } catch { return false; } })()} onClose={() => setShowOnboarding(false)} />}
      {showProposalModal && proposalTarget && currentUser && (
        <TradeProposalModal
          targetProduct={proposalTarget}
          myAds={myAds.filter(p => p.tipo !== 'doacao' && p.tipo !== 'pedido_doacao')}
          onClose={() => { setShowProposalModal(false); setProposalTarget(null); }}
          onSend={(items) => handleSendProposal(items)}
        />
      )}
      {showSwipe && <SwipeMatch products={showSwipe === 'advanced' ? advancedMatchProducts : normalMatchProducts} currentUser={currentUser} onClose={() => setShowSwipe(false)} />}

      {/* ── Modais de informação Match IA — Liquid Glass ── */}
      {false && showInfoModal && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
          onClick={() => setShowInfoModal(null)}
        >
          <div
            className="w-full max-w-sm rounded-3xl p-6 relative"
            style={{
              background: 'rgba(255,255,255,0.14)',
              backdropFilter: 'blur(32px) saturate(200%)',
              WebkitBackdropFilter: 'blur(32px) saturate(200%)',
              border: '1.5px solid rgba(255,255,255,0.35)',
              boxShadow: '0 8px 40px rgba(0,0,0,0.30), inset 0 1.5px 0 rgba(255,255,255,0.40)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Fechar */}
            <button
              onClick={() => setShowInfoModal(null)}
              className="absolute top-4 right-4 w-7 h-7 rounded-full flex items-center justify-center transition-all hover:scale-110"
              style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.30)' }}
            >
              <XIcon className="w-4 h-4 text-white" />
            </button>

            {showInfoModal === 'advanced' ? (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-3xl">🔥</span>
                  <div>
                    <h3 className="text-white font-bold text-lg leading-tight">Match IA Avançado</h3>
                    <span className="text-white/60 text-xs">{userTipoConta === 'pj' ? 'Clientes próximos no seu segmento' : 'Trocas inteligentes e locais'}</span>
                  </div>
                </div>
                {userTipoConta === 'pj' ? (
                  <div className="space-y-3 text-white/90 text-sm leading-relaxed">
                    <p>🎯 <span className="font-semibold">Filtro por segmento:</span> a IA mostra apenas pedidos de amostra coerentes com a área de atuação da sua empresa{userSegmento ? ` (${userSegmento})` : ''}.</p>
                    <p>📍 <span className="font-semibold">Raio de 5 km:</span> só aparecem pedidos próximos da sua localização — ideal para atender clientes locais que podem visitar seu estabelecimento.</p>
                    <p>🤝 <span className="font-semibold">Como funciona:</span> ao encontrar um pedido relevante, você pode iniciar conversa direta e oferecer uma amostra do seu produto ou serviço.</p>
                    <p>⭐ <span className="font-semibold">Prioridade:</span> empresas Plus e Pro aparecem primeiro nos resultados para o cliente.</p>
                  </div>
                ) : (
                  <div className="space-y-3 text-white/90 text-sm leading-relaxed">
                    <p>🧠 <span className="font-semibold">Algoritmo de compatibilidade:</span> a IA analisa seus anúncios e encontra itens com maior chance de troca real com base em categorias e valor.</p>
                    <p>📊 <span className="font-semibold">Mesmo valor ou menor:</span> só aparecem itens cujo valor em Troks é igual ou menor ao do seu anúncio de maior valor — trocas justas e equilibradas.</p>
                    <p>📍 <span className="font-semibold">Raio de 5 km:</span> filtra apenas anúncios próximos da sua localização, facilitando a entrega e a retirada pessoalmente.</p>
                    <p>📢 <span className="font-semibold">Requisito:</span> você precisa ter pelo menos um anúncio cadastrado para utilizar esta ferramenta.</p>
                    <p>⭐ <span className="font-semibold">Prioridade:</span> anúncios de usuários Plus e Pro aparecem primeiro na fila de sugestões.</p>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-3xl">✨</span>
                  <div>
                    <h3 className="text-white font-bold text-lg leading-tight">Match IA</h3>
                    <span className="text-white/60 text-xs">{userTipoConta === 'pj' ? 'Clientes no seu segmento em qualquer lugar' : 'Trocas em todo o Brasil'}</span>
                  </div>
                </div>
                {userTipoConta === 'pj' ? (
                  <div className="space-y-3 text-white/90 text-sm leading-relaxed">
                    <p>🎯 <span className="font-semibold">Filtro por segmento:</span> mostra pedidos de amostra alinhados com sua área de atuação{userSegmento ? ` (${userSegmento})` : ''}.</p>
                    <p>🌎 <span className="font-semibold">Sem limite de distância:</span> alcance clientes de qualquer cidade do Brasil — útil para serviços online ou produtos que você consegue enviar.</p>
                    <p>🤝 <span className="font-semibold">Como funciona:</span> deslize para avaliar cada pedido. Os que combinarem com o seu segmento ficam no Painel de Controle.</p>
                    <p>⭐ <span className="font-semibold">Prioridade:</span> empresas Plus e Pro aparecem primeiro nos resultados para o cliente.</p>
                  </div>
                ) : (
                  <div className="space-y-3 text-white/90 text-sm leading-relaxed">
                    <p>👍 <span className="font-semibold">Curtir ou não curtir:</span> deslize para avaliar cada anúncio sugerido. Os que você curtir ficam salvos na aba de Matches.</p>
                    <p>📊 <span className="font-semibold">Mesmo valor ou menor:</span> só aparecem itens com valor em Troks igual ou menor ao do seu maior anúncio — garantindo trocas equilibradas.</p>
                    <p>🌎 <span className="font-semibold">Qualquer raio:</span> sem filtro de distância — você pode trocar com qualquer pessoa no Brasil, combinando envio pelo correio ou retirada.</p>
                    <p>📢 <span className="font-semibold">Requisito:</span> você precisa ter pelo menos um anúncio cadastrado para utilizar esta ferramenta.</p>
                    <p>⭐ <span className="font-semibold">Prioridade:</span> anúncios de usuários Plus e Pro aparecem primeiro na fila de sugestões.</p>
                  </div>
                )}
              </>
            )}

            <button
              onClick={() => setShowInfoModal(null)}
              className="mt-5 w-full py-2.5 rounded-2xl text-white text-sm font-bold transition-all hover:opacity-90 active:scale-95"
              style={{ background: 'rgba(255,255,255,0.20)', border: '1.5px solid rgba(255,255,255,0.35)' }}
            >
              Entendido ✓
            </button>
          </div>
        </div>
      )}
      {showFilters && <FiltersPanel filters={filters} onApply={setFilters} onClose={() => setShowFilters(false)} userCidade={userLocation?.cidade} isPJ={userTipoConta === 'pj'} />}
      {showFeedNews && <FeedNews currentUser={currentUser} fotoPerfil={fotoPerfil} onClose={() => setShowFeedNews(false)} onOpenChat={(u) => { setShowFeedNews(false); goTo('chat'); requestAnimationFrame(() => openDirectChat(u)); }} />}
      {showPapoStore && (
        <div
          className="fixed inset-0 z-[9500] flex flex-col bg-white overflow-y-auto"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div className="sticky top-0 z-10 bg-white border-b border-gray-200 flex items-center gap-3 px-3 py-3 shadow-sm">
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
          <div className="flex-1 px-3 py-4 pb-24">
            <PapoStore currentUser={currentUser} />
          </div>
        </div>
      )}
      {showMeets && <Meets currentUser={currentUser} fotoPerfil={fotoPerfil} onClose={() => setShowMeets(false)} />}

      {/* Modal de perfil global — renderizado fora do fluxo de chat pra que
          'Ver perfil' funcione em qualquer aba (notificações, pesquisa, etc). */}
      {profileUsername && (
        <UserProfileModal
          username={profileUsername}
          currentUser={currentUser}
          onClose={() => setProfileUsername(null)}
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
        onAddMore={() => goTo('pesquisar')}
      />
      {showCreateProduct && <CreateProduct onClose={() => setShowCreateProduct(false)} onSubmit={handleCreateProduct} onBlocked={handleUserBlocked} currentUser={currentUser} tipo="troca" />}
      {showCreateDonation && <CreateProduct onClose={() => setShowCreateDonation(false)} onSubmit={handleCreateProduct} onBlocked={handleUserBlocked} currentUser={currentUser} tipo="doacao" />}
      {showCreateDonationRequest && <CreateProduct onClose={() => setShowCreateDonationRequest(false)} onSubmit={handleCreateProduct} onBlocked={handleUserBlocked} currentUser={currentUser} tipo="pedido_doacao" />}
      {showCreateSample && <CreateProduct onClose={() => setShowCreateSample(false)} onSubmit={handleCreateProduct} onBlocked={handleUserBlocked} currentUser={currentUser} tipo="amostra" />}
      {showCreatePromocao && <CreateProduct onClose={() => setShowCreatePromocao(false)} onSubmit={handleCreateProduct} onBlocked={handleUserBlocked} currentUser={currentUser} tipo="promocao" />}
      {showCreateSampleRequest && <CreateProduct onClose={() => setShowCreateSampleRequest(false)} onSubmit={handleCreateProduct} onBlocked={handleUserBlocked} currentUser={currentUser} tipo="pedido_amostra" />}
      {showDonationChooser && (
        <div
          className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-[60]"
          onClick={() => setShowDonationChooser(false)}
        >
          <div
            className="bg-white dark:bg-zinc-900 rounded-3xl p-6 max-w-md w-full shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Gift className="w-6 h-6 text-purple-600" />
                Doações
              </h2>
              <button
                onClick={() => setShowDonationChooser(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none"
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
              O que você quer fazer agora?
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => { fireTroky(); setShowDonationChooser(false); setShowCreateDonation(true); }}
                className="w-full text-left bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-700 hover:to-purple-600 text-white rounded-2xl p-4 transition-all flex items-start gap-3 shadow-lg"
              >
                <span className="text-2xl flex-shrink-0">🎁</span>
                <span className="flex-1 min-w-0">
                  <span className="block font-bold text-base">Quero doar algo</span>
                  <span className="block text-xs opacity-90 mt-0.5">
                    Anuncie um item que você quer doar
                  </span>
                </span>
              </button>
              <button
                onClick={() => { fireTroky(); setShowDonationChooser(false); setShowCreateDonationRequest(true); }}
                className="w-full text-left bg-gradient-to-r from-pink-600 to-pink-500 hover:from-pink-700 hover:to-pink-600 text-white rounded-2xl p-4 transition-all flex items-start gap-3 shadow-lg"
              >
                <span className="text-2xl flex-shrink-0">🙏</span>
                <span className="flex-1 min-w-0">
                  <span className="block font-bold text-base">Quero pedir uma doação</span>
                  <span className="block text-xs opacity-90 mt-0.5">
                    Publique algo que você está precisando
                  </span>
                </span>
              </button>
              <button
                onClick={() => { fireTroky(); setShowDonationChooser(false); setShowCreateSampleRequest(true); }}
                className="w-full text-left bg-gradient-to-r from-emerald-700 to-emerald-600 hover:from-emerald-800 hover:to-emerald-700 text-white rounded-2xl p-4 transition-all flex items-start gap-3 shadow-lg"
              >
                <span className="text-2xl flex-shrink-0">🙋</span>
                <span className="flex-1 min-w-0">
                  <span className="block font-bold text-base">Quero pedir uma amostra</span>
                  <span className="block text-xs opacity-90 mt-0.5">
                    Peça uma amostra de produto ou serviço a uma empresa
                  </span>
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
      {amostraBlockedEmpresa && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-[80]" onClick={() => setAmostraBlockedEmpresa(null)}>
          <div className="w-full max-w-md p-6 shadow-2xl bg-white rounded-3xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <span className="text-3xl">⏳</span>
              <div className="flex-1">
                <h2 className="text-lg font-bold text-gray-900">Você já pegou uma amostra desta empresa este mês</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Você só pode aceitar mais uma amostra da empresa <strong>@{amostraBlockedEmpresa}</strong> no próximo mês. Isso ajuda a manter a oferta disponível para outros usuários.
                </p>
              </div>
            </div>
            <button
              onClick={() => setAmostraBlockedEmpresa(null)}
              className="w-full py-2.5 px-4 rounded-2xl bg-gray-900 text-white font-semibold text-sm"
            >Entendi</button>
          </div>
        </div>
      )}
      {amostraConsentProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-[80]" onClick={() => setAmostraConsentProduct(null)}>
          <div className="w-full max-w-md p-6 shadow-2xl" style={{ background: '#ffffff', borderRadius: 6, border: '1px solid #d6d3d1', fontFamily: '"DM Sans", system-ui, sans-serif' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <span className="text-3xl">🍃</span>
              <div className="flex-1">
                <h2 className="text-lg font-bold" style={{ color: '#1a1a1a', letterSpacing: '0.04em' }}>Compartilhar seus dados?</h2>
                <p className="text-xs mt-1" style={{ color: '#78716c', letterSpacing: '0.03em' }}>
                  Para você pegar a amostra <strong style={{ color: '#3d5a32' }}>"{amostraConsentProduct.title}"</strong>, a empresa <strong style={{ color: '#3d5a32' }}>@{amostraConsentProduct.username}</strong> precisa receber seu nome e telefone cadastrados na plataforma. Eles podem entrar em contato com você por esses dados.
                </p>
              </div>
            </div>
            <ul className="text-xs space-y-1.5 mb-5" style={{ color: '#57534e' }}>
              <li>✓ Seu nome cadastrado será compartilhado</li>
              <li>✓ Seu telefone cadastrado será compartilhado</li>
              <li>✗ Seu e-mail e endereço NÃO são compartilhados</li>
            </ul>
            <div className="flex gap-2">
              <button
                onClick={() => setAmostraConsentProduct(null)}
                className="flex-1 py-2.5 px-4 transition-colors"
                style={{ background: '#ffffff', border: '1px solid #d6d3d1', color: '#78716c', borderRadius: 2, fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: 11, fontWeight: 500 }}
              >Cancelar</button>
              <button
                onClick={() => { const p = amostraConsentProduct; setAmostraConsentProduct(null); if (p) handleAcceitarDoacao(p); }}
                className="flex-1 py-2.5 px-4 transition-colors"
                style={{ background: '#5a7a52', border: '1px solid #5a7a52', color: '#ffffff', borderRadius: 2, fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: 11, fontWeight: 500 }}
              >Aceito e quero a amostra</button>
            </div>
          </div>
        </div>
      )}
      {showMatches && <MatchSuggestions matches={matchedProducts} onClose={() => setShowMatches(false)} onSelectMatch={p => { setShowMatches(false); setSelectedChat(p); }} />}
      {commentProduct && <CommentsPanel anuncioId={commentProduct.id} anuncioTitle={commentProduct.title} currentUser={currentUser} onClose={() => setCommentProduct(null)} />}
      {detailProduct && <ProductDetail product={detailProduct} currentUser={currentUser} userLocation={userLocation} onClose={() => setDetailProduct(null)} onChat={async (p) => { if (p.tipo === 'amostra' && p.username !== currentUser) { const ok = await checkAmostraMonthlyLimit(p); if (!ok) { setAmostraBlockedEmpresa(p.username); return; } setAmostraConsentProduct(p); } else if (isProductDoacao(p) && p.username !== currentUser) handleAcceitarDoacao(p); else setSelectedChat(p); }} onMatch={handleMatch} onComment={setCommentProduct} />}

      {ratingProduct && currentUser && (
        <RatingModal
          avaliadorUsername={currentUser}
          avaliadoUsername={ratingProduct.username}
          anuncioId={ratingProduct.id}
          anuncioTitulo={ratingProduct.title}
          onClose={() => setRatingProduct(null)}
          onDone={() => {
            setRatingProduct(null);
            setRatingFromItemId(undefined);
          }}
        />
      )}

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
      {tradeTarget && (() => {
        const myProd = products.find(p => p.username === currentUser) ?? { id: '', title: currentUser!, image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400', description: '', wantsInExchange: '', category: '', username: currentUser!, trokValue: 0 };
        return <TradeAnalysis myProduct={myProd} theirProduct={tradeTarget} onConfirm={handleConfirmTrade} onClose={() => setTradeTarget(null)} />;
      })()}

      {/* ───────── Bottom Nav — mobile com visual identico ao DesktopSidebar
           (mesma paleta #262626/#0a0a0a, mesmo bg ativo #f3f4f6, Source Serif). */}
      <nav
        className="sm:hidden fixed left-0 right-0 bottom-0 z-[60] bg-white"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="grid grid-cols-5 h-14 px-1.5 gap-1">
          {(() => {
            const isPainelActive = userTipoConta === 'pj' ? activeTab === 'likes' : activeTab === 'gastos';
            const items = [
              { key: 'home',        label: 'Início',  Icon: Home,           active: activeTab === 'home', onClick: () => goTo('home') },
              { key: 'studentclub', label: 'Club',    Icon: GraduationCap,  active: false,                 onClick: () => goTo('studentclub'), orange: true },
              { key: 'chat',        label: 'Chat',    Icon: MessageCircle,  active: activeTab === 'chat',  onClick: () => goTo('chat'), badge: unreadChats.size },
              { key: 'painel',      label: 'Painel',  Icon: LayoutGrid,     active: isPainelActive,        onClick: () => goTo(userTipoConta === 'pj' ? 'likes' : 'gastos') },
            ] as const;
            return (
              <>
                {items.map(it => (
                  <button
                    key={it.key}
                    onClick={it.onClick}
                    className="relative flex flex-col items-center justify-center rounded-xl transition-colors active:scale-[0.96]"
                    style={{ background: it.active ? '#f3f4f6' : 'transparent' }}
                  >
                    <span className="relative">
                      <it.Icon
                        className="w-[22px] h-[22px]"
                        strokeWidth={(it as any).orange ? 2.4 : (it.active ? 2.4 : 1.8)}
                        style={{ color: (it as any).orange ? '#f97316' : (it.active ? '#0a0a0a' : '#262626') }}
                      />
                      {!!(it as any).badge && (it as any).badge > 0 && (
                        <span className="absolute -top-1 -right-1.5 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                          {(it as any).badge > 99 ? '99+' : (it as any).badge}
                        </span>
                      )}
                    </span>
                    <span
                      className="mt-0.5 text-[10px] whitespace-nowrap"
                      style={{
                        color: (it as any).orange ? '#f97316' : (it.active ? '#0a0a0a' : '#262626'),
                        fontWeight: (it as any).orange ? 600 : (it.active ? 600 : 400),
                        fontFamily: '"Source Serif 4", Georgia, serif',
                        letterSpacing: '0.01em',
                      }}
                    >
                      {it.label}
                    </span>
                  </button>
                ))}
                {/* Menu — avatar (igual a Minha Pagina do desktop) */}
                <button
                  onClick={() => setMenuOpen(true)}
                  className="relative flex flex-col items-center justify-center rounded-xl transition-colors active:scale-[0.96]"
                  style={{ background: 'transparent' }}
                >
                  <span className="relative w-[22px] h-[22px] flex items-center justify-center">
                    {fotoPerfil ? (
                      <img src={fotoPerfil} alt="" className="w-6 h-6 rounded-full object-cover" />
                    ) : (
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
                        style={{ background: '#e5e7eb', color: '#374151' }}
                      >
                        {currentUser?.charAt(0).toUpperCase()}
                      </div>
                    )}
                    {(notifs.filter(n => !n.read).length > 0 || pendingRequestsCount > 0) && (
                      <span className="absolute -top-1 -right-1.5 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {notifs.filter(n => !n.read).length + pendingRequestsCount}
                      </span>
                    )}
                  </span>
                  <span
                    className="mt-0.5 text-[10px] whitespace-nowrap"
                    style={{
                      color: '#262626',
                      fontWeight: 400,
                      fontFamily: '"Source Serif 4", Georgia, serif',
                      letterSpacing: '0.01em',
                    }}
                  >
                    Menu
                  </span>
                </button>
              </>
            );
          })()}
        </div>
      </nav>

      {/* Espaço pra não cobrir conteúdo com a bottom nav no mobile */}
      <div className="sm:hidden" style={{ height: 'calc(56px + env(safe-area-inset-bottom))' }} aria-hidden />

    </div>
  );
}
