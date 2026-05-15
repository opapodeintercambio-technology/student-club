import { useState, useEffect } from 'react';
import { UserPlus, Check, X, Heart } from 'lucide-react';
import {
  getPendingRequests,
  acceptFriendRequest,
  rejectFriendRequest,
  type FriendRequest,
} from './friends';

interface Props {
  currentUser: string;
}

export function NotificationsTab({ currentUser }: Props) {
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const reload = async () => {
    if (!currentUser) return;
    setLoading(true);
    const list = await getPendingRequests(currentUser);
    setRequests(list);
    setLoading(false);
  };

  useEffect(() => {
    reload();
    const sync = () => reload();
    window.addEventListener('papo-friends-updated', sync);
    // Polling leve a cada 30s pra pegar novos pedidos
    const id = window.setInterval(reload, 30_000);
    return () => {
      window.removeEventListener('papo-friends-updated', sync);
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  async function accept(req: FriendRequest) {
    setProcessing(req.id);
    await acceptFriendRequest(req, currentUser);
    setRequests(rs => rs.filter(r => r.id !== req.id));
    setProcessing(null);
    window.dispatchEvent(new CustomEvent('papo-friends-updated'));
  }

  async function reject(req: FriendRequest) {
    setProcessing(req.id);
    await rejectFriendRequest(req, currentUser);
    setRequests(rs => rs.filter(r => r.id !== req.id));
    setProcessing(null);
  }

  return (
    <div className="max-w-2xl mx-auto px-3 sm:px-4 py-4">
      <h1
        className="text-2xl font-bold text-stone-800 mb-1 flex items-center gap-2"
        style={{ fontFamily: '"Source Serif 4", Georgia, serif', letterSpacing: '0.04em' }}
      >
        <Heart className="w-6 h-6" style={{ color: '#5a7a52', fill: '#5a7a52' }} />
        Notificações
      </h1>
      <p className="text-sm text-stone-500 mb-5">
        Pedidos de amizade, alertas da Papo de Alunos e atualizações da sua jornada.
      </p>

      {/* Bloco de pedidos */}
      <section className="mb-5">
        <h2
          className="text-xs font-bold uppercase mb-2"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif', color: '#5a7a52', letterSpacing: '0.18em' }}
        >
          Pedidos de amizade
        </h2>

        {loading ? (
          <p className="text-sm text-stone-400 py-6 text-center">carregando…</p>
        ) : requests.length === 0 ? (
          <div
            className="rounded-lg py-8 text-center"
            style={{ background: '#fafaf9', border: '1px dashed #d6d3d1', color: '#a8a29e' }}
          >
            <UserPlus className="w-7 h-7 mx-auto mb-2 text-stone-400" />
            <p className="text-sm">Nenhum pedido pendente.</p>
            <p className="text-xs mt-1">Quando alguém te pedir amizade, aparece aqui.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {requests.map(r => (
              <RequestRow
                key={r.id}
                req={r}
                busy={processing === r.id}
                onAccept={() => accept(r)}
                onReject={() => reject(r)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function RequestRow({
  req, busy, onAccept, onReject,
}: { req: FriendRequest; busy: boolean; onAccept: () => void; onReject: () => void }) {
  return (
    <div
      className="rounded-lg p-3 flex items-center gap-3"
      style={{ background: '#ffffff', border: '1px solid #d6d3d1' }}
    >
      <div className="relative flex-shrink-0">
        {req.from_foto_perfil ? (
          <img
            src={req.from_foto_perfil}
            alt={req.from_user}
            className="w-12 h-12 rounded-full object-cover"
          />
        ) : (
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-white text-sm font-bold"
            style={{ background: 'linear-gradient(135deg, #5a7a52 0%, #b8896a 100%)' }}
          >
            {req.from_user.slice(0, 2).toUpperCase()}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-stone-800 truncate" style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>
          {req.from_nome || `@${req.from_user}`}
        </p>
        <p className="text-xs text-stone-500 truncate">
          {req.from_nome ? `@${req.from_user}` : (req.from_email || 'quer ser seu amigo')}
        </p>
        <p className="text-[10px] text-stone-400 mt-0.5">
          {timeAgo(req.created_at)}
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-1.5 flex-shrink-0">
        <button
          onClick={onAccept}
          disabled={busy}
          className="px-3 py-1.5 rounded-full text-xs font-bold inline-flex items-center gap-1 disabled:opacity-50"
          style={{
            background: 'linear-gradient(135deg, #5a7a52 0%, #b8896a 100%)',
            color: '#fff',
            fontFamily: '"Source Serif 4", Georgia, serif',
            letterSpacing: '0.10em',
          }}
        >
          <Check className="w-3 h-3" /> Aceitar
        </button>
        <button
          onClick={onReject}
          disabled={busy}
          className="px-3 py-1.5 rounded-full text-xs font-bold inline-flex items-center gap-1 disabled:opacity-50"
          style={{
            background: '#fff',
            color: '#dc2626',
            border: '1px solid #fca5a5',
            fontFamily: '"Source Serif 4", Georgia, serif',
            letterSpacing: '0.10em',
          }}
        >
          <X className="w-3 h-3" /> Rejeitar
        </button>
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}
