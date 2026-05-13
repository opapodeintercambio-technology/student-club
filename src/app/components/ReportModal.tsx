import { useState } from 'react';
import { Flag, X, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { apiBase } from '../utils/apiUrl';

type AlvoTipo = 'usuario' | 'anuncio' | 'mensagem';

interface ReportModalProps {
  denunciante: string;
  alvoTipo: AlvoTipo;
  alvoId: string;
  alvoNome: string;
  onClose: () => void;
}

const MOTIVOS: { code: string; label: string }[] = [
  { code: 'spam',         label: 'Spam ou conteúdo enganoso' },
  { code: 'ofensivo',     label: 'Conteúdo ofensivo, abusivo ou de ódio' },
  { code: 'sexual',       label: 'Conteúdo sexual ou inadequado' },
  { code: 'violento',     label: 'Violência ou ameaças' },
  { code: 'fraude',       label: 'Fraude ou golpe' },
  { code: 'falsificacao', label: 'Item falsificado ou produto ilegal' },
  { code: 'menor',        label: 'Envolve menor de idade' },
  { code: 'outro',        label: 'Outro motivo' },
];

export function ReportModal({ denunciante, alvoTipo, alvoId, alvoNome, onClose }: ReportModalProps) {
  const [motivo, setMotivo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!motivo) { setError('Selecione um motivo.'); return; }
    setLoading(true);
    setError('');
    try {
      const { error: err } = await supabase.from('denuncias').insert({
        denunciante,
        alvo_tipo: alvoTipo,
        alvo_id: alvoId,
        motivo,
        descricao: descricao.trim() || null,
      });
      if (err) throw err;

      // Notifica admins por email (não bloqueia)
      const adminEmails = ['guilherme_lima_bh@yahoo.com.br', 'yuriking33@gmail.com'];
      adminEmails.forEach(adminEmail => {
        fetch(`${apiBase()}/api/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipientEmail: adminEmail,
            type: 'admin_denuncia',
            fromUsername: denunciante,
            extra: { alvoTipo, alvoId, alvoNome, motivo, descricao: descricao.trim() },
          }),
        }).catch(() => {});
      });

      setDone(true);
    } catch (e: any) {
      setError('Não foi possível enviar a denúncia. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  if (done) return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl p-7 w-full max-w-sm text-center shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
          <Check className="w-9 h-9 text-green-600" />
        </div>
        <h2 className="text-lg font-bold text-gray-800 mb-2">Denúncia enviada</h2>
        <p className="text-sm text-gray-500 mb-5">
          Obrigado por nos ajudar a manter o Papo de Alunos seguro. Nossa equipe vai analisar em até 24 horas.
        </p>
        <button onClick={onClose} className="w-full py-3 bg-purple-600 text-white rounded-2xl font-bold hover:bg-purple-700 transition-colors">
          Fechar
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-sm max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Flag className="w-5 h-5 text-red-500" />
            <h2 className="font-bold text-gray-800">Denunciar</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <p className="text-sm text-gray-500">
            Você está denunciando <span className="font-semibold text-gray-800">{alvoNome}</span>.
            Selecione o motivo:
          </p>

          <div className="space-y-2">
            {MOTIVOS.map(m => (
              <button
                key={m.code}
                onClick={() => { setMotivo(m.code); setError(''); }}
                className={`w-full text-left px-4 py-3 rounded-2xl border-2 transition-colors text-sm ${
                  motivo === m.code
                    ? 'border-red-500 bg-red-50 text-red-700 font-semibold'
                    : 'border-gray-200 text-gray-700 hover:border-gray-300'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <textarea
            placeholder="Descreva o problema (opcional)"
            value={descricao}
            onChange={e => setDescricao(e.target.value)}
            maxLength={500}
            rows={3}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl text-sm resize-none focus:border-purple-400 outline-none transition-colors"
          />
          <p className="text-right text-xs text-gray-400 -mt-3">{descricao.length}/500</p>

          {error && <p className="text-sm text-red-500 text-center">{error}</p>}

          <div className="bg-yellow-50 border border-yellow-200 rounded-2xl px-4 py-3">
            <p className="text-xs text-yellow-800">
              ⚠️ Denúncias falsas podem resultar em suspensão da sua conta.
              Vamos analisar em até 24 horas.
            </p>
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading || !motivo}
            className="w-full py-3 bg-red-500 text-white rounded-2xl font-bold hover:bg-red-600 transition-colors disabled:opacity-50"
          >
            {loading ? 'Enviando...' : 'Enviar denúncia'}
          </button>
        </div>
      </div>
    </div>
  );
}
