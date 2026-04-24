// ─── CORREDOR — Entidad comercial que agrupa flotas ───────────────────────────

export type Periodicidad = 'mensual' | 'trimestral' | 'semestral' | 'anual';

export interface Corredor {
  id: string;
  nombre: string;
  cif: string;
  domicilio?: string;            // Dirección fiscal del corredor (para factura)
  porcentajeComision: number;   // ej: 15 (= 15%)
  periodicidad: Periodicidad;
  formaPago: string;            // texto libre: "Transferencia", "Domiciliación", etc.
  contacto: string;             // nombre del contacto principal
  email: string;
  telefono: string;
  observaciones: string;
  creadoEn: string;             // ISO
  actualizadoEn: string;        // ISO
}

const STORAGE_KEY = 'flotas_corredores_v1';

function loadAll(): Corredor[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch { return []; }
}

function saveAll(corredores: Corredor[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(corredores));
}

export function listarCorredores(): Corredor[] {
  return loadAll().sort((a, b) => a.nombre.localeCompare(b.nombre));
}

export function crearCorredor(datos: Omit<Corredor, 'id' | 'creadoEn' | 'actualizadoEn'>): Corredor {
  const now = new Date().toISOString();
  const corredor: Corredor = {
    ...datos,
    id: `corredor_${Date.now()}`,
    creadoEn: now,
    actualizadoEn: now,
  };
  const all = loadAll();
  all.push(corredor);
  saveAll(all);
  return corredor;
}

export function guardarCorredor(corredor: Corredor): void {
  corredor.actualizadoEn = new Date().toISOString();
  const all = loadAll();
  const idx = all.findIndex(c => c.id === corredor.id);
  if (idx >= 0) all[idx] = corredor;
  else all.push(corredor);
  saveAll(all);
}

export function cargarCorredor(id: string): Corredor | null {
  return loadAll().find(c => c.id === id) ?? null;
}

export function eliminarCorredor(id: string): void {
  saveAll(loadAll().filter(c => c.id !== id));
}
