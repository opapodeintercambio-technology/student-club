import { useEffect, useState } from 'react';
import { Star, MessageCircle, Send } from 'lucide-react';
import { useLang } from '../i18n';
import { supabase } from '../../lib/supabase';

interface SiteReview {
  id: string;
  username: string;
  estrelas: number;
  comentario: string | null;
  created_at: string;
}

const T_SP = {
  pt: {
    title1: 'O que nossos',
    titleHighlight: 'alunos',
    title2: 'dizem',
    subtitle: 'Avaliações reais de quem usa o Papo de Alunos',
    emptyTitle: 'Em breve, as primeiras avaliações',
    emptyText: 'Estamos começando! Assim que os primeiros alunos avaliarem o Papo de Alunos, os comentários aparecerão aqui em tempo real.',
    leaveYours: 'Deixe seu comentário',
    placeholder: 'Conte sua experiência usando o Papo de Alunos...',
    starsHint: 'Sua nota',
    submit: 'Publicar',
    sending: 'Enviando...',
    needLogin: 'Faça login para deixar seu comentário sobre o Papo de Alunos.',
    thanks: '✓ Obrigado pelo seu comentário!',
    errSend: 'Não foi possível publicar. Tente novamente.',
    errEmpty: 'Escreva um comentário antes de publicar.',
    errStars: 'Selecione de 1 a 5 estrelas.',
  },
  en: {
    title1: 'What our',
    titleHighlight: 'students',
    title2: 'are saying',
    subtitle: 'Real reviews from Papo de Alunos users',
    emptyTitle: 'First reviews coming soon',
    emptyText: 'We are just getting started! As soon as the first students rate Papo de Alunos, their reviews will show up here in real time.',
    leaveYours: 'Leave your review',
    placeholder: 'Tell us about your experience with Papo de Alunos...',
    starsHint: 'Your rating',
    submit: 'Post',
    sending: 'Sending...',
    needLogin: 'Log in to leave a review about Papo de Alunos.',
    thanks: '✓ Thanks for your feedback!',
    errSend: 'Could not post. Please try again.',
    errEmpty: 'Write a comment before posting.',
    errStars: 'Pick 1 to 5 stars.',
  },
  es: {
    title1: 'Lo que dicen nuestros',
    titleHighlight: 'alumnos',
    title2: '',
    subtitle: 'Reseñas reales de quienes usan Papo de Alunos',
    emptyTitle: 'Próximamente, las primeras reseñas',
    emptyText: '¡Estamos empezando! Tan pronto como los primeros alumnos califiquen Papo de Alunos, sus comentarios aparecerán aquí en tiempo real.',
    leaveYours: 'Deja tu reseña',
    placeholder: 'Cuéntanos tu experiencia usando Papo de Alunos...',
    starsHint: 'Tu nota',
    submit: 'Publicar',
    sending: 'Enviando...',
    needLogin: 'Inicia sesión para dejar tu reseña sobre Papo de Alunos.',
    thanks: '✓ ¡Gracias por tu comentario!',
    errSend: 'No se pudo publicar. Inténtalo de nuevo.',
    errEmpty: 'Escribe un comentario antes de publicar.',
    errStars: 'Elige de 1 a 5 estrellas.',
  },
};

interface Props {
  currentUser?: string;
}

export function SocialProof({ currentUser }: Props) {
  const { lang } = useLang();
  const T = T_SP[lang] ?? T_SP.pt;
  const [siteReviews, setSiteReviews] = useState<SiteReview[]>([]);
  const [stars, setStars] = useState(5);
  const [comentario, setComentario] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [thanks, setThanks] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('avaliacoes_site')
          .select('*')
          .not('comentario', 'is', null)
          .order('created_at', { ascending: false })
          .limit(12);
        if (!cancelled && data) setSiteReviews(data as SiteReview[]);
      } catch { /* tabela pode não existir ainda */ }
    })();
    const ch = supabase
      .channel('avaliacoes-site-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'avaliacoes_site' }, (payload) => {
        const r = payload.new as SiteReview;
        if (r?.comentario) setSiteReviews(prev => [r, ...prev.filter(x => x.id !== r.id)].slice(0, 12));
      })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, []);

  const hasReviews = siteReviews.length > 0;
  const avgStars = hasReviews
    ? siteReviews.reduce((s, r) => s + (r.estrelas || 0), 0) / siteReviews.length
    : 0;

  async function submit() {
    setError('');
    if (!currentUser) return;
    if (!stars || stars < 1 || stars > 5) { setError(T.errStars); return; }
    const text = comentario.trim();
    if (!text) { setError(T.errEmpty); return; }
    setSending(true);
    try {
      const { data, error: err } = await supabase
        .from('avaliacoes_site')
        .insert({ username: currentUser, estrelas: stars, comentario: text })
        .select('*')
        .single();
      if (err) throw err;
      if (data) {
        setSiteReviews(prev => [data as SiteReview, ...prev.filter(x => x.id !== (data as any).id)].slice(0, 12));
      }
      setComentario('');
      setStars(5);
      setThanks(true);
      setTimeout(() => setThanks(false), 3500);
    } catch (e: any) {
      console.error('[SocialProof] submit failed', e);
      setError(T.errSend + (e?.message ? ` (${e.message})` : ''));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="py-16 px-4 about-section">
      <div className="max-w-[1400px] mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-3">
            {T.title1} <span className="text-purple-600">{T.titleHighlight}</span> {T.title2}
          </h2>
          <p className="text-gray-600">{T.subtitle}</p>
          {hasReviews && (
            <div className="flex items-center justify-center gap-2 mt-3">
              {[1,2,3,4,5].map(i => (
                <Star
                  key={i}
                  className={`w-6 h-6 ${i <= Math.round(avgStars) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
                />
              ))}
              <span className="font-bold text-lg ml-2">{avgStars.toFixed(1)}/5</span>
              <span className="text-gray-500">
                ({siteReviews.length} {lang === 'en' ? 'reviews' : lang === 'es' ? 'reseñas' : 'avaliações'})
              </span>
            </div>
          )}
        </div>

        {/* Form para deixar comentário */}
        <div className="glass p-6 mb-8 max-w-2xl mx-auto" style={{borderRadius:18}}>
          <h3 className="font-bold text-gray-800 text-lg mb-3 flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-purple-600" />
            {T.leaveYours}
          </h3>

          {currentUser ? (
            <>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{T.starsHint}:</span>
                <div className="flex gap-1">
                  {[1,2,3,4,5].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setStars(n)}
                      className="hover:scale-110 transition-transform"
                      aria-label={`${n} stars`}
                    >
                      <Star className={`w-6 h-6 ${n <= stars ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} />
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                value={comentario}
                onChange={e => { setComentario(e.target.value); setError(''); }}
                placeholder={T.placeholder}
                rows={3}
                maxLength={500}
                className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-2xl text-sm outline-none focus:border-purple-500 transition-colors bg-white resize-none"
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-gray-400">{comentario.length}/500</span>
                <button
                  type="button"
                  onClick={submit}
                  disabled={sending || !comentario.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm disabled:opacity-50 transition-colors"
                >
                  <Send className="w-4 h-4" />
                  {sending ? T.sending : T.submit}
                </button>
              </div>
              {error && <p className="text-xs text-red-500 mt-2">⚠️ {error}</p>}
              {thanks && <p className="text-xs text-green-600 mt-2 font-semibold">{T.thanks}</p>}
            </>
          ) : (
            <p className="text-sm text-gray-500 italic">{T.needLogin}</p>
          )}
        </div>

        {hasReviews ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {siteReviews.map((r) => {
              const dt = new Date(r.created_at);
              const dateStr = dt.toLocaleDateString(lang === 'en' ? 'en-US' : lang === 'es' ? 'es-ES' : 'pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
              });
              const timeStr = dt.toLocaleTimeString(lang === 'en' ? 'en-US' : lang === 'es' ? 'es-ES' : 'pt-BR', {
                hour: '2-digit', minute: '2-digit',
              });
              return (
                <div key={r.id} className="glass p-6 hover:scale-[1.01] transition-all border-2 border-purple-300" style={{borderRadius:18}}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-600 to-pink-500 flex items-center justify-center font-bold text-sm text-white">
                      {r.username.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-gray-800">@{r.username}</p>
                      <p className="text-xs text-purple-500 font-semibold">✓ Aluno verificado</p>
                    </div>
                    <div className="ml-auto flex gap-0.5">
                      {[...Array(r.estrelas)].map((_, i) => (
                        <Star key={i} className="w-4 h-4 fill-purple-500 text-purple-500" />
                      ))}
                    </div>
                  </div>
                  <p className="text-gray-700 leading-relaxed mb-3">"{r.comentario}"</p>
                  <p className="text-xs text-gray-400 font-medium">{dateStr} · {timeStr}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="glass p-10 text-center max-w-2xl mx-auto" style={{borderRadius:18}}>
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-600 to-pink-500 text-white flex items-center justify-center mx-auto mb-4">
              <MessageCircle className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">{T.emptyTitle}</h3>
            <p className="text-gray-600 leading-relaxed">{T.emptyText}</p>
          </div>
        )}
      </div>
    </section>
  );
}
