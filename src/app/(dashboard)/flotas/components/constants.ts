// ─── Constantes y definiciones de columnas — Flotas ─────────────────────────

import {
  normalizeColumnValue, normalizePlate, normalizePoliza,
  normalizarPoliza, type TipoVehiculo, type Producto,
} from '@/core/flotas';
import { resolvePlate } from '@/core/_source_of_truth/plates/engine';
import { resolvePlateFromSeed } from '@/core/_source_of_truth/plates/resolver';
import type { ColDef } from './types';

// ─── Opciones estáticas ──────────────────────────────────────────────────────

export const TIPO_VEHICULO_OPTIONS = [
  'Turismo', 'Furgoneta', 'Cabeza tractora', 'Camión rígido',
  'Semirremolque', 'Industrial matriculado', 'Industrial no matriculado',
];
export const USO_OPTIONS = ['Particular', 'Servicio público', 'Transportes propios'];
export const AMBITO_OPTIONS = ['Nacional', 'Internacional'];

// ─── Mapas de conversión ─────────────────────────────────────────────────────

export const TIPO_VEH_MAP: Record<string, TipoVehiculo> = {
  'Turismo': 'turismo', 'Furgoneta': 'furgoneta', 'Cabeza tractora': 'cabeza_tractora',
  'Camión rígido': 'camion_rigido', 'Semirremolque': 'semirremolque',
  'Industrial matriculado': 'industrial_matriculado', 'Industrial no matriculado': 'industrial_no_matriculado',
};

export const PRODUCT_LABELS: Record<Producto, string> = {
  'terceros': 'Terceros',
  'terceros_con_luna': 'Terceros con Luna',
  'terceros_ampliado': 'Terceros Ampliado',
  'todo_riesgo': 'Todo Riesgo con Franquicia',
};

export const PRODUCT_CODES: Record<string, Producto> = {
  'Terceros': 'terceros',
  'Terceros Ampliado': 'terceros_ampliado',
  'Todo Riesgo con Franquicia': 'todo_riesgo',
};

export const ASISTENCIA_CODES: Record<string, string> = {
  'Oro': 'oro', 'Oro Plus': 'oro_plus', '': 'no',
};

// ─── Columnas base (ORIGINAL) ────────────────────────────────────────────────

export const BASE_COL_DEFS: ColDef[] = [
  { id: 'cia_actual',        name: 'CIA_ACTUAL',        width: 120 },
  { id: 'num_poliza_actual', name: 'Nº_POLIZA_ACTUAL',  width: 150,
    normalizeFn: (v) => ({ value: normalizePoliza(v), matched: true }) },
  { id: 'fecha_vencimiento', name: 'FECHA_VENCIMIENTO', width: 130 },
  { id: 'matricula',         name: 'MATRICULA',          width: 100,
    normalizeFn: (v) => ({ value: normalizePlate(v), matched: true }) },
  { id: 'marca',             name: 'MARCA',              width: 100 },
  { id: 'modelo',            name: 'MODELO',             width: 130 },
  { id: 'tipo_vehiculo',     name: 'TIPO_VEHICULO',      width: 185,
    normalizeFn: (v) => normalizeColumnValue('tipo_vehiculo', v) },
  { id: 'uso',               name: 'USO',                width: 155,
    normalizeFn: (v) => normalizeColumnValue('uso', v) },
  { id: 'kw',                name: 'KW',                 width: 65 },
  {
    id: 'cv', name: 'CV', width: 65, isComputed: true,
    computeFn: (row) => {
      const kw = parseFloat(row['kw'] ?? '');
      return isNaN(kw) ? '' : String(Math.round(kw * 1.35962));
    },
  },
  { id: 'tn',     name: 'TN',     width: 65 },
  { id: 'ambito', name: 'AMBITO', width: 125,
    normalizeFn: (v) => normalizeColumnValue('ambito', v) },
  { id: 'coberturas_solicitadas', name: 'COBERTURAS_SOLICITADAS', width: 210,
    normalizeFn: (v) => normalizeColumnValue('coberturas_solicitadas', v) },
  { id: 'lunas',     name: 'LUNAS',     width: 80,
    normalizeFn: (v) => normalizeColumnValue('lunas', v) },
  { id: 'frq',       name: 'FRQ',       width: 80 },
  { id: 'asistencia', name: 'ASISTENCIA', width: 140,
    normalizeFn: (v) => normalizeColumnValue('asistencia', v) },
  { id: 'prima_referencia', name: 'PRIMA_REFERENCIA', width: 135 },
];

// ─── Columnas computadas TRABAJO ────────────────────────────────────────────

export const POLIZA_SINCO_DEF: ColDef = {
  id: 'poliza_sinco', name: 'Nº_POLIZA_SINCO', width: 130, isComputed: true,
  computeFn: (row) => normalizarPoliza(row['num_poliza_actual'] ?? ''),
};

export const ANYO_MATRICULA_DEF: ColDef = {
  id: 'anyo_matricula', name: 'AÑO', width: 65, isComputed: true,
  computeFn: (row) => {
    const plate = (row['matricula'] ?? '').trim().toUpperCase();
    if (!plate) return '';
    // Semirremolque: R-0000-BBB → extraer las 3 letras finales
    const semiMatch = plate.match(/^R[\s-]?\d{4}[\s-]?([B-DF-HJ-NPR-TV-Z]{3})$/);
    if (semiMatch) {
      const r = resolvePlateFromSeed(semiMatch[1], true);
      return r ? String(r.year) : '';
    }
    // Matrícula estándar: 1234-BBB
    const r = resolvePlate(plate);
    return r ? String(r.year) : '';
  },
};

/** ColDefs para TRABAJO = BASE + POLIZA_SINCO (tras num_poliza_actual) + ANYO_MATRICULA (tras matricula) */
export function makeTrabajoColDefs(baseColDefs: ColDef[] = BASE_COL_DEFS): ColDef[] {
  let result = [...baseColDefs];

  // Insertar Nº_POLIZA_SINCO después de num_poliza_actual
  const polizaIdx = result.findIndex(c => c.id === 'num_poliza_actual');
  if (polizaIdx >= 0) result.splice(polizaIdx + 1, 0, POLIZA_SINCO_DEF);

  // Insertar AÑO después de matricula (buscamos en el array ya modificado)
  const matriculaIdx = result.findIndex(c => c.id === 'matricula');
  if (matriculaIdx >= 0) result.splice(matriculaIdx + 1, 0, ANYO_MATRICULA_DEF);

  return result;
}

// ─── Columnas SINCO (15 columnas fijas) ──────────────────────────────────────

export const SINCO_COL_NAMES = [
  'Grupo_Consultante', 'Tipo_Documento', 'Documento', 'Póliza', 'Matrícula',
  'Codigo_Retorno', 'Mensaje', 'Num_Siniestros', 'Fec_Ini_Cobertura',
  'Fec_Vcto', 'Tipo_Vehiculo', 'Tipo', 'Num_Garantias', 'Garantias', 'Siniestros',
];

export const SINCO_EDITABLE_FROM = 5; // columns 0-4 are auto-filled (index)

// ─── Columnas OFERTA ─────────────────────────────────────────────────────────

export const OFERTA_COL_NAMES = [
  'MATRÍCULA', 'MARCA, MODELO', 'TIPO DE VEHÍCULO', 'CV',
  'COBERTURAS', 'ÁMBITO', 'FRQ', 'OFERTA PRIMA MMT',
];
