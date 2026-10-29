'use client';

import React, { useState } from 'react';

/** Ventana de conexión con Silverdat (compartida por el chip del encabezado y la zona Vehículos). Solo presentación + la misma llamada de login de siempre. */
export default function SilverdatModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [datId, setDatId] = useState('');
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const go = async () => {
    if (!datId || !user || !pass) return;
    setLoading(true); setError('');
    try {
      const r = await fetch('/api/silverdat/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datId, user, pass }),
        signal: AbortSignal.timeout(18000),
      });
      const d = await r.json();
      if (d.ok) onSuccess(); else setError(d.error || 'Credenciales incorrectas');
    } catch (e) {
      setError(e instanceof Error && e.name === 'TimeoutError' ? 'Silverdat no responde (timeout)' : 'Error de conexión');
    } finally { setLoading(false); }
  };

  return (
    <div className="sdm-wrap" onClick={onClose} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      <div className="sdm" role="dialog" aria-modal="true" aria-labelledby="sdmT" onClick={e => e.stopPropagation()}>
        <div className="over">Silverdat</div>
        <h3 id="sdmT">Conectar con Silverdat</h3>
        <p className="desc">Servicio externo de DAT para completar los datos técnicos de cada vehículo. Las credenciales no se guardan en ORION.</p>
        <form onSubmit={e => { e.preventDefault(); go(); }} noValidate>
          <div className="fld"><label htmlFor="sd_c">Nº de cliente DAT</label><input id="sd_c" className="inp" autoFocus autoComplete="off" inputMode="numeric" value={datId} onChange={e => setDatId(e.target.value)} /></div>
          <div className="fld"><label htmlFor="sd_u">Usuario</label><input id="sd_u" className="inp" autoComplete="off" value={user} onChange={e => setUser(e.target.value)} /></div>
          <div className="fld"><label htmlFor="sd_p">Contraseña</label><input id="sd_p" className="inp" type="password" autoComplete="off" value={pass} onChange={e => setPass(e.target.value)} /></div>
          <div className="ferr" role="alert">{error}</div>
          <div className="fact">
            <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn sd" disabled={loading || !datId || !user || !pass}>{loading ? 'Conectando…' : 'Conectar'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
