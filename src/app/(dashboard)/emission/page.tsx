"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface Cobertura {
  nombre: string;
  prima: number;
}

interface FlotaHistorica {
  id: string;
  nombre: string;
  estado: 'CONTRATADA' | 'RECHAZADA';
  tomador: string;
  cif: string;
  actividad: string;
  corredor_nombre: string;
  comision: number;
  coberturas: Cobertura[];
  prima_total: number;
  fecha_inicio: string;
  fecha_vencimiento: string;
  periodicidad: string;
  num_poliza: string;
  compania: string;
  total_vehiculos: number;
  categoria_flota: string;
  notas: string;
  created_by: string;
  created_at: string;
}

const EMPTY_FORM: Omit<FlotaHistorica, 'id' | 'created_at' | 'created_by'> = {
  nombre: '', estado: 'CONTRATADA', tomador: '', cif: '', actividad: '',
  corredor_nombre: '', comision: 0, coberturas: [], prima_total: 0,
  fecha_inicio: '', fecha_vencimiento: '', periodicidad: 'anual',
  num_poliza: '', compania: '', total_vehiculos: 0, categoria_flota: '', notas: '',
};

// ─── Estilos ─────────────────────────────────────────────────────────────────

const glass: React.CSSProperties = {
  background: 'rgba(12, 28, 82, 0.75)',
  border: '1px solid rgba(61, 112, 255, 0.22)',
  borderRadius: 22,
  boxShadow: '0 30px 80px -20px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.06) inset',
};

const inputStyle: React.CSSProperties = {
  fontSize: 13, padding: '9px 12px', borderRadius: 10,
  background: 'rgba(6,14,50,0.6)', border: '1px solid rgba(51,102,255,0.2)',
  color: '#FFFFFF', outline: 'none', width: '100%',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: 'rgba(178,198,245,0.6)',
  textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5, display: 'block',
};

const ESTADO_CFG = {
  CONTRATADA: { bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.35)', color: '#10b981' },
  RECHAZADA:  { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)',   color: '#ef4444' },
};

const fmtE = (n: number) =>
  n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

// ─── Hook de datos ───────────────────────────────────────────────────────────

function useFlotasHistoricas() {
  const [flotas, setFlotas]   = useState<FlotaHistorica[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res  = await fetch('/api/flotas/historicas');
      const data = await res.json();
      setFlotas(Array.isArray(data) ? data : []);
    } catch { setFlotas([]); }
    finally   { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async (body: typeof EMPTY_FORM & { created_by: string }) => {
    const res = await fetch('/api/flotas/historicas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('Error al crear');
    await load();
  };

  const update = async (id: string, body: typeof EMPTY_FORM) => {
    const res = await fetch(`/api/flotas/historicas/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('Error al actualizar');
    await load();
  };

  const remove = async (id: string) => {
    const res = await fetch(`/api/flotas/historicas/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Error al eliminar');
    await load();
  };

  return { flotas, loading, load, create, update, remove };
}

// ─── Formulario ──────────────────────────────────────────────────────────────

function FlotaForm({
  initial, onSave, onCancel, saving,
}: {
  initial?: FlotaHistorica;
  onSave: (data: typeof EMPTY_FORM) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<typeof EMPTY_FORM>(
    initial ? {
      nombre: initial.nombre, estado: initial.estado, tomador: initial.tomador,
      cif: initial.cif, actividad: initial.actividad, corredor_nombre: initial.corredor_nombre,
      comision: initial.comision, coberturas: [...initial.coberturas],
      prima_total: initial.prima_total, fecha_inicio: initial.fecha_inicio,
      fecha_vencimiento: initial.fecha_vencimiento, periodicidad: initial.periodicidad,
      num_poliza: initial.num_poliza, compania: initial.compania,
      total_vehiculos: initial.total_vehiculos, categoria_flota: initial.categoria_flota,
      notas: initial.notas,
    } : { ...EMPTY_FORM, coberturas: [] }
  );

  const set = (k: keyof typeof EMPTY_FORM, v: unknown) =>
    setForm(f => ({ ...f, [k]: v }));

  const addCob = () =>
    setForm(f => ({ ...f, coberturas: [...f.coberturas, { nombre: '', prima: 0 }] }));

  const setCob = (i: number, k: keyof Cobertura, v: string | number) =>
    setForm(f => {
      const cobs = [...f.coberturas];
      cobs[i] = { ...cobs[i], [k]: v };
      return { ...f, coberturas: cobs };
    });

  const removeCob = (i: number) =>
    setForm(f => ({ ...f, coberturas: f.coberturas.filter((_, idx) => idx !== i) }));

  const primaAuto = form.coberturas.reduce((s, c) => s + (Number(c.prima) || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Fila 1: nombre + estado */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12 }}>
        <div>
          <label style={labelStyle}>Nombre de la flota *</label>
          <input style={inputStyle} value={form.nombre}
            onChange={e => set('nombre', e.target.value)} placeholder="Ej: Flota Transporte García 2022" />
        </div>
        <div>
          <label style={labelStyle}>Estado</label>
          <select style={{ ...inputStyle, cursor: 'pointer', width: 160 }}
            value={form.estado}
            onChange={e => set('estado', e.target.value as 'CONTRATADA' | 'RECHAZADA')}>
            <option value="CONTRATADA">Contratada</option>
            <option value="RECHAZADA">Rechazada</option>
          </select>
        </div>
      </div>

      {/* Fila 2: tomador + CIF + actividad */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle}>Tomador *</label>
          <input style={inputStyle} value={form.tomador}
            onChange={e => set('tomador', e.target.value)} placeholder="Nombre del tomador" />
        </div>
        <div>
          <label style={labelStyle}>CIF / NIF</label>
          <input style={inputStyle} value={form.cif}
            onChange={e => set('cif', e.target.value.toUpperCase())} placeholder="B12345678" />
        </div>
        <div>
          <label style={labelStyle}>Actividad</label>
          <input style={inputStyle} value={form.actividad}
            onChange={e => set('actividad', e.target.value)} placeholder="Ej: Transporte de mercancías" />
        </div>
      </div>

      {/* Fila 3: corredor + comisión */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle}>Corredor</label>
          <input style={inputStyle} value={form.corredor_nombre}
            onChange={e => set('corredor_nombre', e.target.value)} placeholder="Nombre del corredor" />
        </div>
        <div>
          <label style={labelStyle}>Comisión (%)</label>
          <input style={{ ...inputStyle, fontFamily: 'monospace' }} type="number" step="0.1"
            value={form.comision || ''} onChange={e => set('comision', parseFloat(e.target.value) || 0)}
            placeholder="0.0" />
        </div>
      </div>

      {/* Fila 4: compañía + nº póliza + periodicidad */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle}>Compañía aseguradora</label>
          <input style={inputStyle} value={form.compania}
            onChange={e => set('compania', e.target.value)} placeholder="Ej: Mapfre Empresas" />
        </div>
        <div>
          <label style={labelStyle}>Nº póliza</label>
          <input style={{ ...inputStyle, fontFamily: 'monospace' }} value={form.num_poliza}
            onChange={e => set('num_poliza', e.target.value)} placeholder="0000000000" />
        </div>
        <div>
          <label style={labelStyle}>Periodicidad</label>
          <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.periodicidad}
            onChange={e => set('periodicidad', e.target.value)}>
            <option value="mensual">Mensual</option>
            <option value="trimestral">Trimestral</option>
            <option value="semestral">Semestral</option>
            <option value="anual">Anual</option>
          </select>
        </div>
      </div>

      {/* Fila 5: fechas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle}>Fecha inicio</label>
          <input style={inputStyle} type="date" value={form.fecha_inicio}
            onChange={e => set('fecha_inicio', e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Fecha vencimiento</label>
          <input style={inputStyle} type="date" value={form.fecha_vencimiento}
            onChange={e => set('fecha_vencimiento', e.target.value)} />
        </div>
      </div>

      {/* Fila 6: vehículos + categoría */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle}>Total vehículos (aprox.)</label>
          <input style={{ ...inputStyle, fontFamily: 'monospace' }} type="number" min="0"
            value={form.total_vehiculos || ''} onChange={e => set('total_vehiculos', parseInt(e.target.value) || 0)}
            placeholder="0" />
        </div>
        <div>
          <label style={labelStyle}>Categoría flota</label>
          <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.categoria_flota}
            onChange={e => set('categoria_flota', e.target.value)}>
            <option value="">Sin especificar</option>
            <option value="1ª Categoría">1ª Categoría (turismos, furgonetas)</option>
            <option value="2ª Categoría">2ª Categoría (camiones, tractoras)</option>
            <option value="3ª Categoría">3ª Categoría (motos, ciclomotores)</option>
            <option value="Mixta">Mixta</option>
          </select>
        </div>
      </div>

      {/* Coberturas */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <label style={{ ...labelStyle, margin: 0 }}>Coberturas y primas</label>
          <button onClick={addCob} style={{
            fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 8,
            background: 'rgba(51,102,255,0.15)', color: '#3366FF',
            border: '1px solid rgba(51,102,255,0.3)', cursor: 'pointer',
          }}>+ Añadir cobertura</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {form.coberturas.length === 0 && (
            <div style={{ fontSize: 12, color: 'rgba(178,198,245,0.4)', padding: '12px 0' }}>
              Sin coberturas. Añade al menos una.
            </div>
          )}
          {form.coberturas.map((cob, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 32px', gap: 8, alignItems: 'center' }}>
              <input style={inputStyle} value={cob.nombre}
                onChange={e => setCob(i, 'nombre', e.target.value)} placeholder="Ej: Terceros ampliado" />
              <input style={{ ...inputStyle, fontFamily: 'monospace', textAlign: 'right' }} type="number" step="0.01"
                value={cob.prima || ''} onChange={e => setCob(i, 'prima', parseFloat(e.target.value) || 0)}
                placeholder="Prima €" />
              <button onClick={() => removeCob(i)} style={{
                width: 32, height: 36, borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)',
                background: 'rgba(239,68,68,0.08)', color: '#ef4444', cursor: 'pointer', fontSize: 14,
              }}>×</button>
            </div>
          ))}
          {form.coberturas.length > 0 && (
            <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 800, color: '#10b981', marginTop: 2 }}>
              Prima total auto: {fmtE(primaAuto)}
            </div>
          )}
        </div>
      </div>

      {/* Prima total (override) */}
      <div>
        <label style={labelStyle}>Prima total anual (€)</label>
        <input style={{ ...inputStyle, fontFamily: 'monospace' }} type="number" step="0.01"
          value={form.prima_total || ''} onChange={e => set('prima_total', parseFloat(e.target.value) || 0)}
          placeholder={primaAuto > 0 ? String(primaAuto) : '0.00'} />
        {primaAuto > 0 && form.prima_total === 0 && (
          <span style={{ fontSize: 11, color: 'rgba(178,198,245,0.5)', marginTop: 4, display: 'block' }}>
            Si lo dejas en 0 se usará la suma de coberturas ({fmtE(primaAuto)})
          </span>
        )}
      </div>

      {/* Notas */}
      <div>
        <label style={labelStyle}>Notas / observaciones</label>
        <textarea style={{ ...inputStyle, minHeight: 72, resize: 'vertical' } as React.CSSProperties}
          value={form.notas} onChange={e => set('notas', e.target.value)}
          placeholder="Observaciones adicionales..." />
      </div>

      {/* Botones */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
        <button onClick={onCancel} disabled={saving} style={{
          fontSize: 13, fontWeight: 700, padding: '10px 22px', borderRadius: 12,
          background: 'transparent', color: 'rgba(178,198,245,0.7)',
          border: '1px solid rgba(61,112,255,0.2)', cursor: 'pointer',
        }}>Cancelar</button>
        <button onClick={() => onSave({ ...form, prima_total: form.prima_total || primaAuto })}
          disabled={saving || !form.nombre.trim() || !form.tomador.trim()} style={{
            fontSize: 13, fontWeight: 800, padding: '10px 28px', borderRadius: 12,
            background: 'linear-gradient(135deg, #1240CC, #3366FF)',
            color: '#fff', border: 'none', cursor: 'pointer',
            opacity: (!form.nombre.trim() || !form.tomador.trim()) ? 0.5 : 1,
            boxShadow: '0 8px 24px -8px rgba(18,64,204,0.5)',
          }}>
          {saving ? 'Guardando...' : (initial ? 'Guardar cambios' : 'Crear flota')}
        </button>
      </div>
    </div>
  );
}

// ─── Modal ficha de póliza ────────────────────────────────────────────────────

function FichaPoliza({ flota, onClose, onEdit, onDelete }: {
  flota: FlotaHistorica;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const cfg  = ESTADO_CFG[flota.estado] ?? ESTADO_CFG.CONTRATADA;
  const fmt  = (d: string) => d ? new Date(d + 'T12:00:00').toLocaleDateString('es-ES') : '—';
  const prima = flota.prima_total ||
    flota.coberturas.reduce((s, c) => s + (Number(c.prima) || 0), 0);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,8,0.7)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }} onClick={onClose}>
      <div style={{
        ...glass, width: '100%', maxWidth: 720, maxHeight: '90vh',
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          padding: '22px 28px', borderBottom: '1px solid rgba(61,112,255,0.15)',
          display: 'flex', alignItems: 'flex-start', gap: 16,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <h2 style={{ fontSize: 17, fontWeight: 900, color: '#FFFFFF', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {flota.nombre}
              </h2>
              <span style={{
                fontSize: 9, fontWeight: 800, padding: '3px 10px', borderRadius: 6,
                background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color,
                textTransform: 'uppercase', letterSpacing: '0.07em',
              }}>{flota.estado}</span>
            </div>
            <div style={{ fontSize: 12, color: 'rgba(178,198,245,0.6)' }}>
              {flota.tomador}{flota.cif && <> · <span style={{ fontFamily: 'monospace', color: '#BDD4FF' }}>{flota.cif}</span></>}
              {flota.actividad && <> · {flota.actividad}</>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onEdit} style={{
              fontSize: 11, fontWeight: 700, padding: '7px 14px', borderRadius: 10,
              background: 'rgba(51,102,255,0.15)', color: '#3366FF',
              border: '1px solid rgba(51,102,255,0.3)', cursor: 'pointer',
            }}>Editar</button>
            <button onClick={onClose} style={{
              width: 32, height: 32, borderRadius: 10, border: '1px solid rgba(61,112,255,0.2)',
              background: 'rgba(6,14,50,0.5)', color: '#BDD4FF', cursor: 'pointer', fontSize: 16,
            }}>×</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 20 }} className="custom-scrollbar">

          {/* Grid info principal */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            {[
              { label: 'Corredor',     value: flota.corredor_nombre || '—' },
              { label: 'Comisión',     value: flota.comision ? `${flota.comision}%` : '—' },
              { label: 'Compañía',     value: flota.compania || '—' },
              { label: 'Nº póliza',    value: flota.num_poliza || '—', mono: true },
              { label: 'Periodicidad', value: flota.periodicidad || '—' },
              { label: 'Categoría',    value: flota.categoria_flota || '—' },
              { label: 'Fecha inicio', value: fmt(flota.fecha_inicio) },
              { label: 'Vencimiento',  value: fmt(flota.fecha_vencimiento) },
              { label: 'Vehículos',    value: flota.total_vehiculos ? `≈ ${flota.total_vehiculos.toLocaleString('es-ES')}` : '—' },
            ].map(({ label, value, mono }) => (
              <div key={label} style={{
                padding: '12px 16px', borderRadius: 12,
                background: 'rgba(6,14,50,0.5)', border: '1px solid rgba(51,102,255,0.1)',
              }}>
                <div style={labelStyle}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF', fontFamily: mono ? 'monospace' : 'inherit' }}>
                  {value}
                </div>
              </div>
            ))}
          </div>

          {/* Coberturas */}
          {flota.coberturas.length > 0 && (
            <div>
              <div style={{ ...labelStyle, marginBottom: 10 }}>Coberturas contratadas</div>
              <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(51,102,255,0.12)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'rgba(6,14,50,0.6)' }}>
                      <th style={{ ...labelStyle, padding: '10px 16px', margin: 0, borderBottom: '1px solid rgba(51,102,255,0.12)' }}>
                        Cobertura
                      </th>
                      <th style={{ ...labelStyle, padding: '10px 16px', margin: 0, textAlign: 'right', borderBottom: '1px solid rgba(51,102,255,0.12)' }}>
                        Prima anual
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {flota.coberturas.map((cob, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(51,102,255,0.07)' }}>
                        <td style={{ padding: '10px 16px', fontSize: 13, color: '#BDD4FF' }}>{cob.nombre}</td>
                        <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 700, color: '#FFFFFF', textAlign: 'right', fontFamily: 'monospace' }}>
                          {fmtE(Number(cob.prima) || 0)}
                        </td>
                      </tr>
                    ))}
                    <tr style={{ background: 'rgba(16,185,129,0.06)' }}>
                      <td style={{ padding: '10px 16px', fontSize: 12, fontWeight: 800, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Prima total
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 15, fontWeight: 900, color: '#10b981', textAlign: 'right', fontFamily: 'monospace' }}>
                        {fmtE(prima)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {flota.coberturas.length === 0 && prima > 0 && (
            <div style={{ padding: '14px 18px', borderRadius: 12, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
              <span style={{ fontSize: 11, color: 'rgba(178,198,245,0.6)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>Prima total · </span>
              <span style={{ fontSize: 16, fontWeight: 900, color: '#10b981', fontFamily: 'monospace' }}>{fmtE(prima)}</span>
            </div>
          )}

          {/* Notas */}
          {flota.notas && (
            <div style={{ padding: '14px 18px', borderRadius: 12, background: 'rgba(6,14,50,0.4)', border: '1px solid rgba(51,102,255,0.1)' }}>
              <div style={{ ...labelStyle, marginBottom: 6 }}>Notas</div>
              <p style={{ fontSize: 13, color: 'rgba(178,198,245,0.8)', margin: 0, lineHeight: 1.6 }}>{flota.notas}</p>
            </div>
          )}

          {/* Zona peligro */}
          <div style={{ paddingTop: 4, borderTop: '1px solid rgba(239,68,68,0.1)' }}>
            <button onClick={onDelete} style={{
              fontSize: 11, fontWeight: 700, padding: '8px 16px', borderRadius: 10,
              background: 'rgba(239,68,68,0.08)', color: '#ef4444',
              border: '1px solid rgba(239,68,68,0.2)', cursor: 'pointer',
            }}>Eliminar flota</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function FlotasPage() {
  const { user } = useAuth();
  const { flotas, loading, create, update, remove } = useFlotasHistoricas();

  const [tab, setTab]           = useState<'CONTRATADA' | 'RECHAZADA'>('CONTRATADA');
  const [modal, setModal]       = useState<'create' | 'edit' | null>(null);
  const [selected, setSelected] = useState<FlotaHistorica | null>(null);
  const [ficha, setFicha]       = useState<FlotaHistorica | null>(null);
  const [saving, setSaving]     = useState(false);
  const [toast, setToast]       = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2200); };

  const filtered = flotas.filter(f => f.estado === tab);

  const handleCreate = async (data: typeof EMPTY_FORM) => {
    setSaving(true);
    try {
      await create({ ...data, created_by: user ?? '' });
      setModal(null);
      showToast('Flota creada correctamente');
    } catch { showToast('Error al crear la flota'); }
    finally { setSaving(false); }
  };

  const handleUpdate = async (data: typeof EMPTY_FORM) => {
    if (!selected) return;
    setSaving(true);
    try {
      await update(selected.id, data);
      setModal(null);
      setFicha(null);
      setSelected(null);
      showToast('Flota actualizada');
    } catch { showToast('Error al actualizar'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!ficha) return;
    if (!confirm(`¿Eliminar "${ficha.nombre}"? Esta acción no se puede deshacer.`)) return;
    try {
      await remove(ficha.id);
      setFicha(null);
      showToast('Flota eliminada');
    } catch { showToast('Error al eliminar'); }
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar animate-in fade-in duration-500">
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Header */}
        <div style={{ ...glass, padding: '20px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 4, height: 36, borderRadius: 2, background: 'linear-gradient(180deg, #3366FF 0%, #1240CC 100%)' }} />
              <div>
                <h1 style={{ fontSize: 15, fontWeight: 900, color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
                  Flotas
                </h1>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(178,198,245,0.6)', margin: '4px 0 0 0' }}>
                  Portfolio histórico · {flotas.length} {flotas.length === 1 ? 'flota' : 'flotas'} registradas
                </p>
              </div>
            </div>
            <button onClick={() => { setSelected(null); setModal('create'); }} style={{
              fontSize: 12, fontWeight: 800, padding: '10px 20px', borderRadius: 12,
              background: 'linear-gradient(135deg, #1240CC, #3366FF)',
              color: '#fff', border: 'none', cursor: 'pointer',
              boxShadow: '0 8px 24px -8px rgba(18,64,204,0.4)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Nueva flota
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginTop: 16, borderTop: '1px solid rgba(61,112,255,0.12)', paddingTop: 14 }}>
            {(['CONTRATADA', 'RECHAZADA'] as const).map(t => {
              const count  = flotas.filter(f => f.estado === t).length;
              const active = tab === t;
              const cfg    = ESTADO_CFG[t];
              return (
                <button key={t} onClick={() => setTab(t)} style={{
                  fontSize: 12, fontWeight: 700, padding: '8px 18px', borderRadius: 10,
                  cursor: 'pointer', border: 'none',
                  background: active ? cfg.bg : 'transparent',
                  color: active ? cfg.color : 'rgba(178,198,245,0.55)',
                  boxShadow: active ? `0 0 0 1px ${cfg.border} inset` : 'none',
                  transition: 'all 180ms',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  {t.charAt(0) + t.slice(1).toLowerCase()}
                  <span style={{
                    fontSize: 10, fontWeight: 800, padding: '1px 7px', borderRadius: 999,
                    background: active ? cfg.border : 'rgba(51,102,255,0.1)',
                    color: active ? cfg.color : 'rgba(178,198,245,0.5)',
                  }}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Formulario de creación/edición */}
        {modal && (
          <div style={{ ...glass, padding: '24px 28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{ width: 3, height: 24, borderRadius: 2, background: '#3366FF' }} />
              <h2 style={{ fontSize: 14, fontWeight: 800, color: '#FFFFFF', margin: 0, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                {modal === 'create' ? 'Nueva flota histórica' : `Editar — ${selected?.nombre}`}
              </h2>
            </div>
            <FlotaForm
              initial={modal === 'edit' ? selected ?? undefined : undefined}
              onSave={modal === 'create' ? handleCreate : handleUpdate}
              onCancel={() => { setModal(null); setSelected(null); }}
              saving={saving}
            />
          </div>
        )}

        {/* Lista de flotas */}
        {loading ? (
          <div style={{ ...glass, padding: '60px 40px', textAlign: 'center' }}>
            <p style={{ color: 'rgba(178,198,245,0.5)', fontSize: 13, margin: 0 }}>Cargando...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ ...glass, padding: '60px 40px', textAlign: 'center' }}>
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="rgba(178,198,245,0.2)" strokeWidth="1.5" style={{ margin: '0 auto 16px' }}>
              <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#BDD4FF', margin: '0 0 8px 0' }}>
              No hay flotas {tab === 'CONTRATADA' ? 'contratadas' : 'rechazadas'}
            </p>
            <p style={{ fontSize: 12, color: 'rgba(178,198,245,0.45)', margin: 0 }}>
              Usa el botón <strong style={{ color: '#3366FF' }}>Nueva flota</strong> para añadir tu portfolio histórico.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(f => {
              const cfg   = ESTADO_CFG[f.estado] ?? ESTADO_CFG.CONTRATADA;
              const prima = f.prima_total || f.coberturas.reduce((s, c) => s + (Number(c.prima) || 0), 0);
              const fmt   = (d: string) => d ? new Date(d + 'T12:00:00').toLocaleDateString('es-ES') : null;

              return (
                <button key={f.id} onClick={() => setFicha(f)} style={{
                  ...glass, padding: '16px 22px', cursor: 'pointer', textAlign: 'left', width: '100%',
                  transition: 'border-color 0.15s',
                }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(70,120,255,0.5)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(61,112,255,0.22)')}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: '#FFFFFF' }}>{f.nombre}</span>
                        <span style={{
                          fontSize: 8, fontWeight: 800, padding: '2px 8px', borderRadius: 5,
                          background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color,
                          textTransform: 'uppercase', letterSpacing: '0.07em', flexShrink: 0,
                        }}>{f.estado}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'rgba(178,198,245,0.55)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        {f.tomador && <span>{f.tomador}{f.cif && <> · <span style={{ fontFamily: 'monospace', color: '#8BA3D9' }}>{f.cif}</span></>}</span>}
                        {f.corredor_nombre && <span>Corredor: <span style={{ color: '#BDD4FF' }}>{f.corredor_nombre}</span></span>}
                        {f.compania && <span>{f.compania}</span>}
                        {fmt(f.fecha_vencimiento) && <span>Vcto: <span style={{ color: '#BDD4FF' }}>{fmt(f.fecha_vencimiento)}</span></span>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      {prima > 0 && (
                        <div style={{ fontSize: 16, fontWeight: 900, color: '#10b981', fontFamily: 'monospace' }}>
                          {fmtE(prima)}
                        </div>
                      )}
                      {f.coberturas.length > 0 && (
                        <div style={{ fontSize: 10, color: 'rgba(178,198,245,0.45)', marginTop: 2 }}>
                          {f.coberturas.length} cobertura{f.coberturas.length > 1 ? 's' : ''}
                        </div>
                      )}
                      {f.total_vehiculos > 0 && (
                        <div style={{ fontSize: 10, color: 'rgba(178,198,245,0.45)', marginTop: 1 }}>
                          ≈{f.total_vehiculos.toLocaleString('es-ES')} veh.
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal ficha */}
      {ficha && (
        <FichaPoliza
          flota={ficha}
          onClose={() => setFicha(null)}
          onEdit={() => { setSelected(ficha); setFicha(null); setModal('edit'); }}
          onDelete={handleDelete}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(16,185,129,0.95)', color: '#fff', padding: '10px 24px',
          borderRadius: 10, fontSize: 13, fontWeight: 700, zIndex: 9999,
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        }}>{toast}</div>
      )}
    </div>
  );
}
