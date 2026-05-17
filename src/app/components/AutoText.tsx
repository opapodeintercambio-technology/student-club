// <AutoText text="..." /> — substitui {text} em qualquer lugar e
// traduz automaticamente quando o idioma do app eh diferente de PT.
//
// Como funciona:
//   - lang === 'pt': renderiza o texto original
//   - lang === 'en' | 'es': chama /api/translate (cacheado em localStorage
//     via toLang) e renderiza a traducao. Mostra o texto original enquanto
//     a traducao nao chega — sem flicker.
//
// Usado em chat msgs, post text, comments e story captions pra cobrir o
// requisito de "traducao em tudo" sem precisar mexer no DB.
import { useEffect, useState } from 'react';
import { useLang } from '../i18n';
import { toLang } from '../utils/translate';

interface Props {
  text: string | null | undefined;
  className?: string;
  style?: React.CSSProperties;
  as?: 'span' | 'p' | 'div';
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
  return <Tag className={className} style={style}>{out}</Tag>;
}
