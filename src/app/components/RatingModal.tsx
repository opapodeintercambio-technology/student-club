import { useState } from 'react';
import { Star, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useLang } from '../i18n';

interface RatingModalProps {
  avaliadorUsername: string;
  avaliadoUsername: string;
  anuncioId?: string;
  anuncioTitulo?: string;
  onClose: () => void;
  onDone: () => void;
}

export function RatingModal({ avaliadorUsername, avaliadoUsername, anuncioId, anuncioTitulo, onClose, onDone }: RatingModalProps) {
  const { AT } = useLang();
  const [estrelas, setEstrelas] = useState(0);
  const [hover, setHover] = useState(0);
  const [comentario, setComentario] = useState('');
  // Avaliação do site
  const [siteEstrelas, setSiteEstrelas] = useState(0);
  const [siteHover, setSiteHover] = useState(0);
  const [siteComentario, setSiteComentario] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (estrelas === 0) { setError(AT.ratingSelectStar); return; }
    setLoading(true);
    setError('');

    try {
      const { error: insErr } = await supabase.from('avaliacoes').insert({
        avaliador_username: avaliadorUsername,
        avaliado_username: avaliadoUsername,
        estrelas,
        comentario: comentario.trim() || null,
      });
      if (insErr) throw insErr;

      const { data: avals } = await supabase
        .from('avaliacoes')
        .select('estrelas')
        .eq('avaliado_username', avaliadoUsername);

      if (avals && avals.length > 0) {
        const media = avals.reduce((acc, a) => acc + a.estrelas, 0) / avals.length;
        await supabase
          .from('usuarios')
          .update({ score_medio: Math.round(media * 100) / 100, total_avaliacoes: avals.length })
          .eq('username', avaliadoUsername);
      }

      // Avaliação do site (opcional) — vai pra tabela avaliacoes_site
      if (siteEstrelas > 0) {
        try {
          await supabase.from('avaliacoes_site').insert({
            username: avaliadorUsername,
            estrelas: siteEstrelas,
            comentario: siteComentario.trim() || null,
          });
        } catch { /* tabela pode não existir ainda; silencia */ }
      }

      setDone(true);
    } catch (e: any) {
      setError(AT.ratingError(e?.message || ''));
    } finally {
      setLoading(false);
    }
  };

  if (done) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="glass p-8 w-full max-w-sm text-center shadow-2xl" style={{borderRadius:28}}>
        <div className="text-5xl mb-4">🌟</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">{AT.ratingDoneTitle}</h2>
        <p className="text-gray-500 text-sm mb-6" dangerouslySetInnerHTML={{ __html: AT.ratingDoneDesc(avaliadoUsername) }} />
        <button onClick={onDone} className="w-full py-3 bg-purple-600 text-white rounded-2xl font-bold hover:bg-purple-700 transition-colors">
          {AT.ratingClose}
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4 overflow-y-auto">
      <div className="glass p-6 w-full max-w-sm shadow-2xl relative my-8" style={{borderRadius:28}}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-5">
          <div className="text-3xl mb-2">⭐</div>
          <h2 className="text-lg font-bold text-gray-800">{AT.ratingTitle}</h2>
          {anuncioTitulo && <p className="text-sm text-gray-500 mt-1">"{anuncioTitulo}"</p>}
          <p className="text-sm text-purple-600 font-semibold mt-1">{avaliadoUsername}</p>
        </div>

        {/* Estrelas */}
        <div className="flex justify-center gap-2 mb-2">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              onClick={() => { setEstrelas(n); setError(''); }}
              className="transition-transform hover:scale-110"
            >
              <Star
                className={`w-10 h-10 transition-colors ${
                  n <= (hover || estrelas)
                    ? 'fill-yellow-400 text-yellow-400'
                    : 'text-gray-200 fill-gray-200'
                }`}
              />
            </button>
          ))}
        </div>
        <p className="text-center text-sm font-semibold text-purple-600 h-5 mb-4">
          {AT.ratingLabels[hover || estrelas]}
        </p>

        {/* Comentário */}
        <textarea
          placeholder={AT.ratingCommentPlaceholder}
          value={comentario}
          onChange={e => setComentario(e.target.value)}
          maxLength={200}
          rows={3}
          className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl text-sm resize-none focus:border-purple-400 outline-none transition-colors mb-1"
        />
        <p className="text-right text-xs text-gray-400 mb-4">{comentario.length}/200</p>

        {/* ───── Avaliação do Student Club ───── */}
        <div className="mt-2 mb-4 pt-4 border-t border-gray-200">
          <div className="text-center mb-3">
            <div className="text-2xl mb-1">💜</div>
            <h3 className="text-sm font-bold text-gray-800">{AT.ratingSiteTitle}</h3>
            <p className="text-xs text-gray-500">{AT.ratingSiteSubtitle}</p>
          </div>
          <div className="flex justify-center gap-2 mb-3">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                onMouseEnter={() => setSiteHover(n)}
                onMouseLeave={() => setSiteHover(0)}
                onClick={() => setSiteEstrelas(n)}
                className="transition-transform hover:scale-110"
              >
                <Star
                  className={`w-7 h-7 transition-colors ${
                    n <= (siteHover || siteEstrelas)
                      ? 'fill-purple-500 text-purple-500'
                      : 'text-gray-200 fill-gray-200'
                  }`}
                />
              </button>
            ))}
          </div>
          <textarea
            placeholder={AT.ratingSitePlaceholder}
            value={siteComentario}
            onChange={e => setSiteComentario(e.target.value)}
            maxLength={200}
            rows={2}
            className="w-full px-4 py-2 border-2 border-gray-200 rounded-2xl text-sm resize-none focus:border-purple-400 outline-none transition-colors"
          />
          <p className="text-right text-xs text-gray-400">{siteComentario.length}/200</p>
        </div>

        {error && <p className="text-sm text-red-500 text-center mb-3">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={loading || estrelas === 0}
          className="w-full py-3 bg-purple-600 text-white rounded-2xl font-bold hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? AT.ratingSending : AT.ratingSubmit}
        </button>
      </div>
    </div>
  );
}
