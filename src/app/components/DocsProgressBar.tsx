import { useState, useEffect } from 'react';
import { Pencil } from 'lucide-react';
import { loadDocs, docsProgress } from './MyDocs';
import { findCountry, getOrigem, getDestino, setOrigem as saveOrigem, setDestino as saveDestino, getDataIntercambio, COUNTRIES } from './countries';

function useCountdown(target: Date | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [target?.getTime()]);
  if (!target) return null;
  const diff = Math.max(0, target.getTime() - now);
  const days = Math.floor(diff / (24 * 3600 * 1000));
  const hours = Math.floor((diff / (3600 * 1000)) % 24);
  const mins = Math.floor((diff / 60000) % 60);
  const secs = Math.floor((diff / 1000) % 60);
  return { days, hours, mins, secs, isPast: diff === 0 };
}

interface Props {
  currentUser: string;
  onGoToDocs: () => void;
}

function Leprechaun() {
  // Boneco folclorico minimalista (figura simbolo da Irlanda).
  // SVG com 2 quadros de pernas alternando -> efeito de caminhar.
  return (
    <svg width="20" height="28" viewBox="0 0 20 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g>
        <animateTransform attributeName="transform" type="translate"
          values="0 0; 0 -0.8; 0 0" dur="0.6s" repeatCount="indefinite" />
        {/* Aba do chapeu */}
        <rect x="2" y="6" width="16" height="1.6" rx="0.3" fill="#0e5a36" />
        {/* Copa do chapeu */}
        <rect x="5" y="1" width="10" height="5.5" rx="0.4" fill="#1e714a" />
        {/* Faixa dourada */}
        <rect x="5" y="4.2" width="10" height="1.3" fill="#df9920" />
        {/* Fivela */}
        <rect x="9" y="4.3" width="2" height="1.1" fill="#a06b10" />
        {/* Cabeca */}
        <circle cx="10" cy="10" r="2.4" fill="#f4cba0" />
        {/* Barba ruiva */}
        <path d="M7.8 10.5 Q10 13.8 12.2 10.5 L12 12.4 Q10 13.5 8 12.4 Z" fill="#d4622b" />
        {/* Casaco */}
        <rect x="6.2" y="12.3" width="7.6" height="7.5" rx="1" fill="#1e714a" />
        {/* Botoes */}
        <circle cx="10" cy="14.5" r="0.4" fill="#df9920" />
        <circle cx="10" cy="16" r="0.4" fill="#df9920" />
        <circle cx="10" cy="17.5" r="0.4" fill="#df9920" />
        {/* Braços */}
        <rect x="4.6" y="13" width="1.6" height="4.5" rx="0.5" fill="#0e5a36" />
        <rect x="13.8" y="13" width="1.6" height="4.5" rx="0.5" fill="#0e5a36" />
        {/* Perna esquerda — anima */}
        <g>
          <animateTransform attributeName="transform" type="rotate"
            values="-12 7.5 20; 12 7.5 20; -12 7.5 20" dur="0.5s" repeatCount="indefinite" />
          <rect x="6.6" y="19.5" width="1.8" height="5" rx="0.4" fill="#3a2410" />
          <rect x="6" y="24" width="2.6" height="1.6" rx="0.4" fill="#1a1208" />
        </g>
        {/* Perna direita — anima fase oposta */}
        <g>
          <animateTransform attributeName="transform" type="rotate"
            values="12 12.5 20; -12 12.5 20; 12 12.5 20" dur="0.5s" repeatCount="indefinite" />
          <rect x="11.6" y="19.5" width="1.8" height="5" rx="0.4" fill="#3a2410" />
          <rect x="11.4" y="24" width="2.6" height="1.6" rx="0.4" fill="#1a1208" />
        </g>
      </g>
    </svg>
  );
}

export function DocsProgressBar({ currentUser, onGoToDocs }: Props) {
  const [pct, setPct] = useState(() => docsProgress(loadDocs(currentUser)).pct);
  const [done, setDone] = useState(() => docsProgress(loadDocs(currentUser)).done);
  const [total, setTotal] = useState(() => docsProgress(loadDocs(currentUser)).total);
  const [origem, setOrigemState] = useState(() => getOrigem(currentUser));
  const [destino, setDestinoState] = useState(() => getDestino(currentUser));
  const [dataIntercambio, setDataIntercambioState] = useState<Date | null>(() => getDataIntercambio(currentUser));
  const [editing, setEditing] = useState<null | 'origem' | 'destino'>(null);
  const countdown = useCountdown(dataIntercambio);

  useEffect(() => {
    const syncDocs = () => {
      const p = docsProgress(loadDocs(currentUser));
      setPct(p.pct); setDone(p.done); setTotal(p.total);
    };
    const syncTrip = () => {
      setOrigemState(getOrigem(currentUser));
      setDestinoState(getDestino(currentUser));
      setDataIntercambioState(getDataIntercambio(currentUser));
    };
    syncDocs(); syncTrip();
    window.addEventListener('papo-docs-updated', syncDocs);
    window.addEventListener('papo-trip-updated', syncTrip);
    return () => {
      window.removeEventListener('papo-docs-updated', syncDocs);
      window.removeEventListener('papo-trip-updated', syncTrip);
    };
  }, [currentUser]);

  function pickCountry(which: 'origem' | 'destino', code: string) {
    if (which === 'origem') { saveOrigem(currentUser, code); setOrigemState(code); }
    else { saveDestino(currentUser, code); setDestinoState(code); }
    setEditing(null);
  }

  const co = findCountry(origem);
  const cd = findCountry(destino);

  return (
    <div
      className="px-4 py-2 mb-1.5 cursor-pointer transition-all hover:shadow-md relative"
      onClick={onGoToDocs}
      style={{ background: '#ffffff', borderRadius: 9999 }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-1 gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-[11px] font-semibold uppercase"
            style={{ fontFamily: '"DM Sans", system-ui, sans-serif', color: '#1e714a', letterSpacing: '0.18em' }}
          >
            Sua viagem
          </span>
          <span className="text-[10px] text-stone-400">{done}/{total} docs · {pct}%</span>
        </div>
        {countdown && !countdown.isPast && (
          <div className="flex items-center gap-1.5 text-[10px] font-mono tabular-nums" style={{ color: '#1e714a' }}>
            <span title="Faltam para chegar no destino">✈️</span>
            <span><b>{countdown.days}</b>d</span>
            <span><b>{String(countdown.hours).padStart(2, '0')}</b>h</span>
            <span><b>{String(countdown.mins).padStart(2, '0')}</b>m</span>
            <span><b>{String(countdown.secs).padStart(2, '0')}</b>s</span>
          </div>
        )}
        {countdown && countdown.isPast && (
          <span className="text-[10px] font-semibold uppercase" style={{ color: '#1e714a', letterSpacing: '0.14em' }}>
            🎉 Boa viagem!
          </span>
        )}
        <span
          className="text-[10px] font-semibold uppercase"
          style={{ fontFamily: '"DM Sans", system-ui, sans-serif', color: '#b8896a', letterSpacing: '0.14em' }}
        >
          Ver checklist →
        </span>
      </div>

      {/* Track row */}
      <div className="flex items-center gap-2">
        {/* Origin flag */}
        <button
          onClick={e => { e.stopPropagation(); setEditing('origem'); }}
          className="flex flex-col items-center gap-0.5 flex-shrink-0 group"
          title="Trocar país de origem"
        >
          <span className="text-xl sm:text-2xl leading-none">{co.flag}</span>
          <span className="text-[9px] text-stone-400 flex items-center gap-0.5">
            {co.code}<Pencil className="w-2 h-2 opacity-0 group-hover:opacity-100" />
          </span>
        </button>

        {/* Progress bar */}
        <div className="flex-1 relative h-2 rounded-full bg-stone-200 overflow-visible">
          <style>{`
            @keyframes papo-ghost-sweep {
              0%   { transform: translateX(-130%) skewX(-18deg); opacity: 0; }
              20%  { opacity: 1; }
              80%  { opacity: 1; }
              100% { transform: translateX(230%) skewX(-18deg); opacity: 0; }
            }
            .papo-ghost-blue::after {
              content: '';
              position: absolute;
              inset: 0;
              width: 45%;
              height: 100%;
              background: linear-gradient(90deg,
                transparent 0%,
                rgba(56,189,248,0.55) 35%,
                rgba(148,210,255,0.85) 50%,
                rgba(56,189,248,0.55) 65%,
                transparent 100%);
              animation: papo-ghost-sweep 2.8s ease-in-out infinite;
              pointer-events: none;
              border-radius: inherit;
              mix-blend-mode: screen;
            }
          `}</style>
          {/* Fill */}
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #1e714a 0%, #4ade80 100%)' }}
          />
          {/* Ghost shimmer */}
          <div className="papo-ghost-blue absolute inset-0 overflow-hidden rounded-full" aria-hidden="true" />
          {/* Leprechaun caminhando */}
          <div
            className="absolute transition-all duration-700"
            style={{
              left: `calc(${pct}% - 10px)`,
              bottom: '-2px',
              filter: 'drop-shadow(0 1px 2px rgba(14,90,54,0.45))',
              zIndex: 10,
            }}
          >
            <Leprechaun />
          </div>
        </div>

        {/* Destination flag */}
        <button
          onClick={e => { e.stopPropagation(); setEditing('destino'); }}
          className="flex flex-col items-center gap-0.5 flex-shrink-0 group"
          title="Trocar país de destino"
        >
          <span className="text-xl sm:text-2xl leading-none">{cd.flag}</span>
          <span className="text-[9px] text-stone-400 flex items-center gap-0.5">
            {cd.code}<Pencil className="w-2 h-2 opacity-0 group-hover:opacity-100" />
          </span>
        </button>
      </div>

      {editing && (
        <div
          className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center p-4"
          onClick={e => { e.stopPropagation(); setEditing(null); }}
        >
          <div
            className="bg-white rounded-lg max-w-sm w-full max-h-[70vh] overflow-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-3 border-b flex items-center justify-between">
              <span
                className="text-xs font-bold uppercase"
                style={{ fontFamily: '"DM Sans", system-ui, sans-serif', letterSpacing: '0.18em', color: '#5a7a52' }}
              >
                País de {editing === 'origem' ? 'origem' : 'destino'}
              </span>
              <button onClick={() => setEditing(null)} className="text-stone-500 hover:text-stone-800 px-2">✕</button>
            </div>
            <div className="p-2">
              {COUNTRIES.map(c => (
                <button
                  key={c.code}
                  onClick={() => pickCountry(editing, c.code)}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-stone-100 rounded text-left"
                >
                  <span className="text-2xl">{c.flag}</span>
                  <span className="text-sm text-stone-800">{c.name}</span>
                  <span className="text-xs text-stone-400 ml-auto">{c.code}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
