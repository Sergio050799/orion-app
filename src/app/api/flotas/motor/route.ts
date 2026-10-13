import { NextRequest, NextResponse } from 'next/server';
import { apiGet, apiPost } from '@/lib/orionApi';

export const runtime = 'nodejs';

const BASE  = process.env.ORION_API_URL ?? 'http://localhost:3001';
const KEY   = process.env.ORION_API_KEY  ?? 'dev_secret_local';
const HDRS  = { 'X-Api-Key': KEY, 'Content-Type': 'application/json' };

// GET /api/flotas/motor?resource=stats|tipologias|params|catalogo|coberturas|primas-medias[&...]
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const resource = searchParams.get('resource') ?? 'stats';

    // Resources that accept pass-through query params
    const PASSTHROUGH = ['stats', 'catalogo', 'coberturas', 'primas-medias'];
    let path = resource === 'primas-medias' ? '/motor/primas-medias' : `/motor/${resource}`;

    if (PASSTHROUGH.includes(resource)) {
      const qs: string[] = [];
      for (const [key, val] of searchParams.entries()) {
        if (key !== 'resource') qs.push(`${key}=${encodeURIComponent(val)}`);
      }
      if (qs.length) path += '?' + qs.join('&');
    }

    const res  = await fetch(`${BASE}${path}`, { headers: HDRS, cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data);
  } catch (err) {
    console.error('[motor GET]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// POST /api/flotas/motor
// body: { action: 'diagnostico'|'import', ...payload }
export async function POST(req: NextRequest) {
  try {
    const body   = await req.json();
    const action = body.action ?? 'diagnostico';
    const username = req.headers.get('x-username') ?? '';

    let path = `/motor/${action}`;
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { ...HDRS, 'X-Username': username },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data);
  } catch (err) {
    console.error('[motor POST]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// PUT /api/flotas/motor — update motor_params
export async function PUT(req: NextRequest) {
  try {
    const body     = await req.json();
    const username = req.headers.get('x-username') ?? '';
    const res = await fetch(`${BASE}/motor/params`, {
      method: 'PUT',
      headers: { ...HDRS, 'X-Username': username },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data);
  } catch (err) {
    console.error('[motor PUT]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
