import { useState } from 'react';
import { Home, Plus, Zap, MessageCircle, RefreshCw } from 'lucide-react';
import LoginScreen from './components/LoginScreen';
import HomeScreen from './components/HomeScreen';
import CreateProduct from './components/CreateProduct';
import MatchSuggestions from './components/MatchSuggestions';
import ChatPanel from './components/ChatPanel';

type AppScreen = 'login' | 'home' | 'create' | 'matches' | 'chat';

const navItems = [
  { id: 'home' as const, icon: Home, label: 'Explorar' },
  { id: 'create' as const, icon: Plus, label: 'Criar' },
  { id: 'matches' as const, icon: Zap, label: 'Matches' },
  { id: 'chat' as const, icon: MessageCircle, label: 'Chat' },
];

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('login');
  const [activeTab, setActiveTab] = useState<'home' | 'create' | 'matches' | 'chat'>('home');

  const handleLogin = () => {
    setScreen('home');
    setActiveTab('home');
  };

  const handleTabChange = (tab: 'home' | 'create' | 'matches' | 'chat') => {
    setActiveTab(tab);
    setScreen(tab);
  };

  const handleChat = () => {
    setActiveTab('chat');
    setScreen('chat');
  };

  const isLoggedIn = screen !== 'login';

  const renderScreen = () => {
    if (screen === 'login') return <LoginScreen onLogin={handleLogin} />;
    if (screen === 'home') return <HomeScreen onChat={handleChat} />;
    if (screen === 'create') return <CreateProduct />;
    if (screen === 'matches') return <MatchSuggestions onChat={handleChat} />;
    if (screen === 'chat') return <ChatPanel onBack={() => handleTabChange('home')} />;
    return null;
  };

  return (
    <div style={{ position: 'relative', minHeight: '100vh' }}>
      {renderScreen()}

      {isLoggedIn && screen !== 'chat' && (
        <nav style={{
          position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
          width: '100%', maxWidth: '430px',
          background: 'rgba(15,15,15,0.97)',
          backdropFilter: 'blur(20px)',
          borderTop: '1px solid #1a1a1a',
          padding: '8px 0 20px',
          display: 'flex', justifyContent: 'space-around', alignItems: 'center',
          zIndex: 100,
        }}>
          {navItems.map(item => {
            const isActive = activeTab === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => handleTabChange(item.id)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                  background: 'none', border: 'none', cursor: 'pointer', padding: '4px 16px',
                  position: 'relative',
                }}
              >
                {item.id === 'create' ? (
                  <div style={{
                    width: '48px', height: '48px', borderRadius: '16px',
                    background: 'linear-gradient(135deg, #00c896, #007a5e)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 4px 15px #00c89644',
                  }}>
                    <Plus size={22} color="#000" strokeWidth={2.5} />
                  </div>
                ) : (
                  <>
                    <div style={{ position: 'relative' }}>
                      <Icon size={22} color={isActive ? '#00c896' : '#555'} strokeWidth={isActive ? 2.5 : 2} />
                      {item.id === 'matches' && (
                        <div style={{
                          position: 'absolute', top: '-3px', right: '-4px',
                          width: '8px', height: '8px', borderRadius: '50%',
                          background: '#00c896', border: '2px solid #0f0f0f'
                        }} />
                      )}
                    </div>
                    <span style={{ fontSize: '10px', color: isActive ? '#00c896' : '#555', fontWeight: isActive ? '700' : '500' }}>
                      {item.label}
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </nav>
      )}

      {!isLoggedIn && (
        <div style={{
          position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: '6px', color: '#333'
        }}>
          <RefreshCw size={12} />
          <span style={{ fontSize: '11px' }}>SwapIt — Troque, não compre</span>
        </div>
      )}
    </div>
  );
}
