import { useState, useEffect } from 'react';
import { Sun, Moon, Monitor, ChevronRight, MapPin, Star, AlertTriangle, Zap, Bell, Languages, Lock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Theme } from '../hooks/useTheme';
import { APP_T } from '../i18n';
import type { Lang } from '../i18n';
import { requestPushPermission } from '../hooks/usePushNotification';

interface SettingsTabProps {
  currentUser: string;
  userId: string;
  onOpenSeguranca?: () => void;
  theme?: Theme;
  onThemeChange?: (t: Theme) => void;
  scoreMedio?: number;
  totalAvaliacoes?: number;
  lang?: Lang;
  onLangChange?: (l: Lang) => void;
}

type LocationStatus = 'idle' | 'granted' | 'denied' | 'requesting';

function StarDisplay({ score, total, T }: { score: number; total: number; T: typeof APP_T.pt }) {
  const rounded = Math.round(score);
  return (
    <div className="flex flex-col items-center py-4">
      <div className="flex gap-1 mb-2">
        {[1,2,3,4,5].map(n => (
          <Star key={n} className={`w-8 h-8 ${n <= rounded ? 'fill-yellow-400 text-yellow-400' : 'fill-gray-200 text-gray-200'}`} />
        ))}
      </div>
      <p className="text-3xl font-bold text-gray-800">{score > 0 ? score.toFixed(1) : '—'}</p>
      <p className="text-sm text-gray-500 mt-1">{T.settingsReputationScore(total)}</p>
      {score > 0 && (
        <div className="mt-3 px-4 py-1.5 rounded-full text-sm font-semibold" style={{
          background: score >= 4.5 ? '#dcfce7' : score >= 3.5 ? '#fef9c3' : '#fee2e2',
          color: score >= 4.5 ? '#16a34a' : score >= 3.5 ? '#ca8a04' : '#dc2626',
        }}>
          {score >= 4.5 ? T.settingsRepExcellent : score >= 3.5 ? T.settingsRepGood : T.settingsRepLow}
        </div>
      )}
    </div>
  );
}

export function SettingsTab({
  currentUser, userId, onOpenSeguranca,
  theme = 'system', onThemeChange,
  scoreMedio = 0, totalAvaliacoes = 0,
  lang = 'pt', onLangChange,
}: SettingsTabProps) {
  const T = APP_T[lang];

  const themeOptions: { value: Theme; label: string; desc: string; icon: React.ReactNode }[] = [
    { value: 'light',  label: T.themeLight2,  desc: T.themeLight2Desc,  icon: <Sun className="w-5 h-5" /> },
    { value: 'system', label: T.themeAuto2,   desc: T.themeAuto2Desc,   icon: <Monitor className="w-5 h-5" /> },
    { value: 'dark',   label: T.themeDark2,   desc: T.themeDark2Desc,   icon: <Moon className="w-5 h-5" /> },
  ];

  const [locationStatus, setLocationStatus] = useState<LocationStatus>('idle');
  const [locationAlert, setLocationAlert] = useState('');
  const [notifSite, setNotifSite] = useState(() => localStorage.getItem('papo_notif_site') !== 'off');
  const [notifChat, setNotifChat] = useState(() => localStorage.getItem('papo_notif_chat') !== 'off');
  // Excluir Conta foi movido para a aba Segurança (MinhaContaTab view='security').

  const toggleNotif = async (key: 'site' | 'chat', current: boolean) => {
    const next = !current;
    if (next) {
      // Gesto do usuário → registra push (web ou nativo)
      await requestPushPermission(currentUser);
    }
    if (key === 'site') { setNotifSite(next); localStorage.setItem('papo_notif_site', next ? 'on' : 'off'); }
    if (key === 'chat') { setNotifChat(next); localStorage.setItem('papo_notif_chat', next ? 'on' : 'off'); }
  };

  useEffect(() => {
    if (!navigator.permissions) return;
    navigator.permissions.query({ name: 'geolocation' }).then(result => {
      if (result.state === 'granted') setLocationStatus('granted');
      else if (result.state === 'denied') setLocationStatus('denied');
    });
  }, []);

  const handleLocationToggle = () => {
    if (locationStatus === 'granted') {
      setLocationAlert(T.settingsLocationRevokeHint);
      return;
    }
    if (locationStatus === 'denied') {
      setLocationAlert(T.settingsLocationDeniedHint);
      return;
    }
    setLocationStatus('requesting');
    setLocationAlert('');
    navigator.geolocation.getCurrentPosition(
      () => {
        setLocationStatus('granted');
        setLocationAlert(T.settingsLocationGranted);
      },
      (err) => {
        setLocationStatus('denied');
        if (err.code === 1) {
          setLocationAlert(T.settingsLocationDenied);
        } else {
          setLocationAlert(T.settingsLocationError);
        }
      },
      { timeout: 10000 }
    );
  };

  const locationColor = locationStatus === 'granted' ? 'bg-green-500' : locationStatus === 'denied' ? 'bg-red-400' : 'bg-gray-300';
  const locationLabel = locationStatus === 'granted' ? T.settingsLocationActive
    : locationStatus === 'denied' ? T.settingsLocationBlocked
    : locationStatus === 'requesting' ? T.settingsLocationRequesting
    : T.settingsLocationInactive;

  const notifItems = [
    { key: 'site' as const,    label: T.settingsNotifSite,    desc: T.settingsNotifSiteDesc,    value: notifSite },
    { key: 'chat' as const,    label: T.settingsNotifChat,    desc: T.settingsNotifChatDesc,    value: notifChat },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-20">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">{T.settingsTitle}</h2>

      {/* APARÊNCIA / Dark mode removida — Papo de Alunos usa apenas tema claro */}

      {/* 0 ── SEGURANÇA / DADOS PESSOAIS ── */}
      <div className="glass overflow-hidden mb-4" style={{borderRadius:24}}>
        <button
          type="button"
          onClick={() => onOpenSeguranca?.()}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Lock className="w-4 h-4 text-purple-500" />
            <div className="text-left">
              <h3 className="font-bold text-gray-700 text-sm uppercase tracking-wide">Segurança</h3>
              <p className="text-xs text-gray-500 mt-0.5">Dados pessoais, viagem, alterar senha</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
        </button>
      </div>

      {/* 1.5 ── IDIOMA ── */}
      <div className="glass overflow-hidden mb-4" style={{borderRadius:24}}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Languages className="w-4 h-4 text-purple-500" />
          <h3 className="font-bold text-gray-700 text-sm uppercase tracking-wide">{T.langTitle}</h3>
        </div>
        <div className="px-5 py-5">
          <p className="text-sm text-gray-500 mb-4">{T.langDesc}</p>
          <div className="grid grid-cols-3 gap-3">
            {(['pt', 'en', 'es'] as Lang[]).map(l => {
              const isActive = lang === l;
              const flag = l === 'pt' ? '🇧🇷' : l === 'en' ? '🇺🇸' : '🇪🇸';
              const label = l === 'pt' ? T.langPt : l === 'en' ? T.langEn : T.langEs;
              const desc = l === 'pt' ? T.langPtDesc : l === 'en' ? T.langEnDesc : T.langEsDesc;
              return (
                <button key={l} onClick={() => onLangChange?.(l)}
                  className={`flex flex-col items-center gap-2 py-4 px-2 rounded-2xl border-2 transition-all ${
                    isActive ? 'border-purple-600 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-500 hover:border-purple-300'
                  }`}>
                  <span className="text-2xl">{flag}</span>
                  <span className="text-xs font-bold">{label}</span>
                  <span className="text-[10px] text-center leading-tight opacity-70">{desc}</span>
                  {isActive && <span className="w-2 h-2 rounded-full bg-purple-600" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 3 ── NOTIFICAÇÕES ── */}
      <div className="glass overflow-hidden mb-4" style={{borderRadius:24}}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Bell className="w-4 h-4 text-purple-500" />
          <h3 className="font-bold text-gray-700 text-sm uppercase tracking-wide">{T.settingsNotifications}</h3>
        </div>
        <div className="px-5 py-5 space-y-5">
          {notifItems.map(({ key, label, desc, value }) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-700">{label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
              </div>
              <button
                onClick={() => toggleNotif(key, value)}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors flex-shrink-0 ${value ? 'bg-purple-600' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          ))}
          {typeof Notification !== 'undefined' && Notification.permission === 'denied' && (
            <p className="text-xs text-orange-600 bg-orange-50 rounded-xl px-3 py-2">
              {T.settingsNotifBlocked}
            </p>
          )}
        </div>
      </div>

      {/* 3.5 ── LOCALIZAÇÃO ── */}
      <div className="glass overflow-hidden mb-4" style={{borderRadius:24}}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-purple-500" />
          <h3 className="font-bold text-gray-700 text-sm uppercase tracking-wide">{T.settingsLocation}</h3>
        </div>
        <div className="px-5 py-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex-1 mr-4">
              <p className="text-sm font-semibold text-gray-700">{T.settingsLocationAllow}</p>
              <p className="text-xs text-gray-500 mt-0.5">{T.settingsLocationDesc}</p>
            </div>
            <button
              onClick={handleLocationToggle}
              disabled={locationStatus === 'requesting'}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors flex-shrink-0 ${
                locationStatus === 'granted' ? 'bg-green-500' : 'bg-gray-300'
              } disabled:opacity-50`}
            >
              <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                locationStatus === 'granted' ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <span className={`w-2 h-2 rounded-full ${locationColor}`} />
            <span className="text-xs font-semibold text-gray-600">{locationLabel}</span>
          </div>
          {locationAlert && (
            <div className={`flex items-start gap-2 mt-3 p-3 rounded-2xl text-xs ${
              locationStatus === 'granted' ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'
            }`}>
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <p>{locationAlert}</p>
            </div>
          )}
        </div>
      </div>

      {/* Verificação de identidade removida da aba Configurações. */}
      {/* Card "Excluir conta" foi movido para a aba Segurança como último item. */}
    </div>
  );
}
