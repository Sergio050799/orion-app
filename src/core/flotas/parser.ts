// ─── PARSER EXCEL — Flotas ────────────────────────────────────────────────────

import * as XLSX from 'xlsx';
import { normalizeColumnValue } from './normalizador';

// Mapa: variantes de nombre de columna → id interno del grid
// Todas las claves ya están normalizadas (sin acentos, minúsculas, espacios simples)
// porque cleanHeader() normaliza antes de buscar.
const HEADER_MAP: Record<string, string> = {
  // Matrícula
  'matricula': 'matricula', 'plate': 'matricula', 'matr': 'matricula',
  // Marca
  'marca': 'marca', 'brand': 'marca',
  // Modelo
  'modelo': 'modelo', 'model': 'modelo',
  // Tipo vehículo
  'tipo vehiculo': 'tipo_vehiculo', 'tipovehiculo': 'tipo_vehiculo',
  'tipo de vehiculo': 'tipo_vehiculo', 'tipo': 'tipo_vehiculo',
  // Uso
  'uso': 'uso', 'use': 'uso',
  // KW
  'kw': 'kw', 'potencia': 'kw', 'kw (din)': 'kw',
  // CV
  'cv': 'cv', 'caballos': 'cv', 'potencia cv': 'cv',
  // Cilindrada
  'cilindrada': 'cilindrada', 'cc': 'cilindrada', 'cilind': 'cilindrada',
  'motorizacion': 'cilindrada', 'cubicaje': 'cilindrada',
  // Plazas
  'plazas': 'plazas', 'num plazas': 'plazas', 'numero plazas': 'plazas', 'seats': 'plazas',
  // Combustible
  'combustible': 'combustible', 'fuel': 'combustible', 'carburante': 'combustible',
  'tipo combustible': 'combustible', 'energia': 'combustible',
  // Año
  // El año de la plantilla (columna AÑO) es el del vehículo: se trata como año de fabricación, que es el que
  // valida el sistema de emisión. Si el fichero dice expresamente «matriculación» va a su propio campo.
  'ano': 'anyo_fabricacion', 'anyo': 'anyo_fabricacion', 'year': 'anyo_fabricacion', 'ano fabricacion': 'anyo_fabricacion',
  'anyo fabricacion': 'anyo_fabricacion', 'ano de fabricacion': 'anyo_fabricacion', 'ano modelo': 'anyo_fabricacion',
  'ano matriculacion': 'anyo_matricula', 'anyo matriculacion': 'anyo_matricula', 'ano de matriculacion': 'anyo_matricula',
  'ano matricula': 'anyo_matricula', 'fecha matriculacion': 'fecha_matriculacion', 'fecha de matriculacion': 'fecha_matriculacion',
  'f matriculacion': 'fecha_matriculacion',
  // Puertas
  'puertas': 'puertas', 'num puertas': 'puertas', 'doors': 'puertas',
  // TN
  'tn': 'tn', 'toneladas': 'tn', 'tara': 'tn', 'mma': 'tn',
  // PMA
  'pma': 'pma', 'peso maximo': 'pma', 'peso maximo autorizado': 'pma',
  // ADR
  'adr': 'adr',
  // Ámbito
  'ambito': 'ambito', 'scope': 'ambito',
  // Coberturas
  'coberturas': 'coberturas_solicitadas', 'coberturas solicitadas': 'coberturas_solicitadas',
  'cobertura': 'coberturas_solicitadas',
  'garantias': 'coberturas_solicitadas', 'garantia': 'coberturas_solicitadas',
  // Lunas
  'lunas': 'lunas', 'luna': 'lunas', 'cristales': 'lunas',
  // Animales
  'animales': 'animales', 'animal': 'animales',
  // Seguro del conductor
  'seguro conductor': 'seguro_conductor', 'seg conductor': 'seguro_conductor', 'seguro del conductor': 'seguro_conductor',
  'conductor': 'seguro_conductor',
  // FRQ / Franquicia
  'frq': 'frq', 'franquicia': 'frq', 'franchise': 'frq', 'franq': 'frq',
  // Asistencia
  'asistencia': 'asistencia', 'assistance': 'asistencia',
  // Prima referencia
  'prima referencia': 'prima_referencia', 'prima ref': 'prima_referencia', 'prima': 'prima_referencia', 'importe': 'prima_referencia',
  'tirea': 'prima_referencia', 'prima actual': 'prima_referencia',
  // CIF/NIF tomador (nivel fila)
  'cif nif': 'cif_nif', 'nif': 'cif_nif', 'cif': 'cif_nif',
  // Tomador (nivel fila)
  'tomador': 'tomador', 'nombre tomador': 'tomador', 'razon social': 'tomador',
  // Compañía / póliza
  'cia actual': 'cia_actual', 'cia': 'cia_actual', 'compania': 'cia_actual', 'aseguradora': 'cia_actual',
  'num poliza actual': 'num_poliza_actual', 'n poliza actual': 'num_poliza_actual',
  'poliza': 'num_poliza_actual', 'no poliza': 'num_poliza_actual',
  'numero poliza': 'num_poliza_actual', 'nº poliza actual': 'num_poliza_actual',
  'n poliza': 'num_poliza_actual', 'npoliza': 'num_poliza_actual',
  // variantes adicionales (nº → "n" tras cleanHeader v2)
  'nro poliza': 'num_poliza_actual', 'nro poliza actual': 'num_poliza_actual',
  'numero de poliza': 'num_poliza_actual', 'n de poliza': 'num_poliza_actual',
  'nro de poliza': 'num_poliza_actual', 'poliza actual': 'num_poliza_actual',
  'cod poliza': 'num_poliza_actual', 'codigo poliza': 'num_poliza_actual',
  'poliza n': 'num_poliza_actual', 'num de poliza': 'num_poliza_actual',
  // Vencimiento
  'fecha vencimiento': 'fecha_vencimiento', 'vencimiento': 'fecha_vencimiento', 'vcto': 'fecha_vencimiento',
};

// Columnas calculadas: no se importan (se recalculan en el grid desde otros campos)
const SKIP_HEADERS = new Set<string>();

/** Normaliza un nombre de cabecera para matching */
function cleanHeader(h: string): string {
  return h
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // quita tildes
    .replace(/[^a-z0-9\s]/gi, ' ')                       // \u00ba, ., -, N\u00ba \u2192 letra + espacio
    .toLowerCase().trim()
    .replace(/\s+/g, ' ');
}

export interface ParseResult {
  /** vehículos (las filas totalmente vacías de la plantilla se descartan) */
  rows: Record<string, string>[];
  /** datos de cabecera que trae la plantilla encima de la tabla (CIF, tomador, actividad, periodicidad, efecto) */
  header: { cif?: string; tomador?: string; actividad?: string; periodicidad?: string; efecto?: string };
  /** corredor y nombre del estudio indicados en la cabecera, si los hay */
  corredor?: string;
  estudio?: string;
  unmapped: string[];   // cabeceras que no se pudieron mapear
  total: number;        // total de filas (incluyendo vacías)
  mapped: number;       // filas con al menos un campo reconocido
}

export async function parseExcelTemplate(file: File): Promise<ParseResult> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });

  const ws = wb.Sheets[wb.SheetNames[0]];

  // Leer como array de arrays para detectar la fila de cabeceras real
  const allRows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: '',
    raw: false,
  });

  if (allRows.length === 0) return { rows: [], header: {}, unmapped: [], total: 0, mapped: 0 };

  // La fila de cabeceras es la que reconoce MÁS columnas distintas (mín. 2) y, a igualdad, la que trae la matrícula.
  // Mirar solo «la primera fila con una coincidencia» fallaba con la plantilla de ORION: su fila 2 lleva rótulos
  // como «CIF:» o «TOMADOR:» que coinciden con columnas y se tomaba por cabecera.
  let headerRowIdx = -1;
  let mejor = { n: 0, mat: false };
  for (let i = 0; i < Math.min(allRows.length, 15); i++) {
    const ids = new Set<string>();
    for (const cell of allRows[i] as unknown[]) {
      const id = HEADER_MAP[cleanHeader(String(cell ?? ''))];
      if (id) ids.add(id);
    }
    const cand = { n: ids.size, mat: ids.has('matricula') };
    if (cand.n >= 2 && (headerRowIdx < 0 || cand.n > mejor.n || (cand.n === mejor.n && cand.mat && !mejor.mat))) {
      headerRowIdx = i; mejor = cand;
    }
  }
  if (headerRowIdx < 0) {
    // sin una fila clara: la primera con alguna coincidencia (comportamiento anterior), o la primera
    headerRowIdx = allRows.findIndex((r, i) => i < 10 && (r as unknown[]).some(c => !!HEADER_MAP[cleanHeader(String(c ?? ''))]));
    if (headerRowIdx < 0) headerRowIdx = 0;
  }

  // Datos de cabecera: rótulo «CIF:» seguido de su valor, en las filas por encima de la tabla
  const header: ParseResult['header'] = {};
  let corredor: string | undefined, estudio: string | undefined;
  const esRotulo = (t: string) => /:\s*$/.test(t);
  for (let i = 0; i < headerRowIdx; i++) {
    const fila = (allRows[i] as unknown[]).map(c => String(c ?? '').trim());
    fila.forEach((txt, j) => {
      if (!esRotulo(txt)) return;
      const val = fila[j + 1] && !esRotulo(fila[j + 1]) ? fila[j + 1] : '';
      if (!val) return;
      const k = cleanHeader(txt);
      if (k === 'cif') header.cif = val;
      else if (k === 'tomador') header.tomador = val;
      else if (k === 'actividad') header.actividad = val;
      else if (k === 'periodicidad') header.periodicidad = val.toLowerCase();
      else if (k === 'efecto') header.efecto = val;
      else if (k === 'corredor') corredor = val;
      else if (k === 'estudio') estudio = val;
    });
  }

  const headerRow = allRows[headerRowIdx] as string[];
  const dataRows = allRows.slice(headerRowIdx + 1);

  // Mapear cabeceras por índice de columna
  const headerMapping: Record<number, string> = {}; // colIdx → colId
  const unmapped: string[] = [];

  headerRow.forEach((cell, idx) => {
    const key = cleanHeader(String(cell ?? ''));
    if (!key) return;
    const colId = HEADER_MAP[key];
    if (colId) headerMapping[idx] = colId;
    else if (!SKIP_HEADERS.has(key)) unmapped.push(String(cell));
  });

  // Columnas que se normalizan al importar
  const NORMALIZE_COLS = new Set(['tipo_vehiculo', 'uso', 'adr', 'ambito', 'coberturas_solicitadas', 'lunas', 'animales', 'seguro_conductor']);

  // Convertir filas
  const rows: Record<string, string>[] = dataRows.map(row => {
    const r: Record<string, string> = {};
    for (const [idxStr, colId] of Object.entries(headerMapping)) {
      let val = String((row as unknown[])[Number(idxStr)] ?? '').trim();
      if (colId === 'matricula' && val) {
        val = val.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      } else if (val && NORMALIZE_COLS.has(colId)) {
        val = normalizeColumnValue(colId, val).value;
      }
      r[colId] = val;
    }
    return r;
  });

  // Las plantillas traen cientos de filas con desplegables y sin datos: se descartan
  const reales = rows.filter(r => Object.values(r).some(v => v.trim()));

  return { rows: reales, header, corredor, estudio, unmapped, total: dataRows.length, mapped: reales.length };
}
