import { NextRequest, NextResponse } from "next/server";
import { catalogoDataSource } from "@/core/catalogo/catalogoDataSource.csv";
import type { SearchParams, CatalogoCandidato } from "@/core/catalogo/catalogoDataSource";

export const runtime = "nodejs";

function normalizeCandidato(c: CatalogoCandidato) {
    const iniYear = c.fec_ini_comerc ? parseInt(c.fec_ini_comerc.substring(0, 4)) : 0;
    return {
        id_veh: c.id_veh,
        marca: c.marca,
        modelo: c.modelo,
        version: c.version,
        combustible: c.combustible,
        kw: c.kw,
        cv: c.cv,
        cilindrada: c.cilindrada,
        plazas: c.num_plazas_max,
        tara: c.tara,
        pma: c.pma ?? 0,
        puertas: c.num_puertas,
        anyo: iniYear,
        pvp: c.pvp || undefined,
        score: c.score,
    };
}

export async function GET(req: NextRequest) {
    try {
        const sp = req.nextUrl.searchParams;

        const params: SearchParams = {};

        const marca = sp.get('marca');
        if (marca) params.marca = marca;

        const modelo = sp.get('modelo');
        if (modelo) params.modelo = modelo;

        const kw = sp.get('kw');
        if (kw) params.kw = parseFloat(kw);

        const cilindrada = sp.get('cilindrada');
        if (cilindrada) params.cilindrada = parseFloat(cilindrada);

        const plazas = sp.get('plazas');
        if (plazas) params.plazas = parseInt(plazas);

        const tara = sp.get('tara');
        if (tara) params.tara = parseFloat(tara);

        const puertas = sp.get('puertas');
        if (puertas) params.puertas = parseInt(puertas);

        const combustible = sp.get('combustible');
        if (combustible) params.combustible = combustible;

        const anyo = sp.get('anyo');
        if (anyo) params.anyo = parseInt(anyo);

        const acabado = sp.get('acabado');
        if (acabado) params.acabado = acabado;

        if (!marca && !modelo && !kw && !cilindrada && !plazas && !tara && !puertas && !combustible && !anyo && !acabado) {
            return NextResponse.json(
                { ok: false, error: "Se requiere al menos un parámetro de búsqueda." },
                { status: 400 }
            );
        }

        const raw = await catalogoDataSource.search(params);
        const candidatos = raw.map(normalizeCandidato);

        return NextResponse.json({ ok: true, candidatos }, { status: 200 });

    } catch (error: any) {
        return NextResponse.json({ ok: false, error: error.message || "Error interno" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        const params: SearchParams = {};
        if (body.marca)      params.marca      = String(body.marca);
        if (body.modelo)     params.modelo     = String(body.modelo);
        if (body.kw)         params.kw         = parseFloat(body.kw);
        if (body.cilindrada) params.cilindrada = parseFloat(body.cilindrada);
        if (body.plazas)     params.plazas     = parseInt(body.plazas);
        if (body.tara)       params.tara       = parseFloat(body.tara);
        if (body.puertas)    params.puertas    = parseInt(body.puertas);
        if (body.combustible) params.combustible = String(body.combustible);
        if (body.anio)       params.anyo       = parseInt(body.anio);
        if (body.anyo)       params.anyo       = parseInt(body.anyo);
        if (body.acabado)    params.acabado    = String(body.acabado);

        if (Object.keys(params).length === 0) {
            return NextResponse.json(
                { ok: false, error: "Se requiere al menos un parámetro de búsqueda." },
                { status: 400 }
            );
        }

        const raw = await catalogoDataSource.search(params);
        const candidates = raw.map(normalizeCandidato);

        return NextResponse.json({ candidates }, { status: 200 });

    } catch (error: any) {
        return NextResponse.json({ ok: false, error: error.message || "Error interno" }, { status: 500 });
    }
}
