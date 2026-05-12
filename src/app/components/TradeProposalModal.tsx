import { useState } from 'react';
import { X, ArrowRightLeft, Send, Check, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { Product } from './ProductCard';
import { useLang } from '../i18n';

interface TradeProposalModalProps {
  targetProduct: Product;
  myAds: Product[];
  onClose: () => void;
  onSend: (myItems: Product[]) => Promise<void>;
}

const MAX_DIFF = 50; // diferença máxima autorizada em troks

export function TradeProposalModal({ targetProduct, myAds, onClose, onSend }: TradeProposalModalProps) {
  const { AT } = useLang();
  const [selected, setSelected] = useState<Product[]>([]);
  const [sending, setSending] = useState(false);

  const targetValue = targetProduct.trokValue ?? 0;
  const myTotal    = selected.reduce((s, p) => s + (p.trokValue ?? 0), 0);
  const diff       = Math.abs(myTotal - targetValue);
  const hasValue   = targetValue > 0 && myTotal > 0;
  const balanced   = !hasValue || diff <= MAX_DIFF;
  const canSend    = selected.length > 0 && balanced && !sending;

  // status bar: only show when at least one item selected and both sides have value
  const showBalance = hasValue && selected.length > 0;
  const overTarget  = myTotal > targetValue;
  const barPct      = targetValue > 0 ? Math.min((myTotal / targetValue) * 100, 200) : 100;

  const toggle = (ad: Product) => {
    setSelected(prev =>
      prev.find(p => p.id === ad.id) ? prev.filter(p => p.id !== ad.id) : [...prev, ad]
    );
  };

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    try { await onSend(selected); } finally { setSending(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: '92dvh' }}
      >
        {/* Header */}
        <div className="flex-shrink-0 p-5 text-white" style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #f97316 100%)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5" /> {AT.tradeProposalTitle}
            </h2>
            <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.2)' }}>
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Produto alvo */}
          <div className="flex items-center gap-3 rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.15)' }}>
            <img src={targetProduct.image} alt="" loading="lazy" decoding="async" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-white/70">{AT.tradeProposalYouWant}</p>
              <p className="font-semibold text-sm truncate">{targetProduct.title}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-xs text-white/80">{AT.tradeProposalFrom(targetProduct.username)}</p>
                {targetValue > 0 && (
                  <span className="text-xs font-bold text-yellow-200">🪙 {targetValue.toLocaleString('pt-BR')} T</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Balanço */}
        {showBalance && (
          <div className="flex-shrink-0 px-5 pt-4 pb-1">
            <div className="rounded-2xl p-3 border" style={{
              background: balanced ? '#f0fdf4' : '#fff7ed',
              borderColor: balanced ? '#86efac' : '#fdba74',
            }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  {balanced
                    ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                    : <AlertCircle className="w-4 h-4 text-orange-500 flex-shrink-0" />}
                  <span className="text-xs font-bold" style={{ color: balanced ? '#16a34a' : '#ea580c' }}>
                    {balanced ? 'Troca equilibrada ✓' : `Diferença de ${diff.toLocaleString('pt-BR')} T — adicione mais itens`}
                  </span>
                </div>
                <span className="text-xs font-bold text-gray-500">
                  {myTotal.toLocaleString('pt-BR')} / {targetValue.toLocaleString('pt-BR')} T
                </span>
              </div>
              {/* Barra de progresso */}
              <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(barPct, 100)}%`,
                    background: balanced
                      ? (overTarget ? '#f97316' : '#22c55e')
                      : '#f97316',
                  }}
                />
              </div>
              {!balanced && (
                <p className="text-[11px] text-orange-600 mt-1.5 font-medium">
                  Selecione mais itens abaixo para atingir o valor de{' '}
                  <strong>{targetValue.toLocaleString('pt-BR')} T</strong>.
                  Diferença máxima permitida: <strong>{MAX_DIFF} T</strong>.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Lista de itens */}
        <div className="flex flex-col flex-1 overflow-hidden px-5 pt-3 pb-2 gap-3">
          <p className="text-sm font-semibold text-gray-700 flex-shrink-0">
            {selected.length === 0
              ? AT.tradeProposalChoose
              : `${selected.length} item${selected.length > 1 ? 's' : ''} selecionado${selected.length > 1 ? 's' : ''} · 🪙 ${myTotal.toLocaleString('pt-BR')} T`}
          </p>

          {myAds.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-8 text-gray-400">
              <p className="text-4xl mb-3">📦</p>
              <p className="text-sm font-medium text-gray-500">{AT.tradeProposalNoAds}</p>
              <p className="text-xs mt-1">{AT.tradeProposalNoAdsHint}</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
              {myAds.map(ad => {
                const isSelected = !!selected.find(p => p.id === ad.id);
                return (
                  <button
                    key={ad.id}
                    onClick={() => toggle(ad)}
                    className="w-full flex items-center gap-3 p-3 rounded-2xl border-2 transition-all text-left"
                    style={{
                      borderColor: isSelected ? '#7c3aed' : '#f3f4f6',
                      background:  isSelected ? '#faf5ff' : '#fff',
                    }}
                  >
                    <img src={ad.image} alt="" loading="lazy" decoding="async" className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-800 truncate">{ad.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{ad.category}</p>
                      {(ad.trokValue ?? 0) > 0 && (
                        <p className="text-xs font-bold text-purple-600 mt-0.5">
                          🪙 {ad.trokValue!.toLocaleString('pt-BR')} T
                        </p>
                      )}
                    </div>
                    {/* Checkbox */}
                    <div
                      className="w-6 h-6 rounded-md flex-shrink-0 border-2 flex items-center justify-center transition-all"
                      style={{
                        background:   isSelected ? '#7c3aed' : 'transparent',
                        borderColor:  isSelected ? '#7c3aed' : '#d1d5db',
                      }}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Preview da troca */}
          {selected.length > 0 && (
            <div className="flex-shrink-0 rounded-2xl p-3 flex items-center gap-2" style={{ background: '#f9fafb', border: '1px solid #e5e7eb' }}>
              {/* Miniaturas dos itens selecionados */}
              <div className="flex items-center gap-1 flex-shrink-0" style={{ maxWidth: 120 }}>
                {selected.slice(0, 3).map((p, i) => (
                  <img key={p.id} src={p.image} alt="" loading="lazy" decoding="async" className="rounded-lg object-cover border border-white shadow-sm"
                    style={{ width: selected.length > 1 ? 36 : 40, height: selected.length > 1 ? 36 : 40, marginLeft: i > 0 ? -8 : 0, zIndex: selected.length - i }} />
                ))}
                {selected.length > 3 && (
                  <div className="w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center text-xs font-bold text-purple-600 border border-white shadow-sm" style={{ marginLeft: -8 }}>
                    +{selected.length - 3}
                  </div>
                )}
              </div>
              <ArrowRightLeft className="w-4 h-4 text-purple-500 flex-shrink-0" />
              <img src={targetProduct.image} alt="" loading="lazy" decoding="async" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
              <div className="flex-1 min-w-0 ml-1">
                <p className="text-[11px] text-gray-500 leading-tight">
                  <span className="font-semibold text-gray-700">
                    {selected.length === 1 ? selected[0].title : `${selected.length} itens`}
                  </span>
                  {' → '}
                  <span className="font-semibold text-gray-700">{targetProduct.title}</span>
                </p>
                {hasValue && (
                  <p className="text-[11px] mt-0.5" style={{ color: balanced ? '#16a34a' : '#ea580c' }}>
                    {myTotal.toLocaleString('pt-BR')} T → {targetValue.toLocaleString('pt-BR')} T
                    {balanced ? ' ✓' : ` (Δ${diff} T)`}
                  </p>
                )}
              </div>
            </div>
          )}

          <button
            onClick={handleSend}
            disabled={!canSend}
            className="flex-shrink-0 w-full py-3.5 rounded-2xl font-bold text-white transition-all flex items-center justify-center gap-2 mb-1"
            style={{
              background: canSend ? 'linear-gradient(135deg, #7c3aed, #f97316)' : '#e5e7eb',
              color:      canSend ? '#fff' : '#9ca3af',
              boxShadow:  canSend ? '0 4px 14px rgba(124,58,237,0.3)' : 'none',
            }}
          >
            <Send className="w-4 h-4" />
            {sending
              ? AT.tradeProposalSending
              : selected.length === 0
                ? 'Selecione pelo menos 1 item'
                : !balanced
                  ? `Diferença de ${diff} T — ajuste a seleção`
                  : AT.tradeProposalSend}
          </button>
        </div>
      </div>
    </div>
  );
}
