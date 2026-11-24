"use client";

// Pantalla de error común a todas las zonas (Dashboard, Corredores, Estudio, Flotas…).
// Sin esto, un fallo de render en cualquier componente dejaba la ruta entera en blanco.
// La barra superior sigue viva (vive en el layout), así que se puede navegar a otra zona.

import { useEffect } from 'react';

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[ORION] error de pantalla:', error);
  }, [error]);

  return (
    <div className="pg" role="alert" style={{ maxWidth: 640, padding: '48px 0' }}>
      <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--quiet)', margin: 0 }}>
        Algo ha fallado
      </p>
      <h1 style={{ font: '600 32px/1.12 var(--font-display)', letterSpacing: '-.045em', margin: '10px 0 12px' }}>
        Esta pantalla no se ha podido mostrar
      </h1>
      <p style={{ color: 'var(--sub)', fontSize: 15, lineHeight: 1.7, margin: 0 }}>
        Lo que ya estaba guardado sigue guardado. Puedes reintentar o recargar la página; si se repite,
        avisa indicando qué estabas haciendo.
      </p>
      {error?.message && (
        <p style={{ color: 'var(--quiet)', fontSize: 13, marginTop: 14, overflowWrap: 'anywhere' }}>
          Detalle técnico: {error.message}{error.digest ? ` · ref. ${error.digest}` : ''}
        </p>
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 22 }}>
        <button className="btn" onClick={() => reset()}>Reintentar</button>
        <button className="mini" onClick={() => window.location.reload()}>Recargar la página</button>
      </div>
    </div>
  );
}
