import { useState, useEffect, useRef } from 'react';
import { MessageCircle, Lock, ChevronRight, Trash2, Users, Plus, Archive } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { deriveKey, decryptMsgWithFallback, formatChatPreview } from '../utils/chatCrypto';
import type { Product } from './ProductCard';
import { useLang } from '../i18n';
import { NewGroupModal } from './NewGroupModal';
import { getArchivedChats, archiveChat, unarchiveChat } from '../utils/chatPrefs';

interface Conversa {
  conversaId: string;
  otherUser: string;
  otherFoto?: string | null;
  productId: string;
  lastMsg: string;
  lastTime: Date;
  unread: boolean;
  isGroup?: boolean;
  groupName?: string;
  groupMemberCount?: number;
  groupAvatar?: string | null;
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

// Linha de conversa com gesto swipe-LEFT pra arquivar (estilo WhatsApp /
// Instagram). Em mobile: arrasta o botão pra esquerda → revela "Arquivar".
// No desktop: ainda há o botão lixeira lateral (handleDelete) como antes.
function SwipeableConvRow({ onArchive, children }: { onArchive: () => void; children: React.ReactNode }) {
  const [dx, setDx] = useState(0);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const lockedRef = useRef<'horiz' | 'vert' | null>(null);
  const ARCHIVE_THRESHOLD = 90;

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    startRef.current = { x: t.clientX, y: t.clientY };
    lockedRef.current = null;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!startRef.current) return;
    const t = e.touches[0];
    const ddx = t.clientX - startRef.current.x;
    const ddy = t.clientY - startRef.current.y;
    if (!lockedRef.current) {
      if (Math.abs(ddx) > 10 || Math.abs(ddy) > 10) {
        lockedRef.current = Math.abs(ddx) > Math.abs(ddy) ? 'horiz' : 'vert';
      }
    }
    if (lockedRef.current === 'horiz') {
      // só arrasta pra ESQUERDA (ddx negativo)
      setDx(Math.min(0, Math.max(-160, ddx)));
    }
  };
  const onTouchEnd = () => {
    if (lockedRef.current === 'horiz' && dx <= -ARCHIVE_THRESHOLD) {
      // snap o slot de "arquivar" antes de remover, fica mais natural
      setDx(-160);
      setTimeout(() => { onArchive(); setDx(0); }, 120);
    } else {
      setDx(0);
    }
    startRef.current = null;
    lockedRef.current = null;
  };

  return (
    <div className="relative" style={{ overflow: 'hidden', borderRadius: 20 }}>
      {/* Slot revelado atrás da row — Arquivar */}
      <div
        className="absolute inset-y-0 right-0 flex items-center justify-end pr-5 text-white font-semibold text-sm select-none"
        style={{
          width: 160,
          background: 'linear-gradient(90deg, #9ca3af 0%, #4b5563 100%)',
          opacity: dx < -10 ? 1 : 0,
          transition: 'opacity 0.15s',
        }}
      >
        <Archive className="w-5 h-5 mr-1.5" /> Arquivar
      </div>
      {/* Row principal — desliza pra esquerda */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        style={{
          transform: `translateX(${dx}px)`,
          transition: startRef.current ? 'none' : 'transform 0.22s cubic-bezier(0.4,0,0.2,1)',
          willChange: 'transform',
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function ChatsTab({ currentUser, products, onOpenChat, unreadIds, onMarkRead, onClearOrphanedUnreads }: ChatTabProps) {
  const { AT, lang } = useLang();
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  // Tick que força re-render quando o user (des)arquiva fora da tab.
  const [, setPrefsTick] = useState(0);
  // Modal de confirmação pra apagar/sair conversa. null = fechado.
  const [confirmDelete, setConfirmDelete] = useState<Conversa | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { load(); }, [currentUser, unreadIds]);

  // Re-renderiza quando prefs (arquivadas) mudam — usado pra refletir
  // arquivamento feito de dentro do ChatPanel imediatamente.
  useEffect(() => {
    const tick = () => setPrefsTick(t => t + 1);
    window.addEventListener('papo-chat-prefs-updated', tick);
    return () => window.removeEventListener('papo-chat-prefs-updated', tick);
  }, []);

  // TEMPO REAL: foto de perfil de outro user mudou → atualiza otherFoto
  // de todas as conversas 1-1 com esse user (sem precisar reload).
  useEffect(() => {
    const onUserUpdated = (e: Event) => {
      const detail = (e as CustomEvent<{ username: string; foto_perfil: string | null }>).detail;
      if (!detail?.username) return;
      setConversas(prev => prev.map(c =>
        c.otherUser === detail.username ? { ...c, otherFoto: detail.foto_perfil } : c
      ));
    };
    window.addEventListener('papo-user-updated', onUserUpdated);
    return () => window.removeEventListener('papo-user-updated', onUserUpdated);
  }, []);

  const archivedSet = getArchivedChats(currentUser);
  const visibleConversas = conversas.filter(c => showArchived
    ? archivedSet.has(c.conversaId)
    : !archivedSet.has(c.conversaId));
  const archivedCount = conversas.filter(c => archivedSet.has(c.conversaId)).length;

  async function load() {
    setLoading(true);
    const [msgRes, hiddenRes, groupsRes] = await Promise.all([
      supabase
        .from('mensagens')
        .select('conversa_id, remetente, conteudo, created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('chat_hidden')
        .select('conversa_id, hidden_at')
        .eq('username', currentUser),
      supabase
        .from('chat_groups')
        .select('id, name, members, avatar_url, created_at')
        .contains('members', [currentUser]),
    ]);
    const data = msgRes.data;
    const hiddenMap = new Map<string, string>();
    (hiddenRes.data || []).forEach((h: any) => hiddenMap.set(h.conversa_id, h.hidden_at));
    const groups = (groupsRes.data as any[]) || [];

    if (!data) { setLoading(false); return; }

    const isValidProductId = (s: string) =>
      /^\d+$/.test(s) ||
      s === 'direct' ||
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

    // DEDUP POR AMIGO: uma entrada por contato, mesmo se houver várias conversa_id
    // (ex: '__22' e '__direct'). Fica com a mais recente.
    const byOtherUser = new Map<string, { conversaId: string; productId: string; lastRow: typeof myConversas[0]; unread: boolean }>();

    for (const [conversaId, lastRow] of map.entries()) {
      // Grupos têm processamento separado (loop abaixo) — pula aqui
      if (conversaId.startsWith('group__')) continue;
      const parts = conversaId.split('__');
      // Exige formato canônico de 3 partes; rejeita lixo
      if (parts.length !== 3) continue;
      const productId = parts[2];
      if (!isValidProductId(productId) && productId !== 'direct') continue;

      // otherUser SEMPRE vem do remetente (fonte confiável) — nunca de parse do convId
      const msgs = allByConvId.get(conversaId) || [];
      const otherRemetente = msgs.find(m => m.remetente !== currentUser)?.remetente;
      const otherUser = otherRemetente
        || parts.find(p => p !== currentUser && p !== productId)
        || '';

      if (!otherUser || otherUser === currentUser) continue;

      const existing = byOtherUser.get(otherUser);
      if (!existing || new Date(lastRow.created_at).getTime() > new Date(existing.lastRow.created_at).getTime()) {
        byOtherUser.set(otherUser, {
          conversaId,
          productId,
          lastRow,
          unread: existing?.unread || unreadIds.has(conversaId),
        });
      } else if (unreadIds.has(conversaId)) {
        existing.unread = true;
      }
    }

    // Busca fotos de perfil de todos os outros users de uma só vez (eficiente)
    const otherUsernames = [...byOtherUser.keys()];
    let fotoMap = new Map<string, string | null>();
    if (otherUsernames.length > 0) {
      const { data: usersData } = await supabase
        .from('usuarios')
        .select('username, foto_perfil')
        .in('username', otherUsernames);
      (usersData as any[] || []).forEach(u => fotoMap.set(u.username, u.foto_perfil || null));
    }

    const result: Conversa[] = [];
    for (const [otherUser, entry] of byOtherUser.entries()) {
      const canonicalId = [currentUser, otherUser].sort().join('__') + '__' + entry.productId;
      const key = await deriveKey(canonicalId);
      const decrypted = await decryptMsgWithFallback(entry.lastRow.conteudo, key, canonicalId);
      const lastMsg = formatChatPreview(decrypted, lang);
      result.push({
        conversaId: entry.conversaId,
        otherUser,
        otherFoto: fotoMap.get(otherUser) || null,
        productId: entry.productId,
        lastMsg,
        lastTime: new Date(entry.lastRow.created_at),
        unread: entry.unread,
      });
    }

    // GRUPOS: cada grupo vira uma entrada na lista
    for (const g of groups) {
      const conversaId = `group__${g.id}`;
      // Tenta achar a mensagem mais recente do grupo
      const groupMsgs = data.filter((m: any) => m.conversa_id === conversaId);
      const lastRow = groupMsgs[0]; // já ordenado desc
      let lastMsg = 'Grupo criado';
      let lastTime = new Date(g.created_at);
      if (lastRow) {
        const key = await deriveKey(conversaId);
        const decrypted = await decryptMsgWithFallback(lastRow.conteudo, key, conversaId);
        lastMsg = `${lastRow.remetente === currentUser ? 'Você' : '@' + lastRow.remetente}: ${formatChatPreview(decrypted, lang)}`;
        lastTime = new Date(lastRow.created_at);
      }
      result.push({
        conversaId,
        otherUser: g.name,
        productId: g.id,
        lastMsg,
        lastTime,
        unread: unreadIds.has(conversaId),
        isGroup: true,
        groupName: g.name,
        groupMemberCount: (g.members || []).length,
        groupAvatar: g.avatar_url || null,
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

  // Botão lixeira: NÃO apaga direto — abre o modal de confirmação.
  function handleDelete(e: React.MouseEvent, c: Conversa) {
    e.stopPropagation();
    setConfirmDelete(c);
  }

  // Executa a deleção depois que o user confirma no modal.
  async function executeDelete(c: Conversa) {
    setDeleting(true);
    try {
      if (c.isGroup) {
        const { data: g } = await supabase.from('chat_groups').select('members,created_by').eq('id', c.productId).single();
        const newMembers = ((g as any)?.members || []).filter((u: string) => u !== currentUser);
        if (newMembers.length === 0) {
          await supabase.from('mensagens').delete().eq('conversa_id', c.conversaId);
          await supabase.from('chat_groups').delete().eq('id', c.productId);
        } else {
          await supabase.from('chat_groups').update({ members: newMembers }).eq('id', c.productId);
        }
      } else {
        // 1-1: soft delete — oculta só pra mim, não afeta o outro lado.
        await supabase.from('chat_hidden').upsert({
          username: currentUser,
          conversa_id: c.conversaId,
          hidden_at: new Date().toISOString(),
        }, { onConflict: 'username,conversa_id' });
      }
      setConversas(prev => prev.filter(x => x.conversaId !== c.conversaId));
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  }

  function handleOpen(c: Conversa) {
    if (c.isGroup) {
      // Grupo: cria um "Product shim" com id = `group__${groupId}`
      onMarkRead(c.conversaId);
      onOpenChat({
        id: `group__${c.productId}`,
        username: c.groupName || c.otherUser,
        title: c.groupName || c.otherUser,
        image: '',
        description: `Grupo · ${c.groupMemberCount} membros`,
        wantsInExchange: '',
        category: 'group',
        tipo: 'troca',
      } as unknown as Product);
      return;
    }
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
      {showNewGroup && (
        <NewGroupModal
          currentUser={currentUser}
          onClose={() => setShowNewGroup(false)}
          onCreated={(groupId, groupName) => {
            load();
            // Abre o grupo recém-criado
            onOpenChat({
              id: `group__${groupId}`,
              username: groupName,
              title: groupName,
              image: '',
              description: 'Grupo',
              wantsInExchange: '',
              category: 'group',
              tipo: 'troca',
            } as unknown as Product);
          }}
        />
      )}

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <MessageCircle className="w-6 h-6 text-purple-600" />
          {AT.chatsTitle}
          <span
            className="inline-flex items-center gap-1 text-[11px] font-bold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 ml-1"
            title="Conversas criptografadas ponta-a-ponta"
          >
            <Lock className="w-3 h-3" /> E2E
          </span>
        </h2>
        <button
          onClick={() => setShowNewGroup(true)}
          className="w-11 h-11 rounded-full flex items-center justify-center text-white active:scale-95 transition-transform shadow-md"
          style={{ background: 'linear-gradient(135deg, #1e714a 0%, #4ade80 100%)' }}
          title="Novo grupo"
          aria-label="Novo grupo"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* Linha "Arquivadas" — estilo WhatsApp, no TOPO da lista (acima da
          primeira conversa). Aparece SEMPRE pra ser descoberta — quando 0,
          mostra dica de swipe; quando >0, mostra a contagem e é clicável. */}
      {!showArchived && (
        <button
          onClick={() => { if (archivedCount > 0) setShowArchived(true); }}
          disabled={archivedCount === 0}
          className={`w-full mb-2.5 flex items-center gap-3 px-4 py-3 rounded-2xl bg-white shadow-sm border border-gray-100 transition-colors ${archivedCount > 0 ? 'hover:bg-gray-50 cursor-pointer' : 'opacity-70 cursor-default'}`}
        >
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: '#f3f4f6' }}>
            <Archive className="w-5 h-5 text-gray-500" />
          </div>
          <div className="flex-1 text-left">
            <p className="font-bold text-gray-800 text-sm">Arquivadas</p>
            <p className="text-xs text-gray-400">
              {archivedCount === 0
                ? 'Arraste uma conversa pra esquerda pra arquivar'
                : `${archivedCount} ${archivedCount === 1 ? 'conversa' : 'conversas'}`}
            </p>
          </div>
          {archivedCount > 0 && <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
        </button>
      )}

      {/* Cabeçalho quando ESTÁ vendo as arquivadas — botão pra voltar.
          Cores explícitas (tokens) pra ler bem em light e dark. */}
      {showArchived && (
        <button
          onClick={() => setShowArchived(false)}
          className="w-full mb-2.5 flex items-center gap-2 px-3 py-2 text-sm rounded-xl transition-colors"
          style={{
            background: 'var(--sc-bg-card)',
            border: '1px solid var(--sc-border)',
            color: 'var(--sc-text-primary)',
          }}
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
          <span className="font-semibold">Voltar pra conversas</span>
        </button>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-400">{AT.chatsLoading}</div>
      ) : visibleConversas.length === 0 ? (
        <div className="text-center py-16">
          <MessageCircle className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <p className="text-gray-400 font-medium">{AT.chatsEmpty}</p>
          <p className="text-gray-300 text-sm mt-1">{AT.chatsEmptyHint}</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {visibleConversas.map(c => {
            const product = products.find(p => p.id === c.productId);
            const row = (
              <div
                key={c.conversaId}
                className={`flex items-center gap-2 transition-all hover:scale-[1.01] ${c.unread ? 'glass-unread' : 'glass'}`}
                style={{ borderRadius: 20 }}
              >
                <button
                  onClick={() => handleOpen(c)}
                  className="flex-1 flex items-center gap-3 p-4 text-left min-w-0"
                >
                  {/* Avatar — prioridade: foto do grupo / foto do user / iniciais */}
                  {c.isGroup && c.groupAvatar ? (
                    <img
                      src={c.groupAvatar}
                      alt={c.groupName}
                      className="w-12 h-12 rounded-2xl object-cover flex-shrink-0"
                    />
                  ) : !c.isGroup && c.otherFoto ? (
                    <img
                      src={c.otherFoto}
                      alt={c.otherUser}
                      className="w-12 h-12 rounded-2xl object-cover flex-shrink-0"
                    />
                  ) : (
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-sm flex-shrink-0 text-white"
                      style={{
                        background: c.isGroup
                          ? 'linear-gradient(135deg, #1e714a 0%, #4ade80 100%)'
                          : c.unread
                            ? 'linear-gradient(135deg, #7c3aed 0%, #f97316 100%)'
                            : 'rgba(139,92,246,0.18)',
                        color: c.isGroup || c.unread ? '#fff' : '#7c3aed',
                      }}
                    >
                      {c.isGroup ? <Users className="w-5 h-5" /> : c.otherUser.slice(0, 2).toUpperCase()}
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`font-bold truncate ${c.unread ? 'text-purple-800' : 'text-gray-800'}`}>
                        {c.isGroup ? c.groupName : `${c.otherUser}`}
                      </p>
                      <span className="text-xs text-gray-400 flex-shrink-0">{timeAgo(c.lastTime, lang)}</span>
                    </div>
                    {c.isGroup
                      ? <p className="text-xs text-gray-400 truncate">Grupo · {c.groupMemberCount} membros</p>
                      : product && <p className="text-xs text-gray-400 truncate">{product.title}</p>}
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

                {showArchived ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); unarchiveChat(currentUser, c.conversaId); }}
                    className="flex-shrink-0 p-4 text-gray-400 hover:text-purple-600 transition-colors"
                    title="Desarquivar"
                  >
                    <Archive className="w-4 h-4" />
                  </button>
                ) : (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); archiveChat(currentUser, c.conversaId); }}
                      className="flex-shrink-0 p-3 text-gray-300 hover:text-purple-600 transition-colors"
                      title="Arquivar conversa"
                      aria-label="Arquivar conversa"
                    >
                      <Archive className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => handleDelete(e, c)}
                      className="flex-shrink-0 p-3 pr-4 text-gray-300 hover:text-red-400 transition-colors"
                      title={c.isGroup ? 'Sair do grupo' : 'Ocultar conversa'}
                      aria-label={c.isGroup ? 'Sair do grupo' : 'Ocultar conversa'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            );
            // Em modo "arquivadas" não permite re-arquivar (mostra row puro).
            // No modo normal, wrappa com swipe-left → arquiva.
            return showArchived
              ? row
              : <SwipeableConvRow key={c.conversaId} onArchive={() => archiveChat(currentUser, c.conversaId)}>{row}</SwipeableConvRow>;
          })}
        </div>
      )}

      {/* Modal de confirmação Sim/Não — apagar/sair conversa */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-[9000] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
          onClick={() => !deleting && setConfirmDelete(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full bg-red-50 border border-red-200 flex items-center justify-center mx-auto mb-3">
              <Trash2 className="w-5 h-5 text-red-500" />
            </div>
            <h3 className="text-center font-bold text-gray-900 text-lg mb-1.5">
              {confirmDelete.isGroup
                ? `Sair do grupo "${confirmDelete.groupName}"?`
                : `Apagar conversa com @${confirmDelete.otherUser}?`}
            </h3>
            <p className="text-center text-sm text-gray-500 mb-5">
              {confirmDelete.isGroup
                ? 'Você não vai mais receber mensagens deste grupo.'
                : 'Esta conversa some apenas pra você — o outro lado não é afetado.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-full text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50 active:scale-95"
              >
                Não
              </button>
              <button
                onClick={() => executeDelete(confirmDelete)}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-full text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50 active:scale-95"
              >
                {deleting ? 'Apagando…' : 'Sim, apagar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
