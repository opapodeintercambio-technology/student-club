// Proxy server-side para Google Translate (unofficial gtx endpoint)
// Chamado pelo cliente para evitar CORS e rate-limit por IP
// Sem API key necessária — limite de uso generoso para apps pequenos

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const text = url.searchParams.get('q') ?? '';
  const target = url.searchParams.get('tl') ?? 'en';

  if (!text.trim()) {
    return Response.json({ t: text });
  }

  const q = text.slice(0, 499);

  try {
    const apiUrl =
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=pt&tl=${target}&dt=t&q=${encodeURIComponent(q)}`;

    const res = await fetch(apiUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      return Response.json({ t: text });
    }

    const data = await res.json();
    // data[0] = array of [translated_chunk, original_chunk, ...]
    const translated: string = Array.isArray(data?.[0])
      ? (data[0] as Array<[string]>).map(item => item?.[0] ?? '').join('')
      : text;

    return Response.json({ t: translated || text });
  } catch {
    return Response.json({ t: text });
  }
}
