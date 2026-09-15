import { NextRequest, NextResponse } from "next/server";
import { EmisionService } from "@/services/emission-service.server";
import { catalogoDataSource } from "@/core/catalogo/catalogoDataSource.csv";

export const runtime = "nodejs";

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; docId: string }> }
) {
    const { id, docId } = await params;
    try {
        const body = await req.json();
        const { catalogoSeleccionadoId, plate, propietario, marca, modelo } = body;

        const patch: Record<string, any> = {};

        // Campos editables directos
        if (plate      !== undefined) patch.matricula   = plate;
        if (propietario !== undefined) patch.propietario = propietario;
        if (marca      !== undefined) patch.marca       = marca;
        if (modelo     !== undefined) patch.modelo      = modelo;

        // Catálogo seleccionado (lookup por id_veh)
        if (catalogoSeleccionadoId !== undefined) {
            if (catalogoSeleccionadoId === null) {
                patch.catalogoSeleccionado = null;
            } else {
                const cat = await catalogoDataSource.getById(catalogoSeleccionadoId);
                if (!cat) {
                    return NextResponse.json({ ok: false, error: "Vehículo de catálogo no encontrado." }, { status: 404 });
                }
                patch.catalogoSeleccionado = cat;
            }
        }

        if (Object.keys(patch).length === 0) {
            return NextResponse.json({ ok: false, error: "No se enviaron campos a actualizar." }, { status: 400 });
        }

        const updated = EmisionService.updateDocumento(id, docId, patch);
        if (!updated) {
            return NextResponse.json({ ok: false, error: "Documento no encontrado." }, { status: 404 });
        }

        return NextResponse.json({ ok: true, documento: updated });
    } catch (error: any) {
        return NextResponse.json({ ok: false, error: error.message || "Error interno" }, { status: 500 });
    }
}

export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string; docId: string }> }
) {
    const { id, docId } = await params;
    const deleted = EmisionService.deleteDocumento(id, docId);
    if (!deleted) {
        return NextResponse.json({ ok: false, error: "Documento no encontrado." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
}
