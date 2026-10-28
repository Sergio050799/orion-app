"use client";

import React, { useState, useEffect } from 'react';
import SilverdatModal from './SilverdatModal';

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
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--quiet,rgba(144,157,180,0.7))', padding: '6px 10px', flexShrink: 0 }}>
          <svg style={{ animation: 'sdChipSpin 1s linear infinite', flexShrink: 0 }} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity="0.2"/><path d="M21 12a9 9 0 00-9-9"/>
          </svg>
          SD...
        </span>
      ) : (
        <button onClick={() => setShowModal(true)} className="sdchip" data-on={sdSession === 'ok' ? 'true' : 'false'}>
          {sdSession === 'ok' ? 'Silverdat conectado' : 'Silverdat desconectado'}
        </button>
      )}
    </>
  );
}
