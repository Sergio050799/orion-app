import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { readSummary } from "@/app/api/orion/document-intelligence/history/route";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const ids: string[] = body?.ids;

        if (!Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json({ ok: false, error: "Se requiere un array 'ids' con al menos un ID." }, { status: 400 });
        }

        const summary = await readSummary();
        const allRecords: any[] = summary.records || [];

        const records = allRecords.filter((r: any) => ids.includes(r.id));
        if (records.length === 0) {
            return NextResponse.json({ ok: false, error: "No se encontraron documentos con los IDs proporcionados." }, { status: 404 });
        }

        const rows = records.map((r: any) => {
            const f = r.extractedFields || {};
            const cat = r.catalogoSeleccionado || null;

            const kw = f.P2 ?? cat?.kw ?? null;
            const kwNum = kw !== null ? parseFloat(String(kw)) || null : null;
            const cv = kwNum !== null ? Math.round(kwNum * 1.36) : null;

            return {
                "ID":         cat?.id_veh ?? '',
                "MARCA":      f.D1 || cat?.marca || '',
                "MODELO":     f.D3 || (f.D2 && !/\//.test(f.D2) && !/^[A-Z0-9\-]{12,}$/.test(String(f.D2).replace(/\s+/g,'')) ? f.D2 : null) || cat?.modelo || '',
                "AÑO":        f.plate ? (f.plate.match(/\d{4}/) || [])[0] || '' : '',
                "KW":         kwNum ?? '',
                "CV":         cv ?? '',
                "PLAZAS":     f.S1 ?? cat?.num_plazas_max ?? '',
                "DIMENSIONES": f.dimensiones || '',
                "PESOS":      f.G || f.F2 || '',
                "VERSION FINAL": cat?.version || '',
            };
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);

        // Anchos de columna
        ws['!cols'] = [
            { wch: 12 }, // ID
            { wch: 20 }, // MARCA
            { wch: 25 }, // MODELO
            { wch: 6  }, // AÑO
            { wch: 6  }, // KW
            { wch: 6  }, // CV
            { wch: 8  }, // PLAZAS
            { wch: 20 }, // DIMENSIONES
            { wch: 15 }, // PESOS
            { wch: 35 }, // VERSION FINAL
        ];

        // Primera fila congelada
        ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft' };

        XLSX.utils.book_append_sheet(wb, ws, "Vehículos");

        const dateStr = new Date().toISOString().slice(0, 10);
        const filename = `orion_export_${dateStr}.xlsx`;

        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });

    } catch (error: any) {
        return NextResponse.json({ ok: false, error: error.message || "Error interno" }, { status: 500 });
    }
}
