// Lista de emails dos admins do Student Club.
// Receber:
//   - Notificacao de novo cadastro (admin_signup)
//   - Denuncia recebida (admin_denuncia)
//   - Bloqueio automatico de usuario por IA (admin_bloqueio)
//   - Pedido de desbloqueio (suporte_desbloqueio)
//   - Bloqueio em modera-listing
// Pra adicionar/remover admin: edita aqui e propaga em toda app.
export const ADMIN_EMAILS = [
  'guilherme_lima_bh@yahoo.com.br',
  'tipapointercambio@gmail.com',
];

// Email publico de suporte mostrado no site. Pra emails enviados a este
// endereco caírem nos dois admins, precisa setup de email forwarding via
// DNS (ex: ImprovMX, Cloudflare Email Routing). O env do mailbox em si
// nao tem relacao com a lista ADMIN_EMAILS acima — sao coisas
// diferentes.
export const SUPPORT_EMAIL = 'suporte@studentclub.app';

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}
