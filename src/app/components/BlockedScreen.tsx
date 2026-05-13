import { useState } from 'react';
import { ShieldAlert, Mail, CheckCircle } from 'lucide-react';
import { useLang } from '../i18n';

interface BlockedScreenProps {
  username: string;
  motivo?: string | null;
  userEmail?: string;
}

const VIOLATION_LABELS: Record<string, { pt: string; en: string; es: string }> = {
  armas:          { pt: 'Anúncio de armas ou explosivos',              en: 'Weapons or explosives listing',          es: 'Anuncio de armas o explosivos' },
  drogas:         { pt: 'Anúncio de substâncias ilícitas',             en: 'Illegal substances listing',             es: 'Anuncio de sustancias ilegales' },
  prostituicao:   { pt: 'Oferta de serviços sexuais',                  en: 'Sexual services offer',                  es: 'Oferta de servicios sexuales' },
  pornografia:    { pt: 'Conteúdo pornográfico ou sexual explícito',   en: 'Pornographic or explicit sexual content', es: 'Contenido pornográfico o sexual explícito' },
  trafico:        { pt: 'Tráfico humano ou exploração de menores',     en: 'Human trafficking or child exploitation', es: 'Tráfico humano o explotación de menores' },
  animais_ilegais:{ pt: 'Comércio ilegal de animais silvestres',       en: 'Illegal wildlife trade',                  es: 'Comercio ilegal de animales silvestres' },
  odio:           { pt: 'Conteúdo de ódio ou discriminação',           en: 'Hate speech or discrimination',           es: 'Discurso de odio o discriminación' },
};

export function BlockedScreen({ username, motivo, userEmail }: BlockedScreenProps) {
  const { lang } = useLang();
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  // Resolve rótulo da violação
  const violationEntry = motivo ? VIOLATION_LABELS[motivo] : null;
  const displayReason = violationEntry
    ? (lang === 'en' ? violationEntry.en : lang === 'es' ? violationEntry.es : violationEntry.pt)
    : (motivo || (lang === 'en' ? 'Platform rules violation' : lang === 'es' ? 'Violación de las reglas' : 'Violação das regras da plataforma'));

  const labels = {
    title:         lang === 'en' ? 'Account Suspended'                          : lang === 'es' ? 'Cuenta Suspendida'                       : 'Conta Suspensa',
    subtitle:      lang === 'en' ? 'Your account was suspended by our moderation system.' : lang === 'es' ? 'Tu cuenta fue suspendida por nuestro sistema.' : 'Sua conta foi suspensa pelo sistema de moderação.',
    reasonLabel:   lang === 'en' ? 'Suspension reason'                          : lang === 'es' ? 'Motivo de la suspensión'                  : 'Motivo da suspensão',
    instructions:  lang === 'en'
      ? 'To request a review, send a message explaining your situation. Only an administrator can unblock your account after analysis.'
      : lang === 'es'
      ? 'Para solicitar revisión, envía un mensaje explicando tu situación. Solo un administrador puede desbloquear tu cuenta.'
      : 'Para solicitar a revisão, envie uma mensagem explicando sua situação. Apenas um administrador pode desbloquear sua conta após análise.',
    placeholder:   lang === 'en' ? 'Explain why you should be unblocked...'     : lang === 'es' ? 'Explica por qué debes ser desbloqueado...' : 'Explique por que você deve ser desbloqueado...',
    sendBtn:       lang === 'en' ? 'Send to Support'                            : lang === 'es' ? 'Enviar al Soporte'                        : 'Enviar para o Suporte',
    sending:       lang === 'en' ? 'Sending...'                                 : lang === 'es' ? 'Enviando...'                              : 'Enviando...',
    sentTitle:     lang === 'en' ? 'Message sent to support'                    : lang === 'es' ? 'Mensaje enviado al soporte'               : 'Mensagem enviada ao suporte',
    sentDesc:      lang === 'en' ? 'You will receive a response within 48 hours at your registered email.' : lang === 'es' ? 'Recibirás una respuesta en 48 horas en tu correo registrado.' : 'Você receberá um retorno em até 48 horas em seu email cadastrado.',
  };

  const sendSupport = async () => {
    if (!message.trim() || sending) return;
    setSending(true);
    try {
      await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientEmail: 'guilherme_lima_bh@yahoo.com.br',
          type: 'suporte_desbloqueio',
          fromUsername: username,
          extra: { mensagem: message, email: userEmail || '' },
        }),
      });
    } catch { /* silently ignore */ }
    setSent(true);
    setSending(false);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'linear-gradient(180deg, #0a0a0a 0%, #1a0808 100%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '32px 20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, sans-serif',
      overflowY: 'auto', zIndex: 9999,
    }}>
      {/* Wordmark */}
      <p style={{
        color: 'rgba(255,255,255,0.3)', fontSize: 11, letterSpacing: 4,
        fontWeight: 700, textTransform: 'uppercase', marginBottom: 44, marginTop: 0,
      }}>
        PAPO DE ALUNOS
      </p>

      {/* Shield icon */}
      <div style={{
        width: 88, height: 88, borderRadius: 26,
        background: 'linear-gradient(145deg, #dc2626 0%, #991b1b 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 28,
        boxShadow: '0 0 56px rgba(220,38,38,0.35), 0 4px 20px rgba(0,0,0,0.6)',
      }}>
        <ShieldAlert style={{ width: 46, height: 46, color: 'white' }} />
      </div>

      {/* Title */}
      <h1 style={{
        color: 'white', fontSize: 28, fontWeight: 800,
        margin: '0 0 10px', letterSpacing: -0.5, textAlign: 'center',
      }}>
        {labels.title}
      </h1>
      <p style={{
        color: 'rgba(255,255,255,0.45)', fontSize: 14,
        margin: '0 0 32px', textAlign: 'center',
        maxWidth: 320, lineHeight: 1.65,
      }}>
        {labels.subtitle}
      </p>

      {/* Reason card */}
      <div style={{
        background: 'rgba(220,38,38,0.13)',
        border: '1px solid rgba(220,38,38,0.32)',
        borderRadius: 18, padding: '18px 22px',
        width: '100%', maxWidth: 400, marginBottom: 20,
      }}>
        <p style={{
          color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: 1.8, margin: '0 0 8px',
        }}>
          {labels.reasonLabel}
        </p>
        <p style={{ color: '#fca5a5', fontSize: 15, fontWeight: 600, margin: 0, lineHeight: 1.5 }}>
          {displayReason}
        </p>
      </div>

      {/* Instructions */}
      <div style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 18, padding: '18px 22px',
        width: '100%', maxWidth: 400, marginBottom: 28,
      }}>
        <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14, margin: 0, lineHeight: 1.75 }}>
          {labels.instructions}
        </p>
      </div>

      {/* Contact form */}
      {!sent ? (
        <div style={{ width: '100%', maxWidth: 400 }}>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder={labels.placeholder}
            maxLength={1000}
            rows={4}
            style={{
              width: '100%', borderRadius: 16,
              background: 'rgba(255,255,255,0.07)',
              border: '1.5px solid rgba(255,255,255,0.13)',
              color: 'white', fontSize: 15,
              padding: '14px 16px',
              outline: 'none', resize: 'none',
              boxSizing: 'border-box',
              fontFamily: 'inherit', lineHeight: 1.55,
              transition: 'border-color .2s',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'rgba(167,139,250,0.6)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.13)')}
          />
          <button
            onClick={sendSupport}
            disabled={!message.trim() || sending}
            style={{
              width: '100%', marginTop: 12,
              background: message.trim() && !sending
                ? 'linear-gradient(135deg, #7c3aed, #9d4edd)'
                : 'rgba(255,255,255,0.08)',
              color: message.trim() && !sending ? 'white' : 'rgba(255,255,255,0.3)',
              border: 'none', borderRadius: 14, padding: '16px',
              fontSize: 16, fontWeight: 700,
              cursor: message.trim() && !sending ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'all 0.25s',
            }}
          >
            {sending ? labels.sending : (
              <><Mail style={{ width: 18, height: 18 }} />{labels.sendBtn}</>
            )}
          </button>
        </div>
      ) : (
        <div style={{
          background: 'rgba(34,197,94,0.12)',
          border: '1px solid rgba(34,197,94,0.3)',
          borderRadius: 18, padding: '22px 24px',
          width: '100%', maxWidth: 400, textAlign: 'center',
        }}>
          <CheckCircle style={{ width: 36, height: 36, color: '#4ade80', margin: '0 auto 12px' }} />
          <p style={{ color: '#86efac', fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>
            {labels.sentTitle}
          </p>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, margin: 0, lineHeight: 1.6 }}>
            {labels.sentDesc}
          </p>
        </div>
      )}

      <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12, marginTop: 36, textAlign: 'center' }}>
        suporte@papodealunos.com
      </p>
    </div>
  );
}
