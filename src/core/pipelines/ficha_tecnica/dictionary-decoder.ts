// src/core/data/dictionary-decoder.ts
import itvMaster from '../../data/itv_master_dictionary.v2.json';

/**
 * Maps ITV and BOE codes to human-readable Spanish text based on their specific field.
 * This acts as an adapter over normative dictionaries for the UI layer.
 */

const dictionaries = (itvMaster as any).dictionaries;

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

    const construccionLabel = dictionaries.clasificacion_construccion?.[construccionCode];
    const usoLabel = dictionaries.clasificacion_uso?.[usoCode];

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

    if (code === "P.3") {
        const byLetter = dictionaries.combustible_codigo_letra?.[cleanValue];
        if (byLetter) return byLetter;
        const byRaw = dictionaries.tipo_combustible?.[cleanValue];
        if (byRaw) return byRaw;
    }

    if (code === "J") {
        const cat = dictionaries.categorias_homologacion_ue?.[cleanValue];
        if (cat) return cat;
    }

    if (code === "J.1") {
        const body = dictionaries.carrocerias?.[cleanValue];
        if (body) return body;
    }

    return "No disponible (pendiente de diccionario)";
}
