// ─── VALIDACIÓN DE COBERTURAS ─────────────────────────────────────────────────

import { TipoVehiculo, Producto, VEH_META } from './primas';

const FRANQUICIAS_CAT1 = [120, 180, 240, 300, 450, 600, 750] as const;
const FRANQUICIA_CAT2  = 1800;

const INDUSTRIALES: TipoVehiculo[] = ['industrial_matriculado', 'industrial_no_matriculado'];

export interface ValidacionCobertura {
    valido:  boolean;
    errores: string[];
    notas:   string[]; // avisos no bloqueantes
}

export interface ValidarCoberturaParams {
    tipoVehiculo: TipoVehiculo;
    producto:     Producto;
    franquicia?:  number;
    asistencia?:  string;
    categoria?:   1 | 2; // opcional, se infiere si no se pasa
}

export function validarCobertura(params: ValidarCoberturaParams): ValidacionCobertura {
    const { tipoVehiculo, producto, franquicia, asistencia } = params;
    const errores: string[] = [];
    const notas:   string[] = [];

    // Industriales: solo terceros, sin extras
    if (INDUSTRIALES.includes(tipoVehiculo)) {
        const errores: string[] = [];
        if (producto !== 'terceros') {
            errores.push('Vehículos industriales solo admiten Terceros.');
        }
        if (params.franquicia && params.franquicia > 0) {
            errores.push('Vehículos industriales no admiten franquicia.');
        }
        if (params.asistencia && params.asistencia !== 'no') {
            errores.push('Vehículos industriales no admiten asistencia.');
        }
        return { valido: errores.length === 0, errores, notas: [] };
    }

    const meta      = VEH_META[tipoVehiculo];
    const categoria = params.categoria ?? meta.categoria;

    // Lunas: semirremolque nunca puede llevar lunas
    if (!meta.puedelunas && producto === 'terceros_con_luna') {
        errores.push('El semirremolque no puede incluir cobertura de lunas.');
    }

    // terceros_ampliado para semirremolque → válido, pero lunas quedan excluidas
    if (!meta.puedelunas && producto === 'terceros_ampliado') {
        notas.push('Lunas excluidas para semirremolque en terceros ampliado.');
    }

    // Franquicia solo en todo_riesgo
    if (franquicia !== undefined && franquicia > 0 && producto !== 'todo_riesgo') {
        errores.push('La franquicia solo aplica al producto Todo Riesgo.');
    }

    if (franquicia !== undefined && franquicia > 0 && producto === 'todo_riesgo') {
        if (categoria === 1) {
            if (!(FRANQUICIAS_CAT1 as readonly number[]).includes(franquicia)) {
                errores.push(`Franquicia no válida para cat.1. Valores permitidos: ${FRANQUICIAS_CAT1.join(', ')}€.`);
            }
        } else {
            if (franquicia !== FRANQUICIA_CAT2) {
                errores.push(`En segunda categoría la única franquicia válida es ${FRANQUICIA_CAT2}€.`);
            }
        }
    }

    // Asistencia oro_plus solo en cat.1
    if (asistencia === 'oro_plus' && categoria === 2) {
        errores.push('La asistencia Oro+ no está disponible en segunda categoría.');
    }

    return { valido: errores.length === 0, errores, notas };
}
