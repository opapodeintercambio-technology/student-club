/**
 * Filtro de conteúdo do chat do Student Club.
 *
 * Política simplificada: bloqueia APENAS palavras ofensivas (xingamentos
 * e ameaças explícitas). Redes sociais (whatsapp, instagram, telegram,
 * etc.), números de telefone, drogas e armas NÃO são mais bloqueados —
 * estavam gerando falsos positivos em conversas legítimas entre alunos.
 */

// Normalização: remove acentos, leetspeak básico, baixa caixa.
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[0@4]/g, 'a')
    .replace(/[1!|]/g, 'i')
    .replace(/[3]/g, 'e')
    .replace(/[0ø]/g, 'o')
    .replace(/[5$]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Palavrões / xingamentos ───────────────────────────────────────────────
const PROFANITY = [
  'filho da puta', 'filha da puta', 'va se foder', 'vai se foder', 'vai tomar no cu',
  'vai tomar no rabo', 'cuzao', 'arrombado', 'arrombada', 'viado', 'boiola',
  'xoxota', 'buceta', 'rola', 'pica', 'pau duro', 'piroca', 'cacete', 'punheta',
  'foda', 'fodase', 'foda-se', 'sifilis', 'gonorreia', 'vadia', 'viadinho',
  'safada', 'safado', 'vagabunda', 'vagabundo', 'lazarento', 'lazarenta',
  'desgraçado', 'desgraçada', 'otario', 'otaria', 'babaca',
  'fdp', 'vsf', 'vtc', 'vtse', 'pqp', 'tnc',
];

// ── Ameaças explícitas (também consideradas ofensivas) ────────────────────
const THREATS: RegExp[] = [
  /\bvou\s+te\s+(matar|bater|acabar|foder|quebrar|cortar)\b/,
  /\bvou\s+(matar|bater|acabar|foder|quebrar)\s+(voce|vc)\b/,
];

export interface FilterResult {
  blocked: boolean;
  reason?: 'profanity';
}

export function filterContent(rawText: string): FilterResult {
  const n = normalize(rawText);
  for (const word of PROFANITY) {
    if (n.includes(word)) return { blocked: true, reason: 'profanity' };
  }
  for (const re of THREATS) {
    if (re.test(n)) return { blocked: true, reason: 'profanity' };
  }
  return { blocked: false };
}
