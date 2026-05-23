// Modal pra selecionar amigos conectados a serem mencionados num post/story.
// Lista vem de friends.getFriends(currentUser), enriquecida com foto/nome
// do Supabase. Selecionados ficam destacados; ao confirmar, devolve o array
// de usernames pro composer.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Search, AtSign } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getFriends } from './friends';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';

interface Props {
  currentUser: string;
  /** Selecao inicial (usernames ja mencionados). */
  initial?: string[];
  onCancel: () => void;
  onConfirm: (mentions: string[]) => void;
}

interface FriendInfo {
  username: string;
  nome?: string | null;
  foto_perfil?: string | null;
}

export function MentionPicker({ currentUser, initial = [], onCancel, onConfirm }: Props) {
  useLockBodyScroll(true);
  const [query, setQuery] = useState('');
  const [friends, setFriends] = useState<FriendInfo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(initial));
  // Ref na area scrollavel da lista — usado pelo listener nativo de touchmove
  // pra deixar passar APENAS scrolls dentro dela. Tudo o resto (backdrop,
  // header, footer, area fora) bloqueia o scroll por baixo.
  const listRef = useRef<HTMLDivElement>(null);

  // Bloqueio NATIVO de touchmove no document enquanto o picker esta aberto.
  // Por que nativo (e nao via React onTouchMove): React atribui listeners
  // como PASSIVOS por default em mobile, e listener passivo NAO consegue
  // chamar preventDefault — o navegador silenciosamente ignora. Em iOS Safari
  // isso fazia o scroll do composer (modal por tras) responder mesmo com
  // touchAction:none no backdrop. Listener nativo com {passive:false} eh a
  // unica forma confiavel de impedir o pan no iOS.
  useEffect(() => {
    function blockOutsideList(e: TouchEvent) {
      // Deixa passar apenas se o toque comecar DENTRO da lista interna do
      // picker (onde scroll vertical eh legitimo). Qualquer outro lugar
      // (backdrop, header, footer, ou — principalmente — o composer por
      // tras) tem o pan bloqueado.
      const list = listRef.current;
      if (list && list.contains(e.target as Node)) return;
      e.preventDefault();
    }
    document.addEventListener('touchmove', blockOutsideList, { passive: false });
    return () => document.removeEventListener('touchmove', blockOutsideList);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const usernames = getFriends(currentUser);
      if (usernames.length === 0) { if (!cancelled) setFriends([]); return; }
      let dbData: Record<string, { nome: string | null; foto_perfil: string | null }> = {};
      try {
        const { data } = await supabase
          .from('usuarios')
          .select('username,nome,foto_perfil')
          .in('username', usernames);
        for (const u of ((data as any[]) || [])) {
          dbData[u.username] = { nome: u.nome, foto_perfil: u.foto_perfil };
        }
      } catch { /* sem rede — segue sem fotos */ }
      const list: FriendInfo[] = usernames.map(u => ({
        username: u,
        nome: dbData[u]?.nome,
        foto_perfil: dbData[u]?.foto_perfil,
      })).sort((a, b) => a.username.localeCompare(b.username));
      if (!cancelled) setFriends(list);
    })();
    return () => { cancelled = true; };
  }, [currentUser]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter(f =>
      f.username.toLowerCase().includes(q) ||
      (f.nome || '').toLowerCase().includes(q)
    );
  }, [friends, query]);

  function toggle(u: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(u)) next.delete(u); else next.add(u);
      return next;
    });
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[10800] flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)', touchAction: 'none' }}
      onClick={onCancel}
      // Bloqueia rubber-band scroll iOS na area do backdrop. iOS PWA permite
      // que touchmove na area "vazia" do overlay propague pro body, fazendo
      // a tela por tras continuar rolando. preventDefault impede isso.
      onTouchMove={(e) => {
        if (e.target === e.currentTarget) e.preventDefault();
      }}
    >
      <div
        className="w-full sm:max-w-md bg-white sm:rounded-3xl rounded-t-3xl overflow-hidden flex flex-col"
        style={{
          maxHeight: '85vh',
          // overscrollBehavior: contain bloqueia o scroll de "vazar"
          // pro body quando o user chega no fim da lista interna (iOS rubber-band).
          overscrollBehavior: 'contain',
          touchAction: 'pan-y',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <AtSign className="w-5 h-5" style={{ color: '#1e714a' }} />
            <h3 className="text-base font-bold" style={{ color: '#0a0a0a' }}>Mencionar</h3>
          </div>
          <button
            onClick={onCancel}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-gray-100"
            aria-label="Fechar"
          >
            <X className="w-5 h-5 text-gray-700" />
          </button>
        </div>

        {/* Search — SEM autoFocus pra o teclado iOS nao abrir
            automaticamente. Antes o autoFocus disparava o teclado ao
            abrir o picker, comprimindo a lista de amigos a quase 0 de
            altura e dando a impressao de "so existe o campo de busca".
            Agora a lista aparece grande e scrollavel ao abrir; user
            so toca no input se realmente quer filtrar. */}
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar amigo..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-full outline-none"
              style={{ background: '#f4f6f4', border: '1px solid #cdd5d1', color: '#101814' }}
            />
          </div>
          {selected.size > 0 && (
            <p className="text-xs mt-2" style={{ color: '#1e714a' }}>
              {selected.size} {selected.size === 1 ? 'selecionado' : 'selecionados'}
            </p>
          )}
        </div>

        {/* Lista */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto"
          // overscrollBehavior: contain pra que o scroll desta lista NAO
          // vaze pra outras areas (chain scrolling do iOS).
          // touchAction:pan-y permite scroll vertical apenas (nao horizontal).
          style={{ overscrollBehavior: 'contain', touchAction: 'pan-y' }}
        >
          {filtered.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-gray-500">
                {friends.length === 0 ? 'Você ainda não tem conexões para mencionar.' : 'Nenhum amigo encontrado.'}
              </p>
            </div>
          ) : (
            <ul>
              {filtered.map(f => {
                const isSel = selected.has(f.username);
                return (
                  <li key={f.username}>
                    <button
                      onClick={() => toggle(f.username)}
                      className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 transition-colors"
                    >
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold overflow-hidden flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg, #1e714a, #4ade80)' }}
                      >
                        {f.foto_perfil
                          ? <img src={f.foto_perfil} alt="" className="w-full h-full object-cover" />
                          : <span className="text-xs">{f.username.slice(0, 2).toUpperCase()}</span>}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-sm font-semibold truncate" style={{ color: '#0a0a0a' }}>
                          {f.nome || f.username}
                        </p>
                        {f.nome && (
                          <p className="text-xs truncate" style={{ color: '#8e8e8e' }}>{f.username}</p>
                        )}
                      </div>
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{
                          background: isSel ? '#1e714a' : 'transparent',
                          border: isSel ? '2px solid #1e714a' : '2px solid #d1d5db',
                        }}
                      >
                        {isSel && <Check className="w-3.5 h-3.5 text-white" />}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-semibold rounded-full"
            style={{ color: '#6b7280' }}
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(Array.from(selected))}
            className="flex-1 sm:flex-none px-6 py-2 text-sm font-bold rounded-full text-white"
            style={{ background: '#1e714a' }}
          >
            Confirmar{selected.size > 0 ? ` (${selected.size})` : ''}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
