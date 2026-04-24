import { NextRequest, NextResponse } from "next/server";
import { parseExcelTemplate } from "@/core/flotas";
import { catalogoDataSource } from "@/core/catalogo/catalogoDataSource.csv";
import type { SearchParams } from "@/core/catalogo/catalogoDataSource";

export const runtime = "nodejs";

interface VehiculoEmision {
    matricula: string;
    datos_originales: Record<string, string>;
    identificado: boolean;
    score?: number;
    catalogo?: {
        id_veh: string;
        marca: string;
        modelo: string;
        version: string;
        combustible: string;
        kw: number;
        cilindrada: number;
        plazas: number;
        anyo: number;
        pvp?: number;
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

                    const candidatos = await catalogoDataSource.search(params);

                    if (candidatos.length > 0 && candidatos[0].score >= 50) {
                        const top = candidatos[0];
                        const iniYear = top.fec_ini_comerc
                            ? parseInt(top.fec_ini_comerc.substring(0, 4))
                            : 0;

                        entry.identificado = true;
                        entry.score = top.score;
                        entry.catalogo = {
                            id_veh: top.id_veh,
                            marca: top.marca,
                            modelo: top.modelo,
                            version: top.version,
                            combustible: top.combustible,
                            kw: top.kw,
                            cilindrada: top.cilindrada,
                            plazas: top.num_plazas_max,
                            anyo: iniYear,
                            pvp: top.pvp || undefined,
                        };
                    }
                } catch (err) {
                    // Error de scoring individual → seguir con el resto
                    console.error(`[FLOTAS EMISION] Error scoring matrícula ${matricula}:`, err);
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
        console.error("[FLOTAS EMISION] Error:", error);
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
}
