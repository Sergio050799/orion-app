// ─── CATÁLOGO ÚNICO DE COBERTURAS ────────────────────────────────────────────
//
// Fuente única de reglas: qué productos, franquicias y coberturas admite cada tipología, con el código
// (ID) que espera el sistema de emisión masiva. Lo leen INFORME (configurador), OFERTA, EMISIÓN, el
// validador (coberturas.ts) y la plantilla del corredor.
//
// Origen de los datos: capturas de pantalla del sistema (qué es fijo y qué es desplegable), archivo
// ID_cobertura.xlsx (códigos) y listas ocultas de la plantilla de emisión masiva. Las decisiones de
// suscripción (franquicias, categorías) las ha dictado Sergio. Lo que no tiene código queda marcado
// con `sinId`; nunca se inventa un ID.

import { TIPO_INFO, type TipoKey } from '../catalogo/tipologia';
import { nf } from '../../lib/fmt';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type ProductoKey = 'terceros' | 'terceros_ampliado' | 'todo_riesgo' | 'moto_terceros' | 'moto_ampliado';

/** Estructura de coberturas: a1 = 1.ª categoría, a2 = 2.ª, ind = industrial / especial, a3 = motos (3.ª). */
export type GrupoCob = 'a1' | 'a2' | 'ind' | 'a3';

/** Columnas de la plantilla de emisión masiva que alimentan las coberturas. */
export type ColEmision =
    | 'ID_PRODUCTO' | 'ID_FRANQUICIA' | 'LUNAS' | 'ROBO' | 'INCENDIO' | 'PERDIDA_TOTAL'
    | 'ID_DEF_JUR' | 'AJT' | 'MULTAS' | 'CURSO_PUNTOS' | 'ID_SEG_COND' | 'ID_AV'
    | 'SUBSIDIO' | 'ANIM' | 'CASCO';

export interface Opcion {
    value: string;
    label: string;
    /** Código para la plantilla de emisión (ID del archivo ID_cobertura o SI / NO). */
    id?: string;
}

export interface CampoDef {
    id: string;
    grupo: string;
    label: string;
    kind: 'fijo' | 'select';
    /** Texto de una garantía fija (no desplegable). */
    fijo?: string;
    opciones?: Opcion[];
    defecto?: string;
    /** Columna de emisión que alimenta (si existe). */
    col?: ColEmision;
    /** Valor que se emite cuando la garantía es fija e incluida. */
    emiteFijo?: string;
    /** Motivo por el que este campo no se puede emitir todavía. */
    sinId?: string;
}

export interface ProductoDef {
    key: ProductoKey;
    label: string;
    /** Texto que usa la hoja de coberturas de la plantilla del corredor y la hoja OFERTA. */
    etiquetaHoja: string;
    idProducto: string;
    categorias: (1 | 2 | 3)[];
}

export interface ConfigCobertura {
    producto: ProductoKey;
    /** Franquicia en euros (todo riesgo con franquicia y terceros ampliado de moto). */
    franquicia?: number;
    /** Valor elegido en cada desplegable: id del campo, valor de la opción. */
    opciones: Record<string, string>;
}

// ─── Productos ───────────────────────────────────────────────────────────────

export const PRODUCTOS: ProductoDef[] = [
    { key: 'terceros',          label: 'Terceros',                          etiquetaHoja: 'Terceros',                        idProducto: 'AUTO_TERC',       categorias: [1, 2] },
    { key: 'terceros_ampliado', label: 'Terceros ampliado',                 etiquetaHoja: 'Terceros Ampliado',               idProducto: 'AUTO_TERAMP',     categorias: [1, 2] },
    { key: 'todo_riesgo',       label: 'Todo riesgo con franquicia',        etiquetaHoja: 'Todo Riesgo con Franquicia',      idProducto: 'AUTO_TRCF',       categorias: [1, 2] },
    { key: 'moto_terceros',     label: 'Terceros',                          etiquetaHoja: 'Terceros',                        idProducto: 'TERCEROS_MOTO',   categorias: [3] },
    { key: 'moto_ampliado',     label: 'Terceros ampliado con franquicia',  etiquetaHoja: 'Terceros Ampliado con Franquicia', idProducto: 'COMB_MOTO_FRANQ', categorias: [3] },
];

export const PRODUCTO_DEF: Record<ProductoKey, ProductoDef> =
    Object.fromEntries(PRODUCTOS.map(p => [p.key, p])) as Record<ProductoKey, ProductoDef>;

// ─── Franquicias (decididas por suscripción) ─────────────────────────────────

export const FRANQUICIAS_CAT1 = [120, 180, 240, 300, 450, 600, 750, 950, 1200] as const;
export const FRANQUICIAS_CAT2 = [1800, 2400] as const;
export const FRANQUICIAS_MOTO = [300, 400, 500, 600, 800, 1000, 2000, 2500, 3000] as const;

// ─── Tipología → estructura ──────────────────────────────────────────────────

const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** Convierte la etiqueta de tipo de vehículo de ORION (TURISMO, CAMION RIGIDO…) en una clave de tipología. */
export function tipoKeyDesdeEtiqueta(label: string): TipoKey {
    const u = norm(label);
    if (!u) return 'sin_clasificar';
    if (/moto|ciclomotor|scooter/.test(u)) return 'moto';
    if (/autobus|minibus|autocar/.test(u)) return 'minibus_autocar';
    if (/cabeza|tractor/.test(u)) return 'cabeza_tractora';
    if (/semi|remolque/.test(u)) return 'remolque';
    if (/industrial|especial|agricola/.test(u)) return 'industrial';
    if (/camion|rigido/.test(u)) return 'camion';
    if (/furgon/.test(u)) return 'furgoneta';
    if (/turismo|todoterreno|todo terreno|suv|derivado/.test(u)) return 'turismo';
    return 'sin_clasificar';
}

export function grupoCob(tipo: TipoKey): GrupoCob | null {
    switch (tipo) {
        case 'turismo': case 'furgoneta': case 'furgon': return 'a1';
        case 'camion': case 'cabeza_tractora': case 'remolque': return 'a2';
        case 'industrial': return 'ind';
        case 'moto': return 'a3';
        default: return null;          // minibús / autocar (no admitido) y sin clasificar
    }
}

export const categoriaDeTipo = (tipo: TipoKey): 0 | 1 | 2 | 3 => TIPO_INFO[tipo]?.categoria ?? 0;

export function productosPermitidos(tipo: TipoKey): ProductoKey[] {
    const g = grupoCob(tipo);
    if (g === 'a1' || g === 'a2') return ['terceros', 'terceros_ampliado', 'todo_riesgo'];
    if (g === 'ind') return ['terceros'];
    if (g === 'a3') return ['moto_terceros', 'moto_ampliado'];
    return [];
}

export function franquiciasPermitidas(tipo: TipoKey, producto: ProductoKey): number[] {
    const g = grupoCob(tipo);
    if (producto === 'todo_riesgo') return g === 'a1' ? [...FRANQUICIAS_CAT1] : g === 'a2' ? [...FRANQUICIAS_CAT2] : [];
    if (producto === 'moto_ampliado') return g === 'a3' ? [...FRANQUICIAS_MOTO] : [];
    return [];
}

export const llevaFranquicia = (tipo: TipoKey, producto: ProductoKey) => franquiciasPermitidas(tipo, producto).length > 0;

/** Código de franquicia para la plantilla de emisión: F_750 (autos) o FM_300 (motos). */
export const idFranquicia = (tipo: TipoKey, franquicia: number): string =>
    `${grupoCob(tipo) === 'a3' ? 'FM' : 'F'}_${franquicia}`;

/** Producto a partir de la etiqueta de la hoja de coberturas ("Terceros Ampliado", "Todo Riesgo con Franquicia"…). */
export function productoDesdeEtiqueta(label: string, tipo: TipoKey): ProductoKey | null {
    const u = norm(label);
    const g = grupoCob(tipo);
    if (!g) return null;
    const ampliado = u.includes('ampli');
    const todoRiesgo = u.includes('todo') || u.includes('riesgo');
    if (g === 'a3') return ampliado || todoRiesgo ? 'moto_ampliado' : u.includes('tercero') ? 'moto_terceros' : null;
    if (g === 'ind') return 'terceros';
    if (todoRiesgo) return 'todo_riesgo';
    if (ampliado) return 'terceros_ampliado';
    if (u.includes('tercero')) return 'terceros';
    return null;
}

// ─── Campos (garantías) por estructura y producto ────────────────────────────

const NO: Opcion = { value: 'no', label: 'No', id: 'NO' };
const si = (label: string): Opcion => ({ value: 'si', label, id: 'SI' });
const siNo = (labelSi: string): Opcion[] => [si(labelSi), NO];

const SIN_COLUMNA = 'Sin columna en la plantilla de emisión';
const PENDIENTE_REPOSO = 'ID pendiente de asignar (RC en reposo)';

const eurLabel = (n: number) => nf(n);           // 1.800 (punto de millar, sin decimales)

function opcDefensa(g: GrupoCob): { opciones: Opcion[]; defecto: string } {
    if (g === 'a1') return {
        opciones: [
            { value: 'DEFA_1_1', label: 'Hasta 600 €',    id: 'DEFA_1_1' },
            { value: 'DEFA_1_2', label: 'Hasta 1.000 €',  id: 'DEFA_1_2' },
            { value: 'DEFA_1_3', label: 'Hasta 1.500 €',  id: 'DEFA_1_3' },
            { value: 'DEFA_1_4', label: 'Hasta 3.010 €',  id: 'DEFA_1_4' },
            { value: 'DEFA_1_5', label: 'Ilimitada',      id: 'DEFA_1_5' },
            { value: 'NO',       label: 'No',             id: 'NO' },
        ],
        defecto: 'DEFA_1_2',
    };
    if (g === 'a2') return {
        opciones: [
            { value: 'DEFC_1_1', label: 'Hasta 600 €',   id: 'DEFC_1_1' },
            { value: 'DEFC_1_2', label: 'Hasta 1.000 €', id: 'DEFC_1_2' },
            { value: 'DEFC_1_3', label: 'Hasta 1.500 €', id: 'DEFC_1_3' },
            { value: 'NO',       label: 'No',            id: 'NO' },
        ],
        defecto: 'DEFC_1_2',
    };
    return {
        opciones: [
            { value: 'DEFM_1_1', label: 'Hasta 3.005,06 €', id: 'DEFM_1_1' },
            { value: 'DEFM_1_2', label: 'Hasta 800 €',      id: 'DEFM_1_2' },
            { value: 'DEFM_1_3', label: 'Hasta 600 €',      id: 'DEFM_1_3' },
            { value: 'NO',       label: 'No',               id: 'NO' },
        ],
        defecto: 'DEFM_1_2',
    };
}

function opcAsistencia(g: GrupoCob): { opciones: Opcion[]; defecto: string } {
    if (g === 'a1') return {
        opciones: [
            { value: 'NO',     label: 'No',                                   id: 'NO' },
            { value: 'AV_1_1', label: 'AV Oro',                               id: 'AV_1_1' },
            { value: 'AV_1_2', label: 'AV Platino',                           id: 'AV_1_2' },
            { value: 'AV_1_3', label: 'Limitada (máx. 4 asistencias al año)', id: 'AV_1_3' },
        ],
        defecto: 'AV_1_2',
    };
    if (g === 'a2') return {
        opciones: [
            { value: 'NO',     label: 'No',                           id: 'NO' },
            { value: 'AV_1_1', label: 'AV Oro',                       id: 'AV_1_1' },
            { value: 'AV_4_1', label: 'Transporte local y nacional',  id: 'AV_4_1' },
            { value: 'AV_4_2', label: 'Transporte internacional',     id: 'AV_4_2' },
        ],
        defecto: 'NO',
    };
    return {
        opciones: [
            { value: 'NO',      label: 'No',            id: 'NO' },
            { value: 'AVM_1_1', label: 'AV Oro (moto)', id: 'AVM_1_1' },
        ],
        defecto: 'AVM_1_1',
    };
}

function opcSeguroConductor(g: GrupoCob): { opciones: Opcion[]; defecto: string } {
    const no: Opcion = { value: 'NO', label: 'No', id: 'NO' };
    if (g === 'a1') return {
        opciones: [
            { value: 'OCA_1_1', label: 'OM · hasta 22.550 €', id: 'OCA_1_1' },
            { value: 'OCA_1_2', label: 'ON · hasta 30.055 €', id: 'OCA_1_2' },
            { value: 'OCA_1_3', label: 'OO · hasta 37.565 €', id: 'OCA_1_3' },
            { value: 'OCA_1_4', label: 'XM · hasta 18.035 €', id: 'OCA_1_4' },
            { value: 'OCA_1_5', label: 'XN · hasta 24.045 €', id: 'OCA_1_5' },
            { value: 'OCA_1_6', label: 'XO · hasta 30.055 €', id: 'OCA_1_6' },
            no,
        ],
        defecto: 'OCA_1_1',
    };
    if (g === 'a2') return {
        opciones: [
            { value: 'OC_1_1', label: 'OM · hasta 22.550 €', id: 'OC_1_1' },
            { value: 'OC_1_2', label: 'ON · hasta 30.055 €', id: 'OC_1_2' },
            { value: 'OC_1_3', label: 'OO · hasta 37.565 €', id: 'OC_1_3' },
            { value: 'OC_1_4', label: 'OP · hasta 10.000 €', id: 'OC_1_4' },
            { value: 'OC_1_5', label: 'XM · hasta 18.035 €', id: 'OC_1_5' },
            no,
        ],
        defecto: 'OC_1_3',
    };
    return {
        opciones: [
            { value: 'OCM_1_1', label: 'YA · hasta 9.000 €',  id: 'OCM_1_1' },
            { value: 'OCM_1_2', label: 'YB · hasta 12.000 €', id: 'OCM_1_2' },
            no,
        ],
        defecto: 'OCM_1_1',
    };
}

/** Campos visibles para una tipología y un producto, en el orden de las pantallas del sistema. */
export function camposDe(tipo: TipoKey, producto: ProductoKey, franquicia?: number): CampoDef[] {
    const g = grupoCob(tipo);
    if (!g) return [];
    const out: CampoDef[] = [];
    const add = (c: CampoDef) => out.push(c);
    const ampliado = producto === 'terceros_ampliado';
    const todoRiesgo = producto === 'todo_riesgo';
    const motoAmp = producto === 'moto_ampliado';
    const frqTxt = franquicia ? `Franquicia ${eurLabel(franquicia)} €` : 'Franquicia (pendiente de elegir)';

    // Responsabilidad civil obligatoria
    add({ id: 'rco_dm', grupo: 'Responsabilidad civil obligatoria', label: 'Daños materiales', kind: 'fijo', fijo: 'Incluida' });
    add({ id: 'rco_dc', grupo: 'Responsabilidad civil obligatoria', label: 'Daños corporales', kind: 'fijo', fijo: 'Incluida' });
    if (g === 'ind') return out;                  // industriales: solo Terceros, sin extras

    // Responsabilidad civil voluntaria (sin columna en la plantilla de emisión; la de reposo, ID pendiente)
    const RCV = 'Responsabilidad civil voluntaria';
    add({ id: 'rcv_circ', grupo: RCV, label: 'Vehículo en circulación', kind: 'select', opciones: siNo('Incluida (hasta 50 millones €)'), defecto: 'si', sinId: SIN_COLUMNA });
    add({ id: 'rcv_reposo', grupo: RCV, label: 'Vehículo en reposo', kind: 'select', opciones: siNo('Incluida (hasta 1 millón €)'), defecto: g === 'a1' ? 'si' : 'no', sinId: PENDIENTE_REPOSO });
    if (g === 'a1') add({ id: 'rcv_carga', grupo: RCV, label: 'De la carga', kind: 'select', opciones: siNo('Incluida'), defecto: 'no', sinId: SIN_COLUMNA });
    add({ id: 'rcv_hibridos', grupo: RCV, label: 'En vehículos híbridos enchufables y eléctricos', kind: 'select', opciones: siNo('Incluida'), defecto: 'no', sinId: SIN_COLUMNA });
    if (g === 'a1') add({ id: 'rcv_remolque', grupo: RCV, label: 'Por remolque y caravana ligera menor de 750 kg', kind: 'select', opciones: siNo('Incluida'), defecto: 'no', sinId: SIN_COLUMNA });

    // Lunas
    if (g !== 'a3' && tipo !== 'remolque') {
        const L = 'Lunas';
        if (g === 'a1' && producto === 'terceros') {
            add({ id: 'lunas_rotura', grupo: L, label: 'Rotura de lunas', kind: 'select', opciones: siNo('Incluida'), defecto: 'no', col: 'LUNAS' });
        } else if (g === 'a1' && ampliado) {
            add({ id: 'lunas_rotura', grupo: L, label: 'Rotura de lunas', kind: 'fijo', fijo: 'Incluida', col: 'LUNAS', emiteFijo: 'SI' });
            add({ id: 'lunas_rep', grupo: L, label: 'Reparación de lunas', kind: 'fijo', fijo: 'Incluida' });
        } else {
            add({ id: 'lunas_rotura', grupo: L, label: 'Rotura de lunas', kind: 'select', opciones: siNo('Incluida'), defecto: 'si', col: 'LUNAS' });
            add({ id: 'lunas_rep', grupo: L, label: 'Reparación de lunas', kind: 'select', opciones: siNo('Incluida'), defecto: 'si', sinId: 'Se emite con la columna LUNAS' });
        }
    }

    // Robo e incendio
    if (ampliado || todoRiesgo) {
        add({ id: 'robo', grupo: 'Robo', label: 'Robo', kind: 'fijo', fijo: 'Incluida', col: 'ROBO', emiteFijo: 'SI' });
        add({ id: 'robo_intento', grupo: 'Robo', label: 'Intento de robo', kind: 'fijo', fijo: 'Incluida' });
        add({ id: 'incendio', grupo: 'Incendio', label: 'Incendio', kind: 'fijo', fijo: 'Incluida (con franquicia si existe)', col: 'INCENDIO', emiteFijo: 'SI' });
        if (g === 'a1') {
            add({ id: 'inc_retencion', grupo: 'Incendio', label: 'Dispositivo de retención infantil', kind: 'select', opciones: siNo('Incluida'), defecto: 'no', sinId: SIN_COLUMNA });
            add({ id: 'inc_equipaje', grupo: 'Incendio', label: 'Equipaje y objetos', kind: 'select', opciones: siNo('Incluida'), defecto: 'no', sinId: SIN_COLUMNA });
        }
    }
    if (motoAmp) {
        add({ id: 'robo', grupo: 'Robo', label: 'Robo', kind: 'fijo', fijo: frqTxt, col: 'ROBO', emiteFijo: 'SI' });
        add({ id: 'robo_intento', grupo: 'Robo', label: 'Intento de robo', kind: 'fijo', fijo: frqTxt });
        add({ id: 'incendio', grupo: 'Incendio', label: 'Incendio', kind: 'fijo', fijo: frqTxt, col: 'INCENDIO', emiteFijo: 'SI' });
    }

    // Pérdida total
    if (ampliado) add({ id: 'perdida_total', grupo: 'Pérdida total', label: 'Pérdida total', kind: 'select', opciones: siNo('Incluida'), defecto: 'no', col: 'PERDIDA_TOTAL' });

    // Daños propios y daños al casco
    if (todoRiesgo) add({ id: 'danos_propios', grupo: 'Daños propios', label: 'Daños materiales', kind: 'fijo', fijo: frqTxt });
    if (motoAmp) add({ id: 'casco', grupo: 'Daños al casco', label: 'Daños materiales', kind: 'fijo', fijo: 'Incluida (hasta 200 € al año)', col: 'CASCO', emiteFijo: 'SI' });

    // Animales
    add({ id: 'animales', grupo: 'Animales', label: 'Colisión con animales', kind: 'select', opciones: siNo('Incluida'), defecto: 'no', col: 'ANIM' });

    // Defensa jurídica y reclamación de daños
    const D = 'Defensa jurídica y reclamación de daños';
    const dj = opcDefensa(g);
    add({ id: 'def_jur', grupo: D, label: 'Defensa jurídica y reclamación de daños al vehículo y como peatón', kind: 'select', opciones: dj.opciones, defecto: dj.defecto, col: 'ID_DEF_JUR' });
    add({ id: 'ajt', grupo: D, label: 'Asesoramiento jurídico telefónico y gestión documental', kind: 'select', opciones: siNo('Incluida'), defecto: 'si', col: 'AJT' });
    add({ id: 'multas', grupo: D, label: 'Defensa de infracciones de tráfico', kind: 'select', opciones: siNo('Incluida (límite 5 al año)'), defecto: 'si', col: 'MULTAS' });
    add({ id: 'curso', grupo: D, label: 'Curso de recuperación total de puntos', kind: 'select', opciones: siNo('Incluida (hasta 500 € al año)'), defecto: 'si', col: 'CURSO_PUNTOS' });

    // Asistencia en viaje, seguro del conductor y subsidio
    const av = opcAsistencia(g);
    add({ id: 'asistencia', grupo: 'Asistencia en viaje', label: g === 'a3' ? 'Asistencia en viaje moto' : 'Asistencia en viaje', kind: 'select', opciones: av.opciones, defecto: av.defecto, col: 'ID_AV' });
    const sc = opcSeguroConductor(g);
    add({ id: 'seg_cond', grupo: 'Seguro del conductor', label: 'Seguro del conductor', kind: 'select', opciones: sc.opciones, defecto: sc.defecto, col: 'ID_SEG_COND' });
    if (g === 'a2') add({ id: 'subsidio', grupo: 'Subsidio por paralización del vehículo', label: 'Subsidio por paralización del vehículo', kind: 'select', opciones: siNo('Incluida'), defecto: 'no', col: 'SUBSIDIO' });

    return out;
}

// ─── Configuración por defecto, validación, resumen ──────────────────────────

export function configPorDefecto(tipo: TipoKey, producto: ProductoKey): ConfigCobertura {
    const opciones: Record<string, string> = {};
    for (const c of camposDe(tipo, producto)) if (c.kind === 'select' && c.defecto !== undefined) opciones[c.id] = c.defecto;
    const frq = franquiciasPermitidas(tipo, producto);
    // Segunda categoría: 1.800 € por defecto (la otra opción es 2.400 €). En el resto la franquicia se elige a propósito.
    const franquicia = frq.length === 1 ? frq[0] : grupoCob(tipo) === 'a2' && frq.includes(1800) ? 1800 : undefined;
    return { producto, franquicia, opciones };
}

/** Normaliza una configuración guardada: producto válido, franquicia permitida y valores existentes. */
export function normalizarConfig(tipo: TipoKey, cfg: ConfigCobertura | undefined): ConfigCobertura | null {
    if (!cfg) return null;
    const permitidos = productosPermitidos(tipo);
    if (!permitidos.includes(cfg.producto)) return null;
    const base = configPorDefecto(tipo, cfg.producto);
    const campos = camposDe(tipo, cfg.producto);
    const opciones: Record<string, string> = { ...base.opciones };
    for (const c of campos) {
        const v = cfg.opciones?.[c.id];
        if (c.kind === 'select' && v !== undefined && c.opciones?.some(o => o.value === v)) opciones[c.id] = v;
    }
    const frq = franquiciasPermitidas(tipo, cfg.producto);
    const franquicia = cfg.franquicia !== undefined && frq.includes(cfg.franquicia) ? cfg.franquicia : base.franquicia;
    return { producto: cfg.producto, franquicia, opciones };
}

/** Errores que impiden aprobar la configuración (la franquicia es obligatoria cuando el producto la lleva). */
export function validarConfig(tipo: TipoKey, cfg: ConfigCobertura | undefined): string[] {
    const errs: string[] = [];
    if (!grupoCob(tipo)) return [tipo === 'minibus_autocar' ? 'Minibús y autocar no se admiten en flotas.' : 'Tipología sin clasificar.'];
    if (!cfg) return ['Sin configurar.'];
    if (!productosPermitidos(tipo).includes(cfg.producto)) errs.push('Cobertura no válida para esta tipología.');
    const frq = franquiciasPermitidas(tipo, cfg.producto);
    if (frq.length > 0) {
        if (cfg.franquicia === undefined) errs.push('Falta elegir la franquicia.');
        else if (!frq.includes(cfg.franquicia)) errs.push(`Franquicia no válida: valores permitidos ${frq.map(eurLabel).join(', ')} €.`);
    } else if (cfg.franquicia) errs.push('Esta cobertura no lleva franquicia.');
    return errs;
}

/** Pendientes de emisión (campos elegidos sin código). Sirven para avisar, no bloquean. */
export function pendientesEmision(tipo: TipoKey, cfg: ConfigCobertura): string[] {
    const out: string[] = [];
    for (const c of camposDe(tipo, cfg.producto, cfg.franquicia)) {
        if (c.kind !== 'select' || !c.sinId) continue;
        if (c.id === 'rcv_circ' || c.id === 'lunas_rep') continue;     // la primera va siempre incluida y la segunda viaja con la columna LUNAS: no hay nada pendiente
        const v = cfg.opciones[c.id] ?? c.defecto;
        const activo = c.opciones?.find(o => o.value === v)?.value === 'si';
        if (activo) out.push(`${c.label}: ${c.sinId}`);
    }
    return out;
}

/** Texto corto para listas y tablas: «Todo riesgo con franquicia 750 € · Lunas · Defensa 1.000 €…». */
export function resumenConfig(tipo: TipoKey, cfg: ConfigCobertura): string {
    const p = PRODUCTO_DEF[cfg.producto];
    const partes: string[] = [cfg.franquicia ? `${p.label} ${eurLabel(cfg.franquicia)} €` : p.label];
    const campos = camposDe(tipo, cfg.producto, cfg.franquicia);
    const val = (c: CampoDef) => c.opciones?.find(o => o.value === (cfg.opciones[c.id] ?? c.defecto));
    const lunas = campos.find(c => c.id === 'lunas_rotura');
    if (lunas) { const on = lunas.kind === 'fijo' || val(lunas)?.value === 'si'; if (on) partes.push('Lunas'); }
    const an = campos.find(c => c.id === 'animales'); if (an && val(an)?.value === 'si') partes.push('Animales');
    const pt = campos.find(c => c.id === 'perdida_total'); if (pt && val(pt)?.value === 'si') partes.push('Pérdida total');
    const sub = campos.find(c => c.id === 'subsidio'); if (sub && val(sub)?.value === 'si') partes.push('Subsidio');
    const av = campos.find(c => c.id === 'asistencia'); if (av && val(av)?.value !== 'NO') partes.push(val(av)?.label ?? 'Asistencia');
    const sc = campos.find(c => c.id === 'seg_cond'); if (sc && val(sc)?.value !== 'NO') partes.push(`Conductor ${(val(sc)?.label ?? '').replace(' · hasta', '')}`.trim());
    return partes.join(' · ');
}

// ─── Hacia la hoja OFERTA y hacia la emisión masiva ──────────────────────────

/** Campos de la fila de OFERTA que fija una configuración. `asistencia` usa los valores del motor de primas. */
export function aOfertaRow(tipo: TipoKey, cfg: ConfigCobertura): { coberturas: string; frq: string; lunas: string; asistencia: string; animales: string; perdida_total: string } {
    const p = PRODUCTO_DEF[cfg.producto];
    const campos = camposDe(tipo, cfg.producto, cfg.franquicia);
    const val = (id: string) => {
        const c = campos.find(x => x.id === id);
        return c ? c.opciones?.find(o => o.value === (cfg.opciones[id] ?? c.defecto))?.value : undefined;
    };
    const lunasFijas = campos.some(c => c.id === 'lunas_rotura' && c.kind === 'fijo');
    const av = val('asistencia');
    // El motor de primas solo conoce oro / oro_plus / no: Platino y Limitada se tratan como Oro hasta que tengan ajuste propio.
    const asistencia = !av ? '' : av === 'NO' ? 'no' : 'oro';
    return {
        coberturas: p.etiquetaHoja,
        frq: cfg.franquicia ? String(cfg.franquicia) : '',
        lunas: lunasFijas || val('lunas_rotura') === 'si' ? 'Sí' : 'No',
        asistencia,
        animales: val('animales') === 'si' ? 'true' : '',
        perdida_total: val('perdida_total') === 'si' ? 'true' : '',
    };
}

/** Valores de las columnas de cobertura de la plantilla de emisión (CK a CY). Vacío = no se rellena. */
export function aEmision(tipo: TipoKey, cfg: ConfigCobertura): Partial<Record<ColEmision, string>> {
    const out: Partial<Record<ColEmision, string>> = {};
    const p = PRODUCTO_DEF[cfg.producto];
    out.ID_PRODUCTO = p.idProducto;
    if (cfg.franquicia) out.ID_FRANQUICIA = idFranquicia(tipo, cfg.franquicia);
    for (const c of camposDe(tipo, cfg.producto, cfg.franquicia)) {
        if (!c.col) continue;
        if (c.kind === 'fijo') { if (c.emiteFijo) out[c.col] = c.emiteFijo; continue; }
        const o = c.opciones?.find(x => x.value === (cfg.opciones[c.id] ?? c.defecto));
        if (o?.id) out[c.col] = o.id;
    }
    return out;
}

export const COLUMNAS_COBERTURA_EMISION: ColEmision[] = [
    'ID_PRODUCTO', 'ID_FRANQUICIA', 'LUNAS', 'ROBO', 'INCENDIO', 'PERDIDA_TOTAL', 'ID_DEF_JUR',
    'AJT', 'MULTAS', 'CURSO_PUNTOS', 'ID_SEG_COND', 'ID_AV', 'SUBSIDIO', 'ANIM', 'CASCO',
];

// ─── Configuración inicial a partir de lo que pidió el corredor ──────────────

export interface FilaSolicitada { frq?: string; lunas?: string; animales?: string }

const esSi = (v?: string) => { const u = (v ?? '').trim().toUpperCase(); return u !== '' && u !== 'NO' && u !== 'N' && u !== '0' && u !== 'FALSE'; };

/**
 * Configuración de partida para un grupo (tipología × cobertura solicitada), deducida de la plantilla del
 * corredor: producto por la etiqueta, franquicia más repetida si es válida, lunas y animales si los pidió.
 * Devuelve null si la tipología no admite coberturas (minibús, sin clasificar) o la etiqueta no se reconoce.
 */
export function inferirConfig(tipo: TipoKey, etiquetaCobertura: string, filas: FilaSolicitada[]): ConfigCobertura | null {
    const producto = productoDesdeEtiqueta(etiquetaCobertura, tipo);
    if (!producto) return null;
    const cfg = configPorDefecto(tipo, producto);
    const frqOk = franquiciasPermitidas(tipo, producto);
    if (frqOk.length > 0) {
        const cuenta = new Map<number, number>();
        for (const f of filas) {
            const n = parseFloat(String(f.frq ?? '').replace(',', '.'));
            if (frqOk.includes(n)) cuenta.set(n, (cuenta.get(n) ?? 0) + 1);
        }
        const mejor = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0];
        if (mejor) cfg.franquicia = mejor[0];
    }
    const campos = camposDe(tipo, producto, cfg.franquicia);
    const hayLunas = filas.some(f => esSi(f.lunas));
    const hayAnim = filas.some(f => esSi(f.animales));
    // Solo se activa lo que el corredor pidió; si no pidió nada, vale el valor por defecto del sistema
    if (hayLunas && campos.some(c => c.id === 'lunas_rotura' && c.kind === 'select')) cfg.opciones.lunas_rotura = 'si';
    if (hayAnim && campos.some(c => c.id === 'animales')) cfg.opciones.animales = 'si';
    return cfg;
}

/** Clave de grupo en INFORME: «TIPO||Cobertura solicitada» (la misma que usa la prima MMT). */
export const claveGrupo = (tipoNorm: string, cobSolicitada: string) => `${tipoNorm}||${cobSolicitada}`;

// ─── Texto para el cliente (OFERTA) ──────────────────────────────────────────

/**
 * Garantías incluidas, en lenguaje de cliente, para el anexo de la oferta. Sale del mismo catálogo que el panel
 * de INFORME, así que lo que se ofrece y lo que se emite no puede divergir.
 */
export function garantiasOferta(tipo: TipoKey, cfg: ConfigCobertura): string[] {
    const campos = camposDe(tipo, cfg.producto, cfg.franquicia);
    const out: string[] = [];
    const valor = (c: CampoDef) => cfg.opciones[c.id] ?? c.defecto;
    const opcion = (c: CampoDef) => c.opciones?.find(o => o.value === valor(c));
    const activo = (c: CampoDef) => c.kind === 'fijo' || opcion(c)?.value === 'si';
    const rango = (c: CampoDef) => (opcion(c)?.label ?? '').replace(/^[A-Z]{2} · /, '');
    const frq = cfg.franquicia ? ` con franquicia de ${eurLabel(cfg.franquicia)} €` : '';
    for (const c of campos) {
        switch (c.id) {
            case 'rco_dm': out.push('Responsabilidad civil obligatoria'); break;
            case 'rco_dc': break;
            case 'rcv_circ': if (activo(c)) out.push('Responsabilidad civil voluntaria (hasta 50 millones €)'); break;
            case 'rcv_reposo': if (activo(c)) out.push('Responsabilidad civil voluntaria en reposo (hasta 1 millón €)'); break;
            case 'rcv_carga': if (activo(c)) out.push('Responsabilidad civil voluntaria de la carga'); break;
            case 'rcv_hibridos': if (activo(c)) out.push('Responsabilidad civil voluntaria en vehículos híbridos enchufables y eléctricos'); break;
            case 'rcv_remolque': if (activo(c)) out.push('Responsabilidad civil voluntaria por remolque y caravana ligera'); break;
            case 'lunas_rotura': if (activo(c)) out.push('Rotura de lunas'); break;
            case 'lunas_rep': if (activo(c)) out.push('Reparación de lunas'); break;
            case 'robo': out.push('Robo e intento de robo'); break;
            case 'robo_intento': break;
            case 'incendio': out.push('Incendio'); break;
            case 'inc_retencion': if (activo(c)) out.push('Dispositivo de retención infantil'); break;
            case 'inc_equipaje': if (activo(c)) out.push('Equipaje y objetos'); break;
            case 'perdida_total': if (activo(c)) out.push('Pérdida total'); break;
            case 'danos_propios': out.push(`Daños propios${frq}`); break;
            case 'casco': out.push('Daños al casco (hasta 200 € al año)'); break;
            case 'animales': if (activo(c)) out.push('Colisión con animales'); break;
            case 'def_jur': if (valor(c) !== 'NO') out.push(`Defensa jurídica y reclamación de daños (${rango(c).toLowerCase()})`); break;
            case 'ajt': if (activo(c)) out.push('Asesoramiento jurídico telefónico y gestión documental'); break;
            case 'multas': if (activo(c)) out.push('Defensa de infracciones de tráfico'); break;
            case 'curso': if (activo(c)) out.push('Curso de recuperación de puntos'); break;
            case 'asistencia': if (valor(c) !== 'NO') out.push(`Asistencia en viaje (${opcion(c)?.label ?? ''})`.replace(' ()', '')); break;
            case 'seg_cond': if (valor(c) !== 'NO') out.push(`Seguro del conductor (${rango(c).replace('hasta ', '')})`); break;
            case 'subsidio': if (activo(c)) out.push('Subsidio por paralización del vehículo'); break;
        }
    }
    return out;
}

/** Etiqueta de tipo del estudio normalizada (la misma que usa INFORME): «DERIVADO DE TURISMO» cuenta como «TURISMO». */
export const tipoNormEtiqueta = (t: string) => {
    const u = (t || '').toUpperCase().trim();
    return u === 'DERIVADO DE TURISMO' ? 'TURISMO' : u || 'SIN TIPO';
};
