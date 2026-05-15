import { useState, useRef, useEffect } from 'react';
import { Plane, Home as HomeIcon, ShieldPlus, FileText, Briefcase, GraduationCap, Map, Upload, FileText as FileIcon, Film, Trash2, Eye, Lock, ExternalLink } from 'lucide-react';
import { isAdminEmail } from '../utils/admin';
import { getInfoContent, type InfoSubKey, type InfoCard } from '../utils/infoContent';
import { findCountry, getDestino } from './countries';

const SUBTABS = [
  { key: 'aeroporto',     label: 'Aeroporto',         Icon: Plane },
  { key: 'acomodacoes',   label: 'Acomodações',       Icon: HomeIcon },
  { key: 'seguro',        label: 'Seguro Saúde',      Icon: ShieldPlus },
  { key: 'curriculo',     label: 'Currículo',         Icon: FileText },
  { key: 'empregos',      label: 'Empregos',          Icon: Briefcase },
  { key: 'cursos',        label: 'Cursos Gratuitos',  Icon: GraduationCap },
  { key: 'roteiro',       label: 'Roteiro',           Icon: Map },
] as const;

type SubKey = typeof SUBTABS[number]['key'];

interface Resource {
  id: string;
  kind: 'pdf' | 'video';
  name: string;
  url: string;         // dataURL or blob URL (for now, local)
  size: number;
  uploadedAt: string;
  blobKey?: string;    // IndexedDB key when kind === 'pdf'
}

const DB_NAME = 'papo-info';
const STORE = 'blobs';
const LS_KEY = (sub: SubKey) => `papo_info_${sub}`;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function putBlob(key: string, blob: Blob) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
async function getBlob(key: string): Promise<Blob | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).get(key);
    r.onsuccess = () => { db.close(); resolve((r.result as Blob) ?? null); };
    r.onerror = () => { db.close(); reject(r.error); };
  });
}
async function delBlob(key: string) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

function loadList(sub: SubKey): Resource[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY(sub)) || '[]'); } catch { return []; }
}
function saveList(sub: SubKey, list: Resource[]) {
  localStorage.setItem(LS_KEY(sub), JSON.stringify(list));
}

export function InfoTab({ userEmail, currentUser }: { userEmail?: string; currentUser?: string }) {
  const isAdmin = isAdminEmail(userEmail);
  const [sub, setSub] = useState<SubKey>('aeroporto');
  const [items, setItems] = useState<Resource[]>(() => loadList('aeroporto'));
  // Lê o país de destino do user (PK localStorage). Default Irlanda quando vazio.
  const [destino, setDestino] = useState<string>(() => (currentUser ? getDestino(currentUser) : 'IE'));
  useEffect(() => {
    if (!currentUser) return;
    const sync = () => setDestino(getDestino(currentUser));
    sync();
    window.addEventListener('papo-trip-updated', sync);
    return () => window.removeEventListener('papo-trip-updated', sync);
  }, [currentUser]);
  const destCountry = findCountry(destino);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<{ res: Resource; url: string } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const pickSub = (k: SubKey) => {
    setSub(k);
    setItems(loadList(k));
  };

  async function handleFile(file: File) {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isVideo = file.type.startsWith('video/');
    if (!isPdf && !isVideo) { alert('Envie um PDF ou vídeo.'); return; }
    if (file.size > 200 * 1024 * 1024) { alert('Arquivo muito grande (máx 200MB).'); return; }
    setUploading(true);
    try {
      const blobKey = `${sub}__${Date.now()}__${file.name}`;
      await putBlob(blobKey, file);
      const res: Resource = {
        id: blobKey,
        kind: isPdf ? 'pdf' : 'video',
        name: file.name,
        url: '',
        size: file.size,
        uploadedAt: new Date().toISOString(),
        blobKey,
      };
      const next = [res, ...items];
      setItems(next);
      saveList(sub, next);
    } catch (e: any) {
      alert('Erro ao enviar: ' + (e?.message || e));
    } finally {
      setUploading(false);
    }
  }

  async function openPreview(r: Resource) {
    if (!r.blobKey) return;
    const blob = await getBlob(r.blobKey);
    if (!blob) { alert('Arquivo não encontrado no dispositivo.'); return; }
    const url = URL.createObjectURL(blob);
    setPreview({ res: r, url });
  }

  function closePreview() {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  }

  async function remove(r: Resource) {
    if (!confirm(`Remover "${r.name}"?`)) return;
    if (r.blobKey) { try { await delBlob(r.blobKey); } catch {} }
    const next = items.filter(x => x.id !== r.id);
    setItems(next);
    saveList(sub, next);
  }

  const current = SUBTABS.find(s => s.key === sub)!;

  return (
    <div className="max-w-[1100px] mx-auto px-3 sm:px-4 py-4">
      <h1
        className="text-2xl font-bold text-stone-800 mb-1"
        style={{ fontFamily: '"Source Serif 4", Georgia, serif', letterSpacing: '0.04em' }}
      >
        Informações
      </h1>
      <p className="text-sm text-stone-500 mb-4">
        Materiais e vídeos sobre intercâmbio. Escolha um tema abaixo.
      </p>

      {/* Sub-tabs (scroll horizontal no mobile) */}
      <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0 mb-4">
        <div className="flex gap-2 min-w-max">
          {SUBTABS.map(({ key, label, Icon }) => {
            const active = sub === key;
            return (
              <button
                key={key}
                onClick={() => pickSub(key)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-full transition-all text-xs sm:text-sm whitespace-nowrap"
                style={{
                  background: active ? '#5a7a52' : '#ffffff',
                  color: active ? '#ffffff' : '#57534e',
                  border: `1px solid ${active ? '#5a7a52' : '#d6d3d1'}`,
                  fontFamily: '"Source Serif 4", Georgia, serif',
                  letterSpacing: '0.1em',
                  fontWeight: 600,
                }}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Cabeçalho do sub-tema + upload */}
      <div
        className="rounded-lg p-4 mb-4 flex items-center gap-3"
        style={{ background: '#ffffff', border: '1px solid #d6d3d1' }}
      >
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: '#f7faf5', border: '1px solid #5a7a52' }}
        >
          <current.Icon className="w-5 h-5 text-[#5a7a52]" />
        </div>
        <div className="flex-1 min-w-0">
          <h2
            className="text-base font-bold text-stone-800"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif', letterSpacing: '0.04em' }}
          >
            {current.label}
          </h2>
          <p className="text-xs text-stone-500">{items.length} {items.length === 1 ? 'material' : 'materiais'}</p>
        </div>
        {isAdmin ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf,video/*"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="px-3 py-2 rounded text-xs font-bold flex items-center gap-1 disabled:opacity-50"
              style={{
                background: '#5a7a52',
                color: '#ffffff',
                fontFamily: '"Source Serif 4", Georgia, serif',
                letterSpacing: '0.12em',
              }}
            >
              {uploading ? '...' : (<><Upload className="w-3.5 h-3.5" /> Adicionar</>)}
            </button>
          </>
        ) : (
          <span
            className="text-[10px] uppercase tracking-wider flex items-center gap-1"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif', color: '#a8a29e', letterSpacing: '0.16em' }}
            title="Apenas o administrador pode adicionar materiais"
          >
            <Lock className="w-3 h-3" /> Somente admin
          </span>
        )}
      </div>

      {/* Cards informativos curados por sub-aba — adapta ao país de destino do aluno */}
      <InfoCards subKey={sub} country={destino} countryName={destCountry?.name} />

      {/* Lista de materiais */}
      {items.length === 0 ? (
        <div
          className="rounded-lg py-12 text-center text-stone-500"
          style={{ background: '#fafaf9', border: '1px dashed #d6d3d1' }}
        >
          <FileIcon className="w-8 h-8 mx-auto mb-2 text-stone-400" />
          <p className="text-sm">Nenhum material aqui ainda.</p>
          <p className="text-xs mt-1">
            {isAdmin
              ? <>Use o botão <strong>Adicionar</strong> para enviar PDFs ou vídeos.</>
              : 'O administrador ainda não publicou materiais nesta seção.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(r => (
            <div
              key={r.id}
              className="rounded-lg p-3 flex items-center gap-3"
              style={{ background: '#ffffff', border: '1px solid #d6d3d1' }}
            >
              <div
                className="w-9 h-9 rounded flex items-center justify-center flex-shrink-0"
                style={{
                  background: r.kind === 'pdf' ? '#fff7ed' : '#eff6ff',
                  border: `1px solid ${r.kind === 'pdf' ? '#fdba74' : '#93c5fd'}`,
                }}
              >
                {r.kind === 'pdf' ? <FileIcon className="w-4 h-4 text-orange-500" /> : <Film className="w-4 h-4 text-blue-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-stone-800 truncate" style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>
                  {r.name}
                </p>
                <p className="text-xs text-stone-500">
                  {(r.size / 1024 / 1024).toFixed(2)} MB · {new Date(r.uploadedAt).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <button
                onClick={() => openPreview(r)}
                className="w-8 h-8 rounded flex items-center justify-center hover:bg-stone-100"
                title="Abrir"
              >
                <Eye className="w-4 h-4 text-stone-600" />
              </button>
              {isAdmin && (
                <button
                  onClick={() => remove(r)}
                  className="w-8 h-8 rounded flex items-center justify-center hover:bg-red-50"
                  title="Remover"
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Preview modal */}
      {preview && (
        <div
          className="fixed inset-0 z-[9999] bg-black/85 flex items-center justify-center p-4"
          onClick={closePreview}
        >
          <div
            className="bg-white rounded-lg max-w-4xl w-full max-h-[92vh] overflow-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-3 border-b">
              <span className="text-sm font-semibold truncate">{preview.res.name}</span>
              <button onClick={closePreview} className="text-stone-500 hover:text-stone-800 px-2">✕</button>
            </div>
            <div className="p-3">
              {preview.res.kind === 'pdf' ? (
                <iframe src={preview.url} className="w-full h-[78vh]" title={preview.res.name} />
              ) : (
                <video src={preview.url} controls className="w-full max-h-[78vh] mx-auto bg-black" />
              )}
            </div>
          </div>
        </div>
      )}

      <p className="text-[11px] text-stone-400 text-center mt-4">
        {isAdmin
          ? 'Os materiais ficam salvos neste dispositivo. Em breve poderemos compartilhar entre alunos.'
          : 'Apenas o administrador da Papo de Alunos pode adicionar ou remover materiais.'}
      </p>
    </div>
  );
}

// ─── Cards informativos por sub-aba ─────────────────────────────────────
function InfoCards({ subKey, country, countryName }: { subKey: SubKey; country?: string; countryName?: string }) {
  const content = getInfoContent(subKey as InfoSubKey, country);
  if (!content) return null;
  return (
    <div className="mb-5 space-y-3">
      <div
        className="rounded-lg p-4"
        style={{
          background: 'linear-gradient(135deg, #f7faf5 0%, #fdf6ee 100%)',
          border: '1px solid #d6d3d1',
        }}
      >
        {countryName && (
          <p
            className="text-[10px] uppercase font-bold mb-2"
            style={{
              fontFamily: '"Source Serif 4", Georgia, serif',
              letterSpacing: '0.18em',
              color: '#b8896a',
            }}
          >
            🌍 Conteúdo personalizado para: {countryName}
          </p>
        )}
        <p className="text-sm text-stone-700 leading-relaxed" style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>
          {content.intro}
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {content.cards.map((card, i) => (
          <Card key={i} card={card} />
        ))}
      </div>
    </div>
  );
}

function Card({ card }: { card: InfoCard }) {
  const accentBg =
    card.highlight === 'tip'  ? '#f0fdf4' :
    card.highlight === 'warn' ? '#fef2f2' :
    card.highlight === 'info' ? '#eff6ff' :
                                '#ffffff';
  const accentBorder =
    card.highlight === 'tip'  ? '#86efac' :
    card.highlight === 'warn' ? '#fca5a5' :
    card.highlight === 'info' ? '#93c5fd' :
                                '#d6d3d1';
  return (
    <div
      className="rounded-lg p-4"
      style={{ background: accentBg, border: `1px solid ${accentBorder}` }}
    >
      <div className="flex items-start gap-2 mb-2">
        {card.emoji && <span className="text-xl leading-none flex-shrink-0">{card.emoji}</span>}
        <h3
          className="text-sm font-bold text-stone-800 leading-tight flex-1"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif', letterSpacing: '0.04em' }}
        >
          {card.title}
        </h3>
      </div>
      {card.body && (
        <p className="text-xs text-stone-700 leading-relaxed mb-2"
           style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {card.body}
        </p>
      )}
      {card.bullets && card.bullets.length > 0 && (
        <ul className="text-xs text-stone-700 leading-relaxed space-y-1 list-disc list-inside mb-2">
          {card.bullets.map((b, i) => <li key={i}>{b}</li>)}
        </ul>
      )}
      {card.links && card.links.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {card.links.map((l, i) => (
            <a
              key={i}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold transition-all hover:opacity-90"
              style={{
                background: '#5a7a52',
                color: '#ffffff',
                fontFamily: '"Source Serif 4", Georgia, serif',
                letterSpacing: '0.10em',
              }}
            >
              <ExternalLink className="w-3 h-3" />
              {l.label}
              {l.badge && (
                <span
                  className="px-1.5 py-0.5 rounded-full text-[9px]"
                  style={{ background: 'rgba(255,255,255,0.22)', color: '#fff' }}
                >
                  {l.badge}
                </span>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
