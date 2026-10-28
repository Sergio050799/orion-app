import fs from 'fs';
import path from 'path';
import type { CatalogoVehiculo, CatalogoCandidato, CatalogoDataSource, SearchParams, ScoreDetail } from './catalogoDataSource';
import { normalizeFuel, normalizeFuelForCatalog } from '../pipelines/_shared/formatUtils';
import { clasificar, tipoPorClase, TIPOS, TIPO_INFO, esTipoKey, type TipoKey, type TipoInfo } from './tipologia';

const DATA_DIR = process.env.ORION_CATALOGO_DIR
    || path.join(process.cwd(), 'data', 'catalogo');

/** Devuelve la ruta del CSV más reciente subido por orion-admin, o null si no hay ninguno. */
function resolvecsvPath(): string | null {
    try {
        if (fs.existsSync(DATA_DIR)) {
            const versions = fs.readdirSync(DATA_DIR)
                .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
                .sort()
                .reverse();
            for (const v of versions) {
                const p = path.join(DATA_DIR, v, 'dim_vehiculos.csv');
                if (fs.existsSync(p)) return p;
            }
        }
    } catch { /* ignora errores de fs */ }
    return null;
}

/** Limpia el singleton para forzar recarga del catálogo en la próxima búsqueda. */
export function clearCatalogoCache(): void {
    global._catalogoCache = undefined;
}

// Columnas del CSV (índice 0-based):
// 0:id_veh  1:id_veh_base7  2:marca  3:modelo  4:version  5:id_clase  6:motorizacion(cc)
// 7:combustible  8:num_puertas  9:fec_ini_comerc  10:fec_fin_comerc  11:pff  12:pvp
// 13:pma  14:num_velocidades  15:transmision  16:selec_riesgo
// 17:num_plazas_min  18:num_plazas_max  19:tara  20:kw  21:fec_carga  22:ts_update

function parseNum(s: string): number {
    if (!s || s.trim() === '') return 0;
    let cleaned = s.trim();
    // Formato europeo: punto como separador de miles → "55.000" o "1.234.567"
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(cleaned)) {
        cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
        cleaned = cleaned.replace(',', '.');
    }
    return parseFloat(cleaned) || 0;
}

function normalize(s: string): string {
    return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

// Alias para normalizar variantes de marca al nombre exacto del catálogo CSV
// CRÍTICO: los valores deben coincidir con lo que hay en el CSV (col 3)
// Catálogo usa: MERCEDES (no MERCEDES-BENZ), LAND ROVER (no LANDROVER), CITROEN (sin tilde)
const MARCA_ALIAS: Record<string, string> = {
    'VW': 'VOLKSWAGEN',
    'CITROËN': 'CITROEN',          // tilde → sin tilde
    'MERCEDES-BENZ': 'MERCEDES',   // Silverdat devuelve MERCEDES-BENZ; catálogo tiene MERCEDES
    'MERCEDES BENZ': 'MERCEDES',
    'MB': 'MERCEDES',
    'MERC': 'MERCEDES',
    'KIA MOTORS': 'KIA',
    'HYUNDAI MOTOR': 'HYUNDAI',
    'LANDROVER': 'LAND ROVER',     // catálogo usa "LAND ROVER" (dos palabras)
    'RANGE ROVER': 'LAND ROVER',   // Range Rover es modelo, marca es Land Rover
    'ALFA': 'ALFA ROMEO',
    'ALFA-ROMEO': 'ALFA ROMEO',
};

// Sufijos corporativos que Silverdat/DGT a veces a\u00f1aden a la marca real
const MARCA_SUFFIX_RE = /\s+(COMMERCIAL VEHICLES?|TRUCKS? ?&? ?BUSES?|TRUCKS?|MOTORS?|MOTOR CO\.?|ESPANA|IBERICA|IBERIA|DE ESPANA|S\.?A\.?U?\.?)$/;

function normalizeMarca(m: string): string {
    let upper = m.toUpperCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    upper = upper.replace(MARCA_SUFFIX_RE, '').trim();
    return MARCA_ALIAS[upper] ?? upper;
}

function levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) =>
        Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
    );
    for (let i = 1; i <= m; i++)
        for (let j = 1; j <= n; j++)
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    return dp[m][n];
}

function modeloScore(ocrModelo: string, catModelo: string): number {
    const a = ocrModelo.toUpperCase().trim().replace(/\s+/g, ' ');
    const b = catModelo.toUpperCase().trim().replace(/\s+/g, ' ');
    if (a === b) return 30;
    if (b.startsWith(a) || a.startsWith(b)) return 25;
    const dist = levenshtein(a, b);
    const maxLen = Math.max(a.length, b.length);
    const similarity = 1 - dist / maxLen;
    if (similarity >= 0.8) return 20;
    if (similarity >= 0.6) return 12;
    if (similarity >= 0.4) return 5;
    return 0;
}

function parseRow(cols: string[]): CatalogoVehiculo | null {
    const id_veh = cols[0]?.trim();
    if (!id_veh) return null;
    const kw = parseNum(cols[20]);
    const id_clase = cols[5]?.trim() || '';
    const pma = parseNum(cols[13]);
    return {
        id_veh,
        marca: cols[2]?.trim() || '',
        modelo: cols[3]?.trim() || '',
        version: cols[4]?.trim() || '',
        id_clase,
        cilindrada: parseNum(cols[6]),   // "motorizacion" = cc del motor
        combustible: cols[7]?.trim() || '',
        num_puertas: parseNum(cols[8]),
        fec_ini_comerc: cols[9]?.trim() || '',
        fec_fin_comerc: cols[10]?.trim() || '',
        pff: parseNum(cols[11]),         // Precio de fábrica
        pvp: parseNum(cols[12]),         // Precio de venta al público
        pma,                             // Peso Máximo Autorizado
        num_plazas_min: parseNum(cols[17]),
        num_plazas_max: parseNum(cols[18]),
        tara: parseNum(cols[19]),
        kw,
        cv: Math.round(kw * 1.36),
        tipo: clasificar(id_clase, pma),
    };
}

// Índices en memoria: por id_veh y por marca normalizada
interface CatalogoCache {
    byId: Map<string, CatalogoVehiculo>;
    byMarca: Map<string, CatalogoVehiculo[]>;
    all: CatalogoVehiculo[];
    /** Nº de vehículos por tipo (para ocultar tipos vacíos). */
    tiposN: Map<TipoKey, number>;
    /** Marcas (nombre del catálogo) con vehículos de cada tipo o categoría; se rellena bajo demanda. */
    marcasTipo: Map<string, string[]>;
}

// Singleton en global para sobrevivir hot-reloads de Next.js dev
declare global {
    // eslint-disable-next-line no-var
    var _catalogoCache: CatalogoCache | undefined;
}

function loadCsv(): CatalogoCache {
    // Invalidar si el singleton fue construido con una versión anterior del código (sin tiposN/marcasTipo)
    if (global._catalogoCache && (!global._catalogoCache.tiposN || !global._catalogoCache.marcasTipo)) {
        global._catalogoCache = undefined;
    }
    if (global._catalogoCache) return global._catalogoCache;

    const csvPath = resolvecsvPath();
    if (!csvPath) throw new Error('Catálogo no disponible. Sube una versión desde orion-admin.');
    const raw = fs.readFileSync(csvPath, 'utf8');
    const lines = raw.split('\n');

    const byId = new Map<string, CatalogoVehiculo>();
    const byMarca = new Map<string, CatalogoVehiculo[]>();
    const all: CatalogoVehiculo[] = [];

    // Auto-detectar separador: nuevo catálogo usa coma, antiguo usa punto y coma
    const firstLine = lines[0] ?? '';
    const sep = firstLine.includes(';') ? ';' : ',';

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const cols = line.split(sep);
        const veh = parseRow(cols);
        if (!veh) continue;

        all.push(veh);
        byId.set(veh.id_veh, veh);

        const key = normalize(veh.marca);
        const bucket = byMarca.get(key);
        if (bucket) bucket.push(veh);
        else byMarca.set(key, [veh]);
    }

    // Tipología: recuento por tipo y aviso de clases que aún no están en la tabla (tipologia.ts)
    const tiposN = new Map<TipoKey, number>();
    const clasesNuevas = new Map<string, number>();
    for (const v of all) {
        const t = (v.tipo as TipoKey) || 'sin_clasificar';
        tiposN.set(t, (tiposN.get(t) ?? 0) + 1);
        if (t === 'sin_clasificar' && tipoPorClase(v.id_clase) === 'sin_clasificar') {
            const c = v.id_clase || '(vacía)';
            clasesNuevas.set(c, (clasesNuevas.get(c) ?? 0) + 1);
        }
    }
    if (clasesNuevas.size) {
        const lista = [...clasesNuevas.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} (${n})`).join(', ');
        console.warn(`[orion] Catálogo: ${clasesNuevas.size} id_clase sin tipología asignada, añadir a CLASE_TIPO en tipologia.ts: ${lista}`);
    }

    global._catalogoCache = { byId, byMarca, all, tiposN, marcasTipo: new Map() };
    return global._catalogoCache;
}

// Puntuación máxima por campo — usada para normalización dinámica (Camino B)
const FIELD_MAX: Record<string, number> = {
    marca:      40,
    modelo:     30,
    acabado:    20,
    kw:         15,
    cilindrada: 10,
    plazas:      8,
    tara:        8,
    combustible: 5,
    puertas:     5,
    anyo:        4,
};

// Agrupa códigos letra por combustible base para scoring parcial (2pts)
function fuelBaseGroup(code: string): string {
    if (['D', 'Y', 'R'].includes(code)) return 'D'; // diésel base
    if (['G', 'X', 'P'].includes(code)) return 'G'; // gasolina base
    if (['E', 'Z'].includes(code)) return 'E';       // eléctrico base
    return code; // L, B, H → sin agrupación
}

function scoreVehiculo(veh: CatalogoVehiculo, params: SearchParams): { score: number; detail: ScoreDetail } {
    let score = 0;
    let maxEfectivo = 0;
    const detail: ScoreDetail = { marca: 0, modelo: 0, acabado: 0, kw: 0, cilindrada: 0, plazas: 0, tara: 0, combustible: 0, puertas: 0, anyo: 0, maxEfectivo: 0 };

    // MARCA — max 40pts
    if (params.marca) {
        maxEfectivo += FIELD_MAX.marca;
        const mParam = normalizeMarca(params.marca);
        const mVeh   = normalizeMarca(veh.marca);
        if (mParam === mVeh) {
            score += 40;
            detail.marca = 40;
        } else {
            // Tolerancia Levenshtein para typos (PEUGOT → PEUGEOT)
            const maxLen = Math.max(mParam.length, mVeh.length);
            const sim = maxLen > 0 ? 1 - levenshtein(mParam, mVeh) / maxLen : 0;
            if (sim >= 0.85) {
                score += 20;
                detail.marca = 20;
            }
        }
    }

    // MODELO — max 30pts (Levenshtein)
    if (params.modelo) {
        maxEfectivo += FIELD_MAX.modelo;
        const pts = modeloScore(params.modelo, veh.modelo);
        score += pts;
        detail.modelo = pts;
    }

    // ACABADO/VERSIÓN — max 20pts
    if (params.acabado && veh.version) {
        maxEfectivo += FIELD_MAX.acabado;
        const a = params.acabado.toUpperCase().trim();
        const b = veh.version.toUpperCase().trim();
        let pts = 0;
        if (a === b) pts = 20;
        else if (b.includes(a) || a.includes(b)) pts = 15;
        else {
            const dist = levenshtein(a, b);
            const maxLen = Math.max(a.length, b.length);
            const similarity = 1 - dist / maxLen;
            if (similarity >= 0.8) pts = 12;
            else if (similarity >= 0.6) pts = 6;
        }
        score += pts;
        detail.acabado = pts;
    }

    // KW — max 15pts (tolerancia ajustada)
    if (params.kw && veh.kw > 0) {
        maxEfectivo += FIELD_MAX.kw;
        const diff = Math.abs(params.kw - veh.kw) / veh.kw;
        let pts = 0;
        if (diff <= 0.05) pts = 15;
        else if (diff <= 0.10) pts = 8;
        else if (diff <= 0.15) pts = 3;
        score += pts;
        detail.kw = pts;
    }

    // CILINDRADA — max 10pts
    if (params.cilindrada && veh.cilindrada && veh.cilindrada > 0) {
        maxEfectivo += FIELD_MAX.cilindrada;
        const diff = Math.abs(params.cilindrada - veh.cilindrada) / veh.cilindrada;
        let pts = 0;
        if (diff <= 0.05) pts = 10;
        else if (diff <= 0.10) pts = 5;
        else if (diff <= 0.15) pts = 2;
        score += pts;
        detail.cilindrada = pts;
    }

    // PLAZAS — max 8pts
    if (params.plazas !== undefined) {
        maxEfectivo += FIELD_MAX.plazas;
        const min = veh.num_plazas_min ?? 0;
        const max = veh.num_plazas_max ?? 99;
        if (params.plazas >= min && params.plazas <= max) {
            score += 8;
            detail.plazas = 8;
        } else if (params.plazas >= min - 1 && params.plazas <= max + 1) {
            score += 4;
            detail.plazas = 4;
        }
    }

    // TARA — max 8pts
    if (params.tara && veh.tara > 0) {
        maxEfectivo += FIELD_MAX.tara;
        const diff = Math.abs(params.tara - veh.tara) / veh.tara;
        let pts = 0;
        if (diff <= 0.05) pts = 8;
        else if (diff <= 0.10) pts = 4;
        score += pts;
        detail.tara = pts;
    }

    // COMBUSTIBLE — max 5pts (con normalización por códigos letra DGT)
    if (params.combustible && veh.combustible) {
        maxEfectivo += FIELD_MAX.combustible;
        const normParam = normalizeFuel(params.combustible, params.kwElectrico, params.cilindrada);
        const normVeh   = normalizeFuelForCatalog(veh.combustible);
        let pts = 0;
        if (normParam && normVeh && normParam === normVeh) pts = 5;
        else if (normParam && normVeh && fuelBaseGroup(normParam) === fuelBaseGroup(normVeh)) pts = 2;
        score += pts;
        detail.combustible = pts;
    }

    // PUERTAS — max 5pts
    if (params.puertas && veh.num_puertas) {
        maxEfectivo += FIELD_MAX.puertas;
        if (params.puertas === veh.num_puertas) {
            score += 5;
            detail.puertas = 5;
        } else if (Math.abs(params.puertas - veh.num_puertas) === 1) {
            score += 2;
            detail.puertas = 2;
        }
    }

    // AÑO — filtro duro: excluye vehículos fuera del rango de comercialización
    if (params.anyo && veh.fec_ini_comerc) {
        const ini = parseInt(veh.fec_ini_comerc.substring(0, 4));
        const fin = veh.fec_fin_comerc?.length >= 4
            ? parseInt(veh.fec_fin_comerc.substring(0, 4)) : 9999;
        if (params.anyo < ini || params.anyo > fin) {
            detail.maxEfectivo = 0;
            return { score: 0, detail };
        }
        maxEfectivo += FIELD_MAX.anyo;
        score += 3;
        detail.anyo = 3;
    }

    detail.maxEfectivo = maxEfectivo;
    if (maxEfectivo === 0) return { score: 0, detail };
    return { score: Math.round((score / maxEfectivo) * 100), detail };
}

// ─── Utilidades públicas ──────────────────────────────────────────────────────

/** Lista de marcas únicas disponibles en el catálogo cargado. */
export function getAllMarcas(): string[] {
    try {
        const cache = loadCsv();
        const out: string[] = [];
        cache.byMarca.forEach(vehs => { if (vehs[0]?.marca) out.push(vehs[0].marca); });
        return out.sort();
    } catch { return []; }
}

// ─── Búsqueda en cascada (desplegables) ───────────────────────────────────────
// Filtrado EXACTO (sin puntuación difusa): marca → modelo → año → versión,
// más filtros opcionales de combustible, kW y plazas. Solo lectura.

export interface CascadaParams {
    /** Categoría 1, 2 o 3. Vacío = todas. */
    categoria?: number;
    /** Clave de tipo (tipologia.ts). Vacío = todos los tipos de la categoría. */
    tipo?: string;
    marca?: string;
    modelo?: string;
    anyo?: number;
    combustible?: string;
    kw?: number;
    plazas?: number;
}

export interface CascadaVersion {
    id_veh: string;
    marca: string;
    modelo: string;
    version: string;
    combustible: string;
    kw: number;
    cv: number;
    cilindrada: number;
    plazas: number;
    plazasMin: number;
    tara: number;
    pma: number;
    puertas: number;
    tipo: string;        // clave de tipologia.ts
    tipoLabel: string;
    categoria: 0 | 1 | 2 | 3;
    admitido: boolean;   // false = tipo que MMT no admite
    anyo: number;        // año consultado (o de inicio de comercialización si no se indicó)
    desde: number;       // año de inicio de comercialización (0 = desconocido)
    hasta: number;       // año de fin (0 = sigue comercializándose o desconocido)
    pvp?: number;
}

export interface TipoOpcion extends TipoInfo { n: number }

export interface CascadaResultado {
    /** Tipos con vehículos en el catálogo (para el primer desplegable). */
    tipos: TipoOpcion[];
    marcas: string[];
    modelos: string[];
    anyos: number[];
    combustibles: string[];
    kws: number[];
    plazas: number[];
    versiones: CascadaVersion[];
    totalVersiones: number;
    /** Marca tal cual está en el catálogo, tras aplicar alias (MERCEDES-BENZ → MERCEDES). Vacío si no existe. */
    marcaCanonica: string;
}

const yearOf = (s: string): number => {
    const y = parseInt((s || '').substring(0, 4));
    return isNaN(y) ? 0 : y;
};

const naturalSort = (a: string, b: string) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });

export function consultarCascada(p: CascadaParams): CascadaResultado {
    const cache = loadCsv();
    const currentYear = new Date().getFullYear();

    // Tipos presentes en el catálogo (solo los de la categoría elegida, si hay)
    const cat = p.categoria === 1 || p.categoria === 2 || p.categoria === 3 ? p.categoria : 0;
    const tipos: TipoOpcion[] = TIPOS
        .filter(t => (cache.tiposN.get(t.key) ?? 0) > 0 && (!cat || t.categoria === cat))
        .map(t => ({ ...t, n: cache.tiposN.get(t.key) ?? 0 }));
    const tipoSolo: TipoKey | '' = esTipoKey(p.tipo) && (!cat || TIPO_INFO[p.tipo].categoria === cat) ? p.tipo : '';
    // Conjunto de tipos que se consultan: el elegido, o todos los de la categoría, o todos
    const filtro: Set<string> | null = tipoSolo ? new Set([tipoSolo]) : cat ? new Set(tipos.map(t => t.key)) : null;
    const filtroKey = tipoSolo || (cat ? `cat${cat}` : '');

    // Marcas únicas (nombre del catálogo tal cual), solo las que tienen vehículos del tipo elegido
    let marcas: string[];
    if (!filtro) {
        marcas = [];
        cache.byMarca.forEach(vehs => { if (vehs[0]?.marca) marcas.push(vehs[0].marca); });
        marcas.sort(naturalSort);
    } else {
        let memo = cache.marcasTipo.get(filtroKey);
        if (!memo) {
            memo = [];
            cache.byMarca.forEach(vehs => { if (vehs[0]?.marca && vehs.some(v => filtro.has(v.tipo ?? ''))) memo!.push(vehs[0].marca); });
            memo.sort(naturalSort);
            cache.marcasTipo.set(filtroKey, memo);
        }
        marcas = memo;
    }

    const empty: CascadaResultado = { tipos, marcas, modelos: [], anyos: [], combustibles: [], kws: [], plazas: [], versiones: [], totalVersiones: 0, marcaCanonica: '' };
    if (!p.marca) return empty;

    // Alias de marca (VW, MERCEDES-BENZ…) para que una marca de Silverdat/DGT localice la del catálogo
    const poolMarcaTodos = cache.byMarca.get(normalize(p.marca)) ?? cache.byMarca.get(normalize(normalizeMarca(p.marca))) ?? [];
    const marcaCanonica = poolMarcaTodos[0]?.marca ?? '';
    empty.marcaCanonica = marcaCanonica;
    const poolMarca = filtro ? poolMarcaTodos.filter(v => filtro.has(v.tipo ?? '')) : poolMarcaTodos;
    const modelos = [...new Set(poolMarca.map(v => v.modelo).filter(Boolean))].sort(naturalSort);
    if (!p.modelo) return { ...empty, modelos, marcaCanonica };

    const modeloKey = normalize(p.modelo);
    const poolModelo = poolMarca.filter(v => normalize(v.modelo) === modeloKey);

    // Años en los que alguna versión se comercializó
    const anyoSet = new Set<number>();
    for (const v of poolModelo) {
        const ini = yearOf(v.fec_ini_comerc);
        if (!ini) continue;
        const fin = yearOf(v.fec_fin_comerc) || currentYear;
        for (let y = ini; y <= Math.max(ini, fin); y++) anyoSet.add(y);
    }
    const anyos = [...anyoSet].sort((a, b) => b - a);

    // Ventana de comercialización (filtro duro, igual que la regla 22 C)
    const poolAnyo = p.anyo
        ? poolModelo.filter(v => {
            const ini = yearOf(v.fec_ini_comerc);
            if (!ini) return true;
            const fin = yearOf(v.fec_fin_comerc) || 9999;
            return p.anyo! >= ini && p.anyo! <= fin;
        })
        : poolModelo;

    // Opciones de los filtros finales (a partir del conjunto marca+modelo+año)
    const combustibles = [...new Set(poolAnyo.map(v => normalizeFuelForCatalog(v.combustible) || '').filter(Boolean))].sort();
    const kws = [...new Set(poolAnyo.map(v => Math.round(v.kw)).filter(n => n > 0))].sort((a, b) => a - b);
    const plazas = [...new Set(poolAnyo.map(v => v.num_plazas_max).filter(n => n > 0))].sort((a, b) => a - b);

    const fuel = p.combustible ? p.combustible.toUpperCase() : '';
    const filtered = poolAnyo.filter(v => {
        if (fuel && (normalizeFuelForCatalog(v.combustible) || '') !== fuel) return false;
        if (p.kw && Math.round(v.kw) !== Math.round(p.kw)) return false;
        if (p.plazas) {
            const min = v.num_plazas_min || v.num_plazas_max;
            const max = v.num_plazas_max || v.num_plazas_min;
            if (!(max > 0) || p.plazas < min || p.plazas > max) return false;
        }
        return true;
    });

    const versiones: CascadaVersion[] = filtered
        .sort((a, b) => naturalSort(a.version, b.version) || naturalSort(a.id_veh, b.id_veh))
        .slice(0, 300)
        .map(v => ({
            id_veh: v.id_veh,
            marca: v.marca,
            modelo: v.modelo,
            version: v.version,
            combustible: normalizeFuelForCatalog(v.combustible) || '',
            kw: v.kw,
            cv: v.cv,
            cilindrada: v.cilindrada,
            plazas: v.num_plazas_max,
            plazasMin: v.num_plazas_min,
            tara: v.tara,
            pma: v.pma ?? 0,
            puertas: v.num_puertas,
            tipo: v.tipo || 'sin_clasificar',
            tipoLabel: (TIPO_INFO[(v.tipo as TipoKey) || 'sin_clasificar'] ?? TIPO_INFO.sin_clasificar).label,
            categoria: (TIPO_INFO[(v.tipo as TipoKey) || 'sin_clasificar'] ?? TIPO_INFO.sin_clasificar).categoria,
            admitido: (TIPO_INFO[(v.tipo as TipoKey) || 'sin_clasificar'] ?? TIPO_INFO.sin_clasificar).admitido,
            anyo: p.anyo || yearOf(v.fec_ini_comerc),
            desde: yearOf(v.fec_ini_comerc),
            hasta: yearOf(v.fec_fin_comerc),
            pvp: v.pvp || undefined,
        }));

    return { tipos, marcas, modelos, anyos, combustibles, kws, plazas, versiones, totalVersiones: filtered.length, marcaCanonica };
}

/**
 * Detecta marca (y modelo sobrante) en texto libre de una celda sin Silverdat.
 * Ej: "IVECO DACIA 450" → { marca: "IVECO", modelo: "DACIA 450" }
 * Ej: "SEMIRREMOLQUE KRONE" → { marca: "REMOLQUE" }
 */
export function parseFreeText(text: string): { marca?: string; modelo?: string } {
    if (!text?.trim()) return {};

    if (/\bremolque\b|\bsemirremolque\b/i.test(text)) return { marca: 'REMOLQUE' };

    let cache: CatalogoCache;
    try { cache = loadCsv(); } catch { return {}; }

    const textNorm   = normalize(text.trim());
    const textTokens = text.trim().split(/\s+/);

    // Construye lista de candidatos (marca normalizada → nombre canónico)
    const candidates: { normKey: string; displayName: string }[] = [];
    cache.byMarca.forEach((vehs, normKey) => {
        if (vehs[0]?.marca) candidates.push({ normKey, displayName: vehs[0].marca });
    });
    // Añadir aliases: "VW" → "VOLKSWAGEN", "MERCEDES" → "MERCEDES-BENZ", etc.
    for (const [alias, canonical] of Object.entries(MARCA_ALIAS)) {
        const normAlias = normalize(alias);
        const normCanon = normalize(normalizeMarca(canonical));
        if (cache.byMarca.has(normCanon) && !candidates.find(c => c.normKey === normAlias)) {
            candidates.push({ normKey: normAlias, displayName: canonical });
        }
    }
    // Ordenar por longitud del normKey (descendente) para evitar matches cortos incorrectos
    candidates.sort((a, b) => b.normKey.length - a.normKey.length);

    for (const { normKey, displayName } of candidates) {
        if (textNorm === normKey || textNorm.startsWith(normKey + ' ')) {
            const skipTokens = normKey.split(/\s+/).length;
            const resto = textTokens.slice(skipTokens).join(' ');
            return { marca: displayName, modelo: resto || undefined };
        }
    }
    return {};
}

export const catalogoDataSource: CatalogoDataSource = {
    async search(params: SearchParams): Promise<CatalogoCandidato[]> {
        const cache = loadCsv();

        // Pre-filtrar por marca si hay match — reduce el conjunto a escanear
        // Aplicar alias antes de buscar en el índice (ej: "VW" → "VOLKSWAGEN" → lookup correcto)
        let candidates: CatalogoVehiculo[] = cache.all;
        if (params.marca) {
            const marcaKey = normalize(normalizeMarca(params.marca));
            const bucket = cache.byMarca.get(marcaKey);
            if (bucket && bucket.length > 0) {
                candidates = bucket;
            } else {
                // marca sin bucket en índice — scanning all
            }
        }

        const scoreAndCollect = (pool: CatalogoVehiculo[], p: SearchParams, minScore = 70): CatalogoCandidato[] => {
            const scored: CatalogoCandidato[] = [];
            for (const veh of pool) {
                const { score, detail } = scoreVehiculo(veh, p);
                if (score >= minScore) {
                    const candidato: CatalogoCandidato = { ...veh, score };
                    if (p.scoreDebug) candidato.scoreDetail = detail;
                    scored.push(candidato);
                }
            }
            scored.sort((a, b) => b.score - a.score);
            return scored.slice(0, 20); // cap results
        };

        // Búsqueda directa: año es solo puntuación (+4pts), nunca filtro duro
        let results = scoreAndCollect(candidates, params);

        // Fallback: bajar umbral a 55 si no hay resultados con 70
        if (results.length === 0) {
            results = scoreAndCollect(candidates, params, 55);
        }

        return results;
    },

    async getById(id_veh: string): Promise<CatalogoVehiculo | null> {
        const cache = loadCsv();
        return cache.byId.get(id_veh) ?? null;
    },
};
