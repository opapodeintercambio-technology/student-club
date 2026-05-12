import { useState } from 'react';
import { Camera, ChevronDown, CheckCircle } from 'lucide-react';

const categories = ['Eletrônicos', 'Serviços', 'Esportes', 'Moda', 'Casa', 'Outros'];

export default function CreateProduct() {
  const [type, setType] = useState<'product' | 'service'>('product');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [wantedFor, setWantedFor] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !description || !category || !wantedFor) return;
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setTitle(''); setDescription(''); setCategory(''); setWantedFor('');
    }, 3000);
  };

  if (submitted) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center'
      }}>
        <div style={{
          width: '80px', height: '80px', borderRadius: '50%',
          background: '#00c89622', border: '2px solid #00c896',
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px'
        }}>
          <CheckCircle size={36} color="#00c896" />
        </div>
        <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#fff', marginBottom: '8px' }}>
          Oferta publicada!
        </h2>
        <p style={{ color: '#a0a0a0', fontSize: '15px' }}>
          Sua oferta foi publicada com sucesso. Agora é só aguardar propostas!
        </p>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: '90px' }}>
      {/* Header */}
      <div style={{ padding: '52px 20px 20px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#fff', marginBottom: '4px' }}>
          Criar oferta
        </h1>
        <p style={{ color: '#a0a0a0', fontSize: '14px' }}>O que você quer trocar?</p>
      </div>

      <form onSubmit={handleSubmit} style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Type toggle */}
        <div>
          <label style={{ display: 'block', color: '#a0a0a0', fontSize: '13px', marginBottom: '8px' }}>Tipo de oferta</label>
          <div style={{ display: 'flex', background: '#1a1a1a', borderRadius: '12px', padding: '4px' }}>
            {[{ val: 'product', label: '📦 Produto' }, { val: 'service', label: '🎯 Serviço' }].map(opt => (
              <button
                key={opt.val}
                type="button"
                onClick={() => setType(opt.val as 'product' | 'service')}
                style={{
                  flex: 1, padding: '10px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                  fontWeight: '600', fontSize: '14px', transition: 'all 0.2s',
                  background: type === opt.val ? '#00c896' : 'transparent',
                  color: type === opt.val ? '#000' : '#a0a0a0',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Image upload */}
        <div>
          <label style={{ display: 'block', color: '#a0a0a0', fontSize: '13px', marginBottom: '8px' }}>
            {type === 'product' ? 'Fotos do produto' : 'Imagem de capa'}
          </label>
          <div style={{
            height: '140px', background: '#1a1a1a', border: '2px dashed #2a2a2a',
            borderRadius: '16px', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer'
          }}>
            <div style={{
              width: '44px', height: '44px', background: '#2a2a2a', borderRadius: '12px',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Camera size={20} color="#a0a0a0" />
            </div>
            <p style={{ color: '#555', fontSize: '13px' }}>Toque para adicionar fotos</p>
          </div>
        </div>

        {/* Title */}
        <div>
          <label style={{ display: 'block', color: '#a0a0a0', fontSize: '13px', marginBottom: '8px' }}>
            {type === 'product' ? 'Nome do produto' : 'Nome do serviço'}
          </label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={type === 'product' ? 'Ex: iPhone 14 Pro 256GB' : 'Ex: Aulas de inglês'}
            style={{
              width: '100%', padding: '14px 16px', borderRadius: '12px',
              background: '#1a1a1a', border: '1px solid #2a2a2a',
              color: '#fff', fontSize: '15px', outline: 'none',
            }}
          />
        </div>

        {/* Description */}
        <div>
          <label style={{ display: 'block', color: '#a0a0a0', fontSize: '13px', marginBottom: '8px' }}>Descrição</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Descreva detalhes, estado de conservação, condições..."
            rows={4}
            style={{
              width: '100%', padding: '14px 16px', borderRadius: '12px',
              background: '#1a1a1a', border: '1px solid #2a2a2a',
              color: '#fff', fontSize: '15px', outline: 'none',
              resize: 'none', fontFamily: 'inherit',
            }}
          />
        </div>

        {/* Category */}
        <div>
          <label style={{ display: 'block', color: '#a0a0a0', fontSize: '13px', marginBottom: '8px' }}>Categoria</label>
          <div style={{ position: 'relative' }}>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              style={{
                width: '100%', padding: '14px 40px 14px 16px', borderRadius: '12px',
                background: '#1a1a1a', border: '1px solid #2a2a2a',
                color: category ? '#fff' : '#555', fontSize: '15px', outline: 'none',
                appearance: 'none', cursor: 'pointer',
              }}
            >
              <option value="" disabled>Selecione uma categoria</option>
              {categories.map(c => <option key={c} value={c} style={{ background: '#1a1a1a' }}>{c}</option>)}
            </select>
            <ChevronDown size={16} color="#555" style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          </div>
        </div>

        {/* Wanted */}
        <div>
          <label style={{ display: 'block', color: '#a0a0a0', fontSize: '13px', marginBottom: '8px' }}>O que você quer em troca?</label>
          <input
            value={wantedFor}
            onChange={e => setWantedFor(e.target.value)}
            placeholder="Ex: Notebook, serviços de design, etc."
            style={{
              width: '100%', padding: '14px 16px', borderRadius: '12px',
              background: '#1a1a1a', border: '1px solid #2a2a2a',
              color: '#fff', fontSize: '15px', outline: 'none',
            }}
          />
        </div>

        <button
          type="submit"
          style={{
            padding: '16px', borderRadius: '14px', border: 'none', cursor: 'pointer',
            background: title && description && category && wantedFor
              ? 'linear-gradient(135deg, #00c896, #007a5e)'
              : '#1a1a1a',
            color: title && description && category && wantedFor ? '#000' : '#555',
            fontWeight: '700', fontSize: '16px', transition: 'all 0.2s',
          }}
        >
          Publicar oferta
        </button>
      </form>
    </div>
  );
}
