import { useState } from 'react';
import { ArrowRight, RefreshCw } from 'lucide-react';

interface LoginScreenProps {
  onLogin: () => void;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin();
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', padding: '0 24px' }}>
      {/* Header */}
      <div style={{ paddingTop: '64px', marginBottom: '48px', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '12px' }}>
          <div style={{
            width: '44px', height: '44px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #00c896, #007a5e)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <RefreshCw size={22} color="#fff" />
          </div>
          <span style={{ fontSize: '26px', fontWeight: '700', color: '#fff', letterSpacing: '-0.5px' }}>SwapIt</span>
        </div>
        <p style={{ color: '#a0a0a0', fontSize: '15px' }}>Troque produtos e serviços com quem precisa</p>
      </div>

      {/* Toggle */}
      <div style={{
        display: 'flex', background: '#1a1a1a', borderRadius: '12px',
        padding: '4px', marginBottom: '28px'
      }}>
        {['Entrar', 'Cadastrar'].map((label, i) => (
          <button
            key={label}
            onClick={() => setIsLogin(i === 0)}
            style={{
              flex: 1, padding: '10px', borderRadius: '10px', border: 'none', cursor: 'pointer',
              fontWeight: '600', fontSize: '14px', transition: 'all 0.2s',
              background: (i === 0) === isLogin ? '#00c896' : 'transparent',
              color: (i === 0) === isLogin ? '#000' : '#a0a0a0',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {!isLogin && (
          <div>
            <label style={{ display: 'block', color: '#a0a0a0', fontSize: '13px', marginBottom: '6px' }}>Nome</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Seu nome completo"
              style={{
                width: '100%', padding: '14px 16px', borderRadius: '12px',
                background: '#1a1a1a', border: '1px solid #2a2a2a',
                color: '#fff', fontSize: '15px', outline: 'none',
              }}
            />
          </div>
        )}
        <div>
          <label style={{ display: 'block', color: '#a0a0a0', fontSize: '13px', marginBottom: '6px' }}>E-mail</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="seu@email.com"
            style={{
              width: '100%', padding: '14px 16px', borderRadius: '12px',
              background: '#1a1a1a', border: '1px solid #2a2a2a',
              color: '#fff', fontSize: '15px', outline: 'none',
            }}
          />
        </div>
        <div>
          <label style={{ display: 'block', color: '#a0a0a0', fontSize: '13px', marginBottom: '6px' }}>Senha</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            style={{
              width: '100%', padding: '14px 16px', borderRadius: '12px',
              background: '#1a1a1a', border: '1px solid #2a2a2a',
              color: '#fff', fontSize: '15px', outline: 'none',
            }}
          />
        </div>

        <button
          type="submit"
          style={{
            marginTop: '8px', padding: '16px', borderRadius: '14px', border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, #00c896, #007a5e)',
            color: '#000', fontWeight: '700', fontSize: '16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          }}
        >
          {isLogin ? 'Entrar' : 'Criar conta'}
          <ArrowRight size={18} />
        </button>
      </form>

      {/* Divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '24px 0' }}>
        <div style={{ flex: 1, height: '1px', background: '#2a2a2a' }} />
        <span style={{ color: '#a0a0a0', fontSize: '13px' }}>ou continue como</span>
        <div style={{ flex: 1, height: '1px', background: '#2a2a2a' }} />
      </div>

      <button
        onClick={onLogin}
        style={{
          padding: '14px', borderRadius: '12px', border: '1px solid #2a2a2a',
          background: 'transparent', color: '#a0a0a0', fontSize: '15px', cursor: 'pointer'
        }}
      >
        Visitante (demo)
      </button>

      <p style={{ textAlign: 'center', color: '#555', fontSize: '12px', marginTop: '32px', padding: '0 0 24px' }}>
        Ao continuar, você concorda com nossos Termos de Uso e Política de Privacidade
      </p>
    </div>
  );
}
