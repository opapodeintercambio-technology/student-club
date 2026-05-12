import { useState, useRef } from 'react';
import { X, Coins, ImagePlus, Video } from 'lucide-react';
import type { Product } from './ProductCard';
import { supabase } from '../../lib/supabase';

const CATEGORIES = [
  'Celulares','Eletrônicos','Computadores','Games','Roupas','Calçados',
  'Bolsas & Mochilas','Relógios','Joias & Acessórios','Esportes','Livros',
  'Móveis','Eletrodomésticos','Casa & Decoração','Beleza','Infantil',
  'Automóveis','Moto','Carro','Caminhão',
  'Animais','Cachorro','Gato',
  'Bicicletas','Arte','Instrumentos Musicais','Serviços','Outros',
];

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

function b64toBlob(b64: string): Blob {
  const byteStr = atob(b64.split(',')[1]);
  const ab = new ArrayBuffer(byteStr.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteStr.length; i++) ia[i] = byteStr.charCodeAt(i);
  return new Blob([ab], { type: 'image/jpeg' });
}

async function uploadImage(b64: string, username: string, idx: number): Promise<string> {
  const blob = b64toBlob(b64);
  const path = `${username}/${Date.now()}_edit_${idx}.jpg`;
  const { data, error } = await supabase.storage.from('fotos').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error || !data) throw error;
  return supabase.storage.from('fotos').getPublicUrl(data.path).data.publicUrl;
}

export interface EditData {
  title: string;
  description: string;
  wantsInExchange: string;
  category: string;
  gender: 'Masculino' | 'Feminino' | 'Unissex';
  trokValue: number;
  images: string[];
  video?: string;
  quantity?: number;
}

interface EditProductProps {
  product: Product;
  onClose: () => void;
  onSave: (id: string, data: EditData) => Promise<void>;
}

export function EditProduct({ product, onClose, onSave }: EditProductProps) {
  const existingImages = product.images && product.images.length > 0 ? product.images : [product.image];
  const isAmostra = product.tipo === 'amostra';
  const isPedidoDoacao = product.tipo === 'pedido_doacao';
  const isDoacao = product.tipo === 'doacao' || isPedidoDoacao || isAmostra;

  const [title, setTitle] = useState(product.title);
  const [description, setDescription] = useState(product.description);
  const [wantsInExchange, setWantsInExchange] = useState(product.wantsInExchange);
  const [category, setCategory] = useState(product.category);
  const [gender, setGender] = useState<'Masculino' | 'Feminino' | 'Unissex'>(product.gender || 'Unissex');
  const [brlValue, setBrlValue] = useState(product.trokValue ? String(product.trokValue) : '');
  const [quantity, setQuantity] = useState<number>(product.quantity && product.quantity > 0 ? product.quantity : 1);

  const [existUrls, setExistUrls] = useState<string[]>(existingImages);
  const [newPreviews, setNewPreviews] = useState<string[]>([]);
  const totalPhotos = existUrls.length + newPreviews.length;

  const [currentVideo] = useState<string | undefined>(product.video);
  const [newVideoFile, setNewVideoFile] = useState<File | null>(null);
  const [newVideoPreview, setNewVideoPreview] = useState('');
  const [videoRemoved, setVideoRemoved] = useState(false);

  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const trokValue = brlValue ? Math.round(parseFloat(brlValue.replace(',', '.'))) : 0;

  const handleImageAdd = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const remaining = MAX_PHOTOS - totalPhotos;
    for (const file of files.slice(0, remaining)) {
      const compressed = await compressImage(file);
      setNewPreviews(prev => [...prev, compressed]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleVideoAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) { alert(`Máx. ${MAX_VIDEO_MB}MB.`); return; }
    setNewVideoFile(file);
    setNewVideoPreview(URL.createObjectURL(file));
    setVideoRemoved(false);
    if (videoInputRef.current) videoInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const uploadedUrls = await Promise.all(
        newPreviews.map((b64, i) => uploadImage(b64, product.username, existUrls.length + i))
      );
      const finalImages = [...existUrls, ...uploadedUrls];

      let finalVideo: string | undefined = videoRemoved ? undefined : currentVideo;
      if (newVideoFile) {
        const path = `${product.username}/${Date.now()}_video_edit.mp4`;
        const { data, error } = await supabase.storage.from('fotos').upload(path, newVideoFile, {
          contentType: newVideoFile.type || 'video/mp4', upsert: false,
        });
        if (error || !data) throw error;
        finalVideo = supabase.storage.from('fotos').getPublicUrl(data.path).data.publicUrl;
      }

      await onSave(product.id, {
        title,
        description,
        wantsInExchange,
        category,
        gender,
        trokValue: isAmostra ? 0 : trokValue,
        images: finalImages,
        video: finalVideo,
        quantity: isAmostra ? Math.max(1, Math.floor(quantity || 1)) : undefined,
      });
      onClose();
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const showVideo = newVideoPreview || (currentVideo && !videoRemoved);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
      <div className="glass w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl" style={{ borderRadius: 28 }}>
        <div className="sticky top-0 bg-purple-600 text-white px-6 py-4 flex items-center justify-between rounded-t-3xl z-10">
          <h2 className="text-lg font-bold">Editar Anúncio</h2>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">

          {/* Fotos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-gray-700 font-semibold">Fotos</label>
              <span className="text-sm text-gray-400">{totalPhotos}/{MAX_PHOTOS}</span>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageAdd} className="hidden" />
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {existUrls.map((url, i) => (
                <div key={`e${i}`} className="relative aspect-square rounded-2xl overflow-hidden border-2 border-purple-200">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  {i === 0 && <span className="absolute bottom-1 left-1 bg-purple-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">Capa</span>}
                  <button type="button" onClick={() => setExistUrls(prev => prev.filter((_, j) => j !== i))}
                    className="absolute top-1 right-1 bg-black bg-opacity-60 text-white rounded-full w-5 h-5 flex items-center justify-center">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {newPreviews.map((b64, i) => (
                <div key={`n${i}`} className="relative aspect-square rounded-2xl overflow-hidden border-2 border-green-300">
                  <img src={b64} alt="" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => setNewPreviews(prev => prev.filter((_, j) => j !== i))}
                    className="absolute top-1 right-1 bg-black bg-opacity-60 text-white rounded-full w-5 h-5 flex items-center justify-center">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {totalPhotos < MAX_PHOTOS && (
                <div onClick={() => fileInputRef.current?.click()}
                  className="aspect-square rounded-2xl border-2 border-dashed border-purple-300 flex flex-col items-center justify-center cursor-pointer hover:border-purple-500 hover:bg-purple-50 transition-all">
                  <ImagePlus className="w-6 h-6 text-purple-400 mb-1" />
                  <p className="text-purple-500 text-[10px] font-semibold text-center leading-tight">Adicionar</p>
                </div>
              )}
            </div>
          </div>

          {/* Vídeo */}
          <div>
            <label className="block text-gray-700 font-semibold mb-2 flex items-center gap-1.5">
              <Video className="w-4 h-4 text-purple-500" /> Vídeo <span className="text-gray-400 font-normal text-sm">(opcional)</span>
            </label>
            <input ref={videoInputRef} type="file" accept="video/*" onChange={handleVideoAdd} className="hidden" />
            {showVideo ? (
              <div className="relative rounded-2xl overflow-hidden border-2 border-purple-200 bg-black">
                <video src={newVideoPreview || currentVideo} controls playsInline className="w-full max-h-40 object-contain" />
                <button type="button"
                  onClick={() => { setNewVideoFile(null); setNewVideoPreview(''); setVideoRemoved(true); }}
                  className="absolute top-2 right-2 bg-black bg-opacity-60 text-white rounded-full w-6 h-6 flex items-center justify-center">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div onClick={() => videoInputRef.current?.click()}
                className="rounded-2xl border-2 border-dashed border-purple-300 flex items-center justify-center gap-3 py-4 cursor-pointer hover:border-purple-500 hover:bg-purple-50 transition-all">
                <Video className="w-6 h-6 text-purple-400" />
                <div>
                  <p className="text-purple-600 font-semibold text-sm">Adicionar vídeo</p>
                  <p className="text-gray-400 text-xs">MP4, MOV · máx. {MAX_VIDEO_MB}MB</p>
                </div>
              </div>
            )}
          </div>

          {/* Título */}
          <div>
            <label className="block text-gray-700 font-semibold mb-2">Título</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} required
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl focus:border-purple-500 outline-none" />
          </div>

          {/* Categoria + Gênero */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-700 font-semibold mb-2">Categoria</label>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl focus:border-purple-500 outline-none">
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-gray-700 font-semibold mb-2">Gênero</label>
              <select value={gender} onChange={e => setGender(e.target.value as 'Masculino' | 'Feminino' | 'Unissex')}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl focus:border-purple-500 outline-none">
                <option>Unissex</option>
                <option>Masculino</option>
                <option>Feminino</option>
              </select>
            </div>
          </div>

          {/* Descrição */}
          <div>
            <label className="block text-gray-700 font-semibold mb-2">Descrição</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} required
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl focus:border-purple-500 outline-none h-28 resize-none" />
          </div>

          {/* O que quer em troca — escondido para amostra/doação */}
          {!isDoacao && (
            <div>
              <label className="block text-gray-700 font-semibold mb-2">O que deseja em troca</label>
              <input type="text" value={wantsInExchange} onChange={e => setWantsInExchange(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl focus:border-purple-500 outline-none" />
            </div>
          )}

          {/* Quantidade (apenas amostra grátis) */}
          {isAmostra && (
            <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl px-4 py-3">
              <label className="flex items-center gap-2 font-bold text-emerald-800 mb-2">
                <span className="text-lg">🎯</span> Quantidade de amostras
              </label>
              <div className="flex items-center gap-3">
                <button type="button"
                  onClick={() => setQuantity(q => Math.max(1, q - 1))}
                  className="w-10 h-10 rounded-full bg-emerald-700 text-white font-bold text-xl active:scale-95 transition-transform">−</button>
                <input
                  type="number"
                  min="1"
                  max="999"
                  value={quantity}
                  onChange={e => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v) && v >= 1) setQuantity(v);
                    else if (e.target.value === '') setQuantity(1);
                  }}
                  className="w-20 text-center px-2 py-2 border-2 border-emerald-400 rounded-xl font-bold text-lg outline-none focus:border-emerald-700"
                />
                <button type="button"
                  onClick={() => setQuantity(q => Math.min(999, q + 1))}
                  className="w-10 h-10 rounded-full bg-emerald-700 text-white font-bold text-xl active:scale-95 transition-transform">+</button>
                <span className="text-xs text-emerald-700 ml-2">amostras</span>
              </div>
              <p className="text-xs text-emerald-700 mt-2">
                Conforme as pessoas forem solicitando, a quantidade vai diminuindo.
              </p>
            </div>
          )}

          {/* Valor — escondido para amostra/doação (são gratuitos) */}
          {!isDoacao && (
            <div>
              <label className="block text-gray-700 font-semibold mb-2 flex items-center gap-2">
                <Coins className="w-4 h-4 text-purple-600" /> Valor estimado (R$)
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
              <p className="text-xs text-gray-400 mt-1">🪙 1 Trok = R$ 1,00</p>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-3 rounded-2xl bg-purple-600 text-white font-bold hover:bg-purple-700 transition-colors disabled:opacity-60">
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
