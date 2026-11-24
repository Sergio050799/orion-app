// ─── CARPETA — Workspace principal del estudio de flotas ─────────────────────

import type { Periodicidad } from './corredor';
import type { ConfigCobertura } from './catalogoCoberturas';

export type EstadoFlota = 'EN ESTUDIO' | 'ESTUDIADA' | 'OFERTADA' | 'CONTRATADA' | 'RECHAZADA';

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

export interface DanosPropiosData {
  mostrarEnInforme: boolean;
  numSiniestros: number;
}

/** Datos de la emisión masiva que no se conocen al estudiar: se rellenan en el paso EMISIÓN. */
export interface EmisionDatos {
  idCliente?: string;      // ID_TOM
  idFlota?: string;        // ID_FLOTA
  idColectivo?: string;    // ID_COLECTIVO
  fechaEfecto?: string;    // dd/mm/aaaa; si vacío se usa el efecto de DATOS GENERALES
  /** Override manual del ID_INTERVINIENTE (perceptor). Si está, prevalece sobre el del corredor. */
  idPerceptorOverride?: string;
  /** Valores comunes a todos los vehículos (columna de la plantilla de emisión, valor). */
  comunes?: Record<string, string>;
}

export interface FlotaCarpeta {
  id: string;
  nombre: string;
  creadaEn: string;
  actualizadaEn: string;

  creado_por?: string;          // username de quien creó la carpeta
  estudiando_por?: string[];    // usernames con sesión activa (solo viene del servidor)

  corredor_id?: string;
  comisionBase?: number;
  comisionExtra?: number;
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
    categoria?: string;
    rangoVehiculos?: string;
  };

  observaciones?: string;
  original:        Record<string, string>[];
  trabajo:         Record<string, string>[];
  sincoResultados: Record<string, string>[];
  sincoManual?:    { matricula: string; num_siniestros: number; fec_ini_cobertura: string; fec_vcto: string; codigo_retorno: string; garantias: string; observaciones: string; }[];
  sincoGlobal?:    { siniestrosTotales: number; anyosExperiencia: number; frecuencia: number; observaciones: string; };
  danosPropios?:   DanosPropiosData;
  oferta:          Record<string, string>[];
  primasMmtInforme?: Record<string, number>;
  /** Cobertura elegida en INFORME por grupo (clave `TIPO||COBERTURA SOLICITADA`). La leen OFERTA y EMISIÓN. */
  configCoberturas?: Record<string, ConfigCobertura>;
  emision?: EmisionDatos;
  catalogoSeleccion?: Record<string, string>;
  /** matrícula limpia → id de catálogo cuya identificación se dio por buena pese a las discrepancias (PRE-EMISIÓN) */
  verificacionOk?: Record<string, string>;
  /** quién y cuándo dio por buena cada identificación (matrícula limpia → registro) */
  verificacionRegistro?: Record<string, { por: string; fecha: string }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  automaticoVehicles?: Record<string, any>[];
  /** Solo cuando viene de `?summary=true`: nº de vehículos sin cargar las filas enteras. */
  vehiculosCount?: number;
  /** Solo cuando viene de `?summary=true`: tipo_vehiculo de cada fila, para clasificar en el dashboard. */
  vehiculosTipos?: string[];
  /** Solo en summary: flags precalculados para determinar en qué paso está la carpeta sin bajar trabajo/sinco/etc. */
  avance?: {
    original: boolean;
    trabajo: boolean;
    sinco: boolean;
    informe: boolean;
    oferta: boolean;
    preemision: boolean;
  };
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
  if (!memCache) {
    memCache = [...carpetas];
    return;
  }
  // Race condition guard: if local copy was saved more recently than server version,
  // keep local (syncUpsert may not have reached the server yet when this fetch ran)
  const serverMap = new Map(carpetas.map(c => [c.id, c]));
  const merged = carpetas.map(sc => {
    const lc = memCache!.find(c => c.id === sc.id);
    if (!lc) return sc;
    return new Date(lc.actualizadaEn).getTime() > new Date(sc.actualizadaEn).getTime() ? lc : sc;
  });
  const localOnly = memCache.filter(c => !serverMap.has(c.id));
  memCache = [...merged, ...localOnly];
}

// ─── Server sync ─────────────────────────────────────────────────────────────

// Cola por carpeta: como mucho UN envío en vuelo por carpeta. Si llegan más guardados mientras
// tanto, sólo se envía el último al terminar el anterior. Antes cada guardado lanzaba su POST
// suelto y, si llegaban desordenados al servidor, uno viejo pisaba al nuevo (ediciones perdidas).
type Pendiente = FlotaCarpeta | 'delete';
const enVuelo = new Set<string>();
const pendientes = new Map<string, Pendiente>();
const fallidas = new Set<string>();
const REINTENTOS_MS = [2000, 5000, 10000];

/** Evento de ventana `orion:guardado` con `{ id, ok }`: lo escucha el Estudio para avisar si un guardado no llega. */
function avisarGuardado(id: string, ok: boolean): void {
  if (ok) { if (!fallidas.delete(id)) return; } else fallidas.add(id);
  if (typeof window === 'undefined') return;
  try { window.dispatchEvent(new CustomEvent('orion:guardado', { detail: { id, ok } })); } catch { /* */ }
}

/** true si queda algún guardado de carpeta sin confirmar por el servidor. */
export function hayGuardadosPendientes(): boolean {
  return enVuelo.size > 0 || pendientes.size > 0 || fallidas.size > 0;
}

function enviar(id: string, que: Pendiente, intento = 0): void {
  enVuelo.add(id);
  // El cuerpo se serializa aquí, en el momento del envío: lleva el estado más reciente del objeto.
  const body = que === 'delete'
    ? JSON.stringify({ action: 'delete', id })
    : JSON.stringify({ action: 'upsert', carpeta: que });
  fetch('/api/flotas/carpetas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
    .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return true; })
    .catch(() => false)
    .then(ok => {
      enVuelo.delete(id);
      const siguiente = pendientes.get(id);
      if (siguiente !== undefined) {
        // Hay algo más nuevo esperando: manda eso (sustituye a lo que acaba de salir, haya ido bien o mal).
        pendientes.delete(id);
        enviar(id, siguiente);
        return;
      }
      if (ok) { avisarGuardado(id, true); return; }
      avisarGuardado(id, false);
      if (intento < REINTENTOS_MS.length) {
        enVuelo.add(id); // reserva el turno durante la espera para mantener el orden
        setTimeout(() => {
          enVuelo.delete(id);
          const masNuevo = pendientes.get(id);
          pendientes.delete(id);
          enviar(id, masNuevo ?? que, masNuevo !== undefined ? 0 : intento + 1);
        }, REINTENTOS_MS[intento]);
      }
    });
}

function encolar(id: string, que: Pendiente): void {
  invalidarCacheCarpetasSafe();
  if (enVuelo.has(id)) { pendientes.set(id, que); return; }
  enviar(id, que);
}

function syncUpsert(carpeta: FlotaCarpeta): void {
  encolar(carpeta.id, carpeta);
}

function syncDelete(id: string): void {
  encolar(id, 'delete');
}

// Wrapper seguro para invalidar el TTL cache; llamado desde syncUpsert/syncDelete que están
// definidos antes que la function invalidarCacheCarpetas (hoisting-safe).
function invalidarCacheCarpetasSafe(): void {
  try { invalidarCacheCarpetas(); } catch { /* todavía no inicializado, no pasa nada */ }
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

// Cache TTL compartido entre pantallas para evitar re-fetchs al cambiar de zona rápido
// (Dashboard → Corredores → Flotas en pocos segundos pedía 3 veces lo mismo).
// Un cache por modo (summary vs full). 5s de TTL es suficiente — si cambia algo importante,
// el SSE o el próximo fetch tras 5s lo refresca.
const FETCH_TTL_MS = 5000;
const inflight: { summary: Promise<FlotaCarpeta[]> | null; full: Promise<FlotaCarpeta[]> | null } = { summary: null, full: null };
const lastFetch: { summary: { data: FlotaCarpeta[]; ts: number } | null; full: { data: FlotaCarpeta[]; ts: number } | null } = { summary: null, full: null };

// Cache persistente en sessionStorage: vive hasta logout o cierre del navegador.
// Permite que al navegar entre zonas los KPIs aparezcan al instante sin esperar al servidor.
const SS_KEY_SUMMARY = 'orion:carpetas:summary';
const SS_KEY_FULL = 'orion:carpetas:full';

export function leerCarpetasDeSessionStorage(summary = true): FlotaCarpeta[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(summary ? SS_KEY_SUMMARY : SS_KEY_FULL);
    if (!raw) return null;
    const data = JSON.parse(raw) as FlotaCarpeta[];
    // Hidratar también memCache y TTL con lo que venga de SS, así el resto del sistema aprovecha.
    lastFetch[summary ? 'summary' : 'full'] = { data, ts: Date.now() };
    if (!summary) initMemCache(data);
    return data;
  } catch {
    return null;
  }
}

function guardarCarpetasEnSessionStorage(data: FlotaCarpeta[], summary: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(summary ? SS_KEY_SUMMARY : SS_KEY_FULL, JSON.stringify(data));
  } catch {
    // Quota exceeded (poco probable con summary ~230 KB): limpiamos y seguimos.
    try { window.sessionStorage.removeItem(summary ? SS_KEY_SUMMARY : SS_KEY_FULL); } catch { /* */ }
  }
}

/** Limpia todo cache persistente. Llamar en logout. */
export function limpiarCacheCarpetasSesion(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(SS_KEY_SUMMARY);
    window.sessionStorage.removeItem(SS_KEY_FULL);
  } catch { /* */ }
  lastFetch.summary = null;
  lastFetch.full = null;
  memCache = null;
}

/** Carga carpetas desde el servidor e inicializa el caché en memoria.
 *  Si `summary=true`, el payload se reduce ~25× (sin trabajo/original/sinco crudos);
 *  solo incluye vehiculosCount y vehiculosTipos — suficientes para dashboard, portfolio y KPIs. */
export async function cargarCarpetasDelServidor(signal?: AbortSignal, summary?: boolean): Promise<FlotaCarpeta[]> {
  const key = summary ? 'summary' : 'full';
  // 1. Si hay fetch en curso del mismo tipo, reutilizamos la misma promesa (dedup).
  const pending = inflight[key];
  if (pending) return pending;
  // 2. Si hay resultado reciente (<5s), devolverlo sin red.
  const cached = lastFetch[key];
  if (cached && (Date.now() - cached.ts) < FETCH_TTL_MS) return cached.data;
  // 3. Fetch real.
  const url = summary ? '/api/flotas/carpetas?summary=true' : '/api/flotas/carpetas';
  const p = (async () => {
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error('Server error');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw: any[] = await res.json();
      const data: FlotaCarpeta[] = raw.map(c => ({ ...c, comisionBase: c.comisionBase ?? c.porcentajeComision }));
      lastFetch[key] = { data, ts: Date.now() };
      // Solo el payload completo alimenta el memCache editable (summary no tiene trabajo/original).
      if (!summary) initMemCache(data);
      // Persistir en sessionStorage para arranques instantáneos en próximos cambios de zona.
      guardarCarpetasEnSessionStorage(data, !!summary);
      return data;
    } finally {
      inflight[key] = null;
    }
  })();
  inflight[key] = p;
  return p;
}

/** Invalida el cache TTL (usar tras un guardarCarpeta, cambio de estado, etc.). */
export function invalidarCacheCarpetas(): void {
  lastFetch.summary = null;
  lastFetch.full = null;
}

export function listarCarpetas(): FlotaCarpeta[] {
  return loadAll().sort((a, b) =>
    new Date(b.actualizadaEn).getTime() - new Date(a.actualizadaEn).getTime()
  );
}

export function crearCarpeta(nombre: string, corredor_id?: string, creado_por?: string): FlotaCarpeta {
  const now = new Date().toISOString();
  const carpeta: FlotaCarpeta = {
    id: `carpeta_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
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

/** Pide el detalle completo de una carpeta al servidor (original, trabajo, oferta, sinco…). Devuelve null si falla. */
export async function cargarCarpetaDelServidor(id: string): Promise<FlotaCarpeta | null> {
  try {
    const res = await fetch(`/api/flotas/carpetas/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = await res.json();
    return { ...c, comisionBase: c.comisionBase ?? c.porcentajeComision } as FlotaCarpeta;
  } catch {
    return null;
  }
}

export function eliminarCarpeta(id: string): void {
  saveAll(loadAll().filter(c => c.id !== id));
  syncDelete(id);
}

export function borrarTodasLasCarpetas(): void {
  saveAll([]);
  fetch('/api/flotas/carpetas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'replaceAll', carpetas: [] }),
  }).catch(() => {});
}
