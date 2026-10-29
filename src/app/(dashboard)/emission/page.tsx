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
  background: 'var(--t-surface)', border: '1px solid var(--t-line)',
  borderRadius: 14,
};
const inputStyle: React.CSSProperties = {
  fontSize: 13, padding: '9px 12px', borderRadius: 8,
  background: 'var(--t-surface)', border: '1px solid var(--t-line)',
  color: 'var(--t-text)', outline: 'none', width: '100%', fontFamily: 'inherit',
};
const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: 'var(--t-text-3)',
  textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5, display: 'block',
};
const ESTADO_CFG: Record<EstadoFlota, { bg: string; border: string; color: string }> = {
  CONTRATADA:   { bg: 'rgba(32,201,130,0.08)',  border: 'rgba(32,201,130,0.25)', color: 'var(--t-green)' },
  RECHAZADA:    { bg: 'rgba(239,77,90,0.08)',   border: 'rgba(239,77,90,0.25)',  color: 'var(--t-red)' },
  'EN ESTUDIO': { bg: 'var(--t-line-soft)',     border: 'var(--t-line)',         color: 'var(--t-text-2)' },
  OFERTADA:     { bg: 'rgba(240,185,77,0.08)',  border: 'rgba(240,185,77,0.25)', color: 'var(--t-amber)' },
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
  if (dias === null) return 'var(--t-text-3)';
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
        fetch('/api/flotas/carpetas?summary=true'),
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
  // fullCarpeta: versión completa (con original/trabajo/sinco) cargada al editar
  const [fullCarpeta, setFullCarpeta] = useState<FlotaCarpeta | null>(null);

  const carpeta = fullCarpeta ?? flota.raw_carpeta;

  const enterEditMode = async () => {
    // Carga la carpeta completa (con original/trabajo/sinco) antes de editar
    // para evitar sobrescribir esos arrays con la versión summary
    if (!fullCarpeta && flota.raw_carpeta) {
      try {
        const res = await fetch('/api/flotas/carpetas');
        if (res.ok) {
          const list: FlotaCarpeta[] = await res.json();
          const found = list.find(c => c.id === flota.id);
          if (found) setFullCarpeta(found);
        }
      } catch { /* usa raw_carpeta de summary si falla */ }
    }
    setEditMode(true);
  };

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
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 14, width: '100%', maxWidth: 740, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '20px 26px', borderBottom: '1px solid var(--t-line)', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              <h2 style={{ fontSize: 16, fontWeight: 900, color: 'var(--t-text)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{flota.nombre}</h2>
              <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 9px', borderRadius: 6, background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{flota.estado}</span>
              <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 9px', borderRadius: 6, background: esOrion ? 'rgba(99,102,241,0.15)' : 'rgba(51,102,255,0.12)', border: esOrion ? '1px solid rgba(99,102,241,0.35)' : '1px solid rgba(51,102,255,0.3)', color: esOrion ? '#818cf8' : '#3366FF', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                {esOrion ? 'Orion' : 'Histórica'}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--t-text-2)' }}>
              {flota.tomador}{flota.cif && <> · <span style={{ fontFamily: 'monospace', color: 'var(--t-text)' }}>{flota.cif}</span></>}
              {flota.actividad && <> · {flota.actividad}</>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            {esOrion && !editMode && (
              <a href="/flotas" style={{ fontSize: 11, fontWeight: 600, padding: '7px 14px', borderRadius: 10, background: 'var(--t-line-soft)', color: 'var(--t-text-2)', border: '1px solid var(--t-line)', cursor: 'pointer', textDecoration: 'none' }}>
                Ver estudio
              </a>
            )}
            {canEdit && !editMode && (
              <button onClick={enterEditMode} style={{ fontSize: 11, fontWeight: 700, padding: '7px 16px', borderRadius: 10, background: 'var(--t-blue)', color: '#fff', border: 'none', cursor: 'pointer' }}>
                Editar datos
              </button>
            )}
            {editMode && (
              <button onClick={() => setEditMode(false)} style={{ fontSize: 11, fontWeight: 600, padding: '7px 14px', borderRadius: 10, background: 'transparent', color: 'var(--t-text-2)', border: '1px solid var(--t-line)', cursor: 'pointer' }}>
                Cancelar
              </button>
            )}
            {!esOrion && onEdit && (
              <button onClick={onEdit} style={{ fontSize: 11, fontWeight: 700, padding: '7px 14px', borderRadius: 10, background: 'rgba(67,135,255,0.12)', color: 'var(--t-blue)', border: '1px solid rgba(67,135,255,0.3)', cursor: 'pointer' }}>Editar</button>
            )}
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 10, border: '1px solid var(--t-line)', background: 'var(--t-line-soft)', color: 'var(--t-text-2)', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
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
                <div style={{ padding: '14px 18px', borderRadius: 14, background: 'rgba(67,135,255,0.07)', border: '1px solid rgba(67,135,255,0.2)' }}>
                  <div style={{ ...labelStyle, marginBottom: 4 }}>Prima MMT ofertada</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--t-blue)', fontFamily: 'monospace' }}>{fmtE(flota.prima_mmt)}</div>
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
                <button onClick={() => setEditMode(false)} disabled={saving} style={{ fontSize: 13, fontWeight: 600, padding: '10px 22px', borderRadius: 12, background: 'transparent', color: 'var(--t-text-2)', border: '1px solid var(--t-line)', cursor: 'pointer' }}>Cancelar</button>
                <button onClick={handleSave} disabled={saving} style={{ fontSize: 13, fontWeight: 800, padding: '10px 28px', borderRadius: 12, background: saving ? 'rgba(67,135,255,0.4)' : 'var(--t-blue)', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer' }}>
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {infoGrid.map(({ label, value, mono }) => (
                <div key={label} style={{ padding: '10px 14px', borderRadius: 12, background: 'var(--t-line-soft)', border: '1px solid var(--t-line)' }}>
                  <div style={{ ...labelStyle, marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)', fontFamily: mono ? 'monospace' : 'inherit' }}>{value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Coberturas */}
          {flota.coberturas.length > 0 && (
            <div>
              <div style={{ ...labelStyle, marginBottom: 8 }}>Coberturas</div>
              <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--t-line)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--t-surface)' }}>
                      <th style={{ ...labelStyle, padding: '9px 14px', margin: 0, textAlign: 'left', borderBottom: '1px solid var(--t-line)' }}>Cobertura</th>
                      <th style={{ ...labelStyle, padding: '9px 14px', margin: 0, textAlign: 'right', borderBottom: '1px solid var(--t-line)' }}>Prima</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flota.coberturas.map((cob, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--t-line)' }}>
                        <td style={{ padding: '9px 14px', fontSize: 13, color: 'var(--t-text-2)' }}>{cob.nombre}</td>
                        <td style={{ padding: '9px 14px', fontSize: 13, fontWeight: 700, color: 'var(--t-text)', textAlign: 'right', fontFamily: 'monospace' }}>{fmtE(Number(cob.prima) || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Notas */}
          {flota.notas && (
            <div style={{ padding: '12px 16px', borderRadius: 12, background: 'var(--t-line-soft)', border: '1px solid var(--t-line)' }}>
              <div style={{ ...labelStyle, marginBottom: 4 }}>Notas</div>
              <p style={{ fontSize: 13, color: 'var(--t-text-2)', margin: 0, lineHeight: 1.6 }}>{flota.notas}</p>
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
    { label: 'Portfolio total', value: String(flotas.length),     color: 'var(--t-text)' },
    { label: 'Contratadas',     value: String(counts.CONTRATADA), color: 'var(--t-green)' },
    { label: 'Ofertadas',       value: String(counts.OFERTADA),   color: 'var(--t-amber)' },
    { label: 'Rechazadas',      value: String(counts.RECHAZADA),  color: 'var(--t-red)' },
  ], [flotas, counts]);

  return (
    <div className="h-full overflow-y-auto custom-scrollbar animate-in fade-in duration-500">
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Header */}
        <div>
          <h1 style={{ margin: '0 0 6px', fontSize: 34, fontWeight: 680, letterSpacing: '-0.04em', color: 'var(--t-text)' }}>
            Flotas
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--t-text-2)' }}>
            Portfolio · {filtered.length} resultado{filtered.length !== 1 ? 's' : ''} de {flotas.length}
          </p>
        </div>

        {/* KPIs Flotas */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr 1fr', paddingBottom: 24, borderBottom: '1px solid var(--t-line)' }}>
          {kpisFlotas.map((k, i) => (
            <div key={k.label} style={{ textAlign: i === 0 ? 'left' : i === 3 ? 'right' : 'center' }}>
              <small style={{ display: 'block', color: 'var(--t-text-2)', fontSize: 12, letterSpacing: '0.06em', marginBottom: 4 }}>{k.label.toUpperCase()}</small>
              <strong style={{ fontSize: 48, fontWeight: 620, letterSpacing: '-0.04em', lineHeight: 1, color: k.color }}>{k.value}</strong>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 180 }}>
            <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--t-text-3)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" placeholder="Buscar nombre, CIF, corredor…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, paddingLeft: 30, paddingRight: search ? 30 : 10 }} />
            {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--t-text-3)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>}
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
            <button onClick={() => { setEstadoFilter('CONTRATADA'); setCorredorFilter('TODAS'); setSearch(''); }} style={{ fontSize: 11, fontWeight: 700, padding: '8px 14px', borderRadius: 10, background: 'transparent', border: '1px solid var(--t-red)', color: 'var(--t-red)', cursor: 'pointer', opacity: 0.7 }}>Limpiar</button>
          )}
        </div>

        {/* Tabla */}
        {loading ? (
          <div style={{ padding: '60px 40px', textAlign: 'center' }}>
            <p style={{ color: 'var(--t-text-3)', fontSize: 13, margin: 0 }}>Cargando portfolio...</p>
          </div>
        ) : (
          <div style={{ background: 'transparent', border: '1px solid var(--t-line)', borderRadius: 10, overflowX: 'auto' }}>
            <div style={{ minWidth: 820 }}>
              {/* Cabecera */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.1fr minmax(0,100px) minmax(0,130px) minmax(0,130px) minmax(0,90px) minmax(0,128px)', padding: '12px 18px', borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface)', gap: 8 }}>
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
                    color: sortCol === key ? 'var(--t-text)' : 'var(--t-text-3)',
                    cursor: key ? 'pointer' : 'default',
                    display: 'inline-flex', alignItems: 'center', userSelect: 'none',
                  }}>
                    {label}
                  </span>
                ))}
              </div>

              {filtered.length === 0 ? (
                <p style={{ color: 'var(--t-text-3)', fontSize: 12, textAlign: 'center', padding: '48px 0', margin: 0 }}>
                  {search ? `Sin resultados para "${search}"` : 'No hay flotas con estos filtros.'}
                </p>
              ) : sortedFiltered.map(f => {
                const cfg  = ESTADO_CFG[f.estado] ?? ESTADO_CFG.CONTRATADA;
                const dias = parseFechaVcto(f.fecha_vencimiento);
                const col  = vctoColor(dias);
                const nombreDifTomador = f.tomador && f.tomador.trim().toLowerCase() !== f.nombre.trim().toLowerCase();
                return (
                  <div key={f.id} onClick={() => setFicha(f)} style={{ display: 'grid', gridTemplateColumns: '2fr 1.1fr minmax(0,100px) minmax(0,130px) minmax(0,130px) minmax(0,90px) minmax(0,128px)', gap: 8, alignItems: 'center', padding: '13px 18px', borderBottom: '1px solid var(--t-line)', cursor: 'pointer', transition: 'background 180ms' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--t-line-soft)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>

                    {/* Nombre / CIF */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' }}>
                      <span style={{ fontSize: 14, color: 'var(--t-text)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nombre || '(sin nombre)'}</span>
                      {(f.cif || nombreDifTomador) && (
                        <span style={{ fontSize: 12, color: 'var(--t-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {f.cif && <span style={{ fontFamily: 'monospace', letterSpacing: '0.04em' }}>{f.cif}</span>}
                          {f.cif && nombreDifTomador && <span style={{ margin: '0 4px', opacity: 0.4 }}>·</span>}
                          {nombreDifTomador && <span>{f.tomador}</span>}
                        </span>
                      )}
                    </div>

                    {/* Corredor */}
                    <span style={{ fontSize: 14, color: 'var(--t-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.corredor_nombre || <span style={{ color: 'var(--t-text-3)' }}>—</span>}
                    </span>

                    {/* Periodicidad */}
                    <span style={{ fontSize: 14, color: 'var(--t-text-2)', textTransform: 'capitalize', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.periodicidad || '—'}</span>

                    {/* F. Inicio */}
                    <span style={{ fontSize: 14, color: 'var(--t-text-2)', whiteSpace: 'nowrap' }}>{fmtVcto(f.fecha_inicio)}</span>

                    {/* F. Vencimiento */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 14, color: col, fontWeight: dias !== null && dias < 90 ? 700 : 500, whiteSpace: 'nowrap' }}>{fmtVcto(f.fecha_vencimiento)}</span>
                      {dias !== null && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: col, whiteSpace: 'nowrap' }}>
                          {dias < 0 ? `Vencida ${Math.abs(dias)} días` : `${dias} días`}
                        </span>
                      )}
                    </div>

                    {/* Comisión */}
                    <span style={{ fontSize: 14, color: f.comision ? 'var(--t-text)' : 'var(--t-text-3)', whiteSpace: 'nowrap' }}>
                      {f.comision ? `${f.comision.toFixed(1).replace('.', ',')} %` : '—'}
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
