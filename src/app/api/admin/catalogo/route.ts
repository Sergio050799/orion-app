import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
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

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file || !file.name.endsWith('.csv')) {
        return NextResponse.json({ ok: false, error: 'Se requiere un archivo .csv' }, { status: 400 });
    }

    const fecha = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const dir = path.join(process.cwd(), 'data', 'catalogo', fecha);
    fs.mkdirSync(dir, { recursive: true });

    const dest = path.join(dir, 'dim_vehiculos.csv');
    const buf = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(dest, buf);

    // Invalida el singleton para que la próxima búsqueda use la versión nueva
    clearCatalogoCache();

    return NextResponse.json({ ok: true, version: fecha, path: dest, bytes: buf.length });
}
