import { NextRequest, NextResponse } from 'next/server';
import { apiGet, apiPost } from '@/lib/orionApi';
import { notificarCambio } from '../eventos/notificador';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const res = await apiGet('/carpetas');
    const data = await res.json();
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data);
  } catch (err) {
    console.error('[carpetas GET]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res  = await apiPost('/carpetas', body);
    const data = await res.json();
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    notificarCambio();
    return NextResponse.json(data);
  } catch (err) {
    console.error('[carpetas POST]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
