export interface CatalogoVehiculo {
    id_veh: string;
    marca: string;
    modelo: string;
    version: string;
    id_clase: string;
    combustible: string;
    num_puertas: number;
    fec_ini_comerc: string;
    fec_fin_comerc: string;
    num_plazas_min: number;
    num_plazas_max: number;
    tara: number;
    kw: number;
    cv: number; // kw * 1.36, redondeado
    cilindrada: number; // cc — columna "motorizacion" (índice 6)
    pff: number;        // Precio de fábrica (índice 11)
    pvp: number;        // Precio de venta al público (índice 12)
    pma?: number;       // Peso Máximo Autorizado (índice 13)
}

export interface SearchParams {
    marca?: string;
    modelo?: string;
    kw?: number;
    kwElectrico?: number; // kW motor eléctrico (P.2.1) — para normalizar combustible híbrido
    cilindrada?: number;  // cc
    plazas?: number;
    tara?: number;        // kg
    puertas?: number;
    combustible?: string;
    anyo?: number;
    acabado?: string;     // versión/acabado del vehículo
    scoreDebug?: boolean; // si true, incluye scoreDetail en los candidatos
}

export interface ScoreDetail {
    marca: number;
    modelo: number;
    acabado: number;
    kw: number;
    cilindrada: number;
    plazas: number;
    tara: number;
    combustible: number;
    puertas: number;
    anyo: number;
    maxEfectivo: number;
}

export interface CatalogoCandidato extends CatalogoVehiculo {
    score: number;
    scoreDetail?: ScoreDetail;
}

export interface CatalogoDataSource {
    search(params: SearchParams): Promise<CatalogoCandidato[]>;
    getById(id_veh: string): Promise<CatalogoVehiculo | null>;
}
