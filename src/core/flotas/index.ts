export type { TipoVehiculo, Producto, CalcPrimaParams } from './primas';
export { calcularPrima } from './primas';

export type { ValidacionCobertura, ValidarCoberturaParams } from './coberturas';
export { validarCobertura } from './coberturas';

export { getCategoria, puedeCargarLunas, franquiciasValidas, productosDisponibles } from './auxiliares';

export { normalizarPoliza, detectarClaveFlota, normalizarPolizaConClave } from './poliza';
export type { ClaveFlotaGrupo } from './poliza';

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

export type { FlotaCarpeta, EstadoFlota, HistoricoEntry, TarifaEntry } from './carpeta';
export { listarCarpetas, crearCarpeta, guardarCarpeta, cargarCarpeta, eliminarCarpeta, cambiarEstado, cargarCarpetasDelServidor, initMemCache, sesionJoin, sesionLeave, sesionHeartbeat, borrarTodasLasCarpetas } from './carpeta';

export type { Corredor, Periodicidad, Sucursal } from './corredor';
export { listarCorredores, crearCorredor, guardarCorredor, cargarCorredor, eliminarCorredor, cargarCorredoresDelServidor, borrarTodosLosCorredores } from './corredor';

export type { ParseResult } from './parser';
export { parseExcelTemplate } from './parser';

export { generarPlantillaExcel } from './plantilla';

export { seedIfEmpty } from './seed';

export {
    normalizeToOption,
    normalizeColumnValue,
    normalizePlate,
    normalizePoliza,
    normalizeTipoVehiculo,
    TIPO_VEHICULO_OPTS,
    USO_OPTS,
    AMBITO_OPTS,
    COBERTURA_OPTS,
    ASISTENCIA_OPTS,
    LUNAS_OPTS,
} from './normalizador';
