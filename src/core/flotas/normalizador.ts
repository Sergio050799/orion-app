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

// ─── Diccionario de alias → tipo canónico ────────────────────────────────────

const TIPO_ALIAS: Record<string, string> = {};

function addAliases(canonical: string, aliases: string[]) {
  for (const a of aliases) TIPO_ALIAS[a] = canonical;
}

addAliases('Turismo', [
  'turismo', 'turismos', 'turis', 'tur', 'turism',
  'derivado de turismo', 'derivado turismo', 'deriv turismo', 'deriv. turismo',
  'turismo derivado', 'automovil', 'automóvil', 'auto', 'coche', 'pkw',
  'todo terreno', 'todoterreno', 'suv', 'monovolumen', 'berlina', 'sedan',
  'familiar', 'coupe', 'descapotable', 'cabrio', 'cabriolet', 'hatchback',
  'microcar', 'microcoche', 'cuadriciclo', 'quad',
]);

addAliases('Furgoneta', [
  'furgoneta', 'furgonetas', 'furgon', 'furgo', 'furg',
  'furgón', 'van', 'combi', 'mixto', 'mixta', 'furgon mixto',
  'furgoneta mixta', 'vehiculo mixto', 'vehículo mixto',
  'derivado de camion', 'derivado camion', 'deriv camion', 'deriv. camion',
  'derivado de furgoneta', 'pick up', 'pickup', 'pick-up',
  'vehiculo comercial', 'vehículo comercial', 'comercial',
]);

addAliases('Cabeza tractora', [
  'cabeza tractora', 'tractora', 'cabeza', 'tractor', 'tractocamion',
  'cab tractora', 'cab. tractora', 'c. tractora', 'ct',
]);

addAliases('Camión rígido', [
  'camion rigido', 'camión rígido', 'camion', 'camión', 'camiones',
  'rigido', 'rígido', 'truck', 'lkw',
]);

addAliases('Semirremolque', [
  'semirremolque', 'semirremolques', 'semiremolque', 'semiremolques',
  'semi', 'remolque', 'trailer', 'semitrailer', 'semi-remolque', 'sr', 's/r',
]);

addAliases('Industrial matriculado', [
  'industrial matriculado', 'ind matriculado', 'ind. matriculado',
  'industrial matr', 'industrial mat',
]);

addAliases('Industrial no matriculado', [
  'industrial no matriculado', 'ind no matriculado', 'ind. no matriculado',
  'industrial sin matricular', 'industrial no matr',
]);

// Moto / Ciclomotor (opciones extra que pueden llegar de DGT/Silverdat)
addAliases('Motocicleta', [
  'motocicleta', 'motocicletas', 'moto', 'motos', 'motorcycle',
]);

addAliases('Ciclomotor', [
  'ciclomotor', 'ciclomotores', 'scooter', 'velomotor',
]);

addAliases('Autobús', [
  'autobus', 'autobús', 'autobuses', 'bus', 'microbus', 'microbús',
  'minibus', 'minibús',
]);

/**
 * Normaliza tipo de vehículo usando el diccionario de alias.
 * Primero intenta alias exacto, luego el normalizeToOption genérico.
 */
export function normalizeTipoVehiculo(raw: string): string {
  if (!raw || !raw.trim()) return '';
  const key = clean(raw);

  // 1. Alias directo
  if (TIPO_ALIAS[key]) return TIPO_ALIAS[key];

  // 2. Alias parcial: el input contiene un alias o un alias contiene el input
  for (const [alias, canonical] of Object.entries(TIPO_ALIAS)) {
    if (key.includes(alias) || alias.includes(key)) return canonical;
  }

  // 3. Fallback al matching genérico con las opciones canónicas
  const { value, matched } = normalizeToOption(raw, TIPO_VEHICULO_OPTS);
  return matched ? value : raw.trim();
}

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
  if (colId === 'coberturas_solicitadas') {
    const v = raw.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    // Garantías como "3ºS+ASIST", "3º+LUNAS+ASIST", "TERCEROS", "T.A.", "TR"
    if (v.startsWith('tr') || v.includes('todo riesgo') || v.includes('all risk')) {
      return { value: 'Todo Riesgo con Franquicia', matched: true };
    }
    if (v.startsWith('3') || v.includes('tercero')) {
      if (v.includes('ampliado') || v.includes('amp') || v.match(/3[oa][^\w]*a/)) {
        return { value: 'Terceros Ampliado', matched: true };
      }
      return { value: 'Terceros', matched: true };
    }
  }
  if (colId === 'lunas') {
    const v = raw.trim().toLowerCase();
    if (['s', 'si', 'sí', 'yes', '1', 'true', 'x'].includes(v)) return { value: 'Sí', matched: true };
    if (['n', 'no', '0', 'false', ''].includes(v)) return { value: 'No', matched: true };
  }
  if (colId === 'asistencia') {
    const v = raw.trim().toLowerCase();
    if (['s', 'si', 'sí', 'yes', '1', 'true', 'x'].includes(v)) return { value: 'oro', matched: true };
    if (['n', 'no', '0', 'false', ''].includes(v)) return { value: 'no', matched: true };
  }
  if (colId === 'tipo_vehiculo') {
    const v = normalizeTipoVehiculo(raw);
    return { value: v, matched: v !== raw.trim() || !raw.trim() };
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
