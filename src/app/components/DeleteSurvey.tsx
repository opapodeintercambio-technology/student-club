import { useState } from 'react';
import { X, Star } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Product } from './ProductCard';

interface DeleteSurveyProps {
  product: Product;
  currentUser: string;
  onConfirm: () => void;
  onClose: () => void;
}

const MOTIVOS = [
  { id: 'trokvibe', emoji: '🤝', label: 'Troquei pelo TrokVibe!', desc: 'Consegui fazer a troca pela plataforma' },
  { id: 'desistiu', emoji: '🙅', label: 'Desisti', desc: 'Mudei de ideia ou não quero mais trocar' },
  { id: 'outro_site', emoji: '🌐', label: 'Troquei em outro site', desc: 'A troca aconteceu fora do TrokVibe' },
];

export function DeleteSurvey({ product, currentUser, onConfirm, onClose }: DeleteSurveyProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [motivo, setMotivo] = useState('');
  const [estrelas, setEstrelas] = useState(0);
  const [hoverStar, setHoverStar] = useState(0);
  const [comentario, setComentario] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmitMotivo = () => {
    if (!motivo) return;
    setStep(2);
  };

  const handleSubmitAvaliacao = async () => {
    if (estrelas === 0) return;
    setSaving(true);
    try {
      await supabase.from('avaliacoes').insert({
        username: currentUser,
        anuncio_titulo: product.title,
        motivo,
        estrelas,
        comentario: comentario.trim() || null,
      });
    } catch (e) {
      // tabela ainda não existe, ignora e continua
    }
    onConfirm();
    setSaving(false);
  };

  const starLabels = ['', 'Péssimo', 'Ruim', 'Regular', 'Bom', 'Excelente!'];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
      <div className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-500 text-white px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">
              {step === 1 ? 'Por que está excluindo?' : 'Avalie sua experiência'}
            </h2>
            <p className="text-purple-100 text-xs mt-0.5">
              {step === 1 ? 'Passo 1 de 2 · Sua resposta nos ajuda a melhorar' : 'Passo 2 de 2 · Sua avaliação fica no site'}
            </p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6">
          {/* Preview do anúncio */}
          <div className="flex gap-3 bg-gray-50 rounded-2xl p-3 items-center mb-5">
            <img src={product.image} alt={product.title} className="w-14 h-14 object-cover rounded-xl flex-shrink-0" />
            <div className="min-w-0">
              <p className="font-bold text-gray-800 text-sm truncate">{product.title}</p>
              <p className="text-xs text-gray-400 mt-0.5">{product.category}</p>
            </div>
          </div>

          {step === 1 && (
            <>
              <div className="space-y-3 mb-6">
                {MOTIVOS.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setMotivo(m.id)}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left ${
                      motivo === m.id
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-gray-200 hover:border-purple-300'
                    }`}
                  >
                    <span className="text-3xl">{m.emoji}</span>
                    <div>
                      <p className="font-bold text-gray-800 text-sm">{m.label}</p>
                      <p className="text-xs text-gray-400">{m.desc}</p>
                    </div>
                    {motivo === m.id && (
                      <div className="ml-auto w-5 h-5 rounded-full bg-purple-600 flex items-center justify-center flex-shrink-0">
                        <div className="w-2 h-2 rounded-full bg-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
              <button
                onClick={handleSubmitMotivo}
                disabled={!motivo}
                className="w-full py-3 rounded-2xl bg-purple-600 text-white font-bold hover:bg-purple-700 transition-colors disabled:opacity-40"
              >
                Continuar →
              </button>
            </>
          )}

          {step === 2 && (
            <>
              {/* Estrelas */}
              <div className="text-center mb-5">
                <p className="text-gray-600 text-sm mb-3">Como você avalia o TrokVibe?</p>
                <div className="flex justify-center gap-2 mb-2">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      onClick={() => setEstrelas(n)}
                      onMouseEnter={() => setHoverStar(n)}
                      onMouseLeave={() => setHoverStar(0)}
                      className="transition-transform hover:scale-110"
                    >
                      <Star
                        className={`w-10 h-10 transition-colors ${
                          n <= (hoverStar || estrelas)
                            ? 'fill-yellow-400 text-yellow-400'
                            : 'text-gray-300'
                        }`}
                      />
                    </button>
                  ))}
                </div>
                {(hoverStar || estrelas) > 0 && (
                  <p className="text-sm font-semibold text-purple-600">
                    {starLabels[hoverStar || estrelas]}
                  </p>
                )}
              </div>

              {/* Comentário */}
              <div className="mb-5">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Deixe um comentário <span className="text-gray-400 font-normal">(opcional)</span>
                </label>
                <textarea
                  value={comentario}
                  onChange={e => setComentario(e.target.value)}
                  placeholder="Conte sua experiência — aparecerá nas avaliações do site..."
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl focus:border-purple-500 outline-none h-24 resize-none text-sm"
                  maxLength={300}
                />
                <p className="text-xs text-gray-400 text-right mt-1">{comentario.length}/300</p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="px-4 py-3 rounded-2xl bg-gray-100 text-gray-600 font-bold hover:bg-gray-200 transition-colors"
                >
                  ← Voltar
                </button>
                <button
                  onClick={handleSubmitAvaliacao}
                  disabled={estrelas === 0 || saving}
                  className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-500 text-white font-bold hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  {saving ? 'Salvando...' : '✓ Enviar e excluir anúncio'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
