// Utils LEVES de MyDocs — extraidos do componente pra que importadores
// (ex.: DocsProgressBar) nao puxem o componente inteiro + lucide-react
// + supabase deps. Permite que MyDocs.tsx vire um chunk lazy de verdade.

import { BookOpen, Plane, Syringe, GraduationCap, Wallet, Home } from 'lucide-react';

export const DOC_LIST = [
  { key: 'passaporte',  label: 'Passaporte',                  Icon: BookOpen },
  { key: 'passagens',   label: 'Passagens aéreas',            Icon: Plane },
  { key: 'vacinacao',   label: 'Cartão de vacinação (inglês)', Icon: Syringe },
  { key: 'cartaEscola', label: 'Carta da escola',             Icon: GraduationCap },
  { key: 'extrato',     label: 'Extrato da conta',            Icon: Wallet },
  { key: 'acomodacao',  label: 'Acomodação',                  Icon: Home },
] as const;

export type DocKey = typeof DOC_LIST[number]['key'];

export type DocsMap = Partial<Record<DocKey, boolean | { type?: string }>>;

const storageKey = (user: string) => `papo_docs_${user}`;

export function loadDocs(user: string): DocsMap {
  try { return JSON.parse(localStorage.getItem(storageKey(user)) || '{}'); }
  catch { return {}; }
}

export function saveDocs(user: string, docs: DocsMap) {
  localStorage.setItem(storageKey(user), JSON.stringify(docs));
  window.dispatchEvent(new CustomEvent('papo-docs-updated'));
}

export function docsProgress(docs: DocsMap): { done: number; total: number; pct: number } {
  const total = DOC_LIST.length;
  const done = DOC_LIST.filter(d => !!docs[d.key]).length;
  return { done, total, pct: Math.round((done / total) * 100) };
}
