import { useState } from 'react';
import { Eye, EyeOff, Lock, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ResetPasswordScreenProps {
  onDone: () => void;
}

export function ResetPasswordScreen({ onDone }: ResetPasswordScreenProps) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const strength = (() => {
    let s = 0;
    if (password.length >= 8) s++;
    if (/[A-Z]/.test(password)) s++;
    if (/[0-9]/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password)) s++;
    return s;
  })();

  const strengthLabel = ['', 'Fraca', 'Razoável', 'Boa', 'Forte'][strength];
  const strengthColor = ['', '#ef4444', '#f97316', '#eab308', '#22c55e'][strength];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('A senha deve ter no mínimo 6 caracteres.'); return; }
    if (password !== confirm) { setError('As senhas não coincidem.'); return; }
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) { setError('Erro ao redefinir senha. O link pode ter expirado.'); return; }
    setDone(true);
  };

  const inputClass = 'w-full px-4 py-3 border-2 border-gray-200 rounded-2xl focus:border-purple-500 outline-none transition-colors text-[16px]';

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #f3e8ff 0%, #fce7f3 50%, #fff7ed 100%)' }}>
      <div className="w-full max-w-md rounded-3xl p-8 shadow-2xl"
        style={{
          background: 'rgba(255,255,255,0.88)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1.5px solid rgba(255,255,255,0.7)',
        }}>

        {done ? (
          <div className="text-center py-4">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Senha redefinida!</h2>
            <p className="text-gray-500 mb-6">Sua senha foi atualizada com sucesso. Agora você pode entrar normalmente.</p>
            <button onClick={onDone}
              className="w-full py-3 rounded-2xl font-bold text-white text-lg"
              style={{ background: 'linear-gradient(135deg,#7c3aed,#f97316)' }}>
              Ir para o login
            </button>
          </div>
        ) : (
          <>
            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3"
                style={{ background: 'linear-gradient(135deg,#7c3aed,#f97316)' }}>
                <Lock className="w-7 h-7 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800">Nova senha</h2>
              <p className="text-sm text-gray-500 mt-1">Escolha uma senha segura para sua conta</p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 rounded-2xl px-4 py-3 text-sm mb-4">{error}</div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Nova senha</label>
                <div className="relative">
                  <input type={showPwd ? 'text' : 'password'} value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres" required className={inputClass} />
                  <button type="button" onClick={() => setShowPwd(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {/* Barra de força */}
                {password.length > 0 && (
                  <div className="mt-2">
                    <div className="flex gap-1">
                      {[1,2,3,4].map(i => (
                        <div key={i} className="flex-1 h-1.5 rounded-full transition-all"
                          style={{ background: i <= strength ? strengthColor : '#e5e7eb' }} />
                      ))}
                    </div>
                    <p className="text-xs mt-1 font-medium" style={{ color: strengthColor }}>{strengthLabel}</p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Confirmar senha</label>
                <div className="relative">
                  <input type={showConfirm ? 'text' : 'password'} value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Repita a senha" required className={inputClass} />
                  <button type="button" onClick={() => setShowConfirm(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirm.length > 0 && (
                  <p className="text-xs mt-1 font-medium" style={{ color: password === confirm ? '#22c55e' : '#ef4444' }}>
                    {password === confirm ? '✓ Senhas coincidem' : '✗ Senhas não coincidem'}
                  </p>
                )}
              </div>

              <button type="submit" disabled={loading}
                className="w-full py-3.5 rounded-2xl font-bold text-white text-base disabled:opacity-60 transition-all"
                style={{ background: 'linear-gradient(135deg,#7c3aed,#f97316)', boxShadow: '0 4px 14px rgba(124,58,237,0.3)' }}>
                {loading ? 'Salvando...' : '🔐 Salvar nova senha'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
