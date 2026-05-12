import { MapPin, Star, ArrowLeftRight, Clock } from 'lucide-react';
import type { Product } from '../types';

const categoryColors: Record<string, string> = {
  'Eletrônicos': '#3b82f6',
  'Serviços': '#8b5cf6',
  'Esportes': '#f59e0b',
  'Moda': '#ec4899',
  'Casa': '#10b981',
  'Outros': '#6b7280',
};

const categoryEmojis: Record<string, string> = {
  'Eletrônicos': '💻',
  'Serviços': '🎯',
  'Esportes': '🏋️',
  'Moda': '👗',
  'Casa': '🏠',
  'Outros': '📦',
};

interface ProductCardProps {
  product: Product;
  onChat?: () => void;
}

export default function ProductCard({ product, onChat }: ProductCardProps) {
  const catColor = categoryColors[product.category] || '#6b7280';
  const catEmoji = categoryEmojis[product.category] || '📦';

  return (
    <div style={{
      background: '#1a1a1a', borderRadius: '20px', overflow: 'hidden',
      border: '1px solid #2a2a2a', marginBottom: '16px',
    }}>
      {/* Image area */}
      <div style={{
        height: '180px',
        background: `linear-gradient(135deg, ${catColor}22, ${catColor}11)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '64px', position: 'relative',
      }}>
        <span>{catEmoji}</span>
        <div style={{
          position: 'absolute', top: '12px', left: '12px',
          background: catColor + '33', border: `1px solid ${catColor}55`,
          borderRadius: '8px', padding: '4px 10px',
          fontSize: '12px', fontWeight: '600', color: catColor,
        }}>
          {product.category}
        </div>
        <div style={{
          position: 'absolute', top: '12px', right: '12px',
          background: product.type === 'service' ? '#8b5cf633' : '#00c89633',
          border: `1px solid ${product.type === 'service' ? '#8b5cf655' : '#00c89655'}`,
          borderRadius: '8px', padding: '4px 10px',
          fontSize: '11px', fontWeight: '600',
          color: product.type === 'service' ? '#8b5cf6' : '#00c896',
        }}>
          {product.type === 'service' ? 'Serviço' : 'Produto'}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '16px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#fff', marginBottom: '6px' }}>
          {product.title}
        </h3>
        <p style={{ color: '#a0a0a0', fontSize: '13px', lineHeight: '1.5', marginBottom: '14px' }}>
          {product.description}
        </p>

        {/* Wants */}
        <div style={{
          background: '#00c89611', border: '1px solid #00c89633',
          borderRadius: '10px', padding: '10px 14px', marginBottom: '14px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ArrowLeftRight size={13} color="#00c896" />
            <span style={{ fontSize: '11px', color: '#00c896', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Quer em troca
            </span>
          </div>
          <p style={{ color: '#fff', fontSize: '13px', marginTop: '4px' }}>{product.wantedFor}</p>
        </div>

        {/* Owner + Actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #00c896, #007a5e)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '13px', fontWeight: '700', color: '#000',
            }}>
              {product.owner.avatar}
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#fff' }}>{product.owner.name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <Star size={11} color="#f59e0b" fill="#f59e0b" />
                  <span style={{ fontSize: '11px', color: '#a0a0a0' }}>{product.owner.rating}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <MapPin size={11} color="#a0a0a0" />
                  <span style={{ fontSize: '11px', color: '#a0a0a0' }}>{product.owner.location.split(',')[0]}</span>
                </div>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#555', fontSize: '11px' }}>
              <Clock size={11} />
              <span>{product.postedAt}</span>
            </div>
            <button
              onClick={onChat}
              style={{
                padding: '8px 16px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                background: '#00c896', color: '#000', fontWeight: '700', fontSize: '13px',
              }}
            >
              Propor
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
