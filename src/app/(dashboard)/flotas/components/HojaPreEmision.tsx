"use client";

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';

// ─── Estimación fecha matrícula (placas españolas nuevas NNNN-LLL) ───────────

const PLATE_YEAR_RANGES: [string, string, number, number][] = [
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

// ─── Tipos ───────────────────────────────────────────────────────────────────

type EmisionStatus = 'pendiente' | 'listo' | 'sin_catalogo';

interface CandidatoCatalogo {
  id_veh: string;
  marca: string;
  modelo: string;
  version: string;
  combustible: string;
  kw: number;
  cv: number;
  cilindrada: number;
  plazas: number;
  tara: number;
  pma: number;
  puertas: number;
  anyo: number;
  pvp?: number;
  score?: number;
}

const FUEL_LABEL: Record<string, string> = {
  D: 'Diésel', G: 'Gasolina', E: 'Eléctrico', X: 'HEV-G', Y: 'HEV-D',
  P: 'PHEV-G', R: 'PHEV-D', L: 'Gas', Z: 'REEV', B: 'Bio', H: 'H₂',
};

interface VehicleEmision {
  matricula: string;
  marca: string;
  modelo: string;
  tipo: string;
  kw: string;
  cv: string;
  tn: string;
  anyo_fabricacion: string;      // "09/2020" from Silverdat
  fecha_matriculacion: string;   // from Silverdat/DGT
  status: EmisionStatus;
  candidatos: CandidatoCatalogo[];
  seleccionado: CandidatoCatalogo | null;
  searching: boolean;
}

interface Props {
  trabajoRows: Record<string, string>[];
  onCatalogoChange?: (selecciones: Record<string, string>) => void;
}

// ─── Similitud entre vehículos ───────────────────────────────────────────────

/** Clave estricta: 100% idénticos en datos del Excel */
function strictKey(v: VehicleEmision): string {
  return `${v.marca}|${v.modelo}|${v.kw}|${v.cv}|${v.tn}|${v.tipo}`.toUpperCase().trim();
}

/** Similitud flexible: misma marca+modelo, kW cercano */
function areSimilar(a: VehicleEmision, b: VehicleEmision): boolean {
  if (a.marca.toUpperCase() !== b.marca.toUpperCase()) return false;
  if (a.modelo.toUpperCase() !== b.modelo.toUpperCase()) return false;
  // kW: tolerancia 5%
  const kwA = parseFloat(a.kw) || 0;
  const kwB = parseFloat(b.kw) || 0;
  if (kwA > 0 && kwB > 0 && Math.abs(kwA - kwB) / Math.max(kwA, kwB) > 0.05) return false;
  return true;
}

/** Describe las diferencias entre dos vehículos */
function getDiffs(base: VehicleEmision, other: VehicleEmision): string[] {
  const diffs: string[] = [];
  if (base.kw !== other.kw) diffs.push(`KW: ${base.kw} vs ${other.kw}`);
  if (base.cv !== other.cv) diffs.push(`CV: ${base.cv} vs ${other.cv}`);
  if (base.tn !== other.tn) diffs.push(`TN: ${base.tn} vs ${other.tn}`);
  if (base.tipo.toUpperCase() !== other.tipo.toUpperCase()) diffs.push(`Tipo: ${base.tipo} vs ${other.tipo}`);
  return diffs;
}

// ─── Modal: aplicar a similares ──────────────────────────────────────────────

function SimilarModal({ source, similar, selected, onApply, onClose }: {
  source: VehicleEmision;
  similar: { vehicle: VehicleEmision; idx: number; diffs: string[]; identical: boolean }[];
  selected: CandidatoCatalogo;
  onApply: (indices: number[]) => void;
  onClose: () => void;
}) {
  const [checked, setChecked] = useState<Set<number>>(() => {
    // Auto-check los 100% idénticos
    const auto = new Set<number>();
    similar.forEach(s => { if (s.identical) auto.add(s.idx); });
    return auto;
  });

  const toggle = (idx: number) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const identicalCount = similar.filter(s => s.identical).length;
  const similarCount = similar.filter(s => !s.identical).length;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} />
      <div style={{ position: 'relative', background: '#fff', borderRadius: 16, padding: '24px', maxWidth: 520, width: '90%', maxHeight: '80vh', overflow: 'auto', boxShadow: '0 25px 80px rgba(0,0,0,0.3)' }}
        onClick={e => e.stopPropagation()}>

        <div style={{ fontSize: 14, fontWeight: 900, color: '#111827', marginBottom: 4 }}>
          Aplicar selección a vehículos similares
        </div>
        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 16 }}>
          Has seleccionado <strong>{selected.version}</strong> para {source.matricula}.
          {identicalCount > 0 && <> Hay <strong style={{ color: '#059669' }}>{identicalCount} idénticos</strong> (pre-marcados).</>}
          {similarCount > 0 && <> Hay <strong style={{ color: '#d97706' }}>{similarCount} similares</strong> con diferencias.</>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
          {similar.map(s => (
            <label key={s.idx}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                background: checked.has(s.idx) ? (s.identical ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)') : '#f9fafb',
                border: `1px solid ${checked.has(s.idx) ? (s.identical ? '#6ee7b7' : '#fcd34d') : '#e5e7eb'}`,
                transition: 'all 0.15s',
              }}>
              <input type="checkbox" checked={checked.has(s.idx)} onChange={() => toggle(s.idx)}
                style={{ marginTop: 2, accentColor: s.identical ? '#059669' : '#d97706' }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: '#111827' }}>{s.vehicle.matricula}</span>
                  {s.identical ? (
                    <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 4, background: '#d1fae5', color: '#065f46', textTransform: 'uppercase' }}>Idéntico</span>
                  ) : (
                    <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 4, background: '#fef3c7', color: '#92400e', textTransform: 'uppercase' }}>Similar</span>
                  )}
                </div>
                {s.diffs.length > 0 && (
                  <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
                    Diferencias: {s.diffs.join(' · ')}
                  </div>
                )}
              </div>
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose}
            style={{ fontSize: 11, fontWeight: 700, padding: '8px 16px', borderRadius: 8, background: '#f3f4f6', border: '1px solid #e5e7eb', color: '#6b7280', cursor: 'pointer' }}>
            Solo este
          </button>
          <button type="button"
            onClick={() => onApply(Array.from(checked))}
            disabled={checked.size === 0}
            style={{
              fontSize: 11, fontWeight: 700, padding: '8px 16px', borderRadius: 8, cursor: checked.size > 0 ? 'pointer' : 'not-allowed',
              background: checked.size > 0 ? '#1240CC' : '#d1d5db', color: '#fff', border: 'none',
            }}>
            Aplicar a {checked.size} vehículo{checked.size !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Componente card por vehículo ────────────────────────────────────────────

function VehicleCard({ v, similarCount, onSearch, onSelect, onDirectId }: {
  v: VehicleEmision;
  similarCount: number;
  onSearch: () => void;
  onSelect: (c: CandidatoCatalogo) => void;
  onDirectId: (idVeh: string) => void;
}) {
  const estimation = estimateYear(v.matricula);
  const [idInput, setIdInput] = useState('');
  const [showIdInput, setShowIdInput] = useState(false);

  const statusColors: Record<EmisionStatus, { bg: string; text: string; label: string }> = {
    pendiente:     { bg: '#fef3c7', text: '#92400e', label: 'Pendiente' },
    listo:         { bg: '#d1fae5', text: '#065f46', label: 'Listo' },
    sin_catalogo:  { bg: '#fee2e2', text: '#991b1b', label: 'Sin catálogo' },
  };
  const sc = statusColors[v.status];

  const handleIdSubmit = () => {
    const id = idInput.trim();
    if (id) { onDirectId(id); setIdInput(''); setShowIdInput(false); }
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e5e7eb', background: '#ffffff' }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="flex items-center gap-3">
          <span className="font-black" style={{ fontSize: 15, fontFamily: 'monospace', color: '#111827' }}>{v.matricula}</span>
          <span style={{ fontSize: 11, color: '#6b7280' }}>{v.marca} {v.modelo} {v.tipo ? `· ${v.tipo}` : ''}</span>
          {similarCount > 0 && (
            <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 4, background: '#ede9fe', color: '#6d28d9' }}>
              x{similarCount + 1} similares
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Botón ID directo */}
          {!v.seleccionado && (
            <button type="button" onClick={() => setShowIdInput(!showIdInput)}
              title="Asignar por ID de catálogo"
              style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'rgba(18,64,204,0.06)', border: '1px solid rgba(18,64,204,0.15)', color: '#1240CC', cursor: 'pointer' }}>
              ID
            </button>
          )}
          <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
            style={{ background: sc.bg, color: sc.text }}>{sc.label}</span>
        </div>
      </div>

      {/* ID directo input */}
      {showIdInput && !v.seleccionado && (
        <div style={{ padding: '8px 14px', borderBottom: '1px solid #e5e7eb', background: '#f0f4ff', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', whiteSpace: 'nowrap' }}>ID Catálogo:</span>
          <input
            style={{ flex: 1, fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontFamily: 'monospace', outline: 'none' }}
            placeholder="Ej: 241210258"
            value={idInput}
            onChange={e => setIdInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleIdSubmit(); }}
            autoFocus
          />
          <button type="button" onClick={handleIdSubmit}
            style={{ fontSize: 10, fontWeight: 700, padding: '4px 12px', borderRadius: 6, background: '#1240CC', color: '#fff', border: 'none', cursor: 'pointer' }}>
            Asignar
          </button>
        </div>
      )}

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

        {/* Fecha: dato real (Silverdat) o estimación matrícula */}
        {(() => {
          // Extract real year from Silverdat dates
          const realDate = v.fecha_matriculacion || v.anyo_fabricacion;
          if (realDate) {
            return (
              <div style={{ fontSize: 11, color: '#059669', display: 'flex', alignItems: 'center', fontWeight: 600 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" style={{ marginRight: 5 }}>
                  <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                {v.fecha_matriculacion ? 'Matriculación' : 'Fabricación'}: <strong style={{ color: '#065f46', marginLeft: 4 }}>{realDate}</strong>
              </div>
            );
          }
          if (estimation) {
            return (
              <div style={{ fontSize: 11, color: '#6b7280', display: 'flex', alignItems: 'center' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" style={{ marginRight: 5 }}>
                  <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                Matrícula del <strong style={{ color: '#374151' }}>{estimation.range}</strong> aprox.
              </div>
            );
          }
          return null;
        })()}

        {/* Catálogo — acabados */}
        <div style={{ flex: 1, minWidth: 200 }}>
          {v.seleccionado ? (
            <div style={{ padding: '6px 10px', background: '#d1fae5', borderRadius: 8, border: '1px solid #6ee7b7', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 900, color: '#065f46', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Catálogo confirmado</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{v.seleccionado.version}</div>
                <div style={{ fontSize: 10, color: '#6b7280' }}>
                  ID: {v.seleccionado.id_veh} · {v.seleccionado.kw}kW/{v.seleccionado.cv || Math.round(v.seleccionado.kw * 1.36)}CV · {FUEL_LABEL[v.seleccionado.combustible] ?? v.seleccionado.combustible}
                  {v.seleccionado.cilindrada > 0 ? ` · ${v.seleccionado.cilindrada}cc` : ''}
                  {v.seleccionado.plazas > 0 ? ` · ${v.seleccionado.plazas}pl` : ''}
                  {v.seleccionado.tara > 0 ? ` · ${v.seleccionado.tara}kg` : ''}
                </div>
              </div>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>
            </div>
          ) : v.candidatos.length > 0 ? (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', marginBottom: 4 }}>Selecciona acabado ({v.candidatos.length} opciones):</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 280, overflowY: 'auto' }}>
                {v.candidatos.map(c => {
                  const fuelLabel = FUEL_LABEL[c.combustible] ?? c.combustible;
                  return (
                    <button key={c.id_veh} type="button" onClick={() => onSelect(c)}
                      style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 10px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', fontSize: 12, textAlign: 'left' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(160,216,244,0.15)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '#f9fafb')}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, color: '#374151' }}>{c.version}</span>
                        {c.score != null && (
                          <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'monospace', color: c.score >= 80 ? '#059669' : c.score >= 60 ? '#d97706' : '#dc2626' }}>
                            {c.score}%
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 10, fontSize: 10, color: '#9ca3af', flexWrap: 'wrap' }}>
                        <span>{c.kw}kW/{c.cv || Math.round(c.kw * 1.36)}CV</span>
                        <span>{fuelLabel}</span>
                        {c.cilindrada > 0 && <span>{c.cilindrada}cc</span>}
                        {c.plazas > 0 && <span>{c.plazas}pl</span>}
                        {c.tara > 0 && <span>{c.tara}kg</span>}
                        {c.puertas > 0 && <span>{c.puertas}p</span>}
                        {c.pvp ? <span style={{ color: '#6b7280' }}>{c.pvp.toLocaleString('es-ES')}€</span> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {v.status === 'sin_catalogo' && (
                <span style={{ fontSize: 10, color: '#9ca3af' }}>Sin resultados en catálogo</span>
              )}
              <button type="button" onClick={onSearch} disabled={v.searching}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest"
                style={{
                  color: v.status === 'sin_catalogo' ? '#9ca3af' : '#1240CC',
                  background: v.status === 'sin_catalogo' ? 'rgba(156,163,175,0.08)' : 'rgba(18,64,204,0.08)',
                  border: `1px solid ${v.status === 'sin_catalogo' ? 'rgba(156,163,175,0.2)' : 'rgba(18,64,204,0.2)'}`,
                  cursor: v.searching ? 'wait' : 'pointer', opacity: v.searching ? 0.7 : 1,
                }}>
                {v.searching ? (
                  <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0" opacity="0.3"/><path d="M12 3a9 9 0 019 9"/></svg>
                ) : (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                )}
                {v.searching ? 'Buscando...' : v.status === 'sin_catalogo' ? 'Reintentar búsqueda' : 'Buscar en catálogo'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

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
      anyo_fabricacion:    r['anyo_fabricacion'] ?? '',
      fecha_matriculacion: r['fecha_matriculacion'] ?? '',
      status:      'pendiente' as EmisionStatus,
      candidatos:  [],
      seleccionado: null,
      searching:   false,
    })),
    [trabajoRows],
  );

  const [vehicles, setVehicles] = useState<VehicleEmision[]>(initial);
  const autoSearchedRef = useRef(false);

  // Modal state
  const [modalData, setModalData] = useState<{
    sourceIdx: number;
    selected: CandidatoCatalogo;
    similar: { vehicle: VehicleEmision; idx: number; diffs: string[]; identical: boolean }[];
  } | null>(null);

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

  // Contar similares por vehículo (para el badge)
  const similarCounts = useMemo(() => {
    const counts: number[] = vehicles.map(() => 0);
    for (let i = 0; i < vehicles.length; i++) {
      for (let j = i + 1; j < vehicles.length; j++) {
        if (areSimilar(vehicles[i], vehicles[j])) {
          counts[i]++;
          counts[j]++;
        }
      }
    }
    return counts;
  }, [vehicles]);

  // Extract real year from Silverdat dates (formats: "09/2020", "2020-09-15", "15/09/2020")
  const extractYear = useCallback((v: VehicleEmision): number | null => {
    // Priority 1: fecha_matriculacion from Silverdat/DGT
    // Priority 2: anyo_fabricacion from Silverdat
    for (const dateStr of [v.fecha_matriculacion, v.anyo_fabricacion]) {
      if (!dateStr) continue;
      // Try 4-digit year anywhere in the string
      const m = dateStr.match(/(\d{4})/);
      if (m) {
        const y = parseInt(m[1]);
        if (y >= 1980 && y <= 2040) return y;
      }
    }
    return null;
  }, []);

  const doSearch = useCallback(async (body: Record<string, string | number>): Promise<CandidatoCatalogo[]> => {
    const res = await fetch('/api/catalogo/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('API error');
    const json = await res.json();
    return json.candidates ?? json.candidatos ?? json.results ?? [];
  }, []);

  const handleSearch = useCallback(async (i: number) => {
    const v = vehicles[i];
    if (!v) return;
    setV(i, { searching: true });
    try {
      const body: Record<string, string | number> = {};
      if (v.marca) body.marca = v.marca;
      if (v.modelo) body.modelo = v.modelo;
      if (v.kw) body.kw = v.kw;
      else if (v.cv) body.kw = String(Math.round(parseFloat(v.cv) / 1.36));
      if (v.tn) {
        const tnNum = parseFloat(v.tn);
        body.tara = tnNum >= 100 ? tnNum : tnNum * 1000;
      }

      // Año: prioridad fecha real (Silverdat) > estimación matrícula
      const realYear = extractYear(v);
      const plateEst = estimateYear(v.matricula);
      if (realYear) body.anyo = realYear;
      else if (plateEst) body.anyo = plateEst.year;

      // Intento 1: búsqueda completa
      let candidatos = await doSearch(body);

      // Fallback 1: sin año (puede ser estimación incorrecta)
      if (candidatos.length === 0 && body.anyo) {
        const { anyo: _, ...sinAnyo } = body;
        candidatos = await doSearch(sinAnyo);
      }

      // Fallback 2: solo marca + modelo (sin filtros técnicos)
      if (candidatos.length === 0 && body.marca && body.modelo) {
        candidatos = await doSearch({ marca: body.marca, modelo: body.modelo });
      }

      // Limit to top 5 most relevant candidates
      const top = candidatos.slice(0, 5);

      if (top.length === 1) {
        // Auto-select when only one result
        setVehicles(prev => {
          const n = [...prev];
          n[i] = { ...n[i], candidatos: top, seleccionado: top[0], status: 'listo', searching: false };
          return n;
        });
        pendingNotifyRef.current = true;
      } else {
        setV(i, { candidatos: top, status: top.length > 0 ? 'pendiente' : 'sin_catalogo', searching: false });
      }
    } catch {
      setV(i, { status: 'sin_catalogo', searching: false });
    }
  }, [vehicles, setV, extractYear, doSearch]);

  // Auto-buscar al montar — throttled (max 3 concurrent)
  useEffect(() => {
    if (autoSearchedRef.current) return;
    if (vehicles.length === 0) return;
    autoSearchedRef.current = true;

    const pending = vehicles
      .map((v, i) => ({ v, i }))
      .filter(({ v }) => v.candidatos.length === 0 && !v.searching && v.marca);

    let active = 0;
    let idx = 0;
    const MAX_CONCURRENT = 3;

    const runNext = () => {
      while (active < MAX_CONCURRENT && idx < pending.length) {
        const { i } = pending[idx++];
        active++;
        Promise.resolve(handleSearch(i)).finally(() => { active--; runNext(); });
      }
    };
    runNext();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicles.length]);

  // Notificar selecciones al padre (via effect to avoid setState-during-render)
  const pendingNotifyRef = useRef(false);

  useEffect(() => {
    if (!pendingNotifyRef.current) return;
    pendingNotifyRef.current = false;
    const selecciones: Record<string, string> = {};
    vehicles.forEach(v => {
      if (v.seleccionado && v.matricula) {
        selecciones[v.matricula] = v.seleccionado.id_veh;
      }
    });
    onCatalogoChange?.(selecciones);
  }, [vehicles, onCatalogoChange]);

  // Aplicar selección a un solo vehículo
  const applyToSingle = useCallback((idx: number, cat: CandidatoCatalogo) => {
    setVehicles(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], seleccionado: cat, status: 'listo' };
      return updated;
    });
    pendingNotifyRef.current = true;
  }, []);

  // Aplicar selección a múltiples vehículos
  const applyToMultiple = useCallback((indices: number[], cat: CandidatoCatalogo) => {
    setVehicles(prev => {
      const updated = [...prev];
      indices.forEach(idx => {
        updated[idx] = { ...updated[idx], seleccionado: cat, status: 'listo' };
      });
      return updated;
    });
    pendingNotifyRef.current = true;
  }, []);

  const handleSelect = useCallback((i: number, c: CandidatoCatalogo) => {
    const source = vehicles[i];
    const sourceKey = strictKey(source);

    // Buscar similares (no seleccionados aún, excluyendo el actual)
    const similar: { vehicle: VehicleEmision; idx: number; diffs: string[]; identical: boolean }[] = [];
    vehicles.forEach((v, j) => {
      if (j === i || v.seleccionado) return;
      if (!areSimilar(source, v)) return;
      const identical = strictKey(v) === sourceKey;
      similar.push({ vehicle: v, idx: j, diffs: getDiffs(source, v), identical });
    });

    // Aplicar siempre al vehículo actual
    applyToSingle(i, c);

    // Si hay similares, abrir modal para que el jefe decida
    if (similar.length > 0) {
      setModalData({ sourceIdx: i, selected: c, similar });
    }
  }, [vehicles, applyToSingle]);

  // Búsqueda directa por ID de catálogo
  const handleDirectId = useCallback(async (i: number, idVeh: string) => {
    setV(i, { searching: true });
    try {
      const res = await fetch(`/api/catalogo/${encodeURIComponent(idVeh)}`);
      const json = await res.json();
      if (json.ok && json.vehiculo) {
        handleSelect(i, json.vehiculo as CandidatoCatalogo);
      } else {
        alert(`ID "${idVeh}" no encontrado en el catálogo`);
        setV(i, { searching: false });
      }
    } catch {
      setV(i, { searching: false });
    }
  }, [setV, handleSelect]);

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
            <div style={{ height: '100%', width: `${vehicles.length > 0 ? (listos / vehicles.length) * 100 : 0}%`, background: '#1240CC', borderRadius: 3, transition: 'width 0.3s' }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#1240CC' }}>
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
                similarCount={similarCounts[i]}
                onSearch={() => handleSearch(i)}
                onSelect={c => handleSelect(i, c)}
                onDirectId={id => handleDirectId(i, id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal: aplicar a similares */}
      {modalData && (
        <SimilarModal
          source={vehicles[modalData.sourceIdx]}
          similar={modalData.similar}
          selected={modalData.selected}
          onClose={() => setModalData(null)}
          onApply={(indices) => {
            applyToMultiple(indices, modalData.selected);
            setModalData(null);
          }}
        />
      )}
    </div>
  );
}
