import { useState, useEffect, useRef } from 'react';
import { useLang } from '../i18n';
import { toLang } from '../utils/translate';
import type { Product } from '../components/ProductCard';

interface Translated {
  title: string;
  description: string;
  wantsInExchange: string;
  category: string;
}

export function useProductTranslation(product: Product): Translated {
  const { lang } = useLang();
  const [t, setT] = useState<Translated>({
    title: product.title,
    description: product.description,
    wantsInExchange: product.wantsInExchange,
    category: product.category,
  });
  // Tracks the key for which translation SUCCEEDED — includes title so edits re-translate
  const doneKey = useRef('');

  useEffect(() => {
    const key = `${product.id}||${lang}||${product.title}`;
    if (doneKey.current === key) return;

    if (lang !== 'en' && lang !== 'es') {
      doneKey.current = key;
      setT({
        title: product.title,
        description: product.description,
        wantsInExchange: product.wantsInExchange,
        category: product.category,
      });
      return;
    }

    setT({
      title: product.title,
      description: product.description,
      wantsInExchange: product.wantsInExchange,
      category: product.category,
    });

    Promise.all([
      toLang(product.title, lang),
      toLang(product.description, lang),
      toLang(product.wantsInExchange, lang),
      toLang(product.category, lang),
    ]).then(([title, description, wantsInExchange, category]) => {
      // Only mark as done if title was actually translated — prevents locking on API failures
      if (title !== product.title) doneKey.current = key;
      setT({ title, description, wantsInExchange, category });
    });
  }, [product.id, product.title, product.description, product.wantsInExchange, product.category, lang]);

  return t;
}
