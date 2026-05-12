import { useEffect, useState } from 'react';
import { Star, MessageCircle } from 'lucide-react';
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
    titleHighlight: 'trocadores',
    title2: 'dizem',
    subtitle: 'Avaliações reais de quem usa o Trok Vibe',
    emptyTitle: 'Em breve, as primeiras avaliações',
    emptyText: 'Estamos começando! Assim que os primeiros usuários avaliarem o Trok Vibe, os comentários aparecerão aqui em tempo real.',
  },
  en: {
    title1: 'What our',
    titleHighlight: 'swappers',
    title2: 'are saying',
    subtitle: 'Real reviews from Trok Vibe users',
    emptyTitle: 'First reviews coming soon',
    emptyText: 'We are just getting started! As soon as the first users rate Trok Vibe, their reviews will show up here in real time.',
  },
  es: {
    title1: 'Lo que dicen nuestros',
    titleHighlight: 'trocadores',
    title2: '',
    subtitle: 'Reseñas reales de quienes usan Trok Vibe',
    emptyTitle: 'Próximamente, las primeras reseñas',
    emptyText: '¡Estamos empezando! Tan pronto como los primeros usuarios califiquen Trok Vibe, sus comentarios aparecerán aquí en tiempo real.',
  },
};

export function SocialProof() {
  const { lang } = useLang();
  const T = T_SP[lang] ?? T_SP.pt;
  const [siteReviews, setSiteReviews] = useState<SiteReview[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('avaliacoes_site')
          .select('*')
          .not('comentario', 'is', null)
          .order('created_at', { ascending: false })
          .limit(9);
        if (!cancelled && data) setSiteReviews(data as SiteReview[]);
      } catch { /* tabela pode não existir ainda */ }
    })();
    const ch = supabase
      .channel('avaliacoes-site-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'avaliacoes_site' }, (payload) => {
        const r = payload.new as SiteReview;
        if (r?.comentario) setSiteReviews(prev => [r, ...prev].slice(0, 9));
      })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, []);

  const hasReviews = siteReviews.length > 0;
  const avgStars = hasReviews
    ? siteReviews.reduce((s, r) => s + (r.estrelas || 0), 0) / siteReviews.length
    : 0;

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
                    <div
                      className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-600 to-pink-500 flex items-center justify-center font-bold text-sm select-none"
                      style={{
                        color: 'transparent',
                        textShadow: '0 0 10px rgba(255,255,255,0.95)',
                      }}
                    >
                      {r.username.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p
                        className="font-bold select-none"
                        style={{
                          color: 'transparent',
                          textShadow: '0 0 8px rgba(31,41,55,0.85)',
                        }}
                        aria-label="Nome oculto para privacidade"
                      >
                        @{r.username}
                      </p>
                      <p className="text-xs text-purple-500 font-semibold">✓ Usuário verificado</p>
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
