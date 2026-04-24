// src/core/data/dictionary-decoder.ts

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
        "PHEV": "Híbrido Enchufable"
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
        "L3e": "Motocicletas de dos ruedas sin sidecar."
    },
    "bodyType": {
        "AC": "Familiar (Station Wagon / Estate)",
        "AB": "Vehículo con portón trasero (Hatchback)",
        "AA": "Berlina (Sedán)",
        "AD": "Coupé",
        "AE": "Cabriolet (Descapotable)",
        "AF": "Vehículo Multiuso (Monovolumen / SUV ligero)"
    }
};

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
    const cleanValue = strValue.trim().toUpperCase();

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
