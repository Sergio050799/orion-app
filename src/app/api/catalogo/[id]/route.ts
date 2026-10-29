import { NextRequest, NextResponse } from "next/server";
import { catalogoDataSource } from "@/core/catalogo/catalogoDataSource.csv";

export const runtime = "nodejs";

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const veh = await catalogoDataSource.getById(id);

        if (!veh) {
            return NextResponse.json(
                { ok: false, error: `Vehículo ${id} no encontrado` },
                { status: 404 },
            );
        }

        const iniYear = veh.fec_ini_comerc ? parseInt(veh.fec_ini_comerc.substring(0, 4)) : 0;

        return NextResponse.json({
            ok: true,
            vehiculo: {
                id_veh: veh.id_veh,
                marca: veh.marca,
                modelo: veh.modelo,
                version: veh.version,
                combustible: veh.combustible,
                kw: veh.kw,
                cv: veh.cv,
                cilindrada: veh.cilindrada,
                plazas: veh.num_plazas_max,
                tara: veh.tara,
                pma: veh.pma ?? 0,
                puertas: veh.num_puertas,
                anyo: iniYear,
                pvp: veh.pvp || undefined,
                score: 100,
            },
        });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Error interno";
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
}
