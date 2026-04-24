import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

function checkAuth(req: NextRequest): boolean {
    const secret = process.env.ADMIN_SECRET;
    if (!secret) return false;
    const auth = req.headers.get('authorization') ?? '';
    return auth === `Bearer ${secret}`;
}

function listVersions(dir: string, filename: string) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
        .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
        .sort()
        .reverse()
        .map(fecha => {
            const p = path.join(dir, fecha, filename);
            const exists = fs.existsSync(p);
            const bytes = exists ? fs.statSync(p).size : 0;
            return { fecha, activo: false, bytes };
        })
        .filter(v => v.bytes > 0)
        .map((v, i) => ({ ...v, activo: i === 0 })); // la más reciente es la activa
}

export async function GET(req: NextRequest) {
    if (!checkAuth(req)) {
        return NextResponse.json({ ok: false, error: 'No autorizado.' }, { status: 401 });
    }

    const catalogoDir = path.join(process.cwd(), 'data', 'catalogo');
    const matriculasDir = path.join(process.cwd(), 'data', 'matriculas');

    return NextResponse.json({
        ok: true,
        catalogo: listVersions(catalogoDir, 'dim_vehiculos.csv'),
        matriculas: listVersions(matriculasDir, 'plates_monthly_anchors_seed.json'),
    });
}
