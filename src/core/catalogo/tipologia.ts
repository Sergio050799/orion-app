// Tipología de vehículo a partir del catálogo mensual (columna id_clase + PMA).
//
// La regla vive por CLASE, no por vehículo: al subir un catálogo nuevo cada vehículo cae solo en su tipo.
// Si aparece una clase que no está en la tabla, el vehículo queda en «Sin clasificar» (sigue visible con el
// Tipo en «Todos») y el cargador avisa en el registro para que se añada una línea a CLASE_TIPO.
//
// Categorías (decididas por suscripción):
//   1.ª: turismo, todoterreno, furgoneta y furgón (hasta 3.500 kg de PMA).
//   2.ª: más de 3.500 kg de PMA (camión, cabeza tractora, remolque), vehículos industriales / especiales y
//        minibús / autocar.
//   3.ª: solo motos.
// El motor de primas (src/core/flotas/primas.ts) hoy solo conoce las categorías 1 y 2.

export type TipoKey =
    | 'turismo' | 'furgoneta' | 'furgon' | 'camion' | 'cabeza_tractora'
    | 'remolque' | 'industrial' | 'minibus_autocar' | 'moto' | 'sin_clasificar';

export interface TipoInfo {
    key: TipoKey;
    label: string;
    /** 1 = primera categoría, 2 = segunda, 3 = tercera (solo motos), 0 = sin categoría asignada */
    categoria: 0 | 1 | 2 | 3;
    /** false = tipo que MMT no admite en flotas */
    admitido: boolean;
}

export const TIPOS: TipoInfo[] = [
    { key: 'turismo',         label: 'Turismo / todoterreno',    categoria: 1, admitido: true },
    { key: 'furgoneta',       label: 'Furgoneta',                categoria: 1, admitido: true },
    { key: 'furgon',          label: 'Furgón',                   categoria: 1, admitido: true },
    { key: 'camion',          label: 'Camión rígido',            categoria: 2, admitido: true },
    { key: 'cabeza_tractora', label: 'Cabeza tractora',          categoria: 2, admitido: true },
    { key: 'remolque',        label: 'Remolque / semirremolque', categoria: 2, admitido: true },
    { key: 'industrial',      label: 'Industrial / especial',    categoria: 2, admitido: true },
    { key: 'minibus_autocar', label: 'Minibús / autocar',        categoria: 2, admitido: false },
    { key: 'moto',            label: 'Moto',                     categoria: 3, admitido: true },
    { key: 'sin_clasificar',  label: 'Sin clasificar',           categoria: 0, admitido: true },
];

export const TIPO_INFO: Record<TipoKey, TipoInfo> =
    Object.fromEntries(TIPOS.map(t => [t.key, t])) as Record<TipoKey, TipoInfo>;

/** Límite de PMA (kg) a partir del cual una furgoneta o un furgón pasa a segunda categoría. */
export const LIMITE_PMA_KG = 3500;

/**
 * id_clase del catálogo → tipo por defecto.
 * Verificado con CSV real 142.839 filas (27/10/2026).
 * Lo que no está aquí ni en CLASE_PREFIJO cae en sin_clasificar y el loader avisa en el log.
 */
export const CLASE_TIPO: Record<string, TipoKey> = {
    // Turismo / todoterreno (categoría 1)
    PO: 'turismo', BE: 'turismo', FA: 'turismo', TT: 'turismo',
    CO: 'turismo', CA: 'turismo', TA: 'turismo',
    CDTUR: 'turismo', CDTT: 'turismo', MV: 'turismo',

    // Furgoneta (categoría 1; PMA > 3.500 kg → camion vía clasificar())
    FUR: 'furgoneta',
    CAMILIGERO: 'furgoneta', // MAN TGE y similares; 99% PMA ≤ 3.500 kg
    PK: 'furgoneta',         // Pickup (CHEVROLET RAM…); los >3.500 kg pasan a camión vía clasificar()

    // Furgón (categoría 1; PMA > 3.500 kg → camion vía clasificar())
    FURH: 'furgon',          // FURH: 0 filas >3.500 kg en el CSV real (verificado)

    // Camión rígido (categoría 2)
    FURPES: 'camion', CAMI: 'camion',
    AUTOCARAVANA: 'camion',  // Autocaravana (categoría 2; decisión Sergio 27/10/2026)

    // Cabeza tractora (categoría 2)
    TCAMI: 'cabeza_tractora',

    // Remolque / semirremolque (categoría 2)
    SREMOL: 'remolque', CARAVANA: 'remolque',

    // Industrial / especial (categoría 2)
    TRAC4A: 'industrial',  // Tractor agrícola (vehículo especial)
    MAQA: 'industrial',    // Maquinaria agrícola automotriz (cosechadora, vendimiador)
    CAR6E: 'industrial',   // Carretilla elevadora LINDE (Ley 5/2025 RC obligatorio)

    // Minibús / autocar (categoría 2, no admitido)
    AUTOCAR2B: 'minibus_autocar', AUTOBUS2A: 'minibus_autocar', MIC2C: 'minibus_autocar',

    // Moto (categoría 3)
    PATP: 'moto', PATS: 'moto',
    BEB7A: 'moto', BEB7B: 'moto', BEB7C: 'moto', BEB7D: 'moto',
    BSP7A: 'moto',
};

/** Prefijos de familia (MOT3A, MOT3B…, CIC3…, REMOL…). */
const CLASE_PREFIJO: Array<[string, TipoKey]> = [
    ['MOT3', 'moto'],
    ['CIC3', 'moto'],
    ['REMOL', 'remolque'],
];

export function tipoPorClase(idClase: string): TipoKey {
    const c = (idClase || '').trim().toUpperCase();
    if (!c) return 'sin_clasificar';
    if (CLASE_TIPO[c]) return CLASE_TIPO[c];
    for (const [pre, tipo] of CLASE_PREFIJO) if (c.startsWith(pre)) return tipo;
    return 'sin_clasificar';
}

/**
 * Tipo de un vehículo: primero por clase; el PMA solo corrige las furgonetas
 * (más de 3.500 kg pasa a camión, categoría 2). Sin PMA vale el tipo de la clase.
 */
export function clasificar(idClase: string, pma?: number): TipoKey {
    const base = tipoPorClase(idClase);
    if ((base === 'furgoneta' || base === 'furgon') && (pma ?? 0) > LIMITE_PMA_KG) return 'camion';
    return base;
}

export const esTipoKey = (s: string | undefined): s is TipoKey => !!s && s in TIPO_INFO;
