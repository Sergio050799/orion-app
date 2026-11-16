// ─── CORREDOR — Entidad comercial que agrupa flotas ───────────────────────────

export type Periodicidad = 'mensual' | 'bimestral' | 'trimestral' | 'semestral' | 'anual';
export type Sucursal = 'TITAN' | 'MEDIACION';

export interface Corredor {
  id: string;
  codigo: string;
  nombre: string;
  cif: string;
  domicilio?: string;
  comisionBase: number;
  /** @deprecated alias de comisionBase; usar comisionBase */
  porcentajeComision?: number;
  comisionExtra?: number;
  periodicidad: Periodicidad;
  formaPago: string;
  contacto: string;
  email: string;
  telefono: string;
  observaciones: string;
  sucursal?: Sucursal;
  comercial?: string;
  idPerceptor?: string;
  creado_por?: string;
  creadoEn: string;
  actualizadoEn: string;
}

// ─── Session cache ────────────────────────────────────────────────────────────

let memCache: Corredor[] | null = null;

function loadAll(): Corredor[] {
  return memCache ?? [];
}

function saveAll(corredores: Corredor[]): void {
  memCache = corredores;
}

// ─── Server sync ──────────────────────────────────────────────────────────────

function syncUpsert(corredor: Corredor): void {
  fetch('/api/flotas/corredores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'upsert', corredor }),
  }).catch(() => {});
}

function syncDelete(id: string): void {
  fetch('/api/flotas/corredores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete', id }),
  }).catch(() => {});
}

// Cache persistente en sessionStorage, mismo patrón que carpetas.
const SS_KEY_CORREDORES = 'orion:corredores';

export function leerCorredoresDeSessionStorage(): Corredor[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(SS_KEY_CORREDORES);
    if (!raw) return null;
    const data = JSON.parse(raw) as Corredor[];
    memCache = data;
    return data;
  } catch {
    return null;
  }
}

/** Limpia el cache persistente de corredores. Llamar en logout. */
export function limpiarCacheCorredoresSesion(): void {
  if (typeof window === 'undefined') return;
  try { window.sessionStorage.removeItem(SS_KEY_CORREDORES); } catch { /* */ }
  memCache = null;
}

/** Carga corredores desde el servidor e inicializa el caché en memoria. */
export async function cargarCorredoresDelServidor(signal?: AbortSignal): Promise<Corredor[]> {
  const res = await fetch('/api/flotas/corredores', { signal });
  if (!res.ok) throw new Error('Server error');
  const data: Corredor[] = await res.json();
  memCache = data;
  // Persistir en sessionStorage para arranques instantáneos.
  if (typeof window !== 'undefined') {
    try { window.sessionStorage.setItem(SS_KEY_CORREDORES, JSON.stringify(data)); } catch { /* quota */ }
  }
  return data;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export function listarCorredores(): Corredor[] {
  return loadAll().sort((a, b) => a.nombre.localeCompare(b.nombre));
}

export function crearCorredor(
  datos: Omit<Corredor, 'id' | 'codigo' | 'creadoEn' | 'actualizadoEn'> & { codigo?: string; comisionExtra?: number }
): Corredor {
  const now = new Date().toISOString();
  const all = loadAll();
  const nextNum = all.length + 1;
  const corredor: Corredor = {
    ...datos,
    id: `corredor_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    codigo: datos.codigo || `COR-${String(nextNum).padStart(3, '0')}`,
    creadoEn: now,
    actualizadoEn: now,
  };
  all.push(corredor);
  saveAll(all);
  syncUpsert(corredor);
  return corredor;
}

export function guardarCorredor(corredor: Corredor): void {
  corredor.actualizadoEn = new Date().toISOString();
  const all = loadAll();
  const idx = all.findIndex(c => c.id === corredor.id);
  if (idx >= 0) all[idx] = corredor; else all.push(corredor);
  saveAll(all);
  syncUpsert(corredor);
}

export function cargarCorredor(id: string): Corredor | null {
  return loadAll().find(c => c.id === id) ?? null;
}

export function eliminarCorredor(id: string): void {
  saveAll(loadAll().filter(c => c.id !== id));
  syncDelete(id);
}

export function borrarTodosLosCorredores(): void {
  saveAll([]);
  fetch('/api/flotas/corredores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'deleteAll' }),
  }).catch(() => {});
}

export async function sincronizarCorredores(corredores: Corredor[]): Promise<void> {
  await fetch('/api/flotas/corredores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'replaceAll', corredores }),
  });
}
