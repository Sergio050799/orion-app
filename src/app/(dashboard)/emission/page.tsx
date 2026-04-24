"use client";

import React, { useState, useCallback, useRef, useMemo } from 'react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface CatalogoEntry {
  id_veh: string;
  marca: string;
  modelo: string;
  version: string;
  combustible: string;
  kw: number;
  cilindrada: number;
  plazas: number;
  anyo: number;
  pvp?: number;
}

interface VehiculoEmision {
  matricula: string;
  datos_originales: Record<string, string>;
  identificado: boolean;
  score?: number;
  catalogo?: CatalogoEntry;
  candidatos?: CatalogoEntry[];
}

type EstadoFila = 'IDENTIFICADO' | 'REVISAR' | 'SIN MATCH' | 'MANUAL';

interface FilaVehiculo {
  _id: number;
  matricula: string;
  marca: string;
  modelo: string;
  kw: string;
  combustible: string;
  anyo: string;
  cilindrada: string;
  plazas: string;
  estado: EstadoFila;
  score?: number;
  datos_originales: Record<string, string>;
  catalogo?: CatalogoEntry;
  candidatos: CatalogoEntry[];
  expanded: boolean;
  searching: boolean;
}

const COMBUSTIBLES = [
  { value: '', label: 'Seleccionar...' },
  { value: 'D', label: 'Diésel' },
  { value: 'G', label: 'Gasolina' },
  { value: 'E', label: 'Eléctrico' },
  { value: 'X', label: 'Híbrido Diésel' },
  { value: 'Y', label: 'Híbrido Gasolina' },
  { value: 'L', label: 'GLP' },
  { value: 'P', label: 'GNC' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getEstado(v: VehiculoEmision): EstadoFila {
  if (!v.identificado) return 'SIN MATCH';
  if ((v.score ?? 0) >= 70) return 'IDENTIFICADO';
  return 'REVISAR';
}

const ESTADO_CONFIG: Record<EstadoFila, { label: string; color: string; bg: string; border: string }> = {
  'IDENTIFICADO': { label: 'Identificado', color: '#10b981', bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.3)' },
  'REVISAR':      { label: 'Revisar',      color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)' },
  'SIN MATCH':    { label: 'Sin match',    color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.3)' },
  'MANUAL':       { label: 'Manual',       color: '#818cf8', bg: 'rgba(99,102,241,0.1)',  border: 'rgba(99,102,241,0.3)' },
};

function EstadoBadge({ estado }: { estado: EstadoFila }) {
  const cfg = ESTADO_CONFIG[estado];
  return (
    <span style={{
      fontSize: 10, fontWeight: 900, padding: '3px 10px', borderRadius: 4,
      background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color,
      textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
    }}>
      {cfg.label}
    </span>
  );
}

// ─── Estilos ─────────────────────────────────────────────────────────────────

const glassCard: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16,
};

const inputStyle: React.CSSProperties = {
  fontSize: 12, padding: '6px 10px', borderRadius: 6,
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
  color: '#e2e8f0', outline: 'none', fontFamily: 'inherit', width: '100%',
};

const labelStyle: React.CSSProperties = {
  fontSize: 9, fontWeight: 800, color: 'rgba(129,140,248,0.7)',
  textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3, display: 'block',
};

const btnPrimary: React.CSSProperties = {
  fontSize: 11, fontWeight: 800, padding: '10px 20px', borderRadius: 10,
  background: 'rgba(99,102,241,0.15)', color: '#818cf8',
  border: '1px solid rgba(99,102,241,0.3)', cursor: 'pointer',
  textTransform: 'uppercase', letterSpacing: '0.06em',
};

// ─── Página principal ────────────────────────────────────────────────────────

export default function EmissionPage() {
  const [filas, setFilas] = useState<FilaVehiculo[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(0);

  const tieneFilas = filas.length > 0;
  const identificados = filas.filter(f => f.catalogo).length;
  const sinMatch = filas.filter(f => f.estado === 'SIN MATCH').length;

  // ── Paso 1A: Subir Excel ────────────────────────────────────────────────

  const handleExcelUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setLoading(true);
    setLoadingMsg('Procesando vehículos...');

    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/flotas/emision', { method: 'POST', body: form });
      const data = await res.json();

      if (!data.ok) {
        alert(data.error ?? 'Error procesando el archivo');
        return;
      }

      setLoadingMsg(`${data.identificados} de ${data.total} identificados`);

      const nuevas: FilaVehiculo[] = (data.vehiculos as VehiculoEmision[]).map(v => ({
        _id: nextId.current++,
        matricula: v.matricula,
        marca: v.catalogo?.marca ?? v.datos_originales['marca'] ?? '',
        modelo: v.catalogo?.modelo ?? v.datos_originales['modelo'] ?? '',
        kw: String(v.catalogo?.kw ?? v.datos_originales['kw'] ?? ''),
        combustible: v.catalogo?.combustible ?? v.datos_originales['combustible'] ?? '',
        anyo: String(v.catalogo?.anyo ?? v.datos_originales['anyo'] ?? ''),
        cilindrada: String(v.catalogo?.cilindrada ?? v.datos_originales['cilindrada'] ?? ''),
        plazas: String(v.catalogo?.plazas ?? v.datos_originales['plazas'] ?? ''),
        estado: getEstado(v),
        score: v.score,
        datos_originales: v.datos_originales,
        catalogo: v.catalogo,
        candidatos: v.candidatos ?? (v.catalogo ? [v.catalogo] : []),
        expanded: false,
        searching: false,
      }));

      setFilas(prev => [...prev, ...nuevas]);
    } catch (err) {
      alert('Error de conexión al procesar el Excel');
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  }, []);

  // ── Paso 1B: Entrada manual ─────────────────────────────────────────────

  const addManual = useCallback(() => {
    setFilas(prev => [...prev, {
      _id: nextId.current++,
      matricula: '', marca: '', modelo: '', kw: '',
      combustible: '', anyo: '', cilindrada: '', plazas: '',
      estado: 'MANUAL' as EstadoFila,
      datos_originales: {},
      candidatos: [],
      expanded: true,
      searching: false,
    }]);
  }, []);

  // ── Editar fila ─────────────────────────────────────────────────────────

  const updateFila = useCallback((id: number, patch: Partial<FilaVehiculo>) => {
    setFilas(prev => prev.map(f => f._id === id ? { ...f, ...patch } : f));
  }, []);

  const deleteFila = useCallback((id: number) => {
    setFilas(prev => prev.filter(f => f._id !== id));
  }, []);

  const toggleExpand = useCallback((id: number) => {
    setFilas(prev => prev.map(f => f._id === id ? { ...f, expanded: !f.expanded } : f));
  }, []);

  // ── Buscar catálogo manual ──────────────────────────────────────────────

  const searchTimers = useRef<Record<number, NodeJS.Timeout>>({});

  const triggerSearch = useCallback((fila: FilaVehiculo) => {
    if (searchTimers.current[fila._id]) clearTimeout(searchTimers.current[fila._id]);

    const marca = fila.marca.trim();
    const modelo = fila.modelo.trim();
    if (!marca && !modelo) return;

    searchTimers.current[fila._id] = setTimeout(async () => {
      updateFila(fila._id, { searching: true });
      try {
        const params = new URLSearchParams();
        if (marca) params.set('marca', marca);
        if (modelo) params.set('modelo', modelo);
        if (fila.kw) params.set('kw', fila.kw);
        if (fila.combustible) params.set('combustible', fila.combustible);
        if (fila.anyo) params.set('anyo', fila.anyo);
        if (fila.cilindrada) params.set('cilindrada', fila.cilindrada);
        if (fila.plazas) params.set('plazas', fila.plazas);
        const res = await fetch(`/api/catalogo/search?${params}`);
        const data = await res.json();
        const candidatos = data.candidatos ?? data.candidates ?? [];
        updateFila(fila._id, { candidatos: candidatos.slice(0, 5), searching: false });
      } catch {
        updateFila(fila._id, { searching: false });
      }
    }, 600);
  }, [updateFila]);

  const handleFieldChange = useCallback(async (fila: FilaVehiculo, field: string, value: string) => {
    const updated = { ...fila, [field]: value };
    updateFila(fila._id, { [field]: value });
    if (field === 'marca' || field === 'modelo') {
      triggerSearch(updated);
    }
    // Auto-calcular año desde matrícula
    if (field === 'matricula' && value.length >= 7) {
      try {
        const res = await fetch('/api/plates/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plates: [value] }),
        });
        const data = await res.json();
        if (data.results?.[0]?.estimatedDate) {
          const year = new Date(data.results[0].estimatedDate).getFullYear();
          updateFila(fila._id, { anyo: String(year) });
        }
      } catch { /* silencioso — el usuario puede ponerlo a mano */ }
    }
  }, [updateFila, triggerSearch]);

  // ── Seleccionar catálogo ────────────────────────────────────────────────

  const selectCatalogo = useCallback((filaId: number, cat: CatalogoEntry) => {
    updateFila(filaId, {
      catalogo: cat,
      marca: cat.marca,
      modelo: cat.modelo,
      kw: String(cat.kw),
      estado: 'IDENTIFICADO',
      score: 100,
    });
  }, [updateFila]);

  // ── Paso 3: Exportar Excel ──────────────────────────────────────────────

  const handleExport = useCallback(async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Emisión');

    const headers = ['MATRÍCULA', 'MARCA', 'MODELO', 'VERSIÓN', 'AÑO', 'COMBUSTIBLE', 'KW', 'CV', 'CILINDRADA', 'PLAZAS', 'PVP', 'ID_CATÁLOGO'];
    const headerRow = ws.addRow(headers);
    headerRow.eachCell(cell => {
      cell.font = { bold: true, size: 11 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } };
      cell.border = { bottom: { style: 'thin' } };
    });

    filas.forEach(f => {
      const cat = f.catalogo;
      ws.addRow([
        f.matricula,
        cat?.marca ?? f.marca,
        cat?.modelo ?? f.modelo,
        cat?.version ?? '',
        cat?.anyo ?? (parseInt(f.anyo) || ''),
        cat?.combustible ?? f.combustible,
        cat?.kw ?? (parseInt(f.kw) || ''),
        cat?.kw ? Math.round(cat.kw * 1.36) : '',
        cat?.cilindrada ?? (parseInt(f.cilindrada) || ''),
        cat?.plazas ?? (parseInt(f.plazas) || ''),
        cat?.pvp ?? '',
        cat?.id_veh ?? '',
      ]);
    });

    // Auto-width
    ws.columns.forEach(col => {
      let max = 12;
      col.eachCell?.({ includeEmpty: true }, cell => {
        const len = String(cell.value ?? '').length + 2;
        if (len > max) max = len;
      });
      col.width = Math.min(max, 30);
    });

    const buf = await wb.xlsx.writeBuffer();
    saveAs(new Blob([buf]), `emision_plantilla_${new Date().toLocaleDateString('es-ES').replace(/\//g, '-')}.xlsx`);
  }, [filas]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-full overflow-y-auto custom-scrollbar animate-in fade-in duration-500">
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 8px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Header */}
        <div className="glass-card flex items-center justify-between px-5 py-3 rounded-2xl">
          <div>
            <h1 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
              <div className="w-1.5 h-4 rounded-full" style={{ background: '#6366f1' }} />
              Centro de Emisión
            </h1>
            <p className="text-[10px] mt-0.5 uppercase tracking-widest font-bold" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Identificación y plantilla de emisión masiva
            </p>
          </div>
          {tieneFilas && (
            <button onClick={() => { setFilas([]); }} style={{ ...btnPrimary, fontSize: 10, padding: '6px 14px' }}>
              + Nueva emisión
            </button>
          )}
        </div>

        {/* Paso 1: Entrada de datos */}
        {!tieneFilas && !loading && (
          <div style={{ ...glassCard, padding: 32, textAlign: 'center' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.5)', marginBottom: 24 }}>
              Selecciona un método de entrada
            </p>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleExcelUpload} />
              <button onClick={() => fileRef.current?.click()}
                style={{ ...glassCard, padding: '28px 36px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, minWidth: 200 }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                </svg>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Subir Excel</span>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>Archivo .xlsx con datos de vehículos</span>
              </button>
              <button onClick={addManual}
                style={{ ...glassCard, padding: '28px 36px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, minWidth: 200 }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Entrada manual</span>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>Añadir vehículos uno a uno</span>
              </button>
            </div>
          </div>
        )}

        {/* Spinner */}
        {loading && (
          <div style={{ ...glassCard, padding: 40, textAlign: 'center' }}>
            <div style={{ width: 32, height: 32, border: '3px solid rgba(99,102,241,0.2)', borderTopColor: '#818cf8', borderRadius: '50%', margin: '0 auto 12px', animation: 'spin 0.8s linear infinite' }} />
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>{loadingMsg}</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Paso 2: Tabla de revisión */}
        {tieneFilas && (
          <>
            {/* Resumen */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Total: {filas.length}
              </span>
              <span style={{ fontSize: 11, fontWeight: 800, color: '#10b981' }}>
                Identificados: {identificados}
              </span>
              {sinMatch > 0 && (
                <span style={{ fontSize: 11, fontWeight: 800, color: '#ef4444' }}>
                  Sin match: {sinMatch}
                </span>
              )}
              <div style={{ flex: 1 }} />
              <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleExcelUpload} />
              <button onClick={() => fileRef.current?.click()}
                style={{ ...btnPrimary, fontSize: 9, padding: '5px 12px' }}>
                + Añadir Excel
              </button>
              <button onClick={addManual}
                style={{ ...btnPrimary, fontSize: 9, padding: '5px 12px' }}>
                + Manual
              </button>
            </div>

            {/* Tabla */}
            <div style={{ ...glassCard, padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Matrícula', 'Marca', 'Modelo', 'kW', 'Estado', 'Catálogo', 'Score', ''].map(h => (
                      <th key={h} style={{
                        textAlign: 'left', padding: '10px 12px', fontSize: 10, fontWeight: 800,
                        color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em',
                        borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.2)',
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filas.map(fila => (
                    <React.Fragment key={fila._id}>
                      {/* Fila principal */}
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}>
                        <td style={{ padding: '8px 12px' }}>
                          {fila.estado === 'MANUAL' ? (
                            <input style={{ ...inputStyle, width: 100 }} value={fila.matricula} placeholder="0000XXX"
                              onChange={e => handleFieldChange(fila, 'matricula', e.target.value)} />
                          ) : (
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', fontFamily: 'monospace' }}>{fila.matricula}</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          {fila.estado === 'MANUAL' || fila.estado === 'SIN MATCH' ? (
                            <input style={{ ...inputStyle, width: 120 }} value={fila.marca} placeholder="Marca"
                              onChange={e => handleFieldChange(fila, 'marca', e.target.value)} />
                          ) : (
                            <span style={{ fontSize: 12, color: '#e2e8f0' }}>{fila.marca}</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          {fila.estado === 'MANUAL' || fila.estado === 'SIN MATCH' ? (
                            <input style={{ ...inputStyle, width: 140 }} value={fila.modelo} placeholder="Modelo"
                              onChange={e => handleFieldChange(fila, 'modelo', e.target.value)} />
                          ) : (
                            <span style={{ fontSize: 12, color: '#e2e8f0' }}>{fila.modelo}</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          {fila.estado === 'MANUAL' ? (
                            <input type="number" style={{ ...inputStyle, width: 60 }} value={fila.kw} placeholder="kW"
                              onChange={e => handleFieldChange(fila, 'kw', e.target.value)} />
                          ) : (
                            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>{fila.kw}</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <EstadoBadge estado={fila.estado} />
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          {fila.catalogo ? (
                            <button onClick={() => toggleExpand(fila._id)}
                              style={{ fontSize: 11, color: '#818cf8', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                              {fila.catalogo.marca} {fila.catalogo.modelo} {fila.catalogo.version ? `(${fila.catalogo.version})` : ''} {fila.catalogo.anyo || ''}
                            </button>
                          ) : (
                            <button onClick={() => toggleExpand(fila._id)}
                              style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', background: 'none', border: 'none', cursor: 'pointer' }}>
                              {fila.candidatos.length > 0 ? `${fila.candidatos.length} candidatos` : 'Buscar...'}
                            </button>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: (fila.score ?? 0) >= 70 ? '#10b981' : (fila.score ?? 0) >= 50 ? '#f59e0b' : 'rgba(255,255,255,0.3)' }}>
                          {fila.score != null ? fila.score : '—'}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => toggleExpand(fila._id)}
                              style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer', transform: fila.expanded ? 'rotate(180deg)' : 'none', transition: '0.15s' }}>
                              ▼
                            </button>
                            <button onClick={() => deleteFila(fila._id)}
                              style={{ fontSize: 10, color: 'rgba(239,68,68,0.5)', background: 'none', border: 'none', cursor: 'pointer' }}
                              onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(239,68,68,0.5)')}>
                              ✕
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Fila expandida */}
                      {fila.expanded && (
                        <tr>
                          <td colSpan={8} style={{ padding: 0 }}>
                            <div style={{ padding: '12px 24px 16px', background: 'rgba(0,0,0,0.15)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                              {/* Campos adicionales */}
                              {(fila.estado === 'MANUAL' || fila.estado === 'SIN MATCH') && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                                  <div>
                                    <label style={labelStyle}>Combustible</label>
                                    <select style={{ ...inputStyle, cursor: 'pointer' }} value={fila.combustible}
                                      onChange={e => handleFieldChange(fila, 'combustible', e.target.value)}>
                                      {COMBUSTIBLES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select>
                                  </div>
                                  <div>
                                    <label style={labelStyle}>Año</label>
                                    <input type="number" style={inputStyle} value={fila.anyo} placeholder="2019"
                                      onChange={e => handleFieldChange(fila, 'anyo', e.target.value)} />
                                  </div>
                                  <div>
                                    <label style={labelStyle}>Cilindrada (cc)</label>
                                    <input type="number" style={inputStyle} value={fila.cilindrada} placeholder="1968"
                                      onChange={e => handleFieldChange(fila, 'cilindrada', e.target.value)} />
                                  </div>
                                  <div>
                                    <label style={labelStyle}>Plazas</label>
                                    <input type="number" style={inputStyle} value={fila.plazas} placeholder="5"
                                      onChange={e => handleFieldChange(fila, 'plazas', e.target.value)} />
                                  </div>
                                </div>
                              )}
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                                {/* Datos originales */}
                                {Object.keys(fila.datos_originales).length > 0 && (
                                  <div>
                                    <p style={{ fontSize: 9, fontWeight: 900, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                                      Datos originales
                                    </p>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
                                      {Object.entries(fila.datos_originales).map(([k, v]) => (
                                        <div key={k} style={{ fontSize: 11 }}>
                                          <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 700 }}>{k}: </span>
                                          <span style={{ color: '#e2e8f0' }}>{v || '—'}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Candidatos catálogo */}
                                <div>
                                  <p style={{ fontSize: 9, fontWeight: 900, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                                    Catálogo {fila.searching && <span style={{ color: '#818cf8' }}>buscando...</span>}
                                  </p>
                                  {fila.candidatos.length === 0 && !fila.searching ? (
                                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>Sin candidatos. Escribe marca y modelo para buscar.</p>
                                  ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                      {fila.candidatos.map((c, ci) => {
                                        const selected = fila.catalogo?.id_veh === c.id_veh;
                                        return (
                                          <button key={ci} onClick={() => selectCatalogo(fila._id, c)}
                                            style={{
                                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                              padding: '6px 10px', borderRadius: 6, fontSize: 11, textAlign: 'left',
                                              background: selected ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.02)',
                                              border: selected ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.06)',
                                              color: '#e2e8f0', cursor: 'pointer', width: '100%',
                                            }}
                                            onMouseEnter={e => { if (!selected) e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)'; }}
                                            onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; }}>
                                            <span>
                                              <strong>{c.marca} {c.modelo}</strong>
                                              {c.version && <span style={{ color: 'rgba(255,255,255,0.4)' }}> {c.version}</span>}
                                              {c.anyo && <span style={{ color: 'rgba(255,255,255,0.35)' }}> ({c.anyo})</span>}
                                            </span>
                                            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap', marginLeft: 8 }}>
                                              {c.kw}kW · {c.combustible} {c.pvp ? `· ${c.pvp.toLocaleString('es-ES')}€` : ''}
                                            </span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paso 3: Exportar */}
            <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 24 }}>
              <button onClick={handleExport}
                disabled={filas.length === 0}
                style={{
                  ...btnPrimary, fontSize: 12, padding: '12px 28px',
                  background: identificados > 0 ? 'rgba(22,163,74,0.15)' : 'rgba(255,255,255,0.03)',
                  color: identificados > 0 ? '#16a34a' : 'rgba(255,255,255,0.25)',
                  borderColor: identificados > 0 ? 'rgba(22,163,74,0.3)' : 'rgba(255,255,255,0.08)',
                  cursor: filas.length > 0 ? 'pointer' : 'not-allowed',
                }}>
                Descargar plantilla emisión (.xlsx)
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
