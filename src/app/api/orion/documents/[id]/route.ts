import { NextRequest, NextResponse } from "next/server";
import { readSummary, writeSummaryAtomic } from "@/app/api/orion/document-intelligence/history/route";
import { catalogoDataSource } from "@/core/catalogo/catalogoDataSource.csv";

export const runtime = "nodejs";

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await req.json();
        const id_veh: string = body?.catalogoSeleccionado;

        if (!id_veh || typeof id_veh !== 'string') {
            return NextResponse.json(
                { ok: false, error: "Se requiere 'catalogoSeleccionado' (id_veh) en el body." },
                { status: 400 }
            );
        }

        // Verificar que el vehículo existe en el catálogo
        const vehiculo = await catalogoDataSource.getById(id_veh);
        if (!vehiculo) {
            return NextResponse.json(
                { ok: false, error: `Vehículo con id_veh '${id_veh}' no encontrado en el catálogo.` },
                { status: 404 }
            );
        }

        // Actualizar el DocumentRecord en el historial
        const summary = await readSummary();
        const idx = summary.records.findIndex((r: any) => r.id === id);

        if (idx < 0) {
            return NextResponse.json(
                { ok: false, error: `Documento '${id}' no encontrado.` },
                { status: 404 }
            );
        }

        summary.records[idx] = {
            ...summary.records[idx],
            catalogoSeleccionado: vehiculo,
            updatedAt: Date.now(),
        };

        await writeSummaryAtomic(summary);

        return NextResponse.json(
            { ok: true, document: summary.records[idx] },
            { status: 200 }
        );

    } catch (error: any) {
        console.error("[DOCUMENTS PATCH] Error:", error);
        return NextResponse.json({ ok: false, error: error.message || "Error interno" }, { status: 500 });
    }
}
