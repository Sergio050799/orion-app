import { NextRequest, NextResponse } from 'next/server';
import { apiGet, apiPost } from '@/lib/orionApi';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const cif    = searchParams.get('cif')    ?? '';
    const q      = searchParams.get('q')      ?? '';
    const estado = searchParams.get('estado') ?? '';
    const qs = new URLSearchParams();
    if (cif)    qs.set('cif',    cif);
    if (q)      qs.set('q',      q);
    if (estado) qs.set('estado', estado);
    const suffix = qs.toString() ? `?${qs}` : '';
    const res  = await apiGet(`/flotas-historicas${suffix}`);
    const data = await res.json();
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data);
  } catch (err) {
    console.error('[flotas-historicas GET]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res  = await apiPost('/flotas-historicas', body);
    const data = await res.json();
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error('[flotas-historicas POST]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
