// Teste 6: testa o novo path lib/server/spotify-auth via static + dynamic.
import * as staticImport from '../../../lib/server/spotify-auth';

export default async function handler(_req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  const result: any = {};
  try {
    result.staticImport = {
      ok: true,
      exports: Object.keys(staticImport),
    };
  } catch (e: any) {
    result.staticImport = { ok: false, error: e?.message };
  }
  try {
    const mod = await import('../../../lib/server/spotify-auth');
    result.dynamicImport = { ok: true, exports: Object.keys(mod) };
  } catch (e: any) {
    result.dynamicImport = { ok: false, error: e?.message };
  }
  res.statusCode = 200;
  return res.end(JSON.stringify(result));
}
