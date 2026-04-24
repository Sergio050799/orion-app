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

const SEED_SOURCE = path.join(
    process.cwd(),
    'src', 'core', '_source_of_truth', 'plates', 'plates_monthly_anchors_seed.json'
);

export async function POST(req: NextRequest) {
    if (!checkAuth(req)) {
        return NextResponse.json({ ok: false, error: 'No autorizado.' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file || !file.name.endsWith('.json')) {
        return NextResponse.json({ ok: false, error: 'Se requiere un archivo .json' }, { status: 400 });
    }

    const text = await file.text();

    // Validar que es JSON válido con la estructura esperada
    try {
        const parsed = JSON.parse(text);
        if (!parsed.months || typeof parsed.months !== 'object') {
            return NextResponse.json({ ok: false, error: 'Formato inválido. Se esperaba { months: {...} }' }, { status: 400 });
        }
    } catch {
        return NextResponse.json({ ok: false, error: 'JSON inválido.' }, { status: 400 });
    }

    const fecha = new Date().toISOString().slice(0, 10);

    // Guardar copia versionada
    const dir = path.join(process.cwd(), 'data', 'matriculas', fecha);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'plates_monthly_anchors_seed.json'), text, 'utf8');

    // Sobreescribir el archivo fuente (activo tras reinicio del servidor)
    fs.writeFileSync(SEED_SOURCE, text, 'utf8');

    return NextResponse.json({
        ok: true,
        version: fecha,
        nota: 'Backup guardado. El seed fuente ha sido actualizado. Activo tras reiniciar el servidor.',
        entries: Object.keys(JSON.parse(text).months).length,
    });
}
