// Teste 5: importa do _lib/spotify-auth APENAS — sem chamar nada.
// Se isso falhar, o problema é o MODULE LOAD do spotify-auth.ts.
export default async function handler(_req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  try {
    const mod = await import('../../_lib/spotify-auth');
    const exports = Object.keys(mod);
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true, exports }));
  } catch (e: any) {
    res.statusCode = 500;
    return res.end(JSON.stringify({
      ok: false,
      error: e?.message || String(e),
      stack: (e?.stack || '').split('\n').slice(0, 8).join(' | '),
    }));
  }
}
