import { useState, useRef, useEffect } from 'react';
import { X, Mail, Phone, ShieldCheck, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface TwoFactorModalProps {
  mode: 'email' | 'phone';
  identifier: string; // email ou telefone
  onSuccess: () => void;
  onClose: () => void;
  title?: string;
}

export function TwoFactorModal({ mode, identifier, onSuccess, onClose, title }: TwoFactorModalProps) {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    sendCode();
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const sendCode = async () => {
    setSending(true);
    setError('');
    try {
      if (mode === 'email') {
        const { error } = await supabase.auth.signInWithOtp({
          email: identifier,
          options: { shouldCreateUser: false },
        });
        if (error) throw error;
      } else {
        const phone = identifier.replace(/\D/g, '');
        const intl = phone.startsWith('55') ? '+' + phone : '+55' + phone;
        const { error } = await supabase.auth.signInWithOtp({ phone: intl });
        if (error) throw error;
      }
      setSent(true);
      setResendCooldown(60);
      inputs.current[0]?.focus();
    } catch (e: any) {
      setError('Erro ao enviar código. Tente novamente.');
    }
    setSending(false);
  };

  const handleDigit = (i: number, val: string) => {
    if (!/^\d*$/.test(val)) return;
    const next = [...code];
    next[i] = val.slice(-1);
    setCode(next);
    if (val && i < 5) inputs.current[i + 1]?.focus();
    if (next.every(d => d !== '') && val) verifyCode(next.join(''));
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[i] && i > 0) inputs.current[i - 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6).split('');
    if (digits.length === 6) {
      setCode(digits);
      verifyCode(digits.join(''));
      inputs.current[5]?.focus();
    }
  };

  const verifyCode = async (token: string) => {
    setVerifying(true);
    setError('');
    try {
      const { error } = await supabase.auth.verifyOtp(
        mode === 'email'
          ? { email: identifier, token, type: 'email' }
          : { phone: identifier.startsWith('+') ? identifier : '+55' + identifier.replace(/\D/g, ''), token, type: 'sms' }
      );
      if (error) throw error;
      onSuccess();
    } catch {
      setError('Código inválido ou expirado. Tente novamente.');
      setCode(['', '', '', '', '', '']);
      inputs.current[0]?.focus();
    }
    setVerifying(false);
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-7 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-purple-600" />
            <h3 className="font-bold text-gray-800">{title || 'Verificação em 2 etapas'}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="text-center mb-6">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3 ${mode === 'email' ? 'bg-purple-100' : 'bg-green-100'}`}>
            {mode === 'email' ? <Mail className="w-7 h-7 text-purple-600" /> : <Phone className="w-7 h-7 text-green-600" />}
          </div>
          {sending ? (
            <p className="text-sm text-gray-500">Enviando código…</p>
          ) : (
            <>
              <p className="text-sm text-gray-700 font-medium">Código enviado para</p>
              <p className="text-sm font-bold text-gray-900 mt-0.5">{identifier}</p>
              <p className="text-xs text-gray-400 mt-1">Digite o código de 6 dígitos</p>
            </>
          )}
        </div>

        {/* Inputs OTP */}
        <div className="flex gap-2 justify-center mb-5" onPaste={handlePaste}>
          {code.map((d, i) => (
            <input
              key={i}
              ref={el => { inputs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={e => handleDigit(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              disabled={verifying || sending}
              className={`w-11 h-12 text-center text-xl font-bold border-2 rounded-xl outline-none transition-all ${
                d ? 'border-purple-500 bg-purple-50' : 'border-gray-200'
              } focus:border-purple-500 disabled:opacity-40`}
            />
          ))}
        </div>

        {error && <p className="text-xs text-red-500 text-center mb-3 font-medium">⚠️ {error}</p>}

        {verifying && (
          <div className="flex items-center justify-center gap-2 text-purple-600 mb-3">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm font-medium">Verificando…</span>
          </div>
        )}

        <button
          onClick={() => sendCode()}
          disabled={resendCooldown > 0 || sending}
          className="w-full text-sm text-gray-400 hover:text-purple-600 transition-colors disabled:opacity-40 mt-1"
        >
          {resendCooldown > 0 ? `Reenviar em ${resendCooldown}s` : 'Reenviar código'}
        </button>
      </div>
    </div>
  );
}
