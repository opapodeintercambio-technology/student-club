import { useState, useEffect } from 'react';
import { Check, Save, Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
// Utils foram extraidos pra myDocsUtils.ts pra evitar que importadores
// (DocsProgressBar) puxem o componente inteiro como dependencia.
import { DOC_LIST, type DocKey, type DocsMap, loadDocs, saveDocs, docsProgress } from './myDocsUtils';
import { getDataIntercambio, setDataIntercambio } from './countries';

export { DOC_LIST, type DocKey, type DocsMap, loadDocs, saveDocs, docsProgress };

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
          style={{ fontFamily: '"DM Sans", system-ui, sans-serif', letterSpacing: '0.05em' }}
        >
          Meus Documentos
        </h1>
        <p className="text-sm text-stone-500 mt-1">
          Marque cada item conforme for organizando. A barra na home avança conforme você completa o checklist.
        </p>
      </div>

      {/* Data de inicio do intercambio — fica acima da barra de progresso
          (Sua Viagem) pra deixar claro o vinculo: a data alimenta a contagem
          regressiva mostrada na home. */}
      <div className="mb-5">
        <DataIntercambioSection currentUser={currentUser} />
      </div>

      {/* Progress card */}
      <div
        className="rounded-lg p-4 mb-5"
        style={{ background: '#ffffff', border: '1px solid #d6d3d1' }}
      >
        <div className="flex items-center justify-between mb-2">
          <span
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ fontFamily: '"DM Sans", system-ui, sans-serif', color: '#5a7a52', letterSpacing: '0.18em' }}
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
              background: 'linear-gradient(90deg, #1e714a 0%, #4ade80 100%)',
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
            fontFamily: '"DM Sans", system-ui, sans-serif',
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
                <div className="text-sm font-semibold text-stone-800 truncate" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
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

// Seção de data de intercâmbio — edição da data que alimenta a contagem
// regressiva exibida na barra SUA VIAGEM da home. Movida da aba Segurança
// pra cá (Meus Documentos) pra ficar perto do contexto de viagem/checklist.
function DataIntercambioSection({ currentUser }: { currentUser: string }) {
  const [iso, setIso] = useState<string>(() => {
    const d = getDataIntercambio(currentUser);
    if (!d) return '';
    // input type=date espera YYYY-MM-DD
    return d.toISOString().slice(0, 10);
  });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const sync = () => {
      const d = getDataIntercambio(currentUser);
      setIso(d ? d.toISOString().slice(0, 10) : '');
    };
    window.addEventListener('papo-trip-updated', sync);
    return () => window.removeEventListener('papo-trip-updated', sync);
  }, [currentUser]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    const fullIso = iso ? new Date(iso + 'T00:00:00').toISOString() : null;
    setDataIntercambio(currentUser, fullIso);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: '#ffffff', border: '1px solid #d6d3d1' }}
    >
      <div className="px-4 py-3 border-b border-stone-200 flex items-center gap-2">
        <span className="text-base">✈️</span>
        <h3
          className="text-xs font-semibold uppercase tracking-wider text-stone-700"
          style={{ fontFamily: '"DM Sans", system-ui, sans-serif', letterSpacing: '0.12em' }}
        >
          Data do intercâmbio
        </h3>
      </div>
      <div className="px-4 py-4 space-y-3">
        <p className="text-xs text-stone-500">
          Defina a data que você chega no país do intercâmbio. Vai aparecer uma contagem regressiva na barra <strong>SUA VIAGEM</strong> da página inicial.
        </p>
        <input
          type="date"
          value={iso}
          onChange={(e) => setIso(e.target.value)}
          className="w-full px-4 py-2.5 border border-stone-300 rounded-lg text-sm outline-none focus:border-emerald-600 transition-colors bg-white"
          style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}
        />
        {saved ? (
          <div
            className="w-full py-2.5 rounded-lg text-white font-bold text-center text-sm flex items-center justify-center gap-2"
            style={{ background: '#16a34a' }}
          >
            <ShieldCheck className="w-4 h-4" /> Data salva!
          </div>
        ) : (
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="w-full py-2.5 rounded-lg text-white font-bold text-sm transition-colors disabled:opacity-50"
            style={{ background: '#5a7a52', fontFamily: '"DM Sans", system-ui, sans-serif', letterSpacing: '0.08em' }}
          >
            {saving ? 'Salvando…' : (iso ? 'Salvar data' : 'Limpar data')}
          </button>
        )}
      </div>
    </div>
  );
}
