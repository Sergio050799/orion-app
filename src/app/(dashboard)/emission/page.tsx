"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import type { FlotaCarpeta } from '@/core/flotas';
import { guardarCarpeta } from '@/core/flotas';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface Cobertura { nombre: string; prima: number; }

type EstadoFlota = 'CONTRATADA' | 'RECHAZADA' | 'EN ESTUDIO' | 'OFERTADA';

interface FlotaHistorica {
  id: string; nombre: string; estado: EstadoFlota;
  tomador: string; cif: string; actividad: string;
  corredor_nombre: string; comision: number; coberturas: Cobertura[];
  prima_total: number; fecha_inicio: string; fecha_vencimiento: string;
  periodicidad: string; num_poliza: string; compania: string;
  total_vehiculos: number; categoria_flota: string; notas: string;
  created_by: string; created_at: string;
}

interface Corredor { id: string; nombre: string; comision?: number; }

interface FlotaView {
  id: string;
  origen: 'orion' | 'historica';
  nombre: string;
  estado: EstadoFlota;
  tomador: string; cif: string; actividad: string;
  corredor_nombre: string; comision: number;
  formaPago: string;
  coberturas: Cobertura[];
  prima_total: number;
  prima_mmt?: number;
  prima_cliente?: number;
  fecha_inicio: string; fecha_vencimiento: string; periodicidad: string;
  num_poliza: string; compania: string;
  total_vehiculos: number; categoria_flota: string; notas: string;
  raw_historica?: FlotaHistorica;
  raw_carpeta?: FlotaCarpeta;
}

const EMPTY_FORM: Omit<FlotaHistorica, 'id' | 'created_at' | 'created_by'> = {
  nombre: '', estado: 'CONTRATADA', tomador: '', cif: '', actividad: '',
  corredor_nombre: '', comision: 0, coberturas: [], prima_total: 0,
  fecha_inicio: '', fecha_vencimiento: '', periodicidad: 'anual',
  num_poliza: '', compania: '', total_vehiculos: 0, categoria_flota: '', notas: '',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractCoberturas(oferta: Record<string, string>[]): Cobertura[] {
  const map = new Map<string, number>();
  for (const row of oferta) {
    const cob   = row['coberturas']?.trim();
    const prima = parseFloat(row['oferta_prima_mmt'] ?? '') || 0;
    if (cob) map.set(cob, (map.get(cob) ?? 0) + prima);
  }
  return Array.from(map.entries()).map(([nombre, prima]) => ({ nombre, prima }));
}

function normalizarCarpeta(c: FlotaCarpeta, corredoresMap: Map<string, Corredor>): FlotaView | null {
  if (c.estado === 'EN ESTUDIO') return null;
  const cor     = c.corredor_id ? corredoresMap.get(c.corredor_id) : undefined;
  const oferta  = c.oferta ?? [];
  const primaMmt = oferta.reduce((s, r) => s + (parseFloat(r['oferta_prima_mmt'] ?? '') || 0), 0);
  const primaFinal = c.descuentoOferta && primaMmt > 0
    ? primaMmt * (1 - c.descuentoOferta / 100) : primaMmt;
  return {
    id: c.id, origen: 'orion', nombre: c.nombre,
    estado: c.estado as EstadoFlota,
    tomador: c.header?.tomador ?? '', cif: c.header?.cif ?? '',
    actividad: c.header?.actividad ?? '',
    corredor_nombre: cor?.nombre ?? '',
    comision: c.porcentajeComision ?? cor?.comision ?? 0,
    formaPago: c.header?.formaPago ?? '',
    coberturas: extractCoberturas(oferta),
    prima_total: primaFinal,
    prima_mmt: primaMmt > 0 ? primaMmt : undefined,
    prima_cliente: c.primaClienteTotal && c.primaClienteTotal > 0 ? c.primaClienteTotal : undefined,
    fecha_inicio: c.header?.fechaInicio ?? '',
    fecha_vencimiento: c.header?.fechaVencimiento ?? '',
    periodicidad: c.header?.periodicidad ?? '',
    num_poliza: c.header?.polizaActual ?? '',
    compania: c.header?.ciaActual ?? '',
    total_vehiculos: (c.trabajo?.length || c.original?.length) ?? 0,
    categoria_flota: c.header?.categoria ?? '',
    notas: c.observaciones ?? '',
    raw_carpeta: c,
  };
}

function normalizarHistorica(h: FlotaHistorica): FlotaView {
  const prima = h.prima_total || (h.coberturas ?? []).reduce((s, c) => s + (Number(c.prima) || 0), 0);
  const estado: EstadoFlota = (h.estado as string) === 'COTIZADA' ? 'OFERTADA' : (h.estado as EstadoFlota);
  return {
    id: h.id, origen: 'historica', nombre: h.nombre, estado,
    tomador: h.tomador ?? '', cif: h.cif ?? '', actividad: h.actividad ?? '',
    corredor_nombre: h.corredor_nombre ?? '', comision: h.comision ?? 0,
    formaPago: '',
    coberturas: h.coberturas ?? [], prima_total: prima,
    fecha_inicio: h.fecha_inicio ?? '', fecha_vencimiento: h.fecha_vencimiento ?? '',
    periodicidad: h.periodicidad ?? '', num_poliza: h.num_poliza ?? '', compania: h.compania ?? '',
    total_vehiculos: h.total_vehiculos ?? 0, categoria_flota: h.categoria_flota ?? '',
    notas: h.notas ?? '', raw_historica: h,
  };
}

// ─── Estilos ─────────────────────────────────────────────────────────────────

const glass: React.CSSProperties = {
  background: 'rgba(12, 28, 82, 0.75)', border: '1px solid rgba(61, 112, 255, 0.22)',
  borderRadius: 22, boxShadow: '0 30px 80px -20px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.06) inset',
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
const ESTADO_CFG: Record<EstadoFlota, { bg: string; border: string; color: string }> = {
  CONTRATADA:   { bg: 'rgba(16,140,90,0.12)',   border: 'rgba(20,160,100,0.28)',  color: '#2bb589' },
  RECHAZADA:    { bg: 'rgba(180,40,40,0.10)',   border: 'rgba(200,60,60,0.25)',   color: '#c45858' },
  'EN ESTUDIO': { bg: 'rgba(90,100,120,0.14)',  border: 'rgba(120,135,158,0.22)', color: 'rgba(185,195,215,0.85)' },
  OFERTADA:     { bg: 'rgba(180,120,20,0.12)',  border: 'rgba(200,145,30,0.28)',  color: '#c9923a' },
};

function toDateInput(s?: string): string {
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const [dd, mm, yyyy] = s.split('/');
    return `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
  }
  const d = new Date(s.includes('T') ? s : s + 'T12:00:00');
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return '';
}

function parseFechaVcto(s?: string): number | null {
  if (!s) return null;
  let d: Date;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const [day, m, y] = s.split('/').map(Number);
    d = new Date(y, m - 1, day);
  } else {
    d = new Date(s.includes('T') ? s : s + 'T12:00:00');
  }
  if (isNaN(d.getTime())) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - today.getTime()) / 86400000);
}

function fmtVcto(s?: string): string {
  if (!s) return '—';
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return s;
  const d = new Date(s.includes('T') ? s : s + 'T12:00:00');
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function vctoColor(dias: number | null): string {
  if (dias === null) return 'rgba(178,198,245,0.55)';
  if (dias < 0)  return '#f87171';
  if (dias < 30) return '#fb923c';
  if (dias < 90) return '#fbbf24';
  return '#34d399';
}
const fmtE = (n: number) =>
  n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const fmtD = (d: string) => d ? new Date(d + (d.includes('T') ? '' : 'T12:00:00')).toLocaleDateString('es-ES') : '—';

// ─── Hook de datos ───────────────────────────────────────────────────────────

function usePortfolio() {
  const [carpetas,   setCarpetas]   = useState<FlotaCarpeta[]>([]);
  const [corredores, setCorredores] = useState<Corredor[]>([]);
  const [loading,    setLoading]    = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rCarp, rCor] = await Promise.all([
        fetch('/api/flotas/carpetas'),
        fetch('/api/flotas/corredores'),
      ]);
      const [dCarp, dCor] = await Promise.all([rCarp.json(), rCor.json()]);
      setCarpetas(Array.isArray(dCarp) ? dCarp : []);
      setCorredores(Array.isArray(dCor) ? dCor : []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const corredoresMap = useMemo(() => {
    const m = new Map<string, Corredor>();
    corredores.forEach(c => m.set(c.id, c));
    return m;
  }, [corredores]);

  const corredoresLista = useMemo(() => {
    return corredores.map(c => c.nombre).sort((a, b) => a.localeCompare(b));
  }, [corredores]);

  const flotas = useMemo<FlotaView[]>(() => {
    return carpetas
      .map(c => normalizarCarpeta(c, corredoresMap))
      .filter((f): f is FlotaView => f !== null)
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [carpetas, corredoresMap]);

  return { flotas, corredoresLista, corredores, loading, reload: load };
}

// ─── Formulario (solo para históricas) ───────────────────────────────────────

function FlotaForm({ initial, onSave, onCancel, saving }: {
  initial?: FlotaHistorica; onSave: (d: typeof EMPTY_FORM) => void;
  onCancel: () => void; saving: boolean;
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

  const set = (k: keyof typeof EMPTY_FORM, v: unknown) => setForm(f => ({ ...f, [k]: v }));
  const addCob = () => setForm(f => ({ ...f, coberturas: [...f.coberturas, { nombre: '', prima: 0 }] }));
  const setCob = (i: number, k: keyof Cobertura, v: string | number) =>
    setForm(f => { const c = [...f.coberturas]; c[i] = { ...c[i], [k]: v }; return { ...f, coberturas: c }; });
  const removeCob = (i: number) => setForm(f => ({ ...f, coberturas: f.coberturas.filter((_, j) => j !== i) }));
  const primaAuto = form.coberturas.reduce((s, c) => s + (Number(c.prima) || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12 }}>
        <div>
          <label style={labelStyle}>Nombre *</label>
          <input style={inputStyle} value={form.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Nombre de la flota" />
        </div>
        <div>
          <label style={labelStyle}>Estado</label>
          <select style={{ ...inputStyle, width: 160, cursor: 'pointer' }} value={form.estado} onChange={e => set('estado', e.target.value as EstadoFlota)}>
            <option value="CONTRATADA">Contratada</option>
            <option value="OFERTADA">Ofertada</option>
            <option value="RECHAZADA">Rechazada</option>
          </select>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
        <div><label style={labelStyle}>Tomador *</label><input style={inputStyle} value={form.tomador} onChange={e => set('tomador', e.target.value)} /></div>
        <div><label style={labelStyle}>CIF / NIF</label><input style={inputStyle} value={form.cif} onChange={e => set('cif', e.target.value.toUpperCase())} /></div>
        <div><label style={labelStyle}>Actividad</label><input style={inputStyle} value={form.actividad} onChange={e => set('actividad', e.target.value)} /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
        <div><label style={labelStyle}>Corredor</label><input style={inputStyle} value={form.corredor_nombre} onChange={e => set('corredor_nombre', e.target.value)} /></div>
        <div><label style={labelStyle}>Comisión (%)</label><input style={{ ...inputStyle, fontFamily: 'monospace' }} type="number" step="0.1" value={form.comision || ''} onChange={e => set('comision', parseFloat(e.target.value) || 0)} /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
        <div><label style={labelStyle}>Compañía</label><input style={inputStyle} value={form.compania} onChange={e => set('compania', e.target.value)} /></div>
        <div><label style={labelStyle}>Nº póliza</label><input style={{ ...inputStyle, fontFamily: 'monospace' }} value={form.num_poliza} onChange={e => set('num_poliza', e.target.value)} /></div>
        <div>
          <label style={labelStyle}>Periodicidad</label>
          <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.periodicidad} onChange={e => set('periodicidad', e.target.value)}>
            <option value="mensual">Mensual</option><option value="trimestral">Trimestral</option>
            <option value="semestral">Semestral</option><option value="anual">Anual</option>
          </select>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><label style={labelStyle}>Fecha inicio</label><input style={inputStyle} type="date" value={form.fecha_inicio} onChange={e => set('fecha_inicio', e.target.value)} /></div>
        <div><label style={labelStyle}>Fecha vencimiento</label><input style={inputStyle} type="date" value={form.fecha_vencimiento} onChange={e => set('fecha_vencimiento', e.target.value)} /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><label style={labelStyle}>Vehículos (aprox.)</label><input style={{ ...inputStyle, fontFamily: 'monospace' }} type="number" min="0" value={form.total_vehiculos || ''} onChange={e => set('total_vehiculos', parseInt(e.target.value) || 0)} /></div>
        <div>
          <label style={labelStyle}>Categoría</label>
          <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.categoria_flota} onChange={e => set('categoria_flota', e.target.value)}>
            <option value="">Sin especificar</option>
            <option value="1ª Categoría">1ª Categoría</option><option value="2ª Categoría">2ª Categoría</option>
            <option value="3ª Categoría">3ª Categoría</option><option value="Mixta">Mixta</option>
          </select>
        </div>
      </div>

      {/* Coberturas */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <label style={{ ...labelStyle, margin: 0 }}>Coberturas</label>
          <button onClick={addCob} style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 8, background: 'rgba(51,102,255,0.15)', color: '#3366FF', border: '1px solid rgba(51,102,255,0.3)', cursor: 'pointer' }}>+ Añadir</button>
        </div>
        {form.coberturas.length === 0 && <p style={{ fontSize: 12, color: 'rgba(178,198,245,0.4)', margin: 0 }}>Sin coberturas.</p>}
        {form.coberturas.map((cob, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 32px', gap: 8, marginBottom: 6 }}>
            <input style={inputStyle} value={cob.nombre} onChange={e => setCob(i, 'nombre', e.target.value)} placeholder="Ej: Terceros ampliado" />
            <input style={{ ...inputStyle, fontFamily: 'monospace', textAlign: 'right' }} type="number" step="0.01" value={cob.prima || ''} onChange={e => setCob(i, 'prima', parseFloat(e.target.value) || 0)} placeholder="Prima €" />
            <button onClick={() => removeCob(i)} style={{ width: 32, height: 36, borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#ef4444', cursor: 'pointer' }}>×</button>
          </div>
        ))}
        {primaAuto > 0 && <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 800, color: '#10b981', marginTop: 4 }}>Suma: {fmtE(primaAuto)}</div>}
      </div>

      <div>
        <label style={labelStyle}>Prima total anual (€) — deja 0 para usar suma</label>
        <input style={{ ...inputStyle, fontFamily: 'monospace' }} type="number" step="0.01" value={form.prima_total || ''} onChange={e => set('prima_total', parseFloat(e.target.value) || 0)} />
      </div>
      <div>
        <label style={labelStyle}>Notas</label>
        <textarea style={{ ...inputStyle, minHeight: 64, resize: 'vertical' } as React.CSSProperties} value={form.notas} onChange={e => set('notas', e.target.value)} />
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
        <button onClick={onCancel} disabled={saving} style={{ fontSize: 13, fontWeight: 700, padding: '10px 22px', borderRadius: 12, background: 'transparent', color: 'rgba(178,198,245,0.7)', border: '1px solid rgba(61,112,255,0.2)', cursor: 'pointer' }}>Cancelar</button>
        <button onClick={() => onSave({ ...form, prima_total: form.prima_total || primaAuto })}
          disabled={saving || !form.nombre.trim() || !form.tomador.trim()}
          style={{ fontSize: 13, fontWeight: 800, padding: '10px 28px', borderRadius: 12, background: 'linear-gradient(135deg, #1240CC, #3366FF)', color: '#fff', border: 'none', cursor: 'pointer', opacity: (!form.nombre.trim() || !form.tomador.trim()) ? 0.5 : 1, boxShadow: '0 8px 24px -8px rgba(18,64,204,0.5)' }}>
          {saving ? 'Guardando...' : (initial ? 'Guardar cambios' : 'Crear flota')}
        </button>
      </div>
    </div>
  );
}

// ─── Constantes edición ───────────────────────────────────────────────────────

const RANGOS_VEH = [
  { value: '',       label: '— Sin especificar' },
  { value: '<100',   label: 'Menos de 100' },
  { value: '100-500',  label: '100 – 500' },
  { value: '500-1000', label: '500 – 1.000' },
  { value: '+1000',  label: 'Más de 1.000' },
];

function rangoLabel(v: string) {
  return RANGOS_VEH.find(r => r.value === v)?.label ?? v;
}

const PERIODOS = ['mensual','trimestral','semestral','anual'];

// ─── Modal Ficha de Póliza ────────────────────────────────────────────────────

function FichaPoliza({ flota, corredores, onClose, onEdit, onDelete, onSaved }: {
  flota: FlotaView; corredores: Corredor[];
  onClose: () => void; onSaved?: () => void;
  onEdit?: () => void; onDelete?: () => void;
}) {
  const [editMode, setEditMode] = useState(false);
  const [saving,   setSaving]   = useState(false);

  const carpeta = flota.raw_carpeta;

  const [form, setForm] = useState({
    corredor_id:    carpeta?.corredor_id ?? '',
    comision:       String(carpeta?.porcentajeComision ?? flota.comision ?? ''),
    compania:       carpeta?.header?.ciaActual ?? flota.compania ?? '',
    poliza:         carpeta?.header?.polizaActual ?? flota.num_poliza ?? '',
    periodicidad:   carpeta?.header?.periodicidad ?? flota.periodicidad ?? '',
    categoria:      carpeta?.header?.categoria ?? flota.categoria_flota ?? '',
    fechaInicio:    toDateInput(carpeta?.header?.fechaInicio ?? flota.fecha_inicio),
    fechaVcto:      toDateInput(carpeta?.header?.fechaVencimiento ?? flota.fecha_vencimiento),
    rangoVehiculos: carpeta?.header?.rangoVehiculos ?? '',
  });
  const setF = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (editMode) setEditMode(false); else onClose(); } };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose, editMode]);

  const handleSave = async () => {
    if (!carpeta) return;
    setSaving(true);
    try {
      const updated: FlotaCarpeta = {
        ...carpeta,
        corredor_id: form.corredor_id || undefined,
        porcentajeComision: parseFloat(form.comision) || undefined,
        header: {
          ...carpeta.header,
          ciaActual:        form.compania,
          polizaActual:     form.poliza,
          periodicidad:     (form.periodicidad as FlotaCarpeta['header']['periodicidad']) || undefined,
          categoria:        form.categoria,
          fechaInicio:      form.fechaInicio,
          fechaVencimiento: form.fechaVcto,
          rangoVehiculos:   form.rangoVehiculos,
        },
      };
      guardarCarpeta(updated);
      await new Promise(r => setTimeout(r, 300));
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  const cfg  = ESTADO_CFG[flota.estado] ?? ESTADO_CFG.CONTRATADA;
  const esOrion = flota.origen === 'orion';
  const canEdit = esOrion && flota.estado === 'CONTRATADA' && !!carpeta;

  const vehDisplay = flota.total_vehiculos > 0
    ? (esOrion ? String(flota.total_vehiculos) : `≈ ${flota.total_vehiculos.toLocaleString('es-ES')}`)
    : (carpeta?.header?.rangoVehiculos ? rangoLabel(carpeta.header.rangoVehiculos) : '—');

  const infoGrid = [
    { label: 'Corredor',     value: flota.corredor_nombre || '—' },
    { label: 'Comisión',     value: flota.comision ? `${flota.comision}%` : '—' },
    { label: 'Compañía',     value: flota.compania || '—' },
    { label: 'Nº póliza',    value: flota.num_poliza || '—', mono: true },
    { label: 'Periodicidad', value: flota.periodicidad || '—' },
    { label: 'Categoría',    value: flota.categoria_flota || '—' },
    { label: 'F. inicio',    value: fmtD(flota.fecha_inicio) },
    { label: 'Vencimiento',  value: fmtD(flota.fecha_vencimiento) },
    { label: 'Vehículos',    value: vehDisplay },
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,8,0.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={onClose}>
      <div style={{ ...glass, width: '100%', maxWidth: 740, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '20px 26px', borderBottom: '1px solid rgba(61,112,255,0.15)', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              <h2 style={{ fontSize: 16, fontWeight: 900, color: '#FFFFFF', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{flota.nombre}</h2>
              <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 9px', borderRadius: 6, background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{flota.estado}</span>
              <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 9px', borderRadius: 6, background: esOrion ? 'rgba(99,102,241,0.15)' : 'rgba(51,102,255,0.12)', border: esOrion ? '1px solid rgba(99,102,241,0.35)' : '1px solid rgba(51,102,255,0.3)', color: esOrion ? '#818cf8' : '#3366FF', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                {esOrion ? 'Orion' : 'Histórica'}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'rgba(178,198,245,0.6)' }}>
              {flota.tomador}{flota.cif && <> · <span style={{ fontFamily: 'monospace', color: '#BDD4FF' }}>{flota.cif}</span></>}
              {flota.actividad && <> · {flota.actividad}</>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            {esOrion && !editMode && (
              <a href="/flotas" style={{ fontSize: 11, fontWeight: 600, padding: '7px 14px', borderRadius: 10, background: 'rgba(50,60,90,0.4)', color: 'rgba(160,180,220,0.8)', border: '1px solid rgba(80,95,120,0.3)', cursor: 'pointer', textDecoration: 'none' }}>
                Ver estudio
              </a>
            )}
            {canEdit && !editMode && (
              <button onClick={() => setEditMode(true)} style={{ fontSize: 11, fontWeight: 700, padding: '7px 16px', borderRadius: 10, background: 'linear-gradient(135deg,#1240CC,#3366FF)', color: '#fff', border: 'none', cursor: 'pointer' }}>
                Editar datos
              </button>
            )}
            {editMode && (
              <button onClick={() => setEditMode(false)} style={{ fontSize: 11, fontWeight: 600, padding: '7px 14px', borderRadius: 10, background: 'transparent', color: 'rgba(160,180,220,0.8)', border: '1px solid rgba(80,95,120,0.3)', cursor: 'pointer' }}>
                Cancelar
              </button>
            )}
            {!esOrion && onEdit && (
              <button onClick={onEdit} style={{ fontSize: 11, fontWeight: 700, padding: '7px 14px', borderRadius: 10, background: 'rgba(51,102,255,0.15)', color: '#3366FF', border: '1px solid rgba(51,102,255,0.3)', cursor: 'pointer' }}>Editar</button>
            )}
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 10, border: '1px solid rgba(80,95,120,0.3)', background: 'rgba(20,28,55,0.6)', color: 'rgba(180,195,225,0.8)', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 26px', display: 'flex', flexDirection: 'column', gap: 18 }} className="custom-scrollbar">

          {/* KPIs de prima */}
          {(flota.prima_total > 0 || flota.prima_cliente || flota.prima_mmt) && (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${[flota.prima_cliente, flota.prima_mmt, flota.prima_total].filter(Boolean).length || 1}, 1fr)`, gap: 10 }}>
              {flota.prima_cliente && flota.prima_cliente > 0 && (
                <div style={{ padding: '14px 18px', borderRadius: 14, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                  <div style={{ ...labelStyle, marginBottom: 4 }}>Prima cliente</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: '#f59e0b', fontFamily: 'monospace' }}>{fmtE(flota.prima_cliente)}</div>
                </div>
              )}
              {flota.prima_mmt && flota.prima_mmt > 0 && (
                <div style={{ padding: '14px 18px', borderRadius: 14, background: 'rgba(51,102,255,0.08)', border: '1px solid rgba(51,102,255,0.2)' }}>
                  <div style={{ ...labelStyle, marginBottom: 4 }}>Prima MMT ofertada</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: '#3366FF', fontFamily: 'monospace' }}>{fmtE(flota.prima_mmt)}</div>
                </div>
              )}
              {flota.prima_total > 0 && (
                <div style={{ padding: '14px 18px', borderRadius: 14, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                  <div style={{ ...labelStyle, marginBottom: 4 }}>{esOrion && flota.raw_carpeta?.descuentoOferta ? `Prima neta (−${flota.raw_carpeta.descuentoOferta}%)` : 'Prima total'}</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: '#10b981', fontFamily: 'monospace' }}>{fmtE(flota.prima_total)}</div>
                </div>
              )}
            </div>
          )}

          {/* Info grid / edit form */}
          {editMode && canEdit ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Corredor</label>
                  <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.corredor_id} onChange={e => setF('corredor_id', e.target.value)}>
                    <option value="">— Sin corredor</option>
                    {corredores.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Comisión (%)</label>
                  <input style={{ ...inputStyle, fontFamily: 'monospace' }} type="number" step="0.1" min="0" max="100" value={form.comision} onChange={e => setF('comision', e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Compañía</label>
                  <input style={inputStyle} value={form.compania} onChange={e => setF('compania', e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Nº póliza</label>
                  <input style={{ ...inputStyle, fontFamily: 'monospace' }} value={form.poliza} onChange={e => setF('poliza', e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Periodicidad</label>
                  <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.periodicidad} onChange={e => setF('periodicidad', e.target.value)}>
                    <option value="">— Sin especificar</option>
                    {PERIODOS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Categoría</label>
                  <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.categoria} onChange={e => setF('categoria', e.target.value)}>
                    <option value="">Sin especificar</option>
                    <option value="1ª Categoría">1ª Categoría</option>
                    <option value="2ª Categoría">2ª Categoría</option>
                    <option value="3ª Categoría">3ª Categoría</option>
                    <option value="Mixta">Mixta</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>F. inicio</label>
                  <input style={inputStyle} type="date" value={form.fechaInicio} onChange={e => setF('fechaInicio', e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Vencimiento</label>
                  <input style={inputStyle} type="date" value={form.fechaVcto} onChange={e => setF('fechaVcto', e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Vehículos</label>
                  <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.rangoVehiculos} onChange={e => setF('rangoVehiculos', e.target.value)}>
                    {RANGOS_VEH.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => setEditMode(false)} disabled={saving} style={{ fontSize: 13, fontWeight: 600, padding: '10px 22px', borderRadius: 12, background: 'transparent', color: 'rgba(178,198,245,0.7)', border: '1px solid rgba(80,95,120,0.3)', cursor: 'pointer' }}>Cancelar</button>
                <button onClick={handleSave} disabled={saving} style={{ fontSize: 13, fontWeight: 800, padding: '10px 28px', borderRadius: 12, background: saving ? 'rgba(18,64,204,0.5)' : 'linear-gradient(135deg, #1240CC, #3366FF)', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', boxShadow: '0 8px 24px -8px rgba(18,64,204,0.5)' }}>
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {infoGrid.map(({ label, value, mono }) => (
                <div key={label} style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(6,14,50,0.5)', border: '1px solid rgba(51,102,255,0.1)' }}>
                  <div style={{ ...labelStyle, marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF', fontFamily: mono ? 'monospace' : 'inherit' }}>{value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Coberturas */}
          {flota.coberturas.length > 0 && (
            <div>
              <div style={{ ...labelStyle, marginBottom: 8 }}>Coberturas</div>
              <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(51,102,255,0.12)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'rgba(6,14,50,0.6)' }}>
                      <th style={{ ...labelStyle, padding: '9px 14px', margin: 0, textAlign: 'left', borderBottom: '1px solid rgba(51,102,255,0.12)' }}>Cobertura</th>
                      <th style={{ ...labelStyle, padding: '9px 14px', margin: 0, textAlign: 'right', borderBottom: '1px solid rgba(51,102,255,0.12)' }}>Prima</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flota.coberturas.map((cob, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(51,102,255,0.07)' }}>
                        <td style={{ padding: '9px 14px', fontSize: 13, color: '#BDD4FF' }}>{cob.nombre}</td>
                        <td style={{ padding: '9px 14px', fontSize: 13, fontWeight: 700, color: '#FFFFFF', textAlign: 'right', fontFamily: 'monospace' }}>{fmtE(Number(cob.prima) || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Notas */}
          {flota.notas && (
            <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(6,14,50,0.4)', border: '1px solid rgba(51,102,255,0.1)' }}>
              <div style={{ ...labelStyle, marginBottom: 4 }}>Notas</div>
              <p style={{ fontSize: 13, color: 'rgba(178,198,245,0.8)', margin: 0, lineHeight: 1.6 }}>{flota.notas}</p>
            </div>
          )}

          {/* Zona peligro (solo históricas) */}
          {!esOrion && onDelete && (
            <div style={{ paddingTop: 4, borderTop: '1px solid rgba(239,68,68,0.1)' }}>
              <button onClick={onDelete} style={{ fontSize: 11, fontWeight: 700, padding: '8px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', cursor: 'pointer' }}>Eliminar flota histórica</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── SortIcon ─────────────────────────────────────────────────────────────────

type SortColFlotas = 'nombre' | 'corredor' | 'periodicidad' | 'fechaInicio' | 'fechaVcto' | 'comision' | 'estado';

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  return (
    <span style={{ marginLeft: 4, color: active ? '#93b4e8' : 'rgba(140,155,175,0.45)', fontSize: 9, lineHeight: 1 }}>
      {active ? (dir === 'asc' ? '↑' : '↓') : '⇅'}
    </span>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function FlotasPage() {
  const { flotas, corredoresLista, corredores, loading, reload } = usePortfolio();

  const [estadoFilter,   setEstadoFilter]   = useState<EstadoFlota | 'TODAS'>('CONTRATADA');
  const [corredorFilter, setCorredorFilter] = useState('TODAS');
  const [search,         setSearch]         = useState('');
  const [ficha,          setFicha]          = useState<FlotaView | null>(null);
  const [toast,          setToast]          = useState('');
  const [sortCol,        setSortCol]        = useState<SortColFlotas | null>(null);
  const [sortDir,        setSortDir]        = useState<'asc' | 'desc'>('asc');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2200); };

  const q = search.trim().toLowerCase();

  const filtered = useMemo(() => {
    return flotas.filter(f => {
      if (estadoFilter !== 'TODAS' && f.estado !== estadoFilter) return false;
      if (corredorFilter !== 'TODAS' && f.corredor_nombre !== corredorFilter) return false;
      if (q) {
        const matches =
          f.nombre.toLowerCase().includes(q) ||
          f.tomador.toLowerCase().includes(q) ||
          f.cif.toLowerCase().includes(q) ||
          f.corredor_nombre.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [flotas, estadoFilter, corredorFilter, q]);

  function toggleSortF(col: SortColFlotas) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  const counts: Record<string, number> = useMemo(() => ({
    TODAS:        flotas.length,
    CONTRATADA:   flotas.filter(f => f.estado === 'CONTRATADA').length,
    OFERTADA:     flotas.filter(f => f.estado === 'OFERTADA').length,
    RECHAZADA:    flotas.filter(f => f.estado === 'RECHAZADA').length,
  }), [flotas]);

  const sortedFiltered = useMemo(() => {
    if (!sortCol) return filtered;
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortCol === 'nombre')        cmp = a.nombre.localeCompare(b.nombre);
      else if (sortCol === 'corredor') cmp = (a.corredor_nombre ?? '').localeCompare(b.corredor_nombre ?? '');
      else if (sortCol === 'periodicidad') cmp = (a.periodicidad ?? '').localeCompare(b.periodicidad ?? '');
      else if (sortCol === 'fechaInicio')  cmp = (a.fecha_inicio ?? '').localeCompare(b.fecha_inicio ?? '');
      else if (sortCol === 'fechaVcto')    cmp = (a.fecha_vencimiento ?? '').localeCompare(b.fecha_vencimiento ?? '');
      else if (sortCol === 'comision')     cmp = (a.comision ?? 0) - (b.comision ?? 0);
      else if (sortCol === 'estado')       cmp = a.estado.localeCompare(b.estado);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortCol, sortDir]);

  const kpisFlotas = useMemo(() => [
    { label: 'Portfolio total', value: String(flotas.length),     color: 'rgba(220,230,248,0.92)' },
    { label: 'Contratadas',     value: String(counts.CONTRATADA), color: '#2bb589' },
    { label: 'Ofertadas',       value: String(counts.OFERTADA),   color: '#c9923a' },
    { label: 'Rechazadas',      value: String(counts.RECHAZADA),  color: '#c45858' },
  ], [flotas, counts]);

  return (
    <div className="h-full overflow-y-auto custom-scrollbar animate-in fade-in duration-500">
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Header */}
        <div style={{ ...glass, padding: '20px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
            <div style={{ width: 4, height: 36, borderRadius: 2, background: 'linear-gradient(180deg, #3366FF 0%, #1240CC 100%)' }} />
            <div>
              <h1 style={{ fontSize: 15, fontWeight: 900, color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Flotas</h1>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(178,198,245,0.6)', margin: '4px 0 0 0' }}>
                Portfolio · {filtered.length} resultado{filtered.length !== 1 ? 's' : ''} de {flotas.length}
              </p>
            </div>
          </div>

          {/* Filtros */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 180 }}>
              <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(178,198,245,0.5)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input type="text" placeholder="Buscar nombre, CIF, corredor…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, paddingLeft: 30, paddingRight: search ? 30 : 10 }} />
              {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(178,198,245,0.5)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>}
            </div>
            <select value={estadoFilter} onChange={e => setEstadoFilter(e.target.value as EstadoFlota | 'TODAS')} style={{ ...inputStyle, width: 'auto', minWidth: 165, cursor: 'pointer' }}>
              <option value="TODAS">Todos los estados ({counts.TODAS})</option>
              <option value="CONTRATADA">Contratada ({counts.CONTRATADA})</option>
              <option value="OFERTADA">Ofertada ({counts.OFERTADA})</option>
              <option value="RECHAZADA">Rechazada ({counts.RECHAZADA})</option>
            </select>
            <select value={corredorFilter} onChange={e => setCorredorFilter(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: 200, cursor: 'pointer' }}>
              <option value="TODAS">Todos los corredores</option>
              {corredoresLista.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            {(estadoFilter !== 'CONTRATADA' || corredorFilter !== 'TODAS' || search) && (
              <button onClick={() => { setEstadoFilter('CONTRATADA'); setCorredorFilter('TODAS'); setSearch(''); }} style={{ fontSize: 11, fontWeight: 700, padding: '8px 14px', borderRadius: 10, background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', color: 'rgba(239,68,68,0.7)', cursor: 'pointer' }}>Limpiar</button>
            )}
          </div>
        </div>

        {/* KPIs Flotas */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'rgba(8,16,38,0.55)', border: '1px solid rgba(60,75,100,0.3)', borderRadius: 14, overflow: 'hidden' }}>
          {kpisFlotas.map((k, i) => (
            <div key={k.label} style={{
              padding: '14px 20px', background: 'rgba(6,12,30,0.5)',
              borderRight: i < kpisFlotas.length - 1 ? '1px solid rgba(60,75,100,0.22)' : undefined,
            }}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'rgba(145,158,178,0.7)', marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: k.color, fontFamily: 'monospace', lineHeight: 1 }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Tabla */}
        {loading ? (
          <div style={{ ...glass, padding: '60px 40px', textAlign: 'center' }}>
            <p style={{ color: 'rgba(178,198,245,0.5)', fontSize: 13, margin: 0 }}>Cargando portfolio...</p>
          </div>
        ) : (
          <div style={{ background: 'rgba(12,28,82,0.42)', border: '1px solid rgba(61,112,255,0.16)', borderRadius: 16, overflowX: 'auto' }}>
            <div style={{ minWidth: 820 }}>
              {/* Cabecera */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.1fr minmax(0,100px) minmax(0,130px) minmax(0,130px) minmax(0,72px) minmax(0,128px)', padding: '12px 18px', borderBottom: '1px solid rgba(60,75,100,0.35)', background: 'rgba(8,16,38,0.65)', gap: 8 }}>
                {([
                  { key: 'nombre'       as SortColFlotas, label: 'Nombre / CIF' },
                  { key: 'corredor'     as SortColFlotas, label: 'Corredor' },
                  { key: 'periodicidad' as SortColFlotas, label: 'Periodicidad' },
                  { key: 'fechaInicio'  as SortColFlotas, label: 'F. Inicio' },
                  { key: 'fechaVcto'    as SortColFlotas, label: 'F. Vencimiento' },
                  { key: 'comision'     as SortColFlotas, label: 'Comis.' },
                  { key: 'estado'       as SortColFlotas, label: 'Estado' },
                ]).map(({ key, label }) => (
                  <span key={label} onClick={key ? () => toggleSortF(key) : undefined} style={{
                    fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.09em',
                    color: sortCol === key ? '#d0daf0' : 'rgba(148,160,180,0.72)',
                    cursor: key ? 'pointer' : 'default',
                    display: 'inline-flex', alignItems: 'center', userSelect: 'none',
                  }}>
                    {label}
                    {key && <SortIcon active={sortCol === key} dir={sortDir} />}
                  </span>
                ))}
              </div>

              {filtered.length === 0 ? (
                <p style={{ color: 'rgba(178,198,245,0.4)', fontSize: 12, textAlign: 'center', padding: '48px 0', margin: 0 }}>
                  {search ? `Sin resultados para "${search}"` : 'No hay flotas con estos filtros.'}
                </p>
              ) : sortedFiltered.map(f => {
                const cfg  = ESTADO_CFG[f.estado] ?? ESTADO_CFG.CONTRATADA;
                const dias = parseFechaVcto(f.fecha_vencimiento);
                const col  = vctoColor(dias);
                const nombreDifTomador = f.tomador && f.tomador.trim().toLowerCase() !== f.nombre.trim().toLowerCase();
                return (
                  <div key={f.id} onClick={() => setFicha(f)} style={{ display: 'grid', gridTemplateColumns: '2fr 1.1fr minmax(0,100px) minmax(0,130px) minmax(0,130px) minmax(0,72px) minmax(0,128px)', gap: 8, alignItems: 'center', padding: '13px 18px', borderBottom: '1px solid rgba(61,112,255,0.07)', cursor: 'pointer', transition: 'background 180ms' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(51,102,255,0.04)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>

                    {/* Nombre / CIF */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' }}>
                      <span style={{ fontSize: 13, color: '#FFFFFF', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nombre || '(sin nombre)'}</span>
                      {(f.cif || nombreDifTomador) && (
                        <span style={{ fontSize: 11, color: 'rgba(178,198,245,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {f.cif && <span style={{ fontFamily: 'monospace', letterSpacing: '0.04em' }}>{f.cif}</span>}
                          {f.cif && nombreDifTomador && <span style={{ margin: '0 4px', opacity: 0.4 }}>·</span>}
                          {nombreDifTomador && <span>{f.tomador}</span>}
                        </span>
                      )}
                    </div>

                    {/* Corredor */}
                    <span style={{ fontSize: 12, color: '#BDD4FF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.corredor_nombre || <span style={{ color: 'rgba(178,198,245,0.3)' }}>—</span>}
                    </span>

                    {/* Periodicidad */}
                    <span style={{ fontSize: 12, color: 'rgba(178,198,245,0.8)', textTransform: 'capitalize', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.periodicidad || '—'}</span>

                    {/* F. Inicio */}
                    <span style={{ fontSize: 12, color: 'rgba(178,198,245,0.7)', whiteSpace: 'nowrap' }}>{fmtVcto(f.fecha_inicio)}</span>

                    {/* F. Vencimiento */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 12, color: col, fontWeight: dias !== null && dias < 90 ? 700 : 500, whiteSpace: 'nowrap' }}>{fmtVcto(f.fecha_vencimiento)}</span>
                      {dias !== null && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: col, whiteSpace: 'nowrap' }}>
                          {dias < 0 ? `Vencida ${Math.abs(dias)} días` : `${dias} días`}
                        </span>
                      )}
                    </div>

                    {/* Comisión */}
                    <span style={{ fontSize: 12, color: f.comision ? '#BDD4FF' : 'rgba(178,198,245,0.35)', whiteSpace: 'nowrap' }}>
                      {f.comision ? `${f.comision}%` : '—'}
                    </span>

                    {/* Estado */}
                    <span style={{ fontSize: 10, fontWeight: 800, padding: '4px 10px', borderRadius: 6, background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap', display: 'inline-block' }}>
                      {f.estado}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Modal ficha */}
      {ficha && (
        <FichaPoliza
          flota={ficha}
          corredores={corredores}
          onClose={() => setFicha(null)}
          onSaved={() => { setFicha(null); reload(); }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)', background: 'rgba(16,185,129,0.95)', color: '#fff', padding: '10px 24px', borderRadius: 10, fontSize: 13, fontWeight: 700, zIndex: 9999, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>{toast}</div>
      )}
    </div>
  );
}
