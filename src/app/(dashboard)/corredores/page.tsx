'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  listarCorredores, crearCorredor, guardarCorredor, eliminarCorredor,
  cargarCorredoresDelServidor, borrarTodosLosCorredores,
  type Corredor, type Periodicidad, type Sucursal,
} from '@/core/flotas';
import {
  listarCarpetas, crearCarpeta, guardarCarpeta, eliminarCarpeta,
  borrarTodasLasCarpetas, cargarCarpetasDelServidor, type FlotaCarpeta,
} from '@/core/flotas';

// ─── Constantes ──────────────────────────────────────────────────────────────

const SUCURSALES: Sucursal[] = ['TITAN', 'MEDIACION'];

type Vista    = 'lista' | 'detalle';
type FormData = Omit<Corredor, 'id' | 'creadoEn' | 'actualizadoEn'>;

const FORM_VACIO: FormData = {
  codigo: '', nombre: '', cif: '', domicilio: '', porcentajeComision: 0,
  periodicidad: 'mensual', formaPago: '', contacto: '',
  email: '', telefono: '', observaciones: '',
  sucursal: undefined, comercial: '',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function estadoColor(estado: string) {
  if (estado === 'OFERTADA')   return '#7C5CFC';
  if (estado === 'CONTRATADA') return '#20C982';
  if (estado === 'RECHAZADA')  return '#EF4D5A';
  return '#4387FF';
}

function MailIcon()  { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>; }
function PhoneIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.3 1.8.6 2.6a2 2 0 01-.5 2.1L8 9.6a16 16 0 006 6l1.2-1.2a2 2 0 012-.5c.9.3 1.7.5 2.6.6a2 2 0 011.7 2z"/></svg>; }
function UserIcon()  { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/></svg>; }
function CashIcon()  { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/></svg>; }

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{
        display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: '#70747B', marginBottom: 6,
      }}>{label}</span>
      {children}
    </label>
  );
}

// ─── Panel lateral (crear / editar) ──────────────────────────────────────────

function PanelCorredor({
  corredor, onClose, onSave,
}: {
  corredor: Corredor | null;
  onClose: () => void;
  onSave: (c: Corredor) => void;
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
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40 }} />
      <aside style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 440, zIndex: 50,
        background: '#0D0F12', borderLeft: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', flexDirection: 'column',
      }}>
        <header style={{
          padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
          <h2 style={{ margin: 0, fontSize: 16, color: '#F4F4F5', fontWeight: 600 }}>
            {corredor ? 'Editar corredor' : 'Nuevo corredor'}
          </h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#70747B', fontSize: 20, lineHeight: 1, padding: 4,
          }}>×</button>
        </header>

        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label="Nombre *">
                <input className="orion-input" value={form.nombre} onChange={e => set('nombre', e.target.value)} required />
              </FormField>
              <FormField label="Código corredor">
                <input className="orion-input" value={form.codigo} onChange={e => set('codigo', e.target.value)} placeholder="COR-001" />
              </FormField>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label="Sucursal">
                <select className="orion-input" value={form.sucursal ?? ''}
                  onChange={e => set('sucursal', e.target.value as Sucursal || undefined)}>
                  <option value="">— Sin asignar —</option>
                  {SUCURSALES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </FormField>
              <FormField label="Comercial">
                <input className="orion-input" value={form.comercial ?? ''} placeholder="Ej: Roberto, Miguel..."
                  onChange={e => set('comercial', e.target.value)} />
              </FormField>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label="CIF">
                <input className="orion-input" value={form.cif} onChange={e => set('cif', e.target.value)} />
              </FormField>
              <FormField label="% Comisión">
                <input className="orion-input" inputMode="decimal"
                  value={form.porcentajeComision}
                  onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d*$/.test(v)) set('porcentajeComision', v === '' ? 0 : parseFloat(v) || 0); }} />
              </FormField>
            </div>

            <FormField label="Domicilio fiscal">
              <textarea className="orion-input" style={{ minHeight: 60, resize: 'vertical' }}
                value={form.domicilio ?? ''} onChange={e => set('domicilio', e.target.value)} />
            </FormField>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label="Periodicidad">
                <select className="orion-input" value={form.periodicidad}
                  onChange={e => set('periodicidad', e.target.value as Periodicidad)}>
                  <option value="mensual">Mensual</option>
                  <option value="trimestral">Trimestral</option>
                  <option value="semestral">Semestral</option>
                  <option value="anual">Anual</option>
                </select>
              </FormField>
              <FormField label="Forma de pago">
                <select className="orion-input" value={form.formaPago}
                  onChange={e => set('formaPago', e.target.value)}>
                  <option value="">—</option>
                  <option value="Transferencia">Transferencia</option>
                  <option value="Domiciliacion">Domiciliacion</option>
                  <option value="Cheque">Cheque</option>
                </select>
              </FormField>
            </div>

            <FormField label="Persona de contacto">
              <input className="orion-input" value={form.contacto} onChange={e => set('contacto', e.target.value)} />
            </FormField>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label="Email">
                <input className="orion-input" type="email" value={form.email} onChange={e => set('email', e.target.value)} />
              </FormField>
              <FormField label="Teléfono">
                <input className="orion-input" value={form.telefono} onChange={e => set('telefono', e.target.value)} />
              </FormField>
            </div>

            <FormField label="Observaciones">
              <textarea className="orion-input" rows={4} value={form.observaciones}
                onChange={e => set('observaciones', e.target.value)} />
            </FormField>
          </div>

          <footer style={{ marginTop: 24, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} className="btn-ghost" style={{ height: 36, padding: '0 16px' }}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" style={{ height: 36, padding: '0 20px' }}>
              {corredor ? 'Guardar' : 'Crear corredor'}
            </button>
          </footer>
        </form>
      </aside>
    </>
  );
}

// ─── Vista detalle ────────────────────────────────────────────────────────────

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

  const SURFACE: React.CSSProperties = {
    background: '#090A0C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14,
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <button onClick={onVolver} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: '#4387FF', fontSize: 13, padding: 0, marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500,
      }}>
        ← Volver a corredores
      </button>

      {/* Tarjeta datos corredor */}
      <div style={{ ...SURFACE, padding: '28px 32px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, color: '#F4F4F5', fontWeight: 700 }}>
              {corredor.nombre}
            </h1>
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {corredor.cif && (
                <span style={{ fontSize: 12, color: '#A1A1A6', fontFamily: 'monospace' }}>{corredor.cif}</span>
              )}
              {corredor.sucursal && (
                <span style={{
                  fontSize: 11, fontWeight: 600,
                  color: corredor.sucursal === 'TITAN' ? '#4387FF' : '#A1A1A6',
                  background: corredor.sucursal === 'TITAN' ? 'rgba(67,135,255,0.08)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${corredor.sucursal === 'TITAN' ? 'rgba(67,135,255,0.2)' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: 999, padding: '3px 10px',
                }}>{corredor.sucursal}</span>
              )}
              {corredor.comercial && (
                <span style={{
                  fontSize: 11, color: '#A1A1A6',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 999, padding: '3px 10px',
                }}>{corredor.comercial}</span>
              )}
              <span style={{
                fontSize: 11, fontWeight: 600, color: '#20C982',
                background: 'rgba(32,201,130,0.08)', border: '1px solid rgba(32,201,130,0.2)',
                borderRadius: 999, padding: '3px 10px',
              }}>{corredor.porcentajeComision}% comisión</span>
              <span style={{
                fontSize: 11, color: '#A1A1A6',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 999, padding: '3px 10px', textTransform: 'capitalize',
              }}>{corredor.periodicidad}</span>
            </div>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {corredor.email && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#A1A1A6' }}>
                  <MailIcon /> {corredor.email}
                </span>
              )}
              {corredor.telefono && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#A1A1A6' }}>
                  <PhoneIcon /> {corredor.telefono}
                </span>
              )}
              {corredor.contacto && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#A1A1A6' }}>
                  <UserIcon /> {corredor.contacto}
                </span>
              )}
              {corredor.formaPago && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#A1A1A6' }}>
                  <CashIcon /> {corredor.formaPago}
                </span>
              )}
            </div>
          </div>

          {/* Acciones */}
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {!confirmEdit ? (
              <button onClick={() => setConfirmEdit(true)} className="btn-ghost" style={{ height: 34, padding: '0 14px', fontSize: 13 }}>
                Editar
              </button>
            ) : (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'rgba(67,135,255,0.06)', border: '1px solid rgba(67,135,255,0.2)',
                borderRadius: 10, padding: '4px 12px',
              }}>
                <span style={{ color: '#A1A1A6', fontSize: 12 }}>¿Editar datos?</span>
                <button onClick={() => { setConfirmEdit(false); onEditar(); }} style={{
                  background: '#4387FF', border: 'none', borderRadius: 6,
                  padding: '3px 10px', color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 600,
                }}>Sí</button>
                <button onClick={() => setConfirmEdit(false)} style={{
                  background: 'none', border: 'none', cursor: 'pointer', color: '#70747B', fontSize: 11,
                }}>No</button>
              </div>
            )}

            {!confirmElim ? (
              <button onClick={() => setConfirmElim(true)} className="btn-danger" style={{ height: 34, padding: '0 14px', fontSize: 13 }}>
                Eliminar
              </button>
            ) : flotas.length > 0 ? (
              <div style={{
                display: 'flex', flexDirection: 'column', gap: 8,
                background: 'rgba(239,77,90,0.06)', border: '1px solid rgba(239,77,90,0.2)',
                borderRadius: 10, padding: '10px 14px',
              }}>
                <span style={{ color: '#EF4D5A', fontWeight: 600, fontSize: 12 }}>
                  Tiene {flotas.length} flota{flotas.length > 1 ? 's' : ''}:
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => onEliminar('desvincular')} style={{
                    background: 'rgba(240,185,77,0.08)', border: '1px solid rgba(240,185,77,0.25)',
                    borderRadius: 6, padding: '4px 10px', color: '#F0B94D', fontSize: 11, cursor: 'pointer', fontWeight: 600,
                  }}>Desvincular todas</button>
                  <button onClick={() => onEliminar('borrar_flotas')} style={{
                    background: '#EF4D5A', border: 'none', borderRadius: 6,
                    padding: '4px 10px', color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 600,
                  }}>Borrar todo</button>
                  <button onClick={() => setConfirmElim(false)} style={{
                    background: 'none', border: 'none', cursor: 'pointer', color: '#70747B', fontSize: 11,
                  }}>Cancelar</button>
                </div>
              </div>
            ) : (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'rgba(239,77,90,0.06)', border: '1px solid rgba(239,77,90,0.2)',
                borderRadius: 10, padding: '4px 12px',
              }}>
                <span style={{ color: '#A1A1A6', fontSize: 12 }}>¿Eliminar?</span>
                <button onClick={() => onEliminar('desvincular')} style={{
                  background: '#EF4D5A', border: 'none', borderRadius: 6,
                  padding: '3px 10px', color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 600,
                }}>Sí</button>
                <button onClick={() => setConfirmElim(false)} style={{
                  background: 'none', border: 'none', cursor: 'pointer', color: '#70747B', fontSize: 11,
                }}>No</button>
              </div>
            )}
          </div>
        </div>

        {corredor.observaciones && (
          <div style={{
            marginTop: 18, padding: '12px 16px',
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10, fontSize: 12, color: '#A1A1A6',
          }}>
            <b style={{ color: '#70747B', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Observaciones</b>
            {corredor.observaciones}
          </div>
        )}
      </div>

      {/* Tarjeta flotas */}
      <div style={{ ...SURFACE, padding: '22px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 14, color: '#F4F4F5', fontWeight: 600 }}>
            Flotas asociadas · {flotas.length}
          </h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setShowVincular(v => !v); setVincularSearch(''); }} style={{
              background: showVincular ? 'rgba(67,135,255,0.08)' : 'none',
              border: '1px solid rgba(67,135,255,0.2)', borderRadius: 8,
              cursor: 'pointer', color: '#4387FF', fontSize: 12, fontWeight: 600,
              padding: '4px 12px',
            }}>Vincular existentes</button>
            <button onClick={onNuevaFlota} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#4387FF', fontSize: 12, fontWeight: 600,
            }}>+ Nueva flota</button>
          </div>
        </div>

        {showVincular && (
          <div style={{
            marginBottom: 16, padding: '14px 16px',
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10,
          }}>
            <p style={{ margin: '0 0 10px', fontSize: 11, color: '#70747B', fontWeight: 600 }}>
              Selecciona carpetas para vincular a {corredor.nombre}:
            </p>
            <input
              placeholder="Buscar por nombre, tomador, CIF..."
              value={vincularSearch}
              onChange={e => setVincularSearch(e.target.value)}
              className="orion-input"
              style={{ marginBottom: 10, fontSize: 12 }}
            />
            {disponibles.length === 0 ? (
              <p style={{ color: '#70747B', fontSize: 12, textAlign: 'center', padding: '10px 0', margin: 0 }}>
                {vincularSearch ? 'Sin resultados.' : 'Todas las carpetas ya están vinculadas a este corredor.'}
              </p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 240, overflowY: 'auto' }}>
                {disponibles.map(c => (
                  <li key={c.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '9px 12px', borderRadius: 8, cursor: 'pointer',
                    transition: 'background 150ms',
                  }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    <span style={{ fontSize: 13, color: '#F4F4F5', fontWeight: 500 }}>
                      {c.nombre || '(sin nombre)'}
                      {c.header?.tomador && (
                        <span style={{ color: '#70747B', fontSize: 11, fontWeight: 400, marginLeft: 8 }}>
                          {c.header.tomador}
                        </span>
                      )}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontSize: 10, padding: '2px 8px', borderRadius: 999, fontWeight: 600,
                        color: estadoColor(c.estado ?? 'EN ESTUDIO'),
                        background: `${estadoColor(c.estado ?? 'EN ESTUDIO')}14`,
                        border: `1px solid ${estadoColor(c.estado ?? 'EN ESTUDIO')}38`,
                      }}>{c.estado ?? 'EN ESTUDIO'}</span>
                      <button onClick={() => onVincularExistente(c.id)} style={{
                        background: '#4387FF', border: 'none', borderRadius: 6,
                        padding: '4px 12px', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      }}>Vincular</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {flotas.length === 0 && !showVincular ? (
          <p style={{ color: '#70747B', fontSize: 12, textAlign: 'center', padding: '30px 0', margin: 0 }}>
            Sin flotas vinculadas. Usa &ldquo;Vincular existentes&rdquo; para asociar carpetas.
          </p>
        ) : flotas.length > 0 ? (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {flotas.map(f => {
              const rows = f.trabajo?.length > 0 ? f.trabajo : f.original;
              const numVeh = rows?.length ?? 0;
              const isConfirming = confirmDesvincular === f.id;
              return (
                <li key={f.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 16px', borderRadius: 10, transition: 'background 150ms',
                  background: isConfirming ? 'rgba(240,185,77,0.04)' : undefined,
                }}
                  onMouseEnter={e => { if (!isConfirming) e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; }}
                  onMouseLeave={e => { if (!isConfirming) e.currentTarget.style.background = ''; }}
                >
                  <span style={{ color: '#F4F4F5', fontSize: 13, fontWeight: 500 }}>
                    {f.nombre || '(sin nombre)'}
                    <span style={{ color: '#70747B', fontWeight: 400, fontSize: 11, marginLeft: 8 }}>· {numVeh} veh.</span>
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      fontSize: 11, padding: '3px 10px', borderRadius: 999, fontWeight: 500,
                      color: estadoColor(f.estado ?? 'EN ESTUDIO'),
                      background: `${estadoColor(f.estado ?? 'EN ESTUDIO')}14`,
                      border: `1px solid ${estadoColor(f.estado ?? 'EN ESTUDIO')}38`,
                    }}>{f.estado ?? 'EN ESTUDIO'}</span>
                    {!isConfirming ? (
                      <button onClick={() => setConfirmDesvincular(f.id)} style={{
                        background: 'rgba(240,185,77,0.08)', border: '1px solid rgba(240,185,77,0.2)',
                        borderRadius: 6, padding: '3px 10px', color: '#F0B94D', fontSize: 11,
                        cursor: 'pointer', fontWeight: 500,
                      }}>Desvincular</button>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 11, color: '#A1A1A6' }}>¿Seguro?</span>
                        <button onClick={() => { onDesvincularFlota(f.id); setConfirmDesvincular(null); }} style={{
                          background: '#F0B94D', border: 'none', borderRadius: 6,
                          padding: '3px 10px', color: '#000', fontSize: 11, cursor: 'pointer', fontWeight: 700,
                        }}>Sí</button>
                        <button onClick={() => setConfirmDesvincular(null)} style={{
                          background: 'none', border: 'none', cursor: 'pointer', color: '#70747B', fontSize: 11,
                        }}>No</button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

// ─── Tabla de corredores ──────────────────────────────────────────────────────

type SortColCorredor = 'nombre' | 'sucursal' | 'comercial' | 'comision' | 'periodicidad' | 'flotas';

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  return (
    <span style={{ marginLeft: 4, color: active ? '#A1A1A6' : 'rgba(161,161,166,0.35)', fontSize: 9, lineHeight: 1 }}>
      {active ? (dir === 'asc' ? '↑' : '↓') : '⇅'}
    </span>
  );
}

const TH: React.CSSProperties = {
  textAlign: 'left', color: '#70747B', fontSize: 12, fontWeight: 600,
  letterSpacing: '0.06em', padding: '0 8px 12px',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  whiteSpace: 'nowrap', userSelect: 'none',
};
const TD: React.CSSProperties = {
  height: 52, padding: '0 8px',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  fontSize: 15, verticalAlign: 'middle',
};

function CorredoresTable({
  corredores, carpetas, onVer,
}: {
  corredores: Corredor[];
  carpetas: FlotaCarpeta[];
  onVer: (c: Corredor) => void;
}) {
  const [sortCol, setSortCol] = useState<SortColCorredor | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  function toggleSort(col: SortColCorredor) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  const numFlotasDe = useCallback((id: string) => carpetas.filter(c => c.corredor_id === id).length, [carpetas]);

  const sorted = useMemo(() => {
    if (!sortCol) return corredores;
    return [...corredores].sort((a, b) => {
      let cmp = 0;
      if (sortCol === 'nombre')        cmp = a.nombre.localeCompare(b.nombre);
      else if (sortCol === 'sucursal')  cmp = (a.sucursal ?? '').localeCompare(b.sucursal ?? '');
      else if (sortCol === 'comercial') cmp = (a.comercial ?? '').localeCompare(b.comercial ?? '');
      else if (sortCol === 'comision')  cmp = (a.porcentajeComision ?? 0) - (b.porcentajeComision ?? 0);
      else if (sortCol === 'periodicidad') cmp = a.periodicidad.localeCompare(b.periodicidad);
      else if (sortCol === 'flotas')    cmp = numFlotasDe(a.id) - numFlotasDe(b.id);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [corredores, sortCol, sortDir, numFlotasDe]);

  const HEADERS: { key: SortColCorredor | null; label: string }[] = [
    { key: 'nombre',       label: 'NOMBRE' },
    { key: 'sucursal',     label: 'SUCURSAL' },
    { key: 'comercial',    label: 'COMERCIAL' },
    { key: null,           label: 'CIF' },
    { key: 'comision',     label: 'COMISIÓN %' },
    { key: 'periodicidad', label: 'PERIODICIDAD' },
    { key: 'flotas',       label: 'FLOTAS' },
    { key: null,           label: '' },
  ];

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 28 }}>
      <thead>
        <tr>
          {HEADERS.map(({ key, label }) => (
            <th key={label} onClick={key ? () => toggleSort(key) : undefined}
              style={{ ...TH, cursor: key ? 'pointer' : 'default' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                {label}
                {key && <SortIcon active={sortCol === key} dir={sortDir} />}
              </span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map(c => (
          <tr key={c.id} style={{ cursor: 'pointer', transition: 'background 150ms' }}
            onClick={() => onVer(c)}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
            onMouseLeave={e => (e.currentTarget.style.background = '')}
          >
            <td style={{ ...TD, fontWeight: 650, color: '#F4F4F5', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.nombre}
            </td>
            <td style={TD}>
              {c.sucursal ? (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 8px',
                  borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.05)', color: '#b7bcc4', fontSize: 11, letterSpacing: '0.04em',
                }}>{c.sucursal}</span>
              ) : <span style={{ color: '#8b9098', fontSize: 15 }}>—</span>}
            </td>
            <td style={{ ...TD, color: '#A1A1A6', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.comercial || <span style={{ color: '#8b9098' }}>—</span>}
            </td>
            <td style={{ ...TD, color: '#A1A1A6', fontSize: 12, fontFamily: 'monospace', letterSpacing: '0.03em' }}>
              {c.cif || <span style={{ color: '#8b9098', fontFamily: 'inherit' }}>—</span>}
            </td>
            <td style={TD}>
              <span style={{
                fontSize: 15, fontWeight: 650,
                color: (c.porcentajeComision ?? 0) > 0 ? '#20C982' : '#8b9098',
              }}>
                {(c.porcentajeComision ?? 0).toLocaleString('es-ES', { minimumFractionDigits: 1 })}%
              </span>
            </td>
            <td style={{ ...TD, color: '#A1A1A6', textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
              {c.periodicidad}
            </td>
            <td style={TD}>
              <span style={{
                fontSize: 15, fontWeight: 600,
                color: numFlotasDe(c.id) > 0 ? '#F4F4F5' : '#8b9098',
              }}>{numFlotasDe(c.id)}</span>
            </td>
            <td style={{ ...TD, textAlign: 'right', color: '#70747B', fontSize: 14 }}>→</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

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
  const [toast, setToast] = useState('');
  const [confirmBorrarTodo, setConfirmBorrarTodo] = useState(false);

  const handleBorrarTodo = useCallback(() => {
    borrarTodosLosCorredores();
    borrarTodasLasCarpetas();
    setCorredores([]);
    setCarpetas([]);
    setVista('lista');
    setCorredorDetalle(null);
    setConfirmBorrarTodo(false);
    setToast('Todos los datos eliminados');
    setTimeout(() => setToast(''), 3000);
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
  const totalFlotas = useMemo(() => corredores.reduce((sum, c) => sum + carpetas.filter(ca => ca.corredor_id === c.id).length, 0), [corredores, carpetas]);

  const comercialesUnicos = useMemo(() => {
    const set = new Set(corredores.map(c => c.comercial).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [corredores]);

  const kpis = useMemo(() => {
    const titan     = corredores.filter(c => c.sucursal === 'TITAN').length;
    const mediacion = corredores.filter(c => c.sucursal === 'MEDIACION').length;
    const conCom    = corredores.filter(c => (c.porcentajeComision ?? 0) > 0);
    const mediaCom  = conCom.length > 0
      ? conCom.reduce((s, c) => s + (c.porcentajeComision ?? 0), 0) / conCom.length : 0;
    return { titan, mediacion, conCom: conCom.length, mediaCom };
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

  const filteredCorredores = useMemo(() => corredores.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !search.trim() ||
      c.nombre.toLowerCase().includes(q) ||
      c.cif.toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.contacto || '').toLowerCase().includes(q) ||
      (c.comercial || '').toLowerCase().includes(q);
    const matchSucursal  = !filterSucursal || c.sucursal === filterSucursal;
    const matchComercial = !filterComercial || (c.comercial || '').toLowerCase().includes(filterComercial.toLowerCase());
    return matchSearch && matchSucursal && matchComercial;
  }), [corredores, search, filterSucursal, filterComercial]);

  const SELECT_STYLE: React.CSSProperties = {
    height: 40, padding: '0 12px', borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.08)', background: 'transparent',
    color: '#A1A1A6', fontSize: 14, cursor: 'pointer', outline: 'none',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {vista === 'lista' ? (
        <>
          {/* Page head */}
          <div style={{ marginTop: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 style={{ fontSize: 32, fontWeight: 650, letterSpacing: '-0.03em', color: '#F4F4F5', margin: 0 }}>
                Corredores
              </h1>
              <p style={{ marginTop: 6, color: '#A1A1A6', fontSize: 15, margin: '6px 0 0' }}>
                {corredores.length} corredores · {totalFlotas} flotas asociadas
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {role === 'admin' && (confirmBorrarTodo ? (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: 'rgba(239,77,90,0.06)', border: '1px solid rgba(239,77,90,0.2)',
                  borderRadius: 10, padding: '6px 14px',
                }}>
                  <span style={{ color: '#EF4D5A', fontWeight: 600, fontSize: 13 }}>¿Borrar TODO? Elimina corredores y flotas.</span>
                  <button onClick={handleBorrarTodo} style={{
                    background: '#EF4D5A', border: 'none', borderRadius: 6,
                    padding: '4px 12px', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  }}>Sí, borrar todo</button>
                  <button onClick={() => setConfirmBorrarTodo(false)} style={{
                    background: 'none', border: 'none', cursor: 'pointer', color: '#70747B', fontSize: 12,
                  }}>Cancelar</button>
                </div>
              ) : (
                <button onClick={() => setConfirmBorrarTodo(true)} className="btn-danger"
                  style={{ height: 36, padding: '0 14px', fontSize: 13 }}>
                  Borrar todo
                </button>
              ))}
              <button onClick={() => abrirPanel(null)} className="btn-primary"
                style={{ height: 36, padding: '0 16px', fontSize: 14 }}>
                + Nuevo corredor
              </button>
            </div>
          </div>

          {/* KPIs */}
          <div style={{ marginTop: 28, display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr', alignItems: 'end' }}>
            <div>
              <b style={{ fontSize: 52, fontWeight: 600, letterSpacing: '-0.04em', lineHeight: 1, color: '#F4F4F5' }}>
                {filteredCorredores.length}
              </b>
              <span style={{ marginLeft: 8, color: '#A1A1A6', fontSize: 14, letterSpacing: '0.06em' }}>CORREDORES</span>
            </div>
            <div style={{ textAlign: 'center' }}>
              <b style={{ fontSize: 52, fontWeight: 600, letterSpacing: '-0.04em', lineHeight: 1, color: '#F4F4F5' }}>
                {totalFlotas}
              </b>
              <span style={{ marginLeft: 8, color: '#A1A1A6', fontSize: 14, letterSpacing: '0.06em' }}>FLOTAS ASOCIADAS</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <b style={{ fontSize: 52, fontWeight: 600, letterSpacing: '-0.04em', lineHeight: 1, color: '#20C982' }}>
                {kpis.mediaCom.toFixed(1)}%
              </b>
              <span style={{ marginLeft: 8, color: '#20C982', fontSize: 14, letterSpacing: '0.06em' }}>COMISIÓN MEDIA</span>
            </div>
          </div>
          <p style={{ marginTop: 14, color: '#A1A1A6', fontSize: 14, margin: '14px 0 0' }}>
            {kpis.titan} Titan · {kpis.mediacion} Mediación · {kpis.conCom} con comisión
          </p>

          {/* Filtros */}
          <div style={{ marginTop: 22, display: 'flex', gap: 12, alignItems: 'center' }}>
            <input
              placeholder="Buscar corredor, CIF, comercial..."
              value={search} onChange={e => setSearch(e.target.value)}
              style={{
                width: 280, height: 40, padding: '0 14px',
                border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10,
                background: 'transparent', color: '#A1A1A6',
                fontSize: 14, outline: 'none',
              }}
            />
            <select value={filterSucursal} onChange={e => setFilterSucursal(e.target.value as Sucursal | '')}
              style={SELECT_STYLE}>
              <option value="">Todas las sucursales</option>
              {SUCURSALES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filterComercial} onChange={e => setFilterComercial(e.target.value)}
              style={SELECT_STYLE}>
              <option value="">Todos los comerciales</option>
              {comercialesUnicos.map(com => <option key={com} value={com}>{com}</option>)}
            </select>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: '#70747B' }}>
              {filteredCorredores.length} {filteredCorredores.length === 1 ? 'resultado' : 'resultados'}
            </span>
          </div>

          {/* Tabla */}
          {filteredCorredores.length === 0 ? (
            <div style={{
              marginTop: 28, padding: '60px 40px', textAlign: 'center',
              border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 14,
            }}>
              <p style={{ margin: 0, color: '#70747B', fontSize: 13 }}>
                {corredores.length === 0 ? 'Sin corredores. Crea el primero.' : 'Sin resultados.'}
              </p>
            </div>
          ) : (
            <CorredoresTable
              corredores={filteredCorredores}
              carpetas={carpetas}
              onVer={handleVerDetalle}
            />
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
        <PanelCorredor corredor={corredorEditar} onClose={cerrarPanel} onSave={handleSave} />
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
          background: toast.startsWith('Error') ? 'rgba(239,77,90,0.9)' : '#090A0C',
          border: `1px solid ${toast.startsWith('Error') ? 'rgba(239,77,90,0.4)' : 'rgba(255,255,255,0.12)'}`,
          color: '#F4F4F5', padding: '10px 24px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          zIndex: 999, boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
        }}>{toast}</div>
      )}
    </div>
  );
}
