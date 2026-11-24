const BASE = process.env.ORION_API_URL ?? 'http://localhost:3001';
const KEY  = process.env.ORION_API_KEY  ?? 'dev_secret_local';

const HEADERS = {
  'X-Api-Key':    KEY,
  'Content-Type': 'application/json',
};

// Las rutas hacen `await res.json()` nada más recibir la respuesta. Si orion-api contesta con una
// página de error HTML (404/500 de Flask) eso reventaba con «Unexpected token '<'» y la ruta
// devolvía un 500 genérico. Aquí se convierte en un JSON de error con el mismo código HTTP.
function respuestaSegura(res: Response): Response {
  const ct = (res.headers.get('content-type') ?? '').toLowerCase();
  if (ct.includes('application/json')) return res;
  if (res.ok && !ct.startsWith('text/html')) return res; // binarios, texto plano, etc.
  res.body?.cancel().catch(() => {});
  const status = res.ok ? 502 : res.status;
  return new Response(JSON.stringify({ error: `orion-api respondió ${res.status} sin JSON` }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function apiGet(path: string): Promise<Response> {
  const pedir = () => fetch(`${BASE}${path}`, { headers: HEADERS, cache: 'no-store' });
  try {
    return respuestaSegura(await pedir());
  } catch {
    // Corte de conexión puntual («fetch failed», «other side closed»): un GET se puede repetir sin riesgo.
    await new Promise(r => setTimeout(r, 300));
    return respuestaSegura(await pedir());
  }
}

export async function apiPost(path: string, body: unknown): Promise<Response> {
  return respuestaSegura(await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body),
  }));
}

export async function apiPut(path: string, body: unknown): Promise<Response> {
  return respuestaSegura(await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: HEADERS,
    body: JSON.stringify(body),
  }));
}
