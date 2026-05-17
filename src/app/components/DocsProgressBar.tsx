import { useState, useEffect } from 'react';
import { Pencil } from 'lucide-react';
import { loadDocs, docsProgress } from './MyDocs';
import { findCountry, getOrigem, getDestino, setOrigem as saveOrigem, setDestino as saveDestino, COUNTRIES } from './countries';

interface Props {
  currentUser: string;
  onGoToDocs: () => void;
}

function Plane3D() {
  // Versao sobria — silhueta minimalista do aviao, cor verde musgo
  // pra combinar com o gradiente da barra de progresso.
  return (
    <svg width="26" height="18" viewBox="0 0 26 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M1 10 L7 8 L11 4 L13 4 L11.5 8 L17 7 L19 5 L20.5 5 L19.5 8 L24 9 L24 10 L19.5 11 L20.5 14 L19 14 L17 12 L11.5 11 L13 15 L11 15 L7 11 L1 10 Z"
        fill="#5a7a52"
        stroke="#3f5a3a"
        strokeWidth="0.4"
        strokeLinejoin="round"
      />
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
              left: `calc(${pct}% - 13px)`,
              top: '50%',
              transform: 'translateY(-50%)',
              filter: 'drop-shadow(0 1px 1.5px rgba(63,90,58,0.35))',
              zIndex: 10,
            }}
          >
            <Plane3D />
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
