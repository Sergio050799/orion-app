'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  listarCorredores, crearCorredor, guardarCorredor, eliminarCorredor, cargarCorredoresDelServidor,
  type Corredor, type Periodicidad, type Sucursal,
} from '@/core/flotas';
import { listarCarpetas, crearCarpeta, guardarCarpeta, eliminarCarpeta, type FlotaCarpeta } from '@/core/flotas';

// ─── Design tokens ──────────────────────────────────────────────────────────

const glass: React.CSSProperties = {
  background: 'rgba(12, 28, 82, 0.75)',
  border: '1px solid rgba(61, 112, 255, 0.22)',
  borderRadius: 22,
  boxShadow: '0 30px 80px -20px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.06) inset, 0 0 0 1px rgba(61,112,255,0.14) inset',
};

const SUCURSALES: Sucursal[] = ['TITAN', 'MEDIACION'];

// ─── Tipos ──────────────────────────────────────────────────────────────────

type Vista = 'lista' | 'detalle';
type FormData = Omit<Corredor, 'id' | 'creadoEn' | 'actualizadoEn'>;

const FORM_VACIO: FormData = {
  codigo: '', nombre: '', cif: '', domicilio: '', porcentajeComision: 0,
  periodicidad: 'mensual', formaPago: '', contacto: '',
  email: '', telefono: '', observaciones: '',
  sucursal: undefined, comercial: '',
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
  if (estado === 'OFERTADA') return '#f59e0b';
  if (estado === 'CONTRATADA') return '#10b981';
  if (estado === 'RECHAZADA') return '#ef4444';
  return '#3366FF';
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{
        display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: 'rgba(70,120,255,0.8)', marginBottom: 6,
      }}>{label}</span>
      {children}
    </label>
  );
}

// ─── Panel lateral (crear / editar) ─────────────────────────────────────────

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
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)', zIndex: 40,
      }} />
      <aside style={{
        position: 'fixed', top: 100, right: 0, bottom: 0, width: 440, zIndex: 50,
        background: 'linear-gradient(180deg, rgba(8,22,72,0.95) 0%, rgba(0,7,45,0.98) 100%)',
        borderLeft: '1px solid rgba(61,112,255,0.22)',
        borderTopLeftRadius: 22,
        display: 'flex', flexDirection: 'column',
      }}>
        <header style={{
          padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid rgba(61,112,255,0.16)',
        }}>
          <h2 style={{
            margin: 0, fontSize: 16, color: '#FFFFFF',
            fontFamily: 'var(--font-display), Inter, sans-serif', fontWeight: 600,
          }}>
            {corredor ? 'Editar corredor' : 'Nuevo corredor'}
          </h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(178,198,245,0.5)', fontSize: 22, lineHeight: 1, padding: 4,
          }}>x</button>
        </header>

        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label="Nombre *">
                <input className="orion-input" value={form.nombre} onChange={e => set('nombre', e.target.value)} required />
              </FormField>
              <FormField label="Codigo corredor">
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
              <FormField label="% Comision">
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
              <FormField label="Telefono">
                <input className="orion-input" value={form.telefono} onChange={e => set('telefono', e.target.value)} />
              </FormField>
            </div>

            <FormField label="Observaciones">
              <textarea className="orion-input" rows={4} value={form.observaciones}
                onChange={e => set('observaciones', e.target.value)} />
            </FormField>
          </div>

          <footer style={{ marginTop: 24, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{
              background: 'rgba(6,14,50,0.5)', border: '1px solid rgba(61,112,255,0.22)',
              borderRadius: 10, padding: '9px 18px', color: '#BDD4FF', fontSize: 13,
              cursor: 'pointer', fontWeight: 500,
            }}>Cancelar</button>
            <button type="submit" style={{
              background: 'linear-gradient(135deg, #1240CC, #3366FF)',
              border: 'none', borderRadius: 10, padding: '9px 22px',
              color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              boxShadow: '0 0 20px rgba(18,64,204,0.4)',
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
  corredor, flotas, onVolver, onEditar, onEliminar, onNuevaFlota, onDesvincularFlota,
}: {
  corredor: Corredor; flotas: FlotaCarpeta[];
  onVolver: () => void; onEditar: () => void;
  onEliminar: (mode: 'desvincular' | 'borrar_flotas') => void;
  onNuevaFlota: () => void;
  onDesvincularFlota: (flotaId: string) => void;
}) {
  const [confirmElim, setConfirmElim] = useState(false);
  const [confirmEdit, setConfirmEdit] = useState(false);
  const [confirmDesvincular, setConfirmDesvincular] = useState<string | null>(null);

  return (
    <div className="animate-in fade-in duration-500" style={{ maxWidth: 900, margin: '0 auto' }}>
      <button onClick={onVolver} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: '#3366FF', fontSize: 13, padding: 0, marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500,
      }}>
        Volver a corredores
      </button>

      <div style={{ ...glass, padding: '28px 32px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{
              margin: 0, fontSize: 22, color: '#FFFFFF',
              fontFamily: 'var(--font-display), Inter, sans-serif', fontWeight: 700,
            }}>
              {corredor.nombre}
            </h1>
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {corredor.cif && <span style={{ fontSize: 12, color: '#BDD4FF', fontFamily: 'monospace' }}>{corredor.cif}</span>}
              {corredor.sucursal && (
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  color: corredor.sucursal === 'TITAN' ? '#60a5fa' : '#a78bfa',
                  background: corredor.sucursal === 'TITAN' ? 'rgba(96,165,250,0.12)' : 'rgba(167,139,250,0.12)',
                  border: `1px solid ${corredor.sucursal === 'TITAN' ? 'rgba(96,165,250,0.3)' : 'rgba(167,139,250,0.3)'}`,
                  borderRadius: 999, padding: '3px 10px',
                }}>{corredor.sucursal}</span>
              )}
              {corredor.comercial && (
                <span style={{
                  fontSize: 11, color: '#BDD4FF',
                  background: 'rgba(6,14,50,0.5)',
                  border: '1px solid rgba(61,112,255,0.16)',
                  borderRadius: 999, padding: '3px 10px',
                }}>{corredor.comercial}</span>
              )}
              <span style={{
                fontSize: 12, fontWeight: 700, color: '#3366FF',
                background: 'rgba(61,112,255,0.16)', border: '1px solid rgba(51,102,255,0.25)',
                borderRadius: 999, padding: '3px 10px',
              }}>{corredor.porcentajeComision}% comision</span>
              <span style={{
                fontSize: 11, color: '#BDD4FF', background: 'rgba(6,14,50,0.5)',
                border: '1px solid rgba(61,112,255,0.16)', borderRadius: 999, padding: '3px 10px',
                textTransform: 'capitalize',
              }}>{corredor.periodicidad}</span>
            </div>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {corredor.email && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#BDD4FF' }}>
                  <MailIcon /> {corredor.email}
                </span>
              )}
              {corredor.telefono && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#BDD4FF' }}>
                  <PhoneIcon /> {corredor.telefono}
                </span>
              )}
              {corredor.contacto && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#BDD4FF' }}>
                  <UserIcon /> {corredor.contacto}
                </span>
              )}
              {corredor.formaPago && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#BDD4FF' }}>
                  <CashIcon /> {corredor.formaPago}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {!confirmEdit ? (
              <button onClick={() => setConfirmEdit(true)} style={{
                background: 'rgba(6,14,50,0.5)', border: '1px solid rgba(61,112,255,0.22)',
                borderRadius: 10, padding: '8px 16px', color: '#BDD4FF', fontSize: 12,
                cursor: 'pointer', fontWeight: 500,
              }}>Editar</button>
            ) : (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'rgba(51,102,255,0.1)', border: '1px solid rgba(51,102,255,0.3)',
                borderRadius: 10, padding: '4px 10px', fontSize: 12,
              }}>
                <span style={{ color: 'rgba(178,198,245,0.8)', fontSize: 11 }}>¿Editar datos?</span>
                <button onClick={() => { setConfirmEdit(false); onEditar(); }} style={{
                  background: 'linear-gradient(135deg, #1240CC, #3366FF)', border: 'none',
                  borderRadius: 6, padding: '3px 10px', color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 600,
                }}>Sí</button>
                <button onClick={() => setConfirmEdit(false)} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'rgba(178,198,245,0.5)', fontSize: 11, padding: '3px 4px',
                }}>No</button>
              </div>
            )}
            {!confirmElim ? (
              <button onClick={() => setConfirmElim(true)} style={{
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: 10, padding: '8px 16px', color: '#f87171', fontSize: 12,
                cursor: 'pointer', fontWeight: 500,
              }}>Eliminar</button>
            ) : flotas.length > 0 ? (
              <div style={{
                display: 'flex', flexDirection: 'column', gap: 8,
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: 10, padding: '10px 14px', fontSize: 12,
              }}>
                <span style={{ color: '#f87171', fontWeight: 600 }}>
                  Tiene {flotas.length} flota{flotas.length > 1 ? 's' : ''}:
                </span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => onEliminar('desvincular')} style={{
                    background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)',
                    borderRadius: 6, padding: '4px 10px', color: '#fbbf24', fontSize: 11, cursor: 'pointer', fontWeight: 600,
                  }}>Desvincular todas</button>
                  <button onClick={() => onEliminar('borrar_flotas')} style={{
                    background: '#ef4444', border: 'none', borderRadius: 6,
                    padding: '4px 10px', color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 600,
                  }}>Borrar todo</button>
                  <button onClick={() => setConfirmElim(false)} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'rgba(178,198,245,0.5)', fontSize: 11, padding: '4px 6px',
                  }}>Cancelar</button>
                </div>
              </div>
            ) : (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: 10, padding: '4px 10px', fontSize: 12,
              }}>
                <span style={{ color: 'rgba(178,198,245,0.7)' }}>Seguro?</span>
                <button onClick={() => onEliminar('desvincular')} style={{
                  background: '#ef4444', border: 'none', borderRadius: 6,
                  padding: '3px 10px', color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 600,
                }}>Si</button>
                <button onClick={() => setConfirmElim(false)} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'rgba(178,198,245,0.5)', fontSize: 11, padding: '3px 4px',
                }}>No</button>
              </div>
            )}
          </div>
        </div>
        {corredor.observaciones && (
          <div style={{
            marginTop: 18, padding: '12px 16px',
            background: 'rgba(61,112,255,0.10)', border: '1px solid rgba(51,102,255,0.15)',
            borderRadius: 10, fontSize: 12, color: '#BDD4FF',
          }}>
            <b style={{ color: '#3366FF', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Observaciones</b>
            {corredor.observaciones}
          </div>
        )}
      </div>

      <div style={{ ...glass, padding: '24px 28px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18,
        }}>
          <h3 style={{
            margin: 0, fontSize: 14, color: '#FFFFFF',
            fontFamily: 'var(--font-display), Inter, sans-serif', fontWeight: 500,
          }}>
            Flotas asociadas · {flotas.length}
          </h3>
          <button onClick={onNuevaFlota} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#3366FF', fontSize: 12, fontWeight: 600,
          }}>+ Vincular flota</button>
        </div>

        {flotas.length === 0 ? (
          <p style={{ color: 'rgba(178,198,245,0.4)', fontSize: 12, textAlign: 'center', padding: '30px 0', margin: 0 }}>
            Sin flotas vinculadas.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {flotas.map(f => {
              const rows = f.trabajo?.length > 0 ? f.trabajo : f.original;
              const numVeh = rows?.length ?? 0;
              const isConfirming = confirmDesvincular === f.id;
              return (
                <li key={f.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 16px', borderRadius: 10,
                  transition: 'background 180ms',
                  background: isConfirming ? 'rgba(245,158,11,0.06)' : undefined,
                }}
                  onMouseEnter={e => { if (!isConfirming) e.currentTarget.style.background = 'rgba(51,102,255,0.04)'; }}
                  onMouseLeave={e => { if (!isConfirming) e.currentTarget.style.background = ''; }}
                >
                  <span style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 500 }}>
                    {f.nombre || '(sin nombre)'}
                    <span style={{ color: 'rgba(178,198,245,0.6)', fontWeight: 400, fontSize: 11, marginLeft: 8 }}>· {numVeh} veh.</span>
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      fontSize: 11, padding: '3px 10px', borderRadius: 999, fontWeight: 500,
                      color: estadoColor(f.estado ?? 'EN ESTUDIO'),
                      background: `${estadoColor(f.estado ?? 'EN ESTUDIO')}18`,
                      border: `1px solid ${estadoColor(f.estado ?? 'EN ESTUDIO')}40`,
                    }}>{f.estado ?? 'EN ESTUDIO'}</span>
                    {!isConfirming ? (
                      <button onClick={() => setConfirmDesvincular(f.id)} style={{
                        background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)',
                        borderRadius: 6, padding: '3px 10px', color: '#fbbf24', fontSize: 11,
                        cursor: 'pointer', fontWeight: 500,
                      }}>Desvincular</button>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 11, color: 'rgba(178,198,245,0.7)' }}>Seguro?</span>
                        <button onClick={() => { onDesvincularFlota(f.id); setConfirmDesvincular(null); }} style={{
                          background: '#f59e0b', border: 'none', borderRadius: 6,
                          padding: '3px 10px', color: '#000', fontSize: 11, cursor: 'pointer', fontWeight: 700,
                        }}>Si</button>
                        <button onClick={() => setConfirmDesvincular(null)} style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'rgba(178,198,245,0.5)', fontSize: 11,
                        }}>No</button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Tabla de corredores (lista unica) ─────────────────────────────────────

function CorredoresTable({
  corredores, carpetas, onVer,
}: {
  corredores: Corredor[];
  carpetas: FlotaCarpeta[];
  onVer: (c: Corredor) => void;
}) {
  const numFlotasDe = (id: string) => carpetas.filter(c => c.corredor_id === id).length;

  return (
    <div style={{
      background: 'rgba(12,28,82,0.42)',
      border: '1px solid rgba(61,112,255,0.16)',
      borderRadius: 16, overflow: 'hidden',
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['Nombre', 'Sucursal', 'Comercial', 'CIF', 'Comision %', 'Periodicidad', 'Flotas', ''].map(h => (
              <th key={h} style={{
                textAlign: 'left', padding: '14px 16px', fontSize: 10, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.12em', color: '#3366FF',
                borderBottom: '1px solid rgba(51,102,255,0.15)',
                whiteSpace: 'nowrap',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {corredores.map(c => (
            <tr key={c.id} style={{ transition: 'background 180ms', cursor: 'pointer' }}
              onClick={() => onVer(c)}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(51,102,255,0.04)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              <td style={{ padding: '12px 16px', color: '#FFFFFF', fontSize: 13, fontWeight: 500, borderBottom: '1px solid rgba(61,112,255,0.10)' }}>
                {c.nombre}
              </td>
              <td style={{ padding: '12px 16px', borderBottom: '1px solid rgba(61,112,255,0.10)' }}>
                {c.sucursal ? (
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    color: c.sucursal === 'TITAN' ? '#60a5fa' : '#a78bfa',
                    background: c.sucursal === 'TITAN' ? 'rgba(96,165,250,0.12)' : 'rgba(167,139,250,0.12)',
                    border: `1px solid ${c.sucursal === 'TITAN' ? 'rgba(96,165,250,0.3)' : 'rgba(167,139,250,0.3)'}`,
                    borderRadius: 999, padding: '2px 8px',
                  }}>{c.sucursal}</span>
                ) : <span style={{ color: 'rgba(178,198,245,0.3)', fontSize: 12 }}>—</span>}
              </td>
              <td style={{ padding: '12px 16px', color: '#BDD4FF', fontSize: 12, borderBottom: '1px solid rgba(61,112,255,0.10)' }}>
                {c.comercial || <span style={{ color: 'rgba(178,198,245,0.3)' }}>—</span>}
              </td>
              <td style={{ padding: '12px 16px', color: '#BDD4FF', fontSize: 12, fontFamily: 'monospace', borderBottom: '1px solid rgba(61,112,255,0.10)' }}>
                {c.cif || '—'}
              </td>
              <td style={{ padding: '12px 16px', color: '#BDD4FF', fontSize: 12, borderBottom: '1px solid rgba(61,112,255,0.10)' }}>
                {(c.porcentajeComision ?? 0).toLocaleString('es-ES', { minimumFractionDigits: 1 })}%
              </td>
              <td style={{ padding: '12px 16px', color: '#BDD4FF', fontSize: 12, borderBottom: '1px solid rgba(61,112,255,0.10)', textTransform: 'capitalize' }}>
                {c.periodicidad}
              </td>
              <td style={{ padding: '12px 16px', borderBottom: '1px solid rgba(61,112,255,0.10)' }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: '#3366FF',
                  background: 'rgba(51,102,255,0.1)', borderRadius: 999, padding: '2px 8px',
                }}>{numFlotasDe(c.id)}</span>
              </td>
              <td style={{ padding: '12px 16px', borderBottom: '1px solid rgba(61,112,255,0.10)', textAlign: 'right' }}>
                <span style={{ color: '#3366FF', fontSize: 12, fontWeight: 600 }}>Ver</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Pagina principal ───────────────────────────────────────────────────────

export default function CorredoresPage() {
  const router = useRouter();
  const [corredores, setCorredores] = useState<Corredor[]>([]);
  const [carpetas, setCarpetas] = useState<FlotaCarpeta[]>([]);
  const [vista, setVista] = useState<Vista>('lista');
  const [search, setSearch] = useState('');
  const [filterSucursal, setFilterSucursal] = useState<Sucursal | ''>('');
  const [filterComercial, setFilterComercial] = useState('');
  const [corredorDetalle, setCorredorDetalle] = useState<Corredor | null>(null);
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [corredorEditar, setCorredorEditar] = useState<Corredor | null>(null);
  const [importToast, setImportToast] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleDescargarPlantilla = useCallback(async () => {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Corredores');
    const cols = [
      { header: 'nombre',       width: 30 },
      { header: 'codigo',       width: 14 },
      { header: 'cif',          width: 14 },
      { header: 'domicilio',    width: 36 },
      { header: 'comision',     width: 12 },
      { header: 'periodicidad', width: 14 },
      { header: 'forma pago',   width: 16 },
      { header: 'contacto',     width: 22 },
      { header: 'email',        width: 28 },
      { header: 'telefono',     width: 16 },
      { header: 'sucursal',     width: 14 },
      { header: 'comercial',    width: 18 },
      { header: 'observaciones', width: 36 },
    ];
    ws.columns = cols.map(c => ({ header: c.header, key: c.header, width: c.width }));
    const headerRow = ws.getRow(1);
    headerRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1240CC' } };
      cell.alignment = { vertical: 'middle' };
    });
    headerRow.height = 20;
    // Fila de ejemplo
    ws.addRow({
      nombre: 'Corredor Ejemplo S.L.', codigo: 'COR-001', cif: 'B12345678',
      domicilio: 'Calle Mayor 1, Madrid', comision: 15, periodicidad: 'mensual',
      'forma pago': 'Transferencia', contacto: 'Juan García',
      email: 'juan@corredor.com', telefono: '600123456',
      sucursal: 'TITAN', comercial: 'Roberto', observaciones: '',
    });
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'plantilla_corredores.xlsx'; a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleImportExcel = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (rows.length === 0) { setImportToast('Excel vacio'); setTimeout(() => setImportToast(''), 2000); return; }
      let count = 0;
      for (const r of rows) {
        const get = (...keys: string[]) => {
          for (const k of keys) {
            for (const rk of Object.keys(r)) {
              if (rk.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim() === k.toLowerCase())
                return String(r[rk] ?? '').trim();
            }
          }
          return '';
        };
        const nombre = get('nombre', 'name', 'corredor', 'razon social', 'razon_social');
        if (!nombre) continue;
        const periodicidadRaw = get('periodicidad', 'frecuencia', 'periodo').toLowerCase();
        let periodicidad: Periodicidad = 'mensual';
        if (periodicidadRaw.includes('trimestral')) periodicidad = 'trimestral';
        else if (periodicidadRaw.includes('semestral')) periodicidad = 'semestral';
        else if (periodicidadRaw.includes('anual')) periodicidad = 'anual';
        const comision = parseFloat(get('comision', 'comision %', 'porcentaje').replace(',', '.').replace('%', '')) || 0;
        const sucursalRaw = get('sucursal').toUpperCase();
        const sucursal: Sucursal | undefined = (sucursalRaw === 'TITAN' || sucursalRaw === 'MEDIACION') ? sucursalRaw : undefined;
        crearCorredor({
          nombre, codigo: get('codigo', 'code', 'cod'), cif: get('cif', 'nif'),
          domicilio: get('domicilio', 'direccion', 'address'),
          porcentajeComision: comision, periodicidad,
          formaPago: get('forma pago', 'forma_pago', 'pago'),
          contacto: get('contacto', 'contact'),
          email: get('email', 'correo', 'mail'),
          telefono: get('telefono', 'phone', 'tel'),
          observaciones: get('observaciones', 'notas', 'notes'),
          sucursal, comercial: get('comercial'),
        });
        count++;
      }
      setImportToast(`${count} corredor${count !== 1 ? 'es' : ''} importado${count !== 1 ? 's' : ''}`);
      setTimeout(() => setImportToast(''), 3000);
      cargar();
    } catch {
      setImportToast('Error al leer el archivo');
      setTimeout(() => setImportToast(''), 3000);
    }
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  const cargar = useCallback(() => {
    setCorredores(listarCorredores());
    setCarpetas(listarCarpetas());
  }, []);

  useEffect(() => {
    cargar();
    cargarCorredoresDelServidor()
      .then(data => setCorredores([...data].sort((a, b) => a.nombre.localeCompare(b.nombre))))
      .catch(() => {});
  }, [cargar]);

  const flotasDe = useCallback((id: string) => carpetas.filter(c => c.corredor_id === id), [carpetas]);
  const totalFlotas = useMemo(() => corredores.reduce((sum, c) => sum + carpetas.filter(ca => ca.corredor_id === c.id).length, 0), [corredores, carpetas]);

  // Comerciales unicos para el filtro
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

  return (
    <div className="animate-in fade-in duration-500" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {vista === 'lista' ? (
        <>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{
                width: 4, height: 40, borderRadius: 2, marginTop: 2,
                background: 'linear-gradient(180deg, #1240CC, #3366FF)',
                boxShadow: '0 0 12px rgba(70,120,255,0.5)',
              }} />
              <div>
                <h1 style={{
                  margin: 0, fontSize: 22, color: '#FFFFFF',
                  fontFamily: 'var(--font-display), Inter, sans-serif',
                  fontWeight: 700, letterSpacing: '-0.01em',
                }}>Corredores</h1>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(178,198,245,0.6)', letterSpacing: '0.04em' }}>
                  {corredores.length} corredores · {totalFlotas} flotas asociadas
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleDescargarPlantilla} style={{
                background: 'rgba(6,14,50,0.5)', border: '1px solid rgba(61,112,255,0.22)',
                borderRadius: 10, padding: '9px 16px',
                color: 'rgba(178,198,245,0.8)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
              }}>Descargar plantilla</button>
              <button onClick={() => fileRef.current?.click()} style={{
                background: 'rgba(6,14,50,0.5)', border: '1px solid rgba(61,112,255,0.22)',
                borderRadius: 10, padding: '9px 16px',
                color: 'rgba(178,198,245,0.8)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
              }}>Importar Excel</button>
              <button onClick={() => abrirPanel(null)} style={{
                background: 'linear-gradient(135deg, #1240CC, #3366FF)',
                border: 'none', borderRadius: 10, padding: '9px 20px',
                color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                boxShadow: '0 0 20px rgba(18,64,204,0.4)',
              }}>+ Nuevo corredor</button>
            </div>
          </div>

          {/* Filtros */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'rgba(6,14,50,0.5)', border: '1px solid rgba(61,112,255,0.22)',
              borderRadius: 10, padding: '0 14px', flex: 1, maxWidth: 300,
            }}>
              <span style={{ color: 'rgba(70,120,255,0.5)' }}><SearchIcon /></span>
              <input
                placeholder="Buscar corredor, CIF, comercial..."
                value={search} onChange={e => setSearch(e.target.value)}
                style={{
                  background: 'none', border: 'none', outline: 'none',
                  color: '#FFFFFF', fontSize: 12, padding: '9px 0', width: '100%',
                }}
              />
            </div>

            {/* Filtro Sucursal */}
            <select
              value={filterSucursal}
              onChange={e => setFilterSucursal(e.target.value as Sucursal | '')}
              style={{
                background: 'rgba(6,14,50,0.5)', border: '1px solid rgba(61,112,255,0.22)',
                borderRadius: 10, padding: '9px 14px', color: filterSucursal ? '#FFFFFF' : 'rgba(178,198,245,0.5)',
                fontSize: 12, cursor: 'pointer', outline: 'none',
              }}
            >
              <option value="">Todas las sucursales</option>
              {SUCURSALES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            {/* Filtro Comercial */}
            <select
              value={filterComercial}
              onChange={e => setFilterComercial(e.target.value)}
              style={{
                background: 'rgba(6,14,50,0.5)', border: '1px solid rgba(61,112,255,0.22)',
                borderRadius: 10, padding: '9px 14px', color: filterComercial ? '#FFFFFF' : 'rgba(178,198,245,0.5)',
                fontSize: 12, cursor: 'pointer', outline: 'none',
              }}
            >
              <option value="">Todos los comerciales</option>
              {comercialesUnicos.map(com => <option key={com} value={com}>{com}</option>)}
            </select>

            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: 'rgba(178,198,245,0.5)' }}>
              {filteredCorredores.length} {filteredCorredores.length === 1 ? 'resultado' : 'resultados'}
            </span>
          </div>

          {/* Tabla */}
          {filteredCorredores.length === 0 ? (
            <div style={{
              ...glass, padding: '60px 40px', textAlign: 'center', borderStyle: 'dashed',
            }}>
              <p style={{ margin: 0, color: 'rgba(178,198,245,0.4)', fontSize: 13 }}>
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
            onVolver={() => setVista('lista')}
            onEditar={() => abrirPanel(corredorDetalle)}
            onEliminar={handleEliminar}
            onNuevaFlota={handleNuevaFlota}
            onDesvincularFlota={handleDesvincularFlota}
          />
        )
      )}

      {panelAbierto && (
        <PanelCorredor corredor={corredorEditar} onClose={cerrarPanel} onSave={handleSave} />
      )}

      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={handleImportExcel} />

      {importToast && (
        <div style={{
          position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
          background: importToast.startsWith('Error') ? 'rgba(220,38,38,0.9)' : 'rgba(16,185,129,0.9)',
          color: '#fff', padding: '10px 24px', borderRadius: 12, fontSize: 13, fontWeight: 600,
          zIndex: 999, boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
        }}>{importToast}</div>
      )}
    </div>
  );
}
