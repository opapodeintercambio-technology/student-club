// <AutoText text="..." /> — renderiza texto com traducao automatica
// + URLs clicaveis (links abrem em nova aba).
//
// Como funciona:
//   - lang === 'pt': renderiza o texto original
//   - lang === 'en' | 'es': chama /api/translate (cacheado em localStorage
//     via toLang) e renderiza a traducao. Mostra o texto original enquanto
//     a traducao nao chega — sem flicker.
//   - URLs (http://, https://, www.) sao detectadas e viram <a target="_blank">
//
// Usado em chat msgs, post text, comments e story captions.
import { useEffect, useState } from 'react';
import { useLang } from '../i18n';
import { toLang } from '../utils/translate';

interface Props {
  text: string | null | undefined;
  className?: string;
  style?: React.CSSProperties;
  as?: 'span' | 'p' | 'div';
  /** Quando true, remove @mentions inline antes de renderizar (caso o
   *  componente pai ja exiba a lista de mentions separada — ex: feed post). */
  hideMentions?: boolean;
  /** Override do idioma alvo. Quando setado, IGNORA o lang global do i18n
   *  e traduz pro idioma indicado. Usado pelo tradutor por-conversa do
   *  chat (convTargetLang) — diferente do Google Translate da home. */
  targetLang?: string | null;
}

// Detecta URLs http(s):// ou www. (com ou sem path/query) e @mentions.
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>()]+[^\s<>().,;:!?'"]/gi;
const MENTION_RE = /@([a-zA-Z0-9_.]+)/g;
const MENTION_COLOR = '#1e714a';

function renderTokens(text: string): (string | JSX.Element)[] {
  // Coleta TODOS os matches (URL + mention) ordenados por posicao
  type Tok = { start: number; end: number; el: JSX.Element };
  const toks: Tok[] = [];
  URL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = URL_RE.exec(text)) !== null) {
    const raw = m[0];
    const href = raw.startsWith('http') ? raw : `https://${raw}`;
    toks.push({
      start: m.index,
      end: m.index + raw.length,
      el: (
        <a
          key={`u-${m.index}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{ color: '#2563eb', textDecoration: 'underline', wordBreak: 'break-all' }}
        >{raw}</a>
      ),
    });
  }
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(text)) !== null) {
    const name = m[1];
    // Renderiza SO o nome (sem @) em verde, fonte menor — pedido do user.
    toks.push({
      start: m.index,
      end: m.index + m[0].length,
      el: (
        <span
          key={`m-${m.index}`}
          onClick={(e) => {
            e.stopPropagation();
            try { window.dispatchEvent(new CustomEvent('papo-open-profile', { detail: { username: name } })); } catch {}
          }}
          style={{ color: MENTION_COLOR, fontWeight: 700, fontSize: '0.88em', cursor: 'pointer' }}
        >{name}</span>
      ),
    });
  }
  toks.sort((a, b) => a.start - b.start);
  // Evita overlap (raro): pula tokens que comecam dentro de outro
  const safe: Tok[] = [];
  let cursor = 0;
  for (const t of toks) {
    if (t.start >= cursor) { safe.push(t); cursor = t.end; }
  }
  const out: (string | JSX.Element)[] = [];
  let lastIdx = 0;
  for (const t of safe) {
    if (t.start > lastIdx) out.push(text.slice(lastIdx, t.start));
    out.push(t.el);
    lastIdx = t.end;
  }
  if (lastIdx < text.length) out.push(text.slice(lastIdx));
  return out.length > 0 ? out : [text];
}

export function AutoText({ text, className, style, as = 'span', hideMentions, targetLang }: Props) {
  const { lang } = useLang();
  const safe = text || '';
  // Override do chat (convTargetLang) vence sobre o lang global do i18n.
  // Se targetLang === null/undefined → usa lang global (comportamento legacy).
  const effective = (targetLang || lang || 'pt').toString();
  const base = effective.split('-')[0].toLowerCase();
  const [out, setOut] = useState<string>(safe);

  useEffect(() => {
    // Sem texto OU idioma alvo eh portugues → renderiza original.
    // (Assumindo origem pt-BR pros conteudos do app — comum entre intercambistas.)
    if (!safe || base === 'pt') { setOut(safe); return; }
    let cancelled = false;
    toLang(safe, effective).then((t) => {
      if (!cancelled) setOut(t);
    });
    return () => { cancelled = true; };
  }, [safe, effective, base]);

  // Quando hideMentions=true, strip @user do texto pra evitar duplicacao
  // visual com a lista "Com X, Y" mostrada separadamente pelo pai.
  const finalText = hideMentions
    ? out.replace(/@[a-zA-Z0-9_.]+/g, '').replace(/\s{2,}/g, ' ').trim()
    : out;
  const Tag = as as any;
  return <Tag className={className} style={style}>{renderTokens(finalText)}</Tag>;
}
