import { supabase } from '../../lib/supabase';

export interface StudentProfile {
  escola: string;
  consultor: string;
  comprasStore: number;
  cursosIntercambio: number;
}

const KEY = (user: string) => `papo_student_profile_${user}`;

const DEFAULTS: StudentProfile = {
  escola: '',
  consultor: '',
  comprasStore: 0,
  cursosIntercambio: 0,
};

// Leitura SÍNCRONA via localStorage — mantida pra não quebrar chamadores
// existentes. Para dados cross-usuário, use `fetchStudentProfile` (async).
export function getStudentProfile(user: string): StudentProfile {
  try {
    const raw = localStorage.getItem(KEY(user));
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

// Versão remota: lê escola/consultor do Supabase (cross-usuário, cross-device).
// Mescla com cache local pros campos numéricos. Atualiza o cache na sequência.
export async function fetchStudentProfile(user: string): Promise<StudentProfile> {
  const local = getStudentProfile(user);
  try {
    const { data } = await supabase
      .from('usuarios')
      .select('escola, consultor')
      .eq('username', user)
      .maybeSingle();
    if (data) {
      const merged: StudentProfile = {
        ...local,
        escola: (data as any).escola ?? local.escola ?? '',
        consultor: (data as any).consultor ?? local.consultor ?? '',
      };
      try { localStorage.setItem(KEY(user), JSON.stringify(merged)); } catch {}
      return merged;
    }
  } catch { /* segue com local */ }
  return local;
}

export async function setStudentProfile(user: string, patch: Partial<StudentProfile>): Promise<boolean> {
  try {
    const cur = getStudentProfile(user);
    const next = { ...cur, ...patch };
    localStorage.setItem(KEY(user), JSON.stringify(next));

    // Persiste escola/consultor no Supabase (cross-device + cross-usuário)
    const remotePatch: Record<string, string | null> = {};
    if (patch.escola !== undefined)    remotePatch.escola    = patch.escola || null;
    if (patch.consultor !== undefined) remotePatch.consultor = patch.consultor || null;
    if (Object.keys(remotePatch).length > 0) {
      try {
        await supabase.from('usuarios').update(remotePatch).eq('username', user);
      } catch (e) {
        console.warn('[studentProfile] update remoto falhou', e);
      }
    }

    window.dispatchEvent(new CustomEvent('papo-student-updated', { detail: { user } }));
    return true;
  } catch (e) {
    console.error('[studentProfile] save failed', e);
    return false;
  }
}

export function incrementComprasStore(user: string, by = 1) {
  const cur = getStudentProfile(user);
  return setStudentProfile(user, { comprasStore: cur.comprasStore + by });
}

export function incrementCursosIntercambio(user: string, by = 1) {
  const cur = getStudentProfile(user);
  return setStudentProfile(user, { cursosIntercambio: cur.cursosIntercambio + by });
}
