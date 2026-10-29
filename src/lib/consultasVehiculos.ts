// Consultas de Vehículos (normales y masivas) guardadas para no perder un estudio.
// Primero va al servidor (tabla consultas_vehiculos); además se guarda una copia en este navegador.
// Si el servidor aún no tiene la tabla o no responde, la copia local lo conserva y se reenvía sola más tarde.

export type TipoConsulta = 'normal' | 'masiva';

export interface ConsultaResumen {
  id: string;
  tipo: TipoConsulta;
  nombre: string;
  creado_por: string;
  n_vehiculos: number;
  n_identificados: number;
  created_at: string;
  updated_at: string;
  /** solo en copia local: true si el servidor no la tiene todavía */
  pendiente?: boolean;
}

export interface ConsultaCompleta extends ConsultaResumen {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

export interface ConsultaAGuardar {
  id: string;
  tipo: TipoConsulta;
  nombre: string;
  n_vehiculos: number;
  n_identificados: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

const LS_IDX = 'orion-consultas-vehiculos:idx';
const LS_ITEM = 'orion-consultas-vehiculos:';

export const nuevoIdConsulta = () => `cv_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

function lsGet<T>(k: string): T | null {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : null; } catch { return null; }
}
function lsSet(k: string, v: unknown): boolean {
  try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; }
}
function lsDel(k: string) { try { localStorage.removeItem(k); } catch { /* sin almacenamiento */ } }

const indiceLocal = (): ConsultaResumen[] => lsGet<ConsultaResumen[]>(LS_IDX) ?? [];

function guardaLocal(c: ConsultaCompleta) {
  const { data, ...resumen } = c;
  lsSet(LS_ITEM + c.id, c);
  const idx = indiceLocal().filter(x => x.id !== c.id);
  idx.push(resumen);
  lsSet(LS_IDX, idx);
  void data;
}

async function enviaAlServidor(c: ConsultaCompleta): Promise<boolean> {
  try {
    const res = await fetch('/api/vehiculos/consultas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'upsert',
        consulta: { id: c.id, tipo: c.tipo, nombre: c.nombre, creado_por: c.creado_por, n_vehiculos: c.n_vehiculos, n_identificados: c.n_identificados, data: c.data },
      }),
    });
    if (!res.ok) return false;
    const d = await res.json();
    return d?.ok === true;
  } catch { return false; }
}

/** Guarda (o actualiza) una consulta. Devuelve dónde ha quedado. */
export async function guardarConsulta(c: ConsultaAGuardar): Promise<'servidor' | 'local'> {
  const previa = lsGet<ConsultaCompleta>(LS_ITEM + c.id);
  const ahora = new Date().toISOString();
  const completa: ConsultaCompleta = {
    ...c, creado_por: previa?.creado_por ?? '', created_at: previa?.created_at ?? ahora, updated_at: ahora, pendiente: true,
  };
  guardaLocal(completa);
  const ok = await enviaAlServidor(completa);
  if (ok) { guardaLocal({ ...completa, pendiente: false }); return 'servidor'; }
  return 'local';
}

/** Directorio: lo del servidor más lo que solo está en este navegador. Reenvía lo pendiente. */
export async function listarConsultas(): Promise<ConsultaResumen[]> {
  let srv: ConsultaResumen[] = [];
  try {
    const res = await fetch('/api/vehiculos/consultas');
    if (res.ok) { const d = await res.json(); if (Array.isArray(d)) srv = d; }
  } catch { /* sin servidor */ }
  const idsSrv = new Set(srv.map(s => s.id));
  const locales = indiceLocal();
  for (const l of locales) {
    if (idsSrv.has(l.id) || !l.pendiente) continue;
    const full = lsGet<ConsultaCompleta>(LS_ITEM + l.id);
    if (full && await enviaAlServidor(full)) { guardaLocal({ ...full, pendiente: false }); idsSrv.add(l.id); srv.push({ ...l, pendiente: false }); }
  }
  const soloLocal = indiceLocal().filter(l => !idsSrv.has(l.id));
  return [...srv, ...soloLocal].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

export async function cargarConsulta(id: string): Promise<ConsultaCompleta | null> {
  try {
    const res = await fetch(`/api/vehiculos/consultas/${encodeURIComponent(id)}`);
    if (res.ok) { const d = await res.json(); if (d?.ok && d.consulta) return d.consulta as ConsultaCompleta; }
  } catch { /* sin servidor */ }
  return lsGet<ConsultaCompleta>(LS_ITEM + id);
}

export async function borrarConsulta(id: string): Promise<void> {
  lsDel(LS_ITEM + id);
  lsSet(LS_IDX, indiceLocal().filter(x => x.id !== id));
  try {
    await fetch('/api/vehiculos/consultas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
    });
  } catch { /* sin servidor */ }
}

/** dd/mm/yyyy hh:mm */
export function fechaHora(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
