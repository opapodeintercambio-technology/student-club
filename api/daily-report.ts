// Vercel serverless — relatorio diario do Student Club via email.
//
// Dispara automaticamente todo dia as 22:00 BRT (= 01:00 UTC) via Vercel Cron
// (config em vercel.json). Tambem pode ser disparado manualmente via:
//   curl -H "Authorization: Bearer $CRON_SECRET" https://studentclub.app/api/daily-report
//
// Coleta:
//   - Total de usuarios cadastrados
//   - Novos cadastros HOJE (BRT)
//   - Posts feitos HOJE (com username)
//   - Stories postados HOJE (com username)
//   - Mensagens trocadas HOJE
//   - DAU = total de usuarios distintos com atividade HOJE
//     (postaram + storiaram + mandaram mensagem + se cadastraram)
//
// Env vars necessarias:
//   SUPABASE_URL                — projeto Supabase
//   SUPABASE_SERVICE_ROLE_KEY   — service role (bypass RLS)
//   RESEND_API_KEY              — Resend
//   FROM_EMAIL                  — remetente (ex: "Student Club <noreply@studentclub.app>")
//   CRON_SECRET                 — token pra autenticar chamada cron
//                                 (Vercel injeta automaticamente no header Authorization)

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'Student Club <noreply@studentclub.app>';
const CRON_SECRET = process.env.CRON_SECRET || '';

// Espelha src/app/utils/admin.ts ADMIN_EMAILS — manter em sync.
const ADMIN_EMAILS = ['guilherme_lima_bh@yahoo.com.br', 'tipapointercambio@gmail.com'];

// ── Helpers Supabase ─────────────────────────────────────────────────────────
async function sb(path: string): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'count=exact',
    },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Supabase ${path}: ${res.status} ${t.slice(0, 200)}`);
  }
  // Pega header content-range pra contagens exatas
  const range = res.headers.get('content-range') || '';
  const total = parseInt(range.split('/')[1] || '0', 10) || 0;
  const data = await res.json();
  return { data, total };
}

// ── Janela de tempo do relatorio ─────────────────────────────────────────────
// "HOJE" eh o dia atual em BRT (UTC-3). Calcula start/end em ISO UTC.
function brtDayRange(): { startUtc: string; endUtc: string; dateLabel: string } {
  const now = new Date();
  // BRT = UTC - 3h. Converte now pra BRT pra pegar a data BRT correta.
  const brtNow = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const yyyy = brtNow.getUTCFullYear();
  const mm = String(brtNow.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(brtNow.getUTCDate()).padStart(2, '0');
  // Inicio do dia BRT = 00:00:00 BRT = 03:00:00 UTC
  const startUtc = `${yyyy}-${mm}-${dd}T03:00:00.000Z`;
  // Fim do dia BRT = 23:59:59 BRT = 02:59:59 UTC do dia seguinte
  const next = new Date(Date.UTC(yyyy, brtNow.getUTCMonth(), brtNow.getUTCDate() + 1, 3, 0, 0));
  const endUtc = next.toISOString();
  const dateLabel = `${dd}/${mm}/${yyyy}`;
  return { startUtc, endUtc, dateLabel };
}

// ── Coleta de stats ──────────────────────────────────────────────────────────
interface DailyStats {
  dateLabel: string;
  totalUsers: number;
  newUsersToday: number;
  newUsersList: Array<{ username: string; email: string; cidade: string; estado: string; created_at: string }>;
  postsToday: number;
  postsByUser: Record<string, number>;
  storiesToday: number;
  storiesByUser: Record<string, number>;
  messagesToday: number;
  dau: number;
}

async function gatherStats(): Promise<DailyStats> {
  const { startUtc, endUtc, dateLabel } = brtDayRange();
  const gte = `gte.${startUtc}`;
  const lt = `lt.${endUtc}`;

  // 1) Total de usuarios
  const totalRes = await sb('usuarios?select=id&limit=1');

  // 2) Novos cadastros hoje (com detalhes)
  const newUsers = await sb(
    `usuarios?select=username,email,cidade,estado,created_at&created_at=${gte}&created_at=${lt}&order=created_at.asc&limit=200`,
  );

  // 3) Posts hoje
  const posts = await sb(
    `feed_posts?select=username,created_at&created_at=${gte}&created_at=${lt}&limit=500`,
  );
  const postsByUser: Record<string, number> = {};
  for (const p of posts.data) {
    postsByUser[p.username] = (postsByUser[p.username] || 0) + 1;
  }

  // 4) Stories hoje
  const stories = await sb(
    `stories_demo?select=username,created_at&created_at=${gte}&created_at=${lt}&limit=500`,
  );
  const storiesByUser: Record<string, number> = {};
  for (const s of stories.data) {
    storiesByUser[s.username] = (storiesByUser[s.username] || 0) + 1;
  }

  // 5) Mensagens trocadas hoje
  const msgs = await sb(
    `mensagens?select=remetente&created_at=${gte}&created_at=${lt}&limit=2000`,
  );

  // 6) DAU = usuarios distintos que tiveram QUALQUER atividade hoje
  //    (novos cadastros + posts + stories + mensagens)
  const activeSet = new Set<string>();
  newUsers.data.forEach((u: any) => activeSet.add(u.username));
  posts.data.forEach((p: any) => activeSet.add(p.username));
  stories.data.forEach((s: any) => activeSet.add(s.username));
  msgs.data.forEach((m: any) => activeSet.add(m.remetente));

  return {
    dateLabel,
    totalUsers: totalRes.total,
    newUsersToday: newUsers.total,
    newUsersList: newUsers.data,
    postsToday: posts.total,
    postsByUser,
    storiesToday: stories.total,
    storiesByUser,
    messagesToday: msgs.total,
    dau: activeSet.size,
  };
}

// ── Builder do HTML do relatorio ─────────────────────────────────────────────
function buildReportHtml(s: DailyStats): string {
  const topPosters = Object.entries(s.postsByUser).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const topStorias = Object.entries(s.storiesByUser).sort((a, b) => b[1] - a[1]).slice(0, 10);

  const newUsersTable = s.newUsersList.length
    ? s.newUsersList.map(u =>
        `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">@${u.username}</td>
         <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#666;font-size:13px">${u.email}</td>
         <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#666;font-size:13px">${u.cidade || '-'}/${u.estado || '-'}</td></tr>`,
      ).join('')
    : `<tr><td colspan="3" style="padding:10px;color:#999;font-style:italic;text-align:center">Nenhum cadastro hoje</td></tr>`;

  const postsTable = topPosters.length
    ? topPosters.map(([u, c]) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">@${u}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:700;color:#169B62">${c}</td></tr>`).join('')
    : `<tr><td colspan="2" style="padding:10px;color:#999;font-style:italic;text-align:center">Nenhum post hoje</td></tr>`;

  const storiesTable = topStorias.length
    ? topStorias.map(([u, c]) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">@${u}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:700;color:#FF883E">${c}</td></tr>`).join('')
    : `<tr><td colspan="2" style="padding:10px;color:#999;font-style:italic;text-align:center">Nenhum story hoje</td></tr>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Relatório diário — ${s.dateLabel}</title></head>
<body style="margin:0;padding:0;background:#f0f0f5;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f5;padding:24px 12px">
  <tr><td align="center">
    <table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e0e0e0;box-shadow:0 2px 12px rgba(0,0,0,0.08)">

      <!-- HEADER Irlanda -->
      <tr><td style="background:linear-gradient(135deg,#169B62 0%,#1FB573 50%,#FF883E 100%);padding:24px 32px;text-align:center">
        <p style="margin:0;color:rgba(255,255,255,0.95);font-size:13px;letter-spacing:3px;text-transform:uppercase;font-weight:700">STUDENT CLUB · ADMIN</p>
        <h1 style="margin:6px 0 0;color:#fff;font-size:24px;font-weight:800">📊 Relatório diário — ${s.dateLabel}</h1>
      </td></tr>

      <!-- KPIs principais -->
      <tr><td style="padding:24px 32px 8px">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="50%" style="padding:14px;background:#e8f5ee;border-radius:12px;text-align:center" valign="middle">
              <p style="margin:0;font-size:36px;font-weight:900;color:#169B62;line-height:1">${s.totalUsers}</p>
              <p style="margin:4px 0 0;font-size:12px;color:#0d5e3a;font-weight:700;text-transform:uppercase;letter-spacing:1px">Total usuários</p>
            </td>
            <td width="14"></td>
            <td width="50%" style="padding:14px;background:#fff4eb;border-radius:12px;text-align:center" valign="middle">
              <p style="margin:0;font-size:36px;font-weight:900;color:#FF883E;line-height:1">${s.dau}</p>
              <p style="margin:4px 0 0;font-size:12px;color:#a14808;font-weight:700;text-transform:uppercase;letter-spacing:1px">DAU (ativos hoje)</p>
            </td>
          </tr>
        </table>
      </td></tr>

      <!-- KPIs secundários -->
      <tr><td style="padding:8px 32px 20px">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="25%" style="padding:12px 8px;background:#fafafa;border-radius:10px;text-align:center" valign="middle">
              <p style="margin:0;font-size:22px;font-weight:900;color:#169B62;line-height:1">${s.newUsersToday}</p>
              <p style="margin:4px 0 0;font-size:10px;color:#666;font-weight:700;text-transform:uppercase">Novos cadastros</p>
            </td>
            <td width="8"></td>
            <td width="25%" style="padding:12px 8px;background:#fafafa;border-radius:10px;text-align:center" valign="middle">
              <p style="margin:0;font-size:22px;font-weight:900;color:#169B62;line-height:1">${s.postsToday}</p>
              <p style="margin:4px 0 0;font-size:10px;color:#666;font-weight:700;text-transform:uppercase">Posts</p>
            </td>
            <td width="8"></td>
            <td width="25%" style="padding:12px 8px;background:#fafafa;border-radius:10px;text-align:center" valign="middle">
              <p style="margin:0;font-size:22px;font-weight:900;color:#FF883E;line-height:1">${s.storiesToday}</p>
              <p style="margin:4px 0 0;font-size:10px;color:#666;font-weight:700;text-transform:uppercase">Stories</p>
            </td>
            <td width="8"></td>
            <td width="25%" style="padding:12px 8px;background:#fafafa;border-radius:10px;text-align:center" valign="middle">
              <p style="margin:0;font-size:22px;font-weight:900;color:#FF883E;line-height:1">${s.messagesToday}</p>
              <p style="margin:4px 0 0;font-size:10px;color:#666;font-weight:700;text-transform:uppercase">Mensagens</p>
            </td>
          </tr>
        </table>
      </td></tr>

      <!-- Novos cadastros (detalhe) -->
      <tr><td style="padding:8px 32px 0">
        <p style="margin:0 0 8px;font-size:14px;font-weight:800;color:#169B62;text-transform:uppercase;letter-spacing:1px">🆕 Novos cadastros (${s.newUsersToday})</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:8px;overflow:hidden;font-size:14px">
          <tr style="background:#fafafa">
            <td style="padding:8px 10px;font-weight:700;color:#444;font-size:12px;text-transform:uppercase;letter-spacing:0.5px">Username</td>
            <td style="padding:8px 10px;font-weight:700;color:#444;font-size:12px;text-transform:uppercase;letter-spacing:0.5px">Email</td>
            <td style="padding:8px 10px;font-weight:700;color:#444;font-size:12px;text-transform:uppercase;letter-spacing:0.5px">Cidade</td>
          </tr>
          ${newUsersTable}
        </table>
      </td></tr>

      <!-- Top posters -->
      <tr><td style="padding:24px 32px 0">
        <p style="margin:0 0 8px;font-size:14px;font-weight:800;color:#169B62;text-transform:uppercase;letter-spacing:1px">📝 Quem postou no feed (${s.postsToday})</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:8px;overflow:hidden;font-size:14px">
          <tr style="background:#fafafa">
            <td style="padding:8px 10px;font-weight:700;color:#444;font-size:12px;text-transform:uppercase;letter-spacing:0.5px">Username</td>
            <td style="padding:8px 10px;font-weight:700;color:#444;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;text-align:right">Posts</td>
          </tr>
          ${postsTable}
        </table>
      </td></tr>

      <!-- Top storiers -->
      <tr><td style="padding:24px 32px 24px">
        <p style="margin:0 0 8px;font-size:14px;font-weight:800;color:#FF883E;text-transform:uppercase;letter-spacing:1px">📸 Quem postou story (${s.storiesToday})</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:8px;overflow:hidden;font-size:14px">
          <tr style="background:#fafafa">
            <td style="padding:8px 10px;font-weight:700;color:#444;font-size:12px;text-transform:uppercase;letter-spacing:0.5px">Username</td>
            <td style="padding:8px 10px;font-weight:700;color:#444;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;text-align:right">Stories</td>
          </tr>
          ${storiesTable}
        </table>
      </td></tr>

      <!-- FOOTER -->
      <tr><td style="padding:18px 32px 24px;background:#fafafa;border-top:1px solid #eee;text-align:center">
        <p style="margin:0;color:#999;font-size:12px;line-height:1.6">
          Relatório automático · Disparado às 22:00 (BRT) · <a href="https://studentclub.app" style="color:#169B62;text-decoration:none;font-weight:700">studentclub.app</a>
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

// ── Texto plain pra clients que nao renderizam HTML ──────────────────────────
function buildReportText(s: DailyStats): string {
  const lines: string[] = [];
  lines.push(`STUDENT CLUB — Relatório diário ${s.dateLabel}`);
  lines.push('');
  lines.push(`Total usuários: ${s.totalUsers}`);
  lines.push(`DAU (ativos hoje): ${s.dau}`);
  lines.push(`Novos cadastros: ${s.newUsersToday}`);
  lines.push(`Posts hoje: ${s.postsToday}`);
  lines.push(`Stories hoje: ${s.storiesToday}`);
  lines.push(`Mensagens hoje: ${s.messagesToday}`);
  lines.push('');
  if (s.newUsersList.length) {
    lines.push('— NOVOS CADASTROS —');
    for (const u of s.newUsersList) lines.push(`  @${u.username} (${u.email}) — ${u.cidade || '-'}/${u.estado || '-'}`);
  }
  lines.push('');
  if (Object.keys(s.postsByUser).length) {
    lines.push('— POSTS POR USUARIO —');
    for (const [u, c] of Object.entries(s.postsByUser).sort((a, b) => b[1] - a[1])) lines.push(`  @${u}: ${c}`);
  }
  lines.push('');
  if (Object.keys(s.storiesByUser).length) {
    lines.push('— STORIES POR USUARIO —');
    for (const [u, c] of Object.entries(s.storiesByUser).sort((a, b) => b[1] - a[1])) lines.push(`  @${u}: ${c}`);
  }
  return lines.join('\n');
}

// ── Envia via Resend pra cada admin ──────────────────────────────────────────
async function sendReportEmail(s: DailyStats): Promise<{ ok: boolean; results: any[] }> {
  if (!RESEND_API_KEY) return { ok: false, results: [{ error: 'RESEND_API_KEY missing' }] };

  const html = buildReportHtml(s);
  const text = buildReportText(s);
  const subject = `📊 Student Club — Relatório ${s.dateLabel} (${s.dau} DAU · ${s.newUsersToday} novos · ${s.postsToday} posts · ${s.storiesToday} stories)`;

  const sends = ADMIN_EMAILS.map(async (to) => {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, text, html }),
      });
      const data = await r.json();
      return { to, ok: r.ok, id: data.id, error: r.ok ? undefined : data };
    } catch (e: any) {
      return { to, ok: false, error: e.message };
    }
  });
  const results = await Promise.all(sends);
  return { ok: results.every(r => r.ok), results };
}

// ── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  // Autenticacao: Vercel Cron envia header Authorization: Bearer <CRON_SECRET>.
  // Para chamadas manuais (curl admin) tem que passar o mesmo Bearer.
  const auth = req.headers?.authorization || req.headers?.Authorization || '';
  const expected = `Bearer ${CRON_SECRET}`;
  if (CRON_SECRET && auth !== expected) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'supabase env not configured' });
  }

  try {
    const stats = await gatherStats();
    const sendResult = await sendReportEmail(stats);
    return res.status(200).json({
      ok: sendResult.ok,
      stats: {
        date: stats.dateLabel,
        totalUsers: stats.totalUsers,
        dau: stats.dau,
        newUsersToday: stats.newUsersToday,
        postsToday: stats.postsToday,
        storiesToday: stats.storiesToday,
        messagesToday: stats.messagesToday,
      },
      sent: sendResult.results,
    });
  } catch (e: any) {
    console.error('[daily-report]', e);
    return res.status(500).json({ error: e.message || 'unknown' });
  }
}
