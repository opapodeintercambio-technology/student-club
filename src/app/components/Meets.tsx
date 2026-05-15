import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Plus, Calendar, Clock, MapPin, Video, Users, Link as LinkIcon,
  Check, Trash2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useLang } from '../i18n';
import { notifyUser } from '../utils/notify';
import { getFriends } from './friends';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';

// ─── Tipos ─────────────────────────────────────────────────────────────
type MeetCategory = 'estudos' | 'networking' | 'rolê' | 'cultural' | 'outros';
type MeetKind = 'online' | 'presencial';

interface Meet {
  id: string;
  host: string;
  hostFotoPerfil?: string;
  title: string;
  description: string;
  kind: MeetKind;
  category: MeetCategory;
  /** ISO datetime — quando começa */
  startsAt: string;
  /** duração em minutos */
  duration: number;
  link?: string;       // Meet/Zoom/Teams etc — quando online
  place?: string;      // endereço/pub/café — quando presencial
  city?: string;
  participants: string[];
  maxParticipants?: number;
  createdAt: string;
}

const CATEGORIES: { key: MeetCategory; label: string; emoji: string; color: string }[] = [
  { key: 'estudos',    label: 'Estudos',     emoji: '📚', color: '#5a7a52' },
  { key: 'networking', label: 'Networking',  emoji: '🤝', color: '#b8896a' },
  { key: 'rolê',       label: 'Rolê',        emoji: '🍻', color: '#f97316' },
  { key: 'cultural',   label: 'Cultural',    emoji: '🎭', color: '#7c3aed' },
  { key: 'outros',     label: 'Outros',      emoji: '✨', color: '#0ea5e9' },
];

// ─── Storage (Supabase + cache local) ──────────────────────────────────
const MEETS_KEY = 'papo_meets_v1';

function rowToMeet(r: any): Meet {
  return {
    id: r.id,
    host: r.host,
    hostFotoPerfil: r.host_foto_perfil ?? undefined,
    title: r.title,
    description: r.description || '',
    kind: r.kind,
    category: r.category,
    startsAt: r.starts_at,
    duration: r.duration ?? 60,
    link: r.link ?? undefined,
    place: r.place ?? undefined,
    city: r.city ?? undefined,
    participants: Array.isArray(r.participants) ? r.participants : [],
    maxParticipants: r.max_participants ?? undefined,
    createdAt: r.created_at,
  };
}

function meetToRow(m: Meet) {
  return {
    id: m.id,
    host: m.host,
    host_foto_perfil: m.hostFotoPerfil ?? null,
    title: m.title,
    description: m.description || null,
    kind: m.kind,
    category: m.category,
    starts_at: m.startsAt,
    duration: m.duration,
    link: m.link ?? null,
    place: m.place ?? null,
    city: m.city ?? null,
    participants: m.participants,
    max_participants: m.maxParticipants ?? null,
    created_at: m.createdAt,
  };
}

function loadMeetsCache(): Meet[] {
  try {
    const raw = localStorage.getItem(MEETS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function saveMeetsCache(list: Meet[]) {
  try { localStorage.setItem(MEETS_KEY, JSON.stringify(list)); } catch {}
  window.dispatchEvent(new CustomEvent('papo-meets-updated'));
}

async function fetchMeets(): Promise<Meet[]> {
  const { data, error } = await supabase
    .from('meets_demo')
    .select('*')
    .order('starts_at', { ascending: true })
    .limit(200);
  if (error || !data) return loadMeetsCache();
  const meets = data.map(rowToMeet);
  saveMeetsCache(meets);
  return meets;
}

async function insertMeetRemote(m: Meet): Promise<void> {
  await supabase.from('meets_demo').insert(meetToRow(m));
}

async function updateMeetRemote(id: string, patch: Partial<{ participants: string[] }>): Promise<void> {
  await supabase.from('meets_demo').update(patch).eq('id', id);
}

async function deleteMeetRemote(id: string): Promise<void> {
  await supabase.from('meets_demo').delete().eq('id', id);
}

// ─── Helpers ───────────────────────────────────────────────────────────
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function relativeWhen(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) {
    const past = Math.abs(ms);
    if (past < 3600_000) return `há ${Math.floor(past / 60000)}min`;
    if (past < 86400_000) return `há ${Math.floor(past / 3600_000)}h`;
    return `há ${Math.floor(past / 86400_000)}d`;
  }
  if (ms < 3600_000) return `em ${Math.floor(ms / 60000)}min`;
  if (ms < 86400_000) return `em ${Math.floor(ms / 3600_000)}h`;
  if (ms < 7 * 86400_000) return `em ${Math.floor(ms / 86400_000)}d`;
  return fmtDate(iso);
}

// ─── Componente principal ──────────────────────────────────────────────
interface Props {
  currentUser: string;
  fotoPerfil?: string;
  onClose: () => void;
}

type Tab = 'proximas' | 'minhas' | 'passadas';

export function Meets({ currentUser, fotoPerfil, onClose }: Props) {
  useLockBodyScroll(true);
  const { AT } = useLang();
  const [meets, setMeets] = useState<Meet[]>(() => loadMeetsCache());
  const [tab, setTab] = useState<Tab>('proximas');
  const [showCreate, setShowCreate] = useState(false);
  const [filterCat, setFilterCat] = useState<MeetCategory | 'all'>('all');

  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      const fresh = await fetchMeets();
      if (!cancelled) setMeets(fresh);
    };
    sync();
    const id = window.setInterval(sync, 30_000);
    window.addEventListener('papo-meets-updated', sync);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener('papo-meets-updated', sync);
    };
  }, []);

  const now = Date.now();
  const filtered = useMemo(() => {
    let list = meets.slice();
    if (tab === 'proximas') {
      list = list.filter(m => new Date(m.startsAt).getTime() > now - 60_000);
    } else if (tab === 'passadas') {
      list = list.filter(m => new Date(m.startsAt).getTime() <= now - 60_000);
    } else {
      // minhas — hosts e participações
      list = list.filter(m => m.host === currentUser || m.participants.includes(currentUser));
    }
    if (filterCat !== 'all') {
      list = list.filter(m => m.category === filterCat);
    }
    list.sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
    if (tab === 'passadas') list.reverse();
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meets, tab, filterCat, currentUser]);

  function toggleJoin(meetId: string) {
    let nextParts: string[] | null = null;
    const next = meets.map(m => {
      if (m.id !== meetId) return m;
      const has = m.participants.includes(currentUser);
      if (has) {
        nextParts = m.participants.filter(u => u !== currentUser);
      } else {
        if (m.maxParticipants && m.participants.length >= m.maxParticipants) return m;
        nextParts = [...m.participants, currentUser];
      }
      return { ...m, participants: nextParts };
    });
    setMeets(next);
    saveMeetsCache(next);
    if (nextParts) updateMeetRemote(meetId, { participants: nextParts }).catch(() => {});
  }

  function deleteMeet(meetId: string) {
    if (!confirm('Cancelar este meet?')) return;
    const next = meets.filter(m => m.id !== meetId);
    setMeets(next);
    saveMeetsCache(next);
    deleteMeetRemote(meetId).catch(() => {});
  }

  function createMeet(payload: Omit<Meet, 'id' | 'host' | 'hostFotoPerfil' | 'participants' | 'createdAt'>) {
    const meet: Meet = {
      id: `meet_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      host: currentUser,
      hostFotoPerfil: fotoPerfil,
      participants: [currentUser],
      createdAt: new Date().toISOString(),
      ...payload,
    };
    const next = [meet, ...meets];
    setMeets(next);
    saveMeetsCache(next);
    insertMeetRemote(meet).catch(() => {});
    setShowCreate(false);
    // Avisa os amigos do host — push em todos os dispositivos
    try {
      const friends = getFriends(currentUser);
      if (friends.length > 0) {
        const when = new Date(meet.startsAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        notifyUser(
          friends,
          currentUser,
          'meet',
          '📅 Novo Meet',
          `@${currentUser} criou: ${meet.title} — ${when}`,
          { refId: meet.id },
        );
      }
    } catch {}
  }

  return createPortal(
    <div className="fixed inset-0 z-[9500] flex flex-col" style={{ background: '#0a0a0b', color: '#fafaf7' }}>
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-3 py-2.5 flex-shrink-0"
        style={{ background: '#0a0a0b', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
          aria-label="Fechar"
        >
          <X className="w-4 h-4" style={{ color: '#fafaf7' }} />
        </button>
        <h1
          className="text-base font-bold tracking-wide"
          style={{ fontFamily: '"DM Sans", system-ui, sans-serif', letterSpacing: '0.18em' }}
        >
          {AT.meetsTitle}
        </h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1 px-3 h-9 rounded-full text-xs font-bold text-white"
          style={{
            background: 'linear-gradient(135deg, #5a7a52 0%, #b8896a 100%)',
            fontFamily: '"DM Sans", system-ui, sans-serif',
            letterSpacing: '0.14em',
          }}
        >
          <Plus className="w-3.5 h-3.5" /> {AT.meetsSchedule}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 px-3 py-2 flex-shrink-0" style={{ background: '#101012', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {([
          { k: 'proximas', label: AT.meetsTabUpcoming },
          { k: 'minhas',   label: AT.meetsTabMine },
          { k: 'passadas', label: AT.meetsTabPast },
        ] as { k: Tab; label: string }[]).map(t => {
          const on = tab === t.k;
          return (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className="px-4 py-1.5 rounded-full text-xs font-bold transition-all"
              style={{
                background: on ? 'linear-gradient(135deg, #5a7a52 0%, #b8896a 100%)' : 'rgba(255,255,255,0.06)',
                color: on ? '#fff' : 'rgba(255,255,255,0.65)',
                border: `1px solid ${on ? 'transparent' : 'rgba(255,255,255,0.10)'}`,
                fontFamily: '"DM Sans", system-ui, sans-serif',
                letterSpacing: '0.14em',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Filtro de categoria */}
      <div className="flex gap-1.5 px-3 py-2 overflow-x-auto flex-shrink-0" style={{ background: '#101012', borderBottom: '1px solid rgba(255,255,255,0.06)', scrollbarWidth: 'none' }}>
        <button
          onClick={() => setFilterCat('all')}
          className="flex items-center gap-1 px-3 py-1 rounded-full text-[11px] flex-shrink-0"
          style={{
            background: filterCat === 'all' ? 'rgba(255,255,255,0.14)' : 'transparent',
            color: filterCat === 'all' ? '#fafaf7' : 'rgba(255,255,255,0.55)',
            border: '1px solid rgba(255,255,255,0.10)',
          }}
        >
          {AT.meetsCatAll}
        </button>
        {CATEGORIES.map(c => {
          const on = filterCat === c.key;
          return (
            <button
              key={c.key}
              onClick={() => setFilterCat(c.key)}
              className="flex items-center gap-1 px-3 py-1 rounded-full text-[11px] flex-shrink-0"
              style={{
                background: on ? `${c.color}30` : 'transparent',
                color: on ? c.color : 'rgba(255,255,255,0.55)',
                border: `1px solid ${on ? c.color + '70' : 'rgba(255,255,255,0.10)'}`,
              }}
            >
              <span>{c.emoji}</span> {c.label}
            </button>
          );
        })}
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto px-3 py-3" style={{ background: '#0a0a0b' }}>
        {filtered.length === 0 ? (
          <div className="text-center py-14 px-6" style={{ color: 'rgba(255,255,255,0.45)' }}>
            <Calendar className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">
              {tab === 'proximas' && AT.meetsEmptyUpcoming}
              {tab === 'minhas' && AT.meetsEmptyMine}
              {tab === 'passadas' && AT.meetsEmptyPast}
            </p>
            <p className="text-xs mt-1">
              {tab === 'proximas' && AT.meetsEmptyHint}
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-w-2xl mx-auto">
            {filtered.map(m => (
              <MeetCard
                key={m.id}
                meet={m}
                currentUser={currentUser}
                onToggleJoin={() => toggleJoin(m.id)}
                onDelete={() => deleteMeet(m.id)}
              />
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <MeetForm
          onCancel={() => setShowCreate(false)}
          onSubmit={createMeet}
        />
      )}
    </div>,
    document.body,
  );
}

// ─── MeetCard ──────────────────────────────────────────────────────────
interface CardProps {
  meet: Meet;
  currentUser: string;
  onToggleJoin: () => void;
  onDelete: () => void;
}

function MeetCard({ meet, currentUser, onToggleJoin, onDelete }: CardProps) {
  const cat = CATEGORIES.find(c => c.key === meet.category) || CATEGORIES[CATEGORIES.length - 1];
  const isHost = meet.host === currentUser;
  const joined = meet.participants.includes(currentUser);
  const full = meet.maxParticipants && meet.participants.length >= meet.maxParticipants;
  const past = new Date(meet.startsAt).getTime() < Date.now() - 60_000;

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: '#15151a',
        border: `1px solid ${past ? 'rgba(255,255,255,0.05)' : cat.color + '40'}`,
        opacity: past ? 0.7 : 1,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
          style={{ background: cat.color + '20', border: `1px solid ${cat.color}50` }}
        >
          {cat.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full"
              style={{ background: cat.color + '30', color: cat.color, letterSpacing: '0.14em' }}
            >
              {cat.label}
            </span>
            <span
              className="text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)', letterSpacing: '0.12em' }}
            >
              {meet.kind === 'online' ? <Video className="w-3 h-3" /> : <MapPin className="w-3 h-3" />}
              {meet.kind === 'online' ? 'Online' : 'Presencial'}
            </span>
            <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
              · {relativeWhen(meet.startsAt)}
            </span>
          </div>
          <h3
            className="text-base font-bold mt-1.5 leading-snug"
            style={{ color: '#fafaf7', fontFamily: '"DM Sans", system-ui, sans-serif' }}
          >
            {meet.title}
          </h3>
          {meet.description && (
            <p className="text-xs mt-1 leading-relaxed" style={{ color: 'rgba(255,255,255,0.75)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {meet.description}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 mt-3 text-[11px]" style={{ color: 'rgba(255,255,255,0.6)' }}>
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> {fmtDate(meet.startsAt)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> {fmtTime(meet.startsAt)} · {meet.duration}min
            </span>
            <span className="inline-flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              {meet.participants.length}{meet.maxParticipants ? `/${meet.maxParticipants}` : ''}
            </span>
            {meet.kind === 'online' && meet.link && (
              <a
                href={meet.link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="inline-flex items-center gap-1"
                style={{ color: '#b8896a' }}
              >
                <LinkIcon className="w-3.5 h-3.5" /> entrar
              </a>
            )}
            {meet.kind === 'presencial' && meet.place && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {meet.place}{meet.city ? `, ${meet.city}` : ''}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
              por <span className="font-semibold" style={{ color: '#b8896a' }}>@{meet.host}</span>
            </span>
            <div className="flex-1" />
            {!past && !isHost && (
              <button
                onClick={onToggleJoin}
                disabled={!!(full && !joined)}
                className="px-4 py-1.5 rounded-full text-xs font-bold transition-all active:scale-95 disabled:opacity-50"
                style={{
                  background: joined ? 'rgba(34,197,94,0.18)' : `linear-gradient(135deg, ${cat.color} 0%, #b8896a 100%)`,
                  color: joined ? '#22c55e' : '#fff',
                  border: joined ? '1px solid #22c55e60' : 'none',
                  fontFamily: '"DM Sans", system-ui, sans-serif',
                  letterSpacing: '0.14em',
                }}
              >
                {joined ? <span className="inline-flex items-center gap-1"><Check className="w-3 h-3" /> Vou!</span>
                        : full ? 'Lotado' : 'Quero ir'}
              </button>
            )}
            {isHost && !past && (
              <button
                onClick={onDelete}
                className="px-3 py-1.5 rounded-full text-xs font-bold inline-flex items-center gap-1"
                style={{ background: 'rgba(248,113,113,0.12)', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)' }}
              >
                <Trash2 className="w-3 h-3" /> Cancelar
              </button>
            )}
            {past && joined && (
              <span className="text-[11px] italic" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Você participou
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MeetForm ──────────────────────────────────────────────────────────
interface FormProps {
  onCancel: () => void;
  onSubmit: (payload: Omit<Meet, 'id' | 'host' | 'hostFotoPerfil' | 'participants' | 'createdAt'>) => void;
}

function MeetForm({ onCancel, onSubmit }: FormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<MeetCategory>('estudos');
  const [kind, setKind] = useState<MeetKind>('online');
  const [date, setDate] = useState(() => {
    const t = new Date();
    t.setMinutes(0); t.setSeconds(0);
    t.setHours(t.getHours() + 2);
    return t.toISOString().slice(0, 10);
  });
  const [time, setTime] = useState(() => {
    const t = new Date();
    t.setMinutes(0);
    t.setHours(t.getHours() + 2);
    return `${String(t.getHours()).padStart(2, '0')}:00`;
  });
  const [duration, setDuration] = useState(60);
  const [link, setLink] = useState('');
  const [place, setPlace] = useState('');
  const [city, setCity] = useState('');
  const [maxP, setMaxP] = useState('');
  const [err, setErr] = useState('');

  function submit() {
    setErr('');
    if (!title.trim()) { setErr('Dê um título pro meet.'); return; }
    const startsAt = new Date(`${date}T${time}:00`).toISOString();
    if (Number.isNaN(new Date(startsAt).getTime())) { setErr('Data/hora inválida.'); return; }
    if (kind === 'online' && !link.trim()) { setErr('Cole o link do meet online.'); return; }
    if (kind === 'presencial' && !place.trim()) { setErr('Diga onde será o encontro.'); return; }
    const max = maxP ? Number(maxP) : undefined;
    onSubmit({
      title: title.trim(),
      description: description.trim(),
      category,
      kind,
      startsAt,
      duration: Number(duration) || 60,
      link: kind === 'online' ? link.trim() : undefined,
      place: kind === 'presencial' ? place.trim() : undefined,
      city: kind === 'presencial' ? city.trim() || undefined : undefined,
      maxParticipants: max && max > 0 ? max : undefined,
    });
  }

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-lg max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-3xl overflow-hidden"
        style={{ background: '#101012', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <h2 className="text-base font-bold" style={{ color: '#fafaf7', fontFamily: '"DM Sans", system-ui, sans-serif', letterSpacing: '0.14em' }}>
            Agendar Meet
          </h2>
          <button onClick={onCancel} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.08)', color: '#fafaf7' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
          <Field label="Título *">
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Ex: Estudar pra prova de IELTS"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={inputStyle}
            />
          </Field>

          <Field label="Descrição (opcional)">
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Detalhes, o que levar, agenda…"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
              style={inputStyle}
            />
          </Field>

          <Field label="Categoria">
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map(c => {
                const on = category === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setCategory(c.key)}
                    className="px-3 py-1.5 rounded-full text-[11px] font-bold inline-flex items-center gap-1"
                    style={{
                      background: on ? c.color + '30' : 'rgba(255,255,255,0.04)',
                      color: on ? c.color : 'rgba(255,255,255,0.65)',
                      border: `1px solid ${on ? c.color + '70' : 'rgba(255,255,255,0.08)'}`,
                    }}
                  >
                    <span>{c.emoji}</span> {c.label}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Modalidade">
            <div className="grid grid-cols-2 gap-2">
              {(['online', 'presencial'] as MeetKind[]).map(k => {
                const on = kind === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className="py-2 rounded-lg text-sm font-bold inline-flex items-center justify-center gap-1.5"
                    style={{
                      background: on ? 'linear-gradient(135deg, #5a7a52 0%, #b8896a 100%)' : 'rgba(255,255,255,0.04)',
                      color: on ? '#fff' : 'rgba(255,255,255,0.65)',
                      border: `1px solid ${on ? 'transparent' : 'rgba(255,255,255,0.08)'}`,
                      fontFamily: '"DM Sans", system-ui, sans-serif',
                      letterSpacing: '0.10em',
                    }}
                  >
                    {k === 'online' ? <Video className="w-4 h-4" /> : <MapPin className="w-4 h-4" />}
                    {k === 'online' ? 'Online' : 'Presencial'}
                  </button>
                );
              })}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Data *">
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
            </Field>
            <Field label="Hora *">
              <input type="time" value={time} onChange={e => setTime(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Duração (min)">
              <input type="number" min={15} max={480} step={15} value={duration} onChange={e => setDuration(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
            </Field>
            <Field label="Limite de pessoas (opcional)">
              <input type="number" min={2} max={500} value={maxP} onChange={e => setMaxP(e.target.value)} placeholder="ex: 10" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
            </Field>
          </div>

          {kind === 'online' ? (
            <Field label="Link do Meet/Zoom/Teams *">
              <input value={link} onChange={e => setLink(e.target.value)} placeholder="https://meet.google.com/…" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
            </Field>
          ) : (
            <>
              <Field label="Local *">
                <input value={place} onChange={e => setPlace(e.target.value)} placeholder="Ex: Café Bewley's, Grafton Street" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
              </Field>
              <Field label="Cidade">
                <input value={city} onChange={e => setCity(e.target.value)} placeholder="Ex: Dublin" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
              </Field>
            </>
          )}

          {err && <p className="text-xs font-semibold" style={{ color: '#f87171' }}>⚠️ {err}</p>}
        </div>

        <div className="p-3 flex items-center gap-2" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-full text-sm font-bold"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.65)', border: '1px solid rgba(255,255,255,0.10)' }}
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            className="flex-1 py-2.5 rounded-full text-sm font-bold text-white"
            style={{
              background: 'linear-gradient(135deg, #5a7a52 0%, #b8896a 100%)',
              fontFamily: '"DM Sans", system-ui, sans-serif',
              letterSpacing: '0.14em',
            }}
          >
            Agendar
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  color: '#fafaf7',
  border: '1px solid rgba(255,255,255,0.10)',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'rgba(255,255,255,0.5)', letterSpacing: '0.16em' }}>
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
