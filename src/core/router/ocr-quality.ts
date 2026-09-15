import { decodeCL } from "../pipelines/ficha_tecnica/dictionary-decoder";
import { classifyDocument } from "./documentClassifier";
import { extractPermisoV1 } from "../pipelines/permiso/permisoExtractor.v1";
import { extractPermisoV2 } from "../pipelines/permiso/permisoExtractor.v2";
import { extractCarnet } from "../pipelines/carnet/carnetExtractor";
import { extractFields } from "./field-extraction";
import type { AzureAnalyzeResult } from "@/types/azure";

export interface OcrQuality {
    ocrChars: number;
    nonEmptyLines: number;
    fieldsFoundCount: number;
    quality: "low" | "medium" | "high";
}

export function generateDecoded(extractedFields: Record<string, string | number | null | undefined>) {
    const DICTIONARY_MAP: Record<string, Record<string, string>> = {
        "fuel": { "D": "Diésel", "G": "Gasolina", "E": "Eléctrico", "GLP": "Gas Licuado del Petróleo (GLP)", "GNC": "Gas Natural Comprimido", "H": "Híbrido (HEV)", "PHEV": "Híbrido Enchufable" },
        "bodyType": { "AC": "Familiar", "AB": "Hatchback", "AA": "Sedán", "AD": "Coupé", "AF": "SUV / Monovolumen" },
        "category": { "M1": "Vehículo de pasajeros", "N1": "Vehículo de mercancías" }
    };

    const decode = (val: string | null, dictKey: string) => {
        if (!val) return null;
        let clean = String(val).toUpperCase().trim();
        return DICTIONARY_MAP[dictKey]?.[clean] || null;
    };

    const str = (v: string | number | null | undefined): string | null => v == null ? null : String(v);

    return {
        make: extractedFields.D1 || null,
        model: extractedFields.D3 || null,
        vehicleClass: decodeCL(str(extractedFields.CL))?.business_label || extractedFields.CL || null,
        vehicleCategory: decode(str(extractedFields.J), "category") || extractedFields.J || null,
        bodyType: decode(str(extractedFields.J3 || extractedFields.J1), "bodyType") || extractedFields.J1 || null,
        fuelType: decode(str(extractedFields.P3), "fuel") || extractedFields.P3 || null,
    };
}

export function computeOcrQuality(analyzeResult: AzureAnalyzeResult, lockedType?: string | null) {
    const pagesInfo = analyzeResult?.pages || [];
    const paragraphs = analyzeResult?.paragraphs || [];

    let allLines: string[] = [];
    if (pagesInfo.length > 0 && pagesInfo[0].lines && pagesInfo[0].lines.length > 0) {
        allLines = pagesInfo.flatMap((p: { lines?: { content: string }[] }) => p.lines?.map((l: { content: string }) => l.content) || []);
    } else {
        allLines = paragraphs.map((p: { content: string }) => p.content);
    }

    allLines = allLines.map(l => l.replace(/\s+/g, ' ').trim()).filter(l => l.length > 0);
    const fullText = allLines.join(" \n ");

    const isPermisoEnabled = process.env.ENABLE_PERMISO_PIPELINE === "true";

    let classification;
    if (lockedType) {
        classification = { type: lockedType, confidence: 1, debugScore: {}, evidence: ["LOCKED_BY_USER"] };
    } else {
        classification = classifyDocument(analyzeResult);
    }

    // IF PERMISO IS DISABLED: Force any PERMISO detection to UNKNOWN
    if (!isPermisoEnabled && classification.type.startsWith("PERMISO_")) {
        classification.type = "UNKNOWN";
        classification.confidence = 0;
    }

    if (classification.type === "PERMISO_V1" || classification.type === "PERMISO_V2") {

        const extractorUsed = classification.type === "PERMISO_V1" ? "permisoExtractor.v1" : "permisoExtractor.v2";
        const permisoRecord = classification.type === "PERMISO_V1"
            ? extractPermisoV1(analyzeResult)
            : extractPermisoV2(analyzeResult);

        // --- ENHANCE OBSERVATIONS & ITV FOR PERMISOS ---
        const obsBlockLines = [];
        let capturingObs = false;
        let nextItv = null;
        for (const line of allLines) {
            const upper = line.toUpperCase().trim();
            if (upper.includes("OBSERVACIONES:") || upper === "OBSERVACIONES" || upper.includes("(D.4) OBSERVACIONES:")) {
                capturingObs = true;
                const inlineObs = upper.replace(/.*OBSERVACIONES:?\s*/, "").trim();
                if (inlineObs && !/^[A-Z]\.\d+(\.\d+)?$/.test(inlineObs)) obsBlockLines.push(line.substring(line.toUpperCase().indexOf("OBSERVACIONES") + 13).replace(/^[:|\s]+/, ""));
                continue;
            }
            if (capturingObs) {
                if (/^(TITULAR|DIRECC|NIF|MINISTERIO|JEFATURA|511414|FMT|PÁGINA|PAGINA|MODELO\s?\d+)/.test(upper)) {
                    capturingObs = false;
                }
                if (capturingObs && line.trim()) {
                    // Filter noise (isolated codes, tiny strings)
                    if (!/^(C\.1\.1|C\.1\.2|C\.1\.3|C\.4|D\.1|D\.2|D\.3|D\.4|E|F\.1|F\.2|G|I|J|MO|NO|SI|S\.1|S\.2)$/.test(upper) && upper.length > 2) {
                        obsBlockLines.push(line.trim());
                    }
                }
            }
            if (upper.includes("ITV:") || upper.includes("PROXIMA ITV") || upper.includes("VÁLIDO HASTA") || upper.includes("VALIDO HASTA")) {
                const match = upper.match(/(?:ITV.*?|HASTA.*?|V[ÁA]LIDO.*?)\s*(\d{2}[\/.-]\d{2}[\/.-]\d{4})/);
                if (match) nextItv = match[1];
            }
        }

        let existingObsValue = (permisoRecord.observations as any)?.value;
        if (!existingObsValue && obsBlockLines.length > 0) {
            permisoRecord.observations = {
                value: obsBlockLines.join("\n"),
                confidence: 0.9,
                status_color: 'verde',
                source: 'ocr'
            };
        } else if (obsBlockLines.length > 0) {
            // override if it was junk
            if (String(existingObsValue).length < 5 || /^[A-Z]\.\d+/.test(String(existingObsValue))) {
                permisoRecord.observations = {
                    value: obsBlockLines.join("\n"),
                    confidence: 0.9,
                    status_color: 'verde',
                    source: 'ocr'
                };
            }
        }

        if (nextItv) {
            permisoRecord.next_itv = {
                value: nextItv,
                confidence: 0.9,
                status_color: 'verde',
                source: 'ocr'
            };
        }
        // --- END ENHANCE ---

        // Compute minimal metrics for Permisos
        let fieldsFoundCount = 0;
        let mandatoryFoundCount = 0;

        if (permisoRecord.identification.license_plate.value) { fieldsFoundCount++; mandatoryFoundCount++; }
        if (permisoRecord.identification.vin.value) { fieldsFoundCount++; mandatoryFoundCount++; }
        if (permisoRecord.holder.full_name.value) { fieldsFoundCount++; mandatoryFoundCount++; }
        if (permisoRecord.vehicleCommercial.brand.value) fieldsFoundCount++;
        if (permisoRecord.vehicleCommercial.model.value) fieldsFoundCount++;
        if (permisoRecord.vehicleTechnical.engine_displacement_cc.value) fieldsFoundCount++;
        if (permisoRecord.vehicleTechnical.power_kw.value) fieldsFoundCount++;

        if (!permisoRecord.identification.license_plate.value && !permisoRecord.identification.vin.value && !permisoRecord.holder.full_name.value) {
            throw new Error(`EXTRACTION_FAILED: Classifier detected ${classification.type} but extractor failed to find basic mandatory fields (Plate, VIN, Titular). Routing to FAILED state to prevent silent fallout.`);
        }

        let quality: "low" | "medium" | "high" = "medium";
        if (mandatoryFoundCount >= 2 && fieldsFoundCount >= 5) quality = "high";
        else if (mandatoryFoundCount < 2) quality = "low";

        return {
            documentType: classification.type,
            extractorUsed,
            classifierEvidence: { evidence: classification.evidence || [], scoreV1: classification.debugScore?.PERMISO_V1 || 0, scoreV2: classification.debugScore?.PERMISO_V2 || 0 },
            ocrChars: fullText.length,
            nonEmptyLines: allLines.length,
            fieldsFoundCount,
            mandatoryFoundCount,
            quality,
            extractedFields: permisoRecord,
            decoded: {} as Record<string, never>,
            allLines
        };
    }

    // --- CARNET DE CONDUCIR ---
    if (classification.type === "CARNET_CONDUCIR") {

        const carnetRecord = extractCarnet(analyzeResult);

        const apellidos = carnetRecord.identification.apellidos.value;
        const nombre = carnetRecord.identification.nombre.value;
        const nif = carnetRecord.identification.nif.value;
        const caducidad = carnetRecord.validity.fecha_caducidad.value;
        const categorias = carnetRecord.categories.lista.value;

        const mandatoryFoundCount = [apellidos, nombre, nif, caducidad].filter(Boolean).length;
        const fieldsFoundCount = mandatoryFoundCount
            + (carnetRecord.identification.fecha_nacimiento.value ? 1 : 0)
            + (carnetRecord.validity.fecha_expedicion.value ? 1 : 0)
            + (categorias && categorias.length > 0 ? 1 : 0);

        let quality: "low" | "medium" | "high" = "medium";
        if (mandatoryFoundCount >= 3 && fieldsFoundCount >= 5) quality = "high";
        else if (mandatoryFoundCount < 2) quality = "low";

        return {
            documentType: "CARNET_CONDUCIR",
            extractorUsed: "carnetExtractor.v1",
            classifierEvidence: { evidence: classification.evidence || [], scoreV1: 0, scoreV2: 0 },
            ocrChars: fullText.length,
            nonEmptyLines: allLines.length,
            fieldsFoundCount,
            mandatoryFoundCount,
            quality,
            extractedFields: carnetRecord,
            decoded: {} as Record<string, never>,
            allLines
        };
    }

    // Phase B Strict Switch
    if (classification.type === "FICHA_TECNICA") {
        // Strict path: only run legacy matcher if it is a Ficha
        const { extractedFields, fieldsFoundCount } = extractFields(fullText, allLines, analyzeResult);
        const decoded = generateDecoded(extractedFields);

        const OBLIGATORIOS = ["CL", "D1", "D3", "E", "J", "J1", "J2", "J3", "F2", "F4", "F5", "F6", "P3", "P1", "P2", "S1"];
        let mandatoryFoundCount = 0;
        for (const key of OBLIGATORIOS) {
            if (extractedFields[key]) mandatoryFoundCount++;
        }

        let quality: "low" | "medium" | "high" = "medium";
        if (fieldsFoundCount >= 8) quality = "high";
        else if (fieldsFoundCount < 4 || fullText.length < 100) quality = "low";

        return {
            documentType: "FICHA_TECNICA",
            extractorUsed: "legacyFichaExtractor",
            classifierEvidence: { evidence: classification.evidence || [], scoreV1: classification.debugScore?.PERMISO_V1 || 0, scoreV2: classification.debugScore?.PERMISO_V2 || 0 },
            ocrChars: fullText.length,
            nonEmptyLines: allLines.length,
            fieldsFoundCount,
            mandatoryFoundCount,
            quality,
            extractedFields,
            decoded,
            allLines
        };
    }

    // Phase B: UNKNOWN fallback — try best-effort extraction before giving up
    // documentType stays UNKNOWN regardless of how many fields are found
    // Classifier returned UNKNOWN — attempting best-effort extraction
    const { extractedFields: unknownFields, fieldsFoundCount: unknownFieldCount } = extractFields(fullText, allLines, analyzeResult);
    if (unknownFieldCount >= 4) {
        // UNKNOWN best-effort extraction succeeded
        return {
            documentType: "UNKNOWN",
            extractorUsed: "best_effort",
            classifierEvidence: { evidence: classification.evidence || [], scoreV1: classification.debugScore?.PERMISO_V1 || 0, scoreV2: classification.debugScore?.PERMISO_V2 || 0 },
            ocrChars: fullText.length,
            nonEmptyLines: allLines.length,
            fieldsFoundCount: unknownFieldCount,
            mandatoryFoundCount: 0,
            quality: "low",
            extractedFields: { ...unknownFields, _extractionMode: "best_effort" },
            decoded: {},
            allLines
        };
    }
    return {
        documentType: "UNKNOWN",
        extractorUsed: "none",
        classifierEvidence: { evidence: classification.evidence || [], scoreV1: classification.debugScore?.PERMISO_V1 || 0, scoreV2: classification.debugScore?.PERMISO_V2 || 0 },
        ocrChars: fullText.length,
        nonEmptyLines: allLines.length,
        fieldsFoundCount: 0,
        mandatoryFoundCount: 0,
        quality: "low",
        extractedFields: { rawText: fullText.substring(0, 1000) },
        decoded: {},
        allLines
    };
}
