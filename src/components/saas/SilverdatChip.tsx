"use client";

import React, { useState, useEffect } from 'react';

const FIELD: React.CSSProperties = {
  background: 'rgba(6,14,50,0.6)', border: '1px solid rgba(61,112,255,0.2)',
  borderRadius: 8, color: '#FFFFFF', fontSize: 13, padding: '9px 12px',
  outline: 'none', width: '100%', fontFamily: 'inherit',
};

function SilverdatModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 340, padding: 26, borderRadius: 18, background: 'rgba(6,16,60,0.97)', border: '1px solid rgba(245,158,11,0.3)', boxShadow: '0 30px 80px rgba(0,0,0,0.7)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: 'linear-gradient(135deg,#f59e0b,#d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff', fontSize: 16 }}>S</div>
          <div>
            <p style={{ margin: 0, fontSize: 15, color: '#fff', fontWeight: 700 }}>Silverdat</p>
            <p style={{ margin: 0, fontSize: 11, color: 'rgba(178,198,245,0.55)' }}>DAT / fastVALUATE</p>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <input autoFocus placeholder="N. Cliente DAT" value={datId} onChange={e => setDatId(e.target.value)} style={FIELD} onKeyDown={e => e.key === 'Enter' && go()} />
          <input placeholder="Usuario" value={user} onChange={e => setUser(e.target.value)} style={FIELD} onKeyDown={e => e.key === 'Enter' && go()} />
          <input type="password" placeholder="Contraseña" value={pass} onChange={e => setPass(e.target.value)} style={FIELD} onKeyDown={e => e.key === 'Enter' && go()} />
        </div>
        {error && <p style={{ margin: '8px 0 0', fontSize: 11, color: '#ef4444', fontWeight: 600 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={go} disabled={loading || !datId || !user || !pass}
            style={{ flex: 1, padding: '10px 0', borderRadius: 9, background: loading ? 'rgba(245,158,11,0.3)' : 'linear-gradient(135deg,#d97706,#f59e0b)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 12, cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Conectando...' : 'Iniciar sesión'}
          </button>
          <button onClick={onClose} style={{ padding: '10px 14px', borderRadius: 9, background: 'rgba(6,14,50,0.5)', color: '#BDD4FF', border: '1px solid rgba(61,112,255,0.22)', fontSize: 12, cursor: 'pointer' }}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

export default function SilverdatChip({ onSessionChange }: { onSessionChange?: (ok: boolean) => void } = {}) {
  const [sdSession, setSdSession] = useState<'checking' | 'ok' | 'none'>('checking');
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetch('/api/silverdat/login', { signal: AbortSignal.timeout(8000) })
      .then(r => r.json())
      .then(d => {
        const ok = !!d.hasSession;
        setSdSession(ok ? 'ok' : 'none');
        onSessionChange?.(ok);
      })
      .catch(() => { setSdSession('none'); onSessionChange?.(false); });
  }, []);

  const handleSuccess = () => {
    setShowModal(false);
    setSdSession('ok');
    onSessionChange?.(true);
  };

  return (
    <>
      {showModal && <SilverdatModal onClose={() => setShowModal(false)} onSuccess={handleSuccess} />}
      <style>{`@keyframes sdChipSpin { to { transform: rotate(360deg); } }`}</style>

      {sdSession === 'checking' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(178,198,245,0.4)', padding: '6px 10px' }}>
          <svg style={{ animation: 'sdChipSpin 1s linear infinite', flexShrink: 0 }} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity="0.2"/><path d="M21 12a9 9 0 00-9-9"/>
          </svg>
          Silverdat...
        </div>
      ) : sdSession === 'ok' ? (
        <button onClick={() => setShowModal(true)} style={{ padding: '6px 14px', borderRadius: 8, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
          Silverdat conectado
        </button>
      ) : (
        <button onClick={() => setShowModal(true)} style={{ padding: '7px 16px', borderRadius: 8, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.45)', color: '#f59e0b', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
          Conectar Silverdat
        </button>
      )}
    </>
  );
}
