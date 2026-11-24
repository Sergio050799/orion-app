// ─── FACTURACIÓN DE FLOTAS · recibos RC y RW ─────────────────────────────────
//
// Reglas de negocio (24/11/2026):
//   · RC = emisión, renovación o fracción ordinaria. RW = regularización. Cada serie es UN recibo con la suma
//     algebraica de sus líneas (las anulaciones restan). La serie la elige quien sube el archivo: nunca se
//     deduce del signo ni de la columna «Tipo».
//   · Número visible = serie + DDMMAAAA del vencimiento de la fracción (no la fecha de hoy ni el corredor).
//   · Prima neta, impuestos e importe se SUMAN del Excel; no se recalculan impuestos.
//   · Comisión = prima neta × % del corredor, redondeada a céntimos POR LÍNEA (mitades hacia fuera);
//     líquido = importe − comisión. Después se suman las líneas. La comisión no va en el recibo.
//   · Los periodos salen del ciclo de la flota (inicio + periodicidad), no de trimestres naturales.
//   · Bloquean: recibo repetido, neta + impuesto ≠ importe, fila incompleta, tomador sin reconocer.
//     Las fechas que no cuadran con la fracción son avisos (hay que revisarlos, no impiden emitir).
//
// Módulo puro: sin React, sin red y sin fecha del sistema. Importes en euros con 2 decimales exactos.

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

/** Comisión de una línea: neta × % con el redondeo de la regla (exacto, sin errores de coma flotante). */
export function comisionDe(neta: number, pct: number): number {
    const c = Math.abs(aCentimos(neta));
    const milesimas = Math.round(Math.abs(pct) * 1000);            // 10 % → 10000
    const num = c * milesimas, den = 100000;
    const cent = Math.floor((2 * num + den) / (2 * den));           // mitad hacia fuera
    return deCentimos((neta < 0) !== (pct < 0) ? -cent : cent);
}

export function conComision(lineas: LineaRecibo[], pct: number): LineaRecibo[] {
    return lineas.map(l => {
        const comision = comisionDe(l.neta, pct);
        return { ...l, comision, liquido: deCentimos(aCentimos(l.importe) - aCentimos(comision)) };
    });
}

export interface ResumenSerie {
    recibos: number;
    vehiculos: number;
    neta: number; impuesto: number; importe: number; comision: number; liquido: number;
    positivos: { recibos: number; importe: number };
    negativos: { recibos: number; importe: number };
}

export function resumir(lineas: LineaRecibo[]): ResumenSerie {
    let neta = 0, impuesto = 0, importe = 0, comision = 0, liquido = 0, pos = 0, posN = 0, neg = 0, negN = 0;
    const veh = new Set<string>();
    for (const l of lineas) {
        const i = aCentimos(l.importe);
        neta += aCentimos(l.neta); impuesto += aCentimos(l.impuesto); importe += i;
        comision += aCentimos(l.comision); liquido += aCentimos(l.liquido);
        if (i > 0) { pos += i; posN++; } else if (i < 0) { neg += i; negN++; }
        const m = l.riesgo.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        if (m) veh.add(m);
    }
    return {
        recibos: lineas.length, vehiculos: veh.size,
        neta: deCentimos(neta), impuesto: deCentimos(impuesto), importe: deCentimos(importe),
        comision: deCentimos(comision), liquido: deCentimos(liquido),
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
    /** vencimiento de la fracción = primer día cubierto (ISO) */
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

/** La fracción que vence en `vencimiento` (null si esa fecha no es un vencimiento del ciclo de la flota). */
export function fraccionDe(ancla: Dia, meses: number, vencimiento: Dia): Fraccion | null {
    const ciclo = inicioCicloDe(ancla, vencimiento);
    return fraccionesDelCiclo(ciclo, meses).find(f => f.desde === isoDe(vencimiento)) ?? null;
}

/** La fracción inmediatamente anterior (la que se regulariza al vencer `f`). */
export function fraccionAnterior(ancla: Dia, meses: number, f: Fraccion): Fraccion | null {
    const d = diaDe(f.desde)!;
    return fraccionDe(ancla, meses, moverMeses(inicioCicloDe(ancla, d), f.indice * meses - meses));
}

const ORDINAL = ['PRIMER', 'SEGUNDO', 'TERCER', 'CUARTO', 'QUINTO', 'SEXTO'];
const MES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
const UNIDAD: Record<number, string> = { 2: 'BIMESTRE', 3: 'TRIMESTRE', 4: 'CUATRIMESTRE', 6: 'SEMESTRE' };

function nombreFraccion(f: Fraccion, meses: number, corto: boolean): string {
    const d = diaDe(f.desde)!;
    if (meses === 12) return `ANUALIDAD ${d.y}`;
    if (meses === 1) return d.d === 1 ? `MES DE ${MES[d.m - 1]} ${d.y}` : `MENSUALIDAD ${f.indice + 1} ${d.y}`;
    return `${corto ? `${f.indice + 1}º` : ORDINAL[f.indice] ?? `${f.indice + 1}º`} ${UNIDAD[meses]} ${d.y}`;
}

/** Texto del periodo que se imprime en el recibo (editable después por el usuario). */
export function textoPeriodo(serie: Serie, meses: number, fraccion: Fraccion, anterior: Fraccion | null): string {
    if (serie === 'RC') return `${nombreFraccion(fraccion, meses, false)}: ${esDe(fraccion.desde)} al ${esDe(fraccion.hasta)}`;
    const a = anterior ?? fraccion;
    return `REGULARIZACIÓN ${nombreFraccion(a, meses, true)}: Recibos del ${esDe(a.desde)} al ${esDe(a.hasta)}`;
}

/** RC01102026 / RW01102026 */
export function numeroRecibo(serie: Serie, vencimientoIso: string): string {
    const d = diaDe(vencimientoIso);
    return d ? `${serie}${String(d.d).padStart(2, '0')}${String(d.m).padStart(2, '0')}${d.y}` : serie;
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
    inicioPoliza: ['fechainiciopoliza', 'fecinicio poliza', 'feciniciopoliza', 'iniciopoliza'],
    vencimientoPoliza: ['fechavencimiento', 'fecvencimiento', 'vencimiento'],
    tomador: ['tomador'],
};
const OBLIGATORIAS = ['poliza', 'recibo', 'riesgo', 'importe', 'neta', 'impuesto', 'tomador'];

/**
 * Lee la tabla de recibos de un libro (una matriz por hoja, tal como la da la librería de Excel).
 * La cabecera se busca en las 15 primeras filas; títulos, blancos y totales se excluyen.
 */
export function leerRecibos(hojas: Array<{ nombre: string; filas: unknown[][] }>): LecturaRecibos {
    const vacio = (e: string): LecturaRecibos => ({ lineas: [], excluidas: [], filaCabecera: 0, hoja: '', errores: [e] });
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

    const col: Record<string, number> = {};
    const errores: string[] = [];
    for (const [clave, opciones] of Object.entries(ALIAS)) {
        const idx = etiquetas.map((e, i) => (opciones.map(normalizar).includes(e) ? i : -1)).filter(i => i >= 0);
        if (idx.length > 1) errores.push(`La columna «${clave}» aparece más de una vez en la cabecera.`);
        if (idx.length > 0) col[clave] = idx[0];
    }
    const faltan = OBLIGATORIAS.filter(k => col[k] === undefined);
    if (faltan.length > 0) return { lineas: [], excluidas: [], filaCabecera: cab + 1, hoja, errores: [...errores, `Faltan columnas en el Excel: ${faltan.join(', ')}.`] };

    const txt = (r: unknown[], k: string) => (col[k] === undefined ? '' : String(r[col[k]] ?? '').trim());
    const fechaIso = (r: unknown[], k: string) => { if (col[k] === undefined) return ''; const d = diaDe(typeof r[col[k]] === 'string' ? (r[col[k]] as string).trim() : r[col[k]]); return d ? isoDe(d) : ''; };
    const lineas: LineaRecibo[] = [], excluidas: number[] = [];
    for (let i = cab + 1; i < filas.length; i++) {
        const r = filas[i] ?? [];
        const n = i + 1;
        if (!r.some(c => String(c ?? '').trim() !== '')) continue;                       // fila en blanco
        const poliza = txt(r, 'poliza'), recibo = txt(r, 'recibo'), riesgo = txt(r, 'riesgo');
        // Fila de totales: sin recibo ni matrícula, y en «Póliza» nada o un contador numérico
        if (!recibo && !riesgo && (!poliza || typeof r[col.poliza] === 'number')) { excluidas.push(n); continue; }
        if (!poliza || !recibo) { errores.push(`Fila ${n}: falta la póliza o el número de recibo.`); continue; }
        const neta = importeDe(r[col.neta]), impuesto = importeDe(r[col.impuesto]), importe = importeDe(r[col.importe]);
        if (neta === null || impuesto === null || importe === null) { errores.push(`Fila ${n} (recibo ${recibo}): importe vacío o no numérico.`); continue; }
        lineas.push({
            fila: n, poliza, recibo, riesgo, fecha: fechaIso(r, 'fecha'), tipo: txt(r, 'tipo'), neta, impuesto, importe,
            periodicidad: txt(r, 'periodicidad'), inicioPoliza: fechaIso(r, 'inicioPoliza'), vencimientoPoliza: fechaIso(r, 'vencimientoPoliza'),
            tomador: txt(r, 'tomador'), comision: 0, liquido: importe,
        });
    }
    if (lineas.length === 0 && errores.length === 0) errores.push('El archivo no tiene recibos debajo de la cabecera.');
    return { lineas, excluidas, filaCabecera: cab + 1, hoja, errores };
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

export interface Comprobacion { errores: string[]; avisos: string[] }

const lista = (xs: string[], max = 6) => xs.slice(0, max).join(', ') + (xs.length > max ? ` y ${xs.length - max} más` : '');

/** Errores que bloquean la emisión: recibos repetidos (dentro de una serie o entre las dos) y descuadres. */
export function comprobarImportes(series: Partial<Record<Serie, LineaRecibo[]>>): string[] {
    const errores: string[] = [];
    const visto = new Map<string, Serie>();
    const rep = new Set<string>(), cruz = new Set<string>();
    for (const s of ['RC', 'RW'] as Serie[]) {
        for (const l of series[s] ?? []) {
            const previa = visto.get(l.recibo);
            if (previa === s) rep.add(l.recibo); else if (previa) cruz.add(l.recibo); else visto.set(l.recibo, s);
            if (aCentimos(l.neta) + aCentimos(l.impuesto) !== aCentimos(l.importe)) {
                errores.push(`${s} · fila ${l.fila} (recibo ${l.recibo}): prima neta + impuesto no coincide con el importe.`);
            }
        }
    }
    if (rep.size > 0) errores.push(`Recibos repetidos en el mismo archivo: ${lista([...rep])}.`);
    if (cruz.size > 0) errores.push(`Recibos que están a la vez en RC y en RW: ${lista([...cruz])}.`);
    return errores;
}

/** Avisos de fechas: no bloquean, pero hay que revisarlos antes de emitir. */
export function avisosDeFechas(serie: Serie, lineas: LineaRecibo[], fraccion: Fraccion, anterior: Fraccion | null, meses: number): string[] {
    const avisos: string[] = [];
    const esperada = normalizar(NOMBRE_PERIODICIDAD[meses] ?? '');
    const fuera: string[] = [], venc: string[] = [], per: string[] = [];
    for (const l of lineas) {
        if (l.fecha) {
            if (serie === 'RC' && l.fecha !== fraccion.desde) fuera.push(l.recibo);
            if (serie === 'RW' && anterior && !(l.fecha >= anterior.desde && l.fecha < fraccion.desde)) fuera.push(l.recibo);
        }
        if (l.vencimientoPoliza && l.vencimientoPoliza !== fraccion.renovacion && !(serie === 'RW' && fraccion.indice === 0 && l.vencimientoPoliza === fraccion.inicioCiclo)) venc.push(l.recibo);
        if (l.periodicidad && esperada && normalizar(l.periodicidad) !== esperada) per.push(l.recibo);
    }
    if (fuera.length > 0) {
        avisos.push(serie === 'RC'
            ? `${fuera.length} ${fuera.length === 1 ? 'recibo tiene' : 'recibos tienen'} una fecha distinta del vencimiento de la fracción (${esDe(fraccion.desde)}): ${lista(fuera)}.`
            : `${fuera.length} ${fuera.length === 1 ? 'recibo queda' : 'recibos quedan'} fuera del periodo que se regulariza (${esDe(anterior!.desde)} al ${esDe(anterior!.hasta)}): ${lista(fuera)}.`);
    }
    if (venc.length > 0) avisos.push(`${venc.length} ${venc.length === 1 ? 'póliza vence' : 'pólizas vencen'} en una fecha distinta de la renovación de la flota (${esDe(fraccion.renovacion)}): ${lista(venc)}.`);
    if (per.length > 0) avisos.push(`${per.length} ${per.length === 1 ? 'recibo trae' : 'recibos traen'} una periodicidad distinta de la de la flota (${NOMBRE_PERIODICIDAD[meses]}): ${lista(per)}.`);
    return avisos;
}
