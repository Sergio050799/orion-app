'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  listarCorredores, crearCorredor, guardarCorredor, eliminarCorredor,
  type Corredor, type Periodicidad,
} from '@/core/flotas';
import { listarCarpetas, crearCarpeta, type FlotaCarpeta } from '@/core/flotas';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Vista = 'lista' | 'detalle';

type FormData = Omit<Corredor, 'id' | 'creadoEn' | 'actualizadoEn'>;

const FORM_VACIO: FormData = {
  nombre: '',
  cif: '',
  domicilio: '',
  porcentajeComision: 0,
  periodicidad: 'mensual',
  formaPago: '',
  contacto: '',
  email: '',
  telefono: '',
  observaciones: '',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function estadoColor(estado: string) {
  if (estado === 'CONTRATADA') return '#4ade80';
  if (estado === 'RECHAZADA') return '#f87171';
  return '#818cf8';
}

// ─── Panel lateral (crear / editar) ───────────────────────────────────────────

function PanelCorredor({
  corredor,
  onClose,
  onSave,
}: {
  corredor: Corredor | null;
  onClose: () => void;
  onSave: (c: Corredor) => void;
}) {
  const [form, setForm] = useState<FormData>(corredor ? {
    nombre: corredor.nombre,
    cif: corredor.cif,
    domicilio: corredor.domicilio ?? '',
    porcentajeComision: corredor.porcentajeComision,
    periodicidad: corredor.periodicidad,
    formaPago: corredor.formaPago,
    contacto: corredor.contacto,
    email: corredor.email,
    telefono: corredor.telefono,
    observaciones: corredor.observaciones,
  } : { ...FORM_VACIO });

  function set(field: keyof FormData, value: string | number | Periodicidad) {
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

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: '8px 10px',
    color: '#e2e8f0',
    fontSize: 14,
    outline: 'none',
  };

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.4)',
          zIndex: 40,
        }}
      />
      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 420,
        background: 'linear-gradient(135deg, #1e1b4b 0%, #0f0c29 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRight: 'none',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <h2 style={{ margin: 0, fontSize: 16, color: '#e2e8f0', fontWeight: 600 }}>
            {corredor ? 'Editar corredor' : 'Nuevo corredor'}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.4)', fontSize: 20, lineHeight: 1,
              padding: 4,
            }}
          >×</button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div>
              <label style={labelStyle}>Nombre *</label>
              <input style={inputStyle} value={form.nombre}
                onChange={e => set('nombre', e.target.value)} required />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>CIF</label>
                <input style={inputStyle} value={form.cif}
                  onChange={e => set('cif', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>% Comisión</label>
                <input style={inputStyle} type="number" min={0} max={100} step={0.1}
                  value={form.porcentajeComision}
                  onChange={e => set('porcentajeComision', parseFloat(e.target.value) || 0)} />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Domicilio fiscal</label>
              <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
                value={form.domicilio ?? ''}
                onChange={e => set('domicilio', e.target.value)}
                placeholder="Dirección fiscal completa" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Periodicidad</label>
                <select style={{ ...inputStyle, cursor: 'pointer' }}
                  value={form.periodicidad}
                  onChange={e => set('periodicidad', e.target.value as Periodicidad)}>
                  <option value="mensual">Mensual</option>
                  <option value="trimestral">Trimestral</option>
                  <option value="semestral">Semestral</option>
                  <option value="anual">Anual</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Forma de pago</label>
                <input style={inputStyle} value={form.formaPago}
                  onChange={e => set('formaPago', e.target.value)} />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Contacto</label>
              <input style={inputStyle} value={form.contacto}
                onChange={e => set('contacto', e.target.value)} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Email</label>
                <input style={inputStyle} type="email" value={form.email}
                  onChange={e => set('email', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Teléfono</label>
                <input style={inputStyle} value={form.telefono}
                  onChange={e => set('telefono', e.target.value)} />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Observaciones</label>
              <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
                value={form.observaciones}
                onChange={e => set('observaciones', e.target.value)} />
            </div>
          </div>

          <div style={{ marginTop: 24, display: 'flex', gap: 10 }}>
            <button type="submit" style={{
              flex: 1,
              background: '#6366f1',
              border: 'none',
              borderRadius: 8,
              padding: '10px 0',
              color: '#fff',
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
            }}>
              {corredor ? 'Guardar cambios' : 'Crear corredor'}
            </button>
            <button type="button" onClick={onClose} style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              padding: '10px 16px',
              color: 'rgba(255,255,255,0.6)',
              fontSize: 14,
              cursor: 'pointer',
            }}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

// ─── Vista detalle ─────────────────────────────────────────────────────────────

function DetalleView({
  corredor,
  flotas,
  onVolver,
  onEditar,
  onEliminar,
  onNuevaFlota,
}: {
  corredor: Corredor;
  flotas: FlotaCarpeta[];
  onVolver: () => void;
  onEditar: () => void;
  onEliminar: () => void;
  onNuevaFlota: () => void;
}) {
  const [confirmElim, setConfirmElim] = useState(false);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      {/* Back + Header */}
      <div style={{ marginBottom: 24 }}>
        <button
          onClick={onVolver}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#6366f1', fontSize: 14, padding: 0,
            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16,
          }}
        >
          ← Volver
        </button>

        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 16,
          padding: '24px 28px',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, color: '#e2e8f0', fontWeight: 700 }}>
                {corredor.nombre}
              </h1>
              <div style={{ marginTop: 6, fontSize: 13, color: 'rgba(255,255,255,0.45)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {corredor.cif && <span>CIF: {corredor.cif}</span>}
                <span style={{ color: '#818cf8', fontWeight: 600 }}>{corredor.porcentajeComision}% comisión</span>
                <span style={{ textTransform: 'capitalize' }}>{corredor.periodicidad}</span>
              </div>
              <div style={{ marginTop: 4, fontSize: 13, color: 'rgba(255,255,255,0.45)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {corredor.email && <span>{corredor.email}</span>}
                {corredor.telefono && <span>{corredor.telefono}</span>}
                {corredor.contacto && <span>Contacto: {corredor.contacto}</span>}
              </div>
              {corredor.domicilio && (
                <p style={{ margin: '6px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
                  {corredor.domicilio}
                </p>
              )}
              {corredor.observaciones && (
                <p style={{ margin: '10px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.35)', maxWidth: 500 }}>
                  {corredor.observaciones}
                </p>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button onClick={onEditar} style={{
                background: 'rgba(99,102,241,0.15)',
                border: '1px solid rgba(99,102,241,0.3)',
                borderRadius: 8,
                padding: '7px 14px',
                color: '#818cf8',
                fontSize: 13,
                cursor: 'pointer',
                fontWeight: 500,
              }}>
                Editar
              </button>
              {!confirmElim ? (
                <button onClick={() => setConfirmElim(true)} style={{
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.25)',
                  borderRadius: 8,
                  padding: '7px 14px',
                  color: '#f87171',
                  fontSize: 13,
                  cursor: 'pointer',
                  fontWeight: 500,
                }}>
                  Eliminar
                </button>
              ) : (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'rgba(239,68,68,0.12)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 8,
                  padding: '4px 10px',
                  fontSize: 12,
                }}>
                  <span style={{ color: 'rgba(255,255,255,0.6)' }}>¿Seguro?</span>
                  <button onClick={onEliminar} style={{
                    background: '#ef4444', border: 'none', borderRadius: 4,
                    padding: '3px 8px', color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 600,
                  }}>Sí</button>
                  <button onClick={() => setConfirmElim(false)} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'rgba(255,255,255,0.4)', fontSize: 11, padding: '3px 4px',
                  }}>No</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Flotas asociadas */}
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16,
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <h3 style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.35)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Flotas asociadas ({flotas.length})
          </h3>
        </div>

        {flotas.length === 0 ? (
          <div style={{ padding: '32px 24px', textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 14 }}>
            Sin flotas asociadas
          </div>
        ) : (
          <div>
            {flotas.map((f, i) => (
              <div key={f.id} style={{
                padding: '14px 24px',
                borderBottom: i < flotas.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div>
                  <span style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 500 }}>{f.nombre || '(sin nombre)'}</span>
                  <span style={{
                    marginLeft: 10,
                    fontSize: 11,
                    padding: '2px 7px',
                    borderRadius: 20,
                    background: 'rgba(0,0,0,0.2)',
                    color: estadoColor(f.estado ?? 'EN ESTUDIO'),
                    border: `1px solid ${estadoColor(f.estado ?? 'EN ESTUDIO')}40`,
                  }}>
                    {f.estado ?? 'EN ESTUDIO'}
                  </span>
                </div>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
                  {f.actualizadaEn ? new Date(f.actualizadaEn).toLocaleDateString('es-ES') : '—'}
                </span>
              </div>
            ))}
          </div>
        )}

        <div style={{ padding: '12px 24px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={onNuevaFlota} style={{
            background: 'rgba(99,102,241,0.1)',
            border: '1px solid rgba(99,102,241,0.25)',
            borderRadius: 8,
            padding: '8px 16px',
            color: '#818cf8',
            fontSize: 13,
            cursor: 'pointer',
            fontWeight: 500,
          }}>
            + Nueva flota para este corredor
          </button>
        </div>
      </div>

      <p style={{ marginTop: 16, fontSize: 12, color: 'rgba(255,255,255,0.2)', textAlign: 'center' }}>
        Las flotas asociadas no se eliminarán si se elimina el corredor, solo perderán la referencia.
      </p>
    </div>
  );
}

// ─── Tarjeta de corredor ───────────────────────────────────────────────────────

function CorredorCard({
  corredor,
  numFlotas,
  onEditar,
  onVer,
}: {
  corredor: Corredor;
  numFlotas: number;
  onEditar: () => void;
  onVer: () => void;
}) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 12,
      padding: '16px 20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      transition: 'border-color 0.15s',
    }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.35)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 15 }}>
            {corredor.nombre}
          </span>
          <span style={{
            fontSize: 12, fontWeight: 700,
            color: '#818cf8',
            background: 'rgba(99,102,241,0.12)',
            border: '1px solid rgba(99,102,241,0.25)',
            borderRadius: 20,
            padding: '2px 8px',
          }}>
            {corredor.porcentajeComision}%
          </span>
          <span style={{
            fontSize: 12,
            color: 'rgba(255,255,255,0.35)',
            background: 'rgba(255,255,255,0.05)',
            borderRadius: 20,
            padding: '2px 8px',
          }}>
            {numFlotas} {numFlotas === 1 ? 'flota' : 'flotas'}
          </span>
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', display: 'flex', gap: 12 }}>
          {corredor.email && <span>{corredor.email}</span>}
          {corredor.telefono && <span>{corredor.telefono}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button onClick={onEditar} style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 7,
          padding: '6px 12px',
          color: 'rgba(255,255,255,0.6)',
          fontSize: 12,
          cursor: 'pointer',
          fontWeight: 500,
        }}>
          Editar
        </button>
        <button onClick={onVer} style={{
          background: 'rgba(99,102,241,0.12)',
          border: '1px solid rgba(99,102,241,0.25)',
          borderRadius: 7,
          padding: '6px 12px',
          color: '#818cf8',
          fontSize: 12,
          cursor: 'pointer',
          fontWeight: 500,
        }}>
          Ver →
        </button>
      </div>
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────

export default function CorredoresPage() {
  const router = useRouter();
  const [corredores, setCorredores] = useState<Corredor[]>([]);
  const [carpetas, setCarpetas] = useState<FlotaCarpeta[]>([]);
  const [vista, setVista] = useState<Vista>('lista');
  const [corredorDetalle, setCorredorDetalle] = useState<Corredor | null>(null);
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [corredorEditar, setCorredorEditar] = useState<Corredor | null>(null);

  const cargar = useCallback(() => {
    setCorredores(listarCorredores());
    setCarpetas(listarCarpetas());
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  function numFlotasDe(id: string) {
    return carpetas.filter(c => c.corredor_id === id).length;
  }

  function flotasDe(id: string): FlotaCarpeta[] {
    return carpetas.filter(c => c.corredor_id === id);
  }

  function abrirPanel(corredor: Corredor | null) {
    setCorredorEditar(corredor);
    setPanelAbierto(true);
  }

  function cerrarPanel() {
    setPanelAbierto(false);
    setCorredorEditar(null);
  }

  function handleSave(c: Corredor) {
    cerrarPanel();
    // Si estábamos en detalle, actualizar corredor detalle
    if (corredorDetalle?.id === c.id) setCorredorDetalle(c);
    cargar();
  }

  function handleVerDetalle(c: Corredor) {
    setCorredorDetalle(c);
    setVista('detalle');
  }

  function handleEliminar() {
    if (!corredorDetalle) return;
    eliminarCorredor(corredorDetalle.id);
    setVista('lista');
    setCorredorDetalle(null);
    cargar();
  }

  function handleNuevaFlota() {
    if (!corredorDetalle) return;
    crearCarpeta('', corredorDetalle.id);
    router.push('/flotas');
  }

  return (
    <div style={{
      minHeight: '100vh',
      padding: '32px 40px',
      color: '#e2e8f0',
      fontFamily: 'inherit',
    }}>
      {vista === 'lista' ? (
        <>
          {/* Header lista */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 32,
          }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#e2e8f0' }}>
                Corredores
              </h1>
              <p style={{ margin: '4px 0 0', fontSize: 14, color: 'rgba(255,255,255,0.35)' }}>
                {corredores.length} {corredores.length === 1 ? 'corredor registrado' : 'corredores registrados'}
              </p>
            </div>
            <button
              onClick={() => abrirPanel(null)}
              style={{
                background: '#6366f1',
                border: 'none',
                borderRadius: 10,
                padding: '10px 20px',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              + Nuevo
            </button>
          </div>

          {/* Lista */}
          {corredores.length === 0 ? (
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px dashed rgba(255,255,255,0.1)',
              borderRadius: 16,
              padding: '60px 40px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>🏢</div>
              <p style={{ margin: 0, color: 'rgba(255,255,255,0.25)', fontSize: 14 }}>
                Sin corredores. Crea el primero.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {corredores.map(c => (
                <CorredorCard
                  key={c.id}
                  corredor={c}
                  numFlotas={numFlotasDe(c.id)}
                  onEditar={() => abrirPanel(c)}
                  onVer={() => handleVerDetalle(c)}
                />
              ))}
            </div>
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
          />
        )
      )}

      {/* Panel lateral */}
      {panelAbierto && (
        <PanelCorredor
          corredor={corredorEditar}
          onClose={cerrarPanel}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
