// ─── FACTURACIÓN DE FLOTAS · recibos de emisión y de regularización ──────────
//
// Reglas de negocio (24/11/2026, tal como se hace a mano):
//   · Dos operaciones SEPARADAS, cada una con su Excel de MMT y su recibo: EMISIÓN (emisión, renovación o
//     fracción; incluye sus suplementos) y REGULARIZACIÓN (todo lo que trae el archivo: altas, suplementos,
//     anulaciones…). Cada recibo es la suma algebraica de sus líneas. La operación la elige quien sube el archivo.
//   · Número del recibo = «R» + inicial del corredor + DDMMAAAA (RW13012026 para Willis). La fecha es la del
//     informe en la emisión y el último día de la fracción en la regularización; se puede corregir.
//   · Prima neta, impuestos e importe se SUMAN del Excel; no se recalculan impuestos.
//   · Comisión = % del corredor sobre la prima neta, SIN redondear línea a línea (como la fórmula de Excel);
//     el total se redondea al céntimo. Líquido = importe − comisión. La comisión no va en el recibo.
//   · Los periodos salen del ciclo de la flota (inicio + periodicidad), no de trimestres naturales.
//   · Bloquean: recibo repetido en el archivo, neta + impuesto ≠ importe, fila incompleta, tomador sin reconocer.
//     Las fechas que caen fuera de la fracción son avisos (hay que revisarlos, no impiden emitir).
//
// Módulo puro: sin React, sin red y sin fecha del sistema.

/** RC = emisión / fracción · RW = regularización (códigos internos; el número visible es R + inicial del corredor). */
export type Serie = 'RC' | 'RW';

export interface LineaRecibo {
    /** fila del Excel (1 = primera) */
    fila: number;
    poliza: string;
    recibo: string;
    riesgo: string;
    /** fechas en ISO aaaa-mm-dd ('' si el Excel no la trae) */
    fecha: string;
    tipo: string;
    neta: number;
    impuesto: number;
    importe: number;
    periodicidad: string;
    inicioPoliza: string;
    vencimientoPoliza: string;
    tomador: string;
    /** estado del recibo en MMT (Liquidado, Anulado, Pendiente de cobro…), solo informativo */
    estado: string;
    /** comisión de la línea SIN redondear al céntimo (como la fórmula de Excel) */
    comision: number;
    liquido: number;
}

export interface LecturaRecibos {
    lineas: LineaRecibo[];
    /** filas de títulos, blancos y totales que no son recibos */
    excluidas: number[];
    /** fila de la cabecera (1 = primera) */
    filaCabecera: number;
    hoja: string;
    /** «Fecha informe - dd/mm/aaaa» de la cabecera del Excel de MMT (ISO; '' si no viene) */
    fechaInforme: string;
    errores: string[];
}

// ─── Importes ────────────────────────────────────────────────────────────────

/** Céntimos enteros, redondeando la mitad hacia fuera (60,665 → 6067; −0,455 → −46). */
export function aCentimos(n: number): number {
    const abs = Math.round(Number((Math.abs(n) * 100).toFixed(4)));
    return n < 0 ? -abs : abs;
}
const deCentimos = (c: number) => c / 100;
export const r2 = (n: number) => deCentimos(aCentimos(n));

/** Importe de una celda: número, «1.234,56», «1234.56», «-3,61 €». null si está vacía o no es un número. */
export function importeDe(v: unknown): number | null {
    if (typeof v === 'number') return Number.isFinite(v) ? r2(v) : null;
    let s = String(v ?? '').replace(/[€\s ]/g, '');
    if (!s) return null;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? r2(n) : null;
}

const milesimasDe = (pct: number) => Math.round(Math.abs(pct) * 1000);            // 10 % → 10000

/** Comisión de una línea: neta × %, sin redondear al céntimo (3,408 € para 34,08 € al 10 %). */
export function comisionDe(neta: number, pct: number): number {
    return (aCentimos(neta) * milesimasDe(pct) * (pct < 0 ? -1 : 1)) / 1e7;
}

export function conComision(lineas: LineaRecibo[], pct: number): LineaRecibo[] {
    return lineas.map(l => {
        const comision = comisionDe(l.neta, pct);
        return { ...l, comision, liquido: Number((l.importe - comision).toFixed(5)) };
    });
}

export interface ResumenSerie {
    recibos: number;
    vehiculos: number;
    neta: number; impuesto: number; importe: number; comision: number; liquido: number;
    positivos: { recibos: number; importe: number };
    negativos: { recibos: number; importe: number };
}

/**
 * Totales de un recibo. La comisión es el % del corredor sobre el TOTAL de prima neta, redondeado al céntimo
 * (igual que sumar la columna de Excel sin redondear cada línea); el líquido, importe − comisión.
 */
export function resumir(lineas: LineaRecibo[], pct: number): ResumenSerie {
    let neta = 0, impuesto = 0, importe = 0, pos = 0, posN = 0, neg = 0, negN = 0;
    const veh = new Set<string>();
    for (const l of lineas) {
        const i = aCentimos(l.importe);
        neta += aCentimos(l.neta); impuesto += aCentimos(l.impuesto); importe += i;
        if (i > 0) { pos += i; posN++; } else if (i < 0) { neg += i; negN++; }
        const m = l.riesgo.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        if (m) veh.add(m);
    }
    // céntimos de comisión = neta × milésimas / 100000, mitad hacia fuera, en enteros exactos
    const num = Math.abs(neta) * milesimasDe(pct), den = 100000;
    const comAbs = Math.floor((2 * num + den) / (2 * den));
    const comision = (neta < 0) !== (pct < 0) ? -comAbs : comAbs;
    return {
        recibos: lineas.length, vehiculos: veh.size,
        neta: deCentimos(neta), impuesto: deCentimos(impuesto), importe: deCentimos(importe),
        comision: deCentimos(comision), liquido: deCentimos(importe - comision),
        positivos: { recibos: posN, importe: deCentimos(pos) }, negativos: { recibos: negN, importe: deCentimos(neg) },
    };
}

// ─── Fechas (sin zonas horarias: año, mes y día) ─────────────────────────────

export interface Dia { y: number; m: number; d: number }   // m = 1..12

const ult = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const isoDe = (x: Dia) => `${x.y}-${String(x.m).padStart(2, '0')}-${String(x.d).padStart(2, '0')}`;
export const esDe = (iso: string) => { const x = diaDe(iso); return x ? `${String(x.d).padStart(2, '0')}/${String(x.m).padStart(2, '0')}/${x.y}` : ''; };

/** Fecha de una celda o un texto: Date, nº de serie de Excel, «dd/mm/aaaa», «aaaa-mm-dd». */
export function diaDe(v: unknown): Dia | null {
    if (v instanceof Date && !isNaN(v.getTime())) return { y: v.getUTCFullYear(), m: v.getUTCMonth() + 1, d: v.getUTCDate() };
    if (typeof v === 'number' && v > 20000 && v < 80000) {
        const f = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
        return { y: f.getUTCFullYear(), m: f.getUTCMonth() + 1, d: f.getUTCDate() };
    }
    const s = String(v ?? '').trim();
    let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (m) return valido({ y: +m[3], m: +m[2], d: +m[1] });
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return valido({ y: +m[1], m: +m[2], d: +m[3] });
    return null;
}
function valido(x: Dia): Dia | null {
    return x.m >= 1 && x.m <= 12 && x.d >= 1 && x.d <= ult(x.y, x.m) && x.y > 1900 && x.y < 2200 ? x : null;
}
const num = (x: Dia) => x.y * 10000 + x.m * 100 + x.d;
const diaAntes = (x: Dia): Dia => { const f = new Date(Date.UTC(x.y, x.m - 1, x.d) - 86400000); return { y: f.getUTCFullYear(), m: f.getUTCMonth() + 1, d: f.getUTCDate() }; };

/** Fecha a `meses` del ancla, conservando el día del ancla (31/01 + 1 mes = 28 o 29/02). */
export function moverMeses(ancla: Dia, meses: number): Dia {
    const n = ancla.y * 12 + (ancla.m - 1) + meses;
    const y = Math.floor(n / 12), m = (n % 12 + 12) % 12 + 1;
    return { y, m, d: Math.min(ancla.d, ult(y, m)) };
}

// ─── Ciclo y fracciones ──────────────────────────────────────────────────────

export const MESES_PERIODICIDAD: Record<string, number> = { mensual: 1, bimestral: 2, trimestral: 3, cuatrimestral: 4, semestral: 6, anual: 12 };
export const NOMBRE_PERIODICIDAD: Record<number, string> = { 1: 'Mensual', 2: 'Bimestral', 3: 'Trimestral', 4: 'Cuatrimestral', 6: 'Semestral', 12: 'Anual' };

export interface Fraccion {
    /** primer día cubierto (ISO) */
    desde: string;
    /** último día cubierto (ISO) */
    hasta: string;
    /** posición dentro del ciclo anual (0 = primera) */
    indice: number;
    /** inicio del ciclo anual al que pertenece y su renovación (fin exclusivo) */
    inicioCiclo: string;
    renovacion: string;
}

/** Inicio del ciclo anual que contiene `fecha`, a partir del día y mes del ancla. */
export function inicioCicloDe(ancla: Dia, fecha: Dia): Dia {
    let ciclo = moverMeses(ancla, (fecha.y - ancla.y) * 12);
    if (num(ciclo) > num(fecha)) ciclo = moverMeses(ancla, (fecha.y - ancla.y - 1) * 12);
    return ciclo;
}

/** Fracciones del ciclo anual que empieza en `inicio`. */
export function fraccionesDelCiclo(inicio: Dia, meses: number): Fraccion[] {
    if (![1, 2, 3, 4, 6, 12].includes(meses)) return [];
    const renov = moverMeses(inicio, 12);
    const out: Fraccion[] = [];
    for (let k = 0, i = 0; k < 12; k += meses, i++) {
        const desde = moverMeses(inicio, k), sig = moverMeses(inicio, k + meses);
        out.push({ desde: isoDe(desde), hasta: isoDe(diaAntes(sig)), indice: i, inicioCiclo: isoDe(inicio), renovacion: isoDe(renov) });
    }
    return out;
}

/** La fracción que empieza en `inicio` (null si esa fecha no es un inicio de fracción del ciclo de la flota). */
export function fraccionDe(ancla: Dia, meses: number, inicio: Dia): Fraccion | null {
    const ciclo = inicioCicloDe(ancla, inicio);
    return fraccionesDelCiclo(ciclo, meses).find(f => f.desde === isoDe(inicio)) ?? null;
}

/** La fracción del ciclo en la que cae una fecha (para proponer el periodo a partir de las fechas del Excel). */
export function fraccionQueContiene(ancla: Dia, meses: number, fecha: Dia): Fraccion | null {
    const iso = isoDe(fecha);
    return fraccionesDelCiclo(inicioCicloDe(ancla, fecha), meses).find(f => iso >= f.desde && iso <= f.hasta) ?? null;
}

const ORDINAL = ['PRIMER', 'SEGUNDO', 'TERCER', 'CUARTO', 'QUINTO', 'SEXTO'];
const MES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
const UNIDAD: Record<number, string> = { 2: 'BIMESTRE', 3: 'TRIMESTRE', 4: 'CUATRIMESTRE', 6: 'SEMESTRE' };

/** «PRIMER TRIMESTRE 2026», «4º TRIMESTRE 2026» (corto), «ANUALIDAD 2026», «MES DE ENERO 2026». */
export function nombreFraccion(f: Fraccion, meses: number, corto = false): string {
    const d = diaDe(f.desde)!;
    if (meses === 12) return `ANUALIDAD ${d.y}`;
    if (meses === 1) return d.d === 1 ? `MES DE ${MES[d.m - 1]} ${d.y}` : `MENSUALIDAD ${f.indice + 1} ${d.y}`;
    return `${corto ? `${f.indice + 1}º` : ORDINAL[f.indice] ?? `${f.indice + 1}º`} ${UNIDAD[meses]} ${d.y}`;
}

/** Línea en negrita que se imprime en el recibo, encima de los importes (el usuario puede corregirla). */
export function textoPeriodo(serie: Serie, meses: number, fraccion: Fraccion): string {
    if (serie === 'RC') return `${nombreFraccion(fraccion, meses)}: ${esDe(fraccion.desde)} al ${esDe(fraccion.hasta)}`;
    return `REGULARIZACIÓN ${nombreFraccion(fraccion, meses, true)}: Recibos del ${esDe(fraccion.desde)} al ${esDe(fraccion.hasta)}`;
}

/** Inicial del corredor para el número de recibo (primera letra o cifra de su nombre). */
export function inicialCorredor(nombre: string): string {
    return (nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[A-Za-z0-9]/)?.[0] ?? 'X').toUpperCase();
}

/** Número del recibo: «R» + inicial del corredor + DDMMAAAA de la fecha del documento (RW13012026). */
export function numeroRecibo(corredor: string, fechaIso: string): string {
    const d = diaDe(fechaIso);
    const pre = `R${inicialCorredor(corredor)}`;
    return d ? `${pre}${String(d.d).padStart(2, '0')}${String(d.m).padStart(2, '0')}${d.y}` : pre;
}

/** Fecha del documento por defecto: la del informe en la emisión; el último día de la fracción en la regularización. */
export function fechaDocumento(serie: Serie, fraccion: Fraccion, fechaInforme: string): string {
    if (serie === 'RW') return fraccion.hasta;
    return fechaInforme || fraccion.desde;
}

// ─── Lectura del Excel ───────────────────────────────────────────────────────

export const normalizar = (v: unknown) => String(v ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

const ALIAS: Record<string, string[]> = {
    poliza: ['poliza', 'npoliza', 'numpoliza'],
    recibo: ['numrecibo', 'nrecibo', 'norecibo', 'numerorecibo', 'recibo'],
    riesgo: ['riesgo', 'matricula'],
    fecha: ['fecha', 'fechaefecto', 'fechaemision'],
    tipo: ['tipo', 'tiporecibo'],
    importe: ['importe', 'importetotal', 'primatotal'],
    neta: ['pneta', 'primaneta'],
    impuesto: ['impuesto', 'impuestos'],
    periodicidad: ['periodicidad', 'formadepago'],
    inicioPoliza: ['fechainiciopoliza', 'feciniciopoliza', 'iniciopoliza'],
    vencimientoPoliza: ['fechavencimiento', 'fecvencimiento', 'vencimiento'],
    tomador: ['tomador'],
    estado: ['estado'],
};
const OBLIGATORIAS = ['poliza', 'recibo', 'riesgo', 'importe', 'neta', 'impuesto', 'tomador'];

/**
 * Lee la tabla de recibos de un libro (una matriz por hoja, tal como la da la librería de Excel).
 * Vale el informe de MMT tal cual sale y también uno ya trabajado. La cabecera se busca en las 15 primeras
 * filas; títulos, blancos y totales se excluyen.
 */
export function leerRecibos(hojas: Array<{ nombre: string; filas: unknown[][] }>): LecturaRecibos {
    const vacio = (e: string): LecturaRecibos => ({ lineas: [], excluidas: [], filaCabecera: 0, hoja: '', fechaInforme: '', errores: [e] });
    const candidatas: Array<{ hoja: string; filas: unknown[][]; i: number; etiquetas: string[] }> = [];
    for (const h of hojas) {
        for (let i = 0; i < Math.min(15, h.filas.length); i++) {
            const etiquetas = (h.filas[i] ?? []).map(normalizar);
            if (etiquetas.includes('poliza') && (etiquetas.includes('riesgo') || etiquetas.includes('matricula'))) { candidatas.push({ hoja: h.nombre, filas: h.filas, i, etiquetas }); break; }
        }
    }
    if (candidatas.length === 0) return vacio('No se ha encontrado la cabecera de recibos (columnas «Póliza» y «Riesgo») en las 15 primeras filas.');
    if (candidatas.length > 1) return vacio('El archivo tiene más de una tabla de recibos. Deja una sola hoja de recibos por archivo.');
    const { hoja, filas, i: cab, etiquetas } = candidatas[0];

    // «Fecha informe - 13/01/2026», en las filas de título
    let fechaInforme = '';
    for (let i = 0; i < cab && !fechaInforme; i++) {
        for (const c of filas[i] ?? []) {
            const m = String(c ?? '').match(/fecha\s+informe\D*(\d{1,2}[/.-]\d{1,2}[/.-]\d{4})/i);
            if (m) { const d = diaDe(m[1]); if (d) fechaInforme = isoDe(d); break; }
        }
    }

    const col: Record<string, number> = {};
    const errores: string[] = [];
    for (const [clave, opciones] of Object.entries(ALIAS)) {
        const idx = etiquetas.map((e, i) => (opciones.includes(e) ? i : -1)).filter(i => i >= 0);
        if (idx.length > 1 && clave !== 'estado') errores.push(`La columna «${clave}» aparece más de una vez en la cabecera.`);
        if (idx.length > 0) col[clave] = idx[0];
    }
    const faltan = OBLIGATORIAS.filter(k => col[k] === undefined);
    if (faltan.length > 0) return { lineas: [], excluidas: [], filaCabecera: cab + 1, hoja, fechaInforme, errores: [...errores, `Faltan columnas en el Excel: ${faltan.join(', ')}.`] };

    const txt = (r: unknown[], k: string) => (col[k] === undefined ? '' : String(r[col[k]] ?? '').trim());
    const fechaIso = (r: unknown[], k: string) => { if (col[k] === undefined) return ''; const d = diaDe(typeof r[col[k]] === 'string' ? (r[col[k]] as string).trim() : r[col[k]]); return d ? isoDe(d) : ''; };
    const lineas: LineaRecibo[] = [], excluidas: number[] = [];
    for (let i = cab + 1; i < filas.length; i++) {
        const r = filas[i] ?? [];
        const n = i + 1;
        if (!r.some(c => String(c ?? '').trim() !== '')) continue;                       // fila en blanco
        const poliza = txt(r, 'poliza'), recibo = txt(r, 'recibo'), riesgo = txt(r, 'riesgo');
        // Fila de totales o de resumen: sin recibo ni matrícula, y en «Póliza» nada o un contador numérico
        if (!recibo && !riesgo && (!poliza || typeof r[col.poliza] === 'number')) { excluidas.push(n); continue; }
        if (!poliza || !recibo) { errores.push(`Fila ${n}: falta la póliza o el número de recibo.`); continue; }
        const neta = importeDe(r[col.neta]), impuesto = importeDe(r[col.impuesto]), importe = importeDe(r[col.importe]);
        if (neta === null || impuesto === null || importe === null) { errores.push(`Fila ${n} (recibo ${recibo}): importe vacío o no numérico.`); continue; }
        lineas.push({
            fila: n, poliza, recibo, riesgo, fecha: fechaIso(r, 'fecha'), tipo: txt(r, 'tipo'), neta, impuesto, importe,
            periodicidad: txt(r, 'periodicidad'), inicioPoliza: fechaIso(r, 'inicioPoliza'), vencimientoPoliza: fechaIso(r, 'vencimientoPoliza'),
            tomador: txt(r, 'tomador'), estado: txt(r, 'estado'), comision: 0, liquido: importe,
        });
    }
    if (lineas.length === 0 && errores.length === 0) errores.push('El archivo no tiene recibos debajo de la cabecera.');
    return { lineas, excluidas, filaCabecera: cab + 1, hoja, fechaInforme, errores };
}

// ─── Tomadores de facturación ────────────────────────────────────────────────

export interface TomadorFacturacion {
    id: string;
    /** razón social y CIF que se imprimen en el recibo */
    nombre: string;
    cif: string;
    /** nombres con los que aparece en los Excel de recibos */
    alias: string[];
}

/** Tomador de facturación de un nombre del Excel (por su razón social o por un alias). */
export function tomadorDe(nombreExcel: string, tomadores: TomadorFacturacion[]): TomadorFacturacion | null {
    const n = normalizar(nombreExcel);
    if (!n) return null;
    return tomadores.find(t => normalizar(t.nombre) === n || t.alias.some(a => normalizar(a) === n)) ?? null;
}

// ─── Comprobaciones ──────────────────────────────────────────────────────────

const lista = (xs: string[], max = 6) => xs.slice(0, max).join(', ') + (xs.length > max ? ` y ${xs.length - max} más` : '');

/** Errores que bloquean la emisión: recibos repetidos en el archivo y líneas descuadradas. */
export function comprobarImportes(lineas: LineaRecibo[]): string[] {
    const errores: string[] = [];
    const visto = new Set<string>(), rep = new Set<string>();
    for (const l of lineas) {
        if (visto.has(l.recibo)) rep.add(l.recibo); else visto.add(l.recibo);
        if (aCentimos(l.neta) + aCentimos(l.impuesto) !== aCentimos(l.importe)) {
            errores.push(`Fila ${l.fila} (recibo ${l.recibo}): prima neta + impuesto no coincide con el importe.`);
        }
    }
    if (rep.size > 0) errores.push(`Recibos repetidos en el archivo: ${lista([...rep])}.`);
    return errores;
}

/** Avisos de fechas: no bloquean, pero hay que revisarlos antes de emitir. */
export function avisosDeFechas(lineas: LineaRecibo[], fraccion: Fraccion, meses: number): string[] {
    const avisos: string[] = [];
    const esperada = normalizar(NOMBRE_PERIODICIDAD[meses] ?? '');
    const fuera: string[] = [], venc: string[] = [], per: string[] = [];
    for (const l of lineas) {
        if (l.fecha && !(l.fecha >= fraccion.desde && l.fecha <= fraccion.hasta)) fuera.push(l.recibo);
        if (l.vencimientoPoliza && l.vencimientoPoliza !== fraccion.renovacion) venc.push(l.recibo);
        if (l.periodicidad && esperada && normalizar(l.periodicidad) !== esperada) per.push(l.recibo);
    }
    if (fuera.length > 0) avisos.push(`${fuera.length} ${fuera.length === 1 ? 'recibo tiene' : 'recibos tienen'} fecha fuera del periodo elegido (${esDe(fraccion.desde)} al ${esDe(fraccion.hasta)}): ${lista(fuera)}.`);
    if (venc.length > 0) avisos.push(`${venc.length} ${venc.length === 1 ? 'póliza vence' : 'pólizas vencen'} en una fecha distinta de la renovación de la flota (${esDe(fraccion.renovacion)}): ${lista(venc)}.`);
    if (per.length > 0) avisos.push(`${per.length} ${per.length === 1 ? 'recibo trae' : 'recibos traen'} una periodicidad distinta de la de la flota (${NOMBRE_PERIODICIDAD[meses]}): ${lista(per)}.`);
    return avisos;
}
