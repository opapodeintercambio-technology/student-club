export const ADMIN_EMAILS = [
  'guilherme_lima_bh@yahoo.com.br',
];

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}
