// ─── FUNCIONES AUXILIARES — para dropdowns de Tom ────────────────────────────

import { TipoVehiculo, Producto, VEH_META } from './primas';

/** Devuelve la categoría del vehículo (1 o 2). */
export function getCategoria(tipoVehiculo: TipoVehiculo): 1 | 2 {
    return VEH_META[tipoVehiculo].categoria;
}

/** Devuelve si el vehículo puede incluir cobertura de lunas. */
export function puedeCargarLunas(tipoVehiculo: TipoVehiculo): boolean {
    return VEH_META[tipoVehiculo].puedelunas;
}

/** Devuelve las franquicias válidas para el tipo de vehículo. */
export function franquiciasValidas(tipoVehiculo: TipoVehiculo): number[] {
    if (tipoVehiculo === 'industrial_matriculado' || tipoVehiculo === 'industrial_no_matriculado') return [];
    const { categoria } = VEH_META[tipoVehiculo];
    if (categoria === 1) return [120, 180, 240, 300, 450, 600, 750];
    return [1800];
}

/**
 * Devuelve los productos disponibles (con tarifa) para el tipo de vehículo.
 * Útil para filtrar el dropdown de productos en tiempo real.
 */
export function productosDisponibles(tipoVehiculo: TipoVehiculo): Producto[] {
    // Industriales: solo terceros
    if (tipoVehiculo === 'industrial_matriculado' || tipoVehiculo === 'industrial_no_matriculado') {
        return ['terceros'];
    }

    const meta = VEH_META[tipoVehiculo];

    const todos: Producto[] = ['terceros', 'terceros_con_luna', 'terceros_ampliado', 'todo_riesgo'];
    if (!meta.puedelunas) return todos.filter(p => p !== 'terceros_con_luna');
    return todos;
}
