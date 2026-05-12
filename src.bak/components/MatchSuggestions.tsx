import { Star, Zap, ArrowLeftRight, MapPin } from 'lucide-react';
import { mockMatches } from '../data/mockData';
import type { Match } from '../types';

interface MatchSuggestionsProps {
  onChat: () => void;
}

function MatchCard({ match, onChat }: { match: Match; onChat: () => void }) {
  const score = match.compatibilityScore;
  const scoreColor = score >= 90 ? '#00c896' : score >= 75 ? '#f59e0b' : '#6b7280';

  return (
    <div style={{
      background: '#1a1a1a', borderRadius: '20px', border: '1px solid #2a2a2a',
      marginBottom: '16px', overflow: 'hidden',
    }}>
      {/* Score banner */}
      <div style={{
        background: `${scoreColor}15`, borderBottom: `1px solid ${scoreColor}30`,
        padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '8px'
      }}>
        <Zap size={14} color={scoreColor} fill={scoreColor} />
        <span style={{ color: scoreColor, fontWeight: '700', fontSize: '13px' }}>
          {score}% compatível
        </span>
        <div style={{ flex: 1, height: '4px', background: '#2a2a2a', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{ width: `${score}%`, height: '100%', background: scoreColor, borderRadius: '4px' }} />
        </div>
      </div>

      <div style={{ padding: '16px' }}>
        {/* Trade visualization */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          {/* My offer */}
          <div style={{
            flex: 1, background: '#0f0f0f', borderRadius: '14px', padding: '12px',
            border: '1px solid #2a2a2a'
          }}>
            <p style={{ color: '#00c896', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', marginBottom: '4px' }}>
              Minha oferta
            </p>
            <p style={{ color: '#fff', fontSize: '13px', fontWeight: '600', lineHeight: '1.3' }}>
              {match.matchedWith.title}
            </p>
            <p style={{ color: '#555', fontSize: '11px', marginTop: '4px' }}>{match.matchedWith.category}</p>
          </div>

          {/* Arrow */}
          <div style={{
            width: '36px', height: '36px', borderRadius: '50%',
            background: '#00c89622', border: '1px solid #00c89644',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
          }}>
            <ArrowLeftRight size={14} color="#00c896" />
          </div>

          {/* Their offer */}
          <div style={{
            flex: 1, background: '#0f0f0f', borderRadius: '14px', padding: '12px',
            border: '1px solid #2a2a2a'
          }}>
            <p style={{ color: '#a0a0a0', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', marginBottom: '4px' }}>
              Oferta deles
            </p>
            <p style={{ color: '#fff', fontSize: '13px', fontWeight: '600', lineHeight: '1.3' }}>
              {match.product.title}
            </p>
            <p style={{ color: '#555', fontSize: '11px', marginTop: '4px' }}>{match.product.category}</p>
          </div>
        </div>

        {/* Owner info */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '38px', height: '38px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '13px', fontWeight: '700', color: '#fff',
            }}>
              {match.product.owner.avatar}
            </div>
            <div>
              <p style={{ color: '#fff', fontSize: '13px', fontWeight: '600' }}>{match.product.owner.name}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <Star size={11} color="#f59e0b" fill="#f59e0b" />
                  <span style={{ fontSize: '11px', color: '#a0a0a0' }}>{match.product.owner.rating}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <MapPin size={11} color="#a0a0a0" />
                  <span style={{ fontSize: '11px', color: '#a0a0a0' }}>{match.product.owner.location.split(',')[0]}</span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={{
              padding: '8px 14px', borderRadius: '10px', border: '1px solid #2a2a2a',
              background: 'transparent', color: '#a0a0a0', fontSize: '13px', cursor: 'pointer', fontWeight: '600'
            }}>
              Ignorar
            </button>
            <button
              onClick={onChat}
              style={{
                padding: '8px 16px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                background: '#00c896', color: '#000', fontWeight: '700', fontSize: '13px',
              }}
            >
              Negociar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MatchSuggestions({ onChat }: MatchSuggestionsProps) {
  return (
    <div style={{ paddingBottom: '90px' }}>
      {/* Header */}
      <div style={{ padding: '52px 20px 20px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#fff', marginBottom: '4px' }}>
          Seus matches
        </h1>
        <p style={{ color: '#a0a0a0', fontSize: '14px' }}>
          {mockMatches.length} trocas compatíveis encontradas
        </p>
      </div>

      {/* Highlight card */}
      <div style={{
        margin: '0 20px 20px',
        background: 'linear-gradient(135deg, #00c89622, #007a5e11)',
        border: '1px solid #00c89633', borderRadius: '16px', padding: '16px',
        display: 'flex', alignItems: 'center', gap: '12px'
      }}>
        <div style={{
          width: '44px', height: '44px', borderRadius: '12px',
          background: '#00c89622', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
        }}>
          <Zap size={22} color="#00c896" fill="#00c896" />
        </div>
        <div>
          <p style={{ color: '#00c896', fontWeight: '700', fontSize: '14px' }}>
            Algoritmo de compatibilidade
          </p>
          <p style={{ color: '#a0a0a0', fontSize: '12px', lineHeight: '1.4' }}>
            Analisamos suas ofertas e encontramos as melhores trocas para você
          </p>
        </div>
      </div>

      {/* Match cards */}
      <div style={{ padding: '0 20px' }}>
        {mockMatches.map(match => (
          <MatchCard key={match.id} match={match} onChat={onChat} />
        ))}
      </div>
    </div>
  );
}
