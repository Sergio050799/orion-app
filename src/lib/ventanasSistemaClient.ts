// Cliente de las ventanas de años del sistema de emisión.
// Siempre devuelve algo utilizable: la semilla + lo que haya en el servidor + lo aprendido en este navegador
// (si el servidor no responde, lo local sigue valiendo y se reenvía en cuanto vuelva).
import { VENTANAS_SEMILLA, fusionarVentanas, type MapaVentanas, type VentanaSistema } from '@/core/catalogo/ventanasSistema';

const CLAVE = 'orion-ventanas-sistema';

function leerLocal(): VentanaSistema[] {
  try { return JSON.parse(localStorage.getItem(CLAVE) || '[]'); } catch { return []; }
}
function guardarLocal(l: VentanaSistema[]) {
  try { localStorage.setItem(CLAVE, JSON.stringify(l)); } catch { /* sin almacenamiento */ }
}

export async function cargarVentanas(): Promise<MapaVentanas> {
  let mapa: MapaVentanas = { ...VENTANAS_SEMILLA };
  try {
    const r = await fetch('/api/catalogo/ventanas', { cache: 'no-store' });
    if (r.ok) {
      const filas = await r.json();
      if (Array.isArray(filas)) {
        mapa = fusionarVentanas(mapa, filas.map((f: Record<string, unknown>) => ({
          id: String(f.id_veh), fabMin: Number(f.fab_min) || 0, fabMax: Number(f.fab_max) || 0,
          matMin: f.mat_min ? Number(f.mat_min) : null, matMax: f.mat_max ? Number(f.mat_max) : null,
          fuente: String(f.fuente ?? ''), actualizada: String(f.updated_at ?? ''),
        })));
      }
    }
  } catch { /* offline: semilla + local */ }
  return fusionarVentanas(mapa, leerLocal());
}

/** Guarda ventanas nuevas: local siempre, servidor si responde. Devuelve dónde quedaron. */
export async function guardarVentanas(nuevas: VentanaSistema[]): Promise<'servidor' | 'local'> {
  if (nuevas.length === 0) return 'servidor';
  guardarLocal(Object.values(fusionarVentanas(Object.fromEntries(leerLocal().map(v => [v.id, v])), nuevas)));
  let donde: 'servidor' | 'local' = 'local';
  try {
    const r = await fetch('/api/catalogo/ventanas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ventanas: nuevas }),
    });
    if (r.ok) donde = 'servidor';
  } catch { /* se queda local */ }
  // PRE-EMISIÓN (si está abierta) recarga las ventanas al momento
  try { window.dispatchEvent(new Event('orion:ventanas')); } catch { /* sin ventana */ }
  return donde;
}
