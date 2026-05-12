import { useState } from 'react';
import { X, SlidersHorizontal, RotateCcw } from 'lucide-react';
import { useLang } from '../i18n';

export interface Filters {
  ordenar: 'recente' | 'antigo' | 'trok_maior' | 'trok_menor';
  trokMin: string;
  trokMax: string;
  querTrocarPor: string;
  cidade: string;
  raioKm: number;
  genero: 'Todos' | 'Masculino' | 'Feminino' | 'Unissex';
  tipo: 'todos' | 'troca' | 'doacao' | 'pedido_doacao' | 'amostra' | 'promocao' | 'pedido_amostra';
  categoria: string;
}

export const FILTERS_DEFAULT: Filters = {
  ordenar: 'recente',
  trokMin: '',
  trokMax: '',
  querTrocarPor: '',
  cidade: '',
  raioKm: 100,
  genero: 'Todos',
  tipo: 'todos',
  categoria: 'Todos',
};

const CATEGORY_TREE: { label: string; children?: string[] }[] = [
  { label: 'Todos' },
  { label: 'Eletrônicos' },
  { label: 'Games' },
  { label: 'Computadores' },
  { label: 'Celulares' },
  { label: 'Áudio' },
  { label: 'Roupas' },
  { label: 'Calçados' },
  { label: 'Acessórios' },
  { label: 'Bolsas & Mochilas' },
  { label: 'Relógios' },
  { label: 'Esportes' },
  { label: 'Livros' },
  { label: 'Casa & Decoração' },
  { label: 'Beleza' },
  { label: 'Infantil' },
  { label: 'Automóveis', children: ['Moto', 'Carro', 'Caminhão'] },
  { label: 'Animais', children: ['Cachorro', 'Gato'] },
  { label: 'Serviços' },
  { label: 'Outros' },
];

interface FiltersPanelProps {
  filters: Filters;
  onApply: (f: Filters) => void;
  onClose: () => void;
  userCidade?: string;
  isPJ?: boolean;
}

export function FiltersPanel({ filters, onApply, onClose, userCidade, isPJ }: FiltersPanelProps) {
  const { AT } = useLang();
  const [local, setLocal] = useState<Filters>({ ...filters });

  const set = (key: keyof Filters, value: any) => setLocal(prev => ({ ...prev, [key]: value }));

  const hasFilters = (f: Filters) =>
    f.ordenar !== 'recente' || f.trokMin || f.trokMax || f.querTrocarPor || f.cidade || f.genero !== 'Todos' || f.tipo !== 'todos' || (f.categoria && f.categoria !== 'Todos');

  // Categorias PJ: simplificadas para Todos / Produto / Serviço + filtros de segmento
  const PJ_CATEGORIES = ['Todos', 'Produto', 'Serviço', 'Produtos do meu segmento', 'Serviços do meu segmento'];

  const handleReset = () => setLocal({ ...FILTERS_DEFAULT });

  const handleApply = () => { onApply(local); onClose(); };

  const inputClass = 'w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:border-purple-500 outline-none text-sm transition-colors';
  const chipBase = 'px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-all cursor-pointer';
  const chipOn = 'bg-purple-600 text-white border-purple-600';
  const chipOff = 'bg-white text-gray-600 border-gray-200 hover:border-purple-300';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 sm:bg-black sm:bg-opacity-50">
      <div className="glass w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl shadow-2xl">

        {/* Header */}
        <div className="sticky top-0 px-5 py-4 flex items-center justify-between rounded-t-3xl z-10" style={{backdropFilter:"blur(20px)",background:"rgba(255,255,255,0.88)",borderBottom:"1px solid rgba(139,92,246,0.10)"}}>
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-purple-600" />
            <h2 className="text-lg font-bold text-gray-800">{AT.filterTitle}</h2>
            {hasFilters(local) && (
              <span className="bg-purple-100 text-purple-700 text-xs font-bold px-2 py-0.5 rounded-full">{AT.filterActive}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleReset} className="flex items-center gap-1 text-sm text-gray-400 hover:text-red-500 transition-colors">
              <RotateCcw className="w-3.5 h-3.5" /> {AT.filterClear}
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-6">

          {/* Categorias */}
          <div>
            <p className="text-sm font-bold text-gray-700 mb-3">{AT.filterCategory}</p>
            <div className="flex flex-wrap gap-2">
              {isPJ ? (
                PJ_CATEGORIES.map(label => (
                  <button key={label}
                    onClick={() => set('categoria', label)}
                    className={`${chipBase} ${local.categoria === label ? chipOn : chipOff}`}>
                    {label}
                  </button>
                ))
              ) : (
                CATEGORY_TREE.map(({ label, children }) => (
                  <div key={label} className="contents">
                    <button
                      onClick={() => set('categoria', label)}
                      className={`${chipBase} ${local.categoria === label ? chipOn : chipOff}`}
                    >
                      {label}
                    </button>
                    {children && local.categoria === label && children.map(child => (
                      <button key={child}
                        onClick={() => set('categoria', child)}
                        className={`${chipBase} ${local.categoria === child ? chipOn : chipOff} opacity-80 text-[11px]`}
                      >
                        ↳ {child}
                      </button>
                    ))}
                    {children && children.map(child => (
                      local.categoria !== label && (
                        <button key={child}
                          onClick={() => set('categoria', child)}
                          className={`${chipBase} ${local.categoria === child ? chipOn : chipOff}`}
                        >
                          {child}
                        </button>
                      )
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Tipo de anúncio */}
          <div>
            <p className="text-sm font-bold text-gray-700 mb-3">{AT.filterAdType}</p>
            <div className="flex gap-2 flex-wrap">
              {(isPJ
                ? ([
                    ['todos', 'Todos'],
                    ['amostra', '🍃 Amostras'],
                    ['promocao', '🏷️ Promoções'],
                    ['pedido_amostra', '🙋 Pedidos de amostra'],
                  ] as const)
                : ([
                    ['todos', AT.filterAdTypeAll],
                    ['troca', AT.filterAdTypeTrade],
                    ['doacao', AT.filterAdTypeDonation],
                    ['pedido_doacao', '🙏 Pedidos'],
                  ] as const)
              ).map(([val, label]) => (
                <button key={val} onClick={() => set('tipo', val as any)}
                  className={`${chipBase} ${local.tipo === val ? chipOn : chipOff}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Ordenar */}
          <div>
            <p className="text-sm font-bold text-gray-700 mb-3">{AT.filterSortBy}</p>
            <div className="grid grid-cols-2 gap-2">
              {((isPJ
                ? [['recente', AT.filterSortRecent], ['antigo', AT.filterSortOld]]
                : [
                    ['recente', AT.filterSortRecent],
                    ['antigo', AT.filterSortOld],
                    ['trok_maior', AT.filterSortTrokHigh],
                    ['trok_menor', AT.filterSortTrokLow],
                  ]
              ) as [Filters['ordenar'], string][]).map(([val, label]) => (
                <button key={val} onClick={() => set('ordenar', val)}
                  className={`${chipBase} ${local.ordenar === val ? chipOn : chipOff} text-left px-4 py-2`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Valor Trok */}
          {!isPJ && (
          <div>
            <p className="text-sm font-bold text-gray-700 mb-3">{AT.filterTrokValue}</p>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">{AT.filterTrokMin}</label>
                <input type="number" min="0" placeholder="0 T"
                  value={local.trokMin} onChange={e => set('trokMin', e.target.value)}
                  className={inputClass} />
              </div>
              <div className="pt-4 text-gray-400 font-bold">—</div>
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">{AT.filterTrokMax}</label>
                <input type="number" min="0" placeholder="∞ T"
                  value={local.trokMax} onChange={e => set('trokMax', e.target.value)}
                  className={inputClass} />
              </div>
            </div>
            <div className="flex gap-2 mt-2 flex-wrap">
              {[['Até 50T', '', '50'], ['50–200T', '50', '200'], ['200–500T', '200', '500'], ['500T+', '500', '']].map(([label, min, max]) => (
                <button key={label} onClick={() => { set('trokMin', min); set('trokMax', max); }}
                  className={`${chipBase} ${local.trokMin === min && local.trokMax === max ? chipOn : chipOff}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          )}

          {/* Aceita em troca */}
          {!isPJ && (
          <div>
            <p className="text-sm font-bold text-gray-700 mb-3">{AT.filterWantsExchange}</p>
            <input type="text" placeholder={AT.filterWantsExchangePlaceholder}
              value={local.querTrocarPor} onChange={e => set('querTrocarPor', e.target.value)}
              className={inputClass} />
            <div className="flex gap-2 mt-2 flex-wrap">
              {['iPhone', 'PlayStation', 'Notebook', 'Carro', 'Moto', 'Bicicleta'].map(tag => (
                <button key={tag} onClick={() => set('querTrocarPor', local.querTrocarPor === tag ? '' : tag)}
                  className={`${chipBase} ${local.querTrocarPor === tag ? chipOn : chipOff}`}>
                  {tag}
                </button>
              ))}
            </div>
          </div>
          )}

          {/* Gênero — não aplicável a PJ */}
          {!isPJ && (
          <div>
            <p className="text-sm font-bold text-gray-700 mb-3">{AT.filterGender}</p>
            <div className="flex gap-2 flex-wrap">
              {(['Todos', 'Masculino', 'Feminino', 'Unissex'] as const).map(g => (
                <button key={g} onClick={() => set('genero', g)}
                  className={`${chipBase} ${local.genero === g ? chipOn : chipOff}`}>
                  {g === 'Todos' ? AT.filterGenderAll : g === 'Masculino' ? AT.filterGenderMale : g === 'Feminino' ? AT.filterGenderFemale : AT.filterGenderUnisex}
                </button>
              ))}
            </div>
          </div>
          )}

          {/* Região */}
          <div>
            <p className="text-sm font-bold text-gray-700 mb-3">{AT.filterRegion}</p>
            <input type="text" placeholder={AT.filterRegionPlaceholder}
              value={local.cidade} onChange={e => set('cidade', e.target.value)}
              className={inputClass} />
            {userCidade && (
              <button onClick={() => set('cidade', userCidade)}
                className="mt-2 text-xs text-purple-600 font-semibold hover:underline">
                {AT.filterUseMyCity(userCidade)}
              </button>
            )}
            {local.cidade && (
              <div className="mt-3">
                <p className="text-xs text-gray-500 mb-2">{AT.filterRadius(local.raioKm)}</p>
                <input type="range" min={10} max={500} step={10} value={local.raioKm}
                  onChange={e => set('raioKm', Number(e.target.value))}
                  className="w-full accent-purple-600" />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>10 km</span><span>250 km</span><span>500 km</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 px-5 py-4" style={{backdropFilter:"blur(20px)",background:"rgba(255,255,255,0.88)",borderTop:"1px solid rgba(139,92,246,0.10)"}}>
          <button onClick={handleApply}
            className="w-full bg-purple-600 text-white py-3.5 rounded-2xl font-bold text-base hover:bg-purple-700 transition-colors">
            {AT.filterApply}
          </button>
        </div>
      </div>
    </div>
  );
}
