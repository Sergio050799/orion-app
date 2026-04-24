import { NextRequest, NextResponse } from "next/server";
import { EmisionService, extractKeyFields } from "@/services/emission-service.server";
import type { EmisionDocumento } from "@/services/emission-service.server";
import { processDocumentWithAzure } from "@/core/router/azure-doc-int";
import { catalogoDataSource } from "@/core/catalogo/catalogoDataSource.csv";
import type { SearchParams } from "@/core/catalogo/catalogoDataSource";

export const runtime = "nodejs";
export const maxDuration = 120;

const DOC_CATEGORY_MAP: Record<string, string | null> = {
    ficha:        'FICHA_TECNICA',
    permiso:      null,
    autorizacion: 'PERMISO_V2',
    carnet:       'CARNET_CONDUCIR',
};

export async function GET() {
    const emisiones = EmisionService.list();
    return NextResponse.json({ emisiones });
}

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const metaRaw = formData.get("meta") as string | null;
        if (!metaRaw) {
            return NextResponse.json({ ok: false, error: "Falta campo 'meta' en el FormData." }, { status: 400 });
        }

        let metaItems: Array<{ id: string; paginaIndex: number; docCategory: string; docSubtype?: string }>;
        try {
            metaItems = JSON.parse(metaRaw);
        } catch {
            return NextResponse.json({ ok: false, error: "Campo 'meta' no es JSON válido." }, { status: 400 });
        }

        if (!Array.isArray(metaItems) || metaItems.length === 0) {
            return NextResponse.json({ ok: false, error: "Se requiere al menos un documento." }, { status: 400 });
        }

        // Build initial EmisionDocumento list (pendiente)
        const documentosPendientes: EmisionDocumento[] = metaItems.map(m => ({
            id: m.id,
            paginaIndex: m.paginaIndex,
            docCategory: m.docCategory as EmisionDocumento['docCategory'],
            docSubtype: m.docSubtype as EmisionDocumento['docSubtype'] | undefined,
            estado: 'pendiente',
        }));

        const emision = EmisionService.create(documentosPendientes);

        // Process batch async — fire and forget per document
        processBatch(emision.id, metaItems, formData).catch(err => {
            console.error(`[EMISSION] Batch error for emision ${emision.id}:`, err);
            EmisionService.update(emision.id, { estado: 'error' });
        });

        return NextResponse.json({ ok: true, emisionId: emision.id });

    } catch (error: any) {
        console.error("[EMISSION POST] Error:", error);
        return NextResponse.json({ ok: false, error: error.message || "Error interno" }, { status: 500 });
    }
}

async function processBatch(
    emisionId: string,
    metaItems: Array<{ id: string; paginaIndex: number; docCategory: string; docSubtype?: string }>,
    formData: FormData
) {
    for (const meta of metaItems) {
        const file = formData.get(`file_${meta.id}`) as File | null;
        if (!file) {
            EmisionService.updateDocumento(emisionId, meta.id, {
                estado: 'error',
                error: `Archivo no encontrado para id ${meta.id}`,
            });
            continue;
        }

        EmisionService.updateDocumento(emisionId, meta.id, { estado: 'procesando' });

        try {
            const arrayBuffer = await file.arrayBuffer();
            const buffer = Buffer.from(new Uint8Array(arrayBuffer));
            const lockedType = DOC_CATEGORY_MAP[meta.docCategory] ?? null;

            const result = await processDocumentWithAzure(
                buffer as any,
                file.type,
                file.name,
                null,
                null,
                lockedType
            );

            const ef = result.extractedFields || {};
            const docType = result.documentType || '';
            const keyFields = extractKeyFields(docType, ef);

            // Catalog search
            let catalogoCandidatos: any[] = [];
            const shouldSearch = meta.docCategory === 'ficha' ||
                (meta.docCategory === 'permiso' && keyFields.marca && keyFields.modelo);

            if (shouldSearch) {
                try {
                    const searchParams: SearchParams = {};
                    if (keyFields.marca) searchParams.marca = keyFields.marca;
                    if (keyFields.modelo) searchParams.modelo = keyFields.modelo;

                    // Numeric params — only available on fichas
                    const efAny = ef as any;
                    if (efAny.P2) searchParams.kw = parseFloat(String(efAny.P2)) || undefined;
                    if (efAny.P1) searchParams.cilindrada = parseFloat(String(efAny.P1)) || undefined;
                    if (efAny.P21) searchParams.kwElectrico = parseFloat(String(efAny.P21)) || undefined;
                    if (efAny.S1) searchParams.plazas = parseInt(String(efAny.S1)) || undefined;
                    if (efAny.G) searchParams.tara = parseFloat(String(efAny.G)) || undefined;
                    if (efAny.combustible) searchParams.combustible = efAny.combustible;

                    if (Object.keys(searchParams).length > 0) {
                        catalogoCandidatos = await catalogoDataSource.search(searchParams);
                    }
                } catch (catErr) {
                    console.warn('[EMISSION] Catálogo search falló (no crítico):', catErr);
                }
            }

            EmisionService.updateDocumento(emisionId, meta.id, {
                estado: 'completo',
                documentRecordId: result.docId,
                matricula: keyFields.matricula,
                propietario: keyFields.propietario,
                marca: keyFields.marca,
                modelo: keyFields.modelo,
                tipoDocumento: docType,
                extractedFields: ef,
                catalogoCandidatos,
                catalogoSeleccionado: catalogoCandidatos.length > 0 ? catalogoCandidatos[0] : null,
            });

        } catch (err: any) {
            console.error(`[EMISSION] Error procesando doc ${meta.id}:`, err);
            EmisionService.updateDocumento(emisionId, meta.id, {
                estado: 'error',
                error: err.message || 'Error desconocido',
            });
        }
    }

    // All processed — compute stats and close
    const emision = EmisionService.get(emisionId);
    if (emision) {
        EmisionService.computeStats(emision);
        const anyError = emision.documentos.some(d => d.estado === 'error');
        EmisionService.update(emisionId, {
            estado: anyError ? 'error' : 'completa',
            totalVehiculos: emision.totalVehiculos,
            duplicados: emision.duplicados,
        });
    }
}
