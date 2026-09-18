// ─── CORREDOR — Entidad comercial que agrupa flotas ───────────────────────────

export type Periodicidad = 'mensual' | 'trimestral' | 'semestral' | 'anual';
export type Sucursal = 'TITAN' | 'MEDIACION';

export interface Corredor {
  id: string;
  codigo: string;
  nombre: string;
  cif: string;
  domicilio?: string;
  porcentajeComision: number;
  periodicidad: Periodicidad;
  formaPago: string;
  contacto: string;
  email: string;
  telefono: string;
  observaciones: string;
  sucursal?: Sucursal;
  comercial?: string;
  creado_por?: string;   // username de quien lo creó
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

/** Carga corredores desde el servidor e inicializa el caché en memoria. */
export async function cargarCorredoresDelServidor(signal?: AbortSignal): Promise<Corredor[]> {
  const res = await fetch('/api/flotas/corredores', { signal });
  if (!res.ok) throw new Error('Server error');
  const data: Corredor[] = await res.json();
  memCache = data;
  return data;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export function listarCorredores(): Corredor[] {
  return loadAll().sort((a, b) => a.nombre.localeCompare(b.nombre));
}

export function crearCorredor(
  datos: Omit<Corredor, 'id' | 'codigo' | 'creadoEn' | 'actualizadoEn'> & { codigo?: string }
): Corredor {
  const now = new Date().toISOString();
  const all = loadAll();
  const nextNum = all.length + 1;
  const corredor: Corredor = {
    ...datos,
    id: `corredor_${Date.now()}`,
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
