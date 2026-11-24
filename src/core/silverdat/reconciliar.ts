// ─── SILVERDAT MANDA EN LOS DATOS DEL VEHÍCULO ───────────────────────────────
//
// Silverdat está conectado con la DGT: es la fuente oficial de los datos del vehículo. La plantilla del
// corredor puede traer marca, modelo, tipo, potencia o año equivocados; cuando no coincide con Silverdat
// se sustituye por Silverdat y se avisa (el usuario puede mantener lo que dice la plantilla).
//
//   · campo vacío en la plantilla          → se rellena con Silverdat, sin preguntar
//   · dice lo mismo (alias, tolerancias)   → no hay discrepancia
//   · dice otra cosa                       → discrepancia: por defecto Silverdat, salvo que se mantenga la plantilla
//
// Los datos del SEGURO (coberturas, lunas, asistencia, ámbito, uso…) no pasan por aquí: ahí manda la plantilla.
// Módulo puro (sin React ni red). No lanza consultas a Silverdat.

import { normalizeTipoVehiculo } from '@/core/flotas/normalizador';

export interface DatosSilverdat {
    matricula: string;
    marca?: string; modelo?: string; version?: string; variante?: string; tipo_vehiculo?: string;
    kw?: number; cv?: number; cilindrada?: number; combustible?: string;
    plazas?: number; puertas?: number; tara?: number;
    anyo_fabricacion?: string; anyo_fab_fuente?: string; fecha_matriculacion?: string; vin?: string;
}

export type CampoVehiculo =
    | 'marca' | 'modelo' | 'version' | 'variante' | 'tipo_vehiculo' | 'kw' | 'cv' | 'cilindrada' | 'combustible'
    | 'plazas' | 'puertas' | 'tn' | 'anyo_fabricacion' | 'fecha_matriculacion' | 'vin';

export const ETIQUETA_CAMPO: Record<CampoVehiculo, string> = {
    marca: 'Marca', modelo: 'Modelo', version: 'Versión', variante: 'Variante', tipo_vehiculo: 'Tipo de vehículo',
    kw: 'kW', cv: 'CV', cilindrada: 'Cilindrada', combustible: 'Combustible', plazas: 'Plazas', puertas: 'Puertas',
    tn: 'Tara (Tn)', anyo_fabricacion: 'Año de fabricación', fecha_matriculacion: 'Fecha de matriculación', vin: 'Bastidor (VIN)',
};

export interface Discrepancia {
    matricula: string;
    campo: CampoVehiculo;
    etiqueta: string;
    plantilla: string;
    silverdat: string;
    /** marca o tipo de vehículo distintos: cambia el vehículo o su categoría (y la prima) */
    critica: boolean;
    nota?: string;
}

export interface ResultadoReconciliar {
    /** fila con la decisión aplicada (Silverdat, salvo los campos que se mantienen de la plantilla) */
    fila: Record<string, string>;
    /** campos en los que la plantilla decía otra cosa (se hayan mantenido o no) */
    discrepancias: Discrepancia[];
    /** campos vacíos en la plantilla que ha rellenado Silverdat */
    rellenados: CampoVehiculo[];
}

const MARCA_ALIAS: Record<string, string> = {
    'VW': 'VOLKSWAGEN', 'MERCEDES BENZ': 'MERCEDES', 'MB': 'MERCEDES', 'MERC': 'MERCEDES', 'KIA MOTORS': 'KIA',
    'HYUNDAI MOTOR': 'HYUNDAI', 'LANDROVER': 'LAND ROVER', 'RANGE ROVER': 'LAND ROVER', 'ALFA': 'ALFA ROMEO',
    'RENAULT TRUCKS': 'RENAULT', 'RENAULT V I': 'RENAULT', 'RVI': 'RENAULT', 'VOLVO TRUCKS': 'VOLVO',
    'MAN TRUCK': 'MAN', 'DAF TRUCKS': 'DAF', 'CITROEN DS': 'CITROEN', 'SKODA AUTO': 'SKODA', 'BMW AG': 'BMW',
};

const plano = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const compacto = (s: string) => plano(s).replace(/ /g, '');
const marcaCanon = (s: string) => { const p = plano(s); return MARCA_ALIAS[p] ?? p; };
const numero = (s: string) => parseFloat(String(s).replace(',', '.'));
const anioDe = (s: string) => { const m = String(s ?? '').match(/(19|20)\d{2}/); return m ? parseInt(m[0], 10) : 0; };

function grupoCombustible(s: string): string {
    const p = plano(s);
    if (!p) return '';
    if (/HIBR|HYBR|PHEV|HEV/.test(p)) return 'H';
    if (/ELEC|BEV/.test(p) || p === 'E') return 'E';
    if (/DIES|GASOIL|GASOLEO/.test(p) || p === 'D') return 'D';
    if (/GASOLINA|PETROL|BENZ/.test(p) || p === 'G') return 'G';
    if (/GLP|GNC|GNL|GAS/.test(p)) return 'GAS';
    return p;
}

/** Mismas marcas: alias, o una contiene a la otra («MERCEDES» / «MERCEDES-BENZ»). */
function mismaMarca(a: string, b: string): boolean {
    const x = marcaCanon(a), y = marcaCanon(b);
    if (x === y) return true;
    const cx = x.replace(/ /g, ''), cy = y.replace(/ /g, '');
    return cx.length >= 3 && cy.length >= 3 && (cx.includes(cy) || cy.includes(cx));
}

/** Textos compatibles: uno contiene al otro, o todas las palabras del más corto están en el más largo. */
function textoCompatible(a: string, b: string, marcas: string[]): boolean {
    const quitaMarca = (s: string) => {
        let p = plano(s);
        for (const m of marcas) { const pm = plano(m); if (pm && p.startsWith(pm + ' ')) p = p.slice(pm.length + 1); }
        return p.replace(/^BENZ /, '');
    };
    const pa = quitaMarca(a), pb = quitaMarca(b);
    const ca = pa.replace(/ /g, ''), cb = pb.replace(/ /g, '');
    if (!ca || !cb) return true;
    if (ca.includes(cb) || cb.includes(ca)) return true;
    const ta = pa.split(' '), tb = pb.split(' ');
    const [corto, largo] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
    return corto.every(t => largo.includes(t));
}

const lista = (s: string | undefined) => new Set((s ?? '').split(',').map(x => x.trim()).filter(Boolean));
function leerJson(s: string | undefined): Record<string, string> {
    if (!s) return {};
    try { const o = JSON.parse(s); return o && typeof o === 'object' ? o as Record<string, string> : {}; } catch { return {}; }
}

/**
 * Aplica Silverdat sobre la fila de un vehículo.
 * `mantener`: campos en los que el usuario ha decidido quedarse con la plantilla (se suman a los que la fila ya
 * tuviera guardados en `sd_mantener`, para no volver a preguntar en la siguiente consulta).
 */
export function reconciliar(
    filaOriginal: Record<string, string>,
    sv: DatosSilverdat,
    opciones?: { mantener?: Iterable<CampoVehiculo> },
): ResultadoReconciliar {
    const fila = { ...filaOriginal };
    const mantener = lista(fila.sd_mantener);
    for (const c of opciones?.mantener ?? []) mantener.add(c);
    const original = leerJson(fila.sd_plantilla);          // lo que puso el corredor en los campos sustituidos
    const discrepancias: Discrepancia[] = [];
    const rellenados: CampoVehiculo[] = [];
    const matricula = sv.matricula;
    const marcas = [sv.marca ?? '', filaOriginal.marca ?? ''];

    const campo = (
        c: CampoVehiculo,
        valorSd: string | number | undefined | null,
        igual: (plantilla: string, silverdat: string) => boolean,
        extra?: { critica?: boolean; nota?: string; conservarSiIgual?: (plantilla: string, silverdat: string) => boolean },
    ) => {
        if (valorSd === undefined || valorSd === null || valorSd === '') return;
        const sd = String(valorSd).trim();
        if (!sd) return;
        const actual = (fila[c] ?? '').trim();
        if (!actual) { fila[c] = sd; rellenados.push(c); return; }
        if (actual.toUpperCase() === sd.toUpperCase()) return;
        if (igual(actual, sd)) {
            // Dicen lo mismo: se queda el dato oficial, salvo que la plantilla sea más detallada
            if (!extra?.conservarSiIgual?.(actual, sd) && !mantener.has(c)) fila[c] = sd;
            return;
        }
        discrepancias.push({ matricula, campo: c, etiqueta: ETIQUETA_CAMPO[c], plantilla: actual, silverdat: sd, critica: !!extra?.critica, nota: extra?.nota });
        if (mantener.has(c)) return;                        // decisión del usuario: se queda la plantilla
        if (original[c] === undefined) original[c] = actual;
        fila[c] = sd;
    };

    const tol = (pct: number) => (a: string, b: string) => {
        const x = numero(a), y = numero(b);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
        return Math.max(x, y) === 0 || Math.abs(x - y) / Math.max(x, y) <= pct;
    };
    const exacto = (a: string, b: string) => numero(a) === numero(b);
    const masDetallada = (a: string, b: string) => compacto(a).length > compacto(b).length;

    campo('marca', sv.marca, mismaMarca, { critica: true });
    campo('modelo', sv.modelo, (a, b) => textoCompatible(a, b, marcas), { conservarSiIgual: masDetallada });
    campo('version', sv.version, (a, b) => textoCompatible(a, b, marcas), { conservarSiIgual: masDetallada });
    campo('variante', sv.variante, (a, b) => textoCompatible(a, b, marcas), { conservarSiIgual: masDetallada });
    campo('tipo_vehiculo', sv.tipo_vehiculo ? (normalizeTipoVehiculo(sv.tipo_vehiculo) || sv.tipo_vehiculo) : undefined,
        (a, b) => plano(normalizeTipoVehiculo(a) || a) === plano(normalizeTipoVehiculo(b) || b), { critica: true });
    campo('kw', sv.kw, tol(0.05));
    campo('cv', sv.cv, tol(0.05));
    campo('cilindrada', sv.cilindrada, tol(0.05));
    campo('combustible', sv.combustible, (a, b) => grupoCombustible(a) === grupoCombustible(b));
    campo('plazas', sv.plazas, exacto);
    campo('puertas', sv.puertas, exacto);
    campo('tn', sv.tara ? (sv.tara / 1000).toFixed(3) : undefined, (a, b) => {
        const kg = (s: string) => { const n = numero(s); return n >= 100 ? n : n * 1000; };   // la fila puede venir en kg o en Tn
        const x = kg(a), y = kg(b);
        return Math.max(x, y) === 0 || Math.abs(x - y) / Math.max(x, y) <= 0.05;
    });
    campo('vin', sv.vin, (a, b) => compacto(a) === compacto(b));
    campo('fecha_matriculacion', sv.fecha_matriculacion, (a, b) => anioDe(a) === anioDe(b) && anioDe(a) > 0);

    // Año de fabricación. Si Silverdat no trae el de fabricación y solo da el de matriculación como sustituto,
    // no contradice a la plantilla (un vehículo se fabrica antes de matricularse): solo rellena, o avisa si la
    // plantilla dice un año POSTERIOR a la matriculación, que es imposible.
    const sustituto = sv.anyo_fab_fuente === 'matriculacion';
    const teniaAnio = !!(fila.anyo_fabricacion ?? '').trim();
    const anioAntes = fila.anyo_fabricacion;
    campo('anyo_fabricacion', sv.anyo_fabricacion,
        (a, b) => { const x = anioDe(a), y = anioDe(b); return x > 0 && (x === y || (sustituto && x < y)); },
        sustituto
            ? { nota: 'Silverdat no trae el año de fabricación: este es el de matriculación, y la plantilla dice uno posterior', conservarSiIgual: () => true }
            : undefined);
    if (fila.anyo_fabricacion !== anioAntes || !teniaAnio) {
        if ((fila.anyo_fabricacion ?? '').trim()) fila.anyo_fab_fuente = sv.anyo_fab_fuente || 'fabricacion';
    }

    // Solo se recuerdan los «mantener» que siguen siendo una discrepancia real
    const vivos = [...mantener].filter(c => discrepancias.some(d => d.campo === c));
    for (const c of vivos) delete original[c];
    if (vivos.length > 0) fila.sd_mantener = vivos.join(','); else delete fila.sd_mantener;
    if (Object.keys(original).length > 0) fila.sd_plantilla = JSON.stringify(original); else delete fila.sd_plantilla;
    return { fila, discrepancias, rellenados };
}

/** Discrepancias pendientes de decidir: las que no están ya marcadas como «mantener plantilla» en la fila. */
export function pendientes(discrepancias: Discrepancia[], fila: Record<string, string>): Discrepancia[] {
    const m = lista(fila.sd_mantener);
    return discrepancias.filter(d => !m.has(d.campo));
}
