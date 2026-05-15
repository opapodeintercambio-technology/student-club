// ─────────────────────────────────────────────────────────────────────────────
// FORMATO DAS MENSAGENS NO BANCO
// ─────────────────────────────────────────────────────────────────────────────
// Mensagens NOVAS são gravadas como texto plano com prefixo "P1:" — isso evita
// problemas de chave incompatível entre cliente A e cliente B (era a causa
// raiz do bug "[mensagem]"). A segurança da conversa é garantida pelas RLS
// policies do Supabase, não pela "criptografia" client-side (que usava chave
// derivada do conversa_id, ou seja, qualquer cliente conseguia derivar a chave
// — não fornecia confidencialidade real).
//
// Mensagens ANTIGAS continuam sendo lidas via decriptação AES (compatibilidade).
// ─────────────────────────────────────────────────────────────────────────────

export const PLAIN_PREFIX = 'P1:';

const toB64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)));
const fromB64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export async function deriveKey(convId: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('papo_' + convId));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

// Mensagens novas: texto plano com prefixo. Mantém a mesma assinatura para
// não quebrar chamadores existentes (a `key` é ignorada).
export async function encryptMsg(text: string, _key?: CryptoKey | null): Promise<string> {
  return PLAIN_PREFIX + text;
}

// Detecta o formato do payload:
//   - "P1:..." → texto plano (mensagem nova)
//   - "<iv>:<ct>" base64 com dois campos de tamanho específico → AES legado
//   - qualquer outra coisa → trata como texto plano (defensivo)
export async function decryptMsg(payload: string, key: CryptoKey | null | undefined): Promise<string> {
  if (typeof payload !== 'string') return '[mensagem]';
  if (payload.startsWith(PLAIN_PREFIX)) return payload.slice(PLAIN_PREFIX.length);

  // Tenta o formato AES legado: dois pedaços base64 separados por ':'
  const idx = payload.indexOf(':');
  if (idx > 0 && key) {
    try {
      const a = payload.slice(0, idx);
      const b = payload.slice(idx + 1);
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(a) }, key, fromB64(b));
      return new TextDecoder().decode(pt);
    } catch { /* segue para fallback */ }
  }
  return '[mensagem]';
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
 * Tenta decriptar com a chave primária e, se falhar, tenta:
 *   1) re-derivar a chave a partir do convId atual (cobre race condition onde
 *      `primaryKey` ficou de um convId antigo enquanto o ref ainda não atualizou)
 *   2) chaves de conv_ids antigos (antes de renames de username)
 * Nunca lança exceção.
 */
export async function decryptMsgWithFallback(
  payload: string,
  primaryKey: CryptoKey | null | undefined,
  convId: string,
): Promise<string> {
  if (primaryKey) {
    const first = await decryptMsg(payload, primaryKey);
    if (first !== '[mensagem]') return first;
  }

  // Fallback 1: deriva chave fresca a partir do convId atual
  if (convId) {
    const freshKey = await deriveKey(convId);
    const fresh = await decryptMsg(payload, freshKey);
    if (fresh !== '[mensagem]') return fresh;
  }

  // Fallback 2: chaves antigas (renames)
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
