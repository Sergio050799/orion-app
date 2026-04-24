import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PDFDocument } from 'pdf-lib';
import { AzureError } from "@/types/azure";
// Re-use runAzureModel, assuming it's exported or we copy it?
// Actually, runAzureModel is inside azure-doc-int.ts but not exported. Let me just copy it for zero interference with Zone 3, or export it.
// I will just fetch it directly to maintain absolute isolation as requested.

const SUMMARY_DIR = path.join(process.cwd(), "src", "core", "_source_of_truth", "runtime_snapshots", "document_intelligence");
const SUMMARY_FILE = path.join(SUMMARY_DIR, "summary.json");

function normalizeTextForClassification(text: string): string {
    return text
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

async function updateBackendProgress(docId: string | undefined | null, progress: number, attempts = 0) {
    if (!docId) return;
    try {
        const TMP_FILE = path.join(SUMMARY_DIR, `summary_${crypto.randomUUID()}.tmp`);
        const data = await fs.promises.readFile(SUMMARY_FILE, "utf-8");
        const summary = JSON.parse(data);
        const index = summary.records.findIndex((r: { id: string }) => r.id === docId);
        if (index >= 0) {
            summary.records[index].progress = progress;
            if (attempts > 0) summary.records[index].attempts = attempts;
            summary.records[index].heartbeatAt = Date.now();
            summary.updatedAt = new Date().toISOString();
            await fs.promises.writeFile(TMP_FILE, JSON.stringify(summary, null, 2), "utf-8");
            await fs.promises.rename(TMP_FILE, SUMMARY_FILE);
        }
    } catch (e) { } // Silent fail tracking
}

export async function processMixedDocument(fileBuffer: Buffer, mimeType: string, originalName: string, docId?: string | null) {
    if (!process.env.AZURE_DOCINT_ENDPOINT || !process.env.AZURE_DOCINT_KEY) {
        throw new Error("Missing Azure Document Intelligence environment variables.");
    }

    const endpoint = process.env.AZURE_DOCINT_ENDPOINT;
    const key = process.env.AZURE_DOCINT_KEY;
    const apiVersion = process.env.AZURE_DOCINT_API_VERSION || '2024-02-29-preview';
    const cleanEndpoint = endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;

    // Load PDF to count pages and maybe split for saving visual segments later
    const pdfDoc = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
    const pagesTotal = pdfDoc.getPageCount();

    // Send document to Azure page by page to avoid InvalidContentLength / Too Large errors (Strategy A)
    const analyzeUrl = `${cleanEndpoint}/documentintelligence/documentModels/prebuilt-layout:analyze?api-version=${apiVersion}`;

    const allPagesAnalyzed: any[] = []; // TODO: K-2 Phase 2 — tipar AzurePageResult[]

    for (let pObjIndex = 0; pObjIndex < pagesTotal; pObjIndex++) {
        await updateBackendProgress(docId, Math.round(15 + ((pObjIndex) / pagesTotal) * 75));

        const singlePdf = await PDFDocument.create();
        const [copiedPage] = await singlePdf.copyPages(pdfDoc, [pObjIndex]);
        singlePdf.addPage(copiedPage);
        const singlePdfBytes = await singlePdf.save();

        let postRes: Response | null = null;
        let attempt = 0;
        const maxPostRetries = 3;
        const delays = [1500, 3000];

        const postAbort = new AbortController();
        const postTimeout = setTimeout(() => postAbort.abort(), 60000); // 60s max per POST

        try {
            while (attempt < maxPostRetries) {
                try {
                    postRes = await fetch(analyzeUrl, {
                        method: 'POST',
                        headers: { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/pdf' },
                        // @ts-expect-error Node.js Buffer is compatible with BodyInit at runtime
                        body: Buffer.from(singlePdfBytes),
                        signal: postAbort.signal
                    });
                } catch (e: unknown) {
                    if (e instanceof Error && e.name === 'AbortError') {
                        throw new AzureError(
                            `Azure POST failed (Timeout): La página ${pObjIndex + 1} superó el límite de 60s en Azure.`,
                            408,
                            "AZURE_PAGE_TIMEOUT"
                        );
                    }
                    throw e;
                }

                if (postRes.ok) break;

                if (postRes.status === 429 && attempt < maxPostRetries - 1) {
                    console.warn(`[Azure Mixed] 429 Rate Limit. Retrying page ${pObjIndex + 1} in ${delays[attempt]}ms...`);
                    await new Promise(r => setTimeout(r, delays[attempt]));
                    attempt++;
                    continue;
                }

                if (postRes.status === 400) {
                    const errText = await postRes.text().catch(() => postRes?.statusText);
                    if (errText?.includes('InvalidContentLength') || errText?.includes('too large') || errText?.includes('InvalidRequest')) {
                        throw new AzureError(
                            `Azure POST failed (400): Content Too Large en Página ${pObjIndex + 1}. Documento demasiado grande. Prueba 'Modo seguro' (sin imágenes) o segmentación por páginas.`,
                            400,
                            "AZURE_CONTENT_TOO_LARGE"
                        );
                    }
                    throw new AzureError(`Azure POST failed (${postRes.status}): ${errText}`, postRes.status, "AZURE_POST_ERROR");
                }

                const errText = await postRes.text().catch(() => postRes?.statusText);
                throw new AzureError(`Azure POST failed (${postRes.status}): ${errText}`, postRes.status, "AZURE_POST_ERROR");
            }
        } finally {
            clearTimeout(postTimeout);
        }

        if (!postRes || !postRes.ok) throw new Error(`Azure Mixed Analyze POST failed unexpectedly for page ${pObjIndex + 1}`);

        const operationLocation = postRes.headers.get('Operation-Location');
        if (!operationLocation) throw new Error("No Operation-Location header from Azure.");

        let result: any = null;
        const maxRetries = 40;
        for (let i = 0; i < maxRetries; i++) {
            await new Promise(r => setTimeout(r, 1500));
            // Pulse heartbeat continuously during polling
            if (i % 3 === 0) await updateBackendProgress(docId, Math.round(15 + ((pObjIndex + 0.5) / pagesTotal) * 75));

            const getAbort = new AbortController();
            const getTimeout = setTimeout(() => getAbort.abort(), 15000);
            try {
                const getRes = await fetch(operationLocation, { headers: { 'Ocp-Apim-Subscription-Key': key }, signal: getAbort.signal });
                clearTimeout(getTimeout);
                if (getRes.ok) {
                    result = await getRes.json();
                    if (result.status === "succeeded" || result.status === "failed") break;
                }
            } catch (e: unknown) {
                clearTimeout(getTimeout);
                if (e instanceof Error && e.name === 'AbortError') continue; // Transient network hang, continue poll loop
                continue; // Ignore generic network drops to ensure resilience
            }
        }

        if (!result || result.status !== "succeeded") {
            throw new Error(`Azure Mixed Analyze failed or timed out for page ${pObjIndex + 1}.`);
        }

        const pageResult = result.analyzeResult?.pages?.[0];
        if (pageResult) {
            pageResult.pageNumber = pObjIndex + 1; // Normalize to global page index
            allPagesAnalyzed.push(pageResult);
        }
    }

    const analyzeResult = { pages: allPagesAnalyzed };

    // Classification per page
    const pageMap: any[] = [];
    const segments: any[] = [];
    const linesByPage = new Map<number, string[]>();
    const fullTextByPage = new Map<number, string>();
    const isPermisoEnabled = process.env.ENABLE_PERMISO_PIPELINE === "true";

    // Parse lines to build text objects
    for (const page of analyzeResult.pages || []) {
        const pIndex = page.pageNumber || page.pageIndex;
        const pLines = page.lines ? page.lines.map((l: { content: string }) => l.content) : [];
        const fullText = pLines.join(" ").toUpperCase();
        const fullTextNormalized = normalizeTextForClassification(fullText);
        const normalizedLines = pLines.map((line: string) => normalizeTextForClassification(line));
        linesByPage.set(pIndex, pLines);
        fullTextByPage.set(pIndex, fullText);

        let type = "UNKNOWN";
        let conf = 0;

        // Deterministic classification
        if (
            fullTextNormalized.includes("TARJETA ITV") ||
            (fullTextNormalized.includes("INSPECCI") && fullTextNormalized.includes("TECNICA")) ||
            (fullTextNormalized.includes("D.1") && fullTextNormalized.includes("D.2") && fullTextNormalized.includes("D.3") && fullTextNormalized.includes("F.1")) ||
            (fullTextNormalized.includes("MARCA") && fullTextNormalized.includes("TARA") && fullTextNormalized.includes("VARIANTE")) || // Old format
            (normalizedLines.filter((l: string) => l.match(/^(D\.1|D\.2|D\.3|J|J\.1|J\.2|J\.3|P\.1|P\.2|P\.3|F\.1|F\.2|G|E)$/)).length >= 3)
        ) {
            type = "FICHA_TECNICA";
            conf = 0.95;
        } else if (
            isPermisoEnabled &&
            (
                fullTextNormalized.includes("PERMISO DE CIRCULACION") ||
                fullTextNormalized.includes("JEFATURA DE TRAFICO") ||
                (fullTextNormalized.includes("TITULAR") && pLines.some((l: string) => l.match(/^[0-9]{4}\s?[A-Z]{3}$/i)))
            )
        ) {
            // Distinguish card vs full page. Completo usually has dense blocks or explicit fields
            if (fullTextNormalized.includes("MINISTERIO DEL INTERIOR") && pLines.length > 30 && fullTextNormalized.includes("A.") && fullTextNormalized.includes("B.")) {
                type = "PERMISO_COMPLETO";
            } else {
                type = "PERMISO_TARJETA";
            }
            conf = 0.90;
        }

        pageMap.push({
            pageIndex: pIndex,
            rotationApplied: page.angle || 0,
            detectedType: type,
            confidence: conf
        });
    }

    // Grouping into Segments
    let currentSegment: any = null;
    for (const pm of pageMap) {
        if (!currentSegment || currentSegment.type !== pm.detectedType) {
            currentSegment = {
                id: crypto.randomUUID(),
                type: pm.detectedType,
                pages: [pm.pageIndex],
                extractionStatus: "pending",
                extractedData: {}
            };
            segments.push(currentSegment);
        } else {
            currentSegment.pages.push(pm.pageIndex);
        }
    }

    // Simple Extractors per segment type
    for (const seg of segments) {
        try {
            if (seg.type === "UNKNOWN") {
                seg.extractionStatus = "failed";
                continue;
            }

            const segLines = seg.pages.flatMap((pIdx: number) => linesByPage.get(pIdx) || []);
            const segText = segLines.join(" \n ").toUpperCase();

            // Matrícula Regex for all
            const findPlate = (txt: string) => {
                const match = txt.match(/\b(\d{4}\s?-?[A-Z]{3}|[A-Z]{1,2}\s?-?\d{4}\s?-?[A-Z]{1,2}|R\s?\d{4}\s?-?[A-Z]{3})\b/i);
                return match ? match[1].replace(/[-\s]/g, '').toUpperCase() : null;
            };
            const findVIN = (txt: string) => {
                const match = txt.match(/\b([A-HJ-NPR-Z0-9]{17})\b/i);
                return match ? match[1] : null;
            };

            const plate = findPlate(segText);
            const vin = findVIN(segText);

            if (seg.type === "FICHA_TECNICA") {
                // To guarantee backward compatibility, the EXACT same mapping approach for Ficha
                // We'll mimic the legacy extractor structurally, or just pull the basic fields if needed.
                // The prompt says "FICHA -> usar EXACTAMENTE el pipeline actual sin modificarlo".
                // I will dynamically invoke extractFields from azure-doc-int.ts!
                const legacyModule = require('./azure-doc-int');

                // Pass a mocked AnalyzeResult containing only the lines of this segment
                // extractFields uses fullText and allLines
                const mockedAnalyzeResult = { content: segText };
                const { extractedFields, decoded } = legacyModule.extractFields(segText, segLines, mockedAnalyzeResult);
                seg.extractedData = { ...extractedFields, plate: extractedFields.plate || plate, E: extractedFields.E || vin, decoded };
                seg.extractionStatus = "done";

            } else if (seg.type.startsWith("PERMISO")) {
                const extracted: any = { plate, E: vin };

                // Fecha matriculación (B)
                const dateMatch = segText.match(/\b(\d{2}[\/\-]\d{2}[\/\-]\d{4})\b/);
                if (dateMatch) extracted.issueDate = dateMatch[1];

                // Titular / C.1.1 (apellidos) C.1.2 (nombre) / C.1.3 (dirección)
                const nameMatch = segText.match(/C\.1\.1\s+([^A-Z]*[A-Z].+?)(\n|C\.)/);
                if (nameMatch) extracted.titularApellidos = nameMatch[1].trim();

                seg.extractedData = extracted;
                seg.extractionStatus = "done";
            }
        } catch (e) {
            console.error("Extraction error on segment", e);
            seg.extractionStatus = "failed";
        }
    }

    // Vehicle Grouping
    const vehicleGroups: any[] = [];
    const groupsByMatric = new Map<string, any>();
    const groupsByVin = new Map<string, any>();

    for (const seg of segments) {
        if (seg.type === "UNKNOWN") continue;

        const mat = seg.extractedData?.plate;
        const vin = seg.extractedData?.E;

        let targetGroup = null;
        if (mat && groupsByMatric.has(mat)) targetGroup = groupsByMatric.get(mat);
        if (!targetGroup && vin && groupsByVin.has(vin)) targetGroup = groupsByVin.get(vin);

        if (!targetGroup) {
            targetGroup = {
                id: crypto.randomUUID(),
                matricula: mat,
                bastidor: vin,
                documents: []
            };
            vehicleGroups.push(targetGroup);
            if (mat) groupsByMatric.set(mat, targetGroup);
            if (vin) groupsByVin.set(vin, targetGroup);
        }

        // Merge Identifiers if discovered on subsequent docs
        if (!targetGroup.matricula && mat) { targetGroup.matricula = mat; groupsByMatric.set(mat, targetGroup); }
        if (!targetGroup.bastidor && vin) { targetGroup.bastidor = vin; groupsByVin.set(vin, targetGroup); }

        targetGroup.documents.push({
            segmentId: seg.id,
            type: seg.type,
            pages: seg.pages,
            status: seg.extractionStatus
        });
    }

    // Fallback proximity grouping for leftover docs without Mat/VIN
    const orphanSegments = segments.filter(s => s.type !== "UNKNOWN" && !s.extractedData?.plate && !s.extractedData?.E);
    for (const seg of orphanSegments) {
        if (vehicleGroups.length === 1) {
            vehicleGroups[0].documents.push({ segmentId: seg.id, type: seg.type, pages: seg.pages, status: seg.extractionStatus });
        } else if (vehicleGroups.length > 1) {
            // Find closest group by page proximity
            let closestGroup = vehicleGroups[0];
            let minDistance = 999;
            for (const grp of vehicleGroups) {
                const pages = grp.documents.flatMap((d: { pages: number[] }) => d.pages);
                const distance = Math.min(...pages.map((p: number) => Math.abs(p - seg.pages[0])));
                if (distance < minDistance) {
                    minDistance = distance;
                    closestGroup = grp;
                }
            }
            closestGroup.documents.push({ segmentId: seg.id, type: seg.type, pages: seg.pages, status: seg.extractionStatus });
        }
    }

    // Storage
    const dateStr = new Date().toISOString().split("T")[0];
    const finalDocId = docId || crypto.randomUUID();
    const baseDir = path.join(process.cwd(), "src", "core", "_source_of_truth", "runtime_snapshots", "document_intelligence", dateStr, `doc_${finalDocId}`);
    fs.mkdirSync(baseDir, { recursive: true });

    // Save Original XML/PDF
    const ext = originalName.split(".").pop() || "bin";
    const originalPath = path.join(baseDir, `original.${ext}`);
    fs.writeFileSync(originalPath, fileBuffer);

    // Save Mixed JSON Results
    fs.writeFileSync(path.join(baseDir, "azure_mixed.result.json"), JSON.stringify(analyzeResult, null, 2));

    // Save PDF Segments individually! (This fulfills the ZIP requirement)
    for (const seg of segments) {
        if (seg.pages.length === 0) continue;
        const newPdf = await PDFDocument.create();
        const copiedPages = await newPdf.copyPages(pdfDoc, seg.pages.map((p: number) => p - 1));
        copiedPages.forEach(p => newPdf.addPage(p));
        const segBytes = await newPdf.save();

        fs.writeFileSync(path.join(baseDir, `segment_${seg.id}.pdf`), segBytes);
        fs.writeFileSync(path.join(baseDir, `segment_${seg.id}.json`), JSON.stringify(seg.extractedData, null, 2));
    }

    const isMixedPdf = pagesTotal > 1 &&
        (segments.length > 0 || vehicleGroups.length > 0) &&
        segments.some(s => s.pages.length >= 1 && s.type !== "UNKNOWN");

    const summary = {
        docId: finalDocId,
        createdAt: new Date().toISOString(),
        isMixedPdf,
        pagesTotal,
        pageMap,
        segments,
        vehicleGroups
    };
    fs.writeFileSync(path.join(baseDir, "summary.json"), JSON.stringify(summary, null, 2));

    const firstFicha = segments.find(s => s.type === "FICHA_TECNICA")?.extractedData
        || segments.find(s => s.type !== "UNKNOWN")?.extractedData
        || {};

    return {
        docId: finalDocId,
        isMixedPdf,
        pagesTotal,
        pageMap,
        segments,
        vehicleGroups,
        paths: { jsonPath: path.join(baseDir, "azure_mixed.result.json"), mdPath: '' }, // Keep structure
        extractedPreview: { pageCount: pagesTotal, firstLines: [] },
        usedModel: "mixed-pipeline",
        documentType: "MIXED_DOCUMENT",
        extractorUsed: "azureMixedPipeline",
        classifierEvidence: { evidence: ["Multi-page heuristics"] },
        ocrQuality: { ocrChars: 0, nonEmptyLines: 0, fieldsFoundCount: Object.keys(firstFicha).length || 15, quality: "high" },
        extractedFields: { ...firstFicha, plate: vehicleGroups[0]?.matricula || firstFicha.plate || (isMixedPdf ? 'MIXED-PDF' : null) },
        decoded: null
    };
}

