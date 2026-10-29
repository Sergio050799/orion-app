// ─── EMISIÓN MASIVA ──────────────────────────────────────────────────────────
//
// Construye las filas de la plantilla oficial de emisión masiva (hoja DATOS, 110 columnas) a partir de lo que
// ya sabe ORION tras el estudio: vehículo identificado en el catálogo, años, matrícula, coberturas confirmadas
// en INFORME y prima ofertada. Lo que no se conoce al estudiar (ID cliente, ID flota, ID colectivo, valores
// comunes) se rellena en la zona manual del paso EMISIÓN; el ID de perceptor llega del corredor.
//
// Módulo puro (sin React ni acceso a ficheros): lo usan la pantalla y el generador del Excel.

import type { TipoKey } from '../catalogo/tipologia';
import type { InfoVerificacion } from '../catalogo/verificacion';
import {
    aEmision, grupoCob, normalizarConfig, pendientesEmision, tipoKeyDesdeEtiqueta, tipoNormEtiqueta, validarConfig,
    type ConfigCobertura,
} from './catalogoCoberturas';
import type { EmisionDatos } from './carpeta';

// Orden y nombre exactos de las columnas de la hoja DATOS de la plantilla oficial.
export const COLUMNAS_EMISION = [
    'ID_VEH_MMT', 'CODIGO_BASE7', 'ANHO_FABRICACION', 'ANHO_MATRICULACION', 'ID_ADQUISICION', 'ID_USO', 'NUM_PLAZAS', 'ID_GARAJE',
    'ID_ELEMENTOS_SEGURIDAD', 'ID_KMS_ANUALES', 'ID_AMBITO_CIRCULACION', 'ID_FRECUENCIA_USO', 'ID_REMOLQUE', 'CODPOSTAL_CIRC',
    'ID_TIPO_MERCANCIA', 'MATRICULA', 'NUM_BASTIDOR', 'DESCRIPCION_ACCESORIOS', 'VALOR_ACCESORIOS', 'CONDUCCION_INDISTINTA',
    'QUIEN_ES_COND_HAB', 'ID_COND_HAB', 'NUM_DOC_COND_HAB', 'NOMBRE_COND_HAB', 'APE1_COND_HAB', 'APE2_COND_HAB', 'SEXO_COND_HAB',
    'FEC_NAC_COND_HAB', 'FEC_CARN_COND_HAB', 'TIPO_CARN_COND_HAB', 'PAIS_CARN_COND_HAB', 'EST_CIVIL_COND_HAB', 'OCUP_COND_HAB',
    'QUIEN_ES_COND_OCAS', 'ID_COND_OCAS', 'NUM_DOC_COND_OCAS', 'NOMBRE_COND_OCAS', 'APE1_COND_OCAS', 'APE2_COND_OCAS', 'SEXO_COND_OCAS',
    'FEC_NAC_COND_OCAS', 'FEC_CARN_COND_OCAS', 'TIPO_CARN_COND_OCAS', 'PAIS_CARN_COND_OCAS', 'EST_CIVIL_COND_OCAS', 'OCUP_COND_OCAS',
    'ID_COLECTIVO', 'ID_FLOTA', 'ASEGURADORA_ANTERIOR', 'DACC_CERTIFICADO', 'DACC_ANYOS', 'DACC_SINI', 'SINCO_POLIZA', 'SINCO_NUM_DOC',
    'SINCO_MATRICULA', 'SINCO_RESP_ANHOS', 'SINCO_RESP_SINI', 'ID_VINC', 'TIPO_VINC', 'ID_TOM', 'NUM_DOC_TOM', 'NOMBRE_TOM', 'APE1_TOM',
    'APE2_TOM', 'SEXO_TOM', 'FEC_NAC_TOM', 'DIREC_TOM', 'POB_TOM', 'COD_POSTAL_TOM', 'PAIS_TOM', 'TEL_TOM', 'EMAIL_TOM',
    'TIPO_EMPRESA_TOMADOR', 'QUIEN_ES_PROP', 'ID_PROP', 'NUM_DOC_PROP', 'NOMBRE_PROP', 'APE1_PROP', 'APE2_PROP', 'SEXO_PROP',
    'FEC_NAC_PROP', 'DIREC_PROP', 'POB_PROP', 'COD_POSTAL_PROP', 'PAIS_PROP', 'TEL_PROP', 'EMAIL_PROP', 'TIPO_EMPRESA_PROPIETARIO',
    'ID_PRODUCTO', 'ID_FRANQUICIA', 'LUNAS', 'ROBO', 'INCENDIO', 'PERDIDA_TOTAL', 'ID_DEF_JUR', 'AJT', 'MULTAS', 'CURSO_PUNTOS',
    'ID_SEG_COND', 'ID_AV', 'SUBSIDIO', 'ANIM', 'CASCO', 'PRECIO_OBJETIVO', 'PERIODICIDAD_PAGO', 'FECHA_EFECTO', 'ID_INTERVINIENTE',
    'IBAN', 'IBAN_TITULAR', 'COBRO_EXT_EXCEP',
] as const;

export type ColumnaEmision = typeof COLUMNAS_EMISION[number];
export type ValoresFila = Partial<Record<ColumnaEmision, string>>;

/** Letra de columna de Excel (A, B… Z, AA…) para el índice 0-based. */
export function letraColumna(i: number): string {
    let n = i + 1, s = '';
    while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
    return s;
}

// ─── Listas de la plantilla (hojas ocultas HIDDEN_*) usadas en la zona manual ─
export const LISTAS_EMISION: Partial<Record<ColumnaEmision, string[]>> = {
    ID_ADQUISICION: ['CAMBIO_SEGURO', 'CAMBIO_SIN_SEGURO', 'NUEVO_KM0', 'RENTING', 'SEGUNDAMANO_C', 'SEGUNDAMANO_P'],
    ID_USO: ['AGRICOLAS', 'ALQUILER_CON_CONDUCTOR', 'ALQUILER_CON_CONDUCTOR_VTC', 'ALQUILER_SIN_CONDUCTOR', 'AMBULANCIA', 'AUTOESCUELA',
        'COMERCIAL_SERVICIO_FUNERARIO', 'COMERCIAL_SERVICIO_PARTICULAR', 'COMERCIAL_SERVICIO_PUBLICO', 'COMPETICION', 'CORTESIA', 'OCASION',
        'PARTICULAR', 'PARTICULAR_VEH_FUNERARIO', 'PLACA', 'SERVICIO_PROPIO', 'SERVICIO_PUBLICO', 'TAXI_CONDUCIDO_EMPLEADO',
        'TAXI_CONDUCIDO_PROPIETARIO', 'TAXI_SIN_TAXIMETRO', 'TRANSPORTES_PROPIOS', 'VEH_SUSTITUCION'],
    ID_GARAJE: ['CALLE', 'GARAJE_COLECTIVO', 'GARAJE_INDIVIDUAL'],
    ID_ELEMENTOS_SEGURIDAD: ['ALARMA', 'GPS', 'SIN_SEGURIDAD'],
    ID_KMS_ANUALES: ['KM_4000', 'KM_6000', 'KM_8000', 'KM_10000', 'KM_10000a20000', 'KM_MAS_20000'],
    ID_AMBITO_CIRCULACION: ['LOCAL', 'NACIONAL', 'INTERNACIONAL'],
    ID_FRECUENCIA_USO: ['DIARIO', 'FIN_SEMANA', 'OCASIONAL'],
    CONDUCCION_INDISTINTA: ['SI', 'NO'],
    TIPO_EMPRESA_TOMADOR: ['SIN_DEFINIR', 'TIPO_1', 'TIPO_2', 'TIPO_3'],
    QUIEN_ES_PROP: ['TOMADOR', 'OTRO'],
    PERIODICIDAD_PAGO: ['ANUAL', 'SEMESTRAL', 'TRIMESTRAL', 'BIMESTRAL', 'MENSUAL'],
    COBRO_EXT_EXCEP: ['NO', 'SI'],
};

export interface CampoComun {
    col: ColumnaEmision;
    label: string;
    /** 'lista' = desplegable con LISTAS_EMISION; 'cp' = código postal de 5 cifras */
    tipo: 'lista' | 'cp';
    defecto?: string;
    /** Si el estudio ya lo trae por vehículo, el valor común solo rellena los vehículos que no lo tengan. */
    ayuda?: string;
}

export const CAMPOS_COMUNES: CampoComun[] = [
    { col: 'ID_ADQUISICION',         label: 'Adquisición',               tipo: 'lista' },
    { col: 'ID_USO',                 label: 'Uso',                       tipo: 'lista', ayuda: 'Si el estudio trae el uso del vehículo (particular, servicio público, transportes propios) se usa ese.' },
    { col: 'ID_GARAJE',              label: 'Garaje',                    tipo: 'lista' },
    { col: 'ID_ELEMENTOS_SEGURIDAD', label: 'Elementos de seguridad',    tipo: 'lista' },
    { col: 'ID_KMS_ANUALES',         label: 'Kilómetros anuales',        tipo: 'lista' },
    { col: 'ID_AMBITO_CIRCULACION',  label: 'Ámbito de circulación',     tipo: 'lista', ayuda: 'Si el estudio trae el ámbito del vehículo se usa ese.' },
    { col: 'ID_FRECUENCIA_USO',      label: 'Frecuencia de uso',         tipo: 'lista' },
    { col: 'CODPOSTAL_CIRC',         label: 'Código postal de circulación', tipo: 'cp' },
    { col: 'CONDUCCION_INDISTINTA',  label: 'Conducción indistinta',     tipo: 'lista' },
    { col: 'TIPO_EMPRESA_TOMADOR',   label: 'Tipo de empresa del tomador', tipo: 'lista' },
    { col: 'QUIEN_ES_PROP',          label: 'Propietario',               tipo: 'lista', defecto: 'TOMADOR' },
    { col: 'COBRO_EXT_EXCEP',        label: 'Cobro externo excepcional', tipo: 'lista', defecto: 'NO' },
    { col: 'PERIODICIDAD_PAGO',      label: 'Periodicidad de pago',      tipo: 'lista', ayuda: 'Si DATOS GENERALES trae la periodicidad se usa esa.' },
];

// ─── Derivaciones desde el estudio ───────────────────────────────────────────

const quitaTildes = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

const USO_ESTUDIO: Record<string, string> = {
    'particular': 'PARTICULAR',
    'servicio publico': 'SERVICIO_PUBLICO',
    'transportes propios': 'TRANSPORTES_PROPIOS',
};
const AMBITO_ESTUDIO: Record<string, string> = { 'nacional': 'NACIONAL', 'internacional': 'INTERNACIONAL', 'local': 'LOCAL' };
const PERIODICIDAD_ESTUDIO: Record<string, string> = {
    'anual': 'ANUAL', 'semestral': 'SEMESTRAL', 'trimestral': 'TRIMESTRAL', 'bimestral': 'BIMESTRAL', 'mensual': 'MENSUAL',
};

export const matriculaLimpia = (m: string) => (m || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

/** dd/mm/aaaa (o aaaa-mm-dd) → dd/mm/aaaa; '' si no se entiende. */
export function fechaDMY(raw?: string): string {
    const t = (raw ?? '').trim();
    let m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
    if (m) return `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[3]}`;
    m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

// ─── Entrada y salida ────────────────────────────────────────────────────────

export interface EntradaEmision {
    trabajoRows: Record<string, string>[];
    /** matrícula → id del vehículo en el catálogo (paso PRE-EMISIÓN) */
    catalogoSeleccion: Record<string, string>;
    configCoberturas: Record<string, ConfigCobertura>;
    /** filas de OFERTA (prima ofertada por matrícula) */
    ofertaRows: Record<string, string>[];
    emision?: EmisionDatos;
    idPerceptor?: string;
    /** efecto y periodicidad de DATOS GENERALES */
    efectoGenerales?: string;
    periodicidadGenerales?: string;
    /** verificación de la identificación por matrícula limpia (la calcula PRE-EMISIÓN) */
    verificacion?: Record<string, InfoVerificacion>;
}

export interface FilaEmision {
    matricula: string;
    tipo: TipoKey;
    tipoEtiqueta: string;
    valores: ValoresFila;
    /** impiden generar el fichero */
    errores: string[];
    /** se muestran, no bloquean */
    avisos: string[];
}

export interface ResultadoEmision {
    filas: FilaEmision[];
    /** problemas de la flota entera (ID cliente, ID flota, perceptor, límite de filas) */
    erroresGlobales: string[];
    avisosGlobales: string[];
    /** true si se puede generar el fichero */
    listo: boolean;
}

export const MAX_FILAS_EMISION = 1000;

export function prepararEmision(e: EntradaEmision): ResultadoEmision {
    const em = e.emision ?? {};
    const comunes = em.comunes ?? {};
    const erroresGlobales: string[] = [];
    const avisosGlobales = new Set<string>();

    if (!(em.idCliente ?? '').trim()) erroresGlobales.push('Falta el ID de cliente (ID_TOM).');
    if (!(em.idFlota ?? '').trim()) erroresGlobales.push('Falta el ID de flota (ID_FLOTA).');
    if (!(e.idPerceptor ?? '').trim()) erroresGlobales.push('El corredor no tiene ID de perceptor (ID_INTERVINIENTE). Se rellena en la ficha del corredor.');

    const fechaEfecto = fechaDMY(em.fechaEfecto) || fechaDMY(e.efectoGenerales);
    if (!fechaEfecto) erroresGlobales.push('Falta la fecha de efecto (FECHA_EFECTO).');
    const periodicidad = PERIODICIDAD_ESTUDIO[quitaTildes(e.periodicidadGenerales ?? '')] ?? comunes.PERIODICIDAD_PAGO ?? '';
    if (!periodicidad) avisosGlobales.add('Falta la periodicidad de pago.');

    for (const c of CAMPOS_COMUNES) {
        if (c.col === 'ID_USO' || c.col === 'ID_AMBITO_CIRCULACION' || c.col === 'PERIODICIDAD_PAGO') continue;   // pueden venir del estudio
        if (!(comunes[c.col] ?? c.defecto)) avisosGlobales.add(`Falta ${c.label.toLowerCase()} (${c.col}).`);
    }

    const ofertaPorMat = new Map<string, string>();
    for (const r of e.ofertaRows) ofertaPorMat.set(matriculaLimpia(r['matricula'] ?? ''), r['oferta_prima_mmt'] ?? '');

    const vehiculos = e.trabajoRows.filter(r => (r['matricula'] ?? '').trim());
    if (vehiculos.length === 0) erroresGlobales.push('No hay vehículos en el trabajo.');
    if (vehiculos.length > MAX_FILAS_EMISION) erroresGlobales.push(`La plantilla admite como máximo ${MAX_FILAS_EMISION} vehículos por fichero (hay ${vehiculos.length}).`);

    const filas: FilaEmision[] = vehiculos.map(r => {
        const matricula = matriculaLimpia(r['matricula'] ?? '');
        const tipoEtiqueta = tipoNormEtiqueta(r['tipo_vehiculo'] ?? '');
        const tipo = tipoKeyDesdeEtiqueta(tipoEtiqueta);
        const errores: string[] = [];
        const avisos: string[] = [];
        const v: ValoresFila = {};

        // Identificación en el catálogo
        const idVeh = (e.catalogoSeleccion[r['matricula'] ?? ''] ?? e.catalogoSeleccion[matricula] ?? '').trim();
        if (idVeh) v.ID_VEH_MMT = idVeh; else errores.push('Sin identificar en el catálogo (PRE-EMISIÓN).');
        v.MATRICULA = matricula;
        // Años del VEHÍCULO (nunca los de la versión del catálogo). Si se corrigieron en PRE-EMISIÓN, mandan esos.
        const ver = e.verificacion?.[matricula];
        // El sistema espera 4 cifras: «09/2020» (Silverdat) se manda como 2020
        const aAnio = (t: string) => (t.match(/(\d{4})/) ?? [])[1] ?? '';
        const fab = ver?.anioFab ? String(ver.anioFab) : aAnio(r['anyo_fabricacion'] ?? '');
        let mat = ver?.anioMat ? String(ver.anioMat) : aAnio(r['anyo_matricula'] ?? '');
        if (!mat && ver?.anio) { mat = String(ver.anio); avisos.push('Año de matriculación estimado por la matrícula: compruébalo.'); }
        if (fab) v.ANHO_FABRICACION = fab;
        else if (idVeh) errores.push('Sin año de fabricación: el sistema lo exige y debe coincidir con el rango de la versión.');
        else avisos.push('Sin año de fabricación.');
        if (mat) v.ANHO_MATRICULACION = mat; else avisos.push('Sin año de matriculación.');

        // La identificación debe estar verificada: sin PRE-EMISIÓN revisada no se emite
        if (idVeh) {
            if (!ver) errores.push('Identificación sin verificar: abre PRE-EMISIÓN para comprobarla.');
            else if (ver.bloquea.length > 0 && !ver.confirmada) {
                errores.push(`Identificación por revisar en PRE-EMISIÓN: ${ver.bloquea[0]}${ver.bloquea.length > 1 ? ` (+${ver.bloquea.length - 1} más)` : ''}`);
            }
            if (ver) for (const a of ver.avisos) avisos.push(`Identificación: ${a}`);
        }
        const plazas = (r['plazas'] ?? '').trim();
        if (plazas) v.NUM_PLAZAS = plazas; else avisos.push('Sin número de plazas.');

        // Uso y ámbito: el del estudio manda; si no lo trae, el valor común
        v.ID_USO = USO_ESTUDIO[quitaTildes(r['uso'] ?? '')] ?? comunes.ID_USO ?? '';
        if (!v.ID_USO) avisos.push('Sin uso (ID_USO).');
        v.ID_AMBITO_CIRCULACION = AMBITO_ESTUDIO[quitaTildes(r['ambito'] ?? '')] ?? comunes.ID_AMBITO_CIRCULACION ?? '';
        if (!v.ID_AMBITO_CIRCULACION) avisos.push('Sin ámbito (ID_AMBITO_CIRCULACION).');

        // Valores comunes
        for (const c of CAMPOS_COMUNES) {
            if (c.col === 'ID_USO' || c.col === 'ID_AMBITO_CIRCULACION' || c.col === 'PERIODICIDAD_PAGO') continue;
            const val = comunes[c.col] ?? c.defecto;
            if (val) v[c.col] = val;
        }
        if (periodicidad) v.PERIODICIDAD_PAGO = periodicidad;

        // Intervinientes
        if (em.idCliente) v.ID_TOM = em.idCliente.trim();
        if (em.idFlota) v.ID_FLOTA = em.idFlota.trim();
        if (em.idColectivo) v.ID_COLECTIVO = em.idColectivo.trim();
        if (e.idPerceptor) v.ID_INTERVINIENTE = e.idPerceptor.trim();
        if (fechaEfecto) v.FECHA_EFECTO = fechaEfecto;

        // Coberturas: solo las confirmadas en INFORME
        if (!grupoCob(tipo)) {
            errores.push(tipo === 'minibus_autocar' ? 'Tipología no admitida en flotas (minibús, autocar).' : 'Tipología sin clasificar.');
        } else {
            const clave = `${tipoEtiqueta}||${r['coberturas_solicitadas'] || 'Sin cobertura'}`;
            const cfg = normalizarConfig(tipo, e.configCoberturas[clave]);
            if (!cfg) errores.push('Coberturas sin confirmar en INFORME.');
            else {
                const errs = validarConfig(tipo, cfg);
                if (errs.length) errores.push(...errs);
                else {
                    Object.assign(v, aEmision(tipo, cfg));
                    for (const p of pendientesEmision(tipo, cfg)) avisosGlobales.add(`${tipoEtiqueta.charAt(0) + tipoEtiqueta.slice(1).toLowerCase()} · ${p}`);
                }
            }
        }

        // Prima
        const prima = parseFloat((ofertaPorMat.get(matricula) ?? '').replace(',', '.'));
        if (!isNaN(prima) && prima > 0) v.PRECIO_OBJETIVO = prima.toFixed(2);
        else avisos.push('Sin prima ofertada (PRECIO_OBJETIVO).');

        return { matricula, tipo, tipoEtiqueta, valores: v, errores, avisos };
    });

    const hayErrorFila = filas.some(f => f.errores.length > 0);
    return { filas, erroresGlobales, avisosGlobales: [...avisosGlobales], listo: erroresGlobales.length === 0 && !hayErrorFila && filas.length > 0 };
}
