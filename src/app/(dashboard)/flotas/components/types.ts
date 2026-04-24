import type { Periodicidad } from '@/core/flotas/corredor';

// ─── Tipos compartidos — Estudio de Flotas ──────────────────────────────────

export interface ColDef {
  id: string;
  name: string;
  width: number;
  isComputed?: boolean;
  computeFn?: (row: Record<string, string>) => string;
  normalizeFn?: (value: string) => { value: string; matched: boolean };
  frozen?: boolean;
  editable?: boolean;
}

export interface FlotaHeader {
  cif: string;
  tomador: string;
  actividad: string;
  formaPago: string;
  efecto: string;
  cifTomador?: string;
  fechaEmision?: string;
  periodicidad?: Periodicidad;
  // Ampliados E-1
  polizaActual?: string;
  ciaActual?: string;
  fechaInicio?: string;
  fechaVencimiento?: string;
}

export interface FlotaGridHandle {
  getData: () => Record<string, string>[];
  setData: (data: Record<string, string>[]) => void;
  toRows: () => Record<string, string>[];
  getColDefs: () => ColDef[];
}

export interface CoberturaRow {
  cobertura: string;
  frq: string;
  asistencia: string;
  animales: boolean;
  perdidaTotal: boolean;
  primaMmt: number | null;
}

export interface HojaCoberturasHandle {
  getCoberturas: () => CoberturaRow[];
  setCoberturas: (rows: CoberturaRow[]) => void;
}
