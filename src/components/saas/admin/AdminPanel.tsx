"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DetailDrawer } from '@/components/saas/DetailDrawer';
import { nf } from '@/lib/fmt';

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

function Section({ title, accept, file, inputRef, status, onFileChange, onUpload, versions, loadingVersiones, seedWarning }: SectionProps) {
  const busy = status.type === 'uploading';
  return (
    <>
      <h4>{title}</h4>
      <div className="dacts" style={{ marginTop: 0 }}>
        <button className="mini" onClick={() => inputRef.current?.click()}>
          {file ? file.name : `Seleccionar ${accept}`}
        </button>
        <input ref={inputRef} type="file" accept={accept} style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) onFileChange(f); e.target.value = ''; }} />
        <button className="mini pri" onClick={onUpload} disabled={!file || busy}>
          {busy ? 'Subiendo…' : 'Subir'}
        </button>
      </div>
      {status.type === 'ok' && (
        <div className="banner" style={{ ['--c' as string]: seedWarning ? 'var(--warn)' : 'var(--blue)' }}><span>{status.msg}</span></div>
      )}
      {status.type === 'error' && (
        <div className="banner" style={{ ['--c' as string]: 'var(--sdoff)' }}><span>{status.msg}</span></div>
      )}
      {seedWarning && <p className="note" style={{ marginTop: 10 }}>Se activa tras reiniciar el servidor.</p>}

      <div className="scroll" style={{ marginTop: 14 }}>
        {loadingVersiones && !versions && <p className="note" style={{ marginTop: 0 }}>Cargando versiones…</p>}
        {versions && versions.length === 0 && <p className="note" style={{ marginTop: 0 }}>Sin versiones registradas.</p>}
        {versions && versions.length > 0 && (
          <table className="dtbl">
            <thead><tr><th>Versión</th><th>{accept === '.csv' ? 'Vehículos' : 'Entradas'}</th><th>Estado</th></tr></thead>
            <tbody>
              {versions.map((v, i) => (
                <tr key={i}>
                  <td className="nm">{v.fecha}</td>
                  <td>{nf(v.count)}</td>
                  <td><span className="tag" style={{ ['--c' as string]: v.activa ? 'var(--blue)' : 'var(--quiet)' }}>{v.activa ? 'Activa' : 'Anterior'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
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
        ? `Activo: ${data.count != null ? nf(data.count) : '?'} vehículos cargados`
        : 'Guardado. Se activa tras reiniciar el servidor.';
      setStatus({ type: 'ok', msg });
      fetchVersiones();
    } catch (err: unknown) {
      setStatus({ type: 'error', msg: err instanceof Error ? err.message : 'Error desconocido' });
    }
  };

  return (
    <DetailDrawer isOpen onClose={onClose} data={null}>
      <div className="over">Administración</div>
      <h3>Base de datos</h3>
      <p className="desc">Catálogo de vehículos y seed de matrículas. Cada subida crea una versión nueva.</p>

      {needsAuth && (
        <form className="form" onSubmit={e => { e.preventDefault(); saveSecret(); }} noValidate>
          <h4>Clave de administrador</h4>
          <div className="fld">
            <label htmlFor="adm_k">Clave</label>
            <input id="adm_k" type="password" className="inp" value={secretInput} onChange={e => setSecretInput(e.target.value)} placeholder="Introduce la clave de administrador" autoFocus />
          </div>
          <div className="fact"><button type="submit" className="btn" disabled={!secretInput.trim()}>Entrar</button></div>
        </form>
      )}

      <Section
        title="Catálogo de vehículos"
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
        title="Seed de matrículas"
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

      <div className="dacts">
        <button className="mini" onClick={() => fetchVersiones()} disabled={loadingVersiones || !secret}>
          {loadingVersiones ? 'Cargando…' : 'Actualizar versiones'}
        </button>
      </div>
    </DetailDrawer>
  );
}
