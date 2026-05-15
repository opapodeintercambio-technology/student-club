import { useEffect, useState } from 'react';

interface Props {
  currentUser: string;
  nome?: string;
  onClick?: () => void;
}

/** Gera um código de 4 caracteres alfanumérico determinístico
 *  e estável por usuário (persistido no localStorage). */
function getStudentCode(username: string): string {
  const key = `papo_student_code_${username}`;
  const cached = localStorage.getItem(key);
  if (cached) return cached;
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem caracteres ambíguos
  let code = '';
  const arr = new Uint8Array(4);
  crypto.getRandomValues(arr);
  for (let i = 0; i < 4; i++) code += alphabet[arr[i] % alphabet.length];
  localStorage.setItem(key, code);
  return code;
}

export function StudentClubCard({ currentUser, nome, onClick }: Props) {
  const [code, setCode] = useState('----');

  useEffect(() => {
    if (!currentUser) return;
    setCode(getStudentCode(currentUser));
  }, [currentUser]);

  const displayName = nome?.trim() || `@${currentUser}`;

  return (
    <div className="relative w-full" style={{ padding: 3 }}>
      {/* Linha fantasma laranja animada nas bordas */}
      <style>{`
        @keyframes student-club-sweep {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .student-club-glow::before {
          content: '';
          position: absolute;
          inset: -2px;
          border-radius: 30px;
          padding: 2px;
          background: conic-gradient(
            from 0deg,
            transparent 0%,
            transparent 60%,
            #fb923c 75%,
            #ea580c 82%,
            #fb923c 88%,
            transparent 100%
          );
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
                  mask-composite: exclude;
          animation: student-club-sweep 3.5s linear infinite;
          pointer-events: none;
          z-index: 0;
        }
      `}</style>

      <button
        type="button"
        onClick={onClick}
        className="student-club-glow relative w-full text-left rounded-[28px] overflow-hidden active:scale-[0.99] transition-transform"
        style={{
          background: '#2a5947',
          minHeight: 200,
          boxShadow: '0 4px 18px rgba(42,89,71,0.30)',
        }}
      >
        {/* Decorações: círculos translúcidos */}
        <span
          aria-hidden
          className="absolute"
          style={{
            top: -40, right: -40, width: 140, height: 140, borderRadius: '50%',
            background: 'rgba(255,255,255,0.06)',
          }}
        />
        <span
          aria-hidden
          className="absolute"
          style={{
            top: 30, right: 20, width: 60, height: 60, borderRadius: '50%',
            background: 'rgba(255,255,255,0.05)',
          }}
        />
        <span
          aria-hidden
          className="absolute"
          style={{
            bottom: -30, left: -30, width: 100, height: 100, borderRadius: '50%',
            background: 'rgba(255,255,255,0.04)',
          }}
        />

        {/* Conteúdo */}
        <div className="relative px-5 py-5 flex flex-col gap-3" style={{ zIndex: 1 }}>
          <div>
            <p className="text-[11px] font-semibold tracking-[0.25em] text-white/65 uppercase">
              Student Club
            </p>
            <h3 className="text-2xl font-bold text-white mt-1 leading-tight truncate" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
              {displayName}
            </h3>
          </div>

          <div className="mt-1">
            <p className="text-[11px] font-medium text-white/65">Seu Código</p>
            <p
              className="text-3xl font-bold text-white mt-0.5"
              style={{
                fontFamily: '"SF Mono", "Courier New", monospace',
                letterSpacing: '0.4em',
              }}
            >
              {code.split('').join(' ')}
            </p>
          </div>

          <div className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: '#fbbf24' }}>
            <span className="text-base">🌟</span>
            Bem-vindo ao Clube de Benefícios!
          </div>

          <div
            className="mt-3 inline-block px-3 py-1 rounded-full text-xs font-extrabold tracking-widest"
            style={{
              background: 'rgba(220, 38, 38, 0.18)',
              color: '#fecaca',
              border: '1px solid rgba(220, 38, 38, 0.55)',
              letterSpacing: '0.18em',
            }}
          >
            EM BREVE!
          </div>
        </div>
      </button>
    </div>
  );
}
