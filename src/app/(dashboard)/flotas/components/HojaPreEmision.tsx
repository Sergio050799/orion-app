"use client";

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';

// ─── Estimación año por matrícula (NNNN-LLL) ─────────────────────────────────

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
    if (num >= parseInt(from) && num <= parseInt(to))
      return { year: Math.round((yf + yt) / 2), range: `${yf}–${yt}` };
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
  anyo_fabricacion: string;
  fecha_matriculacion: string;
  status: EmisionStatus;
  candidatos: CandidatoCatalogo[];
  seleccionado: CandidatoCatalogo | null;
  searching: boolean;
}

interface Props {
  trabajoRows: Record<string, string>[];
  onCatalogoChange?: (selecciones: Record<string, string>) => void;
}

// ─── Helpers similitud ───────────────────────────────────────────────────────

function strictKey(v: VehicleEmision): string {
  return `${v.marca}|${v.modelo}|${v.kw}|${v.cv}|${v.tn}|${v.tipo}`.toUpperCase().trim();
}

function areSimilar(a: VehicleEmision, b: VehicleEmision): boolean {
  if (a.marca.toUpperCase() !== b.marca.toUpperCase()) return false;
  if (a.modelo.toUpperCase() !== b.modelo.toUpperCase()) return false;
  const kwA = parseFloat(a.kw) || 0;
  const kwB = parseFloat(b.kw) || 0;
  if (kwA > 0 && kwB > 0 && Math.abs(kwA - kwB) / Math.max(kwA, kwB) > 0.05) return false;
  return true;
}

function getDiffs(base: VehicleEmision, other: VehicleEmision): string[] {
  const diffs: string[] = [];
  if (base.kw !== other.kw) diffs.push(`KW: ${base.kw}→${other.kw}`);
  if (base.cv !== other.cv) diffs.push(`CV: ${base.cv}→${other.cv}`);
  if (base.tn !== other.tn) diffs.push(`TN: ${base.tn}→${other.tn}`);
  if (base.tipo.toUpperCase() !== other.tipo.toUpperCase()) diffs.push(`Tipo: ${base.tipo}→${other.tipo}`);
  return diffs;
}

// ─── ManualSearchPanel ────────────────────────────────────────────────────────

function ManualSearchPanel({ vehicle, onSelect, onClose }: {
  vehicle: VehicleEmision;
  onSelect: (c: CandidatoCatalogo) => void;
  onClose: () => void;
}) {
  const isRem = ['semirremolque', 'remolque'].includes((vehicle.tipo || '').toLowerCase());
  const initMarca  = isRem ? 'REMOLQUE' : vehicle.marca;
  const initModelo = isRem
    ? ((vehicle.tipo || '').toLowerCase() === 'semirremolque' ? 'SEMIRREMOLQUE' : 'REMOLQUE') + (vehicle.marca ? ` ${vehicle.marca}` : '')
    : vehicle.modelo;

  const [marca, setMarca]           = useState(initMarca);
  const [modelo, setModelo]         = useState(initModelo);
  const [combustible, setCombustible] = useState('');
  const [kw, setKw]                 = useState(isRem ? '' : (vehicle.kw || ''));
  const [anyo, setAnyo]             = useState('');
  const [results, setResults]       = useState<CandidatoCatalogo[]>([]);
  const [loading, setLoading]       = useState(false);
  const [searched, setSearched]     = useState(false);
  const firstRef = useRef(true);

  const doSearch = useCallback(async () => {
    setLoading(true);
    setSearched(true);
    try {
      const body: Record<string, string | number> = {};
      if (marca)      body.marca      = marca;
      if (modelo)     body.modelo     = modelo;
      if (combustible) body.combustible = combustible;
      if (kw)         body.kw         = kw;
      if (anyo)       body.anyo       = parseInt(anyo);
      const res  = await fetch('/api/catalogo/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      setResults((json.candidates ?? json.candidatos ?? json.results ?? []).slice(0, 40));
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [marca, modelo, combustible, kw, anyo]);

  useEffect(() => {
    if (firstRef.current) { firstRef.current = false; doSearch(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') doSearch(); };

  return (
    <div style={{ padding: '10px 14px 14px', background: '#f0f4ff', borderTop: '1px solid #c8d8f5' }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 8 }}>
        <Fld label="Marca">
          <input value={marca} onChange={e => setMarca(e.target.value)} onKeyDown={onKey}
            style={{ ...inS, width: 110 }} />
        </Fld>
        <Fld label="Modelo">
          <input value={modelo} onChange={e => setModelo(e.target.value)} onKeyDown={onKey}
            style={{ ...inS, width: 160 }} />
        </Fld>
        <Fld label="Combustible">
          <select value={combustible} onChange={e => setCombustible(e.target.value)} style={{ ...inS, width: 90 }}>
            <option value="">Todos</option>
            {Object.entries(FUEL_LABEL).map(([k, lbl]) => <option key={k} value={k}>{lbl}</option>)}
          </select>
        </Fld>
        <Fld label="KW">
          <input value={kw} onChange={e => setKw(e.target.value)} placeholder="ej. 338" onKeyDown={onKey}
            style={{ ...inS, width: 70 }} />
        </Fld>
        <Fld label="Año">
          <input value={anyo} onChange={e => setAnyo(e.target.value)} placeholder="2020" onKeyDown={onKey}
            style={{ ...inS, width: 70 }} />
        </Fld>
        <button onClick={doSearch} disabled={loading}
          style={{ padding: '5px 14px', borderRadius: 6, background: '#1240CC', color: '#fff', border: 'none', fontSize: 11, fontWeight: 700, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1, alignSelf: 'flex-end', height: 28 }}>
          {loading ? '...' : 'Buscar'}
        </button>
        <button onClick={onClose}
          style={{ padding: '5px 10px', borderRadius: 6, background: '#fff', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: 11, cursor: 'pointer', alignSelf: 'flex-end', height: 28 }}>
          ✕
        </button>
      </div>

      {searched && (
        <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #d4dff5', borderRadius: 8, background: '#fff' }}>
          {results.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
              Sin resultados. Ajusta los filtros.
            </div>
          ) : results.map(c => (
            <button key={c.id_veh} type="button" onClick={() => onSelect(c)}
              style={{ display: 'flex', width: '100%', textAlign: 'left', padding: '8px 12px', background: '#fff', border: 'none', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', alignItems: 'center', gap: 10 }}
              onMouseEnter={e => (e.currentTarget.style.background = '#eef3ff')}
              onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#111827' }}>{c.version}</span>
              <span style={{ fontSize: 10, color: '#374151', whiteSpace: 'nowrap' }}>
                {c.kw > 0 ? `${c.kw}kW · ` : ''}{FUEL_LABEL[c.combustible] ?? c.combustible}
                {c.anyo ? ` · ${c.anyo}` : ''}
                {c.cilindrada > 0 ? ` · ${c.cilindrada}cc` : ''}
                {c.tara > 0 ? ` · ${c.tara}kg` : ''}
              </span>
              <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#374151', whiteSpace: 'nowrap' }}>{c.id_veh}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Fld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
      {children}
    </div>
  );
}

const inS: React.CSSProperties = {
  fontSize: 11, padding: '5px 8px', borderRadius: 6,
  border: '1px solid #d1d5db', outline: 'none', background: '#fff', color: '#111827',
};

// ─── SimilarModal ─────────────────────────────────────────────────────────────

function SimilarModal({ source, similar, selected, onApply, onClose }: {
  source: VehicleEmision;
  similar: { vehicle: VehicleEmision; idx: number; diffs: string[]; identical: boolean }[];
  selected: CandidatoCatalogo;
  onApply: (indices: number[]) => void;
  onClose: () => void;
}) {
  const [checked, setChecked] = useState<Set<number>>(() => {
    const auto = new Set<number>();
    similar.forEach(s => { if (s.identical) auto.add(s.idx); });
    return auto;
  });

  const toggle = (idx: number) => setChecked(prev => {
    const next = new Set(prev);
    if (next.has(idx)) next.delete(idx); else next.add(idx);
    return next;
  });

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} />
      <div style={{ position: 'relative', background: '#fff', borderRadius: 16, padding: 24, maxWidth: 520, width: '90%', maxHeight: '80vh', overflow: 'auto', boxShadow: '0 25px 80px rgba(0,0,0,0.3)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 14, fontWeight: 900, color: '#111827', marginBottom: 4 }}>
          Vehículos similares sin versión
        </div>
        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 16 }}>
          ¿Aplicar <strong>{selected.version}</strong> también a estos vehículos?
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
          {similar.map(s => (
            <label key={s.idx}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                background: checked.has(s.idx) ? 'rgba(245,158,11,0.08)' : '#f9fafb',
                border: `1px solid ${checked.has(s.idx) ? '#fcd34d' : '#e5e7eb'}`,
                transition: 'all 0.12s',
              }}>
              <input type="checkbox" checked={checked.has(s.idx)} onChange={() => toggle(s.idx)}
                style={{ marginTop: 2, accentColor: '#d97706' }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: '#111827' }}>{s.vehicle.matricula}</span>
                  <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 4, background: '#fef3c7', color: '#92400e', textTransform: 'uppercase' }}>Similar</span>
                </div>
                {s.diffs.length > 0 && (
                  <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
                    {s.diffs.join(' · ')}
                  </div>
                )}
              </div>
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose}
            style={{ fontSize: 11, fontWeight: 700, padding: '8px 16px', borderRadius: 8, background: '#f3f4f6', border: '1px solid #e5e7eb', color: '#6b7280', cursor: 'pointer' }}>
            Solo estos ya aplicados
          </button>
          <button type="button" onClick={() => onApply(Array.from(checked))}
            disabled={checked.size === 0}
            style={{ fontSize: 11, fontWeight: 700, padding: '8px 16px', borderRadius: 8, cursor: checked.size > 0 ? 'pointer' : 'not-allowed', background: checked.size > 0 ? '#1240CC' : '#d1d5db', color: '#fff', border: 'none' }}>
            Aplicar a {checked.size} vehículo{checked.size !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── StatusChip ───────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: EmisionStatus }) {
  const cfg = {
    pendiente:    { bg: '#fef3c7', text: '#92400e', label: 'Pendiente' },
    listo:        { bg: '#d1fae5', text: '#065f46', label: 'Listo' },
    sin_catalogo: { bg: '#fee2e2', text: '#991b1b', label: 'Sin catálogo' },
  }[status];
  return (
    <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 4, background: cfg.bg, color: cfg.text, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
      {cfg.label}
    </span>
  );
}

// ─── HojaPreEmision ───────────────────────────────────────────────────────────

export default function HojaPreEmision({ trabajoRows, onCatalogoChange }: Props) {
  const initial = useMemo<VehicleEmision[]>(() =>
    trabajoRows.filter(r => r['matricula']?.trim()).map(r => ({
      matricula:           r['matricula'] ?? '',
      marca:               r['marca'] ?? '',
      modelo:              r['modelo'] ?? '',
      tipo:                r['tipo_vehiculo'] ?? '',
      kw:                  r['kw'] ?? '',
      cv:                  r['cv'] ?? '',
      tn:                  r['tn'] ?? '',
      anyo_fabricacion:    r['anyo_fabricacion'] ?? '',
      fecha_matriculacion: r['fecha_matriculacion'] ?? '',
      status:              'pendiente' as EmisionStatus,
      candidatos:          [],
      seleccionado:        null,
      searching:           false,
    })),
    [trabajoRows],
  );

  const [vehicles, setVehicles]         = useState<VehicleEmision[]>(initial);
  const [openSearchRow, setOpenSearchRow] = useState<number | null>(null);
  const [checkedRows, setCheckedRows]   = useState<Set<number>>(new Set());
  const searchedMatsRef                 = useRef<Set<string>>(new Set());
  const searchAbortRef                  = useRef<Map<number, AbortController>>(new Map());
  const pendingNotifyRef                = useRef(false);

  const [modalData, setModalData] = useState<{
    sourceIdx: number;
    selected: CandidatoCatalogo;
    similar: { vehicle: VehicleEmision; idx: number; diffs: string[]; identical: boolean }[];
  } | null>(null);

  // Añadir vehículos nuevos de trabajoRows sin resetear los existentes
  useEffect(() => {
    const existingMats = new Set(vehicles.map(v => v.matricula));
    const newVehicles = initial.filter(v => v.matricula && !existingMats.has(v.matricula));
    if (newVehicles.length > 0) setVehicles(prev => [...prev, ...newVehicles]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const setV = useCallback((i: number, patch: Partial<VehicleEmision>) => {
    setVehicles(prev => { const n = [...prev]; n[i] = { ...n[i], ...patch }; return n; });
  }, []);

  const applyToMultiple = useCallback((indices: number[], cat: CandidatoCatalogo) => {
    setVehicles(prev => {
      const updated = [...prev];
      indices.forEach(idx => { updated[idx] = { ...updated[idx], seleccionado: cat, status: 'listo', searching: false }; });
      return updated;
    });
    pendingNotifyRef.current = true;
  }, []);

  // Selección: auto-aplica a idénticos, modal solo para similares distintos
  const handleSelect = useCallback((i: number, c: CandidatoCatalogo) => {
    const source   = vehicles[i];
    const srcKey   = strictKey(source);
    const identical: number[] = [];
    const similar:  { vehicle: VehicleEmision; idx: number; diffs: string[]; identical: boolean }[] = [];

    vehicles.forEach((v, j) => {
      if (j === i || v.seleccionado) return;
      if (!areSimilar(source, v)) return;
      if (strictKey(v) === srcKey) identical.push(j);
      else similar.push({ vehicle: v, idx: j, diffs: getDiffs(source, v), identical: false });
    });

    applyToMultiple([i, ...identical], c);
    setOpenSearchRow(null);

    if (similar.length > 0) setModalData({ sourceIdx: i, selected: c, similar });
  }, [vehicles, applyToMultiple]);

  const extractYear = useCallback((v: VehicleEmision): number | null => {
    for (const s of [v.fecha_matriculacion, v.anyo_fabricacion]) {
      if (!s) continue;
      const m = s.match(/(\d{4})/);
      if (m) { const y = parseInt(m[1]); if (y >= 1980 && y <= 2040) return y; }
    }
    return null;
  }, []);

  const doSearch = useCallback(async (body: Record<string, string | number>, signal?: AbortSignal): Promise<CandidatoCatalogo[]> => {
    const res  = await fetch('/api/catalogo/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) throw new Error('API error');
    const json = await res.json();
    return json.candidates ?? json.candidatos ?? json.results ?? [];
  }, []);

  const handleSearch = useCallback(async (i: number) => {
    const v = vehicles[i];
    if (!v) return;
    // Cancel any prior search for this slot
    searchAbortRef.current.get(i)?.abort();
    const ctrl = new AbortController();
    searchAbortRef.current.set(i, ctrl);
    setV(i, { searching: true });
    try {
      const body: Record<string, string | number> = {};
      const TIPOS_REM = new Set(['semirremolque', 'remolque']);
      const isRem = TIPOS_REM.has((v.tipo || '').toLowerCase());

      if (isRem) {
        // En el catálogo todos los remolques/semirremolques tienen marca="REMOLQUE"
        // y el fabricante está en modelo: "SEMIRREMOLQUE KRONE", "SEMIRREMOLQUE SCHMITZ", etc.
        body.marca = 'REMOLQUE';
        const prefix = (v.tipo || '').toLowerCase() === 'semirremolque' ? 'SEMIRREMOLQUE' : 'REMOLQUE';
        body.modelo = v.marca ? `${prefix} ${v.marca}` : prefix;
        if (v.tn) { const n = parseFloat(v.tn); if (!isNaN(n) && n > 0) body.tara = n >= 100 ? n : n * 1000; }
      } else {
        if (v.marca)  body.marca  = v.marca;
        if (v.modelo) body.modelo = v.modelo;
        if (v.kw)     body.kw     = v.kw;
        else if (v.cv) body.kw = String(Math.round(parseFloat(v.cv) / 1.36));
        if (v.tn) { const n = parseFloat(v.tn); body.tara = n >= 100 ? n : n * 1000; }
      }

      const realYear = extractYear(v);
      const plateEst = estimateYear(v.matricula);
      if (realYear)      body.anyo = realYear;
      else if (plateEst) body.anyo = plateEst.year;

      let candidatos = await doSearch(body, ctrl.signal);
      if (ctrl.signal.aborted) return;
      if (candidatos.length === 0 && body.anyo) {
        const { anyo: _, ...sinAnyo } = body; candidatos = await doSearch(sinAnyo, ctrl.signal);
      }
      if (ctrl.signal.aborted) return;
      if (candidatos.length === 0 && body.marca && body.modelo) {
        candidatos = await doSearch({ marca: body.marca, modelo: body.modelo }, ctrl.signal);
      }
      if (ctrl.signal.aborted) return;
      // Extra fallbacks para remolques: prefijo alternativo y búsqueda por marca sola
      if (isRem && candidatos.length === 0 && v.marca) {
        const altPrefix = (v.tipo || '').toLowerCase() === 'semirremolque' ? 'REMOLQUE' : 'SEMIRREMOLQUE';
        candidatos = await doSearch({ marca: 'REMOLQUE', modelo: `${altPrefix} ${v.marca.toUpperCase()}` }, ctrl.signal);
        if (ctrl.signal.aborted) return;
      }
      if (isRem && candidatos.length === 0 && v.marca) {
        candidatos = await doSearch({ marca: 'REMOLQUE', modelo: v.marca.toUpperCase() }, ctrl.signal);
        if (ctrl.signal.aborted) return;
      }

      const top = candidatos.slice(0, 8);

      if (top.length === 1) {
        setVehicles(prev => {
          const n = [...prev];
          n[i] = { ...n[i], candidatos: top, searching: false };
          return n;
        });
        setTimeout(() => handleSelect(i, top[0]), 0);
      } else if (isRem && top.length === 0) {
        // Fallback genérico: asigna entrada de peso o tipo genérico del catálogo
        const taraKg = v.tn ? (parseFloat(v.tn) >= 100 ? parseFloat(v.tn) : parseFloat(v.tn) * 1000) : 0;
        const genericId = (v.tipo || '').toLowerCase() === 'semirremolque'
          ? '314954925'   // SEMIRREMOLQUE SEMI · 35000kg
          : taraKg > 7000 ? '131733694'  // + DE 7000 · 15000kg
          : taraKg > 3000 ? '131733669'  // DE 3001 A 7000
          : taraKg > 1000 ? '131733100'  // DE 1001 A 3000
          : '131733087';                  // A 1000
        const gRes = await fetch(`/api/catalogo/${genericId}`, { signal: ctrl.signal });
        if (ctrl.signal.aborted) return;
        const gJson = await gRes.json();
        if (gJson.ok && gJson.vehiculo) {
          setVehicles(prev => { const n = [...prev]; n[i] = { ...n[i], candidatos: [gJson.vehiculo], searching: false }; return n; });
          setTimeout(() => handleSelect(i, gJson.vehiculo), 0);
        } else {
          setV(i, { status: 'sin_catalogo', searching: false });
        }
      } else {
        setV(i, { candidatos: top, status: top.length > 0 ? 'pendiente' : 'sin_catalogo', searching: false });
      }
    } catch {
      if (ctrl.signal.aborted) return;
      setV(i, { status: 'sin_catalogo', searching: false });
    } finally {
      searchAbortRef.current.delete(i);
    }
  }, [vehicles, setV, extractYear, doSearch, handleSelect]);

  // Auto-buscar al montar y cuando se añaden vehículos nuevos, máx 3 concurrentes
  useEffect(() => {
    if (vehicles.length === 0) return;
    const pending = vehicles.map((v, i) => ({ v, i })).filter(({ v }) =>
      v.candidatos.length === 0 && !v.searching && v.marca && !searchedMatsRef.current.has(v.matricula)
    );
    if (pending.length === 0) return;
    pending.forEach(({ v }) => searchedMatsRef.current.add(v.matricula));
    let active = 0, idx = 0;
    const runNext = () => {
      while (active < 3 && idx < pending.length) {
        const { i } = pending[idx++]; active++;
        Promise.resolve(handleSearch(i)).finally(() => { active--; runNext(); });
      }
    };
    runNext();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicles.length]);

  // Notificar selecciones al padre
  useEffect(() => {
    if (!pendingNotifyRef.current) return;
    pendingNotifyRef.current = false;
    const sel: Record<string, string> = {};
    vehicles.forEach(v => { if (v.seleccionado && v.matricula) sel[v.matricula] = v.seleccionado.id_veh; });
    onCatalogoChange?.(sel);
  }, [vehicles, onCatalogoChange]);

  // Búsqueda directa por ID — aborta cualquier búsqueda en curso para este vehículo
  const handleDirectId = useCallback(async (i: number, idVeh: string) => {
    searchAbortRef.current.get(i)?.abort();
    searchAbortRef.current.delete(i);
    setV(i, { searching: true });
    try {
      const res  = await fetch(`/api/catalogo/${encodeURIComponent(idVeh)}`);
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

  const handleBulkAssign = useCallback((c: CandidatoCatalogo) => {
    applyToMultiple([...checkedRows], c);
    setCheckedRows(new Set());
  }, [checkedRows, applyToMultiple]);

  const handleClearSelection = useCallback((i: number) => {
    setVehicles(prev => {
      const n = [...prev];
      n[i] = { ...n[i], seleccionado: null, status: n[i].candidatos.length > 0 ? 'pendiente' : 'sin_catalogo' };
      return n;
    });
    pendingNotifyRef.current = true;
  }, []);

  const listos = vehicles.filter(v => v.status === 'listo').length;
  const pct    = vehicles.length > 0 ? Math.round((listos / vehicles.length) * 100) : 0;

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb', flexShrink: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6b7280' }}>
          Listos: <span style={{ color: '#1240CC' }}>{listos}</span> / {vehicles.length}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ height: 6, width: 120, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#059669' : '#1240CC', borderRadius: 3, transition: 'width 0.3s' }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: pct === 100 ? '#059669' : '#1240CC' }}>{pct}%</span>
        </div>
      </div>

      {/* ── Bulk-assign toolbar ─────────────────────────────────────────────── */}
      {checkedRows.size > 0 && (() => {
        const firstIdx = [...checkedRows].find(i => vehicles[i]?.candidatos.length > 0) ?? -1;
        const candidatos = firstIdx >= 0 ? vehicles[firstIdx].candidatos : [];
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 16px', borderBottom: '1px solid #c8d8f5', background: '#eef3ff', flexShrink: 0, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#1240CC' }}>
              {checkedRows.size} seleccionado{checkedRows.size > 1 ? 's' : ''}
            </span>
            {candidatos.length > 0 ? (
              <>
                <select
                  defaultValue=""
                  onChange={e => {
                    const c = candidatos.find(c => c.id_veh === e.target.value);
                    if (c) handleBulkAssign(c);
                  }}
                  style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: '1px solid #a5b8e8', background: '#fff', outline: 'none', cursor: 'pointer', maxWidth: 380 }}>
                  <option value="" disabled>— Seleccionar versión para todos —</option>
                  {candidatos.map(c => (
                    <option key={c.id_veh} value={c.id_veh}>{c.version}{c.score ? ` · ${c.score}%` : ''}</option>
                  ))}
                </select>
              </>
            ) : (
              <span style={{ fontSize: 11, color: '#6b7280' }}>Sin candidatos disponibles para las filas seleccionadas</span>
            )}
            <button onClick={() => setCheckedRows(new Set())}
              style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 5, background: 'transparent', border: '1px solid #a5b8e8', color: '#6b7280', cursor: 'pointer', marginLeft: 'auto' }}>
              Cancelar
            </button>
          </div>
        );
      })()}

      {/* ── Grid ────────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto custom-scrollbar" style={{ background: '#f3f4f6', padding: 12 }}>
        {vehicles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af', fontSize: 13 }}>
            Añade vehículos en TRABAJO para comenzar la pre-emisión.
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 10, overflow: 'hidden', border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8f9fa', borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ ...thS, width: 42, textAlign: 'center' }}>
                    <input type="checkbox"
                      title="Seleccionar todos"
                      checked={vehicles.length > 0 && checkedRows.size === vehicles.length}
                      onChange={e => setCheckedRows(e.target.checked ? new Set(vehicles.map((_, i) => i)) : new Set())}
                      style={{ cursor: 'pointer', width: 14, height: 14 }}
                    />
                  </th>
                  <th style={{ ...thS, width: 110 }}>Matrícula</th>
                  <th style={{ ...thS, width: 120 }}>Marca</th>
                  <th style={{ ...thS, width: 160 }}>Modelo</th>
                  <th style={{ ...thS }}>Versión / Acabado</th>
                  <th style={{ ...thS, width: 120 }}>ID Catálogo</th>
                  <th style={{ ...thS, width: 110 }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v, i) => (
                  <React.Fragment key={v.matricula || i}>
                    {/* ── Fila principal ─────────────────────────────────── */}
                    <tr style={{
                      borderBottom: openSearchRow === i ? 'none' : '1px solid #f3f4f6',
                      background: v.status === 'listo' ? 'rgba(16,185,129,0.03)' : openSearchRow === i ? '#f5f8ff' : '#fff',
                      transition: 'background 0.12s',
                    }}
                      onMouseEnter={e => { if (v.status !== 'listo' && openSearchRow !== i) e.currentTarget.style.background = '#fafbff'; }}
                      onMouseLeave={e => { if (v.status !== 'listo' && openSearchRow !== i) e.currentTarget.style.background = '#fff'; }}>

                      <td style={{ ...tdS, textAlign: 'center' }}>
                        <input type="checkbox"
                          checked={checkedRows.has(i)}
                          onChange={e => setCheckedRows(prev => { const n = new Set(prev); if (e.target.checked) n.add(i); else n.delete(i); return n; })}
                          style={{ cursor: 'pointer', width: 14, height: 14 }}
                        />
                      </td>
                      <td style={{ ...tdS, fontFamily: 'monospace', fontWeight: 800, color: '#111827', letterSpacing: '0.04em' }}>{v.matricula}</td>
                      <td style={{ ...tdS, color: '#111827', fontWeight: 600 }}>{v.marca}</td>
                      <td style={{ ...tdS, color: '#111827' }}>{v.modelo}</td>

                      {/* ── Versión cell ─────────────────────────────────── */}
                      <td style={tdS}>
                        {v.searching ? (
                          <span style={{ color: '#9ca3af', fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <svg style={{ animation: 'spin 1s linear infinite' }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <circle cx="12" cy="12" r="10" opacity="0.2"/>
                              <path d="M12 2a10 10 0 0110 10"/>
                            </svg>
                            Buscando...
                          </span>
                        ) : v.seleccionado ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontWeight: 700, color: '#065f46', fontSize: 12, flex: 1 }}>{v.seleccionado.version}</span>
                            <button type="button" onClick={() => handleClearSelection(i)}
                              title="Cambiar versión"
                              style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', cursor: 'pointer', fontWeight: 700, flexShrink: 0 }}>
                              ✕
                            </button>
                          </div>
                        ) : v.candidatos.length > 0 ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <select
                              defaultValue=""
                              onChange={e => {
                                const c = v.candidatos.find(c => c.id_veh === e.target.value);
                                if (c) handleSelect(i, c);
                              }}
                              style={{ flex: 1, maxWidth: 380, fontSize: 11, padding: '5px 8px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', outline: 'none', cursor: 'pointer' }}>
                              <option value="" disabled>— Seleccionar acabado —</option>
                              {v.candidatos.map(c => (
                                <option key={c.id_veh} value={c.id_veh}>
                                  {c.version}{c.score ? ` · ${c.score}%` : ''}
                                </option>
                              ))}
                            </select>
                            <button type="button"
                              onClick={() => setOpenSearchRow(openSearchRow === i ? null : i)}
                              title="Buscar manualmente en el catálogo"
                              style={{ fontSize: 10, padding: '4px 8px', borderRadius: 6, background: openSearchRow === i ? 'rgba(18,64,204,0.15)' : 'rgba(18,64,204,0.06)', border: '1px solid rgba(18,64,204,0.25)', color: '#1240CC', cursor: 'pointer', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
                              Buscar
                            </button>
                          </div>
                        ) : (
                          <button type="button"
                            onClick={() => setOpenSearchRow(openSearchRow === i ? null : i)}
                            style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 6,
                              background: v.status === 'sin_catalogo' ? 'rgba(220,38,38,0.06)' : 'rgba(18,64,204,0.07)',
                              border: `1px solid ${v.status === 'sin_catalogo' ? 'rgba(220,38,38,0.25)' : 'rgba(18,64,204,0.2)'}`,
                              color: v.status === 'sin_catalogo' ? '#dc2626' : '#1240CC', cursor: 'pointer' }}>
                            {v.status === 'sin_catalogo' ? 'Sin coincidencias · Buscar' : 'Buscar en catálogo'}
                          </button>
                        )}
                      </td>

                      <td style={{ ...tdS, fontFamily: 'monospace', fontSize: 11, color: '#6b7280' }}>
                        {v.seleccionado ? (
                          <span style={{ color: '#111827', fontWeight: 700 }}>{v.seleccionado.id_veh}</span>
                        ) : (
                          <DirectIdCell onSubmit={id => handleDirectId(i, id)} />
                        )}
                      </td>

                      <td style={tdS}><StatusChip status={v.status} /></td>
                    </tr>

                    {/* ── Panel búsqueda manual (fila expandible) ─────────── */}
                    {openSearchRow === i && (
                      <tr style={{ borderBottom: '1px solid #c8d8f5' }}>
                        <td colSpan={7} style={{ padding: 0 }}>
                          <ManualSearchPanel
                            vehicle={v}
                            onSelect={c => handleSelect(i, c)}
                            onClose={() => setOpenSearchRow(null)}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal similares ──────────────────────────────────────────────────── */}
      {modalData && (
        <SimilarModal
          source={vehicles[modalData.sourceIdx]}
          similar={modalData.similar}
          selected={modalData.selected}
          onClose={() => setModalData(null)}
          onApply={indices => { applyToMultiple(indices, modalData.selected); setModalData(null); }}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── DirectIdCell ─────────────────────────────────────────────────────────────

function DirectIdCell({ onSubmit }: { onSubmit: (id: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal]         = useState('');

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)}
        title="Asignar por ID de catálogo"
        style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: 'rgba(18,64,204,0.05)', border: '1px solid rgba(18,64,204,0.15)', color: '#1240CC', cursor: 'pointer' }}>
        + ID
      </button>
    );
  }
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <input autoFocus value={val} onChange={e => setVal(e.target.value)}
        placeholder="241210258"
        onKeyDown={e => { if (e.key === 'Enter' && val.trim()) { onSubmit(val.trim()); setEditing(false); setVal(''); } if (e.key === 'Escape') { setEditing(false); setVal(''); } }}
        style={{ width: 90, fontSize: 11, padding: '3px 6px', borderRadius: 5, border: '1px solid #1240CC', outline: 'none', fontFamily: 'monospace' }} />
      <button type="button" onClick={() => { if (val.trim()) { onSubmit(val.trim()); setEditing(false); setVal(''); } }}
        style={{ fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 5, background: '#1240CC', color: '#fff', border: 'none', cursor: 'pointer' }}>
        ✓
      </button>
    </div>
  );
}

// ─── Estilos tabla ────────────────────────────────────────────────────────────

const thS: React.CSSProperties = {
  padding: '9px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700,
  color: '#374151', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap',
};

const tdS: React.CSSProperties = {
  padding: '10px 12px', fontSize: 12, color: '#111827', verticalAlign: 'middle',
};
