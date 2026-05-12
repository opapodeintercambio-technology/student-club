import { ArrowRightLeft, Coins, CheckCircle, AlertTriangle, XCircle, X } from 'lucide-react';
import type { Product } from './ProductCard';

interface TradeAnalysisProps {
  myProduct: Product;
  theirProduct: Product;
  onConfirm: () => void;
  onClose: () => void;
}

function TrokBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full bg-gray-100 rounded-full h-2 mt-1">
      <div className="h-2 rounded-full bg-gradient-to-r from-purple-500 to-orange-400 transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function TradeAnalysis({ myProduct, theirProduct, onConfirm, onClose }: TradeAnalysisProps) {
  const myT = myProduct.trokValue ?? 0;
  const theirT = theirProduct.trokValue ?? 0;
  const maxT = Math.max(myT, theirT, 1);

  const diff = Math.abs(myT - theirT);
  const avg = (myT + theirT) / 2 || 1;
  const diffPct = (diff / avg) * 100;

  let fairness: 'ótima' | 'ok' | 'desequilibrada' = 'ótima';
  let FairnessIcon = CheckCircle;
  let fairnessColor = 'text-green-600';
  let fairnessBg = 'bg-green-50 border-green-200';
  let fairnessMsg = 'Troca equilibrada! Os itens têm valores similares.';

  if (diffPct > 40) {
    fairness = 'desequilibrada';
    FairnessIcon = XCircle;
    fairnessColor = 'text-red-500';
    fairnessBg = 'bg-red-50 border-red-200';
    fairnessMsg = 'Grande diferença de valor. Considere negociar ou trocar por outro item.';
  } else if (diffPct > 15) {
    fairness = 'ok';
    FairnessIcon = AlertTriangle;
    fairnessColor = 'text-yellow-600';
    fairnessBg = 'bg-yellow-50 border-yellow-200';
    fairnessMsg = 'Pequena diferença. Ainda pode ser uma troca justa dependendo do estado dos itens.';
  }

  const noValues = myT === 0 && theirT === 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-purple-800 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Coins className="w-5 h-5" />
            <h2 className="font-bold text-lg">Análise de Troca Justa</h2>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-white/70 hover:text-white" /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Items comparison */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Seu item', product: myProduct, troks: myT, side: 'left' },
              { label: 'Item deles', product: theirProduct, troks: theirT, side: 'right' },
            ].map(({ label, product, troks }) => (
              <div key={label} className="bg-gray-50 rounded-2xl p-3">
                <p className="text-xs text-gray-500 font-medium mb-2">{label}</p>
                <img src={product.image} alt={product.title} loading="lazy" decoding="async" className="w-full h-24 object-cover rounded-xl mb-2" />
                <p className="font-semibold text-sm text-gray-800 line-clamp-2 mb-2">{product.title}</p>
                <div className="flex items-center gap-1.5">
                  <Coins className="w-3.5 h-3.5 text-purple-600 flex-shrink-0" />
                  <span className="font-bold text-purple-700 text-sm">
                    {troks > 0 ? `${troks.toLocaleString('pt-BR')} T` : 'Sem valor'}
                  </span>
                </div>
                {troks > 0 && <TrokBar value={troks} max={maxT} />}
              </div>
            ))}
          </div>

          {/* Arrow */}
          <div className="flex items-center justify-center">
            <div className="bg-purple-100 rounded-full p-2">
              <ArrowRightLeft className="w-5 h-5 text-purple-600" />
            </div>
          </div>

          {/* Fairness result */}
          {noValues ? (
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 flex gap-3 items-start">
              <AlertTriangle className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-gray-700 text-sm">Valores não informados</p>
                <p className="text-xs text-gray-500 mt-0.5">Nenhum dos itens tem valor em Troks definido. Combine com o outro usuário pelo chat.</p>
              </div>
            </div>
          ) : (
            <div className={`border rounded-2xl p-4 flex gap-3 items-start ${fairnessBg}`}>
              <FairnessIcon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${fairnessColor}`} />
              <div>
                <p className={`font-bold text-sm ${fairnessColor}`}>Troca {fairness}</p>
                <p className="text-xs text-gray-600 mt-0.5">{fairnessMsg}</p>
                {myT > 0 && theirT > 0 && (
                  <p className="text-xs font-medium text-gray-500 mt-1.5">
                    Diferença: <strong>{diff.toLocaleString('pt-BR')} Troks</strong>
                    {' '}(≈ R$ {(diff * 10).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Trok legend */}
          <div className="bg-purple-50 rounded-2xl p-3 text-xs text-purple-700">
            <p className="font-bold mb-1 flex items-center gap-1"><Coins className="w-3.5 h-3.5" />Sistema Trok</p>
            <p>R$ 100,00 = 10 Troks &nbsp;·&nbsp; Moeda fictícia para trocas justas</p>
            <div className="flex gap-4 mt-1.5 text-[10px]">
              <span>🥉 Até 999 T</span>
              <span>🥈 1.000–4.999 T</span>
              <span>🥇 5.000+ T</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-3 rounded-2xl border-2 border-gray-200 text-gray-700 font-bold hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button onClick={onConfirm} className="flex-1 py-3 rounded-2xl bg-purple-600 text-white font-bold hover:bg-purple-700 transition-colors flex items-center justify-center gap-2">
              <ArrowRightLeft className="w-4 h-4" />
              Propor Troca
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
