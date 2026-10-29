// VERIFICACIÓN DE LA IDENTIFICACIÓN EN EL CATÁLOGO
//
// El buscador del catálogo propone una versión; esta función comprueba, con reglas fijas y explicables, que esa
// versión es coherente con lo que sabemos del vehículo (modelo, año, tipología, potencia, plazas). Nada se da
// por bueno en silencio: cada discrepancia sale con su motivo, y las graves (`bloquea`) obligan a revisar el
// vehículo antes de emitir.
//
// Módulo puro (sin React ni red): lo usan PRE-EMISIÓN, EMISIÓN y las pruebas.

import { TIPO_INFO, esTipoKey, type TipoKey } from './tipologia';
import type { VentanaSistema } from './ventanasSistema';

export type Gravedad = 'bloquea' | 'aviso';

export type CodigoHallazgo =
    | 'ANIO_SIN' | 'ANIO_ANTERIOR' | 'ANIO_POSTERIOR' | 'VENTANA_ABIERTA'
    | 'MATRICULACION_FUERA' | 'ANIO_ESTIMADO' | 'ANIO_FAB_MATRICULACION' | 'ANIO_INCOHERENTE' | 'APROXIMADA'
    | 'MODELO_NO_COINCIDE' | 'MODELO_PARCIAL' | 'MARCA_DISTINTA'
    | 'CATEGORIA_DISTINTA' | 'SIN_TIPOLOGIA' | 'TIPO_VACIO' | 'NO_ADMITIDO'
    | 'KW_DISTINTO' | 'PLAZAS_DISTINTAS';

export interface Hallazgo {
    codigo: CodigoHallazgo;
    gravedad: Gravedad;
    texto: string;
}

/** Lo que sabemos del vehículo antes de identificarlo (estudio, Silverdat, matrícula). */
export interface VehiculoDeclarado {
    marca?: string;
    modelo?: string;
    /** tipología tal como viene del estudio («Furgoneta», «Camión rígido»…) */
    tipo?: string;
    kw?: number;
    plazas?: number;
    /** año del VEHÍCULO (Silverdat, estudio o matrícula), nunca el de la versión del catálogo.
     *  Si no se indica `anioFab`, se trata como año de fabricación. */
    anio?: number | null;
    /** año de fabricación (el que valida el sistema de emisión) */
    anioFab?: number | null;
    /** año de matriculación (el sistema de emisión también lo valida) */
    anioMat?: number | null;
    /** de dónde sale el año de fabricación */
    fuenteAnio?: FuenteAnio;
    /** la versión se eligió por ser la más cercana en años, no porque cubra el año del vehículo */
    aproximada?: boolean;
}

/**
 * Origen del año de fabricación:
 *  - fabricacion: dato real de fabricación (Silverdat «MM/YYYY» o plantilla del corredor)
 *  - matriculacion: se tomó el año de matriculación porque no había fabricación
 *  - estimado: calculado por ORION a partir de la matrícula
 *  - manual: lo escribió una persona en PRE-EMISIÓN
 */
export type FuenteAnio = 'fabricacion' | 'matriculacion' | 'estimado' | 'manual';

/** Campos de la versión del catálogo que se usan para verificar (los demás se ignoran). */
export interface VersionCatalogo {
    marca: string;
    modelo?: string;
    version?: string;
    kw?: number;
    plazas?: number;
    num_plazas_min?: number;
    num_plazas_max?: number;
    fec_ini_comerc?: string;
    fec_fin_comerc?: string;
    /** años de inicio y fin de comercialización ya calculados (hasta 0 = sin fin) */
    desde?: number;
    hasta?: number;
    /** año de inicio si el catálogo no trae fec_ini_comerc */
    anyo?: number;
    /** tipología ORION calculada al cargar el catálogo (tipologia.ts) */
    tipo?: string;
}

/**
 * Tolerancia de años entre el año del vehículo y la ventana de la versión.
 * Es 0: el sistema de emisión no admite ni un año fuera de su rango (tolerancia 1 dejaba pasar vehículos
 * que luego el sistema rechazaba).
 */
export const TOLERANCIA_ANIOS = 0;

// ─── Utilidades de texto ─────────────────────────────────────────────────────

const norm = (s: string | undefined): string =>
    (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
        .replace(/['’`´"]/g, '').replace(/[^A-Z0-9]+/g, ' ').trim();

const tokens = (s: string | undefined): string[] => norm(s).split(' ').filter(Boolean);
const tieneDigito = (t: string) => /\d/.test(t);
const soloDigitos = (t: string) => t.replace(/\D/g, '');

/** Palabras que describen la carrocería, no el modelo. */
const RUIDO = new Set(['FURGON', 'FURGONETA', 'CAMION', 'TURISMO', 'VAN', 'PICK', 'UP']);

// ─── Ventana de comercialización ─────────────────────────────────────────────

export function ventanaAnios(c: Pick<VersionCatalogo, 'fec_ini_comerc' | 'fec_fin_comerc' | 'anyo' | 'desde' | 'hasta'>): { ini: number | null; fin: number | null } {
    const anio = (s?: string): number | null => {
        const m = (s ?? '').match(/(\d{4})/);
        return m ? parseInt(m[1], 10) : null;
    };
    const ini = anio(c.fec_ini_comerc) ?? (c.desde && c.desde > 1900 ? c.desde : null) ?? (c.anyo && c.anyo > 1900 ? c.anyo : null);
    let fin = anio(c.fec_fin_comerc) ?? (c.hasta && c.hasta > 1900 ? c.hasta : null);
    if (fin !== null && fin >= 2090) fin = null;   // fecha «sin fin» del catálogo
    return { ini, fin };
}

/** true si el año del vehículo cae dentro de la ventana de la versión (con la tolerancia). */
export function dentroDeVentana(c: Pick<VersionCatalogo, 'fec_ini_comerc' | 'fec_fin_comerc' | 'anyo' | 'desde' | 'hasta'>, anio: number | null | undefined): boolean | null {
    if (!anio) return null;
    const { ini, fin } = ventanaAnios(c);
    if (ini === null && fin === null) return null;
    if (ini !== null && anio < ini - TOLERANCIA_ANIOS) return false;
    if (fin !== null && anio > fin + TOLERANCIA_ANIOS) return false;
    return true;
}

// ─── Tipología declarada ─────────────────────────────────────────────────────

/** «Camión rígido», «camion rigido», «Furgoneta»… → TipoKey. Devuelve null si no se reconoce. */
export function tipoDesdeTexto(t: string | undefined): TipoKey | null {
    const n = norm(t);
    if (!n) return null;
    if (/MOTO/.test(n)) return 'moto';
    if (/CABEZA|TRACTORA/.test(n)) return 'cabeza_tractora';
    if (/REMOLQUE/.test(n)) return 'remolque';
    if (/MINIBUS|AUTOBUS|AUTOCAR/.test(n)) return 'minibus_autocar';
    if (/INDUSTRIAL|ESPECIAL|MAQUINA|AGRICOLA/.test(n)) return 'industrial';
    if (/CAMION/.test(n)) return 'camion';
    if (/FURGONETA/.test(n)) return 'furgoneta';
    if (/FURGON/.test(n)) return 'furgon';
    if (/TURISMO|TODOTERRENO|DERIVADO/.test(n)) return 'turismo';
    return null;
}

const nombreTipo = (k: TipoKey) => TIPO_INFO[k].label;

// ─── Verificación ────────────────────────────────────────────────────────────

export function revisarIdentificacion(d: VehiculoDeclarado, c: VersionCatalogo, ventanaSistema?: VentanaSistema | null): Hallazgo[] {
    const out: Hallazgo[] = [];
    const add = (codigo: CodigoHallazgo, gravedad: Gravedad, texto: string) => out.push({ codigo, gravedad, texto });

    const nombreVersion = [c.marca, c.modelo, c.version].filter(Boolean).join(' ');

    // 1 · Año frente a la ventana de la versión
    //     Manda la ventana que el sistema de emisión ha indicado para ese ID (exacta). Si no la conocemos se usa la
    //     del catálogo; si esa tiene un extremo abierto no se puede garantizar nada y el vehículo va a «Revisar».
    const anioFab = (d.anioFab ?? d.anio) && (d.anioFab ?? d.anio)! > 1900 ? (d.anioFab ?? d.anio)! : null;
    const anioMat = d.anioMat && d.anioMat > 1900 ? d.anioMat : null;
    if (!anioFab) {
        add('ANIO_SIN', 'bloquea', 'No hay año de fabricación del vehículo: sin él no se puede comprobar la versión ni emitir.');
    } else {
        const vs = ventanaSistema && ventanaSistema.fabMin ? ventanaSistema : null;
        const { ini, fin } = vs ? { ini: vs.fabMin, fin: vs.fabMax } : ventanaAnios(c);
        if (ini !== null && anioFab < ini - TOLERANCIA_ANIOS) {
            add('ANIO_ANTERIOR', 'bloquea', `El vehículo es de ${anioFab} y esta versión ${vs ? 'solo admite desde' : 'se empezó a comercializar en'} ${ini}.`);
        } else if (fin !== null && anioFab > fin + TOLERANCIA_ANIOS) {
            add('ANIO_POSTERIOR', 'bloquea', `El vehículo es de ${anioFab} y esta versión ${vs ? 'solo admite hasta' : 'se dejó de comercializar en'} ${fin}.`);
        } else if (!vs && (ini === null || fin === null)) {
            add('VENTANA_ABIERTA', 'bloquea',
                ini === null && fin === null
                    ? 'El catálogo no indica entre qué años se comercializó esta versión: no se puede comprobar que el año del vehículo sea válido.'
                    : fin === null
                        ? `El catálogo no indica cuándo dejó de comercializarse esta versión (desde ${ini}): el sistema puede tener un fin que ORION no conoce.`
                        : `El catálogo no indica cuándo empezó esta versión (hasta ${fin}): no se puede comprobar el año del vehículo.`);
        }
        if (vs && anioMat && vs.matMin && vs.matMax && (anioMat < vs.matMin || anioMat > vs.matMax)) {
            add('MATRICULACION_FUERA', 'bloquea', `La matriculación es de ${anioMat} y el sistema solo admite ${vs.matMin} a ${vs.matMax} para esta versión.`);
        }
        if (anioMat && anioMat < anioFab) {
            add('ANIO_INCOHERENTE', 'aviso', `Matriculado en ${anioMat} y fabricado en ${anioFab}: la matriculación no puede ser anterior a la fabricación.`);
        }
        if (d.fuenteAnio === 'estimado') {
            add('ANIO_ESTIMADO', 'aviso', `El año ${anioFab} lo calculó ORION a partir de la matrícula; no viene de Silverdat ni de la plantilla.`);
        } else if (d.fuenteAnio === 'matriculacion') {
            add('ANIO_FAB_MATRICULACION', 'aviso', `Sin año de fabricación: se usa el de matriculación (${anioFab}). Pueden diferir en un año.`);
        }
    }
    if (d.aproximada) {
        add('APROXIMADA', 'bloquea', `Ninguna versión del catálogo cubre el año del vehículo; esta es la más cercana (${nombreVersion}). Confírmala o elige otra.`);
    }

    // 2 · Modelo declarado frente a modelo + versión del catálogo
    const marcaCat = tokens(c.marca);
    const marcaDecl = tokens(d.marca);
    const modeloDecl = tokens(d.modelo).filter(t => !marcaCat.includes(t) && !marcaDecl.includes(t) && !RUIDO.has(t));
    const sig = modeloDecl.filter(t => t.length >= 3 || tieneDigito(t));
    const hayTokens = tokens(`${c.modelo ?? ''} ${c.version ?? ''}`);
    const hayCompacto = hayTokens.join('');
    if (sig.length > 0) {
        // Un código (35C12, ML150E28, 206…) cuenta como hallado si aparece igual o con las mismas cifras
        // (35S13 y 35C13 son la misma gama); si las cifras cambian es otro modelo.
        const esta = (t: string) => hayTokens.includes(t) || hayCompacto.includes(t)
            || (tieneDigito(t) && hayTokens.some(h => tieneDigito(h) && soloDigitos(h) === soloDigitos(t)));
        const hallados = sig.filter(esta);
        const faltan = sig.filter(t => !esta(t));
        const codigosFalta = faltan.filter(tieneDigito);
        if (hallados.length === 0 || codigosFalta.length > 0) {
            add('MODELO_NO_COINCIDE', 'bloquea',
                `El estudio dice «${(d.modelo ?? '').trim()}» y la versión elegida es «${nombreVersion}».`);
        } else if (faltan.length > 0) {
            add('MODELO_PARCIAL', 'aviso',
                `En «${nombreVersion}» no aparece ${faltan.map(t => `«${t}»`).join(', ')} del modelo del estudio.`);
        }
    }

    // 3 · Marca: solo se avisa si es otra marca y el modelo no la nombra (los carroceros no cuentan)
    if (marcaDecl.length > 0 && !marcaDecl.some(t => marcaCat.includes(t))) {
        const modeloNombraMarca = tokens(d.modelo).some(t => marcaCat.includes(t));
        const modeloHallado = sig.length > 0 && sig.every(t => hayTokens.includes(t) || hayCompacto.includes(t) || (tieneDigito(t) && hayTokens.some(h => tieneDigito(h) && soloDigitos(h) === soloDigitos(t))));
        if (!modeloNombraMarca && modeloHallado) {
            add('MARCA_DISTINTA', 'aviso', `El estudio dice «${(d.marca ?? '').trim()}» y la versión es de ${c.marca}.`);
        }
    }

    // 4 · Tipología y categoría
    const tipoDecl = tipoDesdeTexto(d.tipo);
    const tipoCat = esTipoKey(c.tipo) ? c.tipo : null;
    if (!tipoCat || tipoCat === 'sin_clasificar') {
        add('SIN_TIPOLOGIA', 'aviso', 'El catálogo no clasifica esta versión (falta su clase en la tabla de tipologías).');
    } else {
        if (!TIPO_INFO[tipoCat].admitido) {
            add('NO_ADMITIDO', 'bloquea', `${nombreTipo(tipoCat)}: tipo de vehículo que MMT no admite en flotas.`);
        }
        if (!tipoDecl) {
            add('TIPO_VACIO', 'aviso', `El estudio no indica tipología; el catálogo lo clasifica como ${nombreTipo(tipoCat).toLowerCase()}.`);
        } else if (TIPO_INFO[tipoDecl].categoria !== TIPO_INFO[tipoCat].categoria) {
            add('CATEGORIA_DISTINTA', 'bloquea',
                `El estudio lo trata como ${nombreTipo(tipoDecl).toLowerCase()} (${TIPO_INFO[tipoDecl].categoria}.ª categoría) y el catálogo lo clasifica como ${nombreTipo(tipoCat).toLowerCase()} (${TIPO_INFO[tipoCat].categoria}.ª).`);
        }
    }

    // 5 · Potencia y plazas (solo si el estudio las trae)
    if (d.kw && d.kw > 0 && c.kw && c.kw > 0 && Math.abs(d.kw - c.kw) / c.kw > 0.15) {
        add('KW_DISTINTO', 'aviso', `El estudio indica ${Math.round(d.kw)} kW y la versión tiene ${Math.round(c.kw)} kW.`);
    }
    if (d.plazas && d.plazas > 0) {
        const min = c.num_plazas_min ?? c.plazas, max = c.num_plazas_max ?? c.plazas;
        if (min && max && (d.plazas < min || d.plazas > max)) {
            add('PLAZAS_DISTINTAS', 'aviso', `El estudio indica ${d.plazas} plazas y la versión admite ${min === max ? min : `${min} a ${max}`}.`);
        }
    }

    return out;
}

/** Resultado de la verificación de un vehículo, tal como lo consume EMISIÓN. */
export interface InfoVerificacion {
    /** discrepancias graves (impiden emitir mientras no se confirmen) */
    bloquea: string[];
    avisos: string[];
    /** el usuario dio por buena la identificación pese a las discrepancias */
    confirmada: boolean;
    /** año del vehículo usado para verificar (Silverdat → estudio → matrícula) */
    anio: number | null;
    /** años tal como están hoy en PRE-EMISIÓN (los que el usuario ve y puede corregir) */
    anioFab: number | null;
    anioMat: number | null;
    /** de dónde sale el año de fabricación */
    fuenteAnio?: FuenteAnio;
    /** ventana usada: la del sistema (exacta), la del catálogo o ninguna (abierta) */
    ventana?: { min: number | null; max: number | null; origen: 'sistema' | 'catalogo' | 'abierta' } | null;
    /** quién y cuándo dio por buena la identificación */
    confirmadaPor?: string;
    confirmadaFecha?: string;
}

export const bloquea = (h: Hallazgo[]) => h.filter(x => x.gravedad === 'bloquea');
export const avisos = (h: Hallazgo[]) => h.filter(x => x.gravedad === 'aviso');
