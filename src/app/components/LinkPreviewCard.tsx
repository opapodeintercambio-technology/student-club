// Card de preview de link no chat (estilo WhatsApp/Instagram).
// Mostra thumbnail + titulo + descricao + dominio. Click abre o link
// numa nova aba.
//
// Estado de loading: enquanto fetchLinkPreview busca, renderiza um
// skeleton minimo. Se falhar (preview = null), nao renderiza nada (o
// proprio texto da mensagem ja contem o link, entao basta).
import { useEffect, useState } from 'react';
import { fetchLinkPreview, type LinkPreview } from '../utils/linkPreview';

interface Props {
  url: string;
  isMine: boolean;
}

export function LinkPreviewCard({ url, isMine }: Props) {
  const [data, setData] = useState<LinkPreview | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetchLinkPreview(url).then(d => { if (!cancelled) setData(d); });
    return () => { cancelled = true; };
  }, [url]);

  // Erro/sem preview: nao renderiza nada (texto da msg ja mostra o link)
  if (data === null) return null;

  // Loading: skeleton bem discreto
  if (data === undefined) {
    return (
      <div
        className="overflow-hidden rounded-none mt-1.5"
        style={{
          maxWidth: 260,
          background: isMine ? 'rgba(255,255,255,0.10)' : 'var(--sc-bg-card)',
          border: '1px solid rgba(0,0,0,0.08)',
        }}
      >
        <div style={{ width: '100%', aspectRatio: '1.91 / 1', background: 'rgba(0,0,0,0.06)' }} />
        <div className="px-2.5 py-2">
          <div style={{ width: '70%', height: 10, background: 'rgba(0,0,0,0.08)', borderRadius: 4 }} />
          <div style={{ width: '40%', height: 8, background: 'rgba(0,0,0,0.06)', borderRadius: 4, marginTop: 6 }} />
        </div>
      </div>
    );
  }

  // Sem imagem nem titulo? nao renderiza (preview pobre demais).
  if (!data.image && !data.title) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="block overflow-hidden rounded-none mt-1.5 active:scale-[0.99] transition-transform no-underline"
      style={{
        maxWidth: 260,
        background: isMine ? 'rgba(255,255,255,0.10)' : 'var(--sc-bg-card)',
        border: '1px solid rgba(0,0,0,0.08)',
      }}
    >
      {data.image && (
        <div
          style={{
            width: '100%',
            aspectRatio: '1.91 / 1', // Open Graph padrao (1200x630)
            background: `#000 url(${data.image}) center/cover no-repeat`,
          }}
        />
      )}
      <div className="px-2.5 py-2">
        {data.siteName && (
          <p
            className="text-[10px] font-semibold uppercase tracking-wide truncate"
            style={{ color: isMine ? 'rgba(255,255,255,0.6)' : 'var(--sc-text-secondary)' }}
          >
            {data.siteName}
          </p>
        )}
        {data.title && (
          <p
            className="text-[12px] font-semibold mt-0.5"
            style={{
              color: isMine ? '#fff' : 'var(--sc-text-primary)',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {data.title}
          </p>
        )}
        {data.description && (
          <p
            className="text-[11px] mt-1"
            style={{
              color: isMine ? 'rgba(255,255,255,0.75)' : 'var(--sc-text-secondary)',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {data.description}
          </p>
        )}
      </div>
    </a>
  );
}
