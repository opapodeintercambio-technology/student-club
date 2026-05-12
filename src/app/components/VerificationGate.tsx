import { ShieldCheck, Lock, Camera } from 'lucide-react';

interface VerificationGateProps {
  reason: 'publish' | 'username';
  onVerify: () => void;
}

export function VerificationGate({ reason, onVerify }: VerificationGateProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl text-center">
        <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Lock className="w-8 h-8 text-purple-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Verificação necessária</h2>
        <p className="text-gray-500 text-sm mb-6">
          {reason === 'publish'
            ? 'Para publicar anúncios e interagir com outros trocadores, você precisa verificar sua identidade.'
            : 'Para ver os perfis de outros usuários, você precisa verificar sua identidade.'}
        </p>
        <div className="space-y-2 text-left mb-6">
          {[
            { icon: Camera, text: 'Selfie rápida ao vivo — só isso!' },
            { icon: ShieldCheck, text: 'Verificação instantânea, dados protegidos' },
          ].map(({ icon: Icon, text }, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-gray-600">
              <Icon className="w-4 h-4 text-purple-500 flex-shrink-0" />
              {text}
            </div>
          ))}
        </div>
        <button
          onClick={onVerify}
          className="w-full py-3 rounded-2xl bg-purple-600 text-white font-bold hover:bg-purple-700 transition-colors"
        >
          Verificar agora
        </button>
      </div>
    </div>
  );
}
