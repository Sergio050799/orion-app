// Módulo singleton — vive en el proceso Node mientras PM2 esté corriendo.
// Cuando una carpeta o corredor cambia, notificarCambio() empuja un evento
// a todos los clientes SSE conectados (CarpetaScreen).

type Ctrl = ReadableStreamDefaultController<Uint8Array>;

const suscriptores = new Set<Ctrl>();
const encoder = new TextEncoder();

export function suscribir(ctrl: Ctrl) {
  suscriptores.add(ctrl);
}

export function desuscribir(ctrl: Ctrl) {
  suscriptores.delete(ctrl);
}

export function notificarCambio() {
  const msg = encoder.encode('data: update\n\n');
  const muertos: Ctrl[] = [];
  for (const ctrl of suscriptores) {
    try {
      ctrl.enqueue(msg);
    } catch {
      muertos.push(ctrl);
    }
  }
  muertos.forEach(c => suscriptores.delete(c));
}
