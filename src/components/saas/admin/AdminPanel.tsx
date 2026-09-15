"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Version {
  fecha: string;
  count: number;
  activa: boolean;
}

interface Versiones {
  catalogo: Version[];
  matriculas: Version[];
}

interface SectionProps {
  title: string;
  icon: string;
  accept: string;
  file: File | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  status: { type: 'idle' | 'uploading' | 'ok' | 'error'; msg?: string };
  onFileChange: (f: File) => void;
  onUpload: () => void;
  versions?: Version[];
  loadingVersiones: boolean;
  seedWarning?: boolean;
}

// ─── Section ──────────────────────────────────────────────────────────────────

function Section({ title, icon, accept, file, inputRef, status, onFileChange, onUpload, versions, loadingVersiones, seedWarning }: SectionProps) {
  return (
    <div className="glass-card rounded-2xl p-5 mb-4">
      <p className="text-[11px] font-black uppercase tracking-widest mb-3" style={{ color: 'rgba(178,198,245,0.78)' }}>
        {icon} {title}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <button
          onClick={() => inputRef.current?.click()}
          style={{ fontSize: 11, fontWeight: 700, padding: '6px 12px', borderRadius: 8, color: '#3366FF', background: 'rgba(18,64,204,0.1)', border: '1px solid rgba(18,64,204,0.25)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          {file ? file.name : `Seleccionar ${accept.toUpperCase()}`}
        </button>
        <input ref={inputRef} type="file" accept={accept} style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) onFileChange(f); e.target.value = ''; }} />
        <button
          onClick={onUpload}
          disabled={!file || status.type === 'uploading'}
          style={{
            fontSize: 11, fontWeight: 800, padding: '6px 16px', borderRadius: 8,
            color: '#fff', background: (!file || status.type === 'uploading') ? 'rgba(18,64,204,0.3)' : '#1240CC',
            border: 'none', cursor: (!file || status.type === 'uploading') ? 'not-allowed' : 'pointer',
          }}>
          {status.type === 'uploading' ? 'Subiendo...' : 'Subir'}
        </button>
      </div>
      {status.type === 'ok' && (
        <div style={{ marginBottom: 10, padding: '5px 10px', borderRadius: 6, background: seedWarning ? 'rgba(234,179,8,0.12)' : 'rgba(22,163,74,0.12)', border: `1px solid ${seedWarning ? 'rgba(234,179,8,0.3)' : 'rgba(22,163,74,0.3)'}`, fontSize: 11, fontWeight: 700, color: seedWarning ? '#fbbf24' : '#4ade80' }}>
          {status.msg}
        </div>
      )}
      {status.type === 'error' && (
        <div style={{ marginBottom: 10, padding: '5px 10px', borderRadius: 6, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', fontSize: 11, fontWeight: 700, color: '#f87171' }}>
          {status.msg}
        </div>
      )}
      {seedWarning && (
        <p style={{ fontSize: 10, color: 'rgba(178,198,245,0.5)', marginBottom: 10, fontWeight: 600 }}>
          ⚠ Activo tras reiniciar el servidor
        </p>
      )}
      <div>
        <p style={{ fontSize: 10, fontWeight: 800, color: 'rgba(178,198,245,0.42)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
          Versiones
        </p>
        {loadingVersiones && !versions && (
          <p style={{ fontSize: 11, color: 'rgba(178,198,245,0.42)' }}>Cargando...</p>
        )}
        {versions && versions.length === 0 && (
          <p style={{ fontSize: 11, color: 'rgba(178,198,245,0.42)' }}>Sin versiones registradas.</p>
        )}
        {versions && versions.map((v, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: i < versions.length - 1 ? '1px solid rgba(61,112,255,0.12)' : 'none' }}>
            <span style={{ fontSize: 10, color: v.activa ? '#4ade80' : 'rgba(178,198,245,0.5)', fontWeight: 800 }}>{v.activa ? '●' : '○'}</span>
            <span style={{ fontSize: 11, color: v.activa ? '#BDD4FF' : 'rgba(178,198,245,0.6)', fontWeight: v.activa ? 700 : 500, flex: 1 }}>{v.fecha}</span>
            <span style={{ fontSize: 10, color: 'rgba(178,198,245,0.55)', fontWeight: 600 }}>
              {v.count.toLocaleString('es-ES')} {accept === '.csv' ? 'veh.' : 'entradas'}
            </span>
            {v.activa && (
              <span style={{ fontSize: 9, fontWeight: 900, padding: '1px 6px', borderRadius: 4, background: 'rgba(74,222,128,0.15)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                ACTIVA
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── AdminPanel ────────────────────────────────────────────────────────────────

export default function AdminPanel({ onClose }: { onClose: () => void }) {
  const [secret, setSecret] = useState<string>(() => {
    if (typeof window !== 'undefined') return sessionStorage.getItem('admin_secret') ?? '';
    return '';
  });
  const [secretInput, setSecretInput] = useState('');
  const [needsAuth, setNeedsAuth] = useState(false);

  const [versiones, setVersiones] = useState<Versiones | null>(null);
  const [loadingVersiones, setLoadingVersiones] = useState(false);

  const [catalogoFile, setCatalogoFile] = useState<File | null>(null);
  const [catalogoStatus, setCatalogoStatus] = useState<{ type: 'idle' | 'uploading' | 'ok' | 'error'; msg?: string }>({ type: 'idle' });

  const [matriculasFile, setMatriculasFile] = useState<File | null>(null);
  const [matriculasStatus, setMatriculasStatus] = useState<{ type: 'idle' | 'uploading' | 'ok' | 'error'; msg?: string }>({ type: 'idle' });

  const catalogoInputRef = useRef<HTMLInputElement>(null);
  const matriculasInputRef = useRef<HTMLInputElement>(null);

  const saveSecret = () => {
    const s = secretInput.trim();
    if (!s) return;
    sessionStorage.setItem('admin_secret', s);
    setSecret(s);
    setNeedsAuth(false);
    setSecretInput('');
  };

  const fetchVersiones = useCallback(async (s?: string) => {
    const tok = s ?? secret;
    if (!tok) { setNeedsAuth(true); return; }
    setLoadingVersiones(true);
    try {
      const res = await fetch('/api/admin/versiones', {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.status === 401) { setNeedsAuth(true); setLoadingVersiones(false); return; }
      const data = await res.json();
      setVersiones(data);
    } catch {
      // silencioso
    } finally {
      setLoadingVersiones(false);
    }
  }, [secret]);

  useEffect(() => {
    if (secret) fetchVersiones(secret);
    else setNeedsAuth(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secret]);

  const upload = async (
    endpoint: string,
    file: File,
    setStatus: React.Dispatch<React.SetStateAction<{ type: 'idle' | 'uploading' | 'ok' | 'error'; msg?: string }>>,
  ) => {
    setStatus({ type: 'uploading' });
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}` },
        body: form,
      });
      if (res.status === 401) { setNeedsAuth(true); setStatus({ type: 'idle' }); return; }
      const data = await res.json();
      if (!res.ok) { setStatus({ type: 'error', msg: data?.error ?? `Error ${res.status}` }); return; }
      const msg = endpoint.includes('catalogo')
        ? `Activo — ${data.count?.toLocaleString('es-ES') ?? '?'} vehículos cargados`
        : 'Guardado — Activo tras reiniciar el servidor';
      setStatus({ type: 'ok', msg });
      fetchVersiones();
    } catch (err: unknown) {
      setStatus({ type: 'error', msg: err instanceof Error ? err.message : 'Error desconocido' });
    }
  };

  return (
    <>
      {/* Overlay */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 90 }} />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 560,
        background: 'linear-gradient(180deg, rgba(8,22,72,0.95) 0%, rgba(0,7,45,0.98) 100%)',
        border: '1px solid rgba(61,112,255,0.22)',
        borderRight: 'none',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid rgba(61,112,255,0.16)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: '0.12em', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 6, height: 16, borderRadius: 3, background: '#1240CC', flexShrink: 0 }} />
              Configuración — Base de Datos
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: 10, color: 'rgba(178,198,245,0.5)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Panel de administración
            </p>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(178,198,245,0.5)', fontSize: 22, lineHeight: 1, padding: 4,
          }}>×</button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }} className="custom-scrollbar">

          {needsAuth && (
            <div className="glass-card rounded-2xl p-5 mb-5" style={{ border: '1px solid rgba(239,68,68,0.3)' }}>
              <p className="text-[11px] font-black uppercase tracking-widest mb-3" style={{ color: '#fca5a5' }}>
                Clave de administrador requerida
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="password"
                  value={secretInput}
                  onChange={e => setSecretInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveSecret(); }}
                  placeholder="Introduce la clave admin"
                  className="orion-input"
                  style={{ flex: 1, fontSize: 12 }}
                  autoFocus
                />
                <button
                  onClick={saveSecret}
                  disabled={!secretInput.trim()}
                  className="btn-primary"
                  style={{ padding: '0 20px', fontSize: 11, fontWeight: 800, opacity: secretInput.trim() ? 1 : 0.4 }}>
                  Entrar
                </button>
              </div>
            </div>
          )}

          <Section
            title="Catálogo de Vehículos"
            icon="🗂"
            accept=".csv"
            file={catalogoFile}
            inputRef={catalogoInputRef}
            status={catalogoStatus}
            onFileChange={f => { setCatalogoFile(f); setCatalogoStatus({ type: 'idle' }); }}
            onUpload={() => catalogoFile && upload('/api/admin/catalogo', catalogoFile, setCatalogoStatus)}
            versions={versiones?.catalogo}
            loadingVersiones={loadingVersiones}
          />

          <Section
            title="Seed Matrículas"
            icon="📅"
            accept=".json"
            file={matriculasFile}
            inputRef={matriculasInputRef}
            status={matriculasStatus}
            onFileChange={f => { setMatriculasFile(f); setMatriculasStatus({ type: 'idle' }); }}
            onUpload={() => matriculasFile && upload('/api/admin/matriculas', matriculasFile, setMatriculasStatus)}
            versions={versiones?.matriculas}
            loadingVersiones={loadingVersiones}
            seedWarning
          />

          <button
            onClick={() => fetchVersiones()}
            disabled={loadingVersiones || !secret}
            style={{
              fontSize: 10, fontWeight: 800, padding: '6px 16px', borderRadius: 8,
              color: '#1240CC', background: 'rgba(18,64,204,0.08)',
              border: '1px solid rgba(18,64,204,0.2)', cursor: 'pointer',
              opacity: loadingVersiones ? 0.5 : 1,
            }}>
            {loadingVersiones ? 'Cargando...' : '↻ Refrescar versiones'}
          </button>
        </div>
      </div>
    </>
  );
}
