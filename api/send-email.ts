// Vercel serverless — envia email via Resend (DKIM+SPF próprios de
// studentclub.app, deliverability garantida). Gmail SMTP fica só como
// fallback caso o Resend caia.
//
// Env vars necessárias no Vercel dashboard:
//   RESEND_API_KEY              — chave da API Resend (primária)
//   FROM_EMAIL                  — ex: "Student Club <noreply@studentclub.app>"
//   SUPABASE_URL                — URL do projeto Supabase (mesmo do frontend)
//   SUPABASE_SERVICE_ROLE_KEY   — service role pra ler tabela usuarios
//                                 sem RLS
//
// Opcionais (fallback Gmail — quase nunca usado):
//   GMAIL_USER  — endereço Gmail, ex: papodealunos.notif@gmail.com
//   GMAIL_PASS  — App Password de 16 chars (não a senha normal)
//
// HISTORICO: antes SUPABASE_URL e SUPABASE_ANON_KEY estavam HARDCODADOS
// no codigo apontando pro projeto antigo `xrnpshtgffovflgkuvgp` (que
// nem tinha mais os users novos do frontend `inlmhgroaucpkgetrckq`).
// Resultado: getUserEmail() retornava null pra qualquer user novo →
// email nunca enviado, falha silenciosa. Agora usa env vars apontando
// pro Supabase correto.

import nodemailer from 'nodemailer';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function getUserEmail(username: string): Promise<string | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('[send-email] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados');
    return null;
  }
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/usuarios?username=eq.${encodeURIComponent(username)}&select=email&limit=1`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      },
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return (rows[0]?.email as string) || null;
  } catch {
    return null;
  }
}

// ── Gmail SMTP sender ────────────────────────────────────────────────────────
async function sendViaGmail(opts: {
  user: string; pass: string;
  to: string; subject: string; text: string; html: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: opts.user, pass: opts.pass },
  });
  try {
    const info = await transporter.sendMail({
      from: `Student Club <${opts.user}>`,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      headers: {
        'List-Unsubscribe': `<mailto:${opts.user}?subject=cancelar>, <https://studentclub.app>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'X-Mailer': 'Student Club Notifications',
      },
    });
    return { ok: true, id: info.messageId };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

// ── Resend fallback ──────────────────────────────────────────────────────────
async function sendViaResend(opts: {
  apiKey: string; fromEmail: string;
  to: string; subject: string; text: string; html: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: opts.fromEmail,
      to: [opts.to],
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      headers: {
        'List-Unsubscribe': '<https://studentclub.app>',
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'X-Mailer': 'Student Club Notifications',
      },
    }),
  });
  const result = await r.json();
  if (!r.ok) return { ok: false, error: JSON.stringify(result) };
  return { ok: true, id: result.id };
}

// ── Email templates ──────────────────────────────────────────────────────────
// Student Club é a comunidade de intercambistas — rede social pra alunos
// brasileiros estudando fora. Emails dao suporte a notificacoes de chat,
// boas-vindas, e avisos administrativos. Tipos legados de marketplace
// (match/proposal/donation, com fromItem/productImage) foram removidos —
// nao eram chamados de lugar nenhum no frontend.
interface EmailContent {
  title: string;
  bodyHtml: string;
  cta: string;
  // Conteudo do chat (so usado no tipo 'message')
  messageContent?: string;
  datetime: string;
}

function buildHtml(c: EmailContent): string {
  // Bloco de conteúdo da mensagem (preview real). Cores Irlanda (verde+laranja).
  const msgBlock = c.messageContent
    ? `<div style="margin:0 0 20px;background:#e8f5ee;border-left:4px solid #169B62;border-radius:0 8px 8px 0;padding:14px 18px">
        <p style="margin:0;color:#555;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Mensagem recebida</p>
        <p style="margin:0;color:#222;font-size:15px;line-height:1.5;font-style:italic">"${c.messageContent.replace(/"/g, '&quot;')}"</p>
       </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>${c.title}</title></head>
<body style="margin:0;padding:0;background:#f0f0f5;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f5;padding:24px 12px">
  <tr><td align="center">
    <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e0e0e0;box-shadow:0 2px 12px rgba(0,0,0,0.08)">

      <!-- HEADER — cores bandeira da Irlanda (verde + branco + laranja) -->
      <tr><td style="background-color:#169B62;background:linear-gradient(135deg,#169B62 0%,#1FB573 50%,#FF883E 100%);padding:18px 32px 8px;text-align:center">
        <p style="margin:0;color:rgba(255,255,255,0.95);font-size:13px;letter-spacing:3px;text-transform:uppercase;font-weight:700">STUDENT CLUB</p>
        <h1 style="margin:4px 0 0;color:#fff;font-size:22px;font-weight:800;line-height:1.2">${c.title}</h1>
      </td></tr>

      <!-- SLOGAN: colado no header, sem gap nenhum -->
      <tr><td style="padding:0 16px;margin:0;background:#fff;text-align:center" valign="top">
        <h2 style="
          margin:0;
          padding:4px 0 0;
          font-family:Arial,Helvetica,sans-serif;
          font-size:36px;
          line-height:38px;
          font-weight:900;
          letter-spacing:-1px;
          color:#169B62;
          background:linear-gradient(135deg,#169B62 0%,#1FB573 50%,#FF883E 100%);
          -webkit-background-clip:text;
          background-clip:text;
          -webkit-text-fill-color:transparent;
          mso-line-height-rule:exactly;
        ">A comunidade de intercambistas do Brasil</h2>
      </td></tr>

      <!-- VISUAL HERO: imagem colada no slogan -->
      <tr><td style="padding:0;margin:0;font-size:0;line-height:0">
        <img src="https://studentclub.app/email-hero.jpg" alt="Student Club" width="580"
             style="display:block;width:100%;max-width:580px;height:auto;margin:0;padding:0;border:0" />
      </td></tr>

      <!-- BODY -->
      <tr><td style="padding:28px 32px 20px;color:#333;font-size:15px;line-height:1.7">
        <p style="margin:0 0 20px">${c.bodyHtml}</p>
        ${msgBlock}
        <!-- CTA — verde Irlanda → laranja -->
        <table width="100%" style="margin-top:24px"><tr><td align="center">
          <a href="https://studentclub.app" style="display:inline-block;background:linear-gradient(135deg,#169B62,#FF883E);color:#fff;text-decoration:none;padding:14px 36px;border-radius:50px;font-weight:800;font-size:15px;letter-spacing:0.5px">${c.cta} →</a>
        </td></tr></table>
      </td></tr>

      <!-- INFO BAR: data/hora -->
      <tr><td style="padding:14px 32px;background:#fafafa;border-top:1px solid #f0f0f0;text-align:center">
        <p style="margin:0;color:#777;font-size:15px">🕐 Enviado em <strong style="color:#444">${c.datetime}</strong></p>
      </td></tr>

      <!-- FOOTER — links verde Irlanda -->
      <tr><td style="padding:22px 32px 26px;border-top:1px solid #eee;text-align:center">
        <p style="margin:0 0 10px;color:#169B62;font-size:18px;font-weight:800;font-style:italic">"Conectados em qualquer canto do mundo"</p>
        <p style="margin:0 0 6px;color:#888;font-size:14px">Suporte: <a href="mailto:suporte@studentclub.app" style="color:#169B62;text-decoration:none;font-weight:700">suporte@studentclub.app</a></p>
        <p style="margin:0;color:#999;font-size:13px">Você recebe este aviso por ser usuário do <a href="https://studentclub.app" style="color:#169B62;text-decoration:none;font-weight:700">Student Club</a>.</p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

function buildText(c: EmailContent): string {
  const parts = [
    c.title,
    '',
    c.bodyHtml.replace(/<[^>]+>/g, ''),
    c.messageContent ? `\nMensagem: "${c.messageContent}"` : '',
    `\nEnviado em: ${c.datetime}`,
    `\n${c.cta}: https://studentclub.app`,
    '\n---',
    '"Conectados em qualquer canto do mundo"',
    'Suporte: suporte@studentclub.app',
    'studentclub.app',
  ];
  return parts.filter(Boolean).join('\n');
}

// ── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const GMAIL_USER     = process.env.GMAIL_USER;
  const GMAIL_PASS     = process.env.GMAIL_PASS;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const FROM_EMAIL     = process.env.FROM_EMAIL || 'Student Club <notificacoes@studentclub.app>';

  const { recipientUsername, recipientEmail, type, fromUsername, extra } = req.body ?? {};
  if (!type || !fromUsername || (!recipientUsername && !recipientEmail)) {
    return res.status(400).json({ error: 'missing params' });
  }

  // Permite enviar para um email direto (admin/notificações internas) sem precisar de username cadastrado
  let toEmail: string | null = recipientEmail || null;
  if (!toEmail && recipientUsername) {
    toEmail = await getUserEmail(recipientUsername);
  }
  if (!toEmail) {
    console.warn(`[send-email] email nao encontrado para username="${recipientUsername}"`);
    return res.status(200).json({ sent: false, reason: 'email not found' });
  }

  const datetime = new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  let subject: string;
  let emailContent: EmailContent;

  switch (type) {
    case 'message':
      subject = `Nova mensagem de @${fromUsername} - Student Club`;
      emailContent = {
        title: `Nova mensagem de @${fromUsername}`,
        bodyHtml: `<b>@${fromUsername}</b> te enviou uma mensagem no Student Club.`,
        cta: 'Ver mensagem',
        messageContent: extra?.messageContent ? String(extra.messageContent).slice(0, 300) : undefined,
        datetime,
      };
      break;
    case 'welcome':
      subject = `Bem-vindo ao Student Club, @${fromUsername}! 🎉`;
      emailContent = {
        title: `Seja bem-vindo, @${fromUsername}! 🎉`,
        bodyHtml: `
<p style="margin:0 0 18px;font-size:16px;color:#333;line-height:1.7">
  Estamos muito felizes em ter você aqui! O <b style="color:#169B62">Student Club</b> é a comunidade de intercambistas do Brasil — um espaço pra você se conectar com outros estudantes que estão fora do país, compartilhar a rotina do intercâmbio e tirar dúvidas com quem já viveu o que você está prestes a viver.
</p>

<div style="background:linear-gradient(135deg,#e8f5ee,#fff4eb);border-radius:12px;padding:20px 24px;margin:0 0 20px;border-left:4px solid #169B62">
  <p style="margin:0 0 8px;font-size:15px;font-weight:800;color:#169B62;letter-spacing:0.5px;text-transform:uppercase">Vivência real, conexão real</p>
  <p style="margin:0;font-size:15px;color:#444;line-height:1.7">
    Intercâmbio não é só estudar fora — é a maior experiência de vida que você pode ter. E ninguém entende isso melhor do que outro intercambista. Aqui você encontra quem está no mesmo voo que você (literalmente ou não).
  </p>
</div>

<p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#333">O que você pode fazer no Student Club:</p>
<table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 20px">
  <tr>
    <td width="36" valign="top" style="padding-top:2px">
      <span style="display:inline-block;width:28px;height:28px;background:#169B62;border-radius:50%;text-align:center;line-height:28px;color:#fff;font-weight:900;font-size:13px">1</span>
    </td>
    <td style="padding-left:10px;padding-bottom:14px">
      <b style="color:#222">Compartilhe sua jornada</b><br>
      <span style="color:#555;font-size:14px">Posta no feed, sobe story, mostra o dia a dia do país onde você está. Inspire e seja inspirado por outros intercambistas.</span>
    </td>
  </tr>
  <tr>
    <td width="36" valign="top" style="padding-top:2px">
      <span style="display:inline-block;width:28px;height:28px;background:#FF883E;border-radius:50%;text-align:center;line-height:28px;color:#fff;font-weight:900;font-size:13px">2</span>
    </td>
    <td style="padding-left:10px;padding-bottom:14px">
      <b style="color:#222">Conecte com outros alunos</b><br>
      <span style="color:#555;font-size:14px">Chat 1-a-1, grupos por cidade ou país. Encontre parceiros pra viajar no fim de semana, dividir aluguel ou só tomar um café.</span>
    </td>
  </tr>
  <tr>
    <td width="36" valign="top" style="padding-top:2px">
      <span style="display:inline-block;width:28px;height:28px;background:#169B62;border-radius:50%;text-align:center;line-height:28px;color:#fff;font-weight:900;font-size:13px">3</span>
    </td>
    <td style="padding-left:10px;padding-bottom:14px">
      <b style="color:#222">Organize sua viagem</b><br>
      <span style="color:#555;font-size:14px">Painel "Sua Viagem" com checklist de documentos (passaporte, vacinação, carta da escola), controle de gastos da viagem e dicas pré-embarque. Tudo num lugar só.</span>
    </td>
  </tr>
  <tr>
    <td width="36" valign="top" style="padding-top:2px">
      <span style="display:inline-block;width:28px;height:28px;background:#FF883E;border-radius:50%;text-align:center;line-height:28px;color:#fff;font-weight:900;font-size:13px">4</span>
    </td>
    <td style="padding-left:10px;padding-bottom:0">
      <b style="color:#222">Tire dúvidas com a comunidade</b><br>
      <span style="color:#555;font-size:14px">Quem já passou pela sua escola, sua cidade, seu programa — está aqui pra te ajudar. Pergunta sem vergonha.</span>
    </td>
  </tr>
</table>

<div style="background:#e8f5ee;border-radius:12px;padding:16px 20px;margin:0 0 20px;border-left:4px solid #169B62">
  <p style="margin:0;font-size:14px;color:#0d5e3a;line-height:1.6">
    🍀 <b>Por que a comunidade importa:</b> intercâmbio sozinho é difícil. Com gente do seu lado vivendo o mesmo momento, vira a melhor experiência da sua vida.
  </p>
</div>

<p style="margin:0;font-size:15px;color:#333;line-height:1.7">
  Seu perfil está pronto. Bora começar — explora o feed, descobre quem está no seu destino e faz suas primeiras conexões. <b style="color:#169B62">A comunidade está te esperando.</b>
</p>`,
        cta: 'Entrar na comunidade',
        datetime,
      };
      break;
    case 'admin_signup':
      subject = `[Student Club] Novo cadastro: @${fromUsername}`;
      emailContent = {
        title: `🎉 Novo usuário cadastrado`,
        bodyHtml: `<b>@${fromUsername}</b> acabou de se cadastrar no Student Club.<br><br>
          <b>Username:</b> @${fromUsername}<br>
          ${extra?.email ? `<b>Email:</b> ${extra.email}<br>` : ''}
          ${extra?.cidade ? `<b>Cidade:</b> ${extra.cidade}${extra?.estado ? '/' + extra.estado : ''}<br>` : ''}
          ${extra?.tipoConta ? `<b>Tipo de conta:</b> ${extra.tipoConta === 'pj' ? 'Pessoa Jurídica' : 'Pessoa Física'}<br>` : ''}
          ${extra?.nomeEmpresa ? `<b>Empresa:</b> ${extra.nomeEmpresa}<br>` : ''}
          <br><b>Cadastrado em:</b> ${datetime}`,
        cta: 'Abrir Student Club',
        datetime,
      };
      break;
    case 'admin_denuncia':
      subject = `🚨 [Student Club] Nova denúncia (${extra?.motivo || 'sem motivo'})`;
      emailContent = {
        title: `🚨 Nova denúncia recebida`,
        bodyHtml: `Uma denúncia foi enviada e precisa ser analisada em até <b>24 horas</b>.<br><br>
          <b>Denunciante:</b> @${fromUsername}<br>
          <b>Tipo do alvo:</b> ${extra?.alvoTipo || '-'}<br>
          <b>Alvo:</b> ${extra?.alvoNome || extra?.alvoId || '-'}<br>
          <b>ID do alvo:</b> ${extra?.alvoId || '-'}<br>
          <b>Motivo:</b> ${extra?.motivo || '-'}<br>
          ${extra?.descricao ? `<b>Descrição:</b> ${extra.descricao}<br>` : ''}
          <br><b>Recebida em:</b> ${datetime}<br><br>
          <b>Ação necessária:</b> verifique o conteúdo, remova se necessário, e responda ao denunciante.`,
        cta: 'Abrir Student Club',
        datetime,
      };
      break;
    case 'admin_bloqueio':
      subject = `🔴 [Student Club] Usuário bloqueado por IA: @${fromUsername}`;
      emailContent = {
        title: `🔴 Usuário bloqueado automaticamente`,
        bodyHtml: `O usuário <b>@${fromUsername}</b> foi bloqueado automaticamente pelo sistema de moderação de IA.<br><br>
          <b>Tipo de violação:</b> ${extra?.violation || '-'}<br>
          ${extra?.details ? `<b>Detalhes:</b> ${extra.details}<br>` : ''}
          ${extra?.anuncioTitle ? `<b>Anúncio:</b> "${extra.anuncioTitle}"<br>` : ''}
          ${extra?.category ? `<b>Categoria:</b> ${extra.category}<br>` : ''}
          <br><b>Bloqueado em:</b> ${datetime}<br><br>
          <b>Para desbloquear:</b> acesse o Supabase Dashboard → Table Editor → usuarios → localize <code>@${fromUsername}</code> → altere <code>status_conta</code> para <code>ativa</code> e limpe <code>motivo_bloqueio</code>.<br><br>
          Ou use: <code>SELECT desbloquear_usuario('${fromUsername}');</code>`,
        cta: 'Abrir Student Club',
        datetime,
      };
      break;
    case 'suporte_desbloqueio':
      subject = `[Student Club] Pedido de desbloqueio: @${fromUsername}`;
      emailContent = {
        title: `Pedido de revisão de bloqueio`,
        bodyHtml: `O usuário <b>@${fromUsername}</b> está solicitando revisão do bloqueio de conta.<br><br>
          ${extra?.mensagem ? `<b>Mensagem do usuário:</b><br><em>"${String(extra.mensagem).slice(0, 1000)}"</em><br><br>` : ''}
          <b>Email do usuário:</b> ${extra?.email || 'não informado'}<br>
          <b>Enviado em:</b> ${datetime}<br><br>
          Para desbloquear: <code>SELECT desbloquear_usuario('${fromUsername}');</code>`,
        cta: 'Abrir Student Club',
        datetime,
      };
      break;
    default:
      return res.status(400).json({ error: 'invalid type' });
  }

  const html = buildHtml(emailContent);
  const text = buildText(emailContent);

  // Resend primeiro — envia de @studentclub.app com DKIM+SPF+DMARC alinhados (inbox garantido)
  if (RESEND_API_KEY) {
    console.log(`[send-email] via Resend → "${toEmail}" tipo="${type}"`);
    const result = await sendViaResend({ apiKey: RESEND_API_KEY, fromEmail: FROM_EMAIL, to: toEmail, subject, text, html });
    if (result.ok) {
      console.log(`[send-email] Resend ok id=${result.id}`);
      return res.status(200).json({ sent: true, id: result.id, via: 'resend' });
    }
    console.error(`[send-email] Resend falhou: ${result.error} — tentando Gmail`);
  }

  // Fallback: Gmail SMTP
  if (GMAIL_USER && GMAIL_PASS) {
    console.log(`[send-email] via Gmail SMTP → "${toEmail}" tipo="${type}"`);
    const result = await sendViaGmail({ user: GMAIL_USER, pass: GMAIL_PASS, to: toEmail, subject, text, html });
    if (result.ok) {
      console.log(`[send-email] Gmail ok id=${result.id}`);
      return res.status(200).json({ sent: true, id: result.id, via: 'gmail' });
    }
    console.error(`[send-email] Gmail falhou: ${result.error}`);
    return res.status(200).json({ sent: false, error: result.error });
  }

  console.warn('[send-email] nenhum provider configurado (RESEND_API_KEY ou GMAIL_USER/GMAIL_PASS)');
  return res.status(200).json({ sent: false, reason: 'no provider configured' });
}
