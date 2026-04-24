/**
 * Normaliza caracteres Unicode problemáticos del OCR a su equivalente ASCII.
 * Previene artefactos como "BMW 320đ" → "BMW 320d".
 */
export function normalizeOcrText(text: string): string {
    if (!text) return text;
    return text
        .replace(/đ/g, 'd')    // U+0111
        .replace(/ð/g, 'd')    // U+00F0 eth
        .replace(/ı/g, 'i')    // U+0131 dotless i
        .replace(/ł/g, 'l')    // U+0142
        .replace(/ß/g, 'ss')   // eszett
        .replace(/ﬁ/g, 'fi')   // U+FB01
        .replace(/ﬂ/g, 'fl')   // U+FB02
        .replace(/ﬀ/g, 'ff')   // U+FB00
        .replace(/ﬃ/g, 'ffi')  // U+FB03
        .replace(/ﬄ/g, 'ffl')  // U+FB04
        .replace(/[\u201C\u201D\u201E]/g, '"')
        .replace(/[\u2018\u2019\u201A]/g, "'")
        .replace(/[\u2013\u2014\u2015]/g, '-')
        .normalize('NFC');
}

/**
 * Normaliza el campo P.3 (combustible) de la ficha técnica.
 * Devuelve código letra oficial DGT/BOE o null si no reconocido.
 *
 * Códigos: D=Diésel, G=Gasolina, E=Eléctrico BEV, X=Híbrido Gasolina no enchufable (HEV/MHEV),
 * Y=Híbrido Diésel no enchufable (HEV/MHEV), L=Gas (GLP/GNC/GNL), P=PHEV Gasolina,
 * R=PHEV Diésel, Z=REEV (Eléctrico+generador), B=Bio-Ethanol/Biodiesel, H=Hidrógeno.
 *
 * @param p3  - Campo P.3 raw del documento
 * @param p21 - kW motor eléctrico (P.2.1) — detecta MHEV cuando no viene explícito en P.3
 * @param p1  - Cilindrada (P.1) — por compatibilidad futura
 */
export function normalizeFuel(p3: string, p21?: number, p1?: number): 'D'|'G'|'E'|'X'|'Y'|'L'|'P'|'R'|'Z'|'B'|'H'|null {
    if (!p3) return null;

    // Paso 1: uppercase, trim, colapsar espacios, strip acentos
    let raw = p3.toUpperCase().trim().replace(/\s+/g, ' ')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // strip acentos: Í→I, Ú→U, etc.

    // Paso 2: strip prefijo M/ (MHEV indicator — M/D → D, M/G → G, M/ → vacío)
    raw = raw.replace(/^M\//, '');

    // Paso 3: split por /, filtrar guiones y vacíos
    const slots = raw.split('/')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !/^-+$/.test(s));

    if (slots.length === 0) return null;

    const has = (...terms: string[]) => slots.some(s => terms.includes(s));
    const hasIn = (...terms: string[]) => slots.some(s => terms.some(t => s.includes(t)));
    const isDiesel = () => has('D', 'DG', 'DE') || hasIn('DIESEL', 'GASOLEO', 'GASOIL');

    // 1. Range Extender / REEV
    if (has('REX', 'REEV') || hasIn('RANGE EXTENDER', 'ELECTRIC RANGE EXTENDER')) return 'Z';

    // 2. PHEV / Plug-in enchufable
    if (has('PHEV') || hasIn('PLUG-IN', 'PLUGIN', 'ENCHUFABLE', 'RECARGABLE', 'PLUG IN')) {
        return isDiesel() ? 'R' : 'P';
    }

    // 3. HEV / Híbrido no enchufable (explícito o patrón G/E, D/E)
    const isHybridExplicit = has('HEV') || hasIn('HYBRID', 'HIBRIDO');
    const isGE = has('G') && has('E');
    const isDE = has('D') && has('E');
    if (isHybridExplicit || isGE || isDE) {
        return isDiesel() ? 'Y' : 'X';
    }

    // 4. Gas (GLP / GNC / GNL)
    if (has('GLP', 'LPG', 'GNC', 'GNL') || hasIn('GAS LICUADO', 'AUTOGAS')) return 'L';

    // 5. Bio-combustible
    if (has('E85', 'BD', 'ET') || hasIn('ETHANOL', 'BIOETHANOL', 'BIODIESEL', 'BIOFUEL')) return 'B';

    // 6. Hidrógeno (solo keywords explícitas — 'H' solo es ruido OCR)
    if (hasIn('HIDROGENO', 'HYDROGEN', 'FUEL CELL', 'FCEV')) return 'H';

    // 7. Eléctrico puro
    if (has('E', 'BEV', 'EV') || hasIn('ELECTRICO', 'ELECTRIC')) return 'E';

    // 8. Diésel base
    if (isDiesel()) return (p21 !== undefined && p21 > 0) ? 'Y' : 'D';

    // 9. Gasolina base
    if (has('G', 'MG', 'GE') || hasIn('GASOLINA', 'PETROL', 'ESSENCE', 'GASOLINE')) {
        return (p21 !== undefined && p21 > 0) ? 'X' : 'G';
    }

    // 10. No reconocido
    return null;
}

/**
 * Normaliza el campo combustible del CSV del catálogo.
 * El CSV ya usa códigos letra directamente — solo limpiar whitespace.
 */
export function normalizeFuelForCatalog(raw: string): string | null {
    return raw?.trim().toUpperCase() ?? null;
}

/**
 * Calcula CV térmico y total para vehículos híbridos.
 * Acepta código letra DGT: X/Y = HEV/MHEV no enchufable (no suma eléctrico).
 * P/R = PHEV enchufable: CV total = (kW térmico + kW eléctrico) × 1.35962.
 */
export function calcularCV(kw: number, kwElectrico: number | undefined, fuelCode: string): {
    cvTermico: number;
    cvTotal: number;
    esHibrido: boolean;
} {
    const cvTermico = Math.round(kw * 1.35962);
    const isHybrid  = ['X', 'Y', 'P', 'R', 'Z'].includes(fuelCode);
    const sumElec   = ['P', 'R'].includes(fuelCode); // PHEV enchufable: suma kW eléctrico

    if (!isHybrid || !kwElectrico || !sumElec) {
        return { cvTermico, cvTotal: cvTermico, esHibrido: isHybrid };
    }

    const cvTotal = Math.round((kw + kwElectrico) * 1.35962);
    return { cvTermico, cvTotal, esHibrido: true };
}

export const normalizeValue = (str: string) => {
    if (!str) return "";
    return normalizeOcrText(str).replace(/^[.,·—\-\s]+|[.,·—\-\s]+$/g, "").replace(/\s+/g, " ").trim();
};

export const isGarbage = (str: string) => {
    if (!str) return true;
    const clean = str.trim();
    if (clean === "" || clean === "." || clean === "—" || clean === "NO DICT") return true;
    if (/^[.,·—\-]+$/.test(clean)) return true;
    if (clean.length < 2 && !/^\d$/.test(clean)) return true;
    return false;
};

export const parseNumberEU = (str: string) => {
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

export const sanitizeVIN = (v: string): { valid: boolean; parsed: string; warning?: string } => {
    const clean = v.replace(/\s+/g, "").toUpperCase();
    if (/^[A-HJ-NPR-Z0-9]{17}$/.test(clean)) return { valid: true, parsed: clean };
    return { valid: true, parsed: clean, warning: `VIN sospechoso: ${clean}` };
};
