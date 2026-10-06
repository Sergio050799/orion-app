import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const BASE    = process.env.ORION_API_URL ?? 'http://localhost:3001';
const KEY     = process.env.ORION_API_KEY  ?? 'dev_secret_local';
const HEADERS = { 'X-Api-Key': KEY, 'Content-Type': 'application/json' };

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body   = await req.json();
    const res    = await fetch(`${BASE}/flotas-historicas/${id}`, {
      method: 'PUT', headers: HEADERS, body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data);
  } catch (err) {
    console.error('[flotas-historicas PUT]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const res    = await fetch(`${BASE}/flotas-historicas/${id}`, {
      method: 'DELETE', headers: HEADERS,
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data);
  } catch (err) {
    console.error('[flotas-historicas DELETE]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
