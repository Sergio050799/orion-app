'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  listarCorredores, crearCorredor, guardarCorredor, eliminarCorredor, cargarCorredoresDelServidor, borrarTodosLosCorredores,
  type Corredor, type Periodicidad, type Sucursal,
} from '@/core/flotas';
import { listarCarpetas, crearCarpeta, guardarCarpeta, eliminarCarpeta, borrarTodasLasCarpetas, cargarCarpetasDelServidor, type FlotaCarpeta } from '@/core/flotas';

// ─── Constantes ──────────────────────────────────────────────────────────────

const SUCURSALES: Sucursal[] = ['TITAN', 'MEDIACION'];

// ─── Tipos ──────────────────────────────────────────────────────────────────

type Vista = 'lista' | 'detalle';
type FormData = Omit<Corredor, 'id' | 'creadoEn' | 'actualizadoEn'>;

type SortKey = 'nombre' | 'sucursal' | 'comercial' | 'cif' | 'porcentajeComision' | 'periodicidad' | 'flotas';

const FORM_VACIO: FormData = {
  codigo: '', nombre: '', cif: '', domicilio: '', porcentajeComision: 0,
  periodicidad: 'mensual', formaPago: '', contacto: '',
  email: '', telefono: '', observaciones: '',
  sucursal: undefined, comercial: '', idPerceptor: '',
};

// ─── Icons ──────────────────────────────────────────────────────────────────

function MailIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>;
}
function PhoneIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.3 1.8.6 2.6a2 2 0 01-.5 2.1L8 9.6a16 16 0 006 6l1.2-1.2a2 2 0 012-.5c.9.3 1.7.5 2.6.6a2 2 0 011.7 2z"/></svg>;
}
function UserIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/></svg>;
}
function CashIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/></svg>;
}
function SearchIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function estadoColor(estado: string) {
  if (estado === 'OFERTADA') return 'var(--t-amber)';
  if (estado === 'CONTRATADA') return 'var(--t-green)';
  if (estado === 'RECHAZADA') return 'var(--t-red)';
  return 'var(--t-blue)';
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{
        display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: 'var(--t-text-3)', marginBottom: 6,
      }}>{label}</span>
      {children}
    </label>
  );
}

// ─── SortTh — encabezado de columna ordenable sin icono ─────────────────────

function SortTh({
  col, sortCol, sortDir, onSort, children, style,
}: {
  col: SortKey; sortCol: SortKey; sortDir: 'asc' | 'desc';
  onSort: (col: SortKey) => void; children: React.ReactNode;
  style: React.CSSProperties;
}) {
  const active = sortCol === col;
  return (
    <th style={style}>
      <button
        onClick={() => onSort(col)}
        aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          font: 'inherit', letterSpacing: 'inherit', textTransform: 'uppercase',
          color: active ? 'var(--t-text-2)' : 'var(--t-text-3)',
          fontWeight: active ? 700 : 600,
          display: 'block', width: '100%', textAlign: 'left',
        }}
      >
        {children}
      </button>
    </th>
  );
}

// ─── Panel lateral (crear / editar) — siempre oscuro ────────────────────────

function PanelCorredor({
  corredor, onClose, onSave, comercialesUnicos,
}: {
  corredor: Corredor | null;
  onClose: () => void;
  onSave: (c: Corredor) => void;
  comercialesUnicos: string[];
}) {
  const [form, setForm] = useState<FormData>(corredor ? {
    codigo: corredor.codigo ?? '', nombre: corredor.nombre, cif: corredor.cif,
    domicilio: corredor.domicilio ?? '',
    porcentajeComision: corredor.porcentajeComision,
    periodicidad: corredor.periodicidad,
    formaPago: corredor.formaPago, contacto: corredor.contacto,
    email: corredor.email, telefono: corredor.telefono,
    observaciones: corredor.observaciones,
    sucursal: corredor.sucursal,
    comercial: corredor.comercial ?? '',
    idPerceptor: corredor.idPerceptor ?? '',
  } : { ...FORM_VACIO });

  function set(field: keyof FormData, value: string | number | Periodicidad | Sucursal | undefined) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim()) return;
    if (corredor) {
      const updated: Corredor = { ...corredor, ...form };
      guardarCorredor(updated);
      onSave(updated);
    } else {
      const nuevo = crearCorredor(form);
      onSave(nuevo);
    }
  }

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)', zIndex: 40,
      }} />
      <aside style={{
        position: 'fixed', top: 56, right: 0, bottom: 0, width: 440, zIndex: 50,
        background: '#0c0d10',
        borderLeft: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', flexDirection: 'column',
      }}>
        <header style={{
          padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
          <h2 style={{ margin: 0, fontSize: 16, color: '#f4f4f5', fontWeight: 600 }}>
            {corredor ? 'Editar corredor' : 'Nuevo corredor'}
          </h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#6f747c', fontSize: 22, lineHeight: 1, padding: 4,
          }}>×</button>
        </header>

        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label="Nombre *">
                <input className="panel-input" value={form.nombre} onChange={e => set('nombre', e.target.value)} required />
              </FormField>
              <FormField label="Código Perceptor">
                <input className="panel-input" value={form.codigo} onChange={e => set('codigo', e.target.value)} placeholder="COR-001" />
              </FormField>
            </div>

            <FormField label="ID Perceptor">
              <input className="panel-input" value={form.idPerceptor ?? ''} onChange={e => set('idPerceptor', e.target.value)}
                placeholder="Identificador externo del perceptor" />
            </FormField>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label="Sucursal">
                <select className="panel-input" value={form.sucursal ?? ''}
                  onChange={e => set('sucursal', e.target.value as Sucursal || undefined)}>
                  <option value="">— Sin asignar —</option>
                  {SUCURSALES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </FormField>
              <FormField label="Comercial">
                <select className="panel-input" value={form.comercial ?? ''}
                  onChange={e => set('comercial', e.target.value)}>
                  <option value="">— Sin asignar —</option>
                  {comercialesUnicos.map(com => <option key={com} value={com}>{com}</option>)}
                </select>
              </FormField>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label="CIF">
                <input className="panel-input" value={form.cif} onChange={e => set('cif', e.target.value)} />
              </FormField>
              <FormField label="% Comisión">
                <input className="panel-input" inputMode="decimal"
                  value={form.porcentajeComision}
                  onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d*$/.test(v)) set('porcentajeComision', v === '' ? 0 : parseFloat(v) || 0); }} />
              </FormField>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label="Email">
                <input className="panel-input" type="email" value={form.email} onChange={e => set('email', e.target.value)} />
              </FormField>
              <FormField label="Teléfono">
                <input className="panel-input" value={form.telefono} onChange={e => set('telefono', e.target.value)} />
              </FormField>
            </div>

            <FormField label="Observaciones">
              <textarea className="panel-input" rows={4} value={form.observaciones}
                onChange={e => set('observaciones', e.target.value)} />
            </FormField>
          </div>

          <footer style={{ marginTop: 24, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{
              background: 'none', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8, padding: '9px 18px', color: '#a1a1a6', fontSize: 13,
              cursor: 'pointer', fontWeight: 500,
            }}>Cancelar</button>
            <button type="submit" style={{
              background: '#4387ff', border: 'none',
              borderRadius: 8, padding: '9px 22px',
              color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
              {corredor ? 'Guardar' : 'Crear corredor'}
            </button>
          </footer>
        </form>
      </aside>
    </>
  );
}

// ─── Vista detalle ─────────────────────────────────────────────────────────

function DetalleView({
  corredor, flotas, todasLasCarpetas, onVolver, onEditar, onEliminar, onNuevaFlota, onDesvincularFlota, onVincularExistente,
}: {
  corredor: Corredor; flotas: FlotaCarpeta[]; todasLasCarpetas: FlotaCarpeta[];
  onVolver: () => void; onEditar: () => void;
  onEliminar: (mode: 'desvincular' | 'borrar_flotas') => void;
  onNuevaFlota: () => void;
  onDesvincularFlota: (flotaId: string) => void;
  onVincularExistente: (flotaId: string) => void;
}) {
  const [confirmElim, setConfirmElim] = useState(false);
  const [confirmEdit, setConfirmEdit] = useState(false);
  const [confirmDesvincular, setConfirmDesvincular] = useState<string | null>(null);
  const [showVincular, setShowVincular] = useState(false);
  const [vincularSearch, setVincularSearch] = useState('');

  const disponibles = todasLasCarpetas.filter(c => {
    if (c.corredor_id === corredor.id) return false;
    const q = vincularSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      c.nombre.toLowerCase().includes(q) ||
      (c.header?.tomador ?? '').toLowerCase().includes(q) ||
      (c.header?.cif ?? '').toLowerCase().includes(q)
    );
  });

  const lbl: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
    color: 'var(--t-text-3)', marginBottom: 3,
  };
  const val: React.CSSProperties = { fontSize: 14, color: 'var(--t-text)' };
  const valMono: React.CSSProperties = { ...val, fontFamily: 'monospace', fontSize: 13 };

  function InfoField({ label, value, mono }: { label: string; value?: string | number; mono?: boolean }) {
    if (!value && value !== 0) return null;
    return (
      <div>
        <div style={lbl}>{label}</div>
        <div style={mono ? valMono : val}>{value}</div>
      </div>
    );
  }

  const thF: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
    color: 'var(--t-text-3)', padding: '0 12px 10px 0', textAlign: 'left',
    borderBottom: '1px solid var(--t-line)', whiteSpace: 'nowrap',
  };
  const tdF: React.CSSProperties = {
    padding: '13px 12px 13px 0', borderBottom: '1px solid var(--t-line)',
    fontSize: 13, verticalAlign: 'middle', color: 'var(--t-text-2)',
  };

  return (
    <div className="animate-in fade-in duration-500" style={{ maxWidth: 860, margin: '0 auto' }}>

      {/* ── Volver ─────────────────────────────────────────────────────────── */}
      <button onClick={onVolver} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--t-blue)', fontSize: 13, padding: 0, marginBottom: 22,
        display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500,
      }}>← Volver a corredores</button>

      {/* ── Encabezado ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 680, letterSpacing: '-0.03em', color: 'var(--t-text)' }}>
            {corredor.nombre}
          </h1>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {corredor.cif && (
              <span style={{ fontSize: 12, color: 'var(--t-text-2)', fontFamily: 'monospace' }}>{corredor.cif}</span>
            )}
            {corredor.sucursal && (
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                color: 'var(--t-text-2)',
                background: 'var(--t-line-soft)',
                border: '1px solid var(--t-line)', borderRadius: 4, padding: '2px 7px',
              }}>{corredor.sucursal}</span>
            )}
            {corredor.comercial && (
              <span style={{ fontSize: 12, color: 'var(--t-text-2)', border: '1px solid var(--t-line)', borderRadius: 4, padding: '2px 7px' }}>
                {corredor.comercial}
              </span>
            )}
            {(corredor.porcentajeComision ?? 0) > 0 && (
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-green)' }}>
                {corredor.porcentajeComision}%
              </span>
            )}
          </div>
        </div>

        {/* Acciones */}
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'flex-start' }}>
          {!confirmEdit ? (
            <button onClick={() => setConfirmEdit(true)} style={{
              height: 34, padding: '0 14px', background: 'none',
              border: '1px solid var(--t-line)', borderRadius: 7,
              color: 'var(--t-text-2)', fontSize: 12, cursor: 'pointer', fontWeight: 500,
            }}>Editar</button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--t-line)', borderRadius: 7, padding: '4px 10px', fontSize: 12 }}>
              <span style={{ color: 'var(--t-text-3)', fontSize: 11 }}>¿Editar?</span>
              <button onClick={() => { setConfirmEdit(false); onEditar(); }} style={{
                background: 'var(--t-blue)', border: 'none', borderRadius: 5,
                padding: '3px 10px', color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 600,
              }}>Sí</button>
              <button onClick={() => setConfirmEdit(false)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--t-text-3)', fontSize: 11,
              }}>No</button>
            </div>
          )}
          {!confirmElim ? (
            <button onClick={() => setConfirmElim(true)} style={{
              height: 34, padding: '0 14px', background: 'none',
              border: '1px solid var(--t-line)', borderRadius: 7,
              color: 'var(--t-red)', fontSize: 12, cursor: 'pointer', opacity: 0.75,
            }}>Eliminar</button>
          ) : flotas.length > 0 ? (
            <div style={{ border: '1px solid var(--t-line)', borderRadius: 7, padding: '8px 12px', fontSize: 12 }}>
              <div style={{ color: 'var(--t-red)', fontWeight: 600, marginBottom: 6 }}>
                {flotas.length} flota{flotas.length > 1 ? 's' : ''} vinculadas
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button onClick={() => onEliminar('desvincular')} style={{
                  background: 'none', border: '1px solid var(--t-amber)',
                  borderRadius: 5, padding: '3px 10px', color: 'var(--t-amber)', fontSize: 11, cursor: 'pointer', fontWeight: 600,
                }}>Desvincular y eliminar</button>
                <button onClick={() => onEliminar('borrar_flotas')} style={{
                  background: 'var(--t-red)', border: 'none', borderRadius: 5,
                  padding: '3px 10px', color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 600,
                }}>Borrar todo</button>
                <button onClick={() => setConfirmElim(false)} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--t-text-3)', fontSize: 11,
                }}>Cancelar</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--t-line)', borderRadius: 7, padding: '4px 10px', fontSize: 12 }}>
              <span style={{ color: 'var(--t-text-3)' }}>¿Eliminar?</span>
              <button onClick={() => onEliminar('desvincular')} style={{
                background: 'var(--t-red)', border: 'none', borderRadius: 5,
                padding: '3px 10px', color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 600,
              }}>Sí</button>
              <button onClick={() => setConfirmElim(false)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--t-text-3)', fontSize: 11,
              }}>No</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Info grid ──────────────────────────────────────────────────────── */}
      <div style={{
        marginTop: 28, paddingTop: 24, paddingBottom: 24,
        borderTop: '1px solid var(--t-line)', borderBottom: '1px solid var(--t-line)',
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px 40px',
      }}>
        <InfoField label="Nombre" value={corredor.nombre} />
        <InfoField label="Código Perceptor" value={corredor.codigo} />
        <InfoField label="ID Perceptor" value={corredor.idPerceptor} />
        <InfoField label="CIF" value={corredor.cif} mono />
        <InfoField label="Sucursal" value={corredor.sucursal} />
        <InfoField label="Comercial" value={corredor.comercial} />
        <InfoField label="% Comisión" value={(corredor.porcentajeComision ?? 0) > 0 ? `${corredor.porcentajeComision}%` : undefined} />
        <InfoField label="Email" value={corredor.email} />
        <InfoField label="Teléfono" value={corredor.telefono} />
        {corredor.observaciones && (
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={lbl}>Observaciones</div>
            <div style={{ fontSize: 13, color: 'var(--t-text-2)', lineHeight: 1.6 }}>{corredor.observaciones}</div>
          </div>
        )}
      </div>

      {/* ── Flotas asociadas ───────────────────────────────────────────────── */}
      <div style={{ marginTop: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 650, color: 'var(--t-text)', letterSpacing: '-0.02em' }}>
            Flotas asociadas
            <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--t-text-3)', marginLeft: 8 }}>· {flotas.length}</span>
          </h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setShowVincular(v => !v); setVincularSearch(''); }} style={{
              height: 32, padding: '0 12px', background: 'none',
              border: '1px solid var(--t-line)', borderRadius: 7,
              color: 'var(--t-blue)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>Vincular existentes</button>
            <button onClick={onNuevaFlota} style={{
              height: 32, padding: '0 12px', background: 'var(--t-blue)',
              border: 'none', borderRadius: 7, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>+ Nueva flota</button>
          </div>
        </div>

        {/* Búsqueda vincular */}
        {showVincular && (
          <div style={{ marginBottom: 16, padding: '12px 16px', border: '1px solid var(--t-line)', borderRadius: 8 }}>
            <p style={{ margin: '0 0 10px', fontSize: 11, color: 'var(--t-text-3)', fontWeight: 600 }}>
              Selecciona carpetas para vincular a {corredor.nombre}:
            </p>
            <input
              placeholder="Buscar por nombre, tomador, CIF..."
              value={vincularSearch}
              onChange={e => setVincularSearch(e.target.value)}
              style={{
                width: '100%', marginBottom: 10, padding: '7px 12px',
                background: 'var(--t-surface)', border: '1px solid var(--t-line)',
                borderRadius: 6, color: 'var(--t-text)', fontSize: 13, outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {disponibles.length === 0 ? (
              <p style={{ color: 'var(--t-text-3)', fontSize: 12, textAlign: 'center', padding: '8px 0', margin: 0 }}>
                {vincularSearch ? 'Sin resultados.' : 'Todas las carpetas ya están vinculadas a este corredor.'}
              </p>
            ) : (
              <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {disponibles.map(c => (
                      <tr key={c.id}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--t-line-soft)')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}
                      >
                        <td style={{ padding: '8px 10px', fontSize: 13, color: 'var(--t-text)', fontWeight: 500 }}>
                          {c.nombre || '(sin nombre)'}
                          {c.header?.tomador && (
                            <span style={{ color: 'var(--t-text-3)', fontSize: 11, fontWeight: 400, marginLeft: 8 }}>
                              {c.header.tomador}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '8px 10px', fontSize: 10, color: estadoColor(c.estado ?? 'EN ESTUDIO'), fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {c.estado ?? 'EN ESTUDIO'}
                        </td>
                        <td style={{ padding: '8px 0 8px 10px', textAlign: 'right' }}>
                          <button onClick={() => onVincularExistente(c.id)} style={{
                            background: 'var(--t-blue)', border: 'none', borderRadius: 5,
                            padding: '3px 10px', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                          }}>Vincular</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tabla flotas */}
        {flotas.length === 0 ? (
          <p style={{ color: 'var(--t-text-3)', fontSize: 13, padding: '28px 0', textAlign: 'center', margin: 0 }}>
            Sin flotas vinculadas. Usa &quot;Vincular existentes&quot; para asociar carpetas.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thF}>Flota</th>
                <th style={{ ...thF, textAlign: 'right' }}>Veh.</th>
                <th style={thF}>Estado</th>
                <th style={{ ...thF, textAlign: 'right', width: 32 }}></th>
                <th style={{ ...thF, textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {flotas.map(f => {
                const numVeh = ((f.trabajo?.length > 0 ? f.trabajo : f.original)?.filter(r => r['matricula']?.trim()).length ?? 0);
                const isConfirming = confirmDesvincular === f.id;
                return (
                  <tr key={f.id}
                    onMouseEnter={e => { if (!isConfirming) e.currentTarget.style.background = 'var(--t-line-soft)'; }}
                    onMouseLeave={e => { if (!isConfirming) e.currentTarget.style.background = ''; }}
                  >
                    <td style={{ ...tdF, color: 'var(--t-text)', fontWeight: 600 }}>
                      {f.nombre || '(sin nombre)'}
                    </td>
                    <td style={{ ...tdF, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{numVeh}</td>
                    <td style={{ ...tdF }}>
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
                        color: estadoColor(f.estado ?? 'EN ESTUDIO'),
                        border: '1px solid var(--t-line)',
                      }}>{f.estado ?? 'EN ESTUDIO'}</span>
                    </td>
                    <td style={{ ...tdF, textAlign: 'right', color: 'var(--t-blue)', fontSize: 16, cursor: 'pointer' }}
                      onClick={() => { /* navegación se puede añadir si se expone un handler */ }}>
                      →
                    </td>
                    <td style={{ ...tdF, textAlign: 'right' }}>
                      {!isConfirming ? (
                        <button onClick={() => setConfirmDesvincular(f.id)} style={{
                          background: 'none', border: '1px solid var(--t-line)',
                          borderRadius: 5, padding: '3px 9px', color: 'var(--t-text-3)', fontSize: 11,
                          cursor: 'pointer',
                        }}>Desvincular</button>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end' }}>
                          <span style={{ fontSize: 11, color: 'var(--t-text-3)' }}>¿Seguro?</span>
                          <button onClick={() => { onDesvincularFlota(f.id); setConfirmDesvincular(null); }} style={{
                            background: 'var(--t-amber)', border: 'none', borderRadius: 5,
                            padding: '3px 9px', color: '#000', fontSize: 11, cursor: 'pointer', fontWeight: 700,
                          }}>Sí</button>
                          <button onClick={() => setConfirmDesvincular(null)} style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--t-text-3)', fontSize: 11,
                          }}>No</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Tabla de corredores ─────────────────────────────────────────────────────

function CorredoresTable({
  corredores, flotasCountMap, sortCol, sortDir, onSort, onVer,
}: {
  corredores: Corredor[];
  flotasCountMap: Record<string, number>;
  sortCol: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (col: SortKey) => void;
  onVer: (c: Corredor) => void;
}) {
  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    color: 'var(--t-text-3)',
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.06em',
    padding: '0 8px 12px',
    borderBottom: '1px solid var(--t-line-soft)',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
  };

  const tdStyle: React.CSSProperties = {
    height: 52,
    padding: '0 8px',
    borderBottom: '1px solid var(--t-line-soft)',
    fontSize: 14,
    verticalAlign: 'middle',
    color: 'var(--t-text-2)',
  };

  const badgeStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    height: 22,
    padding: '0 8px',
    borderRadius: 5,
    border: '1px solid var(--t-line)',
    background: 'var(--t-line-soft)',
    color: 'var(--t-text-2)',
    fontSize: 11,
    letterSpacing: '0.04em',
    fontWeight: 600,
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
        <thead>
          <tr>
            <SortTh col="nombre" sortCol={sortCol} sortDir={sortDir} onSort={onSort} style={thStyle}>Nombre</SortTh>
            <SortTh col="sucursal" sortCol={sortCol} sortDir={sortDir} onSort={onSort} style={thStyle}>Sucursal</SortTh>
            <SortTh col="comercial" sortCol={sortCol} sortDir={sortDir} onSort={onSort} style={thStyle}>Comercial</SortTh>
            <SortTh col="cif" sortCol={sortCol} sortDir={sortDir} onSort={onSort} style={thStyle}>CIF</SortTh>
            <SortTh col="porcentajeComision" sortCol={sortCol} sortDir={sortDir} onSort={onSort} style={thStyle}>Comisión %</SortTh>
            <SortTh col="periodicidad" sortCol={sortCol} sortDir={sortDir} onSort={onSort} style={thStyle}>Periodicidad</SortTh>
            <SortTh col="flotas" sortCol={sortCol} sortDir={sortDir} onSort={onSort} style={thStyle}>Flotas</SortTh>
            <th style={{ ...thStyle, textAlign: 'right' }}>Ver</th>
          </tr>
        </thead>
        <tbody>
          {corredores.map(c => {
            const nFlotas = flotasCountMap[c.id] ?? 0;
            const comPos = (c.porcentajeComision ?? 0) > 0;
            return (
              <tr
                key={c.id}
                onClick={() => onVer(c)}
                style={{ cursor: 'pointer', transition: 'background 120ms' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--t-line-soft)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
              >
                <td style={{ ...tdStyle, color: 'var(--t-text)', fontWeight: 650 }}>
                  {c.nombre}
                </td>
                <td style={tdStyle}>
                  {c.sucursal
                    ? <span style={badgeStyle}>{c.sucursal}</span>
                    : <span style={{ color: 'var(--t-text-3)' }}>—</span>}
                </td>
                <td style={tdStyle}>
                  {c.comercial || <span style={{ color: 'var(--t-text-3)' }}>—</span>}
                </td>
                <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 13 }}>
                  {c.cif || <span style={{ color: 'var(--t-text-3)' }}>—</span>}
                </td>
                <td style={{ ...tdStyle, color: comPos ? 'var(--t-green)' : 'var(--t-text-3)', fontWeight: comPos ? 650 : 400 }}>
                  {(c.porcentajeComision ?? 0).toLocaleString('es-ES', { minimumFractionDigits: 1 })}%
                </td>
                <td style={{ ...tdStyle, textTransform: 'capitalize' }}>
                  {c.periodicidad}
                </td>
                <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--t-text)' }}>
                  {nFlotas}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--t-blue)', fontSize: 18 }}>
                  →
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Pagina principal ───────────────────────────────────────────────────────

export default function CorredoresPage() {
  const router = useRouter();
  const { role } = useAuth();
  const [corredores, setCorredores] = useState<Corredor[]>([]);
  const [carpetas, setCarpetas] = useState<FlotaCarpeta[]>([]);
  const [vista, setVista] = useState<Vista>('lista');
  const [search, setSearch] = useState('');
  const [filterSucursal, setFilterSucursal] = useState<Sucursal | ''>('');
  const [filterComercial, setFilterComercial] = useState('');
  const [corredorDetalle, setCorredorDetalle] = useState<Corredor | null>(null);
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [corredorEditar, setCorredorEditar] = useState<Corredor | null>(null);
  const [confirmBorrarTodo, setConfirmBorrarTodo] = useState(false);
  const [sortCol, setSortCol] = useState<SortKey>('nombre');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleBorrarTodo = useCallback(() => {
    borrarTodosLosCorredores();
    borrarTodasLasCarpetas();
    setCorredores([]);
    setCarpetas([]);
    setVista('lista');
    setCorredorDetalle(null);
    setConfirmBorrarTodo(false);
  }, []);

  const cargar = useCallback(() => {
    setCorredores(listarCorredores());
    setCarpetas(listarCarpetas());
  }, []);

  useEffect(() => {
    cargar();
    Promise.all([
      cargarCorredoresDelServidor(),
      cargarCarpetasDelServidor(),
    ]).then(([corredoresData, carpetasData]) => {
      setCorredores([...corredoresData].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setCarpetas(carpetasData);
    }).catch(() => {});
  }, [cargar]);

  const flotasDe = useCallback((id: string) => carpetas.filter(c => c.corredor_id === id), [carpetas]);

  const flotasCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of carpetas) {
      if (c.corredor_id) map[c.corredor_id] = (map[c.corredor_id] ?? 0) + 1;
    }
    return map;
  }, [carpetas]);

  const totalFlotas = useMemo(() =>
    corredores.reduce((sum, c) => sum + (flotasCountMap[c.id] ?? 0), 0),
  [corredores, flotasCountMap]);

  const comisionMedia = useMemo(() => {
    const con = corredores.filter(c => (c.porcentajeComision ?? 0) > 0);
    if (con.length === 0) return 0;
    return con.reduce((s, c) => s + c.porcentajeComision, 0) / con.length;
  }, [corredores]);

  const countTitan = useMemo(() => corredores.filter(c => c.sucursal === 'TITAN').length, [corredores]);
  const countMediacion = useMemo(() => corredores.filter(c => c.sucursal === 'MEDIACION').length, [corredores]);
  const countConComision = useMemo(() => corredores.filter(c => (c.porcentajeComision ?? 0) > 0).length, [corredores]);

  const comercialesUnicos = useMemo(() => {
    const set = new Set(corredores.map(c => c.comercial).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [corredores]);

  function abrirPanel(corredor: Corredor | null) { setCorredorEditar(corredor); setPanelAbierto(true); }
  function cerrarPanel() { setPanelAbierto(false); setCorredorEditar(null); }
  function handleSave(c: Corredor) {
    cerrarPanel();
    if (corredorDetalle?.id === c.id) setCorredorDetalle(c);
    cargar();
  }
  function handleVerDetalle(c: Corredor) { setCorredorDetalle(c); setVista('detalle'); }
  function handleEliminar(mode: 'desvincular' | 'borrar_flotas') {
    if (!corredorDetalle) return;
    const flotasDelCorredor = carpetas.filter(c => c.corredor_id === corredorDetalle.id);
    if (mode === 'borrar_flotas') flotasDelCorredor.forEach(f => eliminarCarpeta(f.id));
    else flotasDelCorredor.forEach(f => guardarCarpeta({ ...f, corredor_id: undefined }));
    eliminarCorredor(corredorDetalle.id);
    setVista('lista'); setCorredorDetalle(null); cargar();
  }
  function handleDesvincularFlota(flotaId: string) {
    const flota = carpetas.find(c => c.id === flotaId);
    if (!flota) return;
    guardarCarpeta({ ...flota, corredor_id: undefined });
    cargar();
    if (corredorDetalle) setCorredorDetalle({ ...corredorDetalle });
  }
  function handleVincularExistente(flotaId: string) {
    const flota = carpetas.find(c => c.id === flotaId);
    if (!flota || !corredorDetalle) return;
    guardarCarpeta({ ...flota, corredor_id: corredorDetalle.id });
    cargar();
  }
  function handleNuevaFlota() {
    if (!corredorDetalle) return;
    crearCarpeta('', corredorDetalle.id);
    router.push('/flotas');
  }

  const filteredCorredores = useMemo(() => {
    return corredores.filter(c => {
      const q = search.toLowerCase();
      const matchSearch = !search.trim() ||
        c.nombre.toLowerCase().includes(q) ||
        c.cif.toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.contacto || '').toLowerCase().includes(q) ||
        (c.comercial || '').toLowerCase().includes(q);
      const matchSucursal = !filterSucursal || c.sucursal === filterSucursal;
      const matchComercial = !filterComercial || (c.comercial || '').toLowerCase().includes(filterComercial.toLowerCase());
      return matchSearch && matchSucursal && matchComercial;
    });
  }, [corredores, search, filterSucursal, filterComercial]);

  const sortedCorredores = useMemo(() => {
    return [...filteredCorredores].sort((a, b) => {
      let cmp = 0;
      switch (sortCol) {
        case 'nombre':            cmp = a.nombre.localeCompare(b.nombre, 'es'); break;
        case 'sucursal':          cmp = (a.sucursal ?? '').localeCompare(b.sucursal ?? '', 'es'); break;
        case 'comercial':         cmp = (a.comercial ?? '').localeCompare(b.comercial ?? '', 'es'); break;
        case 'cif':               cmp = a.cif.localeCompare(b.cif, 'es'); break;
        case 'porcentajeComision':cmp = (a.porcentajeComision ?? 0) - (b.porcentajeComision ?? 0); break;
        case 'periodicidad':      cmp = a.periodicidad.localeCompare(b.periodicidad, 'es'); break;
        case 'flotas':            cmp = (flotasCountMap[a.id] ?? 0) - (flotasCountMap[b.id] ?? 0); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filteredCorredores, sortCol, sortDir, flotasCountMap]);

  const handleSort = useCallback((col: SortKey) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }, [sortCol]);

  // ── Estilos compartidos controles ──────────────────────────────────────────

  const btnStyle: React.CSSProperties = {
    height: 36, padding: '0 14px', borderRadius: 8,
    border: '1px solid var(--t-line)', background: 'transparent',
    color: 'var(--t-text)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
  };

  const filterInputStyle: React.CSSProperties = {
    height: 40, border: '1px solid var(--t-line)', borderRadius: 8,
    background: 'var(--t-surface)', color: 'var(--t-text)', fontSize: 13,
    fontFamily: 'inherit', outline: 'none',
  };

  return (
    <div className="animate-in fade-in duration-500">
      {vista === 'lista' ? (
        <>
          {/* ── page-head ──────────────────────────────────────────────── */}
          <div style={{ marginTop: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 32, fontWeight: 650, letterSpacing: '-0.03em', color: 'var(--t-text)' }}>
                Corredores
              </h1>
              <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--t-text-2)' }}>
                {corredores.length} corredor{corredores.length !== 1 ? 'es' : ''} · {totalFlotas} flotas asociadas
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {role === 'admin' && (confirmBorrarTodo ? (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  border: '1px solid var(--t-line)', borderRadius: 8, padding: '6px 14px', fontSize: 12,
                }}>
                  <span style={{ color: 'var(--t-red)', fontWeight: 600 }}>¿Borrar TODO? Elimina corredores y flotas.</span>
                  <button onClick={handleBorrarTodo} style={{
                    background: 'var(--t-red)', border: 'none', borderRadius: 6,
                    padding: '4px 12px', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  }}>Sí, borrar todo</button>
                  <button onClick={() => setConfirmBorrarTodo(false)} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--t-text-3)', fontSize: 12, padding: '4px 6px',
                  }}>Cancelar</button>
                </div>
              ) : (
                <button onClick={() => setConfirmBorrarTodo(true)}
                  style={{ ...btnStyle, color: 'var(--t-text-3)', border: 'none' }}>
                  ··· Borrar todo
                </button>
              ))}
              <button onClick={() => abrirPanel(null)} style={{
                ...btnStyle,
                background: 'var(--t-blue)', border: 'none', color: '#fff', fontWeight: 600,
              }}>
                + Nuevo corredor
              </button>
            </div>
          </div>

          {/* ── metrics ────────────────────────────────────────────────── */}
          {corredores.length > 0 && (
            <>
              <div style={{
                marginTop: 28,
                display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr',
                alignItems: 'end',
                paddingBottom: 28,
                borderBottom: '1px solid var(--t-line)',
              }}>
                <div>
                  <b style={{ fontSize: 52, fontWeight: 600, letterSpacing: '-0.04em', lineHeight: 1, color: 'var(--t-text)' }}>
                    {corredores.length}
                  </b>
                  <span style={{ marginLeft: 8, color: 'var(--t-text-2)', fontSize: 14, letterSpacing: '0.06em' }}>
                    CORREDORES
                  </span>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <b style={{ fontSize: 52, fontWeight: 600, letterSpacing: '-0.04em', lineHeight: 1, color: 'var(--t-text)' }}>
                    {totalFlotas}
                  </b>
                  <span style={{ marginLeft: 8, color: 'var(--t-text-2)', fontSize: 14, letterSpacing: '0.06em' }}>
                    FLOTAS ASOCIADAS
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <b style={{ fontSize: 52, fontWeight: 600, letterSpacing: '-0.04em', lineHeight: 1, color: 'var(--t-green)' }}>
                    {comisionMedia.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                  </b>
                  <span style={{ marginLeft: 8, color: 'var(--t-green)', fontSize: 14, letterSpacing: '0.06em' }}>
                    COMISIÓN MEDIA
                  </span>
                </div>
              </div>
              <p style={{ marginTop: 14, color: 'var(--t-text-2)', fontSize: 14 }}>
                {countTitan > 0 && `${countTitan} Titan`}
                {countTitan > 0 && countMediacion > 0 && ' · '}
                {countMediacion > 0 && `${countMediacion} Mediación`}
                {(countTitan > 0 || countMediacion > 0) && countConComision > 0 && ' · '}
                {countConComision > 0 && `${countConComision} con comisión`}
              </p>
            </>
          )}

          {/* ── filters ────────────────────────────────────────────────── */}
          <div style={{ marginTop: 22, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{
              ...filterInputStyle,
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '0 14px', width: 280,
            }}>
              <span style={{ color: 'var(--t-text-3)', flexShrink: 0 }}><SearchIcon /></span>
              <input
                placeholder="Buscar corredor, CIF o comercial…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  background: 'none', border: 'none', outline: 'none',
                  color: 'var(--t-text)', fontSize: 13, padding: 0, width: '100%',
                  fontFamily: 'inherit',
                }}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  aria-label="Limpiar búsqueda"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--t-text-3)', padding: 0, fontSize: 18,
                    lineHeight: 1, flexShrink: 0, display: 'flex', alignItems: 'center',
                  }}
                >×</button>
              )}
            </div>
            <select
              value={filterSucursal}
              onChange={e => setFilterSucursal(e.target.value as Sucursal | '')}
              className="t-select"
              style={{ height: 40, minWidth: 190, padding: '0 12px', borderRadius: 8 }}
            >
              <option value="">Todas las sucursales</option>
              {SUCURSALES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              value={filterComercial}
              onChange={e => setFilterComercial(e.target.value)}
              className="t-select"
              style={{ height: 40, minWidth: 190, padding: '0 12px', borderRadius: 8 }}
            >
              <option value="">Todos los comerciales</option>
              {comercialesUnicos.map(com => <option key={com} value={com}>{com}</option>)}
            </select>
            <span style={{ flex: 1 }} />
            {(search || filterSucursal || filterComercial) && (
              <span style={{ fontSize: 12, color: 'var(--t-text-3)', alignSelf: 'center' }}>
                {filteredCorredores.length} de {corredores.length} corredores
              </span>
            )}
          </div>

          {/* ── table ──────────────────────────────────────────────────── */}
          {corredores.length === 0 ? (
            <div style={{ marginTop: 28, textAlign: 'center', padding: '60px 0' }}>
              <p style={{ margin: 0, color: 'var(--t-text-3)', fontSize: 13 }}>
                Sin corredores. Crea el primero con el botón superior.
              </p>
            </div>
          ) : filteredCorredores.length === 0 ? (
            <div style={{ marginTop: 28, textAlign: 'center', padding: '60px 0' }}>
              <p style={{ margin: 0, color: 'var(--t-text-3)', fontSize: 13 }}>
                Sin resultados para la búsqueda actual.
              </p>
            </div>
          ) : (
            <div style={{ marginTop: 24 }}>
              <CorredoresTable
                corredores={sortedCorredores}
                flotasCountMap={flotasCountMap}
                sortCol={sortCol}
                sortDir={sortDir}
                onSort={handleSort}
                onVer={handleVerDetalle}
              />
            </div>
          )}
        </>
      ) : (
        corredorDetalle && (
          <DetalleView
            corredor={corredorDetalle}
            flotas={flotasDe(corredorDetalle.id)}
            todasLasCarpetas={carpetas}
            onVolver={() => setVista('lista')}
            onEditar={() => abrirPanel(corredorDetalle)}
            onEliminar={handleEliminar}
            onNuevaFlota={handleNuevaFlota}
            onDesvincularFlota={handleDesvincularFlota}
            onVincularExistente={handleVincularExistente}
          />
        )
      )}

      {panelAbierto && (
        <PanelCorredor
          corredor={corredorEditar}
          onClose={cerrarPanel}
          onSave={handleSave}
          comercialesUnicos={comercialesUnicos}
        />
      )}

    </div>
  );
}
