import { NextResponse } from 'next/server';
import { apiGet } from '@/lib/orionApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const r = await apiGet('/sucursales');
        const data = await r.json();
        return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
    } catch {
        return NextResponse.json([]);
    }
}
