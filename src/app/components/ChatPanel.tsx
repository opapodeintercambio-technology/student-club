import { useState, useEffect, useRef, useCallback } from 'react';
import { useLang } from '../i18n';
import { X, Send, Lock, ShieldCheck, Check, CheckCheck, WifiOff, Circle, ArrowRightLeft, Paperclip, Mic, Image as ImageIcon, Video as VideoIcon, Music, Reply, Square, Globe, Sliders, Zap } from 'lucide-react';
import type { Product } from './ProductCard';
import { supabase } from '../../lib/supabase';
import { deriveKey, encryptMsg as enc, decryptMsgWithFallback as dec, parseProposal, parseDoacaoAcceptance } from '../utils/chatCrypto';
import { sendEmailNotif } from '../utils/notifyEmail';
import { notifyUser } from '../utils/notify';
import { uploadMedia, parseRichMessage, buildRichMessage, extFromMime, getRecorderMimeType, type RichMessage, type MediaKind } from '../utils/chatMedia';
import { startSpeechRecognition, translateAndSpeak, getPreferredTranslateLang, transcribeAudioBlob, speakInLanguage, getConvTargetLang, setConvTargetLang, translateAudioServer, SUPPORTED_LANGS, getSpeakingId, stopSpeaking, type SpeechRecogHandle } from '../utils/audioTranslate';
import { filterContent } from '../utils/contentFilter';
import { apiBase } from '../utils/apiUrl';
import { EMOJI_CATEGORIES } from './chatEmojis';
import { AutoText } from './AutoText';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import { isNudgeBlocked, blockNudge, unblockNudge, isNudgeBlockedRemote } from '../utils/chatPrefs';
import { BellOff, Bell } from 'lucide-react';
import { playTypingSound, playRecordStartSound, playRecordCancelSound, playEraseSound, playSendSound } from '../utils/chatSounds';

// ── Types ──────────────────────────────────────────────────────────────────
type MsgStatus = 'sending' | 'sent' | 'read' | 'error';

interface Message {
  id: string;
  text: string;
  sender: string;
  timestamp: Date;
  status: MsgStatus;
  isMine: boolean;
  rich?: RichMessage;
  edited?: boolean;
  deleted?: boolean;
}

const DELETED_MARKER = '[APAGADA]';

const FIVE_MIN_MS = 5 * 60 * 1000;

interface ChatPanelProps {
  product: Product;
  currentUser: string;
  myAvatarUrl?: string;
  onClose: () => void;
  onFinalizar?: (product: Product, fromItemId?: string, opts?: { skipDelete?: boolean }) => void;
  onOpenProductById?: (productId: string) => void;
  onViewProfile?: (username: string) => void;
}

// ── Date helpers ───────────────────────────────────────────────────────────
function dateLabel(date: Date, today: string, yesterday: string, lang: string): string {
  const todayD = new Date(); todayD.setHours(0, 0, 0, 0);
  const yesterdayD = new Date(todayD); yesterdayD.setDate(yesterdayD.getDate() - 1);
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  if (d.getTime() === todayD.getTime()) return today;
  if (d.getTime() === yesterdayD.getTime()) return yesterday;
  const locale = lang === 'en' ? 'en-US' : lang === 'es' ? 'es-ES' : 'pt-BR';
  return date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function timeStr(date: Date, lang: string) {
  const locale = lang === 'en' ? 'en-US' : lang === 'es' ? 'es-ES' : 'pt-BR';
  return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}
function sameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

// ── Avatar helpers ─────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  ['#7c3aed','#ede9fe'], ['#f97316','#fff7ed'], ['#ec4899','#fdf2f8'],
  ['#10b981','#ecfdf5'], ['#3b82f6','#eff6ff'], ['#f59e0b','#fffbeb'],
  ['#06b6d4','#ecfeff'], ['#8b5cf6','#f5f3ff'],
];
function avatarColor(username: string) {
  let h = 0;
  for (let i = 0; i < username.length; i++) h = (h * 31 + username.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function UserAvatar({ username, photoUrl, size = 32 }: { username: string; photoUrl?: string; size?: number }) {
  const [bg, fg] = avatarColor(username);
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={username}
        className="flex-shrink-0 rounded-full object-cover select-none"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="flex-shrink-0 rounded-full flex items-center justify-center font-bold select-none"
      style={{ width: size, height: size, background: bg, color: fg, fontSize: size * 0.35 }}
    >
      {username.slice(0, 2).toUpperCase()}
    </div>
  );
}

// ── Audio Player with speed control ───────────────────────────────────────
const SPEEDS = [1, 1.5, 2, 2.5];
interface AudioPalette { mine: string; other: string; mineText: string; otherText: string }
interface AudioPlayerProps {
  src: string;
  isMine: boolean;
  palette: AudioPalette;
  msgId?: string;
  registerAudio?: (msgId: string, el: HTMLAudioElement | null) => void;
  onAdvance?: (msgId: string) => void;
  // Velocidade compartilhada entre TODOS os players do chat — quando o user
  // muda em um, propaga pro restante (mesma lógica do WhatsApp).
  speedIdx: number;
  onChangeSpeed: (next: number) => void;
  // Duração conhecida (segundos) salva no envio — exibida ANTES do receptor
  // tocar o áudio, como no WhatsApp. Sobrescrita pelo metadata real ao tocar.
  knownDuration?: number;
}
function AudioPlayer({ src, isMine, palette, msgId, registerAudio, onAdvance, speedIdx, onChangeSpeed, knownDuration }: AudioPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(knownDuration && isFinite(knownDuration) ? knownDuration : 0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const playBtnRef = useRef<HTMLButtonElement>(null);
  const lastTouchRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  // iOS requer que audio.play() seja chamado dentro de um event listener nativo,
  // não via eventos sintéticos do React (que são assíncronos e perdem o contexto de gesto).
  useEffect(() => {
    const btn = playBtnRef.current;
    const a = audioRef.current;
    if (!btn || !a) return;

    const doToggle = () => {
      if (a.paused) {
        a.play().then(() => setPlaying(true)).catch(() => {});
      } else {
        a.pause();
        setPlaying(false);
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      e.stopPropagation();
      lastTouchRef.current = Date.now();
      doToggle();
    };

    // Click para desktop; guard evita duplo disparo em mobile (touchend + click)
    const onClick = (e: MouseEvent) => {
      e.stopPropagation();
      if (Date.now() - lastTouchRef.current < 600) return;
      doToggle();
    };

    btn.addEventListener('touchend', onTouchEnd, { passive: true });
    btn.addEventListener('click', onClick);
    return () => {
      btn.removeEventListener('touchend', onTouchEnd);
      btn.removeEventListener('click', onClick);
    };
  }, []);

  // Listeners de áudio + RAF loop para progress suave.
  // Por que RAF em vez de só onTimeUpdate? O evento `timeupdate` dispara
  // a cada ~250ms (e em iOS Safari com <audio display:none pode até falhar).
  // RAF garante atualização a 60fps enquanto playing → barra anda smooth.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    const onLoadedMeta = () => {
      if (isFinite(a.duration)) setDuration(a.duration);
    };
    const onPlay = () => {
      setPlaying(true);
      // Inicia loop RAF
      const tick = () => {
        const cur = a.currentTime;
        const dur = a.duration;
        if (dur && isFinite(dur)) setProgress(cur / dur);
        if (!a.paused && !a.ended) {
          rafRef.current = requestAnimationFrame(tick);
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    };
    const onPause = () => {
      setPlaying(false);
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    };
    const onEnded = () => {
      setPlaying(false);
      setProgress(0);
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      // Autoplay encadeado: avisa o ChatPanel que esse áudio acabou,
      // pra ele tocar o próximo áudio consecutivo (se houver).
      if (msgId && onAdvance) onAdvance(msgId);
    };
    // timeupdate como backup (caso RAF não rode em background)
    const onTimeUpdate = () => {
      if (a.duration && isFinite(a.duration)) setProgress(a.currentTime / a.duration);
    };

    a.addEventListener('loadedmetadata', onLoadedMeta);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('ended', onEnded);
    a.addEventListener('timeupdate', onTimeUpdate);

    // Captura metadata se já carregou antes do listener anexar
    if (a.readyState >= 1 && isFinite(a.duration)) setDuration(a.duration);

    // Registra o elemento <audio> no map global do ChatPanel pra autoplay encadeado
    if (msgId && registerAudio) registerAudio(msgId, a);

    return () => {
      a.removeEventListener('loadedmetadata', onLoadedMeta);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('ended', onEnded);
      a.removeEventListener('timeupdate', onTimeUpdate);
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      if (msgId && registerAudio) registerAudio(msgId, null);
    };
  }, [msgId]);

  const cycleSpeed = () => {
    const next = (speedIdx + 1) % SPEEDS.length;
    onChangeSpeed(next);
  };

  // Aplica playbackRate sempre que a velocidade mudar (vinda do state global do
  // ChatPanel) OU quando o audio começa a tocar — garante que o autoplay
  // encadeado herde a velocidade escolhida no áudio anterior.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.playbackRate = SPEEDS[speedIdx];
  }, [speedIdx, playing]);

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  };

  // Cores derivadas do tema atual do chat — funciona em todos os temas
  // (sunset/laranja, lilac/roxo, ocean/azul, etc) sem hard-coding.
  // textColor: cor do texto/ícones da bolha (já contraste com palette.mine/other)
  // accent: cor "tema" — usa palette.mine pro tom da família (gradient ou cor sólida)
  const textColor = isMine ? palette.mineText : palette.otherText;
  // Player interno é uma sub-bolha SEMI-TRANSPARENTE sobre a bolha pai —
  // funciona em qualquer cor de tema pq escurece/clareia o pai.
  const innerBg = isMine ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.06)';
  const trackBgColor = isMine ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.12)';
  const fillColor = isMine ? '#ffffff' : palette.mine.includes('gradient') ? palette.mine : palette.mine;
  // Botão play: fundo branco/claro + ícone com cor "tema" pra contraste
  const playBg = isMine ? 'rgba(255,255,255,0.85)' : palette.mine;
  const playIconColor = isMine ? (palette.mine.includes('gradient') ? '#1e2e25' : palette.mine) : '#ffffff';

  return (
    // Sem background — o player herda o fundo da bolha externa direta.
    // Antes tinha innerBg semi-transparente que criava efeito "balão dentro
    // de balão". Agora é um único container visual: a bolha externa.
    <div
      className="flex items-center gap-2.5 px-1 py-1 rounded-full"
      style={{
        minWidth: 230,
        background: 'transparent',
        color: textColor,
      }}
    >
      <audio
        ref={audioRef}
        src={src}
        preload="auto"
        playsInline
        tabIndex={-1}
        // visibility:hidden em vez de display:none — iOS Safari emite eventos
        // de áudio de forma mais confiável quando o elemento está no layout.
        style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
      />
      {/* Play/Pause */}
      <button
        ref={playBtnRef}
        type="button"
        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-opacity hover:opacity-90"
        style={{ background: playBg }}
      >
        {playing
          ? <span className="text-[10px] font-black" style={{ color: playIconColor }}>❚❚</span>
          : <span className="text-[11px] ml-0.5" style={{ color: playIconColor }}>▶</span>
        }
      </button>
      {/* Progress + time — scrubbing (arrastar pra voltar/avançar) */}
      <div className="flex-1 flex flex-col gap-1 min-w-0">
        <div
          className={`relative w-full h-4 flex items-center cursor-pointer touch-none select-none`}
          // stopPropagation pra NÃO acionar o swipe-pra-responder do wrapper
          onPointerDown={(e) => {
            e.stopPropagation();
            const a = audioRef.current;
            if (!a || !a.duration) return;
            const el = e.currentTarget as HTMLDivElement;
            el.setPointerCapture(e.pointerId);
            const seek = (clientX: number) => {
              const rect = el.getBoundingClientRect();
              const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
              a.currentTime = ratio * a.duration;
              setProgress(ratio);
            };
            seek(e.clientX);
            const onMove = (ev: PointerEvent) => { ev.stopPropagation(); seek(ev.clientX); };
            const onUp = (ev: PointerEvent) => {
              ev.stopPropagation();
              el.releasePointerCapture(e.pointerId);
              el.removeEventListener('pointermove', onMove);
              el.removeEventListener('pointerup', onUp);
              el.removeEventListener('pointercancel', onUp);
            };
            el.addEventListener('pointermove', onMove);
            el.addEventListener('pointerup', onUp);
            el.addEventListener('pointercancel', onUp);
          }}
          // touchstart/move/end com stopPropagation extra — sem isso, o
          // wrapper da mensagem captura o move como swipe e abre o reply.
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          {/* Track */}
          <div className="w-full h-1.5 rounded-full" style={{ background: trackBgColor }}>
            <div className="h-full rounded-full" style={{ width: `${progress * 100}%`, willChange: 'width', background: fillColor }} />
          </div>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[10px] font-medium" style={{ color: textColor, opacity: 0.85 }}>
            {fmt(duration > 0 && isFinite(duration) ? progress * duration : 0)} / {isFinite(duration) && duration > 0 ? fmt(duration) : '--:--'}
          </span>
          <button
            type="button"
            onClick={cycleSpeed}
            className="text-[10px] font-bold px-2 py-0.5 rounded-full hover:opacity-80 transition-opacity"
            style={{
              background: isMine ? 'rgba(255,255,255,0.30)' : 'rgba(0,0,0,0.10)',
              color: textColor,
            }}
          >
            {SPEEDS[speedIdx]}x
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Media Lightbox (image + video) ─────────────────────────────────────────
function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/90" onClick={onClose}>
      <button type="button" onClick={onClose} className="absolute top-4 right-4 text-white text-3xl font-bold leading-none z-10">×</button>
      <img src={src} alt="" className="max-w-full max-h-full object-contain rounded-xl select-none" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

function VideoLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black" onClick={onClose}>
      <button type="button" onClick={onClose} className="absolute top-4 right-4 text-white text-3xl font-bold leading-none z-10">×</button>
      <video
        src={src}
        controls
        autoPlay
        playsInline
        className="max-w-full max-h-full rounded-xl"
        style={{ maxHeight: '90dvh' }}
        onClick={(e) => e.stopPropagation()}
        onPlay={() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); }}
      />
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────
export function ChatPanel({ product, currentUser, myAvatarUrl, onClose, onFinalizar, onOpenProductById, onViewProfile }: ChatPanelProps) {
  useLockBodyScroll(true);

  // Derivados de props — declarados PRIMEIRO para evitar TDZ no bundle minificado.
  // Qualquer useEffect/useState que referencie convId no array de deps precisa que
  // convId já esteja inicializado quando o código executa (array de deps é avaliado
  // imediatamente, não adiado como o corpo do callback).
  const isGroup = product.id.startsWith('group__');
  const convId = isGroup ? product.id : [currentUser, product.username].sort().join('__') + '__' + product.id;
  const otherUser = product.username;
  const groupId = isGroup ? product.id.slice('group__'.length) : '';

  const { AT, lang, setLang } = useLang();
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [optsOpen, setOptsOpen] = useState(false);
  // Opcoes de personalizacao do chat — persistem por usuario em localStorage.
  type ChatBg = 'studentclub' | 'travel' | 'lilac' | 'mint' | 'sky' | 'sand'
    | 'rose' | 'mocha' | 'ocean' | 'forest' | 'sunset'
    | 'tgday' | 'tgnight' | 'tgspring' | 'tgpink' | 'tgcyan'
    | 'tgdunes' | 'tgtwilight' | 'tgsea';
  type ChatFont = 'sm' | 'base' | 'lg';
  type ChatFamily = 'sans' | 'serif' | 'mono' | 'rounded' | 'condensed'
    | 'display' | 'elegant' | 'script' | 'comic' | 'typewriter'
    | 'modern' | 'classic' | 'friendly' | 'tech' | 'bold'
    | 'handwrite' | 'magazine' | 'soft' | 'game' | 'fairy';
  const [chatOpts, setChatOpts] = useState<{ bg: ChatBg; font: ChatFont; family: ChatFamily }>(() => {
    try {
      const raw = localStorage.getItem('chatOpts:' + currentUser);
      if (raw) {
        const parsed = JSON.parse(raw);
        // travel/lilac removidos -> migra pra cassidy (olive admin default)
        const bg = (parsed.bg === 'travel' || parsed.bg === 'lilac') ? 'studentclub' : (parsed.bg || 'studentclub');
        return { bg, font: parsed.font || 'base', family: parsed.family || 'sans' };
      }
    } catch {}
    return { bg: 'studentclub', font: 'base', family: 'sans' };
  });
  useEffect(() => {
    try { localStorage.setItem('chatOpts:' + currentUser, JSON.stringify(chatOpts)); } catch {}
  }, [chatOpts, currentUser]);

  // Paletas de tema — bubble colors mudam com o fundo (estilo WhatsApp).
  const THEME_PALETTE: Record<ChatBg, { mine: string; other: string; mineText: string; otherText: string }> = {
    // Student Club brand green (default)
    studentclub: { mine: 'linear-gradient(135deg,#155939,#1e714a)', other: '#ffffff', mineText: '#fff', otherText: '#101814' },
    travel: { mine: 'linear-gradient(135deg,#7c22fa,#a855f7)', other: '#ffffff',          mineText: '#fff', otherText: '#1f2937' },
    lilac:  { mine: 'linear-gradient(135deg,#7c22fa,#a855f7)', other: '#ffffff',          mineText: '#fff', otherText: '#1f2937' },
    mint:   { mine: 'linear-gradient(135deg,#059669,#10b981)', other: '#ffffff',          mineText: '#fff', otherText: '#1f2937' },
    sky:    { mine: 'linear-gradient(135deg,#0284c7,#0ea5e9)', other: '#ffffff',          mineText: '#fff', otherText: '#1f2937' },
    sand:   { mine: 'linear-gradient(135deg,#d97706,#f59e0b)', other: '#ffffff',          mineText: '#fff', otherText: '#1f2937' },
    rose:   { mine: 'linear-gradient(135deg,#e11d48,#f43f5e)', other: '#ffffff',          mineText: '#fff', otherText: '#1f2937' },
    mocha:  { mine: 'linear-gradient(135deg,#78350f,#92400e)', other: '#fffbeb',          mineText: '#fff', otherText: '#1f2937' },
    ocean:  { mine: 'linear-gradient(135deg,#0e7490,#06b6d4)', other: '#ffffff',          mineText: '#fff', otherText: '#0c4a6e' },
    forest: { mine: 'linear-gradient(135deg,#15803d,#16a34a)', other: '#ffffff',          mineText: '#fff', otherText: '#14532d' },
    sunset: { mine: 'linear-gradient(135deg,#c2410c,#ea580c)', other: '#ffffff',          mineText: '#fff', otherText: '#7c2d12' },
    // Telegram (cores fieis aos sender bubbles do Telegram Desktop/iOS)
    tgday:      { mine: '#eeffde', other: '#ffffff', mineText: '#1f2937', otherText: '#1f2937' },
    tgnight:    { mine: '#2b5278', other: '#182533', mineText: '#fff',    otherText: '#fff'    },
    tgspring:   { mine: '#7ec25e', other: '#ffffff', mineText: '#fff',    otherText: '#1f2937' },
    tgpink:     { mine: '#e63971', other: '#ffffff', mineText: '#fff',    otherText: '#1f2937' },
    tgcyan:     { mine: '#3aa6c9', other: '#ffffff', mineText: '#fff',    otherText: '#1f2937' },
    tgdunes:    { mine: '#c97e3a', other: '#ffffff', mineText: '#fff',    otherText: '#1f2937' },
    tgtwilight: { mine: '#9333ea', other: '#ffffff', mineText: '#fff',    otherText: '#1f2937' },
    tgsea:      { mine: '#0d9488', other: '#ffffff', mineText: '#fff',    otherText: '#134e4a' },
  };
  const palette = THEME_PALETTE[chatOpts.bg];

  // Cores derivadas pra topbar — funcionam em qualquer tema (claro/escuro)
  // sem hardcoding. mineText já vem calculado pra contrastar com palette.mine.
  const isLightHeader =
    palette.mineText !== '#fff' &&
    palette.mineText.toLowerCase() !== '#ffffff' &&
    palette.mineText.toLowerCase() !== 'white';
  const headerTextColor = palette.mineText;
  const headerSubColor = isLightHeader ? 'rgba(31,41,55,0.70)' : 'rgba(255,255,255,0.75)';
  const headerOnlineColor = isLightHeader ? '#16a34a' : '#86efac';
  const headerOfflineColor = isLightHeader ? 'rgba(31,41,55,0.55)' : 'rgba(255,255,255,0.55)';
  const headerHoverBg = isLightHeader ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.15)';
  const headerRingColor = isLightHeader ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.40)';

  // Font-family map — aplicado inline pra vencer qualquer CSS inherit/specificity.
  const FONT_FAMILY: Record<ChatFamily, string> = {
    sans:      "'DM Sans', system-ui, sans-serif",
    serif:     "'Source Serif 4', Georgia, serif",
    mono:      "'JetBrains Mono', Menlo, monospace",
    rounded:   "'Nunito', system-ui, sans-serif",
    condensed: "'Roboto Condensed', sans-serif",
    display:   "'Space Grotesk', sans-serif",
    elegant:   "'Playfair Display', Georgia, serif",
    script:    "'Dancing Script', cursive",
    comic:     "'Comic Sans MS', 'Comic Sans', cursive",
    typewriter:"'Courier New', Courier, monospace",
    modern:    "'Inter', system-ui, sans-serif",
    classic:   "'Times New Roman', Times, serif",
    friendly:  "'Quicksand', sans-serif",
    tech:      "'Share Tech Mono', monospace",
    bold:      "'Archivo Black', sans-serif",
    handwrite: "'Caveat', cursive",
    magazine:  "'Bebas Neue', sans-serif",
    soft:      "'Manrope', sans-serif",
    game:      "'Press Start 2P', monospace",
    fairy:     "'Indie Flower', cursive",
  };
  const FONT_SIZE: Record<ChatFont, number> = { sm: 13, base: 15, lg: 17 };

  // Cutucar (nudge) — emite evento global; App.tsx anima a tela inteira.
  const [nudgeSentAt, setNudgeSentAt] = useState(0);
  // Reflete o estado de bloqueio de cutucadas pra esse outroUsuário.
  // Lê do localStorage e re-renderiza ao toggle (chatPrefs dispara
  // 'papo-chat-prefs-updated').
  const [nudgeBlocked, setNudgeBlocked] = useState(() => isNudgeBlocked(currentUser, product.username));
  useEffect(() => {
    const sync = () => setNudgeBlocked(isNudgeBlocked(currentUser, product.username));
    sync();
    window.addEventListener('papo-chat-prefs-updated', sync);
    return () => window.removeEventListener('papo-chat-prefs-updated', sync);
  }, [currentUser, product.username]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null);
  const [otherTyping, setOtherTyping] = useState(false);
  const [otherOnline, setOtherOnline] = useState(false);
  const [connected, setConnected] = useState(true);
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [otherAvatarUrl, setOtherAvatarUrl] = useState<string>('');
  const [containerHeight, setContainerHeight] = useState<string>('100dvh');
  const [replyTo, setReplyTo] = useState<{ id: string; text: string; sender: string } | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiQuery, setEmojiQuery] = useState('');
  const [emojiCat, setEmojiCat] = useState('smileys');
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const emojiBtnRef = useRef<HTMLButtonElement>(null);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [uploading, setUploading] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunks = useRef<Blob[]>([]);
  // Stream de mic compartilhado entre gravações — evita iOS Safari pedir
  // permissão de novo a cada gravação. Liberado só ao desmontar o chat.
  const micStreamRef = useRef<MediaStream | null>(null);
  // Flag pra abortar o onstop quando o user cancela (botão lixeira)
  const recordCancelledRef = useRef<boolean>(false);
  const recordStartRef = useRef<number>(0);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // STT em paralelo com a gravação — capta o transcript do que está sendo falado
  // pra mandar junto com o áudio. Receptor traduz on-demand pro seu idioma.
  const sttHandleRef = useRef<SpeechRecogHandle | null>(null);
  // Set de IDs de mensagens que estao sendo transcritas via Whisper fallback
  const [translatingIds, setTranslatingIds] = useState<Set<string>>(new Set());
  // Cache local de transcricoes pos-fato (msg.id -> transcript) — evita
  // re-transcrever toda vez que o usuario clica.
  const transcriptCacheRef = useRef<Map<string, string>>(new Map());
  // Velocidade compartilhada entre TODOS os áudios do chat (estilo WhatsApp):
  // se o user troca pra 1.5x num player, próximos da sequência herdam.
  const [chatAudioSpeedIdx, setChatAudioSpeedIdx] = useState(0);
  // Autoplay encadeado de áudios (estilo WhatsApp): mapa msgId → <audio> element
  // pra tocarmos o próximo áudio consecutivo quando o anterior terminar.
  const audioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const registerAudioEl = useCallback((id: string, el: HTMLAudioElement | null) => {
    if (el) audioElsRef.current.set(id, el);
    else audioElsRef.current.delete(id);
  }, []);
  // messages é state, então uso um ref pra ter sempre a versão fresca dentro do callback
  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  const advanceAudio = useCallback((endedMsgId: string) => {
    const msgs = messagesRef.current;
    const idx = msgs.findIndex(m => m.id === endedMsgId);
    if (idx === -1) return;
    // Próxima mensagem consecutiva — se for áudio, toca; senão para (intervalo).
    const next = msgs[idx + 1];
    if (!next || next.rich?.type !== 'audio' || !next.rich.url) return;
    const nextEl = audioElsRef.current.get(next.id);
    if (!nextEl) return;
    // Pequeno delay (~250ms) pra dar respiro entre os áudios (estilo WhatsApp)
    setTimeout(() => {
      nextEl.play().catch(() => { /* iOS: gesture context expirou, ok parar aqui */ });
    }, 250);
  }, []);
  // Idioma alvo pra audios que EU enviar nesta conversa (escolha do remetente).
  // Quando setado, ao gravar audio o backend traduz pra esse idioma antes do envio.
  // Inicial null + carregado via useEffect pra evitar TDZ no bundle minificado
  // (chamar getConvTargetLang() inline causava "Cannot access 'lt' before initialization").
  const [convTargetLang, setConvTargetLangState] = useState<string | null>(null);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [audioTranslating, setAudioTranslating] = useState(false);
  // ID da mensagem cujo TTS está tocando AGORA (sincronizado com o util
  // global audioTranslate). Atualiza via evento `papo-tts-changed`.
  const [speakingTtsId, setSpeakingTtsId] = useState<string | null>(getSpeakingId());
  useEffect(() => {
    const onChange = () => setSpeakingTtsId(getSpeakingId());
    window.addEventListener('papo-tts-changed', onChange);
    return () => window.removeEventListener('papo-tts-changed', onChange);
  }, []);
  // Tradução pelo receptor: msgId → { text, lang }
  const [rxTranslations, setRxTranslations] = useState<Map<string, { text: string; lang: string }>>(new Map());
  // Qual bolha está com o seletor de idioma aberto + posição do dropdown (fixed)
  const [rxLangPicker, setRxLangPicker] = useState<{ msgId: string; x: number; y: number } | null>(null);
  useEffect(() => {
    setConvTargetLangState(getConvTargetLang(currentUser, convId));
  }, [currentUser, convId]);
  const fileMediaRef = useRef<HTMLInputElement>(null);
  const fileImgRef = useRef<HTMLInputElement>(null);
  const fileVidRef = useRef<HTMLInputElement>(null);
  const fileAudRef = useRef<HTMLInputElement>(null);
  const [swipeState, setSwipeState] = useState<{ id: string; dx: number } | null>(null);
  const swipeTouchRef = useRef<{ x: number; y: number; id: string } | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [lightboxVideo, setLightboxVideo] = useState<string | null>(null);
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [actionMenu, setActionMenu] = useState<{ id: string; canEdit: boolean; confirmDelete?: boolean } | null>(null);
  const [contentBlocked, setContentBlocked] = useState(false);
  const blockedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  const canModify = useCallback((m: Message) => {
    return m.isMine && Date.now() - m.timestamp.getTime() < FIVE_MIN_MS && m.status !== 'sending';
  }, []);

  const openActionMenu = useCallback((m: Message) => {
    if (!m.isMine || m.status === 'sending') return;
    if (Date.now() - m.timestamp.getTime() >= FIVE_MIN_MS) return;
    const isText = !m.rich?.type || !!m.rich?.caption || !m.rich?.url;
    setActionMenu({ id: m.id, canEdit: isText });
  }, []);

  // deleteMessage está declarado após os outros callbacks (useCallback depende de messages/canModify)

  const startEdit = useCallback((m: Message) => {
    if (!canModify(m)) return;
    setActionMenu(null);
    setEditingId(m.id);
    setEditingText(m.text);
    setReplyTo(null);
    if (!('ontouchstart' in window)) setTimeout(() => inputRef.current?.focus(), 50);
  }, [canModify]);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditingText('');
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editingId || !cryptoKey) return;
    const id = editingId;
    const newText = editingText.trim();
    const target = messages.find(m => m.id === id);
    if (!target) { cancelEdit(); return; }
    if (!newText && !target.rich?.url) { cancelEdit(); return; }
    if (!canModify(target)) { cancelEdit(); return; }

    const richEnvelope: Omit<RichMessage, 'caption'> | undefined = target.rich
      ? {
          type: target.rich.type,
          url: target.rich.url,
          mime: target.rich.mime,
          duration: target.rich.duration,
          replyTo: target.rich.replyTo,
        }
      : undefined;
    const wireText = buildRichMessage(newText, richEnvelope);
    const conteudo = await enc(wireText, cryptoKey);

    setMessages(prev => prev.map(m =>
      m.id === id
        ? { ...m, text: newText, edited: true, rich: target.rich ? { ...target.rich, caption: newText || undefined } : undefined }
        : m
    ));
    cancelEdit();

    await supabase
      .from('mensagens')
      .update({ conteudo })
      .eq('id', id)
      .eq('remetente', currentUser);

    msgChannelRef.current?.send({
      type: 'broadcast', event: 'edit_msg',
      payload: { id, conteudo },
    });
  }, [editingId, editingText, cryptoKey, messages, canModify, currentUser, cancelEdit]);

  const scrollToMessage = useCallback((targetId: string) => {
    const el = document.getElementById(`msg-${targetId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightId(targetId);
    setTimeout(() => setHighlightId(null), 1500);
  }, []);

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef(new Set<string>());
  const keyRef = useRef<CryptoKey | null>(null);
  const msgChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Detecta mobile: barra de input compacta + sons de teclado só rolam em
  // touch devices. Desktop mantém o layout original (mais espaçoso).
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(max-width: 768px)')?.matches ?? false;
  });
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, []);
  // Hack readOnly iOS revertido — iOS Safari atual ignora e ainda mostra a
  // accessory bar do teclado. Não há solução web pura confiável.
  const pullStartY = useRef(0);
  const isPulling = useRef(false);

  // Estado do grupo (avatar + criador)
  const [groupAvatar, setGroupAvatar] = useState<string | null>(null);
  const [groupCreatedBy, setGroupCreatedBy] = useState<string>('');
  const [uploadingGroupAvatar, setUploadingGroupAvatar] = useState(false);
  const groupAvatarFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isGroup || !groupId) return;
    supabase.from('chat_groups').select('avatar_url, created_by').eq('id', groupId).single()
      .then(({ data }) => {
        if (data) {
          setGroupAvatar((data as any).avatar_url || null);
          setGroupCreatedBy((data as any).created_by || '');
        }
      });
  }, [isGroup, groupId]);

  const canEditGroup = isGroup && groupCreatedBy === currentUser;

  async function handleGroupAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !groupId) return;
    setUploadingGroupAvatar(true);
    try {
      await supabase.auth.refreshSession();
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const key = `${currentUser}/group_${groupId}_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('fotos').upload(key, file, { contentType: file.type || 'image/jpeg' });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('fotos').getPublicUrl(key);
      await supabase.from('chat_groups').update({ avatar_url: publicUrl }).eq('id', groupId);
      setGroupAvatar(publicUrl);
    } catch (err: any) {
      alert('Erro ao enviar imagem: ' + (err?.message || err));
    }
    setUploadingGroupAvatar(false);
  }

  // deleteMessage usa convId, então precisa ser declarado APÓS ele (evita Temporal Dead Zone)
  const deleteMessage = useCallback(async (id: string) => {
    const target = messages.find(m => m.id === id);
    if (!target || !canModify(target)) return;
    setActionMenu(null);
    setHoveredMsgId(null);

    // 1) Marca local imediato (apenas na sessão atual)
    setMessages(prev => prev.map(m =>
      m.id === id ? { ...m, deleted: true, rich: undefined, text: '' } : m
    ));

    // 2) Broadcast imediato pro outro lado
    msgChannelRef.current?.send({
      type: 'broadcast', event: 'del_msg', payload: { id },
    });

    // 3) HARD DELETE no banco com retry agressivo
    const tryDelete = async (attempt = 0): Promise<boolean> => {
      const { error } = await supabase.from('mensagens')
        .delete()
        .eq('id', id)
        .eq('remetente', currentUser);
      if (!error) return true;
      if (attempt < 5) {
        await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
        return tryDelete(attempt + 1);
      }
      return false;
    };
    tryDelete();
  }, [messages, canModify, currentUser, convId]);

  const containerRef = useRef<HTMLDivElement>(null);
  // Permite chamar a função de ajuste de visualViewport de fora do useEffect
  // (ex.: onFocus da textarea — força reposicionamento síncrono, sem esperar
  // o iOS Safari emitir visualViewport.resize que pode atrasar).
  const applyViewportRef = useRef<(() => void) | null>(null);

  // Swipe-from-left-edge pra voltar (estilo iOS nativo): toque inicia na borda
  // esquerda (< 24px) e arrasta pra direita. Se ultrapassar 80px no end, fecha o chat.
  const [edgeSwipeDx, setEdgeSwipeDx] = useState(0);
  const edgeSwipeRef = useRef<{ active: boolean; startX: number; startY: number } | null>(null);
  const handleEdgeTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    // Só ativa se o toque começou bem na borda esquerda (zona de gesto iOS)
    if (t.clientX > 24) {
      edgeSwipeRef.current = null;
      return;
    }
    edgeSwipeRef.current = { active: true, startX: t.clientX, startY: t.clientY };
  }, []);
  const handleEdgeTouchMove = useCallback((e: React.TouchEvent) => {
    const ref = edgeSwipeRef.current;
    if (!ref || !ref.active) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - ref.startX;
    const dy = t.clientY - ref.startY;
    // Se gesto for mais vertical, cancela (deixa scroll normal funcionar)
    if (Math.abs(dy) > Math.abs(dx) + 10) {
      edgeSwipeRef.current = null;
      setEdgeSwipeDx(0);
      return;
    }
    if (dx > 0) setEdgeSwipeDx(Math.min(dx, 200));
  }, []);
  const handleEdgeTouchEnd = useCallback(() => {
    const ref = edgeSwipeRef.current;
    edgeSwipeRef.current = null;
    if (ref?.active && edgeSwipeDx > 80) {
      // Anima até o fim e fecha
      setEdgeSwipeDx(window.innerWidth);
      setTimeout(() => { setEdgeSwipeDx(0); onClose(); }, 180);
    } else {
      setEdgeSwipeDx(0);
    }
  }, [edgeSwipeDx, onClose]);

  // Busca foto de perfil do outro usuário + escuta mudanças em tempo real.
  useEffect(() => {
    supabase
      .from('usuarios')
      .select('foto_perfil')
      .eq('username', otherUser)
      .maybeSingle()
      .then(({ data }) => { if (data?.foto_perfil) setOtherAvatarUrl(data.foto_perfil); });
    const onUserUpdated = (e: Event) => {
      const d = (e as CustomEvent<{ username: string; foto_perfil: string | null }>).detail;
      if (d?.username === otherUser) setOtherAvatarUrl(d.foto_perfil || '');
    };
    window.addEventListener('papo-user-updated', onUserUpdated);
    return () => window.removeEventListener('papo-user-updated', onUserUpdated);
  }, [otherUser]);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    // Fundo branco + bloqueia pull-to-refresh nativo do iOS
    const prev = {
      htmlBg: html.style.background,
      bodyBg: body.style.background,
      htmlOverscroll: html.style.overscrollBehavior,
      bodyOverscroll: body.style.overscrollBehavior,
      htmlOverflow: html.style.overflow,
    };
    html.style.background = '#fff';
    body.style.background = '#fff';
    html.style.overscrollBehavior = 'none';
    body.style.overscrollBehavior = 'none';
    html.style.overflow = 'hidden';

    // Bloqueia touchmove no document exceto dentro da área de scroll do chat
    const blockPullToRefresh = (e: TouchEvent) => {
      if (scrollRef.current && scrollRef.current.contains(e.target as Node)) return;
      e.preventDefault();
    };
    document.addEventListener('touchmove', blockPullToRefresh, { passive: false });

    const apply = () => {
      if (!containerRef.current) return;
      const vv = window.visualViewport;
      const h = vv ? vv.height : window.innerHeight;
      const offsetTop = vv ? vv.offsetTop : 0;
      containerRef.current.style.height = h + 'px';
      containerRef.current.style.top = offsetTop + 'px';
      // Quando teclado abre, rola mensagens para o fim
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'instant' }), 30);
    };
    // Expõe pro onFocus da textarea (chamada síncrona — iOS Safari nem sempre
    // dispara visualViewport.resize a tempo no momento do focus).
    applyViewportRef.current = apply;
    apply();
    window.visualViewport?.addEventListener('resize', apply);
    window.visualViewport?.addEventListener('scroll', apply);

    return () => {
      applyViewportRef.current = null;
      window.visualViewport?.removeEventListener('resize', apply);
      window.visualViewport?.removeEventListener('scroll', apply);
      document.removeEventListener('touchmove', blockPullToRefresh);
      html.style.background = prev.htmlBg;
      body.style.background = prev.bodyBg;
      html.style.overscrollBehavior = prev.htmlOverscroll;
      body.style.overscrollBehavior = prev.bodyOverscroll;
      html.style.overflow = prev.htmlOverflow;
    };
  }, []);

  // Deriva chave
  useEffect(() => {
    deriveKey(convId).then(k => { setCryptoKey(k); keyRef.current = k; });
  }, [convId]);

  // Auto-focus do input ao abrir uma conversa — o usuário já pode digitar
  // direto sem precisar clicar no campo. Mobile (iOS/Android) tipicamente
  // bloqueia o focus programático sem gesto, mas pelo menos no desktop dispara.
  useEffect(() => {
    const t = setTimeout(() => {
      try { inputRef.current?.focus({ preventScroll: true }); } catch { inputRef.current?.focus(); }
    }, 120);
    return () => clearTimeout(t);
  }, [convId]);

  // Fecha o emoji picker ao clicar fora — devolve o foco para o input,
  // assim o usuário volta direto a digitar sem etapa intermediária.
  useEffect(() => {
    if (!emojiOpen) return;
    function handleDown(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      if (emojiPickerRef.current?.contains(target)) return;
      if (emojiBtnRef.current?.contains(target)) return;
      setEmojiOpen(false);
      setEmojiQuery('');
      try { inputRef.current?.focus({ preventScroll: true }); } catch {}
    }
    document.addEventListener('mousedown', handleDown);
    document.addEventListener('touchstart', handleDown);
    return () => {
      document.removeEventListener('mousedown', handleDown);
      document.removeEventListener('touchstart', handleDown);
    };
  }, [emojiOpen]);

  // Adiciona mensagem sem duplicar.
  // Se a mensagem já existe e o novo texto é VÁLIDO (não é o marcador de falha),
  // permitimos atualizar o texto — assim uma decript posterior bem-sucedida
  // pode CORRIGIR um '[mensagem]' que entrou antes. Nunca fazemos o contrário
  // (texto bom NUNCA é substituído por '[mensagem]').
  const addMessage = useCallback((msg: Message) => {
    if (seenIds.current.has(msg.id)) {
      if (msg.text && msg.text !== '[mensagem]') {
        setMessages(prev => prev.map(m =>
          m.id === msg.id && m.text === '[mensagem]'
            ? { ...m, text: msg.text, rich: msg.rich ?? m.rich }
            : m
        ));
      }
      return;
    }
    seenIds.current.add(msg.id);
    setMessages(prev => [...prev, msg]);
  }, []);

  // Envia mensagem rica (deal/dealRequest/donationAccepted/etc) com optimistic update + broadcast.
  // Garante que o card aparece imediatamente para quem clicou e em tempo real para o outro lado,
  // mesmo se o realtime postgres_changes estiver degradado.
  const sendRichControl = useCallback(async (rich: RichMessage, caption: string) => {
    if (!cryptoKey) return;
    if (!currentUser || !product?.username || !product?.id) return;
    const wireText = buildRichMessage(caption, rich);
    const tempId = 'tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    addMessage({
      id: tempId, text: caption, sender: currentUser, timestamp: new Date(),
      status: 'sending', isMine: true, rich: { ...rich, caption },
    });
    try {
      // Deriva key inline pra evitar race condition cryptoKey↔convId
      const liveKey = await deriveKey(convId);
      const conteudo = await enc(wireText, liveKey);
      const { data } = await supabase
        .from('mensagens')
        .insert({ conversa_id: convId, remetente: currentUser, conteudo })
        .select('id, created_at')
        .single();
      const realId = data?.id || tempId;
      seenIds.current.add(realId);
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, id: realId, status: 'sent' } : m));
      if (data && msgChannelRef.current) {
        msgChannelRef.current.send({
          type: 'broadcast',
          event: 'new_msg',
          payload: { id: realId, remetente: currentUser, conteudo, created_at: data.created_at },
        });
      }
    } catch {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'error' } : m));
    }
  }, [cryptoKey, addMessage, convId, currentUser]);

  // Marca mensagens do outro como lidas
  const markRead = useCallback(async () => {
    try {
      await supabase
        .from('mensagens')
        .update({ lido: true })
        .eq('conversa_id', convId)
        .eq('remetente', otherUser)
        .eq('lido', false);
    } catch { /* coluna pode não existir ainda */ }
  }, [convId, otherUser]);

  // Carrega mensagens do histórico — OTIMIZADO PRA REDUZIR DELAY:
  // 1) Não exige keyRef.current (deriva a chave em paralelo se faltar)
  // 2) chat_hidden + mensagens em paralelo (1 RTT em vez de 2)
  // 3) decript de TODAS as mensagens em paralelo (Promise.all)
  // 4) setMessages único no fim (1 re-render em vez de N)
  const loadMessages = useCallback(async (clear = false) => {
    if (clear) { seenIds.current.clear(); setMessages([]); }

    // Dispara em paralelo: chave + hidden_at + mensagens
    const keyPromise = keyRef.current ? Promise.resolve(keyRef.current) : deriveKey(convId);
    const hiddenPromise = supabase
      .from('chat_hidden')
      .select('hidden_at')
      .eq('username', currentUser)
      .eq('conversa_id', convId)
      .maybeSingle();
    const msgsPromise = supabase
      .from('mensagens')
      .select('id, remetente, conteudo, created_at, lido')
      .eq('conversa_id', convId)
      .order('created_at', { ascending: true });

    const [key, hiddenRes, msgsRes] = await Promise.all([keyPromise, hiddenPromise, msgsPromise]);
    keyRef.current = key;
    const hiddenAt = (hiddenRes.data as any)?.hidden_at;
    let rows = (msgsRes.data as any[]) || [];
    if (hiddenAt) rows = rows.filter(m => m.created_at > hiddenAt);
    if (rows.length === 0) { await markRead(); return; }

    // Decript TODAS em paralelo (vs sequencial — ganho 5–50x em chats grandes)
    const decrypted = await Promise.all(
      rows.map(async (m) => ({ m, plain: await dec(m.conteudo, key, convId) }))
    );

    // Constrói o array completo e dispara setMessages UMA vez
    const built: Message[] = [];
    for (const { m, plain } of decrypted) {
      if (seenIds.current.has(m.id)) continue;
      seenIds.current.add(m.id);
      const isDeleted = plain === DELETED_MARKER;
      const rich = isDeleted ? undefined : (parseRichMessage(plain) || undefined);
      const text = isDeleted ? '' : (rich ? (rich.caption || '') : plain);
      const isMine = m.remetente === currentUser;
      built.push({
        id: m.id, text, sender: m.remetente, timestamp: new Date(m.created_at),
        status: isMine ? (m.lido ? 'read' : 'sent') : 'sent',
        isMine, rich, deleted: isDeleted,
      });
    }
    if (built.length > 0) setMessages(prev => [...prev, ...built]);
    markRead();
  }, [convId, currentUser, markRead]);

  // Pull-to-refresh customizado
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const el = scrollRef.current;
    if (!el || el.scrollTop > 0) return;
    pullStartY.current = e.touches[0].clientY;
    isPulling.current = true;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling.current || refreshing) return;
    const dy = e.touches[0].clientY - pullStartY.current;
    if (dy > 0) {
      e.preventDefault();
      setPullY(Math.min(dy * 0.4, 70));
    }
  }, [refreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current) return;
    isPulling.current = false;
    if (pullY >= 60) {
      setRefreshing(true);
      setPullY(0);
      await Promise.all([
        loadMessages(true),
        new Promise(resolve => setTimeout(resolve, 800)),
      ]);
      setRefreshing(false);
    } else {
      setPullY(0);
    }
  }, [pullY, loadMessages]);

  // Canal de mensagens (Broadcast + Postgres Changes)
  useEffect(() => {
    if (!cryptoKey) return;

    const ch = supabase
      .channel('msg:' + convId, { config: { broadcast: { self: false } } })
      // Broadcast — entrega direta e instantânea
      .on('broadcast', { event: 'new_msg' }, async (payload) => {
        const m = payload.payload as { id: string; remetente: string; conteudo: string; created_at: string };
        if (m.remetente === currentUser) return;
        const decrypted = await dec(m.conteudo, keyRef.current!, convId);
        const rich = parseRichMessage(decrypted) || undefined;
        const text = rich ? (rich.caption || '') : decrypted;
        addMessage({ id: m.id, text, sender: m.remetente, timestamp: new Date(m.created_at), status: 'sent', isMine: false, rich });
        markRead();
      })
      // Postgres Changes — fallback e status de leitura
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'mensagens',
        filter: `conversa_id=eq.${convId}`,
      }, async (payload) => {
        const m = payload.new as { id: string; remetente: string; conteudo: string; created_at: string; lido: boolean };
        if (m.remetente === currentUser) return;
        const decrypted = await dec(m.conteudo, keyRef.current!, convId);
        const rich = parseRichMessage(decrypted) || undefined;
        const text = rich ? (rich.caption || '') : decrypted;
        addMessage({ id: m.id, text, sender: m.remetente, timestamp: new Date(m.created_at), status: 'sent', isMine: false, rich });
        markRead();
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'mensagens',
        filter: `conversa_id=eq.${convId}`,
      }, async (payload) => {
        const m = payload.new as { id: string; lido: boolean; conteudo?: string };
        // Atualiza status de leitura
        if (m.lido) {
          setMessages(prev => prev.map(msg =>
            msg.id === m.id && msg.isMine ? { ...msg, status: 'read' } : msg
          ));
        }
        // Re-decripta conteúdo se ele foi atualizado (apagado, editado ou migração de chave)
        if (m.conteudo && keyRef.current) {
          const decrypted = await dec(m.conteudo, keyRef.current, convId);
          if (decrypted === DELETED_MARKER) {
            setMessages(prev => prev.map(msg =>
              msg.id === m.id ? { ...msg, deleted: true, rich: undefined, text: '' } : msg
            ));
          } else if (decrypted !== '[mensagem]') {
            const rich = parseRichMessage(decrypted) || undefined;
            const text = rich ? (rich.caption || '') : decrypted;
            setMessages(prev => prev.map(msg =>
              msg.id === m.id ? { ...msg, text, rich: rich ?? msg.rich, edited: true } : msg
            ));
          }
        }
      })
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'mensagens',
        filter: `conversa_id=eq.${convId}`,
      }, (payload) => {
        // Fallback: row deletada diretamente no banco — mostra rastro
        const id = (payload.old as { id: string }).id;
        setMessages(prev => prev.map(m =>
          m.id === id ? { ...m, deleted: true, rich: undefined, text: '' } : m
        ));
      })
      .on('broadcast', { event: 'del_msg' }, (payload) => {
        // Broadcast imediato do remetente ao apagar
        const id = (payload.payload as { id: string }).id;
        setMessages(prev => prev.map(m =>
          m.id === id ? { ...m, deleted: true, rich: undefined, text: '' } : m
        ));
      })
      .on('broadcast', { event: 'nudge' }, (payload) => {
        const from = (payload.payload as { from?: string })?.from;
        if (from === currentUser) return;
        window.dispatchEvent(new CustomEvent('papo-nudge', { detail: { from } }));
      })
      .on('broadcast', { event: 'edit_msg' }, async (payload) => {
        const p = payload.payload as { id: string; conteudo: string };
        if (!keyRef.current) return;
        const decrypted = await dec(p.conteudo, keyRef.current, convId);
        if (decrypted === '[mensagem]') return;
        const rich = parseRichMessage(decrypted) || undefined;
        const text = rich ? (rich.caption || '') : decrypted;
        setMessages(prev => prev.map(msg =>
          msg.id === p.id ? { ...msg, text, rich: rich ?? msg.rich, edited: true } : msg
        ));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Reconnected — cancel any pending disconnect banner and show as connected
          if (disconnectTimerRef.current) {
            clearTimeout(disconnectTimerRef.current);
            disconnectTimerRef.current = null;
          }
          setConnected(true);
        } else {
          // Brief glitches are normal in Supabase realtime — only show banner after 6s
          if (!disconnectTimerRef.current) {
            disconnectTimerRef.current = setTimeout(() => {
              disconnectTimerRef.current = null;
              setConnected(false);
            }, 6000);
          }
        }
      });

    loadMessages();
    msgChannelRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
      if (disconnectTimerRef.current) {
        clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
      }
    };
  }, [cryptoKey, convId, currentUser, addMessage, markRead, loadMessages]);

  // Retry automático de decriptação para mensagens que entraram como '[mensagem]'.
  // Re-busca o ciphertext fresco do banco e re-tenta com chave recém-derivada.
  // Tenta até 5 vezes com backoff. Resolve race-conditions entre convId/keyRef.
  const retryAttemptsRef = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    const broken = messages.filter(m => m.text === '[mensagem]' && !m.deleted);
    if (broken.length === 0 || !convId) return;

    const pending = broken.filter(m => (retryAttemptsRef.current.get(m.id) || 0) < 5);
    if (pending.length === 0) return;

    const ids = pending.map(m => m.id);
    const minAttempt = Math.min(...pending.map(m => retryAttemptsRef.current.get(m.id) || 0));
    const delay = 400 * Math.pow(2, minAttempt); // 400ms, 800ms, 1.6s, 3.2s, 6.4s

    const timer = setTimeout(async () => {
      for (const id of ids) {
        retryAttemptsRef.current.set(id, (retryAttemptsRef.current.get(id) || 0) + 1);
      }
      const { data } = await supabase
        .from('mensagens')
        .select('id, conteudo')
        .in('id', ids);
      if (!data) return;
      const freshKey = await deriveKey(convId);
      for (const row of data as { id: string; conteudo: string }[]) {
        const decrypted = await dec(row.conteudo, freshKey, convId);
        if (decrypted === '[mensagem]') continue;
        const rich = parseRichMessage(decrypted) || undefined;
        const text = rich ? (rich.caption || '') : decrypted;
        setMessages(prev => prev.map(m =>
          m.id === row.id && m.text === '[mensagem]'
            ? { ...m, text, rich: rich ?? m.rich }
            : m
        ));
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [messages, convId]);

  // Canal de presença POR CONVERSA — usado SÓ pra "digitando" agora.
  // (Status online passou a vir do canal GLOBAL abaixo — antes o user
  // aparecia offline mesmo logado se ele não estivesse com este mesmo
  // chat aberto, porque o presence era scoped por convId.)
  useEffect(() => {
    const pch = supabase.channel('presence:' + convId, {
      config: { presence: { key: currentUser } },
    });

    pch
      .on('presence', { event: 'sync' }, () => {
        const state = pch.presenceState();
        const others = Object.entries(state)
          .filter(([key]) => key !== currentUser)
          .flatMap(([, v]) => v as { typing?: boolean }[]);
        setOtherTyping(others.some(u => u.typing));
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        if (key !== currentUser) setOtherTyping(false);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await pch.track({ typing: false });
        }
      });

    presenceChannelRef.current = pch;
    return () => { supabase.removeChannel(pch); };
  }, [convId, currentUser]);

  // Canal de presença GLOBAL — todo user logado se registra aqui ao montar
  // o chat. ChatPanel só precisa saber se otherUser está em qualquer aba
  // do app. Estado real-time via sync/join/leave.
  useEffect(() => {
    if (!otherUser) return;
    const pch = supabase.channel('presence:online', {
      config: { presence: { key: currentUser } },
    });
    const recalc = () => {
      const state = pch.presenceState();
      setOtherOnline(Object.prototype.hasOwnProperty.call(state, otherUser));
    };
    pch
      .on('presence', { event: 'sync' }, recalc)
      .on('presence', { event: 'join' }, ({ key }) => { if (key === otherUser) setOtherOnline(true); })
      .on('presence', { event: 'leave' }, ({ key }) => { if (key === otherUser) setOtherOnline(false); })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') { await pch.track({ at: Date.now() }); recalc(); }
      });
    return () => { supabase.removeChannel(pch); };
  }, [currentUser, otherUser]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, otherTyping]);

  // Digitando
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const prevLen = input.length;
    const nextLen = e.target.value.length;
    setInput(e.target.value);
    // Som diferente p/ digitar vs apagar — feedback claro pro usuário
    if (nextLen > prevLen) playTypingSound();
    else if (nextLen < prevLen) playEraseSound();
    // Auto-grow: cresce para baixo conforme o usuario digita (max 6 linhas ~= 144px)
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 144) + 'px';
    const pch = presenceChannelRef.current;
    if (!pch) return;
    pch.track({ typing: true });
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => pch.track({ typing: false }), 2000);
  };

  // Envio (texto, mídia ou ambos; com reply opcional)
  const showBlockedWarning = useCallback(() => {
    setContentBlocked(true);
    if (blockedTimerRef.current) clearTimeout(blockedTimerRef.current);
    blockedTimerRef.current = setTimeout(() => setContentBlocked(false), 4000);
  }, []);

  const sendMessage = useCallback(async (
    text: string,
    extra?: { media?: { type: MediaKind; url: string; mime: string; duration?: number } }
  ) => {
    if (!cryptoKey) return;
    // Guarda: nunca envia sem identidade completa — protege contra convId malformado
    // (ex.: currentUser vazio gera convId tipo '__outroUser__id', incompatível com receiver)
    if (!currentUser || !product?.username || !product?.id) return;
    const trimmed = text.trim();
    if (!trimmed && !extra?.media) return;

    // ── Filtro de conteúdo ──────────────────────────────────────────────
    if (trimmed) {
      const { blocked } = filterContent(trimmed);
      if (blocked) { showBlockedWarning(); return; }
    }

    const replySnapshot = replyTo;
    const richEnvelope: Omit<RichMessage, 'caption'> | undefined =
      extra?.media || replySnapshot
        ? {
            type: extra?.media?.type,
            url: extra?.media?.url,
            mime: extra?.media?.mime,
            duration: extra?.media?.duration,
            replyTo: replySnapshot || undefined,
          }
        : undefined;

    const wireText = buildRichMessage(trimmed, richEnvelope);
    const richForUI: RichMessage | undefined = richEnvelope
      ? { ...richEnvelope, caption: trimmed || undefined }
      : undefined;

    setReplyTo(null);
    presenceChannelRef.current?.track({ typing: false });

    const tempId = 'tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    addMessage({
      id: tempId, text: trimmed, sender: currentUser, timestamp: new Date(),
      status: 'sending', isMine: true, rich: richForUI,
    });

    try {
      // CRÍTICO: deriva a key A PARTIR do convId atual no momento do envio.
      // Evita race condition onde cryptoKey (state) ficou de um convId antigo
      // mas convId (memo) já mudou — resultando em mensagem indecifrável.
      const liveKey = await deriveKey(convId);
      const conteudo = await enc(wireText, liveKey);
      const { data } = await supabase
        .from('mensagens')
        .insert({ conversa_id: convId, remetente: currentUser, conteudo })
        .select('id, created_at')
        .single();

      const realId = data?.id || tempId;
      seenIds.current.add(realId);
      setMessages(prev => prev.map(m =>
        m.id === tempId ? { ...m, id: realId, status: 'sent' } : m
      ));

      // Broadcast para entrega imediata ao outro usuário
      if (data && msgChannelRef.current) {
        msgChannelRef.current.send({
          type: 'broadcast',
          event: 'new_msg',
          payload: { id: realId, remetente: currentUser, conteudo, created_at: data.created_at },
        });
      }

      // Push notification para TODOS os dispositivos do destinatario.
      // Servidor faz o lookup de push_subscriptions com SERVICE_ROLE (bypassa
      // RLS). Antes o client tentava ler direto -> RLS bloqueava -> 0 push.
      try {
        const previewMsg = trimmed || (extra?.media ? `[${extra.media.type}]` : '');
        fetch(`${apiBase()}/api/send-push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toUsername: otherUser,
            fromUsername: currentUser,
            message: previewMsg,
          }),
        }).catch(() => {});
      } catch { /* silently ignore */ }

      // Email de notificação com preview da mensagem (cooldown global por destinatário)
      const emailPreview = trimmed || (extra?.media ? `[${extra.media.type}]` : '');
      sendEmailNotif(otherUser, 'message', currentUser, { messageContent: emailPreview.slice(0, 300) });
    } catch {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'error' } : m));
    }
  }, [cryptoKey, replyTo, addMessage, convId, currentUser, otherUser]);

  // Form: enviar texto puro
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      await saveEdit();
      return;
    }
    if (!input.trim()) return;
    const txt = input;
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    playSendSound();
    await sendMessage(txt);
  };

  // ── Upload de mídia (imagem / vídeo / áudio) ────────────────────────────
  const handleFilePicked = useCallback(async (file: File, kind: MediaKind) => {
    setAttachOpen(false);
    const maxMB = kind === 'image' ? 10 : kind === 'audio' ? 25 : 50;
    if (file.size > maxMB * 1024 * 1024) {
      alert(`Arquivo muito grande (máx ${maxMB}MB)`);
      return;
    }
    setUploading(true);
    try {
      const ext = extFromMime(file.type, file.name.split('.').pop() || 'bin');
      const result = await uploadMedia(file, ext, convId, kind);
      if ('error' in result) {
        alert('Falha ao enviar mídia: ' + result.error + '\n(O bucket "chat-media" precisa existir no Supabase Storage como público)');
        return;
      }
      await sendMessage('', { media: { type: kind, url: result.url, mime: result.mime } });
    } finally {
      setUploading(false);
    }
  }, [convId, sendMessage]);

  // ── Gravação de áudio ───────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (recording) return;
    try {
      // CRÍTICO: o som de start TEM que tocar ANTES do mic ligar — caso contrário
      // o próprio mic captura nosso beep e fica vazando junto com o nativo do iOS.
      playRecordStartSound();
      // Pequeno delay pra o som terminar antes do mic ligar (~180ms = duração total)
      await new Promise(r => setTimeout(r, 180));
      // Reusa stream existente (evita prompt de permissão repetido em iOS).
      let stream = micStreamRef.current;
      if (!stream || stream.getTracks().every(t => t.readyState === 'ended')) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = stream;
      }
      recordCancelledRef.current = false;
      const mimeType = await getRecorderMimeType();
      const recorder = new MediaRecorder(stream, { mimeType });
      recordChunks.current = [];
      // STT em paralelo — capta texto do que está sendo falado.
      // Usa pt-BR como default (assumindo usuario brasileiro). Receptor traduz
      // pro idioma escolhido nas Configuracoes.
      const srcLang = 'pt-BR';
      sttHandleRef.current = startSpeechRecognition(srcLang);
      if (!sttHandleRef.current) {
        console.warn('[audio-translate] Web Speech API nao disponivel neste browser. Audio sera enviado sem transcript.');
      }
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordChunks.current.push(e.data); };
      recorder.onstop = async () => {
        // NÃO paramos os tracks do mic — reusamos na próxima gravação (evita
        // prompt de permissão repetido em iOS). Stream só é liberado no unmount.
        if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
        // Cancelado pelo usuário → aborta tudo, NÃO faz upload
        if (recordCancelledRef.current) {
          recordCancelledRef.current = false;
          sttHandleRef.current?.cancel();
          sttHandleRef.current = null;
          recordChunks.current = [];
          setRecording(false);
          setRecordSeconds(0);
          return;
        }
        // Capta transcript final do STT
        const transcript = sttHandleRef.current?.stop() || '';
        sttHandleRef.current = null;
        const duration = Math.round((Date.now() - recordStartRef.current) / 1000);
        const blob = new Blob(recordChunks.current, { type: mimeType });
        if (blob.size < 800) { setRecording(false); setRecordSeconds(0); return; }
        setRecording(false);
        setRecordSeconds(0);
        setUploading(true);
        try {
          const ext = mimeType.includes('mp4') ? 'm4a' : mimeType.includes('ogg') ? 'ogg' : 'webm';
          const result = await uploadMedia(blob, ext, convId, 'audio');
          if ('error' in result) {
            alert('Falha ao enviar áudio: ' + result.error);
            return;
          }

          // Se o remetente escolheu um idioma alvo pra esta conversa, chama o
          // backend Groq pra transcrever+traduzir antes de enviar a mensagem.
          // Receptor vai ver o audio + texto traduzido + botao pra ouvir TTS.
          let translatedText: string | undefined;
          let targetLangSent: string | undefined;
          if (convTargetLang) {
            setAudioTranslating(true);
            try {
              const r = await translateAudioServer(result.url, convTargetLang);
              if ('error' in r) {
                // Nao bloqueia o envio do audio — apenas registra
                console.warn('[translate-audio]', r.error);
              } else if (r.translated) {
                translatedText = r.translated;
                targetLangSent = convTargetLang;
              }
            } finally { setAudioTranslating(false); }
          }

          await sendMessage('', { media: {
            type: 'audio',
            url: result.url,
            mime: mimeType,
            duration,
            transcript: transcript || undefined,
            srcLang: transcript ? srcLang : (translatedText ? 'auto' : undefined),
            translatedText,
            targetLang: targetLangSent,
          } });
        } finally { setUploading(false); }
      };
      recorderRef.current = recorder;
      recordStartRef.current = Date.now();
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => {
        setRecordSeconds(Math.round((Date.now() - recordStartRef.current) / 1000));
      }, 500);
      recorder.start();
      setRecording(true);
    } catch (err) {
      console.error('mic error', err);
      alert('Não foi possível acessar o microfone');
    }
  }, [recording, convId, sendMessage]);

  const stopRecording = useCallback((cancel = false) => {
    const r = recorderRef.current;
    if (!r) return;
    if (cancel) {
      recordCancelledRef.current = true;
      playRecordCancelSound();
    }
    // r.stop() dispara o onstop handler que vê a flag e aborta sem enviar
    try { r.stop(); } catch {}
    recorderRef.current = null;
  }, []);

  // Libera o stream de mic ao desmontar o chat (não deixa luz vermelha acesa)
  useEffect(() => {
    return () => {
      const s = micStreamRef.current;
      if (s) {
        s.getTracks().forEach(t => t.stop());
        micStreamRef.current = null;
      }
    };
  }, []);

  // ── Status icon ──────────────────────────────────────────────────────────
  function StatusIcon({ status }: { status: MsgStatus }) {
    if (status === 'sending') return <Circle className="w-3 h-3 text-purple-300 animate-pulse" />;
    if (status === 'error') return <span className="text-[10px] text-red-300">!</span>;
    if (status === 'read') return <CheckCheck className="w-3.5 h-3.5 text-blue-300" />;
    return <Check className="w-3 h-3 text-purple-300" />;
  }

  return (
    <>
    <div
      ref={containerRef}
      className="flex flex-col bg-white"
      onTouchStart={handleEdgeTouchStart}
      onTouchMove={handleEdgeTouchMove}
      onTouchEnd={handleEdgeTouchEnd}
      onTouchCancel={handleEdgeTouchEnd}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        width: '100%',
        maxWidth: '100vw',
        height: '100dvh',
        zIndex: 70,
        overscrollBehavior: 'none',
        overflow: 'hidden',
        transform: edgeSwipeDx > 0 ? `translateX(${edgeSwipeDx}px)` : undefined,
        transition: edgeSwipeRef.current?.active ? 'none' : 'transform 0.18s ease-out',
      }}
    >

      {/* Header — padding-top cobre status bar do iPhone */}
      <div className="px-4 py-3 flex items-center gap-3 flex-shrink-0 shadow-md" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))', background: palette.mine, color: headerTextColor }}>
        {/* Input oculto pra trocar imagem do grupo (só criador) */}
        {canEditGroup && (
          <input ref={groupAvatarFileRef} type="file" accept="image/*" onChange={handleGroupAvatarChange} style={{ display: 'none' }} />
        )}
        <div
          className="relative flex-shrink-0 cursor-pointer"
          onClick={() => {
            if (canEditGroup) { groupAvatarFileRef.current?.click(); return; }
            if (!isGroup) onViewProfile?.(otherUser);
          }}
          title={canEditGroup ? 'Trocar imagem do grupo' : undefined}
        >
          {isGroup ? (
            groupAvatar ? (
              <img src={groupAvatar} alt={otherUser} className="w-10 h-10 rounded-full object-cover transition-all" style={{ boxShadow: `0 0 0 2px ${headerRingColor}` }} />
            ) : (
              <div className="w-10 h-10 rounded-full flex items-center justify-center transition-all"
                style={{ background: 'linear-gradient(135deg,#1e714a,#4ade80)', color: '#fff', boxShadow: `0 0 0 2px ${headerRingColor}` }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </div>
            )
          ) : otherAvatarUrl ? (
            <img src={otherAvatarUrl} alt={otherUser} className="w-10 h-10 rounded-full object-cover transition-all" style={{ boxShadow: `0 0 0 2px ${headerRingColor}` }} />
          ) : (
            <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all"
              style={{ background: avatarColor(otherUser)[0], color: avatarColor(otherUser)[1], boxShadow: `0 0 0 2px ${headerRingColor}` }}>
              {otherUser.slice(0, 2).toUpperCase()}
            </div>
          )}
          {canEditGroup && (
            <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-white flex items-center justify-center" style={{ border: '1.5px solid #6d28d9' }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#5a7a52" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            </span>
          )}
          {uploadingGroupAvatar && (
            <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {!isGroup && otherOnline && (
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 rounded-full border-2 border-purple-700" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm truncate" style={{ color: headerTextColor }}>{isGroup ? otherUser : `@${otherUser}`}</p>
          <p className="text-xs truncate" style={{ color: headerSubColor }}>
            {isGroup
              ? product.description || 'Grupo'
              : otherTyping
                ? <span className="font-medium animate-pulse" style={{ color: headerOnlineColor }}>digitando…</span>
                : otherOnline ? <span style={{ color: headerOnlineColor }}>online</span>
                : <span style={{ color: headerOfflineColor }}>offline</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!connected && (
            <span className="flex items-center gap-1 bg-red-500 rounded-full px-2 py-0.5 text-xs font-semibold">
              <WifiOff className="w-3 h-3" /> Reconectando…
            </span>
          )}
          {/* Cutucar — estilo MSN */}
          <button
            onClick={async () => {
              const now = Date.now();
              if (now - nudgeSentAt < 3000) return;
              setNudgeSentAt(now);
              // Confirmação visual/sonora pro emissor (independe de bloqueio).
              window.dispatchEvent(new CustomEvent('papo-nudge', { detail: { from: currentUser } }));
              // ANTES de enviar pro outro user, checa se ELE me bloqueou.
              // Se sim: aborta totalmente — sem broadcast, sem push notif,
              // sem app_notifications row. O receptor não recebe nada.
              if (otherUser && otherUser !== currentUser) {
                const blocked = await isNudgeBlockedRemote(currentUser, otherUser);
                if (blocked) return;
                const userCh = supabase.channel(`notif:${otherUser}`);
                userCh.subscribe((status) => {
                  if (status === 'SUBSCRIBED') {
                    userCh.send({
                      type: 'broadcast', event: 'nudge',
                      payload: { from: currentUser },
                    }).finally(() => {
                      setTimeout(() => supabase.removeChannel(userCh), 500);
                    });
                  }
                });
              }
              // Fallback no canal do chat
              msgChannelRef.current?.send({
                type: 'broadcast', event: 'nudge', payload: { from: currentUser },
              });
              if (otherUser && otherUser !== currentUser) {
                notifyUser(otherUser, currentUser, 'nudge',
                  `👋 @${currentUser} está te chamando!!`,
                  `@${currentUser} está te chamando!!`);
              }
            }}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
            style={{ color: headerTextColor, background: 'transparent' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = headerHoverBg; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            title="Cutucar"
          >
            <Zap className="w-4 h-4" />
          </button>

          {/* Bloquear/desbloquear cutucadas — só 1-1, ao lado do Cutucar */}
          {!isGroup && (
            <button
              onClick={() => {
                if (nudgeBlocked) unblockNudge(currentUser, otherUser);
                else blockNudge(currentUser, otherUser);
              }}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
              style={{ color: headerTextColor, background: 'transparent' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = headerHoverBg; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              title={nudgeBlocked ? 'Cutucadas bloqueadas — toque pra desbloquear' : 'Bloquear cutucadas deste usuário'}
            >
              {nudgeBlocked ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
            </button>
          )}

          {/* Opcoes do chat */}
          <div className="relative">
            <button
              onClick={() => { setOptsOpen(v => !v); setLangMenuOpen(false); }}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
              style={{ color: headerTextColor, background: 'transparent' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = headerHoverBg; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              title="Opções"
            >
              <Sliders className="w-4 h-4" />
            </button>
            {optsOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setOptsOpen(false)} />
                <div className="absolute right-0 mt-2 w-72 max-h-[70vh] overflow-y-auto rounded-xl shadow-xl z-50 bg-white border border-gray-200 p-3">
                  <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-1.5">Fundo</p>
                  <div className="grid grid-cols-5 gap-1.5 mb-3">
                    {([
                      { id: 'studentclub' }, { id: 'mint' }, { id: 'sky' }, { id: 'sand' },
                      { id: 'rose' }, { id: 'mocha' }, { id: 'ocean' }, { id: 'forest' }, { id: 'sunset' },
                      { id: 'tgday' }, { id: 'tgnight' }, { id: 'tgspring' }, { id: 'tgpink' }, { id: 'tgcyan' },
                      { id: 'tgdunes' }, { id: 'tgtwilight' }, { id: 'tgsea' },
                    ] as const).map(b => (
                      <button
                        key={b.id}
                        onClick={() => setChatOpts(o => ({ ...o, bg: b.id }))}
                        className={`h-10 rounded-lg border-2 chat-bg-${b.id} ${chatOpts.bg === b.id ? 'border-purple-600 ring-2 ring-purple-200' : 'border-gray-200'}`}
                        title={b.id}
                      />
                    ))}
                  </div>

                  <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-1.5">Tamanho do texto</p>
                  <div className="grid grid-cols-3 gap-1.5 mb-3">
                    {(['sm','base','lg'] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => setChatOpts(o => ({ ...o, font: f }))}
                        className={`py-2 rounded-lg font-semibold border ${chatOpts.font === f ? 'bg-purple-600 text-white border-purple-600' : 'bg-gray-50 text-gray-700 border-gray-200'}`}
                        style={{ fontSize: f === 'sm' ? 12 : f === 'lg' ? 18 : 14 }}
                      >
                        {f === 'sm' ? 'A−' : f === 'lg' ? 'A+' : 'A'}
                      </button>
                    ))}
                  </div>

                  <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-1.5">Estilo de fonte (20)</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {([
                      { id: 'sans', label: 'Sans' },
                      { id: 'serif', label: 'Serif' },
                      { id: 'mono', label: 'Mono' },
                      { id: 'rounded', label: 'Nunito' },
                      { id: 'condensed', label: 'Condensed' },
                      { id: 'display', label: 'Display' },
                      { id: 'elegant', label: 'Playfair' },
                      { id: 'script', label: 'Dancing' },
                      { id: 'comic', label: 'Comic' },
                      { id: 'typewriter', label: 'Typewriter' },
                      { id: 'modern', label: 'Inter' },
                      { id: 'classic', label: 'Times' },
                      { id: 'friendly', label: 'Quicksand' },
                      { id: 'tech', label: 'Tech Mono' },
                      { id: 'bold', label: 'Archivo' },
                      { id: 'handwrite', label: 'Caveat' },
                      { id: 'magazine', label: 'Bebas' },
                      { id: 'soft', label: 'Manrope' },
                      { id: 'game', label: 'Pixel' },
                      { id: 'fairy', label: 'Indie' },
                    ] as const).map(ff => (
                      <button
                        key={ff.id}
                        onClick={() => setChatOpts(o => ({ ...o, family: ff.id }))}
                        className={`py-1.5 px-2 rounded-lg text-xs border truncate text-left chat-ff-${ff.id} ${chatOpts.family === ff.id ? 'bg-purple-600 text-white border-purple-600' : 'bg-gray-50 text-gray-700 border-gray-200'}`}
                      >
                        {ff.label}
                      </button>
                    ))}
                  </div>

                </div>
              </>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => { setLangMenuOpen(v => !v); setOptsOpen(false); }}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
              style={{ color: headerTextColor, background: 'transparent' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = headerHoverBg; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              title="Idioma / Language"
            >
              <Globe className="w-4 h-4" />
            </button>
            {langMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setLangMenuOpen(false)} />
                <div className="absolute right-0 mt-2 w-36 rounded-xl shadow-xl z-50 overflow-hidden bg-white border border-gray-200">
                  {([
                    { code: 'pt', label: '🇧🇷 Português' },
                    { code: 'en', label: '🇺🇸 English' },
                    { code: 'es', label: '🇪🇸 Español' },
                  ] as const).map(opt => (
                    <button
                      key={opt.code}
                      onClick={() => { setLang(opt.code as any); setLangMenuOpen(false); }}
                      className={`block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${lang === opt.code ? 'font-semibold text-purple-700' : 'text-gray-800'}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="ml-1 transition-opacity"
            style={{ color: headerTextColor }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.7'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Banner de criptografia removido. */}

      {/* Barra de perfis (avatares dos dois) removida — só topbar mantém a foto do
           outro usuário, com clique pra abrir o modal de perfil. O botão "Pedir
           fechamento" (legacy, só PJ com troca de anúncio) foi mantido aqui pra
           não quebrar fluxo existente — fica em um wrapper minimalista quando aplicável. */}
      {product.username === currentUser && onFinalizar && !((product as any).tipo === 'doacao' || (product.wantsInExchange || '').trim().toLowerCase().startsWith('doa')) && (
        <div className="bg-white border-b border-purple-50 px-4 py-2 flex items-center justify-end flex-shrink-0">
          <>
            {/* linha conectora — mesma estrutura do conector roxo para alinhar */}
            <div className="flex flex-col items-center gap-0.5 mx-1">
              <div className="flex items-center">
                <div className="w-5 h-px" style={{ background: 'linear-gradient(90deg,#a855f7,#22c55e)' }} />
              </div>
              <span className="text-[9px] opacity-0 select-none">·</span>
            </div>
            {/* botão — mesma estrutura de altura que as colunas de avatar */}
            <div className="flex flex-col items-center gap-1 group relative">
              <button
                onClick={async () => {
                  // Bloqueia se já houver um pedido pendente sem resposta
                  const lastDealMsg = [...messages].reverse().find(m => {
                    const t = m.rich?.type;
                    return t === 'dealRequest' || t === 'deal' || t === 'dealRejected';
                  });
                  if (lastDealMsg?.rich?.type === 'dealRequest') return;

                  // Pega a última proposta enviada pelo interessado (não é minha, sou o dono)
                  const otherProposal = [...messages].reverse().find(m => {
                    if (m.isMine) return false;
                    return parseProposal(m.text) !== null;
                  });
                  const parsedOther = otherProposal ? parseProposal(otherProposal.text) : null;
                  const fromItemData = parsedOther ? (parsedOther.fromItems?.[0] ?? parsedOther.fromItem) : undefined;

                  await sendRichControl({
                    type: 'dealRequest',
                    dealProduct: {
                      id: product.id,
                      title: product.title,
                      image: product.image || '',
                      username: product.username,
                      description: product.description,
                      category: product.category,
                    },
                    ...(fromItemData ? {
                      dealFromProduct: {
                        id: fromItemData.id,
                        title: fromItemData.title,
                        image: fromItemData.image || '',
                        username: otherUser,
                      }
                    } : {}),
                  }, AT.chatDealRequestTitle);
                }}
                className="w-9 h-9 rounded-full active:scale-95 transition-all flex items-center justify-center shadow-md"
                style={{ background: 'linear-gradient(135deg,#22c55e,#7c3aed)', boxShadow: '0 4px 12px rgba(124,58,237,0.3)' }}
              >
                <span className="text-base leading-none select-none">✅</span>
              </button>
              <span className="text-[10px] text-green-600 font-semibold whitespace-nowrap">{AT.chatDealClose}</span>
              {/* linha vazia para igualar altura com colunas de avatar (que têm 3 linhas de texto) */}
              <span className="text-[9px] opacity-0 select-none">·</span>
              {/* Tooltip */}
              <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] font-semibold px-2.5 py-1.5 rounded-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-20 shadow-lg">
                {AT.chatDealTooltip(otherUser)}
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45" />
              </div>
            </div>
          </>
        </div>
      )}

      {/* Mensagens */}
      <div
        ref={scrollRef}
        className={`flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 space-y-1 min-h-0 relative chat-bg-${chatOpts.bg}`}
        style={{
          overscrollBehavior: 'none',
          fontFamily: FONT_FAMILY[chatOpts.family],
          fontSize: FONT_SIZE[chatOpts.font],
          // CSS vars consumidas pelas bubbles abaixo (.bubble-mine / .bubble-other)
          ['--bubble-mine' as any]: palette.mine,
          ['--bubble-other' as any]: palette.other,
          ['--bubble-mine-text' as any]: palette.mineText,
          ['--bubble-other-text' as any]: palette.otherText,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Pull-to-refresh — animação dos bonecos */}
        {(pullY > 0 || refreshing) && (
          <div className="flex flex-col items-center justify-center py-3 gap-1"
            style={{ opacity: refreshing ? 1 : pullY / 60 }}>
            <style>{`
              @keyframes cswap-bounce { 0%,100%{transform:scale(1)} 50%{transform:scale(1.1)} }
              .cswap-anim { animation: cswap-bounce 0.9s ease-in-out infinite; }
            `}</style>
            <div className="flex items-center justify-center">
              <img src="/logo-students.png" alt="" className={`w-14 h-14 object-contain${refreshing ? ' cswap-anim' : ''}`} />
            </div>
            <span className="text-xs text-purple-400 font-medium">
              {refreshing ? AT.chatRefreshing : pullY >= 60 ? AT.chatReleaseRefresh : AT.chatPullRefresh}
            </span>
          </div>
        )}
        {messages.length === 0 && (
          <div className="text-center pt-16 text-gray-400 text-sm">
            <p className="font-medium text-gray-500">{AT.chatEmptyHint(otherUser)}</p>
          </div>
        )}

        {messages.map((msg, i) => {
          const prev = messages[i - 1];
          const showDate = !prev || !sameDay(prev.timestamp, msg.timestamp);
          const showSender = !prev || prev.sender !== msg.sender;

          return (
            <div key={msg.id} id={`msg-${msg.id}`}>
              {/* Separador de data */}
              {showDate && (
                <div className="flex items-center gap-2 my-3">
                  <div className="flex-1 h-px bg-purple-100" />
                  <span className="text-[11px] text-gray-400 font-medium bg-white px-3 py-0.5 rounded-full border border-purple-100">
                    {dateLabel(msg.timestamp, AT.chatToday, AT.chatYesterday, lang)}
                  </span>
                  <div className="flex-1 h-px bg-purple-100" />
                </div>
              )}

              {/* Balão — swipe esquerda para responder (direita reservada p/ goBack global) */}
              <div
                className={`flex items-end gap-1.5 ${msg.isMine ? 'justify-end' : 'justify-start'} ${showSender ? 'mt-2' : 'mt-0.5'} relative select-none rounded-xl transition-colors duration-300 ${highlightId === msg.id ? 'bg-yellow-100' : ''}`}
                style={{
                  transform: swipeState?.id === msg.id && swipeState.dx < 0 ? `translateX(${Math.max(swipeState.dx, -56)}px)` : 'translateX(0)',
                  transition: swipeState?.id === msg.id ? 'none' : 'transform 0.2s ease',
                  willChange: 'transform',
                  contain: 'layout',
                }}
                onMouseEnter={() => { if (msg.isMine && canModify(msg)) setHoveredMsgId(msg.id); }}
                onMouseLeave={() => setHoveredMsgId(prev => prev === msg.id ? null : prev)}
                onContextMenu={(e) => {
                  if (msg.isMine && canModify(msg)) {
                    e.preventDefault();
                    openActionMenu(msg);
                  }
                }}
                onTouchStart={(e) => {
                  swipeTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, id: msg.id };
                  longPressFired.current = false;
                  if (msg.isMine && canModify(msg)) {
                    if (longPressTimer.current) clearTimeout(longPressTimer.current);
                    longPressTimer.current = setTimeout(() => {
                      longPressFired.current = true;
                      openActionMenu(msg);
                    }, 550);
                  }
                }}
                onTouchMove={(e) => {
                  const start = swipeTouchRef.current;
                  if (!start || start.id !== msg.id) return;
                  const dx = e.touches[0].clientX - start.x;
                  const dy = e.touches[0].clientY - start.y;
                  if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
                    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
                  }
                  if (Math.abs(dy) > Math.abs(dx)) return; // vertical scroll
                  if (dx < 0) {
                    e.stopPropagation();
                    setSwipeState({ id: msg.id, dx });
                  }
                }}
                onTouchEnd={() => {
                  if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
                  const cur = swipeState;
                  if (!longPressFired.current && cur?.id === msg.id && cur.dx < -48) {
                    const previewText = msg.text || (msg.rich?.type ? `[${msg.rich.type}]` : '');
                    setReplyTo({ id: msg.id, text: previewText, sender: msg.sender });
                    if (!('ontouchstart' in window)) setTimeout(() => inputRef.current?.focus(), 50);
                  }
                  setSwipeState(null);
                  swipeTouchRef.current = null;
                }}
              >
                {/* Ícone reply aparece durante swipe */}
                {swipeState?.id === msg.id && swipeState.dx > 12 && (
                  <div
                    className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center justify-center"
                    style={{ opacity: Math.min(swipeState.dx / 48, 1) }}
                  >
                    <Reply className="w-5 h-5 text-purple-400" />
                  </div>
                )}
                {/* Avatar do outro usuário — esquerda */}
                {!msg.isMine && (
                  <div style={{ opacity: showSender ? 1 : 0, flexShrink: 0 }}>
                    <UserAvatar username={otherUser} photoUrl={otherAvatarUrl} size={24} />
                  </div>
                )}
                <div className={`max-w-[75%] flex flex-col ${msg.isMine ? 'items-end' : 'items-start'} relative`}>
                  {/* Seta de ações — hover desktop (estilo WhatsApp Web) */}
                  {hoveredMsgId === msg.id && msg.isMine && canModify(msg) && !msg.deleted && (
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      onClick={(e) => { e.stopPropagation(); openActionMenu(msg); }}
                      className="absolute -top-1 -right-1 z-10 w-6 h-6 rounded-full bg-white shadow-md border border-gray-200 flex items-center justify-center hover:bg-purple-50 transition-colors"
                      title="Opções da mensagem"
                      style={{ lineHeight: 1 }}
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M2 3.5L5 6.5L8 3.5" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  )}
                  {/* Mensagem apagada */}
                  {msg.deleted ? (
                    <div className={`flex items-center gap-1.5 px-3.5 py-2 rounded-2xl ${msg.isMine ? 'rounded-br-sm' : 'rounded-bl-sm'} border`}
                      style={{
                        background: msg.isMine ? 'rgba(124,58,237,0.08)' : '#f9fafb',
                        borderColor: msg.isMine ? 'rgba(124,58,237,0.2)' : '#e5e7eb',
                      }}>
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}>
                        <circle cx="6.5" cy="6.5" r="6" stroke={msg.isMine ? '#a78bfa' : '#9ca3af'} strokeWidth="1"/>
                        <path d="M4 9L9 4M4 4l5 5" stroke={msg.isMine ? '#a78bfa' : '#9ca3af'} strokeWidth="1.2" strokeLinecap="round"/>
                      </svg>
                      <span className="text-xs italic" style={{ color: msg.isMine ? '#a78bfa' : '#9ca3af' }}>
                        {msg.isMine ? AT.chatDeletedByMe : AT.chatDeletedByOther}
                      </span>
                    </div>
                  ) : null}
                  {/* Card especial de proposta de troca */}
                  {!msg.deleted && (() => {
                    // ── Card de doação ──
                    const doacao = parseDoacaoAcceptance(msg.text);
                    if (doacao) {
                      // Quem RECEBE o pedido (lado que não enviou) é o doador, e pode aceitar.
                      // Regra baseada em msg.isMine — robusta e não depende de product.username (que pode divergir entre origens do objeto Product).
                      const canAccept = !msg.isMine && !!onFinalizar;
                      // Já fechado? procura mensagem 'deal' depois desta
                      const idx = messages.findIndex(m => m.id === msg.id);
                      const alreadyClosed = idx >= 0 && messages.slice(idx + 1).some(m => m.rich?.type === 'deal');
                      // Já existe um donationAccepted depois deste pedido?
                      const alreadyAccepted = idx >= 0 && messages.slice(idx + 1).some(m => m.rich?.type === 'donationAccepted');
                      const acceptClick = async () => {
                        if (!canAccept || alreadyClosed || alreadyAccepted) return;
                        await sendRichControl({
                          type: 'donationAccepted',
                          dealProduct: {
                            id: product.id,
                            title: product.title,
                            image: product.image || '',
                            username: product.username,
                            description: product.description,
                            category: product.category,
                          },
                        }, AT.chatDonationAcceptedTitle);
                      };
                      return (
                        <div
                          onClick={acceptClick}
                          className={`rounded-2xl overflow-hidden shadow-sm border ${msg.status === 'error' ? 'opacity-60' : ''} ${canAccept && !alreadyClosed ? 'cursor-pointer active:scale-95 transition-transform hover:shadow-md' : ''}`}
                          style={{
                            background: msg.isMine ? 'linear-gradient(135deg,#7c22fa,#a855f7)' : '#fff',
                            borderColor: msg.isMine ? 'transparent' : '#e5e7eb',
                            minWidth: 200,
                          }}
                        >
                          {/* Header */}
                          <div
                            className={`px-3 py-2 flex items-center gap-1.5 ${msg.isMine ? 'text-white/90' : 'text-purple-700'}`}
                            style={{ background: msg.isMine ? 'rgba(0,0,0,0.15)' : '#f5f0ff' }}
                          >
                            <span className="text-sm">🎁</span>
                            <span className="text-xs font-bold">Pedido de Doação</span>
                          </div>
                          {/* Imagem + info */}
                          <div className="flex flex-col items-center gap-2 px-4 py-3">
                            <img
                              src={doacao.product.image}
                              alt={doacao.product.title}
                              className="w-24 h-24 rounded-xl object-cover border-2 border-white/30"
                            />
                            <span className={`text-xs font-semibold text-center truncate max-w-[160px] ${msg.isMine ? 'text-white/90' : 'text-gray-700'}`}>
                              {doacao.product.title}
                            </span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${msg.isMine ? 'bg-white/20 text-white/80' : 'bg-purple-100 text-purple-600'}`}>
                              {doacao.product.category}
                            </span>
                          </div>
                          {canAccept && !alreadyClosed && !alreadyAccepted ? (
                            <div className="px-3 pb-3">
                              <div className="w-full py-2 rounded-xl bg-green-500 text-white text-xs font-bold text-center shadow-sm">
                                ✓ {AT.chatDealConfirmBtn} — Aceitar doação
                              </div>
                            </div>
                          ) : (
                            <div className={`px-3 pb-2.5 text-[11px] text-center ${msg.isMine ? 'text-white/70' : 'text-gray-400'}`}>
                              {alreadyClosed ? AT.chatDealConfirmed : (alreadyAccepted ? AT.chatDonationAcceptedTitle : (msg.isMine ? AT.chatDonationRequested : AT.chatDonationAccept))}
                            </div>
                          )}
                        </div>
                      );
                    }

                    // ── Card de proposta de troca ──
                    const proposal = parseProposal(msg.text);
                    if (proposal) {
                      // normaliza: suporte a fromItem (antigo) e fromItems (novo)
                      const propItems = proposal.fromItems?.length ? proposal.fromItems : proposal.fromItem ? [proposal.fromItem] : [];
                      const totalFromTrok = propItems.reduce((s, p) => s + (p.trokValue ?? 0), 0);
                      const firstItem = propItems[0];

                      const canAcceptProposal = !msg.isMine && !!onFinalizar;
                      const idxP = messages.findIndex(m => m.id === msg.id);
                      const proposalAnswered = idxP >= 0 && messages.slice(idxP + 1).some(m =>
                        m.rich?.type === 'donationAccepted' || m.rich?.type === 'dealRejected' || m.rich?.type === 'deal'
                      );
                      const acceptProposal = async () => {
                        if (!canAcceptProposal || proposalAnswered || !firstItem) return;
                        await sendRichControl({
                          type: 'donationAccepted',
                          dealProduct: {
                            id: proposal.toProduct.id,
                            title: proposal.toProduct.title,
                            image: proposal.toProduct.image || '',
                            username: currentUser,
                            category: product.category,
                          },
                          dealFromProduct: {
                            id: firstItem.id,
                            title: propItems.length > 1 ? `${propItems.length} itens` : firstItem.title,
                            image: firstItem.image || '',
                            username: otherUser,
                            category: firstItem.category,
                          },
                        }, AT.chatDonationAcceptedTitle);
                      };
                      const rejectProposal = async () => {
                        if (!canAcceptProposal || proposalAnswered) return;
                        await sendRichControl({
                          type: 'dealRejected',
                          dealProduct: {
                            id: proposal.toProduct.id,
                            title: proposal.toProduct.title,
                            image: proposal.toProduct.image || '',
                            username: currentUser,
                          },
                        }, AT.chatDealRejectedTitle);
                      };
                      return (
                      <div
                        className={`rounded-2xl overflow-hidden shadow-sm border ${msg.status === 'error' ? 'opacity-60' : ''}`}
                        style={{
                          background: msg.isMine ? 'linear-gradient(135deg,#7c3aed,#f97316)' : '#fff',
                          borderColor: msg.isMine ? 'transparent' : '#e5e7eb',
                          minWidth: 220,
                        }}
                      >
                        {/* Header */}
                        <div className={`px-3 py-2 flex items-center justify-between gap-1.5 ${msg.isMine ? 'text-white/90' : 'text-purple-700'}`}
                          style={{ background: msg.isMine ? 'rgba(0,0,0,0.15)' : '#f5f0ff' }}>
                          <div className="flex items-center gap-1.5">
                            <ArrowRightLeft className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="text-xs font-bold">{AT.chatTradeProposalLabel}</span>
                          </div>
                          {propItems.length > 1 && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${msg.isMine ? 'bg-white/20 text-white' : 'bg-purple-100 text-purple-700'}`}>
                              {propItems.length} itens
                            </span>
                          )}
                        </div>

                        {/* Itens oferecidos */}
                        <div className="flex items-center gap-2 px-3 py-3">
                          <div className="flex flex-col items-center gap-1">
                            {/* thumbnails empilhadas */}
                            <div className="flex items-center" style={{ position: 'relative', height: 64, width: propItems.length > 1 ? Math.min(propItems.length, 3) * 48 + 4 : 64 }}>
                              {propItems.slice(0, 3).map((item, i) => (
                                <div
                                  key={item.id}
                                  className={`absolute ${!msg.isMine && onOpenProductById ? 'cursor-pointer group' : ''}`}
                                  style={{ left: i * 20, zIndex: propItems.length - i }}
                                  onClick={() => { if (!msg.isMine && onOpenProductById) onOpenProductById(item.id); }}
                                >
                                  <div className="relative">
                                    <img loading="lazy" decoding="async" src={item.image} alt="" className={`rounded-xl object-cover border-2 transition-transform ${msg.isMine ? 'border-white/30' : 'border-gray-200'} ${!msg.isMine && onOpenProductById ? 'group-hover:scale-105' : ''}`}
                                      style={{ width: 56, height: 64, objectFit: 'cover' }} />
                                    {!msg.isMine && onOpenProductById && i === 0 && (
                                      <div className="absolute inset-0 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'rgba(0,0,0,0.35)' }}>
                                        <span className="text-white text-[9px] font-bold text-center leading-tight px-1">{AT.chatViewListing}</span>
                                      </div>
                                    )}
                                    {i === 2 && propItems.length > 3 && (
                                      <div className="absolute inset-0 rounded-xl flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
                                        <span className="text-white text-xs font-bold">+{propItems.length - 2}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                            {/* título(s) */}
                            <span className={`text-[10px] font-medium truncate ${msg.isMine ? 'text-white/80' : 'text-gray-500'}`}
                              style={{ maxWidth: propItems.length > 1 ? 80 : 64 }}>
                              {propItems.length === 1 ? firstItem?.title : `${propItems.length} itens`}
                            </span>
                            {totalFromTrok > 0 && (
                              <span className={`text-[10px] font-bold ${msg.isMine ? 'text-yellow-200' : 'text-purple-600'}`}>
                                🪙 {totalFromTrok.toLocaleString('pt-BR')}T
                              </span>
                            )}
                          </div>

                          <ArrowRightLeft className={`w-5 h-5 flex-shrink-0 ${msg.isMine ? 'text-white/60' : 'text-gray-400'}`} />

                          <div className="flex flex-col items-center gap-1">
                            <img loading="lazy" decoding="async" src={proposal.toProduct.image} alt="" className="w-14 h-16 rounded-xl object-cover border-2 border-white/30" style={{ objectFit: 'cover' }} />
                            <span className={`text-[10px] font-medium truncate max-w-[64px] ${msg.isMine ? 'text-white/80' : 'text-gray-500'}`}>{proposal.toProduct.title}</span>
                            {(proposal.toProduct.trokValue ?? 0) > 0 && (
                              <span className={`text-[10px] font-bold ${msg.isMine ? 'text-yellow-200' : 'text-purple-600'}`}>
                                🪙 {proposal.toProduct.trokValue!.toLocaleString('pt-BR')}T
                              </span>
                            )}
                          </div>
                        </div>

                        <div className={`px-3 pb-2.5 text-[11px] ${msg.isMine ? 'text-white/70' : 'text-gray-400'}`}>
                          {msg.isMine
                            ? AT.chatProposalSent
                            : <span className="font-medium">{AT.chatProposalReceived}</span>}
                        </div>

                        {canAcceptProposal && !proposalAnswered && (
                          <div className="px-3 pb-3 flex gap-2">
                            <button onClick={acceptProposal} className="flex-1 py-1.5 rounded-lg bg-green-500 text-white text-xs font-bold active:scale-95 transition-transform shadow-sm hover:bg-green-600">
                              ✓ {AT.chatDealConfirmBtn}
                            </button>
                            <button onClick={rejectProposal} className="flex-1 py-1.5 rounded-lg bg-gray-200 text-gray-700 text-xs font-bold active:scale-95 transition-transform hover:bg-gray-300">
                              ✕ {AT.chatDealRejectBtn}
                            </button>
                          </div>
                        )}
                      </div>
                      );
                    }
                    const rich = msg.rich;
                    const isDeal = rich?.type === 'deal';
                    const isDealRequest = rich?.type === 'dealRequest';
                    const isDealRejected = rich?.type === 'dealRejected';
                    const isDonationAccepted = rich?.type === 'donationAccepted';
                    const isDonationClosedByMe = rich?.type === 'donationClosedByMe';
                    const hasMedia = rich?.type && rich?.url && !isDeal && !isDealRequest && !isDealRejected && !isDonationAccepted && !isDonationClosedByMe;
                    const replyQ = rich?.replyTo;

                    // ── Donation accepted card (com botão Fechar Negócio para ambos) ─────
                    if (isDonationAccepted) {
                      const dp = rich!.dealProduct;
                      // Cada lado fechou? olha mensagens posteriores
                      const idxA = messages.findIndex(m => m.id === msg.id);
                      const after = idxA >= 0 ? messages.slice(idxA + 1) : [];
                      const closedByMe = after.some(m => m.rich?.type === 'donationClosedByMe' && m.isMine);
                      const closedByOther = after.some(m => m.rich?.type === 'donationClosedByMe' && !m.isMine);
                      const bothClosed = closedByMe && closedByOther;
                      const isTrade = !!rich!.dealFromProduct;
                      const hintText = isTrade
                        ? AT.chatDealCloseHint(otherUser)
                        : (product.username === currentUser
                            ? AT.chatDonationCloseHintForDonor(otherUser)
                            : AT.chatDonationCloseHintForReceiver(otherUser));
                      const closeClick = async () => {
                        if (closedByMe || !onFinalizar) return;
                        await sendRichControl({
                          type: 'donationClosedByMe',
                          dealProduct: dp,
                          ...(rich!.dealFromProduct ? { dealFromProduct: rich!.dealFromProduct } : {}),
                        }, AT.chatDonationClosedByMe);
                        const fromItemId = rich!.dealFromProduct?.id;
                        onFinalizar(product, fromItemId, { skipDelete: !closedByOther });
                      };
                      return (
                        <div className="rounded-2xl overflow-hidden shadow-sm border-2 border-green-400" style={{ maxWidth: 280, background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)' }}>
                          <div className="flex items-center gap-2 px-3 py-2 bg-green-500">
                            <span className="text-white text-sm font-bold">{AT.chatDonationAcceptedTitle}</span>
                          </div>
                          {dp && (
                            <div className="flex items-center gap-3 px-3 py-2 cursor-pointer active:opacity-70" onClick={() => onOpenProductById?.(dp.id)}>
                              <img loading="lazy" decoding="async" src={dp.image} alt="" className="w-14 h-14 rounded-xl object-cover border-2 border-green-300" />
                              <div className="flex flex-col min-w-0">
                                <span className="text-sm font-bold text-gray-800 truncate">{dp.title}</span>
                                <span className="text-xs text-gray-500">@{dp.username}</span>
                              </div>
                            </div>
                          )}
                          <div className="px-3 pb-3 flex flex-col gap-2">
                            <div className="text-[11px] text-green-700 font-medium">{hintText}</div>
                            {bothClosed ? (
                              <div className="text-[11px] text-green-800 font-bold text-center py-1">{AT.chatDonationBothClosed}</div>
                            ) : closedByMe ? (
                              <div className="text-[11px] text-gray-500 italic text-center py-1">{AT.chatDonationWaitingOther(otherUser)}</div>
                            ) : (
                              <button
                                onClick={closeClick}
                                className="w-full py-2 rounded-xl bg-gradient-to-r from-green-500 to-purple-600 text-white text-xs font-bold active:scale-95 transition-transform shadow-sm"
                              >
                                ✅ {AT.chatDealClose}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    }

                    // ── Donation closed-by-me card (simples) ──────────────
                    if (isDonationClosedByMe) {
                      return (
                        <div className="rounded-xl px-3 py-2 shadow-sm border border-green-300" style={{ maxWidth: 240, background: '#f0fdf4' }}>
                          <span className="text-[11px] text-green-700 font-semibold">
                            {msg.isMine ? AT.chatDonationClosedByMe : `@${otherUser}: ${AT.chatDonationClosedByMe}`}
                          </span>
                        </div>
                      );
                    }

                    // ── Deal request card (handshake pendente) ─────────────
                    if (isDealRequest) {
                      const dp = rich!.dealProduct;
                      const fp = rich!.dealFromProduct;
                      // Já houve resposta posterior (confirmado/recusado)? então este request virou histórico
                      const idx = messages.findIndex(m => m.id === msg.id);
                      const answered = idx >= 0 && messages.slice(idx + 1).some(m => m.rich?.type === 'deal' || m.rich?.type === 'dealRejected' || m.rich?.type === 'donationAccepted');
                      return (
                        <div className="rounded-2xl overflow-hidden shadow-sm border-2 border-purple-400" style={{ maxWidth: 280, background: 'linear-gradient(135deg,#faf5ff,#ede9fe)' }}>
                          <div className="flex items-center gap-2 px-3 py-2 bg-purple-500">
                            <span className="text-white text-sm font-bold">{AT.chatDealRequestTitle}</span>
                          </div>
                          {fp && dp && (
                            <div className="flex items-center gap-2 px-3 py-2">
                              <div className="flex flex-col items-center gap-1">
                                <img loading="lazy" decoding="async" src={fp.image} alt="" className="w-14 h-14 rounded-xl object-cover border-2 border-purple-300" />
                                <span className="text-[10px] text-gray-600 font-medium truncate max-w-[60px]">{fp.title}</span>
                              </div>
                              <span className="text-purple-600 text-xl font-black">⇄</span>
                              <div className="flex flex-col items-center gap-1 cursor-pointer active:opacity-70" onClick={() => onOpenProductById?.(dp.id)}>
                                <img loading="lazy" decoding="async" src={dp.image} alt="" className="w-14 h-14 rounded-xl object-cover border-2 border-purple-400" />
                                <span className="text-[10px] text-purple-700 font-medium truncate max-w-[60px]">{dp.title}</span>
                              </div>
                            </div>
                          )}
                          {!fp && dp && (
                            <div className="flex items-center gap-3 px-3 py-2 cursor-pointer active:opacity-70" onClick={() => onOpenProductById?.(dp.id)}>
                              <img loading="lazy" decoding="async" src={dp.image} alt="" className="w-14 h-14 rounded-xl object-cover border-2 border-purple-300" />
                              <div className="flex flex-col min-w-0">
                                <span className="text-sm font-bold text-gray-800 truncate">{dp.title}</span>
                                <span className="text-xs text-gray-500">@{dp.username}</span>
                              </div>
                            </div>
                          )}
                          {answered ? null : msg.isMine ? (
                            <div className="px-3 pb-2.5 text-[11px] text-purple-700 font-medium">
                              {AT.chatDealRequestPending}
                            </div>
                          ) : (
                            <div className="px-3 pb-3 flex flex-col gap-2">
                              <div className="text-[11px] text-purple-700 font-medium">
                                {AT.chatDealRequestPrompt(otherUser)}
                              </div>
                              <div className="flex gap-2">
                                <button
                                  className="flex-1 py-1.5 rounded-lg bg-green-500 text-white text-xs font-bold active:scale-95 transition-transform shadow-sm hover:bg-green-600"
                                  onClick={async () => {
                                    // Confirmação da troca → manda donationAccepted (handshake unificado).
                                    // Cada lado depois clica "Fechar negócio" para avaliar; só deleta quando ambos fecharem.
                                    await sendRichControl({
                                      type: 'donationAccepted',
                                      dealProduct: rich!.dealProduct,
                                      ...(rich!.dealFromProduct ? { dealFromProduct: rich!.dealFromProduct } : {}),
                                    }, AT.chatDonationAcceptedTitle);
                                  }}
                                >
                                  ✓ {AT.chatDealConfirmBtn}
                                </button>
                                <button
                                  className="flex-1 py-1.5 rounded-lg bg-gray-200 text-gray-700 text-xs font-bold active:scale-95 transition-transform hover:bg-gray-300"
                                  onClick={async () => {
                                    await sendRichControl({
                                      type: 'dealRejected',
                                      dealProduct: rich!.dealProduct,
                                      ...(rich!.dealFromProduct ? { dealFromProduct: rich!.dealFromProduct } : {}),
                                    }, AT.chatDealRejectedTitle);
                                  }}
                                >
                                  ✕ {AT.chatDealRejectBtn}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    }

                    // ── Deal rejected card ─────────────────────────────────
                    if (isDealRejected) {
                      return (
                        <div className="rounded-2xl overflow-hidden shadow-sm border-2 border-gray-300" style={{ maxWidth: 260, background: 'linear-gradient(135deg,#f9fafb,#f3f4f6)' }}>
                          <div className="flex items-center gap-2 px-3 py-2 bg-gray-500">
                            <span className="text-white text-sm font-bold">{AT.chatDealRejectedTitle}</span>
                          </div>
                        </div>
                      );
                    }

                    // ── Deal card ──────────────────────────────────────────
                    if (isDeal) {
                      const dp = rich!.dealProduct;
                      const fp = rich!.dealFromProduct;
                      return (
                        <div className="rounded-2xl overflow-hidden shadow-sm border-2 border-green-400" style={{ maxWidth: 280, background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)' }}>
                          <div className="flex items-center gap-2 px-3 py-2 bg-green-500">
                            <span className="text-white text-sm font-bold">{AT.chatDealConfirmed}</span>
                          </div>
                          {fp && dp && (
                            <div className="flex items-center gap-2 px-3 py-2">
                              <div className="flex flex-col items-center gap-1">
                                <img loading="lazy" decoding="async" src={fp.image} alt="" className="w-14 h-14 rounded-xl object-cover border-2 border-green-300" />
                                <span className="text-[10px] text-gray-600 font-medium truncate max-w-[60px]">{fp.title}</span>
                              </div>
                              <span className="text-green-600 text-xl font-black">⇄</span>
                              <div className="flex flex-col items-center gap-1 cursor-pointer active:opacity-70" onClick={() => onOpenProductById?.(dp.id)}>
                                <img loading="lazy" decoding="async" src={dp.image} alt="" className="w-14 h-14 rounded-xl object-cover border-2 border-purple-400" />
                                <span className="text-[10px] text-purple-700 font-medium truncate max-w-[60px]">{dp.title}</span>
                              </div>
                            </div>
                          )}
                          {!fp && dp && (
                            <div className="flex items-center gap-3 px-3 py-2 cursor-pointer active:opacity-70" onClick={() => onOpenProductById?.(dp.id)}>
                              <img loading="lazy" decoding="async" src={dp.image} alt="" className="w-14 h-14 rounded-xl object-cover border-2 border-green-300" />
                              <div className="flex flex-col min-w-0">
                                <span className="text-sm font-bold text-gray-800 truncate">{dp.title}</span>
                                <span className="text-xs text-gray-500">@{dp.username}</span>
                              </div>
                            </div>
                          )}
                          <div className="px-3 pb-2 text-[11px] text-green-700 font-medium">
                            {AT.chatDealTapHint}
                          </div>
                        </div>
                      );
                    }
                    // Áudios usam bolha TOTALMENTE redonda (rounded-3xl, sem
                    // o canto pontudo rounded-br-sm/bl-sm que dá efeito de balão
                    // de fala) — fica como cápsula limpa em volta do player pill.
                    const isAudio = hasMedia && rich!.type === 'audio';
                    const isImage = hasMedia && rich!.type === 'image';
                    // Imagem: bolha SEM padding (sem moldura colorida do tema
                    // ao redor da foto). Audio/video continuam com p-1.5; texto
                    // sem mídia mantém o padding interno padrão.
                    const bubblePad = isImage ? 'p-0' : (hasMedia ? 'p-1.5' : 'px-3.5 py-2');
                    return (
                      <div className={`relative rounded-2xl shadow-sm overflow-hidden ${
                        isAudio
                          ? (msg.isMine ? 'bubble-mine rounded-3xl' : 'bubble-other border border-gray-100 rounded-3xl')
                          : (msg.isMine ? 'bubble-mine rounded-br-sm' : 'bubble-other border border-gray-100 rounded-bl-sm')
                      } ${msg.status === 'error' ? 'opacity-60' : ''} ${bubblePad}`}
                        style={hasMedia ? { maxWidth: 280 } : undefined}>
                        {replyQ && (
                          <div
                            className={`mb-1 px-2.5 py-1.5 rounded-lg border-l-4 cursor-pointer active:opacity-70 transition-opacity ${
                              msg.isMine
                                ? 'bg-white/15 border-white/60 text-white/90'
                                : 'bg-purple-50 border-purple-400 text-gray-600'
                            }`}
                            data-reply="true"
                            style={{ fontSize: 11 }}
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); scrollToMessage(replyQ.id); }}
                          >
                            <p className={`font-bold ${msg.isMine ? 'text-white' : 'text-purple-700'}`} style={{ fontSize: 11 }}>
                              @{replyQ.sender === currentUser ? AT.chatYouReply : replyQ.sender}
                            </p>
                            <p className="truncate" style={{ maxWidth: 240 }}>{replyQ.text || AT.chatMediaLabel}</p>
                          </div>
                        )}
                        {hasMedia && rich!.type === 'image' && (
                          <img loading="lazy" decoding="async" src={rich!.url} alt="imagem" className="block max-w-full max-h-[320px] w-auto h-auto object-contain cursor-pointer active:opacity-80" onClick={(e) => { e.stopPropagation(); if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); setLightboxSrc(rich!.url!); }} />
                        )}
                        {hasMedia && rich!.type === 'video' && (
                          <div
                            className="relative rounded-xl overflow-hidden cursor-pointer bg-black"
                            style={{ minWidth: 200, minHeight: 120 }}
                            onClick={(e) => { e.stopPropagation(); if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); setLightboxVideo(rich!.url!); }}
                          >
                            <video src={rich!.url} preload="none" playsInline muted className="block max-w-full max-h-[200px] w-full object-cover" />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                              <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                                <span className="text-purple-700 text-xl ml-1">▶</span>
                              </div>
                            </div>
                          </div>
                        )}
                        {hasMedia && rich!.type === 'audio' && (
                          <div className="space-y-1.5">
                            <AudioPlayer
                              src={rich!.url!}
                              isMine={msg.isMine}
                              palette={palette}
                              msgId={msg.id}
                              registerAudio={registerAudioEl}
                              onAdvance={advanceAudio}
                              speedIdx={chatAudioSpeedIdx}
                              onChangeSpeed={setChatAudioSpeedIdx}
                              knownDuration={rich!.duration}
                            />
                            {/* Texto traduzido enviado pelo backend Groq (escolha do remetente) */}
                            {rich!.translatedText && rich!.targetLang && (
                              <div
                                className="rounded-xl px-3 py-2 text-[12px] leading-snug"
                                style={{
                                  background: msg.isMine ? 'rgba(255,255,255,0.14)' : 'rgba(30,113,74,0.08)',
                                  color: msg.isMine ? '#fff' : '#1e2e25',
                                  borderLeft: msg.isMine ? '3px solid rgba(255,255,255,0.45)' : '3px solid #1e714a',
                                }}
                              >
                                <div className="flex items-center gap-1.5 mb-1 opacity-80">
                                  <span className="text-[10px] uppercase font-bold tracking-widest">
                                    🌍 {SUPPORTED_LANGS.find(l => l.code === rich!.targetLang)?.flag} Tradução
                                  </span>
                                </div>
                                <p>{rich!.translatedText}</p>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const ttsId = `tts-tr-${msg.id}`;
                                    if (speakingTtsId === ttsId) { stopSpeaking(); }
                                    else { speakInLanguage(rich!.translatedText!, rich!.targetLang!, ttsId); }
                                  }}
                                  className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full"
                                  style={{
                                    background: msg.isMine ? 'rgba(255,255,255,0.22)' : '#1e714a',
                                    color: '#fff',
                                  }}
                                >
                                  {speakingTtsId === `tts-tr-${msg.id}` ? '⏹ Parar' : '🔊 Ouvir'}
                                </button>
                              </div>
                            )}
                            {/* Tradução pelo receptor: ícone Globe + seletor flutuante */}
                            {!rich!.translatedText && !msg.isMine && (() => {
                              const rxTr = rxTranslations.get(msg.id);
                              const isTranslating = translatingIds.has(msg.id);

                              return (
                                <>
                                  {rxTr ? (
                                    /* Resultado já disponível — mostra texto + botão ouvir + trocar */
                                    <div
                                      className="rounded-xl px-3 py-2 text-[12px] leading-snug"
                                      style={{ background: 'rgba(30,113,74,0.08)', color: '#1e2e25', borderLeft: '3px solid #1e714a' }}
                                    >
                                      <div className="flex items-center gap-1.5 mb-1 opacity-80">
                                        <span className="text-[10px] uppercase font-bold tracking-widest">
                                          {SUPPORTED_LANGS.find(l => l.code === rxTr.lang)?.flag} Tradução
                                        </span>
                                      </div>
                                      <p>{rxTr.text}</p>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const ttsId = `tts-rx-${msg.id}`;
                                          if (speakingTtsId === ttsId) { stopSpeaking(); }
                                          else { speakInLanguage(rxTr.text, rxTr.lang, ttsId); }
                                        }}
                                        className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full"
                                        style={{ background: '#1e714a', color: '#fff' }}
                                      >
                                        {speakingTtsId === `tts-rx-${msg.id}` ? '⏹ Parar' : '🔊 Ouvir'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          setRxTranslations(prev => { const n = new Map(prev); n.delete(msg.id); return n; });
                                          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                          setRxLangPicker({ msgId: msg.id, x: r.left, y: r.top });
                                        }}
                                        className="mt-1.5 ml-2 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full"
                                        style={{ background: 'rgba(30,113,74,0.15)', color: '#1e714a' }}
                                      >
                                        <Globe className="w-3 h-3" /> Outro idioma
                                      </button>
                                    </div>
                                  ) : (
                                    /* Ícone Globe — mesmo da topbar — abre seletor */
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                        setRxLangPicker(rxLangPicker?.msgId === msg.id ? null : { msgId: msg.id, x: r.left, y: r.top });
                                      }}
                                      disabled={isTranslating}
                                      className="inline-flex items-center justify-center w-8 h-8 rounded-full transition-colors disabled:opacity-60"
                                      style={{ background: 'rgba(30,113,74,0.10)', color: '#1e714a' }}
                                      title="Traduzir áudio"
                                    >
                                      {isTranslating ? (
                                        <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                      ) : (
                                        <Globe className="w-4 h-4" />
                                      )}
                                    </button>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        )}
                        {(msg.text && !msg.text.startsWith('[CMSG]')) && (
                          <AutoText as="p" text={msg.text} className={`text-sm leading-relaxed break-words whitespace-pre-wrap ${hasMedia ? 'px-2 pt-1.5 pb-0.5' : ''}`} />
                        )}
                      </div>
                    );
                  })()}
                  {/* Hora + status + responder */}
                  <div className={`flex items-center gap-1.5 mt-0.5 px-1 ${msg.isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                    <span className="text-[10px] text-gray-400">{timeStr(msg.timestamp, lang)}</span>
                    {msg.edited && <span className="text-[10px] text-gray-400 italic">{AT.chatEdited}</span>}
                    {msg.isMine && <StatusIcon status={msg.status} />}
                    {msg.status === 'error' && (
                      <span className="text-[10px] text-red-400 font-medium">{AT.chatSendError}</span>
                    )}
                    {!msg.deleted && <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const previewText = msg.text || (msg.rich?.type ? `[${msg.rich.type}]` : '');
                        setReplyTo({ id: msg.id, text: previewText, sender: msg.sender });
                        if (!('ontouchstart' in window)) setTimeout(() => inputRef.current?.focus(), 50);
                      }}
                      className="text-gray-400 hover:text-purple-600 transition-colors flex items-center gap-0.5"
                      title={AT.chatReply}
                    >
                      <Reply className="w-3 h-3" />
                      <span className="text-[10px] font-medium">{AT.chatReply}</span>
                    </button>}
                  </div>
                </div>
                {/* Avatar do usuário atual — direita */}
                {msg.isMine && (
                  <div style={{ opacity: showSender ? 1 : 0, flexShrink: 0 }}>
                    <UserAvatar username={currentUser} photoUrl={myAvatarUrl} size={24} />
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Indicador de digitação */}
        {otherTyping && (
          <div className="flex justify-start mt-2">
            <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-2.5 shadow-sm flex items-center gap-1.5">
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Overlay de refresh — logo girando + blur igual à transição de tela */}
      {refreshing && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center"
          style={{ backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', backgroundColor: 'rgba(245,240,255,0.2)' }}>
          <style>{`
            @keyframes chat-swap-left {
              0%   { transform: translateX(0) scaleX(1); opacity: 1; }
              40%  { transform: translateX(60px) scaleX(1); opacity: 0.4; }
              50%  { transform: translateX(60px) scaleX(-1); opacity: 0.4; }
              100% { transform: translateX(0) scaleX(-1); opacity: 1; }
            }
            @keyframes chat-swap-right {
              0%   { transform: translateX(0) scaleX(-1); opacity: 1; }
              40%  { transform: translateX(-60px) scaleX(-1); opacity: 0.4; }
              50%  { transform: translateX(-60px) scaleX(1); opacity: 0.4; }
              100% { transform: translateX(0) scaleX(1); opacity: 1; }
            }
            .cswap-anim2 { animation: chat-swap-left 0.9s ease-in-out infinite; }
          `}</style>
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center justify-center">
              <img src="/logo-students.png" alt="" className="cswap-anim2 w-16 h-16 object-contain" />
            </div>
            <span className="text-xs text-purple-500 font-semibold">Atualizando…</span>
          </div>
        </div>
      )}


      {/* Edit banner */}
      {editingId && (
        <div className="border-t border-gray-100 bg-yellow-50 px-3 py-2 flex items-center gap-2 flex-shrink-0">
          <span className="text-yellow-600 text-base flex-shrink-0">✎</span>
          <div className="flex-1 min-w-0 border-l-4 border-yellow-400 pl-2">
            <p className="text-[11px] font-bold text-yellow-700">Editando mensagem</p>
            <p className="text-xs text-gray-600 truncate">Pressione Enter para salvar, Esc para cancelar</p>
          </div>
          <button
            type="button"
            onClick={cancelEdit}
            className="w-7 h-7 rounded-full hover:bg-yellow-100 flex items-center justify-center text-gray-500 flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Reply preview */}
      {replyTo && !editingId && (
        <div className="border-t border-gray-100 bg-purple-50 px-3 py-2 flex items-center gap-2 flex-shrink-0">
          <Reply className="w-4 h-4 text-purple-500 flex-shrink-0" />
          <div className="flex-1 min-w-0 border-l-4 border-purple-400 pl-2">
            <p className="text-[11px] font-bold text-purple-700">
              Respondendo a @{replyTo.sender === currentUser ? 'você' : replyTo.sender}
            </p>
            <p className="text-xs text-gray-600 truncate">{replyTo.text || '[mídia]'}</p>
          </div>
          <button
            type="button"
            onClick={() => setReplyTo(null)}
            className="w-7 h-7 rounded-full hover:bg-purple-100 flex items-center justify-center text-gray-500 flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Status de upload */}
      {uploading && (
        <div className="bg-purple-50 border-t border-purple-100 px-4 py-1.5 flex items-center justify-center gap-2 flex-shrink-0">
          <span className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
          <p className="text-[11px] text-purple-700 font-medium">{AT.chatSendingMedia}</p>
        </div>
      )}

      {/* Gravando áudio */}
      {recording && (
        <div className="bg-red-50 border-t border-red-100 px-4 py-2 flex items-center justify-between gap-2 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
            <p className="text-xs text-red-700 font-bold">
              {AT.chatRecording(`${Math.floor(recordSeconds / 60)}:${String(recordSeconds % 60).padStart(2, '0')}`)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => stopRecording(true)}
              className="text-xs text-white font-bold px-4 py-1.5 rounded-full active:scale-95 transition-transform"
              style={{ background: '#ef4444', boxShadow: '0 1px 3px rgba(239,68,68,0.25)' }}
            >
              {AT.chatCancelRecording}
            </button>
            <button
              type="button"
              onClick={() => stopRecording(false)}
              className="text-xs text-white font-bold px-4 py-1.5 rounded-full active:scale-95 transition-transform"
              style={{ background: '#22c55e', boxShadow: '0 1px 3px rgba(34,197,94,0.25)' }}
            >
              {AT.chatSendRecording}
            </button>
          </div>
        </div>
      )}

      {/* Inputs de arquivo escondidos.
          - fileMediaRef: input ÚNICO que aceita imagem OU vídeo. iOS abre
            o picker nativo padrão (Tirar Foto / Fototeca / Escolher arquivo)
            — mesmo UX do composer do feed. Tipo é detectado do MIME.
          - fileAudRef: mantido pra uploads de áudio (gravação tem botão Mic). */}
      <input ref={fileMediaRef} type="file" accept="image/*,video/*" className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            const kind: MediaKind = f.type.startsWith('video/') ? 'video' : 'image';
            handleFilePicked(f, kind);
          }
          e.target.value = '';
        }} />
      <input ref={fileImgRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFilePicked(f, 'image'); e.target.value = ''; }} />
      <input ref={fileVidRef} type="file" accept="video/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFilePicked(f, 'video'); e.target.value = ''; }} />
      <input ref={fileAudRef} type="file" accept="audio/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFilePicked(f, 'audio'); e.target.value = ''; }} />

      {/* Popover de anexo REMOVIDO — o paperclip agora chama o picker
          nativo de mídia direto via fileMediaRef. Para upload de áudio
          arquivo (raro), o input fileAudRef segue disponível mas sem UI
          (gravação tem o botão Mic). */}

      {/* Aviso de conteúdo bloqueado */}
      {contentBlocked && (
        <div style={{
          position: 'absolute', bottom: 80, left: 12, right: 12, zIndex: 50,
          background: 'linear-gradient(135deg,#7c3aed,#dc2626)',
          borderRadius: 14, padding: '10px 16px',
          display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 4px 20px rgba(220,38,38,0.35)',
          animation: 'slideUpFade .25s ease',
        }}>
          <span style={{ fontSize: 20 }}>🚫</span>
          <span style={{ color: '#fff', fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>
            Conteúdo não permitido por regras da plataforma
          </span>
        </div>
      )}

      {/* Input — mobile usa layout compacto colado na borda (curvas do iPhone);
          desktop mantém layout espaçoso original. */}
      <form
        onSubmit={handleSend}
        className={`flex items-end bg-white flex-shrink-0 relative ${isMobile ? 'gap-1' : 'gap-2'}`}
        style={isMobile ? {
          // Mobile: padding ESTÁVEL (sem env(safe-area-inset-bottom)) para
          // a barra não "saltar" quando o teclado abre/fecha. O container
          // do ChatPanel já é ajustado via visualViewport.height pelo
          // apply(), então o home indicator fica naturalmente fora.
          paddingLeft: 'max(12px, env(safe-area-inset-left))',
          paddingRight: 'calc(max(12px, env(safe-area-inset-right)) + 8px)',
          paddingTop: 8,
          paddingBottom: 18,
          // ROOT FIX caret iOS: força o form a um compositing layer próprio.
          // Sem isso, iOS Safari renderiza o caret na posição PRÉ-ajuste
          // do visualViewport (logo, abaixo da barra visível). translateZ(0)
          // faz o iOS recomputar a posição do caret quando o containing
          // block muda.
          transform: 'translateZ(0)',
          WebkitTransform: 'translateZ(0)',
        } : {
          paddingLeft: 'max(16px, env(safe-area-inset-left))',
          paddingRight: 'calc(max(16px, env(safe-area-inset-right)) + 12px)',
          paddingTop: 4,
          paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
        }}
      >
        <button
          ref={emojiBtnRef}
          type="button"
          onClick={() => {
            try { inputRef.current?.blur(); } catch {}
            setEmojiOpen(v => !v);
            setAttachOpen(false);
            setEmojiQuery('');
          }}
          disabled={recording || !!editingId}
          className={`rounded-full bg-gray-100 hover:bg-yellow-100 transition-all flex items-center justify-center flex-shrink-0 active:scale-95 disabled:opacity-40 ${isMobile ? 'w-9 h-9 text-lg' : 'w-10 h-10 text-xl'}`}
          title="Emojis"
        >
          😊
        </button>
        <button
          type="button"
          onClick={() => {
            // Abre DIRETO o picker nativo de mídia (foto+vídeo) — mesma UX
            // do feed. iOS mostra: Tirar Foto / Fototeca / Escolher Arquivo.
            // Antes abria um popover Imagem/Vídeo/Áudio que ficava verde
            // no tema Cassidy (pink-* overrideado pelo empresa-theme) e
            // confundia o usuário.
            setEmojiOpen(false);
            setAttachOpen(false);
            const el = fileMediaRef.current;
            if (!el) return;
            el.value = '';
            el.click();
          }}
          disabled={recording || uploading || !!editingId}
          className={`rounded-full bg-gray-100 hover:bg-purple-100 transition-all flex items-center justify-center flex-shrink-0 active:scale-95 disabled:opacity-40 ${isMobile ? 'w-9 h-9' : 'w-10 h-10'}`}
          title={AT.chatAttach}
        >
          <Paperclip className="w-4 h-4 text-purple-600" />
        </button>
        <textarea
          ref={inputRef}
          rows={1}
          value={editingId ? editingText : input}
          onChange={editingId
            ? (e) => {
                setEditingText(e.target.value);
                const el = e.target;
                el.style.height = 'auto';
                el.style.height = Math.min(el.scrollHeight, 144) + 'px';
              }
            : handleInputChange}
          onFocus={() => {
            // ROOT FIX caret iOS: chama a função de ajuste de visualViewport
            // SÍNCRONA E REPETIDAMENTE durante a animação do teclado (~300ms).
            // O iOS Safari nem sempre dispara visualViewport.resize a tempo,
            // e o caret pode ser renderizado antes do container reposicionar.
            // Múltiplas chamadas garantem que pelo menos uma pegue o momento
            // certo do keyboard-open.
            const fn = applyViewportRef.current;
            if (fn) {
              fn();
              [60, 150, 300, 500].forEach(t => setTimeout(() => {
                fn();
                try { inputRef.current?.scrollIntoView({ block: 'end', behavior: 'instant' as ScrollBehavior }); } catch {}
              }, t));
            }
          }}
          placeholder={editingId ? AT.chatEditPlaceholder : (recording ? AT.chatRecordingPlaceholder : AT.chatPlaceholder)}
          autoComplete="off"
          disabled={recording}
          onKeyDown={(e) => {
            if (editingId && e.key === 'Escape') { cancelEdit(); return; }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
            }
          }}
          className={`chat-input flex-1 text-[16px] outline-none transition-all disabled:opacity-50 resize-none leading-snug ${isMobile ? 'px-3 py-1.5' : 'px-4 py-2.5'}`}
          style={{ minHeight: isMobile ? 36 : 40, maxHeight: isMobile ? 140 : 144, overflowY: 'auto' }}
        />
        {editingId ? (
          <button
            type="submit"
            className={`bg-yellow-500 text-white rounded-full hover:bg-yellow-600 transition-all flex items-center justify-center shadow-md active:scale-95 flex-shrink-0 ${isMobile ? 'w-9 h-9' : 'w-11 h-11'}`}
            title={AT.chatSaveEdit}
          >
            <svg width={isMobile ? 14 : 16} height={isMobile ? 14 : 16} viewBox="0 0 16 16" fill="none">
              <path d="M2.5 8.5L6 12L13.5 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        ) : input.trim() ? (
          <button
            type="submit"
            className={`bg-purple-600 text-white rounded-full hover:bg-purple-700 transition-all flex items-center justify-center shadow-md active:scale-95 flex-shrink-0 ${isMobile ? 'w-9 h-9' : 'w-11 h-11'}`}
          >
            <Send className={isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
          </button>
        ) : (
          <button
            type="button"
            onClick={recording ? () => stopRecording(false) : startRecording}
            disabled={uploading}
            className={`rounded-full transition-all flex items-center justify-center shadow-md active:scale-95 flex-shrink-0 ${isMobile ? 'w-9 h-9' : 'w-11 h-11'} ${
              recording ? 'bg-red-500 text-white animate-pulse' : 'bg-purple-600 text-white hover:bg-purple-700'
            } disabled:opacity-40`}
            title={recording ? AT.chatStopRecording : AT.chatStartRecording}
          >
            {recording
              ? <Square className={isMobile ? 'w-3.5 h-3.5 fill-current' : 'w-4 h-4 fill-current'} />
              : <Mic className={isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
            }
          </button>
        )}
      </form>

      {/* Emoji picker — abre ABAIXO do input (no espaco do teclado), estilo WhatsApp.
          Em flow do flex-col, encolhe a area de mensagens em vez de cobri-la. */}
      {emojiOpen && (() => {
        const q = emojiQuery.trim().toLowerCase();
        const itemsToShow = q
          ? EMOJI_CATEGORIES.flatMap(c => c.items).filter(([_, kw]) => kw.toLowerCase().includes(q))
          : (EMOJI_CATEGORIES.find(c => c.id === emojiCat)?.items ?? []);
        return (
          <div
            ref={emojiPickerRef}
            className="bg-white border-t border-gray-200 flex flex-col flex-shrink-0"
            style={{ height: 'min(55vh, 380px)', paddingBottom: 'env(safe-area-inset-bottom)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="p-2 border-b border-gray-100 flex-shrink-0">
              <input
                type="text"
                value={emojiQuery}
                onChange={(e) => setEmojiQuery(e.target.value)}
                placeholder="Buscar emoji…"
                className="w-full px-3 py-1.5 bg-gray-100 rounded-full text-sm outline-none focus:ring-2 focus:ring-purple-300"
              />
            </div>
            <div className="flex-1 overflow-y-auto px-1.5 py-1">
              {itemsToShow.length === 0 ? (
                <p className="text-center text-xs text-gray-400 py-8">Nenhum emoji encontrado.</p>
              ) : (
                <div className="grid grid-cols-9 sm:grid-cols-9 gap-0.5">
                  {itemsToShow.map(([ch], i) => (
                    <button
                      key={`${ch}-${i}`}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { setInput(v => v + ch); }}
                      className="text-[26px] leading-none hover:bg-gray-100 rounded-md p-0.5 active:scale-90 transition-transform"
                      title={ch}
                    >
                      {ch}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!q && (
              <div className="border-t border-gray-100 flex items-center justify-around px-1 py-1.5 flex-shrink-0">
                {EMOJI_CATEGORIES.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setEmojiCat(c.id)}
                    title={c.label}
                    className={`text-lg leading-none p-1.5 rounded-lg transition-colors ${
                      emojiCat === c.id ? 'bg-purple-100' : 'hover:bg-gray-100'
                    }`}
                  >
                    {c.icon}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })()}
    </div>
    {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    {lightboxVideo && <VideoLightbox src={lightboxVideo} onClose={() => setLightboxVideo(null)} />}
    {/* Seletor de idioma do receptor — renderizado FORA do scroll container
        para não ser cortado por overflow:hidden. position: fixed posiciona
        relativo ao viewport usando coords salvas no clique do ícone Globe. */}
    {rxLangPicker && (() => {
      const picker = rxLangPicker;
      const PICKER_H = 320;
      const PICKER_W = 200;
      // Tenta abrir ACIMA do ícone; se não couber, abre abaixo
      const openAbove = picker.y > PICKER_H + 8;
      const top = openAbove ? Math.max(8, picker.y - PICKER_H - 4) : picker.y + 32;
      const left = Math.min(window.innerWidth - PICKER_W - 8, Math.max(8, picker.x));
      return (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setRxLangPicker(null)} />
          <div
            className="fixed z-[9999] bg-white rounded-2xl shadow-2xl border border-stone-200 p-2"
            style={{ top, left, width: PICKER_W, maxHeight: PICKER_H, overflowY: 'auto' }}
          >
            {SUPPORTED_LANGS.map(l => (
              <button
                key={l.code}
                type="button"
                onClick={async () => {
                  const msgId = picker.msgId;
                  const url = messages.find(m => m.id === msgId)?.rich?.url;
                  setRxLangPicker(null);
                  if (!url) return;
                  setTranslatingIds(prev => new Set(prev).add(msgId));
                  try {
                    const r = await translateAudioServer(url, l.code);
                    if (!('error' in r) && r.translated) {
                      setRxTranslations(prev => new Map(prev).set(msgId, { text: r.translated, lang: l.code }));
                      speakInLanguage(r.translated, l.code);
                    } else {
                      alert('Não foi possível traduzir. Tente novamente.');
                    }
                  } finally {
                    setTranslatingIds(prev => { const n = new Set(prev); n.delete(msgId); return n; });
                  }
                }}
                className="w-full text-left px-3 py-2 rounded-xl text-sm hover:bg-green-50 text-stone-700 flex items-center gap-2"
              >
                <span>{l.flag}</span>
                <span>{l.label}</span>
              </button>
            ))}
          </div>
        </>
      );
    })()}
    {actionMenu && (() => {
      const target = messages.find(m => m.id === actionMenu.id);
      if (!target) return null;
      return (
        <div
          className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center bg-black/40"
          onClick={() => setActionMenu(null)}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:w-72 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Preview da mensagem */}
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">Sua mensagem</p>
              <p className="text-xs text-gray-600 truncate">
                {target.text || (target.rich?.type ? `[${target.rich.type}]` : '[mídia]')}
              </p>
            </div>

            {!actionMenu.confirmDelete ? (
              <>
                {actionMenu.canEdit && (
                  <button
                    type="button"
                    onClick={() => startEdit(target)}
                    className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-purple-50 active:bg-purple-100 transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M9.5 1.5L12.5 4.5L4.5 12.5H1.5V9.5L9.5 1.5Z" stroke="#7c3aed" strokeWidth="1.4" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <span className="text-sm font-medium text-gray-700">Editar mensagem</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActionMenu(prev => prev ? { ...prev, confirmDelete: true } : null)}
                  className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-red-50 active:bg-red-100 transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M2 3.5H12M5 3.5V2.5C5 2 5.5 1.5 6 1.5H8C8.5 1.5 9 2 9 2.5V3.5M5.5 6V10.5M8.5 6V10.5M3 3.5L3.5 11.5C3.5 12 4 12.5 4.5 12.5H9.5C10 12.5 10.5 12 10.5 11.5L11 3.5" stroke="#ef4444" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <span className="text-sm font-medium text-red-600">Apagar mensagem</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActionMenu(null)}
                  className="w-full px-4 py-3 text-sm text-gray-400 hover:bg-gray-50 transition-colors border-t border-gray-100"
                >
                  Cancelar
                </button>
              </>
            ) : (
              /* Confirmação de apagar */
              <div className="px-4 py-4">
                <p className="text-sm font-semibold text-gray-800 mb-1">Apagar esta mensagem?</p>
                <p className="text-xs text-gray-500 mb-4">A mensagem será removida para você e para @{target.sender === currentUser ? otherUser : target.sender}.</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setActionMenu(prev => prev ? { ...prev, confirmDelete: false } : null)}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteMessage(target.id)}
                    className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 active:scale-95 transition-all"
                  >
                    Apagar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    })()}
    </>
  );
}
