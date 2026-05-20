// Textarea com autocomplete inline de @mencao (estilo Instagram/Twitter).
// Quando o usuario digita @ seguido de letras, aparece um popup com os amigos
// que matcham o prefixo. Clicar/Enter substitui o trecho @xxx pelo username
// completo e dispara onMentionAdd pra atualizar a lista de mencoes.
//
// Drop-in replacement pro <textarea>: aceita value/onChange iguais a um
// textarea normal + props extras pra menção (currentUser, onMentionAdd) e
// fica visualmente identico ao textarea original (style, className, etc).

import {
  forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState,
  type CSSProperties, type ChangeEvent, type KeyboardEvent,
} from 'react';
import { supabase } from '../../lib/supabase';
import { getFriends } from './friends';

interface FriendInfo {
  username: string;
  nome?: string | null;
  foto_perfil?: string | null;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** username do usuario logado — usado pra carregar lista de amigos */
  currentUser: string;
  /** Disparado quando o user seleciona alguem da lista (pra adicionar em
   *  newMentions). Recebe o username SEM o @. */
  onMentionAdd?: (username: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  style?: CSSProperties;
  /** Tema do popup — claro (composer mobile/desktop branco) ou escuro
   *  (composer dark do feed). Default: light. */
  popupTheme?: 'light' | 'dark';
  autoFocus?: boolean;
}

// Procura no texto, ANTES do cursor, um padrao "@xxx" onde xxx eh o prefixo
// sendo digitado. Retorna { start, prefix } se encontrar, null se nao.
// Considera "@" valido se for inicio do texto OU vier depois de espaco/quebra.
function detectMentionAtCursor(text: string, caret: number): { start: number; prefix: string } | null {
  if (caret <= 0) return null;
  // Volta do cursor pra tras ate achar um '@' OU um separador (espaco, \n, ponto)
  let i = caret - 1;
  while (i >= 0) {
    const ch = text[i];
    if (ch === '@') {
      // Verifica se o '@' eh "isolado" (inicio ou depois de espaco/quebra)
      if (i === 0 || /\s/.test(text[i - 1])) {
        const prefix = text.slice(i + 1, caret);
        // Aceita prefixo vazio (acabou de digitar '@') ate qualquer texto sem
        // espaco. Para de tentar matchar se o "username" parcial conter espaco.
        if (/^[A-Za-z0-9_.]*$/.test(prefix)) {
          return { start: i, prefix };
        }
      }
      return null;
    }
    if (/\s/.test(ch)) return null; // ja passou de uma palavra, nao tem @ aberto
    i--;
  }
  return null;
}

export interface MentionAutocompleteHandle {
  focus: () => void;
}

export const MentionAutocompleteTextarea = forwardRef<MentionAutocompleteHandle, Props>(
  function MentionAutocompleteTextarea(
    { value, onChange, currentUser, onMentionAdd, placeholder, rows, className, style, popupTheme = 'light', autoFocus },
    ref,
  ) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
    }), []);

    const [friends, setFriends] = useState<FriendInfo[]>([]);
    const [mention, setMention] = useState<{ start: number; prefix: string } | null>(null);
    const [highlight, setHighlight] = useState(0);

    // Carrega lista de amigos uma vez (esses sao os candidatos do autocomplete).
    useEffect(() => {
      let cancelled = false;
      (async () => {
        const usernames = getFriends(currentUser);
        if (!usernames || usernames.length === 0) {
          if (!cancelled) setFriends([]);
          return;
        }
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
        if (cancelled) return;
        setFriends(
          usernames.map(u => ({
            username: u,
            nome: dbData[u]?.nome,
            foto_perfil: dbData[u]?.foto_perfil,
          })).sort((a, b) => a.username.localeCompare(b.username))
        );
      })();
      return () => { cancelled = true; };
    }, [currentUser]);

    // Filtra amigos pelo prefixo @ digitado. Max 6 sugestoes pra nao ocupar
    // a tela inteira no mobile.
    const suggestions = useMemo(() => {
      if (!mention) return [];
      const q = mention.prefix.toLowerCase();
      const matched = friends.filter(f =>
        f.username.toLowerCase().startsWith(q) ||
        (f.nome || '').toLowerCase().includes(q)
      );
      return matched.slice(0, 6);
    }, [mention, friends]);

    // Reseta highlight quando suggestions mudam
    useEffect(() => { setHighlight(0); }, [mention?.prefix]);

    function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
      const v = e.target.value;
      onChange(v);
      const caret = e.target.selectionStart ?? v.length;
      setMention(detectMentionAtCursor(v, caret));
    }

    function pickSuggestion(s: FriendInfo) {
      if (!mention) return;
      const t = textareaRef.current;
      // Substitui o trecho "@prefix" pelo "@username " (com espaco no fim)
      // mantendo o resto do texto a partir do cursor.
      const caret = t?.selectionStart ?? value.length;
      const before = value.slice(0, mention.start);
      const after = value.slice(caret);
      const insert = `@${s.username} `;
      const next = before + insert + after;
      onChange(next);
      onMentionAdd?.(s.username);
      setMention(null);
      // Reposiciona o cursor logo apos a mencao inserida.
      const newCaret = before.length + insert.length;
      requestAnimationFrame(() => {
        if (t) {
          t.focus();
          try { t.setSelectionRange(newCaret, newCaret); } catch {}
        }
      });
    }

    function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
      if (suggestions.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight(h => (h + 1) % suggestions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight(h => (h - 1 + suggestions.length) % suggestions.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pickSuggestion(suggestions[highlight]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setMention(null);
      }
    }

    function handleSelectChange(e: any) {
      // Re-detecta quando o user move o cursor (clique, arrow keys sem editar)
      const t = e.target as HTMLTextAreaElement;
      const caret = t.selectionStart ?? value.length;
      setMention(detectMentionAtCursor(value, caret));
    }

    const isDark = popupTheme === 'dark';

    return (
      <div className="relative flex-1 min-w-0">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onSelect={handleSelectChange}
          placeholder={placeholder}
          rows={rows}
          className={className}
          style={style}
          autoFocus={autoFocus}
        />
        {suggestions.length > 0 && (
          <div
            // Popup absoluto logo abaixo do textarea. Width = textarea, max
            // height fixo. z-[10900] acima de outros modais.
            className="absolute left-0 right-0 mt-1 rounded-xl overflow-hidden z-[10900] shadow-lg"
            style={{
              top: '100%',
              background: isDark ? '#1a1a1f' : '#ffffff',
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
              maxHeight: 260,
              overflowY: 'auto',
            }}
          >
            {suggestions.map((s, idx) => (
              <button
                key={s.username}
                type="button"
                // onMouseDown em vez de onClick pra disparar ANTES do blur
                // do textarea (que poderia fechar o popup).
                onMouseDown={(e) => { e.preventDefault(); pickSuggestion(s); }}
                className="w-full px-3 py-2 flex items-center gap-2.5 text-left transition-colors"
                style={{
                  background: idx === highlight
                    ? (isDark ? 'rgba(255,255,255,0.08)' : '#f3f4f6')
                    : 'transparent',
                  color: isDark ? '#fff' : '#0a0a0a',
                }}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold overflow-hidden flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, #1e714a, #4ade80)' }}
                >
                  {s.foto_perfil
                    ? <img src={s.foto_perfil} alt="" className="w-full h-full object-cover" />
                    : <span>{s.username.slice(0, 2).toUpperCase()}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{s.nome || s.username}</p>
                  {s.nome && (
                    <p className="text-xs truncate" style={{ color: isDark ? 'rgba(255,255,255,0.55)' : '#8e8e8e' }}>
                      @{s.username}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  },
);
