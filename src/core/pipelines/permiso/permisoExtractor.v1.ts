import { createEmptyFieldValue, PermissionCirculationRecord } from "./permiso.types";
import { parseNumberEU, isGarbage, sanitizeVIN, normalizeValue } from "../_shared/formatUtils";

export function extractPermisoV1(analyzeResult: any): PermissionCirculationRecord {
    const record: PermissionCirculationRecord = {
        identification: {
            license_plate: createEmptyFieldValue(),
            vin: createEmptyFieldValue(),
            first_registration_date: createEmptyFieldValue(),
            registration_date: createEmptyFieldValue(),
            issue_date: createEmptyFieldValue(),
            validity_until: createEmptyFieldValue(),
            issuing_authority: createEmptyFieldValue(),
        },
        holder: {
            full_name: createEmptyFieldValue(),
        },
        vehicleCommercial: {
            brand: createEmptyFieldValue(),
            model: createEmptyFieldValue(),
            commercial_name: createEmptyFieldValue(),
        },
        vehicleTechnical: {
            fuel_raw: createEmptyFieldValue(),
            engine_displacement_cc: createEmptyFieldValue(),
            power_kw: createEmptyFieldValue(),
            seats: createEmptyFieldValue(),
        },
        meta: {
            document_version: "V1",
            detected_type: "PERMISO_V1",
            warnings: [],
            _debugExtract: [] as Array<{ key: string, value: string, sourceLine: string, method: string }>,
            debugSources: {
                B: { candidates: [] as string[], validated: false, regex: "\\b(0[1-9]|[12]\\d|3[01])[\\/\\-](0[1-9]|1[0-2])[\\/\\-](19|20)\\d{2}\\b" },
                D4: { candidates: [] as string[], validated: false, regex: "exclude_codes,take_text" }
            }
        }
    };

    let bestText = "";
    let lines: string[] = [];

    if (analyzeResult?.pages && analyzeResult.pages.length > 0) {
        lines = analyzeResult.pages.flatMap((p: any) => p.lines?.map((l: any) => l.content) || []);
        bestText = lines.join(" \n ");
    } else if (analyzeResult?.content) {
        bestText = analyzeResult.content;
        lines = bestText.split(/\r?\n/);
    }

    if (!bestText) {
        record.meta.warnings.push("No text found for Permiso V1 extraction.");
        return record;
    }

    const compactText = bestText.toUpperCase().replace(/\s+/g, " ").trim();
    const upperLines = lines.map(l => l.toUpperCase().replace(/\s+/g, " ").trim()).filter(l => l.length > 0);

    const isBoundary = (v: string) => /^[A-Z]\s*[.\-:]?\s*\d|\b[A-Z]\b/.test(v);

    const getValueAfterCode = (i: number, codeRegex: RegExp): string | null => {
        const line = upperLines[i];
        const m = line.match(codeRegex);
        if (!m) return null;

        let val = "";
        if (m[1] && m[1].trim().length > 0) {
            val = m[1].trim();
        } else {
            let lineRemainder = line.replace(m[0], "").replace(/^[:|\-—]\s*/, "").trim();
            val = lineRemainder;
        }

        if (val && val !== ".") return val;

        // Look ahead 1 or 2 lines
        for (let j = i + 1; j <= i + 2 && j < upperLines.length; j++) {
            const nextLine = upperLines[j];
            if (isBoundary(nextLine) && !nextLine.match(/^[A-Z0-9\s-]+$/)) break; // Stop if it hits a new code
            if (nextLine.length > 0 && nextLine !== ".") return nextLine;
        }
        return null;
    };

    const setField = (obj: any, val: string | null, validator?: (v: string) => any) => {
        if (!val || val === "." || val === "—") return;
        if (validator) {
            const res = validator(val);
            if (res.valid) {
                obj.value = res.parsed !== undefined ? res.parsed : val;
                obj.confidence = 0.9;
                obj.status_color = "verde";
            }
        } else {
            obj.value = val;
            obj.confidence = 0.8;
            obj.status_color = val.length < 3 ? "naranja" : "verde";
        }
    };

    const sanitizeVINWrapper = (v: string) => {
        const res = sanitizeVIN(v);
        if (res.warning) record.meta.warnings.push(res.warning);
        return res;
    };

    const parseNumber = (v: string) => {
        let clean = v.replace(/[^\d.,]/g, "");
        if (!clean) return { valid: false };
        if (clean.includes(",") && clean.includes(".")) clean = clean.replace(/\./g, "").replace(/,/g, ".");
        else if (clean.includes(",")) clean = clean.replace(/,/g, ".");
        else if (clean.includes(".")) {
            const parts = clean.split(".");
            if (parts[parts.length - 1].length === 3) clean = clean.replace(/\./g, "");
        }
        const num = parseFloat(clean);
        return isNaN(num) ? { valid: false } : { valid: true, parsed: num };
    };

    const addDebug = (key: string, value: string, sourceLine: string, method: string) => {
        if (record.meta._debugExtract) {
            record.meta._debugExtract.push({ key, value, sourceLine, method });
        }
    }

    // ---------------- STRICT DATE EXTRACTOR ----------------
    // Parse formats like DD-MM-YYYY or DD/MM/YYYY
    const extractStrictDate = (code: string): { date: string, line: string, reason: string } | null => {
        let codeRegex: RegExp;
        if (code === "B") codeRegex = /(?:^|\s)B\s*[:\-]*\s*(.+)?$/i;
        else if (code === "I") codeRegex = /(?:^|\s)I\s*[:\-]*\s*(.+)?$/i;
        else if (code === "I.2") codeRegex = /(?:^|\s)\(?I\.2\)?\s*[:\-]*\s*(.+)?$/i;
        else return null;

        const dateRegexStrict = /\b(0[1-9]|[12]\d|3[01])[\/\-](0[1-9]|1[0-2])[\/\-](19|20)\d{2}\b/;

        for (let i = 0; i < upperLines.length; i++) {
            const line = upperLines[i];
            const m = line.match(codeRegex);

            if (m) {
                // Completely reject dashed or explicitly empty ones
                if (line.match(/(?:^|\s)[BI](?:\.2)?\s*[:\-]*\s*[\-]{2,}\s*$/)) {
                    addDebug(`${code} (Strict)`, "NULL", line, "REJECTED_DASHED");
                    return null;
                }

                let val = m[1] ? m[1].trim() : "";
                let foundMatch = val.match(dateRegexStrict);

                if (foundMatch) {
                    return { date: foundMatch[0].replace(/\//g, "-"), line, reason: `Match on line: ${code}` };
                }

                if (i + 1 < upperLines.length) {
                    const nextLine = upperLines[i + 1];
                    foundMatch = nextLine.match(dateRegexStrict);
                    if (foundMatch) {
                        return { date: foundMatch[0].replace(/\//g, "-"), line: nextLine, reason: `Match on next line: ${code}` };
                    }
                }
                break; // Met the prefix but no valid date, break
            }
        }
        return null;
    };

    const bRes = extractStrictDate("B");
    if (bRes) {
        if (!record.identification.first_registration_date) record.identification.first_registration_date = createEmptyFieldValue();
        setField(record.identification.first_registration_date, bRes.date);
        addDebug("B (Fecha 1ª Matr.)", bRes.date, bRes.line, bRes.reason);
    }

    const iRes = extractStrictDate("I");
    if (iRes) {
        if (!record.identification.registration_date) record.identification.registration_date = createEmptyFieldValue();
        setField(record.identification.registration_date, iRes.date);
        addDebug("I (Fecha Matr.)", iRes.date, iRes.line, iRes.reason);
    }

    const i2Res = extractStrictDate("I.2");
    if (i2Res) {
        if (!record.identification.issue_date) record.identification.issue_date = createEmptyFieldValue();
        setField(record.identification.issue_date, i2Res.date);
        addDebug("I.2 (Fecha Emisión)", i2Res.date, i2Res.line, i2Res.reason);
    }

    // Validity Until
    const globalDates: Array<{ date: string, lineIndex: number, text: string }> = [];
    const dateRegexStrictG = /\b(0[1-9]|[12]\d|3[01])[\/\-](0[1-9]|1[0-2])[\/\-](19|20)\d{2}\b/g;
    upperLines.forEach((lineText, idx) => {
        let m;
        while ((m = dateRegexStrictG.exec(lineText)) !== null) {
            globalDates.push({ date: m[0], lineIndex: idx, text: lineText });
        }
    });

    const findProximityDate = (keywordRegex: RegExp, window: number, debugKey: string): { date: string, reason: string, line: string } | null => {
        let matches = [];
        for (let idx = 0; idx < upperLines.length; idx++) {
            if (upperLines[idx].match(keywordRegex)) {
                const nearby = globalDates.filter(d => Math.abs(d.lineIndex - idx) <= window);
                if (nearby.length > 0) {
                    nearby.sort((a, b) => Math.abs(a.lineIndex - idx) - Math.abs(b.lineIndex - idx));
                    matches.push({ date: nearby[0].date, line: nearby[0].text, reason: `PROXIMITY_MATCH: ${keywordRegex.source}` });
                }
            }
        }
        return matches.length > 0 ? matches[0] : null;
    };

    const valMatch = findProximityDate(/V[AÁ]LIDO HASTA|VALIDEZ/, 4, "Válido Hasta");
    if (valMatch) {
        setField(record.identification.validity_until, valMatch.date);
        addDebug("Válido Hasta", valMatch.date, valMatch.line, valMatch.reason);
    }
    // ---------------- END STRICT DATE EXTRACTOR ----------------

    let c11: string | null = null;
    let c12: string | null = null;
    let c13: string | null = null;

    // V1 Extraction rules
    for (let i = 0; i < upperLines.length; i++) {
        const line = upperLines[i];

        // A -> License Plate
        if (!record.identification.license_plate.value) {
            const v = getValueAfterCode(i, /(?:^|\s)A\s*(?:[:\-]?\s*)?([0-9A-Z\s\-]{5,10})?(?:\s|$)/);
            if (v && v.replace(/\s/g, "").match(/^[0-9A-Z]{5,10}$/)) {
                setField(record.identification.license_plate, v.replace(/\s/g, ""));
                addDebug("A (Matrícula)", v, line, "codeRegex");
            }
        }

        // JEFATURA
        if (!record.identification.issuing_authority.value) {
            if (line.match(/JEFATURA/)) {
                setField(record.identification.issuing_authority, line.replace(/^[:\-\s]*/, ""));
                addDebug("Jefatura", line, line, "LABEL_MATCH");
            }
        }

        if (!c11 && line.match(/(?:^|\s)C\.1\.1\b/)) {
            const v = getValueAfterCode(i, /(?:^|\s)C\.1\.1\s*(?:[:\-]?\s*)?(.+)?$/);
            if (v) { c11 = v; }
        }
        if (!c12 && line.match(/(?:^|\s)C\.1\.2\b/)) {
            const v = getValueAfterCode(i, /(?:^|\s)C\.1\.2\s*(?:[:\-]?\s*)?(.+)?$/);
            if (v) { c12 = v; }
        }
        if (!c13 && line.match(/(?:^|\s)C\.1\.3\b/)) {
            const v = getValueAfterCode(i, /(?:^|\s)C\.1\.3\s*(?:[:\-]?\s*)?(.+)?$/);
            if (v) { c13 = v; }
        }
        // C.4 -> Identificador titular
        if (!record.holder.holder_id?.value) {
            const v = getValueAfterCode(i, /(?:^|\s)C\.4\w?\s*(?:[:\-]?\s*)?([A-Z0-9.\-\/]+)?$/);
            if (v) {
                if (!record.holder.holder_id) record.holder.holder_id = createEmptyFieldValue();
                setField(record.holder.holder_id, v);
                addDebug("C.4 (Identificador Titular)", v, line, "codeRegex");
            }
        }
        // D.4 -> Service
        if (!record.vehicleCommercial.service?.value) {
            if (line.match(/\bD\.?\s*4\b/) || line.includes("SERVICIO")) {
                const candidates = [line];
                if (i + 1 < upperLines.length) candidates.push(upperLines[i + 1]);
                if (i + 2 < upperLines.length) candidates.push(upperLines[i + 2]);

                if (!record.meta.debugSources) record.meta.debugSources = {};
                if (!record.meta.debugSources.D4) record.meta.debugSources.D4 = { candidates: [], regex: "exclude_codes,take_text", validated: false };

                candidates.forEach(c => {
                    if (!record.meta.debugSources!.D4!.candidates.includes(c)) {
                        record.meta.debugSources!.D4!.candidates.push(c);
                    }
                });

                let chosenValue = null;
                let matchedLine = "";

                for (const cand of candidates) {
                    let candVal = cand;
                    const d4Match = cand.match(/\bD\.?\s*4[\s:\-]*(.*)$/);
                    if (d4Match && d4Match[1].trim()) candVal = d4Match[1].trim();
                    else {
                        const servMatch = cand.match(/SERVICIO[\s:\-]*(.*)$/);
                        if (servMatch && servMatch[1].trim()) candVal = servMatch[1].trim();
                    }

                    if (!candVal) continue;

                    // Reject if it looks like a code eg D.3, P.1, S.1
                    if (candVal.match(/^[A-Z]\.\d/)) continue;
                    // Reject if it ends in :
                    if (candVal.endsWith(":")) continue;
                    // Reject if it's too short
                    if (candVal.length < 3) continue;
                    // Reject standard fields accidentally caught
                    if (candVal.match(/^[0-9A-Z]{17}$/)) continue; // VIN

                    chosenValue = candVal;
                    matchedLine = cand;
                    break;
                }

                if (chosenValue) {
                    if (!record.vehicleCommercial.service) record.vehicleCommercial.service = createEmptyFieldValue();
                    setField(record.vehicleCommercial.service, chosenValue);
                    addDebug("D.4 (Servicio)", chosenValue, matchedLine, "candidates_filter");
                    record.meta.debugSources.D4.chosen = chosenValue;
                    record.meta.debugSources.D4.line = matchedLine;
                    record.meta.debugSources.D4.validated = true;
                    record.meta.debugSources.D4.reason = "VALUE_EXTRACTED";
                } else {
                    record.meta.debugSources.D4.reason = "NO_VALUE_FOUND";
                }
            }
        }
        // D.1 -> Brand
        if (!record.vehicleCommercial.brand.value) {
            const v = getValueAfterCode(i, /(?:^|\s)D\.1\s*(?:[:\-]?\s*)?([A-Z0-9\s.\-]+)?$/);
            if (v) {
                setField(record.vehicleCommercial.brand, v);
                addDebug("D.1 (Marca)", v, line, "codeRegex");
            }
        }
        // D.2 -> Type/Variant/Version
        if (!record.vehicleCommercial.type?.value) {
            const v = getValueAfterCode(i, /(?:^|\s)D\.2\s*(?:[:\-]?\s*)?([A-Z0-9\s.\-\/]+)?$/);
            if (v) {
                if (!record.vehicleCommercial.type) record.vehicleCommercial.type = createEmptyFieldValue();
                setField(record.vehicleCommercial.type, v);
                addDebug("D.2 (Tipo)", v, line, "codeRegex");
            }
        }
        // D.3 -> Commercial Name
        if (!record.vehicleCommercial.commercial_name?.value) {
            const v = getValueAfterCode(i, /(?:^|\s)D\.3\s*(?:[:\-]?\s*)?([A-Z0-9\s.\-]+)?$/);
            if (v) {
                if (!record.vehicleCommercial.commercial_name) record.vehicleCommercial.commercial_name = createEmptyFieldValue();
                setField(record.vehicleCommercial.commercial_name, v);
                addDebug("D.3 (Modelo)", v, line, "codeRegex");
            }
        }
        // D.3 Fallback to D.2 if it was completely missing and D.2 existed
        if (i === upperLines.length - 1 && !record.vehicleCommercial.commercial_name?.value && record.vehicleCommercial.type?.value) {
            if (!record.vehicleCommercial.commercial_name) record.vehicleCommercial.commercial_name = createEmptyFieldValue();
            record.vehicleCommercial.commercial_name.value = record.vehicleCommercial.type.value;
            record.vehicleCommercial.commercial_name.confidence = 0.5;
            record.vehicleCommercial.commercial_name.status_color = "naranja";
            addDebug("D.3 (Modelo)", record.vehicleCommercial.type.value as string, "D.2 Fallback", "fallback_to_D2");
        }
        // E -> VIN
        if (!record.identification.vin.value) {
            const v = getValueAfterCode(i, /(?:^|\s)E\s*(?:[:\-]?\s*)?([A-HJ-NPR-Z0-9\s]{17,20})?(?:\s|$)/);
            if (v) {
                setField(record.identification.vin, v, sanitizeVINWrapper);
                addDebug("E (Bastidor)", v, line, "codeRegex");
            }
        }
        // P.1 -> Engine Displacement
        if (!record.vehicleTechnical.engine_displacement_cc.value) {
            const v = getValueAfterCode(i, /(?:^|\s)P\.1\s*(?:[:\-]?\s*)?([\d.,]{3,5})?(?:\s|$)/);
            if (v) {
                setField(record.vehicleTechnical.engine_displacement_cc, v, parseNumber);
                addDebug("P.1 (Cilindrada)", v, line, "codeRegex");
            }
        }
        // P.2 -> Power kW
        if (!record.vehicleTechnical.power_kw.value) {
            const v = getValueAfterCode(i, /(?:^|\s)P\.2\s*(?:[:\-]?\s*)?([\d.,]{1,6})?(?:\s|$)/);
            if (v) {
                const parsed = parseNumber(v);
                if (parsed.valid && typeof parsed.parsed === 'number') {
                    setField(record.vehicleTechnical.power_kw, v, parseNumber);
                    addDebug("P.2 (Potencia)", v, line, "codeRegex");
                }
            }
        }
        // P.3 -> Fuel
        if (!record.vehicleTechnical.fuel_raw.value) {
            const v = getValueAfterCode(i, /(?:^|\s)P\.3\s*(?:[:\-]?\s*)?([A-Z\s]+)?$/);
            if (v) {
                setField(record.vehicleTechnical.fuel_raw, v);
                addDebug("P.3 (Combustible)", v, line, "codeRegex");
            }
        }
        // S.1 -> Seats
        if (!record.vehicleTechnical.seats.value) {
            const v = getValueAfterCode(i, /(?:^|\s)S\.1\s*(?:[:\-]?\s*)?(\d{1,2})?(?:\s|$)/);
            if (v) {
                setField(record.vehicleTechnical.seats, v, parseNumber);
                addDebug("S.1 (Plazas)", v, line, "codeRegex");
            }
        }
        // F.1 -> MMA
        if (!record.vehicleTechnical.max_mass_kg?.value) {
            const v = getValueAfterCode(i, /(?:^|\s)F\.1\s*(?:[:\-]?\s*)?([\d.,]{3,5})?(?:\s|$)/);
            if (v) {
                if (!record.vehicleTechnical.max_mass_kg) record.vehicleTechnical.max_mass_kg = createEmptyFieldValue();
                setField(record.vehicleTechnical.max_mass_kg, v, parseNumber);
                addDebug("F.1 (MMA)", v, line, "codeRegex");
            }
        }
        // F.2 -> MTM
        if (!record.vehicleTechnical.tech_max_mass_kg?.value) {
            const v = getValueAfterCode(i, /(?:^|\s)F\.2\s*(?:[:\-]?\s*)?([\d.,]{3,5})?(?:\s|$)/);
            if (v) {
                if (!record.vehicleTechnical.tech_max_mass_kg) record.vehicleTechnical.tech_max_mass_kg = createEmptyFieldValue();
                setField(record.vehicleTechnical.tech_max_mass_kg, v, parseNumber);
                addDebug("F.2 (MTM)", v, line, "codeRegex");
            }
        }
        // G -> Masa servicio
        if (!record.vehicleTechnical.mass_in_service_kg?.value) {
            const v = getValueAfterCode(i, /(?:^|\s)G\s*(?:[:\-]?\s*)?([\d.,]{3,5})?(?:\s|$)/);
            if (v) {
                if (!record.vehicleTechnical.mass_in_service_kg) record.vehicleTechnical.mass_in_service_kg = createEmptyFieldValue();
                setField(record.vehicleTechnical.mass_in_service_kg, v, parseNumber);
                addDebug("G (Masa Servicio)", v, line, "codeRegex");
            }
        }
        // K -> Homologation
        if (!record.vehicleTechnical.homologation_code?.value) {
            const v = getValueAfterCode(i, /(?:^|\s)K\s*(?:[:\-]?\s*)?([A-Z0-9.\-\*]{5,20})?(?:\s|$)/);
            if (v) {
                if (!record.vehicleTechnical.homologation_code) record.vehicleTechnical.homologation_code = createEmptyFieldValue();
                setField(record.vehicleTechnical.homologation_code, v);
                addDebug("K (Homologación)", v, line, "codeRegex");
            }
        }
    }

    // Titular Compilation
    let holderFull = "";
    if (c11 || c12 || c13) {
        let ruleUsed = "";
        if (c12 && (!c11 || !c11.match(/\b(SL|S\.L\.|SA|S\.A\.|SOCIEDAD|SCOOP|SC|CB|SCP|COOP|ASOCIACION|FUNDACION)\b/i))) {
            // Probably physical person
            holderFull = [c12, c11, c13].filter(Boolean).join(" ").trim();
            ruleUsed = "PERSON(C.1.2 + C.1.1 + C.1.3)";
        } else {
            // Probably company
            holderFull = [c11, c13].filter(Boolean).join(" ").trim();
            ruleUsed = "COMPANY(C.1.1 + C.1.3)";
        }

        setField(record.holder.full_name, holderFull);
        addDebug("Titular Compilado", holderFull, "N/A", ruleUsed);

        if (!record.meta._debugExtract) record.meta._debugExtract = [];
        record.meta._debugExtract.push({ key: "Titular Componentes", value: JSON.stringify({ c11, c12, c13, ruleUsed }), sourceLine: "DEBUG", method: ruleUsed });
    }

    // Observaciones from raw text
    const obsBlockMatch = bestText.match(/OBSERVACIONES\s*:\s*([\s\S]*?)(?:$)/i);
    if (obsBlockMatch) {
        const obsRaw = obsBlockMatch[1].trim();
        if (obsRaw) {
            record.meta.raw_observations = [obsRaw];
            if (!record.meta._debugExtract) record.meta._debugExtract = [];
            record.meta._debugExtract.push({ key: "RAW_OBSERVACIONES", value: obsRaw, sourceLine: "DEBUG", method: "RAW" });

            const cleanedLines = obsRaw.split('\n').map(l => l.trim()).filter(l => {
                if (!l) return false;

                // OCR Artefacts cleanup (Exact matches)
                if (l.match(/^([A-Z]\.?(\d(\.\d)?)?|C\.\d(\.\d)?|D\.\d|\(D\.\d\)|P\.\d|S\.\d|F\.\d|I(\.\d)?|B|H|MO|C\.1\.1|C\.1\.2|C\.1\.3|C\.4|D\.1|D\.2|D\.3)$/i)) return false;

                // Lines starting with typical field codes indicating OCR misordering
                if (l.match(/^(?:C\.1\.\d|C\.4|D\.\d|P\.\d|S\.\d|F\.\d|I\.\d|B|E|A|G|K|J|J\.\d|Marca|Modelo|Matr[ií]cula|Bastidor|Color)[\s.:\-]/i)) {
                    return false;
                }

                // Deduplicate main extracted values from repeating in the observations text
                const extractedVals = [
                    holderFull,
                    record.vehicleCommercial.brand?.value,
                    record.vehicleCommercial.model?.value,
                    record.vehicleCommercial.commercial_name?.value,
                    record.vehicleCommercial.type?.value,
                    record.vehicleCommercial.service?.value,
                    record.identification.vin?.value,
                    record.identification.license_plate?.value
                ].filter(Boolean).map(v => String(v).toLowerCase());

                if (extractedVals.includes(l.toLowerCase())) return false;

                return true;
            });
            const obsClean = cleanedLines.join('\n').trim();

            if (obsClean) {
                if (!record.observations) record.observations = createEmptyFieldValue();
                setField(record.observations, obsClean);
                addDebug("Observaciones", obsClean, "Bloque OBSERVACIONES (Limpio)", "regexBlockFiltered");
            }

            // Extract Próxima ITV inside the block
            const insideItvMatch = obsRaw.match(/Pr[oó]xima\s+ITV\s*[:-]?\s*(\d{2}[-/]\d{2}[-/]\d{4})/i);
            if (insideItvMatch) {
                if (!record.next_itv) record.next_itv = createEmptyFieldValue();
                setField(record.next_itv, insideItvMatch[1]);
                addDebug("Próxima ITV", insideItvMatch[1], "Dentro de Observaciones", "regexInsideBlock");
            }
        }
    } else {
        // Fallback for ITV just in case
        const itvMatch = bestText.match(/ITV[\s:]*(\d{2}-\d{2}-\d{4})/i) || bestText.match(/Pr[oó]xima ITV[\s:]*(\d{2}-\d{2}-\d{4})/i);
        if (itvMatch) {
            if (!record.next_itv) record.next_itv = createEmptyFieldValue();
            setField(record.next_itv, itvMatch[1]);
            addDebug("Próxima ITV", itvMatch[1], "Nativo Fallback", "regexBestText");
        }
    }

    // Fallbacks via global regex if line-by-line misses due to layout artifacts
    if (!record.identification.vin.value) {
        const vMatch = compactText.match(/E\s*[:\-]?\s*([A-HJ-NPR-Z0-9]{17})/);
        if (vMatch) {
            setField(record.identification.vin, vMatch[1], sanitizeVINWrapper);
            addDebug("E (Bastidor)", vMatch[1], "Global Match", "globalRegex");
        }
    }
    if (!record.identification.license_plate.value) {
        const plateMatch = compactText.match(/\b(\d{4}\s?-?\s?[A-Z]{3})\b/);
        if (plateMatch) {
            setField(record.identification.license_plate, plateMatch[1].replace(/[\s-]/g, ""));
            addDebug("A (Matrícula)", plateMatch[1], "Global Match", "globalRegex");
        }
    }

    // Validation
    if (!record.identification.vin.value) {
        record.identification.vin.status_color = "rojo";
        record.meta.warnings.push("Bastidor (E) no encontrado.");
    }
    if (!record.identification.license_plate.value) {
        record.identification.license_plate.status_color = "rojo";
        record.meta.warnings.push("Matrícula (A) no encontrada.");
    }
    if (!record.identification.first_registration_date.value) {
        record.meta.warnings.push("B_DATE_NOT_FOUND");
    }
    if (!record.vehicleCommercial.service?.value) {
        record.meta.warnings.push("SERVICE_D4_NOT_FOUND");
    }

    return record;
}
