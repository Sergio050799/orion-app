import { NextRequest, NextResponse } from 'next/server';
import { generarExcelEmision } from '@/core/flotas/emisionXlsx';
import { COLUMNAS_EMISION, MAX_FILAS_EMISION, type ColumnaEmision, type ValoresFila } from '@/core/flotas/emision';

export const runtime = 'nodejs';

const COLS = new Set<string>(COLUMNAS_EMISION);

/**
 * POST { filas: [{ COLUMNA: valor }] } → .xlsx con la plantilla oficial de emisión masiva rellena.
 * Solo acepta columnas de la plantilla y valores de texto cortos; el servidor no calcula nada: las filas las
 * prepara el módulo core/flotas/emision.ts (la misma lógica que valida la pantalla EMISIÓN).
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json() as { filas?: unknown };
        if (!Array.isArray(body.filas) || body.filas.length === 0) {
            return NextResponse.json({ ok: false, error: 'No hay filas.' }, { status: 400 });
        }
        if (body.filas.length > MAX_FILAS_EMISION) {
            return NextResponse.json({ ok: false, error: `Máximo ${MAX_FILAS_EMISION} filas.` }, { status: 400 });
        }
        const filas: ValoresFila[] = body.filas.map((f: unknown) => {
            const out: ValoresFila = {};
            if (f && typeof f === 'object') {
                for (const [k, v] of Object.entries(f as Record<string, unknown>)) {
                    if (COLS.has(k) && (typeof v === 'string' || typeof v === 'number')) out[k as ColumnaEmision] = String(v).slice(0, 200);
                }
            }
            return out;
        });
        const buf = await generarExcelEmision(filas);
        return new NextResponse(new Uint8Array(buf), {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': 'attachment; filename="EMISION_MASIVA.xlsx"',
                'Cache-Control': 'no-store',
            },
        });
    } catch (err) {
        console.error('[emision-masiva/excel]', err);
        return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'Error generando el fichero.' }, { status: 500 });
    }
}
