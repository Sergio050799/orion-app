"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  listarCarpetas, crearCarpeta, eliminarCarpeta, generarPlantillaExcel,
  listarCorredores, crearCorredor, cambiarEstado,
  cargarCarpetasDelServidor, cargarCorredoresDelServidor,
  type FlotaCarpeta, type Corredor, type Periodicidad, type EstadoFlota,
} from '@/core/flotas';
import { useAuth } from '@/context/AuthContext';

// ─── Design tokens ──────────────────────────────────────────────────────────

const glass: React.CSSProperties = {
  background: 'rgba(12, 28, 82, 0.75)',
  border: '1px solid rgba(61, 112, 255, 0.22)',
  borderRadius: 22,
  boxShadow: '0 30px 80px -20px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.06) inset, 0 0 0 1px rgba(61,112,255,0.14) inset',
};

const ESTADOS: EstadoFlota[] = ['EN ESTUDIO', 'OFERTADA', 'CONTRATADA', 'RECHAZADA'];

// ─── Normalización ──────────────────────────────────────────────────────────

function normalizarCarpeta(c: FlotaCarpeta): FlotaCarpeta {
  return { ...c, estado: c.estado ?? 'EN ESTUDIO', historico: c.historico ?? [] };
}

// ─── Formulario crear corredor ──────────────────────────────────────────────

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
    <div style={{ marginTop: 10, padding: 14, borderRadius: 12, background: 'rgba(61,112,255,0.10)', border: '1px solid rgba(51,102,255,0.15)' }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: '#3366FF', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
        Nuevo corredor
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <input placeholder="Nombre *" value={form.nombre} onChange={e => set('nombre', e.target.value)} className="orion-input" style={{ fontSize: 12 }} />
        </div>
        <input placeholder="CIF" value={form.cif} onChange={e => set('cif', e.target.value)} className="orion-input" style={{ fontSize: 12 }} />
        <input placeholder="% Comision" inputMode="decimal" value={form.porcentajeComision} onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d*$/.test(v)) set('porcentajeComision', v); }} className="orion-input" style={{ fontSize: 12 }} />
        <select value={form.periodicidad} onChange={e => set('periodicidad', e.target.value as Periodicidad)} className="orion-input" style={{ fontSize: 12 }}>
          <option value="mensual">Mensual</option><option value="trimestral">Trimestral</option>
          <option value="semestral">Semestral</option><option value="anual">Anual</option>
        </select>
        <input placeholder="Forma de pago" value={form.formaPago} onChange={e => set('formaPago', e.target.value)} className="orion-input" style={{ fontSize: 12 }} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={handleSubmit} disabled={!form.nombre.trim()} style={{
          fontSize: 12, fontWeight: 600, padding: '6px 16px', borderRadius: 8,
          background: form.nombre.trim() ? 'linear-gradient(135deg, #1240CC, #3366FF)' : 'rgba(18,64,204,0.3)',
          color: '#fff', border: 'none', cursor: form.nombre.trim() ? 'pointer' : 'not-allowed',
        }}>Crear corredor</button>
        <button onClick={onCancelar} style={{
          fontSize: 12, fontWeight: 500, padding: '6px 14px', borderRadius: 8,
          background: 'rgba(6,14,50,0.5)', color: '#BDD4FF',
          border: '1px solid rgba(61,112,255,0.22)', cursor: 'pointer',
        }}>Cancelar</button>
      </div>
    </div>
  );
}

// ─── EstadoBadge ────────────────────────────────────────────────────────────

export function EstadoBadge({ estado, small }: { estado: string; small?: boolean }) {
  const cfg: Record<string, { bg: string; border: string; color: string }> = {
    'EN ESTUDIO': { bg: 'rgba(51,102,255,0.15)', border: 'rgba(51,102,255,0.35)', color: '#3366FF' },
    'OFERTADA': { bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.35)', color: '#f59e0b' },
    'CONTRATADA': { bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.35)', color: '#10b981' },
    'RECHAZADA': { bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.35)', color: '#ef4444' },
  };
  const s = cfg[estado] ?? cfg['EN ESTUDIO'];
  return (
    <span style={{
      fontSize: small ? 9 : 10, fontWeight: 700,
      padding: small ? '2px 6px' : '3px 10px',
      borderRadius: 999, textTransform: 'uppercase', letterSpacing: '0.06em',
      background: s.bg, border: `1px solid ${s.border}`, color: s.color,
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
  const [carpetas, setCarpetas] = useState<FlotaCarpeta[]>([]);
  const [nombre, setNombre] = useState('');
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [corredores, setCorredores] = useState<Corredor[]>([]);
  const [corredorId, setCorredorId] = useState<string>('');
  const [showCrearCorredor, setShowCrearCorredor] = useState(false);
  const [query, setQuery] = useState('');
  const [corredorFilter, setCorredorFilter] = useState('TODOS');
  const [estadoFilter, setEstadoFilter] = useState('TODAS');
  const [sucursalFilter, setSucursalFilter] = useState('');
  const [comercialFilter, setComercialFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const sseRef = useRef<EventSource | null>(null);
  const cargarAbortRef = useRef<AbortController | null>(null);

  // Estado change confirmation per row
  const [pendingEstado, setPendingEstado] = useState<{ id: string; estado: EstadoFlota } | null>(null);

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
      if (!ctrl.signal.aborted) setCarpetas(serverCarpetas.map(normalizarCarpeta));
    } catch {
      if (!ctrl.signal.aborted) setCarpetas(listarCarpetas().map(normalizarCarpeta));
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

  const counts = useMemo(() => ({
    'TODAS': carpetas.length,
    'EN ESTUDIO': carpetas.filter(c => c.estado === 'EN ESTUDIO').length,
    'OFERTADA': carpetas.filter(c => c.estado === 'OFERTADA').length,
    'CONTRATADA': carpetas.filter(c => c.estado === 'CONTRATADA').length,
    'RECHAZADA': carpetas.filter(c => c.estado === 'RECHAZADA').length,
  }), [carpetas]);

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
      if (estadoFilter !== 'TODAS' && c.estado !== estadoFilter) return false;
      if (sucursalFilter && corr?.sucursal !== sucursalFilter) return false;
      if (comercialFilter && (corr?.comercial ?? '').toLowerCase() !== comercialFilter.toLowerCase()) return false;
      const q = query.trim().toLowerCase();
      if (q && !c.nombre.toLowerCase().includes(q) && !corrName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [carpetas, query, corredorFilter, estadoFilter, sucursalFilter, comercialFilter, corredorMap]);

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
    const blob = await generarPlantillaExcel();
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
    cambiarEstado(pendingEstado.id, pendingEstado.estado);
    setCarpetas(listarCarpetas().map(normalizarCarpeta));
    setPendingEstado(null);
  };

  return (
    <div className="animate-in fade-in duration-500" style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '24px 28px', height: '100%', overflowY: 'auto' }}>

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
            }}>Estudio de Flotas</h1>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(178,198,245,0.6)' }}>
              {filtered.length} de {carpetas.length} carpeta{carpetas.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleDescargarPlantilla} style={{
            background: 'rgba(6,14,50,0.5)', border: '1px solid rgba(61,112,255,0.22)',
            borderRadius: 10, padding: '8px 16px', color: '#BDD4FF', fontSize: 12,
            cursor: 'pointer', fontWeight: 500,
          }}>
            Plantilla
          </button>
          <button onClick={() => setCreating(true)} style={{
            background: 'linear-gradient(135deg, #1240CC, #3366FF)',
            border: 'none', borderRadius: 10, padding: '8px 20px',
            color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            boxShadow: '0 0 20px rgba(18,64,204,0.4)',
          }}>+ Nueva carpeta</button>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {/* Busqueda */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(6,14,50,0.5)', border: '1px solid rgba(61,112,255,0.22)',
          borderRadius: 10, padding: '0 14px', flex: 1, maxWidth: 280,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(70,120,255,0.5)" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          <input placeholder="Buscar..." value={query} onChange={e => setQuery(e.target.value)} style={{
            background: 'none', border: 'none', outline: 'none', color: '#FFFFFF', fontSize: 12, padding: '8px 0', width: '100%',
          }} />
        </div>

        {/* Corredor */}
        <select value={corredorFilter} onChange={e => setCorredorFilter(e.target.value)} style={{
          background: 'rgba(6,14,50,0.5)', border: '1px solid rgba(61,112,255,0.22)',
          borderRadius: 10, padding: '8px 12px', color: corredorFilter !== 'TODOS' ? '#FFFFFF' : 'rgba(178,198,245,0.5)',
          fontSize: 12, outline: 'none', cursor: 'pointer',
        }}>
          {corredorNames.map(c => <option key={c} value={c}>{c === 'TODOS' ? 'Todos los corredores' : c}</option>)}
        </select>

        {/* Sucursal */}
        {sucursalesUnicas.length > 0 && (
          <select value={sucursalFilter} onChange={e => setSucursalFilter(e.target.value)} style={{
            background: 'rgba(6,14,50,0.5)', border: '1px solid rgba(61,112,255,0.22)',
            borderRadius: 10, padding: '8px 12px', color: sucursalFilter ? '#FFFFFF' : 'rgba(178,198,245,0.5)',
            fontSize: 12, outline: 'none', cursor: 'pointer',
          }}>
            <option value="">Todas las sucursales</option>
            {sucursalesUnicas.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}

        {/* Comercial */}
        {comercialesUnicos.length > 0 && (
          <select value={comercialFilter} onChange={e => setComercialFilter(e.target.value)} style={{
            background: 'rgba(6,14,50,0.5)', border: '1px solid rgba(61,112,255,0.22)',
            borderRadius: 10, padding: '8px 12px', color: comercialFilter ? '#FFFFFF' : 'rgba(178,198,245,0.5)',
            fontSize: 12, outline: 'none', cursor: 'pointer',
          }}>
            <option value="">Todos los comerciales</option>
            {comercialesUnicos.map(com => <option key={com} value={com}>{com}</option>)}
          </select>
        )}

        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'rgba(178,198,245,0.5)' }}>
          {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Filtro de estado (pills) */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {([
          ['TODAS', 'Todas'],
          ['EN ESTUDIO', 'En estudio'],
          ['OFERTADA', 'Ofertadas'],
          ['CONTRATADA', 'Contratadas'],
          ['RECHAZADA', 'Rechazadas'],
        ] as const).map(([k, l]) => (
          <button key={k} onClick={() => setEstadoFilter(k)} style={{
            padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 500,
            border: 'none', cursor: 'pointer',
            background: estadoFilter === k ? 'rgba(18,64,204,0.35)' : 'rgba(6,14,50,0.5)',
            color: estadoFilter === k ? '#FFFFFF' : 'rgba(178,198,245,0.6)',
            boxShadow: estadoFilter === k ? '0 0 0 1px rgba(70,120,255,0.5) inset' : 'none',
            transition: 'all 180ms',
          }}>{l} <span style={{ opacity: 0.6 }}>({counts[k]})</span></button>
        ))}
      </div>

      {/* Confirmacion cambio de estado */}
      {pendingEstado && (
        <div style={{
          padding: '12px 16px', borderRadius: 12,
          background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 12, color: '#fbbf24', flex: 1 }}>
            Cambiar estado a <b>{pendingEstado.estado}</b>. Confirmar?
          </span>
          <button onClick={handleConfirmarEstado} style={{
            background: '#f59e0b', border: 'none', borderRadius: 8,
            padding: '5px 16px', color: '#000', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}>Confirmar</button>
          <button onClick={() => setPendingEstado(null)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(178,198,245,0.5)', fontSize: 12, padding: '5px 8px',
          }}>Cancelar</button>
        </div>
      )}

      {/* Formulario nueva carpeta */}
      {creating && (
        <div style={{ ...glass, padding: '20px 24px' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, color: '#FFFFFF', fontFamily: 'var(--font-display), Inter, sans-serif', fontWeight: 500 }}>
            Nueva carpeta
          </h3>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input autoFocus value={nombre} onChange={e => setNombre(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !showCrearCorredor) handleCrear(); }}
              placeholder="Nombre del estudio (ej. FRILESA S.L.)"
              className="orion-input" style={{ flex: 1, fontSize: 13 }} />
            <button onClick={handleCrear} disabled={!nombre.trim()} style={{
              background: nombre.trim() ? 'linear-gradient(135deg, #1240CC, #3366FF)' : 'rgba(18,64,204,0.3)',
              border: 'none', borderRadius: 10, padding: '0 20px', color: '#fff', fontSize: 12, fontWeight: 600,
              cursor: nombre.trim() ? 'pointer' : 'not-allowed',
            }}>Crear</button>
            <button onClick={() => setCreating(false)} style={{
              background: 'rgba(6,14,50,0.5)', border: '1px solid rgba(61,112,255,0.22)',
              borderRadius: 10, padding: '0 14px', color: '#BDD4FF', fontSize: 12, cursor: 'pointer',
            }}>Cancelar</button>
          </div>
          <select value={showCrearCorredor ? '__crear__' : corredorId}
            onChange={e => handleCorredorChange(e.target.value)} className="orion-input" style={{ fontSize: 12, maxWidth: 320 }}>
            <option value="">Sin corredor</option>
            {corredores.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.cif ? ` — ${c.cif}` : ''}</option>)}
            <option value="__crear__">+ Crear nuevo corredor</option>
          </select>
          {showCrearCorredor && (
            <CrearCorredorForm onCreado={handleCorredorCreado} onCancelar={() => { setShowCrearCorredor(false); setCorredorId(''); }} />
          )}
        </div>
      )}

      {/* Lista */}
      <div style={{
        background: 'rgba(12,28,82,0.42)',
        border: '1px solid rgba(61,112,255,0.16)',
        borderRadius: 16, overflowX: 'auto',
      }}>
        <div style={{ minWidth: 700 }}>
        {/* Cabecera */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 160px 80px 80px 110px 130px 36px',
          gap: 0, padding: '10px 18px',
          borderBottom: '1px solid rgba(51,102,255,0.15)',
          background: 'rgba(6,14,50,0.4)',
        }}>
          {['Nombre', 'Corredor', 'Sucursal', 'Veh.', 'Estado', 'Modificada', ''].map(h => (
            <span key={h} style={{
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.10em', color: '#3366FF',
            }}>{h}</span>
          ))}
        </div>

        {filtered.length === 0 ? (
          <p style={{ color: 'rgba(178,198,245,0.4)', fontSize: 12, textAlign: 'center', padding: '40px 0', margin: 0 }}>
            {carpetas.length === 0 ? 'Sin carpetas. Crea la primera.' : 'Sin resultados.'}
          </p>
        ) : (
          filtered.map(c => {
            const corr = c.corredor_id ? corredorMap.get(c.corredor_id) : null;
            const numVeh = (c.trabajo?.length > 0 ? c.trabajo : c.original)?.filter(r => r['matricula']?.trim()).length ?? 0;
            const isDelConfirm = confirmDel === c.id;

            return (
              <div key={c.id} style={{
                display: 'grid',
                gridTemplateColumns: '1fr 160px 80px 80px 110px 130px 36px',
                alignItems: 'center', gap: 0,
                padding: '11px 18px',
                borderBottom: '1px solid rgba(61,112,255,0.08)',
                transition: 'background 180ms',
                cursor: 'pointer',
              }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(51,102,255,0.04)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
              >
                {/* Nombre + metadatos */}
                <span onClick={() => onSelect(c)} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, color: '#FFFFFF', fontWeight: 500 }}>
                      {c.nombre || '(sin nombre)'}
                    </span>
                    {/* Siendo estudiado */}
                    {Array.isArray(c.estudiando_por) && c.estudiando_por.length > 0 && (
                      <span style={{ display: 'flex', gap: 3 }}>
                        {c.estudiando_por.map((u: string) => (
                          <span key={u} style={{
                            fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 999,
                            background: u === user ? 'rgba(16,185,129,0.18)' : 'rgba(245,158,11,0.18)',
                            color: u === user ? '#10b981' : '#f59e0b',
                            border: `1px solid ${u === user ? 'rgba(16,185,129,0.35)' : 'rgba(245,158,11,0.35)'}`,
                          }}>● {u}</span>
                        ))}
                      </span>
                    )}
                  </span>
                  {/* Creado por */}
                  {c.creado_por && (
                    <span style={{ fontSize: 10, color: 'rgba(178,198,245,0.38)', fontWeight: 400 }}>
                      por {c.creado_por}
                    </span>
                  )}
                </span>

                {/* Corredor + comercial */}
                <span onClick={() => onSelect(c)} style={{ fontSize: 12, color: '#BDD4FF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {corr?.nombre ?? <span style={{ color: 'rgba(178,198,245,0.3)' }}>—</span>}
                  {corr?.comercial && <span style={{ color: 'rgba(178,198,245,0.45)', marginLeft: 4, fontSize: 11 }}>· {corr.comercial}</span>}
                </span>

                {/* Sucursal */}
                <span onClick={() => onSelect(c)}>
                  {corr?.sucursal ? (
                    <span style={{
                      fontSize: 9, fontWeight: 700,
                      color: corr.sucursal === 'TITAN' ? '#60a5fa' : '#a78bfa',
                      background: corr.sucursal === 'TITAN' ? 'rgba(96,165,250,0.12)' : 'rgba(167,139,250,0.12)',
                      border: `1px solid ${corr.sucursal === 'TITAN' ? 'rgba(96,165,250,0.3)' : 'rgba(167,139,250,0.3)'}`,
                      borderRadius: 999, padding: '2px 6px',
                    }}>{corr.sucursal}</span>
                  ) : <span style={{ color: 'rgba(178,198,245,0.25)', fontSize: 12 }}>—</span>}
                </span>

                {/* Vehiculos */}
                <span onClick={() => onSelect(c)} style={{ fontSize: 12, color: '#BDD4FF' }}>{numVeh}</span>

                {/* Estado — clickable para cambiar */}
                <span style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                  <select
                    value={c.estado}
                    onChange={e => {
                      const nuevo = e.target.value as EstadoFlota;
                      if (nuevo !== c.estado) setPendingEstado({ id: c.id, estado: nuevo });
                    }}
                    style={{
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      color: 'transparent', fontSize: 10, width: '100%',
                      position: 'absolute', inset: 0, opacity: 0,
                    }}
                  >
                    {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                  <EstadoBadge estado={c.estado} />
                </span>

                {/* Fecha */}
                <span onClick={() => onSelect(c)} style={{ fontSize: 11, color: 'rgba(178,198,245,0.5)' }}>
                  {new Date(c.actualizadaEn).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                </span>

                {/* Eliminar */}
                <span onClick={e => e.stopPropagation()}>
                  {!isDelConfirm ? (
                    <button onClick={() => setConfirmDel(c.id)} style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'rgba(178,198,245,0.3)', fontSize: 14, lineHeight: 1,
                      padding: '4px 6px', borderRadius: 6, transition: 'color 150ms',
                    }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'rgba(178,198,245,0.3)')}
                    >x</button>
                  ) : (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => handleEliminar(c.id)} style={{
                        fontSize: 10, padding: '2px 6px', borderRadius: 4,
                        background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700,
                      }}>Si</button>
                      <button onClick={() => setConfirmDel(null)} style={{
                        fontSize: 10, padding: '2px 6px', borderRadius: 4,
                        background: 'rgba(6,14,50,0.5)', color: '#BDD4FF',
                        border: '1px solid rgba(61,112,255,0.22)', cursor: 'pointer',
                      }}>No</button>
                    </div>
                  )}
                </span>
              </div>
            );
          })
        )}
        </div>
      </div>
    </div>
  );
}
