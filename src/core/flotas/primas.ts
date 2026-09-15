// ─── TIPOS GLOBALES ───────────────────────────────────────────────────────────

export type TipoVehiculo =
    | 'turismo'
    | 'furgoneta'
    | 'cabeza_tractora'
    | 'camion_rigido'
    | 'semirremolque'
    | 'industrial_matriculado'
    | 'industrial_no_matriculado';

export type Producto =
    | 'terceros'
    | 'terceros_con_luna'
    | 'terceros_ampliado'
    | 'todo_riesgo';

// ─── METADATOS INTERNOS ───────────────────────────────────────────────────────

// Familia de pricing en tablas cat.2
type FamiliaCat2 = 'cabeza_tractora' | 'camion_rigido' | 'remolque';

interface VehMeta {
    categoria:  1 | 2;
    puedelunas: boolean;
    familia2?:  FamiliaCat2; // solo cat.2; undefined = sin tarifa
}

const VEH_META: Record<TipoVehiculo, VehMeta> = {
    turismo:                    { categoria: 1, puedelunas: true  },
    furgoneta:                  { categoria: 1, puedelunas: true  },
    cabeza_tractora:            { categoria: 2, puedelunas: true,  familia2: 'cabeza_tractora' },
    camion_rigido:              { categoria: 2, puedelunas: true,  familia2: 'camion_rigido'   },
    semirremolque:              { categoria: 2, puedelunas: false, familia2: 'remolque'        },
    industrial_matriculado:     { categoria: 2, puedelunas: false },
    industrial_no_matriculado:  { categoria: 2, puedelunas: false },
};

// ─── TABLAS DE PRIMAS — FUENTE DE VERDAD FIJA ────────────────────────────────

// Cat.1 — todo_riesgo y terceros_ampliado tienen precio; otros productos devuelven null
// Industriales — precio fijo 190€ solo para terceros; cualquier otro producto → null
const PRIMAS_CAT1: Partial<Record<TipoVehiculo, Partial<Record<Producto, number>>>> = {
    turismo:                    { todo_riesgo: 395, terceros_ampliado: 395 },
    furgoneta:                  { todo_riesgo: 640, terceros_ampliado: 640 },
    industrial_matriculado:     { terceros: 190 },
    industrial_no_matriculado:  { terceros: 190 },
};

// Cat.2 — null = combinación sin precio (semirremolque + terceros_con_luna)
const PRIMAS_CAT2_NAC: Record<FamiliaCat2, Record<Producto, number | null>> = {
    cabeza_tractora: { terceros: 820,  terceros_con_luna: 970,  terceros_ampliado: 1500, todo_riesgo: 2355 },
    camion_rigido:   { terceros: 800,  terceros_con_luna: 950,  terceros_ampliado: 1400, todo_riesgo: 2305 },
    remolque:        { terceros: 270,  terceros_con_luna: null, terceros_ampliado: 1100, todo_riesgo: 1870 },
};

const PRIMAS_CAT2_INT: Record<FamiliaCat2, Record<Producto, number | null>> = {
    cabeza_tractora: { terceros: 965,  terceros_con_luna: 1115, terceros_ampliado: 1645, todo_riesgo: 2500 },
    camion_rigido:   { terceros: 945,  terceros_con_luna: 1095, terceros_ampliado: 1545, todo_riesgo: 2450 },
    remolque:        { terceros: 300,  terceros_con_luna: null, terceros_ampliado: 1200, todo_riesgo: 1950 },
};

// Ajustes fijos
const AJUSTES = {
    animales:                25,
    asistencia_particular:   110,
    asistencia_transportes:  110,
    asistencia_servicio_pub: 160,
    asistencia_nacional:     221,
    asistencia_internacional:327,
    isotermo_pct:            0.30,
    perdida_total_pct:       0.12,
} as const;

// ─── FUNCIÓN PRINCIPAL ────────────────────────────────────────────────────────

export interface CalcPrimaParams {
    tipoVehiculo:  TipoVehiculo;
    producto:      Producto;
    uso?:          'particular' | 'transportes_propios' | 'servicio_publico';
    ambito?:       'nacional' | 'internacional';
    franquicia?:   number;
    asistencia?:   'no' | 'oro' | 'oro_plus';
    animales?:     boolean;
    isotermo?:     boolean;
    perdidaTotal?: boolean;
}

export function calcularPrima(params: CalcPrimaParams): number | null {
    const {
        tipoVehiculo, producto, uso,
        ambito = 'nacional', asistencia = 'no', animales = false,
        isotermo = false, perdidaTotal = false,
    } = params;

    const meta = VEH_META[tipoVehiculo];

    // ── CATEGORÍA 1 ──────────────────────────────────────────────────────────
    if (meta.categoria === 1) {
        const primaBase = PRIMAS_CAT1[tipoVehiculo]?.[producto];
        if (primaBase === undefined || primaBase === null) return null; // producto sin tarifa cat.1

        let total = primaBase;
        if (animales) total += AJUSTES.animales;

        // Asistencia Cat.1 (oro o oro_plus activan el ajuste)
        if (asistencia === 'oro' || asistencia === 'oro_plus') {
            if (tipoVehiculo === 'furgoneta') {
                if (uso === 'servicio_publico') total += AJUSTES.asistencia_servicio_pub;
                else total += AJUSTES.asistencia_transportes; // transportes_propios o sin especificar
            } else if (tipoVehiculo === 'turismo') {
                total += AJUSTES.asistencia_particular;
            }
        }

        return total;
    }

    // ── INDUSTRIALES — precio fijo, sin ajustes ──────────────────────────────
    if (tipoVehiculo === 'industrial_matriculado' || tipoVehiculo === 'industrial_no_matriculado') {
        return PRIMAS_CAT1[tipoVehiculo]?.[producto] ?? null;
    }

    // ── CATEGORÍA 2 ──────────────────────────────────────────────────────────
    if (!meta.familia2) return null;

    const tabla = ambito === 'internacional' ? PRIMAS_CAT2_INT : PRIMAS_CAT2_NAC;
    const primaBase = tabla[meta.familia2][producto];
    if (primaBase === null || primaBase === undefined) return null;

    let total = primaBase;
    if (isotermo && (meta.familia2 === 'remolque' || meta.familia2 === 'camion_rigido')) {
        total += primaBase * AJUSTES.isotermo_pct;
    }
    if (perdidaTotal) total += primaBase * AJUSTES.perdida_total_pct;
    if (asistencia === 'oro' || asistencia === 'oro_plus') {
        total += ambito === 'internacional' ? AJUSTES.asistencia_internacional : AJUSTES.asistencia_nacional;
    }

    return Math.round(total);
}

// Exportar metadatos para uso en auxiliares y coberturas
export { VEH_META };
export type { VehMeta, FamiliaCat2 };
