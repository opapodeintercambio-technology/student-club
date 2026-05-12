import { MessageCircle, ArrowRightLeft, Gift, Star } from 'lucide-react';
import { useLang } from '../i18n';
import { useProductTranslation } from '../hooks/useProductTranslation';

export interface Product {
  id: string;
  title: string;
  image: string;
  description: string;
  wantsInExchange: string;
  category: string;
  gender?: 'Masculino' | 'Feminino' | 'Unissex';
  username: string;
  matchScore?: number;
  trokValue?: number;
  precoOriginal?: number;
  images?: string[];
  video?: string;
  cidade?: string;
  lat?: number | null;
  lng?: number | null;
  ownerPlan?: 'free' | 'pro' | 'plus';
  boosted?: boolean;
  tipo?: 'troca' | 'doacao' | 'pedido_doacao' | 'amostra' | 'promocao' | 'pedido_amostra';
  scoreMedio?: number;
  totalAvaliacoes?: number;
  createdAt?: string;
  visualizacoes?: number;
  /** Quantidade restante (apenas para doações de serviço). Undefined = não aplicável. */
  quantity?: number;
}

interface ProductCardProps {
  product: Product;
  onChat: (product: Product) => void;
  onMatch: (productId: string) => void;
  onComment: (product: Product) => void;
  onOpen: (product: Product) => void;
  currentUser: string;
  userLocation?: { lat: number; lng: number; cidade: string } | null;
  maskUsername?: boolean;
  onVerificar?: () => void;
  userStatus?: { online: boolean; lastSeen?: Date };
  /** Quando truthy + product.tipo === 'pedido_amostra', bloqueia o botão "Oferecer amostra" pois o pedido está fora do segmento da empresa PJ atual. */
  outOfSegment?: boolean;
}

function lastSeenLabel(lastSeen?: Date, lang?: string): string {
  if (!lastSeen) return 'offline';
  const diffMs = Date.now() - lastSeen.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (lang === 'en') {
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return 'offline';
  }
  if (lang === 'es') {
    if (mins < 1) return 'ahora';
    if (mins < 60) return `hace ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `hace ${hrs}h`;
    return 'offline';
  }
  if (mins < 1) return 'agora pouco';
  if (mins < 60) return `há ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `há ${hrs}h`;
  return 'offline';
}

function OnlineDot({ status, lang }: { status?: { online: boolean; lastSeen?: Date }; lang?: string }) {
  const isOnline = status?.online === true;
  const label = isOnline ? 'online' : lastSeenLabel(status?.lastSeen, lang);
  const diffMs = status?.lastSeen ? Date.now() - status.lastSeen.getTime() : Infinity;
  const showLabel = isOnline || diffMs < 24 * 3600 * 1000;
  return (
    <span className="flex items-center gap-1 ml-1">
      <span
        className="inline-block rounded-full flex-shrink-0"
        style={{ width: 7, height: 7, background: isOnline ? '#22c55e' : '#ef4444' }}
      />
      {showLabel && (
        <span className="text-[10px]" style={{ color: isOnline ? '#16a34a' : '#dc2626' }}>{label}</span>
      )}
    </span>
  );
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatRelativeDate(dateStr?: string, AT?: any): string {
  if (!dateStr || !AT) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffMins < 60) return diffMins <= 1 ? AT.productCardNow : AT.productCardMinsAgo(diffMins);
  if (diffDays === 0) return AT.productCardToday;
  if (diffDays === 1) return AT.productCardYesterday;
  if (diffDays < 7) return AT.productCardDaysAgo(diffDays);
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: diffDays > 365 ? 'numeric' : undefined });
}

export function ProductCard({
  product,
  onChat,
  onMatch,
  onOpen,
  currentUser,
  userLocation,
  maskUsername,
  onVerificar,
  userStatus,
  outOfSegment,
}: ProductCardProps) {
  const { AT, lang } = useLang();
  const tr = useProductTranslation(product);
  const isOwnProduct = product.username === currentUser;
  const isPedidoDoacao = product.tipo === 'pedido_doacao';
  const isPedidoAmostra = product.tipo === 'pedido_amostra';
  const isAmostra = product.tipo === 'amostra';
  const isPromocao = product.tipo === 'promocao';
  const isDoacao = product.tipo === 'doacao' || isPedidoDoacao;

  const distLabel: string | null = (() => {
    if (userLocation?.lat && userLocation?.lng && product.lat && product.lng) {
      const km = haversineKm(userLocation.lat, userLocation.lng, product.lat, product.lng);
      return km < 1 ? '< 1 km' : `${km.toFixed(1)} km`;
    }
    if (product.cidade) return product.cidade;
    return null;
  })();

  const hasTrokValue = (product.trokValue ?? 0) > 0;
  // Para amostras: valor é privado (só o dono vê no Painel de Controle)
  const showTrokLabel = hasTrokValue && (!isAmostra || isOwnProduct);
  const trokLabel = showTrokLabel
    ? `🪙 ${product.trokValue!.toLocaleString('pt-BR')} troks · R$ ${product.trokValue!.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    : null;

  const dateLabel = formatRelativeDate(product.createdAt, AT);

  const topBadge = isPedidoDoacao
    ? { label: '🙏 Pedido', style: { background: '#db2777' } }
    : isPedidoAmostra
    ? { label: '🙋 Pedido de Amostra', style: { background: '#6b8e3d' } }
    : isAmostra
    ? { label: '🍃 Amostra Grátis', style: { background: '#5a7a52' } }
    : isPromocao
    ? { label: '🏷️ Promoção', style: { background: '#b8896a' } }
    : isDoacao
    ? { label: '🎁 Doação', style: { background: '#7c3aed' } }
    : product.boosted
    ? {
        label: product.ownerPlan === 'plus' ? '⭐ Destaque' : '🔥 Destaque',
        style: { background: 'linear-gradient(135deg, #7c3aed 0%, #f97316 100%)' },
      }
    : (product.matchScore ?? 0) > 70
    ? { label: `${product.matchScore}% Match`, style: { background: '#f97316' } }
    : null;

  // Masked mode
  if (maskUsername) {
    return (
      <div
        className="flex flex-col overflow-hidden cursor-pointer transition-all hover:shadow-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800"
        style={{ borderRadius: 12 }}
        onClick={onVerificar}
      >
        <div className="relative" style={{ aspectRatio: '4/3', overflow: 'hidden' }}>
          {product.image ? (
            <img src={product.image} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover pointer-events-none" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 pointer-events-none" style={{ background: '#111' }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              <span style={{ color: '#888', fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>Anuncio sem foto!</span>
            </div>
          )}
        </div>
        <div className="p-3 flex flex-col gap-1.5 relative select-none">
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="bg-white dark:bg-gray-800 rounded-xl px-3 py-2 flex items-center gap-2 shadow-md border border-purple-100 dark:border-purple-900">
              <span className="text-base">🔒</span>
              <span className="text-xs font-semibold text-purple-700 dark:text-purple-300">{AT.productCardVerifyToSee}</span>
            </div>
          </div>
          <div className="blur-sm pointer-events-none">
            <h3 className="font-bold text-sm text-gray-900 dark:text-white mb-1 line-clamp-2">{product.title}</h3>
            {trokLabel && <p className="text-xs font-semibold text-gray-700 dark:text-white">{trokLabel}</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col overflow-hidden bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 transition-all hover:shadow-md hover:-translate-y-0.5 h-full"
      style={{ borderRadius: 12 }}
    >
      {/* Imagem */}
      <div
        className="relative cursor-pointer flex-shrink-0 aspect-[4/3] sm:aspect-[3/2]"
        style={{ overflow: 'hidden' }}
        onClick={() => onOpen(product)}
        data-tutorial="product-detail"
      >
        {product.image ? (
          <img src={product.image} alt={product.title} loading="lazy" decoding="async" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2" style={{ background: '#111' }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            <span style={{ color: '#888', fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>Anuncio sem foto!</span>
          </div>
        )}

        {/* Badge top-left */}
        {topBadge && (
          <div
            className="absolute top-2 left-2 z-10 text-white px-2 py-0.5 text-[10px] font-bold rounded-full shadow-sm"
            style={topBadge.style}
          >
            {topBadge.label}
          </div>
        )}

        {/* Badge quantidade restante (amostra grátis) */}
        {isAmostra && typeof product.quantity === 'number' && product.quantity > 0 && (
          <div
            className="absolute top-2 right-2 z-10 text-white px-2 py-0.5 text-[10px] font-bold rounded-full shadow-sm"
            style={{ background: '#047857' }}
          >
            🎟️ {product.quantity} {product.quantity === 1 ? 'amostra' : 'amostras'}
          </div>
        )}

        {/* Video play overlay */}
        {product.video && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-black bg-opacity-50 rounded-full w-10 h-10 flex items-center justify-center">
              <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* Conteúdo */}
      <div className="px-3 pt-1.5 pb-2.5 sm:pt-1.5 sm:pb-2 flex flex-col flex-1 gap-1 sm:gap-1">
        {/* Título */}
        <h3
          className="font-bold text-[13px] text-gray-900 dark:text-white line-clamp-2 cursor-pointer leading-snug"
          onClick={() => onOpen(product)}
        >
          {tr.title}
        </h3>

        {/* Valor em troks */}
        {trokLabel ? (
          <span
            className="text-xs font-semibold text-gray-700 dark:text-white leading-tight"
            data-tutorial="product-trokvalue"
          >
            {trokLabel}
          </span>
        ) : isPedidoDoacao ? (
          <span className="text-sm font-bold" style={{ color: '#db2777' }}>🙏 Pedido de doação</span>
        ) : isAmostra ? (
          <span className="text-sm font-bold" style={{ color: '#065f46' }}>🍃 Amostra Grátis</span>
        ) : isDoacao ? (
          <span className="text-sm font-bold" style={{ color: '#7c3aed' }}>{AT.productCardFree}</span>
        ) : null}

        {/* Usuário online + reputação */}
        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-white flex-wrap">
          <span className="font-medium">@{product.username}</span>
          <OnlineDot status={userStatus} lang={lang} />
          {(product.totalAvaliacoes ?? 0) > 0 && (
            <span className="flex items-center gap-0.5 ml-1">
              <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
              <span className="font-bold text-gray-700 dark:text-white">{(product.scoreMedio ?? 0).toFixed(1)}</span>
              <span className="text-gray-400">({product.totalAvaliacoes})</span>
            </span>
          )}
        </div>

        {/* Rodapé: data + localização */}
        <div className="flex items-center justify-between text-[11px] text-gray-400 dark:text-white pt-1.5 border-t border-gray-100 dark:border-gray-700 mt-auto">
          {dateLabel ? <span>{dateLabel}</span> : <span />}
          {distLabel && (
            <span className="truncate max-w-[55%] text-right">📍 {distLabel}</span>
          )}
        </div>

        {/* Botões ação */}
        {!isOwnProduct ? (
          <div className="flex gap-1.5">
            {isPedidoDoacao ? (
              <button
                onClick={() => onChat(product)}
                className="flex-1 text-white py-1.5 font-bold flex items-center justify-center gap-1 text-xs active:scale-95 transition-transform"
                style={{
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, #db2777 0%, #f97316 100%)',
                  boxShadow: '0 2px 8px rgba(219,39,119,0.25)',
                }}
              >
                <Gift className="w-3 h-3" />
                Quero doar
              </button>
            ) : isPedidoAmostra ? (
              outOfSegment ? (
                <button
                  disabled
                  title="Este pedido está fora do segmento da sua empresa"
                  className="flex-1 py-1.5 font-bold flex items-center justify-center gap-1 text-xs cursor-not-allowed"
                  style={{
                    borderRadius: 8,
                    background: '#e5e7eb',
                    color: '#9ca3af',
                    border: '1px solid #d6d3d1',
                  }}
                >
                  🔒 Fora do segmento
                </button>
              ) : (
                <button
                  onClick={() => onChat(product)}
                  className="flex-1 text-white py-1.5 font-bold flex items-center justify-center gap-1 text-xs active:scale-95 transition-transform"
                  style={{
                    borderRadius: 8,
                    background: 'linear-gradient(135deg, #5a7a52 0%, #6b8e3d 100%)',
                    boxShadow: '0 2px 8px rgba(90,122,82,0.3)',
                  }}
                >
                  <span className="text-sm">🍃</span>
                  Oferecer amostra
                </button>
              )
            ) : isAmostra ? (
              <button
                onClick={() => onChat(product)}
                className="flex-1 text-white py-1.5 font-bold flex items-center justify-center gap-1 text-xs active:scale-95 transition-transform"
                style={{
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, #5a7a52 0%, #6b8e3d 100%)',
                  boxShadow: '0 2px 8px rgba(90,122,82,0.3)',
                }}
              >
                <span className="text-sm">🍃</span>
                Pegar
              </button>
            ) : isPromocao ? (
              <button
                onClick={() => onChat(product)}
                className="flex-1 text-white py-1.5 font-bold flex items-center justify-center gap-1 text-xs active:scale-95 transition-transform"
                style={{
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, #b8896a 0%, #c6895d 100%)',
                  boxShadow: '0 2px 8px rgba(184,137,106,0.3)',
                }}
              >
                <MessageCircle className="w-3 h-3" />
                Mais info
              </button>
            ) : isDoacao ? (
              <button
                onClick={() => onChat(product)}
                className="flex-1 text-white py-1.5 font-bold flex items-center justify-center gap-1 text-xs active:scale-95 transition-transform"
                style={{
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, #7c3aed 0%, #f97316 100%)',
                  boxShadow: '0 2px 8px rgba(124,58,237,0.25)',
                }}
              >
                <Gift className="w-3 h-3" />
                {AT.productCardAcceptDonation}
              </button>
            ) : (
              <>
                <button
                  data-tutorial="product-trocar"
                  onClick={() => onMatch(product.id)}
                  className="flex-1 text-white py-1.5 font-bold flex items-center justify-center gap-1 text-xs active:scale-95 transition-transform"
                  style={{
                    borderRadius: 8,
                    background: 'linear-gradient(135deg, #7c3aed 0%, #f97316 100%)',
                    boxShadow: '0 2px 8px rgba(124,58,237,0.25)',
                  }}
                >
                  <ArrowRightLeft className="w-3 h-3" />
                  {AT.productCardTrade}
                </button>
                <button
                  data-tutorial="product-chat"
                  onClick={() => onChat(product)}
                  className="px-2.5 py-1.5 border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-white rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 active:scale-95 transition-all"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="text-center py-1.5 text-xs text-gray-400 dark:text-white font-medium bg-gray-50 dark:bg-gray-800 rounded-lg">
            {AT.productCardYours}
          </div>
        )}
      </div>
    </div>
  );
}
