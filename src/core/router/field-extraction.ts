import { extractFieldsV2 } from "../pipelines/ficha_tecnica/fichaTecnicaExtractor.v2";
import type { AzureAnalyzeResult } from "@/types/azure";

export function extractByAnchor(lines: string[], anchorRegex: RegExp): string | null {
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

export function extractFields(fullText: string, allLines: string[], analyzeResult?: AzureAnalyzeResult) {
    const extractedFields: any = { // TODO: K-2 Phase 2 — crear FichaTecnicaFields interface (~20 campos)
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

    // --- PHASE 27 FALLBACK ---
    // Si Azure devuelve texto pero el extractor estructurado falla (comun en imagenes sin grilla)
    let mandatoryCount = 0;
    const OBLIGATORIOS = ["CL", "D1", "D3", "E", "J", "J1", "J2", "J3", "F2", "F4", "F5", "F6", "P3", "P1", "P2", "S1"];
    for (const key of OBLIGATORIOS) if (extractedFields[key]) mandatoryCount++;

    if (mandatoryCount < 4 && fullText.length > 100) {

        if (!extractedFields.E) {
            const vinMatch = fullText.match(/\b([A-HJ-NPR-Z0-9]{17})\b/);
            if (vinMatch) extractedFields.E = vinMatch[1];
        }

        if (!extractedFields.plate) {
            const plateMatch = fullText.match(/\b(\d{4}\s?[A-Z]{3})\b/);
            if (plateMatch) extractedFields.plate = plateMatch[1].replace(/\s/g, "");
            else {
                const oldPlateMatch = fullText.match(/\b([A-Z]{1,2}\s?\d{4}\s?[A-Z]{1,2})\b/);
                if (oldPlateMatch) extractedFields.plate = oldPlateMatch[1].replace(/\s/g, "");
            }
        }

        if (!extractedFields.D1) {
            const d1Match = fullText.match(/(?:D\.1|MARCA)\s*[:|-]?\s*([A-Z0-9\s-]+)/i);
            if (d1Match) extractedFields.D1 = d1Match[1].trim().split('\n')[0].substring(0, 30);
        }

        if (!extractedFields.D3) {
            const d3Match = fullText.match(/(?:D\.3|DENOMINACI[OÓ]N COMERCIAL|MODELO)\s*[:|-]?\s*([A-Z0-9\s-]+)/i);
            if (d3Match) extractedFields.D3 = d3Match[1].trim().split('\n')[0].substring(0, 30);
        }

        if (!extractedFields.J) {
            const jMatch = fullText.match(/(?:J|CATEGOR[IÍ]A)\s*[:|-]?\s*([A-Z0-9]{2})/i);
            if (jMatch) extractedFields.J = jMatch[1];
        }

        if (!extractedFields.J1) {
            const j1Match = fullText.match(/(?:J\.1|CARROCER[IÍ]A)\s*[:|-]?\s*([A-Z0-9]{2})/i);
            if (j1Match) extractedFields.J1 = j1Match[1];
        }
    }
    // --- END FALLBACK ---

    // --- PHASE 28 V2 DETERMINISTIC EXTRACTOR (PRIMARY) ---
    // V2 is the primary extractor. Legacy code above is the structural fallback.
    // V2 rescues any fields that legacy missed or left as garbage.
    try {
        const v2Fields = extractFieldsV2(analyzeResult);
        let fallbackApplied = [];

        extractedFields._v2Debug = v2Fields._v2Debug || null;

        const isInvalid = (val: unknown) => !val || String(val).trim() === "." || String(val).trim() === "NO DICT" || String(val).trim().length === 0;

        for (const [key, v2Val] of Object.entries(v2Fields)) {
            if (v2Val && isInvalid(extractedFields[key])) {
                extractedFields[key] = v2Val;
                fallbackApplied.push(key);
            }
        }

        if (fallbackApplied.length > 0) {
            extractedFields._v2Fallback = fallbackApplied;
        }

        // Recomputar powerCv si P2 fue rescatado por V2 y powerCv sigue null
        // (powerCv se calcula antes del V2 rescue, por lo que queda null si P2 lo rescata)
        if (extractedFields.P2 && !extractedFields.powerCv) {
            const kwStr = String(extractedFields.P2);
            const kwMatch = kwStr.match(/(\d{2,3}(?:[.,]\d+)?)/);
            if (kwMatch) {
                const kwValue = parseFloat(kwMatch[1].replace(",", "."));
                if (!isNaN(kwValue)) extractedFields.powerCv = Math.round(kwValue * 1.35962);
            }
        }

        // Special model deduplication logic
        if (extractedFields.D1 && extractedFields.D3) {
            if (extractedFields.D1.toUpperCase().includes(extractedFields.D3.toUpperCase()) || extractedFields.D3.toUpperCase().includes(extractedFields.D1.toUpperCase())) {
                if (extractedFields.D1.length < extractedFields.D3.length) {
                    extractedFields.D3 = null; // Prevent merging "VOLKSWAGEN VOLKSWAGEN TRANSPORTER"
                }
            }
        }
    } catch {
        // V2 Extractor threw an error, ignoring
    }
    // --- END V2 ---

    // --- FINAL CLEANUP: Ensure no garbage reaches the UI ---
    const isGarbageFinal = (str: unknown) => {
        if (str === null || str === undefined) return true;
        const clean = String(str).trim();
        if (clean === "" || clean === "." || clean === "—" || clean === "NO DICT") return true;
        if (/^[.,·—\-]+$/.test(clean)) return true;
        return false;
    };

    let fieldsFoundCount = 0;
    Object.keys(extractedFields).forEach(key => {
        if (key.startsWith("_")) return;
        if (isGarbageFinal(extractedFields[key])) {
            extractedFields[key] = null;
        } else {
            fieldsFoundCount++;
        }
    });

    return { extractedFields, fieldsFoundCount };
}
