import { NextRequest, NextResponse } from 'next/server';
import { apiGet, apiPost } from '@/lib/orionApi';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const res  = await apiGet('/flotas-historicas');
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
