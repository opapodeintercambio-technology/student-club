import { useEffect, useRef, useState, useCallback } from 'react';

function playTrokySound() {
  try {
    const audio = new Audio('/trokiii.ogg');
    audio.volume = 1;
    audio.play().catch(() => {});
  } catch { /* ignore */ }
}

interface TrokyProps {
  trigger: number;
}

type Phase = 'hidden' | 'slidein' | 'show' | 'slideout';

export function Troky({ trigger }: TrokyProps) {
  const [phase, setPhase] = useState<Phase>('hidden');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  useEffect(() => {
    if (trigger === 0) return;
    clear();
    setPhase('slidein');
    playTrokySound();

    timers.current.push(setTimeout(() => setPhase('show'),     350));
    timers.current.push(setTimeout(() => setPhase('slideout'), 800));
    timers.current.push(setTimeout(() => setPhase('hidden'),   1300));

    return clear;
  }, [trigger]);

  if (phase === 'hidden') return null;

  // Posição vertical: slide de baixo pra cima
  const translateY =
    phase === 'slidein'  ? '0%' :
    phase === 'show'     ? '0%' :
                           '110%';

  const transition =
    phase === 'slidein'  ? 'transform 0.32s cubic-bezier(0.22,1,0.36,1)' :
    phase === 'slideout' ? 'transform 0.45s cubic-bezier(0.55,0,1,0.45)' :
                           'none';

  const initialY = phase === 'slidein' ? '110%' : undefined;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        right: 20,
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        pointerEvents: 'none',
        userSelect: 'none',
        transform: `translateY(${translateY})`,
        transition,
        // começa fora da tela embaixo
        ...(phase === 'slidein' && { transform: 'translateY(110%)' }),
      }}
      // hack: forçar o primeiro frame fora da tela
      ref={el => {
        if (el && phase === 'slidein') {
          el.style.transform = 'translateY(110%)';
          requestAnimationFrame(() => {
            el.style.transform = 'translateY(0%)';
          });
        }
      }}
    >
      {/* Texto TROKIII!!! — aparece acima da carinha */}
      <div
        style={{
          marginBottom: 6,
          opacity: phase === 'show' || phase === 'slideout' ? 1 : 0,
          transform: phase === 'show' ? 'scale(1.08) rotate(-2deg)' : 'scale(1) rotate(-2deg)',
          transition: 'opacity 0.15s, transform 0.2s cubic-bezier(0.34,1.56,0.64,1)',
          background: 'linear-gradient(135deg, #7c3aed, #f97316)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          fontFamily: '"Impact", "Arial Black", sans-serif',
          fontWeight: 900,
          fontSize: 28,
          letterSpacing: '0.06em',
          textShadow: 'none',
          filter: 'drop-shadow(0 2px 8px rgba(124,58,237,0.6))',
          whiteSpace: 'nowrap',
        }}
      >
        TROKIII !!!
      </div>

    </div>
  );
}

export function useTroky() {
  const [trigger, setTrigger] = useState(0);
  const fire = useCallback(() => setTrigger(t => t + 1), []);
  return { trigger, fire };
}
