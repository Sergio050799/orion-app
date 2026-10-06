"use client";

export default function OcrPage() {
  return (
    <div className="h-full overflow-y-auto custom-scrollbar animate-in fade-in duration-500">
      <div style={{
        maxWidth: 600, margin: '0 auto', padding: '80px 24px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, textAlign: 'center',
      }}>
        <div style={{
          width: 72, height: 72, borderRadius: 20,
          background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
          display: 'grid', placeItems: 'center',
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.8">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>

        <div>
          <h1 style={{
            fontSize: 20, fontWeight: 900, color: '#FFFFFF',
            textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 10px 0',
          }}>Escáner OCR</h1>
          <div style={{
            display: 'inline-block', fontSize: 11, fontWeight: 800,
            padding: '4px 14px', borderRadius: 999,
            background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)',
            color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16,
          }}>En mantenimiento</div>
          <p style={{ fontSize: 14, color: 'rgba(178,198,245,0.6)', margin: 0, lineHeight: 1.7, maxWidth: 400 }}>
            El módulo de escáner OCR está temporalmente fuera de servicio.
            Volverá disponible próximamente con el modelo de reconocimiento actualizado.
          </p>
        </div>
      </div>
    </div>
  );
}
