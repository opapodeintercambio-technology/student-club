import { useState, useEffect } from 'react';
import { Pencil } from 'lucide-react';
import { loadDocs, docsProgress } from './MyDocs';
import { findCountry, getOrigem, getDestino, setOrigem as saveOrigem, setDestino as saveDestino, COUNTRIES } from './countries';

interface Props {
  currentUser: string;
  onGoToDocs: () => void;
}

function Plane3D() {
  return (
    <svg width="44" height="38" viewBox="0 0 80 68" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="pl-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#dbeafe" />
          <stop offset="100%" stopColor="#60a5fa" />
        </linearGradient>
        <linearGradient id="pl-wing" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#93c5fd" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>
        <filter id="pl-shad">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#1e3a8a" floodOpacity="0.4" />
        </filter>
      </defs>

      {/* Cauda vertical — triângulo apontando para cima na parte traseira */}
      <path d="M12 20 L8 6 L20 17 Z" fill="#93c5fd" stroke="#3b82f6" strokeWidth="0.5" />

      {/* Estabilizador horizontal traseiro */}
      <path d="M11 28 L4 37 L18 29.5 Z" fill="#60a5fa" />

      {/* Asa OPOSTA (lado de trás da fuselagem — perspectiva 3D, parcialmente coberta) */}
      <path d="M34 19 L20 4 L48 18 L46 19 Z" fill="#3b82f6" opacity="0.85" stroke="#1d4ed8" strokeWidth="0.4" />

      {/* Fuselagem: cilindro apontando para a DIREITA (cobre raiz da asa traseira) */}
      <path
        d="M8 24 Q10 19 18 19 L60 19 L76 24 L60 29 L18 29 Q10 29 8 24 Z"
        fill="url(#pl-body)"
        stroke="#93c5fd"
        strokeWidth="0.5"
        filter="url(#pl-shad)"
      />

      {/* Cockpit escurecido no nariz (ponta direita) */}
      <path d="M56 19 L76 24 L56 29 Q63 27 63 24 Q63 21 56 19 Z" fill="#1e40af" opacity="0.38" />

      {/* Faixa de janelas */}
      <rect x="22" y="20.5" width="28" height="3" rx="1.4" fill="white" opacity="0.6" />

      {/* Asa principal (frente, varre para baixo-esquerda) */}
      <path d="M34 29 L16 54 L50 32 L47 29 Z" fill="url(#pl-wing)" stroke="#2563eb" strokeWidth="0.5" />

      {/* Motor sob a asa principal */}
      <ellipse cx="32" cy="44" rx="7" ry="2.5" fill="#1e3a8a" opacity="0.6" />
      <ellipse cx="32" cy="44" rx="5" ry="1.5" fill="#7dd3fc" opacity="0.4" />

      {/* Brilho superior */}
      <path d="M18 20 Q42 17 60 19.5 Q50 20.5 18 21.5 Z" fill="white" opacity="0.35" />
    </svg>
  );
}

export function DocsProgressBar({ currentUser, onGoToDocs }: Props) {
  const [pct, setPct] = useState(() => docsProgress(loadDocs(currentUser)).pct);
  const [done, setDone] = useState(() => docsProgress(loadDocs(currentUser)).done);
  const [total, setTotal] = useState(() => docsProgress(loadDocs(currentUser)).total);
  const [origem, setOrigemState] = useState(() => getOrigem(currentUser));
  const [destino, setDestinoState] = useState(() => getDestino(currentUser));
  const [editing, setEditing] = useState<null | 'origem' | 'destino'>(null);

  useEffect(() => {
    const syncDocs = () => {
      const p = docsProgress(loadDocs(currentUser));
      setPct(p.pct); setDone(p.done); setTotal(p.total);
    };
    const syncTrip = () => {
      setOrigemState(getOrigem(currentUser));
      setDestinoState(getDestino(currentUser));
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
      className="rounded-lg px-2.5 py-1 mb-1.5 cursor-pointer transition-all hover:shadow-md relative"
      onClick={onGoToDocs}
      style={{ background: '#ffffff', border: '1px solid #d6d3d1' }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] font-semibold uppercase"
            style={{ fontFamily: '"DM Sans", system-ui, sans-serif', color: '#5a7a52', letterSpacing: '0.18em' }}
          >
            Sua viagem
          </span>
          <span className="text-[10px] text-stone-400">{done}/{total} docs · {pct}%</span>
        </div>
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
            style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #b8896a 0%, #5a7a52 100%)' }}
          />
          {/* Ghost shimmer */}
          <div className="papo-ghost-blue absolute inset-0 overflow-hidden rounded-full" aria-hidden="true" />
          {/* 3D Airplane */}
          <div
            className="absolute transition-all duration-700"
            style={{
              left: `calc(${pct}% - 22px)`,
              top: '50%',
              transform: 'translateY(-50%)',
              filter: 'drop-shadow(0 2px 4px rgba(30,58,138,0.45))',
              zIndex: 10,
            }}
          >
            <Plane3D size={38} />
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
