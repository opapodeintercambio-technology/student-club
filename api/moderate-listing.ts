// Vercel serverless — analisa conteúdo de anúncios via IA (Anthropic Claude)
// e bloqueia usuários que violam as regras da plataforma.
//
// Env vars necessárias no Vercel dashboard:
//   ANTHROPIC_API_KEY  — chave da API Anthropic (claude-haiku)
//                        obter em: console.anthropic.com
//   (Opcional) SUPABASE_SERVICE_KEY — service role key do Supabase para operações admin
//              sem ela, o bloqueio é feito via RPC (SECURITY DEFINER) com anon key

const SUPABASE_URL = 'https://xrnpshtgffovflgkuvgp.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhybnBzaHRnZmZvdmZsZ2t1dmdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NjkzNDcsImV4cCI6MjA5MjQ0NTM0N30.78iiMIrbpPZI-kycxuJ29_RnRe-30xiferzFat4xH8g';

// ── Análise via Claude ───────────────────────────────────────────────────────
async function analyzeWithClaude(
  title: string,
  description: string,
  category: string,
  imageUrls: string[],
  apiKey: string,
): Promise<{ approved: boolean; violation?: string; details?: string }> {
  const contentBlocks: any[] = [];

  // Adiciona imagens (máx 5) — Claude 3 suporta URLs diretamente
  for (const url of imageUrls.slice(0, 5)) {
    if (url && url.startsWith('http')) {
      contentBlocks.push({
        type: 'image',
        source: { type: 'url', url },
      });
    }
  }

  contentBlocks.push({
    type: 'text',
    text: `Você é um moderador de conteúdo para o Papo de Alunos, aplicativo brasileiro de trocas e doações.
Analise este anúncio (título, descrição e imagens acima) e determine se viola as regras.

TÍTULO: ${title}
CATEGORIA: ${category}
DESCRIÇÃO: ${description}

VIOLAÇÕES QUE CAUSAM BLOQUEIO IMEDIATO:
1. Armas de fogo, munições, explosivos, facas como armas ofensivas
2. Drogas ilegais (cocaína, crack, maconha, MDMA, LSD, heroína, anfetaminas etc.)
3. Prostituição, acompanhantes ou qualquer tipo de serviço sexual
4. Pornografia ou conteúdo sexual explícito de qualquer natureza
5. Tráfico humano, exploração de menores ou material pedófilo
6. Animais silvestres ou espécies em extinção para comércio ilegal
7. Incitação à violência, racismo, homofobia ou discriminação

PERMITIDO (não bloquear):
- Eletrônicos, roupas, calçados, livros, móveis, brinquedos, jogos, esportes
- Animais domésticos comuns (cães, gatos, aves domésticas comuns)
- Itens automotivos, ferramentas, instrumentos musicais, arte
- Qualquer item doméstico ou de uso cotidiano legal

Responda SOMENTE com JSON válido, sem markdown, sem explicações extras:
Se aprovado: {"approved":true}
Se violação: {"approved":false,"violation":"armas|drogas|prostituicao|pornografia|trafico|animais_ilegais|odio","details":"Descrição objetiva da violação em português, máximo 80 palavras"}`,
  });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 256,
      messages: [{ role: 'user', content: contentBlocks }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error: ${response.status} — ${err.slice(0, 200)}`);
  }

  const data = await response.json();
  const text: string = data.content?.[0]?.text || '{"approved":true}';

  try {
    // Remove possíveis markdown fences antes de parsear
    const clean = text.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    console.error('[moderate-listing] Claude returned non-JSON:', text);
    return { approved: true }; // fail-open: não bloqueia se a IA não responder corretamente
  }
}

// ── Bloqueia usuário via RPC (SECURITY DEFINER) ──────────────────────────────
async function blockUser(
  username: string,
  motivo: string,
  serviceKey?: string,
): Promise<boolean> {
  const authKey = serviceKey || SUPABASE_ANON_KEY;

  // Tenta via RPC (função SECURITY DEFINER — não precisa de service key)
  const rpc = await fetch(`${SUPABASE_URL}/rest/v1/rpc/bloquear_usuario`, {
    method: 'POST',
    headers: {
      apikey: authKey,
      Authorization: `Bearer ${authKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_username: username, p_motivo: motivo, p_por: 'sistema_ia' }),
  });

  if (rpc.ok) return true;

  // Fallback: PATCH direto (funciona só com service key)
  if (serviceKey) {
    const patch = await fetch(
      `${SUPABASE_URL}/rest/v1/usuarios?username=eq.${encodeURIComponent(username)}`,
      {
        method: 'PATCH',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          status_conta: 'bloqueada',
          motivo_bloqueio: motivo,
          bloqueado_em: new Date().toISOString(),
          bloqueado_por: 'sistema_ia',
        }),
      },
    );
    return patch.ok;
  }

  console.error('[moderate-listing] Failed to block user — RPC failed and no service key');
  return false;
}

// ── Notifica admins ──────────────────────────────────────────────────────────
async function notifyAdmins(
  username: string,
  violation: string,
  details: string,
  title: string,
  category: string,
  host: string,
) {
  const adminEmails = ['guilherme_lima_bh@yahoo.com.br', 'yuriking33@gmail.com'];
  const baseUrl = host.startsWith('localhost') ? 'http://localhost:3000' : `https://${host}`;

  await Promise.allSettled(
    adminEmails.map(email =>
      fetch(`${baseUrl}/api/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientEmail: email,
          type: 'admin_bloqueio',
          fromUsername: username,
          extra: { violation, details, anuncioTitle: title, category },
        }),
      }),
    ),
  );
}

// ── Handler principal ────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const ANTHROPIC_API_KEY   = process.env.ANTHROPIC_API_KEY || '';
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

  const { title, description, category, imageUrls = [], username } = req.body ?? {};

  if (!title || !username) {
    return res.status(400).json({ error: 'missing params: title and username required' });
  }

  // Sem chave Anthropic — aprova direto (não trava o fluxo em dev)
  if (!ANTHROPIC_API_KEY) {
    console.warn('[moderate-listing] ANTHROPIC_API_KEY not configured — auto-approving');
    return res.status(200).json({ approved: true });
  }

  try {
    const result = await analyzeWithClaude(
      title,
      description || '',
      category || 'Outros',
      imageUrls,
      ANTHROPIC_API_KEY,
    );

    if (!result.approved) {
      const motivo = result.details || result.violation || 'Conteúdo proibido detectado pelo sistema de moderação';

      // Bloqueia o usuário
      const blocked = await blockUser(username, motivo, SUPABASE_SERVICE_KEY || undefined);
      console.log(`[moderate-listing] User @${username} blocked: ${blocked} | reason: ${result.violation}`);

      // Notifica admins
      const host = req.headers.host || 'papodealunos.com';
      notifyAdmins(username, result.violation || 'desconhecido', motivo, title, category || '', host).catch(
        e => console.error('[moderate-listing] Admin notification failed:', e),
      );
    }

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('[moderate-listing] Unexpected error:', error?.message || error);
    // Fail-open: em caso de erro de API, aprova para não prejudicar usuários legítimos
    return res.status(200).json({ approved: true });
  }
}
