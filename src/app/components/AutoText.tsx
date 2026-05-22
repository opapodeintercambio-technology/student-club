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
}

// Detecta URLs http(s):// ou www. (com ou sem path/query). Match conservador
// pra nao engolir pontuacao final.
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>()]+[^\s<>().,;:!?'"]/gi;

function renderWithLinks(text: string): (string | JSX.Element)[] {
  const out: (string | JSX.Element)[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((match = URL_RE.exec(text)) !== null) {
    if (match.index > lastIdx) {
      out.push(text.slice(lastIdx, match.index));
    }
    const raw = match[0];
    const href = raw.startsWith('http') ? raw : `https://${raw}`;
    out.push(
      <a
        key={`l-${match.index}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        style={{ color: '#2563eb', textDecoration: 'underline', wordBreak: 'break-all' }}
      >
        {raw}
      </a>
    );
    lastIdx = match.index + raw.length;
  }
  if (lastIdx < text.length) out.push(text.slice(lastIdx));
  return out.length > 0 ? out : [text];
}

export function AutoText({ text, className, style, as = 'span' }: Props) {
  const { lang } = useLang();
  const safe = text || '';
  const [out, setOut] = useState<string>(safe);

  useEffect(() => {
    if (!safe || lang === 'pt') { setOut(safe); return; }
    let cancelled = false;
    toLang(safe, lang as 'en' | 'es').then((t) => {
      if (!cancelled) setOut(t);
    });
    return () => { cancelled = true; };
  }, [safe, lang]);

  const Tag = as as any;
  return <Tag className={className} style={style}>{renderWithLinks(out)}</Tag>;
}
