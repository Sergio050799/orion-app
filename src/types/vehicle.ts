export enum FuelType {
    Diesel = "D",
    Gasoline = "G",
    Electric = "E",
    Hybrid = "HEV",
    PlugInHybrid = "PHEV"
}

export interface TechnicalField<T = string | number> {
    value: T;
    confidence: number; // 0-1
    source: "ocr" | "user" | "derived";
    isCritical?: boolean;
    notes?: string;
    originalValue?: string;
}

export interface ValidatedVehicleDTO {
    id: string;
    plate: string;

    // Block A: Legal & Structural
    vin: TechnicalField<string>;              // E
    category: TechnicalField<string>;         // CL
    vehicleCategory: TechnicalField<string>;  // J
    bodyType: TechnicalField<string>;         // J.1
    make: TechnicalField<string>;             // D.1
    model: TechnicalField<string>;            // D.3
    variant: TechnicalField<string>;          // D.2

    // Block B: Powertrain
    fuel: TechnicalField<FuelType>;           // P.3
    displacement: TechnicalField<number>;     // P.1
    powerKw: TechnicalField<number>;          // P.2
    powerCv: number;                          // Derived
    emissionLevel: TechnicalField<string>;    // V.9
    engineCode: TechnicalField<string>;       // P.5
    co2: TechnicalField<number>;              // V.7

    // Block C: Masses & Dimensions
    mma: TechnicalField<number>;              // F.2
    mom: TechnicalField<number>;              // G
    mtma_mma_axle: TechnicalField<number>;    // F.6
    mtma_mma_total: TechnicalField<number>;   // F.5
    length: TechnicalField<number>;
    width: TechnicalField<number>;
    height: TechnicalField<number>;

    // Others
    seats: TechnicalField<number>;            // S.1
    tires: TechnicalField<string>;            // L.2
    registrationDate: TechnicalField<string>; // I

    // System
    processingStatus: "processing" | "completed" | "failed";
    globalConfidence: number;
    alerts: string[];
    isLockedBy?: string;
    humanSummary?: string;
}
