import { useState, useEffect } from 'react';
import { Check, Plane, BookOpen, Syringe, GraduationCap, Wallet, Home, Save, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export const DOC_LIST = [
  { key: 'passaporte',  label: 'Passaporte',                  Icon: BookOpen },
  { key: 'passagens',   label: 'Passagens aéreas',            Icon: Plane },
  { key: 'vacinacao',   label: 'Cartão de vacinação (inglês)', Icon: Syringe },
  { key: 'cartaEscola', label: 'Carta da escola',             Icon: GraduationCap },
  { key: 'extrato',     label: 'Extrato da conta',            Icon: Wallet },
  { key: 'acomodacao',  label: 'Acomodação',                  Icon: Home },
] as const;

export type DocKey = typeof DOC_LIST[number]['key'];

// Compatível com versões anteriores que gravavam um objeto (DocEntry).
// Agora o valor é só boolean true. Truthy = "documento concluído".
export type DocsMap = Partial<Record<DocKey, boolean | { type?: string }>>;

const storageKey = (user: string) => `papo_docs_${user}`;

// ───────── Local cache (zero-latency UI) ─────────
export function loadDocs(user: string): DocsMap {
  try { return JSON.parse(localStorage.getItem(storageKey(user)) || '{}'); }
  catch { return {}; }
}

export function saveDocs(user: string, docs: DocsMap) {
  localStorage.setItem(storageKey(user), JSON.stringify(docs));
  window.dispatchEvent(new CustomEvent('papo-docs-updated'));
}

// ───────── Sync remoto (Supabase) ─────────
// docs_checked é um jsonb na tabela usuarios contendo array das DocKeys marcadas.
// Cross-device + cross-browser. localStorage continua como cache rápido.
function docsToArray(docs: DocsMap): DocKey[] {
  return DOC_LIST.filter(d => !!docs[d.key]).map(d => d.key);
}

function arrayToDocs(arr: any): DocsMap {
  const out: DocsMap = {};
  if (!Array.isArray(arr)) return out;
  for (const k of arr) {
    if (DOC_LIST.some(d => d.key === k)) out[k as DocKey] = true;
  }
  return out;
}

async function fetchDocsRemote(user: string): Promise<DocsMap | null> {
  try {
    const { data, error } = await supabase
      .from('usuarios')
      .select('docs_checked')
      .eq('username', user)
      .maybeSingle();
    if (error || !data) return null;
    return arrayToDocs((data as any).docs_checked);
  } catch { return null; }
}

async function saveDocsRemote(user: string, docs: DocsMap): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('usuarios')
      .update({ docs_checked: docsToArray(docs) })
      .eq('username', user);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'erro desconhecido' };
  }
}

export function docsProgress(docs: DocsMap): { done: number; total: number; pct: number } {
  const total = DOC_LIST.length;
  const done = DOC_LIST.filter(d => !!docs[d.key]).length;
  return { done, total, pct: Math.round((done / total) * 100) };
}

interface MyDocsProps {
  currentUser: string;
}

// Compara duas DocsMap por keys truthy (ordem-independente)
function sameKeys(a: DocsMap, b: DocsMap): boolean {
  const ka = DOC_LIST.filter(d => !!a[d.key]).map(d => d.key).sort();
  const kb = DOC_LIST.filter(d => !!b[d.key]).map(d => d.key).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i]);
}

export function MyDocs({ currentUser }: MyDocsProps) {
  // `docs` é o estado da edição (pode ter mudanças não salvas)
  // `pristine` é o estado da última versão SALVA (local + remoto)
  const [docs, setDocs] = useState<DocsMap>(() => loadDocs(currentUser));
  const [pristine, setPristine] = useState<DocsMap>(() => loadDocs(currentUser));
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const local = loadDocs(currentUser);
    setDocs(local);
    setPristine(local);
  }, [currentUser]);

  // Ao montar / trocar de usuário: busca do Supabase como fonte de verdade.
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    (async () => {
      const remote = await fetchDocsRemote(currentUser);
      if (cancelled) return;
      const local = loadDocs(currentUser);
      const remoteHasAny = remote && Object.keys(remote).length > 0;
      const localHasAny = Object.keys(local).length > 0;
      if (remoteHasAny) {
        setDocs(remote!);
        setPristine(remote!);
        saveDocs(currentUser, remote!);
      } else if (localHasAny && remote !== null) {
        // Migração one-shot: sobe local pro remoto na primeira abertura
        const res = await saveDocsRemote(currentUser, local);
        if (res.ok && !cancelled) setPristine(local);
      }
    })();
    return () => { cancelled = true; };
  }, [currentUser]);

  const { done, total, pct } = docsProgress(docs);
  const dirty = !sameKeys(docs, pristine);

  function toggleDoc(key: DocKey) {
    const next: DocsMap = { ...docs };
    if (docs[key]) delete next[key];
    else next[key] = true;
    setDocs(next);
    setSaveError(null);
    setSavedFlash(false);
  }

  async function handleSave() {
    if (!currentUser || saving) return;
    setSaving(true);
    setSaveError(null);
    // Salva local primeiro pra resposta instantânea, depois remoto
    saveDocs(currentUser, docs);
    const res = await saveDocsRemote(currentUser, docs);
    setSaving(false);
    if (res.ok) {
      setPristine(docs);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2200);
    } else {
      setSaveError(res.error || 'Erro ao salvar. Tenta de novo.');
    }
  }

  return (
    <div className="max-w-[1000px] mx-auto px-3 sm:px-4 py-4">
      {/* Header */}
      <div className="mb-4">
        <h1
          className="text-2xl font-bold text-stone-800"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif', letterSpacing: '0.05em' }}
        >
          Meus Documentos
        </h1>
        <p className="text-sm text-stone-500 mt-1">
          Marque cada item conforme for organizando. A barra na home avança conforme você completa o checklist.
        </p>
      </div>

      {/* Progress card */}
      <div
        className="rounded-lg p-4 mb-5"
        style={{ background: '#ffffff', border: '1px solid #d6d3d1' }}
      >
        <div className="flex items-center justify-between mb-2">
          <span
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif', color: '#5a7a52', letterSpacing: '0.18em' }}
          >
            Progresso
          </span>
          <span className="text-sm font-bold text-stone-700">{done}/{total} · {pct}%</span>
        </div>
        <div className="w-full h-3 rounded-full bg-stone-200 overflow-hidden">
          <div
            className="h-full transition-all duration-500"
            style={{
              width: `${pct}%`,
              background: 'linear-gradient(90deg, #b8896a 0%, #5a7a52 100%)',
            }}
          />
        </div>
      </div>

      {/* Botão Salvar — aparece sempre, mas só fica habilitado se houver mudanças.
           Feedback visual de "Salvando…" / "Salvo!" / Erro inline. */}
      <div className="mb-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="w-full sm:w-auto self-end px-5 py-2.5 rounded-lg font-bold text-sm flex items-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: dirty ? '#5a7a52' : '#a8a29e',
            color: '#fff',
            fontFamily: '"Source Serif 4", Georgia, serif',
            letterSpacing: '0.12em',
          }}
        >
          {saving
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando…</>
            : savedFlash
              ? <><Check className="w-4 h-4" /> Salvo!</>
              : <><Save className="w-4 h-4" /> {dirty ? 'Salvar alterações' : 'Tudo salvo'}</>}
        </button>
        {saveError && (
          <p className="text-xs text-red-600 text-right">{saveError}</p>
        )}
      </div>

      {/* Checklist */}
      <div className="space-y-2">
        {DOC_LIST.map(({ key, label, Icon }) => {
          const has = !!docs[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggleDoc(key)}
              className="w-full text-left rounded-lg p-3 flex items-center gap-3 transition-all hover:bg-stone-50 active:scale-[0.99]"
              style={{
                background: has ? '#f7faf5' : '#ffffff',
                border: `1px solid ${has ? '#5a7a52' : '#d6d3d1'}`,
              }}
              aria-pressed={has}
            >
              {/* Checkbox visual */}
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
                style={{
                  background: has ? '#5a7a52' : '#f5f5f4',
                  border: `1.5px solid ${has ? '#5a7a52' : '#d6d3d1'}`,
                }}
              >
                {has ? <Check className="w-4 h-4 text-white" /> : <Icon className="w-4 h-4 text-stone-500" />}
              </div>

              {/* Label */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-stone-800 truncate" style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>
                  {label}
                </div>
                <div className="text-xs text-stone-400">
                  {has ? 'Concluído' : 'Toque pra marcar como pronto'}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
