"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  listarCarpetas, crearCarpeta, guardarCarpeta, eliminarCarpeta, generarPlantillaExcel,
  listarCorredores, crearCorredor, cambiarEstado,
  cargarCarpetasDelServidor, cargarCorredoresDelServidor,
  type FlotaCarpeta, type Corredor, type EstadoFlota,
} from '@/core/flotas';
import { useAuth } from '@/context/AuthContext';

const ESTADOS: EstadoFlota[] = ['EN ESTUDIO', 'OFERTADA', 'CONTRATADA', 'RECHAZADA'];

type EstudioSortKey = 'nombre' | 'corredor' | 'sucursal' | 'vehiculos' | 'estado' | 'modificada';

// ─── Normalización ──────────────────────────────────────────────────────────

function normalizarCarpeta(c: FlotaCarpeta): FlotaCarpeta {
  return { ...c, estado: c.estado ?? 'EN ESTUDIO', historico: c.historico ?? [] };
}

// ─── Formulario crear corredor ──────────────────────────────────────────────

const EMPTY_CORREDOR = { nombre: '', cif: '', porcentajeComision: '' };

function CrearCorredorForm({ onCreado, onCancelar }: {
  onCreado: (c: Corredor) => void; onCancelar: () => void;
}) {
  const [form, setForm] = useState(EMPTY_CORREDOR);
  const set = (k: keyof typeof EMPTY_CORREDOR, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    if (!form.nombre.trim()) return;
    const corredor = crearCorredor({
      nombre: form.nombre.trim(), cif: form.cif.trim(),
      porcentajeComision: parseFloat(form.porcentajeComision) || 0,
      periodicidad: 'mensual', formaPago: '',
      contacto: '', email: '', telefono: '', observaciones: '',
    });
    onCreado(corredor);
  };

  return (
    <div style={{ marginTop: 10, padding: 14, borderRadius: 10, background: 'var(--t-line-soft)', border: '1px solid var(--t-line)' }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, margin: '0 0 10px' }}>
        Nuevo corredor
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <input placeholder="Nombre *" value={form.nombre} onChange={e => set('nombre', e.target.value)} className="panel-input" style={{ fontSize: 12 }} />
        </div>
        <input placeholder="CIF" value={form.cif} onChange={e => set('cif', e.target.value)} className="panel-input" style={{ fontSize: 12 }} />
        <input placeholder="% Comisión" inputMode="decimal" value={form.porcentajeComision} onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d*$/.test(v)) set('porcentajeComision', v); }} className="panel-input" style={{ fontSize: 12 }} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={handleSubmit} disabled={!form.nombre.trim()} style={{
          fontSize: 12, fontWeight: 600, padding: '6px 16px', borderRadius: 8,
          background: form.nombre.trim() ? 'var(--t-blue)' : 'rgba(67,135,255,0.3)',
          color: '#fff', border: 'none', cursor: form.nombre.trim() ? 'pointer' : 'not-allowed',
        }}>Crear corredor</button>
        <button onClick={onCancelar} style={{
          fontSize: 12, fontWeight: 500, padding: '6px 14px', borderRadius: 8,
          background: 'none', color: 'var(--t-text-2)',
          border: '1px solid var(--t-line)', cursor: 'pointer',
        }}>Cancelar</button>
      </div>
    </div>
  );
}

// ─── EstadoBadge ────────────────────────────────────────────────────────────

export function EstadoBadge({ estado, small }: { estado: string; small?: boolean }) {
  const textColor: Record<string, string> = {
    'EN ESTUDIO': 'var(--t-text-2)',
    'OFERTADA':   'var(--t-amber)',
    'CONTRATADA': 'var(--t-green)',
    'RECHAZADA':  'var(--t-red)',
  };
  return (
    <span style={{
      fontSize: small ? 9 : 10, fontWeight: 700,
      padding: small ? '2px 5px' : '3px 8px',
      borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.06em',
      background: 'var(--t-line-soft)',
      border: '1px solid var(--t-line)',
      color: textColor[estado] ?? 'var(--t-text-2)',
      whiteSpace: 'nowrap',
    }}>
      {estado}
    </span>
  );
}

// ─── CarpetaScreen ──────────────────────────────────────────────────────────

interface Props {
  onSelect: (carpeta: FlotaCarpeta) => void;
}

export default function CarpetaScreen({ onSelect }: Props) {
  const { user } = useAuth();
  const [carpetas, setCarpetas] = useState<FlotaCarpeta[]>(() => listarCarpetas().map(normalizarCarpeta));
  const [nombre, setNombre] = useState('');
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [corredores, setCorredores] = useState<Corredor[]>([]);
  const [corredorId, setCorredorId] = useState<string>('');
  const [showCrearCorredor, setShowCrearCorredor] = useState(false);
  const [query, setQuery] = useState('');
  const [corredorFilter, setCorredorFilter] = useState('TODOS');
  const [sucursalFilter, setSucursalFilter] = useState('');
  const [comercialFilter, setComercialFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const sseRef = useRef<EventSource | null>(null);
  const cargarAbortRef = useRef<AbortController | null>(null);

  // ── Historial (flotas_historicas) ──────────────────────────────────────────
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

  // ── Sort estado ─────────────────────────────────────────────────────────────
  const [sortEstCol, setSortEstCol] = useState<EstudioSortKey>('nombre');
  const [sortEstDir, setSortEstDir] = useState<'asc' | 'desc'>('asc');

  const handleEstSort = (col: EstudioSortKey) => {
    if (sortEstCol === col) setSortEstDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortEstCol(col); setSortEstDir('asc'); }
  };

  // ── Stats (sobre todas las EN ESTUDIO sin filtros de búsqueda) ───────────
  const estudiadasTotal = useMemo(() => carpetas.filter(c => c.estado === 'EN ESTUDIO'), [carpetas]);

  const totalVehiculos = useMemo(() =>
    estudiadasTotal.reduce((sum, c) => sum + ((c.trabajo?.length > 0 ? c.trabajo : c.original)?.filter((r: Record<string, unknown>) => (r['matricula'] as string)?.trim()).length ?? 0), 0),
  [estudiadasTotal]);

  const totalCorredores = useMemo(() =>
    new Set(estudiadasTotal.map(c => c.corredor_id).filter(Boolean)).size,
  [estudiadasTotal]);

  // Estado change confirmation per row
  const [pendingEstado, setPendingEstado] = useState<{ id: string; estado: EstadoFlota; motivo: string; fechaVencimiento: string } | null>(null);

  const cargar = async () => {
    // Cancel any in-flight fetch before starting a new one
    cargarAbortRef.current?.abort();
    const ctrl = new AbortController();
    cargarAbortRef.current = ctrl;

    cargarCorredoresDelServidor(ctrl.signal)
      .then(data => { if (!ctrl.signal.aborted) setCorredores(data); })
      .catch(() => { if (!ctrl.signal.aborted) setCorredores(listarCorredores()); });

    try {
      const serverCarpetas = await cargarCarpetasDelServidor(ctrl.signal);
      if (!ctrl.signal.aborted) {
        // Guard: server returning empty when we have local data = transient failure
        if (serverCarpetas.length > 0) {
          setCarpetas(serverCarpetas.map(normalizarCarpeta));
        } else {
          const local = listarCarpetas();
          if (local.length === 0) setCarpetas([]);
          // else: keep current state, server is temporarily empty
        }
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

    // SSE — actualizaciones al instante cuando alguien crea/guarda/elimina
    const es = new EventSource('/api/flotas/eventos');
    sseRef.current = es;
    es.onmessage = (e) => { if (e.data === 'update') cargar(); };
    es.onerror = () => es.close(); // el fallback polling cubre la reconexión

    // Fallback polling cada 30s por si el SSE falla
    const interval = setInterval(cargar, 30_000);
    return () => {
      clearInterval(interval);
      es.close();
      sseRef.current = null;
      cargarAbortRef.current?.abort();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const corredorMap = useMemo(() => {
    const m = new Map<string, Corredor>();
    corredores.forEach(c => m.set(c.id, c));
    return m;
  }, [corredores]);

  // Opciones dinamicas de corredor para el filtro
  const corredorNames = useMemo(() => ['TODOS', ...Array.from(new Set(carpetas.map(c => {
    const corr = c.corredor_id ? corredorMap.get(c.corredor_id) : null;
    return corr?.nombre ?? 'Sin corredor';
  })))], [carpetas, corredorMap]);

  // Sucursales y comerciales unicos de los corredores existentes
  const sucursalesUnicas = useMemo(() => {
    const set = new Set(corredores.map(c => c.sucursal).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [corredores]);

  const comercialesUnicos = useMemo(() => {
    const set = new Set(corredores.map(c => c.comercial).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [corredores]);

  const filtered = useMemo(() => {
    return carpetas.filter(c => {
      const corr = c.corredor_id ? corredorMap.get(c.corredor_id) : null;
      const corrName = corr?.nombre ?? 'Sin corredor';

      if (corredorFilter !== 'TODOS' && corrName !== corredorFilter) return false;
      if (c.estado !== 'EN ESTUDIO') return false;
      if (sucursalFilter && corr?.sucursal !== sucursalFilter) return false;
      if (comercialFilter && (corr?.comercial ?? '').toLowerCase() !== comercialFilter.toLowerCase()) return false;
      const q = query.trim().toLowerCase();
      if (q) {
        const cif     = (c.header?.cif     ?? '').toLowerCase();
        const tomador = (c.header?.tomador ?? '').toLowerCase();
        const nombre  = c.nombre.toLowerCase();
        if (!nombre.includes(q) && !corrName.toLowerCase().includes(q) && !cif.includes(q) && !tomador.includes(q)) return false;
      }
      return true;
    });
  }, [carpetas, query, corredorFilter, sucursalFilter, comercialFilter, corredorMap]);

  const sortedFiltered = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const corrA = a.corredor_id ? (corredorMap.get(a.corredor_id)?.nombre ?? '') : '';
      const corrB = b.corredor_id ? (corredorMap.get(b.corredor_id)?.nombre ?? '') : '';
      const sucA = a.corredor_id ? (corredorMap.get(a.corredor_id)?.sucursal ?? '') : '';
      const sucB = b.corredor_id ? (corredorMap.get(b.corredor_id)?.sucursal ?? '') : '';
      const vehA = (a.trabajo?.length > 0 ? a.trabajo : a.original)?.filter((r: Record<string, unknown>) => (r['matricula'] as string)?.trim()).length ?? 0;
      const vehB = (b.trabajo?.length > 0 ? b.trabajo : b.original)?.filter((r: Record<string, unknown>) => (r['matricula'] as string)?.trim()).length ?? 0;
      let cmp = 0;
      switch (sortEstCol) {
        case 'nombre':    cmp = a.nombre.localeCompare(b.nombre, 'es'); break;
        case 'corredor':  cmp = corrA.localeCompare(corrB, 'es'); break;
        case 'sucursal':  cmp = sucA.localeCompare(sucB, 'es'); break;
        case 'vehiculos': cmp = vehA - vehB; break;
        case 'estado':    cmp = (a.estado ?? '').localeCompare(b.estado ?? '', 'es'); break;
        case 'modificada':cmp = a.actualizadaEn.localeCompare(b.actualizadaEn); break;
      }
      return sortEstDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortEstCol, sortEstDir, corredorMap]);

  const handleCrear = () => {
    const n = nombre.trim();
    if (!n) return;
    const carpeta = crearCarpeta(n, corredorId || undefined, user ?? undefined);
    setNombre(''); setCorredorId(''); setShowCrearCorredor(false); setCreating(false);
    onSelect(normalizarCarpeta(carpeta));
  };

  const handleCorredorChange = (val: string) => {
    if (val === '__crear__') { setShowCrearCorredor(true); setCorredorId(''); }
    else { setShowCrearCorredor(false); setCorredorId(val); }
  };

  const handleCorredorCreado = (c: Corredor) => {
    setCorredores(listarCorredores()); setCorredorId(c.id); setShowCrearCorredor(false);
  };

  const handleDescargarPlantilla = async () => {
    const blob = await generarPlantillaExcel(undefined, listarCorredores().map(c => c.nombre));
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'Plantilla_Flotas.xlsx'; a.click();
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
      if (carpeta) {
        carpeta.header = { ...carpeta.header, fechaVencimiento: pendingEstado.fechaVencimiento.trim() };
        guardarCarpeta(carpeta);
      }
    }
    setCarpetas(listarCarpetas().map(normalizarCarpeta));
    setPendingEstado(null);
  };

  const filterStyle: React.CSSProperties = {
    height: 42, border: '1px solid var(--t-line)', borderRadius: 9,
    background: 'var(--t-surface)', color: 'var(--t-text)', fontSize: 13,
    fontFamily: 'inherit', outline: 'none', padding: '0 14px', cursor: 'pointer',
  };

  const thStyle: React.CSSProperties = {
    textAlign: 'left', padding: '0 12px 14px 0',
    borderBottom: '1px solid var(--t-line)',
    whiteSpace: 'nowrap',
  };

  const tdStyle: React.CSSProperties = {
    padding: '16px 12px 16px 0',
    borderBottom: '1px solid var(--t-line)',
    verticalAlign: 'middle',
  };

  const SortBtn = ({ col, label }: { col: EstudioSortKey; label: string }) => {
    const active = sortEstCol === col;
    return (
      <button onClick={() => handleEstSort(col)}
        aria-sort={active ? (sortEstDir === 'asc' ? 'ascending' : 'descending') : 'none'}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          font: 'inherit', fontSize: 11, letterSpacing: '0.07em', textTransform: 'uppercase',
          color: active ? 'var(--t-text-2)' : 'var(--t-text-3)',
          fontWeight: active ? 700 : 600,
        }}>{label}</button>
    );
  };

  return (
    <div className="animate-in fade-in duration-500" style={{ padding: '28px 32px 60px', height: '100%', overflowY: 'auto', flexShrink: 0 }}>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 25 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 34, fontWeight: 680, letterSpacing: '-0.04em', color: 'var(--t-text)' }}>
            Estudio de Flotas
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--t-text-2)' }}>
            Carpetas en estudio · Vista general
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          <button onClick={handleDescargarPlantilla} style={{
            height: 38, padding: '0 16px', borderRadius: 9,
            border: '1px solid var(--t-line)', background: 'transparent',
            color: 'var(--t-text)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
          }}>Plantilla</button>
          <button onClick={() => setCreating(true)} style={{
            height: 38, padding: '0 18px', borderRadius: 9,
            background: 'var(--t-blue)', border: 'none',
            color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}>+ Nueva carpeta</button>
        </div>
      </div>

      {/* ── Stats ────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        marginTop: 33, paddingBottom: 26, borderBottom: '1px solid var(--t-line)',
      }}>
        <div>
          <strong style={{ display: 'block', fontSize: 47, fontWeight: 650, letterSpacing: '-0.05em', lineHeight: 1, color: 'var(--t-text)' }}>
            {estudiadasTotal.length}
          </strong>
          <span style={{ fontSize: 11, letterSpacing: '0.09em', color: 'var(--t-text-2)', textTransform: 'uppercase' }}>
            Carpetas en estudio
          </span>
        </div>
        <div style={{ textAlign: 'center' }}>
          <strong style={{ display: 'block', fontSize: 47, fontWeight: 650, letterSpacing: '-0.05em', lineHeight: 1, color: 'var(--t-text)' }}>
            {totalVehiculos}
          </strong>
          <span style={{ fontSize: 11, letterSpacing: '0.09em', color: 'var(--t-text-2)', textTransform: 'uppercase' }}>
            Vehículos registrados
          </span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <strong style={{ display: 'block', fontSize: 47, fontWeight: 650, letterSpacing: '-0.05em', lineHeight: 1, color: 'var(--t-text)' }}>
            {totalCorredores}
          </strong>
          <span style={{ fontSize: 11, letterSpacing: '0.09em', color: 'var(--t-text-2)', textTransform: 'uppercase' }}>
            Corredores vinculados
          </span>
        </div>
      </div>

      {/* ── Filtros ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 25 }}>
        <div style={{
          ...filterStyle, cursor: 'default',
          display: 'flex', alignItems: 'center', gap: 8,
          flex: 1, minWidth: 250, maxWidth: 340,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--t-text-3)', flexShrink: 0 }}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          <input placeholder="Buscar nombre, CIF o tomador…" value={query} onChange={e => setQuery(e.target.value)} style={{
            background: 'none', border: 'none', outline: 'none',
            color: 'var(--t-text)', fontSize: 13, padding: 0, width: '100%', fontFamily: 'inherit',
          }} />
          {query && (
            <button onClick={() => setQuery('')} aria-label="Limpiar" style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--t-text-3)', padding: 0, fontSize: 18, lineHeight: 1, flexShrink: 0,
            }}>×</button>
          )}
        </div>
        <select value={corredorFilter} onChange={e => setCorredorFilter(e.target.value)} className="t-select" style={{ height: 42, minWidth: 200, borderRadius: 9, padding: '0 14px' }}>
          {corredorNames.map(c => <option key={c} value={c}>{c === 'TODOS' ? 'Todos los corredores' : c}</option>)}
        </select>
        {sucursalesUnicas.length > 0 && (
          <select value={sucursalFilter} onChange={e => setSucursalFilter(e.target.value)} className="t-select" style={{ height: 42, minWidth: 170, borderRadius: 9, padding: '0 14px' }}>
            <option value="">Todas las sucursales</option>
            {sucursalesUnicas.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {comercialesUnicos.length > 0 && (
          <select value={comercialFilter} onChange={e => setComercialFilter(e.target.value)} className="t-select" style={{ height: 42, minWidth: 180, borderRadius: 9, padding: '0 14px' }}>
            <option value="">Todos los comerciales</option>
            {comercialesUnicos.map(com => <option key={com} value={com}>{com}</option>)}
          </select>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--t-text-2)' }}>
          {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Confirmacion cambio de estado ────────────────────────────────── */}
      {pendingEstado && (
        <div style={{
          marginTop: 16, padding: '12px 16px', borderRadius: 10,
          background: pendingEstado.estado === 'RECHAZADA' ? 'rgba(239,77,90,0.08)' : 'rgba(240,185,77,0.08)',
          border: `1px solid ${pendingEstado.estado === 'RECHAZADA' ? 'rgba(239,77,90,0.3)' : 'rgba(240,185,77,0.3)'}`,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: pendingEstado.estado === 'RECHAZADA' ? 'var(--t-red)' : pendingEstado.estado === 'CONTRATADA' ? 'var(--t-green)' : 'var(--t-amber)', flex: 1 }}>
              Cambiar estado a <b>{pendingEstado.estado}</b>. ¿Confirmar?
            </span>
            <button
              onClick={handleConfirmarEstado}
              disabled={pendingEstado.estado === 'CONTRATADA' && !pendingEstado.fechaVencimiento.trim()}
              style={{
                background: pendingEstado.estado === 'RECHAZADA' ? 'var(--t-red)' : pendingEstado.estado === 'CONTRATADA' ? 'var(--t-green)' : 'var(--t-amber)',
                border: 'none', borderRadius: 8,
                padding: '5px 16px', color: '#fff', fontSize: 12, fontWeight: 700,
                cursor: (pendingEstado.estado === 'CONTRATADA' && !pendingEstado.fechaVencimiento.trim()) ? 'not-allowed' : 'pointer',
                opacity: (pendingEstado.estado === 'CONTRATADA' && !pendingEstado.fechaVencimiento.trim()) ? 0.5 : 1,
              }}>Confirmar</button>
            <button onClick={() => setPendingEstado(null)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--t-text-3)', fontSize: 12, padding: '5px 8px',
            }}>Cancelar</button>
          </div>
          {pendingEstado.estado === 'CONTRATADA' && (
            <input
              autoFocus
              placeholder="Fecha de vencimiento (DD/MM/YYYY) *"
              value={pendingEstado.fechaVencimiento}
              onChange={e => setPendingEstado(p => p ? { ...p, fechaVencimiento: e.target.value } : p)}
              onKeyDown={e => { if (e.key === 'Enter') handleConfirmarEstado(); if (e.key === 'Escape') setPendingEstado(null); }}
              style={{
                width: '100%', fontSize: 13, padding: '7px 12px', borderRadius: 8, boxSizing: 'border-box',
                background: 'var(--t-surface)', border: '1px solid var(--t-green)',
                color: 'var(--t-text)', outline: 'none',
              }}
            />
          )}
          {pendingEstado.estado === 'RECHAZADA' && (
            <input
              autoFocus
              placeholder="Motivo del rechazo (ej: precio fuera de mercado, falta documentación...)"
              value={pendingEstado.motivo}
              onChange={e => setPendingEstado(p => p ? { ...p, motivo: e.target.value } : p)}
              onKeyDown={e => { if (e.key === 'Enter') handleConfirmarEstado(); if (e.key === 'Escape') setPendingEstado(null); }}
              style={{
                width: '100%', fontSize: 13, padding: '7px 12px', borderRadius: 8, boxSizing: 'border-box',
                background: 'var(--t-surface)', border: '1px solid var(--t-red)',
                color: 'var(--t-text)', outline: 'none',
              }}
            />
          )}
        </div>
      )}

      {/* ── Formulario nueva carpeta ──────────────────────────────────────── */}
      {creating && (
        <div style={{
          marginTop: 16, padding: '20px 24px',
          border: '1px solid var(--t-line)', borderRadius: 12,
          background: 'var(--t-surface)',
        }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--t-text)', fontWeight: 600 }}>
            Nueva carpeta
          </h3>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <input autoFocus value={nombre} onChange={e => setNombre(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !showCrearCorredor) handleCrear(); }}
              placeholder="Nombre del estudio (ej. FRILESA S.L.)"
              className="panel-input" style={{ flex: 2, minWidth: 180, fontSize: 13 }} />
            <button onClick={handleCrear} disabled={!nombre.trim()} style={{
              background: nombre.trim() ? 'var(--t-blue)' : 'rgba(67,135,255,0.3)',
              border: 'none', borderRadius: 9, padding: '0 20px', color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: nombre.trim() ? 'pointer' : 'not-allowed',
            }}>Crear</button>
            <button onClick={() => setCreating(false)} style={{
              border: '1px solid var(--t-line)', borderRadius: 9,
              background: 'none', padding: '0 14px', color: 'var(--t-text-2)', fontSize: 13, cursor: 'pointer',
            }}>Cancelar</button>
          </div>
          <select value={showCrearCorredor ? '__crear__' : corredorId}
            onChange={e => handleCorredorChange(e.target.value)} className="panel-input" style={{ fontSize: 13, maxWidth: 360 }}>
            <option value="">Sin corredor</option>
            {corredores.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.cif ? ` — ${c.cif}` : ''}</option>)}
            <option value="__crear__">+ Crear nuevo corredor</option>
          </select>
          {showCrearCorredor && (
            <CrearCorredorForm onCreado={handleCorredorCreado} onCancelar={() => { setShowCrearCorredor(false); setCorredorId(''); }} />
          )}
        </div>
      )}

      {/* ── Tabla ────────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div style={{ marginTop: 24, textAlign: 'center', padding: '50px 0' }}>
          <p style={{ margin: 0, color: 'var(--t-text-3)', fontSize: 13 }}>
            {carpetas.length === 0 ? 'Sin carpetas. Crea la primera con el botón superior.' : 'Sin resultados para los filtros actuales.'}
          </p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', marginTop: 24 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <colgroup>
              <col style={{ width: '46%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '6%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={thStyle}><SortBtn col="nombre" label="Nombre" /></th>
                <th style={thStyle}><SortBtn col="corredor" label="Corredor" /></th>
                <th style={thStyle}><SortBtn col="sucursal" label="Sucursal" /></th>
                <th style={thStyle}><SortBtn col="vehiculos" label="Veh." /></th>
                <th style={thStyle}><SortBtn col="estado" label="Estado" /></th>
                <th style={thStyle}><SortBtn col="modificada" label="Modificada" /></th>
                <th style={{ ...thStyle, textAlign: 'right' }} aria-label="Eliminar" />
              </tr>
            </thead>
            <tbody>
              {sortedFiltered.map(c => {
                const corr = c.corredor_id ? corredorMap.get(c.corredor_id) : null;
                const numVeh = (c.trabajo?.length > 0 ? c.trabajo : c.original)?.filter((r: Record<string, unknown>) => (r['matricula'] as string)?.trim()).length ?? 0;
                const isDelConfirm = confirmDel === c.id;
                return (
                  <tr key={c.id}
                    onClick={() => onSelect(c)}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--t-line-soft)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    {/* Nombre */}
                    <td style={{ ...tdStyle, color: 'var(--t-text)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 650, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>
                          {c.nombre || '(sin nombre)'}
                        </span>
                        {Array.isArray(c.estudiando_por) && c.estudiando_por.length > 0 && c.estudiando_por.map((u: string) => (
                          <span key={u} style={{
                            fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 999,
                            background: u === user ? 'rgba(32,201,130,0.18)' : 'rgba(240,185,77,0.18)',
                            color: u === user ? 'var(--t-green)' : 'var(--t-amber)',
                            border: `1px solid ${u === user ? 'rgba(32,201,130,0.35)' : 'rgba(240,185,77,0.35)'}`,
                          }}>● {u}</span>
                        ))}
                      </div>
                      {(c.header?.cif || c.header?.tomador) && (
                        <div style={{ fontSize: 12, color: 'var(--t-text-2)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.header.cif && <span style={{ fontFamily: 'monospace', letterSpacing: '0.04em' }}>{c.header.cif}</span>}
                          {c.header.cif && c.header.tomador && <span style={{ margin: '0 4px', opacity: 0.4 }}>·</span>}
                          {c.header.tomador && <span>{c.header.tomador}</span>}
                        </div>
                      )}
                      {c.estado === 'RECHAZADA' && (() => {
                        const lastMotivo = [...(c.historico ?? [])].reverse().find(h => h.estadoNuevo === 'RECHAZADA' && h.motivo)?.motivo;
                        return lastMotivo ? <div style={{ fontSize: 11, color: 'var(--t-red)', fontStyle: 'italic', marginTop: 3 }}>✕ {lastMotivo}</div> : null;
                      })()}
                      <div style={{ fontSize: 11, color: 'var(--t-text-3)', marginTop: 3 }}>
                        por {c.creado_por || 'HISTORICO'}
                      </div>
                    </td>

                    {/* Corredor */}
                    <td style={{ ...tdStyle, fontSize: 13, color: 'var(--t-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {corr?.nombre ?? <span style={{ color: 'var(--t-text-3)' }}>—</span>}
                      {corr?.comercial && <span style={{ color: 'var(--t-text-3)', marginLeft: 4, fontSize: 11 }}>· {corr.comercial}</span>}
                    </td>

                    {/* Sucursal */}
                    <td style={{ ...tdStyle, fontSize: 13, color: 'var(--t-text-2)' }}>
                      {corr?.sucursal ? (
                        <span style={{
                          fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
                          color: 'var(--t-text-2)',
                          background: 'var(--t-line-soft)',
                          border: '1px solid var(--t-line)',
                          borderRadius: 4, padding: '2px 7px', whiteSpace: 'nowrap',
                        }}>{corr.sucursal}</span>
                      ) : <span style={{ color: 'var(--t-text-3)' }}>—</span>}
                    </td>

                    {/* Vehículos */}
                    <td style={{ ...tdStyle, fontSize: 14, fontWeight: 600, color: 'var(--t-text)', fontVariantNumeric: 'tabular-nums' }}>
                      {numVeh}
                    </td>

                    {/* Estado */}
                    <td style={{ ...tdStyle }} onClick={e => e.stopPropagation()}>
                      <div style={{ position: 'relative', display: 'inline-flex' }}>
                        <select
                          value={c.estado}
                          onChange={e => {
                            const nuevo = e.target.value as EstadoFlota;
                            if (nuevo !== c.estado) setPendingEstado({ id: c.id, estado: nuevo, motivo: '', fechaVencimiento: '' });
                          }}
                          style={{
                            position: 'absolute', inset: 0, opacity: 0,
                            cursor: 'pointer', width: '100%', height: '100%',
                          }}
                        >
                          {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                        </select>
                        <EstadoBadge estado={c.estado} />
                      </div>
                    </td>

                    {/* Modificada */}
                    <td style={{ ...tdStyle, fontSize: 13, color: 'var(--t-text-2)', fontVariantNumeric: 'tabular-nums' }}>
                      {new Date(c.actualizadaEn).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </td>

                    {/* Eliminar */}
                    <td style={{ ...tdStyle, textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                      {!isDelConfirm ? (
                        <button onClick={() => setConfirmDel(c.id)} style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--t-text-3)', fontSize: 15, lineHeight: 1,
                          padding: '4px 6px', borderRadius: 6,
                        }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--t-red)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--t-text-3)')}
                        >×</button>
                      ) : (
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button onClick={() => handleEliminar(c.id)} style={{
                            fontSize: 10, padding: '2px 7px', borderRadius: 4,
                            background: 'var(--t-red)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700,
                          }}>Sí</button>
                          <button onClick={() => setConfirmDel(null)} style={{
                            fontSize: 10, padding: '2px 7px', borderRadius: 4,
                            background: 'none', color: 'var(--t-text-2)',
                            border: '1px solid var(--t-line)', cursor: 'pointer',
                          }}>No</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Historial previo (flotas_historicas) ──────────────────────────── */}
      {query.trim().length >= 2 && historial.length > 0 && (
        <div style={{ marginTop: 20, padding: '14px 20px', borderRadius: 12, background: 'rgba(240,185,77,0.06)', border: '1px solid rgba(240,185,77,0.2)' }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-amber)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 10px 0' }}>
            Historial · {historial.length} resultado{historial.length !== 1 ? 's' : ''} en base de datos
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {historial.map(h => {
              const cfg: Record<string, { color: string; border: string; bg: string }> = {
                CONTRATADA:   { color: 'var(--t-green)', border: 'rgba(32,201,130,0.3)',  bg: 'rgba(32,201,130,0.1)' },
                RECHAZADA:    { color: 'var(--t-red)',   border: 'rgba(239,77,90,0.3)',   bg: 'rgba(239,77,90,0.08)' },
                'EN ESTUDIO': { color: 'var(--t-amber)', border: 'rgba(240,185,77,0.3)',  bg: 'rgba(240,185,77,0.08)' },
                COTIZADA:     { color: 'var(--t-violet)',border: 'rgba(124,92,252,0.3)',  bg: 'rgba(124,92,252,0.08)' },
              };
              const hcfg = cfg[h.estado] ?? cfg['EN ESTUDIO'];
              return (
                <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 9, background: 'var(--t-surface)', border: `1px solid ${hcfg.border}` }}>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: hcfg.bg, color: hcfg.color, border: `1px solid ${hcfg.border}`, textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
                    {h.estado}
                  </span>
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
