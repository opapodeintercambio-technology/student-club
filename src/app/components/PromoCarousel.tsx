import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Mail, Phone as PhoneIcon } from 'lucide-react';
import { useLang } from '../i18n';
import { supabase } from '../../lib/supabase';

/* ─── Countdown até 05/junho/2026 ─────────────────────────────────────── */
const LAUNCH_DATE = new Date('2026-06-05T00:00:00');
function getCountdown() {
  const diff = Math.max(0, LAUNCH_DATE.getTime() - Date.now());
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1_000);
  return { d, h, m, s };
}

/* ─── Apple logo SVG ──────────────────────────────────────────────────── */
const AppleSVG = ({ size = 28, color = '#fff', className = '' }: { size?: number; color?: string; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 814 1000" fill={color} className={className}>
    <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105.4-57.4-155.5-127.4C46.7 790.7 0 663 0 541.8c0-207.5 135.4-317.3 269-317.3 70.1 0 128.4 46.4 172.5 46.4 42.8 0 109.6-49 192.5-49 30.8 0 132.8 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"/>
  </svg>
);

/* ─── Android SVG ─────────────────────────────────────────────────────── */
const AndroidSVG = ({ size = 28, color = '#3DDC84', className = '' }: { size?: number; color?: string; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} className={className}>
    <path d="M17.523 15.341a1 1 0 01-1 1 1 1 0 01-1-1 1 1 0 011-1 1 1 0 011 1m-9.046 0a1 1 0 01-1 1 1 1 0 01-1-1 1 1 0 011-1 1 1 0 011 1M5.18 9.03A6.973 6.973 0 0112 6a6.973 6.973 0 016.82 3.03l1.44-1.44a9.002 9.002 0 00-4.536-3.012l.97-1.68a.5.5 0 00-.183-.683.5.5 0 00-.683.183L14.638 4.2A8.95 8.95 0 0012 3.8a8.95 8.95 0 00-2.638.4L8.172 2.398a.5.5 0 00-.683-.183.5.5 0 00-.183.683l.97 1.68A9.002 9.002 0 003.74 7.59zM5 10v7a2 2 0 002 2h10a2 2 0 002-2v-7z"/>
  </svg>
);

/* ─── Slide de contagem regressiva (estilo Apple cinema) ───────────────── */
function CountdownSlide({ active }: { active: boolean }) {
  const { AT } = useLang();
  const [cd, setCd] = useState(getCountdown());
  const [phase, setPhase] = useState(0); // 0=apple, 1=android
  const raf = useRef<ReturnType<typeof setInterval>>();
  const phaseRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    raf.current = setInterval(() => setCd(getCountdown()), 1000);
    phaseRef.current = setInterval(() => setPhase(p => (p + 1) % 2), 5000);
    return () => { clearInterval(raf.current!); clearInterval(phaseRef.current!); };
  }, []);

  const isApple = phase === 0;
  const accent  = isApple ? '#fff' : '#3DDC84';
  const border  = isApple ? 'rgba(255,255,255,0.18)' : 'rgba(61,220,132,0.3)';

  return (
    <div style={{
      width: '100%', height: '100%', position: 'relative',
      background: '#000', overflow: 'hidden',
      display: 'flex', alignItems: 'stretch',
    }}>
      <style>{`
        @keyframes cin-fade { 0%{opacity:0;transform:translateY(10px)} 100%{opacity:1;transform:translateY(0)} }
        @keyframes cin-glow { 0%,100%{opacity:.65} 50%{opacity:1} }
        @keyframes platform-switch { 0%{opacity:0;transform:scale(.88)} 15%,85%{opacity:1;transform:scale(1)} 100%{opacity:0;transform:scale(.88)} }
        @keyframes firework {
          0%   { transform: translate(0,0) scale(0); opacity: 1; }
          70%  { opacity: 1; }
          100% { transform: translate(var(--tx), var(--ty)) scale(1); opacity: 0; }
        }
        @keyframes spark-up {
          0%   { transform: translateY(0) scale(0.4); opacity: 0; }
          20%  { opacity: 1; }
          100% { transform: translateY(-50px) scale(1); opacity: 0; }
        }
        .cin-in  { animation: cin-fade .9s ease forwards; }
        .cin-glow{ animation: cin-glow 2s ease-in-out infinite; }
        .plat-sw { animation: platform-switch 5s ease-in-out infinite; }
        .fw-particle { position:absolute; width:3px; height:3px; border-radius:50%; animation: firework 1.4s ease-out infinite; }
        .fw-spark { position:absolute; width:2px; height:8px; border-radius:2px; animation: spark-up 1.8s ease-out infinite; }
        /* Título 3× no desktop */
        .cd-main-title { font-size: 13px; line-height: 1.25; }
        @media (min-width: 768px) {
          .cd-main-title { font-size: 39px !important; line-height: 1.1 !important; letter-spacing: -0.02em !important; }
        }
      `}</style>

      {/* Fogos de artifício — só quando estamos na fase Apple (lançado) */}
      {isApple && (
        <div style={{ position:'absolute', inset:0, pointerEvents:'none', zIndex:1 }}>
          {[
            { x: '20%', y: '30%', c: '#fbbf24', tx: '40px',  ty: '40px'  },
            { x: '70%', y: '25%', c: '#f472b6', tx: '-50px', ty: '50px'  },
            { x: '40%', y: '70%', c: '#60a5fa', tx: '50px',  ty: '-30px' },
            { x: '85%', y: '60%', c: '#34d399', tx: '-40px', ty: '-40px' },
            { x: '15%', y: '75%', c: '#a78bfa', tx: '40px',  ty: '-50px' },
            { x: '55%', y: '40%', c: '#fb923c', tx: '-50px', ty: '40px'  },
          ].map((p, i) => (
            <div key={i} className="fw-particle" style={{
              left: p.x, top: p.y, background: p.c, boxShadow: `0 0 8px ${p.c}`,
              animationDelay: `${i * 0.25}s`,
              ['--tx' as any]: p.tx, ['--ty' as any]: p.ty,
            } as React.CSSProperties}/>
          ))}
          {['25%','45%','65%','80%'].map((x, i) => (
            <div key={`s${i}`} className="fw-spark" style={{
              left: x, bottom: 4, background: 'linear-gradient(180deg,#fbbf24,transparent)',
              animationDelay: `${i * 0.5}s`,
            }}/>
          ))}
        </div>
      )}

      {/* Scanlines */}
      <div style={{ position:'absolute', inset:0, pointerEvents:'none',
        background:'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(255,255,255,0.012) 3px,rgba(255,255,255,0.012) 4px)' }}/>

      {/* ── COLUNA ESQUERDA — ícone grande da plataforma ── */}
      <div style={{
        width: '22%', flexShrink: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 6, padding: '0 8px', position: 'relative',
      }}>
        <div style={{ position:'absolute', width:110, height:110, borderRadius:'50%',
          border:`1px solid ${isApple?'rgba(255,255,255,0.07)':'rgba(61,220,132,0.07)'}`, transition:'border-color 1s' }}/>
        <div style={{ position:'absolute', width:80, height:80, borderRadius:'50%',
          border:`1px solid ${isApple?'rgba(255,255,255,0.1)':'rgba(61,220,132,0.1)'}`, transition:'border-color 1s' }}/>
        <div className="plat-sw" key={phase} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5 }}>
          {isApple ? <AppleSVG size={42} color="#fff" /> : <AndroidSVG size={42} color="#3DDC84" />}
          <span style={{ color:accent, fontSize:11, fontWeight:300, letterSpacing:'0.14em', textTransform:'uppercase', transition:'color .5s' }}>
            {isApple ? 'App Store' : 'Google Play'}
          </span>
        </div>
      </div>

      {/* ── COLUNA CENTRAL — título + countdown (Android) / vídeo lançamento (Apple) ── */}
      <div style={{
        flex: 1, display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'center',
        gap: 4, padding:'8px 4px', textAlign:'center', position:'relative', zIndex:2,
      }}>
        {isApple ? (
          <>
            <p className="cin-in cd-main-title" style={{ color:'#fff', fontWeight:800, margin:0 }}>
              🎉 Já estamos na App Store!
            </p>
            <p style={{ color:'rgba(255,255,255,0.7)', fontSize:9, letterSpacing:'0.09em', margin:'2px 0 6px' }}>
              Baixe agora o TrokVibe no iPhone
            </p>
            <video
              src="/apple-launched.mp4"
              autoPlay muted loop playsInline
              style={{ height:70, width:'auto', maxWidth:'70%', borderRadius:6, objectFit:'cover', border:'1px solid rgba(255,255,255,0.18)' }}
            />
          </>
        ) : (
          <>
            <p className="cin-in cd-main-title" style={{ color:'#fff', fontWeight:800, margin:0 }}>
              {AT.carouselCountdownTitle}
            </p>
            <p style={{ color:'rgba(255,255,255,0.45)', fontSize:9, letterSpacing:'0.09em', margin:'2px 0 6px' }}>
              {AT.carouselCountdownSub}
            </p>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:5 }}>
              {[
                { v: cd.d, l: 'dias' },
                { v: cd.h, l: 'h' },
                { v: cd.m, l: 'min' },
                { v: cd.s, l: 's' },
              ].map(({ v, l }, i) => (
                <div key={l} style={{ display:'flex', alignItems:'center', gap:5 }}>
                  <div style={{ minWidth:40, padding:'4px 6px', borderRadius:8,
                    background:'rgba(255,255,255,0.07)', border:`1px solid ${border}`,
                    textAlign:'center', transition:'border-color .5s' }}>
                    <div className="cin-glow" style={{ color:accent, fontSize:16, fontWeight:700,
                      lineHeight:1, fontVariantNumeric:'tabular-nums', transition:'color .5s' }}>
                      {String(v).padStart(2, '0')}
                    </div>
                    <div style={{ color:'rgba(255,255,255,0.3)', fontSize:8, marginTop:2 }}>{l}</div>
                  </div>
                  {i < 3 && <span style={{ color:'rgba(255,255,255,0.25)', fontSize:13, fontWeight:200 }}>:</span>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── COLUNA DIREITA — data + tagline ── */}
      <div style={{
        width: '22%', flexShrink:0,
        display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
        gap:4, padding:'0 8px', position:'relative',
      }}>
        <div style={{ position:'absolute', width:110, height:110, borderRadius:'50%',
          border:`1px solid ${isApple?'rgba(255,255,255,0.07)':'rgba(61,220,132,0.07)'}`, transition:'border-color 1s' }}/>
        <div style={{ position:'absolute', width:80, height:80, borderRadius:'50%',
          border:`1px solid ${isApple?'rgba(255,255,255,0.1)':'rgba(61,220,132,0.1)'}`, transition:'border-color 1s' }}/>
        <div style={{ position:'relative', textAlign:'center' }}>
          {isApple ? (
            <>
              <p style={{ color:'rgba(255,255,255,0.5)', fontSize:8, letterSpacing:'0.1em', margin:'0 0 6px' }}>STATUS</p>
              <p style={{ color:'#fff', fontSize:14, fontWeight:800, lineHeight:1, margin:0 }}>LANÇADO</p>
              <p style={{ color:'#fff', fontSize:9, fontWeight:600, letterSpacing:'0.08em', margin:'4px 0 0' }}>✨ DISPONÍVEL</p>
              <div style={{ marginTop:6, height:1, background:`linear-gradient(90deg,transparent,#fff,transparent)`, opacity:.3, width:60 }}/>
              <p style={{ color:'rgba(255,255,255,0.55)', fontSize:8, letterSpacing:'0.06em', marginTop:5 }}>iOS APP STORE</p>
            </>
          ) : (
            <>
              <p style={{ color:'rgba(255,255,255,0.3)', fontSize:8, letterSpacing:'0.1em', margin:'0 0 6px' }}>
                {AT.carouselCountdownLaunch}
              </p>
              <p style={{ color:accent, fontSize:20, fontWeight:800, lineHeight:1, margin:0, transition:'color .5s' }}>05</p>
              <p style={{ color:accent, fontSize:10, fontWeight:600, letterSpacing:'0.06em', margin:'2px 0', transition:'color .5s' }}>
                JUN 2026
              </p>
              <div style={{ marginTop:6, height:1, background:`linear-gradient(90deg,transparent,${accent},transparent)`, opacity:.3, width:60 }}/>
              <p style={{ color:'rgba(255,255,255,0.4)', fontSize:8, letterSpacing:'0.06em', marginTop:5 }}>
                GOOGLE PLAY
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Slide "Como funciona a troca" ───────────────────────────────────── */
function TradeHowSlide() {
  const { AT } = useLang();
  return (
    <div style={{
      width: '100%', height: '100%', position: 'relative', overflow: 'hidden',
      background: 'linear-gradient(135deg, #1a0533 0%, #2d1b69 40%, #1e3a5f 100%)',
      display: 'flex',
    }}>
      <style>{`
        @keyframes float-item  { 0%,100%{transform:translateY(0) rotate(-6deg)} 50%{transform:translateY(-7px) rotate(-6deg)} }
        @keyframes float-item2 { 0%,100%{transform:translateY(0) rotate(8deg)}  50%{transform:translateY(-6px) rotate(8deg)} }
        @keyframes float-item3 { 0%,100%{transform:translateY(0) rotate(-3deg)} 50%{transform:translateY(-8px) rotate(-3deg)} }
        .fi1{animation:float-item  3.2s ease-in-out infinite}
        .fi2{animation:float-item2 2.8s ease-in-out infinite .4s}
        .fi3{animation:float-item3 3.5s ease-in-out infinite .8s}
        .th-label { font-size:9px; }
        .th-title { font-size:13px; }
        .th-ico   { font-size:11px; }
        .th-item  { font-size:9.5px; }
        .th-btn   { font-size:10px; padding:5px 12px; margin-top:4px; }
        .th-pad   { padding:12px 14px 12px 8px; gap:4px; }
        .th-brow  { gap:3px; margin-top:2px; }
        @media (min-width: 768px) {
          .th-label { font-size:10px !important; }
          .th-title { font-size:15px !important; margin-bottom:3px !important; }
          .th-ico   { font-size:13px !important; }
          .th-item  { font-size:11px !important; }
          .th-btn   { font-size:11px !important; padding:5px 14px !important; margin-top:6px !important; }
          .th-pad   { padding:10px 16px 10px 12px !important; gap:4px !important; }
          .th-brow  { gap:4px !important; margin-top:3px !important; }
        }
      `}</style>

      {/* ── Foto lado esquerdo ── */}
      <div style={{ width: '46%', position: 'relative', flexShrink: 0, overflow: 'hidden' }}>
        <img
          src="https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=800&q=80"
          alt=""
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: 'center 20%',
          }}
        />
        {/* Overlay gradiente para integrar com o fundo do slide */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to right, rgba(26,5,51,0.25) 0%, rgba(26,5,51,0.55) 100%)',
        }}/>
        {/* Itens flutuantes sobre a foto */}
        <div className="fi1" style={{ position:'absolute', top:8,  left:10, fontSize:20, filter:'drop-shadow(0 2px 4px rgba(0,0,0,.5))' }}>📱</div>
        <div className="fi2" style={{ position:'absolute', top:12, right:10, fontSize:18, filter:'drop-shadow(0 2px 4px rgba(0,0,0,.5))' }}>👟</div>
        <div className="fi3" style={{ position:'absolute', top:32, left:28, fontSize:16, filter:'drop-shadow(0 2px 4px rgba(0,0,0,.5))' }}>📚</div>
      </div>

      {/* ── Texto lado direito ── */}
      <div className="th-pad" style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center' }}>
        <span className="th-label" style={{ fontWeight:800, letterSpacing:'0.08em', color:'#f97316', textTransform:'uppercase' }}>
          {AT.carouselTradeLabel}
        </span>
        <p className="th-title" style={{ fontWeight:800, color:'#fff', lineHeight:1.25, margin:0 }}>
          {AT.carouselTradeTitle}
        </p>
        <div className="th-brow" style={{ display:'flex', flexDirection:'column' }}>
          {[
            { ico: '🛍️', txt: AT.carouselTradeItem1 },
            { ico: '🪙', txt: AT.carouselTradeItem2 },
            { ico: '✅', txt: AT.carouselTradeItem3 },
          ].map(({ ico, txt }) => (
            <div key={txt} style={{ display:'flex', alignItems:'center', gap:5 }}>
              <span className="th-ico">{ico}</span>
              <span className="th-item" style={{ color:'rgba(255,255,255,0.82)', lineHeight:1.3 }}>{txt}</span>
            </div>
          ))}
        </div>
        <button className="th-btn" style={{
          alignSelf:'flex-start',
          background:'linear-gradient(90deg,#7c3aed,#f97316)',
          border:'none', color:'#fff', fontWeight:700, borderRadius:50, cursor:'pointer',
        }}>
          {AT.carouselTradeCta} →
        </button>
      </div>
    </div>
  );
}

/* ─── Tipos de slide ──────────────────────────────────────────────────── */
type SlideType = 'custom-countdown' | 'custom-trade' | 'standard' | 'empresa-destaque';

interface Slide {
  type: SlideType;
  image?: string;
  imagePosition?: string;
  bg?: string;
  tag?: string;
  title?: string;
  subtitle?: string;
  cta?: string;
  onCta?: () => void;
  contactEmail?: string;
  contactPhone?: string;
  username?: string;
}

interface PromoCarouselProps {
  onGoToPlanos?: () => void;
  onPublicar?: () => void;
  onMatchIA?: () => void;
  onDoacao?: () => void;
  isPJ?: boolean;
  onGoToLeads?: () => void;
  onCreateAmostra?: () => void;
}

export function PromoCarousel({ onGoToPlanos, onPublicar, onMatchIA, onDoacao, isPJ, onGoToLeads, onCreateAmostra }: PromoCarouselProps) {
  const { AT } = useLang();
  const [current, setCurrent] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [destaques, setDestaques] = useState<Slide[]>([]);

  // Carrega até 6 destaques de empresa ativos (cada destaque empurra um "slide placeholder PJ" pra fora)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('empresa_destaques')
          .select('username,image_url,contact_email,contact_phone,slogan,active_until')
          .gte('active_until', new Date().toISOString())
          .order('active_until', { ascending: false })
          .limit(6);
        if (cancelled) return;
        const slots: Slide[] = (data || []).map((d: any) => ({
          type: 'empresa-destaque' as SlideType,
          image: d.image_url,
          imagePosition: 'center center',
          bg: 'linear-gradient(135deg, #5a7a52 0%, #6b8e3d 50%, #b8896a 100%)',
          tag: '✨ Empresa em destaque',
          title: d.slogan || `@${d.username}`,
          subtitle: '',
          contactEmail: d.contact_email,
          contactPhone: d.contact_phone,
          username: d.username,
        }));
        setDestaques(slots);
      } catch { /* tabela pode não existir */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const baseSlides: Slide[] = [
    // ── 1. Contagem regressiva App Store / Google Play ──────────────────
    { type: 'custom-countdown' },
    // ── 2. Como funciona a troca multi-item ─────────────────────────────
    { type: 'custom-trade' },
    // ── slides originais ─────────────────────────────────────────────────
    {
      type: 'standard',
      image: '/email-hero.jpg',
      imagePosition: '30% 15%',
      bg: 'linear-gradient(135deg, #1e0a3c 0%, #3b0764 50%, #7c2d12 100%)',
      tag: AT.carouselSlide1Tag,
      title: AT.carouselSlide1Title,
      subtitle: AT.carouselSlide1Subtitle,
      cta: AT.carouselSlide1Cta,
      onCta: onPublicar,
    },
    {
      type: 'standard',
      image: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800&q=80',
      imagePosition: 'center center',
      bg: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 60%, #0c4a6e 100%)',
      tag: AT.carouselSlide2Tag,
      title: AT.carouselSlide2Title,
      subtitle: AT.carouselSlide2Subtitle,
      cta: AT.carouselSlide2Cta,
      onCta: onMatchIA,
    },
    {
      type: 'standard',
      image: 'https://images.unsplash.com/photo-1573496799652-408c2ac9fe98?w=800&q=80',
      imagePosition: '50% 25%',
      bg: 'linear-gradient(135deg, #14532d 0%, #166534 50%, #15803d 100%)',
      tag: AT.carouselSlide3Tag,
      title: AT.carouselSlide3Title,
      subtitle: AT.carouselSlide3Subtitle,
      cta: AT.carouselSlide3Cta,
      onCta: onDoacao,
    },
    {
      type: 'standard',
      image: 'https://images.unsplash.com/photo-1521791136064-7986c2920216?w=800&q=80',
      imagePosition: 'center center',
      bg: 'linear-gradient(135deg, #312e81 0%, #4c1d95 50%, #7c3aed 100%)',
      tag: AT.carouselSlide4Tag,
      title: AT.carouselSlide4Title,
      subtitle: AT.carouselSlide4Subtitle,
      cta: AT.carouselSlide4Cta,
      onCta: onGoToPlanos,
    },
  ];

  // ── 9 slides PJ-themed (substituem TODOS os PF + extras) ────────────────
  // Para usuários PJ, esses slides cobrem o conteúdo da plataforma sob a
  // ótica empresarial — somando ~10 slides com o countdown na frente.
  const pjExtraSlides: Slide[] = isPJ ? [
    // 1) substitui "Como funciona a troca multi-item" (PF) → fluxo empresa
    {
      type: 'standard',
      image: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&q=80',
      imagePosition: 'center center',
      bg: 'linear-gradient(135deg, #2c1810 0%, #5a3a25 50%, #6b8e3d 100%)',
      tag: '🍃 AMOSTRAS NA PRÁTICA',
      title: 'Conceda amostras e transforme em clientes fiéis',
      subtitle: 'Publique uma amostra do seu produto ou serviço. Quem aceitar topa receber seu nome e telefone — leads já interessados.',
      cta: 'Anunciar amostra',
      onCta: onCreateAmostra,
    },
    {
      type: 'standard',
      image: 'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=800&q=80',
      imagePosition: 'center center',
      bg: 'linear-gradient(135deg, #1a3a1f 0%, #2f5233 50%, #5a7a52 100%)',
      tag: '🍃 DESTAQUE GRATUITO',
      title: 'Tenha o seu destaque gratuito no carrossel',
      subtitle: 'Conceda 10 amostras na semana e ganhe destaque automático na home — sem pagar nada.',
      cta: 'Acessar + Leads',
      onCta: onGoToLeads,
    },
    {
      type: 'standard',
      image: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800&q=80',
      imagePosition: 'center center',
      bg: 'linear-gradient(135deg, #2c1810 0%, #5a3a25 50%, #b8896a 100%)',
      tag: '💳 PLANO AVULSO',
      title: 'Assine o plano destaque avulso e aproveite',
      subtitle: 'Não tem 10 amostras ainda? Pague R$ 9,90 e fique na primeira página do carrossel por 7 dias.',
      cta: 'Liberar destaque agora',
      onCta: onGoToLeads,
    },
    {
      type: 'standard',
      image: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=800&q=80',
      imagePosition: 'center center',
      bg: 'linear-gradient(135deg, #3d2f24 0%, #6b8e3d 60%, #b8896a 100%)',
      tag: '📈 PROSPECÇÃO',
      title: 'Receba mais leads presenciais com conversão real',
      subtitle: 'Cada amostra concedida traz um cliente novo até o seu balcão — e ainda alimenta seu Painel de Controle.',
      cta: 'Anunciar amostra',
      onCta: onCreateAmostra,
    },
    {
      type: 'standard',
      image: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=800&q=80',
      imagePosition: 'center center',
      bg: 'linear-gradient(135deg, #1a1a1a 0%, #3d3d3d 50%, #b8896a 100%)',
      tag: '📊 PAINEL DE CONTROLE',
      title: 'Acompanhe sua carteira de clientes em tempo real',
      subtitle: 'Veja quem visualizou, quem aceitou, quanto está gastando em amostras e a projeção de crescimento.',
      cta: 'Abrir Painel',
      onCta: onGoToPlanos,
    },
    // 6) Match IA por segmento
    {
      type: 'standard',
      image: 'https://images.unsplash.com/photo-1543286386-713bdd548da4?w=800&q=80',
      imagePosition: 'center center',
      bg: 'linear-gradient(135deg, #1e3a5f 0%, #2d5a3d 50%, #6b8e3d 100%)',
      tag: '🎯 MATCH IA POR SEGMENTO',
      title: 'A IA traz só pedidos da sua área de atuação',
      subtitle: 'Se sua empresa é de estética, só aparecem pedidos de estética. Sem filtrar manualmente — leads relevantes direto na tela.',
      cta: 'Conhecer Match IA',
      onCta: onMatchIA,
    },
    // 7) Quem visualizou meus anúncios (prospecção)
    {
      type: 'standard',
      image: 'https://images.unsplash.com/photo-1551836022-deb4988cc6c0?w=800&q=80',
      imagePosition: 'center center',
      bg: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #5a7a52 100%)',
      tag: '🔥 LEADS QUENTES',
      title: 'Saiba quem visitou seu anúncio — mesmo sem aceitar',
      subtitle: 'Nome, telefone e e-mail de cada interessado direto no Painel. Faça follow-up e converta visitas em clientes.',
      cta: 'Ver Painel de Controle',
      onCta: onGoToPlanos,
    },
    // 8) Promoções da empresa
    {
      type: 'standard',
      image: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=800&q=80',
      imagePosition: 'center center',
      bg: 'linear-gradient(135deg, #5a3a25 0%, #8a5a3d 50%, #c6895d 100%)',
      tag: '🏷️ PROMOÇÕES',
      title: 'Anuncie promoções e atraia clientes presenciais',
      subtitle: 'Use o slot Promoções para divulgar ofertas do mês. Quem clicar abre chat com você — sem aceitar nada, sem fricção.',
      cta: 'Criar promoção',
      onCta: onDoacao,
    },
    // 9) Pedidos de amostra dos clientes
    {
      type: 'standard',
      image: 'https://images.unsplash.com/photo-1521791136064-7986c2920216?w=800&q=80',
      imagePosition: 'center center',
      bg: 'linear-gradient(135deg, #14532d 0%, #3d5a32 50%, #6b8e3d 100%)',
      tag: '🙋 PEDIDOS DE AMOSTRA',
      title: 'Veja pedidos de amostra publicados por clientes',
      subtitle: 'Pessoas pedem amostras na plataforma. Você oferece a sua e fecha o lead na hora — sem disputar atenção.',
      cta: 'Ver pedidos',
      onCta: onMatchIA,
    },
  ] : [];

  // Slide intro comum: contagem regressiva Apple/Android
  // PF mantém também o slide "como funciona a troca". PJ NÃO (foi substituído por slide de amostras).
  const pfIntroSlides: Slide[] = [baseSlides[0], baseSlides[1]];
  const pjIntroSlides: Slide[] = [baseSlides[0]];
  const pfStandardSlides: Slide[] = baseSlides.slice(2);

  // Para PJ: empresa-themed placeholders. Conforme destaques reais entram (até 6), os
  // placeholders do início vão sumindo, dando lugar às empresas reais — mas o conjunto
  // PJ sempre soma ~10 slides com o countdown na frente quando há 0 destaques.
  const pjPlaceholders: Slide[] = pjExtraSlides.slice(Math.min(destaques.length, pjExtraSlides.length));

  const slides: Slide[] = isPJ
    ? [...destaques, ...pjIntroSlides, ...pjPlaceholders]
    : [...destaques, ...pfIntroSlides, ...pfStandardSlides];

  const touchStartX = useRef<number | null>(null);

  const goTo = useCallback((idx: number) => {
    if (animating) return;
    setAnimating(true);
    setTimeout(() => { setCurrent(idx); setAnimating(false); }, 200);
  }, [animating]);

  const prev = () => goTo((current - 1 + slides.length) % slides.length);
  const next = useCallback(() => goTo((current + 1) % slides.length), [current, goTo, slides.length]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) diff > 0 ? next() : prev();
    touchStartX.current = null;
  };

  // Slide 0 (countdown) fica 16s; demais ficam 7s
  useEffect(() => {
    const delay = current === 0 ? 25000 : 7000;
    const timer = setTimeout(next, delay);
    return () => clearTimeout(timer);
  }, [current, next]);

  const s = slides[current];

  return (
    <div className="promo-carousel-root" style={{ width: '100%', marginBottom: 16, borderRadius: 16, overflow: 'hidden', position: 'relative' }}>
      <style>{`.carousel-arrow { display:none; } @media(min-width:768px){ .carousel-arrow { display:flex !important; } }`}</style>
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{
          background: s.bg ?? '#000',
          transition: 'background 0.4s ease',
          height: 160,
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
          opacity: animating ? 0 : 1,
        }}>

        {/* ── Custom slides ── */}
        {s.type === 'custom-countdown' && <CountdownSlide active={current === 0} />}
        {s.type === 'custom-trade'     && <TradeHowSlide />}

        {/* ── Empresa destaque ── */}
        {s.type === 'empresa-destaque' && (
          <>
            <div style={{ width: '48%', flexShrink: 0, position: 'relative', overflow: 'hidden' }}>
              {s.image ? (
                <img key={s.image} src={s.image} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: s.imagePosition ?? 'center center', opacity: animating ? 0 : 1, transition: 'opacity 0.3s ease' }} />
              ) : null}
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, transparent 55%, rgba(0,0,0,0.45) 100%)', pointerEvents: 'none' }} />
            </div>
            <div style={{ flex: 1, padding: '14px 16px 14px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, opacity: animating ? 0 : 1, transition: 'opacity 0.3s ease' }}>
              {s.tag && (
                <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.85)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  {s.tag}
                </span>
              )}
              <p style={{ fontSize: 13, fontWeight: 800, color: '#fff', lineHeight: 1.25, margin: 0 }}>
                {s.title}
              </p>
              {s.username && (
                <p style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.85)', margin: 0 }}>@{s.username}</p>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                {s.contactEmail && (
                  <a href={`mailto:${s.contactEmail}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.18)', border: '1.5px solid rgba(255,255,255,0.4)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 50, textDecoration: 'none' }}>
                    <Mail style={{ width: 12, height: 12 }} /> {s.contactEmail}
                  </a>
                )}
                {s.contactPhone && (
                  <a href={`tel:${s.contactPhone}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.18)', border: '1.5px solid rgba(255,255,255,0.4)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 50, textDecoration: 'none' }}>
                    <PhoneIcon style={{ width: 12, height: 12 }} /> {s.contactPhone}
                  </a>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── Standard slide ── */}
        {s.type === 'standard' && (
          <>
            {/* Imagem — metade esquerda */}
            <div style={{ width: '48%', flexShrink: 0, position: 'relative', overflow: 'hidden' }}>
              <img
                key={s.image}
                src={s.image}
                alt=""
                style={{
                  position: 'absolute', inset: 0, width: '100%', height: '100%',
                  objectFit: 'cover', objectPosition: s.imagePosition ?? 'center center',
                  opacity: animating ? 0 : 1, transition: 'opacity 0.3s ease',
                }}
              />
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(to right, transparent 55%, rgba(0,0,0,0.45) 100%)',
                pointerEvents: 'none',
              }}/>
            </div>

            {/* Texto — metade direita */}
            <div style={{
              flex: 1, padding: '14px 16px 14px 12px',
              display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4,
              opacity: animating ? 0 : 1, transition: 'opacity 0.3s ease',
            }}>
              {s.tag && (
                <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.75)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  {s.tag}
                </span>
              )}
              <p style={{ fontSize: 13, fontWeight: 800, color: '#fff', lineHeight: 1.25, margin: 0 }}>
                {s.title}
              </p>
              <p style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.75)', lineHeight: 1.4, margin: 0 }}>
                {s.subtitle}
              </p>
              {s.cta && (
                <button
                  onClick={s.onCta}
                  style={{
                    marginTop: 6, alignSelf: 'flex-start',
                    background: 'rgba(255,255,255,0.18)',
                    border: '1.5px solid rgba(255,255,255,0.4)',
                    color: '#fff', fontSize: 11, fontWeight: 700,
                    padding: '5px 12px', borderRadius: 50, cursor: 'pointer',
                    backdropFilter: 'blur(4px)', transition: 'background 0.2s',
                  }}
                >
                  {s.cta} →
                </button>
              )}
            </div>
          </>
        )}

        {/* ── Seta esquerda — só desktop ── */}
        <button onClick={prev} className="carousel-arrow" style={{
          position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
          width: 28, height: 28, borderRadius: '50%',
          background: 'rgba(255,255,255,0.18)', border: '1.5px solid rgba(255,255,255,0.35)',
          color: '#fff', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', backdropFilter: 'blur(4px)', zIndex: 2,
        }}>
          <ChevronLeft style={{ width: 16, height: 16 }} />
        </button>

        {/* ── Seta direita — só desktop ── */}
        <button onClick={next} className="carousel-arrow" style={{
          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
          width: 28, height: 28, borderRadius: '50%',
          background: 'rgba(255,255,255,0.18)', border: '1.5px solid rgba(255,255,255,0.35)',
          color: '#fff', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', backdropFilter: 'blur(4px)', zIndex: 2,
        }}>
          <ChevronRight style={{ width: 16, height: 16 }} />
        </button>

        {/* ── Dots ── */}
        <div style={{
          position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: 5, zIndex: 2,
        }}>
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              style={{
                width: i === current ? 18 : 6, height: 6, borderRadius: 3,
                background: i === current ? '#f97316' : 'rgba(255,255,255,0.4)',
                border: 'none', padding: 0, cursor: 'pointer',
                transition: 'all 0.3s ease',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
