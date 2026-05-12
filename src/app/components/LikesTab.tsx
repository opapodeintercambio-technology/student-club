import { useState, useEffect } from 'react';
import { MessageCircle, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Product } from './ProductCard';
import { useLang } from '../i18n';

interface LikesTabProps {
  currentUser: string;
  products: Product[];
  onChat: (p: Product) => void;
  onOpen: (p: Product) => void;
}

export function LikesTab({ currentUser, products, onChat, onOpen }: LikesTabProps) {
  const { AT } = useLang();
  const [activeTab, setActiveTab] = useState<'like' | 'unlike'>('like');
  const [swipedIds, setSwipedIds] = useState<{ produto_id: string; acao: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase.from('swipes').select('produto_id, acao').eq('username', currentUser);
      setSwipedIds(data || []);
      setLoading(false);
    })();
  }, [currentUser]);

  const filteredIds = swipedIds.filter(s => s.acao === activeTab).map(s => s.produto_id);
  const filteredProducts = products.filter(p => filteredIds.includes(p.id));

  const handleDelete = async (produtoId: string) => {
    await supabase.from('swipes').delete().eq('username', currentUser).eq('produto_id', produtoId);
    setSwipedIds(prev => prev.filter(s => s.produto_id !== produtoId));
  };

  const handleClearAll = async () => {
    await supabase.from('swipes').delete().eq('username', currentUser).eq('acao', activeTab);
    setSwipedIds(prev => prev.filter(s => s.acao !== activeTab));
    setConfirmClearAll(false);
  };

  const currentCount = swipedIds.filter(s => s.acao === activeTab).length;

  return (
    <div className="max-w-[1400px] mx-auto px-3 sm:px-4 py-6 pb-20">
      {/* Tabs */}
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div className="flex gap-2">
          <button
            onClick={() => { setActiveTab('like'); setConfirmClearAll(false); }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-sm transition-all"
            style={{
              background: activeTab === 'like' ? '#22c55e' : 'rgba(255,255,255,0.65)',
              color: activeTab === 'like' ? '#fff' : '#6b7280',
              border: activeTab === 'like' ? '1.5px solid #22c55e' : '1.5px solid rgba(255,255,255,0.6)',
              backdropFilter: 'blur(12px)',
              boxShadow: activeTab === 'like' ? '0 4px 14px rgba(34,197,94,0.3)' : '0 2px 8px rgba(0,0,0,0.06)',
            }}
          >
            {AT.likedTab}
            <span className="text-xs px-1.5 py-0.5 rounded-full font-bold" style={{ background: activeTab === 'like' ? 'rgba(255,255,255,0.3)' : 'rgba(34,197,94,0.12)', color: activeTab === 'like' ? '#fff' : '#16a34a' }}>
              {swipedIds.filter(s => s.acao === 'like').length}
            </span>
          </button>
          <button
            onClick={() => { setActiveTab('unlike'); setConfirmClearAll(false); }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-sm transition-all"
            style={{
              background: activeTab === 'unlike' ? '#ef4444' : 'rgba(255,255,255,0.65)',
              color: activeTab === 'unlike' ? '#fff' : '#6b7280',
              border: activeTab === 'unlike' ? '1.5px solid #ef4444' : '1.5px solid rgba(255,255,255,0.6)',
              backdropFilter: 'blur(12px)',
              boxShadow: activeTab === 'unlike' ? '0 4px 14px rgba(239,68,68,0.3)' : '0 2px 8px rgba(0,0,0,0.06)',
            }}
          >
            {AT.unlikedTab}
            <span className="text-xs px-1.5 py-0.5 rounded-full font-bold" style={{ background: activeTab === 'unlike' ? 'rgba(255,255,255,0.3)' : 'rgba(239,68,68,0.10)', color: activeTab === 'unlike' ? '#fff' : '#dc2626' }}>
              {swipedIds.filter(s => s.acao === 'unlike').length}
            </span>
          </button>
        </div>

        {currentCount > 0 && !confirmClearAll && (
          <button onClick={() => setConfirmClearAll(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-red-400 transition-colors glass-sm" style={{ borderRadius: 99 }}>
            <Trash2 className="w-3.5 h-3.5" /> {AT.clearAll}
          </button>
        )}
        {confirmClearAll && (
          <div className="flex items-center gap-2 glass-sm px-4 py-2" style={{ borderRadius: 16, borderColor: 'rgba(239,68,68,0.25)', background: 'rgba(254,226,226,0.5)' }}>
            <span className="text-sm text-red-600 font-medium">{AT.confirmClearAll}</span>
            <button onClick={handleClearAll} className="bg-red-500 text-white px-3 py-1 rounded-full text-xs font-bold">{AT.confirmYes}</button>
            <button onClick={() => setConfirmClearAll(false)} className="text-gray-600 px-3 py-1 rounded-full text-xs font-bold glass-sm">{AT.confirmNo}</button>
          </div>
        )}
      </div>

      {loading && <div className="text-center py-20 text-gray-400">{AT.loading}</div>}

      {!loading && filteredProducts.length === 0 && (
        <div className="text-center py-20 glass" style={{ borderRadius: 24 }}>
          <span className="text-6xl">{activeTab === 'like' ? '👍🏻' : '👎🏻'}</span>
          <h3 className="text-xl font-bold text-gray-700 mt-4">
            {AT.likesEmpty(activeTab)}
          </h3>
          <p className="text-gray-400 mt-2 text-sm">{AT.likesEmptyHint}</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {filteredProducts.map(product => (
          <div key={product.id} className="glass flex flex-col overflow-hidden transition-all hover:scale-[1.01]" style={{ borderRadius: 20 }}>
            <div className="relative cursor-pointer" style={{ borderRadius: '18px 18px 0 0', overflow: 'hidden' }} onClick={() => onOpen(product)}>
              <img src={product.image} alt={product.title} loading="lazy" decoding="async" className="w-full h-44 object-cover" />
              <span className="absolute top-2 right-2 text-xl">
                {activeTab === 'like' ? '👍🏻' : '👎🏻'}
              </span>
            </div>
            <div className="p-3 flex flex-col flex-1">
              <h3 className="font-bold text-gray-900 text-sm mb-1 line-clamp-2 cursor-pointer hover:text-purple-700" onClick={() => onOpen(product)}>
                {product.title}
              </h3>
              <p className="text-xs text-gray-500 mb-2 line-clamp-2 flex-1">{product.description}</p>
              <div className="flex gap-2 mt-auto">
                {activeTab === 'like' && (
                  <button
                    onClick={() => onChat(product)}
                    className="flex-1 text-white py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1"
                    style={{ background: 'linear-gradient(135deg,#7c3aed,#f97316)', boxShadow: '0 3px 10px rgba(124,58,237,0.25)' }}
                  >
                    <MessageCircle className="w-3.5 h-3.5" /> Chat
                  </button>
                )}
                <button
                  onClick={() => handleDelete(product.id)}
                  className="flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold text-red-400 hover:text-red-600 transition-colors glass-sm"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
