import webpush from 'web-push';
import admin from 'firebase-admin';
import http2 from 'node:http2';
import { SignJWT, importPKCS8 } from 'jose';

const APNS_BUNDLE_ID = 'com.papodealunos.app';
const APNS_HOST = 'api.push.apple.com';

let apnsTokenCache: { token: string; expiresAt: number } | null = null;

async function getApnsJwt(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (apnsTokenCache && apnsTokenCache.expiresAt > now + 60) {
    return apnsTokenCache.token;
  }
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  let p8 = process.env.APNS_AUTH_KEY;
  if (!keyId || !teamId || !p8) throw new Error('APNS env vars missing');
  if (!p8.includes('BEGIN PRIVATE KEY')) {
    p8 = Buffer.from(p8, 'base64').toString('utf-8');
  }
  p8 = p8.replace(/\\n/g, '\n');
  const key = await importPKCS8(p8, 'ES256');
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt(now)
    .sign(key);
  apnsTokenCache = { token: jwt, expiresAt: now + 50 * 60 };
  return jwt;
}

async function sendAPNs(deviceToken: string, payload: { title: string; body: string; tag: string }) {
  const jwt = await getApnsJwt();
  const isNudge = typeof payload.tag === 'string' && payload.tag.startsWith('nudge-');
  const body = JSON.stringify({
    aps: {
      alert: { title: payload.title, body: payload.body },
      sound: 'default',
      badge: 1,
      'mutable-content': 1,
      // time-sensitive faz a notif aparecer mesmo com Foco/Nao perturbe ativo
      // e tocar/vibrar com prioridade maxima (iOS 15+)
      'interruption-level': isNudge ? 'time-sensitive' : 'active',
      'relevance-score': isNudge ? 1.0 : 0.5,
    },
    tag: payload.tag,
    nudge: isNudge ? 1 : 0,
  });
  return new Promise<void>((resolve, reject) => {
    const client = http2.connect(`https://${APNS_HOST}`);
    client.on('error', reject);
    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${deviceToken}`,
      'authorization': `bearer ${jwt}`,
      'apns-topic': APNS_BUNDLE_ID,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'apns-expiration': '0',
      'content-type': 'application/json',
    });
    let status = 0;
    let respBody = '';
    req.on('response', (h) => { status = Number(h[':status']); });
    req.on('data', (c) => { respBody += c.toString(); });
    req.on('end', () => {
      client.close();
      if (status === 200) resolve();
      else reject(new Error(`APNs ${status}: ${respBody}`));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:contato@papodealunos.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
}

function parseServiceAccount(raw: string): any {
  const trimmed = raw.trim();
  // 1. Tenta como base64 primeiro (mais robusto)
  if (!trimmed.startsWith('{')) {
    try {
      const decoded = Buffer.from(trimmed, 'base64').toString('utf-8');
      return JSON.parse(decoded);
    } catch {}
  }
  // 2. Tenta JSON direto
  try { return JSON.parse(trimmed); } catch {}
  // 3. JSON com newlines REAIS dentro do private_key (problema comum no Vercel/colagem manual)
  // Escapa newlines/CR/tabs apenas dentro de strings
  let inString = false;
  let escape = false;
  let out = '';
  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed[i];
    if (escape) { out += c; escape = false; continue; }
    if (c === '\\') { out += c; escape = true; continue; }
    if (c === '"') { inString = !inString; out += c; continue; }
    if (inString) {
      if (c === '\n') { out += '\\n'; continue; }
      if (c === '\r') { out += '\\r'; continue; }
      if (c === '\t') { out += '\\t'; continue; }
    }
    out += c;
  }
  return JSON.parse(out);
}

function ensureFirebase() {
  if (admin.apps.length > 0) return;
  const credJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!credJson) throw new Error('FIREBASE_SERVICE_ACCOUNT not configured');
  const parsed = parseServiceAccount(credJson);
  // Garante que private_key tem newlines reais (Firebase exige)
  if (parsed.private_key && typeof parsed.private_key === 'string') {
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  }
  admin.initializeApp({
    credential: admin.credential.cert(parsed),
  });
}

async function sendFCM(token: string, payload: { title: string; body: string; tag: string }) {
  ensureFirebase();
  const isNudge = typeof payload.tag === 'string' && payload.tag.startsWith('nudge-');
  await admin.messaging().send({
    token,
    notification: { title: payload.title, body: payload.body },
    data: {
      title: payload.title,
      body: payload.body,
      tag: payload.tag,
      nudge: isNudge ? '1' : '0',
    },
    android: {
      priority: 'high',
      ttl: 60 * 60 * 24,
      notification: {
        sound: 'default',
        // Canal separado pra cutucada — vibracao MAIS forte que chat normal
        channelId: isNudge ? 'papo_nudge' : 'papo_chat',
        icon: 'ic_launcher',
        color: isNudge ? '#fbbf24' : '#7c3aed',
        tag: payload.tag,
        notificationCount: 1,
        defaultSound: true,
        defaultVibrateTimings: !isNudge,
        // Cutucada: pattern customizado intenso (ms)
        vibrateTimingsMillis: isNudge
          ? [0, 200, 80, 200, 80, 300, 80, 200]
          : undefined,
        // Cutucada: notif full-screen (vibra mesmo com tela bloqueada)
        notificationPriority: isNudge ? 'PRIORITY_MAX' : 'PRIORITY_DEFAULT',
      },
    },
    apns: {
      headers: {
        'apns-priority': '10',
        'apns-push-type': 'alert',
      },
      payload: {
        aps: {
          sound: 'default',
          badge: 1,
          'interruption-level': isNudge ? 'time-sensitive' : 'active',
          'relevance-score': isNudge ? 1.0 : 0.5,
        },
      },
    },
  });
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { subscription, fromUsername, message, customTitle, customBody, customTag } = req.body || {};
  if (!subscription || !fromUsername) return res.status(400).json({ error: 'missing params' });

  const safeMessage = typeof message === 'string' ? message : '';
  // Quando o caller passa customTitle/customBody (curtida, comentário, friend req, meet etc),
  // usa eles direto. Senão cai no template padrão de chat.
  const payload = (typeof customTitle === 'string' && customTitle.length > 0)
    ? {
        title: customTitle.slice(0, 120),
        body:  (typeof customBody === 'string' ? customBody : '').slice(0, 240) || ' ',
        tag:   (typeof customTag  === 'string' ? customTag  : `papo-${Date.now()}`),
      }
    : {
        title: `💬 @${fromUsername}`,
        body:  safeMessage.length > 80 ? safeMessage.slice(0, 80) + '…' : (safeMessage || 'Nova mensagem'),
        tag:   `chat-${fromUsername}`,
      };

  try {
    let parsed: any = subscription;
    if (typeof subscription === 'string') {
      try { parsed = JSON.parse(subscription); } catch { parsed = subscription; }
    }

    // APNs — app nativo iOS
    if (parsed?.type === 'apns' && parsed?.token) {
      await sendAPNs(parsed.token, payload);
      return res.status(200).json({ sent: true, via: 'apns' });
    }

    // FCM — app nativo Android
    if (parsed?.type === 'fcm' && parsed?.token) {
      await sendFCM(parsed.token, payload);
      return res.status(200).json({ sent: true, via: 'fcm' });
    }

    // Web Push — browser
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      return res.status(200).json({ sent: false, error: 'VAPID keys not configured' });
    }
    await webpush.sendNotification(parsed, JSON.stringify({
      title: payload.title,
      body: payload.body,
      tag: payload.tag,
      url: '/',
    }));
    res.status(200).json({ sent: true, via: 'webpush' });
  } catch (e: any) {
    console.error('send-push error:', e?.message, e?.code, e?.errorInfo);
    res.status(200).json({ sent: false, error: e?.message || 'unknown error' });
  }
}
