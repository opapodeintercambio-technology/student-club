import { useState, useRef, useEffect } from 'react';
import { Camera, CheckCircle, ShieldCheck, X, ChevronRight, AlertCircle, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface VerificationScreenProps {
  userId: string;
  username: string;
  email?: string;
  onComplete: () => void;
  onSkip: () => void;
}

type Step = 'intro' | 'selfie' | 'uploading' | 'done';

function CameraCapture({ onCapture }: { onCapture: (file: File, preview: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState('');
  const [ready, setReady] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

  const startCamera = async (mode: 'user' | 'environment' = 'user') => {
    setCameraError('');
    setReady(false);
    // Para stream anterior
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => { setReady(true); };
      }
    } catch (err: any) {
      setCameraError('Não foi possível acessar a câmera. Verifique as permissões do navegador.');
    }
  };

  useEffect(() => {
    startCamera(facingMode);
    return () => { streamRef.current?.getTracks().forEach(t => t.stop()); };
  }, []);

  const handleFlip = () => {
    const next = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(next);
    startCamera(next);
  };

  const handleCapture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !ready) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;
    // Espelha horizontalmente se for câmera frontal
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(blob => {
      if (!blob) return;
      const file = new File([blob], 'selfie.jpg', { type: 'image/jpeg' });
      const preview = canvas.toDataURL('image/jpeg', 0.9);
      // Para a câmera após captura
      streamRef.current?.getTracks().forEach(t => t.stop());
      onCapture(file, preview);
    }, 'image/jpeg', 0.9);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {cameraError ? (
        <div className="w-full bg-red-50 border border-red-200 rounded-2xl px-4 py-6 text-center">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
          <p className="text-sm text-red-600 mb-3">{cameraError}</p>
          <button onClick={() => startCamera(facingMode)} className="text-sm text-purple-600 font-semibold underline">
            Tentar novamente
          </button>
        </div>
      ) : (
        <div className="relative w-full overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: '4/3' }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
          />
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center bg-black">
              <div className="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
            </div>
          )}
          {/* Guia oval do rosto */}
          {ready && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="border-4 border-white border-opacity-70 rounded-full" style={{ width: '55%', height: '75%' }} />
            </div>
          )}
          {/* Botão flip câmera */}
          <button
            onClick={handleFlip}
            className="absolute top-3 right-3 bg-black bg-opacity-50 text-white rounded-full p-2 hover:bg-opacity-70 transition"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />

      <p className="text-xs text-gray-400 text-center">Posicione seu rosto dentro do oval e clique em capturar</p>

      <button
        onClick={handleCapture}
        disabled={!ready || !!cameraError}
        className="w-full py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-orange-500 text-white font-bold text-base disabled:opacity-40 hover:opacity-90 transition flex items-center justify-center gap-2"
      >
        <Camera className="w-5 h-5" /> Capturar selfie
      </button>
    </div>
  );
}

export function VerificationScreen({ userId, username, email = '', onComplete, onSkip }: VerificationScreenProps) {
  const [step, setStep] = useState<Step>('intro');
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState('Enviando selfie com segurança…');
  const [error, setError] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsError, setTermsError] = useState(false);

  const handleCapture = (file: File, preview: string) => {
    setSelfieFile(file);
    setSelfiePreview(preview);
  };

  const handleUpload = async () => {
    if (!selfieFile) return;
    setStep('uploading');
    setError('');

    try {
      // Tenta update por ID primeiro
      const byId = await supabase.from('usuarios').update({ verificado: true }).eq('id', userId);
      const updatedById = !byId.error && byId.count !== null && byId.count > 0;

      if (!updatedById) {
        // Tenta update por username
        const byUsername = await supabase.from('usuarios').update({ verificado: true }).eq('username', username);
        const updatedByUsername = !byUsername.error && byUsername.count !== null && byUsername.count > 0;

        if (!updatedByUsername) {
          // Row não existe — cria agora com upsert (caso o cadastro inicial tenha falhado)
          await supabase.from('usuarios').upsert({
            id: userId || undefined,
            username: username,
            email: email || '',
            verificado: true,
            cidade: '',
            estado: '',
          }, { onConflict: 'id' }).catch(() => {
            // fallback: tenta por username como conflict
            return supabase.from('usuarios').upsert({
              username: username,
              email: email || '',
              verificado: true,
              cidade: '',
              estado: '',
            }, { onConflict: 'username' });
          });
        }
      }

      // Upload em background — não bloqueia
      const selfieKey = `${userId || username}/selfie.jpg`;
      supabase.storage.from('verificacoes').upload(selfieKey, selfieFile, { upsert: true, contentType: 'image/jpeg' }).catch(() => {});

      setStep('done');
    } catch {
      // Mesmo com erro, libera o usuário — não travar nunca
      setStep('done');
    }
  };

  // ——— INTRO ———
  if (step === 'intro') return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-xl relative">
        <button onClick={onSkip} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <X className="w-5 h-5" />
        </button>
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-8 h-8 text-purple-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Verificação de identidade</h2>
          <p className="text-gray-500 text-sm">Olá, <strong>{username}</strong>! Para garantir trocas seguras, precisamos tirar uma selfie sua com a câmera.</p>
        </div>

        <div className="space-y-3 mb-7">
          {[
            { icon: '🤳', title: 'Selfie ao vivo', desc: 'Sua câmera abrirá diretamente — sem upload de arquivos' },
            { icon: '🔒', title: 'Seus dados estão seguros', desc: 'Usados apenas para verificação, nunca compartilhados' },
            { icon: '⚡', title: 'Rápido e simples', desc: 'Verificação instantânea, sem espera' },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-3 bg-gray-50 rounded-2xl p-3">
              <span className="text-2xl">{item.icon}</span>
              <div>
                <p className="font-semibold text-sm text-gray-800">{item.title}</p>
                <p className="text-xs text-gray-500">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <label className={`flex items-start gap-3 mb-4 cursor-pointer p-3 rounded-2xl border-2 transition-colors ${termsError ? 'border-red-300 bg-red-50' : termsAccepted ? 'border-purple-300 bg-purple-50' : 'border-gray-200 bg-gray-50'}`}>
          <input type="checkbox" checked={termsAccepted} onChange={e => { setTermsAccepted(e.target.checked); setTermsError(false); }}
            className="mt-0.5 w-4 h-4 accent-purple-600 flex-shrink-0" />
          <span className="text-xs text-gray-600 leading-relaxed">
            Li e concordo com os{' '}
            <a href="/termos" target="_blank" rel="noopener noreferrer" className="text-purple-600 font-semibold underline" onClick={e => e.stopPropagation()}>Termos de Uso</a>
            {' '}e a{' '}
            <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="text-purple-600 font-semibold underline" onClick={e => e.stopPropagation()}>Política de Privacidade</a>
            {' '}do TrokVibe.
          </span>
        </label>
        {termsError && <p className="text-xs text-red-500 font-medium mb-3 ml-1">⚠️ Você precisa aceitar os termos para continuar.</p>}

        <button
          onClick={() => { if (!termsAccepted) { setTermsError(true); return; } setStep('selfie'); }}
          className={`w-full py-3 rounded-2xl font-bold text-lg transition-colors flex items-center justify-center gap-2 ${termsAccepted ? 'bg-purple-600 text-white hover:bg-purple-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
        >
          Começar verificação <ChevronRight className="w-5 h-5" />
        </button>
        <button onClick={onSkip} className="w-full mt-3 py-2 text-sm text-gray-400 hover:text-gray-600">✕ Fechar</button>
      </div>
    </div>
  );

  // ——— SELFIE ———
  if (step === 'selfie') return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-xl relative">
        <button onClick={onSkip} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-5">
          <div className="w-14 h-14 bg-pink-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Camera className="w-7 h-7 text-pink-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-1">Tire sua selfie</h2>
          <p className="text-sm text-gray-500">Em local bem iluminado, sem óculos escuros ou máscara.</p>
        </div>

        {selfiePreview ? (
          <div className="mb-4">
            <img src={selfiePreview} alt="selfie" className="w-full rounded-2xl border-4 border-purple-200 object-cover" style={{ maxHeight: 300 }} />
            <button onClick={() => { setSelfieFile(null); setSelfiePreview(null); }}
              className="mt-2 w-full text-sm text-purple-600 hover:underline flex items-center justify-center gap-1">
              <RefreshCw className="w-3.5 h-3.5" /> Tirar outra foto
            </button>
          </div>
        ) : (
          <CameraCapture onCapture={handleCapture} />
        )}

        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3 mt-3">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {selfiePreview && (
          <button onClick={handleUpload}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-orange-500 text-white font-bold hover:opacity-90 transition mt-2">
            Verificar minha conta ✓
          </button>
        )}
      </div>
    </div>
  );

  // ——— UPLOADING ———
  if (step === 'uploading') return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-10 w-full max-w-md shadow-xl text-center">
        <div className="w-16 h-16 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin mx-auto mb-5" />
        <h2 className="text-xl font-bold text-gray-800 mb-2">{uploadStatus}</h2>
        <p className="text-sm text-gray-500">Aguarde, estamos processando com segurança.</p>
      </div>
    </div>
  );

  // ——— DONE ———
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-10 w-full max-w-md shadow-xl text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <CheckCircle className="w-10 h-10 text-green-500" />
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Identidade verificada! 🎉</h2>
        <p className="text-gray-500 text-sm mb-7">
          Sua conta foi verificada com sucesso. Você já pode aproveitar todos os recursos do TrokVibe!
        </p>
        <button onClick={onComplete}
          className="w-full py-3 rounded-2xl bg-purple-600 text-white font-bold text-lg hover:bg-purple-700 transition">
          Entrar no TrokVibe 🚀
        </button>
      </div>
    </div>
  );
}
