/**
 * Filtro de conteúdo para o chat do TrokVibe.
 * Bloqueia: palavrões graves, negociações de drogas/armas e números de telefone.
 */

// ── Normalização geral (para palavras) ───────────────────────────────────────
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[0@4]/g, 'a')
    .replace(/[1!|]/g, 'i')
    .replace(/[3]/g, 'e')
    .replace(/[0ø]/g, 'o')
    .replace(/[5$]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Detecção de número de telefone ───────────────────────────────────────────
// Mapa de palavras-número → dígito (PT, EN, ES, FR, DE)
const WORD_TO_DIGIT: [RegExp, string][] = [
  [/\bzero\b/g,   '0'],
  [/\bum\b/g,     '1'], [/\buma\b/g,    '1'], [/\bone\b/g,   '1'], [/\buno\b/g,   '1'],
  [/\bdois\b/g,   '2'], [/\bduas\b/g,   '2'], [/\btwo\b/g,   '2'], [/\bdos\b/g,   '2'],
  [/\btres\b/g,   '3'], [/\bthree\b/g,  '3'],
  [/\bquatro\b/g, '4'], [/\bfour\b/g,   '4'], [/\bcuatro\b/g,'4'],
  [/\bcinco\b/g,  '5'], [/\bfive\b/g,   '5'],
  [/\bseis\b/g,   '6'], [/\bsix\b/g,    '6'],
  [/\bsete\b/g,   '7'], [/\bseven\b/g,  '7'], [/\bsiete\b/g, '7'],
  [/\boito\b/g,   '8'], [/\beight\b/g,  '8'], [/\bocho\b/g,  '8'],
  [/\bnove\b/g,   '9'], [/\bnine\b/g,   '9'], [/\bnueve\b/g, '9'],
  // emojis numéricos: 0️⃣ 1️⃣ … 9️⃣
  [/0️⃣/g, '0'], [/1️⃣/g, '1'], [/2️⃣/g, '2'], [/3️⃣/g, '3'], [/4️⃣/g, '4'],
  [/5️⃣/g, '5'], [/6️⃣/g, '6'], [/7️⃣/g, '7'], [/8️⃣/g, '8'], [/9️⃣/g, '9'],
  // prefixo internacional
  [/\+55/g, ''],
];

function extractDigitsOnly(text: string): string {
  let t = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // substitui palavras por dígitos
  for (const [re, d] of WORD_TO_DIGIT) t = t.replace(re, d);
  // remove qualquer separador entre dígitos isolados (ex: 9.1.2 → 912, 9 1 2 → 912)
  // repete até estabilizar para pegar cadeias longas
  for (let i = 0; i < 12; i++) {
    t = t.replace(/(\d)[^a-z\d](?=\d)/g, '$1');
  }
  return t;
}

function hasPhoneNumber(rawText: string): boolean {
  // 1. Verifica sequência de 8+ dígitos direto no texto
  if (/\d{8,}/.test(rawText)) return true;

  // 2. Extrai dígitos após converter palavras e remover separadores
  const extracted = extractDigitsOnly(rawText);
  if (/\d{8,}/.test(extracted)) return true;

  // 3. Formato com parênteses de DDD: (XX) + 8 dígitos
  if (/\(\s*\d{2}\s*\)\s*[\d\s.\-]{7,}/.test(rawText)) return true;

  // 4. Formato com hífen: XXXXX-XXXX (8+ dígitos com hífen central)
  if (/\d{4,5}[-–]\d{4}/.test(rawText)) return true;

  return false;
}

// ── Palavrões (nível grave) ──────────────────────────────────────────────────
const PROFANITY = [
  'filho da puta', 'filha da puta', 'va se foder', 'vai se foder', 'vai tomar no cu',
  'vai tomar no rabo', 'cuzao', 'arrombado', 'arrombada', 'viado', 'boiola',
  'xoxota', 'buceta', 'rola', 'pica', 'pau duro', 'piroca', 'cacete', 'punheta',
  'foda', 'fodase', 'foda-se', 'sifilis', 'gonorreia', 'vadia', 'viadinho',
  'safada', 'safado', 'vagabunda', 'vagabundo', 'lazarento', 'lazarenta',
  'desgraçado', 'desgraçada', 'otario', 'otaria', 'babaca',
  'fdp', 'vsf', 'vtc', 'vtse', 'pqp', 'tnc',
];

// ── Drogas ───────────────────────────────────────────────────────────────────
const DRUGS = [
  'cocaina', 'crack', 'maconha', 'baseado', 'skank', 'noia', 'noinha',
  'ecstasy', 'ecstase', 'mdma', 'lsd', 'acido', 'heroina', 'metanfetamina',
  'anfetamina', 'speed', 'ketamina', 'ketamine', 'oxi', 'merla', 'lolo',
  'cheirinho da lolo', 'popper', 'cannabis', 'thc', 'haxixe',
  'cogumelo magico', 'shrooms', 'peyote', 'ayahuasca', 'dmt', 'fentanil',
  'fentanyl', 'oxicodona', 'tramadol', 'morfina ilegal',
  'ritalina revenda', 'rivotril revenda', 'diazepam revenda', 'clonazepam revenda',
  'traficante', 'trafico', 'boca de fumo', 'biqueira', 'fornecedor de drogas',
  'vendo cocaina', 'vendo crack', 'vendo maconha', 'vendo drogas',
  'compro cocaina', 'compro crack', 'compro maconha', 'compro drogas',
  'entrega de drogas', 'entorpecente', 'substancia proibida',
];

// ── Armas ────────────────────────────────────────────────────────────────────
const WEAPONS = [
  'vendo arma', 'compro arma', 'vendo pistola', 'compro pistola',
  'vendo revolver', 'compro revolver', 'vendo fuzil', 'compro fuzil',
  'vendo espingarda', 'compro espingarda', 'vendo submetralhadora',
  'arma ilegal', 'arma sem registro', 'arma de fogo sem',
  'ak47', 'ak 47', 'ak-47', 'ar15', 'ar-15', 'ar 15',
  'glock ilegal', 'beretta ilegal', 'municao ilegal', 'municao sem nota',
  'explosivo caseiro', 'bomba artesanal', 'coquetel molotov',
  'granada caseira', 'tnt caseiro', 'polvora ilegal', 'silenciador ilegal',
  'matar', 'assassinar', 'eliminar', 'sequestrar', 'extorquir',
];

// ── Padrões suspeitos (regex) ─────────────────────────────────────────────────
const SUSPICIOUS_PATTERNS: RegExp[] = [
  /\b(g|gr|grama|gramas|kg|quilo|quilos|kilo|kilos)\s*(de)?\s*(coca|crack|maconha|po|pedra|erva|skank)\b/,
  /\b(real|reais|r\$|conto|mangos)\s*\d+.{0,20}(grama|kilo|pino|papelote)\b/,
  /\b\d+.{0,10}(grama|kilo|pino|papelote).{0,20}(real|reais|r\$)\b/,
  /\b(pistola|revolver|fuzil|espingarda|glock|beretta|taurus).{0,30}(r\$|\d+\s*mil|reais)\b/,
  /\bvou\s+te\s+(matar|bater|acabar|foder|quebrar|cortar)\b/,
  /\bvou\s+(matar|bater|acabar|foder|quebrar)\s+(voce|voce|vc)\b/,
  // apps de mensagem + número (tentativa de sair do app)
  /\b(zap|zappy|whats|whatsapp|telegram|signal|insta|instagram|face)\b/,
];

export interface FilterResult {
  blocked: boolean;
  reason?: 'profanity' | 'drugs' | 'weapons' | 'suspicious' | 'phone';
}

export function filterContent(rawText: string): FilterResult {
  // Telefone — usa texto bruto para preservar dígitos
  if (hasPhoneNumber(rawText)) return { blocked: true, reason: 'phone' };

  const n = normalize(rawText);

  for (const word of PROFANITY) {
    if (n.includes(word)) return { blocked: true, reason: 'profanity' };
  }
  for (const word of DRUGS) {
    if (n.includes(word)) return { blocked: true, reason: 'drugs' };
  }
  for (const word of WEAPONS) {
    if (n.includes(word)) return { blocked: true, reason: 'weapons' };
  }
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(n)) return { blocked: true, reason: 'suspicious' };
  }

  return { blocked: false };
}
