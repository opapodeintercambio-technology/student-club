import { useState, useEffect } from 'react';
import { MessageCircle, Trash2, Package, ChevronDown, ChevronUp, Pencil, Coins, Lock, Eye, X, Wallet, TrendingUp } from 'lucide-react';
import type { Product } from './ProductCard';
import { EditProduct } from './EditProduct';
import type { EditData } from './EditProduct';
import { DeleteSurvey } from './DeleteSurvey';
import { supabase } from '../../lib/supabase';
import { useLang } from '../i18n';

// Histórico de renames: { username_novo: username_antigo }
const USERNAME_HISTORY: Record<string, string> = {
  'gui_10':     'gui',
  'pablo_caio': 'pablo marcal',
};

function allOwnerNames(currentUser: string): string[] {
  const names = [currentUser];
  if (USERNAME_HISTORY[currentUser]) names.push(USERNAME_HISTORY[currentUser]);
  return names;
}

interface MatchRow {
  id: number;
  product_id: string;
  from_username: string;
  from_item_id: string | null;
  from_item_title: string | null;
  created_at: string;
}

interface MyAdsProps {
  products: Product[];
  currentUser: string;
  userPlan: 'free' | 'pro' | 'plus';
  onChat: (product: Product) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, data: EditData) => Promise<void>;
  onUpgrade: () => void;
  isPJ?: boolean;
}

const PLAN_LIMITS: Record<string, number> = { free: Infinity, pro: Infinity, plus: Infinity };

function avatarInitials(username: string): string {
  const cleaned = username.replace(/[^a-zA-Z0-9]/g, '');
  return (cleaned.slice(0, 2) || username.slice(0, 2)).toUpperCase();
}

function formatMatchDate(dateStr: string, lang: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);
  const day = String(d.getDate()).padStart(2, '0');
  const mon = String(d.getMonth() + 1).padStart(2, '0');
  const hr  = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  if (lang === 'en') {
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin} min ago`;
    if (diffH < 24) return `${diffH}h ago`;
    return `${mon}/${day} at ${hr}:${min}`;
  }
  if (lang === 'es') {
    if (diffMin < 1) return 'ahora mismo';
    if (diffMin < 60) return `hace ${diffMin} min`;
    if (diffH < 24) return `hace ${diffH}h`;
    return `${day}/${mon} a las ${hr}:${min}`;
  }
  if (diffMin < 1) return 'agora mesmo';
  if (diffMin < 60) return `há ${diffMin} min`;
  if (diffH < 24) return `há ${diffH}h`;
  return `${day}/${mon} às ${hr}:${min}`;
}

export function MyAds({ products, currentUser, userPlan, onChat, onDelete, onEdit, onUpgrade, isPJ }: MyAdsProps) {
  const { AT, lang } = useLang();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [matchesByProduct, setMatchesByProduct] = useState<Record<string, MatchRow[]>>({});
  const [localViews, setLocalViews] = useState<Record<string, number>>({});
  const [deletingMatchId, setDeletingMatchId] = useState<number | null>(null);

  const deleteMatch = async (matchId: number) => {
    setDeletingMatchId(matchId);
    await supabase.from('matches').delete().eq('id', matchId);
    setMatchesByProduct(prev => {
      const next: Record<string, MatchRow[]> = {};
      for (const [pid, list] of Object.entries(prev)) {
        next[pid] = list.filter(m => m.id !== matchId);
      }
      return next;
    });
    setDeletingMatchId(null);
  };

  const myProducts = products.filter(p => p.username === currentUser);
  const totalTroks = myProducts.reduce((sum, p) => sum + (p.trokValue ?? 0), 0);
  const limit = PLAN_LIMITS[userPlan] ?? 3;
  const atLimit = myProducts.length >= limit;
  const remaining = Math.max(0, limit - myProducts.length);

  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;

    const loadAll = async () => {
      const [matchRes, adRes] = await Promise.all([
        supabase
          .from('matches')
          .select('id, product_id, from_username, from_item_id, from_item_title, created_at')
          .in('product_owner', allOwnerNames(currentUser))
          .order('created_at', { ascending: false }),
        supabase
          .from('anuncios')
          .select('id, visualizacoes')
          .eq('username', currentUser)
          .is('deleted_at', null),
      ]);

      if (!cancelled && matchRes.data) {
        const grouped: Record<string, MatchRow[]> = {};
        matchRes.data.forEach((m: MatchRow) => { (grouped[m.product_id] ||= []).push(m); });
        setMatchesByProduct(grouped);
      }
      if (!cancelled && adRes.data) {
        setLocalViews(prev => {
          const next = { ...prev };
          adRes.data!.forEach((row: { id: string; visualizacoes: number }) => {
            next[row.id] = Math.max(row.visualizacoes ?? 0, next[row.id] ?? 0);
          });
          return next;
        });
      }
    };

    loadAll();
    // Polling reduzido para 60s — realtime postgres_changes cobre updates instantâneos.
    // Antes era 8s, gerando ~10k fetches/dia por usuário ativo (egress excedido).
    const pollInterval = setInterval(loadAll, 60000);

    const ch = supabase
      .channel(`myads-rt-${currentUser}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'anuncios' },
        (payload) => {
          const row = payload.new as { id: string; username: string; visualizacoes: number };
          if (row.username !== currentUser) return;
          setLocalViews(prev => ({ ...prev, [row.id]: row.visualizacoes ?? 0 }));
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'matches' },
        (payload) => {
          const m = payload.new as MatchRow & { product_owner: string };
          if (!allOwnerNames(currentUser).includes(m.product_owner)) return;
          setMatchesByProduct(prev => {
            const existing = prev[m.product_id] ?? [];
            if (existing.some(x => x.id === m.id)) return prev;
            return { ...prev, [m.product_id]: [m, ...existing] };
          });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      clearInterval(pollInterval);
      supabase.removeChannel(ch);
    };
  }, [currentUser]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">{AT.myAdsTitle}</h2>
        <span
          className="text-xs font-bold px-3 py-1.5 rounded-full"
          style={{
            background: 'linear-gradient(135deg,rgba(124,58,237,0.15),rgba(249,115,22,0.15))',
            color: '#7c3aed',
          }}
        >
          {AT.myAdsPlanFull}
        </span>
      </div>

      {/* Carteira de Troks (PF) / Carteira de Amostras (PJ) */}
      <div
        className="mb-5 relative overflow-hidden"
        style={isPJ ? {
          borderRadius: 6,
          background: '#ffffff',
          border: '1px solid #d6d3d1',
          boxShadow: 'none',
        } : {
          borderRadius: 20,
          background: 'linear-gradient(135deg, #4c1d95 0%, #6d28d9 45%, #7c3aed 75%, #a855f7 100%)',
          boxShadow: '0 8px 32px rgba(124,58,237,0.35), inset 0 1px 0 rgba(255,255,255,0.15)',
          border: '1px solid rgba(255,255,255,0.12)',
        }}
      >
        {/* Brilho de fundo */}
        <div style={{
          position: 'absolute', top: -30, right: -20,
          width: 120, height: 120, borderRadius: '50%',
          background: 'rgba(255,255,255,0.06)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: -20, left: 10,
          width: 80, height: 80, borderRadius: '50%',
          background: 'rgba(255,255,255,0.04)',
          pointerEvents: 'none',
        }} />

        <div className="relative px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="w-4 h-4" style={{ color: isPJ ? '#b8896a' : undefined }} />
              {isPJ ? (
                <span className="text-[10px]" style={{ color: '#b8896a', letterSpacing: '0.28em', textTransform: 'uppercase', fontWeight: 500, fontFamily: '"DM Sans", system-ui, sans-serif' }}>Carteira de Amostras</span>
              ) : (
                <span className="text-purple-200 text-xs font-semibold uppercase tracking-wider">Carteira de Troks</span>
              )}
            </div>
            <div className="flex items-center gap-1 text-[10px] font-medium" style={{ color: isPJ ? '#78716c' : undefined }}>
              <TrendingUp className="w-3 h-3" />
              <span>{myProducts.length} {myProducts.length === 1 ? 'anúncio' : 'anúncios'}</span>
            </div>
          </div>

          <div className="flex items-end gap-2 mt-1">
            {isPJ ? (
              <>
                <span className="font-normal leading-none" style={{ fontSize: 30, color: '#1a1a1a', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
                  R$ {totalTroks.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </>
            ) : (
              <>
                <span className="text-white font-black leading-none" style={{ fontSize: 38, letterSpacing: -1 }}>
                  {totalTroks.toLocaleString('pt-BR')}
                </span>
                <span className="text-purple-300 font-bold text-lg mb-1">T</span>
              </>
            )}
          </div>

          {myProducts.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {myProducts.map(p => (p.trokValue ?? 0) > 0 && (
                <div
                  key={p.id}
                  className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold"
                  style={isPJ ? {
                    background: '#f5f2ec', border: '1px solid #d6d3d1', color: '#3d2f24', borderRadius: 2,
                  } : {
                    background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.9)', borderRadius: 9999,
                  }}
                >
                  <Coins className="w-2.5 h-2.5" />
                  <span className="truncate max-w-[80px]">{p.title}</span>
                  <span className="opacity-70">·</span>
                  <span>{isPJ ? `R$ ${(p.trokValue!).toLocaleString('pt-BR')}` : `${(p.trokValue!).toLocaleString('pt-BR')} T`}</span>
                </div>
              ))}
            </div>
          )}

          {totalTroks === 0 && (
            <p className="text-xs mt-2 opacity-75" style={{ color: isPJ ? '#a8a29e' : '#c4b5fd' }}>
              {isPJ
                ? 'Publique amostras com valor para controlar seus gastos aqui.'
                : 'Poste anúncios com valor em R$ para acumular Troks 💜'}
            </p>
          )}
        </div>
      </div>

      {/* Barra de limite */}
      {userPlan === 'free' && (
        <div className="mb-5">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>{AT.myAdsUnlimited}</span>
            <span>{myProducts.length} de ∞</span>
          </div>
          <div className="w-full rounded-full h-2" style={{ background: 'rgba(0,0,0,0.07)' }}>
            <div
              className="h-2 rounded-full transition-all"
              style={{
                width: '100%',
                background: 'linear-gradient(90deg,#7c3aed,#f97316)',
              }}
            />
          </div>
          {atLimit ? (
            <div className="mt-3 glass rounded-2xl p-4 flex items-center justify-between gap-3" style={{ borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(254,226,226,0.5)' }}>
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-red-500 flex-shrink-0" />
                <p className="text-sm text-red-700 font-medium">{AT.myAdsLimitReached}</p>
              </div>
              <button onClick={onUpgrade} className="text-white text-xs font-bold px-4 py-2 rounded-full whitespace-nowrap" style={{ background: 'linear-gradient(135deg,#7c3aed,#f97316)' }}>
                {AT.myAdsUpgradePro}
              </button>
            </div>
          ) : (
            <p className="text-xs text-gray-400 mt-1">{AT.myAdsRemaining(remaining)}</p>
          )}
        </div>
      )}

      {myProducts.length === 0 ? (
        <div className="text-center py-16">
          <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-600 mb-2">{AT.myAdsEmpty}</h3>
          <p className="text-gray-400">{AT.myAdsEmptyDesc}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {myProducts.map(product => {
            const matches = matchesByProduct[product.id] || [];
            const isExpanded = expandedId === product.id;

            return (
              <div key={product.id} className="glass overflow-hidden" style={{ borderRadius: 24 }}>
                {/* Card principal */}
                <div className="flex gap-3 p-4">
                  <img src={product.image} alt={product.title} loading="lazy" decoding="async" className="w-20 h-20 object-cover flex-shrink-0" style={{ borderRadius: 16 }} />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-800 truncate text-sm">{product.title}</h3>
                    <p className="text-xs text-gray-500 truncate mb-1.5">{product.description}</p>
                    <div className="flex gap-1.5 flex-wrap">
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: 'rgba(124,58,237,0.12)', color: '#7c3aed' }}>{product.category}</span>
                      {product.gender && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,0,0,0.06)', color: '#6b7280' }}>{product.gender}</span>}
                    </div>
                    {(product.trokValue ?? 0) > 0 && (
                      <div className="flex items-center gap-1 text-xs text-purple-600 font-semibold mt-1">
                        <Coins className="w-3 h-3" />
                        {product.trokValue!.toLocaleString('pt-BR')} T
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2.5 flex-shrink-0">
                    <button onClick={() => setEditingProduct(product)} className="text-gray-300 hover:text-purple-500 transition-colors">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => setDeletingProduct(product)} className="text-gray-300 hover:text-red-400 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Stats bar */}
                <div className="flex" style={{ borderTop: '1px solid rgba(139,92,246,0.10)' }}>
                  {/* Visualizações */}
                  <div className="flex-1 flex items-center justify-center gap-1.5 py-3">
                    <Eye className="w-4 h-4 text-blue-400" />
                    <span className="text-sm font-semibold text-gray-600">{(localViews[product.id] ?? product.visualizacoes ?? 0).toLocaleString('pt-BR')}</span>
                    <span className="text-xs text-gray-400">views</span>
                  </div>
                  <div style={{ width: 1, background: 'rgba(139,92,246,0.10)' }} />
                  {/* Matches */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : product.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-3 transition-colors hover:bg-orange-50/50"
                  >
                    <span className="text-base">🔥</span>
                    <span className="text-sm font-semibold text-gray-600">{matches.length}</span>
                    <span className="text-xs text-gray-400">{matches.length === 1 ? 'match' : 'matches'}</span>
                    {isExpanded
                      ? <ChevronUp className="w-3.5 h-3.5 text-gray-300 ml-1" />
                      : <ChevronDown className="w-3.5 h-3.5 text-gray-300 ml-1" />
                    }
                  </button>
                </div>

                {/* Expanded — lista de quem deu match */}
                {isExpanded && (
                  <div className="px-4 py-3" style={{ borderTop: '1px solid rgba(249,115,22,0.10)', background: 'linear-gradient(135deg,rgba(255,247,237,0.5),rgba(245,240,255,0.4))' }}>
                    {matches.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-2">{AT.myAdsNoMatches}</p>
                    ) : (
                      <div className="space-y-2">
                        {matches.map(m => (
                          <div key={m.id} className="bg-white flex items-center gap-3 p-3 shadow-sm" style={{ borderRadius: 16, border: '1px solid rgba(249,115,22,0.18)' }}>
                            <div
                              className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                              style={{ background: 'linear-gradient(135deg,#7c3aed,#f97316)' }}
                            >
                              {avatarInitials(m.from_username)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm text-gray-800 truncate">@{m.from_username}</p>
                              <p className="text-xs flex items-center gap-1 text-orange-600 font-medium">
                                <span>🔥</span>
                                <span className="truncate">
                                  {m.from_item_title ? AT.myAdsOffered(m.from_item_title) : AT.myAdsWantsTrade}
                                </span>
                              </p>
                              <p className="text-[10px] text-gray-400 mt-0.5">{formatMatchDate(m.created_at, lang)}</p>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <button
                                onClick={() => onChat({ ...product, username: m.from_username })}
                                className="text-white text-xs font-bold px-3 py-2 rounded-full flex items-center gap-1 active:scale-95 transition-transform"
                                style={{ background: 'linear-gradient(135deg,#7c3aed,#f97316)', boxShadow: '0 2px 8px rgba(124,58,237,0.3)' }}
                              >
                                <MessageCircle className="w-3.5 h-3.5" /> Chat
                              </button>
                              <button
                                onClick={() => deleteMatch(m.id)}
                                disabled={deletingMatchId === m.id}
                                className="text-gray-300 hover:text-red-400 transition-colors p-1.5 rounded-full hover:bg-red-50 disabled:opacity-40"
                                title={AT.myAdsDeleteMatch}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editingProduct && <EditProduct product={editingProduct} onClose={() => setEditingProduct(null)} onSave={onEdit} />}
      {deletingProduct && <DeleteSurvey product={deletingProduct} currentUser={currentUser} onConfirm={() => { onDelete(deletingProduct.id); setDeletingProduct(null); }} onClose={() => setDeletingProduct(null)} />}
    </div>
  );
}
