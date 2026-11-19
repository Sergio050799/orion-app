import { NextResponse } from 'next/server';
import { apiGet } from '@/lib/orionApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const r = await apiGet('/flotas-v5/kpis');
        const data = await r.json();
        return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
    } catch (err) {
        return NextResponse.json({ error: String(err) }, { status: 502 });
    }
}
