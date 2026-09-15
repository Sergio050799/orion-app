import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { decodeCL } from "../pipelines/ficha_tecnica/dictionary-decoder";
import { runAzureModel } from "./azure-client";
import { extractFields } from "./field-extraction";
import { computeOcrQuality, generateDecoded } from "./ocr-quality";
import type { AzureAnalyzeResult } from "@/types/azure";

// Re-export for consumers that import from this file
export { runAzureModel } from "./azure-client";
export { extractFields } from "./field-extraction";
export { computeOcrQuality, generateDecoded } from "./ocr-quality";
export type { OcrQuality } from "./ocr-quality";

export async function processDocumentWithAzure(fileBuffer: Buffer, mimeType: string, originalName: string, docIdForHistory?: string | null, replayResult?: AzureAnalyzeResult | null, lockedType?: string | null) {
    let usedModel = "prebuilt-read";
    let analyzeResult = replayResult;

    if (!analyzeResult) {
        if (!process.env.AZURE_DOCINT_ENDPOINT || !process.env.AZURE_DOCINT_KEY) {
            throw new Error("Missing Azure Document Intelligence environment variables.");
        }
        analyzeResult = await runAzureModel(usedModel, fileBuffer, mimeType);
    } else {
        usedModel = "REPLAY_CACHE";
    }

    let ocrResult = computeOcrQuality(analyzeResult!, lockedType);

    const extractedFieldsFicha = ocrResult.extractedFields as any;
    const needsFallback = ocrResult.documentType === "FICHA_TECNICA" && (ocrResult.mandatoryFoundCount < 8 || !extractedFieldsFicha.J || !extractedFieldsFicha.J1 || !extractedFieldsFicha.J2 || !extractedFieldsFicha.J3 || !extractedFieldsFicha.F6);

    if (needsFallback) {
        try {
            // OCR Low Quality — falling back to prebuilt-layout
            const layoutResult = await runAzureModel("prebuilt-layout", fileBuffer, mimeType);
            const layoutOcrResult = computeOcrQuality(layoutResult as AzureAnalyzeResult);

            if (layoutOcrResult.mandatoryFoundCount > ocrResult.mandatoryFoundCount || (layoutOcrResult.mandatoryFoundCount === ocrResult.mandatoryFoundCount && layoutOcrResult.fieldsFoundCount > ocrResult.fieldsFoundCount)) {
                usedModel = "prebuilt-layout";
                analyzeResult = layoutResult;
                ocrResult = layoutOcrResult;
                // Fallback successful — using prebuilt-layout
            } else {
                // Fallback yielded fewer or equal mandatory fields — keeping prebuilt-read
            }
        } catch {
            // Fallback to prebuilt-layout failed, sticking with prebuilt-read
        }
    }

    const { documentType, extractorUsed, classifierEvidence, extractedFields, decoded, allLines, ocrChars, nonEmptyLines, fieldsFoundCount, quality } = ocrResult;
    const pageCount = analyzeResult?.pages?.length || 1;
    const firstLines = allLines.slice(0, 10);

    const dateStr = new Date().toISOString().split("T")[0];
    const docId = docIdForHistory || crypto.randomUUID();
    const baseDir = path.join(
        process.cwd(),
        "src",
        "core",
        "_source_of_truth",
        "runtime_snapshots",
        "document_intelligence",
        dateStr,
        `doc_${docId}`
    );

    fs.mkdirSync(baseDir, { recursive: true });

    const ext = originalName.split(".").pop() || "bin";
    const originalPath = path.join(baseDir, `original.${ext}`);
    fs.writeFileSync(originalPath, fileBuffer);

    const jsonPath = path.join(baseDir, "azure_read.result.json");
    fs.writeFileSync(jsonPath, JSON.stringify(analyzeResult, null, 2));

    const summary = {
        docId,
        createdAt: new Date().toISOString(),
        pageCount,
        firstLines,
        usedModel,
        detectedType: documentType,
        documentType,
        detectedTypeLocked: true,
        detectedTypeEvidence: classifierEvidence,
        extractorUsed,
        classifierEvidence,
        ocrQuality: { ocrChars, nonEmptyLines, fieldsFoundCount, quality },
        extractedFields,
        decoded
    };
    fs.writeFileSync(path.join(baseDir, "summary.json"), JSON.stringify(summary, null, 2));

    const mdPath = path.join(baseDir, "report.md");

    let mdContent = "";

    if (documentType === "PERMISO_V1" || documentType === "PERMISO_V2") {
        const pRecord = extractedFields as any;
        const brand = pRecord.vehicleCommercial?.brand?.value || "---";
        const model = pRecord.vehicleCommercial?.model?.value || "---";
        const plate = pRecord.identification?.license_plate?.value || "---";
        const vin = pRecord.identification?.vin?.value || "---";
        const titular = pRecord.holder?.full_name?.value || "---";
        const kw = pRecord.vehicleTechnical?.power_kw?.value ?? null;
        const cv = pRecord.vehicleTechnical?.power_cv?.value ?? null;
        const cc = pRecord.vehicleTechnical?.engine_displacement_cc?.value ?? null;
        const fuel = pRecord.vehicleTechnical?.fuel_raw?.value || null;
        const seats = pRecord.vehicleTechnical?.seats?.value ?? null;
        const validoHasta = pRecord.identification?.validity_until?.value || null;

        const motorParts: string[] = [];
        if (kw !== null) motorParts.push(`${kw} kW${cv !== null ? ` (${cv} CV)` : ""}`);
        if (cc !== null) motorParts.push(`${cc} cc`);
        if (fuel) motorParts.push(fuel);
        const motorLine = motorParts.length > 0 ? `- **Motor:** ${motorParts.join(" · ")}\n` : "";

        const docLabel = documentType === "PERMISO_V2" ? "Autorización Provisional" : "Permiso de Circulación";
        mdContent = `# ORION — ${docLabel} (${documentType})
- **Matrícula:** ${plate}
- **Bastidor:** ${vin}
- **Titular:** ${titular}
- **Marca:** ${brand}
- **Modelo:** ${model}
${motorLine}${seats !== null ? `- **Plazas:** ${seats}\n` : ""}${validoHasta ? `- **Válido hasta:** ${validoHasta}\n` : ""}
*Los detalles de confianza semafórica se analizan en vivo en la interfaz.*
`;
    } else {
        const dec = decoded as Record<string, unknown>; // TODO: se reemplaza con pipeline Donut
        const dictCL = dec.vehicleClass || extractedFields.CL || null;
        const clDecoded = decodeCL(extractedFields.CL);
        const categoryJ = dec.vehicleCategory || extractedFields.J || null;
        const bodyJ1 = dec.bodyType || extractedFields.J1 || null;
        const classJ2 = extractedFields.J2 && extractedFields.J2.toUpperCase() !== "F.7" && extractedFields.J2.toUpperCase() !== "F7" ? extractedFields.J2 : null;
        const fechaEmision = extractedFields.issueDateRaw || "No disponible";
        const fuel = dec.fuelType || extractedFields.P3 || null; // P1=cilindrada, CI=ambiguo — no usar como fallback de combustible

        // Resumen operativo
        const resParts = [];
        const makeModel = `${extractedFields.D1 || ''} ${extractedFields.D3 || ''}`.trim() || null;
        if (makeModel) resParts.push(makeModel);

        // Identity Priority
        if (clDecoded) {
            resParts.push(clDecoded.business_label.charAt(0).toUpperCase() + clDecoded.business_label.slice(1).toLowerCase());
        } else if (extractedFields.CL) {
            resParts.push(`Clase vehículo: ${extractedFields.CL} (sin diccionario)`);
        }

        if (bodyJ1) {
            const cleanBody = bodyJ1.includes('—') ? bodyJ1.split('—')[1]?.trim() : bodyJ1.split('(')[0]?.trim() || bodyJ1;
            if (cleanBody) resParts.push(cleanBody);
        }

        // Fix Phase 28: Only push valid seat numbers
        if (extractedFields.S1 && !isNaN(parseInt(extractedFields.S1, 10))) {
            resParts.push(`${extractedFields.S1} plazas`);
        }

        let motorStr = "";
        if (extractedFields.P2 && extractedFields.powerCv) motorStr = `${extractedFields.P2} kW (${extractedFields.powerCv} CV)`;
        else if (extractedFields.P2) motorStr = `${extractedFields.P2} kW`;
        if (extractedFields.P1) motorStr += (motorStr ? ` · ${extractedFields.P1} cc` : `${extractedFields.P1} cc`);

        let mmaStr = "";
        if (extractedFields.F2) mmaStr = `MMA ${extractedFields.F2} kg`;
        let techLine = [motorStr, mmaStr].filter(Boolean).join(" · ");

        const dimParts = [];
        if (extractedFields.F6) dimParts.push(extractedFields.F6);
        if (extractedFields.F5) dimParts.push(extractedFields.F5);
        if (extractedFields.F4) dimParts.push(extractedFields.F4);
        let dimsStr = dimParts.length === 3 ? `${dimParts.join("×")} mm` : "";

        let dateLine = "";
        if (fechaEmision !== "No disponible") dateLine += `Emisión ${fechaEmision}`;
        if (extractedFields.B) dateLine += (dateLine ? ` · 1ª Mat ${extractedFields.B}` : `1ª Mat ${extractedFields.B}`);

        let summaryText = [resParts.join(" · "), techLine, dimsStr, dateLine].filter(Boolean).join("\n");

        mdContent = `# ORION — Ficha Técnica Vehicular
- **Matrícula:** ${extractedFields.plate || "No detectada"}
- **Bastidor:** ${extractedFields.E || "No detectado"}
- **Fecha Emisión Documento:** ${fechaEmision}
- **Fecha 1ª Matriculación (B):** ${extractedFields.B || "No disponible"}

---

## Resumen del Vehículo
> ${summaryText || "No hay datos suficientes para generar un resumen."}

## Clasificación Decodificada
- **Clase Comercial (CL):** ${extractedFields.CL || "---"} ${clDecoded ? `(${clDecoded.construccion.code}: ${clDecoded.construccion.label} / ${clDecoded.uso.code}: ${clDecoded.uso.label})` : ''}
- **Marca (D.1):** ${extractedFields.D1 || "---"}
- **Modelo (D.3):** ${extractedFields.D3 || "---"}
- **Categoría UE (J):** ${categoryJ || "---"}
- **Carrocería (J.1):** ${bodyJ1 || "---"}
${classJ2 ? `- **Clase (J.2):** ${classJ2}` : ''}

## Especificaciones
- **Combustible:** ${fuel || "---"}
- **Potencia:** ${extractedFields.P2 || "---"} kW (${extractedFields.powerCv || "---"} CV)
- **Plazas (S.1):** ${(!extractedFields.S1 || isNaN(parseInt(extractedFields.S1, 10))) ? "---" : extractedFields.S1}
- **Masa Máx (F.2):** ${extractedFields.F2 || "---"} kg
- **Dimensiones (L x A x Al):** ${extractedFields.F6 || "---"} x ${extractedFields.F5 || "---"} x ${extractedFields.F4 || "---"} mm

*Este informe ha sido generado automáticamente para el ámbito de negocio y excluye la metadata técnica de extracción.*
`;
    }

    fs.writeFileSync(mdPath, mdContent);

    return {
        docId,
        paths: {
            jsonPath,
            mdPath
        },
        extractedPreview: {
            pageCount,
            firstLines
        },
        usedModel,
        detectedType: documentType,
        documentType,
        detectedTypeLocked: true,
        detectedTypeEvidence: classifierEvidence,
        extractorUsed,
        classifierEvidence,
        ocrQuality: summary.ocrQuality,
        extractedFields,
        decoded
    };
}
