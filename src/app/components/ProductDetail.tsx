import { X, ArrowRightLeft, MessageCircle, Coins, ChevronLeft, ChevronRight, MapPin, Maximize2, Gift, Star, Flag } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { Product } from './ProductCard';
import { useLang } from '../i18n';
import { useProductTranslation } from '../hooks/useProductTranslation';
import { supabase } from '../../lib/supabase';
import { UserProfileModal } from './UserProfileModal';
import { ReportModal } from './ReportModal';

interface ProductDetailProps {
  product: Product;
  currentUser: string;
  userLocation?: { lat: number; lng: number; cidade: string } | null;
  onClose: () => void;
  onChat: (product: Product) => void;
  onMatch: (productId: string) => void;
  onComment: (product: Product) => void;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function checkIsDoacao(product: Product): boolean {
  if (product.tipo === 'doacao') return true;
  return (product.wantsInExchange || '').trim().toLowerCase().startsWith('doa');
}

export function ProductDetail({ product, currentUser, userLocation, onClose, onChat, onMatch, onComment }: ProductDetailProps) {
  const { AT } = useLang();
  const tr = useProductTranslation(product);
  const [imgIdx, setImgIdx] = useState(0);
  const [lightbox, setLightbox] = useState(false);

  const isOwn = product.username === currentUser;
  const isDoacao = checkIsDoacao(product);
  const isAmostra = product.tipo === 'amostra';
  // Valor de amostra é privado (só o anunciante vê)
  const troks = (isAmostra && !isOwn) ? 0 : (product.trokValue ?? 0);

  const [scoreMedio, setScoreMedio] = useState(product.scoreMedio ?? 0);
  const [totalAvaliacoes, setTotalAvaliacoes] = useState(product.totalAvaliacoes ?? 0);
  const [fotoPerfil, setFotoPerfil] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [ownerPhone, setOwnerPhone] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [avalsRes, userRes] = await Promise.all([
          supabase.from('avaliacoes').select('estrelas').eq('avaliado_username', product.username),
          supabase.from('usuarios').select('foto_perfil, telefone').eq('username', product.username).maybeSingle(),
        ]);
        if (cancelled) return;
        if (avalsRes.data && avalsRes.data.length > 0) {
          const media = avalsRes.data.reduce((acc: number, a: any) => acc + a.estrelas, 0) / avalsRes.data.length;
          setScoreMedio(Math.round(media * 100) / 100);
          setTotalAvaliacoes(avalsRes.data.length);
        }
        if (userRes.data?.foto_perfil) setFotoPerfil(userRes.data.foto_perfil);
        if (userRes.data?.telefone) setOwnerPhone(String(userRes.data.telefone).replace(/\D/g, ''));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [product.username]);

  // Formatador de telefone para exibição: (DD) 9XXXX-XXXX
  const formatPhone = (raw: string): string => {
    const d = raw.replace(/\D/g, '');
    if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
    return raw;
  };

  const images = (product.images && product.images.filter(Boolean).length > 0) ? product.images.filter(Boolean) : (product.image ? [product.image] : []);

  type GalleryItem = { type: 'video'; url: string } | { type: 'image'; url: string };
  const gallery: GalleryItem[] = [
    ...(product.video ? [{ type: 'video' as const, url: product.video }] : []),
    ...images.map(url => ({ type: 'image' as const, url })),
  ];
  const total = gallery.length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft')  setImgIdx(i => (i - 1 + total) % total);
      if (e.key === 'ArrowRight') setImgIdx(i => (i + 1) % total);
      if (e.key === 'Escape')     setLightbox(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [total]);

  const distKm: number | null = (() => {
    if (userLocation?.lat && userLocation?.lng && product.lat && product.lng) {
      return haversineKm(userLocation.lat, userLocation.lng, product.lat, product.lng);
    }
    return null;
  })();
  const distLabel = distKm !== null
    ? distKm < 1 ? AT.productDetailLessThan1km : `${distKm.toFixed(1)} km`
    : product.cidade ? product.cidade
    : AT.productDetailNoLocation;

  const currentItem = gallery[imgIdx];

  return (
    <>
      {/* ── Lightbox ── */}
      {lightbox && currentItem?.type === 'image' && (
        <div
          className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center"
          onClick={() => setLightbox(false)}
        >
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white bg-white/10 rounded-full p-2 transition-colors"
            onClick={() => setLightbox(false)}
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={currentItem.url}
            alt={product.title}
            className="max-w-[95vw] max-h-[90vh] object-contain select-none"
            onClick={e => e.stopPropagation()}
            draggable={false}
          />
          {total > 1 && (
            <>
              <button
                className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/25 text-white rounded-full p-3 transition-colors"
                onClick={e => { e.stopPropagation(); setImgIdx(i => (i - 1 + total) % total); }}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/25 text-white rounded-full p-3 transition-colors"
                onClick={e => { e.stopPropagation(); setImgIdx(i => (i + 1) % total); }}
              >
                <ChevronRight className="w-6 h-6" />
              </button>
              <div className="absolute bottom-5 left-1/2 -translate-x-1/2 text-white/70 text-sm">
                {imgIdx + 1} / {total}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Modal principal ── */}
      <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-2 sm:p-4" onClick={onClose}>
        <div
          className="bg-white w-full max-w-2xl max-h-[95vh] overflow-y-auto rounded-3xl shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-bold text-gray-800 text-lg truncate pr-4">{tr.title}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Galeria */}
          <div className="relative bg-black">
            {currentItem?.type === 'video' ? (
              <video
                src={currentItem.url}
                controls
                playsInline
                preload="none"
                className="w-full h-72 sm:h-96 object-contain bg-black"
              />
            ) : currentItem?.url ? (
              <div className="relative group cursor-zoom-in overflow-hidden" onClick={() => setLightbox(true)}>
                <img src={currentItem.url} aria-hidden="true" className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-60 pointer-events-none" />
                <img
                  src={currentItem.url}
                  alt={tr.title}
                  className="relative w-full h-72 sm:h-96 object-contain"
                />
                <div className="absolute top-3 left-3 bg-black/50 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <Maximize2 className="w-4 h-4" />
                </div>
              </div>
            ) : (
              <div className="w-full h-72 sm:h-96 flex flex-col items-center justify-center gap-3" style={{ background: '#111' }}>
                <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                <span style={{ color: '#888', fontSize: 14, fontWeight: 700, letterSpacing: 0.5 }}>Anuncio sem foto!</span>
              </div>
            )}

            {total > 1 && (
              <>
                <button
                  onClick={() => setImgIdx(i => (i - 1 + total) % total)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 bg-black bg-opacity-40 text-white rounded-full p-1.5 hover:bg-opacity-60"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setImgIdx(i => (i + 1) % total)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 bg-black bg-opacity-40 text-white rounded-full p-1.5 hover:bg-opacity-60"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {gallery.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setImgIdx(i)}
                      className={`w-2 h-2 rounded-full transition-all ${i === imgIdx ? 'bg-white scale-125' : 'bg-white/50'}`}
                    />
                  ))}
                </div>
                <div className="absolute top-3 right-3 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded-full">
                  {imgIdx + 1}/{total}
                </div>
              </>
            )}
          </div>

          {/* Thumbnails */}
          {total > 1 && (
            <div className="flex gap-2 px-5 py-3 overflow-x-auto">
              {gallery.map((item, i) => (
                <div
                  key={i}
                  onClick={() => setImgIdx(i)}
                  className={`relative w-16 h-16 rounded-xl flex-shrink-0 cursor-pointer border-2 transition-all overflow-hidden bg-black ${i === imgIdx ? 'border-purple-600' : 'border-transparent'}`}
                >
                  {item.type === 'video' ? (
                    <>
                      <video src={item.url} className="w-full h-full object-cover" muted preload="none" />
                      <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30">
                        <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                      </div>
                    </>
                  ) : (
                    <img src={item.url} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="px-5 py-4 space-y-4">

            {/* Valor Trok — OCULTO para doações */}
            {!isDoacao && (
              <div className="flex items-center justify-between bg-gradient-to-r from-purple-600 to-orange-500 rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <Coins className="w-5 h-5 text-white" />
                  <span className="text-white font-semibold">{AT.productDetailTrokValue}</span>
                </div>
                <div className="text-right">
                  <span className="text-white font-bold text-lg">
                    {troks > 0 ? `${troks.toLocaleString('pt-BR')} T` : AT.productDetailNotInformed}
                  </span>
                  {troks > 0 && (
                    <p className="text-white/70 text-xs">= R$ {troks.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  )}
                </div>
              </div>
            )}

            {/* Tags */}
            <div className="flex gap-2 flex-wrap">
              <span className="bg-purple-100 text-purple-700 px-3 py-1 text-sm font-medium rounded-full">{tr.category}</span>
              {product.gender && (
                <span className="bg-gray-100 text-gray-700 px-3 py-1 text-sm font-medium rounded-full">{product.gender}</span>
              )}
            </div>

            {/* Descrição */}
            <div>
              <h3 className="font-bold text-gray-700 mb-1 text-sm">{AT.productDetailDescription}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">{tr.description}</p>
            </div>

            {/* Aceita em troca / Banner doação */}
            {isDoacao ? (
              <>
                <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: 'linear-gradient(135deg,rgba(124,34,250,0.10),rgba(168,85,247,0.08))', border: '1.5px solid rgba(124,34,250,0.20)' }}>
                  <span className="text-2xl flex-shrink-0">🎁</span>
                  <div>
                    <p className="text-sm font-bold text-purple-700">{AT.productDetailDonationFree}</p>
                    <p className="text-xs text-purple-600 mt-0.5">{AT.productDetailDonationContact}</p>
                  </div>
                </div>
                {product.category === 'Serviços' && typeof product.quantity === 'number' && product.quantity > 0 && (
                  <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: 'linear-gradient(135deg,rgba(14,165,233,0.10),rgba(59,130,246,0.08))', border: '1.5px solid rgba(14,165,233,0.25)' }}>
                    <span className="text-2xl flex-shrink-0">🛠️</span>
                    <div>
                      <p className="text-sm font-bold text-sky-700">
                        {product.quantity} {product.quantity === 1 ? 'vaga restante' : 'vagas restantes'}
                      </p>
                      <p className="text-xs text-sky-600 mt-0.5">
                        Conforme as pessoas aceitam, o número diminui. Quando esgotar, o anúncio sai do ar.
                      </p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-orange-50 border-l-4 border-orange-500 rounded-r-2xl p-4">
                <p className="text-xs text-orange-700 font-semibold mb-1">{AT.productDetailAccepts}</p>
                <p className="text-orange-900 font-bold">{tr.wantsInExchange}</p>
              </div>
            )}

            {/* Anunciante + distância */}
            <button
              type="button"
              onClick={() => setShowProfile(true)}
              className="w-full flex items-center gap-3 bg-gray-50 rounded-2xl px-4 py-3 hover:bg-purple-50 transition-colors active:scale-[0.99] text-left"
            >
              {fotoPerfil ? (
                <img src={fotoPerfil} alt={product.username} className="w-11 h-11 rounded-full object-cover ring-2 ring-purple-200 flex-shrink-0" />
              ) : (
                <div className="w-11 h-11 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-purple-600 text-sm">
                  {product.username.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500">{AT.productDetailAdvertiser}</p>
                <p className="font-bold text-gray-800 truncate">@{product.username}</p>
                {totalAvaliacoes > 0 ? (
                  <div className="flex items-center gap-1 mt-0.5">
                    <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                    <span className="text-xs font-bold text-gray-700">{scoreMedio.toFixed(1)}</span>
                    <span className="text-xs text-gray-400">({totalAvaliacoes})</span>
                  </div>
                ) : (
                  <span className="text-xs text-gray-400">Ver perfil</span>
                )}
              </div>
              <div className="flex items-center gap-1 text-sm flex-shrink-0">
                <MapPin className="w-4 h-4 text-purple-500" />
                <span className="font-medium text-purple-600">{distLabel}</span>
              </div>
            </button>

            {/* Telefone / WhatsApp do anunciante (se cadastrado e não for o próprio dono) */}
            {ownerPhone && !isOwn && (
              <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-3 flex items-center gap-3">
                <span className="text-2xl flex-shrink-0">📱</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-green-700 font-semibold">Contato direto</p>
                  <p className="font-bold text-gray-800 text-sm truncate">{formatPhone(ownerPhone)}</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <a
                    href={`https://wa.me/55${ownerPhone}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-green-500 text-white px-4 py-2 rounded-full font-bold text-xs flex items-center gap-1 active:scale-95 transition-transform shadow-sm hover:bg-green-600"
                  >
                    💬 WhatsApp
                  </a>
                  <a
                    href={`tel:+55${ownerPhone}`}
                    className="bg-purple-500 text-white px-4 py-2 rounded-full font-bold text-xs flex items-center gap-1 active:scale-95 transition-transform shadow-sm hover:bg-purple-600"
                  >
                    📞
                  </a>
                </div>
              </div>
            )}

            {/* ── Ações ── */}
            {!isOwn && (
              <div className="flex flex-col gap-2 pt-1">
                {isDoacao ? (
                  <button
                    onClick={() => { onClose(); setTimeout(() => onChat(product), 50); }}
                    className="w-full text-white py-4 rounded-2xl font-bold active:scale-95 transition-all flex items-center justify-center gap-2 text-base shadow-md"
                    style={{ background: 'linear-gradient(135deg,#7c22fa,#a855f7)', boxShadow: '0 4px 16px rgba(124,34,250,0.35)' }}
                  >
                    <Gift className="w-5 h-5" />
                    {AT.productDetailTalkDonor}
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => { onClose(); setTimeout(() => onChat(product), 50); }}
                      className="w-full bg-purple-600 text-white py-4 rounded-2xl font-bold hover:bg-purple-700 active:scale-95 transition-all flex items-center justify-center gap-2 text-base shadow-md shadow-purple-200"
                    >
                      <MessageCircle className="w-5 h-5" />
                      {AT.productDetailTalkTrader}
                    </button>
                    <button
                      onClick={() => { onMatch(product.id); onClose(); }}
                      className="w-full bg-white border-2 border-purple-300 text-purple-700 py-3 rounded-2xl font-bold hover:bg-purple-50 transition-colors flex items-center justify-center gap-2"
                    >
                      <ArrowRightLeft className="w-5 h-5" />
                      {AT.productDetailProposeTrade}
                    </button>
                  </>
                )}
              </div>
            )}

            {isOwn && (
              <div className="text-center py-3 bg-gray-50 rounded-2xl text-sm text-gray-500 font-medium">
                {AT.productDetailYourAd}
              </div>
            )}

            {!isOwn && (
              <button
                onClick={() => setShowReport(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-xs text-gray-400 hover:text-red-500 transition-colors"
              >
                <Flag className="w-3.5 h-3.5" />
                Denunciar anúncio
              </button>
            )}

          </div>
        </div>
      </div>
      {showProfile && <UserProfileModal username={product.username} currentUser={currentUser} onClose={() => setShowProfile(false)} onBlocked={() => onClose()} />}
      {showReport && (
        <ReportModal
          denunciante={currentUser}
          alvoTipo="anuncio"
          alvoId={product.id}
          alvoNome={product.title}
          onClose={() => setShowReport(false)}
        />
      )}
    </>
  );
}
