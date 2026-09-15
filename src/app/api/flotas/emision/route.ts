import { NextRequest, NextResponse } from "next/server";
import { parseExcelTemplate } from "@/core/flotas";
import { catalogoDataSource } from "@/core/catalogo/catalogoDataSource.csv";
import type { SearchParams, CatalogoCandidato } from "@/core/catalogo/catalogoDataSource";
import { normalizeFuel } from "@/core/pipelines/_shared/formatUtils";

export const runtime = "nodejs";

interface CatalogoResumen {
    id_veh: string;
    marca: string;
    modelo: string;
    version: string;
    combustible: string;
    kw: number;
    cv: number;
    cilindrada: number;
    plazas: number;
    tara: number;
    pma: number;
    puertas: number;
    anyo: number;
    pvp?: number;
    score: number;
}

interface VehiculoEmision {
    matricula: string;
    datos_originales: Record<string, string>;
    identificado: boolean;
    score?: number;
    catalogo?: CatalogoResumen;
    candidatos?: CatalogoResumen[];
}

function toCatalogoResumen(c: CatalogoCandidato): CatalogoResumen {
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

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file");

        if (!file || !(file instanceof File)) {
            return NextResponse.json(
                { ok: false, error: "Se requiere un archivo Excel en el campo 'file'" },
                { status: 400 },
            );
        }

        const parsed = await parseExcelTemplate(file);

        if (parsed.mapped === 0) {
            return NextResponse.json(
                { ok: false, error: "Sin filas válidas" },
                { status: 400 },
            );
        }

        const vehiculos: VehiculoEmision[] = [];

        for (const row of parsed.rows) {
            const matricula = (row.matricula ?? "").trim();

            // Fila vacía completa → skip
            if (!Object.values(row).some(v => v.trim())) continue;

            const entry: VehiculoEmision = {
                matricula,
                datos_originales: { ...row },
                identificado: false,
            };

            // Solo intentar identificar si hay al menos matrícula o marca
            if (matricula || row.marca) {
                try {
                    const params: SearchParams = {};
                    if (row.marca) params.marca = row.marca;
                    if (row.modelo) params.modelo = row.modelo;
                    if (row.kw) params.kw = parseFloat(row.kw);
                    if (row.cv && !row.kw) params.kw = parseFloat(row.cv) / 1.36;
                    if (row.cilindrada) params.cilindrada = parseFloat(row.cilindrada);
                    if (row.plazas) params.plazas = parseInt(row.plazas);
                    if (row.tn) params.tara = parseFloat(row.tn) >= 100 ? parseFloat(row.tn) : parseFloat(row.tn) * 1000;
                    if (row.puertas) params.puertas = parseInt(row.puertas);
                    if (row.anyo) params.anyo = parseInt(row.anyo);
                    if (row.combustible) {
                        const fuelCode = normalizeFuel(row.combustible);
                        if (fuelCode) params.combustible = fuelCode;
                    }

                    const candidatos = await catalogoDataSource.search(params);
                    const top5 = candidatos.slice(0, 5).map(toCatalogoResumen);

                    entry.candidatos = top5;

                    if (top5.length > 0 && top5[0].score >= 50) {
                        entry.identificado = true;
                        entry.score = top5[0].score;
                        entry.catalogo = top5[0];
                    }
                } catch {
                    // Error de scoring individual — seguir con el resto
                }
            }

            vehiculos.push(entry);
        }

        const identificados = vehiculos.filter(v => v.identificado).length;

        return NextResponse.json({
            ok: true,
            total: vehiculos.length,
            identificados,
            vehiculos,
        });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Error interno";
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
}
