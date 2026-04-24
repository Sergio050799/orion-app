// ─── NORMALIZADOR — Flotas ────────────────────────────────────────────────────
//
// Convierte texto libre (copiado de Excel, teclado) al valor canónico.
// Algoritmo: limpieza → exacto → prefijo → contiene → sin match.

// ─── Opciones canónicas ───────────────────────────────────────────────────────

export const TIPO_VEHICULO_OPTS = [
  'Turismo', 'Furgoneta', 'Cabeza tractora', 'Camión rígido',
  'Semirremolque', 'Industrial matriculado', 'Industrial no matriculado',
];

export const USO_OPTS = ['Particular', 'Servicio público', 'Transportes propios'];

export const AMBITO_OPTS = ['Nacional', 'Internacional'];

export const COBERTURA_OPTS = [
  'Terceros', 'Terceros Ampliado', 'Todo Riesgo con Franquicia',
];

export const LUNAS_OPTS = ['Sí', 'No'];

export const ASISTENCIA_OPTS = ['no', 'oro', 'oro_plus'];

// ─── Mapas de columna ─────────────────────────────────────────────────────────

const COLUMN_OPTS: Record<string, string[]> = {
  tipo_vehiculo:          TIPO_VEHICULO_OPTS,
  uso:                    USO_OPTS,
  ambito:                 AMBITO_OPTS,
  coberturas_solicitadas: COBERTURA_OPTS,
  asistencia:             ASISTENCIA_OPTS,
  lunas:                  LUNAS_OPTS,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Limpia un string para comparación: sin acentos, minúsculas, sin espacios dobles. */
function clean(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // quita acentos
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── normalizeToOption ────────────────────────────────────────────────────────

/**
 * Intenta normalizar `raw` al valor canónico más cercano de `options`.
 * Devuelve { value, matched }.
 * Si no hay match → { value: raw.trim(), matched: false }
 */
export function normalizeToOption(
  raw: string,
  options: string[],
): { value: string; matched: boolean } {
  const input = clean(raw);
  if (!input) return { value: '', matched: true };

  // 1. Exacto
  for (const opt of options) {
    if (clean(opt) === input) return { value: opt, matched: true };
  }

  // 2. Prefijo (el input empieza como la opción o la opción empieza como el input)
  for (const opt of options) {
    const co = clean(opt);
    if (co.startsWith(input) || input.startsWith(co)) return { value: opt, matched: true };
  }

  // 3. Contiene
  for (const opt of options) {
    if (clean(opt).includes(input) || input.includes(clean(opt))) return { value: opt, matched: true };
  }

  return { value: raw.trim(), matched: false };
}

// ─── normalizeColumnValue ─────────────────────────────────────────────────────

/**
 * Normaliza un valor según la columna del grid.
 * Si la columna no tiene opciones definidas → devuelve { value: raw.trim(), matched: true }
 */
export function normalizeColumnValue(
  colId: string,
  raw: string,
): { value: string; matched: boolean } {
  if (colId === 'lunas') {
    const v = raw.trim().toLowerCase();
    if (['s', 'si', 'sí', 'yes', '1', 'true', 'x'].includes(v)) return { value: 'Sí', matched: true };
    if (['n', 'no', '0', 'false', ''].includes(v)) return { value: 'No', matched: true };
  }
  const opts = COLUMN_OPTS[colId];
  if (!opts) return { value: raw.trim(), matched: true };
  return normalizeToOption(raw, opts);
}

// ─── normalizePlate ───────────────────────────────────────────────────────────

/**
 * Normaliza una matrícula española.
 * Quita espacios, guiones y caracteres no alfanuméricos. Mayúsculas.
 * "1234 ABC" → "1234ABC"
 * "AB-1234-CD" → "AB1234CD"
 * "1234-abc" → "1234ABC"
 */
export function normalizePlate(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

// ─── normalizePoliza ──────────────────────────────────────────────────────────

/**
 * Normaliza un número de póliza.
 * Solo dígitos. Sin puntos, espacios, letras ni guiones.
 * "12.345.678" → "12345678"
 * "POL-001234" → "001234"
 * "001 234" → "001234"
 */
export function normalizePoliza(raw: string): string {
  return raw.replace(/\D/g, '');
}
