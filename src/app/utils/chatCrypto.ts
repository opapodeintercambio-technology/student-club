// Utilitários de criptografia compartilhados entre ChatPanel e App

const toB64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)));
const fromB64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export async function deriveKey(convId: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('trokvibe_' + convId));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptMsg(text: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
  return toB64(iv.buffer) + ':' + toB64(ct);
}

export async function decryptMsg(payload: string, key: CryptoKey): Promise<string> {
  try {
    const [a, b] = payload.split(':');
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(a) }, key, fromB64(b));
    return new TextDecoder().decode(pt);
  } catch { return '[mensagem]'; }
}

// ── Histórico de renames: { username_novo: username_antigo } ──────────────────
// Adicione aqui qualquer rename futuro para garantir retrocompatibilidade.
const USERNAME_HISTORY: Record<string, string> = {
  'gui_10':     'gui',
  'pablo_caio': 'pablo marcal',
};

// Gera todas as variações antigas de um conversa_id (substituições simples e duplas)
function oldConvIds(convId: string): string[] {
  const result = new Set<string>();
  const entries = Object.entries(USERNAME_HISTORY);
  for (const [newU, oldU] of entries) {
    if (!convId.includes(newU)) continue;
    const single = convId.replace(newU, oldU);
    result.add(single);
    // Substituição dupla: dois usuários renomeados na mesma conversa
    for (const [newU2, oldU2] of entries) {
      if (newU2 !== newU && single.includes(newU2)) {
        result.add(single.replace(newU2, oldU2));
      }
    }
  }
  return [...result];
}

/**
 * Tenta decriptar com a chave primária e, se falhar, tenta chaves de conv_ids
 * antigos (antes de renames de username). Nunca lança exceção.
 */
export async function decryptMsgWithFallback(
  payload: string,
  primaryKey: CryptoKey,
  convId: string,
): Promise<string> {
  const first = await decryptMsg(payload, primaryKey);
  if (first !== '[mensagem]') return first;

  for (const oldId of oldConvIds(convId)) {
    const oldKey = await deriveKey(oldId);
    const text = await decryptMsg(payload, oldKey);
    if (text !== '[mensagem]') return text;
  }
  return '[mensagem]';
}

export interface ProposalItem {
  id: string; title: string; image: string; trokValue: number; category: string;
}
export interface ProposalData {
  /** @deprecated use fromItems */
  fromItem?: ProposalItem;
  fromItems: ProposalItem[];           // multi-item support
  toProduct: { id: string; title: string; image: string; trokValue?: number };
  fromUser: string;
}

export const PROPOSTA_PREFIX = '__PROPOSTA__:';

export function parseProposal(text: string): ProposalData | null {
  if (!text.startsWith(PROPOSTA_PREFIX)) return null;
  try { return JSON.parse(text.slice(PROPOSTA_PREFIX.length)); } catch { return null; }
}

export interface DoacaoData {
  product: { id: string; title: string; image: string; category: string };
  fromUser: string;
}

export const DOACAO_PREFIX = '__DOACAO__:';

export function parseDoacaoAcceptance(text: string): DoacaoData | null {
  if (!text.startsWith(DOACAO_PREFIX)) return null;
  try { return JSON.parse(text.slice(DOACAO_PREFIX.length)); } catch { return null; }
}

export function formatChatPreview(
  text: string,
  lang: 'pt' | 'en' | 'es' = 'pt',
): string {
  if (!text) return '';
  if (text.startsWith(DOACAO_PREFIX)) {
    return lang === 'en' ? '🎁 Donation accepted'
      : lang === 'es' ? '🎁 Donación aceptada'
      : '🎁 Doação aceita';
  }
  if (text.startsWith(PROPOSTA_PREFIX)) {
    return lang === 'en' ? '📦 Trade proposal'
      : lang === 'es' ? '📦 Propuesta de intercambio'
      : '📦 Proposta de troca';
  }
  return text;
}
