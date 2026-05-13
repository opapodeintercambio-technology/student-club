import { useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const VAPID_PUBLIC = 'BAthmiYAn7LTbqcTrmc6BPLFtsquS_IAa_ZQ1x2NcCiZB9wlOlLi074F4ZrfwEOA-StOfq64DYsycAofYT5fu4g';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

function playTrokiii() {
  try {
    const audio = new Audio('/trokiii.ogg');
    audio.volume = 1;
    audio.play().catch(() => {});
  } catch {}
}

// Detecta se está rodando como app nativo Capacitor
function isNativeApp(): boolean {
  return typeof (window as any).Capacitor !== 'undefined' &&
    (window as any).Capacitor?.isNativePlatform?.() === true;
}

function nativePlatform(): 'ios' | 'android' | 'web' {
  try {
    const p = (window as any).Capacitor?.getPlatform?.();
    if (p === 'ios' || p === 'android') return p;
  } catch {}
  return 'web';
}

// Mostra notificação local no Android/iOS quando app está em primeiro plano
async function showLocalNotification(title: string, body: string, tag: string) {
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    // Garante permissão
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') {
      const req = await LocalNotifications.requestPermissions();
      if (req.display !== 'granted') return;
    }
    // Cria canal Android (idempotente)
    try {
      await (LocalNotifications as any).createChannel?.({
        id: 'papo_chat',
        name: 'Mensagens Papo de Alunos',
        description: 'Notificações de mensagens, matches e propostas',
        importance: 5,
        visibility: 1,
        sound: 'default',
        vibration: true,
        lights: true,
        lightColor: '#7c3aed',
      });
    } catch {}
    await LocalNotifications.schedule({
      notifications: [{
        id: Math.floor(Math.random() * 2147483647),
        title,
        body,
        channelId: 'papo_chat',
        smallIcon: 'ic_launcher',
        iconColor: '#7c3aed',
        sound: 'default',
        extra: { tag },
      }],
    });
  } catch (err) {
    console.warn('LocalNotification failed:', err);
  }
}

// ── Capacitor (Android/iOS) push notification ───────────────────────────────
async function registerNativePush(username: string) {
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const { LocalNotifications } = await import('@capacitor/local-notifications');

    // Cria canal Android (obrigatório Android 8+)
    try {
      await (PushNotifications as any).createChannel({
        id: 'papo_chat',
        name: 'Mensagens Papo de Alunos',
        description: 'Notificações de mensagens e matches',
        importance: 5,
        visibility: 1,
        sound: 'default',
        vibration: true,
        lights: true,
        lightColor: '#7c3aed',
      });
    } catch {}
    try {
      await (LocalNotifications as any).createChannel?.({
        id: 'papo_chat',
        name: 'Mensagens Papo de Alunos',
        importance: 5,
        visibility: 1,
        sound: 'default',
        vibration: true,
        lights: true,
        lightColor: '#7c3aed',
      });
    } catch {}

    // Permissões
    let permStatus = await PushNotifications.checkPermissions();
    if (permStatus.receive === 'prompt' || permStatus.receive === 'prompt-with-rationale') {
      permStatus = await PushNotifications.requestPermissions();
    }
    if (permStatus.receive !== 'granted') return;

    try {
      const localPerm = await LocalNotifications.checkPermissions();
      if (localPerm.display !== 'granted') {
        await LocalNotifications.requestPermissions();
      }
    } catch {}

    // Remove listeners antigos pra evitar duplicatas
    await PushNotifications.removeAllListeners();

    // Token novo → salva no Supabase (iOS = APNs hex token, Android = FCM token)
    const tokenType: 'apns' | 'fcm' = nativePlatform() === 'ios' ? 'apns' : 'fcm';
    PushNotifications.addListener('registration', async (token) => {
      try {
        await supabase.from('push_subscriptions').upsert({
          username,
          endpoint: token.value,
          type: tokenType,
          subscription: JSON.stringify({ type: tokenType, token: token.value }),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'username,endpoint' });
      } catch (err) {
        console.error('Failed to save push token:', err);
      }
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.error('Push registration error:', err);
    });

    // Quando push chega com app em foreground → mostra notificação local + toca som
    PushNotifications.addListener('pushNotificationReceived', async (notif) => {
      playTrokiii();
      const title = notif.title || (notif.data?.title as string) || 'Papo de Alunos';
      const body = notif.body || (notif.data?.body as string) || 'Nova mensagem';
      const tag = (notif.data?.tag as string) || 'chat';
      await showLocalNotification(title, body, tag);
    });

    // Quando usuário toca na notificação
    PushNotifications.addListener('pushNotificationActionPerformed', () => {
      // Foco no app (Capacitor já cuida de trazer ao primeiro plano)
    });

    // Sempre re-registra para pegar token atualizado (token pode rotacionar)
    await PushNotifications.register();

  } catch (err) {
    console.warn('Native push registration failed:', err);
  }
}

// ── Web Push (browser) ───────────────────────────────────────────────────────
async function registerWebPush(username: string) {
  if (!('serviceWorker' in navigator)) return;
  if (!('PushManager' in window)) return;
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'denied') return;

  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
    await navigator.serviceWorker.ready;
    // Força atualização do SW
    try { await reg.update(); } catch {}

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      });
    }

    const subJson = sub.toJSON();
    await supabase.from('push_subscriptions').upsert({
      username,
      endpoint: subJson.endpoint || sub.endpoint,
      type: 'webpush',
      subscription: JSON.stringify(subJson),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'username,endpoint' });
  } catch (err) {
    console.warn('Web push registration failed:', err);
  }
}

// Exporta para chamada via gesto do usuário (ex: SettingsTab toggle)
export async function requestPushPermission(username: string) {
  if (isNativeApp()) {
    await registerNativePush(username);
  } else {
    await registerWebPush(username);
  }
}

export function usePushNotification(username: string | null) {
  // Listener para mensagens do Service Worker (toca audio quando chega push no browser)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'PLAY_TROKIII') {
        playTrokiii();
      }
      // Browser invalidou a subscription → re-subscribe
      if (event.data?.type === 'PUSH_SUBSCRIPTION_CHANGED') {
        // re-registra silenciosamente (precisa do username — pega do localStorage)
        try {
          const u = localStorage.getItem('currentUser');
          if (u) registerWebPush(u);
        } catch {}
      }
    };

    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  // Registro / re-registro de push em TODA abertura do app
  // Isso garante que o token FCM esteja sempre atualizado no Supabase
  useEffect(() => {
    if (!username) return;

    const t = setTimeout(() => {
      if (isNativeApp()) {
        registerNativePush(username);
      } else {
        registerWebPush(username);
      }
    }, 2000);

    // Re-registra quando app volta do background (token pode ter rotacionado)
    const onResume = () => {
      if (isNativeApp()) registerNativePush(username);
      else registerWebPush(username);
    };
    document.addEventListener('resume', onResume);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') onResume();
    });

    return () => {
      clearTimeout(t);
      document.removeEventListener('resume', onResume);
    };
  }, [username]);
}
