// ─── MOTOR DE PRIMAS ──────────────────────────────────────────────────────────
//
// Este fichero NO contiene ningún precio. Toda la tarifa (primas base por tipología y cobertura,
// suplementos y ajustes) vive en la base de datos y se edita desde orion-admin («Tarifa»).
// Aquí solo está la FÓRMULA: cómo se combinan esos valores.
//
//   PRIMA = base(tipo, cobertura, ámbito)            ← tabla primas_base
//           [ajustada por franquicia en Todo riesgo]  ← curva con tr_alpha y la franquicia de referencia
//           + suplementos (asistencia, animales, reposo, isotermo, pérdida total)   ← primas_suplementos
//           × (1 + ajuste global %)
//
// Sin tarifa cargada no se calcula nada (devuelve null): Orion nunca inventa un precio.

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

// Asistencia: 1.ª cat. + moto usan oro/oro_plus/platino; 2.ª cat. usa nacional/internacional.
export type NivelAsistencia = 'no' | 'oro' | 'oro_plus' | 'platino' | 'nacional' | 'internacional';

// ─── TARIFA (viene de la base de datos) ───────────────────────────────────────

export interface PrimasConfig {
    // "tipo:cobertura:ambito" → prima base. Variante "tipo@sp:…" = misma tipología en servicio público.
    primas: Record<string, number>;
    // clave del suplemento o ajuste → valor (€, o fracción en los porcentajes: 0,30 = 30 %)
    ajustes: Record<string, number>;
}

/** Claves de suplementos y ajustes que usa la fórmula. Todas se leen de la tarifa. */
export type ClaveAjuste =
    | 'animales'
    | 'reposo_cat1' | 'reposo_cat2' | 'reposo_moto'
    | 'asistencia_oro' | 'asistencia_oro_plus' | 'asistencia_platino'
    | 'asistencia_servicio_pub_oro' | 'asistencia_servicio_pub_op' | 'asistencia_servicio_pub'
    | 'asistencia_nacional' | 'asistencia_internacional' | 'asistencia_moto_oro'
    | 'isotermo_pct' | 'perdida_total_pct'
    | 'tr_alpha' | 'tr_fref_cat1' | 'tr_fref_cat2' | 'tr_fref_moto'
    | 'ajuste_global_pct';

// ─── METADATOS DE TIPOLOGÍA (no son precios) ──────────────────────────────────

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

// ─── FUNCIÓN PRINCIPAL ────────────────────────────────────────────────────────

export interface CalcPrimaParams {
    tipoVehiculo:  TipoVehiculo;
    producto:      Producto;
    uso?:          'particular' | 'transportes_propios' | 'servicio_publico';
    ambito?:       'nacional' | 'internacional';
    franquicia?:   number;
    asistencia?:   NivelAsistencia;
    animales?:     boolean;
    lunas?:        boolean;         // Terceros + lunas (1.ª cat.): usa la fila «Terceros con lunas» de la tarifa
    reposo?:       boolean;         // RC voluntaria en reposo
    isotermo?:     boolean;         // solo 2.ª cat. (camión rígido y semirremolque)
    perdidaTotal?: boolean;         // ampliado y todo riesgo
}

/**
 * Prima de un vehículo según la tarifa. Devuelve null si no hay tarifa cargada o si la tarifa no
 * tiene precio para esa combinación de tipología, cobertura y ámbito (o está marcada «no aplica»).
 */
export function calcularPrima(params: CalcPrimaParams, config?: PrimasConfig | null): number | null {
    if (!config) return null;
    const {
        tipoVehiculo, producto, uso,
        ambito = 'nacional', asistencia = 'no',
        franquicia, animales = false, lunas = false, reposo = false,
        isotermo = false, perdidaTotal = false,
    } = params;

    const meta = VEH_META[tipoVehiculo];
    if (!meta) return null;

    // Suplemento o ajuste de la tarifa; si no está definido no suma nada.
    const adj = (key: ClaveAjuste): number => {
        const v = config.ajustes[key];
        return typeof v === 'number' && Number.isFinite(v) ? v : 0;
    };

    // Tipo con el que se busca en la tarifa: en servicio público, primero su fila propia si existe.
    const tiposTabla = uso === 'servicio_publico' ? [`${tipoVehiculo}@sp`, tipoVehiculo] : [tipoVehiculo];
    const precio = (prod: Producto): number | null => {
        for (const t of tiposTabla) {
            const v = config.primas[`${t}:${prod}:${ambito}`];
            if (typeof v === 'number' && Number.isFinite(v)) return v;
        }
        return null;
    };

    // Terceros + lunas: es una cobertura con precio propio en la tarifa («Terceros con lunas»).
    const conLunas = producto === 'terceros' && lunas && meta.puedelunas;
    const primaBase = conLunas ? (precio('terceros_con_luna') ?? precio('terceros')) : precio(producto);
    if (primaBase === null) return null;

    const applyGlobal = (n: number): number => Math.round(n * (1 + adj('ajuste_global_pct') / 100));

    // Asistencia en viaje, según categoría.
    const suplementoAsistencia = (): number => {
        if (asistencia === 'no') return 0;
        if (meta.categoria === 3) return asistencia === 'oro' ? adj('asistencia_moto_oro') : 0;
        if (meta.categoria === 2) {
            if (asistencia === 'nacional')      return adj('asistencia_nacional');
            if (asistencia === 'internacional') return adj('asistencia_internacional');
            return 0;
        }
        // 1.ª categoría: la furgoneta en servicio público tiene su propia escala
        if (tipoVehiculo === 'furgoneta' && uso === 'servicio_publico') {
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

    const suplementoReposo = (): number => {
        if (!reposo) return 0;
        if (meta.categoria === 3) return adj('reposo_moto');
        if (meta.categoria === 2) return adj('reposo_cat2');
        return adj('reposo_cat1');
    };

    // Todo riesgo según franquicia: el precio de la tarifa es el de la franquicia de referencia;
    // con otra franquicia se mueve entre «Terceros ampliado» y ese precio:
    //   TR(f) = TA + (TR_ref − TA) × (f_ref / f) ^ alfa
    const ajusteTRporFranquicia = (base: number): number => {
        if (producto !== 'todo_riesgo' || !franquicia) return base;
        const fref = meta.categoria === 3 ? adj('tr_fref_moto') : meta.categoria === 2 ? adj('tr_fref_cat2') : adj('tr_fref_cat1');
        const alpha = adj('tr_alpha');
        if (!(fref > 0) || !(alpha > 0)) return base;
        const ta = meta.categoria === 3 ? precio('terceros') : precio('terceros_ampliado');
        if (ta === null) return base;
        return ta + (base - ta) * Math.pow(fref / franquicia, alpha);
    };

    // ── 3.ª categoría (motos) ──
    if (meta.categoria === 3) {
        let total = ajusteTRporFranquicia(primaBase);
        if (animales) total += adj('animales');
        total += suplementoReposo();
        total += suplementoAsistencia();
        return applyGlobal(total);
    }

    // ── 1.ª categoría ──
    if (meta.categoria === 1) {
        let total = conLunas ? primaBase : ajusteTRporFranquicia(primaBase);
        if (animales) total += adj('animales');
        total += suplementoReposo();
        total += suplementoAsistencia();
        if (perdidaTotal && (producto === 'terceros_ampliado' || producto === 'todo_riesgo')) {
            total += primaBase * adj('perdida_total_pct');
        }
        return applyGlobal(total);
    }

    // ── 2.ª categoría ──
    if (!meta.familia2) return applyGlobal(primaBase);   // industriales: solo la prima base
    let total = ajusteTRporFranquicia(primaBase);
    if (isotermo && (meta.familia2 === 'remolque' || meta.familia2 === 'camion_rigido')) {
        total += primaBase * adj('isotermo_pct');
    }
    if (perdidaTotal) total += primaBase * adj('perdida_total_pct');
    total += suplementoReposo();
    total += suplementoAsistencia();

    return applyGlobal(total);
}

export { VEH_META };
export type { VehMeta, FamiliaCat2 };
