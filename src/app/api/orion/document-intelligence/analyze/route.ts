import { NextRequest, NextResponse } from "next/server";
import { processDocumentWithAzure } from "@/core/router/azure-doc-int";
import { optimizeForAzure } from "@/core/pipelines/_shared/azureInputOptimizer";
import { readSummary, writeSummaryAtomic } from "../history/route";
import { catalogoDataSource } from "@/core/catalogo/catalogoDataSource.csv";
import type { SearchParams } from "@/core/catalogo/catalogoDataSource";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

const OCR_ENGINE = process.env.OCR_ENGINE || "azure"; // "azure" | "donut"
const OCR_SERVER_URL = process.env.OCR_SERVER_URL || "http://127.0.0.1:5050";

/**
 * Llama al servidor Python Donut OCR y devuelve campos extraidos.
 */
async function processWithDonut(
    buffer: Buffer,
    mimeType: string,
    fileName: string,
    tipoDocumento: string
): Promise<{ campos: Record<string, unknown>; tipo_documento: string; tiempo_ms: number }> {
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
    const form = new FormData();
    form.append("file", blob, fileName);
    form.append("tipo_documento", tipoDocumento);

    const res = await fetch(`${OCR_SERVER_URL}/extract`, {
        method: "POST",
        body: form,
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Donut OCR server error (${res.status}): ${errText}`);
    }

    return await res.json();
}

/**
 * Mapea los campos Donut al formato extractedFields que espera el frontend.
 */
function mapDonutToExtractedFields(campos: Record<string, unknown>, tipoDoc: string): Record<string, unknown> {
    const tipo = String(tipoDoc).toUpperCase();

    if (tipo.includes("FICHA")) {
        return {
            plate: campos.matricula ?? null,
            D1: campos.D1_marca ?? null,
            D3: campos.D3_modelo ?? null,
            E: campos.E_bastidor ?? null,
            J: campos.J_categoria ?? null,
            J1: campos.J1_carroceria ?? null,
            R: campos.R_color ?? null,
            P1: campos.P1_cilindrada ?? null,
            P2: campos.P2_potencia_kw ?? null,
            combustible: campos.P3_combustible ?? null,
            S1: campos.S1_plazas ?? null,
            F1: campos.F1_masa_maxima ?? null,
            F2: campos.F2_masa_servicio ?? null,
            V7: campos.V7_co2 ?? null,
            V9: campos.V9_euro ?? null,
            fechaEmision: campos.fecha_emision ?? null,
            modelo: campos.D3_modelo ?? null,
        };
    }

    if (tipo.includes("PERMISO")) {
        return {
            plate: campos.A_matricula ?? null,
            titular: campos.titular ?? null,
            D1: campos.D1_marca ?? null,
            D2: campos.D2_tipo_variante ?? null,
            D3: campos.D3_denominacion ?? null,
            D4: campos.D4_uso ?? null,
            E: campos.E_bastidor ?? null,
            F1: campos.F1_masa_maxima ?? null,
            F2: campos.F2_masa_servicio ?? null,
            G: campos.G_masa_orden_marcha ?? null,
            P1: campos.P1_cilindrada ?? null,
            P2: campos.P2_potencia ?? null,
            combustible: campos.P3_combustible ?? null,
            S1: campos.S1_plazas ?? null,
            fechaMatriculacion: campos.I_fecha_matriculacion ?? null,
            fechaPermiso: campos.I1_fecha_permiso ?? null,
            localidad: campos.I2_localidad ?? null,
            modelo: campos.D3_denominacion ?? null,
        };
    }

    if (tipo.includes("CARNET")) {
        return {
            apellidos: campos.campo_1_apellidos ?? null,
            nombre: campos.campo_2_nombre ?? null,
            fechaNacimiento: campos.campo_3_nacimiento ?? null,
            paisNacimiento: campos.campo_3_pais ?? null,
            fechaExpedicion: campos.campo_4a_expedicion ?? null,
            fechaCaducidad: campos.campo_4b_caducidad ?? null,
            autoridadExpedicion: campos.campo_4c_autoridad ?? null,
            numeroDocumento: campos.campo_5_numero ?? null,
            categorias: campos.campo_9_categorias ?? null,
            cara: campos.cara ?? null,
            // Pasar tambien campos crudos de categorias trasera
            ...Object.fromEntries(
                Object.entries(campos).filter(([k]) => k.startsWith("cat_"))
            ),
        };
    }

    // Fallback: devolver tal cual
    return campos as Record<string, unknown>;
}

/**
 * Mapea tipo Donut a SingleDocType del frontend.
 */
function mapDonutDocType(tipoDoc: string): string {
    const tipo = String(tipoDoc).toUpperCase();
    if (tipo.includes("FICHA")) return "FICHA_TECNICA";
    if (tipo.includes("PERMISO")) return "PERMISO_V2";
    if (tipo.includes("CARNET")) return "CARNET_CONDUCIR";
    return "UNKNOWN";
}

export async function POST(req: NextRequest) {
    let docIdForHistory: string | null = null;
    if (process.env.ENABLE_OCR !== 'true' && OCR_ENGINE === 'azure') {
        return NextResponse.json({ ok: false, error: 'OCR desactivado temporalmente.', errorCode: 'OCR_DISABLED' }, { status: 503 });
    }
    try {
        const formData = await req.formData();
        docIdForHistory = formData.get("docId") as string | null;
        const file = formData.get("file") as File | null;
        const docCategory = formData.get("docCategory") as string | null;
        const docSubtype = formData.get("docSubtype") as string | null;
        const pageNumberStr = formData.get("pageNumber") as string | null;
        const pageNumber = pageNumberStr ? parseInt(pageNumberStr, 10) : null;

        if (!file) {
            return NextResponse.json({ ok: false, error: "No file provided in form-data payload." }, { status: 400 });
        }

        if (!ALLOWED_MIME_TYPES.includes(file.type)) {
            return NextResponse.json({ ok: false, error: "Invalid file type. Only application/pdf, image/jpeg, and image/png are allowed." }, { status: 400 });
        }

        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json({ ok: false, error: "File exceeds 15MB maximum size limit." }, { status: 400 });
        }

        // Validación de combinaciones docCategory + docSubtype
        if (docCategory) {
            const VALID_COMBINATIONS = new Set([
                'ficha:moderna',
                'ficha:antigua',
                'permiso:',
                'autorizacion:',
                'carnet:anverso',
                'carnet:reverso',
                'carnet:ambas',
            ]);
            const key = `${docCategory}:${docSubtype ?? ''}`;
            if (!VALID_COMBINATIONS.has(key)) {
                return NextResponse.json(
                    { ok: false, error: `Combinación de documento inválida: category='${docCategory}' subtype='${docSubtype ?? '(ninguno)'}'. Combinaciones válidas: ficha+moderna, ficha+antigua, permiso (sin subtipo), autorizacion (sin subtipo), carnet+anverso/reverso/ambas.` },
                    { status: 400 }
                );
            }
        }

        // Convert the File back to Node Buffer for internal FS writing and network payload
        const arrayBuffer = await file.arrayBuffer();
        let buffer = Buffer.from(new Uint8Array(arrayBuffer));
        let finalMimeType = file.type;
        let optResult = null;

        // =====================================================================
        // DONUT ENGINE: Si OCR_ENGINE=donut, usar servidor Python local
        // =====================================================================
        if (OCR_ENGINE === 'donut') {
            // Donut solo acepta imagenes — PDFs no soportados en este motor
            if (file.type === 'application/pdf') {
                return NextResponse.json(
                    { ok: false, error: 'El motor Donut solo acepta imagenes (JPG/PNG). Para PDFs, usa OCR_ENGINE=azure.', errorCode: 'DONUT_PDF_UNSUPPORTED' },
                    { status: 400 }
                );
            }

            // Mapear docCategory a tipo_documento para Donut
            const DONUT_TYPE_MAP: Record<string, string> = {
                ficha: 'ficha_tecnica_moderna',
                permiso: 'permiso_circulacion',
                carnet: 'carnet_conducir',
            };
            const tipoDocumento = docCategory ? (DONUT_TYPE_MAP[docCategory] ?? 'auto') : 'auto';

            const donutResult = await processWithDonut(buffer, finalMimeType, file.name, tipoDocumento);
            const tipoDetectado = donutResult.tipo_documento || 'DESCONOCIDO';
            const extractedFields = mapDonutToExtractedFields(donutResult.campos, tipoDetectado);
            const documentType = mapDonutDocType(tipoDetectado);

            const finalData: Record<string, unknown> = {
                ok: true,
                docId: docIdForHistory || crypto.randomUUID(),
                usedModel: 'donut-orion',
                detectedType: documentType,
                documentType: documentType,
                extractorUsed: 'donut',
                pagesTotalDetected: 1,
                pipelineUsed: 'simple',
                pipelineReason: 'OCR_ENGINE=donut',
                extractedFields,
                donutRaw: donutResult.campos,
                donutTiempoMs: donutResult.tiempo_ms,
                docCategory: docCategory || undefined,
                docSubtype: docSubtype || undefined,
            };

            // Persistir en historial si hay docId
            if (docIdForHistory) {
                try {
                    const summary = await readSummary();
                    const idx = summary.records.findIndex((r: { id: string }) => r.id === docIdForHistory);
                    if (idx >= 0) {
                        summary.records[idx] = {
                            ...summary.records[idx],
                            ...finalData,
                            status: "completed",
                            progress: 100,
                            updatedAt: Date.now()
                        };
                        await writeSummaryAtomic(summary);
                    }
                } catch {
                    // TODO: production logger
                }
            }

            return NextResponse.json(finalData, { status: 200 });
        }

        // =====================================================================
        // AZURE ENGINE: Flujo original
        // =====================================================================

        // FIX 1: Si llega pageNumber y el archivo es un PDF multi-página,
        // extraer esa página específica como PDF de 1 página antes de enviarlo a Azure.
        // Esto preserva la resolución nativa — sin rasterización.
        if (pageNumber && pageNumber > 0 && file.type === 'application/pdf') {
            try {
                const { PDFDocument } = require('pdf-lib');
                const srcDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
                const pageIdx = pageNumber - 1; // 0-based
                if (pageIdx < srcDoc.getPageCount()) {
                    const singlePageDoc = await PDFDocument.create();
                    const [copiedPage] = await singlePageDoc.copyPages(srcDoc, [pageIdx]);
                    singlePageDoc.addPage(copiedPage);
                    const singlePageBytes = await singlePageDoc.save();
                    buffer = Buffer.from(singlePageBytes);
                } else {
                    // pageNumber fuera de rango
                }
            } catch {
                // No se pudo extraer página del PDF, enviando PDF completo
            }
        }

        // Phase 25 Feature: Auto-optimize large images before sending to Azure
        if (file.type.startsWith('image/')) {
            try {
                optResult = await optimizeForAzure({
                    inputBuffer: buffer as any,
                    mimeType: file.type
                });
                if (optResult.optimized) {
                    buffer = Buffer.from(optResult.buffer);
                    finalMimeType = optResult.mimeTypeOut;
                }
            } catch (optError: unknown) {
                if (optError instanceof Error && 'code' in optError && (optError as Error & { code: string }).code === "AZURE_INPUT_TOO_LARGE_AFTER_OPTIMIZE") {
                    return NextResponse.json({ ok: false, error: (optError as Error).message, errorCode: (optError as Error & { code: string }).code }, { status: 400 });
                }
                // Optimization failed/skipped
            }
        }

        let pagesTotalDetected = 1;

        // Phase 24 Feature Toggle: Detect if multi-page PDF and route accordingly
        if (file.type === 'application/pdf') {
            try {
                const { PDFDocument } = require('pdf-lib');
                const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
                pagesTotalDetected = pdfDoc.getPageCount();
            } catch {
                // Could not parse PDF page count, defaulting to 1
            }

            if (pagesTotalDetected > 1) {
                const { processMixedDocument } = require('@/core/router/azure-mixed-pipeline');
                const result = await processMixedDocument(buffer as any, file.type, file.name, docIdForHistory);
                return NextResponse.json({
                    ok: true,
                    docId: result.docId,
                    detectedType: result.documentType,
                    isMixedPdf: result.isMixedPdf,
                    pagesTotal: result.pagesTotal,
                    pageMap: result.pageMap,
                    segments: result.segments,
                    vehicleGroups: result.vehicleGroups,
                    paths: result.paths,
                    extractedPreview: result.extractedPreview,
                    usedModel: result.usedModel,
                    documentType: result.documentType,
                    extractorUsed: result.extractorUsed,
                    classifierEvidence: result.classifierEvidence,
                    ocrQuality: result.ocrQuality,
                    extractedFields: result.extractedFields,
                    decoded: result.decoded,
                    pagesTotalDetected,
                    pipelineUsed: "mixed",
                    pipelineReason: `pagesTotal=${pagesTotalDetected} => mixed`
                }, { status: 200 });
            }
        }

        // Mapear docCategory → lockedType interno
        // 'permiso' NO tiene lockedType: el clasificador decide V1/V2 según contenido
        const DOC_CATEGORY_MAP: Record<string, string | null> = {
            ficha:        'FICHA_TECNICA',
            permiso:      null,            // clasificador interno decide V1/V2
            autorizacion: 'PERMISO_V2',
            carnet:       'CARNET_CONDUCIR',
        };
        const categoryLockedType = docCategory ? DOC_CATEGORY_MAP[docCategory] ?? null : null;

        let replayResult = null;
        let lockedType: string | null = categoryLockedType;
        if (docIdForHistory) {
            try {
                const summary = await readSummary();
                const existingRec = summary.records.find((r: { id: string }) => r.id === docIdForHistory);
                if (existingRec) {
                    if (existingRec.detectedTypeLocked && !categoryLockedType) {
                        lockedType = existingRec.documentType || existingRec.detectedType;
                    }
                    if (process.env.ORION_OCR_REPLAY === "1" && existingRec.paths?.jsonPath) {
                        const fsp = require('fs').promises;
                        const rawJsonStr = await fsp.readFile(existingRec.paths.jsonPath, 'utf8');
                        replayResult = JSON.parse(rawJsonStr);
                    }
                }
            } catch {
                // REPLAY/LOCK failed to read previous JSON
            }
        }

        const result = await processDocumentWithAzure(buffer as any, finalMimeType, file.name, docIdForHistory, replayResult, lockedType);

        let reportMarkdown: string | null = null;
        if (result.paths?.mdPath) {
            const fsp = require('fs').promises;
            try {
                reportMarkdown = await fsp.readFile(result.paths.mdPath, 'utf8');
            } catch {
                // Could not read report.md
            }
        }

        // Phase 7: Matching catálogo — solo ficha siempre, permiso solo si OCR extrajo marca+modelo
        let catalogoCandidatos: import("@/core/catalogo/catalogoDataSource").CatalogoCandidato[] = [];
        const ef = result.extractedFields || {};
        const shouldQueryCatalogo =
            docCategory === 'ficha' ||
            (docCategory === 'permiso' && ef.D1 && ef.D3);

        if (shouldQueryCatalogo) {
            try {
                const searchParams: SearchParams = {};
                if (ef.D1) searchParams.marca = ef.D1;
                const modeloD2 = ef.D2 && !/\//.test(ef.D2) && !/^[A-Z0-9\-]{12,}$/.test((ef.D2 as string).replace(/\s+/g, '')) ? ef.D2 : undefined;
                if (ef.D3 || modeloD2) searchParams.modelo = ef.D3 || modeloD2;
                if (ef.P2) searchParams.kw = parseFloat(String(ef.P2)) || undefined;
                if (ef.P1) searchParams.cilindrada = parseFloat(String(ef.P1)) || undefined;
                if ((ef as any).P21) searchParams.kwElectrico = parseFloat(String((ef as any).P21)) || undefined;
                if (ef.S1) searchParams.plazas = parseInt(String(ef.S1)) || undefined;
                if (ef.G) searchParams.tara = parseFloat(String(ef.G)) || undefined;
                if (ef.combustible) searchParams.combustible = ef.combustible;
                if (ef.plate) {
                    const anyoMatch = String(ef.plate).match(/(\d{4})/);
                    if (anyoMatch) searchParams.anyo = parseInt(anyoMatch[1]);
                }

                if (Object.keys(searchParams).length > 0) {
                    catalogoCandidatos = await catalogoDataSource.search(searchParams);
                }
            } catch {
                // Matching catálogo falló (no crítico)
            }
        }

        const azurePages = result.extractedPreview?.pageCount || 1;

        const efKeys = Object.keys(result.extractedFields || {});
        const noFieldsExtracted = efKeys.length === 0;

        // Normalizar extractedFields para compatibilidad con el frontend:
        // - Permiso/Autorización: añadir claves planas sobre la estructura anidada
        // - Ficha técnica: añadir campo 'modelo' resuelto (D3 > D2 si D2 no es código interno)
        const docType = result.documentType || '';
        const isPermiso = docType === 'PERMISO_V1' || docType === 'PERMISO_V2';
        let normalizedEf: any = { ...ef };

        if (isPermiso) {
            normalizedEf = {
                ...normalizedEf,
                plate:       ef.identification?.license_plate?.value ?? null,
                titular:     ef.holder?.full_name?.value ?? null,
                propietario: ef.holder?.full_name?.value ?? null,
                brand:       ef.vehicleCommercial?.brand?.value ?? null,
                model:       ef.vehicleCommercial?.model?.value ?? null,
                kw:          ef.vehicleTechnical?.power_kw?.value ?? null,
                cilindrada:  ef.vehicleTechnical?.engine_displacement_cc?.value ?? null,
                plazas:      ef.vehicleTechnical?.seats?.value ?? null,
            };
        } else if (!normalizedEf.modelo) {
            // FIX 2: resolver modelo para fichas — D3 > D2 si D2 no es código interno
            const d2 = normalizedEf.D2 as string | undefined;
            const d2IsCode = d2 && (/\//.test(d2) || /^[A-Z0-9\-]{12,}$/.test(d2.replace(/\s+/g, '')));
            normalizedEf.modelo = normalizedEf.D3 ?? (d2IsCode ? undefined : d2) ?? undefined;
        }

        const finalData: any = {
            ok: true,
            docId: result.docId,
            usedModel: result.usedModel,
            detectedType: result.documentType,
            documentType: result.documentType,
            extractorUsed: result.extractorUsed,
            classifierEvidence: result.classifierEvidence,
            pagesTotalDetected: Math.max(pagesTotalDetected, azurePages),
            pipelineUsed: "simple",
            pipelineReason: `pagesTotal=${pagesTotalDetected} => simple`,
            ocrQuality: result.ocrQuality,
            extractedFields: normalizedEf,
            decoded: result.decoded,
            paths: result.paths,
            extractedPreview: result.extractedPreview,
            reportMarkdown,
            catalogoCandidatos,
            catalogoSeleccionado: null,
            docCategory: docCategory || undefined,
            docSubtype: docSubtype || undefined,
            optimization: optResult ? {
                optimized: optResult.optimized,
                beforeBytes: optResult.beforeBytes,
                afterBytes: optResult.afterBytes,
                steps: optResult.steps
            } : undefined,
            ...(noFieldsExtracted ? { warning: 'no_fields_extracted' } : {})
        };

        // Enforce backend persistence so that frontend can reconcile if connection dropped
        if (docIdForHistory) {
            try {
                const summary = await readSummary();
                const idx = summary.records.findIndex((r: { id: string }) => r.id === docIdForHistory);
                if (idx >= 0) {
                    summary.records[idx] = {
                        ...summary.records[idx],
                        ...finalData,
                        status: "completed",
                        progress: 100,
                        updatedAt: Date.now()
                    };
                    await writeSummaryAtomic(summary);
                }
            } catch {
                // TODO: production logger
            }
        }

        return NextResponse.json(finalData, { status: noFieldsExtracted ? 207 : 200 });

    } catch (error: unknown) {
        let status = 500;
        let errorMessage = (error instanceof Error ? error.message : null) || "Internal server error";

        // Map Azure standard error codes to HTTP context
        if (errorMessage.includes("Missing Azure Document")) status = 500;
        if (errorMessage.includes("401") || errorMessage.includes("403")) status = 401;
        if (errorMessage.includes("failed (400)")) status = 400;

        if (docIdForHistory) {
            try {
                const summary = await readSummary();
                const idx = summary.records.findIndex((r: { id: string }) => r.id === docIdForHistory);
                if (idx >= 0) {
                    summary.records[idx].status = "failed";
                    summary.records[idx].error = errorMessage;
                    summary.records[idx].updatedAt = Date.now();
                    await writeSummaryAtomic(summary);
                }
            } catch (histErr) { }
        }

        return NextResponse.json({
            ok: false,
            error: errorMessage
        }, { status: status });
    }
}
