import { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Send, Paperclip, MoreVertical } from 'lucide-react';
import { mockChat, currentUser } from '../data/mockData';
import type { Message } from '../types';

interface ChatPanelProps {
  onBack: () => void;
}

export default function ChatPanel({ onBack }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>(mockChat.messages);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = () => {
    if (!input.trim()) return;
    const newMsg: Message = {
      id: `msg${Date.now()}`,
      senderId: currentUser.id,
      text: input.trim(),
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages(prev => [...prev, newMsg]);
    setInput('');

    // Auto reply after 1s
    setTimeout(() => {
      setMessages(prev => [...prev, {
        id: `msg${Date.now()}`,
        senderId: mockChat.participant.id,
        text: 'Perfeito! Vou te mandar mais detalhes em breve. 😊',
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      }]);
    }, 1200);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header */}
      <div style={{
        padding: '52px 20px 16px', background: '#0f0f0f',
        borderBottom: '1px solid #1a1a1a', flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={onBack}
            style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: '#1a1a1a', border: '1px solid #2a2a2a',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
            }}
          >
            <ArrowLeft size={16} color="#a0a0a0" />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '14px', fontWeight: '700', color: '#fff',
            }}>
              {mockChat.participant.avatar}
            </div>
            <div>
              <p style={{ fontWeight: '700', color: '#fff', fontSize: '15px' }}>{mockChat.participant.name}</p>
              <p style={{ color: '#00c896', fontSize: '11px' }}>● Online agora</p>
            </div>
          </div>

          <button style={{
            width: '36px', height: '36px', borderRadius: '10px',
            background: '#1a1a1a', border: '1px solid #2a2a2a',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
          }}>
            <MoreVertical size={16} color="#a0a0a0" />
          </button>
        </div>

        {/* Trade info */}
        <div style={{
          marginTop: '12px', background: '#1a1a1a', borderRadius: '12px',
          padding: '10px 14px', border: '1px solid #2a2a2a',
          display: 'flex', alignItems: 'center', gap: '8px'
        }}>
          <div style={{ fontSize: '18px' }}>🔄</div>
          <div>
            <p style={{ color: '#a0a0a0', fontSize: '11px' }}>Proposta de troca</p>
            <p style={{ color: '#fff', fontSize: '13px', fontWeight: '600' }}>
              {mockChat.product.title}
            </p>
          </div>
          <button style={{
            marginLeft: 'auto', padding: '6px 12px', borderRadius: '8px',
            background: '#00c89622', border: '1px solid #00c89644',
            color: '#00c896', fontSize: '12px', fontWeight: '700', cursor: 'pointer'
          }}>
            Ver oferta
          </button>
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px'
      }} className="scrollbar-hide">
        {messages.map(msg => {
          const isMe = msg.senderId === currentUser.id;
          return (
            <div key={msg.id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
              {!isMe && (
                <div style={{
                  width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '10px', fontWeight: '700', color: '#fff', marginRight: '8px', alignSelf: 'flex-end'
                }}>
                  {mockChat.participant.avatar}
                </div>
              )}
              <div style={{ maxWidth: '75%' }}>
                <div style={{
                  padding: '10px 14px', borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                  background: isMe ? 'linear-gradient(135deg, #00c896, #007a5e)' : '#1a1a1a',
                  border: isMe ? 'none' : '1px solid #2a2a2a',
                }}>
                  <p style={{ color: isMe ? '#000' : '#fff', fontSize: '14px', lineHeight: '1.5' }}>
                    {msg.text}
                  </p>
                </div>
                <p style={{ color: '#555', fontSize: '10px', marginTop: '4px', textAlign: isMe ? 'right' : 'left' }}>
                  {msg.timestamp}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '12px 20px 32px', background: '#0f0f0f',
        borderTop: '1px solid #1a1a1a', flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button style={{
            width: '40px', height: '40px', borderRadius: '12px',
            background: '#1a1a1a', border: '1px solid #2a2a2a',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0
          }}>
            <Paperclip size={16} color="#a0a0a0" />
          </button>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            placeholder="Digite sua mensagem..."
            style={{
              flex: 1, padding: '12px 16px', borderRadius: '24px',
              background: '#1a1a1a', border: '1px solid #2a2a2a',
              color: '#fff', fontSize: '14px', outline: 'none',
            }}
          />
          <button
            onClick={sendMessage}
            style={{
              width: '40px', height: '40px', borderRadius: '12px', border: 'none', cursor: 'pointer',
              background: input.trim() ? '#00c896' : '#1a1a1a',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              transition: 'background 0.2s',
            }}
          >
            <Send size={16} color={input.trim() ? '#000' : '#555'} />
          </button>
        </div>
      </div>
    </div>
  );
}
