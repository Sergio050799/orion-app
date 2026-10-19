// Cache en memoria para la lista de carpetas.
// Reduce el número de llamadas a Flask para el endpoint más frecuente.
// TTL: 20s. Se invalida en cualquier escritura (POST/PUT/DELETE).

interface CacheEntry { data: unknown; ts: number }

let _full:    CacheEntry | null = null;
let _summary: CacheEntry | null = null;
const TTL = 20_000;

export function getCarpetasCache(summary: boolean): unknown | null {
    const e = summary ? _summary : _full;
    if (!e || Date.now() - e.ts > TTL) return null;
    return e.data;
}

export function setCarpetasCache(summary: boolean, data: unknown): void {
    const entry = { data, ts: Date.now() };
    if (summary) _summary = entry;
    else _full = entry;
}

export function invalidateCarpetasCache(): void {
    _full    = null;
    _summary = null;
}
