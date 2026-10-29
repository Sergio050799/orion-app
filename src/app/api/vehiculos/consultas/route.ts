import { NextRequest, NextResponse } from 'next/server';
import { apiGet, apiPost } from '@/lib/orionApi';

export const runtime = 'nodejs';

// El middleware ya ha verificado la firma de la sesión; aquí solo se lee el usuario del token.
function usuarioDe(req: NextRequest): string {
  const tok = req.cookies.get('orion_session')?.value ?? '';
  const dot = tok.lastIndexOf('.');
  if (dot < 0) return '';
  return tok.slice(0, dot).split(':')[0] ?? '';
}

/** Directorio de consultas guardadas (sin contenido). */
export async function GET() {
  try {
    const res  = await apiGet('/consultas-vehiculos');
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Servicio de consultas no disponible' }, { status: 503 });
  }
}

/** { action: 'upsert', consulta } | { action: 'delete', id } */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body?.action === 'upsert' && body.consulta) body.consulta.creado_por = body.consulta.creado_por || usuarioDe(req);
    const res  = await apiPost('/consultas-vehiculos', body);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Servicio de consultas no disponible' }, { status: 503 });
  }
}
