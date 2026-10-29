"use client";

export default function OcrPage() {
  return (
    <div className="pg">
      <section className="intro">
        <div>
          <h1>Escáner</h1>
          <p>Lectura de documentos con reconocimiento óptico (OCR)</p>
        </div>
        <div className="actions">
          <span className="tag" style={{ ['--c' as string]: 'var(--warn)' }}>En mantenimiento</span>
        </div>
      </section>

      <section className="chkzone">
        <div className="chkbox" style={{ ['--c' as string]: 'var(--warn)', marginTop: 0 }}>
          <h3>El escáner está temporalmente fuera de servicio</h3>
          <p>Volverá a estar disponible próximamente con el modelo de reconocimiento actualizado. Mientras tanto, el resto de ORION funciona con normalidad.</p>
        </div>
      </section>

      <div className="footer">
        <span>ORION · Datos en tiempo real</span>
        <span>Escáner</span>
      </div>
    </div>
  );
}
