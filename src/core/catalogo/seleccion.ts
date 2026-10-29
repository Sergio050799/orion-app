// ELECCIÓN DE LA VERSIÓN ENTRE LOS CANDIDATOS DEL BUSCADOR
//
// Regla: se elige la mejor puntuación DENTRO de la ventana de años del vehículo. Si ninguna candidata cubre el
// año, se propone la más cercana en años y se marca como aproximación (la verificación la dejará en «Revisar»
// hasta que una persona la confirme). Sin año no se puede comprobar nada: se devuelve la de mayor puntuación.
//
// Módulo puro (sin React ni red).

import { ventanaAnios, dentroDeVentana } from './verificacion';
import type { MapaVentanas } from './ventanasSistema';

export interface CandidatoBasico {
    id_veh: string;
    desde?: number;
    hasta?: number;
    anyo?: number;
    score?: number;
}

/** Distancia en años entre el año del vehículo y la ventana de la versión (0 = dentro). */
export function distanciaVentana(c: CandidatoBasico, anio: number): number {
    const { ini, fin } = ventanaAnios(c);
    if (ini !== null && anio < ini) return ini - anio;
    if (fin !== null && anio > fin) return anio - fin;
    return 0;
}

/** ¿La versión cubre el año del vehículo? true/false, o null si no se puede saber. La ventana del sistema manda. */
export function cubreAnio(c: CandidatoBasico, anio: number | null | undefined, ventanas?: MapaVentanas): boolean | null {
    if (!anio) return null;
    const v = ventanas?.[c.id_veh];
    if (v && v.fabMin) return anio >= v.fabMin && anio <= v.fabMax;
    return dentroDeVentana(c, anio);
}

/** Años que separan el año del vehículo de la ventana de la versión (0 si está dentro o no se sabe). */
export function distanciaAnios(c: CandidatoBasico, anio: number | null | undefined, ventanas?: MapaVentanas): number {
    if (!anio) return 0;
    const v = ventanas?.[c.id_veh];
    if (v && v.fabMin) return anio < v.fabMin ? v.fabMin - anio : anio > v.fabMax ? anio - v.fabMax : 0;
    return distanciaVentana(c, anio);
}

export interface Eleccion<T> { candidato: T; aproximada: boolean }

export function elegirCandidato<T extends CandidatoBasico>(candidatos: T[], anio: number | null | undefined, ventanas?: MapaVentanas): Eleccion<T> | null {
    if (candidatos.length === 0) return null;
    if (!anio) return { candidato: candidatos[0], aproximada: false };
    const ok = candidatos.find(c => cubreAnio(c, anio, ventanas) !== false);
    if (ok) return { candidato: ok, aproximada: false };
    // ninguna cubre el año: la más cercana (a igualdad, la de mayor puntuación, que ya va primero)
    const cercana = candidatos.reduce((mejor, c) => (distanciaAnios(c, anio, ventanas) < distanciaAnios(mejor, anio, ventanas) ? c : mejor), candidatos[0]);
    return { candidato: cercana, aproximada: true };
}
