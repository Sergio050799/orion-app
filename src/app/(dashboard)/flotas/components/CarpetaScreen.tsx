"use client";

import React, { useState, useEffect } from 'react';
import {
  listarCarpetas, crearCarpeta, eliminarCarpeta, generarPlantillaExcel,
  listarCorredores, crearCorredor,
  type FlotaCarpeta, type Corredor, type Periodicidad,
} from '@/core/flotas';

// ─── Normalización legacy ──────────────────────────────────────────────────────

function normalizarCarpeta(c: FlotaCarpeta): FlotaCarpeta {
  return {
    ...c,
    estado: c.estado ?? 'EN ESTUDIO',
    historico: c.historico ?? [],
  };
}

// ─── Formulario crear corredor ─────────────────────────────────────────────────

const EMPTY_CORREDOR = {
  nombre: '', cif: '', porcentajeComision: '', periodicidad: 'anual' as Periodicidad,
  formaPago: '', contacto: '', email: '', telefono: '',
};

function CrearCorredorForm({ onCreado, onCancelar }: {
  onCreado: (c: Corredor) => void;
  onCancelar: () => void;
}) {
  const [form, setForm] = useState(EMPTY_CORREDOR);
  const set = (k: keyof typeof EMPTY_CORREDOR, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    if (!form.nombre.trim()) return;
    const corredor = crearCorredor({
      nombre: form.nombre.trim(),
      cif: form.cif.trim(),
      porcentajeComision: parseFloat(form.porcentajeComision) || 0,
      periodicidad: form.periodicidad,
      formaPago: form.formaPago.trim(),
      contacto: form.contacto.trim(),
      email: form.email.trim(),
      telefono: form.telefono.trim(),
      observaciones: '',
    });
    onCreado(corredor);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', fontSize: 11, padding: '5px 8px', borderRadius: 6,
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
    color: '#fff', outline: 'none',
  };

  return (
    <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
      <p style={{ fontSize: 10, fontWeight: 900, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
        Nuevo corredor
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <input placeholder="Nombre *" value={form.nombre} onChange={e => set('nombre', e.target.value)} style={inputStyle} />
        </div>
        <input placeholder="CIF" value={form.cif} onChange={e => set('cif', e.target.value)} style={inputStyle} />
        <input placeholder="% Comisión" type="number" min="0" max="100" value={form.porcentajeComision} onChange={e => set('porcentajeComision', e.target.value)} style={inputStyle} />
        <select value={form.periodicidad} onChange={e => set('periodicidad', e.target.value as Periodicidad)}
          style={{ ...inputStyle, cursor: 'pointer' }}>
          <option value="mensual">Mensual</option>
          <option value="trimestral">Trimestral</option>
          <option value="semestral">Semestral</option>
          <option value="anual">Anual</option>
        </select>
        <input placeholder="Forma de pago" value={form.formaPago} onChange={e => set('formaPago', e.target.value)} style={inputStyle} />
        <input placeholder="Contacto" value={form.contacto} onChange={e => set('contacto', e.target.value)} style={inputStyle} />
        <input placeholder="Email" type="email" value={form.email} onChange={e => set('email', e.target.value)} style={inputStyle} />
        <input placeholder="Teléfono" value={form.telefono} onChange={e => set('telefono', e.target.value)} style={inputStyle} />
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <button onClick={handleSubmit} disabled={!form.nombre.trim()}
          style={{ fontSize: 10, fontWeight: 800, padding: '4px 14px', borderRadius: 6, background: form.nombre.trim() ? '#6366f1' : 'rgba(99,102,241,0.3)', color: '#fff', border: 'none', cursor: form.nombre.trim() ? 'pointer' : 'not-allowed' }}>
          Crear corredor
        </button>
        <button onClick={onCancelar}
          style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', border: 'none', cursor: 'pointer' }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ─── CarpetaScreen ─────────────────────────────────────────────────────────────

interface Props {
  onSelect: (carpeta: FlotaCarpeta) => void;
}

export default function CarpetaScreen({ onSelect }: Props) {
  const [carpetas, setCarpetas]         = useState<FlotaCarpeta[]>([]);
  const [nombre, setNombre]             = useState('');
  const [confirmDel, setConfirmDel]     = useState<string | null>(null);
  const [corredores, setCorredores]     = useState<Corredor[]>([]);
  const [corredorId, setCorredorId]     = useState<string>('');  // '' = sin corredor
  const [showCrearCorredor, setShowCrearCorredor] = useState(false);

  useEffect(() => {
    setCarpetas(listarCarpetas().map(normalizarCarpeta));
    setCorredores(listarCorredores());
  }, []);

  const handleCrear = () => {
    const n = nombre.trim();
    if (!n) return;
    const carpeta = crearCarpeta(n, corredorId || undefined);
    setNombre('');
    setCorredorId('');
    setShowCrearCorredor(false);
    onSelect(normalizarCarpeta(carpeta));
  };

  const handleCorredorChange = (val: string) => {
    if (val === '__crear__') {
      setShowCrearCorredor(true);
      setCorredorId('');
    } else {
      setShowCrearCorredor(false);
      setCorredorId(val);
    }
  };

  const handleCorredorCreado = (c: Corredor) => {
    setCorredores(listarCorredores());
    setCorredorId(c.id);
    setShowCrearCorredor(false);
  };

  const handleDescargarPlantilla = async () => {
    const blob = await generarPlantillaExcel();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Plantilla_Flotas.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleEliminar = (id: string) => {
    eliminarCarpeta(id);
    setCarpetas(listarCarpetas().map(normalizarCarpeta));
    setConfirmDel(null);
  };

  const selectStyle: React.CSSProperties = {
    width: '100%', fontSize: 11, padding: '6px 8px', borderRadius: 8,
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    color: corredorId ? '#fff' : 'rgba(255,255,255,0.35)',
    outline: 'none', cursor: 'pointer',
  };

  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
      <div style={{ width: '100%', maxWidth: 560 }}>

        {/* Título */}
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 13, fontWeight: 900, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 4 }}>
            Estudio de Flotas
          </h2>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Selecciona o crea una carpeta de trabajo
          </p>
        </div>

        {/* Descargar plantilla */}
        <div style={{ marginBottom: 20 }}>
          <button
            onClick={handleDescargarPlantilla}
            style={{ fontSize: 11, fontWeight: 700, padding: '6px 14px', borderRadius: 8, color: '#059669', background: 'rgba(5,150,105,0.08)', border: '1px solid rgba(5,150,105,0.25)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(5,150,105,0.15)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(5,150,105,0.08)')}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Descargar plantilla Excel
          </button>
        </div>

        {/* Nueva carpeta */}
        <div style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
            Nueva carpeta
          </p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              type="text"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !showCrearCorredor) handleCrear(); }}
              placeholder="Nombre del estudio (ej. FRILESA S.L.)"
              className="orion-input"
              style={{ flex: 1, fontSize: 12 }}
              autoFocus
            />
            <button
              onClick={handleCrear}
              disabled={!nombre.trim()}
              className="btn-primary"
              style={{ padding: '0 20px', fontSize: 11, fontWeight: 800, opacity: nombre.trim() ? 1 : 0.4 }}>
              Crear
            </button>
          </div>

          {/* Selector corredor */}
          <div>
            <select
              value={showCrearCorredor ? '__crear__' : corredorId}
              onChange={e => handleCorredorChange(e.target.value)}
              style={selectStyle}>
              <option value="">Sin corredor</option>
              {corredores.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}{c.cif ? ` — ${c.cif}` : ''}</option>
              ))}
              <option value="__crear__">+ Crear nuevo corredor</option>
            </select>
            {showCrearCorredor && (
              <CrearCorredorForm
                onCreado={handleCorredorCreado}
                onCancelar={() => { setShowCrearCorredor(false); setCorredorId(''); }}
              />
            )}
          </div>
        </div>

        {/* Carpetas existentes */}
        {carpetas.length > 0 && (
          <div>
            <p style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
              Continuar con una existente
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }} className="custom-scrollbar">
              {carpetas.map(c => (
                <div key={c.id}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer', transition: 'background 0.12s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.12)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}>

                  <button type="button" onClick={() => onSelect(c)}
                    style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{c.nombre}</span>
                      <EstadoBadge estado={c.estado} small />
                    </div>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>
                      {new Date(c.actualizadaEn).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                      {' · '}
                      {c.original.length > 0 ? `${c.original.filter(r => r['matricula']?.trim()).length} vehículos` : 'vacía'}
                    </span>
                  </button>

                  {confirmDel === c.id ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 10, color: '#fca5a5', fontWeight: 700 }}>¿Eliminar?</span>
                      <button onClick={() => handleEliminar(c.id)}
                        style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 4, background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer' }}>Sí</button>
                      <button onClick={() => setConfirmDel(null)}
                        style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', border: 'none', cursor: 'pointer' }}>No</button>
                    </div>
                  ) : (
                    <button onClick={e => { e.stopPropagation(); setConfirmDel(c.id); }}
                      style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.25)', fontSize: 16, lineHeight: 1, padding: '0 4px', marginLeft: 8 }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.25)')}>
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {carpetas.length === 0 && (
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', textAlign: 'center', paddingTop: 12 }}>
            No hay carpetas guardadas todavía.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── EstadoBadge ──────────────────────────────────────────────────────────────

export function EstadoBadge({ estado, small }: { estado: string; small?: boolean }) {
  const cfg: Record<string, { bg: string; border: string; color: string }> = {
    'EN ESTUDIO': { bg: 'rgba(99,102,241,0.15)',  border: 'rgba(99,102,241,0.35)',  color: '#818cf8' },
    'CONTRATADA':  { bg: 'rgba(22,163,74,0.15)',   border: 'rgba(22,163,74,0.35)',   color: '#4ade80' },
    'RECHAZADA':   { bg: 'rgba(239,68,68,0.15)',   border: 'rgba(239,68,68,0.35)',   color: '#f87171' },
  };
  const s = cfg[estado] ?? cfg['EN ESTUDIO'];
  return (
    <span style={{
      fontSize: small ? 8 : 9, fontWeight: 900,
      padding: small ? '1px 5px' : '2px 7px',
      borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.06em',
      background: s.bg, border: `1px solid ${s.border}`, color: s.color,
      whiteSpace: 'nowrap',
    }}>
      {estado}
    </span>
  );
}
