import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { EmisionService } from "@/services/emission-service.server";
import type { CatalogoVehiculo } from "@/core/catalogo/catalogoDataSource";

export const runtime = "nodejs";

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        const emision = EmisionService.get(id);
        if (!emision) {
            return NextResponse.json({ ok: false, error: "Emisión no encontrada." }, { status: 404 });
        }

        const rows = emision.documentos.map(doc => {
            const cat = doc.catalogoSeleccionado as CatalogoVehiculo | null;

            const kwRaw = (doc.extractedFields as any)?.P2 ?? cat?.kw ?? null;
            const kwNum = kwRaw !== null ? parseFloat(String(kwRaw)) || null : null;
            const cv = kwNum !== null ? Math.round(kwNum * 1.36) : null;

            return {
                "MATRÍCULA":     doc.matricula || '',
                "PROPIETARIO":   doc.propietario || '',
                "MARCA":         doc.marca || cat?.marca || '',
                "MODELO":        doc.modelo || cat?.modelo || '',
                "TIPO":          doc.docCategory || '',
                "ID":            cat?.id_veh || '',
                "KW":            kwNum ?? '',
                "CV":            cv ?? '',
                "PLAZAS":        cat?.num_plazas_max ?? '',
                "VERSION FINAL": cat?.version || '',
            };
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);

        ws['!cols'] = [
            { wch: 12 }, // MATRÍCULA
            { wch: 30 }, // PROPIETARIO
            { wch: 20 }, // MARCA
            { wch: 25 }, // MODELO
            { wch: 12 }, // TIPO
            { wch: 12 }, // ID
            { wch: 6  }, // KW
            { wch: 6  }, // CV
            { wch: 8  }, // PLAZAS
            { wch: 35 }, // VERSION FINAL
        ];

        ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft' };

        XLSX.utils.book_append_sheet(wb, ws, "Emisión");

        const dateStr = new Date().toISOString().slice(0, 10);
        const filename = `orion_emision_${emision.numero}_${dateStr}.xlsx`;

        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });

    } catch (error: any) {
        console.error("[EMISSION EXPORT] Error:", error);
        return NextResponse.json({ ok: false, error: error.message || "Error interno" }, { status: 500 });
    }
}
