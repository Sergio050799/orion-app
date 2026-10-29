import { NextRequest, NextResponse } from "next/server";
import { consultarCascada, type CascadaParams } from "@/core/catalogo/catalogoDataSource.csv";

export const runtime = "nodejs";

/**
 * GET /api/catalogo/cascada?categoria=&tipo=&marca=&modelo=&anyo=&combustible=&kw=&plazas=
 * Solo lectura. Devuelve las opciones de cada desplegable (marcas, modelos, años,
 * combustibles, kW, plazas) y las versiones que cumplen los filtros indicados.
 */
export async function GET(req: NextRequest) {
    try {
        const sp = req.nextUrl.searchParams;
        const num = (k: string) => { const v = parseFloat(sp.get(k) ?? ''); return isNaN(v) ? undefined : v; };
        const params: CascadaParams = {
            categoria: num('categoria'),
            tipo: sp.get('tipo') || undefined,
            marca: sp.get('marca') || undefined,
            modelo: sp.get('modelo') || undefined,
            anyo: num('anyo'),
            combustible: sp.get('combustible') || undefined,
            kw: num('kw'),
            plazas: num('plazas'),
        };
        return NextResponse.json({ ok: true, ...consultarCascada(params) }, { status: 200 });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Error interno";
        return NextResponse.json({ ok: false, error: msg }, { status: 503 });
    }
}
