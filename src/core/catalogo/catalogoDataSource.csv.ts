import fs from 'fs';
import path from 'path';
import type { CatalogoVehiculo, CatalogoCandidato, CatalogoDataSource, SearchParams, ScoreDetail } from './catalogoDataSource';
import { normalizeFuel, normalizeFuelForCatalog } from '../pipelines/_shared/formatUtils';

const CSV_PATH_DEFAULT = path.join(process.cwd(), 'Catalogo_vehiculo', 'dim_vehiculos.csv');
const DATA_DIR = path.join(process.cwd(), 'data', 'catalogo');

/** Devuelve la ruta del CSV más reciente (versión con fecha o el original). */
function resolvecsvPath(): string {
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
    return CSV_PATH_DEFAULT;
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

// Alias para normalizar variantes de marca antes de comparar
const MARCA_ALIAS: Record<string, string> = {
    'VW': 'VOLKSWAGEN',
    'CITROËN': 'CITROEN',
    'CITROEN': 'CITROEN',
    'MERCEDES': 'MERCEDES-BENZ',
    'MERCEDES BENZ': 'MERCEDES-BENZ',
    'MB': 'MERCEDES-BENZ',
    'MERC': 'MERCEDES-BENZ',
    'KIA MOTORS': 'KIA',
    'HYUNDAI MOTOR': 'HYUNDAI',
    'LAND ROVER': 'LANDROVER',
    'RANGE ROVER': 'LANDROVER',
    'ALFA': 'ALFA ROMEO',
    'ALFA-ROMEO': 'ALFA ROMEO',
};

function normalizeMarca(m: string): string {
    const upper = m.toUpperCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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
    return {
        id_veh,
        marca: cols[2]?.trim() || '',
        modelo: cols[3]?.trim() || '',
        version: cols[4]?.trim() || '',
        id_clase: cols[5]?.trim() || '',
        cilindrada: parseNum(cols[6]),   // "motorizacion" = cc del motor
        combustible: cols[7]?.trim() || '',
        num_puertas: parseNum(cols[8]),
        fec_ini_comerc: cols[9]?.trim() || '',
        fec_fin_comerc: cols[10]?.trim() || '',
        pff: parseNum(cols[11]),         // Precio de fábrica
        pvp: parseNum(cols[12]),         // Precio de venta al público
        pma: parseNum(cols[13]),         // Peso Máximo Autorizado
        num_plazas_min: parseNum(cols[17]),
        num_plazas_max: parseNum(cols[18]),
        tara: parseNum(cols[19]),
        kw,
        cv: Math.round(kw * 1.36),
    };
}

// Índices en memoria: por id_veh y por marca normalizada
interface CatalogoCache {
    byId: Map<string, CatalogoVehiculo>;
    byMarca: Map<string, CatalogoVehiculo[]>;
    all: CatalogoVehiculo[];
}

// Singleton en global para sobrevivir hot-reloads de Next.js dev
declare global {
    // eslint-disable-next-line no-var
    var _catalogoCache: CatalogoCache | undefined;
}

function loadCsv(): CatalogoCache {
    if (global._catalogoCache) return global._catalogoCache;

    const csvPath = resolvecsvPath();
    const raw = fs.readFileSync(csvPath, 'utf8');
    const lines = raw.split('\n');

    const byId = new Map<string, CatalogoVehiculo>();
    const byMarca = new Map<string, CatalogoVehiculo[]>();
    const all: CatalogoVehiculo[] = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const cols = line.split(';');
        const veh = parseRow(cols);
        if (!veh) continue;

        all.push(veh);
        byId.set(veh.id_veh, veh);

        const key = normalize(veh.marca);
        const bucket = byMarca.get(key);
        if (bucket) bucket.push(veh);
        else byMarca.set(key, [veh]);
    }

    global._catalogoCache = { byId, byMarca, all };
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

    // AÑO — max 4pts (más puntos si año cae cerca del centro del rango)
    if (params.anyo && veh.fec_ini_comerc) {
        maxEfectivo += FIELD_MAX.anyo;
        const ini = parseInt(veh.fec_ini_comerc.substring(0, 4));
        const fin = veh.fec_fin_comerc ? parseInt(veh.fec_fin_comerc.substring(0, 4)) : 9999;
        if (params.anyo >= ini && params.anyo <= fin) {
            const centro = (ini + Math.min(fin, ini + 10)) / 2;
            const distCentro = Math.abs(params.anyo - centro) / Math.max(1, fin - ini);
            const pts = distCentro < 0.3 ? 4 : 2;
            score += pts;
            detail.anyo = pts;
        }
    }

    detail.maxEfectivo = maxEfectivo;
    if (maxEfectivo === 0) return { score: 0, detail };
    return { score: Math.round((score / maxEfectivo) * 100), detail };
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
                console.warn('[CATALOGO] marca sin bucket en índice:', marcaKey, '— scanning all');
            }
        }

        // Filtro duro por año — excluye vehículos fuera del rango comercial
        if (params.anyo) {
            candidates = candidates.filter(veh => {
                const ini = veh.fec_ini_comerc ? parseInt(veh.fec_ini_comerc.substring(0, 4)) : 0;
                const fin = veh.fec_fin_comerc ? parseInt(veh.fec_fin_comerc.substring(0, 4)) : 9999;
                return params.anyo! >= ini && params.anyo! <= fin;
            });
        }

        const t0 = Date.now();
        const scored: CatalogoCandidato[] = [];
        for (const veh of candidates) {
            const { score, detail } = scoreVehiculo(veh, params);
            if (score >= 70) {
                const candidato: CatalogoCandidato = { ...veh, score };
                if (params.scoreDebug) candidato.scoreDetail = detail;
                scored.push(candidato);
            }
        }
        console.log(`[CATALOGO] scored ${candidates.length} candidatos → ${scored.length} pasan umbral (${Date.now() - t0}ms)`);

        scored.sort((a, b) => b.score - a.score);
        return scored;
    },

    async getById(id_veh: string): Promise<CatalogoVehiculo | null> {
        const cache = loadCsv();
        return cache.byId.get(id_veh) ?? null;
    },
};
