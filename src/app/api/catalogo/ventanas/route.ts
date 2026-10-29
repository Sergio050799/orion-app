import { NextRequest, NextResponse } from 'next/server';
import { apiGet, apiPost } from '@/lib/orionApi';

export const runtime = 'nodejs';

function usuarioDe(req: NextRequest): string {
  const tok = req.cookies.get('orion_session')?.value ?? '';
  const dot = tok.lastIndexOf('.');
  if (dot < 0) return '';
  return tok.slice(0, dot).split(':')[0] ?? '';
}

/** Ventanas de años que el sistema de emisión admite por ID (aprendidas de sus errores). */
export async function GET() {
  try {
    const res  = await apiGet('/ventanas-sistema');
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Servicio de ventanas no disponible' }, { status: 503 });
  }
}

/** { ventanas: [{ id, fabMin, fabMax, matMin?, matMax?, fuente? }] } */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    body.usuario = usuarioDe(req);
    const res  = await apiPost('/ventanas-sistema', body);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Servicio de ventanas no disponible' }, { status: 503 });
  }
}
