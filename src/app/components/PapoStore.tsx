import { useState, useEffect } from 'react';
import { ShoppingBag, X, Check, Star, ChevronLeft } from 'lucide-react';
import { incrementComprasStore } from './studentProfile';

interface ColorOption { name: string; hex: string }

interface Product {
  id: number;
  name: string;
  price: number;
  image: string;
  emoji: string;   // fallback caso imagem falhe
  bg: string;
  category: string;
  description: string;
  sizes?: string[];
  colors?: ColorOption[];
}

// ── Produtos oficiais (mockups em /public/papo-store/) ─────────────────
const PRODUCTS: Product[] = [
  // Vestuário
  {
    id: 1, name: 'Camiseta Student Club', price: 89.90,
    image: '/papo-store/camisa.png', emoji: '👕',
    bg: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)',
    category: 'Vestuário',
    description: 'Camiseta oficial Student Club em algodão 100%, estampa frontal DREAM. PLAN. DO. — modelo unissex.',
    sizes: ['PP', 'P', 'M', 'G', 'GG', 'XGG'],
  },
  // Escritório / Papelaria
  {
    id: 2, name: 'Caneca Cerâmica 350ml', price: 49.90,
    image: '/papo-store/caneca.png', emoji: '☕',
    bg: 'linear-gradient(135deg, #1e3a8a 0%, #b8896a 100%)',
    category: 'Papelaria',
    description: 'Caneca de cerâmica com estampa frontal DREAM. PLAN. DO. — apta para microondas e lava-louças.',
    colors: [
      { name: 'Branca',  hex: '#f8fafc' },
      { name: 'Preta',   hex: '#0f172a' },
      { name: 'Azul',    hex: '#1e3a8a' },
      { name: 'Verde',   hex: '#5a7a52' },
    ],
  },
  {
    id: 3, name: 'Agenda Student Club', price: 49.90,
    image: '/papo-store/agenda.png', emoji: '📓',
    bg: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)',
    category: 'Papelaria',
    description: 'Agenda capa dura, 192 páginas, com elástico de fechamento e marcador de página. Planeje sua jornada.',
    colors: [
      { name: 'Marrom', hex: '#b8896a' },
      { name: 'Verde',  hex: '#5a7a52' },
      { name: 'Azul',   hex: '#1e3a8a' },
      { name: 'Preta',  hex: '#0f172a' },
    ],
  },
  {
    id: 4, name: 'Caneta Student Club', price: 19.90,
    image: '/papo-store/caneta.png', emoji: '🖊️',
    bg: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)',
    category: 'Papelaria',
    description: 'Caneta esferográfica de metal escovado com a marca Papo. Tinta azul, escrita suave — perfeita para o diário de bordo.',
    colors: [
      { name: 'Prata',   hex: '#cbd5e1' },
      { name: 'Preta',   hex: '#0f172a' },
      { name: 'Azul',    hex: '#1e3a8a' },
      { name: 'Dourada', hex: '#d4a574' },
    ],
  },
  {
    id: 5, name: 'Mouse Pad DREAM PLAN DO', price: 39.90,
    image: '/papo-store/mouse-pad.png', emoji: '🖱️',
    bg: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)',
    category: 'Papelaria',
    description: 'Mouse pad de borracha antiderrapante com superfície macia. 22 × 18 cm, estampa Student Club.',
    colors: [
      { name: 'Azul',  hex: '#1e3a8a' },
      { name: 'Preto', hex: '#0f172a' },
    ],
  },
  // Acessórios / Viagem
  {
    id: 6, name: 'Garrafa Térmica Inox', price: 79.90,
    image: '/papo-store/garrafa.png', emoji: '🍾',
    bg: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)',
    category: 'Acessórios',
    description: 'Garrafa térmica de aço inox, parede dupla. Mantém quente por 12h e gelada por 24h. Logo gravado a laser.',
    colors: [
      { name: 'Inox',   hex: '#cbd5e1' },
      { name: 'Preta',  hex: '#0f172a' },
      { name: 'Branca', hex: '#f8fafc' },
      { name: 'Verde',  hex: '#5a7a52' },
    ],
  },
  {
    id: 7, name: 'Sacola Tote Papo', price: 39.90,
    image: '/papo-store/sacola.png', emoji: '🛍️',
    bg: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)',
    category: 'Acessórios',
    description: 'Sacola tote de algodão cru com a marca Student Club. Resistente, lavável, vai com você pra qualquer canto.',
    colors: [
      { name: 'Cru',   hex: '#e7d9c2' },
      { name: 'Preta', hex: '#0f172a' },
      { name: 'Azul',  hex: '#1e3a8a' },
    ],
  },
  {
    id: 8, name: 'Capinha de Celular Papo', price: 49.90,
    image: '/papo-store/capinha.png', emoji: '📱',
    bg: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)',
    category: 'Acessórios',
    description: 'Capa de celular Student Club com proteção antichoque. Disponível sob encomenda para os modelos mais populares.',
    colors: [
      { name: 'Preta',         hex: '#0f172a' },
      { name: 'Transparente',  hex: '#e2e8f0' },
      { name: 'Azul',          hex: '#1e3a8a' },
    ],
  },
  {
    id: 9, name: 'Adesivo Papo (5 un.)', price: 14.90,
    image: '/papo-store/adesivo.png', emoji: '🌟',
    bg: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)',
    category: 'Acessórios',
    description: 'Cartela com 5 adesivos de vinil resistentes a água. Cole no notebook, mala, caderno ou onde a vontade mandar.',
  },
];

interface FakeReview {
  id: number;
  name: string;
  initials: string;
  color: string;
  stars: number;
  comment: string;
  destino: string;
}

const FAKE_REVIEWS: FakeReview[] = [
  { id: 1, name: 'Mariana S.',  initials: 'MS', color: '#7c3aed', stars: 5, comment: 'Comprei pra levar pro intercâmbio em Dublin, qualidade ótima! Embalagem caprichada também.', destino: 'Dublin, IE' },
  { id: 2, name: 'Pedro L.',    initials: 'PL', color: '#dc2626', stars: 5, comment: 'Chegou em 3 dias, super rápido. Estampa firme, lavei várias vezes e não desbotou.', destino: 'Toronto, CA' },
  { id: 3, name: 'Ana C.',      initials: 'AC', color: '#16a34a', stars: 4, comment: 'Amei o design, todo mundo da minha escola perguntou onde comprei. Recomendo!', destino: 'Londres, GB' },
  { id: 4, name: 'Lucas R.',    initials: 'LR', color: '#0ea5e9', stars: 5, comment: 'Material excelente, vai durar minha jornada toda. Já tô pensando em comprar outro.', destino: 'Sydney, AU' },
  { id: 5, name: 'Beatriz F.',  initials: 'BF', color: '#f97316', stars: 5, comment: 'Meu consultor me indicou e eu adorei. Frase motivadora me dá força todo dia.', destino: 'Auckland, NZ' },
  { id: 6, name: 'Rafael M.',   initials: 'RM', color: '#0f172a', stars: 4, comment: 'Bom custo-benefício. Cheguei em Boston e usei já no primeiro dia.', destino: 'Boston, US' },
  { id: 7, name: 'Júlia T.',    initials: 'JT', color: '#ec4899', stars: 5, comment: 'Lindo! Comprei o conjunto inteiro pra viagem, vale muito a pena.', destino: 'Vancouver, CA' },
];

interface PapoStoreProps {
  currentUser?: string;
}

type Step = 'details' | 'checkout' | 'success';
type PayMethod = 'cartao' | 'pix' | 'boleto';

interface CheckoutForm {
  nome: string; email: string; telefone: string;
  cep: string; rua: string; numero: string; complemento: string;
  bairro: string; cidade: string; estado: string;
  pay: PayMethod;
}

const EMPTY_FORM: CheckoutForm = {
  nome: '', email: '', telefone: '',
  cep: '', rua: '', numero: '', complemento: '',
  bairro: '', cidade: '', estado: '',
  pay: 'cartao',
};

export function PapoStore({ currentUser }: PapoStoreProps) {
  const [selected, setSelected] = useState<Product | null>(null);
  const [step, setStep] = useState<Step>('details');
  const [size, setSize] = useState<string | null>(null);
  const [color, setColor] = useState<ColorOption | null>(null);
  const [qty, setQty] = useState(1);
  const [form, setForm] = useState<CheckoutForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [optError, setOptError] = useState('');
  const [bought, setBought] = useState<Set<number>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(`papo_store_bought_${currentUser}`) || '[]')); }
    catch { return new Set(); }
  });

  useEffect(() => {
    setBought(() => {
      try { return new Set(JSON.parse(localStorage.getItem(`papo_store_bought_${currentUser}`) || '[]')); }
      catch { return new Set(); }
    });
  }, [currentUser]);

  function openProduct(p: Product) {
    setSelected(p);
    setStep('details');
    setSize(null);
    setColor(null);
    setQty(1);
    setForm(EMPTY_FORM);
    setOptError('');
    setFormError('');
  }

  function closeModal() {
    setSelected(null);
    setStep('details');
  }

  // Telefone da equipe Papo (mesmo do primeiro slide do carrossel).
  const WHATSAPP_NUMBER = '5547996382238';

  function goToCheckout() {
    if (!selected) return;
    if (selected.sizes && !size)    { setOptError('Escolha um tamanho.'); return; }
    if (selected.colors && !color)  { setOptError('Escolha uma cor.'); return; }
    setOptError('');

    // Em vez de abrir o checkout interno, manda direto pro WhatsApp da Papo
    // com uma mensagem pré-formatada do pedido.
    const linhas = [
      'Oi! Quero comprar um item da Papo Store 🛍️',
      '',
      `*${selected.name}*`,
      size  ? `Tamanho: ${size}` : '',
      color ? `Cor: ${color.name}` : '',
      `Quantidade: ${qty}`,
      `Total: R$ ${(selected.price * qty).toFixed(2).replace('.', ',')}`,
      '',
      currentUser ? `(Aluno: @${currentUser})` : '',
    ].filter(Boolean).join('\n');
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(linhas)}`;
    window.open(url, '_blank', 'noopener,noreferrer');

    // Registra a "intenção de compra" localmente pra desbloquear contador
    if (currentUser) {
      const next = new Set(bought).add(selected.id);
      setBought(next);
      try { localStorage.setItem(`papo_store_bought_${currentUser}`, JSON.stringify([...next])); } catch {}
      try { incrementComprasStore(currentUser, 1); } catch {}
    }
  }

  function finalizar() {
    if (!currentUser) { setFormError('Faça login para finalizar a compra.'); return; }
    if (!selected) return;
    const req: (keyof CheckoutForm)[] = ['nome', 'email', 'telefone', 'cep', 'rua', 'numero', 'bairro', 'cidade', 'estado'];
    for (const k of req) {
      if (!String(form[k]).trim()) { setFormError('Preencha todos os campos obrigatórios.'); return; }
    }
    setFormError('');
    const next = new Set(bought).add(selected.id);
    setBought(next);
    localStorage.setItem(`papo_store_bought_${currentUser}`, JSON.stringify([...next]));
    incrementComprasStore(currentUser, 1);
    setStep('success');
  }

  const reviewsFor = (productId: number) => {
    const start = productId % FAKE_REVIEWS.length;
    return [FAKE_REVIEWS[start], FAKE_REVIEWS[(start + 1) % FAKE_REVIEWS.length]];
  };

  const total = selected ? selected.price * qty : 0;

  return (
    <section data-papo-store className="py-8 px-3 sm:px-4">
      <div className="max-w-[1400px] mx-auto">
        <div className="flex items-end justify-between mb-5">
          <div>
            <h2
              className="text-2xl sm:text-3xl font-bold text-stone-800 flex items-center gap-2"
              style={{ fontFamily: '"DM Sans", system-ui, sans-serif', letterSpacing: '0.04em' }}
            >
              <ShoppingBag className="w-6 h-6 text-[#5a7a52]" />
              Papo Store
            </h2>
            <p className="text-sm text-stone-500 mt-1">
              Produtos oficiais <span className="font-semibold text-stone-700">DREAM. PLAN. DO.</span> para quem está prestes a viver um intercâmbio.
            </p>
          </div>
          <span
            className="hidden sm:inline-block text-[10px] uppercase tracking-widest px-3 py-1 rounded-full"
            style={{ background: '#5a7a52', color: '#ffffff', letterSpacing: '0.18em', fontFamily: '"DM Sans", system-ui, sans-serif' }}
          >
            Frete grátis acima de R$ 199
          </span>
        </div>

        {/* Grid de produtos */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {PRODUCTS.map(p => {
            return (
              <button
                key={p.id}
                onClick={() => openProduct(p)}
                className="text-left rounded-xl overflow-hidden bg-white shadow-sm hover:shadow-md transition-all active:scale-[0.98] border border-stone-200"
              >
                {/* Foto clicável (toda a card é botão) */}
                <div
                  className="relative h-36 sm:h-44 flex items-center justify-center overflow-hidden"
                  style={{ background: p.bg }}
                >
                  <span className="absolute inset-0 flex items-center justify-center text-5xl sm:text-6xl drop-shadow-lg pointer-events-none">
                    {p.emoji}
                  </span>
                  <img
                    src={p.image}
                    alt={p.name}
                    loading="lazy"
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                </div>
                {/* Info */}
                <div className="p-3">
                  <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">{p.category}</p>
                  <h3 className="text-sm font-semibold text-stone-800 line-clamp-2 mt-0.5" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
                    {p.name}
                  </h3>
                  <p className="mt-2 font-bold text-[#5a7a52]">
                    R$ {p.price.toFixed(2).replace('.', ',')}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Modal de detalhe / checkout / sucesso */}
        {selected && (
          <div
            className="fixed inset-0 z-[9000] bg-black/70 flex items-center justify-center p-3"
            onClick={closeModal}
          >
            <div
              className="bg-white rounded-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              {/* Hero — sempre visível */}
              <div
                className="relative h-64 sm:h-80 flex items-center justify-center overflow-hidden"
                style={{ background: selected.bg }}
              >
                <span className="absolute inset-0 flex items-center justify-center text-8xl sm:text-9xl drop-shadow-2xl pointer-events-none">
                  {selected.emoji}
                </span>
                <img
                  src={selected.image}
                  alt={selected.name}
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <button
                  onClick={closeModal}
                  className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/20 backdrop-blur text-white flex items-center justify-center hover:bg-white/30"
                  aria-label="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
                {step !== 'details' && (
                  <button
                    onClick={() => { setStep('details'); setFormError(''); }}
                    className="absolute top-3 left-3 inline-flex items-center gap-1 px-3 h-9 rounded-full bg-white/20 backdrop-blur text-white hover:bg-white/30 text-xs font-bold"
                  >
                    <ChevronLeft className="w-4 h-4" /> voltar
                  </button>
                )}
              </div>

              {/* ─── STEP: DETAILS ─── */}
              {step === 'details' && (
                <div className="p-5 space-y-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-stone-400 font-semibold">{selected.category}</p>
                    <h3 className="text-xl font-bold text-stone-800 mt-0.5" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
                      {selected.name}
                    </h3>
                    <p className="text-2xl font-extrabold text-[#5a7a52] mt-2">
                      R$ {selected.price.toFixed(2).replace('.', ',')}
                    </p>
                  </div>

                  <p className="text-sm text-stone-600 leading-relaxed">{selected.description}</p>

                  {/* Tamanhos */}
                  {selected.sizes && (
                    <div>
                      <p className="text-xs uppercase tracking-wider text-stone-500 font-semibold mb-2">
                        Tamanho {size && <span className="text-[#5a7a52] normal-case font-bold">· {size}</span>}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {selected.sizes.map(sz => {
                          const on = size === sz;
                          return (
                            <button
                              key={sz}
                              onClick={() => { setSize(sz); setOptError(''); }}
                              className="min-w-[44px] h-10 px-4 rounded-full font-bold text-sm transition-all active:scale-95"
                              style={{
                                background: on ? '#5a7a52' : '#fff',
                                color: on ? '#fff' : '#44403c',
                                border: `1.5px solid ${on ? '#5a7a52' : '#d6d3d1'}`,
                                fontFamily: '"DM Sans", system-ui, sans-serif',
                                letterSpacing: '0.08em',
                              }}
                            >
                              {sz}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Cores */}
                  {selected.colors && (
                    <div>
                      <p className="text-xs uppercase tracking-wider text-stone-500 font-semibold mb-2">
                        Cor {color && <span className="text-[#5a7a52] normal-case font-bold">· {color.name}</span>}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {selected.colors.map(c => {
                          const on = color?.name === c.name;
                          return (
                            <button
                              key={c.name}
                              onClick={() => { setColor(c); setOptError(''); }}
                              title={c.name}
                              className="flex flex-col items-center gap-1"
                            >
                              <span
                                className="w-9 h-9 rounded-full transition-all"
                                style={{
                                  background: c.hex,
                                  border: `2px solid ${on ? '#5a7a52' : '#e7e5e4'}`,
                                  boxShadow: on ? '0 0 0 2px #fff inset, 0 0 0 4px #5a7a52' : 'inset 0 0 0 1px rgba(0,0,0,0.06)',
                                }}
                              />
                              <span className={`text-[10px] ${on ? 'font-bold text-stone-800' : 'text-stone-500'}`}>
                                {c.name}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Quantidade */}
                  <div>
                    <p className="text-xs uppercase tracking-wider text-stone-500 font-semibold mb-2">Quantidade</p>
                    <div className="inline-flex items-center rounded-lg border border-stone-300 overflow-hidden">
                      <button
                        onClick={() => setQty(q => Math.max(1, q - 1))}
                        className="w-10 h-10 text-stone-700 hover:bg-stone-100 font-bold"
                      >−</button>
                      <span className="w-12 text-center font-bold text-stone-800">{qty}</span>
                      <button
                        onClick={() => setQty(q => Math.min(99, q + 1))}
                        className="w-10 h-10 text-stone-700 hover:bg-stone-100 font-bold"
                      >+</button>
                    </div>
                  </div>

                  {optError && (
                    <p className="text-xs text-red-600 font-semibold">⚠️ {optError}</p>
                  )}

                  {/* Comprar → vai pro checkout */}
                  <button
                    onClick={goToCheckout}
                    className="w-full py-3 rounded-xl text-white font-bold text-sm transition-all active:scale-95"
                    style={{
                      background: '#5a7a52',
                      fontFamily: '"DM Sans", system-ui, sans-serif',
                      letterSpacing: '0.12em',
                    }}
                  >
                    Comprar — R$ {total.toFixed(2).replace('.', ',')}
                  </button>

                  {/* Reviews */}
                  <div className="pt-3 border-t border-stone-100">
                    <h4 className="text-xs uppercase tracking-wider text-stone-400 font-semibold mb-3">
                      Alunos que compraram
                    </h4>
                    <div className="space-y-3">
                      {reviewsFor(selected.id).map(r => (
                        <div key={r.id} className="flex gap-3">
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                            style={{ background: r.color }}
                          >
                            {r.initials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-stone-800">{r.name}</span>
                              <span className="text-[10px] text-stone-400">· {r.destino}</span>
                            </div>
                            <div className="flex gap-0.5 my-0.5">
                              {[1,2,3,4,5].map(n => (
                                <Star key={n} className={`w-3 h-3 ${n <= r.stars ? 'fill-yellow-400 text-yellow-400' : 'text-stone-200'}`} />
                              ))}
                            </div>
                            <p className="text-xs text-stone-600 leading-relaxed">"{r.comment}"</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ─── STEP: CHECKOUT ─── */}
              {step === 'checkout' && (
                <div className="p-5 space-y-4">
                  <h3
                    className="text-lg font-bold text-stone-800"
                    style={{ fontFamily: '"DM Sans", system-ui, sans-serif', letterSpacing: '0.04em' }}
                  >
                    Finalizar compra
                  </h3>

                  {/* Resumo */}
                  <div className="rounded-xl bg-stone-50 border border-stone-200 p-3 flex items-center gap-3">
                    <div
                      className="w-14 h-14 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden"
                      style={{ background: selected.bg }}
                    >
                      <span className="absolute text-3xl pointer-events-none">{selected.emoji}</span>
                      <img
                        src={selected.image}
                        alt=""
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-stone-800 truncate">{selected.name}</p>
                      <p className="text-[11px] text-stone-500">
                        {size && <>Tam. <span className="font-bold">{size}</span></>}
                        {size && color && ' · '}
                        {color && <>Cor <span className="font-bold">{color.name}</span></>}
                        {(size || color) && ' · '}
                        Qtd <span className="font-bold">{qty}</span>
                      </p>
                    </div>
                    <p className="text-base font-extrabold text-[#5a7a52]">
                      R$ {total.toFixed(2).replace('.', ',')}
                    </p>
                  </div>

                  {/* Dados pessoais */}
                  <div className="space-y-3">
                    <p className="text-xs uppercase tracking-wider text-stone-500 font-semibold">Dados pessoais</p>
                    <CheckoutInput label="Nome completo *" value={form.nome} onChange={v => setForm({ ...form, nome: v })} />
                    <div className="grid grid-cols-2 gap-2">
                      <CheckoutInput label="E-mail *"   value={form.email}    onChange={v => setForm({ ...form, email: v })}    type="email" />
                      <CheckoutInput label="Telefone *" value={form.telefone} onChange={v => setForm({ ...form, telefone: v })} />
                    </div>
                  </div>

                  {/* Endereço */}
                  <div className="space-y-3">
                    <p className="text-xs uppercase tracking-wider text-stone-500 font-semibold">Endereço de entrega</p>
                    <div className="grid grid-cols-3 gap-2">
                      <CheckoutInput label="CEP *"    value={form.cep}    onChange={v => setForm({ ...form, cep: v })} />
                      <div className="col-span-2">
                        <CheckoutInput label="Rua *" value={form.rua} onChange={v => setForm({ ...form, rua: v })} />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <CheckoutInput label="Número *"     value={form.numero}      onChange={v => setForm({ ...form, numero: v })} />
                      <div className="col-span-2">
                        <CheckoutInput label="Complemento" value={form.complemento} onChange={v => setForm({ ...form, complemento: v })} />
                      </div>
                    </div>
                    <CheckoutInput label="Bairro *" value={form.bairro} onChange={v => setForm({ ...form, bairro: v })} />
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <CheckoutInput label="Cidade *" value={form.cidade} onChange={v => setForm({ ...form, cidade: v })} />
                      </div>
                      <CheckoutInput label="Estado *" value={form.estado} onChange={v => setForm({ ...form, estado: v })} />
                    </div>
                  </div>

                  {/* Pagamento */}
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wider text-stone-500 font-semibold">Forma de pagamento</p>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { key: 'cartao', label: 'Cartão' },
                        { key: 'pix',    label: 'Pix' },
                        { key: 'boleto', label: 'Boleto' },
                      ] as { key: PayMethod; label: string }[]).map(p => {
                        const on = form.pay === p.key;
                        return (
                          <button
                            key={p.key}
                            onClick={() => setForm({ ...form, pay: p.key })}
                            className="py-2 rounded-lg text-sm font-bold transition-all"
                            style={{
                              background: on ? '#5a7a52' : '#fff',
                              color: on ? '#fff' : '#44403c',
                              border: `1.5px solid ${on ? '#5a7a52' : '#d6d3d1'}`,
                              fontFamily: '"DM Sans", system-ui, sans-serif',
                              letterSpacing: '0.06em',
                            }}
                          >
                            {p.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {formError && (
                    <p className="text-xs text-red-600 font-semibold">⚠️ {formError}</p>
                  )}

                  <button
                    onClick={finalizar}
                    className="w-full py-3 rounded-xl text-white font-bold text-sm transition-all active:scale-95"
                    style={{
                      background: '#5a7a52',
                      fontFamily: '"DM Sans", system-ui, sans-serif',
                      letterSpacing: '0.12em',
                    }}
                  >
                    Finalizar pedido — R$ {total.toFixed(2).replace('.', ',')}
                  </button>

                  <p className="text-[11px] text-stone-400 text-center">
                    Pagamento será integrado em breve. Por ora o pedido fica registrado em Minha Conta.
                  </p>
                </div>
              )}

              {/* ─── STEP: SUCCESS ─── */}
              {step === 'success' && (
                <div className="p-6 text-center space-y-4">
                  <div className="w-16 h-16 mx-auto rounded-full bg-[#5a7a52] flex items-center justify-center">
                    <Check className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-stone-800" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
                    Pedido recebido!
                  </h3>
                  <p className="text-sm text-stone-600">
                    Obrigado, <span className="font-bold">{form.nome.split(' ')[0]}</span>! Seu pedido foi registrado e aparece em Minha Conta.
                    <br />Em breve você recebe os detalhes em <span className="font-bold">{form.email}</span>.
                  </p>
                  <button
                    onClick={closeModal}
                    className="w-full py-3 rounded-xl text-white font-bold text-sm"
                    style={{
                      background: '#5a7a52',
                      fontFamily: '"DM Sans", system-ui, sans-serif',
                      letterSpacing: '0.12em',
                    }}
                  >
                    Fechar
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

interface CheckoutInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}
function CheckoutInput({ label, value, onChange, type = 'text' }: CheckoutInputProps) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-widest text-stone-500 font-semibold">{label}</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full mt-1 px-3 py-2 border border-stone-300 rounded text-sm outline-none focus:border-[#5a7a52]"
      />
    </label>
  );
}
