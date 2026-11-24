// ─── TARIFA: de las tablas de la base de datos a lo que usa el motor de primas ─────────
//
// La tarifa se edita en orion-admin y vive en dos tablas de orion-api:
//   primas_base        → prima por categoría, tipología, cobertura y ámbito
//   primas_suplementos → asistencia, animales, isotermo, reposo, pérdida total, ajustes
// Este módulo las convierte en el `PrimasConfig` que consume `calcularPrima`. Es puro (sin red).

import type { PrimasConfig } from './primas';

export interface FilaTarifaBase {
    id?: number;
    categoria: string;
    tipo_vehiculo: string;
    /** clave de tipología del motor (turismo, furgon@sp, camion_rigido…) */
    tipo_key?: string;
    cobertura: string;
    /** clave de cobertura del motor (terceros, terceros_con_luna, terceros_ampliado, todo_riesgo) */
    cob_key?: string;
    ambito: string;
    prima: number;
    aplica: number;
}

export interface FilaTarifaSuplemento {
    id?: number;
    categoria: string;
    tipo_suplemento: string;
    modalidad: string;
    valor: number;
    es_porcentaje: number;
    /** clave del ajuste en el motor (asistencia_oro, isotermo_pct, tr_alpha…) */
    clave?: string;
}

export interface TablaTarifa {
    base?: FilaTarifaBase[];
    suplementos?: FilaTarifaSuplemento[];
}

const norm = (s: unknown) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

// Solo para una base de datos anterior a las columnas de clave: se deduce de los nombres.
const TIPO_POR_NOMBRE: Record<string, string> = {
    'turismo': 'turismo',
    'furgoneta derivada turismo': 'derivado_turismo',
    'derivado de todoterreno': 'derivado_todoterreno',
    'furgoneta': 'furgoneta',
    'furgon grande particular': 'furgon',
    'furgon grande servicio publico': 'furgon@sp',
    'cabeza tractora': 'cabeza_tractora',
    'remolque': 'semirremolque',
    'camion rigido': 'camion_rigido',
    'industrial matriculado': 'industrial_matriculado',
    'industrial no matriculado': 'industrial_no_matriculado',
    'moto': 'moto',
};

function coberturaPorNombre(cobertura: string): string | null {
    const c = norm(cobertura);
    if (c === 'rc' || c === 'terceros sin lunas' || c === 'terceros') return 'terceros';
    if (c === 'rc + lunas' || c === 'rc+lunas' || c === 'terceros con lunas') return 'terceros_con_luna';
    if (c === 'terceros ampliado') return 'terceros_ampliado';
    if (c.startsWith('danos propios') || c.startsWith('todo riesgo') || c === 'terceros ampliado con franquicia') return 'todo_riesgo';
    return null;
}

function clavePorNombre(s: FilaTarifaSuplemento): string | null {
    const cat = String(s.categoria).trim(), tipo = norm(s.tipo_suplemento), mod = norm(s.modalidad).replace(/ /g, '_');
    if (tipo === 'asistencia') {
        if (cat === '1' && (mod === 'oro' || mod === 'oro_plus' || mod === 'platino')) return `asistencia_${mod}`;
        if (cat === '2' && (mod === 'nacional' || mod === 'internacional')) return `asistencia_${mod}`;
        if (cat === '3' && mod === 'oro') return 'asistencia_moto_oro';
    }
    if (tipo === 'animales') return 'animales';
    if (tipo === 'isotermo') return 'isotermo_pct';
    return null;
}

/** Porcentajes que el motor usa como fracción (30 % → 0,30). El ajuste global se usa tal cual. */
const COMO_FRACCION = new Set(['isotermo_pct', 'perdida_total_pct']);

export interface ResultadoTarifa {
    config: PrimasConfig;
    /** filas de la base de datos que el motor no sabe usar (para avisar, no para calcular) */
    sinUsar: string[];
}

export function tablaAConfig(tabla: TablaTarifa | null | undefined): ResultadoTarifa {
    const primas: Record<string, number> = {};
    const ajustes: Record<string, number> = {};
    const sinUsar: string[] = [];

    for (const f of tabla?.base ?? []) {
        if (!f.aplica) continue;   // «no aplica»: esa combinación no se ofrece, no hay precio
        const prima = Number(f.prima);
        if (!Number.isFinite(prima)) continue;
        const tipo = (f.tipo_key ?? '').trim() || TIPO_POR_NOMBRE[norm(f.tipo_vehiculo)];
        const prod = (f.cob_key ?? '').trim() || coberturaPorNombre(f.cobertura);
        if (!tipo || !prod) { sinUsar.push(`${f.tipo_vehiculo} · ${f.cobertura}`); continue; }
        const amb = norm(f.ambito);
        // «único» (1.ª y 3.ª categoría): el mismo precio en nacional e internacional
        const ambitos = amb === 'nacional' || amb === 'internacional' ? [amb] : ['nacional', 'internacional'];
        for (const a of ambitos) primas[`${tipo}:${prod}:${a}`] = prima;
    }

    for (const s of tabla?.suplementos ?? []) {
        const valor = Number(s.valor);
        if (!Number.isFinite(valor)) continue;
        const clave = (s.clave ?? '').trim() || clavePorNombre(s);
        if (!clave) { sinUsar.push(`suplemento ${s.tipo_suplemento} ${s.modalidad}`.trim()); continue; }
        ajustes[clave] = s.es_porcentaje && COMO_FRACCION.has(clave) ? valor / 100 : valor;
    }

    return { config: { primas, ajustes }, sinUsar };
}
