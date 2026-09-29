import { type NextRequest, NextResponse } from 'next/server';
import { apiPost } from '@/lib/orionApi';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!body.accion) {
    return NextResponse.json({ error: 'accion requerida' }, { status: 400 });
  }
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '';
    await apiPost('/admin/audit', { ...body, ip });
    return NextResponse.json({ ok: true });
  } catch {
    // No bloqueamos el flujo principal por un error de auditoría
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
