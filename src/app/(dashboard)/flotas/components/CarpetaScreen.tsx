"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  listarCarpetas, crearCarpeta, guardarCarpeta, eliminarCarpeta, generarPlantillaExcel,
  listarCorredores, crearCorredor, cambiarEstado,
  cargarCarpetasDelServidor, cargarCorredoresDelServidor,
  type FlotaCarpeta, type Corredor, type EstadoFlota,
} from '@/core/flotas';
import { useAuth } from '@/context/AuthContext';

// ── Format utils ──────────────────────────────────────────────────────────────
const dec = (n: number, d = 1): string => {
  const [i, f] = Math.abs(n).toFixed(d).split('.');
  return (n < 0 ? '−' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (f ? ',' + f : '');
};
const nf  = (n: number) => dec(Math.round(n), 0);
const eur = (n: number) => nf(n) + ' €';
const pc  = (n: number, d = 1) => dec(n, d) + ' %';

// ── Constants ──────────────────────────────────────────────────────────────────
const ESTADOS: EstadoFlota[] = ['EN ESTUDIO', 'ESTUDIADA', 'OFERTADA', 'CONTRATADA', 'RECHAZADA'];

const PIPE_STEP_IDX = [0, 2, 3, 4, 5, 6, 7];
const PIPE_LABELS   = ['Datos generales', 'Original', 'Trabajo', 'SINCO', 'Informe', 'Oferta', 'Pre-emisión', 'Completo'];
const PIPE_KEYS     = ['datos', 'orig', 'trab', 'sinco', 'inf', 'of', 'pre', 'fin'];
const PIPE_NOS      = ['01', '03', '04', '05', '06', '07', '08', '—'];
const STEP_LABELS: Record<string, string> = {
  datos: 'Datos generales', orig: 'Original', trab: 'Trabajo',
  sinco: 'SINCO', inf: 'Informe', of: 'Oferta', pre: 'Pre-emisión', fin: 'Completo',
};
const PAGE_SIZE = 20;

type EstudioSortKey = 'nombre' | 'corredor' | 'sucursal' | 'vehiculos' | 'avance' | 'estado' | 'modificada';
type DrawerMode = null | 'flotas' | 'veh' | 'cor' | 'avance' | 'prima' | { pipe: string } | 'nueva';

// ── Helpers ────────────────────────────────────────────────────────────────────
function normalizarCarpeta(c: FlotaCarpeta): FlotaCarpeta {
  return { ...c, estado: c.estado ?? 'EN ESTUDIO', historico: c.historico ?? [] };
}

function stepFlags(c: FlotaCarpeta): boolean[] {
  return [
    !!(c.header?.cif?.trim() || c.header?.tomador?.trim()),
    false,
    ((c.original?.length ?? 0) > 0),
    ((c.trabajo?.length ?? 0) > 0),
    ((c.sincoResultados?.length ?? 0) > 0),
    ((c.sincoResultados?.length ?? 0) > 0),
    ((c.oferta?.length ?? 0) > 0),
    c.estado !== 'EN ESTUDIO' && c.estado !== 'ESTUDIADA',
  ];
}

function avanceCarpeta(c: FlotaCarpeta): number {
  return stepFlags(c).filter(Boolean).length;
}

function numVehiculos(c: FlotaCarpeta): number {
  return (c.trabajo?.length > 0 ? c.trabajo : c.original)
    ?.filter((r: Record<string, unknown>) => (r['matricula'] as string)?.trim()).length ?? 0;
}

function totalPrimaCarpeta(c: FlotaCarpeta): number {
  return (c.oferta ?? []).reduce((s, r: Record<string, string>) => s + (parseFloat(r['oferta_prima_mmt'] ?? '') || 0), 0);
}

function parseFechaVcto(str: string): Date | null {
  try {
    const p = str.split(/[\/\-\.]/);
    if (p.length !== 3) return null;
    return p[0].length === 4
      ? new Date(`${p[0]}-${p[1].padStart(2, '0')}-${p[2].padStart(2, '0')}`)
      : new Date(`${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`);
  } catch { return null; }
}

// ── EstadoBadge ────────────────────────────────────────────────────────────────
export const capEstado = (e: string) => e ? e.charAt(0) + e.slice(1).toLowerCase() : e;
const fmtModificada = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  if (d.toDateString() === new Date().toDateString()) return 'Hoy';
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export function EstadoBadge({ estado, small }: { estado: string; small?: boolean }) {
  const c: Record<string, string> = {
    'EN ESTUDIO': 'var(--st-estudio)',
    'ESTUDIADA':  'var(--st-estudiada)',
    'OFERTADA':   'var(--st-ofertada)',
    'CONTRATADA': 'var(--st-contratada)',
    'RECHAZADA':  'var(--st-rechazada)',
  };
  return (
    <span className="tag" style={{ '--c': c[estado] ?? 'var(--blue)', fontSize: small ? 11 : 13 } as React.CSSProperties}>
      {capEstado(estado)}
    </span>
  );
}

// ── CrearCorredorForm ──────────────────────────────────────────────────────────
const EMPTY_CORREDOR = { nombre: '', cif: '', comisionBase: '' };

function CrearCorredorForm({ onCreado, onCancelar }: { onCreado: (c: Corredor) => void; onCancelar: () => void }) {
  const [form, setForm] = useState(EMPTY_CORREDOR);
  const set = (k: keyof typeof EMPTY_CORREDOR, v: string) => setForm(f => ({ ...f, [k]: v }));
  const submit = () => {
    if (!form.nombre.trim()) return;
    onCreado(crearCorredor({ nombre: form.nombre.trim(), cif: form.cif.trim(), comisionBase: parseFloat(form.comisionBase) || 0, periodicidad: 'mensual', formaPago: '', contacto: '', email: '', telefono: '', observaciones: '' }));
  };
  return (
    <div style={{ marginTop: 10, padding: 14, borderRadius: 7, background: 'var(--hover)', border: '1px solid var(--line)' }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--quiet)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px' }}>Nuevo corredor</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div style={{ gridColumn: '1/-1' }}>
          <input placeholder="Nombre *" value={form.nombre} onChange={e => set('nombre', e.target.value)} className="inp" />
        </div>
        <input placeholder="CIF" value={form.cif} onChange={e => set('cif', e.target.value)} className="inp" />
        <input placeholder="% Comisión" inputMode="decimal" value={form.comisionBase}
          onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d*$/.test(v)) set('comisionBase', v); }} className="inp" />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={submit} disabled={!form.nombre.trim()} className="mini pri" style={{ opacity: form.nombre.trim() ? 1 : 0.4 }}>Crear corredor</button>
        <button onClick={onCancelar} className="mini">Cancelar</button>
      </div>
    </div>
  );
}

// ── DrawerData type ────────────────────────────────────────────────────────────
interface DrawerData {
  over: string; title: string; desc: string;
  stats: [string, string][];
  head: string[]; rows: string[][];
  fx?: [string, string][];
}

// ── DetailDrawer ───────────────────────────────────────────────────────────────
function DetailDrawer({ data, onClose }: { data: DrawerData; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <>
      <div className="dr-scrim open" onClick={onClose} />
      <aside className="dr-drawer open" role="dialog" aria-modal="true" tabIndex={-1}>
        <button className="x" onClick={onClose} aria-label="Cerrar">&times;</button>
        <div className="over">{data.over}</div>
        <h3>{data.title}</h3>
        <p className="desc">{data.desc}</p>
        <div className="stats">
          {data.stats.map(([label, val]) => (
            <div key={label}><label>{label}</label><strong>{val}</strong></div>
          ))}
        </div>
        <h4>Desglose</h4>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead><tr>{data.head.map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {data.rows.map((row, i) => (
                <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
        {(data.fx?.length ?? 0) > 0 && (
          <>
            <h4>Anexo &middot; cómo calcula ORION</h4>
            <div className="annex">
              {data.fx!.map(([name, formula]) => (
                <div key={name} className="fx"><b>{name}</b><code>{formula}</code></div>
              ))}
            </div>
          </>
        )}
      </aside>
    </>,
    document.body
  );
}

// ── NuevaDrawer ────────────────────────────────────────────────────────────────
function NuevaDrawer({ corredores: initCors, onCrear, onClose }: {
  corredores: Corredor[];
  onCrear: (nombre: string, corredorId: string) => void;
  onClose: () => void;
}) {
  const [nombre, setNombre] = useState('');
  const [corredorId, setCorredorId] = useState('');
  const [showCrear, setShowCrear] = useState(false);
  const [cors, setCors] = useState(initCors);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const handleCorChange = (val: string) => {
    if (val === '__crear__') setShowCrear(true);
    else { setShowCrear(false); setCorredorId(val); }
  };

  const handleCorCreado = (c: Corredor) => {
    setCors(listarCorredores());
    setCorredorId(c.id);
    setShowCrear(false);
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <>
      <div className="dr-scrim open" onClick={onClose} />
      <aside className="dr-drawer open" role="dialog" aria-modal="true" tabIndex={-1}>
        <button className="x" onClick={onClose} aria-label="Cerrar">&times;</button>
        <div className="over">NUEVA CARPETA</div>
        <h3>Nuevo estudio</h3>
        <p className="desc">Crea una carpeta de estudio para una nueva flota.</p>
        <form className="form" onSubmit={e => { e.preventDefault(); if (nombre.trim()) onCrear(nombre.trim(), corredorId); }} noValidate>
          <div className="fld">
            <label htmlFor="nc_n">Nombre del estudio <span className="req">*</span></label>
            <input id="nc_n" autoFocus className="inp" placeholder="Nombre de la empresa, ej. FRILESA S.L."
              value={nombre} onChange={e => setNombre(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !showCrear && nombre.trim()) { e.preventDefault(); onCrear(nombre.trim(), corredorId); } }} />
          </div>
          <div className="frow">
            <div className="fld">
              <label htmlFor="nc_c">Corredor</label>
              <select id="nc_c" className="select" value={showCrear ? '__crear__' : corredorId} onChange={e => handleCorChange(e.target.value)}>
                <option value="">Sin corredor</option>
                {cors.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.cif ? ` — ${c.cif}` : ''}</option>)}
                <option value="__crear__">+ Crear nuevo corredor</option>
              </select>
            </div>
          </div>
          {showCrear && (
            <CrearCorredorForm onCreado={handleCorCreado} onCancelar={() => { setShowCrear(false); setCorredorId(''); }} />
          )}
          <div className="fact">
            <button type="submit" disabled={!nombre.trim()} className="btn" style={{ opacity: nombre.trim() ? 1 : 0.5, cursor: nombre.trim() ? 'pointer' : 'default' }}>Crear carpeta</button>
            <button type="button" onClick={onClose} className="btn ghost">Cancelar</button>
          </div>
        </form>
      </aside>
    </>,
    document.body
  );
}

// ── CarpetaScreen ─────────────────────────────────────────────────────────────

interface Props { onSelect: (carpeta: FlotaCarpeta) => void; }

export default function CarpetaScreen({ onSelect }: Props) {
  const { user } = useAuth();
  const [carpetas, setCarpetas] = useState<FlotaCarpeta[]>([]);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [corredores, setCorredores] = useState<Corredor[]>([]);
  const [query, setQuery] = useState('');
  const [estadoFilter, setEstadoFilter] = useState<string>('EN ESTUDIO');
  const [corredorFilter, setCorredorFilter] = useState('TODOS');
  const [sucursalFilter, setSucursalFilter] = useState('');
  const [drawerMode, setDrawerMode] = useState<DrawerMode>(null);
  const [shown, setShown] = useState(PAGE_SIZE);
  const [pendingEstado, setPendingEstado] = useState<{ id: string; estado: EstadoFlota; motivo: string; fechaVencimiento: string } | null>(null);
  const sseRef = useRef<EventSource | null>(null);
  const cargarAbortRef = useRef<AbortController | null>(null);

  // ── Historial ────────────────────────────────────────────────────────────────
  const [historial, setHistorial] = useState<{ id: string; nombre: string; estado: string; cif: string; corredor_nombre: string }[]>([]);
  const histTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setHistorial([]); return; }
    if (histTimerRef.current) clearTimeout(histTimerRef.current);
    histTimerRef.current = setTimeout(async () => {
      try {
        const isCif = /^[A-Z0-9]{8,9}$/i.test(q.replace(/\s/g, ''));
        const param = isCif ? `cif=${encodeURIComponent(q.replace(/\s/g, '').toUpperCase())}` : `q=${encodeURIComponent(q)}`;
        const res = await fetch(`/api/flotas/historicas?${param}`);
        if (res.ok) setHistorial(await res.json());
      } catch { /* silent */ }
    }, 500);
    return () => { if (histTimerRef.current) clearTimeout(histTimerRef.current); };
  }, [query]);

  // ── Sort ──────────────────────────────────────────────────────────────────────
  const [sortEstCol, setSortEstCol] = useState<EstudioSortKey>('modificada');
  const [sortEstDir, setSortEstDir] = useState<'asc' | 'desc'>('desc');

  const handleEstSort = (col: EstudioSortKey) => {
    if (sortEstCol === col) setSortEstDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortEstCol(col); setSortEstDir(col === 'vehiculos' || col === 'avance' ? 'desc' : 'asc'); }
  };

  // Reset pagination when filters/sort change
  useEffect(() => { setShown(PAGE_SIZE); }, [estadoFilter, corredorFilter, sucursalFilter, query, sortEstCol, sortEstDir]);

  // ── Cargar ────────────────────────────────────────────────────────────────────
  const cargar = async () => {
    cargarAbortRef.current?.abort();
    const ctrl = new AbortController();
    cargarAbortRef.current = ctrl;
    cargarCorredoresDelServidor(ctrl.signal)
      .then(data => { if (!ctrl.signal.aborted) setCorredores(data); })
      .catch(() => { if (!ctrl.signal.aborted) setCorredores(listarCorredores()); });
    try {
      const serverCarpetas = await cargarCarpetasDelServidor(ctrl.signal);
      if (!ctrl.signal.aborted) {
        if (serverCarpetas.length > 0) setCarpetas(serverCarpetas.map(normalizarCarpeta));
        else { const local = listarCarpetas(); if (local.length === 0) setCarpetas([]); }
      }
    } catch {
      if (!ctrl.signal.aborted) {
        const local = listarCarpetas();
        if (local.length > 0) setCarpetas(local.map(normalizarCarpeta));
      }
    }
  };

  useEffect(() => {
    cargar();
    const es = new EventSource('/api/flotas/eventos');
    sseRef.current = es;
    es.onmessage = (e) => { if (e.data === 'update') cargar(); };
    es.onerror = () => es.close();
    const interval = setInterval(cargar, 30_000);
    return () => { clearInterval(interval); es.close(); sseRef.current = null; cargarAbortRef.current?.abort(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Maps ───────────────────────────────────────────────────────────────────
  const corredorMap = useMemo(() => {
    const m = new Map<string, Corredor>();
    corredores.forEach(c => m.set(c.id, c));
    return m;
  }, [corredores]);

  const corredorNames = useMemo(() =>
    ['TODOS', ...Array.from(new Set(carpetas.map(c => (c.corredor_id ? corredorMap.get(c.corredor_id)?.nombre : null) ?? 'Sin corredor')))],
  [carpetas, corredorMap]);

  const sucursalesUnicas = useMemo(() =>
    Array.from(new Set(corredores.map(c => c.sucursal).filter(Boolean) as string[])).sort(),
  [corredores]);

  // ── Filtered ──────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => carpetas.filter(c => {
    const corr = c.corredor_id ? corredorMap.get(c.corredor_id) : null;
    const corrName = corr?.nombre ?? 'Sin corredor';
    if (estadoFilter && c.estado !== estadoFilter) return false;
    if (corredorFilter !== 'TODOS' && corrName !== corredorFilter) return false;
    if (sucursalFilter && corr?.sucursal !== sucursalFilter) return false;
    const q = query.trim().toLowerCase();
    if (q) {
      const cif = (c.header?.cif ?? '').toLowerCase();
      const tomador = (c.header?.tomador ?? '').toLowerCase();
      if (!c.nombre.toLowerCase().includes(q) && !corrName.toLowerCase().includes(q) && !cif.includes(q) && !tomador.includes(q)) return false;
    }
    return true;
  }), [carpetas, query, estadoFilter, corredorFilter, sucursalFilter, corredorMap]);

  const sortedFiltered = useMemo(() => [...filtered].sort((a, b) => {
    const corrA = a.corredor_id ? (corredorMap.get(a.corredor_id)?.nombre ?? '') : '';
    const corrB = b.corredor_id ? (corredorMap.get(b.corredor_id)?.nombre ?? '') : '';
    const sucA  = a.corredor_id ? (corredorMap.get(a.corredor_id)?.sucursal ?? '') : '';
    const sucB  = b.corredor_id ? (corredorMap.get(b.corredor_id)?.sucursal ?? '') : '';
    let cmp = 0;
    switch (sortEstCol) {
      case 'nombre':    cmp = a.nombre.localeCompare(b.nombre, 'es'); break;
      case 'corredor':  cmp = corrA.localeCompare(corrB, 'es'); break;
      case 'sucursal':  cmp = sucA.localeCompare(sucB, 'es'); break;
      case 'vehiculos': cmp = numVehiculos(a) - numVehiculos(b); break;
      case 'avance':    cmp = avanceCarpeta(a) - avanceCarpeta(b); break;
      case 'estado':    cmp = (a.estado ?? '').localeCompare(b.estado ?? '', 'es'); break;
      case 'modificada': cmp = (a.actualizadaEn ?? '').localeCompare(b.actualizadaEn ?? ''); break;
    }
    return sortEstDir === 'asc' ? cmp : -cmp;
  }), [filtered, sortEstCol, sortEstDir, corredorMap]);

  // ── Scope stats ────────────────────────────────────────────────────────────
  const scope = filtered;
  const totalVehiculos  = useMemo(() => scope.reduce((s, c) => s + numVehiculos(c), 0), [scope]);
  const totalCorredores = useMemo(() => new Set(scope.map(c => c.corredor_id).filter(Boolean)).size, [scope]);
  const avgAvance       = useMemo(() => scope.length ? scope.reduce((s, c) => s + avanceCarpeta(c), 0) / scope.length : 0, [scope]);
  const totalPrima      = useMemo(() => scope.reduce((s, c) => s + totalPrimaCarpeta(c), 0), [scope]);

  // ── Pipeline ────────────────────────────────────────────────────────────────
  const pipelineData = useMemo(() => {
    const counts = new Array(8).fill(0);
    for (const c of scope) {
      const flags = stepFlags(c);
      let placed = false;
      for (let i = 0; i < PIPE_STEP_IDX.length; i++) {
        if (!flags[PIPE_STEP_IDX[i]]) { counts[i]++; placed = true; break; }
      }
      if (!placed) counts[7]++;
    }
    const max = Math.max(...counts, 1);
    return PIPE_LABELS.map((label, i) => ({ label, key: PIPE_KEYS[i], no: PIPE_NOS[i], count: counts[i], pct: counts[i] / max }));
  }, [scope]);

  // ── Atención (3 tipos) ─────────────────────────────────────────────────────
  const atencionData = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const out: { c: FlotaCarpeta; why: string; val: string; u: number }[] = [];
    for (const c of scope) {
      // 1. Vence la póliza actual (≤30 días)
      if (['EN ESTUDIO', 'ESTUDIADA', 'OFERTADA'].includes(c.estado ?? '')) {
        const vcto = c.header?.fechaVencimiento;
        if (vcto) {
          const d = parseFechaVcto(vcto);
          if (d) {
            const dias = Math.ceil((d.getTime() - today.getTime()) / 86400000);
            if (dias >= 0 && dias <= 30)
              out.push({ c, why: 'Vence la póliza actual', val: dias + (dias === 1 ? ' día' : ' días'), u: dias <= 15 ? 2 : 1 });
          }
        }
      }
      // 2. Ofertada sin respuesta (≥15 días)
      if (c.estado === 'OFERTADA') {
        const last = [...(c.historico ?? [])].reverse().find(h => h.estadoNuevo === 'OFERTADA');
        if (last?.fecha) {
          const ofD = Math.floor((today.getTime() - new Date(last.fecha).getTime()) / 86400000);
          if (ofD >= 15) out.push({ c, why: 'Ofertada sin respuesta', val: ofD + ' días', u: 1 });
        }
      }
      // 3. Falta importar SINCO
      if (c.estado === 'EN ESTUDIO' && (c.trabajo?.length ?? 0) > 0 && (c.sincoResultados?.length ?? 0) === 0)
        out.push({ c, why: 'Falta importar SINCO', val: 'Paso 05', u: 0 });
    }
    return out.sort((a, b) => b.u - a.u).slice(0, 6);
  }, [scope]);

  // ── Drawer data builder ────────────────────────────────────────────────────
  const ctxLabel = estadoFilter
    ? ({ 'EN ESTUDIO': 'En estudio', 'ESTUDIADA': 'Estudiadas', 'OFERTADA': 'Ofertadas', 'CONTRATADA': 'Contratadas', 'RECHAZADA': 'Rechazadas' } as Record<string, string>)[estadoFilter] ?? estadoFilter
    : 'Todos los estados';

  const buildDrawerData = (mode: DrawerMode): DrawerData | null => {
    if (!mode || mode === 'nueva') return null;
    const S = scope;
    const totalV = S.reduce((s, c) => s + numVehiculos(c), 0);

    if (mode === 'flotas') {
      return {
        over: 'Resumen · ' + ctxLabel, title: 'Carpetas',
        desc: 'Carpetas de estudio del ámbito seleccionado, por estado.',
        stats: [['Carpetas', nf(S.length)], ['Vehículos', nf(totalV)]],
        head: ['Estado', 'Carpetas', '% del ámbito'],
        rows: ESTADOS.map(st => { const n = S.filter(c => c.estado === st).length; return [st, nf(n), S.length ? pc(n / S.length * 100) : '—']; }),
        fx: [['Carpetas', 'recuento de carpetas del ámbito = ' + nf(S.length)], ['Peso del estado', 'carpetas del estado ÷ ' + nf(S.length) + ' × 100']],
      };
    }
    if (mode === 'veh') {
      const T = [...S].sort((x, y) => numVehiculos(y) - numVehiculos(x)).filter(c => numVehiculos(c) > 0);
      return {
        over: 'Resumen · ' + ctxLabel, title: 'Vehículos registrados',
        desc: 'Vehículos cargados en las carpetas del ámbito.',
        stats: [['Vehículos', nf(totalV)], ['Carpetas con detalle', nf(T.length)]],
        head: ['Carpeta', 'Vehículos', '% del ámbito'],
        rows: T.slice(0, 150).map(c => [c.nombre, nf(numVehiculos(c)), pc(numVehiculos(c) / (totalV || 1) * 100)]),
        fx: [['Vehículos', 'Σ vehículos con matrícula de cada carpeta (TRABAJO si existe, si no ORIGINAL) = ' + nf(totalV)], ['Participación', 'vehículos de la carpeta ÷ total × 100']],
      };
    }
    if (mode === 'cor') {
      const m: Record<string, number> = {};
      S.forEach(c => { const n = (c.corredor_id ? corredorMap.get(c.corredor_id)?.nombre : null) ?? 'Sin corredor'; m[n] = (m[n] || 0) + 1; });
      const rows = Object.entries(m).sort((x, y) => y[1] - x[1]).slice(0, 150).map(([n, cnt]) => [n, nf(cnt)]);
      return {
        over: 'Resumen · ' + ctxLabel, title: 'Corredores vinculados',
        desc: 'Corredores con al menos una carpeta en el ámbito.',
        stats: [['Corredores', nf(rows.length)], ['Carpetas', nf(S.length)]],
        head: ['Corredor', 'Carpetas'], rows,
        fx: [['Corredores vinculados', 'recuento de corredores distintos con ≥ 1 carpeta = ' + nf(rows.length)]],
      };
    }
    if (mode === 'avance') {
      const STEP_NAMES = ['Datos generales', 'Automático', 'Original', 'Trabajo', 'SINCO', 'Informe', 'Oferta', 'Pre-emisión', 'Completo'];
      const avg = S.length ? S.reduce((s, c) => s + avanceCarpeta(c), 0) / S.length : 0;
      return {
        over: 'Resultado · ' + ctxLabel, title: 'Avance medio',
        desc: 'Pasos completados por carpeta, de los 8 del estudio.',
        stats: [['Avance medio', S.length ? dec(avg, 1) + ' de 8' : '—'], ['Carpetas', nf(S.length)]],
        head: ['Paso', 'Carpetas que lo completaron', '%'],
        rows: STEP_NAMES.map((name, i) => { const n = S.filter(c => stepFlags(c)[i]).length; return [name, nf(n), S.length ? pc(n / S.length * 100, 0) : '—']; }),
        fx: [['Avance de una carpeta', 'nº de pasos completados de 8'], ['Avance medio', 'Σ pasos completados ÷ nº de carpetas = ' + nf(S.reduce((s, c) => s + avanceCarpeta(c), 0)) + ' ÷ ' + nf(S.length)]],
      };
    }
    if (mode === 'prima') {
      const T = S.filter(c => totalPrimaCarpeta(c) > 0).sort((x, y) => totalPrimaCarpeta(y) - totalPrimaCarpeta(x));
      const total = S.reduce((s, c) => s + totalPrimaCarpeta(c), 0);
      return {
        over: 'Resultado · ' + ctxLabel, title: 'Prima ofertada',
        desc: 'Prima anual ofertada en las carpetas del ámbito.',
        stats: [['Prima total', eur(total)], ['Carpetas con prima', nf(T.length)]],
        head: ['Carpeta', 'Prima', 'Estado'],
        rows: T.slice(0, 150).map(c => [c.nombre, eur(totalPrimaCarpeta(c)), c.estado ?? '']),
        fx: [['Prima de la carpeta', 'Σ prima ofertada MMT de sus vehículos (paso 07)'], ['Prima total', 'Σ prima de las carpetas del ámbito']],
      };
    }
    if (typeof mode === 'object' && 'pipe' in mode) {
      const k = mode.pipe;
      const ki = PIPE_KEYS.indexOf(k);
      const pi = ki >= 0 ? PIPE_STEP_IDX[ki] : -1;
      const L2 = k === 'fin'
        ? S.filter(c => PIPE_STEP_IDX.every(i => stepFlags(c)[i]))
        : S.filter(c => pi >= 0 && !stepFlags(c)[pi] && (ki === 0 || PIPE_STEP_IDX.slice(0, ki).every(i => stepFlags(c)[i])));
      return {
        over: 'Dónde está cada estudio · ' + ctxLabel,
        title: k === 'fin' ? 'Estudios completos' : 'Pendientes de ' + (STEP_LABELS[k] ?? k),
        desc: k === 'fin' ? 'Carpetas con los 7 pasos principales completados.' : 'Carpetas cuyo primer paso pendiente es «' + (STEP_LABELS[k] ?? k) + '».',
        stats: [['Carpetas', nf(L2.length)], ['Vehículos', nf(L2.reduce((s, c) => s + numVehiculos(c), 0))]],
        head: ['Carpeta', 'Corredor', 'Avance'],
        rows: L2.slice(0, 150).map(c => [c.nombre, (c.corredor_id ? corredorMap.get(c.corredor_id)?.nombre : null) ?? 'Sin corredor', avanceCarpeta(c) + '/8']),
        fx: [['Paso pendiente', 'primer paso principal sin completar, en orden 01, 03, 04, 05, 06, 07, 08'], ['Paso 02 Automático', 'Es un camino alternativo: no bloquea ni se cuenta como pendiente.']],
      };
    }
    return null;
  };

  // ── Acciones ───────────────────────────────────────────────────────────────
  const handleCrear = (nombre: string, corredorId: string) => {
    const carpeta = crearCarpeta(nombre, corredorId || undefined, user ?? undefined);
    setDrawerMode(null);
    onSelect(normalizarCarpeta(carpeta));
  };

  const handleDescargarPlantilla = async () => {
    const blob = await generarPlantillaExcel(undefined, listarCorredores().map(c => c.nombre));
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'Plantilla_Flotas.xlsx'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleDescargarInforme = async () => {
    const XLSX = await import('xlsx');
    const rows = sortedFiltered.map(c => {
      const corr = c.corredor_id ? corredorMap.get(c.corredor_id) : null;
      return { 'Nombre': c.nombre, 'CIF': c.header?.cif ?? '', 'Tomador': c.header?.tomador ?? '', 'Corredor': corr?.nombre ?? '', 'Estado': c.estado ?? '', 'Vehículos': numVehiculos(c), 'Avance': `${avanceCarpeta(c)}/8`, 'Modificada': new Date(c.actualizadaEn).toLocaleDateString('es-ES') };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Estudio');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'Informe_Estudio.xlsx'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleEliminar = (id: string) => {
    eliminarCarpeta(id);
    setCarpetas(listarCarpetas().map(normalizarCarpeta));
    setConfirmDel(null);
  };

  const handleConfirmarEstado = () => {
    if (!pendingEstado) return;
    if (pendingEstado.estado === 'CONTRATADA' && !pendingEstado.fechaVencimiento.trim()) return;
    cambiarEstado(pendingEstado.id, pendingEstado.estado, pendingEstado.motivo || undefined);
    if (pendingEstado.estado === 'CONTRATADA' && pendingEstado.fechaVencimiento.trim()) {
      const carpeta = listarCarpetas().find(c => c.id === pendingEstado.id);
      if (carpeta) { carpeta.header = { ...carpeta.header, fechaVencimiento: pendingEstado.fechaVencimiento.trim() }; guardarCarpeta(carpeta); }
    }
    setCarpetas(listarCarpetas().map(normalizarCarpeta));
    setPendingEstado(null);
  };

  // ── SortBtn ────────────────────────────────────────────────────────────────
  const SortBtn = ({ col, label }: { col: EstudioSortKey; label: string }) => (
    <button onClick={() => handleEstSort(col)} className="th"
      aria-pressed={sortEstCol === col}
      aria-sort={sortEstCol === col ? (sortEstDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      {label}
    </button>
  );

  const drawerData = drawerMode !== null && drawerMode !== 'nueva' ? buildDrawerData(drawerMode) : null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="cs-scroll animate-in fade-in duration-500">

      {/* ── Drawers ─────────────────────────────────────────────────────── */}
      {drawerData && <DetailDrawer data={drawerData} onClose={() => setDrawerMode(null)} />}
      {drawerMode === 'nueva' && (
        <NuevaDrawer corredores={corredores} onCrear={handleCrear} onClose={() => setDrawerMode(null)} />
      )}

      {/* ── Intro ───────────────────────────────────────────────────────── */}
      <section className="intro">
        <div>
          <h1>Estudio de flotas</h1>
          <p>{new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="actions">
          <button onClick={() => setDrawerMode('nueva')} className="btn">Nueva carpeta</button>
          <button onClick={handleDescargarPlantilla} className="btn ghost">Plantilla</button>
          <button onClick={handleDescargarInforme} className="btn ghost">Descargar informe</button>
        </div>
      </section>

      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <section className="filterbar">
        <select value={estadoFilter} onChange={e => setEstadoFilter(e.target.value)} className="select" aria-label="Estado">
          <option value="">Todos los estados</option>
          {ESTADOS.map(e => <option key={e} value={e}>{capEstado(e)}</option>)}
        </select>
        <select value={sucursalFilter} onChange={e => setSucursalFilter(e.target.value)} className="select" aria-label="Sucursal">
          <option value="">Todas las sucursales</option>
          {sucursalesUnicas.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={corredorFilter} onChange={e => setCorredorFilter(e.target.value)} className="select" aria-label="Corredor">
          {corredorNames.map(c => <option key={c} value={c}>{c === 'TODOS' ? 'Todos los corredores' : c}</option>)}
        </select>
      </section>

      {/* ── KPIs ────────────────────────────────────────────────────────── */}
      <div className="kpis">
        <button className="kpi" onClick={() => setDrawerMode('flotas')}>
          <span className="l">Carpetas</span>
          <span className="v">{nf(scope.length)}</span>
          <span className="n">{estadoFilter ? 'Estado: ' + estadoFilter.toLowerCase() : nf(scope.filter(c => c.estado === 'EN ESTUDIO').length) + ' en estudio'}</span>
        </button>
        <button className="kpi" onClick={() => setDrawerMode('veh')}>
          <span className="l">Vehículos registrados</span>
          <span className="v">{nf(totalVehiculos)}</span>
          <span className="n">en carpetas del ámbito</span>
        </button>
        <button className="kpi" onClick={() => setDrawerMode('cor')}>
          <span className="l">Corredores vinculados</span>
          <span className="v">{nf(totalCorredores)}</span>
          <span className="n">corredores únicos</span>
        </button>
        <button className="kpi" onClick={() => setDrawerMode('avance')}>
          <span className="l">Avance medio</span>
          <span className="v">
            {scope.length ? dec(avgAvance, 1) : '—'}
            <span style={{ fontSize: '0.45em', fontWeight: 400, color: 'var(--sub)', letterSpacing: 0, marginLeft: 3 }}>/8</span>
          </span>
          <span className="n">pasos completados</span>
        </button>
        <button className="kpi" onClick={() => setDrawerMode('prima')}>
          <span className="l">Prima ofertada</span>
          <span className="v mny">{totalPrima > 0 ? eur(totalPrima) : '—'}</span>
          <span className="n">suma de las carpetas</span>
        </button>
      </div>

      {/* ── Grid 2: Pipeline + Atención ─────────────────────────────────── */}
      <div className="grid2">
        <section>
          <div className="shead">
            <h2>Dónde está cada estudio</h2>
            <p className="sub-desc">{ctxLabel} &middot; {nf(scope.length)} carpetas</p>
          </div>
          <div className="bars">
            {pipelineData.map(item => (
              <button key={item.key} className="bar stp" onClick={() => setDrawerMode({ pipe: item.key })}>
                <span className="bn"><span className="no">{item.no}</span>{item.label}</span>
                <span className="bt"><span className="bf" style={{ width: `${Math.round(item.pct * 100)}%` }} /></span>
                <span className="bv">{nf(item.count)}</span>
              </button>
            ))}
          </div>
          <p className="note">Cada flota cuenta en el primer paso que le falta por completar.</p>
        </section>
        <section>
          <div className="shead">
            <h2>Requieren atención</h2>
            <p className="sub-desc">
              {nf(atencionData.length)} {atencionData.length === 1 ? 'aviso' : 'avisos'} &middot; vencimientos, ofertas sin respuesta y SINCO pendiente
            </p>
          </div>
          {atencionData.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--quiet)', margin: 0 }}>Nada pendiente en este ámbito.</p>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Carpeta</th>
                  <th>Motivo</th>
                  <th>Plazo</th>
                </tr>
              </thead>
              <tbody>
                {atencionData.map((a, i) => (
                  <tr key={i} onClick={() => onSelect(a.c)} style={{ cursor: 'pointer' }}>
                    <td style={{ color: 'var(--text)' }}>
                      <span style={{ fontWeight: 600 }}>{a.c.nombre}</span>
                      {a.c.corredor_id && corredorMap.get(a.c.corredor_id)?.nombre && (
                        <div style={{ fontSize: 12, color: 'var(--quiet)', marginTop: 2 }}>{corredorMap.get(a.c.corredor_id)!.nombre}</div>
                      )}
                    </td>
                    <td style={{ color: 'var(--sub)' }}>{a.why}</td>
                    <td>
                      <span className="tag" style={{ '--c': a.u >= 2 ? 'var(--warn)' : 'var(--blue)' } as React.CSSProperties}>
                        {a.val}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {/* ── Confirmación cambio de estado ───────────────────────────────── */}
      {pendingEstado && (
        <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 10, background: pendingEstado.estado === 'RECHAZADA' ? 'rgba(239,77,90,0.08)' : 'rgba(240,185,77,0.08)', border: `1px solid ${pendingEstado.estado === 'RECHAZADA' ? 'rgba(239,77,90,0.3)' : 'rgba(240,185,77,0.3)'}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, flex: 1, color: pendingEstado.estado === 'RECHAZADA' ? 'var(--t-red)' : pendingEstado.estado === 'CONTRATADA' ? 'var(--t-green)' : 'var(--t-amber)' }}>
              Cambiar estado a <b>{pendingEstado.estado}</b>. ¿Confirmar?
            </span>
            <button onClick={handleConfirmarEstado}
              disabled={pendingEstado.estado === 'CONTRATADA' && !pendingEstado.fechaVencimiento.trim()}
              style={{ background: pendingEstado.estado === 'RECHAZADA' ? 'var(--t-red)' : pendingEstado.estado === 'CONTRATADA' ? 'var(--t-green)' : 'var(--t-amber)', border: 'none', borderRadius: 8, padding: '5px 16px', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: (pendingEstado.estado === 'CONTRATADA' && !pendingEstado.fechaVencimiento.trim()) ? 0.5 : 1 }}>
              Confirmar
            </button>
            <button onClick={() => setPendingEstado(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t-text-3)', fontSize: 12, padding: '5px 8px' }}>Cancelar</button>
          </div>
          {pendingEstado.estado === 'CONTRATADA' && (
            <input autoFocus placeholder="Fecha de vencimiento (DD/MM/YYYY) *" value={pendingEstado.fechaVencimiento}
              onChange={e => setPendingEstado(p => p ? { ...p, fechaVencimiento: e.target.value } : p)}
              onKeyDown={e => { if (e.key === 'Enter') handleConfirmarEstado(); if (e.key === 'Escape') setPendingEstado(null); }}
              style={{ width: '100%', fontSize: 13, padding: '7px 12px', borderRadius: 8, boxSizing: 'border-box', background: 'var(--t-surface)', border: '1px solid var(--t-green)', color: 'var(--t-text)', outline: 'none' }} />
          )}
          {pendingEstado.estado === 'RECHAZADA' && (
            <input autoFocus placeholder="Motivo del rechazo" value={pendingEstado.motivo}
              onChange={e => setPendingEstado(p => p ? { ...p, motivo: e.target.value } : p)}
              onKeyDown={e => { if (e.key === 'Enter') handleConfirmarEstado(); if (e.key === 'Escape') setPendingEstado(null); }}
              style={{ width: '100%', fontSize: 13, padding: '7px 12px', borderRadius: 8, boxSizing: 'border-box', background: 'var(--t-surface)', border: '1px solid var(--t-red)', color: 'var(--t-text)', outline: 'none' }} />
          )}
        </div>
      )}

      {/* ── Directorio de carpetas ───────────────────────────────────────── */}
      <section className="dir">
        <div className="dirhead">
          <div>
            <h2>Carpetas</h2>
            <p className="sub-desc">
              {filtered.length} resultado{filtered.length !== 1 ? 's' : ''} · {estadoFilter ? capEstado(estadoFilter).toLowerCase() : 'todos los estados'}
            </p>
          </div>
          <input
            placeholder="Buscar por nombre, CIF, tomador o corredor"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="search"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="empty">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--quiet)" strokeWidth="1.4" strokeLinecap="round">
              <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
            </svg>
            <p style={{ margin: 0 }}>
              {carpetas.length === 0 ? 'Sin carpetas. Crea la primera con el botón superior.'
                : query.trim() ? `Sin resultados para «${query.trim()}»`
                : 'Sin resultados para los filtros actuales.'}
            </p>
            {query.trim() && <button onClick={() => setQuery('')} className="mini">Limpiar búsqueda</button>}
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
            <table className="tbl" style={{ minWidth: 940 }}>
              <colgroup>
                <col style={{ width: '28%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '5%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '8%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th><SortBtn col="nombre" label="Carpeta" /></th>
                  <th><SortBtn col="corredor" label="Corredor" /></th>
                  <th><SortBtn col="sucursal" label="Sucursal" /></th>
                  <th><SortBtn col="vehiculos" label="Veh." /></th>
                  <th><SortBtn col="estado" label="Estado" /></th>
                  <th><SortBtn col="avance" label="Avance" /></th>
                  <th><SortBtn col="modificada" label="Modificada" /></th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {sortedFiltered.slice(0, shown).map(c => {
                  const corr = c.corredor_id ? corredorMap.get(c.corredor_id) : null;
                  const isDelConfirm = confirmDel === c.id;
                  const flags = stepFlags(c);
                  const done = flags.filter(Boolean).length;
                  return (
                    <tr key={c.id} onClick={() => onSelect(c)}>
                      {/* Carpeta */}
                      <td style={{ color: 'var(--text)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 650, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>
                            {c.nombre || '(sin nombre)'}
                          </span>
                          {Array.isArray(c.estudiando_por) && c.estudiando_por.length > 0 && c.estudiando_por.map((u: string) => (
                            <span key={u} style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 999, background: u === user ? 'rgba(32,201,130,0.18)' : 'rgba(240,185,77,0.18)', color: u === user ? 'var(--t-green)' : 'var(--t-amber)', border: `1px solid ${u === user ? 'rgba(32,201,130,0.35)' : 'rgba(240,185,77,0.35)'}` }}>● {u}</span>
                          ))}
                        </div>
                        {(c.header?.cif || c.header?.tomador) && (
                          <div style={{ fontSize: 12, color: 'var(--sub)', marginTop: 3 }}>
                            {c.header.cif && <span style={{ fontFamily: 'monospace', letterSpacing: '0.04em' }}>{c.header.cif}</span>}
                            {c.header.cif && c.header.tomador && <span style={{ margin: '0 4px', opacity: 0.4 }}>·</span>}
                            {c.header.tomador && <span>{c.header.tomador}</span>}
                          </div>
                        )}
                        {c.estado === 'RECHAZADA' && (() => {
                          const m = [...(c.historico ?? [])].reverse().find(h => h.estadoNuevo === 'RECHAZADA' && h.motivo)?.motivo;
                          return m ? <div style={{ fontSize: 11, color: 'var(--t-red)', fontStyle: 'italic', marginTop: 2 }}>✕ {m}</div> : null;
                        })()}
                      </td>
                      {/* Corredor */}
                      <td style={{ fontSize: 13, color: 'var(--sub)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {corr?.nombre ?? <span style={{ color: 'var(--quiet)' }}>—</span>}
                      </td>
                      {/* Sucursal */}
                      <td style={{ fontSize: 13, color: 'var(--sub)' }}>
                        {corr?.sucursal ?? <span style={{ color: 'var(--quiet)' }}>—</span>}
                      </td>
                      {/* Veh. */}
                      <td style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>
                        {nf(numVehiculos(c))}
                      </td>
                      {/* Estado */}
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ position: 'relative', display: 'inline-flex' }}>
                          <select value={c.estado}
                            onChange={e => { const nuevo = e.target.value as EstadoFlota; if (nuevo !== c.estado) setPendingEstado({ id: c.id, estado: nuevo, motivo: '', fechaVencimiento: '' }); }}
                            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}>
                            {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                          </select>
                          <EstadoBadge estado={c.estado} />
                        </div>
                      </td>
                      {/* Avance */}
                      <td>
                        <div className="prog">
                          <span className="seg8">{flags.map((on, i) => <i key={i} className={on ? 'on' : ''} />)}</span>
                          <b>{done}/8</b>
                        </div>
                      </td>
                      {/* Modificada */}
                      <td style={{ fontSize: 13, color: 'var(--sub)', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtModificada(c.actualizadaEn)}
                      </td>
                      {/* Eliminar */}
                      <td className="rowact" onClick={e => e.stopPropagation()}>
                        {!isDelConfirm ? (
                          <button onClick={() => setConfirmDel(c.id)} className="mini danger">Eliminar</button>
                        ) : (
                          <div className="rowconf">
                            <button onClick={() => handleEliminar(c.id)} className="mini pri">Confirmar</button>
                            <button onClick={() => setConfirmDel(null)} className="mini">Cancelar</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            {sortedFiltered.length > shown && (
              <div className="more">
                <button onClick={() => setShown(s => s + PAGE_SIZE)}>
                  Mostrar {Math.min(PAGE_SIZE, sortedFiltered.length - shown)} más &middot; quedan {nf(sortedFiltered.length - shown)}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* ── Historial previo ─────────────────────────────────────────────── */}
      {query.trim().length >= 2 && historial.length > 0 && (
        <div style={{ marginTop: 20, padding: '14px 20px', borderRadius: 12, background: 'rgba(240,185,77,0.06)', border: '1px solid rgba(240,185,77,0.2)' }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-amber)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 10px 0' }}>
            Historial &middot; {historial.length} resultado{historial.length !== 1 ? 's' : ''} en base de datos
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {historial.map(h => {
              const cfg: Record<string, { color: string; border: string; bg: string }> = {
                CONTRATADA:   { color: 'var(--t-green)',  border: 'rgba(32,201,130,0.3)',  bg: 'rgba(32,201,130,0.1)'  },
                RECHAZADA:    { color: 'var(--t-red)',    border: 'rgba(239,77,90,0.3)',   bg: 'rgba(239,77,90,0.08)' },
                'EN ESTUDIO': { color: 'var(--t-amber)',  border: 'rgba(240,185,77,0.3)',  bg: 'rgba(240,185,77,0.08)' },
                COTIZADA:     { color: 'var(--t-violet)', border: 'rgba(124,92,252,0.3)',  bg: 'rgba(124,92,252,0.08)' },
              };
              const hcfg = cfg[h.estado] ?? cfg['EN ESTUDIO'];
              return (
                <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 9, background: 'var(--t-surface)', border: `1px solid ${hcfg.border}` }}>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: hcfg.bg, color: hcfg.color, border: `1px solid ${hcfg.border}`, textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>{h.estado}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 650, color: 'var(--t-text)' }}>{h.nombre}</span>
                    <div style={{ fontSize: 11, color: 'var(--t-text-3)', marginTop: 2, display: 'flex', gap: 8 }}>
                      {h.cif && <span style={{ fontFamily: 'monospace' }}>{h.cif}</span>}
                      {h.corredor_nombre && <span>{h.corredor_nombre}</span>}
                    </div>
                  </div>
                  <a href="/emission" target="_blank" rel="noreferrer" style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, background: 'var(--t-line-soft)', color: 'var(--t-blue)', border: '1px solid var(--t-line)', textDecoration: 'none', flexShrink: 0 }}>Ver ficha</a>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
