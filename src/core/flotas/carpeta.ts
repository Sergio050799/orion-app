// ─── CARPETA — Workspace principal del estudio de flotas ─────────────────────

import type { Periodicidad } from './corredor';

export type EstadoFlota = 'EN ESTUDIO' | 'OFERTADA' | 'CONTRATADA' | 'RECHAZADA';

export interface HistoricoEntry {
  fecha: string;        // ISO
  accion: string;
  estadoAnterior?: EstadoFlota;
  estadoNuevo?: EstadoFlota;
  motivo?: string;
  observaciones?: string;
}

export interface TarifaEntry {
  tipo: string;
  cobertura: string;
  precio: number;
}

export interface FlotaCarpeta {
  id: string;
  nombre: string;
  creadaEn: string;
  actualizadaEn: string;

  creado_por?: string;          // username de quien creó la carpeta
  estudiando_por?: string[];    // usernames con sesión activa (solo viene del servidor)

  corredor_id?: string;
  porcentajeComision?: number;
  estado: EstadoFlota;
  historico: HistoricoEntry[];

  tarifaFlota?: TarifaEntry[];
  primaClienteTotal?: number;
  primaClientePorVehiculo?: number;
  descuentoOferta?: number;
  descuentosCoberturas?: Record<string, number>;

  header: {
    cif: string;
    tomador: string;
    actividad: string;
    formaPago: string;
    efecto: string;
    polizaActual?: string;
    ciaActual?: string;
    fechaInicio?: string;
    fechaVencimiento?: string;
    cifTomador?: string;
    fechaEmision?: string;
    periodicidad?: Periodicidad;
  };

  observaciones?: string;
  original:        Record<string, string>[];
  trabajo:         Record<string, string>[];
  sincoResultados: Record<string, string>[];
  sincoManual?:    { matricula: string; num_siniestros: number; fec_ini_cobertura: string; fec_vcto: string; codigo_retorno: string; garantias: string; observaciones: string; }[];
  sincoGlobal?:    { siniestrosTotales: number; anyosExperiencia: number; frecuencia: number; observaciones: string; };
  oferta:          Record<string, string>[];
  primasMmtInforme?: Record<string, number>;
  catalogoSeleccion?: Record<string, string>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  automaticoVehicles?: Record<string, any>[];
}

// ─── Session cache (in-memory, lives while the tab is open) ──────────────────
// Server is source of truth. initMemCache() is called after each server fetch.

let memCache: FlotaCarpeta[] | null = null;

function loadAll(): FlotaCarpeta[] {
  return memCache ?? [];
}

function saveAll(carpetas: FlotaCarpeta[]): void {
  memCache = carpetas;
}

export function initMemCache(carpetas: FlotaCarpeta[]): void {
  memCache = [...carpetas];
}

// ─── Server sync ─────────────────────────────────────────────────────────────

function syncUpsert(carpeta: FlotaCarpeta): void {
  fetch('/api/flotas/carpetas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'upsert', carpeta }),
  }).catch(() => {});
}

function syncDelete(id: string): void {
  fetch('/api/flotas/carpetas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete', id }),
  }).catch(() => {});
}

// ─── Session tracking ─────────────────────────────────────────────────────────

export function sesionJoin(carpeta_id: string): void {
  fetch('/api/flotas/sesion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'join', carpeta_id }),
  }).catch(() => {});
}

export function sesionLeave(carpeta_id: string): void {
  fetch('/api/flotas/sesion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'leave', carpeta_id }),
  }).catch(() => {});
}

export function sesionHeartbeat(carpeta_id: string): void {
  fetch('/api/flotas/sesion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'heartbeat', carpeta_id }),
  }).catch(() => {});
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Carga carpetas desde el servidor e inicializa el caché en memoria. */
export async function cargarCarpetasDelServidor(signal?: AbortSignal): Promise<FlotaCarpeta[]> {
  const res = await fetch('/api/flotas/carpetas', { signal });
  if (!res.ok) throw new Error('Server error');
  const data: FlotaCarpeta[] = await res.json();
  initMemCache(data);
  return data;
}

export function listarCarpetas(): FlotaCarpeta[] {
  return loadAll().sort((a, b) =>
    new Date(b.actualizadaEn).getTime() - new Date(a.actualizadaEn).getTime()
  );
}

export function crearCarpeta(nombre: string, corredor_id?: string, creado_por?: string): FlotaCarpeta {
  const now = new Date().toISOString();
  const carpeta: FlotaCarpeta = {
    id: `carpeta_${Date.now()}`,
    nombre,
    creadaEn: now,
    actualizadaEn: now,
    corredor_id,
    creado_por: creado_por ?? '',
    estado: 'EN ESTUDIO',
    historico: [{ fecha: now, accion: 'Creación', estadoNuevo: 'EN ESTUDIO' }],
    header: { cif: '', tomador: '', actividad: '', formaPago: '', efecto: '' },
    original: [], trabajo: [], sincoResultados: [], oferta: [],
  };
  const all = loadAll();
  all.push(carpeta);
  saveAll(all);
  syncUpsert(carpeta);
  return carpeta;
}

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
  syncUpsert(carpeta);
  return carpeta;
}

export function guardarCarpeta(carpeta: FlotaCarpeta): void {
  carpeta.actualizadaEn = new Date().toISOString();
  const all = loadAll();
  const idx = all.findIndex(c => c.id === carpeta.id);
  if (idx >= 0) all[idx] = carpeta;
  else all.push(carpeta);
  saveAll(all);
  syncUpsert(carpeta);
}

export function cargarCarpeta(id: string): FlotaCarpeta | null {
  return loadAll().find(c => c.id === id) ?? null;
}

export function eliminarCarpeta(id: string): void {
  saveAll(loadAll().filter(c => c.id !== id));
  syncDelete(id);
}
