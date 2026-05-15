import { useEffect, useState } from 'react';
import { X, Flag, Ban, GraduationCap, UserCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ReportModal } from './ReportModal';
import { getStudentProfile, fetchStudentProfile, type StudentProfile } from './studentProfile';
import { getOrigem, getDestino, findCountry } from './countries';
import { fetchFriendCountRemote, fetchFollowersCountRemote } from './friends';

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
  const [loading, setLoading] = useState(true);
  const [postsCount, setPostsCount] = useState<number>(0);
  const [friendsCount, setFriendsCount] = useState<number>(0);
  const [followingCount, setFollowingCount] = useState<number>(0);
  const [student, setStudent] = useState<StudentProfile>(() => getStudentProfile(username));
  const origem = findCountry(getOrigem(username));
  const destino = findCountry(getDestino(username));

  const [bg, fg] = avatarColor(username);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [userRes, postsRes, profile, friends, followers] = await Promise.all([
          supabase.from('usuarios').select('foto_perfil').eq('username', username).maybeSingle(),
          supabase.from('feed_posts').select('id', { count: 'exact', head: true }).eq('username', username),
          fetchStudentProfile(username),
          fetchFriendCountRemote(username),
          fetchFollowersCountRemote(username),
        ]);
        if (!cancelled) {
          if (userRes.data) setFotoPerfil(userRes.data.foto_perfil ?? null);
          setPostsCount(postsRes.count ?? 0);
          setStudent(profile);
          setFriendsCount(friends);
          setFollowingCount(followers);
        }
      } catch {}
      finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [username]);

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
              <div className="text-sm text-stone-500 mt-1 flex items-center justify-center gap-1">
                <span className="text-base">{origem.flag}</span>
                <span className="text-xs">→</span>
                <span className="text-base">{destino.flag}</span>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8 text-gray-400 text-sm">Carregando…</div>
          ) : (
            <>
              {/* Stats estilo Instagram: Posts | Seguidores | Amigos */}
              <div className="grid grid-cols-3 bg-stone-50 rounded-2xl py-3">
                <div className="flex flex-col items-center">
                  <span className="text-xl font-extrabold text-stone-800 leading-none">{postsCount}</span>
                  <span className="text-[11px] text-stone-500 mt-1">Posts</span>
                </div>
                <div className="flex flex-col items-center border-x border-stone-200">
                  <span className="text-xl font-extrabold text-stone-800 leading-none">{followingCount}</span>
                  <span className="text-[11px] text-stone-500 mt-1">Seguidores</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-xl font-extrabold text-stone-800 leading-none">{friendsCount}</span>
                  <span className="text-[11px] text-stone-500 mt-1">Amigos</span>
                </div>
              </div>

              {/* Stats: compras Papo Store + cursos de intercâmbio */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-stone-50 rounded-2xl p-3 text-center">
                  <span className="text-xl block mb-0.5">🛍️</span>
                  <p className="text-2xl font-bold text-stone-800">{student.comprasStore}</p>
                  <p className="text-[11px] text-stone-500 font-medium leading-tight">Compras na Papo Store</p>
                </div>
                <div className="bg-stone-50 rounded-2xl p-3 text-center">
                  <span className="text-xl block mb-0.5">🎓</span>
                  <p className="text-2xl font-bold text-stone-800">{student.cursosIntercambio}</p>
                  <p className="text-[11px] text-stone-500 font-medium leading-tight">Cursos de intercâmbio</p>
                </div>
              </div>

              {/* Escola + Consultor */}
              <div className="space-y-2">
                <div className="bg-white rounded-2xl px-4 py-3 border border-stone-200 flex items-start gap-3">
                  <GraduationCap className="w-5 h-5 text-stone-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">Escola</p>
                    <p className="text-sm font-semibold text-stone-800 truncate">{student.escola || '—'}</p>
                  </div>
                </div>
                <div className="bg-white rounded-2xl px-4 py-3 border border-stone-200 flex items-start gap-3">
                  <UserCircle2 className="w-5 h-5 text-stone-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">Consultor</p>
                    <p className="text-sm font-semibold text-stone-800 truncate">{student.consultor || '—'}</p>
                  </div>
                </div>
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
