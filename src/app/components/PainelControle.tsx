import { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { TrendingUp, Users, Coins, Package, Phone, User } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Product } from './ProductCard';

interface PainelControleProps {
  currentUser: string;
  products: Product[];
}

interface Acceptor {
  username: string;
  nome: string;
  telefone: string;
  data: string;
  anuncioTitulo: string;
  anuncioValor: number;
}

interface Viewer {
  username: string;
  nome: string;
  telefone: string;
  email: string;
  data: string;
  anuncioTitulo: string;
  anuncioTipo: 'amostra' | 'promocao';
}

type RangeKey = '7d' | '30d' | '90d' | '180d' | '365d' | 'all';

const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: '7d', label: '7 dias', days: 7 },
  { key: '30d', label: '30 dias', days: 30 },
  { key: '90d', label: '90 dias', days: 90 },
  { key: '180d', label: '6 meses', days: 180 },
  { key: '365d', label: '1 ano', days: 365 },
  { key: 'all', label: 'Total', days: null },
];

const SERIF: React.CSSProperties = { fontFamily: '"DM Sans", system-ui, sans-serif' };

export function PainelControle({ currentUser, products }: PainelControleProps) {
  const [acceptors, setAcceptors] = useState<Acceptor[]>([]);
  const [viewersAmostra, setViewersAmostra] = useState<Viewer[]>([]);
  const [viewersPromocao, setViewersPromocao] = useState<Viewer[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeKey>('30d');

  // Meus anúncios de amostra
  const myAmostras = useMemo(() => products.filter(p => p.username === currentUser && p.tipo === 'amostra'), [products, currentUser]);
  const myPromocoes = useMemo(() => products.filter(p => p.username === currentUser && p.tipo === 'promocao'), [products, currentUser]);
  const carteiraAmostras = useMemo(() => myAmostras.reduce((s, p) => s + (p.trokValue ?? 0) * (p.quantity ?? 1), 0), [myAmostras]);
  const totalAmostrasOferecidas = useMemo(() => myAmostras.reduce((s, p) => s + (p.quantity ?? 1), 0), [myAmostras]);
  const totalViewsAmostras = useMemo(() => myAmostras.reduce((s, p) => s + (p.visualizacoes ?? 0), 0), [myAmostras]);
  const totalViewsPromocoes = useMemo(() => myPromocoes.reduce((s, p) => s + (p.visualizacoes ?? 0), 0), [myPromocoes]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const ids = myAmostras.map(p => p.id);
        if (ids.length === 0) { if (!cancelled) { setAcceptors([]); setLoading(false); } return; }
        const { data: txs } = await supabase
          .from('transacoes')
          .select('anuncio_id,recebedor_username,created_at,tipo')
          .eq('doador_username', currentUser)
          .in('anuncio_id', ids)
          .order('created_at', { ascending: false });
        const usernames = Array.from(new Set((txs || []).map((t: any) => t.recebedor_username).filter(Boolean)));
        const usersMap: Record<string, { nome: string; telefone: string }> = {};
        if (usernames.length > 0) {
          const { data: users } = await supabase
            .from('usuarios')
            .select('username,nome,telefone')
            .in('username', usernames as string[]);
          (users || []).forEach((u: any) => { usersMap[u.username] = { nome: u.nome || u.username, telefone: u.telefone || '' }; });
        }
        const list: Acceptor[] = (txs || []).map((t: any) => {
          const anuncio = myAmostras.find(p => p.id === t.anuncio_id);
          return {
            username: t.recebedor_username,
            nome: usersMap[t.recebedor_username]?.nome || t.recebedor_username,
            telefone: usersMap[t.recebedor_username]?.telefone || '—',
            data: t.created_at,
            anuncioTitulo: anuncio?.title || '—',
            anuncioValor: anuncio?.trokValue ?? 0,
          };
        });
        if (!cancelled) { setAcceptors(list); setLoading(false); }
      } catch {
        if (!cancelled) { setAcceptors([]); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [currentUser, myAmostras.map(p => p.id).join(',')]);

  // Carrega quem visualizou minhas amostras + promoções (prospecção)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const amostraIds = myAmostras.map(p => p.id);
      const promoIds = myPromocoes.map(p => p.id);
      const allIds = [...amostraIds, ...promoIds];
      if (allIds.length === 0) { if (!cancelled) { setViewersAmostra([]); setViewersPromocao([]); } return; }
      try {
        const { data: views } = await supabase
          .from('visualizacoes_anuncio')
          .select('anuncio_id,viewer_username,viewed_at')
          .in('anuncio_id', allIds)
          .order('viewed_at', { ascending: false });
        const usernames = Array.from(new Set((views || []).map((v: any) => v.viewer_username).filter(Boolean)));
        const usersMap: Record<string, { nome: string; telefone: string; email: string }> = {};
        if (usernames.length > 0) {
          const { data: users } = await supabase
            .from('usuarios')
            .select('username,nome,telefone,email')
            .in('username', usernames as string[]);
          (users || []).forEach((u: any) => {
            usersMap[u.username] = { nome: u.nome || u.username, telefone: u.telefone || '—', email: u.email || '—' };
          });
        }
        const buildViewer = (v: any, tipo: 'amostra' | 'promocao'): Viewer => {
          const list = tipo === 'amostra' ? myAmostras : myPromocoes;
          const anuncio = list.find(p => p.id === v.anuncio_id);
          const u = usersMap[v.viewer_username] || { nome: v.viewer_username, telefone: '—', email: '—' };
          return { username: v.viewer_username, nome: u.nome, telefone: u.telefone, email: u.email, data: v.viewed_at, anuncioTitulo: anuncio?.title || '—', anuncioTipo: tipo };
        };
        const va: Viewer[] = (views || []).filter((v: any) => amostraIds.includes(v.anuncio_id)).map((v: any) => buildViewer(v, 'amostra'));
        const vp: Viewer[] = (views || []).filter((v: any) => promoIds.includes(v.anuncio_id)).map((v: any) => buildViewer(v, 'promocao'));
        if (!cancelled) { setViewersAmostra(va); setViewersPromocao(vp); }
      } catch {
        if (!cancelled) { setViewersAmostra([]); setViewersPromocao([]); }
      }
    })();
    return () => { cancelled = true; };
  }, [currentUser, myAmostras.map(p => p.id).join(','), myPromocoes.map(p => p.id).join(',')]);

  const filteredViewersAmostra = useMemo(() => {
    const r = RANGES.find(x => x.key === range);
    if (!r || r.days == null) return viewersAmostra;
    const cutoff = Date.now() - r.days * 86400000;
    return viewersAmostra.filter(v => new Date(v.data).getTime() >= cutoff);
  }, [viewersAmostra, range]);

  const filteredViewersPromocao = useMemo(() => {
    const r = RANGES.find(x => x.key === range);
    if (!r || r.days == null) return viewersPromocao;
    const cutoff = Date.now() - r.days * 86400000;
    return viewersPromocao.filter(v => new Date(v.data).getTime() >= cutoff);
  }, [viewersPromocao, range]);

  // Filtra por intervalo de data
  const filtered = useMemo(() => {
    const r = RANGES.find(x => x.key === range);
    if (!r || r.days == null) return acceptors;
    const cutoff = Date.now() - r.days * 86400000;
    return acceptors.filter(a => new Date(a.data).getTime() >= cutoff);
  }, [acceptors, range]);

  const totalClientes = filtered.length;
  const clientesUnicos = new Set(filtered.map(a => a.username)).size;
  const valorGastoComAmostras = filtered.reduce((s, a) => s + a.anuncioValor, 0);

  // Gera série temporal acumulada por dia para o gráfico
  const chartData = useMemo(() => {
    const r = RANGES.find(x => x.key === range);
    const days = r?.days ?? Math.max(30, Math.ceil(((Date.now() - Math.min(...acceptors.map(a => new Date(a.data).getTime()), Date.now())) / 86400000)));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const buckets: { date: string; novos: number; acumulado: number }[] = [];
    const stepDays = days > 90 ? Math.ceil(days / 30) : 1;
    let acumulado = 0;
    const sorted = [...acceptors].sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
    let cursor = 0;
    for (let i = days - 1; i >= 0; i -= stepDays) {
      const day = new Date(today);
      day.setDate(today.getDate() - i);
      const nextDay = new Date(day);
      nextDay.setDate(day.getDate() + stepDays);
      let novos = 0;
      while (cursor < sorted.length && new Date(sorted[cursor].data) < nextDay) {
        if (new Date(sorted[cursor].data) >= day) novos++;
        else { /* anterior ao intervalo, ignora */ }
        cursor++;
      }
      acumulado += novos;
      buckets.push({
        date: day.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
        novos,
        acumulado,
      });
    }
    return buckets;
  }, [acceptors, range]);

  // Projeção: assume taxa atual do range filtrado
  const projecao = useMemo(() => {
    const r = RANGES.find(x => x.key === range);
    const days = r?.days ?? 30;
    const ratePerDay = totalClientes / Math.max(days, 1);
    return [30, 60, 90].map(d => ({
      periodo: `+${d} dias`,
      atual: totalClientes,
      projetado: Math.round(totalClientes + ratePerDay * d),
    }));
  }, [totalClientes, range]);

  // Distribuição por anúncio
  const distAnuncios = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of filtered) map.set(a.anuncioTitulo, (map.get(a.anuncioTitulo) || 0) + 1);
    return Array.from(map.entries()).map(([title, count]) => ({ title: title.length > 24 ? title.slice(0, 22) + '…' : title, count })).slice(0, 8);
  }, [filtered]);

  const fmtBRL = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6" style={SERIF}>
      <div className="mb-6">
        <div className="text-[10px] mb-2" style={{ color: '#b8896a', letterSpacing: '0.35em', textTransform: 'uppercase' }}>Empresas</div>
        <h1 className="text-3xl font-normal" style={{ color: '#1a1a1a', letterSpacing: '0.02em' }}>Painel de Controle</h1>
        <div className="w-12 h-px mt-3 mb-4" style={{ background: '#b8896a' }} />
        <p className="text-sm" style={{ color: '#78716c' }}>Acompanhe o crescimento da sua carteira de clientes e o desempenho das suas amostras.</p>
      </div>

      {/* Filtro de período */}
      <div className="mb-6 flex flex-wrap gap-1.5">
        {RANGES.map(r => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className="px-3 py-1.5 transition-all"
            style={{
              background: range === r.key ? '#1a1a1a' : '#ffffff',
              color: range === r.key ? '#ffffff' : '#1a1a1a',
              border: '1px solid ' + (range === r.key ? '#1a1a1a' : '#d6d3d1'),
              borderRadius: 2,
              fontSize: 10,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              fontWeight: 500,
              fontFamily: 'inherit',
            }}
          >{r.label}</button>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KpiCard icon={Users} label="Clientes que aceitaram" value={totalClientes} sub={`${clientesUnicos} únicos`} accent="#5a7a52" />
        <KpiCard icon={Package} label="Amostras concedidas" value={totalClientes} sub={`de ${totalAmostrasOferecidas} ofertadas`} accent="#6b8e3d" />
        <KpiCard icon={Coins} label="Gasto em amostras" value={`R$ ${fmtBRL(valorGastoComAmostras)}`} sub="valor acumulado" accent="#b8896a" />
        <KpiCard icon={TrendingUp} label="Carteira de amostras" value={`R$ ${fmtBRL(carteiraAmostras)}`} sub={`${myAmostras.length} anúncio(s) ativo(s)`} accent="#c6895d" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <KpiCard icon={Users} label="Views nas amostras" value={totalViewsAmostras} sub={`${filteredViewersAmostra.length} no período · ${new Set(filteredViewersAmostra.map(v => v.username)).size} prospects únicos`} accent="#5a7a52" />
        <KpiCard icon={Users} label="Views nas promoções" value={totalViewsPromocoes} sub={`${filteredViewersPromocao.length} no período · ${new Set(filteredViewersPromocao.map(v => v.username)).size} prospects únicos`} accent="#b8896a" />
      </div>

      {/* Gráfico de crescimento */}
      <div className="mb-8 p-5" style={{ background: '#ffffff', border: '1px solid #d6d3d1', borderRadius: 6 }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-[10px]" style={{ color: '#b8896a', letterSpacing: '0.32em', textTransform: 'uppercase' }}>Crescimento</div>
            <h2 className="text-lg" style={{ color: '#1a1a1a' }}>Carteira de clientes ao longo do tempo</h2>
          </div>
        </div>
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="colorAcum" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#5a7a52" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#5a7a52" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e0" />
              <XAxis dataKey="date" stroke="#a8a29e" style={{ fontSize: 10, fontFamily: 'inherit' }} />
              <YAxis stroke="#a8a29e" style={{ fontSize: 10, fontFamily: 'inherit' }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #d6d3d1', borderRadius: 2, fontFamily: 'inherit', fontSize: 12 }} />
              <Area type="monotone" dataKey="acumulado" stroke="#5a7a52" strokeWidth={2} fill="url(#colorAcum)" name="Total de clientes" />
              <Line type="monotone" dataKey="novos" stroke="#b8896a" strokeWidth={1.5} dot={false} name="Novos no período" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Projeção */}
      <div className="mb-8 p-5" style={{ background: '#ffffff', border: '1px solid #d6d3d1', borderRadius: 6 }}>
        <div className="mb-4">
          <div className="text-[10px]" style={{ color: '#b8896a', letterSpacing: '0.32em', textTransform: 'uppercase' }}>Projeção</div>
          <h2 className="text-lg" style={{ color: '#1a1a1a' }}>Crescimento estimado mantendo o ritmo atual</h2>
          <p className="text-xs mt-1" style={{ color: '#78716c' }}>Baseado na taxa média do período selecionado. Anúncios adicionais aceleram a curva.</p>
        </div>
        <div style={{ width: '100%', height: 220 }}>
          <ResponsiveContainer>
            <BarChart data={projecao} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e0" />
              <XAxis dataKey="periodo" stroke="#a8a29e" style={{ fontSize: 10, fontFamily: 'inherit' }} />
              <YAxis stroke="#a8a29e" style={{ fontSize: 10, fontFamily: 'inherit' }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #d6d3d1', borderRadius: 2, fontFamily: 'inherit', fontSize: 12 }} />
              <Bar dataKey="atual" fill="#d6d3d1" name="Atual" />
              <Bar dataKey="projetado" fill="#b8896a" name="Projetado" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Distribuição por anúncio */}
      {distAnuncios.length > 0 && (
        <div className="mb-8 p-5" style={{ background: '#ffffff', border: '1px solid #d6d3d1', borderRadius: 6 }}>
          <div className="mb-4">
            <div className="text-[10px]" style={{ color: '#b8896a', letterSpacing: '0.32em', textTransform: 'uppercase' }}>Anúncios</div>
            <h2 className="text-lg" style={{ color: '#1a1a1a' }}>Quem trouxe mais clientes</h2>
          </div>
          <div style={{ width: '100%', height: Math.max(160, distAnuncios.length * 32 + 40) }}>
            <ResponsiveContainer>
              <BarChart data={distAnuncios} layout="vertical" margin={{ top: 5, right: 10, left: 5, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e0" />
                <XAxis type="number" stroke="#a8a29e" style={{ fontSize: 10, fontFamily: 'inherit' }} allowDecimals={false} />
                <YAxis dataKey="title" type="category" stroke="#a8a29e" style={{ fontSize: 10, fontFamily: 'inherit' }} width={140} />
                <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #d6d3d1', borderRadius: 2, fontFamily: 'inherit', fontSize: 12 }} />
                <Bar dataKey="count" fill="#5a7a52" name="Clientes" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Lista de clientes */}
      <div className="p-5" style={{ background: '#ffffff', border: '1px solid #d6d3d1', borderRadius: 6 }}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-[10px]" style={{ color: '#b8896a', letterSpacing: '0.32em', textTransform: 'uppercase' }}>Carteira de clientes</div>
            <h2 className="text-lg" style={{ color: '#1a1a1a' }}>Pessoas que aceitaram suas amostras</h2>
          </div>
          <span className="text-xs" style={{ color: '#78716c' }}>{filtered.length} registro(s)</span>
        </div>
        {loading ? (
          <p className="text-sm text-center py-8" style={{ color: '#a8a29e' }}>Carregando…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: '#a8a29e' }}>Nenhum cliente neste período ainda. Publique amostras para começar a crescer sua carteira.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #d6d3d1' }}>
                  <Th>Nome</Th>
                  <Th>Telefone</Th>
                  <Th>Amostra</Th>
                  <Th>Valor</Th>
                  <Th>Data</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a, i) => (
                  <tr key={`${a.username}-${a.data}-${i}`} style={{ borderBottom: '1px solid #f0ede7' }}>
                    <Td>
                      <span className="flex items-center gap-2"><User className="w-3.5 h-3.5" style={{ color: '#b8896a' }} />{a.nome}<span className="text-[10px]" style={{ color: '#a8a29e' }}>{a.username}</span></span>
                    </Td>
                    <Td>
                      <span className="flex items-center gap-1.5"><Phone className="w-3 h-3" style={{ color: '#b8896a' }} />{a.telefone || '—'}</span>
                    </Td>
                    <Td>{a.anuncioTitulo}</Td>
                    <Td>R$ {fmtBRL(a.anuncioValor)}</Td>
                    <Td>{new Date(a.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Prospecção — quem visualizou amostras */}
      <div className="mt-6 p-5" style={{ background: '#ffffff', border: '1px solid #d6d3d1', borderRadius: 6 }}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-[10px]" style={{ color: '#5a7a52', letterSpacing: '0.32em', textTransform: 'uppercase' }}>Prospecção · Amostras</div>
            <h2 className="text-lg" style={{ color: '#1a1a1a' }}>Quem visualizou as suas amostras</h2>
            <p className="text-xs mt-1" style={{ color: '#78716c' }}>Pessoas que abriram o anúncio mesmo sem aceitar — leads em potencial.</p>
          </div>
          <span className="text-xs" style={{ color: '#78716c' }}>{filteredViewersAmostra.length} visualização(ões)</span>
        </div>
        {filteredViewersAmostra.length === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: '#a8a29e' }}>Nenhuma visualização identificada neste período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #d6d3d1' }}>
                  <Th>Nome</Th>
                  <Th>Telefone</Th>
                  <Th>E-mail</Th>
                  <Th>Amostra</Th>
                  <Th>Visto em</Th>
                </tr>
              </thead>
              <tbody>
                {filteredViewersAmostra.map((v, i) => (
                  <tr key={`${v.username}-${v.data}-${i}`} style={{ borderBottom: '1px solid #f0ede7' }}>
                    <Td><span className="flex items-center gap-2"><User className="w-3.5 h-3.5" style={{ color: '#5a7a52' }} />{v.nome}<span className="text-[10px]" style={{ color: '#a8a29e' }}>{v.username}</span></span></Td>
                    <Td><span className="flex items-center gap-1.5"><Phone className="w-3 h-3" style={{ color: '#5a7a52' }} />{v.telefone}</span></Td>
                    <Td><span style={{ color: '#3d2f24' }}>{v.email}</span></Td>
                    <Td>{v.anuncioTitulo}</Td>
                    <Td>{new Date(v.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Prospecção — quem visualizou promoções */}
      <div className="mt-6 p-5" style={{ background: '#ffffff', border: '1px solid #d6d3d1', borderRadius: 6 }}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-[10px]" style={{ color: '#b8896a', letterSpacing: '0.32em', textTransform: 'uppercase' }}>Prospecção · Promoções</div>
            <h2 className="text-lg" style={{ color: '#1a1a1a' }}>Quem visualizou as suas promoções</h2>
            <p className="text-xs mt-1" style={{ color: '#78716c' }}>Pessoas interessadas que abriram o anúncio de promoção — bons contatos para follow-up.</p>
          </div>
          <span className="text-xs" style={{ color: '#78716c' }}>{filteredViewersPromocao.length} visualização(ões)</span>
        </div>
        {filteredViewersPromocao.length === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: '#a8a29e' }}>Nenhuma visualização identificada neste período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #d6d3d1' }}>
                  <Th>Nome</Th>
                  <Th>Telefone</Th>
                  <Th>E-mail</Th>
                  <Th>Promoção</Th>
                  <Th>Visto em</Th>
                </tr>
              </thead>
              <tbody>
                {filteredViewersPromocao.map((v, i) => (
                  <tr key={`${v.username}-${v.data}-${i}`} style={{ borderBottom: '1px solid #f0ede7' }}>
                    <Td><span className="flex items-center gap-2"><User className="w-3.5 h-3.5" style={{ color: '#b8896a' }} />{v.nome}<span className="text-[10px]" style={{ color: '#a8a29e' }}>{v.username}</span></span></Td>
                    <Td><span className="flex items-center gap-1.5"><Phone className="w-3 h-3" style={{ color: '#b8896a' }} />{v.telefone}</span></Td>
                    <Td><span style={{ color: '#3d2f24' }}>{v.email}</span></Td>
                    <Td>{v.anuncioTitulo}</Td>
                    <Td>{new Date(v.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub, accent }: { icon: React.ElementType; label: string; value: string | number; sub: string; accent: string }) {
  return (
    <div className="p-4" style={{ background: '#ffffff', border: '1px solid #d6d3d1', borderRadius: 6 }}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4" style={{ color: accent }} />
        <span className="text-[10px]" style={{ color: accent, letterSpacing: '0.28em', textTransform: 'uppercase', fontWeight: 500 }}>{label}</span>
      </div>
      <div className="text-2xl font-normal mb-1" style={{ color: '#1a1a1a' }}>{value}</div>
      <div className="text-[11px]" style={{ color: '#78716c' }}>{sub}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left py-2 px-2 text-[10px]" style={{ color: '#78716c', letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 500 }}>{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="py-2.5 px-2" style={{ color: '#1a1a1a' }}>{children}</td>;
}
