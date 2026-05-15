import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, Pencil, Plane, Building2, Coffee, Wallet, X, Calendar, PiggyBank, TrendingDown, TrendingUp, RefreshCw, Landmark } from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ─── Tipos ───────────────────────────────────────────────────────────────────
type Category = 'viagem' | 'chegada' | 'diario';

const CATEGORIES: { key: Category; label: string; sub: string; Icon: typeof Plane; color: string; bg: string }[] = [
  { key: 'viagem',  label: 'Viagem',         sub: 'Passagens, escola, seguro, vistos',  Icon: Plane,     color: '#1e3a8a', bg: '#eef2ff' },
  { key: 'chegada', label: 'Chegada',        sub: 'Caução, primeiros gastos, transfer', Icon: Building2, color: '#b8896a', bg: '#fdf6ee' },
  { key: 'diario',  label: 'Custos diários', sub: 'Aluguel, mercado, transporte',       Icon: Coffee,    color: '#dc2626', bg: '#fef2f2' },
];

const CURRENCIES = ['BRL','USD','EUR','GBP','CAD','AUD','NZD','AED','JPY','CHF'] as const;
type Currency = typeof CURRENCIES[number];

// Mapeamento país → moeda
const COUNTRY_TO_CURRENCY: Record<string, Currency> = {
  BR: 'BRL', US: 'USD', GB: 'GBP', IE: 'EUR', DE: 'EUR', FR: 'EUR',
  ES: 'EUR', IT: 'EUR', PT: 'EUR', NL: 'EUR', BE: 'EUR', AT: 'EUR',
  CA: 'CAD', AU: 'AUD', NZ: 'NZD', AE: 'AED', JP: 'JPY', CH: 'CHF',
  MX: 'USD', AR: 'USD', CL: 'USD', CO: 'USD', PE: 'USD',
};

function countryToCurrency(code: string): Currency {
  return COUNTRY_TO_CURRENCY[code?.toUpperCase()] ?? 'USD';
}

interface Expense {
  id: string;
  category: Category;
  description: string;
  amount: number;
  currency: Currency;
  date: string;
  recurring?: boolean;
}

interface Saving {
  id: string;
  description: string;
  amount: number;
  currency: Currency;
  date: string;
}

// ─── Persistência ─────────────────────────────────────────────────────────────
// localStorage segue como cache rápido; Supabase (usuarios.gastos_data jsonb)
// é a fonte de verdade — cross-device + cross-browser.
const KEY_EXP = (u: string) => `papo_gastos_${u}`;
const KEY_SAV = (u: string) => `papo_poupanca_${u}`;
const KEY_RES = (u: string) => `papo_reserva_${u}`;

function loadExp(u: string): Expense[] {
  try { return JSON.parse(localStorage.getItem(KEY_EXP(u)) || '[]'); } catch { return []; }
}
function saveExp(u: string, list: Expense[]) {
  localStorage.setItem(KEY_EXP(u), JSON.stringify(list));
  syncRemote(u);
}
function loadSav(u: string): Saving[] {
  try { return JSON.parse(localStorage.getItem(KEY_SAV(u)) || '[]'); } catch { return []; }
}
function saveSav(u: string, list: Saving[]) {
  localStorage.setItem(KEY_SAV(u), JSON.stringify(list));
  syncRemote(u);
}
function loadRes(u: string): Saving[] {
  try { return JSON.parse(localStorage.getItem(KEY_RES(u)) || '[]'); } catch { return []; }
}
function saveRes(u: string, list: Saving[]) {
  localStorage.setItem(KEY_RES(u), JSON.stringify(list));
  syncRemote(u);
}

// Empacota o estado completo em um único jsonb e grava no Supabase.
// Chamado em background depois de qualquer save local — fire-and-forget.
let _syncTimers: Record<string, any> = {};
function syncRemote(user: string) {
  if (!user) return;
  // Debounce: 400ms — agrega bursts de edições rápidas em uma única gravação
  clearTimeout(_syncTimers[user]);
  _syncTimers[user] = setTimeout(async () => {
    try {
      const payload = {
        expenses: loadExp(user),
        savings:  loadSav(user),
        reserva:  loadRes(user),
      };
      await supabase.from('usuarios').update({ gastos_data: payload }).eq('username', user);
    } catch { /* falha silenciosa — local já está salvo */ }
  }, 400);
}

async function fetchRemote(user: string): Promise<{ expenses: Expense[]; savings: Saving[]; reserva: Saving[] } | null> {
  try {
    const { data, error } = await supabase
      .from('usuarios')
      .select('gastos_data')
      .eq('username', user)
      .maybeSingle();
    if (error || !data) return null;
    const d = (data as any).gastos_data;
    if (!d || typeof d !== 'object') return null;
    return {
      expenses: Array.isArray(d.expenses) ? d.expenses : [],
      savings:  Array.isArray(d.savings)  ? d.savings  : [],
      reserva:  Array.isArray(d.reserva)  ? d.reserva  : [],
    };
  } catch { return null; }
}

// Sincroniza Supabase → localStorage no mount. Se remoto tem dados, sobrescreve
// local (remoto é a verdade). Se remoto está vazio mas local tem, faz upload
// (migração one-shot do localStorage histórico pro banco).
async function hydrateFromRemote(user: string): Promise<void> {
  if (!user) return;
  const remote = await fetchRemote(user);
  if (!remote) return;
  const remoteHasAny = remote.expenses.length + remote.savings.length + remote.reserva.length > 0;
  if (remoteHasAny) {
    localStorage.setItem(KEY_EXP(user), JSON.stringify(remote.expenses));
    localStorage.setItem(KEY_SAV(user), JSON.stringify(remote.savings));
    localStorage.setItem(KEY_RES(user), JSON.stringify(remote.reserva));
    window.dispatchEvent(new CustomEvent('papo-gastos-hydrated'));
  } else {
    // remoto vazio → faz upload do local atual (migração)
    syncRemote(user);
  }
}

// ─── Formatação ───────────────────────────────────────────────────────────────
function fmt(amount: number, currency: Currency): string {
  try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(amount); }
  catch { return `${currency} ${amount.toFixed(2)}`; }
}

// ─── Hook de câmbio ──────────────────────────────────────────────────────────
type Rates = Record<string, number>;
const CACHE_KEY = 'papo_exchange_rates';
const CACHE_TTL = 60 * 60 * 1000; // 1h

// base fixo em USD para cobrir qualquer par de moedas
const RATES_BASE: Currency = 'USD';

function useExchangeRates() {
  const [rates, setRates] = useState<Rates | null>(null);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const fetch_ = useCallback(async (force = false) => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached && !force) {
        const { data, ts } = JSON.parse(cached);
        if (Date.now() - ts < CACHE_TTL) {
          setRates(data); setUpdatedAt(new Date(ts)); return;
        }
      }
    } catch {}
    setLoading(true);
    try {
      const res = await fetch(`https://open.er-api.com/v6/latest/${RATES_BASE}`);
      const json = await res.json();
      if (json.rates) {
        setRates(json.rates);
        const now = Date.now();
        setUpdatedAt(new Date(now));
        localStorage.setItem(CACHE_KEY, JSON.stringify({ data: json.rates, ts: now }));
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  // Converte qualquer par de moedas usando USD como pivô
  // rates[X] = quantidade de X por 1 USD
  function convert(amount: number, from: Currency, to: Currency): number | null {
    if (!rates) return null;
    if (from === to) return amount;
    const fromRate = rates[from];
    const toRate   = rates[to];
    if (!fromRate || !toRate) return null;
    // amount_from → USD → to
    return (amount / fromRate) * toRate;
  }

  return { rates, loading, updatedAt, refresh: () => fetch_(true), convert };
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface GastosProps {
  currentUser?: string;
}

// ─── Componente principal ────────────────────────────────────────────────────
export function Gastos({ currentUser }: GastosProps) {
  const [subTab, setSubTab] = useState<'gastos' | 'poupanca' | 'reserva'>('gastos');
  const [showDest, setShowDest] = useState(false);
  // hydrateBump força os subcomponentes a relerem do localStorage após hidratação remota
  const [, setHydrateBump] = useState(0);
  const hydratedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!currentUser || hydratedFor.current === currentUser) return;
    hydratedFor.current = currentUser;
    hydrateFromRemote(currentUser).then(() => setHydrateBump(b => b + 1));
    const onHydrated = () => setHydrateBump(b => b + 1);
    window.addEventListener('papo-gastos-hydrated', onHydrated);
    return () => window.removeEventListener('papo-gastos-hydrated', onHydrated);
  }, [currentUser]);

  const homeCurrency: Currency = currentUser
    ? countryToCurrency(localStorage.getItem(`papo_origem_${currentUser}`) || 'BR')
    : 'BRL';
  const destCurrency: Currency = currentUser
    ? countryToCurrency(localStorage.getItem(`papo_destino_${currentUser}`) || 'IE')
    : 'EUR';
  const displayCurrency = showDest ? destCurrency : homeCurrency;

  const { convert, loading: ratesLoading, updatedAt, refresh } = useExchangeRates();

  return (
    <div className="max-w-[1100px] mx-auto px-3 sm:px-4 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1
            className="text-2xl font-bold text-stone-800 flex items-center gap-2"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif', letterSpacing: '0.04em' }}
          >
            <Wallet className="w-6 h-6 text-[#5a7a52]" />
            Painel Financeiro
          </h1>
          <div className="flex items-center gap-2 mt-1.5">
            {/* Toggle de moeda */}
            <button
              onClick={() => setShowDest(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all"
              style={{
                background: showDest ? destCurrency === 'EUR' ? '#1e3a8a' : '#1e40af' : '#5a7a52',
                color: '#fff',
                fontFamily: '"Source Serif 4", Georgia, serif',
                letterSpacing: '0.1em',
              }}
              title="Alternar moeda"
            >
              <span>{showDest ? destCurrency : homeCurrency}</span>
              <RefreshCw className="w-3 h-3 opacity-80" />
              <span className="opacity-70">{showDest ? homeCurrency : destCurrency}</span>
            </button>
            {ratesLoading
              ? <span className="text-[10px] text-stone-400 animate-pulse">atualizando câmbio…</span>
              : updatedAt
                ? <span className="text-[10px] text-stone-400">câmbio {updatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                : null
            }
            <button onClick={refresh} title="Forçar atualização" className="text-stone-400 hover:text-[#5a7a52]">
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setSubTab('gastos')}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold transition-all"
          style={{
            background: subTab === 'gastos' ? '#dc2626' : '#fff',
            color:      subTab === 'gastos' ? '#fff'    : '#dc2626',
            border: '1.5px solid #dc2626',
            fontFamily: '"Source Serif 4", Georgia, serif', letterSpacing: '0.08em',
          }}
        >
          <TrendingDown className="w-4 h-4" /> Gastos
        </button>
        <button
          onClick={() => setSubTab('reserva')}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold transition-all"
          style={{
            background: subTab === 'reserva' ? '#1e40af' : '#fff',
            color:      subTab === 'reserva' ? '#fff'    : '#1e40af',
            border: '1.5px solid #1e40af',
            fontFamily: '"Source Serif 4", Georgia, serif', letterSpacing: '0.08em',
          }}
        >
          <Landmark className="w-4 h-4" /> Reserva
        </button>
        <button
          onClick={() => setSubTab('poupanca')}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold transition-all"
          style={{
            background: subTab === 'poupanca' ? '#5a7a52' : '#fff',
            color:      subTab === 'poupanca' ? '#fff'    : '#5a7a52',
            border: '1.5px solid #5a7a52',
            fontFamily: '"Source Serif 4", Georgia, serif', letterSpacing: '0.08em',
          }}
        >
          <PiggyBank className="w-4 h-4" /> Poupança
        </button>
      </div>

      {subTab === 'gastos' && <GastosTab currentUser={currentUser} homeCurrency={homeCurrency} destCurrency={destCurrency} displayCurrency={displayCurrency} convert={convert} ratesLoading={ratesLoading} />}
      {subTab === 'poupanca' && <PoupancaTab currentUser={currentUser} homeCurrency={homeCurrency} destCurrency={destCurrency} displayCurrency={displayCurrency} convert={convert} ratesLoading={ratesLoading} />}
      {subTab === 'reserva' && <ReservaTab currentUser={currentUser} homeCurrency={homeCurrency} destCurrency={destCurrency} displayCurrency={displayCurrency} convert={convert} ratesLoading={ratesLoading} />}
    </div>
  );
}

// ─── Sub-aba Gastos ───────────────────────────────────────────────────────────
interface SubTabProps {
  currentUser?: string;
  homeCurrency: Currency;
  destCurrency: Currency;
  displayCurrency: Currency;
  convert: (amount: number, from: Currency, to: Currency) => number | null;
  ratesLoading: boolean;
}

function cvt(amount: number, from: Currency, to: Currency, convert: SubTabProps['convert']): number {
  if (from === to) return amount;
  return convert(amount, from, to) ?? 0;
}

function GastosTab({ currentUser, displayCurrency, convert, ratesLoading }: SubTabProps) {
  const [items, setItems] = useState<Expense[]>(() => currentUser ? loadExp(currentUser) : []);
  const [filter, setFilter] = useState<'all' | Category>('all');
  const [editing, setEditing] = useState<Expense | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    setItems(loadExp(currentUser));
  }, [currentUser]);

  function persist(next: Expense[]) {
    setItems(next);
    if (currentUser) saveExp(currentUser, next);
  }

  function addOrUpdate(e: Expense) {
    const exists = items.some(x => x.id === e.id);
    persist(exists ? items.map(x => x.id === e.id ? e : x) : [e, ...items]);
    setShowForm(false); setEditing(null);
  }

  function remove(id: string) {
    if (!confirm('Remover este gasto?')) return;
    persist(items.filter(x => x.id !== id));
  }

  function sumIn(list: Expense[], to: Currency) {
    return list.reduce((acc, it) => acc + cvt(it.amount, it.currency, to, convert), 0);
  }

  const catTotals = CATEGORIES.map(c => ({
    cat: c,
    total: sumIn(items.filter(i => i.category === c.key), displayCurrency),
    count: items.filter(i => i.category === c.key).length,
  }));

  const grandTotal = sumIn(items, displayCurrency);
  const filtered = filter === 'all' ? items : items.filter(i => i.category === filter);
  const sorted = [...filtered].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => { setEditing(null); setShowForm(true); }}
          className="px-3 py-2 rounded text-xs font-bold flex items-center gap-1.5"
          style={{ background: '#dc2626', color: '#fff', fontFamily: '"Source Serif 4", Georgia, serif', letterSpacing: '0.12em' }}>
          <Plus className="w-3.5 h-3.5" /> Adicionar gasto
        </button>
      </div>

      {/* Total geral */}
      <div className="rounded-xl p-4" style={{ background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)', color: '#fff' }}>
        <p className="text-[10px] uppercase tracking-widest opacity-90 font-semibold">Total de gastos</p>
        <p className="text-3xl font-bold mt-1" style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>
          {ratesLoading ? '…' : fmt(grandTotal, displayCurrency)}
        </p>
        <p className="text-xs opacity-75 mt-0.5">{items.length} {items.length === 1 ? 'lançamento' : 'lançamentos'}</p>
      </div>

      {/* Cards por categoria */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {catTotals.map(({ cat, total, count }) => (
          <button
            key={cat.key}
            onClick={() => setFilter(filter === cat.key ? 'all' : cat.key)}
            className="text-left rounded-xl p-3 transition-all hover:shadow-md active:scale-[0.99]"
            style={{
              background: cat.bg,
              border: `1px solid ${filter === cat.key ? '#dc2626' : '#e7e5e4'}`,
              boxShadow: filter === cat.key ? '0 0 0 1px #dc2626' : 'none',
            }}
          >
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: '#fff', border: `1px solid ${cat.color}` }}>
                <cat.Icon className="w-4.5 h-4.5" style={{ color: cat.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-stone-800" style={{ fontFamily: '"Source Serif 4", Georgia, serif', letterSpacing: '0.06em' }}>{cat.label}</p>
                <p className="text-[10px] text-stone-500 truncate">{cat.sub}</p>
              </div>
            </div>
            <div className="mt-2">
              <p className="text-base font-bold text-stone-800" style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>
                {ratesLoading ? '…' : fmt(total, displayCurrency)}
              </p>
              <p className="text-[10px] text-stone-500 mt-0.5">{count} lançamento{count === 1 ? '' : 's'}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {(['all','viagem','chegada','diario'] as const).map(k => {
          const active = filter === k;
          const label = k === 'all' ? 'Todos' : CATEGORIES.find(c => c.key === k)!.label;
          return (
            <button key={k} onClick={() => setFilter(k)}
              className="px-3 py-1.5 rounded-full transition-all text-xs"
              style={{
                background: active ? '#dc2626' : '#fff',
                color: active ? '#fff' : '#57534e',
                border: `1px solid ${active ? '#dc2626' : '#d6d3d1'}`,
                fontFamily: '"Source Serif 4", Georgia, serif', letterSpacing: '0.1em', fontWeight: 600,
              }}>
              {label}
            </button>
          );
        })}
      </div>

      {/* Lista */}
      {sorted.length === 0 ? (
        <div className="rounded-xl py-10 text-center text-stone-500" style={{ background: '#fafaf9', border: '1px dashed #fca5a5' }}>
          <TrendingDown className="w-8 h-8 mx-auto mb-2 text-red-300" />
          <p className="text-sm">Nenhum gasto registrado ainda.</p>
          <p className="text-xs mt-1">Toque em <strong>Adicionar gasto</strong> para lançar.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map(it => {
            const cat = CATEGORIES.find(c => c.key === it.category)!;
            const displayed = fmt(cvt(it.amount, it.currency, displayCurrency, convert), displayCurrency);
            return (
              <div key={it.id} className="rounded-xl p-3 flex items-center gap-3" style={{ background: '#fff', border: '1px solid #fecaca' }}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: cat.bg, border: `1px solid ${cat.color}` }}>
                  <cat.Icon className="w-4 h-4" style={{ color: cat.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-stone-800 truncate" style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>
                    {it.description || '(sem descrição)'}
                  </p>
                  <div className="flex items-center gap-2 text-[11px] text-stone-500">
                    <span>{cat.label}</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(it.date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                    {it.recurring && <span className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-600">recorrente</span>}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-red-600" style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>{displayed}</p>
                </div>
                <button onClick={() => { setEditing(it); setShowForm(true); }} className="w-8 h-8 rounded flex items-center justify-center hover:bg-stone-100" title="Editar">
                  <Pencil className="w-3.5 h-3.5 text-stone-600" />
                </button>
                <button onClick={() => remove(it.id)} className="w-8 h-8 rounded flex items-center justify-center hover:bg-red-50" title="Remover">
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <ExpenseForm initial={editing} onSave={addOrUpdate} onClose={() => { setShowForm(false); setEditing(null); }} />
      )}
      <p className="text-[11px] text-stone-400 text-center pt-2">Os gastos ficam salvos neste dispositivo.</p>
    </div>
  );
}

// ─── Sub-aba Poupança ─────────────────────────────────────────────────────────
function PoupancaTab({ currentUser, displayCurrency, convert, ratesLoading }: SubTabProps) {
  const [items, setItems] = useState<Saving[]>(() => currentUser ? loadSav(currentUser) : []);
  const [editing, setEditing] = useState<Saving | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => { if (currentUser) setItems(loadSav(currentUser)); }, [currentUser]);

  function persist(next: Saving[]) { setItems(next); if (currentUser) saveSav(currentUser, next); }
  function addOrUpdate(s: Saving) {
    const exists = items.some(x => x.id === s.id);
    persist(exists ? items.map(x => x.id === s.id ? s : x) : [s, ...items]);
    setShowForm(false); setEditing(null);
  }
  function remove(id: string) { if (!confirm('Remover este registro?')) return; persist(items.filter(x => x.id !== id)); }

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const curMonth = todayStr.slice(0, 7);
  const curYear  = todayStr.slice(0, 4);

  function sumItems(list: Saving[], to: Currency) {
    return list.reduce((acc, it) => acc + cvt(it.amount, it.currency, to, convert), 0);
  }

  const byDay   = items.filter(i => i.date === todayStr);
  const byMonth = items.filter(i => i.date.startsWith(curMonth));
  const byYear  = items.filter(i => i.date.startsWith(curYear));

  const total = sumItems(items, displayCurrency);

  const periods = [
    { label: 'Hoje',     list: byDay,   color: '#16a34a' },
    { label: 'Este mês', list: byMonth, color: '#15803d' },
    { label: 'Este ano', list: byYear,  color: '#166534' },
  ];
  const sorted = [...items].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => { setEditing(null); setShowForm(true); }}
          className="px-3 py-2 rounded text-xs font-bold flex items-center gap-1.5"
          style={{ background: '#5a7a52', color: '#fff', fontFamily: '"Source Serif 4", Georgia, serif', letterSpacing: '0.12em' }}>
          <Plus className="w-3.5 h-3.5" /> Registrar poupança
        </button>
      </div>

      <div className="rounded-xl p-4" style={{ background: 'linear-gradient(135deg, #5a7a52 0%, #3f6137 100%)', color: '#fff' }}>
        <p className="text-[10px] uppercase tracking-widest opacity-90 font-semibold">Total poupado</p>
        <p className="text-3xl font-bold mt-1" style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>
          {ratesLoading ? '…' : fmt(total, displayCurrency)}
        </p>
        <p className="text-xs opacity-60 mt-0.5">{items.length} {items.length === 1 ? 'registro' : 'registros'}</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {periods.map(p => {
          const v = sumItems(p.list, displayCurrency);
          return (
            <div key={p.label} className="rounded-xl p-3 text-center" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
              <p className="text-[10px] uppercase tracking-widest text-green-700 font-semibold">{p.label}</p>
              <p className="text-base font-bold mt-1" style={{ color: p.color, fontFamily: '"Source Serif 4", Georgia, serif' }}>
                {ratesLoading ? '…' : fmt(v, displayCurrency)}
              </p>
              <p className="text-[10px] text-green-600 mt-0.5">{p.list.length} reg.</p>
            </div>
          );
        })}
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-xl py-10 text-center text-stone-500" style={{ background: '#fafaf9', border: '1px dashed #86efac' }}>
          <PiggyBank className="w-8 h-8 mx-auto mb-2 text-green-300" />
          <p className="text-sm">Nenhuma poupança registrada ainda.</p>
          <p className="text-xs mt-1">Toque em <strong>Registrar poupança</strong> para começar.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map(it => {
            const displayed = fmt(cvt(it.amount, it.currency, displayCurrency, convert), displayCurrency);
            return (
              <div key={it.id} className="rounded-xl p-3 flex items-center gap-3" style={{ background: '#fff', border: '1px solid #bbf7d0' }}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: '#f0fdf4', border: '1px solid #86efac' }}>
                  <TrendingUp className="w-4 h-4 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-stone-800 truncate" style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>{it.description || '(sem descrição)'}</p>
                  <span className="text-[11px] text-stone-500 inline-flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(it.date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-green-700" style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>{displayed}</p>
                </div>
                <button onClick={() => { setEditing(it); setShowForm(true); }} className="w-8 h-8 rounded flex items-center justify-center hover:bg-stone-100"><Pencil className="w-3.5 h-3.5 text-stone-600" /></button>
                <button onClick={() => remove(it.id)} className="w-8 h-8 rounded flex items-center justify-center hover:bg-red-50"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
              </div>
            );
          })}
        </div>
      )}

      {showForm && <SavingForm initial={editing} onSave={addOrUpdate} onClose={() => { setShowForm(false); setEditing(null); }} label="poupança" />}
      <p className="text-[11px] text-stone-400 text-center pt-2">Registros salvos neste dispositivo.</p>
    </div>
  );
}

// ─── Sub-aba Reserva ──────────────────────────────────────────────────────────
function ReservaTab({ currentUser, displayCurrency, convert, ratesLoading }: SubTabProps) {
  const [items, setItems] = useState<Saving[]>(() => currentUser ? loadRes(currentUser) : []);
  const [editing, setEditing] = useState<Saving | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => { if (currentUser) setItems(loadRes(currentUser)); }, [currentUser]);

  function persist(next: Saving[]) { setItems(next); if (currentUser) saveRes(currentUser, next); }
  function addOrUpdate(s: Saving) {
    const exists = items.some(x => x.id === s.id);
    persist(exists ? items.map(x => x.id === s.id ? s : x) : [s, ...items]);
    setShowForm(false); setEditing(null);
  }
  function remove(id: string) { if (!confirm('Remover este registro?')) return; persist(items.filter(x => x.id !== id)); }

  // Gastos subtraídos da reserva: chegada + custos diários
  const allExp = currentUser ? loadExp(currentUser) : [];
  const chegadaExp = allExp.filter(e => e.category === 'chegada');
  const diarioExp  = allExp.filter(e => e.category === 'diario');
  const deducaoExp = [...chegadaExp, ...diarioExp];

  function sumItems(list: Saving[], to: Currency) {
    return list.reduce((acc, it) => acc + cvt(it.amount, it.currency, to, convert), 0);
  }
  function sumExp(list: Expense[], to: Currency) {
    return list.reduce((acc, it) => acc + cvt(it.amount, it.currency, to, convert), 0);
  }

  const chegadaDisplay = sumExp(chegadaExp, displayCurrency);
  const diarioDisplay  = sumExp(diarioExp, displayCurrency);
  const deducaoDisplay = chegadaDisplay + diarioDisplay;
  const reservaDisplay = sumItems(items, displayCurrency);
  const netDisplay = reservaDisplay - deducaoDisplay;

  const sorted = [...items].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => { setEditing(null); setShowForm(true); }}
          className="px-3 py-2 rounded text-xs font-bold flex items-center gap-1.5"
          style={{ background: '#1e40af', color: '#fff', fontFamily: '"Source Serif 4", Georgia, serif', letterSpacing: '0.12em' }}>
          <Plus className="w-3.5 h-3.5" /> Registrar reserva
        </button>
      </div>

      {/* Total líquido */}
      <div className="rounded-xl p-4" style={{ background: 'linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%)', color: '#fff' }}>
        <p className="text-[10px] uppercase tracking-widest opacity-90 font-semibold">Reserva disponível</p>
        <p className="text-3xl font-bold mt-1" style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>
          {ratesLoading ? '…' : fmt(netDisplay, displayCurrency)}
        </p>
        {deducaoDisplay > 0 && !ratesLoading && (
          <p className="text-xs opacity-75 mt-1">
            Reserva: {fmt(reservaDisplay, displayCurrency)} − Chegada: {fmt(chegadaDisplay, displayCurrency)} − Diário: {fmt(diarioDisplay, displayCurrency)}
          </p>
        )}
        <p className="text-xs opacity-60 mt-0.5">{items.length} reg. reserva · {chegadaExp.length} chegada · {diarioExp.length} diário</p>
      </div>

      {/* Cards resumo */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Reserva bruta', v: reservaDisplay, color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe' },
          { label: 'Chegada + Diário', v: deducaoDisplay, color: '#b8896a', bg: '#fdf6ee', border: '#e7e5e4' },
          { label: 'Disponível', v: netDisplay, color: netDisplay >= 0 ? '#1e40af' : '#dc2626', bg: netDisplay >= 0 ? '#eff6ff' : '#fef2f2', border: netDisplay >= 0 ? '#bfdbfe' : '#fecaca' },
        ].map(card => (
          <div key={card.label} className="rounded-xl p-3 text-center" style={{ background: card.bg, border: `1px solid ${card.border}` }}>
            <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: card.color }}>{card.label}</p>
            <p className="text-base font-bold mt-1" style={{ color: card.color, fontFamily: '"Source Serif 4", Georgia, serif' }}>
              {ratesLoading ? '…' : fmt(card.v, displayCurrency)}
            </p>
          </div>
        ))}
      </div>

      {/* Lista */}
      {sorted.length === 0 ? (
        <div className="rounded-xl py-10 text-center text-stone-500" style={{ background: '#fafaf9', border: '1px dashed #93c5fd' }}>
          <Landmark className="w-8 h-8 mx-auto mb-2 text-blue-300" />
          <p className="text-sm">Nenhuma reserva registrada ainda.</p>
          <p className="text-xs mt-1">Toque em <strong>Registrar reserva</strong> para lançar.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map(it => {
            const displayed = fmt(cvt(it.amount, it.currency, displayCurrency, convert), displayCurrency);
            return (
              <div key={it.id} className="rounded-xl p-3 flex items-center gap-3" style={{ background: '#fff', border: '1px solid #bfdbfe' }}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: '#eff6ff', border: '1px solid #93c5fd' }}>
                  <Landmark className="w-4 h-4 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-stone-800 truncate" style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>{it.description || '(sem descrição)'}</p>
                  <span className="text-[11px] text-stone-500 inline-flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(it.date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-blue-700" style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>{displayed}</p>
                </div>
                <button onClick={() => { setEditing(it); setShowForm(true); }} className="w-8 h-8 rounded flex items-center justify-center hover:bg-stone-100"><Pencil className="w-3.5 h-3.5 text-stone-600" /></button>
                <button onClick={() => remove(it.id)} className="w-8 h-8 rounded flex items-center justify-center hover:bg-red-50"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
              </div>
            );
          })}
        </div>
      )}

      {showForm && <SavingForm initial={editing} onSave={addOrUpdate} onClose={() => { setShowForm(false); setEditing(null); }} label="reserva" />}
      <p className="text-[11px] text-stone-400 text-center pt-2">Registros salvos neste dispositivo.</p>
    </div>
  );
}

// ─── Formulário de Gasto ──────────────────────────────────────────────────────
interface ExpenseFormProps { initial: Expense | null; onSave: (e: Expense) => void; onClose: () => void; }
function ExpenseForm({ initial, onSave, onClose }: ExpenseFormProps) {
  const [category, setCategory] = useState<Category>(initial?.category ?? 'viagem');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [amountStr, setAmountStr] = useState(initial ? String(initial.amount) : '');
  const [currency, setCurrency] = useState<Currency>(initial?.currency ?? 'BRL');
  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().slice(0, 10));
  const [recurring, setRecurring] = useState<boolean>(initial?.recurring ?? false);
  const [error, setError] = useState('');

  function submit() {
    setError('');
    const amount = Number(amountStr.replace(',', '.'));
    if (!isFinite(amount) || amount <= 0) { setError('Informe um valor maior que zero.'); return; }
    if (!description.trim()) { setError('Descreva o gasto.'); return; }
    onSave({ id: initial?.id ?? `g_${Date.now()}_${Math.random().toString(36).slice(2,7)}`, category, description: description.trim(), amount, currency, date, recurring: category === 'diario' ? recurring : undefined });
  }

  return (
    <div className="fixed inset-0 z-[9000] bg-black/60 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-stone-100 flex items-center justify-between">
          <h3 className="font-bold text-stone-800" style={{ fontFamily: '"Source Serif 4", Georgia, serif', letterSpacing: '0.06em' }}>
            {initial ? 'Editar gasto' : 'Novo gasto'}
          </h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center"><X className="w-4 h-4 text-stone-700" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-stone-500 font-semibold">Categoria</label>
            <div className="grid grid-cols-3 gap-1.5 mt-1">
              {CATEGORIES.map(c => (
                <button key={c.key} type="button" onClick={() => setCategory(c.key)}
                  className="flex flex-col items-center justify-center py-2 rounded-lg"
                  style={{ background: category === c.key ? c.color : '#fff', color: category === c.key ? '#fff' : '#57534e', border: `1px solid ${category === c.key ? c.color : '#d6d3d1'}` }}>
                  <c.Icon className="w-4 h-4 mb-0.5" />
                  <span className="text-[10px] font-bold uppercase" style={{ letterSpacing: '0.1em' }}>{c.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-stone-500 font-semibold">Descrição</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex: Passagem aérea SP-DUB" className="w-full mt-1 px-3 py-2 border border-stone-300 rounded text-sm outline-none focus:border-red-400" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="text-[10px] uppercase tracking-widest text-stone-500 font-semibold">Valor</label>
              <input type="text" inputMode="decimal" value={amountStr} onChange={e => setAmountStr(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="0,00" className="w-full mt-1 px-3 py-2 border border-stone-300 rounded text-sm outline-none focus:border-red-400" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-stone-500 font-semibold">Moeda</label>
              <select value={currency} onChange={e => setCurrency(e.target.value as Currency)} className="w-full mt-1 px-2 py-2 border border-stone-300 rounded text-sm outline-none focus:border-red-400 bg-white">
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-stone-500 font-semibold">Data</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full mt-1 px-3 py-2 border border-stone-300 rounded text-sm outline-none focus:border-red-400" />
          </div>
          {category === 'diario' && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={recurring} onChange={e => setRecurring(e.target.checked)} className="w-4 h-4 accent-red-600" />
              <span className="text-xs text-stone-700">É um gasto recorrente (semanal/mensal)</span>
            </label>
          )}
          {error && <p className="text-xs text-red-600">⚠️ {error}</p>}
          <button onClick={submit} className="w-full py-2.5 rounded text-white font-bold text-sm mt-2" style={{ background: '#dc2626', fontFamily: '"Source Serif 4", Georgia, serif', letterSpacing: '0.12em' }}>
            {initial ? 'Salvar alterações' : 'Adicionar gasto'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Formulário de Poupança / Reserva ────────────────────────────────────────
interface SavingFormProps { initial: Saving | null; onSave: (s: Saving) => void; onClose: () => void; label?: string; }
function SavingForm({ initial, onSave, onClose, label = 'poupança' }: SavingFormProps) {
  const isReserva = label === 'reserva';
  const accentColor = isReserva ? '#1e40af' : '#5a7a52';
  const [description, setDescription] = useState(initial?.description ?? '');
  const [amountStr, setAmountStr] = useState(initial ? String(initial.amount) : '');
  const [currency, setCurrency] = useState<Currency>(initial?.currency ?? 'BRL');
  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().slice(0, 10));
  const [error, setError] = useState('');

  function submit() {
    setError('');
    const amount = Number(amountStr.replace(',', '.'));
    if (!isFinite(amount) || amount <= 0) { setError('Informe um valor maior que zero.'); return; }
    if (!description.trim()) { setError(`Descreva a ${label}.`); return; }
    onSave({ id: initial?.id ?? `s_${Date.now()}_${Math.random().toString(36).slice(2,7)}`, description: description.trim(), amount, currency, date });
  }

  return (
    <div className="fixed inset-0 z-[9000] bg-black/60 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-stone-100 flex items-center justify-between">
          <h3 className="font-bold text-stone-800" style={{ fontFamily: '"Source Serif 4", Georgia, serif', letterSpacing: '0.06em' }}>
            {initial ? 'Editar registro' : `Nova ${label}`}
          </h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center"><X className="w-4 h-4 text-stone-700" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-stone-500 font-semibold">Descrição</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)}
              placeholder={isReserva ? 'Ex: Reserva inicial em euros' : 'Ex: Guardei 200 euros no mês'}
              className="w-full mt-1 px-3 py-2 border border-stone-300 rounded text-sm outline-none"
              style={{ outlineColor: accentColor }} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="text-[10px] uppercase tracking-widest text-stone-500 font-semibold">Valor</label>
              <input type="text" inputMode="decimal" value={amountStr} onChange={e => setAmountStr(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="0,00"
                className="w-full mt-1 px-3 py-2 border border-stone-300 rounded text-sm outline-none" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-stone-500 font-semibold">Moeda</label>
              <select value={currency} onChange={e => setCurrency(e.target.value as Currency)} className="w-full mt-1 px-2 py-2 border border-stone-300 rounded text-sm outline-none bg-white">
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-stone-500 font-semibold">Data</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full mt-1 px-3 py-2 border border-stone-300 rounded text-sm outline-none" />
          </div>
          {error && <p className="text-xs text-red-600">⚠️ {error}</p>}
          <button onClick={submit} className="w-full py-2.5 rounded text-white font-bold text-sm mt-2"
            style={{ background: accentColor, fontFamily: '"Source Serif 4", Georgia, serif', letterSpacing: '0.12em' }}>
            {initial ? 'Salvar alterações' : `Registrar ${label}`}
          </button>
        </div>
      </div>
    </div>
  );
}
