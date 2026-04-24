"use client";

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';

// ─── Estimación fecha matrícula (placas españolas nuevas NNNN-LLL) ───────────

const PLATE_YEAR_RANGES: [string, string, number, number][] = [
  // [prefixFrom, prefixTo, yearFrom, yearTo] (4 dígitos)
  ['0000', '1999', 2000, 2003],
  ['2000', '3999', 2003, 2007],
  ['4000', '5999', 2007, 2011],
  ['6000', '7999', 2011, 2015],
  ['8000', '9999', 2015, 2023],
];

function estimateYear(plate: string): { year: number; range: string } | null {
  const m = plate.toUpperCase().match(/(\d{4})[- ]?[A-Z]{3}/);
  if (!m) return null;
  const num = parseInt(m[1]);
  for (const [from, to, yf, yt] of PLATE_YEAR_RANGES) {
    if (num >= parseInt(from) && num <= parseInt(to)) {
      return { year: Math.round((yf + yt) / 2), range: `${yf}–${yt}` };
    }
  }
  return null;
}

// ─── Estado por vehículo ──────────────────────────────────────────────────────

type EmisionStatus = 'pendiente' | 'listo' | 'sin_catalogo';

interface CandidatoCatalogo {
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
  score?: number;
}

interface VehicleEmision {
  matricula: string;
  marca: string;
  modelo: string;
  tipo: string;
  kw: string;
  cv: string;
  tn: string;
  status: EmisionStatus;
  candidatos: CandidatoCatalogo[];
  seleccionado: CandidatoCatalogo | null;
  searching: boolean;
}

interface Props {
  trabajoRows: Record<string, string>[];
  onCatalogoChange?: (selecciones: Record<string, string>) => void; // matricula → id_veh
}

// ─── Componente card por vehículo ─────────────────────────────────────────────

function VehicleCard({ v, onSearch, onSelect }: {
  v: VehicleEmision;
  onSearch: () => void;
  onSelect: (c: CandidatoCatalogo) => void;
}) {
  const estimation = estimateYear(v.matricula);

  const statusColors: Record<EmisionStatus, { bg: string; text: string; label: string }> = {
    pendiente:     { bg: '#fef3c7', text: '#92400e', label: 'Pendiente' },
    listo:         { bg: '#d1fae5', text: '#065f46', label: 'Listo' },
    sin_catalogo:  { bg: '#fee2e2', text: '#991b1b', label: 'Sin catálogo' },
  };
  const sc = statusColors[v.status];

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e5e7eb', background: '#ffffff' }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="flex items-center gap-3">
          <span className="font-black" style={{ fontSize: 15, fontFamily: 'monospace', color: '#111827' }}>{v.matricula}</span>
          <span style={{ fontSize: 11, color: '#6b7280' }}>{v.marca} {v.modelo} {v.tipo ? `· ${v.tipo}` : ''}</span>
        </div>
        <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
          style={{ background: sc.bg, color: sc.text }}>{sc.label}</span>
      </div>

      {/* Body */}
      <div style={{ padding: '10px 14px', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {/* Datos técnicos */}
        <div style={{ flex: '0 0 auto', display: 'flex', gap: 12 }}>
          {[['KW', v.kw], ['CV', v.cv], ['TN', v.tn]].map(([k, val]) => val ? (
            <div key={k} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af' }}>{k}</div>
              <div style={{ fontSize: 14, fontWeight: 900, fontFamily: 'monospace', color: '#374151' }}>{val}</div>
            </div>
          ) : null)}
        </div>

        {/* Estimación matrícula */}
        {estimation && (
          <div style={{ fontSize: 11, color: '#6b7280', display: 'flex', alignItems: 'center' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" style={{ marginRight: 5 }}>
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            Matrícula del <strong style={{ color: '#374151' }}>{estimation.range}</strong> aprox.
          </div>
        )}

        {/* Catálogo */}
        <div style={{ flex: 1, minWidth: 200 }}>
          {v.seleccionado ? (
            <div style={{ padding: '6px 10px', background: '#d1fae5', borderRadius: 8, border: '1px solid #6ee7b7', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 900, color: '#065f46', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Catálogo confirmado</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{v.seleccionado.marca} {v.seleccionado.modelo} {v.seleccionado.version} ({v.seleccionado.anyo})</div>
                <div style={{ fontSize: 10, color: '#6b7280' }}>{v.seleccionado.kw}kW{v.seleccionado.score != null ? ` · Score: ${Math.round(v.seleccionado.score * 100)}%` : ''}</div>
              </div>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>
            </div>
          ) : v.candidatos.length > 0 ? (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', marginBottom: 4 }}>Top {v.candidatos.length} candidatos:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {v.candidatos.map(c => (
                  <button key={c.id_veh} type="button" onClick={() => onSelect(c)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', fontSize: 12, textAlign: 'left' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#eff0ff')}
                    onMouseLeave={e => (e.currentTarget.style.background = '#f9fafb')}>
                    <span style={{ fontWeight: 600, color: '#374151' }}>{c.marca} {c.modelo} {c.version} ({c.anyo}) — {c.kw}kW</span>
                    {c.score != null && (
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded"
                        style={{ background: c.score >= 0.8 ? '#d1fae5' : '#fef3c7', color: c.score >= 0.8 ? '#065f46' : '#92400e' }}>
                        {Math.round(c.score * 100)}%
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <button type="button" onClick={onSearch} disabled={v.searching}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest"
              style={{ color: '#6366f1', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', cursor: v.searching ? 'wait' : 'pointer', opacity: v.searching ? 0.7 : 1 }}>
              {v.searching ? (
                <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0" opacity="0.3"/><path d="M12 3a9 9 0 019 9"/></svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              )}
              Buscar en catálogo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function HojaPreEmision({ trabajoRows, onCatalogoChange }: Props) {
  const initial = useMemo<VehicleEmision[]>(() =>
    trabajoRows.filter(r => r['matricula']?.trim()).map(r => ({
      matricula:   r['matricula'] ?? '',
      marca:       r['marca'] ?? '',
      modelo:      r['modelo'] ?? '',
      tipo:        r['tipo_vehiculo'] ?? '',
      kw:          r['kw'] ?? '',
      cv:          r['cv'] ?? '',
      tn:          r['tn'] ?? '',
      status:      'pendiente' as EmisionStatus,
      candidatos:  [],
      seleccionado: null,
      searching:   false,
    })),
    [trabajoRows],
  );

  const [vehicles, setVehicles] = useState<VehicleEmision[]>(initial);
  const autoSearchedRef = useRef(false);

  // Resync: añadir vehículos nuevos de trabajoRows
  useEffect(() => {
    const existingMats = new Set(vehicles.map(v => v.matricula));
    const newVehicles = initial.filter(v => v.matricula && !existingMats.has(v.matricula));
    if (newVehicles.length > 0) {
      setVehicles(prev => [...prev, ...newVehicles]);
    }
  }, [initial]);

  const setV = useCallback((i: number, patch: Partial<VehicleEmision>) => {
    setVehicles(prev => { const n = [...prev]; n[i] = { ...n[i], ...patch }; return n; });
  }, []);

  const handleSearch = useCallback(async (i: number) => {
    const v = vehicles[i];
    if (!v) return;
    setV(i, { searching: true });
    try {
      const res = await fetch('/api/catalogo/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marca: v.marca, modelo: v.modelo, kw: v.kw }),
      });
      if (!res.ok) throw new Error('API error');
      const json = await res.json();
      const candidatos: CandidatoCatalogo[] = (json.candidates ?? json.candidatos ?? json.results ?? []).slice(0, 3);
      setV(i, { candidatos, status: candidatos.length > 0 ? 'pendiente' : 'sin_catalogo', searching: false });
    } catch {
      setV(i, { status: 'sin_catalogo', searching: false });
    }
  }, [vehicles, setV]);

  // Auto-buscar al montar
  useEffect(() => {
    if (autoSearchedRef.current) return;
    if (vehicles.length === 0) return;
    autoSearchedRef.current = true;
    vehicles.forEach((v, i) => {
      if (v.candidatos.length === 0 && !v.searching && v.marca) {
        handleSearch(i);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicles.length]);

  const handleSelect = useCallback((i: number, c: CandidatoCatalogo) => {
    setV(i, { seleccionado: c, status: 'listo', candidatos: [] });
    // Persistir selección
    setVehicles(prev => {
      const updated = [...prev];
      updated[i] = { ...updated[i], seleccionado: c, status: 'listo', candidatos: [] };
      const selecciones: Record<string, string> = {};
      updated.forEach(v => {
        if (v.seleccionado && v.matricula) {
          selecciones[v.matricula] = v.seleccionado.id_veh;
        }
      });
      onCatalogoChange?.(selecciones);
      return updated;
    });
  }, [setV, onCatalogoChange]);

  const listos = vehicles.filter(v => v.status === 'listo').length;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 shrink-0"
        style={{ borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
        <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#6b7280' }}>
          Listos para emitir: {listos} / Total: {vehicles.length}
        </span>
        <div className="flex items-center gap-2">
          <div style={{ height: 6, width: 120, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${vehicles.length > 0 ? (listos / vehicles.length) * 100 : 0}%`, background: '#6366f1', borderRadius: 3, transition: 'width 0.3s' }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#6366f1' }}>
            {vehicles.length > 0 ? Math.round((listos / vehicles.length) * 100) : 0}%
          </span>
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-auto custom-scrollbar p-4" style={{ background: '#f9fafb' }}>
        {vehicles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af', fontSize: 13 }}>
            Añade vehículos en TRABAJO para comenzar la pre-emisión.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {vehicles.map((v, i) => (
              <VehicleCard key={v.matricula || i} v={v}
                onSearch={() => handleSearch(i)}
                onSelect={c => handleSelect(i, c)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
