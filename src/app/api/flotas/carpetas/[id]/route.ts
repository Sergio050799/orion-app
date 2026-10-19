import { NextRequest, NextResponse } from 'next/server';
import { apiGet, apiPut } from '@/lib/orionApi';
import { notificarCambio } from '../../eventos/notificador';
import { invalidateCarpetasCache } from '@/lib/carpetasCache';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const res = await apiGet(`/carpetas/${id}`);
    const data = await res.json();
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data);
  } catch (err) {
    console.error('[carpetas/:id GET]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const res = await apiPut(`/carpetas/${id}`, body);
    const data = await res.json();
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    invalidateCarpetasCache();
    notificarCambio();
    return NextResponse.json(data);
  } catch (err) {
    console.error('[carpetas/:id PUT]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
