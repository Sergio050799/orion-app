import { normalizeFuel, calcularCV } from '../_shared/formatUtils';
import { CELL_PAIR_CODE_MAP, isItvCodeLine, isItvKnownOrDottedCode } from './ficha-cell-pair';

export function extractFieldsV2(analyzeResult: any): any {
    const extracted: any = {};
    const debugAttempts: any[] = [];

    // 1) Determine the best text source
    const candidates = [];

    if (analyzeResult?.content) {
        candidates.push({ source: 'content', text: analyzeResult.content });
    }

    let linesText = "";
    if (analyzeResult?.pages && analyzeResult.pages.length > 0) {
        const allLines = analyzeResult.pages.flatMap((p: any) => p.lines?.map((l: any) => l.content) || []);
        linesText = allLines.join(" \n ");
        if (linesText.trim().length > 0) {
            candidates.push({ source: 'pages.lines', text: linesText });
        }
    }

    let wordsText = "";
    if (analyzeResult?.pages && analyzeResult.pages.length > 0) {
        const allWords = analyzeResult.pages.flatMap((p: any) => p.words?.map((w: any) => w.content) || []);
        wordsText = allWords.join(" ");
        if (wordsText.trim().length > 0) {
            candidates.push({ source: 'pages.words', text: wordsText });
        }
    }

    const tokensToScore = ["D.1", "D.3", "E", "F.1", "F.2", "S.1", "P.1", "P.2", "P.3", "J", "J.1"];
    let bestText = "";
    let bestScore = -1;
    let bestSource = "none";

    for (const cand of candidates) {
        const textUpper = cand.text.toUpperCase();
        let score = textUpper.length;
        for (const t of tokensToScore) {
            if (textUpper.includes(t)) score += 200;
        }
        if (cand.source === 'pages.lines') score += 500; // Prioritize structured lines

        if (score > bestScore) {
            bestScore = score;
            bestText = cand.text;
            bestSource = cand.source;
        }
    }

    if (!bestText) {
        extracted._v2Debug = { invoked: true, bestSource: "none", fullTextLen: 0, linesCount: 0, attempts: [] };
        return extracted;
    }

    // Validation Helpers
    const normalizeValue = (str: string) => {
        if (!str) return "";
        return str.replace(/^[.,·—\-\s]+|[.,·—\-\s]+$/g, "").replace(/\s+/g, " ").trim();
    };

    const isGarbage = (str: string) => {
        if (!str) return true;
        const clean = str.trim();
        if (clean === "" || clean === "." || clean === "—" || clean === "NO DICT") return true;
        if (/^[.,·—\-]+$/.test(clean)) return true;
        if (clean.length < 2 && !/^\d$/.test(clean)) return true;
        return false;
    };

    const parseNumberEU = (str: string) => {
        if (!str) return null;
        let clean = str.replace(/[^\d.,]/g, "");
        if (!clean) return null;
        if (clean.includes(",") && clean.includes(".")) {
            clean = clean.replace(/\./g, "").replace(/,/g, ".");
        } else if (clean.includes(",")) {
            clean = clean.replace(/,/g, ".");
        } else if (clean.includes(".")) {
            const parts = clean.split(".");
            if (parts[parts.length - 1].length === 3) {
                clean = clean.replace(/\./g, ""); // "3.200" -> 3200
            }
        }
        const num = parseFloat(clean);
        return isNaN(num) ? null : num;
    };

    // 2) Tokenize robustly
    let rawLines: string[] = [];
    if (bestSource === 'pages.lines' && analyzeResult?.pages) {
        rawLines = analyzeResult.pages.flatMap((p: any) => p.lines?.map((l: any) => l.content) || []);
    } else {
        rawLines = bestText.split(/\r?\n/);
    }

    // Normalizar caracteres OCR problemáticos (confusiones de fuente frecuentes en fichas ITV)
    // "đ" (d con trazo, U+0111) → "d"  |  "Đ" → "D"  |  "ı" (i sin punto) → "i"
    rawLines = rawLines.map(l =>
        l.replace(/đ/g, "d").replace(/Đ/g, "D").replace(/ı/g, "i").replace(/ﬁ/g, "fi").replace(/ﬂ/g, "fl")
    );


    // Clean spaces but keep periods/dashes intact
    const lines = rawLines.map(l => l.toUpperCase().replace(/\s+/g, " ").trim()).filter(l => l.length > 0);
    const compactText = bestText.toUpperCase().replace(/\s+/g, " ").trim();
    // Normalized variants (sin acentos) para detección y extracción de etiquetas en español
    const linesNorm = rawLines.map(l => l.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim()).filter(l => l.length > 0);
    const compactNorm = bestText.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

    const isBoundary = (v: string) => /^[A-Z]\s*[.\-:]?\s*\d|^(?:D|F|S|P|J|V|L|O)\s*[.\-:]?\s*\d/i.test(v) || /C[OÓ]DIGO|DESCRIPCI[OÓ]N|CATEGOR[IÍ]A|CARROCER[IÍ]A|MASA|VEH[IÍ]CULO|MARCA|MODELO|DENOMINACI[OÓ]N/i.test(v);

    const getValue = (i: number, matchRegex: RegExp, originalLine: string): string | null => {
        const m = originalLine.match(matchRegex);
        if (!m) return null;

        let val = "";
        if (m[1] && m[1].trim().length > 0) {
            val = m[1].trim();
        } else {
            let lineRemainder = originalLine.replace(m[0], "").replace(/^[:|\-—]\s*/, "").trim();
            val = lineRemainder;
        }

        if (val && !isBoundary(val)) return normalizeValue(val);

        // Look ahead
        for (let j = i + 1; j <= i + 3 && j < lines.length; j++) {
            const nextLine = lines[j];
            if (isBoundary(nextLine)) break; // Hit next label
            return normalizeValue(nextLine);
        }
        return null; // Empty field
    };

    const recordAttempt = (key: string, raw: string | null, valid: boolean, reason: string = "") => {
        debugAttempts.push({ strategy: "codeLine", key, raw, valid, reasonIfInvalid: reason });
    };

    const processField = (key: string, val: string | null, validator: (v: string) => { valid: boolean, parsed?: any, reason?: string }) => {
        if (!val || isGarbage(val)) {
            recordAttempt(key, val, false, "isGarbage (empty/symbols/<2 chars)");
            return false;
        }

        const res = validator(val);
        if (res.valid) {
            recordAttempt(key, val, true, "");
            extracted[key] = res.parsed !== undefined ? res.parsed : val;
            return true;
        } else {
            recordAttempt(key, val, false, res.reason || "Validation failed");
            return false;
        }
    };

    // Validators
    const valD1 = (v: string) => {
        if (v.match(/ALEMANIA|ESPAÑA|MADRID|CALLE|WOLFSBURG|GERMANY|TEL|FAX|D-\d{5}/i)) return { valid: false, reason: "looksLikeAddress" };
        if (!/[A-Z]/.test(v)) return { valid: false, reason: "noLetters" };
        return { valid: true };
    };
    const valD3 = (v: string) => {
        if (v.match(/ALEMANIA|ESPAÑA|MADRID|CALLE|WOLFSBURG|GERMANY|TEL|FAX|D-\d{5}/i)) return { valid: false, reason: "looksLikeAddress" };
        return { valid: true };
    };
    const valE = (v: string) => {
        const clean = v.replace(/\s+/g, "");
        if (/^[A-HJ-NPR-Z0-9]{17}$/.test(clean)) return { valid: true, parsed: clean };
        return { valid: false, reason: "invalidVIN" };
    };
    const valS1 = (v: string) => {
        const num = parseNumberEU(v);
        if (num !== null && num >= 1 && num <= 99) return { valid: true, parsed: num };
        return { valid: false, reason: "invalidSeats" };
    };
    const valF2 = (v: string) => {
        const num = parseNumberEU(v);
        if (num !== null && num >= 300 && num <= 20000) return { valid: true, parsed: num };
        return { valid: false, reason: "invalidMMA" };
    };
    const valP1 = (v: string) => {
        const num = parseNumberEU(v);
        if (num !== null && num >= 50 && num <= 20000) return { valid: true, parsed: num };
        return { valid: false, reason: "invalidCC" };
    };
    const valP2 = (v: string) => {
        const num = parseNumberEU(v);
        if (num !== null && num >= 1 && num <= 2000) return { valid: true, parsed: num };
        return { valid: false, reason: "invalidKW" };
    };
    const valGeneric = (v: string) => ({ valid: true });

    // 3) Line-by-line parsing with OCR-tolerant regex
    // V2 is PRIMARY extractor. Legacy extractFields() acts as structural fallback for codes V2 misses.
    const patterns = [
        { key: "D1", rex: /(?:^|[\s])D\s*[.\-:]?\s*[1I]\s*(?:[:\-]?\s*)?(.+)?$/, validator: valD1 },
        { key: "D2", rex: /(?:^|[\s])D\s*[.\-:]?\s*2\s*(?:[:\-]?\s*)?(.+)?$/, validator: valGeneric },
        { key: "D3", rex: /(?:^|[\s])D\s*[.\-:]?\s*3\s*(?:[:\-]?\s*)?(.+)?$/, validator: valD3 },
        { key: "E", rex: /(?:^|[\s])E\s*(?:[:\-]?\s*)?([A-HJ-NPR-Z0-9]{17})/, validator: valE },
        { key: "J", rex: /(?:^|[\s])J\s*(?:[:\-]?\s*)?(.+)?$/, validator: valGeneric },
        { key: "J1", rex: /(?:^|[\s])J\s*[.\-:]?\s*1\s*(?:[:\-]?\s*)?(.+)?$/, validator: valGeneric },
        { key: "J2", rex: /(?:^|[\s])J\s*[.\-:]?\s*2\s*(?:[:\-]?\s*)?(.+)?$/, validator: valGeneric },
        { key: "J3", rex: /(?:^|[\s])J\s*[.\-:]?\s*3\s*(?:[:\-]?\s*)?(.+)?$/, validator: valGeneric },
        { key: "F1", rex: /(?:^|[\s])F\s*[.\-:]?\s*1\s*(?:[:\-]?\s*)?([\d.,]{3,})/, validator: valF2 },
        { key: "F2", rex: /(?:^|[\s])F\s*[.\-:]?\s*2\s*(?:[:\-]?\s*)?([\d.,]{3,})/, validator: valF2 },
        // Ficha-exclusive dimension codes
        { key: "F4", rex: /(?:^|[\s])F\s*[.\-:]?\s*4\s*(?:[:\-]?\s*)?([\d.,]{3,})/, validator: valF2 },
        { key: "F5", rex: /(?:^|[\s])F\s*[.\-:]?\s*5\s*(?:[:\-]?\s*)?([\d.,]{3,})/, validator: valF2 },
        { key: "F6", rex: /(?:^|[\s])F\s*[.\-:]?\s*6\s*(?:[:\-]?\s*)?([\d.,]{3,})/, validator: valF2 },
        { key: "M1", rex: /(?:^|[\s])M\s*[.\-:]?\s*1\s*(?:[:\-]?\s*)?([\d.,]{3,})/, validator: valF2 },
        // Ficha-exclusive classification codes — (?!\w) evita match en CLASIFICACION, CILINDRADA, CILINDRAJE
        { key: "CL", rex: /(?:^|[\s])C\s*[.\-:]?\s*L(?!\w)\s*(?:[:\-]?\s*)?(.+)?$/, validator: valGeneric },
        { key: "CI", rex: /(?:^|[\s])C\s*[.\-:]?\s*I(?!\w)\s*(?:[:\-]?\s*)?(.+)?$/, validator: valGeneric },
        { key: "CV", rex: /(?:^|[\s])C\s*[.\-:]?\s*V(?!\w)\s*(?:[:\-]?\s*)?(.+)?$/, validator: valGeneric },
        { key: "G", rex: /(?:^|[\s])G\s*(?:[:\-]?\s*)?([\d.,]{3,})/, validator: valF2 },
        { key: "S1", rex: /(?:^|[\s])S\s*[.\-:]?\s*[1Il]\s*(?:[:\-]?\s*)?(\d{1,2})/, validator: valS1 },
        { key: "P1", rex: /(?:^|[\s])P\s*[.\-:]?\s*1\s*(?:[:\-]?\s*)?([\d.,]+)/, validator: valP1 },
        { key: "P2", rex: /(?:^|[\s])P\s*[.\-:]?\s*2\s*(?:[:\-]?\s*)?([\d.,]+)/, validator: valP2 },
        { key: "P3", rex: /(?:^|[\s])P\s*[.\-:]?\s*3\s*(?:[:\-]?\s*)?(.+)?$/, validator: valGeneric },
        { key: "L2", rex: /(?:^|[\s])L\s*[.\-:]?\s*2\s*(?:[:\-]?\s*)?(.+)?$/, validator: valGeneric },
        { key: "plate", rex: /\b(\d{4}\s?[A-Z]{3})\b/, validator: valGeneric }
    ];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        for (const p of patterns) {
            if (!extracted[p.key]) { // Only grab first match to avoid later garbage
                const m = line.match(p.rex);
                if (m) {
                    // For exact groups, we can directly process m[1] if it exists
                    if (["E", "F1", "F2", "F4", "F5", "F6", "M1", "S1", "G", "P1", "P2", "plate"].includes(p.key) && m[1]) {
                        processField(p.key, m[1], p.validator);
                    } else {
                        const val = getValue(i, p.rex, line);
                        if (val) {
                            // Collision avoidance for J vs J.1
                            if (p.key === "J" && line.match(/J\s*[.\-:]?\s*[123]/)) continue;
                            processField(p.key, val, p.validator);
                        }
                    }
                }
            }
        }
    }

    // 4) Global "Salvavidas" search (RESTRICTED TO VIN and MATRICULA ONLY to prevent addresses!)
    if (!extracted.E) {
        const globalE = compactText.match(/E\s*[:\-]?\s*([A-HJ-NPR-Z0-9]{17})\b/);
        if (globalE) {
            processField("E", globalE[1], valE);
            if (extracted.E) debugAttempts.push({ strategy: "globalSearch", key: "E", raw: globalE[1], valid: true });
        }
    }

    if (!extracted.plate) {
        const globalPlate = compactText.match(/\b(\d{4}\s?[A-Z]{3})\b/);
        if (globalPlate) {
            extracted.plate = globalPlate[1].replace(/\s/g, "");
            debugAttempts.push({ strategy: "globalSearch", key: "plate", raw: globalPlate[1], valid: true });
        } else {
            const oldPlateMatch = compactText.match(/\b([A-Z]{1,2}\s?\d{4}\s?[A-Z]{1,2})\b/);
            if (oldPlateMatch) {
                extracted.plate = oldPlateMatch[1].replace(/\s/g, "");
                debugAttempts.push({ strategy: "globalSearch", key: "plate", raw: oldPlateMatch[1], valid: true });
            }
        }
    }

    // 5) TEXT-LABEL FORMAT extraction (Ficha Técnica formato etiquetas de texto — "ficha antigua")
    // Se activa cuando el doc usa etiquetas en español en lugar de códigos de letra (D.1, E, F.4...)
    const isTextLabelFormat = compactNorm.includes("NUMERO DE IDENTIFICACION") ||
        compactNorm.includes("DENOMINACION COMERCIAL") ||
        compactNorm.includes("DE ASIENTOS");

    if (isTextLabelFormat) {
        const FICHA_TL_STOP = [
            "MARCA", "TIPO", "VARIANTE", "DENOMINACION COMERCIAL", "CLASE", "TARA", "MTMA", "MMA",
            "N DE ASIENTOS", "VOLUMEN DE BODEGA", "ALTURA TOTAL", "ANCHURA TOTAL", "LONGITUD TOTAL",
            "VIA ANTERIOR", "DISTANCIA EJE", "N CILINDROS", "POTENCIA FISCAL", "N SERIE",
            "N CERTIFICADO", "CLASIFICACION DEL VEHICULO", "OPCIONES INCLUIDAS", "OBSERVACIONES",
            "NUMERO DE IDENTIFICACION"
        ];
        const isTLStop = (str: string) => {
            const clean = str.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[:\-]/g, "").trim();
            return FICHA_TL_STOP.some(s => clean === s || clean.startsWith(s));
        };
        const extractTL = (rx: RegExp): string | null => {
            for (let i = 0; i < linesNorm.length; i++) {
                const m = linesNorm[i].match(rx);
                if (m) {
                    if (m[1] && m[1].trim() && m[1].trim() !== ":") {
                        const candidate = m[1].trim();
                        if (!isTLStop(candidate)) return candidate;
                    }
                    if (i + 1 < linesNorm.length) {
                        const next = linesNorm[i + 1].replace(/^[:\-]\s*/, "").trim();
                        if (next && next !== "." && !isTLStop(next)) return next;
                    }
                }
            }
            return null;
        };
        const parseW = (v: string) => { const n = parseNumberEU(v); return n !== null && n >= 100 && n <= 50000 ? { valid: true, parsed: n } : { valid: false }; };
        const parseDim = (v: string) => { const n = parseNumberEU(v); return n !== null && n >= 500 && n <= 15000 ? { valid: true, parsed: n } : { valid: false }; };

        // VIN
        if (!extracted.E) {
            const vin = extractTL(/(?:NUMERO DE IDENTIFICACION)\s*[:]?\s*(.*)/);
            if (vin) {
                let c = vin.replace(/\s+/g, "");
                c = c.replace(/I/g, "1").replace(/O/g, "0"); // OCR noise: I e O son inválidos en VIN
                if (/^[A-HJ-NPR-Z0-9]{17}$/.test(c)) extracted.E = c;
            }
        }
        // Marca → D1
        if (!extracted.D1) { const v = extractTL(/^(?:MARCA)\s*[:]?\s*(.*)/); if (v) extracted.D1 = v; }
        // Tipo → J (siempre sobrescribir — letter-code J es muy ambiguo y puede capturar basura)
        { const v = extractTL(/^(?:TIPO)\s*[:]?\s*(.*)/); if (v) extracted.J = v; }
        // Variante → D2
        if (!extracted.D2) { const v = extractTL(/^(?:VARIANTE)\s*[:]?\s*(.*)/); if (v) extracted.D2 = v; }
        // Denominacion Comercial → D3
        if (!extracted.D3) { const v = extractTL(/(?:DENOMINACION COMERCIAL)\s*[:]?\s*(.*)/); if (v) extracted.D3 = v; }
        // Clasificación del vehículo → CL
        // El doc tiene: label → código interno (VOVDZ678) → línea descriptiva ("1 0 3 3 TURISMO TODO TERRENO")
        // Buscar la línea descriptiva: contiene dígitos + descripción con texto
        {
            const clLabelIdx = linesNorm.findIndex(l => /^CLASIFICACION\s+DEL\s+VEHICULO/.test(l));
            if (clLabelIdx >= 0) {
                for (let j = clLabelIdx + 1; j <= clLabelIdx + 4 && j < linesNorm.length; j++) {
                    const cand = linesNorm[j].trim();
                    if (!cand || isTLStop(cand)) break;
                    // Preferir la línea con dígitos espaciados + descripción ("1 0 3 3 TURISMO TODO TERRENO")
                    if (/\d[\d\s]+[A-Z]{3,}/.test(cand)) {
                        // Normalizar dígitos espaciados: "1 0 3 3" → "1033"
                        extracted.CL = cand.replace(/^(\d(?:\s\d)+)\s+/, (_, digits) => digits.replace(/\s/g, "") + " ");
                        break;
                    }
                }
            }
            // Fallback al campo CLASE: si existe y tiene valor no-basura
            if (!extracted.CL) {
                const v = extractTL(/^(?:CLASE)\s*[:]?\s*(.*)/);
                if (v && v !== "—" && v !== "-" && v.length > 1) extracted.CL = v;
            }
        }
        // Tara → F2
        if (!extracted.F2) { const v = extractTL(/(?:TARA)\s*[:\(]?\s*(?:KG[:\)]?)?\s*([\d.,]*)/); if (v) { const r = parseW(v); if (r.valid) extracted.F2 = r.parsed; } }
        // MTMA → F1
        if (!extracted.F1) { const v = extractTL(/(?:MTMA|MMA)\s*[:\(\/]?\s*(?:KG[:\)]?)?\s*([\d.,]*)/); if (v) { const r = parseW(v); if (r.valid) extracted.F1 = r.parsed; } }
        // N de Asientos → S1
        if (!extracted.S1) { const v = extractTL(/(?:N\.?\s*DE?\s*ASIENTOS|ASIENTOS)\s*[:]?\s*(\d{0,2})/); if (v) { const n = parseInt(v, 10); if (n >= 1 && n <= 99) extracted.S1 = n; } }
        // Altura Total → F4
        if (!extracted.F4) { const v = extractTL(/(?:ALTURA TOTAL)\s*[:\(]?\s*(?:MM[:\)]?)?\s*([\d.,]*)/); if (v) { const r = parseDim(v); if (r.valid) extracted.F4 = r.parsed; } }
        // Anchura Total → F5
        if (!extracted.F5) { const v = extractTL(/(?:ANCHURA TOTAL)\s*[:\(]?\s*(?:MM[:\)]?)?\s*([\d.,]*)/); if (v) { const r = parseDim(v); if (r.valid) extracted.F5 = r.parsed; } }
        // Longitud Total → F6
        if (!extracted.F6) { const v = extractTL(/(?:LONGITUD TOTAL)\s*[:\(]?\s*(?:MM[:\)]?)?\s*([\d.,]*)/); if (v) { const r = parseDim(v); if (r.valid) extracted.F6 = r.parsed; } }
        // Via Anterior → trackWidth (nuevo campo)
        if (!extracted.trackWidth) { const v = extractTL(/(?:VIA ANTERIOR)\s*[:]?\s*(.*)/); if (v) extracted.trackWidth = v; }
        // Distancia Entre Ejes → M1
        if (!extracted.M1) { const v = extractTL(/(?:DISTANCIA\s+(?:ENTRE\s+)?EJES?)\s*[:\(]?\s*(?:MM[:\)]?)?\s*([\d.,]*)/); if (v) { const r = parseDim(v); if (r.valid) extracted.M1 = r.parsed; } }
        // N Cilindros / Cilindrada → P1 — formato "N/CC": tomar CC
        if (!extracted.P1) {
            const v = extractTL(/(?:N\.?\s*CILINDROS|CILINDRADA)\s*[:]?\s*([\d.\/,]*)/);
            if (v) { const parts = v.split("/"); const ccStr = parts.length > 1 ? parts[parts.length - 1].trim() : v; const n = parseNumberEU(ccStr); if (n !== null && n >= 50 && n <= 20000) extracted.P1 = n; }
        }
        // Potencia Fiscal → P2 — formato "CV/kW": tomar kW
        // NOTA: NO incluir \/ en el grupo capturador — "POTENCIA FISCAL/REAL" tiene "/" en el label
        // que contamina m[1] ("/" no vacío) e impide caer al fallback de línea siguiente
        if (!extracted.P2) {
            const v = extractTL(/(?:POTENCIA\s+(?:FISCAL|NETA|KW|MAXIMA))\s*[:]?\s*([\d.,\s]*)/);
            if (v) { const parts = v.split("/"); const kwStr = parts.length > 1 ? parts[parts.length - 1].trim() : v; const n = parseNumberEU(kwStr); if (n !== null && n >= 1 && n <= 2000) extracted.P2 = n; }
        }
        // Combustible desde label "COMBUSTIBLE" — ficha técnica antigua con etiqueta española
        if (!extracted.P3) {
            const v = extractTL(/(?:COMBUSTIBLE|TIPO\s+COMBUSTIBLE)\s*[:]?\s*(.*)/);
            if (v) extracted.P3 = v;
        }
        // Combustible desde tipo motor — formato "D/D5244T(10)": primera parte = código combustible
        // También maneja patrones multicombustible: "G/E/HEV", "D/E/PHEV", "D/GLP"
        if (!extracted.P3) {
            // Patrón clásico: letra(s)/CODIGO_MOTOR — ej: D/D5244T, G/B48A15M0
            const engineLine = linesNorm.find(l => /^[A-Z]{1,3}\/[A-Z]\d/.test(l));
            if (engineLine) {
                const parts = engineLine.split('/');
                if (/^[A-Z]\d/.test(parts[1]?.trim() ?? '')) {
                    // Segunda parte es código de motor → tomar solo la primera
                    extracted.P3 = parts[0].trim();
                } else {
                    // Puede ser multicombustible — tomar la línea entera
                    extracted.P3 = engineLine;
                }
            }
        }
        // Patrón multicombustible sin código de motor: "G/E/HEV", "D/E/PHEV", "D/GLP", etc.
        if (!extracted.P3) {
            const FUEL_TOK = /^(D|G|E|GLP|LPG|GNC|GNL|HEV|PHEV|MHEV|BEV|EV|REX|REEV|HYBRID|HIBRIDO|DIESEL|GASOLEO|GASOIL|GASOLINA|ELECTRICO|ELECTRIC|PETROL|GASOLINE|-{1,3})$/;
            const fuelLine = linesNorm.find(l => {
                const parts = l.split('/');
                return parts.length >= 2 && parts.every(p => FUEL_TOK.test(p.trim()));
            });
            if (fuelLine) extracted.P3 = fuelLine;
        }
        // N Serie → nuevo campo
        if (!extracted.serialNumber) { const v = extractTL(/(?:N\.?\s*SERIE)\s*[:]?\s*(.*)/); if (v) extracted.serialNumber = v; }
        // N Certificado → nuevo campo
        if (!extracted.certNumber) { const v = extractTL(/(?:N\.?\s*CERTIFICADO)\s*[:]?\s*(.*)/); if (v) extracted.certNumber = v; }
        // Clasificacion del Vehiculo → CV
        if (!extracted.CV) { const v = extractTL(/(?:CLASIFICACION\s+(?:DEL\s+)?VEHICULO)\s*[:]?\s*(.*)/); if (v) extracted.CV = v; }
        // Opciones Incluidas → homologationOptions
        if (!extracted.homologationOptions) { const v = extractTL(/(?:OPCIONES\s+INCLUIDAS(?:\s+EN\s+LA\s+HOMOLOGACION)?)\s*[:]?\s*(.*)/); if (v) extracted.homologationOptions = v; }
        // Volumen de Bodega
        if (!extracted.bodegaVolumen) { const v = extractTL(/(?:VOLUMEN\s+DE\s+BODEGA)\s*[:]?\s*(.*)/); if (v) extracted.bodegaVolumen = v; }
        // Observaciones
        if (!extracted.observations) { const v = extractTL(/(?:OBSERVACIONES)\s*[:]?\s*(.*)/); if (v) extracted.observations = v; }
    }

    // ── CELL-PAIR PASS (Ficha Técnica A4 / ITV regional) ──────────────────────
    const codeLinesCount = rawLines.filter(l => isItvCodeLine(l)).length;
    const isCellPairFormat = codeLinesCount > 8;

    if (isCellPairFormat) {
        extracted._isCellPairFormat = true;

        // Matrícula: label "MATRICULA" + siguiente valor alfanumérico
        if (!extracted.plate) {
            const matrIdx = rawLines.findIndex(l =>
                /MATR[IÍ]CULA/i.test(l.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))
            );
            if (matrIdx !== -1) {
                for (let k = matrIdx + 1; k <= matrIdx + 3; k++) {
                    const candidate = rawLines[k]?.trim() ?? "";
                    if (candidate && /^[A-Z0-9]{4,10}$/.test(candidate)) {
                        extracted.plate = candidate;
                        break;
                    }
                }
            }
        }

        // VIN standalone: 17 chars alfanuméricos (estándar VIN)
        if (!extracted.E) {
            const vinLine = rawLines.find(l => /^[A-HJ-NPR-Z0-9]{17}$/.test(l.trim()));
            if (vinLine) {
                extracted.E = vinLine.trim();
            }
        }

        // Validadores por tipo de campo
        const cpValidators: Record<string, (v: string) => { valid: boolean; parsed?: any }> = {
            "E":   valE,
            "D1":  valD1,
            "A1":  valD1,
            "M1":  valF2,
            "G":   valF2,
            "F1":  valF2,
            "F2":  valF2,
            "F3":  valF2,
            "F11": valGeneric,
            "F21": valGeneric,
            "F31": valGeneric,
            "F15": valGeneric,
            "F5":  valF2,
            "F6":  valF2,
            "J1":  valGeneric,
            "J2":  valGeneric,
            "J3":  valGeneric,
            "S1":  valS1,
            "P3":  valGeneric,
            "P1":  valP1,
            "P2":  valP2,
        };

        // Pares código → valor
        for (let i = 0; i < rawLines.length; i++) {
            const line = rawLines[i].trim();
            if (!isItvCodeLine(line)) continue;

            const fieldKey = CELL_PAIR_CODE_MAP[line];
            if (!fieldKey) continue;

            const nextLine = rawLines[i + 1]?.trim() ?? "";

            // Si la siguiente línea también es un código → celda vacía
            if (!nextLine || isItvKnownOrDottedCode(nextLine)) continue;

            if (!extracted[fieldKey]) {
                const cellVal = normalizeValue(nextLine);
                // Garbage check mínimo — no rechaza strings de 1 char (ej. "D" = diésel)
                if (!cellVal || /^[.,·—\-]+$/.test(cellVal)) continue;
                const validator = cpValidators[fieldKey] ?? valGeneric;
                const res = validator(cellVal);
                if (res.valid) {
                    extracted[fieldKey] = res.parsed !== undefined ? res.parsed : cellVal;
                }
            }
        }
    }
    // ── FIN CELL-PAIR PASS ──────────────────────────────────────────────────

    // Cleanups
    // En formato cell-pair (A4), A.1. es el fabricante = Marca → siempre sobrescribir D1
    if (extracted._isCellPairFormat && extracted.A1) extracted.D1 = extracted.A1;
    else if (!extracted.D1 && extracted.A1) extracted.D1 = extracted.A1;
    if (extracted.D1) extracted.D1 = extracted.D1.replace(/,\s*S\.A\.(?:S\.)?$/i, "").trim();

    // Remap A4 ITV → campos estándar de display
    // En A4: F.1./F.2./F.3. son masas de eje (kg), NO dimensiones.
    // Las dimensiones reales están en F.5. (anchura→F5) y F.6. (longitud→F6).
    // M.1. = MMA total → F2
    if (extracted._isCellPairFormat) {
        if (extracted.M1) extracted.F2 = extracted.M1; // MMA real: M.1.
    }
    if (!extracted.D3 && extracted.D2 && !extracted.D2.includes("VARIANTE")) extracted.D3 = extracted.D2;

    // Normalizar P3 (combustible) — parsea formato multicampo "M / D / -- / HEV / --"
    if (extracted.P3) {
        const p21Val = extracted.P21 !== undefined ? Number(extracted.P21) : undefined;
        const p1Val  = extracted.P1  !== undefined ? Number(extracted.P1)  : undefined;
        extracted.combustible = normalizeFuel(String(extracted.P3), p21Val, p1Val);
    }

    // CV híbrido — calcular cvTermico, cvTotal, esHibrido
    if (extracted.P2 !== undefined) {
        const kwElectrico = extracted.P21 !== undefined ? Number(extracted.P21) : undefined;
        const fuelType = extracted.combustible || '';
        const cvResult = calcularCV(Number(extracted.P2), kwElectrico, fuelType);
        extracted.cvTermico  = cvResult.cvTermico;
        extracted.cvTotal    = cvResult.cvTotal;
        extracted.esHibrido  = cvResult.esHibrido;
    }

    // Provide Debug Payload
    extracted._v2Debug = {
        invoked: true,
        bestSource,
        fullTextLen: bestText.length,
        linesCount: lines.length,
        sampleFirst500: compactText.substring(0, 500),
        foundTokens: {
            D1: extracted.D1 ? 1 : 0,
            D3: extracted.D3 ? 1 : 0,
            E: extracted.E ? 1 : 0,
            S1: extracted.S1 ? 1 : 0
        },
        attempts: debugAttempts
    };

    return extracted;
}
