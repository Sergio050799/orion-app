// ─── CARPETA — Workspace principal del estudio de flotas ─────────────────────

import type { Periodicidad } from './corredor';

export type EstadoFlota = 'EN ESTUDIO' | 'CONTRATADA' | 'RECHAZADA';

export interface HistoricoEntry {
  fecha: string;        // ISO
  accion: string;       // ej: "Cambio de estado", "Creación", "Datos actualizados"
  estadoAnterior?: EstadoFlota;
  estadoNuevo?: EstadoFlota;
  motivo?: string;
  observaciones?: string;
}

export interface FlotaCarpeta {
  id: string;                              // `carpeta_${Date.now()}`
  nombre: string;                          // nombre que da el usuario
  creadaEn: string;                        // ISO
  actualizadaEn: string;                   // ISO

  // ─── Nuevos campos v2 ────────────────────────────────────────────────────
  corredor_id?: string;                    // referencia a Corredor.id
  estado: EstadoFlota;                     // control MANUAL — no automatizar
  historico: HistoricoEntry[];             // registro de cambios

  // ─── Datos generales del estudio ─────────────────────────────────────────
  header: {
    cif: string;
    tomador: string;
    actividad: string;
    formaPago: string;
    efecto: string;
    // Nuevos campos datos generales
    polizaActual?: string;
    ciaActual?: string;
    fechaInicio?: string;
    fechaVencimiento?: string;
    cifTomador?: string;        // CIF del tomador del seguro (para factura)
    fechaEmision?: string;      // Fecha en que se emitió la póliza (ISO string)
    periodicidad?: Periodicidad; // 'mensual' | 'trimestral' | 'semestral' | 'anual'
  };

  original:        Record<string, string>[];  // datos hoja ORIGINAL (solo lectura)
  trabajo:         Record<string, string>[];  // datos hoja TRABAJO
  sincoResultados: Record<string, string>[];  // resultado importado de SINCO
  sincoManual?:    { matricula: string; num_siniestros: number; fec_ini_cobertura: string; fec_vcto: string; codigo_retorno: string; garantias: string; observaciones: string; }[];
  sincoGlobal?:    { siniestrosTotales: number; anyosExperiencia: number; frecuencia: number; observaciones: string; };
  oferta:          Record<string, string>[];  // datos hoja OFERTA con coberturas
  primasMmtInforme?: Record<string, number>;   // tipo_vehiculo → prima MMT editada en Informe
  catalogoSeleccion?: Record<string, string>;   // matricula → id_veh seleccionado en Pre-Emisión
}

const STORAGE_KEY = 'flotas_carpetas_v1';

function loadAll(): FlotaCarpeta[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch { return []; }
}

function saveAll(carpetas: FlotaCarpeta[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(carpetas));
}

export function listarCarpetas(): FlotaCarpeta[] {
  return loadAll().sort((a, b) =>
    new Date(b.actualizadaEn).getTime() - new Date(a.actualizadaEn).getTime()
  );
}

export function crearCarpeta(nombre: string, corredor_id?: string): FlotaCarpeta {
  const now = new Date().toISOString();
  const carpeta: FlotaCarpeta = {
    id: `carpeta_${Date.now()}`,
    nombre,
    creadaEn: now,
    actualizadaEn: now,
    corredor_id,
    estado: 'EN ESTUDIO',
    historico: [{ fecha: now, accion: 'Creación', estadoNuevo: 'EN ESTUDIO' }],
    header: { cif: '', tomador: '', actividad: '', formaPago: '', efecto: '' },
    original: [], trabajo: [], sincoResultados: [], oferta: [],
  };
  const all = loadAll();
  all.push(carpeta);
  saveAll(all);
  return carpeta;
}

/** Cambia el estado de la flota MANUALMENTE. Registra en histórico. */
export function cambiarEstado(
  id: string,
  nuevoEstado: EstadoFlota,
  motivo?: string,
  observaciones?: string,
): FlotaCarpeta | null {
  const all = loadAll();
  const idx = all.findIndex(c => c.id === id);
  if (idx < 0) return null;
  const carpeta = all[idx];
  const entry: HistoricoEntry = {
    fecha: new Date().toISOString(),
    accion: 'Cambio de estado',
    estadoAnterior: carpeta.estado,
    estadoNuevo: nuevoEstado,
    motivo,
    observaciones,
  };
  carpeta.estado = nuevoEstado;
  carpeta.historico = [...(carpeta.historico ?? []), entry];
  carpeta.actualizadaEn = entry.fecha;
  saveAll(all);
  return carpeta;
}

export function guardarCarpeta(carpeta: FlotaCarpeta): void {
  carpeta.actualizadaEn = new Date().toISOString();
  const all = loadAll();
  const idx = all.findIndex(c => c.id === carpeta.id);
  if (idx >= 0) all[idx] = carpeta;
  else all.push(carpeta);
  saveAll(all);
}

export function cargarCarpeta(id: string): FlotaCarpeta | null {
  return loadAll().find(c => c.id === id) ?? null;
}

export function eliminarCarpeta(id: string): void {
  saveAll(loadAll().filter(c => c.id !== id));
}
