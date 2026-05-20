import { useState, useEffect } from 'react';
import { Pencil, Plane } from 'lucide-react';
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
  // Mascote pro: silhueta business + gradients 3D + sombra suave.
  // Pernas anim via SVG animateTransform pra simular caminhada.
  return (
    <svg width="26" height="34" viewBox="0 0 26 34" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        {/* Gradients pra dar profundidade 3D */}
        <linearGradient id="lp-hat" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#0a4a2c" />
          <stop offset="45%" stopColor="#1e714a" />
          <stop offset="100%" stopColor="#0e5a36" />
        </linearGradient>
        <linearGradient id="lp-coat" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2a8657" />
          <stop offset="55%" stopColor="#1e714a" />
          <stop offset="100%" stopColor="#0a4a2c" />
        </linearGradient>
        <linearGradient id="lp-skin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fcdcb3" />
          <stop offset="100%" stopColor="#e8b888" />
        </linearGradient>
        <linearGradient id="lp-beard" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e6753a" />
          <stop offset="100%" stopColor="#b04a1d" />
        </linearGradient>
        <linearGradient id="lp-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f4c43e" />
          <stop offset="50%" stopColor="#df9920" />
          <stop offset="100%" stopColor="#a06b10" />
        </linearGradient>
        <linearGradient id="lp-pant" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#5a3a18" />
          <stop offset="100%" stopColor="#3a2410" />
        </linearGradient>
        <radialGradient id="lp-shadow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="rgba(0,0,0,0.35)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
      </defs>

      {/* Sombra no chao */}
      <ellipse cx="13" cy="33" rx="7" ry="1" fill="url(#lp-shadow)" />

      <g>
        {/* Bounce vertical sutil pra walking feel */}
        <animateTransform attributeName="transform" type="translate"
          values="0 0; 0 -0.7; 0 0" dur="0.55s" repeatCount="indefinite" />

        {/* Aba do chapeu (com elipse pra dar perspectiva) */}
        <ellipse cx="13" cy="8" rx="9.5" ry="1.5" fill="#073a23" />
        <ellipse cx="13" cy="7.6" rx="9.5" ry="1.3" fill="url(#lp-hat)" />
        {/* Copa do chapeu (com curva no topo) */}
        <path d="M7.5 7.5 L7.5 2 Q7.5 0.5 9 0.5 L17 0.5 Q18.5 0.5 18.5 2 L18.5 7.5 Z" fill="url(#lp-hat)" />
        {/* Highlight no chapeu */}
        <rect x="8.2" y="1.2" width="1.2" height="5.5" rx="0.5" fill="rgba(255,255,255,0.18)" />
        {/* Faixa preta */}
        <rect x="7.5" y="5" width="11" height="1.8" fill="#0a0a0a" />
        {/* Fivela dourada */}
        <rect x="11" y="5.2" width="4" height="1.4" rx="0.3" fill="url(#lp-gold)" stroke="#7a4d08" strokeWidth="0.15" />
        <rect x="11.7" y="5.5" width="2.6" height="0.8" fill="#0a0a0a" />

        {/* Cabeca (ovoid) */}
        <ellipse cx="13" cy="11.5" rx="3.2" ry="3" fill="url(#lp-skin)" />
        {/* Orelha */}
        <ellipse cx="16.1" cy="11.6" rx="0.5" ry="0.7" fill="#e8b888" />
        {/* Sobrancelhas */}
        <rect x="11.4" y="10.4" width="1.4" height="0.5" rx="0.2" fill="#b04a1d" />
        {/* Olhos */}
        <circle cx="11.9" cy="11.4" r="0.35" fill="#1a1a1a" />
        <circle cx="14.1" cy="11.4" r="0.35" fill="#1a1a1a" />
        {/* Bochecha */}
        <circle cx="11.2" cy="12.3" r="0.6" fill="rgba(220,90,40,0.35)" />
        <circle cx="14.8" cy="12.3" r="0.6" fill="rgba(220,90,40,0.35)" />
        {/* Barba (envelopa o queixo) */}
        <path d="M9.5 12 Q13 17 16.5 12 L16 14.5 Q13 16.2 10 14.5 Z" fill="url(#lp-beard)" />

        {/* Gravata borboleta dourada (toque empresarial) */}
        <path d="M11.3 15.4 L13 16.4 L14.7 15.4 L14.7 17 L13 16 L11.3 17 Z" fill="url(#lp-gold)" stroke="#7a4d08" strokeWidth="0.12" />

        {/* Casaco */}
        <path d="M7.5 16.5 Q7 17 7 18 L7 23 Q7 24 8 24 L18 24 Q19 24 19 23 L19 18 Q19 17 18.5 16.5 Z" fill="url(#lp-coat)" />
        {/* Lapelas (V no peito) */}
        <path d="M10 16.5 L13 19 L16 16.5 L15 16.5 L13 18 L11 16.5 Z" fill="#073a23" />
        {/* Botoes dourados */}
        <circle cx="13" cy="20" r="0.45" fill="url(#lp-gold)" stroke="#7a4d08" strokeWidth="0.1" />
        <circle cx="13" cy="22" r="0.45" fill="url(#lp-gold)" stroke="#7a4d08" strokeWidth="0.1" />

        {/* Bracos */}
        <path d="M6.7 17 Q5.5 19 5.8 22.5 L7.5 22 L7.5 17.5 Z" fill="url(#lp-coat)" />
        <path d="M19.3 17 Q20.5 19 20.2 22.5 L18.5 22 L18.5 17.5 Z" fill="url(#lp-coat)" />
        {/* Punhos brancos */}
        <rect x="5.4" y="21.8" width="2" height="0.6" fill="#ffffff" />
        <rect x="19.6" y="21.8" width="2" height="0.6" fill="#ffffff" />
        {/* Maos */}
        <circle cx="6.4" cy="23" r="0.9" fill="url(#lp-skin)" />
        <circle cx="19.6" cy="23" r="0.9" fill="url(#lp-skin)" />

        {/* Perna esquerda — anima (rotacao sobre articulacao) */}
        <g>
          <animateTransform attributeName="transform" type="rotate"
            values="-15 10.5 24; 15 10.5 24; -15 10.5 24" dur="0.55s" repeatCount="indefinite" />
          <rect x="9.6" y="24" width="2" height="5.5" rx="0.4" fill="url(#lp-pant)" />
          {/* Sapato com fivela */}
          <path d="M8.6 29.5 L11.6 29.5 L12 31 L8.4 31 Z" fill="#0a0a0a" />
          <rect x="9.8" y="29.7" width="0.6" height="0.5" fill="url(#lp-gold)" />
        </g>
        {/* Perna direita — anima fase oposta */}
        <g>
          <animateTransform attributeName="transform" type="rotate"
            values="15 15.5 24; -15 15.5 24; 15 15.5 24" dur="0.55s" repeatCount="indefinite" />
          <rect x="14.4" y="24" width="2" height="5.5" rx="0.4" fill="url(#lp-pant)" />
          <path d="M13.4 29.5 L16.4 29.5 L16.8 31 L13.2 31 Z" fill="#0a0a0a" />
          <rect x="14.6" y="29.7" width="0.6" height="0.5" fill="url(#lp-gold)" />
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

  // A barra desaparece QUANDO CHEGA a data de inicio do intercambio (e dai
  // em diante). countdown.isPast = true significa que o target <= now. O
  // user ja esta no intercambio (ou comecou nesse instante), entao nao faz
  // sentido continuar mostrando o countdown.
  if (dataIntercambio && countdown?.isPast) return null;

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
          <div
            className="flex items-center gap-1.5 text-sm font-mono tabular-nums"
            style={{ color: '#1e714a' }}
            title="Faltam para chegar no destino"
          >
            <Plane className="w-4 h-4" strokeWidth={2.4} style={{ color: '#1e714a' }} />
            <span><b className="text-base">{countdown.days}</b>d</span>
            <span><b className="text-base">{String(countdown.hours).padStart(2, '0')}</b>h</span>
            <span><b className="text-base">{String(countdown.mins).padStart(2, '0')}</b>m</span>
            <span><b className="text-base">{String(countdown.secs).padStart(2, '0')}</b>s</span>
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
