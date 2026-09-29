import { type NextRequest, NextResponse } from 'next/server';
import { apiPost } from '@/lib/orionApi';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!body.titulo || !body.descripcion) {
    return NextResponse.json({ error: 'Faltan campos' }, { status: 400 });
  }
  try {
    const res = await apiPost('/admin/mejoras', body);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Error al registrar mejora' }, { status: 500 });
  }
}
