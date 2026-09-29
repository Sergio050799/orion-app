import { NextRequest, NextResponse } from 'next/server';
import { clearCatalogoCache } from '@/core/catalogo/catalogoDataSource.csv';

export const runtime = 'nodejs';

function checkAuth(req: NextRequest): boolean {
    const secret = process.env.ADMIN_SECRET;
    if (!secret) return false;
    const auth = req.headers.get('authorization') ?? '';
    return auth === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
    if (!checkAuth(req)) {
        return NextResponse.json({ ok: false, error: 'No autorizado.' }, { status: 401 });
    }
    clearCatalogoCache();
    return NextResponse.json({ ok: true });
}
