// ─── PARSER EXCEL — Flotas ────────────────────────────────────────────────────

import * as XLSX from 'xlsx';

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
  // TN
  'tn': 'tn', 'toneladas': 'tn', 'tara': 'tn', 'mma': 'tn',
  // Ámbito
  'ambito': 'ambito', 'scope': 'ambito',
  // Coberturas
  'coberturas': 'coberturas_solicitadas', 'coberturas solicitadas': 'coberturas_solicitadas',
  'cobertura': 'coberturas_solicitadas',
  // Lunas
  'lunas': 'lunas', 'luna': 'lunas', 'cristales': 'lunas',
  // FRQ / Franquicia
  'frq': 'frq', 'franquicia': 'frq', 'franchise': 'frq',
  // Asistencia
  'asistencia': 'asistencia', 'assistance': 'asistencia',
  // Prima referencia
  'prima referencia': 'prima_referencia', 'prima': 'prima_referencia', 'importe': 'prima_referencia',
  // Compañía / póliza
  'cia actual': 'cia_actual', 'cia': 'cia_actual', 'compania': 'cia_actual', 'aseguradora': 'cia_actual',
  'num poliza actual': 'num_poliza_actual', 'poliza': 'num_poliza_actual',
  'no poliza': 'num_poliza_actual', 'numero poliza': 'num_poliza_actual',
  'nº poliza actual': 'num_poliza_actual',
  // Vencimiento
  'fecha vencimiento': 'fecha_vencimiento', 'vencimiento': 'fecha_vencimiento', 'vcto': 'fecha_vencimiento',
};

// Columnas calculadas: no se importan (se recalculan en el grid desde otros campos)
const SKIP_HEADERS = new Set(['cv']);

/** Normaliza un nombre de cabecera para matching */
function cleanHeader(h: string): string {
  return h
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim()
    .replace(/[_\s]+/g, ' ');
}

export interface ParseResult {
  rows: Record<string, string>[];
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

  if (allRows.length === 0) return { rows: [], unmapped: [], total: 0, mapped: 0 };

  // Buscar la primera fila (entre las 5 primeras) donde al menos una celda
  // coincide con HEADER_MAP — esa es la cabecera real
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(allRows.length, 10); i++) {
    const row = allRows[i] as string[];
    const hasHeader = row.some(cell => !!HEADER_MAP[cleanHeader(String(cell ?? ''))]);
    if (hasHeader) { headerRowIdx = i; break; }
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

  // Convertir filas
  const rows: Record<string, string>[] = dataRows.map(row => {
    const r: Record<string, string> = {};
    for (const [idxStr, colId] of Object.entries(headerMapping)) {
      r[colId] = String((row as unknown[])[Number(idxStr)] ?? '').trim();
    }
    return r;
  });

  const mapped = rows.filter(r => Object.values(r).some(v => v.trim())).length;

  return { rows, unmapped, total: dataRows.length, mapped };
}
