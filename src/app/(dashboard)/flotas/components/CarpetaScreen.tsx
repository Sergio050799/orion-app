"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  listarCarpetas, crearCarpeta, guardarCarpeta, eliminarCarpeta, generarPlantillaExcel,
  listarCorredores, crearCorredor, cambiarEstado,
  cargarCarpetasDelServidor, cargarCorredoresDelServidor,
  type FlotaCarpeta, type Corredor, type Periodicidad, type EstadoFlota,
} from '@/core/flotas';
import { useAuth } from '@/context/AuthContext';

// ─── Design tokens ──────────────────────────────────────────────────────────

const surface: React.CSSProperties = {
  background: '#0D0F12',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
};

const ESTADOS: EstadoFlota[] = ['EN ESTUDIO', 'OFERTADA', 'CONTRATADA', 'RECHAZADA'];

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizarCarpeta(c: FlotaCarpeta): FlotaCarpeta {
  return { ...c, estado: c.estado ?? 'EN ESTUDIO', historico: c.historico ?? [] };
}

function diasHastaVencimiento(fechaStr: string | undefined): number | null {
  if (!fechaStr) return null;
  let date: Date;
  if (fechaStr.includes('/')) {
    const parts = fechaStr.split('/');
    if (parts.length === 3) {
      const [d, m, y] = parts;
      date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    } else {
      date = new Date(fechaStr);
    }
  } else {
    date = new Date(fechaStr);
  }
  if (isNaN(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / 86400000);
}

function formatDateEs(fechaStr: string | undefined): string {
  if (!fechaStr) return '—';
  if (fechaStr.includes('/') && fechaStr.split('/').length === 3 && fechaStr.split('/')[2].length === 4) return fechaStr;
  const date = new Date(fechaStr);
  if (isNaN(date.getTime())) return fechaStr;
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ─── CrearCorredorForm ──────────────────────────────────────────────────────

const EMPTY_CORREDOR = {
  nombre: '', cif: '', porcentajeComision: '', periodicidad: 'anual' as Periodicidad,
  formaPago: '', contacto: '', email: '', telefono: '',
};

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
      periodicidad: form.periodicidad, formaPago: form.formaPago.trim(),
      contacto: form.contacto.trim(), email: form.email.trim(),
      telefono: form.telefono.trim(), observaciones: '',
    });
    onCreado(corredor);
  };
  return (
    <div style={{ marginTop: 10, padding: 14, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: '#70747B', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
        Nuevo corredor
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <input placeholder="Nombre *" value={form.nombre} onChange={e => set('nombre', e.target.value)} className="orion-input" style={{ fontSize: 12 }} />
        </div>
        <input placeholder="CIF" value={form.cif} onChange={e => set('cif', e.target.value)} className="orion-input" style={{ fontSize: 12 }} />
        <input placeholder="% Comision" inputMode="decimal" value={form.porcentajeComision}
          onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d*$/.test(v)) set('porcentajeComision', v); }}
          className="orion-input" style={{ fontSize: 12 }} />
        <select value={form.periodicidad} onChange={e => set('periodicidad', e.target.value as Periodicidad)} className="orion-input" style={{ fontSize: 12 }}>
          <option value="mensual">Mensual</option><option value="trimestral">Trimestral</option>
          <option value="semestral">Semestral</option><option value="anual">Anual</option>
        </select>
        <input placeholder="Forma de pago" value={form.formaPago} onChange={e => set('formaPago', e.target.value)} className="orion-input" style={{ fontSize: 12 }} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={handleSubmit} disabled={!form.nombre.trim()} style={{
          fontSize: 12, fontWeight: 600, padding: '6px 16px', borderRadius: 8,
          background: form.nombre.trim() ? '#4387FF' : 'rgba(67,135,255,0.3)',
          color: '#fff', border: 'none', cursor: form.nombre.trim() ? 'pointer' : 'not-allowed',
        }}>Crear corredor</button>
        <button onClick={onCancelar} style={{
          fontSize: 12, fontWeight: 500, padding: '6px 14px', borderRadius: 8,
          background: 'transparent', color: '#A1A1A6',
          border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
        }}>Cancelar</button>
      </div>
    </div>
  );
}

// ─── EstadoBadge ────────────────────────────────────────────────────────────

type SortColEstudio = 'nombre' | 'corredor' | 'vencimiento' | 'estado';

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  return (
    <span style={{ marginLeft: 4, color: active ? '#A1A1A6' : 'rgba(255,255,255,0.2)', fontSize: 9, lineHeight: 1 }}>
      {active ? (dir === 'asc' ? '↑' : '↓') : '⇅'}
    </span>
  );
}

export function EstadoBadge({ estado, small }: { estado: string; small?: boolean }) {
  const cfg: Record<string, { border: string; color: string }> = {
    'EN ESTUDIO': { border: 'rgba(255,255,255,0.15)',  color: '#70747B' },
    'OFERTADA':   { border: 'rgba(124,92,252,0.45)',   color: '#7C5CFC' },
    'CONTRATADA': { border: 'rgba(32,201,130,0.45)',   color: '#20C982' },
    'RECHAZADA':  { border: 'rgba(239,77,90,0.45)',    color: '#EF4D5A' },
  };
  const s = cfg[estado] ?? cfg['EN ESTUDIO'];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      height: small ? 20 : 26, padding: small ? '0 7px' : '0 10px',
      borderRadius: 8, border: `1px solid ${s.border}`, color: s.color,
      fontSize: small ? 9 : 11, fontWeight: 700,
      letterSpacing: '0.04em', whiteSpace: 'nowrap', textTransform: 'uppercase',
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
  const [estadoFilter, setEstadoFilter] = useState<string>('TODOS');
  const [corredorFilter, setCorredorFilter] = useState('TODOS');
  const [creating, setCreating] = useState(false);
  const [sortCol, setSortCol] = useState<SortColEstudio | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const sseRef = useRef<EventSource | null>(null);
  const cargarAbortRef = useRef<AbortController | null>(null);

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

  const [pendingEstado, setPendingEstado] = useState<{ id: string; estado: EstadoFlota; motivo: string; fechaVencimiento: string } | null>(null);

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
        if (serverCarpetas.length > 0) {
          setCarpetas(serverCarpetas.map(normalizarCarpeta));
        } else {
          const local = listarCarpetas();
          if (local.length === 0) setCarpetas([]);
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
    const es = new EventSource('/api/flotas/eventos');
    sseRef.current = es;
    es.onmessage = (e) => { if (e.data === 'update') cargar(); };
    es.onerror = () => es.close();
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

  const corredorNames = useMemo(() => ['TODOS', ...Array.from(new Set(carpetas.map(c => {
    const corr = c.corredor_id ? corredorMap.get(c.corredor_id) : null;
    return corr?.nombre ?? 'Sin corredor';
  })))], [carpetas, corredorMap]);

  const filtered = useMemo(() => {
    return carpetas.filter(c => {
      const corr = c.corredor_id ? corredorMap.get(c.corredor_id) : null;
      const corrName = corr?.nombre ?? 'Sin corredor';
      if (estadoFilter !== 'TODOS' && c.estado !== estadoFilter) return false;
      if (corredorFilter !== 'TODOS' && corrName !== corredorFilter) return false;
      const q = query.trim().toLowerCase();
      if (q) {
        const cif     = (c.header?.cif     ?? '').toLowerCase();
        const tomador = (c.header?.tomador ?? '').toLowerCase();
        const nom     = c.nombre.toLowerCase();
        if (!nom.includes(q) && !corrName.toLowerCase().includes(q) && !cif.includes(q) && !tomador.includes(q)) return false;
      }
      return true;
    });
  }, [carpetas, query, estadoFilter, corredorFilter, corredorMap]);

  function toggleSort(col: SortColEstudio) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  const sortedFiltered = useMemo(() => {
    if (!sortCol) return filtered;
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortCol === 'nombre') {
        cmp = a.nombre.localeCompare(b.nombre);
      } else if (sortCol === 'corredor') {
        const ca = corredorMap.get(a.corredor_id ?? '')?.nombre ?? '';
        const cb = corredorMap.get(b.corredor_id ?? '')?.nombre ?? '';
        cmp = ca.localeCompare(cb);
      } else if (sortCol === 'vencimiento') {
        const da = diasHastaVencimiento(a.header?.fechaVencimiento) ?? Infinity;
        const db = diasHastaVencimiento(b.header?.fechaVencimiento) ?? Infinity;
        cmp = da - db;
      } else if (sortCol === 'estado') {
        const order = ['CONTRATADA', 'OFERTADA', 'EN ESTUDIO', 'RECHAZADA'];
        cmp = order.indexOf(a.estado) - order.indexOf(b.estado);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortCol, sortDir, corredorMap]);

  const kpis = useMemo(() => ({
    total:       carpetas.length,
    contratadas: carpetas.filter(c => c.estado === 'CONTRATADA').length,
    ofertadas:   carpetas.filter(c => c.estado === 'OFERTADA').length,
    rechazadas:  carpetas.filter(c => c.estado === 'RECHAZADA').length,
  }), [carpetas]);

  const estadoCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of carpetas) m[c.estado] = (m[c.estado] ?? 0) + 1;
    return m;
  }, [carpetas]);

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
      const c = listarCarpetas().find(x => x.id === pendingEstado.id);
      if (c) { c.header = { ...c.header, fechaVencimiento: pendingEstado.fechaVencimiento.trim() }; guardarCarpeta(c); }
    }
    setCarpetas(listarCarpetas().map(normalizarCarpeta));
    setPendingEstado(null);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="animate-in fade-in duration-500" style={{ padding: '28px 32px', height: '100%', overflowY: 'auto' }}>

      {/* Title */}
      <h1 style={{ margin: 0, fontSize: 40, fontWeight: 700, letterSpacing: '-0.03em', color: '#F4F4F5', lineHeight: 1 }}>
        FLOTAS
      </h1>
      <p style={{ margin: '6px 0 0', fontSize: 15, color: '#A1A1A6' }}>
        Portfolio · {filtered.length} resultado{filtered.length !== 1 ? 's' : ''} de {carpetas.length}
      </p>

      {/* KPIs */}
      <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr 1fr', alignItems: 'end' }}>
        <div>
          <small style={{ display: 'block', color: '#A1A1A6', fontSize: 12, letterSpacing: '0.06em', marginBottom: 4 }}>PORTFOLIO TOTAL</small>
          <b style={{ fontSize: 48, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1, color: '#F4F4F5' }}>{kpis.total}</b>
        </div>
        <div style={{ textAlign: 'center' }}>
          <small style={{ display: 'block', color: '#A1A1A6', fontSize: 12, letterSpacing: '0.06em', marginBottom: 4 }}>CONTRATADAS</small>
          <b style={{ fontSize: 48, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1, color: '#20C982' }}>{kpis.contratadas}</b>
        </div>
        <div style={{ textAlign: 'center' }}>
          <small style={{ display: 'block', color: '#A1A1A6', fontSize: 12, letterSpacing: '0.06em', marginBottom: 4 }}>OFERTADAS</small>
          <b style={{ fontSize: 48, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1, color: '#7C5CFC' }}>{kpis.ofertadas}</b>
        </div>
        <div style={{ textAlign: 'right' }}>
          <small style={{ display: 'block', color: '#A1A1A6', fontSize: 12, letterSpacing: '0.06em', marginBottom: 4 }}>RECHAZADAS</small>
          <b style={{ fontSize: 48, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1, color: '#EF4D5A' }}>{kpis.rechazadas}</b>
        </div>
      </div>

      {/* Filters + actions */}
      <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          height: 40, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
          background: 'transparent', padding: '0 14px', flex: '1 1 260px', maxWidth: 340,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2">
            <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
          </svg>
          <input
            placeholder="Buscar nombre, CIF, corredor..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{ background: 'none', border: 'none', outline: 'none', color: '#F4F4F5', fontSize: 14, width: '100%' }}
          />
        </div>

        <select value={estadoFilter} onChange={e => setEstadoFilter(e.target.value)} style={{
          height: 40, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
          background: 'transparent', color: '#F4F4F5', fontSize: 14, padding: '0 12px',
          outline: 'none', cursor: 'pointer', minWidth: 185,
        }}>
          <option value="TODOS" style={{ background: '#0D0F12' }}>Todos los estados</option>
          {ESTADOS.map(e => (
            <option key={e} value={e} style={{ background: '#0D0F12' }}>
              {e.charAt(0) + e.slice(1).toLowerCase()} ({estadoCounts[e] ?? 0})
            </option>
          ))}
        </select>

        <select value={corredorFilter} onChange={e => setCorredorFilter(e.target.value)} style={{
          height: 40, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
          background: 'transparent', color: '#F4F4F5', fontSize: 14, padding: '0 12px',
          outline: 'none', cursor: 'pointer', minWidth: 210,
        }}>
          {corredorNames.map(c => (
            <option key={c} value={c} style={{ background: '#0D0F12' }}>
              {c === 'TODOS' ? 'Todos los corredores' : c}
            </option>
          ))}
        </select>

        <span style={{ flex: 1 }} />

        <button onClick={handleDescargarPlantilla} style={{
          height: 40, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 10, padding: '0 16px', color: '#A1A1A6', fontSize: 13,
          cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap',
        }}>Plantilla</button>

        <button onClick={() => setCreating(v => !v)} style={{
          height: 40, background: '#4387FF', border: 'none', borderRadius: 10,
          padding: '0 20px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
        }}>+ Nueva carpeta</button>
      </div>

      {/* Nueva carpeta form */}
      {creating && (
        <div style={{ marginTop: 12, ...surface, padding: '20px 24px' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, color: '#FFFFFF', fontWeight: 500 }}>Nueva carpeta</h3>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <input autoFocus value={nombre} onChange={e => setNombre(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !showCrearCorredor) handleCrear(); }}
              placeholder="Nombre del estudio (ej. FRILESA S.L.)"
              className="orion-input" style={{ flex: 2, minWidth: 180, fontSize: 13 }} />
            <button onClick={handleCrear} disabled={!nombre.trim()} style={{
              background: nombre.trim() ? '#4387FF' : 'rgba(67,135,255,0.3)',
              border: 'none', borderRadius: 10, padding: '0 20px', color: '#fff',
              fontSize: 12, fontWeight: 600, cursor: nombre.trim() ? 'pointer' : 'not-allowed',
            }}>Crear</button>
            <button onClick={() => setCreating(false)} style={{
              background: 'transparent', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10, padding: '0 14px', color: '#A1A1A6', fontSize: 12, cursor: 'pointer',
            }}>Cancelar</button>
          </div>
          <select value={showCrearCorredor ? '__crear__' : corredorId}
            onChange={e => handleCorredorChange(e.target.value)} className="orion-input" style={{ fontSize: 12, maxWidth: 320 }}>
            <option value="">Sin corredor</option>
            {corredores.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.cif ? ` — ${c.cif}` : ''}</option>)}
            <option value="__crear__">+ Crear nuevo corredor</option>
          </select>
          {showCrearCorredor && (
            <CrearCorredorForm
              onCreado={handleCorredorCreado}
              onCancelar={() => { setShowCrearCorredor(false); setCorredorId(''); }}
            />
          )}
        </div>
      )}

      {/* Confirmacion cambio de estado */}
      {pendingEstado && (
        <div style={{
          marginTop: 12, padding: '12px 16px', borderRadius: 12,
          background: pendingEstado.estado === 'RECHAZADA' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
          border: `1px solid ${pendingEstado.estado === 'RECHAZADA' ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}`,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{
              fontSize: 12, flex: 1,
              color: pendingEstado.estado === 'RECHAZADA' ? '#EF4D5A' : pendingEstado.estado === 'CONTRATADA' ? '#20C982' : '#F0B94D',
            }}>
              Cambiar estado a <b>{pendingEstado.estado}</b>. ¿Confirmar?
            </span>
            <button onClick={handleConfirmarEstado}
              disabled={pendingEstado.estado === 'CONTRATADA' && !pendingEstado.fechaVencimiento.trim()}
              style={{
                background: pendingEstado.estado === 'RECHAZADA' ? '#EF4D5A' : pendingEstado.estado === 'CONTRATADA' ? '#20C982' : '#F0B94D',
                border: 'none', borderRadius: 8, padding: '5px 16px', color: '#fff',
                fontSize: 12, fontWeight: 700,
                cursor: (pendingEstado.estado === 'CONTRATADA' && !pendingEstado.fechaVencimiento.trim()) ? 'not-allowed' : 'pointer',
                opacity: (pendingEstado.estado === 'CONTRATADA' && !pendingEstado.fechaVencimiento.trim()) ? 0.5 : 1,
              }}>Confirmar</button>
            <button onClick={() => setPendingEstado(null)} style={{
              background: 'none', border: 'none', cursor: 'pointer', color: '#70747B', fontSize: 12, padding: '5px 8px',
            }}>Cancelar</button>
          </div>
          {pendingEstado.estado === 'CONTRATADA' && (
            <input autoFocus placeholder="Fecha de vencimiento (DD/MM/YYYY) *"
              value={pendingEstado.fechaVencimiento}
              onChange={e => setPendingEstado(p => p ? { ...p, fechaVencimiento: e.target.value } : p)}
              onKeyDown={e => { if (e.key === 'Enter') handleConfirmarEstado(); if (e.key === 'Escape') setPendingEstado(null); }}
              style={{ width: '100%', fontSize: 12, padding: '7px 12px', borderRadius: 8, background: '#0D0F12', border: '1px solid rgba(32,201,130,0.35)', color: '#F4F4F5', outline: 'none' }} />
          )}
          {pendingEstado.estado === 'RECHAZADA' && (
            <input autoFocus placeholder="Motivo del rechazo..."
              value={pendingEstado.motivo}
              onChange={e => setPendingEstado(p => p ? { ...p, motivo: e.target.value } : p)}
              onKeyDown={e => { if (e.key === 'Enter') handleConfirmarEstado(); if (e.key === 'Escape') setPendingEstado(null); }}
              style={{ width: '100%', fontSize: 12, padding: '7px 12px', borderRadius: 8, background: '#0D0F12', border: '1px solid rgba(239,77,90,0.35)', color: '#F4F4F5', outline: 'none' }} />
          )}
        </div>
      )}

      {/* Table */}
      <table style={{ width: '100%', marginTop: 22, borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {([
              { key: 'nombre'      as SortColEstudio, label: 'NOMBRE / CIF' },
              { key: 'corredor'    as SortColEstudio, label: 'CORREDOR' },
              { key: null,                             label: 'PERIODICIDAD' },
              { key: null,                             label: 'F. INICIO' },
              { key: 'vencimiento' as SortColEstudio, label: 'F. VENCIMIENTO' },
              { key: null,                             label: 'COMIS.' },
              { key: 'estado'      as SortColEstudio, label: 'ESTADO' },
              { key: null,                             label: '' },
            ] as Array<{ key: SortColEstudio | null; label: string }>).map(({ key, label }) => (
              <th key={label} onClick={key ? () => toggleSort(key) : undefined} style={{
                textAlign: 'left', color: sortCol === key ? '#A1A1A6' : '#70747B',
                fontSize: 12, fontWeight: 600, letterSpacing: '0.05em',
                padding: '0 8px 10px', borderBottom: '1px solid rgba(255,255,255,0.1)',
                cursor: key ? 'pointer' : 'default', userSelect: 'none', whiteSpace: 'nowrap',
              }}>
                {label}{key && <SortIcon active={sortCol === key} dir={sortDir} />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedFiltered.length === 0 ? (
            <tr>
              <td colSpan={8} style={{ textAlign: 'center', padding: '40px 0', color: '#70747B', fontSize: 12 }}>
                {carpetas.length === 0 ? 'Sin carpetas. Crea la primera.' : 'Sin resultados para este filtro.'}
              </td>
            </tr>
          ) : sortedFiltered.map(c => {
            const corr = c.corredor_id ? corredorMap.get(c.corredor_id) : null;
            const isDelConfirm = confirmDel === c.id;
            const dias = diasHastaVencimiento(c.header?.fechaVencimiento);
            const vencColor = dias == null
              ? '#70747B'
              : dias < 0   ? '#EF4D5A'
              : dias < 90  ? '#F0B94D'
              : '#20C982';

            const tdBase: React.CSSProperties = {
              height: 58, padding: '0 8px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              verticalAlign: 'middle', cursor: 'pointer',
            };

            return (
              <tr key={c.id}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
                style={{ transition: 'background 180ms' }}
              >
                {/* NOMBRE / CIF */}
                <td onClick={() => onSelect(c)} style={tdBase}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#F4F4F5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '0.01em' }}>
                      {c.nombre || '(sin nombre)'}
                    </span>
                    {Array.isArray(c.estudiando_por) && c.estudiando_por.length > 0 && c.estudiando_por.map((u: string) => (
                      <span key={u} style={{
                        fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 999, flexShrink: 0,
                        background: u === user ? 'rgba(16,185,129,0.18)' : 'rgba(245,158,11,0.18)',
                        color: u === user ? '#10b981' : '#f59e0b',
                        border: `1px solid ${u === user ? 'rgba(16,185,129,0.35)' : 'rgba(245,158,11,0.35)'}`,
                      }}>● {u}</span>
                    ))}
                  </div>
                  {c.header?.cif && (
                    <div style={{ fontSize: 11, color: '#70747B', fontFamily: 'monospace', letterSpacing: '0.04em', marginTop: 2 }}>
                      {c.header.cif}
                    </div>
                  )}
                </td>

                {/* CORREDOR */}
                <td onClick={() => onSelect(c)} style={{ ...tdBase, maxWidth: 180 }}>
                  <span style={{ fontSize: 14, color: '#C5C9D0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                    {corr?.nombre ?? <span style={{ color: '#70747B' }}>—</span>}
                  </span>
                </td>

                {/* PERIODICIDAD */}
                <td onClick={() => onSelect(c)} style={tdBase}>
                  <span style={{ fontSize: 14, color: c.header?.periodicidad ? '#F4F4F5' : '#70747B' }}>
                    {c.header?.periodicidad
                      ? c.header.periodicidad.charAt(0).toUpperCase() + c.header.periodicidad.slice(1)
                      : '—'}
                  </span>
                </td>

                {/* F. INICIO */}
                <td onClick={() => onSelect(c)} style={tdBase}>
                  <span style={{ fontSize: 14, color: c.header?.fechaInicio ? '#F4F4F5' : '#70747B' }}>
                    {formatDateEs(c.header?.fechaInicio)}
                  </span>
                </td>

                {/* F. VENCIMIENTO */}
                <td onClick={() => onSelect(c)} style={tdBase}>
                  {dias != null ? (
                    <>
                      <div style={{ fontSize: 14, fontWeight: 700, color: vencColor }}>
                        {formatDateEs(c.header?.fechaVencimiento)}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: vencColor, opacity: 0.75, marginTop: 1 }}>
                        {dias < 0 ? `${Math.abs(dias)} días (vencida)` : `${dias} días`}
                      </div>
                    </>
                  ) : (
                    <span style={{ fontSize: 14, color: '#70747B' }}>—</span>
                  )}
                </td>

                {/* COMIS. */}
                <td onClick={() => onSelect(c)} style={tdBase}>
                  <span style={{ fontSize: 14, color: corr?.porcentajeComision ? '#F4F4F5' : '#70747B' }}>
                    {corr?.porcentajeComision ? `${corr.porcentajeComision}%` : '—'}
                  </span>
                </td>

                {/* ESTADO */}
                <td style={{ ...tdBase, position: 'relative' }} onClick={e => e.stopPropagation()}>
                  <select value={c.estado} onChange={e => {
                    const nuevo = e.target.value as EstadoFlota;
                    if (nuevo !== c.estado) setPendingEstado({ id: c.id, estado: nuevo, motivo: '', fechaVencimiento: '' });
                  }} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }}>
                    {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                  <EstadoBadge estado={c.estado} />
                </td>

                {/* DELETE */}
                <td style={{ ...tdBase, cursor: 'default' }} onClick={e => e.stopPropagation()}>
                  {!isDelConfirm ? (
                    <button onClick={() => setConfirmDel(c.id)} style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'rgba(255,255,255,0.2)', fontSize: 16, lineHeight: 1,
                      padding: '4px 6px', borderRadius: 6, transition: 'color 150ms',
                    }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#EF4D5A')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.2)')}
                    >×</button>
                  ) : (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => handleEliminar(c.id)} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700 }}>Si</button>
                      <button onClick={() => setConfirmDel(null)} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'transparent', color: '#A1A1A6', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}>No</button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Historial previo (flotas_historicas) */}
      {query.trim().length >= 2 && historial.length > 0 && (
        <div style={{ marginTop: 16, padding: '14px 20px', borderRadius: 14, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <p style={{ fontSize: 10, fontWeight: 900, color: 'rgba(245,158,11,0.7)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 10px 0' }}>
            Historial · {historial.length} resultado{historial.length !== 1 ? 's' : ''} en base de datos
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {historial.map(h => {
              const hcfg: Record<string, { color: string; border: string; bg: string }> = {
                CONTRATADA:   { color: '#20C982', border: 'rgba(32,201,130,0.3)',  bg: 'rgba(32,201,130,0.08)' },
                RECHAZADA:    { color: '#EF4D5A', border: 'rgba(239,77,90,0.3)',   bg: 'rgba(239,77,90,0.08)' },
                'EN ESTUDIO': { color: '#F0B94D', border: 'rgba(240,185,77,0.3)',  bg: 'rgba(240,185,77,0.08)' },
                COTIZADA:     { color: '#7C5CFC', border: 'rgba(124,92,252,0.3)',  bg: 'rgba(124,92,252,0.08)' },
              };
              const hc = hcfg[h.estado] ?? hcfg['EN ESTUDIO'];
              return (
                <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: '#0D0F12', border: `1px solid ${hc.border}` }}>
                  <span style={{ fontSize: 9, fontWeight: 900, padding: '2px 7px', borderRadius: 5, background: hc.bg, color: hc.color, border: `1px solid ${hc.border}`, textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
                    {h.estado}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#FFFFFF' }}>{h.nombre}</span>
                    <div style={{ fontSize: 10, color: '#70747B', marginTop: 1, display: 'flex', gap: 8 }}>
                      {h.cif && <span style={{ fontFamily: 'monospace' }}>{h.cif}</span>}
                      {h.corredor_nombre && <span>{h.corredor_nombre}</span>}
                    </div>
                  </div>
                  <a href="/emission" target="_blank" rel="noreferrer" style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 6, background: 'rgba(67,135,255,0.08)', color: '#4387FF', border: '1px solid rgba(67,135,255,0.2)', textDecoration: 'none', flexShrink: 0 }}>Ver ficha</a>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
