// Helpers seguros pra formatar Date — substituem chamadas diretas a
// `new Date(x).toLocaleDateString(...)` em valores vindos do banco/cache.
//
// Por que existem:
//   - new Date('') ou new Date(null) retorna Date com getTime() = NaN
//   - dateInvalido.toLocaleDateString(...) em Safari iOS lanca RangeError
//     com opcoes customizadas (caso historico: tela branca quando
//     getDataIntercambio retornava um Date invalido).
//   - dateInvalido.toISOString() lanca RangeError em qualquer browser.
//
// Sempre retornam string (fallback) — nunca lancam. Permitem render
// defensivo sem precisar wrappar cada call site em try/catch.

export function safeFormatDate(
  value: string | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions,
  locale = 'pt-BR',
  fallback = '',
): string {
  if (!value) return fallback;
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return fallback;
    return d.toLocaleDateString(locale, options);
  } catch {
    return fallback;
  }
}

export function safeFormatDateTime(
  value: string | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions,
  locale = 'pt-BR',
  fallback = '',
): string {
  if (!value) return fallback;
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return fallback;
    return d.toLocaleString(locale, options);
  } catch {
    return fallback;
  }
}

export function safeToISO(value: Date | string | null | undefined, fallback = ''): string {
  if (!value) return fallback;
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return fallback;
    return d.toISOString();
  } catch {
    return fallback;
  }
}

/** Helper booleano: a string/Date eh valida pra usar como data? */
export function isValidDate(value: string | Date | null | undefined): boolean {
  if (!value) return false;
  try {
    const d = value instanceof Date ? value : new Date(value);
    return !isNaN(d.getTime());
  } catch {
    return false;
  }
}
