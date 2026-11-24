import { NextRequest, NextResponse } from 'next/server';
import { getCatalogoCompleto } from '@/core/catalogo/catalogoDataSource.csv';
import type { CatalogoVehiculo } from '@/core/catalogo/catalogoDataSource';
import { construirIndice, identificar, type IndiceCatalogo, type VehiculoAIdentificar } from '@/core/catalogo/identificar';
import { VENTANAS_SEMILLA, fusionarVentanas, type MapaVentanas } from '@/core/catalogo/ventanasSistema';
import { apiGet } from '@/lib/orionApi';

export const runtime = 'nodejs';

// Identificación de vehículos en el catálogo para PRE-EMISIÓN (marca → modelo → año → plazas → acabado).
// Una sola llamada resuelve uno o muchos vehículos; el índice del catálogo se construye una vez y se reutiliza.

declare global {
    // eslint-disable-next-line no-var
    var _orionIndiceCatalogo: { de: CatalogoVehiculo[]; idx: IndiceCatalogo } | undefined;
    // eslint-disable-next-line no-var
    var _orionVentanas: { mapa: MapaVentanas; ts: number } | undefined;
}

function indice(): IndiceCatalogo {
    const todas = getCatalogoCompleto();
    // si se sube un catálogo nuevo cambia el array: el índice se rehace solo
    if (!global._orionIndiceCatalogo || global._orionIndiceCatalogo.de !== todas) {
        global._orionIndiceCatalogo = { de: todas, idx: construirIndice(todas) };
    }
    return global._orionIndiceCatalogo.idx;
}

/** Rangos de años que el sistema de emisión ha indicado por ID (semilla + aprendidos). Caché de 60 s. */
async function ventanas(): Promise<MapaVentanas> {
    const c = global._orionVentanas;
    if (c && Date.now() - c.ts < 60_000) return c.mapa;
    let mapa: MapaVentanas = { ...VENTANAS_SEMILLA };
    try {
        const res = await apiGet('/ventanas-sistema');
        if (res.ok) {
            const filas = await res.json();
            if (Array.isArray(filas)) {
                mapa = fusionarVentanas(mapa, filas.map((f: Record<string, unknown>) => ({
                    id: String(f.id_veh), fabMin: Number(f.fab_min) || 0, fabMax: Number(f.fab_max) || 0,
                    matMin: f.mat_min ? Number(f.mat_min) : null, matMax: f.mat_max ? Number(f.mat_max) : null,
                    okMin: f.ok_min ? Number(f.ok_min) : null, okMax: f.ok_max ? Number(f.ok_max) : null,
                })));
            }
        }
    } catch { /* sin servicio: vale la semilla */ }
    global._orionVentanas = { mapa, ts: Date.now() };
    return mapa;
}

const num = (x: unknown): number | null => {
    if (x === null || x === undefined || x === '') return null;
    const n = typeof x === 'number' ? x : parseFloat(String(x).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
};

function aVehiculo(b: Record<string, unknown>): VehiculoAIdentificar {
    return {
        marca: b.marca ? String(b.marca) : '',
        modelo: b.modelo ? String(b.modelo) : '',
        tipo: b.tipo ? String(b.tipo) : '',
        anyo: num(b.anyo),
        plazas: num(b.plazas),
        plazasFirmes: b.plazasFirmes === true,
        kw: num(b.kw),
        combustible: b.combustible ? String(b.combustible) : '',
        tara: num(b.tara),
    };
}

/** Misma forma que devuelve /api/catalogo/search, más `cubreAnio`. */
function aCandidato(c: ReturnType<typeof identificar>['candidatos'][number]) {
    const ini = c.fec_ini_comerc ? parseInt(c.fec_ini_comerc.substring(0, 4), 10) || 0 : 0;
    return {
        id_veh: c.id_veh, marca: c.marca, modelo: c.modelo, version: c.version, combustible: c.combustible,
        kw: c.kw, cv: c.cv, cilindrada: c.cilindrada, plazas: c.num_plazas_max, tara: c.tara, pma: c.pma ?? 0,
        puertas: c.num_puertas, anyo: ini, desde: ini,
        hasta: c.fec_fin_comerc ? parseInt(c.fec_fin_comerc.substring(0, 4), 10) || 0 : 0,
        actualizado: c.actualizado ?? 0,
        plazasMin: c.num_plazas_min, tipo: c.tipo || 'sin_clasificar', pvp: c.pvp || undefined,
        score: c.score, cubreAnio: c.cubreAnio, anioConfirmado: c.anioConfirmado,
    };
}

/** { vehiculos: [{ marca, modelo, tipo, anyo, plazas, plazasFirmes, kw, combustible, tara }] } → { resultados: [...] } en el mismo orden */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const lista: unknown[] = Array.isArray(body?.vehiculos) ? body.vehiculos : body && typeof body === 'object' ? [body] : [];
        if (lista.length === 0) return NextResponse.json({ ok: false, error: 'Faltan los vehículos a identificar.' }, { status: 400 });
        if (lista.length > 2000) return NextResponse.json({ ok: false, error: 'Demasiados vehículos en una sola petición (máximo 2.000).' }, { status: 400 });

        const idx = indice();
        const vs = await ventanas();
        // Las flotas repiten vehículos idénticos: cada combinación se resuelve una sola vez
        const memo = new Map<string, ReturnType<typeof identificar>>();
        const resultados = lista.map(x => {
            const v = aVehiculo((x ?? {}) as Record<string, unknown>);
            const k = JSON.stringify(v);
            let r = memo.get(k);
            if (!r) { r = identificar(idx, v, vs); memo.set(k, r); }
            return { nivel: r.nivel, auto: r.auto, marcaCatalogo: r.marcaCatalogo, candidatos: r.candidatos.map(aCandidato) };
        });
        return NextResponse.json({ ok: true, resultados });
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error interno';
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
}
