import { useEffect, useMemo, useState } from 'react';
import { Sparkles, Lock, Upload, CheckCircle2, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface LeadsTabProps {
  currentUser: string;
  userEmail?: string;
  userTelefone?: string;
  userNomeEmpresa?: string;
}

const SERIF: React.CSSProperties = { fontFamily: '"DM Sans", system-ui, sans-serif' };
const PRICE_BRL = 9.9;
const WEEK_MS = 7 * 24 * 3600 * 1000;
const MIN_AMOSTRAS = 10;

interface DestaqueRow {
  id?: number;
  username: string;
  image_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  slogan: string | null;
  paid: boolean;
  active_until: string;
}

export function LeadsTab({ currentUser, userEmail = '', userTelefone = '', userNomeEmpresa = '' }: LeadsTabProps) {
  const [amostrasUltima7d, setAmostrasUltima7d] = useState(0);
  const [activeDestaque, setActiveDestaque] = useState<DestaqueRow | null>(null);
  const [loading, setLoading] = useState(true);

  const [imgB64, setImgB64] = useState('');
  const [slogan, setSlogan] = useState('');
  const [contactEmail, setContactEmail] = useState(userEmail);
  const [contactPhone, setContactPhone] = useState(userTelefone);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => { setContactEmail(userEmail); }, [userEmail]);
  useEffect(() => { setContactPhone(userTelefone); }, [userTelefone]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const since = new Date(Date.now() - WEEK_MS).toISOString();
        // 1. Pega os IDs dos meus anúncios de amostra (filtro preciso)
        const { data: meusAmostras } = await supabase
          .from('anuncios')
          .select('id')
          .eq('username', currentUser)
          .eq('tipo', 'amostra');
        const amostraIds = (meusAmostras || []).map((r: any) => r.id);
        // 2. Conta transações onde sou doador, anúncio é amostra, últimos 7 dias
        const [txRes, dRes] = await Promise.all([
          amostraIds.length > 0
            ? supabase
                .from('transacoes')
                .select('id,created_at,anuncio_id')
                .eq('doador_username', currentUser)
                .in('anuncio_id', amostraIds)
                .gte('created_at', since)
            : Promise.resolve({ data: [] as any[] }),
          supabase
            .from('empresa_destaques')
            .select('*')
            .eq('username', currentUser)
            .gte('active_until', new Date().toISOString())
            .order('active_until', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        if (cancelled) return;
        setAmostrasUltima7d((txRes as any).data?.length || 0);
        setActiveDestaque((dRes.data as any) || null);
      } catch {
        if (!cancelled) { setAmostrasUltima7d(0); setActiveDestaque(null); }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [currentUser]);

  // TEMP: liberação de teste para celli & celli (remover depois)
  const TEST_OVERRIDES = new Set(['celli & celli', 'celli&celli', 'celli_celli', 'celli']);
  const isTestOverride = TEST_OVERRIDES.has(currentUser);
  const elegivel = amostrasUltima7d >= MIN_AMOSTRAS || isTestOverride;
  const destaqueAtivo = !!activeDestaque;
  const diasRestantes = destaqueAtivo
    ? Math.max(0, Math.ceil((new Date(activeDestaque!.active_until).getTime() - Date.now()) / 86400000))
    : 0;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setImgB64(String(reader.result || ''));
    reader.readAsDataURL(f);
  };

  const submit = async (paid: boolean) => {
    setErr(''); setMsg('');
    if (!imgB64) { setErr('Anexe uma imagem ou arte da sua empresa.'); return; }
    if (!contactEmail && !contactPhone) { setErr('Informe pelo menos um contato (e-mail ou telefone).'); return; }
    setSubmitting(true);
    try {
      const activeUntil = new Date(Date.now() + WEEK_MS).toISOString();
      const payload = {
        username: currentUser,
        image_url: imgB64,
        contact_email: contactEmail || null,
        contact_phone: contactPhone || null,
        slogan: slogan || userNomeEmpresa || null,
        paid,
        active_until: activeUntil,
      };
      const { error } = await supabase.from('empresa_destaques').insert(payload);
      if (error) throw error;
      setActiveDestaque({ ...payload } as DestaqueRow);
      setMsg(paid
        ? `Destaque comprado por R$ ${PRICE_BRL.toFixed(2).replace('.', ',')}. Ativo por 7 dias.`
        : 'Destaque solicitado! Ativo por 7 dias.');
      setImgB64(''); setSlogan('');
    } catch (e: any) {
      setErr(e?.message || 'Falha ao registrar destaque. Tente novamente.');
    }
    setSubmitting(false);
  };

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6" style={SERIF}>
      <div className="mb-6">
        <div className="text-[10px] mb-2" style={{ color: '#b8896a', letterSpacing: '0.35em', textTransform: 'uppercase' }}>Empresas</div>
        <h1 className="text-3xl font-normal flex items-center gap-2" style={{ color: '#1a1a1a', letterSpacing: '0.02em' }}>
          <Sparkles className="w-6 h-6" style={{ color: '#b8896a' }} />
          + Leads
        </h1>
        <div className="w-12 h-px mt-3 mb-4" style={{ background: '#b8896a' }} />
        <p className="text-sm" style={{ color: '#78716c' }}>Destaque a sua empresa nas <strong>primeiras páginas do carrossel</strong> da home — por 7 dias. Pessoas vendo o carrossel veem sua arte, slogan e contatos primeiro.</p>
      </div>

      {/* Status */}
      <div className="mb-6 p-5" style={{ background: '#ffffff', border: '1px solid #d6d3d1', borderRadius: 6 }}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="text-[10px]" style={{ color: '#b8896a', letterSpacing: '0.32em', textTransform: 'uppercase' }}>Elegibilidade</div>
            <h2 className="text-lg" style={{ color: '#1a1a1a' }}>
              {loading ? 'Verificando…' : destaqueAtivo
                ? `Destaque ativo — ${diasRestantes} dia${diasRestantes === 1 ? '' : 's'} restante${diasRestantes === 1 ? '' : 's'}`
                : elegivel ? 'Você pode solicitar destaque grátis' : 'Tenha 10 amostras concedidas'}
            </h2>
            <p className="text-xs mt-1" style={{ color: '#78716c' }}>
              {destaqueAtivo
                ? 'Sua arte está rodando nas primeiras páginas do carrossel da home.'
                : `Você precisa de ${MIN_AMOSTRAS} amostras concedidas e aceitas nos últimos 7 dias. Hoje você está em ${amostrasUltima7d} de ${MIN_AMOSTRAS}. Quando alcançar ${MIN_AMOSTRAS} amostras concedidas ou mais, o destaque é gratuito por uma semana.`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {destaqueAtivo ? (
              <span className="px-3 py-1.5 text-[11px]" style={{ background: '#5a7a52', color: '#fff', borderRadius: 2, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
                <CheckCircle2 className="w-3.5 h-3.5 inline -mt-0.5 mr-1" /> ATIVO
              </span>
            ) : elegivel ? (
              <span className="px-3 py-1.5 text-[11px]" style={{ background: '#fff', color: '#5a7a52', border: '1px solid #5a7a52', borderRadius: 2, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
                ELEGÍVEL
              </span>
            ) : (
              <span className="px-3 py-1.5 text-[11px]" style={{ background: '#fff', color: '#b8896a', border: '1px solid #b8896a', borderRadius: 2, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
                <Lock className="w-3.5 h-3.5 inline -mt-0.5 mr-1" /> LIBERAR O DESTAQUE
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Form */}
      {!destaqueAtivo && (
        <div className="p-5" style={{ background: '#ffffff', border: '1px solid #d6d3d1', borderRadius: 6 }}>
          <div className="mb-4">
            <div className="text-[10px]" style={{ color: '#b8896a', letterSpacing: '0.32em', textTransform: 'uppercase' }}>Destaque por 7 dias</div>
            <h2 className="text-lg" style={{ color: '#1a1a1a' }}>Acesso pelo plano avulso</h2>
            <p className="text-xs mt-1" style={{ color: '#78716c' }}>Se você não tem 10 amostras concedidas, você pode optar em destacar a sua empresa por uma semana no carrossel pelo plano avulso. Imagem recomendada: 800×600 ou maior, JPG/PNG.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Coluna esquerda: upload */}
            <div>
              <label className="block text-xs mb-2" style={{ color: '#78716c', letterSpacing: '0.18em', textTransform: 'uppercase' }}>Arte da empresa</label>
              {imgB64 ? (
                <div className="relative" style={{ borderRadius: 6, overflow: 'hidden' }}>
                  <img src={imgB64} alt="" className="w-full h-48 object-cover" />
                  <button onClick={() => setImgB64('')} className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">Remover</button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center h-48 cursor-pointer transition-colors hover:bg-stone-50" style={{ background: '#faf7f2', border: '1px dashed #b8896a', borderRadius: 6 }}>
                  <Upload className="w-6 h-6 mb-2" style={{ color: '#b8896a' }} />
                  <span className="text-xs" style={{ color: '#78716c' }}>Selecionar imagem</span>
                  <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
                </label>
              )}
            </div>

            {/* Coluna direita: campos */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs mb-1" style={{ color: '#78716c', letterSpacing: '0.18em', textTransform: 'uppercase' }}>Slogan / chamada</label>
                <input value={slogan} onChange={e => setSlogan(e.target.value)} placeholder={userNomeEmpresa ? `Ex: ${userNomeEmpresa} — corte + barba R$ 30` : 'Frase curta para chamar atenção'}
                  className="w-full px-3 py-2 outline-none" style={{ background: '#fff', border: '1px solid #d6d3d1', borderRadius: 2, fontFamily: 'inherit' }} />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: '#78716c', letterSpacing: '0.18em', textTransform: 'uppercase' }}>E-mail de contato</label>
                <input value={contactEmail} onChange={e => setContactEmail(e.target.value)} type="email"
                  className="w-full px-3 py-2 outline-none" style={{ background: '#fff', border: '1px solid #d6d3d1', borderRadius: 2, fontFamily: 'inherit' }} />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: '#78716c', letterSpacing: '0.18em', textTransform: 'uppercase' }}>Telefone / WhatsApp</label>
                <input value={contactPhone} onChange={e => setContactPhone(e.target.value)}
                  className="w-full px-3 py-2 outline-none" style={{ background: '#fff', border: '1px solid #d6d3d1', borderRadius: 2, fontFamily: 'inherit' }} />
              </div>
            </div>
          </div>

          {err && <p className="text-xs mt-3" style={{ color: '#dc2626' }}>⚠️ {err}</p>}
          {msg && <p className="text-xs mt-3" style={{ color: '#16a34a' }}>✓ {msg}</p>}

          <div className={`mt-5 grid gap-3 ${elegivel ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
            {elegivel && (
              <button
                type="button"
                disabled={submitting}
                onClick={() => submit(false)}
                className="py-3 px-4 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: '#5a7a52', color: '#fff', border: '1px solid #5a7a52', borderRadius: 2, fontFamily: 'inherit', letterSpacing: '0.18em', textTransform: 'uppercase', fontSize: 11, fontWeight: 500 }}
              >
                🍃 Solicitar destaque grátis (7 dias)
              </button>
            )}
            <button
              type="button"
              disabled={submitting}
              onClick={() => submit(true)}
              className="py-3 px-4 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: '#1a1a1a', color: '#fff', border: '1px solid #1a1a1a', borderRadius: 2, fontFamily: 'inherit', letterSpacing: '0.18em', textTransform: 'uppercase', fontSize: 11, fontWeight: 500 }}
            >
              💳 Pagar R$ {PRICE_BRL.toFixed(2).replace('.', ',')} (7 dias)
            </button>
          </div>
          <p className="text-[11px] mt-3 text-center" style={{ color: '#a8a29e' }}>
            <Clock className="w-3 h-3 inline -mt-0.5 mr-1" />
            Pagamento manual por enquanto — sua arte é publicada e nossa equipe entra em contato para cobrança.
          </p>
        </div>
      )}
    </div>
  );
}
