import { useState, useRef, useEffect } from 'react';
import { X, ImagePlus, Coins, Loader2, MapPin, CheckCircle, Video, ShieldCheck, ShieldAlert } from 'lucide-react';
import type { Product } from './ProductCard';
import { supabase } from '../../lib/supabase';
import { useLang } from '../i18n';
import { apiBase } from '../utils/apiUrl';
import { buildPlaceholderDataUrl } from '../utils/placeholderImage';

interface CreateProductProps {
  onClose: () => void;
  onSubmit: (product: Omit<Product, 'id' | 'username'>) => void;
  /** Chamado quando o anúncio é rejeitado por IA e o usuário é bloqueado */
  onBlocked?: (reason: string) => void;
  currentUser: string;
  tipo?: 'troca' | 'doacao' | 'pedido_doacao' | 'amostra' | 'promocao' | 'pedido_amostra';
}

const MAX_PHOTOS = 5;
const MAX_VIDEO_MB = 50;

function compressImage(file: File): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 900;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
        else { width = Math.round(width * MAX / height); height = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.72));
    };
    img.src = url;
  });
}

function b64toBlob(b64: string, mime = 'image/jpeg'): Blob {
  const byteStr = atob(b64.split(',')[1]);
  const ab = new ArrayBuffer(byteStr.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteStr.length; i++) ia[i] = byteStr.charCodeAt(i);
  return new Blob([ab], { type: mime });
}

async function uploadToStorage(b64: string, username: string, index: number): Promise<string> {
  const blob = b64toBlob(b64);
  const path = `${username}/${Date.now()}_${index}.jpg`;
  const { data, error } = await supabase.storage.from('fotos').upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (error || !data) throw error;
  const { data: pub } = supabase.storage.from('fotos').getPublicUrl(data.path);
  return pub.publicUrl;
}

// Duração mínima de análise: 15 segundos
const MIN_ANALYSIS_MS = 15_000;

// Steps da análise para mostrar progresso visual
const ANALYSIS_STEPS = [
  { at: 0,   key: 'moderationStep1' as const },
  { at: 25,  key: 'moderationStep2' as const },
  { at: 55,  key: 'moderationStep3' as const },
  { at: 80,  key: 'moderationStep4' as const },
];

type ModerationPhase = 'idle' | 'analyzing' | 'approved' | 'rejected';

export function CreateProduct({ onClose, onSubmit, onBlocked, currentUser, tipo = 'troca' }: CreateProductProps) {
  const { AT } = useLang();
  const isPedidoDoacao = tipo === 'pedido_doacao';
  const isPedidoAmostra = tipo === 'pedido_amostra';
  const isAmostra = tipo === 'amostra';
  const isPromocao = tipo === 'promocao';
  const isDoacao = tipo === 'doacao' || isPedidoDoacao || isAmostra || isPromocao || isPedidoAmostra;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [wantsInExchange, setWantsInExchange] = useState('');
  const isSimpleCategory = tipo === 'pedido_amostra' || tipo === 'pedido_doacao' || tipo === 'doacao';
  const [category, setCategory] = useState(isSimpleCategory ? 'Produto' : 'Eletrônicos');
  const [gender, setGender] = useState<'Masculino' | 'Feminino' | 'Unissex'>('Unissex');
  const [previews, setPreviews] = useState<string[]>([]);
  const [brlValue, setBrlValue] = useState('');
  const [uploading, setUploading] = useState(false);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'requesting' | 'granted' | 'denied'>('idle');
  const [locationData, setLocationData] = useState<{ lat: number; lng: number; cidade: string } | null>(null);
  const [tipoTroca, setTipoTroca] = useState<'qualquer' | 'sugerir'>('qualquer');
  const [serviceQuantity, setServiceQuantity] = useState<number>(1);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // ── Moderação ──────────────────────────────────────────────────────────────
  const [moderationPhase, setModerationPhase] = useState<ModerationPhase>('idle');
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [rejectionReason, setRejectionReason] = useState('');
  const pendingProductRef = useRef<Omit<Product, 'id' | 'username'> | null>(null);
  const moderationResultRef = useRef<{ approved: boolean; violation?: string; details?: string } | null>(null);
  const timerDoneRef = useRef(false);
  const analysisIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup do timer ao desmontar
  useEffect(() => {
    return () => {
      if (analysisIntervalRef.current) clearInterval(analysisIntervalRef.current);
    };
  }, []);

  // Verifica se ambos (timer + resultado da IA) estão prontos para finalizar
  const tryFinishModeration = () => {
    if (!moderationResultRef.current || !timerDoneRef.current) return;

    const result = moderationResultRef.current;
    setAnalysisProgress(100);

    if (result.approved) {
      setModerationPhase('approved');
      setTimeout(() => {
        localStorage.removeItem('trokvibe_pending_ad');
        if (pendingProductRef.current) onSubmit(pendingProductRef.current);
        onClose();
      }, 1800);
    } else {
      const reason = result.details || result.violation || 'Conteúdo proibido';
      localStorage.removeItem('trokvibe_pending_ad');
      setRejectionReason(reason);
      setModerationPhase('rejected');
      // Aguarda 10s para o usuário ler, depois aciona o bloqueio
      setTimeout(() => {
        onBlocked?.(reason);
        onClose();
      }, 10_000);
    }
  };

  const handleRequestLocation = () => {
    setLocationStatus('requesting');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        let cidade = '';
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
          const json = await res.json();
          cidade = json.address?.city || json.address?.town || json.address?.village || json.address?.county || '';
        } catch { /* silently ignore */ }
        setLocationData({ lat, lng, cidade });
        setLocationStatus('granted');
      },
      () => setLocationStatus('denied'),
      { timeout: 10000 }
    );
  };

  const trokValue = brlValue ? Math.round(parseFloat(brlValue.replace(',', '.'))) : 0;

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const remaining = MAX_PHOTOS - previews.length;
    const toProcess = files.slice(0, remaining);
    for (const file of toProcess) {
      const compressed = await compressImage(file);
      setPreviews(prev => [...prev, compressed]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (index: number) => setPreviews(prev => prev.filter((_, i) => i !== index));

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
      alert(AT.createVideoSizeError(MAX_VIDEO_MB));
      return;
    }
    setVideoFile(file);
    setVideoPreview(URL.createObjectURL(file));
    if (videoInputRef.current) videoInputRef.current.value = '';
  };

  const removeVideo = () => {
    setVideoFile(null);
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    setVideoPreview('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploading(true);
    try {
      let urls: string[] = [];

      if (previews.length > 0) {
        urls = await Promise.all(
          previews.map((b64, i) => uploadToStorage(b64, currentUser, i))
        );
      }

      let videoUrl: string | undefined;
      if (videoFile) {
        const path = `${currentUser}/${Date.now()}_video.mp4`;
        const { data, error } = await supabase.storage.from('fotos').upload(path, videoFile, {
          contentType: videoFile.type || 'video/mp4',
          upsert: false,
        });
        if (error || !data) throw error;
        const { data: pub } = supabase.storage.from('fotos').getPublicUrl(data.path);
        videoUrl = pub.publicUrl;
      }

      // Sem foto: gera um placeholder SVG inferido pelo título/descrição/categoria
      // (emoji + gradiente coerente, em vez de imagem aleatória do Unsplash).
      const coverUrl = urls[0] || buildPlaceholderDataUrl({ title, description, category });

      // Amostra grátis: salva no campo `quantity` para controlar disponibilidade
      const quantityValue = isAmostra ? Math.max(1, Math.floor(serviceQuantity || 1)) : undefined;

      // Salva o produto pendente para submeter se aprovado
      pendingProductRef.current = {
        title,
        description,
        wantsInExchange: isPedidoDoacao ? 'Pedido de doação' : isPedidoAmostra ? 'Pedido de amostra' : isAmostra ? 'Amostra Grátis' : isPromocao ? 'Promoção' : isDoacao ? 'Doação' : tipoTroca === 'qualquer' ? 'Qualquer item de mesmo valor' : wantsInExchange,
        category,
        gender,
        image: coverUrl,
        images: urls,
        video: videoUrl,
        trokValue: isAmostra ? trokValue : isDoacao ? 0 : trokValue,
        tipo,
        lat: locationData?.lat ?? null,
        lng: locationData?.lng ?? null,
        cidade: locationData?.cidade ?? undefined,
        quantity: quantityValue,
      };

      setUploading(false);

      // ── Inicia fase de moderação ──────────────────────────────────────────
      // Salva no localStorage para recuperar caso o usuário saia/atualize
      localStorage.setItem('trokvibe_pending_ad', JSON.stringify({
        product: pendingProductRef.current,
        username: currentUser,
        startedAt: Date.now(),
      }));

      moderationResultRef.current = null;
      timerDoneRef.current = false;
      setModerationPhase('analyzing');
      setAnalysisProgress(0);

      // Timer de progresso (mínimo 2 minutos)
      const startTime = Date.now();
      analysisIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const pct = Math.min(99, (elapsed / MIN_ANALYSIS_MS) * 100);
        setAnalysisProgress(pct);
        if (elapsed >= MIN_ANALYSIS_MS) {
          clearInterval(analysisIntervalRef.current!);
          analysisIntervalRef.current = null;
          timerDoneRef.current = true;
          tryFinishModeration();
        }
      }, 800);

      // Chama a API de moderação IA em paralelo
      try {
        const res = await fetch(`${apiBase()}/api/moderate-listing`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            description,
            category,
            imageUrls: urls,
            username: currentUser,
          }),
        });
        if (res.ok) {
          moderationResultRef.current = await res.json();
        } else {
          moderationResultRef.current = { approved: true };
        }
      } catch {
        moderationResultRef.current = { approved: true };
      }
      tryFinishModeration();

    } catch (err) {
      console.error('Erro no upload:', err);
      alert(AT.createUploadError);
      setUploading(false);
    }
  };

  // ── Tela de análise de moderação ─────────────────────────────────────────
  if (moderationPhase !== 'idle') {
    const currentStepKey = ANALYSIS_STEPS.slice().reverse()
      .find(s => analysisProgress >= s.at)?.key || 'moderationStep1';

    return (
      <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center p-6 z-50"
        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, sans-serif' }}>
        <div style={{
          background: '#0f0f0f', borderRadius: 28,
          width: '100%', maxWidth: 400,
          padding: '44px 32px 40px',
          textAlign: 'center',
          boxShadow: '0 32px 80px rgba(0,0,0,0.8)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          {/* Ícone */}
          <div style={{
            width: 76, height: 76, borderRadius: 22, margin: '0 auto 28px',
            background: moderationPhase === 'approved'
              ? 'linear-gradient(145deg, #16a34a, #15803d)'
              : moderationPhase === 'rejected'
              ? 'linear-gradient(145deg, #dc2626, #991b1b)'
              : 'linear-gradient(145deg, #7c3aed, #4f46e5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: moderationPhase === 'approved'
              ? '0 0 40px rgba(34,197,94,0.35)'
              : moderationPhase === 'rejected'
              ? '0 0 40px rgba(220,38,38,0.35)'
              : '0 0 40px rgba(124,58,237,0.35)',
          }}>
            {moderationPhase === 'approved' ? (
              <CheckCircle style={{ width: 38, height: 38, color: 'white' }} />
            ) : moderationPhase === 'rejected' ? (
              <ShieldAlert style={{ width: 38, height: 38, color: 'white' }} />
            ) : (
              <ShieldCheck style={{ width: 38, height: 38, color: 'white' }} />
            )}
          </div>

          {/* Título */}
          <h2 style={{ color: 'white', fontSize: 20, fontWeight: 800, margin: '0 0 10px', letterSpacing: -0.3 }}>
            {moderationPhase === 'approved'
              ? AT.moderationApproved
              : moderationPhase === 'rejected'
              ? AT.moderationRejected
              : AT.moderationAnalyzing}
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, margin: '0 0 32px', lineHeight: 1.6 }}>
            {moderationPhase === 'approved'
              ? AT.moderationApprovedSub
              : moderationPhase === 'rejected'
              ? AT.moderationRejectedSub
              : AT.moderationSubtitle}
          </p>

          {/* Barra de progresso */}
          {(moderationPhase === 'analyzing' || moderationPhase === 'approved') && (
            <div style={{ marginBottom: 28 }}>
              <div style={{
                background: 'rgba(255,255,255,0.08)', borderRadius: 99,
                height: 6, overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', borderRadius: 99,
                  background: 'linear-gradient(90deg, #7c3aed, #a78bfa)',
                  width: `${analysisProgress}%`,
                  transition: 'width 0.8s ease',
                }} />
              </div>
              <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11, marginTop: 8 }}>
                {Math.round(analysisProgress)}%
              </p>
            </div>
          )}

          {/* Steps */}
          {moderationPhase === 'analyzing' && (
            <div style={{ textAlign: 'left', marginBottom: 28 }}>
              {ANALYSIS_STEPS.map((step, i) => {
                const done = analysisProgress > step.at + 20;
                const active = analysisProgress >= step.at && analysisProgress < step.at + 20;
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '8px 0',
                    borderBottom: i < ANALYSIS_STEPS.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                  }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: 99, flexShrink: 0,
                      background: done ? '#22c55e' : active ? '#7c3aed' : 'rgba(255,255,255,0.1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, color: 'white', fontWeight: 800,
                      transition: 'background 0.5s',
                    }}>
                      {done ? '✓' : active ? (
                        <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>◌</span>
                      ) : '○'}
                    </div>
                    <span style={{
                      color: done ? '#86efac' : active ? 'white' : 'rgba(255,255,255,0.3)',
                      fontSize: 14, fontWeight: active ? 600 : 400,
                      transition: 'color 0.5s',
                    }}>
                      {AT[step.key]}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Motivo de rejeição */}
          {moderationPhase === 'rejected' && rejectionReason && (
            <div style={{
              background: 'rgba(220,38,38,0.12)',
              border: '1px solid rgba(220,38,38,0.28)',
              borderRadius: 14, padding: '14px 18px', marginBottom: 20, textAlign: 'left',
            }}>
              <p style={{ color: '#fca5a5', fontSize: 14, margin: 0, lineHeight: 1.6 }}>
                {rejectionReason}
              </p>
            </div>
          )}

          {moderationPhase === 'rejected' && (
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, margin: 0, lineHeight: 1.6 }}>
              {AT.moderationRejectedDesc}
            </p>
          )}

          {/* Rodapé tempo */}
          {moderationPhase === 'analyzing' && (
            <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12, margin: 0 }}>
              {AT.moderationWait}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
      <div className="glass w-full max-w-2xl max-h-[90vh] overflow-y-auto" style={{ borderRadius: 28 }}>
        <div
          className={`sticky top-0 text-white px-6 py-4 flex items-center justify-between rounded-t-3xl z-10 ${isPedidoDoacao ? 'bg-gradient-to-r from-pink-700 to-pink-500' : isAmostra ? '' : isPromocao ? '' : isDoacao ? 'bg-gradient-to-r from-purple-700 to-purple-500' : 'bg-purple-600'}`}
          style={isAmostra ? { background: 'linear-gradient(90deg, #5a7a52, #6b8e3d)' } : isPromocao ? { background: 'linear-gradient(90deg, #b8896a, #c6895d)' } : undefined}>
          <h2 className="text-xl font-bold flex items-center gap-2">
            {isPedidoDoacao ? '🙏 Pedir uma doação' : isPedidoAmostra ? '🙋 Pedir uma Amostra' : isAmostra ? '🍃 Anunciar Amostra' : isPromocao ? '🏷️ Anunciar Promoção' : isDoacao ? AT.createTitleDonation : AT.createTitleTrade}
          </h2>
          <button onClick={onClose} className="text-white hover:text-gray-200"><X className="w-6 h-6" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">

          {/* Fotos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-gray-700 font-semibold">{AT.createPhotos}</label>
              <span className="text-sm text-gray-400">{previews.length}/{MAX_PHOTOS}</span>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageChange} className="hidden" />
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {previews.map((img, i) => (
                <div key={i} className="relative aspect-square rounded-2xl overflow-hidden border-2 border-purple-200">
                  <img src={img} alt="" className="w-full h-full object-cover" />
                  {i === 0 && <span className="absolute bottom-1 left-1 bg-purple-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">{AT.createPhotoCover}</span>}
                  <button type="button" onClick={() => removeImage(i)} className="absolute top-1 right-1 bg-black bg-opacity-60 text-white rounded-full w-5 h-5 flex items-center justify-center">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {previews.length < MAX_PHOTOS && (
                <div onClick={() => fileInputRef.current?.click()}
                  className="aspect-square rounded-2xl border-2 border-dashed border-purple-300 flex flex-col items-center justify-center cursor-pointer hover:border-purple-500 hover:bg-purple-50 transition-all">
                  <ImagePlus className="w-6 h-6 text-purple-400 mb-1" />
                  <p className="text-purple-500 text-[10px] font-semibold text-center leading-tight">
                    {previews.length === 0 ? AT.createPhotoAdd : AT.createPhotoMore}
                  </p>
                </div>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1">{AT.createPhotoHint(MAX_PHOTOS)}</p>
          </div>

          {/* Vídeo */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-gray-700 font-semibold flex items-center gap-1.5">
                <Video className="w-4 h-4 text-purple-500" /> {AT.createVideo} <span className="text-gray-400 font-normal text-sm">{AT.createVideoOptional}</span>
              </label>
            </div>
            <input ref={videoInputRef} type="file" accept="video/*" onChange={handleVideoChange} className="hidden" />
            {videoPreview ? (
              <div className="relative rounded-2xl overflow-hidden border-2 border-purple-200 bg-black">
                <video src={videoPreview} controls playsInline className="w-full max-h-48 object-contain" />
                <button type="button" onClick={removeVideo}
                  className="absolute top-2 right-2 bg-black bg-opacity-60 text-white rounded-full w-6 h-6 flex items-center justify-center">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div onClick={() => videoInputRef.current?.click()}
                className="rounded-2xl border-2 border-dashed border-purple-300 flex items-center justify-center gap-3 py-5 cursor-pointer hover:border-purple-500 hover:bg-purple-50 transition-all">
                <Video className="w-7 h-7 text-purple-400" />
                <div>
                  <p className="text-purple-600 font-semibold text-sm">{AT.createVideoAdd}</p>
                  <p className="text-gray-400 text-xs">{AT.createVideoHint(MAX_VIDEO_MB)}</p>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-gray-700 font-semibold mb-2">{AT.createProductTitle}</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder={AT.createTitlePlaceholder}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl focus:border-purple-500 outline-none" required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-700 font-semibold mb-2">{AT.createCategory}</label>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl focus:border-purple-500 outline-none">
                {(isSimpleCategory
                  ? ['Produto', 'Serviço']
                  : ['Eletrônicos','Games','Computadores','Celulares','Áudio','Roupas','Calçados','Acessórios','Bolsas & Mochilas','Relógios','Esportes','Livros','Casa & Decoração','Beleza','Infantil','Automóveis','Moto','Carro','Caminhão','Animais','Cachorro','Gato','Serviços','Outros']
                ).map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-gray-700 font-semibold mb-2">{AT.createGender}</label>
              <select value={gender} onChange={e => setGender(e.target.value as 'Masculino' | 'Feminino' | 'Unissex')}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl focus:border-purple-500 outline-none">
                <option>Unissex</option><option>Masculino</option><option>Feminino</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-gray-700 font-semibold mb-2">{AT.createDescription}</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder={AT.createDescriptionPlaceholder}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl focus:border-purple-500 outline-none h-24 resize-none" required />
          </div>

          {isPedidoDoacao ? (
            <div className="bg-pink-50 border-2 border-pink-200 rounded-2xl px-4 py-3 flex items-center gap-3">
              <span className="text-2xl">🙏</span>
              <div>
                <p className="font-bold text-pink-700">Você está pedindo uma doação</p>
                <p className="text-xs text-pink-500">Outros usuários verão este pedido e poderão te contatar para doar.</p>
              </div>
            </div>
          ) : isPedidoAmostra ? (
            <div className="rounded-2xl px-4 py-3 flex items-center gap-3 border-2" style={{ background: '#f5f8f1', borderColor: '#6b8e3d' }}>
              <span className="text-2xl">🙋</span>
              <div>
                <p className="font-bold" style={{ color: '#3d5a32' }}>Você está pedindo uma amostra</p>
                <p className="text-xs" style={{ color: '#5a7a52' }}>Empresas verão seu pedido e poderão te oferecer uma amostra do produto ou serviço.</p>
              </div>
            </div>
          ) : isAmostra ? (
            <>
              <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl px-4 py-3 flex items-center gap-3">
                <span className="text-2xl">🎟️</span>
                <div>
                  <p className="font-bold text-emerald-800">Amostra Grátis</p>
                  <p className="text-xs text-emerald-700">Ofereça um serviço ou produto gratuito da sua empresa.</p>
                </div>
              </div>
              <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl px-4 py-3">
                <label className="flex items-center gap-2 font-bold text-emerald-800 mb-2">
                  <span className="text-lg">🎯</span> Quantas amostras você está oferecendo?
                </label>
                <div className="flex items-center gap-3">
                  <button type="button"
                    onClick={() => setServiceQuantity(q => Math.max(1, q - 1))}
                    className="w-10 h-10 rounded-full bg-emerald-700 text-white font-bold text-xl active:scale-95 transition-transform">−</button>
                  <input
                    type="number"
                    min="1"
                    max="999"
                    value={serviceQuantity}
                    onChange={e => {
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v) && v >= 1) setServiceQuantity(v);
                      else if (e.target.value === '') setServiceQuantity(1);
                    }}
                    className="w-20 text-center px-2 py-2 border-2 border-emerald-400 rounded-xl font-bold text-lg outline-none focus:border-emerald-700"
                  />
                  <button type="button"
                    onClick={() => setServiceQuantity(q => Math.min(999, q + 1))}
                    className="w-10 h-10 rounded-full bg-emerald-700 text-white font-bold text-xl active:scale-95 transition-transform">+</button>
                  <span className="text-xs text-emerald-700 ml-2">amostras</span>
                </div>
                <p className="text-xs text-emerald-700 mt-2">
                  Conforme as pessoas forem solicitando, a quantidade vai diminuindo. Quando chegar a zero, o anúncio é removido automaticamente.
                </p>
              </div>
              {/* Valor da amostra — só você verá no Painel de Controle */}
              <div className="rounded-2xl px-4 py-3 border-2" style={{ background: '#f5f8f1', borderColor: '#6b8e3d' }}>
                <label className="block font-bold mb-2 flex items-center gap-2" style={{ color: '#3d5a32' }}>
                  <Coins className="w-4 h-4" /> Valor unitário da amostra (R$)
                </label>
                <p className="text-xs mb-2" style={{ color: '#5a7a52' }}>
                  🔒 Privado — apenas você verá. Usado no seu Painel de Controle para calcular quanto está gastando com amostras.
                </p>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-semibold">R$</span>
                  <input type="number" min="0" step="0.01" value={brlValue} onChange={e => setBrlValue(e.target.value)}
                    placeholder="0,00" className="w-full pl-10 pr-4 py-3 border-2 rounded-2xl outline-none bg-white"
                    style={{ borderColor: '#6b8e3d' }} />
                </div>
              </div>
            </>
          ) : isPromocao ? (
            <div className="rounded-2xl px-4 py-3 flex items-center gap-3 border-2" style={{ background: '#fbf5ee', borderColor: '#c6895d' }}>
              <span className="text-2xl">🏷️</span>
              <div>
                <p className="font-bold" style={{ color: '#7d5a3a' }}>Promoção informativa</p>
                <p className="text-xs" style={{ color: '#9a7351' }}>Mostre seu produto/serviço promocional aos usuários. Eles poderão ver as fotos e iniciar um chat para mais informações.</p>
              </div>
            </div>
          ) : isDoacao ? (
            <div className="bg-purple-50 border-2 border-purple-200 rounded-2xl px-4 py-3 flex items-center gap-3">
              <span className="text-2xl">🎁</span>
              <div>
                <p className="font-bold text-purple-700">{AT.createDonationFree}</p>
                <p className="text-xs text-purple-500">{AT.createDonationFreeDesc}</p>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-gray-700 font-semibold mb-2 flex items-center gap-2">
                <Coins className="w-4 h-4 text-purple-600" /> {AT.createValue}
              </label>
              <div className="flex gap-3 items-center">
                <div className="relative flex-1">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-semibold">R$</span>
                  <input type="number" min="0" step="0.01" value={brlValue} onChange={e => setBrlValue(e.target.value)}
                    placeholder="0,00" className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-2xl focus:border-purple-500 outline-none" />
                </div>
                {trokValue > 0 && (
                  <div className="flex items-center gap-2 bg-purple-50 border-2 border-purple-200 rounded-2xl px-4 py-3 whitespace-nowrap">
                    <Coins className="w-4 h-4 text-purple-600" />
                    <span className="font-bold text-purple-700">{trokValue.toLocaleString('pt-BR')} T</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1">{AT.createTrokHint}</p>
            </div>
          )}

          {!isDoacao && (
            <div>
              <label className="block text-gray-700 font-semibold mb-2">{AT.createWants}</label>

              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="relative group">
                  <button
                    type="button"
                    onClick={() => { setTipoTroca('qualquer'); setWantsInExchange(''); }}
                    className={`w-full flex items-center gap-2 px-4 py-3 rounded-2xl border-2 font-semibold text-sm transition-all ${
                      tipoTroca === 'qualquer'
                        ? 'border-purple-500 bg-purple-50 text-purple-700'
                        : 'border-gray-200 bg-white text-gray-500 hover:border-purple-300'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${tipoTroca === 'qualquer' ? 'border-purple-500' : 'border-gray-300'}`}>
                      {tipoTroca === 'qualquer' && <span className="w-2 h-2 rounded-full bg-purple-500 block" />}
                    </span>
                    {AT.createWantsAny}
                  </button>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-purple-600 text-white text-xs font-semibold rounded-xl whitespace-nowrap shadow-lg
                    opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-20">
                    {AT.createWantsBoostTooltip}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-purple-600" />
                  </div>
                </div>
                <div className="relative group">
                  <button
                    type="button"
                    onClick={() => setTipoTroca('sugerir')}
                    className={`w-full flex items-center gap-2 px-4 py-3 rounded-2xl border-2 font-semibold text-sm transition-all ${
                      tipoTroca === 'sugerir'
                        ? 'border-orange-400 bg-orange-50 text-orange-700'
                        : 'border-gray-200 bg-white text-gray-500 hover:border-orange-300'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${tipoTroca === 'sugerir' ? 'border-orange-400' : 'border-gray-300'}`}>
                      {tipoTroca === 'sugerir' && <span className="w-2 h-2 rounded-full bg-orange-400 block" />}
                    </span>
                    {AT.createWantsSuggest}
                  </button>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-orange-500 text-white text-xs font-semibold rounded-xl whitespace-nowrap shadow-lg
                    opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-20">
                    {AT.createWantsSuggestTooltip}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-orange-500" />
                  </div>
                </div>
              </div>

              <textarea
                value={tipoTroca === 'qualquer' ? '' : wantsInExchange}
                onChange={e => setWantsInExchange(e.target.value)}
                disabled={tipoTroca === 'qualquer'}
                placeholder={tipoTroca === 'qualquer' ? AT.createWantsAnyPlaceholder : AT.createWantsSuggestPlaceholder}
                required={tipoTroca === 'sugerir'}
                rows={3}
                className={`w-full px-4 py-3 border-2 rounded-2xl outline-none resize-none transition-all text-sm ${
                  tipoTroca === 'qualquer'
                    ? 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'
                    : 'border-orange-200 bg-white focus:border-orange-400 text-gray-800'
                }`}
              />
              {/* Hint visível em mobile e desktop com a mesma frase do tooltip do botão selecionado */}
              <p className={`text-xs font-semibold mt-2 ${tipoTroca === 'qualquer' ? 'text-purple-600' : 'text-orange-600'}`}>
                {tipoTroca === 'qualquer' ? AT.createWantsBoostTooltip : AT.createWantsSuggestTooltip}
              </p>
            </div>
          )}

          {/* Localização */}
          <div className={`rounded-2xl border-2 p-4 transition-all ${
            locationStatus === 'granted'
              ? 'border-green-200 bg-green-50'
              : locationStatus === 'denied'
              ? 'border-red-200 bg-red-50'
              : 'border-purple-100 bg-purple-50'
          }`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <MapPin className={`w-4 h-4 ${locationStatus === 'granted' ? 'text-green-500' : 'text-purple-500'}`} />
                  <span className="font-semibold text-sm text-gray-700">{AT.createLocation}</span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">{AT.createLocationDesc}</p>
                {locationStatus === 'granted' && locationData && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                    <span className="text-xs font-semibold text-green-600">
                      {locationData.cidade ? `📍 ${locationData.cidade}` : AT.createLocationCaptured}
                    </span>
                  </div>
                )}
                {locationStatus === 'denied' && (
                  <p className="text-xs text-red-500 mt-2">{AT.createLocationDenied}</p>
                )}
              </div>

              {locationStatus !== 'granted' && (
                <button
                  type="button"
                  onClick={handleRequestLocation}
                  disabled={locationStatus === 'requesting' || locationStatus === 'denied'}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white transition-all disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #f97316 100%)' }}
                >
                  {locationStatus === 'requesting'
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {AT.createLocationWaiting}</>
                    : <><MapPin className="w-3.5 h-3.5" /> {AT.createLocationAllow}</>}
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-2xl font-bold hover:bg-gray-200 transition-colors">
              {AT.createCancel}
            </button>
            <button type="submit" disabled={uploading}
              className={`flex-1 text-white py-3 rounded-2xl font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2 ${isPedidoDoacao ? 'bg-pink-600 hover:bg-pink-700' : isAmostra ? '' : isPromocao ? '' : 'bg-purple-600 hover:bg-purple-700'}`}
              style={isAmostra ? { background: '#5a7a52' } : isPromocao ? { background: '#b8896a' } : undefined}>
              {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> {AT.createUploading}</> : isPedidoDoacao ? '🙏 Publicar Pedido' : isPedidoAmostra ? '🙋 Publicar Pedido de Amostra' : isAmostra ? '🍃 Publicar Amostra' : isPromocao ? '🏷️ Publicar Promoção' : isDoacao ? AT.createPublishDonation : AT.createPublishTrade}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
