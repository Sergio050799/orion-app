import { suscribir, desuscribir } from './notificador';

export const runtime = 'nodejs';

// SSE endpoint — CarpetaScreen se suscribe aquí para recibir updates al instante
export async function GET() {
  let ctrl: ReadableStreamDefaultController<Uint8Array>;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
      suscribir(ctrl);
      // Ping inicial para confirmar conexión
      ctrl.enqueue(new TextEncoder().encode('data: connected\n\n'));
    },
    cancel() {
      desuscribir(ctrl);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // deshabilita buffer en nginx
    },
  });
}
