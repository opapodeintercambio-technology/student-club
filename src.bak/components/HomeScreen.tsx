import { useState } from 'react';
import { Search, Bell, Filter } from 'lucide-react';
import ProductCard from './ProductCard';
import { mockProducts, currentUser } from '../data/mockData';
import type { Product } from '../types';

const categories = ['Todos', 'Eletrônicos', 'Serviços', 'Esportes', 'Moda', 'Casa'];

interface HomeScreenProps {
  onChat: () => void;
}

export default function HomeScreen({ onChat }: HomeScreenProps) {
  const [activeCategory, setActiveCategory] = useState('Todos');
  const [search, setSearch] = useState('');

  const filtered = mockProducts.filter((p: Product) => {
    const matchCat = activeCategory === 'Todos' || p.category === activeCategory;
    const matchSearch = p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div style={{ paddingBottom: '90px' }}>
      {/* Header */}
      <div style={{
        padding: '52px 20px 16px',
        background: 'linear-gradient(180deg, #0f0f0f 0%, #0f0f0f 100%)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <p style={{ color: '#a0a0a0', fontSize: '13px' }}>Olá, {currentUser.name.split(' ')[0]} 👋</p>
            <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#fff' }}>Explorar trocas</h1>
          </div>
          <button style={{
            width: '40px', height: '40px', borderRadius: '12px',
            background: '#1a1a1a', border: '1px solid #2a2a2a',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
          }}>
            <Bell size={18} color="#a0a0a0" />
          </button>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: '14px' }}>
          <Search size={16} color="#555" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar produtos e serviços..."
            style={{
              width: '100%', padding: '12px 14px 12px 40px',
              background: '#1a1a1a', border: '1px solid #2a2a2a',
              borderRadius: '12px', color: '#fff', fontSize: '14px', outline: 'none',
            }}
          />
          <button style={{
            position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
            background: '#2a2a2a', border: 'none', borderRadius: '8px',
            padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
          }}>
            <Filter size={13} color="#a0a0a0" />
          </button>
        </div>

        {/* Categories */}
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}
          className="scrollbar-hide">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              style={{
                padding: '7px 14px', borderRadius: '20px', border: 'none', cursor: 'pointer',
                whiteSpace: 'nowrap', fontSize: '13px', fontWeight: '600', transition: 'all 0.2s',
                background: activeCategory === cat ? '#00c896' : '#1a1a1a',
                color: activeCategory === cat ? '#000' : '#a0a0a0',
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Products */}
      <div style={{ padding: '16px 20px 0' }}>
        <p style={{ color: '#a0a0a0', fontSize: '13px', marginBottom: '16px' }}>
          {filtered.length} {filtered.length === 1 ? 'resultado' : 'resultados'}
        </p>
        {filtered.map(product => (
          <ProductCard key={product.id} product={product} onChat={onChat} />
        ))}
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#555' }}>
            <p style={{ fontSize: '40px', marginBottom: '12px' }}>🔍</p>
            <p>Nenhum resultado encontrado</p>
          </div>
        )}
      </div>
    </div>
  );
}
