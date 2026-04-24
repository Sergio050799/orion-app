// src/core/data/dictionary-decoder.ts
import itvMaster from '../../data/itv_master_dictionary.v2.json';

/**
 * Maps ITV and BOE codes to human-readable Spanish text based on their specific field.
 * This acts as an adapter over normative dictionaries for the UI layer.
 */

// Basic hardcoded mappings extracted from normative assumptions as per requirement.
// In a full production scenario, this might import JSON dictionaries directly.
const DICTIONARY_MAP: Record<string, Record<string, string>> = {
    "fuel": {
        "D": "Diésel",
        "G": "Gasolina",
        "E": "Eléctrico",
        "GLP": "Gas Licuado del Petróleo (GLP)",
        "GNC": "Gas Natural Comprimido",
        "H": "Híbrido (HEV)",
        "PHEV": "Híbrido Enchufable",
        "M-D": "Mild-Hybrid Diésel",
        "M-G": "Mild-Hybrid Gasolina",
        "M/D": "Mild-Hybrid Diésel",
        "M/G": "Mild-Hybrid Gasolina",
        "HEV": "Híbrido (HEV)",
        "MHEV": "Mild-Hybrid"
    },
    "vehicleCategory": {
        "M1": "Vehículos de motor destinados al transporte de personas y que tengan, por lo menos, cuatro ruedas. Máximo 8 plazas más conductor.",
        "M2": "Vehículos de motor destinados al transporte de personas. Más de 8 plazas, masa máxima no superior a 5 t.",
        "M3": "Vehículos de motor destinados al transporte de personas. Más de 8 plazas, masa máxima superior a 5 t.",
        "N1": "Vehículos de motor destinados al transporte de mercancías. Masa máxima autorizada no superior a 3,5 t.",
        "N2": "Vehículos de motor destinados al transporte de mercancías. Masa máxima autorizada superior a 3,5 t pero no supera 12 t.",
        "N3": "Vehículos de motor destinados al transporte de mercancías. Masa máxima autorizada superior a 12 t.",
        "O1": "Remolques y semirremolques. Masa máxima no superior a 0,75 t.",
        "O2": "Remolques y semirremolques. Masa máxima superior a 0,75 t pero inferior o igual a 3,5 t.",
        "O3": "Remolques y semirremolques. Masa máxima superior a 3,5 t pero inferior o igual a 10 t.",
        "O4": "Remolques y semirremolques. Masa máxima superior a 10 t.",
        "L1e": "Ciclomotores de dos ruedas.",
        "L3e": "Motocicletas de dos ruedas sin sidecar.",
        "M1G": "Vehículo de pasajeros todoterreno (M1 off-road).",
        "M2G": "Vehículo de pasajeros +8 plazas todoterreno (M2 off-road).",
        "M3G": "Vehículo de pasajeros +8 plazas todoterreno >5t (M3 off-road).",
        "N1G": "Vehículo de mercancías ≤3,5t todoterreno (N1 off-road).",
        "N2G": "Vehículo de mercancías 3,5–12t todoterreno (N2 off-road).",
        "N3G": "Vehículo de mercancías >12t todoterreno (N3 off-road)."
    },
    "bodyType": {
        // M1 — Vehículos de pasajeros
        "AA": "Berlina",
        "AB": "Berlina con portón trasero",
        "AC": "Familiar",
        "AD": "Cupé",
        "AE": "Descapotable",
        "AF": "Multiuso",
        "AG": "Camioneta familiar",
        // M2/M3 — Autobuses
        "CA": "Vehículo de un solo piso",
        "CB": "Vehículo de dos pisos",
        "CC": "Vehículo articulado de un solo piso",
        "CD": "Vehículo articulado de dos pisos",
        "CE": "Vehículo de suelo bajo de un solo piso",
        "CF": "Vehículo de suelo bajo de dos pisos",
        "CG": "Vehículo articulado de suelo bajo de un solo piso",
        "CH": "Vehículo articulado de suelo bajo de dos pisos",
        "CI": "Vehículo de un solo piso de techo abierto",
        "CJ": "Vehículo de dos pisos de techo abierto",
        "CX": "Bastidor de autobús",
        // N1/N2/N3 — Vehículos de motor para mercancías
        "BA": "Camión",
        "BB": "Furgoneta",
        "BC": "Tractocamión",
        "BD": "Vehículo tractor de carretera",
        "BE": "Furgoneta de plataforma descubierta",
        "BX": "Bastidor con cabina o bastidor con cubierta",
        // O — Remolques
        "DA": "Semirremolque",
        "DB": "Remolque con barra de tracción",
        "DC": "Remolque de eje central",
        "DE": "Remolque con barra de tracción rígida"
    }
};

export interface CLDecoded {
    code: string;
    construccion: { code: string; label: string };
    uso: { code: string; label: string };
    business_label: string;
}

/**
 * Decodes C.L (Clasificación del Vehículo) specifically, as it is a 4-digit composite code.
 * Digits 0-1: Construcción
 * Digits 2-3: Uso
 */
export function decodeCL(value: unknown): CLDecoded | null {
    if (value === null || value === undefined) return null;
    const cl = String(value).trim().replace(/\s+/g, "");

    // Fallback if not exactly 4 digits or not purely numeric
    if (cl.length !== 4 || isNaN(Number(cl))) {
        return null;
    }

    const construccionCode = cl.slice(0, 2);
    const usoCode = cl.slice(2, 4);

    const construccionLabel = (itvMaster.dictionaries as any).clasificacion_construccion?.[construccionCode];
    const usoLabel = (itvMaster.dictionaries as any).clasificacion_uso?.[usoCode];

    if (!construccionLabel) {
        // According to instructions: If construccion does not exist -> fallback "Sin diccionario"
        return null;
    }

    return {
        code: cl,
        construccion: { code: construccionCode, label: construccionLabel },
        uso: { code: usoCode, label: usoLabel || "Sin especificar" },
        business_label: construccionLabel
    };
}

/**
 * Decodes a raw DATO value based on its CODIGO field context.
 * @param code The technical code (e.g., "P.3", "J", "J.1")
 * @param value The raw value extracted (e.g., "D", "M1", "AC")
 * @returns The decoded human-readable string, or a fallback message.
 */
export function decodeFieldValue(code: string, value: unknown): string {
    if (value === null || value === undefined) return "Dato vacío";

    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch {
            return "No disponible";
        }
    }

    const strValue = String(value);
    // Sanitizar: quitar asteriscos/notas de pie y puntuación final que el OCR añade
    // Ejemplos: "M-D *" → "M-D"  |  "D ." → "D"  |  "M-D ," → "M-D"
    const sanitized = strValue
        .replace(/\s*\*.*$/, "")       // asterisco y todo lo que sigue
        .replace(/[\s.,·;]+$/, "")     // puntuación final suelta
        .trim();
    const cleanValue = sanitized.toUpperCase();

    if (!cleanValue) return "Dato vacío";

    // Numeric guard: if cleanValue is numeric, return original as string
    if (!isNaN(Number(cleanValue))) {
        return strValue;
    }

    // Mapping field codes to our internal dictionary keys
    let dictKey = null;
    if (code === "P.3") dictKey = "fuel";
    if (code === "J") dictKey = "vehicleCategory";
    if (code === "J.1") dictKey = "bodyType";

    if (dictKey && DICTIONARY_MAP[dictKey]) {
        const meaning = DICTIONARY_MAP[dictKey][cleanValue];
        if (meaning) return meaning;
    }

    // Default fallback for fields with no specific mapping or unknown values
    return "No disponible (pendiente de diccionario)";
}
