// VENTANAS DE AÑOS DEL SISTEMA DE EMISIÓN
//
// El sistema real de emisión valida el año de fabricación (y el de matriculación) contra un rango por ID de
// catálogo: «Año de fabricación 2022 debe estar entre [2018,2019] para idVehMMT=256114891». Ese rango NO es el del
// CSV del catálogo (el CSV tiene huecos: muchas versiones «sin fin» tienen un fin real en el sistema).
//
// ORION guarda aquí las ventanas que conoce del sistema: las de la semilla (errores reales de una emisión anterior),
// las que aprende al pegar nuevos errores, y las que MMT facilite en bloque. Cuando un ID tiene ventana del sistema,
// esa manda sobre la del CSV y la comprobación es exacta (sin tolerancia).
//
// Módulo puro (sin React ni red).

export interface VentanaSistema {
    /** idVehMMT */
    id: string;
    fabMin: number;
    fabMax: number;
    /** ventana de matriculación, si el sistema la ha indicado alguna vez */
    matMin?: number | null;
    matMax?: number | null;
    /** de dónde sale: «error del sistema», «tabla de MMT»… */
    fuente?: string;
    actualizada?: string;
}

export type MapaVentanas = Record<string, VentanaSistema>;

/** Ventanas que el sistema indicó al rechazar una emisión real (catálogo de referencia, sin datos de clientes). */
const SEMILLA: Array<[string, number, number]> = [
    ['100081293', 1996, 1998], ['100088290', 1987, 1990], ['100104918', 2000, 2000], ['100126263', 1996, 1999],
    ['100134004', 2000, 2005], ['100134744', 1995, 1997], ['122175014', 2011, 2019], ['126963587', 2014, 2016],
    ['128985514', 2015, 2015], ['131047153', 2015, 2016], ['236730320', 2017, 2019], ['243644652', 2015, 2019],
    ['245386497', 2017, 2018], ['250592225', 2016, 2019], ['252320933', 2017, 2018], ['252919403', 2018, 2018],
    ['253538875', 2018, 2019], ['253538877', 2018, 2019], ['256114891', 2018, 2019], ['275279063', 2020, 2020],
    ['230261478', 1998, 2000],
];

export const VENTANAS_SEMILLA: MapaVentanas = Object.fromEntries(
    SEMILLA.map(([id, a, b]) => [id, { id, fabMin: a, fabMax: b, fuente: 'error del sistema (emisión de octubre de 2026)' } as VentanaSistema]),
);

export interface ErrorSistema {
    fila: number | null;
    campo: 'fabricacion' | 'matriculacion';
    anio: number;
    min: number;
    max: number;
    id: string;
}

/**
 * Lee los errores del sistema pegados tal cual:
 *   «Error en fila 29 Causa: Año de fabricación 2022 debe estar entre [2018,2019] para idVehMMT=256114891»
 * Admite también el de matriculación y los espacios o tildes distintos. Ignora cualquier otra línea.
 */
export function leerErroresSistema(texto: string): ErrorSistema[] {
    const out: ErrorSistema[] = [];
    const re = /(?:fila\s+(\d+).*?)?A[ñn]o\s+de\s+(fabricaci[oó]n|matriculaci[oó]n)\s+(\d{4})\s+debe\s+estar\s+entre\s*\[\s*(\d{4})\s*[,;-]\s*(\d{4})\s*\]\s*para\s+idVehMMT\s*=\s*(\d+)/gi;
    for (const linea of (texto ?? '').split(/\r?\n/)) {
        re.lastIndex = 0;
        const m = re.exec(linea);
        if (!m) continue;
        out.push({
            fila: m[1] ? parseInt(m[1], 10) : null,
            campo: m[2].toLowerCase().startsWith('fab') ? 'fabricacion' : 'matriculacion',
            anio: parseInt(m[3], 10), min: parseInt(m[4], 10), max: parseInt(m[5], 10), id: m[6],
        });
    }
    return out;
}

/** Convierte errores en ventanas, fusionando las de fabricación y matriculación de un mismo ID. */
export function ventanasDeErrores(errores: ErrorSistema[], ahora = new Date().toISOString()): VentanaSistema[] {
    const por = new Map<string, VentanaSistema>();
    for (const e of errores) {
        const v = por.get(e.id) ?? { id: e.id, fabMin: 0, fabMax: 0, matMin: null, matMax: null, fuente: 'error del sistema', actualizada: ahora };
        if (e.campo === 'fabricacion') { v.fabMin = e.min; v.fabMax = e.max; }
        else { v.matMin = e.min; v.matMax = e.max; }
        por.set(e.id, v);
    }
    return [...por.values()];
}

/** Une ventanas nuevas sobre las que ya hay. Conserva la ventana de fabricación o matriculación que la nueva no trae. */
export function fusionarVentanas(base: MapaVentanas, nuevas: VentanaSistema[]): MapaVentanas {
    const out: MapaVentanas = { ...base };
    for (const n of nuevas) {
        const previa = out[n.id];
        out[n.id] = {
            ...previa, ...n,
            fabMin: n.fabMin || previa?.fabMin || 0, fabMax: n.fabMax || previa?.fabMax || 0,
            matMin: n.matMin ?? previa?.matMin ?? null, matMax: n.matMax ?? previa?.matMax ?? null,
        };
    }
    return out;
}

/** true si el año cae dentro del rango (inclusive) */
export const dentroDe = (anio: number, min: number, max: number) => anio >= min && anio <= max;
