import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

interface AnalyzeResult {
    status: string;
    analyzeResult?: any;
    error?: any;
}

interface OcrQuality {
    ocrChars: number;
    nonEmptyLines: number;
    fieldsFoundCount: number;
    quality: "low" | "medium" | "high";
}

async function runAzureModel(modelName: string, fileBuffer: Buffer, mimeType: string) {
    const endpoint = process.env.AZURE_DOCINT_ENDPOINT!;
    const key = process.env.AZURE_DOCINT_KEY!;
    const apiVersion = process.env.AZURE_DOCINT_API_VERSION || '2024-02-29-preview';
    const cleanEndpoint = endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;
    const analyzeUrl = `${cleanEndpoint}/documentintelligence/documentModels/${modelName}:analyze?api-version=${apiVersion}`;

    const postRes = await fetch(analyzeUrl, {
        method: 'POST',
        headers: {
            'Ocp-Apim-Subscription-Key': key,
            'Content-Type': mimeType,
        },
        body: fileBuffer as any
    });

    if (!postRes.ok) {
        let errorText = await postRes.text().catch(() => "");
        throw new Error(`Azure Analyze POST failed (${postRes.status}): ${errorText || postRes.statusText}`);
    }

    const operationLocation = postRes.headers.get('Operation-Location');
    if (!operationLocation) throw new Error("No Operation-Location header received from Azure.");

    let result: AnalyzeResult | null = null;
    const maxRetries = Math.ceil(45000 / 1200);

    for (let i = 0; i < maxRetries; i++) {
        await new Promise(resolve => setTimeout(resolve, 1200));
        const getRes = await fetch(operationLocation, { headers: { 'Ocp-Apim-Subscription-Key': key } });
        if (!getRes.ok) {
            const errorText = await getRes.text().catch(() => "");
            throw new Error(`Azure Analyze GET failed (${getRes.status}): ${errorText || getRes.statusText}`);
        }
        result = await getRes.json() as AnalyzeResult;
        if (result.status === "succeeded" || result.status === "failed") break;
    }

    if (!result || result.status !== "succeeded") {
        throw new Error(`Azure Analyze did not succeed using ${modelName}. Final status: ${result?.status}. Error: ${JSON.stringify(result?.error)}`);
    }

    return result.analyzeResult;
}

function extractByAnchor(lines: string[], anchorRegex: RegExp): string | null {
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].toUpperCase().trim();
        const match = line.match(anchorRegex);

        if (match) {
            let valueSameLine = line.replace(anchorRegex, "").trim();
            valueSameLine = valueSameLine.replace(/^[:|\-—]+?\s*/, "").replace(/\s+/g, " ").trim();

            if (valueSameLine.length > 0 && valueSameLine !== match[0].trim()) {
                return valueSameLine === "" ? null : valueSameLine;
            }

            for (let j = i + 1; j <= i + 4 && j < lines.length; j++) {
                const nextLine = lines[j].toUpperCase().trim();
                if (nextLine.length === 0) continue;

                if (nextLine.match(/^(?:[A-Z][.,]?\s?\d|CL|C\s?I|E|J)\b/)) {
                    break;
                }

                if (nextLine === match[0].trim()) {
                    continue;
                }

                if (nextLine.length > 40 || nextLine.match(/CATEGOR[IÍ]A|CARROCER[IÍ]A|MASA|VEH[IÍ]CULO|MARCA|MODELO|DENOMINACI[OÓ]N/)) {
                    continue;
                }

                return nextLine;
            }
            break;
        }
    }
    return null;
}

function extractMultilineBlock(lines: string[], startMatches: RegExp[], stopMatches: RegExp[]): string | null {
    let capturing = false;
    let block: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const upperLine = line.toUpperCase();

        if (!capturing) {
            if (startMatches.some(r => upperLine.match(r))) {
                capturing = true;
                let cleaned = upperLine;
                for (const r of startMatches) cleaned = cleaned.replace(r, "").trim();
                cleaned = cleaned.replace(/^[:|\-—]\s*/, "").trim();
                if (cleaned.length > 0) block.push(line);
            }
        } else {
            if (stopMatches.some(r => upperLine.match(r)) || upperLine.match(/^(?:[A-Z][.,]?\s?\d|CL|C\s?I)\b/)) {
                break;
            }
            if (line.length > 0) {
                block.push(line);
            }
        }
    }

    const res = block.join(" \n ").trim();
    return res.length > 0 ? res : null;
}

function extractFields(fullText: string, allLines: string[]) {
    const extractedFields: any = {
        plate: null, CL: null, CI: null, CV: null, D1: null, D3: null, E: null,
        J: null, J1: null, J2: null, J3: null,
        F2: null, F4: null, F5: null, F6: null,
        P3: null, P1: null, P2: null, S1: null,
        observations: null, homologationOptions: null,
        issueDateRaw: null, issueDateISO: null, powerCv: null
    };

    const findPlate = (text: string) => {
        const semiRegex = /(?:^|[^A-Z0-9])(R\s?\d{4}\s?-?\s?[A-Z]{3})(?:[^A-Z0-9]|$)/;
        const normalRegex = /(?:^|[^A-Z0-9])(\d{4}\s?-?\s?[A-Z]{3})(?:[^A-Z0-9]|$)/;
        const semiMatch = text.match(semiRegex);
        if (semiMatch) return { match: semiMatch[1], isSemi: true };
        const normalMatch = text.match(normalRegex);
        if (normalMatch) return { match: normalMatch[1], isSemi: false };
        return null;
    };

    let plateMatchStr = null;
    let plateIsSemi = false;

    // 1) Context search around "MATRIC"
    for (let i = 0; i < allLines.length; i++) {
        const line = allLines[i].toUpperCase();
        if (line.includes("MATRIC")) {
            for (let j = i; j <= i + 6 && j < allLines.length; j++) {
                const searchLine = allLines[j].toUpperCase();
                if (j > i && searchLine.match(/CERTIFICADO|C[OÓ]DIGO|DESCRIPCI[OÓ]N|CATEGOR[IÍ]A|CARROCER[IÍ]A|MASA|VEH[IÍ]CULO|MARCA|MODELO|DENOMINACI[OÓ]N|CHASIS|BASTIDOR/)) continue;

                const found = findPlate(searchLine);
                if (found) {
                    plateMatchStr = found.match;
                    plateIsSemi = found.isSemi;
                    break;
                }
            }
            if (plateMatchStr) break;
        }
    }

    // 2) Global fallback
    if (!plateMatchStr) {
        const found = findPlate(fullText.toUpperCase());
        if (found) {
            plateMatchStr = found.match;
            plateIsSemi = found.isSemi;
        }
    }

    // 3) Normalization
    if (plateMatchStr) {
        let cleaned = plateMatchStr.replace(/[^A-Z0-9]/g, "");
        if (cleaned.length > 8) cleaned = cleaned.substring(0, 8);
        if (plateIsSemi && cleaned.startsWith("R")) {
            extractedFields.plate = `R ${cleaned.substring(1, 5)} ${cleaned.substring(5)}`.trim();
        } else {
            extractedFields.plate = `${cleaned.substring(0, 4)} ${cleaned.substring(4)}`.trim();
        }

        // Anti-false positive extra check (exclude if it looks too long initially or missing letters)
        if (!/[A-Z]/.test(extractedFields.plate)) {
            extractedFields.plate = null;
        }
    }

    const map: Record<string, string> = {};
    const TARGET_CODES = new Set(["CL", "C.I", "C.V", "D.1", "D.3", "E", "J", "J.1", "J.2", "J.3", "F.2", "F.4", "F.5", "F.6", "P.3", "P.1", "P.2", "S.1"]);

    const normalizeCode = (raw: string) => {
        let text = raw.replace(/\s+/g, "").toUpperCase();
        if (text === "CI") return "C.I";
        if (text === "CV") return "C.V";
        if (text === "J1") return "J.1";
        if (text === "J2") return "J.2";
        if (text === "J3") return "J.3";
        if (text === "F2") return "F.2";
        if (text === "F4") return "F.4";
        if (text === "F5") return "F.5";
        if (text === "F6") return "F.6";
        if (text === "P1") return "P.1";
        if (text === "P2") return "P.2";
        if (text === "P3") return "P.3";
        if (text === "S1") return "S.1";
        if (text === "D1") return "D.1";
        if (text === "D3") return "D.3";
        return text;
    };

    for (let i = 0; i < allLines.length; i++) {
        let line = allLines[i].toUpperCase().trim();
        let codeCandidate = normalizeCode(line);

        if (TARGET_CODES.has(codeCandidate)) {
            if (!map[codeCandidate]) {
                for (let j = i + 1; j <= i + 4 && j < allLines.length; j++) {
                    let nextLine = allLines[j].toUpperCase().trim();
                    if (nextLine.length === 0) continue;
                    if (nextLine === codeCandidate || nextLine.match(/C[OÓ]DIGO|DESCRIPCI[OÓ]N|CATEGOR[IÍ]A|CARROCER[IÍ]A|MASA|VEH[IÍ]CULO|MARCA|MODELO|DENOMINACI[OÓ]N/)) continue;
                    if (TARGET_CODES.has(normalizeCode(nextLine))) break;

                    map[codeCandidate] = allLines[j].trim();
                    break;
                }
            }
        } else {
            const match = line.match(/^(CL|C\.?\s*I|C\.?\s*V|[A-Z][.,]?\s?\d|E|J)[\s:|-]+(.+)$/);
            if (match) {
                let code = normalizeCode(match[1]);
                let val = match[2].trim();

                if (TARGET_CODES.has(code) && !map[code] && !TARGET_CODES.has(normalizeCode(val))) {
                    map[code] = val;
                }
            }
        }
    }

    extractedFields.CL = map["CL"] || null;
    extractedFields.CI = map["C.I"] || null;
    extractedFields.CV = map["C.V"] || null;

    extractedFields.D1 = map["D.1"] || extractByAnchor(allLines, /^(?:D[.,]?\s?1|MARCA:?)\b/i);
    extractedFields.D3 = map["D.3"] || extractByAnchor(allLines, /^(?:D[.,]?\s?3|MODELO|DENOMINACION COMERCIAL)\b/i);
    extractedFields.E = (map["E"] || extractByAnchor(allLines, /^E\b/i))?.replace(/\s+/g, "");

    if (!extractedFields.D3) {
        let altModel = map["D.2"] || extractByAnchor(allLines, /^D[.,\s]?2\b/i);
        if (altModel && !altModel.includes("VARIANTE")) extractedFields.D3 = altModel;
    }
    if (!extractedFields.D1) {
        extractedFields.D1 = map["A.1"] || extractByAnchor(allLines, /^A[.,\s]?1\b/i);
    }

    extractedFields.J = map["J"] || null;
    extractedFields.J1 = map["J.1"] || null;
    extractedFields.J2 = map["J.2"] || null;
    extractedFields.J3 = map["J.3"] || null;

    if (extractedFields.J3 && extractedFields.J3.length < 3 && fullText.toUpperCase().includes(" R ")) {
        if (extractedFields.J3 === "R" || extractedFields.J3 === "M") {
            extractedFields.J3 = null;
        }
    }

    extractedFields.F2 = map["F.2"] || null;
    extractedFields.F4 = map["F.4"] || null;
    extractedFields.F5 = map["F.5"] || null;
    extractedFields.F6 = map["F.6"] || null;

    extractedFields.P3 = map["P.3"] || null;
    extractedFields.P1 = map["P.1"] || null;
    extractedFields.P2 = map["P.2"] || null;

    extractedFields.S1 = map["S.1"] || extractByAnchor(allLines, /^(?:S[.,]?\s?1|PLAZAS)\b/i);
    if (extractedFields.S1) {
        const seatsMatch = String(extractedFields.S1).match(/(\d{1,2})/);
        if (seatsMatch) extractedFields.S1 = parseInt(seatsMatch[1], 10);
    }

    if (extractedFields.P2) {
        const kwMatch = extractedFields.P2.match(/(\d{2,3}(?:[.,]\d+)?)/);
        if (kwMatch) {
            const kwValue = parseFloat(kwMatch[1].replace(",", "."));
            if (!isNaN(kwValue)) extractedFields.powerCv = Math.round(kwValue * 1.35962);
        }
    } else {
        const cvMatch = fullText.match(/\b(\d{2,3})\s*(?:CV|HP)\b/i);
        if (cvMatch && cvMatch[1]) extractedFields.powerCv = parseInt(cvMatch[1], 10);
    }

    extractedFields.issueDateRaw = extractByAnchor(allLines, /^FECHA DE EMISI[OÓ]N\b/i);
    if (!extractedFields.issueDateRaw) {
        const dateMatch = fullText.match(/\b(?:FECHA.*?)?(\d{2}[\/.-]\d{2}[\/.-]\d{4})\b/i);
        if (dateMatch) extractedFields.issueDateRaw = dateMatch[1];
    }
    if (extractedFields.issueDateRaw) {
        const isoMatch = extractedFields.issueDateRaw.match(/(\d{2})[\/.-](\d{2})[\/.-](\d{4})/);
        if (isoMatch) extractedFields.issueDateISO = `${isoMatch[3]}-${isoMatch[2]}-${isoMatch[1]}T00:00:00.000Z`;
    }

    const stopBlockRegexes = [
        /^OPCIONES\b/i, /^FIRMA\b/i, /^FECHA\b/i, /^\*?\s*V[ÁA]LIDO\b/i,
        /^EXPEDIENTE\b/i, /^C[ÓO]DIGO SEGURO\b/i, /^FECHA Y HORA\b/i,
        /^NIF\b/i, /^DIRECCI[ÓO]N\b/i, /^CSV\b/i
    ];

    extractedFields.observations = extractMultilineBlock(allLines, [/^OBSERVACIONES\b/i], stopBlockRegexes);
    extractedFields.homologationOptions = extractMultilineBlock(allLines, [/^OPCIONES INCLUIDAS EN LA HOMOLOGACI[OÓ]N\b/i, /^OPCIONES INCLUIDAS\b/i], stopBlockRegexes);

    if (extractedFields.D1) {
        extractedFields.D1 = extractedFields.D1.replace(/,\s*S\.A\.(?:S\.)?$/i, "").trim();
        if (extractedFields.D1 === "D.1" || extractedFields.D1 === "A.1" || extractedFields.D1.includes("P.5.1")) extractedFields.D1 = null;
    }
    if (extractedFields.D3) {
        if (extractedFields.D3 === "D.3" || extractedFields.D3 === "D.2" || extractedFields.D3.includes("BASTIDOR")) extractedFields.D3 = null;
    }

    let fieldsFoundCount = 0;
    Object.values(extractedFields).forEach(v => {
        if (v !== null && v !== undefined && v !== "") fieldsFoundCount++;
    });

    return { extractedFields, fieldsFoundCount };
}

function generateDecoded(extractedFields: any) {
    const DICTIONARY_MAP: Record<string, Record<string, string>> = {
        "fuel": { "D": "Diésel", "G": "Gasolina", "E": "Eléctrico", "GLP": "Gas Licuado del Petróleo (GLP)", "GNC": "Gas Natural Comprimido", "H": "Híbrido (HEV)", "PHEV": "Híbrido Enchufable" },
        "bodyType": { "AC": "Familiar", "AB": "Hatchback", "AA": "Sedán", "AD": "Coupé", "AF": "SUV / Monovolumen" },
        "category": { "M1": "Turismo particular", "N1": "Furgoneta ligera", "L3E": "Motocicleta" }
    };

    const decode = (val: string | null, dictKey: string) => {
        if (!val) return null;
        let clean = String(val).toUpperCase().trim();
        return DICTIONARY_MAP[dictKey]?.[clean] || null;
    };

    return {
        make: extractedFields.D1 || null,
        model: extractedFields.D3 || null,
        vehicleCategory: decode(extractedFields.J, "category") || extractedFields.J || null,
        bodyType: decode(extractedFields.J3 || extractedFields.J1, "bodyType") || extractedFields.J1 || null,
        fuelType: decode(extractedFields.P3, "fuel") || extractedFields.P3 || null,
    };
}

function computeOcrQuality(analyzeResult: any) {
    const pagesInfo = analyzeResult?.pages || [];
    const paragraphs = analyzeResult?.paragraphs || [];

    let allLines: string[] = [];
    if (pagesInfo.length > 0 && pagesInfo[0].lines && pagesInfo[0].lines.length > 0) {
        allLines = pagesInfo.flatMap((p: any) => p.lines?.map((l: any) => l.content) || []);
    } else {
        allLines = paragraphs.map((p: any) => p.content);
    }

    allLines = allLines.map(l => l.replace(/\s+/g, ' ').trim()).filter(l => l.length > 0);
    const fullText = allLines.join(" \n ");

    const { extractedFields, fieldsFoundCount } = extractFields(fullText, allLines);
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

export async function processDocumentWithAzure(fileBuffer: Buffer, mimeType: string, originalName: string) {
    if (!process.env.AZURE_DOCINT_ENDPOINT || !process.env.AZURE_DOCINT_KEY) {
        throw new Error("Missing Azure Document Intelligence environment variables.");
    }

    let usedModel = "prebuilt-read";
    let analyzeResult = await runAzureModel(usedModel, fileBuffer, mimeType);
    let ocrResult = computeOcrQuality(analyzeResult);

    const needsFallback = ocrResult.mandatoryFoundCount < 15 || !ocrResult.extractedFields.J || !ocrResult.extractedFields.J1 || !ocrResult.extractedFields.J2 || !ocrResult.extractedFields.J3 || !ocrResult.extractedFields.F6;

    if (needsFallback) {
        try {
            console.log(`[ORION] OCR Low Quality with ${usedModel} (Mandatory: ${ocrResult.mandatoryFoundCount}/16). Falling back to prebuilt-layout...`);
            const layoutResult = await runAzureModel("prebuilt-layout", fileBuffer, mimeType);
            const layoutOcrResult = computeOcrQuality(layoutResult);

            if (layoutOcrResult.mandatoryFoundCount > ocrResult.mandatoryFoundCount || (layoutOcrResult.mandatoryFoundCount === ocrResult.mandatoryFoundCount && layoutOcrResult.fieldsFoundCount > ocrResult.fieldsFoundCount)) {
                usedModel = "prebuilt-layout";
                analyzeResult = layoutResult;
                ocrResult = layoutOcrResult;
                console.log(`[ORION] Fallback successful. Using prebuilt-layout.`);
            } else {
                console.log(`[ORION] Fallback yielded fewer or equal mandatory fields (${layoutOcrResult.mandatoryFoundCount} vs ${ocrResult.mandatoryFoundCount}). Keeping prebuilt-read.`);
            }
        } catch (e) {
            console.warn("[ORION] Fallback to prebuilt-layout failed, sticking with prebuilt-read.", e);
        }
    }

    const { extractedFields, decoded, allLines, ocrChars, nonEmptyLines, fieldsFoundCount, quality } = ocrResult;
    const pageCount = analyzeResult?.pages?.length || 1;
    const firstLines = allLines.slice(0, 10);

    const dateStr = new Date().toISOString().split("T")[0];
    const docId = crypto.randomUUID();
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
        ocrQuality: { ocrChars, nonEmptyLines, fieldsFoundCount, quality },
        extractedFields,
        decoded
    };
    fs.writeFileSync(path.join(baseDir, "summary.json"), JSON.stringify(summary, null, 2));

    const mdPath = path.join(baseDir, "report.md");
    const mdContent = `# ORION — Informe de Extracción (Document Intelligence)
- docId: ${docId}
- fecha: ${summary.createdAt}
- origen: Azure Document Intelligence (${usedModel})
- calidad_ocr: ${quality.toUpperCase()} (${ocrChars} chars, ${fieldsFoundCount} campos)

---

## 1. Identificación
| Campo | Valor |
|-------|-------|
| Matrícula | ${extractedFields.plate || "---"} |
| Bastidor (E) | ${extractedFields.E || "---"} |
| Marca (D.1) | ${extractedFields.D1 || "---"} |
| Modelo (D.3) | ${extractedFields.D3 || "---"} |
| Fecha Emisión | ${extractedFields.issueDateRaw || "---"} |

## 2. Clasificación
| Campo | Valor |
|-------|-------|
| Categoría (J) | ${extractedFields.J || "---"} |
| Carrocería (J.1) | ${extractedFields.J1 || "---"} |
| Destino (J.2) | ${extractedFields.J2 || "---"} |
| Tipo J.3 | ${extractedFields.J3 || "---"} |
| CL | ${extractedFields.CL || "---"} |
| C.I | ${extractedFields.CI || "---"} |

## 3. Masas
| Campo | Valor |
|-------|-------|
| F.2 (Masa Max) | ${extractedFields.F2 || "---"} |
| F.4 (Masa Ejes) | ${extractedFields.F4 || "---"} |
| F.5 | ${extractedFields.F5 || "---"} |
| F.6 | ${extractedFields.F6 || "---"} |

## 4. Motor
| Campo | Valor |
|-------|-------|
| Combustible (P.3) | ${extractedFields.P3 || "---"} |
| Cilindrada (P.1) | ${extractedFields.P1 || "---"} |
| Potencia kW (P.2) | ${extractedFields.P2 || "---"} |
| Potencia CV calculada | ${extractedFields.powerCv || "---"} |

## 5. Plazas
| Campo | Valor |
|-------|-------|
| Asientos (S.1) | ${extractedFields.S1 || "---"} |

---

## 6. Observaciones
${extractedFields.observations ? `> ${extractedFields.observations.split("\\n").join("\\n> ")}` : "---"}

## 7. Opciones Homologación
${extractedFields.homologationOptions ? `> ${extractedFields.homologationOptions.split("\\n").join("\\n> ")}` : "---"}

---

## 8. Interpretación Decodificada Automática
| Campo | Significado |
|-------|-------------|
| Marca | ${decoded.make || "---"} |
| Modelo | ${decoded.model || "---"} |
| Categoría | ${decoded.vehicleCategory || "---"} |
| Combustible | ${decoded.fuelType || "---"} |
| Carrocería | ${decoded.bodyType || "---"} |

## 9. Artefactos Locales
- JSON Payload: ${jsonPath}
- Markdown Report: ${mdPath}
`;
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
        ocrQuality: summary.ocrQuality,
        extractedFields,
        decoded
    };
}
