export type { TipoVehiculo, Producto, CalcPrimaParams } from './primas';
export { calcularPrima } from './primas';

export type { ValidacionCobertura, ValidarCoberturaParams } from './coberturas';
export { validarCobertura } from './coberturas';

export { getCategoria, puedeCargarLunas, franquiciasValidas, productosDisponibles } from './auxiliares';

export { normalizarPoliza } from './poliza';

export type { ResumenSinco } from './sinco';
export {
    calcularAntiguedad,
    calcularAntiguedadMedia,
    calcularSiniestrosPorAnio,
    calcularFrecuencia,
    contarVehiculos,
    contarVehiculosConSinco,
    filtrarFilasReales,
    consolidarSinco,
    mergeSincoToTrabajo,
} from './sinco';

export type { FlotaSession, CoberturaAsignacion, Row } from './sesion';
export { guardarSesion, cargarSesion, listarSesiones, eliminarSesion } from './sesion';

export type { FlotaCarpeta, EstadoFlota, HistoricoEntry } from './carpeta';
export { listarCarpetas, crearCarpeta, guardarCarpeta, cargarCarpeta, eliminarCarpeta, cambiarEstado } from './carpeta';

export type { Corredor, Periodicidad } from './corredor';
export { listarCorredores, crearCorredor, guardarCorredor, cargarCorredor, eliminarCorredor } from './corredor';

export type { ParseResult } from './parser';
export { parseExcelTemplate } from './parser';

export { generarPlantillaExcel } from './plantilla';

export {
    normalizeToOption,
    normalizeColumnValue,
    normalizePlate,
    normalizePoliza,
    TIPO_VEHICULO_OPTS,
    USO_OPTS,
    AMBITO_OPTS,
    COBERTURA_OPTS,
    ASISTENCIA_OPTS,
    LUNAS_OPTS,
} from './normalizador';
