import { NextRequest, NextResponse } from "next/server";
import { processDocumentWithAzure } from "@/core/router/azure-doc-int";
import { optimizeForAzure } from "@/core/pipelines/_shared/azureInputOptimizer";
import { readSummary, writeSummaryAtomic } from "../history/route";
import { catalogoDataSource } from "@/core/catalogo/catalogoDataSource.csv";
import type { SearchParams } from "@/core/catalogo/catalogoDataSource";

export const runtime = "nodejs";
export const maxDuration = 60; // Extend generic Vercel timeouts if eventually hosted

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

export async function POST(req: NextRequest) {
    let docIdForHistory: string | null = null;
    if (process.env.ENABLE_OCR !== 'true') {
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
                    console.warn(`[ORION API] pageNumber ${pageNumber} fuera de rango (${srcDoc.getPageCount()} páginas)`);
                }
            } catch (pageErr) {
                console.warn('[ORION API] No se pudo extraer página del PDF, enviando PDF completo:', pageErr);
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
                    buffer = optResult.buffer;
                    finalMimeType = optResult.mimeTypeOut;
                }
            } catch (optError: unknown) {
                if (optError instanceof Error && 'code' in optError && (optError as Error & { code: string }).code === "AZURE_INPUT_TOO_LARGE_AFTER_OPTIMIZE") {
                    return NextResponse.json({ ok: false, error: (optError as Error).message, errorCode: (optError as Error & { code: string }).code }, { status: 400 });
                }
                console.warn("[ORION API] Optimization failed/skipped:", optError);
            }
        }

        let pagesTotalDetected = 1;

        // Phase 24 Feature Toggle: Detect if multi-page PDF and route accordingly
        if (file.type === 'application/pdf') {
            try {
                const { PDFDocument } = require('pdf-lib');
                const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
                pagesTotalDetected = pdfDoc.getPageCount();
            } catch (e) {
                console.warn("[ORION API] Could not parse PDF page count, defaulting to 1.");
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
            } catch (e) {
                console.warn("[ORION API] REPLAY/LOCK failed to read previous JSON.", e);
            }
        }

        const result = await processDocumentWithAzure(buffer as any, finalMimeType, file.name, docIdForHistory, replayResult, lockedType);

        let reportMarkdown: string | null = null;
        if (result.paths?.mdPath) {
            const fsp = require('fs').promises;
            try {
                reportMarkdown = await fsp.readFile(result.paths.mdPath, 'utf8');
            } catch (e) {
                console.warn("[ORION API] Could not read report.md", e);
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
            } catch (catErr) {
                console.warn('[ORION API] Matching catálogo falló (no crítico):', catErr);
            }
        }

        const azurePages = result.extractedPreview?.pageCount || 1;
        if (azurePages !== pagesTotalDetected) {
            console.warn(`[ORION API] Page count discrepancy: PDF-lib=${pagesTotalDetected}, Azure=${azurePages}`);
        }

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
            } catch (histErr) {
                console.error("[ORION API] Failed to persist completion to history DB", histErr);
            }
        }

        return NextResponse.json(finalData, { status: noFieldsExtracted ? 207 : 200 });

    } catch (error: unknown) {
        console.error("[ORION API] Azure Document Intelligence Analyze Error:", error);

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
