import { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import type { Product } from './ProductCard';
import { supabase, insertMatch } from '../../lib/supabase';
import { useLang } from '../i18n';
import { useProductTranslation } from '../hooks/useProductTranslation';

interface SwipeMatchProps {
  products: Product[];
  currentUser: string;
  onClose: () => void;
}

type SwipeDir = 'like' | 'unlike' | null;

function SwipeCardContent({ product, feedback, AT }: { product: Product; feedback: SwipeDir; AT: any }) {
  const tr = useProductTranslation(product);
  return (
    <>
      <div className="relative">
        {product.image ? (
          <img src={product.image} alt={tr.title} loading="lazy" decoding="async" className="w-full h-72 object-cover" />
        ) : (
          <div className="w-full h-72 flex flex-col items-center justify-center gap-2" style={{ background: '#111' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            <span style={{ color: '#888', fontSize: 13, fontWeight: 700, letterSpacing: 0.5 }}>Anuncio sem foto!</span>
          </div>
        )}
        {feedback === 'like' && (
          <div className="absolute inset-0 bg-green-500 bg-opacity-30 flex items-center justify-center">
            <span className="text-7xl">👍🏻</span>
          </div>
        )}
        {feedback === 'unlike' && (
          <div className="absolute inset-0 bg-red-500 bg-opacity-30 flex items-center justify-center">
            <span className="text-7xl">👎🏻</span>
          </div>
        )}
        <span className="absolute top-3 left-3 bg-purple-600 text-white text-xs font-bold px-3 py-1 rounded-full">
          {tr.category}
        </span>
        {(product.trokValue ?? 0) > 0 && (
          <span className="absolute top-3 right-3 bg-orange-500 text-white text-xs font-bold px-3 py-1 rounded-full">
            🪙 {product.trokValue?.toLocaleString('pt-BR')} T
          </span>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-bold text-lg text-gray-900 mb-1 line-clamp-1">{tr.title}</h3>
        <p className="text-gray-500 text-sm line-clamp-2 mb-3">{tr.description}</p>
        <div className="bg-orange-50 border-l-4 border-orange-400 px-3 py-2 rounded-r-xl">
          <p className="text-xs text-orange-600 font-semibold">{AT.swipeMatchWants}</p>
          <p className="text-sm text-orange-900 font-bold line-clamp-1">{tr.wantsInExchange}</p>
        </div>
        <p className="text-xs text-gray-400 mt-2">@{product.username}{product.cidade ? ` · 📍 ${product.cidade}` : ''}</p>
      </div>
    </>
  );
}

export function SwipeMatch({ products, currentUser, onClose }: SwipeMatchProps) {
  const { AT } = useLang();
  const [index, setIndex] = useState(0);
  const [swipeDir, setSwipeDir] = useState<SwipeDir>(null);
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<SwipeDir>(null);

  const others = products.filter(p => p.username !== currentUser && !seenIds.has(p.id));
  const plusBoosted = others.filter(p => p.ownerPlan === 'plus').slice(0, 5);
  const proBoosted  = others.filter(p => p.ownerPlan === 'pro').slice(0, 1);
  const rest = others.filter(p => p.ownerPlan === 'free' || (!plusBoosted.includes(p) && !proBoosted.includes(p)));
  const queue = [...plusBoosted, ...proBoosted, ...rest];
  const current = queue[0];
  const remaining = queue.length;

  const doSwipe = async (dir: SwipeDir) => {
    if (!current || swipeDir) return;
    setSwipeDir(dir);
    setFeedback(dir);

    await supabase.from('swipes').upsert({
      username: currentUser,
      produto_id: current.id,
      acao: dir,
    }, { onConflict: 'username,produto_id' });

    if (dir === 'like') {
      insertMatch({
        product_id: current.id,
        product_owner: current.username,
        from_username: currentUser,
      });
    }

    setTimeout(() => {
      setSeenIds(prev => new Set([...prev, current.id]));
      setSwipeDir(null);
      setFeedback(null);
    }, 300);
  };

  if (!current) {
    return (
      <div className="fixed inset-0 z-50 bg-gradient-to-br from-purple-50 to-pink-50 flex flex-col items-center justify-center p-6">
        <Sparkles className="w-16 h-16 text-purple-400 mb-4" />
        <h2 className="text-2xl font-bold text-gray-800 mb-2">{AT.swipeMatchDoneTitle}</h2>
        <p className="text-gray-500 text-center mb-8">{AT.swipeMatchDoneDesc}</p>
        <button onClick={onClose}
          className="bg-purple-600 text-white px-8 py-3 rounded-2xl font-bold hover:bg-purple-700 transition-colors">
          {AT.swipeMatchDoneBtn}
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-purple-50 to-pink-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-600" />
          <span className="font-bold text-purple-700">{AT.swipeMatchTitle}</span>
        </div>
        <span className="text-sm text-gray-400 font-medium">{AT.swipeMatchAds(remaining)}</span>
        <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600 font-semibold">
          {AT.swipeMatchFeedBtn}
        </button>
      </div>

      {/* Card area */}
      <div className="flex-1 flex items-center justify-center px-4 overflow-hidden">
        <div className="relative w-full max-w-sm">

          {/* Card de baixo (próximo) */}
          {queue[1] && (
            <div className="absolute inset-0 bg-white rounded-3xl shadow-md scale-95 translate-y-3 pointer-events-none" />
          )}

          {/* Card principal */}
          <div
            key={current.id}
            className="relative bg-white rounded-3xl shadow-xl overflow-hidden"
            style={{
              animation: swipeDir
                ? `${swipeDir === 'like' ? 'leafRight' : 'leafLeft'} 0.3s cubic-bezier(0.4,0,0.6,1) forwards`
                : 'none',
            }}
          >
            <style>{`
              @keyframes leafRight {
                0%   { transform: translateX(0)     rotate(0deg);   opacity: 1; }
                60%  { transform: translateX(60%)   rotate(10deg);  opacity: 0.6; }
                100% { transform: translateX(140%)  rotate(18deg);  opacity: 0; }
              }
              @keyframes leafLeft {
                0%   { transform: translateX(0)     rotate(0deg);   opacity: 1; }
                60%  { transform: translateX(-60%)  rotate(-10deg); opacity: 0.6; }
                100% { transform: translateX(-140%) rotate(-18deg); opacity: 0; }
              }
            `}</style>
            <SwipeCardContent product={current} feedback={feedback} AT={AT} />
          </div>
        </div>
      </div>

      {/* Botões Like / Unlike */}
      <div className="flex items-center justify-center gap-10 flex-shrink-0" style={{ paddingTop: 32, paddingBottom: 'max(32px, env(safe-area-inset-bottom))' }}>
        <button
          onClick={() => doSwipe('unlike')}
          disabled={!!swipeDir}
          className="w-20 h-20 rounded-full bg-white shadow-lg flex items-center justify-center text-4xl border-4 border-red-200 hover:border-red-500 hover:scale-110 active:scale-95 transition-all disabled:opacity-40"
        >
          👎🏻
        </button>
        <button
          onClick={() => doSwipe('like')}
          disabled={!!swipeDir}
          className="w-20 h-20 rounded-full bg-white shadow-lg flex items-center justify-center text-4xl border-4 border-green-200 hover:border-green-500 hover:scale-110 active:scale-95 transition-all disabled:opacity-40"
        >
          👍🏻
        </button>
      </div>
    </div>
  );
}
