// ─── TIPOS GLOBALES ───────────────────────────────────────────────────────────

export type TipoVehiculo =
    | 'turismo'
    | 'derivado_turismo'
    | 'derivado_todoterreno'
    | 'furgoneta'
    | 'furgon'
    | 'moto'
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

// Asistencia: 1.ª cat. + moto usan oro/oro_plus/platino; 2.ª cat. usa nacional/internacional según la OPCIÓN elegida.
export type NivelAsistencia = 'no' | 'oro' | 'oro_plus' | 'platino' | 'nacional' | 'internacional';

// ─── CONFIGURACIÓN EXTERNA (del panel admin) ──────────────────────────────────

export interface PrimasConfig {
  primas:  Record<string, number>; // "tipo_vehiculo:cobertura:ambito" → prima base
  ajustes: Record<string, number>; // "clave" → valor (animales, asistencia_*, ...)
}

// ─── METADATOS INTERNOS ───────────────────────────────────────────────────────

type FamiliaCat2 = 'cabeza_tractora' | 'camion_rigido' | 'remolque';

interface VehMeta {
    categoria:  1 | 2 | 3;
    puedelunas: boolean;
    familia2?:  FamiliaCat2;
}

const VEH_META: Record<TipoVehiculo, VehMeta> = {
    turismo:                    { categoria: 1, puedelunas: true  },
    derivado_turismo:           { categoria: 1, puedelunas: true  },
    derivado_todoterreno:       { categoria: 1, puedelunas: true  },
    furgoneta:                  { categoria: 1, puedelunas: true  },
    furgon:                     { categoria: 1, puedelunas: true  },
    moto:                       { categoria: 3, puedelunas: false },
    cabeza_tractora:            { categoria: 2, puedelunas: true,  familia2: 'cabeza_tractora' },
    camion_rigido:              { categoria: 2, puedelunas: true,  familia2: 'camion_rigido'   },
    semirremolque:              { categoria: 2, puedelunas: false, familia2: 'remolque'        },
    industrial_matriculado:     { categoria: 2, puedelunas: false },
    industrial_no_matriculado:  { categoria: 2, puedelunas: false },
};

// ─── TABLAS HARDCODEADAS (fallback si la API no responde) ─────────────────────
// 2.ª cat. INTACTA (D12, documento oficial). 1.ª y 3.ª: lista del 03/11/2026.

const PRIMAS_CAT1: Partial<Record<TipoVehiculo, Partial<Record<Producto, number>>>> = {
    turismo:                    { terceros: 500, terceros_ampliado: 650, todo_riesgo: 850 },
    derivado_turismo:           { terceros: 395, terceros_ampliado: 650, todo_riesgo: 950 },
    derivado_todoterreno:       { terceros: 550, terceros_ampliado: 750, todo_riesgo: 1150 },
    furgoneta:                  { terceros: 500, terceros_ampliado: 650, todo_riesgo: 1050 },
    furgon:                     { terceros: 640, terceros_ampliado: 950, todo_riesgo: 1350 },
    industrial_matriculado:     { terceros: 190 },
    industrial_no_matriculado:  { terceros: 190 },
};

// Moto: solo Terceros y «Ampliado con franquicia» (hoja Precios R12). TR_REF = 500.
const PRIMAS_MOTO: Partial<Record<Producto, number>> = {
    terceros: 336.08,
    todo_riesgo: 426.89,   // producto COMB_MOTO_FRANQ (TR en la guía)
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

// Ajustes nuevos (D11): hoy solo se cobran lunas (en Terceros), animales, reposo, pérdida total y asistencia.
const AJUSTES = {
    animales:                   25,
    reposo_cat1:                40,
    reposo_cat2:                80,
    reposo_moto:                25,
    lunas_cat1_terceros:        70,   // turismo / derivados / furgoneta (media)
    lunas_furgon_terceros:      100,
    asistencia_oro:             35,   // cat. 1
    asistencia_oro_plus:        75,
    asistencia_platino:         110,
    asistencia_servicio_pub:    160,  // furgoneta SP (Platino)
    asistencia_servicio_pub_oro: 50,   // furgoneta SP (Oro) — escalado
    asistencia_servicio_pub_op:  105,  // furgoneta SP (Oro Plus) — escalado
    asistencia_nacional:        221,
    asistencia_internacional:   327,
    asistencia_moto_oro:        30,
    isotermo_pct:               0.30,
    perdida_total_pct:          0.12,
    // Curva TR por franquicia (D10, hoja «TR x franquicia»).
    tr_alpha:                   0.35,
    tr_fref_cat1:               300,
    tr_fref_cat2:               1800,
    tr_fref_moto:               500,
} as const;

// ─── FUNCIÓN PRINCIPAL ────────────────────────────────────────────────────────

export interface CalcPrimaParams {
    tipoVehiculo:  TipoVehiculo;
    producto:      Producto;
    uso?:          'particular' | 'transportes_propios' | 'servicio_publico';
    ambito?:       'nacional' | 'internacional';
    franquicia?:   number;
    asistencia?:   NivelAsistencia;
    animales?:     boolean;
    lunas?:        boolean;         // solo cuenta en Terceros de 1.ª cat.
    reposo?:       boolean;         // RC voluntaria en reposo
    isotermo?:     boolean;         // solo 2.ª cat.
    perdidaTotal?: boolean;         // TA/TR
}

export function calcularPrima(params: CalcPrimaParams, config?: PrimasConfig | null): number | null {
    const {
        tipoVehiculo, producto, uso,
        ambito = 'nacional', asistencia = 'no',
        franquicia, animales = false, lunas = false, reposo = false,
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
            if (key in config.primas) return config.primas[key];
            // Fallback a nacional cuando se pide internacional y no existe en config
            if (ambito === 'internacional') {
                const kNac = `${tipoVehiculo}:${producto}:nacional`;
                if (kNac in config.primas) return config.primas[kNac];
            }
        }
        if (meta.categoria === 3) return PRIMAS_MOTO[producto] ?? null;
        if (meta.categoria === 1) return PRIMAS_CAT1[tipoVehiculo]?.[producto] ?? null;
        if (!meta.familia2)       return PRIMAS_CAT1[tipoVehiculo]?.[producto] ?? null; // industriales
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

    // Suplemento lunas: solo en Terceros; en TA/TR las lunas forman parte de la modalidad.
    const suplementoLunas = (): number => {
        if (!lunas || producto !== 'terceros') return 0;
        if (tipoVehiculo === 'furgon') return adj('lunas_furgon_terceros');
        return adj('lunas_cat1_terceros');
    };

    // Suplemento asistencia (1.ª cat. + moto y 2.ª cat. por opción).
    const suplementoAsistencia = (): number => {
        if (asistencia === 'no') return 0;
        if (meta.categoria === 3) return asistencia === 'oro' ? adj('asistencia_moto_oro') : 0;
        if (meta.categoria === 2) {
            if (asistencia === 'nacional')      return adj('asistencia_nacional');
            if (asistencia === 'internacional') return adj('asistencia_internacional');
            return 0;
        }
        // Categoría 1: furgoneta en servicio público tiene escalado propio
        const sp = tipoVehiculo === 'furgoneta' && uso === 'servicio_publico';
        if (sp) {
            if (asistencia === 'oro')      return adj('asistencia_servicio_pub_oro');
            if (asistencia === 'oro_plus') return adj('asistencia_servicio_pub_op');
            if (asistencia === 'platino')  return adj('asistencia_servicio_pub');
            return 0;
        }
        if (asistencia === 'oro')      return adj('asistencia_oro');
        if (asistencia === 'oro_plus') return adj('asistencia_oro_plus');
        if (asistencia === 'platino')  return adj('asistencia_platino');
        return 0;
    };

    // Suplemento reposo (siempre que esté activo).
    const suplementoReposo = (): number => {
        if (!reposo) return 0;
        if (meta.categoria === 3) return adj('reposo_moto');
        if (meta.categoria === 2) return adj('reposo_cat2');
        return adj('reposo_cat1');
    };

    // Curva TR por franquicia: solo en TR y cuando el motor conoce la franquicia de referencia.
    const ajusteTRporFranquicia = (base: number): number => {
        if (producto !== 'todo_riesgo' || !franquicia) return base;
        const ta = meta.categoria === 3
            ? PRIMAS_MOTO['terceros'] ?? base
            : (config?.primas?.[`${tipoVehiculo}:terceros_ampliado:${ambito}`]
                ?? PRIMAS_CAT1[tipoVehiculo]?.terceros_ampliado
                ?? (meta.familia2 ? (ambito === 'internacional' ? PRIMAS_CAT2_INT : PRIMAS_CAT2_NAC)[meta.familia2].terceros_ampliado : null)
                ?? base);
        const fref = meta.categoria === 3
            ? adj('tr_fref_moto')
            : meta.categoria === 2 ? adj('tr_fref_cat2') : adj('tr_fref_cat1');
        const alpha = adj('tr_alpha');
        // TR(f) = TA + (TR_ref - TA) * (fref / f)^alpha
        const trAjustado = ta + (base - ta) * Math.pow(fref / franquicia, alpha);
        return trAjustado;
    };

    // ── Rama por categoría ────────────────────────────────────────────────────

    if (meta.categoria === 3) {
        let total = ajusteTRporFranquicia(primaBase);
        if (animales) total += adj('animales');
        if (reposo)   total += suplementoReposo();
        total += suplementoAsistencia();
        if (lunas && producto === 'terceros') total += suplementoLunas();
        return applyGlobal(total);
    }

    if (meta.categoria === 1) {
        let total = ajusteTRporFranquicia(primaBase);
        if (animales)     total += adj('animales');
        if (reposo)       total += suplementoReposo();
        total += suplementoLunas();
        total += suplementoAsistencia();
        if (perdidaTotal && (producto === 'terceros_ampliado' || producto === 'todo_riesgo')) {
            total += primaBase * adj('perdida_total_pct');
        }
        return applyGlobal(total);
    }

    // ── CATEGORÍA 2 (INTACTA — D12) ──────────────────────────────────────────
    if (!meta.familia2) return applyGlobal(primaBase);
    let total = ajusteTRporFranquicia(primaBase);
    if (isotermo && (meta.familia2 === 'remolque' || meta.familia2 === 'camion_rigido')) {
        total += primaBase * adj('isotermo_pct');
    }
    if (perdidaTotal) total += primaBase * adj('perdida_total_pct');
    if (reposo)       total += suplementoReposo();
    // Asistencia 2.ª cat.: hoy sale de la OPCIÓN elegida (D6/R13), no del ámbito del vehículo.
    total += suplementoAsistencia();

    return applyGlobal(total);
}

export { VEH_META };
export type { VehMeta, FamiliaCat2 };
