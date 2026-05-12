import { useEffect, useState } from 'react';
import { X, Star, ArrowRightLeft, Gift, HeartHandshake, Flag, Ban } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ReportModal } from './ReportModal';

interface Review {
  id: string;
  avaliador_username: string;
  estrelas: number;
  comentario: string | null;
  created_at: string;
}

interface UserProfileModalProps {
  username: string;
  currentUser?: string;
  onClose: () => void;
  onBlocked?: () => void;
}

function avatarColor(username: string): [string, string] {
  const COLORS: [string, string][] = [
    ['#7c3aed', '#ede9fe'], ['#f97316', '#fff7ed'], ['#ec4899', '#fdf2f8'],
    ['#10b981', '#ecfdf5'], ['#3b82f6', '#eff6ff'], ['#f59e0b', '#fffbeb'],
    ['#06b6d4', '#ecfeff'], ['#8b5cf6', '#f5f3ff'],
  ];
  let h = 0;
  for (let i = 0; i < username.length; i++) h = (h * 31 + username.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function UserProfileModal({ username, currentUser, onClose, onBlocked }: UserProfileModalProps) {
  const [showReport, setShowReport] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const isOwnProfile = currentUser === username;

  const handleBlock = async () => {
    if (!currentUser) return;
    setBlocking(true);
    try {
      await supabase.from('usuarios_bloqueados').insert({
        bloqueador: currentUser,
        bloqueado: username,
      });
      onBlocked?.();
      onClose();
    } catch {
      // Pode já existir; silencia
      onBlocked?.();
      onClose();
    } finally {
      setBlocking(false);
    }
  };

  const [fotoPerfil, setFotoPerfil] = useState<string | null>(null);
  const [scoreMedio, setScoreMedio] = useState(0);
  const [totalAvaliacoes, setTotalAvaliacoes] = useState(0);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [trocas, setTrocas] = useState(0);
  const [doacoesFeitas, setDoacoesFeitas] = useState(0);
  const [doacoesRecebidas, setDoacoesRecebidas] = useState(0);
  const [amostrasDadas, setAmostrasDadas] = useState(0);
  const [amostrasRecebidas, setAmostrasRecebidas] = useState(0);
  const [loading, setLoading] = useState(true);

  const [bg, fg] = avatarColor(username);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [usuarioRes, avalsRes, transacoesRes] = await Promise.all([
          supabase
            .from('usuarios')
            .select('foto_perfil, score_medio, total_avaliacoes')
            .eq('username', username)
            .maybeSingle(),
          supabase
            .from('avaliacoes')
            .select('id, avaliador_username, estrelas, comentario, created_at')
            .eq('avaliado_username', username)
            .order('created_at', { ascending: false })
            .limit(20),
          supabase
            .from('transacoes')
            .select('tipo, doador_username, recebedor_username, anuncio_id')
            .or(`doador_username.eq.${username},recebedor_username.eq.${username}`),
        ]);

        if (cancelled) return;

        if (usuarioRes.data) {
          setFotoPerfil(usuarioRes.data.foto_perfil ?? null);
        }
        if (avalsRes.data && avalsRes.data.length > 0) {
          const media = avalsRes.data.reduce((acc, a) => acc + a.estrelas, 0) / avalsRes.data.length;
          setScoreMedio(Math.round(media * 100) / 100);
          setTotalAvaliacoes(avalsRes.data.length);
          setReviews(avalsRes.data as Review[]);
        }
        if (transacoesRes.data) {
          const t = transacoesRes.data as any[];
          // Busca tipos dos anúncios para distinguir amostras (mesmo salvas como 'doacao')
          const anuncioIds = Array.from(new Set(t.map(x => x.anuncio_id).filter(Boolean)));
          const tipoMap: Record<string, string> = {};
          if (anuncioIds.length > 0) {
            const { data: anuncios } = await supabase
              .from('anuncios')
              .select('id,tipo')
              .in('id', anuncioIds as string[]);
            (anuncios || []).forEach((a: any) => { if (a?.id) tipoMap[a.id] = a.tipo; });
          }
          const eff = (x: any) => (x.anuncio_id && tipoMap[x.anuncio_id] === 'amostra') ? 'amostra' : x.tipo;
          setTrocas(t.filter(x => eff(x) === 'troca').length);
          setDoacoesFeitas(t.filter(x => eff(x) === 'doacao' && x.doador_username === username).length);
          setDoacoesRecebidas(t.filter(x => eff(x) === 'doacao' && x.recebedor_username === username).length);
          setAmostrasDadas(t.filter(x => eff(x) === 'amostra' && x.doador_username === username).length);
          setAmostrasRecebidas(t.filter(x => eff(x) === 'amostra' && x.recebedor_username === username).length);
        }
      } catch {
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [username]);

  const starsArr = [1, 2, 3, 4, 5];

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/60 p-4"
      style={{ zIndex: 9999 }}
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-sm max-h-[90vh] overflow-y-auto rounded-3xl shadow-2xl"
        style={{ borderRadius: 28 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-800 text-base">Perfil do usuário</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-5">
          {/* Avatar + username */}
          <div className="flex flex-col items-center gap-3">
            {fotoPerfil ? (
              <img
                src={fotoPerfil}
                alt={username}
                className="w-20 h-20 rounded-full object-cover ring-4 ring-purple-100"
              />
            ) : (
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center font-bold text-2xl ring-4 ring-purple-100"
                style={{ background: bg, color: fg }}
              >
                {username.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="text-center">
              <p className="font-bold text-gray-900 text-lg">@{username}</p>
              {scoreMedio > 0 && (
                <div className="flex items-center justify-center gap-1 mt-1">
                  <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  <span className="font-bold text-gray-700">{scoreMedio.toFixed(1)}</span>
                  <span className="text-sm text-gray-400">({totalAvaliacoes} avaliações)</span>
                </div>
              )}
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8 text-gray-400 text-sm">Carregando…</div>
          ) : (
            <>
              {/* Stats: trocas / doações feitas / doações recebidas */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-purple-50 rounded-2xl p-3 text-center">
                  <ArrowRightLeft className="w-5 h-5 text-purple-600 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-purple-700">{trocas}</p>
                  <p className="text-[11px] text-purple-500 font-medium leading-tight">Trocas</p>
                </div>
                <div className="bg-pink-50 rounded-2xl p-3 text-center">
                  <Gift className="w-5 h-5 text-pink-500 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-pink-600">{doacoesFeitas}</p>
                  <p className="text-[11px] text-pink-500 font-medium leading-tight">Doações feitas</p>
                </div>
                <div className="bg-orange-50 rounded-2xl p-3 text-center">
                  <HeartHandshake className="w-5 h-5 text-orange-500 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-orange-600">{doacoesRecebidas}</p>
                  <p className="text-[11px] text-orange-500 font-medium leading-tight">Doações recebidas</p>
                </div>
              </div>

              {/* Stats Amostras Grátis */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-emerald-50 rounded-2xl p-3 text-center">
                  <span className="text-xl block mb-0.5">🍃</span>
                  <p className="text-2xl font-bold text-emerald-700">{amostrasDadas}</p>
                  <p className="text-[11px] text-emerald-600 font-medium leading-tight">Amostras dadas</p>
                </div>
                <div className="bg-emerald-50 rounded-2xl p-3 text-center">
                  <span className="text-xl block mb-0.5">🎟️</span>
                  <p className="text-2xl font-bold text-emerald-700">{amostrasRecebidas}</p>
                  <p className="text-[11px] text-emerald-600 font-medium leading-tight">Amostras recebidas</p>
                </div>
              </div>

              {/* Stars visual */}
              {scoreMedio > 0 && (
                <div className="flex justify-center gap-1">
                  {starsArr.map(n => (
                    <Star
                      key={n}
                      className={`w-6 h-6 ${n <= Math.round(scoreMedio) ? 'fill-yellow-400 text-yellow-400' : 'fill-gray-200 text-gray-200'}`}
                    />
                  ))}
                </div>
              )}

              {/* Reviews */}
              <div>
                <h3 className="font-bold text-gray-700 text-sm mb-3">
                  Avaliações {reviews.length > 0 && <span className="text-gray-400 font-normal">({reviews.length})</span>}
                </h3>

                {reviews.length === 0 ? (
                  <div className="text-center py-6 text-gray-400 text-sm bg-gray-50 rounded-2xl">
                    Nenhuma avaliação ainda
                  </div>
                ) : (
                  <div className="space-y-3">
                    {reviews.map(r => (
                      <div key={r.id} className="bg-gray-50 rounded-2xl px-4 py-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm font-semibold text-gray-700">@{r.avaliador_username}</span>
                          <div className="flex gap-0.5">
                            {starsArr.map(n => (
                              <Star
                                key={n}
                                className={`w-3.5 h-3.5 ${n <= r.estrelas ? 'fill-yellow-400 text-yellow-400' : 'fill-gray-200 text-gray-200'}`}
                              />
                            ))}
                          </div>
                        </div>
                        {r.comentario && (
                          <p className="text-sm text-gray-600 leading-relaxed">{r.comentario}</p>
                        )}
                        <p className="text-[10px] text-gray-400 mt-1.5">
                          {new Date(r.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Botões de denunciar e bloquear (só aparecem se não for o próprio perfil) */}
              {currentUser && !isOwnProfile && (
                <div className="pt-2 border-t border-gray-100 space-y-2">
                  <button
                    onClick={() => setShowReport(true)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-orange-200 text-orange-600 font-semibold text-sm hover:bg-orange-50 transition-colors"
                  >
                    <Flag className="w-4 h-4" />
                    Denunciar usuário
                  </button>
                  <button
                    onClick={() => setConfirmBlock(true)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-red-200 text-red-600 font-semibold text-sm hover:bg-red-50 transition-colors"
                  >
                    <Ban className="w-4 h-4" />
                    Bloquear usuário
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modal de denúncia */}
      {showReport && currentUser && (
        <ReportModal
          denunciante={currentUser}
          alvoTipo="usuario"
          alvoId={username}
          alvoNome={`@${username}`}
          onClose={() => setShowReport(false)}
        />
      )}

      {/* Confirmação de bloqueio */}
      {confirmBlock && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60 p-4" onClick={() => setConfirmBlock(false)}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="w-14 h-14 mx-auto mb-3 bg-red-100 rounded-full flex items-center justify-center">
              <Ban className="w-7 h-7 text-red-600" />
            </div>
            <h3 className="text-center font-bold text-gray-800 mb-2">Bloquear @{username}?</h3>
            <p className="text-center text-sm text-gray-500 mb-5">
              Você não verá mais anúncios nem mensagens deste usuário. Ele também não poderá te contatar.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmBlock(false)}
                className="flex-1 py-3 rounded-2xl border-2 border-gray-200 text-gray-700 font-bold text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleBlock}
                disabled={blocking}
                className="flex-1 py-3 rounded-2xl bg-red-500 text-white font-bold text-sm disabled:opacity-50"
              >
                {blocking ? 'Bloqueando...' : 'Bloquear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
