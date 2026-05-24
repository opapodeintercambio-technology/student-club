// Endpoint de teste mínimo — sem imports externos, só pra confirmar
// se o problema é routing/path ou o código real do spotify-auth.
export default function handler(_req: any, res: any) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true, ts: Date.now() }));
}
