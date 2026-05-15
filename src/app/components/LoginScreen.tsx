import { useState, useRef } from 'react';
import { MapPin, Navigation, Eye, EyeOff } from 'lucide-react';
import { useLang } from '../i18n';
import { CountryPicker } from './CountryPicker';

/* ── Ícones de itens trocáveis ── */
function ItemIcon({ index, color, size }: { index: number; color: string; size: number }) {
  const s = size;
  const icons = [
    // 0 – Bicicleta
    <svg key="bike" width={s} height={s} viewBox="0 0 40 40" fill="none">
      <circle cx="10" cy="28" r="7" stroke={color} strokeWidth="2.5"/>
      <circle cx="30" cy="28" r="7" stroke={color} strokeWidth="2.5"/>
      <circle cx="10" cy="28" r="2" fill={color}/>
      <circle cx="30" cy="28" r="2" fill={color}/>
      <path d="M10 28 L20 14 L30 28" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M20 14 L22 28" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <path d="M16 14 L24 14" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M18 11 L22 11" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>,
    // 1 – Smartphone
    <svg key="phone" width={s} height={s} viewBox="0 0 40 40" fill="none">
      <rect x="11" y="3" width="18" height="34" rx="3.5" fill={color}/>
      <rect x="14" y="7" width="12" height="20" rx="1.5" fill="white" opacity="0.35"/>
      <circle cx="20" cy="32" r="2" fill="white" opacity="0.7"/>
      <rect x="17" y="5" width="6" height="1.5" rx="0.75" fill="white" opacity="0.5"/>
    </svg>,
    // 2 – Carro
    <svg key="car" width={s} height={s} viewBox="0 0 40 40" fill="none">
      <path d="M5 24 L8 17 Q10 14 13 14 L27 14 Q30 14 32 17 L35 24 L35 30 Q35 32 33 32 L7 32 Q5 32 5 30 Z" fill={color}/>
      <path d="M10 14 L12 8 Q13 6 15 6 L25 6 Q27 6 28 8 L30 14" fill={color} opacity="0.7"/>
      <rect x="11" y="8" width="7" height="6" rx="1" fill="white" opacity="0.4"/>
      <rect x="22" y="8" width="7" height="6" rx="1" fill="white" opacity="0.4"/>
      <circle cx="12" cy="31" r="3.5" fill="white" opacity="0.3"/>
      <circle cx="28" cy="31" r="3.5" fill="white" opacity="0.3"/>
    </svg>,
    // 3 – Moto
    <svg key="moto" width={s} height={s} viewBox="0 0 40 40" fill="none">
      <circle cx="9" cy="29" r="6.5" stroke={color} strokeWidth="2.5"/>
      <circle cx="31" cy="29" r="6.5" stroke={color} strokeWidth="2.5"/>
      <circle cx="9" cy="29" r="2" fill={color}/>
      <circle cx="31" cy="29" r="2" fill={color}/>
      <path d="M9 29 L16 18 L24 18 L31 29" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M16 18 L18 13 L22 13 L22 18" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M24 18 L29 18 L31 22" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <path d="M28 14 L32 14 L32 18" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>,
    // 4 – Camiseta
    <svg key="shirt" width={s} height={s} viewBox="0 0 40 40" fill="none">
      <path d="M14 5 Q20 10 26 5 L36 13 L30 18 L28 16 L28 35 L12 35 L12 16 L10 18 L4 13 Z" fill={color}/>
      <path d="M14 5 Q20 10 26 5" stroke="white" strokeWidth="1" opacity="0.4" fill="none"/>
    </svg>,
    // 5 – Mão doando
    <svg key="hand" width={s} height={s} viewBox="0 0 40 40" fill="none">
      <path d="M8 23 Q7 19 11 18 Q14 17 15 20 L15 15 Q15 12 18 12 Q21 12 21 15 L21 19 Q21 16 24 16 Q27 16 27 19 L27 21 Q27 18 30 18 Q33 18 33 21 L33 28 Q33 34 27 35 L13 35 Q9 35 8 31 Z" fill={color}/>
      <path d="M13 9 L20 4 L27 9" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <rect x="17" y="4" width="6" height="5" rx="1" fill={color}/>
    </svg>,
    // 6 – Livro
    <svg key="book" width={s} height={s} viewBox="0 0 40 40" fill="none">
      <path d="M7 6 Q7 4 9 4 L20 4 L20 36 L9 36 Q7 36 7 34 Z" fill={color}/>
      <path d="M33 6 Q33 4 31 4 L20 4 L20 36 L31 36 Q33 36 33 34 Z" fill={color} opacity="0.75"/>
      <line x1="20" y1="4" x2="20" y2="36" stroke="white" strokeWidth="1.5" opacity="0.5"/>
      <path d="M10 11 L18 11" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
      <path d="M10 15 L18 15" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
      <path d="M10 19 L16 19" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
    </svg>,
    // 7 – Tênis
    <svg key="shoe" width={s} height={s} viewBox="0 0 40 40" fill="none">
      <path d="M4 28 Q4 23 8 21 L16 19 Q18 14 22 14 L27 14 Q31 14 33 17 L37 23 Q39 26 37 28 Q30 30 20 30 Z" fill={color}/>
      <path d="M4 28 L37 28 Q39 30 37 32 L6 32 Q4 32 4 30 Z" fill={color} opacity="0.8"/>
      <path d="M14 21 L14 14" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
      <path d="M18 19 L18 14" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
    </svg>,
    // 8 – Relógio
    <svg key="watch" width={s} height={s} viewBox="0 0 40 40" fill="none">
      <rect x="16" y="2" width="8" height="8" rx="2" fill={color}/>
      <rect x="16" y="30" width="8" height="8" rx="2" fill={color}/>
      <circle cx="20" cy="20" r="11" fill={color}/>
      <circle cx="20" cy="20" r="8" fill="white" opacity="0.25"/>
      <path d="M20 14 L20 20 L24 20" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>,
    // 9 – Notebook
    <svg key="laptop" width={s} height={s} viewBox="0 0 40 40" fill="none">
      <rect x="7" y="8" width="26" height="18" rx="2" fill={color}/>
      <rect x="10" y="11" width="20" height="13" rx="1" fill="white" opacity="0.3"/>
      <path d="M3 28 L7 26 L33 26 L37 28 Q38 31 35 31 L5 31 Q2 31 3 28 Z" fill={color} opacity="0.85"/>
      <rect x="16" y="26" width="8" height="2" rx="1" fill="white" opacity="0.4"/>
    </svg>,
    // 10 – Violão/Guitarra
    <svg key="guitar" width={s} height={s} viewBox="0 0 40 40" fill="none">
      <rect x="18" y="2" width="4" height="15" rx="2" fill={color}/>
      <rect x="15" y="2" width="10" height="4" rx="2" fill={color}/>
      <ellipse cx="20" cy="29" rx="9" ry="10" fill={color}/>
      <circle cx="20" cy="29" r="4" fill="white" opacity="0.2"/>
      <path d="M13 21 L27 21" stroke={color} strokeWidth="1.5"/>
      <path d="M18 4 L18 8 M22 4 L22 8" stroke="white" strokeWidth="1" opacity="0.5"/>
    </svg>,
    // 11 – Planta
    <svg key="plant" width={s} height={s} viewBox="0 0 40 40" fill="none">
      <path d="M20 36 L20 20" stroke={color} strokeWidth="3" strokeLinecap="round"/>
      <path d="M20 22 Q14 16 8 11 Q8 20 15 24 Q17.5 25 20 22 Z" fill={color}/>
      <path d="M20 27 Q26 21 33 16 Q33 25 26 29 Q23 31 20 27 Z" fill={color} opacity="0.85"/>
      <rect x="14" y="34" width="12" height="4" rx="2" fill={color} opacity="0.6"/>
    </svg>,
    // 12 – Bolsa
    <svg key="bag" width={s} height={s} viewBox="0 0 40 40" fill="none">
      <path d="M15 12 Q15 6 20 6 Q25 6 25 12" stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      <rect x="7" y="12" width="26" height="24" rx="4" fill={color}/>
      <rect x="15" y="20" width="10" height="5" rx="2.5" fill="white" opacity="0.35"/>
    </svg>,
    // 13 – Sofá
    <svg key="sofa" width={s} height={s} viewBox="0 0 40 40" fill="none">
      <rect x="9" y="16" width="22" height="13" rx="4" fill={color}/>
      <rect x="5" y="20" width="7" height="9" rx="3" fill={color} opacity="0.9"/>
      <rect x="28" y="20" width="7" height="9" rx="3" fill={color} opacity="0.9"/>
      <rect x="9" y="13" width="22" height="7" rx="3" fill={color} opacity="0.8"/>
      <rect x="11" y="29" width="5" height="5" rx="1.5" fill={color} opacity="0.7"/>
      <rect x="24" y="29" width="5" height="5" rx="1.5" fill={color} opacity="0.7"/>
    </svg>,
    // 14 – Controle de videogame
    <svg key="game" width={s} height={s} viewBox="0 0 40 40" fill="none">
      <path d="M8 18 Q7 12 14 12 L26 12 Q33 12 32 18 L30 28 Q29 33 25 33 Q22 33 20 30 Q18 33 15 33 Q11 33 10 28 Z" fill={color}/>
      <path d="M14 18 L14 24 M11 21 L17 21" stroke="white" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="26" cy="19" r="2" fill="white" opacity="0.7"/>
      <circle cx="29" cy="22" r="2" fill="white" opacity="0.7"/>
      <circle cx="23" cy="22" r="2" fill="white" opacity="0.7"/>
      <circle cx="26" cy="25" r="2" fill="white" opacity="0.7"/>
    </svg>,
    // 15 – Chave inglesa
    <svg key="wrench" width={s} height={s} viewBox="0 0 40 40" fill="none">
      <path d="M27 4 Q35 8 33 16 Q31 20 27 20 L24 23 L12 35 Q9 38 6 35 Q3 32 6 29 L18 17 L21 14 Q21 10 25 7 Z" fill={color}/>
      <circle cx="9" cy="32" r="3" fill="white" opacity="0.35"/>
      <path d="M27 7 L30 10 L27 13 L24 10 Z" fill="white" opacity="0.35"/>
    </svg>,
    // 16 – Bola
    <svg key="ball" width={s} height={s} viewBox="0 0 40 40" fill="none">
      <circle cx="20" cy="20" r="16" fill={color}/>
      <path d="M4 20 Q12 14 20 20 Q28 26 36 20" stroke="white" strokeWidth="1.5" fill="none" opacity="0.5"/>
      <path d="M20 4 Q14 12 20 20 Q26 28 20 36" stroke="white" strokeWidth="1.5" fill="none" opacity="0.5"/>
    </svg>,
    // 17 – Câmera
    <svg key="camera" width={s} height={s} viewBox="0 0 40 40" fill="none">
      <path d="M5 15 Q5 12 8 12 L15 12 L17 8 L23 8 L25 12 L32 12 Q35 12 35 15 L35 30 Q35 33 32 33 L8 33 Q5 33 5 30 Z" fill={color}/>
      <circle cx="20" cy="22" r="7" fill="white" opacity="0.2"/>
      <circle cx="20" cy="22" r="4.5" fill={color} opacity="0.5"/>
      <circle cx="29" cy="15" r="2" fill="white" opacity="0.5"/>
    </svg>,
    // 18 – Fone de ouvido
    <svg key="headphones" width={s} height={s} viewBox="0 0 40 40" fill="none">
      <path d="M8 22 Q8 8 20 8 Q32 8 32 22" stroke={color} strokeWidth="3" fill="none" strokeLinecap="round"/>
      <rect x="5" y="21" width="7" height="12" rx="3.5" fill={color}/>
      <rect x="28" y="21" width="7" height="12" rx="3.5" fill={color}/>
    </svg>,
    // 19 – Urso de pelúcia
    <svg key="teddy" width={s} height={s} viewBox="0 0 40 40" fill="none">
      <circle cx="10" cy="12" r="5" fill={color} opacity="0.9"/>
      <circle cx="30" cy="12" r="5" fill={color} opacity="0.9"/>
      <circle cx="20" cy="23" r="12" fill={color}/>
      <circle cx="15" cy="20" r="2.5" fill="white" opacity="0.5"/>
      <circle cx="25" cy="20" r="2.5" fill="white" opacity="0.5"/>
      <ellipse cx="20" cy="25" rx="4" ry="3" fill={color} opacity="0.65"/>
      <path d="M16 29 Q20 32 24 29" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.6"/>
    </svg>,
  ];
  return <>{icons[index % icons.length]}</>;
}

const ITEM_COLORS = [
  '#7c3aed','#f97316','#ec4899','#10b981','#3b82f6',
  '#f59e0b','#8b5cf6','#ef4444','#06b6d4','#84cc16',
  '#a855f7','#14b8a6','#fb923c','#6366f1','#22c55e',
  '#e879f9','#f43f5e','#0ea5e9','#d946ef','#fbbf24',
];

function GlassBubble({ color, itemIndex, size }: { color: string; itemIndex: number; size: number }) {
  const hex = color.replace('#', '');
  const r = parseInt(hex.slice(0,2),16);
  const g = parseInt(hex.slice(2,4),16);
  const b = parseInt(hex.slice(4,6),16);
  const bubbleSize = size + 20;
  return (
    <div style={{
      position: 'relative',
      width: bubbleSize,
      height: bubbleSize,
      borderRadius: '50%',
      background: `
        radial-gradient(ellipse at 35% 30%, rgba(255,255,255,0.60) 0%, rgba(255,255,255,0.10) 60%),
        radial-gradient(ellipse at 70% 75%, rgba(${r},${g},${b},0.25) 0%, transparent 70%),
        rgba(${r},${g},${b},0.15)
      `,
      border: '1.5px solid rgba(255,255,255,0.70)',
      boxShadow: `0 2px 8px rgba(${r},${g},${b},0.18), inset 0 1.5px 3px rgba(255,255,255,0.75)`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <ItemIcon index={itemIndex} color={color} size={size} />
    </div>
  );
}

function CircleRing({
  count, radius, iconSize, duration, direction, itemOffset = 0,
}: { count: number; radius: number; iconSize: number; duration: number; direction: 'cw' | 'ccw'; itemOffset?: number }) {
  const cls = direction === 'cw' ? 'trv-cw' : 'trv-ccw';
  const clsCounter = direction === 'cw' ? 'trv-ccw' : 'trv-cw';
  const bubbleSize = iconSize + 20;
  return (
    <div
      className={cls}
      style={{ position: 'absolute', width: 0, height: 0, animationDuration: `${duration}s`, willChange: 'transform' }}
    >
      {Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * 360;
        const itemIndex = (i + itemOffset);
        const color = ITEM_COLORS[itemIndex % ITEM_COLORS.length];
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              transform: `rotate(${angle}deg) translateX(${radius}px)`,
              width: bubbleSize, height: bubbleSize,
              marginTop: -bubbleSize / 2, marginLeft: -bubbleSize / 2,
            }}
          >
            <div className={clsCounter} style={{ animationDuration: `${duration}s`, willChange: 'transform' }}>
              <GlassBubble color={color} itemIndex={itemIndex} size={iconSize} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Animação de viagem: itens voando horizontal em loop infinito ──────────
const TRAVEL_ITEMS = [
  // aviões, ingressos, livros, dinheiro, mapas, passaportes, malas, bandeiras…
  '✈️', '🛫', '🛬', '📚', '📖', '📕', '📗', '📘',
  '🎫', '🛂', '🛄', '🧳', '🌍', '🌎', '🌏', '🗺️',
  '💶', '💵', '💴', '💷', '💰', '💳',
  '🇧🇷', '🇺🇸', '🇬🇧', '🇫🇷', '🇩🇪', '🇪🇸', '🇮🇹', '🇯🇵', '🇨🇦', '🇦🇺',
  '🇵🇹', '🇮🇪', '🇳🇱', '🇨🇭', '🇸🇪', '🇳🇴', '🇲🇽', '🇦🇷',
  '🏛️', '🗽', '🗼', '🏰', '⛩️', '🕌', '⛪', '🕍',
  '☕', '🥐', '🍷', '🍣', '🍕', '🌮',
  '🎓', '📝', '✏️', '🖋️', '📓', '📒',
];

interface FlyingItem {
  emoji: string;
  topPct: number;
  size: number;
  duration: number;
  delay: number;
  direction: 'lr' | 'rl';
}

function generateFlyingItems(count: number): FlyingItem[] {
  const items: FlyingItem[] = [];
  for (let i = 0; i < count; i++) {
    const emoji = TRAVEL_ITEMS[Math.floor(Math.random() * TRAVEL_ITEMS.length)];
    items.push({
      emoji,
      topPct: Math.random() * 95,           // 0–95% vertical
      size: 22 + Math.random() * 36,        // 22–58 px
      duration: 14 + Math.random() * 22,    // 14–36 s
      delay: -Math.random() * 30,           // arranque escalonado
      direction: Math.random() < 0.5 ? 'lr' : 'rl',
    });
  }
  return items;
}

function TravelAnimation() {
  // Memoiza pra não regerar a cada render (evita flicker)
  const itemsRef = useRef<FlyingItem[]>();
  if (!itemsRef.current) itemsRef.current = generateFlyingItems(48);
  const items = itemsRef.current;

  return (
    <>
      <style>{`
        @keyframes fly-lr { from { transform: translateX(-10vw); } to { transform: translateX(110vw); } }
        @keyframes fly-rl { from { transform: translateX(110vw); } to { transform: translateX(-10vw); } }
        .fly-lr { animation: fly-lr linear infinite; }
        .fly-rl { animation: fly-rl linear infinite; }
        @keyframes bob { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-8px) rotate(2deg); } }
        .bob { animation: bob 3.6s ease-in-out infinite; }
      `}</style>
      <div style={{
        position: 'absolute', inset: 0,
        overflow: 'hidden', pointerEvents: 'none',
        opacity: 0.55,
      }}>
        {items.map((it, i) => (
          <div key={i}
            className={it.direction === 'lr' ? 'fly-lr' : 'fly-rl'}
            style={{
              position: 'absolute',
              top: `${it.topPct}%`,
              left: 0,
              animationDuration: `${it.duration}s`,
              animationDelay: `${it.delay}s`,
              willChange: 'transform',
            }}
          >
            <div className="bob" style={{
              fontSize: `${it.size}px`,
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.18))',
              transform: it.direction === 'rl' ? 'scaleX(-1)' : undefined,
            }}>
              {it.emoji}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
import { supabase } from '../../lib/supabase';
import { apiBase } from '../utils/apiUrl';
import { PrivacyModal } from './PrivacyModal';
import { VerificationScreen } from './VerificationScreen';
import { TwoFactorModal } from './TwoFactorModal';

interface LoginScreenProps {
  onLogin: (username: string, isNewUser?: boolean, tipoConta?: 'pf' | 'pj') => void;
}

// Busca cidade/estado pelo CEP via ViaCEP
async function buscarCEP(cep: string): Promise<{ cidade: string; estado: string } | null> {
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep.replace(/\D/g, '')}/json/`);
    const d = await r.json();
    if (d.erro) return null;
    return { cidade: d.localidade, estado: d.uf };
  } catch { return null; }
}

// Pede geolocalização e retorna lat/lng
function pedirGeolocalizacao(): Promise<{ lat: number; lng: number } | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 8000 }
    );
  });
}

// Distância em km entre dois pontos (Haversine)
export function distanciaKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Formata CPF: 000.000.000-00
function formatCPF(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return d.slice(0,3) + '.' + d.slice(3);
  if (d.length <= 9) return d.slice(0,3) + '.' + d.slice(3,6) + '.' + d.slice(6);
  return d.slice(0,3) + '.' + d.slice(3,6) + '.' + d.slice(6,9) + '-' + d.slice(9);
}

// Formata CNPJ: 00.000.000/0000-00
function formatCNPJ(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return d.slice(0,2) + '.' + d.slice(2);
  if (d.length <= 8) return d.slice(0,2) + '.' + d.slice(2,5) + '.' + d.slice(5);
  if (d.length <= 12) return d.slice(0,2) + '.' + d.slice(2,5) + '.' + d.slice(5,8) + '/' + d.slice(8);
  return d.slice(0,2) + '.' + d.slice(2,5) + '.' + d.slice(5,8) + '/' + d.slice(8,12) + '-' + d.slice(12);
}

const SEGMENTOS = [
  'Tecnologia', 'Varejo / Comércio', 'Alimentação', 'Saúde e Bem-estar',
  'Educação', 'Moda e Vestuário', 'Serviços Gerais', 'Construção / Reforma',
  'Transportes / Logística', 'Arte e Design', 'Esportes / Lazer',
  'Beleza / Estética', 'Agricultura / Agronegócio', 'Outros',
];

const TRANSLATIONS = {
  pt: {
    tagline: '"Troque o que quiser, doe o que quiser"',
    tabLogin: 'Entrar', tabRegister: 'Cadastrar',
    emailLabel: 'E-mail', emailPlaceholder: 'seu@email.com',
    passwordLabel: 'Senha', passwordPlaceholder: '••••••••',
    passwordMinPlaceholder: 'Mínimo 6 caracteres',
    forgotPassword: 'Esqueceu a senha?',
    loginBtn: 'Entrar', loggingIn: 'Entrando...',
    noAccount: 'Não tem conta?', signUpLink: 'Cadastre-se',
    hasAccount: 'Já tem conta?', loginLink: 'Entrar',
    pfBtn: '👤 Pessoa Física', pjBtn: '🏢 Empresa',
    companyDataTitle: 'Dados da empresa',
    cnpjLabel: 'CNPJ', cnpjPlaceholder: '00.000.000/0000-00',
    companyNameLabel: 'Nome da empresa', companyNamePlaceholder: 'Razão social ou nome fantasia',
    segmentLabel: 'Segmento', segmentPlaceholder: 'Selecione o segmento...',
    usernameLabel: (pj: boolean) => pj ? 'Nome de usuário (perfil público)' : 'Nome de usuário',
    usernamePlaceholder: (pj: boolean) => pj ? 'Nome público da empresa no app' : 'Como quer ser chamado',
    locationTitle: 'Sua localização',
    locationHint: '(para encontrar trocas e doações perto de você)',
    cepLabel: 'CEP', cepPlaceholder: '00000-000', cepSearching: 'Buscando CEP...',
    cityLabel: 'Cidade', cityPlaceholder: 'Sua cidade',
    stateLabel: 'Estado', statePlaceholder: 'UF',
    gpsNotice: 'Ao criar sua conta, o app pode solicitar acesso à sua localização GPS para mostrar anúncios mais próximos de você. Você pode recusar e usar apenas o CEP.',
    privacyCheckbox: 'Li e aceito a',
    privacyLink: 'Política de Privacidade',
    privacyCheckboxSuffix: 'do Papo de Alunos. Estou ciente sobre o uso dos meus dados conforme a LGPD.',
    notifCheckbox: 'Autorizo receber mensagens, notificações push e novidades do Papo de Alunos — avisos de novos meets de intercâmbio, posts no feed, comentários nos meus stories e atualizações da minha jornada.',
    notifOptional: '(opcional)',
    registerBtn: 'Criar conta grátis', registering: 'Cadastrando...',
    forgotTitle: 'Digite o e-mail cadastrado e enviaremos um link para você criar uma nova senha.',
    forgotEmailLabel: 'E-mail cadastrado',
    sendResetBtn: '📨 Enviar link de redefinição', sending: 'Enviando...',
    backToLogin: '← Voltar ao login',
    resetSentTitle: 'Link enviado!',
    resetSentMsg: (email: string) => `Verifique sua caixa de entrada em ${email} e clique no link para criar uma nova senha.`,
    errInvalidCnpj: 'Digite um CNPJ válido com 14 dígitos.',
    errNoCompanyName: 'Digite o nome da empresa.',
    errNoSegment: 'Selecione o segmento da empresa.',
    errNoPrivacy: 'Você precisa aceitar a Política de Privacidade para continuar.',
    errNoPhone: 'Digite seu telefone com DDD (10 ou 11 dígitos).',
    errEmailExists: 'Este e-mail já está cadastrado.',
    errRegister: 'Erro ao cadastrar. Tente novamente.',
    errNoEmail: 'Digite seu e-mail cadastrado.',
    errWrongCredentials: (left: number) => `E-mail ou senha incorretos. ${left} tentativa${left > 1 ? 's' : ''} restante${left > 1 ? 's' : ''}.`,
    errLocked: (email: string) => `Senha incorreta por 3 vezes. Enviamos um link de redefinição para ${email}.`,
    resetEmailSent: (email: string) => `Link de redefinição enviado para ${email}. Verifique sua caixa de entrada!`,
    notifSendMsg: (msg: string) => msg,
    strong: { chat: 'mensagens', push: 'notificações push' },
  },
  en: {
    tagline: '"Swap what you want, donate what you don\'t use"',
    tabLogin: 'Log in', tabRegister: 'Sign up',
    emailLabel: 'E-mail', emailPlaceholder: 'you@email.com',
    passwordLabel: 'Password', passwordPlaceholder: '••••••••',
    passwordMinPlaceholder: 'At least 6 characters',
    forgotPassword: 'Forgot password?',
    loginBtn: 'Log in', loggingIn: 'Logging in...',
    noAccount: "Don't have an account?", signUpLink: 'Sign up',
    hasAccount: 'Already have an account?', loginLink: 'Log in',
    pfBtn: '👤 Individual', pjBtn: '🏢 Business',
    companyDataTitle: 'Business details',
    cnpjLabel: 'CNPJ (Tax ID)', cnpjPlaceholder: '00.000.000/0000-00',
    companyNameLabel: 'Company name', companyNamePlaceholder: 'Trade name or legal name',
    segmentLabel: 'Segment', segmentPlaceholder: 'Select a segment...',
    usernameLabel: (pj: boolean) => pj ? 'Username (public profile)' : 'Username',
    usernamePlaceholder: (pj: boolean) => pj ? 'Public company name in the app' : 'What should we call you?',
    locationTitle: 'Your location',
    locationHint: '(to find swaps and donations near you)',
    cepLabel: 'Postal code', cepPlaceholder: '00000-000', cepSearching: 'Looking up postal code...',
    cityLabel: 'City', cityPlaceholder: 'Your city',
    stateLabel: 'State', statePlaceholder: 'ST',
    gpsNotice: 'When creating your account, the app may request GPS location access to show listings closer to you. You can decline and use only the postal code.',
    privacyCheckbox: 'I have read and agree to the',
    privacyLink: 'Privacy Policy',
    privacyCheckboxSuffix: 'of Papo de Alunos. I acknowledge the use of my data under LGPD.',
    notifCheckbox: 'I authorize receiving messages, push notifications and updates from Papo de Alunos — alerts for new exchange meets, feed posts, comments on my stories and journey updates.',
    notifOptional: '(optional)',
    registerBtn: 'Create free account', registering: 'Creating account...',
    forgotTitle: 'Enter your registered e-mail and we will send you a link to set a new password.',
    forgotEmailLabel: 'Registered e-mail',
    sendResetBtn: '📨 Send reset link', sending: 'Sending...',
    backToLogin: '← Back to login',
    resetSentTitle: 'Link sent!',
    resetSentMsg: (email: string) => `Check your inbox at ${email} and click the link to create a new password.`,
    errInvalidCnpj: 'Please enter a valid 14-digit CNPJ.',
    errNoCompanyName: 'Please enter the company name.',
    errNoSegment: 'Please select the company segment.',
    errNoPrivacy: 'You must accept the Privacy Policy to continue.',
    errNoPhone: 'Please enter your phone with area code (10 or 11 digits).',
    errEmailExists: 'This e-mail is already registered.',
    errRegister: 'Registration failed. Please try again.',
    errNoEmail: 'Please enter your registered e-mail.',
    errWrongCredentials: (left: number) => `Incorrect e-mail or password. ${left} attempt${left > 1 ? 's' : ''} remaining.`,
    errLocked: (email: string) => `Wrong password 3 times. We sent a reset link to ${email}.`,
    resetEmailSent: (email: string) => `Reset link sent to ${email}. Check your inbox!`,
    notifSendMsg: (msg: string) => msg,
    strong: { chat: 'chat messages', push: 'push notifications' },
  },
  es: {
    tagline: '"Intercambia lo que quieras, dona lo que no uses"',
    tabLogin: 'Entrar', tabRegister: 'Registrarse',
    emailLabel: 'Correo', emailPlaceholder: 'tu@correo.com',
    passwordLabel: 'Contraseña', passwordPlaceholder: '••••••••',
    passwordMinPlaceholder: 'Mínimo 6 caracteres',
    forgotPassword: '¿Olvidaste tu contraseña?',
    loginBtn: 'Entrar', loggingIn: 'Entrando...',
    noAccount: '¿No tienes cuenta?', signUpLink: 'Regístrate',
    hasAccount: '¿Ya tienes cuenta?', loginLink: 'Entrar',
    pfBtn: '👤 Persona física', pjBtn: '🏢 Empresa',
    companyDataTitle: 'Datos de la empresa',
    cnpjLabel: 'CNPJ', cnpjPlaceholder: '00.000.000/0000-00',
    companyNameLabel: 'Nombre de la empresa', companyNamePlaceholder: 'Razón social o nombre comercial',
    segmentLabel: 'Segmento', segmentPlaceholder: 'Selecciona un segmento...',
    usernameLabel: (pj: boolean) => pj ? 'Nombre de usuario (perfil público)' : 'Nombre de usuario',
    usernamePlaceholder: (pj: boolean) => pj ? 'Nombre público de la empresa en la app' : '¿Cómo quieres que te llamen?',
    locationTitle: 'Tu ubicación',
    locationHint: '(para encontrar intercambios y donaciones cerca de ti)',
    cepLabel: 'Código postal', cepPlaceholder: '00000-000', cepSearching: 'Buscando código postal...',
    cityLabel: 'Ciudad', cityPlaceholder: 'Tu ciudad',
    stateLabel: 'Estado', statePlaceholder: 'UF',
    gpsNotice: 'Al crear tu cuenta, la app puede solicitar acceso a tu ubicación GPS para mostrarte anuncios más cercanos. Puedes rechazarlo y usar solo el código postal.',
    privacyCheckbox: 'He leído y acepto la',
    privacyLink: 'Política de Privacidad',
    privacyCheckboxSuffix: 'de Papo de Alunos. Estoy al tanto del uso de mis datos.',
    notifCheckbox: 'Autorizo recibir mensajes, notificaciones push y novedades de Papo de Alunos — avisos de nuevos meets, posts del feed, comentarios en mis stories y actualizaciones de mi viaje.',
    notifOptional: '(opcional)',
    registerBtn: 'Crear cuenta gratis', registering: 'Creando cuenta...',
    forgotTitle: 'Ingresa tu correo registrado y te enviaremos un enlace para crear una nueva contraseña.',
    forgotEmailLabel: 'Correo registrado',
    sendResetBtn: '📨 Enviar enlace de restablecimiento', sending: 'Enviando...',
    backToLogin: '← Volver al inicio de sesión',
    resetSentTitle: '¡Enlace enviado!',
    resetSentMsg: (email: string) => `Revisa tu bandeja de entrada en ${email} y haz clic en el enlace para crear una nueva contraseña.`,
    errInvalidCnpj: 'Ingresa un CNPJ válido con 14 dígitos.',
    errNoCompanyName: 'Ingresa el nombre de la empresa.',
    errNoSegment: 'Selecciona el segmento de la empresa.',
    errNoPrivacy: 'Debes aceptar la Política de Privacidad para continuar.',
    errNoPhone: 'Ingresa tu teléfono con código de área (10 o 11 dígitos).',
    errEmailExists: 'Este correo ya está registrado.',
    errRegister: 'Error al registrarse. Inténtalo de nuevo.',
    errNoEmail: 'Ingresa tu correo registrado.',
    errWrongCredentials: (left: number) => `Correo o contraseña incorrectos. ${left} intento${left > 1 ? 's' : ''} restante${left > 1 ? 's' : ''}.`,
    errLocked: (email: string) => `Contraseña incorrecta 3 veces. Enviamos un enlace de restablecimiento a ${email}.`,
    resetEmailSent: (email: string) => `Enlace de restablecimiento enviado a ${email}. ¡Revisa tu bandeja de entrada!`,
    notifSendMsg: (msg: string) => msg,
    strong: { chat: 'mensajes de chat', push: 'notificaciones push' },
  },
};

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const { lang, setLang } = useLang();
  const T = TRANSLATIONS[lang];
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [tipoConta, setTipoConta] = useState<'pf' | 'pj'>('pf');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cpf, setCpf] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [nomeEmpresa, setNomeEmpresa] = useState('');
  const [segmento, setSegmento] = useState('');
  const [cep, setCep] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('');
  const [telefone, setTelefone] = useState('');
  const [paisOrigem, setPaisOrigem] = useState('BR');
  const [paisDestino, setPaisDestino] = useState('US');
  const [escola, setEscola] = useState('');
  const [consultor, setConsultor] = useState('');
  const [cepLoading, setCepLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [aceitouPolitica, setAceitouPolitica] = useState(false);
  const [aceitouNotificacoes, setAceitouNotificacoes] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [verificationUser, setVerificationUser] = useState<{ id: string; username: string; email: string } | null>(null);
  const [show2FA, setShow2FA] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [resetSent, setResetSent] = useState(false);

  const handleCepBlur = async () => {
    const digits = cep.replace(/\D/g, '');
    if (digits.length !== 8) return;
    setCepLoading(true);
    const result = await buscarCEP(digits);
    if (result) { setCidade(result.cidade); setEstado(result.estado); }
    setCepLoading(false);
  };

  const sendResetEmail = async (targetEmail: string) => {
    await supabase.auth.resetPasswordForEmail(targetEmail.trim().toLowerCase(), {
      redirectTo: 'https://papodealunos.com',
    });
    setResetSent(true);
    setFailedAttempts(0);
    setSuccess(T.resetEmailSent(targetEmail));
    setError('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) throw err;
      setFailedAttempts(0);
      // Busca username pelo email (mais recente) — evita problema com múltiplos rows por email
      const { data: rows } = await supabase
        .from('usuarios').select('username,created_at').eq('email', email.trim().toLowerCase()).order('created_at', { ascending: false }).limit(1);
      onLogin(rows?.[0]?.username || email.split('@')[0]);
    } catch {
      const next = failedAttempts + 1;
      setFailedAttempts(next);
      if (next >= 3) {
        setError(T.errLocked(email));
        if (email.trim()) await sendResetEmail(email);
      } else {
        setError(T.errWrongCredentials(3 - next));
      }
    } finally { setLoading(false); }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError(T.errNoEmail); return; }
    setLoading(true); setError('');
    await sendResetEmail(email);
    setLoading(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !cidade.trim()) return;
    if (tipoConta === 'pj' && cnpj.replace(/\D/g,'').length !== 14) { setError(T.errInvalidCnpj); return; }
    if (tipoConta === 'pj' && !nomeEmpresa.trim()) { setError(T.errNoCompanyName); return; }
    if (tipoConta === 'pj' && !segmento) { setError(T.errNoSegment); return; }
    // Telefone obrigatório (DDD + número, 10 ou 11 dígitos)
    {
      const digits = telefone.replace(/\D/g, '');
      if (digits.length < 10 || digits.length > 11) { setError(T.errNoPhone); return; }
    }
    if (!aceitouPolitica) { setError(T.errNoPrivacy); return; }
    setLoading(true); setError('');
    try {
      const { data, error: err } = await supabase.auth.signUp({ email, password });
      if (err) throw err;
      const user = data.user;
      if (!user) { setSuccess('Verifique seu e-mail para confirmar o cadastro.'); setMode('login'); return; }

      // Pede geolocalização
      let lat: number | null = null;
      let lng: number | null = null;
      const geo = await pedirGeolocalizacao();
      if (geo) { lat = geo.lat; lng = geo.lng; }

      await supabase.from('usuarios').upsert({
        id: user.id,
        username: username.trim(),
        email: email.trim(),
        cidade: cidade.trim(),
        estado: estado.trim(),
        lat,
        lng,
        tipo_conta: tipoConta,
        cpf: tipoConta === 'pf' ? cpf.replace(/\D/g,'') : null,
        cnpj: tipoConta === 'pj' ? cnpj.replace(/\D/g,'') : null,
        nome_empresa: tipoConta === 'pj' ? nomeEmpresa.trim() : null,
        segmento: tipoConta === 'pj' ? segmento : null,
        telefone: telefone.replace(/\D/g, '') || null,
      }, { onConflict: 'username' });

      // Notifica admins sobre novo cadastro (não bloqueia o fluxo se falhar)
      const adminEmails = ['guilherme_lima_bh@yahoo.com.br', 'yuriking33@gmail.com'];
      adminEmails.forEach(adminEmail => {
        fetch(`${apiBase()}/api/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipientEmail: adminEmail,
            type: 'admin_signup',
            fromUsername: username.trim(),
            extra: {
              email: email.trim(),
              cidade: cidade.trim(),
              estado: estado.trim(),
              tipoConta,
              nomeEmpresa: tipoConta === 'pj' ? nomeEmpresa.trim() : undefined,
            },
          }),
        }).catch(() => {});
      });

      // Salva tipo_conta no cache local para o tutorial abrir corretamente
      try {
        const prev = JSON.parse(localStorage.getItem('papo_profile') || '{}');
        localStorage.setItem('papo_profile', JSON.stringify({ ...prev, tipo_conta: tipoConta }));
      } catch {}

      // Salva país de origem/destino para a barra de progresso da viagem
      const uname = username.trim();
      if (uname) {
        localStorage.setItem(`papo_origem_${uname}`, paisOrigem);
        localStorage.setItem(`papo_destino_${uname}`, paisDestino);
        try {
          localStorage.setItem(`papo_student_profile_${uname}`, JSON.stringify({
            escola: escola.trim(),
            consultor: consultor.trim(),
            comprasStore: 0,
            cursosIntercambio: 0,
          }));
        } catch {}
      }

      // Broadcast: novo cadastro -> notifica os outros alunos
      try {
        await supabase.from('papo_new_signups').insert({
          username: uname,
          escola: escola.trim() || null,
          consultor: consultor.trim() || null,
          pais_origem: paisOrigem,
          pais_destino: paisDestino,
        });
      } catch (e) {
        console.warn('[signup-broadcast] table missing or insert failed (não bloqueia o cadastro)', e);
      }

      // Verificação em 2 etapas do email antes de prosseguir
      setVerificationUser({ id: user.id, username: username.trim(), email: email.trim() });
      setShow2FA(true);
    } catch (err: any) {
      if (err.message?.includes('already registered')) setError(T.errEmailExists);
      else setError(T.errRegister);
    } finally { setLoading(false); }
  };

  // Papo de Alunos: login E cadastro sempre usam o layout Cassidy/serif (era PJ no Papo de Alunos)
  const isEmpresaMode = true;
  const inputClass = isEmpresaMode
    ? 'w-full px-0 py-2.5 border-0 border-b border-stone-300 bg-transparent focus:border-stone-900 focus:outline-none focus:ring-0 transition-colors text-[15px] text-stone-900 placeholder:text-stone-400'
    : 'w-full px-4 py-3 border-2 border-gray-200 rounded-2xl focus:border-purple-500 outline-none transition-colors text-[16px]';
  const labelClass = isEmpresaMode
    ? 'block text-[10px] uppercase tracking-[0.25em] mb-2 text-stone-500 font-medium'
    : 'block text-sm font-semibold mb-1 text-gray-700';

  // Step 1: verificação OTP do email após cadastro
  if (verificationUser && show2FA) return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-xl text-center">
          <div className="text-4xl mb-4">📧</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Confirme seu e-mail</h2>
          <p className="text-sm text-gray-500">Enviamos um código de 6 dígitos para <strong>{verificationUser.email}</strong>. Digite-o para confirmar seu cadastro.</p>
        </div>
      </div>
      <TwoFactorModal
        mode="email"
        identifier={verificationUser.email}
        title="Confirmar e-mail"
        onSuccess={() => {
          setShow2FA(false);
          fetch(`${apiBase()}/api/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipientUsername: verificationUser.username,
              type: 'welcome',
              fromUsername: verificationUser.username,
              extra: {},
            }),
          }).catch(() => {});
        }}
        onClose={() => { setShow2FA(false); onLogin(verificationUser.username, true, tipoConta); }}
      />
    </>
  );

  // Step 2: verificação de identidade (selfie + doc)
  if (verificationUser && !show2FA) return (
    <VerificationScreen
      userId={verificationUser.id}
      username={verificationUser.username}
      email={verificationUser.email}
      onComplete={() => onLogin(verificationUser.username, true, tipoConta)}
      onSkip={() => onLogin(verificationUser.username, true, tipoConta)}
    />
  );

  return (
    <>
    <div className="min-h-screen flex items-center justify-center p-3 sm:p-6 relative overflow-hidden"
      style={{ background: isEmpresaMode ? 'linear-gradient(135deg, #fafaf7 0%, #f5f2ec 100%)' : 'linear-gradient(135deg, #f3e8ff 0%, #fce7f3 50%, #fff7ed 100%)' }}>
      <TravelAnimation />
      <div className={`relative z-10 w-full max-w-md mx-auto p-6 sm:p-12 ${isEmpresaMode ? 'empresa-form' : 'rounded-3xl shadow-2xl'}`}
        style={isEmpresaMode ? {
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          border: '1px solid rgba(0,0,0,0.06)',
          borderRadius: 6,
          fontFamily: '"Source Serif 4", Georgia, serif',
        } : {
          background: 'rgba(255,255,255,0.82)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1.5px solid rgba(255,255,255,0.7)',
          borderRadius: '1.5rem',
        }}>
        {/* Language switcher */}
        <div className="flex justify-end mb-3">
          {isEmpresaMode ? (
            <div className="flex gap-4 text-[11px] tracking-[0.2em] uppercase" style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>
              {(['pt','en','es'] as const).map(l => (
                <button key={l} type="button" onClick={() => setLang(l)}
                  className={`pb-1 transition-colors ${lang === l ? 'border-b text-stone-900' : 'text-stone-400 hover:text-stone-700'}`}
                  style={lang === l ? { borderBottomColor: '#b8896a' } : {}}>
                  {l}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex gap-1 bg-gray-100 rounded-xl p-0.5">
              <button type="button" onClick={() => setLang('pt')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${lang === 'pt' ? 'bg-white shadow text-gray-800' : 'text-gray-400 hover:text-gray-600'}`}>
                🇧🇷 PT
              </button>
              <button type="button" onClick={() => setLang('en')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${lang === 'en' ? 'bg-white shadow text-gray-800' : 'text-gray-400 hover:text-gray-600'}`}>
                🇺🇸 EN
              </button>
              <button type="button" onClick={() => setLang('es')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${lang === 'es' ? 'bg-white shadow text-gray-800' : 'text-gray-400 hover:text-gray-600'}`}>
                🇪🇸 ES
              </button>
            </div>
          )}
        </div>

        <div className="text-center mb-10">
          <div className="flex flex-col items-center">
            <img src="/logo-papo.png" alt="Papo de Alunos" className="w-56 max-w-[75vw] object-contain mb-2" />
            <div className="w-12 h-px my-3" style={{ background: '#b8896a' }} />
            <p className="text-[11px] font-medium" style={{ color: '#b8896a', letterSpacing: '0.45em', fontFamily: '"Source Serif 4", Georgia, serif' }}>INTERCÂMBIO</p>
          </div>
        </div>

        {/* Tabs */}
        {isEmpresaMode ? (
          <div className="flex justify-center gap-10 mb-8 border-b border-stone-200">
            {(['login', 'register'] as const).map(m => (
              <button key={m} onClick={() => { setMode(m); setError(''); setSuccess(''); setResetSent(false); }}
                className={`pb-3 text-[11px] uppercase tracking-[0.3em] transition-colors -mb-px ${mode === m ? 'text-stone-900 border-b' : 'text-stone-400 hover:text-stone-700 border-b border-transparent'}`}
                style={{ fontFamily: '"Source Serif 4", Georgia, serif', borderBottomColor: mode === m ? '#b8896a' : 'transparent' }}>
                {m === 'login' ? T.tabLogin : T.tabRegister}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex bg-gray-100 rounded-2xl p-1 mb-6">
            {(['login', 'register'] as const).map(m => (
              <button key={m} onClick={() => { setMode(m); setError(''); setSuccess(''); setResetSent(false); }}
                className={`flex-1 py-2 rounded-xl font-semibold text-sm transition-all ${mode === m ? 'bg-white shadow text-purple-600' : 'text-gray-500'}`}>
                {m === 'login' ? T.tabLogin : T.tabRegister}
              </button>
            ))}
          </div>
        )}

        {success && <div className={`px-4 py-3 text-sm mb-4 ${isEmpresaMode ? 'border border-stone-300 bg-stone-50 text-stone-700' : 'bg-green-50 border border-green-200 text-green-700 rounded-2xl'}`}>{success}</div>}
        {error && <div className={`px-4 py-3 text-sm mb-4 ${isEmpresaMode ? 'border border-red-300 bg-red-50 text-red-700' : 'bg-red-50 border border-red-200 text-red-600 rounded-2xl'}`}>{error}</div>}

        {mode === 'forgot' ? (
          <div className="space-y-4">
            {resetSent ? (
              <div className="text-center py-6">
                <div className="text-5xl mb-3">📬</div>
                <h3 className="font-bold text-gray-800 text-lg mb-2">{T.resetSentTitle}</h3>
                <p className="text-sm text-gray-500 mb-4">{T.resetSentMsg(email)}</p>
                <button onClick={() => { setMode('login'); setResetSent(false); setSuccess(''); }}
                  className="text-purple-600 font-semibold text-sm hover:underline">{T.backToLogin}</button>
              </div>
            ) : (
              <form onSubmit={handleForgot} className="space-y-4">
                <div className="text-center mb-2">
                  <div className="text-4xl mb-2">🔑</div>
                  <p className="text-sm text-gray-500">{T.forgotTitle}</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">{T.forgotEmailLabel}</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder={T.emailPlaceholder} required className={inputClass} />
                </div>
                <button type="submit" disabled={loading}
                  className="w-full py-3 rounded-2xl font-bold text-white text-base disabled:opacity-60 transition-all"
                  style={{ background: 'linear-gradient(135deg,#7c3aed,#f97316)' }}>
                  {loading ? T.sending : T.sendResetBtn}
                </button>
                <p className="text-center text-sm text-gray-400">
                  <button type="button" onClick={() => { setMode('login'); setError(''); }}
                    className="text-purple-600 font-semibold hover:underline">{T.backToLogin}</button>
                </p>
              </form>
            )}
          </div>
        ) : mode === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">{T.emailLabel}</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder={T.emailPlaceholder} required className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">{T.passwordLabel}</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder={T.passwordPlaceholder} required className={inputClass} />
                <button type="button" onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {/* Indicador de tentativas */}
              {failedAttempts > 0 && failedAttempts < 3 && (
                <div className="flex gap-1 mt-2">
                  {[1,2,3].map(i => (
                    <div key={i} className="flex-1 h-1 rounded-full" style={{ background: i <= failedAttempts ? '#ef4444' : '#e5e7eb' }} />
                  ))}
                </div>
              )}
            </div>
            {/* Link esqueceu senha */}
            <div className="text-right -mt-2">
              <button type="button" onClick={() => { setMode('forgot'); setError(''); setSuccess(''); }}
                className="text-xs text-purple-500 hover:text-purple-700 font-medium hover:underline">
                {T.forgotPassword}
              </button>
            </div>
            <button type="submit" disabled={loading || resetSent}
              className="w-full bg-purple-600 text-white py-3 rounded-2xl font-bold text-lg hover:bg-purple-700 transition-colors disabled:opacity-60">
              {loading ? T.loggingIn : T.loginBtn}
            </button>
            <p className="text-center text-sm text-gray-400">
              {T.noAccount}{' '}
              <button type="button" onClick={() => setMode('register')} className="text-purple-600 font-semibold hover:underline">{T.signUpLink}</button>
            </p>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">

            {/* Papo de Alunos: sem toggle PF/PJ — cadastro é único (aluno) */}

            {/* Campos exclusivos PJ */}
            {tipoConta === 'pj' && (
              <div className={isEmpresaMode ? 'pt-2 space-y-5' : 'bg-blue-50 border border-blue-100 rounded-2xl p-4 space-y-3'}>
                {isEmpresaMode ? (
                  <div className="text-center mb-2">
                    <p className="text-[10px] uppercase tracking-[0.45em]" style={{ color: '#b8896a', fontFamily: '"Source Serif 4", Georgia, serif' }}>{T.companyDataTitle}</p>
                    <div className="w-8 h-px mx-auto mt-2" style={{ background: '#b8896a' }} />
                  </div>
                ) : (
                  <p className="text-xs font-semibold text-blue-700 mb-1">{T.companyDataTitle}</p>
                )}
                <div>
                  <label className={labelClass}>{T.cnpjLabel}</label>
                  <input type="text" value={cnpj}
                    onChange={e => setCnpj(formatCNPJ(e.target.value))}
                    placeholder={T.cnpjPlaceholder} required={tipoConta === 'pj'}
                    inputMode="numeric" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>{T.companyNameLabel}</label>
                  <input type="text" value={nomeEmpresa} onChange={e => setNomeEmpresa(e.target.value)}
                    placeholder={T.companyNamePlaceholder} required={tipoConta === 'pj'} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>{T.segmentLabel}</label>
                  <select value={segmento} onChange={e => setSegmento(e.target.value)}
                    required={tipoConta === 'pj'}
                    className={inputClass + (isEmpresaMode ? '' : ' bg-white')}>
                    <option value="">{T.segmentPlaceholder}</option>
                    {SEGMENTOS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            )}

            <div>
              <label className={labelClass}>
                {T.usernameLabel(tipoConta === 'pj')}
              </label>
              <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                placeholder={T.usernamePlaceholder(tipoConta === 'pj')} required className={inputClass} />
            </div>


            <div>
              <label className={labelClass}>{T.emailLabel}</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder={T.emailPlaceholder} required className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>{T.passwordLabel}</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder={T.passwordMinPlaceholder} required minLength={6} className={inputClass} />
                <button type="button" onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Localização */}
            <div className={isEmpresaMode ? 'pt-4 space-y-5' : 'bg-purple-50 border border-purple-100 rounded-2xl p-4 space-y-3'}>
              {isEmpresaMode ? (
                <div className="text-center mb-2">
                  <p className="text-[10px] uppercase tracking-[0.45em]" style={{ color: '#b8896a', fontFamily: '"Source Serif 4", Georgia, serif' }}>{T.locationTitle}</p>
                  <div className="w-8 h-px mx-auto mt-2" style={{ background: '#b8896a' }} />
                  <p className="text-[11px] text-stone-500 mt-2 italic">{T.locationHint}</p>
                </div>
              ) : (
                <div className="flex items-center gap-2 mb-1">
                  <MapPin className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-semibold text-purple-700">{T.locationTitle}</span>
                  <span className="text-xs text-purple-400">{T.locationHint}</span>
                </div>
              )}

              <div>
                <label className={labelClass}>{T.cepLabel}</label>
                <input type="text" value={cep}
                  onChange={e => setCep(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  onBlur={handleCepBlur}
                  placeholder={T.cepPlaceholder} className={inputClass}
                  inputMode="numeric" />
                {cepLoading && <p className={`text-xs mt-1 ${isEmpresaMode ? 'text-amber-600' : 'text-purple-500'}`}>{T.cepSearching}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>{T.cityLabel}</label>
                  <input type="text" value={cidade} onChange={e => setCidade(e.target.value)}
                    placeholder={T.cityPlaceholder} required className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>{T.stateLabel}</label>
                  <input type="text" value={estado} onChange={e => setEstado(e.target.value.toUpperCase().slice(0, 2))}
                    placeholder={T.statePlaceholder} maxLength={2} className={inputClass} />
                </div>
              </div>

              <div>
                <label className={labelClass}>📱 Telefone (WhatsApp) <span className="text-red-500">*</span></label>
                <input
                  type="tel"
                  value={telefone}
                  onChange={e => {
                    // Mantém apenas dígitos e formata como (DD) 9XXXX-XXXX
                    const d = e.target.value.replace(/\D/g, '').slice(0, 11);
                    let formatted = d;
                    if (d.length > 2 && d.length <= 7) formatted = `(${d.slice(0,2)}) ${d.slice(2)}`;
                    else if (d.length > 7) formatted = `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
                    setTelefone(formatted);
                  }}
                  placeholder="(11) 99999-9999"
                  inputMode="tel"
                  required
                  className={inputClass}
                />
                <p className={`text-xs mt-1 ${isEmpresaMode ? 'text-stone-500' : 'text-gray-500'}`}>Obrigatório. Outros usuários poderão te contatar via WhatsApp pelos seus anúncios.</p>
              </div>

              {/* Viagem: origem e destino */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>✈️ De onde sai</label>
                  <CountryPicker
                    label="País de origem"
                    value={paisOrigem}
                    onChange={setPaisOrigem}
                    className="w-full px-3 py-2.5 border border-stone-300 bg-white rounded flex items-center gap-2 text-left text-[15px] text-stone-900 hover:border-stone-500 transition-colors"
                  />
                </div>
                <div>
                  <label className={labelClass}>🛬 Pra onde vai</label>
                  <CountryPicker
                    label="País de destino"
                    value={paisDestino}
                    onChange={setPaisDestino}
                    className="w-full px-3 py-2.5 border border-stone-300 bg-white rounded flex items-center gap-2 text-left text-[15px] text-stone-900 hover:border-stone-500 transition-colors"
                  />
                </div>
              </div>

              {/* Escola e consultor */}
              <div>
                <label className={labelClass}>🎓 Escola onde está inscrito</label>
                <input type="text" value={escola} onChange={e => setEscola(e.target.value)}
                  placeholder="Ex: Kaplan International, EC English, ILAC..."
                  className={inputClass} />
              </div>

              <div>
                <label className={labelClass}>🧑‍💼 Consultor que vendeu o curso</label>
                <input type="text" value={consultor} onChange={e => setConsultor(e.target.value)}
                  placeholder="Nome do consultor de intercâmbio"
                  className={inputClass} />
              </div>

              {/* Aviso de geolocalização */}
              <div className={isEmpresaMode ? 'flex items-start gap-2 border-l-2 pl-3 py-1' : 'flex items-start gap-2 bg-white border border-purple-200 rounded-xl px-3 py-2.5'}
                style={isEmpresaMode ? { borderLeftColor: '#b8896a' } : {}}>
                <Navigation className={`w-4 h-4 flex-shrink-0 mt-0.5 ${isEmpresaMode ? '' : 'text-purple-500'}`} style={isEmpresaMode ? { color: '#b8896a' } : {}} />
                <p className={`text-xs ${isEmpresaMode ? 'text-stone-600 italic' : 'text-gray-600'}`}>
                  {T.gpsNotice}
                </p>
              </div>
            </div>

            {/* Aceite da política */}
            <div className={`flex items-start gap-3 ${isEmpresaMode ? 'pt-2' : 'bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3'}`}>
              <input
                type="checkbox"
                id="politica"
                checked={aceitouPolitica}
                onChange={e => { setAceitouPolitica(e.target.checked); setError(''); }}
                className={`mt-0.5 w-4 h-4 flex-shrink-0 cursor-pointer ${isEmpresaMode ? 'accent-stone-900' : 'accent-purple-600'}`}
              />
              <label htmlFor="politica" className={`text-xs cursor-pointer leading-relaxed ${isEmpresaMode ? 'text-stone-600' : 'text-gray-600'}`}>
                {T.privacyCheckbox}{' '}
                <button
                  type="button"
                  onClick={() => setShowPrivacy(true)}
                  className={`font-medium underline ${isEmpresaMode ? 'hover:opacity-70' : 'text-purple-600 hover:text-purple-800 font-semibold'}`}
                  style={isEmpresaMode ? { color: '#b8896a' } : {}}
                >
                  {T.privacyLink}
                </button>
                {' '}{T.privacyCheckboxSuffix}
              </label>
            </div>

            {/* Autorização de notificações e mensagens */}
            <div className={`flex items-start gap-3 ${isEmpresaMode ? '' : 'bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3'}`}>
              <input
                type="checkbox"
                id="notificacoes"
                checked={aceitouNotificacoes}
                onChange={async e => {
                  const checked = e.target.checked;
                  setAceitouNotificacoes(checked);
                  if (checked && typeof Notification !== 'undefined' && Notification.permission === 'default') {
                    await Notification.requestPermission();
                  }
                }}
                className={`mt-0.5 w-4 h-4 flex-shrink-0 cursor-pointer ${isEmpresaMode ? 'accent-stone-900' : 'accent-purple-600'}`}
              />
              <label htmlFor="notificacoes" className={`text-xs cursor-pointer leading-relaxed ${isEmpresaMode ? 'text-stone-600' : 'text-gray-600'}`}>
                {T.notifCheckbox.split(T.strong.chat)[0]}
                <span className={`${isEmpresaMode ? 'font-medium text-stone-800' : 'font-semibold text-gray-700'}`}>{T.strong.chat}</span>
                {T.notifCheckbox.split(T.strong.chat)[1].split(T.strong.push)[0]}
                <span className={`${isEmpresaMode ? 'font-medium text-stone-800' : 'font-semibold text-gray-700'}`}>{T.strong.push}</span>
                {T.notifCheckbox.split(T.strong.push)[1]}{' '}
                <span className={isEmpresaMode ? 'text-stone-400 italic' : 'text-gray-400'}>{T.notifOptional}</span>
              </label>
            </div>

            <button type="submit" disabled={loading || !aceitouPolitica}
              className={isEmpresaMode
                ? 'w-full py-3.5 text-[11px] uppercase tracking-[0.35em] font-medium transition-all disabled:opacity-50 bg-stone-900 text-white hover:bg-stone-800'
                : 'w-full bg-orange-500 text-white py-3 rounded-2xl font-bold text-lg hover:bg-orange-600 transition-colors disabled:opacity-60'}
              style={isEmpresaMode ? { fontFamily: '"Source Serif 4", Georgia, serif' } : {}}>
              {loading ? T.registering : T.registerBtn}
            </button>
            <p className={isEmpresaMode ? 'text-center text-xs text-stone-500 pt-2' : 'text-center text-sm text-gray-400'}
               style={isEmpresaMode ? { fontFamily: '"Source Serif 4", Georgia, serif' } : {}}>
              {T.hasAccount}{' '}
              <button type="button" onClick={() => setMode('login')}
                className={isEmpresaMode ? 'underline hover:opacity-70' : 'text-purple-600 font-semibold hover:underline'}
                style={isEmpresaMode ? { color: '#b8896a' } : {}}>{T.loginLink}</button>
            </p>
          </form>
        )}
      </div>
    </div>
    {showPrivacy && <PrivacyModal onClose={() => setShowPrivacy(false)} />}
    </>
  );
}
