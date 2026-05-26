// Vercel serverless — envia email via Gmail SMTP (Nodemailer)
// Yahoo, Gmail e qualquer provedor confiam completamente em IPs do Gmail.
//
// Env vars necessárias no Vercel dashboard:
//   GMAIL_USER  — endereço Gmail, ex: papodealunos.notif@gmail.com
//   GMAIL_PASS  — App Password de 16 chars (não a senha normal)
//                 Gerar em: myaccount.google.com > Segurança > Senhas de app
//
// Fallback: se GMAIL_USER/PASS não estiver configurado, usa Resend como backup.
//   RESEND_API_KEY — chave da API Resend

import nodemailer from 'nodemailer';

const SUPABASE_URL = 'https://xrnpshtgffovflgkuvgp.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhybnBzaHRnZmZvdmZsZ2t1dmdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NjkzNDcsImV4cCI6MjA5MjQ0NTM0N30.78iiMIrbpPZI-kycxuJ29_RnRe-30xiferzFat4xH8g';

async function getUserEmail(username: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/usuarios?username=eq.${encodeURIComponent(username)}&select=email&limit=1`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
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
interface EmailContent {
  title: string;
  bodyHtml: string;
  cta: string;
  // extras
  messageContent?: string;
  productImage?: string;
  productTitle?: string;
  fromItemImage?: string;
  fromItemTitle?: string;
  datetime: string;
}

function buildHtml(c: EmailContent): string {
  // Bloco de conteúdo da mensagem (preview real)
  const msgBlock = c.messageContent
    ? `<div style="margin:0 0 20px;background:#f5f0ff;border-left:4px solid #7c3aed;border-radius:0 8px 8px 0;padding:14px 18px">
        <p style="margin:0;color:#555;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Mensagem recebida</p>
        <p style="margin:0;color:#222;font-size:15px;line-height:1.5;font-style:italic">"${c.messageContent.replace(/"/g, '&quot;')}"</p>
       </div>`
    : '';

  // Bloco de imagem do produto (match / doação)
  const productImgBlock = c.productImage && !c.fromItemImage
    ? `<div style="margin:0 0 20px;text-align:center">
        <img src="${c.productImage}" alt="${c.productTitle || 'Produto'}" width="180" height="180"
             style="border-radius:12px;object-fit:cover;border:2px solid #e0e0e0;display:inline-block" />
        ${c.productTitle ? `<p style="margin:8px 0 0;color:#555;font-size:13px;font-weight:600">${c.productTitle}</p>` : ''}
       </div>`
    : '';

  // Bloco troca: item oferecido ↔ item desejado (proposta)
  const tradeBlock = c.fromItemImage && c.productImage
    ? `<div style="margin:0 0 20px;display:flex;align-items:center;justify-content:center;gap:0">
        <table cellpadding="0" cellspacing="0" width="100%"><tr>
          <td align="center" width="45%">
            <img src="${c.fromItemImage}" alt="${c.fromItemTitle || 'Oferecido'}" width="130" height="130"
                 style="border-radius:10px;object-fit:cover;border:2px solid #7c3aed;display:block;margin:0 auto" />
            <p style="margin:6px 0 0;color:#7c3aed;font-size:12px;font-weight:700;text-transform:uppercase">Oferece</p>
            ${c.fromItemTitle ? `<p style="margin:2px 0 0;color:#333;font-size:13px">${c.fromItemTitle}</p>` : ''}
          </td>
          <td align="center" width="10%">
            <p style="margin:0;font-size:26px;color:#f97316;font-weight:900">⇄</p>
          </td>
          <td align="center" width="45%">
            <img src="${c.productImage}" alt="${c.productTitle || 'Desejado'}" width="130" height="130"
                 style="border-radius:10px;object-fit:cover;border:2px solid #f97316;display:block;margin:0 auto" />
            <p style="margin:6px 0 0;color:#f97316;font-size:12px;font-weight:700;text-transform:uppercase">Deseja</p>
            ${c.productTitle ? `<p style="margin:2px 0 0;color:#333;font-size:13px">${c.productTitle}</p>` : ''}
          </td>
        </tr></table>
       </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>${c.title}</title></head>
<body style="margin:0;padding:0;background:#f0f0f5;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f5;padding:24px 12px">
  <tr><td align="center">
    <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e0e0e0;box-shadow:0 2px 12px rgba(0,0,0,0.08)">

      <!-- HEADER -->
      <tr><td style="background-color:#7c3aed;background:linear-gradient(135deg,#7c3aed 0%,#9d4edd 60%,#f97316 100%);padding:18px 32px 8px;text-align:center">
        <p style="margin:0;color:rgba(255,255,255,0.9);font-size:13px;letter-spacing:3px;text-transform:uppercase;font-weight:700">PAPO DE ALUNOS</p>
        <h1 style="margin:4px 0 0;color:#fff;font-size:22px;font-weight:800;line-height:1.2">${c.title}</h1>
      </td></tr>

      <!-- SLOGAN: colado no header, sem gap nenhum -->
      <tr><td style="padding:0 16px;margin:0;background:#fff;text-align:center" valign="top">
        <h2 style="
          margin:0;
          padding:4px 0 0;
          font-family:Arial,Helvetica,sans-serif;
          font-size:42px;
          line-height:40px;
          font-weight:900;
          letter-spacing:-1px;
          color:#7c3aed;
          background:linear-gradient(135deg,#7c3aed 0%,#9d4edd 50%,#f97316 100%);
          -webkit-background-clip:text;
          background-clip:text;
          -webkit-text-fill-color:transparent;
          mso-line-height-rule:exactly;
        ">Desenvolvido para ser o maior site de trocas e doações do Brasil !!!</h2>
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
        ${productImgBlock}
        ${tradeBlock}
        <!-- CTA -->
        <table width="100%" style="margin-top:24px"><tr><td align="center">
          <a href="https://studentclub.app" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#f97316);color:#fff;text-decoration:none;padding:14px 36px;border-radius:50px;font-weight:800;font-size:15px;letter-spacing:0.5px">${c.cta} →</a>
        </td></tr></table>
      </td></tr>

      <!-- INFO BAR: data/hora -->
      <tr><td style="padding:14px 32px;background:#fafafa;border-top:1px solid #f0f0f0;text-align:center">
        <p style="margin:0;color:#777;font-size:15px">🕐 Enviado em <strong style="color:#444">${c.datetime}</strong></p>
      </td></tr>

      <!-- FOOTER -->
      <tr><td style="padding:22px 32px 26px;border-top:1px solid #eee;text-align:center">
        <p style="margin:0 0 10px;color:#7c3aed;font-size:18px;font-weight:800;font-style:italic">"Troque o que quiser, doe o que quiser, vá e execute"</p>
        <p style="margin:0 0 6px;color:#888;font-size:14px">Suporte: <a href="mailto:suporte@studentclub.app" style="color:#7c3aed;text-decoration:none;font-weight:700">suporte@studentclub.app</a></p>
        <p style="margin:0;color:#999;font-size:13px">Você recebe este aviso por ser usuário do <a href="https://studentclub.app" style="color:#7c3aed;text-decoration:none;font-weight:700">Student Club</a>.</p>
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
    c.fromItemTitle ? `\nOferece: ${c.fromItemTitle}` : '',
    c.productTitle ? `\nDeseja: ${c.productTitle}` : '',
    `\nEnviado em: ${c.datetime}`,
    `\n${c.cta}: https://studentclub.app`,
    '\n---',
    '"Troque o que quiser, doe o que quiser, vá e execute"',
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
    case 'match':
      subject = `@${fromUsername} curtiu seu anuncio - Student Club`;
      emailContent = {
        title: `🔥 Novo match! @${fromUsername} curtiu seu anuncio`,
        bodyHtml: `<b>@${fromUsername}</b> curtiu seu anuncio <b>"${extra?.productTitle || 'seu produto'}"</b> e quer trocar com voce!`,
        cta: 'Ver match',
        productTitle: extra?.productTitle,
        productImage: extra?.productImage,
        datetime,
      };
      break;
    case 'proposal':
      subject = `@${fromUsername} enviou uma proposta de troca - Student Club`;
      emailContent = {
        title: `Proposta de troca de @${fromUsername}`,
        bodyHtml: `<b>@${fromUsername}</b> quer fazer uma troca com voce! Veja os detalhes abaixo:`,
        cta: 'Ver proposta',
        fromItemTitle: extra?.fromItemTitle,
        fromItemImage: extra?.fromItemImage,
        productTitle: extra?.productTitle,
        productImage: extra?.productImage,
        datetime,
      };
      break;
    case 'donation':
      subject = `@${fromUsername} aceitou sua doacao - Student Club`;
      emailContent = {
        title: `Doacao aceita por @${fromUsername}`,
        bodyHtml: `<b>@${fromUsername}</b> aceitou sua doacao de <b>"${extra?.productTitle || 'seu produto'}"</b>. Entre em contato para combinar a entrega.`,
        cta: 'Ver detalhes',
        productTitle: extra?.productTitle,
        productImage: extra?.productImage,
        datetime,
      };
      break;
    case 'welcome':
      subject = `Bem-vindo ao Student Club, @${fromUsername}! 🎉`;
      emailContent = {
        title: `Seja bem-vindo, @${fromUsername}! 🎉`,
        bodyHtml: `
<p style="margin:0 0 18px;font-size:16px;color:#333;line-height:1.7">
  Estamos muito felizes em ter você aqui! O <b style="color:#7c3aed">Student Club</b> é o maior site de trocas e doações do Brasil, criado para conectar pessoas que querem dar uma nova vida ao que não usam mais.
</p>

<div style="background:linear-gradient(135deg,#f5f0ff,#fff7ed);border-radius:12px;padding:20px 24px;margin:0 0 20px;border-left:4px solid #7c3aed">
  <p style="margin:0 0 8px;font-size:15px;font-weight:800;color:#7c3aed;letter-spacing:0.5px;text-transform:uppercase">Nossa ideologia: Dar para Receber</p>
  <p style="margin:0;font-size:15px;color:#444;line-height:1.7">
    Acreditamos que quando você <b>doa o que não usa</b>, abre espaço para receber o que precisa. É um ciclo de generosidade, sustentabilidade e conexão real entre pessoas.
  </p>
</div>

<p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#333">Como funciona o Student Club:</p>
<table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 20px">
  <tr>
    <td width="36" valign="top" style="padding-top:2px">
      <span style="display:inline-block;width:28px;height:28px;background:linear-gradient(135deg,#7c3aed,#9d4edd);border-radius:50%;text-align:center;line-height:28px;color:#fff;font-weight:900;font-size:13px">1</span>
    </td>
    <td style="padding-left:10px;padding-bottom:14px">
      <b style="color:#222">Publique o que você tem</b><br>
      <span style="color:#555;font-size:14px">Cadastre itens que não usa mais — roupas, eletrônicos, livros, móveis, qualquer coisa. É grátis!</span>
    </td>
  </tr>
  <tr>
    <td width="36" valign="top" style="padding-top:2px">
      <span style="display:inline-block;width:28px;height:28px;background:linear-gradient(135deg,#9d4edd,#f97316);border-radius:50%;text-align:center;line-height:28px;color:#fff;font-weight:900;font-size:13px">2</span>
    </td>
    <td style="padding-left:10px;padding-bottom:14px">
      <b style="color:#222">Troque pelo que precisa</b><br>
      <span style="color:#555;font-size:14px">Encontre itens de outras pessoas e faça propostas de troca direta — sem dinheiro, só permuta!</span>
    </td>
  </tr>
  <tr>
    <td width="36" valign="top" style="padding-top:2px">
      <span style="display:inline-block;width:28px;height:28px;background:linear-gradient(135deg,#f97316,#fb923c);border-radius:50%;text-align:center;line-height:28px;color:#fff;font-weight:900;font-size:13px">3</span>
    </td>
    <td style="padding-left:10px;padding-bottom:0">
      <b style="color:#222">Doe o que não precisa mais</b><br>
      <span style="color:#555;font-size:14px">Quer apenas ajudar alguém? Marque seu item como doação e presenteie quem mais precisa. O bem volta para você!</span>
    </td>
  </tr>
</table>

<div style="background:#f0fdf4;border-radius:12px;padding:16px 20px;margin:0 0 20px;border-left:4px solid #22c55e">
  <p style="margin:0;font-size:14px;color:#166534;line-height:1.6">
    🌱 <b>Sustentabilidade real:</b> cada troca ou doação no Student Club evita que um item vá para o lixo e reduz o consumo desnecessário. Juntos, fazemos a diferença para o planeta!
  </p>
</div>

<p style="margin:0;font-size:15px;color:#333;line-height:1.7">
  Seu perfil está pronto. Comece agora explorando os itens disponíveis ou publique o seu primeiro anúncio. <b style="color:#7c3aed">A comunidade Student Club está esperando por você!</b>
</p>`,
        cta: 'Começar a trocar agora',
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
