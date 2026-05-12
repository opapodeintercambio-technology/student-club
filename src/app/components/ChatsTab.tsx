import { useState, useEffect } from 'react';
import { MessageCircle, Lock, ChevronRight, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { deriveKey, decryptMsgWithFallback, formatChatPreview } from '../utils/chatCrypto';
import type { Product } from './ProductCard';
import { useLang } from '../i18n';

interface Conversa {
  conversaId: string;
  otherUser: string;
  productId: string;
  lastMsg: string;
  lastTime: Date;
  unread: boolean;
}

interface ChatTabProps {
  currentUser: string;
  products: Product[];
  onOpenChat: (product: Product) => void;
  unreadIds: Set<string>;
  onMarkRead: (conversaId: string) => void;
  onClearOrphanedUnreads?: (ids: string[]) => void;
}

function timeAgo(d: Date, lang: string) {
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (lang === 'en') {
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  }
  if (lang === 'es') {
    if (mins < 1) return 'ahora';
    if (mins < 60) return `${mins}min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  }
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export function ChatsTab({ currentUser, products, onOpenChat, unreadIds, onMarkRead, onClearOrphanedUnreads }: ChatTabProps) {
  const { AT, lang } = useLang();
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [currentUser, unreadIds]);

  async function load() {
    setLoading(true);
    const [msgRes, hiddenRes] = await Promise.all([
      supabase
        .from('mensagens')
        .select('conversa_id, remetente, conteudo, created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('chat_hidden')
        .select('conversa_id, hidden_at')
        .eq('username', currentUser),
    ]);
    const data = msgRes.data;
    const hiddenMap = new Map<string, string>();
    (hiddenRes.data || []).forEach((h: any) => hiddenMap.set(h.conversa_id, h.hidden_at));

    if (!data) { setLoading(false); return; }

    const isValidProductId = (s: string) =>
      /^\d+$/.test(s) ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

    const myConversas = data.filter(m => {
      if (!(m.conversa_id.includes(currentUser) || m.remetente === currentUser)) return false;
      // Se a conversa está oculta para mim, só mostro mensagens NOVAS após o ocultamento
      const hiddenAt = hiddenMap.get(m.conversa_id);
      if (hiddenAt && new Date(m.created_at) <= new Date(hiddenAt)) return false;
      return true;
    });

    const allByConvId = new Map<string, typeof myConversas>();
    for (const m of myConversas) {
      if (!allByConvId.has(m.conversa_id)) allByConvId.set(m.conversa_id, []);
      allByConvId.get(m.conversa_id)!.push(m);
    }

    const map = new Map<string, typeof myConversas[0]>();
    for (const m of myConversas) {
      if (!map.has(m.conversa_id)) map.set(m.conversa_id, m);
    }

    const result: Conversa[] = [];
    const seenPairs = new Set<string>();

    for (const [conversaId, lastRow] of map.entries()) {
      let productId: string;
      let otherUser: string;

      const parts = conversaId.split('__');

      if (parts.length === 3 && isValidProductId(parts[2])) {
        productId = parts[2];
        otherUser = parts.find(p => p !== currentUser && p !== productId) || '';
      } else {
        const numMatch = conversaId.match(/\d{2,}/);
        if (!numMatch) continue;
        productId = numMatch[0];

        const msgs = allByConvId.get(conversaId) || [];
        const otherRemetente = msgs.find(m => m.remetente !== currentUser)?.remetente || '';
        if (otherRemetente) {
          otherUser = otherRemetente;
        } else {
          const remaining = conversaId.replace(productId, '').replace(currentUser, '');
          otherUser = remaining.split('_').filter(p => p.length > 0).join('_');
        }
      }

      if (!otherUser || otherUser === currentUser) continue;
      const pairKey = [otherUser, productId].join('|');
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);
      const canonicalId = [currentUser, otherUser].sort().join('__') + '__' + productId;
      const key = await deriveKey(canonicalId);
      const decrypted = await decryptMsgWithFallback(lastRow.conteudo, key, canonicalId);
      const lastMsg = formatChatPreview(decrypted, lang);
      result.push({
        conversaId, otherUser, productId, lastMsg,
        lastTime: new Date(lastRow.created_at),
        unread: unreadIds.has(conversaId),
      });
    }

    result.sort((a, b) => b.lastTime.getTime() - a.lastTime.getTime());
    setConversas(result);
    setLoading(false);

    if (onClearOrphanedUnreads && unreadIds.size > 0) {
      const loadedIds = new Set(result.map(c => c.conversaId));
      const orphans = [...unreadIds].filter(id => !loadedIds.has(id));
      if (orphans.length > 0) onClearOrphanedUnreads(orphans);
    }
  }

  async function handleDelete(e: React.MouseEvent, conversaId: string) {
    e.stopPropagation();
    // Soft delete: oculta para o usuário atual sem afetar o outro lado
    await supabase.from('chat_hidden').upsert({
      username: currentUser,
      conversa_id: conversaId,
      hidden_at: new Date().toISOString(),
    }, { onConflict: 'username,conversa_id' });
    setConversas(prev => prev.filter(c => c.conversaId !== conversaId));
  }

  function handleOpen(c: Conversa) {
    const found = products.find(p => p.id === c.productId);
    const product = {
      ...(found || {}),
      id: c.productId,
      title: found?.title || 'Anúncio',
      image: found?.image || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400',
      description: found?.description || '',
      wantsInExchange: found?.wantsInExchange || '',
      category: found?.category || '',
      gender: found?.gender || 'Unissex',
      trokValue: found?.trokValue || 0,
      username: c.otherUser,
    };
    onMarkRead(c.conversaId);
    onOpenChat(product as Product);
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-20">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
        <MessageCircle className="w-6 h-6 text-purple-600" />
        {AT.chatsTitle}
        <span className="flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 ml-1">
          <Lock className="w-3 h-3" /> {AT.chatsEncrypted}
        </span>
      </h2>

      {loading ? (
        <div className="text-center py-16 text-gray-400">{AT.chatsLoading}</div>
      ) : conversas.length === 0 ? (
        <div className="text-center py-16">
          <MessageCircle className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <p className="text-gray-400 font-medium">{AT.chatsEmpty}</p>
          <p className="text-gray-300 text-sm mt-1">{AT.chatsEmptyHint}</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {conversas.map(c => {
            const product = products.find(p => p.id === c.productId);
            return (
              <div
                key={c.conversaId}
                className={`flex items-center gap-2 transition-all hover:scale-[1.01] ${c.unread ? 'glass-unread' : 'glass'}`}
                style={{ borderRadius: 20 }}
              >
                <button
                  onClick={() => handleOpen(c)}
                  className="flex-1 flex items-center gap-3 p-4 text-left min-w-0"
                >
                  {/* Avatar */}
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-sm flex-shrink-0 text-white"
                    style={{
                      background: c.unread
                        ? 'linear-gradient(135deg, #7c3aed 0%, #f97316 100%)'
                        : 'rgba(139,92,246,0.18)',
                      color: c.unread ? '#fff' : '#7c3aed',
                    }}
                  >
                    {c.otherUser.slice(0, 2).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`font-bold truncate ${c.unread ? 'text-purple-800' : 'text-gray-800'}`}>
                        @{c.otherUser}
                      </p>
                      <span className="text-xs text-gray-400 flex-shrink-0">{timeAgo(c.lastTime, lang)}</span>
                    </div>
                    {product && <p className="text-xs text-gray-400 truncate">{product.title}</p>}
                    <p className={`text-sm truncate mt-0.5 ${c.unread ? 'font-semibold text-purple-700' : 'text-gray-500'}`}>
                      {c.lastMsg}
                    </p>
                  </div>

                  <div className="flex-shrink-0">
                    {c.unread
                      ? <div className="w-2.5 h-2.5 bg-purple-600 rounded-full" />
                      : <ChevronRight className="w-4 h-4 text-gray-300" />}
                  </div>
                </button>

                <button
                  onClick={(e) => handleDelete(e, c.conversaId)}
                  className="flex-shrink-0 p-4 text-gray-300 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
