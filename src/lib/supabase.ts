import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Incrementa visualizações via fetch direto (sem JWT de usuário — contorna RLS de owner)
export async function incrementVisualizacoes(productId: string): Promise<void> {
  try {
    await fetch(`${supabaseUrl}/rest/v1/rpc/increment_visualizacoes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseAnonKey,
      },
      body: JSON.stringify({ row_id: productId }),
    });
  } catch { /* fire and forget */ }
}

// Registra visualização de anúncio identificada (quem viu) — usado pelo Painel PJ
// REQUER tabela visualizacoes_anuncio(anuncio_id text, viewer_username text, viewed_at timestamptz)
export async function recordAnuncioView(payload: { anuncio_id: string; viewer_username: string }): Promise<void> {
  try {
    await fetch(`${supabaseUrl}/rest/v1/visualizacoes_anuncio`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseAnonKey,
        'Prefer': 'return=minimal,resolution=merge-duplicates',
      },
      body: JSON.stringify({ ...payload, viewed_at: new Date().toISOString() }),
    });
  } catch { /* fire and forget — tabela pode não existir */ }
}

// Registra match via fetch direto (sem JWT — contorna RLS, acumulativo)
// REQUER: DROP CONSTRAINT matches_product_id_from_username_key no Supabase
export async function insertMatch(payload: {
  product_id: string;
  product_owner: string;
  from_username: string;
  from_item_id?: string | null;
  from_item_title?: string | null;
}): Promise<void> {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/matches`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseAnonKey,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(payload),
    });
    // 409 = unique constraint ainda existe no banco → ignora silenciosamente
    if (!res.ok && res.status !== 409) {
      console.error('insertMatch error:', res.status, await res.text());
    }
  } catch { /* fire and forget */ }
}
