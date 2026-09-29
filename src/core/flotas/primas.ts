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

// ─── CONFIGURACIÓN EXTERNA (del panel admin) ──────────────────────────────────

export interface PrimasConfig {
  primas:  Record<string, number>; // "tipo_vehiculo:cobertura:ambito" → prima base
  ajustes: Record<string, number>; // "clave" → valor (animales, asistencia_*, ...)
}

// ─── METADATOS INTERNOS ───────────────────────────────────────────────────────

type FamiliaCat2 = 'cabeza_tractora' | 'camion_rigido' | 'remolque';

interface VehMeta {
    categoria:  1 | 2;
    puedelunas: boolean;
    familia2?:  FamiliaCat2;
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

// ─── TABLAS HARDCODEADAS (fallback si la API no responde) ─────────────────────

const PRIMAS_CAT1: Partial<Record<TipoVehiculo, Partial<Record<Producto, number>>>> = {
    turismo:                    { todo_riesgo: 395, terceros_ampliado: 395 },
    furgoneta:                  { todo_riesgo: 640, terceros_ampliado: 640 },
    industrial_matriculado:     { terceros: 190 },
    industrial_no_matriculado:  { terceros: 190 },
};

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

export function calcularPrima(params: CalcPrimaParams, config?: PrimasConfig | null): number | null {
    const {
        tipoVehiculo, producto, uso,
        ambito = 'nacional', asistencia = 'no', animales = false,
        isotermo = false, perdidaTotal = false,
    } = params;

    const meta = VEH_META[tipoVehiculo];

    // Ajuste: config primero, hardcoded como fallback
    const adj = (key: keyof typeof AJUSTES): number =>
        config?.ajustes?.[key] !== undefined ? config.ajustes[key] : AJUSTES[key];

    // Prima base: config primero (del admin), tablas hardcodeadas como fallback
    function getBase(): number | null {
        if (config) {
            const key = `${tipoVehiculo}:${producto}:${ambito}`;
            return key in config.primas ? config.primas[key] : null;
        }
        // Fallback hardcodeado
        if (meta.categoria === 1) {
            return PRIMAS_CAT1[tipoVehiculo]?.[producto] ?? null;
        }
        if (!meta.familia2) {
            return PRIMAS_CAT1[tipoVehiculo]?.[producto] ?? null;
        }
        const tabla = ambito === 'internacional' ? PRIMAS_CAT2_INT : PRIMAS_CAT2_NAC;
        return tabla[meta.familia2][producto] ?? null;
    }

    const primaBase = getBase();
    if (primaBase === null || primaBase === undefined) return null;

    const applyGlobal = (n: number): number => {
        const pct = config?.ajustes?.['ajuste_global_pct'];
        if (!pct) return Math.round(n);
        return Math.round(n * (1 + pct / 100));
    };

    // ── CATEGORÍA 1 (turismo / furgoneta) ────────────────────────────────────
    if (meta.categoria === 1) {
        let total = primaBase;
        if (animales) total += adj('animales');
        if (asistencia === 'oro' || asistencia === 'oro_plus') {
            if (tipoVehiculo === 'furgoneta') {
                total += uso === 'servicio_publico'
                    ? adj('asistencia_servicio_pub')
                    : adj('asistencia_transportes');
            } else if (tipoVehiculo === 'turismo') {
                total += adj('asistencia_particular');
            }
        }
        return applyGlobal(total);
    }

    // ── INDUSTRIALES — precio fijo, sin ajustes ──────────────────────────────
    if (!meta.familia2) return applyGlobal(primaBase);

    // ── CATEGORÍA 2 ──────────────────────────────────────────────────────────
    let total = primaBase;
    if (isotermo && (meta.familia2 === 'remolque' || meta.familia2 === 'camion_rigido')) {
        total += primaBase * adj('isotermo_pct');
    }
    if (perdidaTotal) total += primaBase * adj('perdida_total_pct');
    if (asistencia === 'oro' || asistencia === 'oro_plus') {
        total += ambito === 'internacional' ? adj('asistencia_internacional') : adj('asistencia_nacional');
    }

    return applyGlobal(total);
}

export { VEH_META };
export type { VehMeta, FamiliaCat2 };
