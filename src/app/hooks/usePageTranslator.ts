// Tradutor global de pagina — walker de DOM que pega TODO text node + atributos
// (placeholder, title, aria-label) e traduz via toLang() cacheado.
// Reage a mudancas via MutationObserver. Quando lang volta pra 'pt' restaura
// os textos originais.
//
// Para opt-out: adicione data-no-translate em qualquer elemento que NAO deve
// ser traduzido (usernames @handle, codigos, etc).
import { useEffect } from 'react';
import { toLang } from '../utils/translate';

const SKIP_TAGS = new Set([
  'SCRIPT','STYLE','NOSCRIPT','CODE','PRE','TEXTAREA','INPUT','SELECT',
  'SVG','PATH','CIRCLE','RECT','LINE','POLYGON','POLYLINE','G','DEFS',
  'STOP','LINEARGRADIENT','RADIALGRADIENT','FILTER','MASK','USE',
]);

const originals = new WeakMap<Node, string>();
const lastWritten = new WeakMap<Node, string>();
const attrOriginals = new WeakMap<Element, Record<string, string>>();
const attrLastWritten = new WeakMap<Element, Record<string, string>>();

function isTranslatable(t: string | null | undefined): boolean {
  if (!t) return false;
  const s = t.trim();
  if (s.length < 2) return false;
  // precisa ter pelo menos uma letra latina (evita numeros puros, emojis, simbolos)
  if (!/[A-Za-zÀ-ÿ]/.test(s)) return false;
  return true;
}

function shouldSkipNode(node: Node): boolean {
  let p: Node | null = node.parentNode;
  while (p && p.nodeType === 1) {
    const el = p as Element;
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.hasAttribute && el.hasAttribute('data-no-translate')) return true;
    if (el.getAttribute && el.getAttribute('contenteditable') === 'true') return true;
    p = p.parentNode;
  }
  return false;
}

function shouldSkipElement(el: Element): boolean {
  if (SKIP_TAGS.has(el.tagName)) return true;
  let p: Element | null = el;
  while (p) {
    if (p.hasAttribute && p.hasAttribute('data-no-translate')) return true;
    p = p.parentElement;
  }
  return false;
}

export function usePageTranslator(lang: 'pt' | 'en' | 'es' | string) {
  useEffect(() => {
    const target: 'en' | 'es' | null = lang === 'en' || lang === 'es' ? lang : null;

    function processText(node: Text) {
      if (shouldSkipNode(node)) return;
      const current = node.nodeValue || '';
      if (!isTranslatable(current)) return;

      // Se este texto eh o que nos escrevemos por ultimo, ignora (evita loop)
      if (lastWritten.get(node) === current) return;

      // O texto atual eh "novo" (vindo do React) — registra como original
      const orig = current;
      originals.set(node, orig);

      if (target === null) {
        // PT — restaura para original (que ja eh original neste caso)
        lastWritten.delete(node);
        return;
      }
      toLang(orig, target).then(t => {
        if (!t || t === orig) return;
        if (node.nodeValue !== t) {
          node.nodeValue = t;
          lastWritten.set(node, t);
        }
      });
    }

    function processAttr(el: Element, attr: string) {
      if (shouldSkipElement(el)) return;
      const cur = el.getAttribute(attr);
      if (!isTranslatable(cur)) return;

      const writtenMap = attrLastWritten.get(el) || {};
      if (writtenMap[attr] === cur) return;

      const origs = attrOriginals.get(el) || {};
      origs[attr] = cur as string;
      attrOriginals.set(el, origs);

      if (target === null) {
        const w = attrLastWritten.get(el);
        if (w) delete w[attr];
        return;
      }
      toLang(cur as string, target).then(t => {
        if (!t || t === cur) return;
        if (el.getAttribute(attr) !== t) {
          el.setAttribute(attr, t);
          const m = attrLastWritten.get(el) || {};
          m[attr] = t;
          attrLastWritten.set(el, m);
        }
      });
    }

    function restoreAll() {
      // Volta tudo para PT
      const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      let n: Node | null = tw.currentNode;
      while ((n = tw.nextNode())) {
        if (n.nodeType === 3) {
          const orig = originals.get(n);
          if (orig && n.nodeValue !== orig) {
            (n as Text).nodeValue = orig;
            lastWritten.delete(n);
          }
        } else if (n.nodeType === 1) {
          const el = n as Element;
          const origs = attrOriginals.get(el);
          if (origs) {
            for (const a of Object.keys(origs)) {
              if (el.getAttribute(a) !== origs[a]) {
                el.setAttribute(a, origs[a]);
              }
            }
            attrLastWritten.delete(el);
          }
        }
      }
    }

    function walk(root: Node) {
      const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      // Process the root itself
      if (root.nodeType === 3) {
        processText(root as Text);
      } else if (root.nodeType === 1) {
        const el = root as Element;
        if (!SKIP_TAGS.has(el.tagName)) {
          processAttr(el, 'placeholder');
          processAttr(el, 'title');
          processAttr(el, 'aria-label');
        }
      }
      let n: Node | null;
      while ((n = tw.nextNode())) {
        if (n.nodeType === 3) {
          processText(n as Text);
        } else if (n.nodeType === 1) {
          const el = n as Element;
          if (SKIP_TAGS.has(el.tagName)) continue;
          processAttr(el, 'placeholder');
          processAttr(el, 'title');
          processAttr(el, 'aria-label');
        }
      }
    }

    if (target === null) {
      restoreAll();
    } else {
      walk(document.body);
    }

    const mo = new MutationObserver((muts) => {
      if (target === null) return; // sem trabalho extra em PT
      for (const m of muts) {
        if (m.type === 'characterData') {
          processText(m.target as Text);
        } else if (m.type === 'childList') {
          m.addedNodes.forEach((added) => {
            if (added.nodeType === 3) processText(added as Text);
            else if (added.nodeType === 1) walk(added);
          });
        } else if (m.type === 'attributes' && m.attributeName) {
          processAttr(m.target as Element, m.attributeName);
        }
      }
    });

    mo.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['placeholder', 'title', 'aria-label'],
    });

    return () => mo.disconnect();
  }, [lang]);
}
