export interface FieldValue<T> {
    value: T | null;
    confidence: number;
    status_color: "verde" | "naranja" | "rojo";
    warnings?: string[];
    source?: "ocr" | "manual";
    editedAt?: number;
    previousValue?: T | null;
}

export interface PermissionCirculationRecord {
    identification: {
        license_plate: FieldValue<string>;
        vin: FieldValue<string>;
        first_registration_date: FieldValue<string>; // B
        registration_date: FieldValue<string>;     // I
        issue_date: FieldValue<string>;            // I.2
        validity_until: FieldValue<string>;
        issuing_authority: FieldValue<string>;
        ref?: FieldValue<string>;                  // Referencia
        nive?: FieldValue<string>;                 // Hash electrónico (NO es el bastidor)
    };
    holder: {
        full_name: FieldValue<string>;
        holder_id?: FieldValue<string>;
        address?: FieldValue<string>;
        city?: FieldValue<string>;
        province?: FieldValue<string>;
    };
    vehicleCommercial: {
        brand: FieldValue<string>;
        model: FieldValue<string>;
        type?: FieldValue<string>;
        variant?: FieldValue<string>;
        version?: FieldValue<string>;
        commercial_name?: FieldValue<string>;
        classification?: FieldValue<string>;
        service?: FieldValue<string>;
        color?: FieldValue<string>;
        origin?: FieldValue<string>;
        renting?: FieldValue<string>;
        procedencia?: FieldValue<string>;
        no_cvf?: FieldValue<number>;
        marca_base?: FieldValue<string>;
    };
    vehicleTechnical: {
        fuel_raw: FieldValue<string>;
        engine_displacement_cc: FieldValue<number>;
        power_kw: FieldValue<number>;
        power_cv?: FieldValue<number>;
        power_raw?: FieldValue<number | string>;
        power_unit_raw?: FieldValue<string>;
        seats: FieldValue<number>;
        standing_seats?: FieldValue<number>;
        max_mass_kg?: FieldValue<number>;
        tech_max_mass_kg?: FieldValue<number>;
        mass_in_service_kg?: FieldValue<number>;
        max_mass_loaded_kg?: FieldValue<number>;
        power_to_weight_ratio?: FieldValue<number>;
        co2_g_km?: FieldValue<number>;
        homologation_code?: FieldValue<string>;
        tipo_base?: FieldValue<string>;
        variante_base?: FieldValue<string>;
        version_base?: FieldValue<string>;
        contrasena_homologacion_base?: FieldValue<string>;
        mom_base?: FieldValue<string>;
    };
    next_itv?: FieldValue<string>;
    observations?: FieldValue<string>;
    meta: {
        document_version: "V1" | "V2";
        detected_type: string;
        raw_observations?: string[];
        warnings: string[];
        _debugExtract?: Array<{
            key: string;
            value: string;
            sourceLine: string;
            method: string;
        }>;
        debugSources?: {
            B?: { candidates: string[], chosen?: string, regex: string, line?: string, validated: boolean, reason?: string };
            D4?: { candidates: string[], chosen?: string, regex: string, line?: string, validated: boolean, reason?: string };
        };
    };
}

export function createEmptyFieldValue<T>(): FieldValue<T> {
    return {
        value: null,
        confidence: 0,
        status_color: "rojo",
        source: "ocr"
    };
}
