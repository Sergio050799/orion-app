export type DocumentType = "FICHA_TECNICA" | "PERMISO_V1" | "PERMISO_V2" | "CARNET_CONDUCIR" | "UNKNOWN";

export function classifyDocument(analyzeResult: any): { type: DocumentType; confidence: number; debugScore: any; evidence?: string[] } {
    let bestText = "";

    // Aggregate text
    if (analyzeResult?.content) {
        bestText = analyzeResult.content;
    } else if (analyzeResult?.pages && analyzeResult.pages.length > 0) {
        const allLines = analyzeResult.pages.flatMap((p: any) => p.lines?.map((l: any) => l.content) || []);
        bestText = allLines.join(" \n ");
    }

    const textNormalized = bestText.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");

    const evidence: string[] = [];
    let structuralPermisoMarkerHits = 0;

    const isPermisoEnabled = process.env.ENABLE_PERMISO_PIPELINE === "true";

    // Structural Permiso markers (OCR-robust): if phrases fail, classify by field-code shape.
    if (isPermisoEnabled) {
        const structuralPermisoMarkers = [
            /\bC\s*\.?\s*1\s*\.?\s*1\b/,
            /\bC\s*\.?\s*1\s*\.?\s*2\b/,
            /\bD\s*\.?\s*1\b/,
            /\bD\s*\.?\s*3\b/,
            /\bD\s*\.?\s*4\b/,
            /\bP\s*\.?\s*1\b/,
            /\bP\s*\.?\s*2\b/,
            /\bS\s*\.?\s*1\b/
        ];
        structuralPermisoMarkerHits = structuralPermisoMarkers.filter((rx) => rx.test(textNormalized)).length;
        if (structuralPermisoMarkerHits > 0) {
            evidence.push(`PERMISO_STRUCTURAL_MARKERS:${structuralPermisoMarkerHits}`);
        }
    }

    // --- 0. EARLY RETURN — Carnet de Conducir ---
    if (textNormalized.includes("PERMISO DE CONDUCCION")) {
        evidence.push("EXACT_TITLE_CARNET");
        return { type: "CARNET_CONDUCIR", confidence: 1, debugScore: { reason: "Exact title match" }, evidence };
    }

    // --- 1. EARLY RETURN FOR V2 ---
    if (isPermisoEnabled && textNormalized.includes("AUTORIZACION PROVISIONAL DE CIRCULACION")) {
        evidence.push("EXACT_TITLE_V2");
        return { type: "PERMISO_V2", confidence: 1, debugScore: { reason: "Exact title match" }, evidence };
    }

    // Check Strong V2 indicators
    if (isPermisoEnabled) {
        let v2IndicatorsEarly = 0;
        const v2StrongKeywordsEarly = ["MATRICULA", "BASTIDOR", "TITULAR", "JEFATURA", "VALIDO HASTA", "RENTING", "SERVICIO"];
        for (const kw of v2StrongKeywordsEarly) {
            if (textNormalized.includes(kw)) {
                v2IndicatorsEarly++;
            }
        }
        const hasFichaTecnicaSignal = textNormalized.includes("TARJETA DE INSPECCION TECNICA") ||
            textNormalized.includes("TARJETA ITV") ||
            textNormalized.includes("FICHA TECNICA");
        if (v2IndicatorsEarly >= 3 && !hasFichaTecnicaSignal) {
            evidence.push(`STRONG_V2_EARLY`);
            return { type: "PERMISO_V2", confidence: 1, debugScore: { reason: "Strong V2 match >= 3 indicators" }, evidence };
        }
    }

    const scores = {
        PERMISO_V1: 0,
        PERMISO_V2: 0,
        FICHA_TECNICA: 0
    };

    // --- FICHA EXCLUSIVE CODE DETECTION (structural, OCR-robust) ---
    // These codes appear ONLY in ficha técnica, never in permisos
    const fichaExclusiveCodes = [
        /\bCL\b/, /\bCI\b/, /\bCV\b/,
        /\bF\.4\b/, /\bF\.5\b/, /\bF\.6\b/,
        /\bM\.1\b/, /\bM\.4\b/, /\bL\.1\b/,
        /\bJ\.1\b/, /\bJ\.2\b/
    ];
    let fichaExclusiveHits = 0;
    for (const rx of fichaExclusiveCodes) {
        if (rx.test(textNormalized)) fichaExclusiveHits++;
    }
    if (fichaExclusiveHits > 0) {
        evidence.push(`FICHA_EXCLUSIVE_CODES:${fichaExclusiveHits}`);
    }

    if (isPermisoEnabled) {
        // --- RULES FOR PERMISO V2 ---
        let v2Indicators = 0;
        const v2StrongKeywords = ["MATRICULA", "BASTIDOR", "TITULAR", "JEFATURA", "DATOS TECNICOS", "DATOS GENERALES"];
        for (const kw of v2StrongKeywords) {
            if (textNormalized.includes(kw)) {
                v2Indicators++;
                evidence.push(`V2_KW:${kw}`);
            }
        }
        if (v2Indicators >= 3) {
            scores.PERMISO_V2 += 800;
        }

        if (textNormalized.includes("DIRECCION GENERAL DE TRAFICO") && textNormalized.includes("PROVISIONAL")) scores.PERMISO_V2 += 500;

        const v2Keywords = ["SEGURO OBLIGATORIO", "RENTING", "JEFATURA", "TITULAR", "MARCA:", "MODELO:", "BASTIDOR:"];
        for (const kw of v2Keywords) {
            if (textNormalized.includes(kw.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))) scores.PERMISO_V2 += 50;
        }

        // --- RULES FOR PERMISO V1 ---
        // E, G, I, J are single-letter codes shared with ficha técnica — excluded when ficha exclusive signals present
        const v1Codes = [
            /\bC\.1\.1\b/, /\bC\.1\.2\b/, /\bC\.1\.3\b/, /\bC\.4\b/,
            /\bD\.1\b/, /\bD\.2\b/, /\bD\.3\b/, /\bD\.4\b/,
            /\bF\.1\b/, /\bP\.1\b/, /\bP\.2\b/, /\bP\.3\b/, /\bQ\b/, /\bS\.1\b/, /\bS\.2\b/,
            ...(fichaExclusiveHits === 0 ? [/\bE\b/, /\bG\b/, /\bI\b/, /\bJ\b/] : [])
        ];
        let v1CodeHits = 0;
        let matchedV1 = [];
        for (const code of v1Codes) {
            if (code.test(textNormalized)) {
                v1CodeHits++;
                matchedV1.push(code.source.replace(/\\b/g, ''));
            }
        }

        // A1 - Strong V1 rule
        if (v1CodeHits >= 4) {
            scores.PERMISO_V1 += 1000;
            evidence.push(`STRONG_V1_CODES: ${matchedV1.join(',')}`);
        }

        if (textNormalized.includes("PERMISO DE CIRCULACION")) scores.PERMISO_V1 += 300;
        if (textNormalized.includes("COMUNIDAD EUROPEA")) scores.PERMISO_V1 += 100;
        if (textNormalized.includes("REINO DE ESPAÑA") || textNormalized.includes("REINO DE ESPANA")) scores.PERMISO_V1 += 100;
        if (textNormalized.includes("MINISTERIO DEL INTERIOR")) scores.PERMISO_V1 += 50;

        if (v1CodeHits >= 5) {
            scores.PERMISO_V1 += (v1CodeHits * 40);
            evidence.push(`V1_CODES: ${matchedV1.join(',')}`);
        } else {
            scores.PERMISO_V1 += (v1CodeHits * 2);
        }
    }

    // --- RULES FOR FICHA TECNICA ---
    if (textNormalized.includes("TARJETA DE INSPECCION TECNICA")) scores.FICHA_TECNICA += 1500;
    if (textNormalized.includes("TARJETA ITV")) scores.FICHA_TECNICA += 1500;
    if (textNormalized.includes("FICHA TECNICA")) scores.FICHA_TECNICA += 1500;
    if (textNormalized.includes("INSPECCION TECNICA")) scores.FICHA_TECNICA += 1000;
    if (textNormalized.includes("INSPECCION")) scores.FICHA_TECNICA += 150;
    if (textNormalized.includes("CONTRASEÑA DE HOMOLOGACION")) scores.FICHA_TECNICA += 500;
    if (textNormalized.includes("CARACTERISTICAS TECNICAS")) scores.FICHA_TECNICA += 300;
    if (textNormalized.includes("MINISTERIO DE INDUSTRIA")) scores.FICHA_TECNICA += 200;
    if (textNormalized.includes("ITV")) {
        scores.FICHA_TECNICA += 100;
        if (isPermisoEnabled) {
            scores.PERMISO_V1 -= 50;
            scores.PERMISO_V2 -= 50;
        }
    }

    const ftKeywords = ["NEUMATICOS", "OPCIONES", "TARA", "MMA", "MTMA", "MASA MAXIMA", "DISTANCIA ENTRE EJES", "VIA ANTERIOR", "ALTURA TOTAL", "ANCHURA TOTAL", "LONGITUD TOTAL", "MASA EN ORDEN DE MARCHA", "DENOMINACION COMERCIAL", "VOLUMEN DE BODEGA", "OPCIONES INCLUIDAS EN LA HOMOLOGACION"];
    for (const kw of ftKeywords) {
        if (textNormalized.includes(kw)) {
            scores.FICHA_TECNICA += 150;
            if (isPermisoEnabled) {
                scores.PERMISO_V1 -= 100;
                scores.PERMISO_V2 -= 100;
            }
        }
    }

    if (isPermisoEnabled) {
        if (textNormalized.includes("PERMISO DE CIRCULACION")) {
            scores.FICHA_TECNICA -= 200;
        }
    }

    // STRICT RULE: If it explicitly says Ficha Tecnica or Tarjeta ITV, it cannot be a Permiso
    if (textNormalized.includes("TARJETA DE INSPECCION TECNICA") || textNormalized.includes("FICHA TECNICA")) {
        scores.PERMISO_V1 -= 1000;
        scores.PERMISO_V2 -= 1000;
    }

    // --- BLOQUE A: FICHA EXCLUSIVE CODE SCORING ---
    // Structural scoring based on codes that only appear in ficha técnica
    if (fichaExclusiveHits >= 3) {
        scores.FICHA_TECNICA += 1200;
        evidence.push(`FICHA_EXCLUSIVE_STRONG:${fichaExclusiveHits}`);
    } else if (fichaExclusiveHits >= 2) {
        scores.FICHA_TECNICA += 600;
        evidence.push(`FICHA_EXCLUSIVE_MEDIUM:${fichaExclusiveHits}`);
    } else if (fichaExclusiveHits >= 1) {
        scores.FICHA_TECNICA += 200;
    }
    if (fichaExclusiveHits > 0) {
        scores.PERMISO_V1 -= (fichaExclusiveHits * 150);
    }

    // Determine winner based on strict margins and thresholds (FASE A)
    let winner: DocumentType = "UNKNOWN";
    const scoreFicha = scores.FICHA_TECNICA;
    const scorePermiso = isPermisoEnabled ? Math.max(scores.PERMISO_V1, scores.PERMISO_V2) : -1000;
    const THRESHOLD = 150;
    const MARGIN = 100;

    let maxScore = Math.max(scoreFicha, scorePermiso);

    if (isPermisoEnabled && scorePermiso >= THRESHOLD && scorePermiso > scoreFicha + MARGIN) {
        winner = scores.PERMISO_V1 >= scores.PERMISO_V2 ? "PERMISO_V1" : "PERMISO_V2";
    } else if (scoreFicha >= THRESHOLD && scoreFicha > scorePermiso + MARGIN) {
        winner = "FICHA_TECNICA";
    }

    // A3 - STRICT ROUTING: If we did not find enough evidence for either, force UNKNOWN
    if (winner === "UNKNOWN") {
        // Structural fallback: avoid UNKNOWN for valid permiso OCRs that miss phrase anchors.
        if (isPermisoEnabled && structuralPermisoMarkerHits >= 4) {
            evidence.push("STRUCTURAL_FALLBACK:PERMISO_V1");
            return { type: "PERMISO_V1", confidence: 0.85, debugScore: scores, evidence };
        }
        if (isPermisoEnabled && structuralPermisoMarkerHits > 0) {
            evidence.push("STRUCTURAL_FALLBACK:PERMISO_V2");
            return { type: "PERMISO_V2", confidence: 0.65, debugScore: scores, evidence };
        }
        evidence.push(`NO_WINNER_FORCED_UNKNOWN`);
        return { type: "UNKNOWN", confidence: 0, debugScore: scores, evidence };
    }

    evidence.push(`WINNER:${winner}`);

    return {
        type: winner,
        confidence: maxScore > 0 ? Math.min(1, maxScore / 1000) : 0,
        debugScore: scores,
        evidence
    };
}
