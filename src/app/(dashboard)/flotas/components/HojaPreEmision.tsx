"use client";

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { resolvePlate } from '@/core/_source_of_truth/plates/engine';

function estimateYear(plate: string): { year: number } | null {
  const r = resolvePlate(plate.trim().toUpperCase());
  return r ? { year: r.year } : null;
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
  combustible: string;
  anyo_matricula: string;
  anyo_fabricacion: string;
  fecha_matriculacion: string;
  status: EmisionStatus;
  candidatos: CandidatoCatalogo[];
  seleccionado: CandidatoCatalogo | null;
  searching: boolean;
}

export interface VehiculoExport {
  matricula: string;
  marca: string;
  modelo: string;
  tipo: string;
  id_catalogo: string;
  version: string;
  anyo: number;
  combustible: string;
  kw: number;
  cv: number;
  tara: number;
  plazas: number;
  status: string;
}

interface Props {
  trabajoRows: Record<string, string>[];
  initialSeleccion?: Record<string, string>;
  onCatalogoChange?: (selecciones: Record<string, string>) => void;
  onVehiclesUpdate?: (exports: VehiculoExport[]) => void;
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

function ManualSearchPanel({ vehicle, yearHint, onSelect, onClose }: {
  vehicle: VehicleEmision;
  yearHint?: number;
  onSelect: (c: CandidatoCatalogo) => void;
  onClose: () => void;
}) {
  const isRem = ['semirremolque', 'remolque'].includes((vehicle.tipo || '').toLowerCase())
    || /^R[\s-]?\d{4}/i.test(vehicle.matricula);
  // Si marca tiene formato combinado "Scania R450" (modelo vacío O igual al sufijo de marca), pre-separar
  const hasCombinedMarca = !isRem && !!vehicle.marca && vehicle.marca.includes(' ') && (() => {
    const suffix = vehicle.marca.slice(vehicle.marca.indexOf(' ')).trim();
    const mod = (vehicle.modelo || '').trim();
    return !mod || mod.toUpperCase() === suffix.toUpperCase();
  })();
  const initMarca  = isRem ? 'REMOLQUE'
    : hasCombinedMarca ? vehicle.marca.slice(0, vehicle.marca.indexOf(' '))
    : vehicle.marca;
  const initModelo = isRem
    ? ((vehicle.tipo || '').toLowerCase() === 'semirremolque' ? 'SEMIRREMOLQUE' : 'REMOLQUE') + (vehicle.marca ? ` ${vehicle.marca}` : '')
    : hasCombinedMarca ? vehicle.marca.slice(vehicle.marca.indexOf(' ')).trim()
    : vehicle.modelo;

  const [marca, setMarca]           = useState(initMarca);
  const [modelo, setModelo]         = useState(initModelo);
  const [version, setVersion]       = useState('');
  const [combustible, setCombustible] = useState('');
  const [kw, setKw]                 = useState(isRem ? '' : (vehicle.kw || ''));
  const [anyo, setAnyo]             = useState(yearHint ? String(yearHint) : '');
  const [results, setResults]       = useState<CandidatoCatalogo[]>([]);
  const [loading, setLoading]       = useState(false);
  const [searched, setSearched]     = useState(false);
  const [searchError, setSearchError] = useState('');
  const firstRef = useRef(true);

  const doSearch = useCallback(async () => {
    setLoading(true);
    setSearched(true);
    setSearchError('');
    try {
      const body: Record<string, string | number> = {};
      if (marca)      body.marca      = marca;
      if (modelo)     body.modelo     = modelo;
      if (version)    body.version    = version;
      if (combustible) body.combustible = combustible;
      if (kw)         body.kw         = kw;
      if (anyo)       body.anyo       = parseInt(anyo);
      if (marca && marca.includes(' ') && !modelo) body.rawText = marca;

      const apiFetch = async (b: Record<string, string | number>): Promise<CandidatoCatalogo[]> => {
        const r = await fetch('/api/catalogo/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(b),
        });
        if (!r.ok) throw new Error(`Catálogo no disponible (${r.status})`);
        const j = await r.json();
        return j.candidates ?? j.candidatos ?? j.results ?? [];
      };

      let found = await apiFetch(body);
      // Fallback sin año si no encontró nada con año
      if (found.length === 0 && body.anyo) {
        const { anyo: _, ...sinAnyo } = body;
        found = await apiFetch(sinAnyo);
      }
      setResults(found.slice(0, 40));
    } catch (e: unknown) {
      setResults([]);
      setSearchError(e instanceof Error ? e.message : 'Error de búsqueda');
    } finally {
      setLoading(false);
    }
  }, [marca, modelo, version, combustible, kw, anyo]);

  useEffect(() => {
    if (firstRef.current) { firstRef.current = false; doSearch(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') doSearch(); };

  return (
    <div style={{ padding: '10px 14px 14px', background: 'var(--t-line-soft)', borderTop: '1px solid var(--t-line)' }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 8 }}>
        <Fld label="Marca">
          <input value={marca} onChange={e => setMarca(e.target.value)} onKeyDown={onKey}
            style={{ ...inS, width: 110 }} />
        </Fld>
        <Fld label="Modelo">
          <input value={modelo} onChange={e => setModelo(e.target.value)} onKeyDown={onKey}
            style={{ ...inS, width: 160 }} />
        </Fld>
        <Fld label="Versión">
          <input value={version} onChange={e => setVersion(e.target.value)} placeholder="ej. 450" onKeyDown={onKey}
            style={{ ...inS, width: 90 }} />
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
          style={{ padding: '5px 14px', borderRadius: 6, background: 'var(--t-blue)', color: '#fff', border: 'none', fontSize: 11, fontWeight: 700, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1, alignSelf: 'flex-end', height: 28 }}>
          {loading ? '...' : 'Buscar'}
        </button>
        <button onClick={onClose}
          style={{ padding: '5px 10px', borderRadius: 6, background: 'transparent', color: 'var(--t-text-3)', border: '1px solid var(--t-line)', fontSize: 11, cursor: 'pointer', alignSelf: 'flex-end', height: 28 }}>
          ✕
        </button>
      </div>

      {searchError && (
        <div style={{ padding: '8px 12px', color: 'var(--t-red)', fontSize: 11, fontWeight: 600 }}>
          {searchError}
        </div>
      )}
      {searched && (
        <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--t-line)', borderRadius: 8, background: 'var(--t-surface)' }}>
          {results.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--t-text-3)', fontSize: 12 }}>
              Sin resultados. Ajusta los filtros.
            </div>
          ) : results.map(c => (
            <button key={c.id_veh} type="button" onClick={() => onSelect(c)}
              style={{ display: 'flex', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--t-line)', cursor: 'pointer', alignItems: 'center', gap: 10 }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--t-line-soft)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--t-text)' }}>{c.version}</span>
              <span style={{ fontSize: 10, color: 'var(--t-text-2)', whiteSpace: 'nowrap' }}>
                {c.kw > 0 ? `${c.kw}kW · ` : ''}{FUEL_LABEL[c.combustible] ?? c.combustible}
                {c.anyo ? ` · ${c.anyo}` : ''}
                {c.cilindrada > 0 ? ` · ${c.cilindrada}cc` : ''}
                {c.tara > 0 ? ` · ${c.tara}kg` : ''}
              </span>
              <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--t-text-3)', whiteSpace: 'nowrap' }}>{c.id_veh}</span>
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
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--t-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
      {children}
    </div>
  );
}

const inS: React.CSSProperties = {
  fontSize: 11, padding: '5px 8px', borderRadius: 6,
  border: '1px solid var(--t-line)', outline: 'none', background: 'var(--t-bg)', color: 'var(--t-text)',
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
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
      <div style={{ position: 'relative', background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 12, padding: 24, maxWidth: 520, width: '90%', maxHeight: '80vh', overflow: 'auto', boxShadow: '0 25px 80px rgba(0,0,0,0.4)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--t-text)', marginBottom: 4 }}>
          Vehículos similares sin versión
        </div>
        <div style={{ fontSize: 11, color: 'var(--t-text-3)', marginBottom: 16 }}>
          ¿Aplicar <strong>{selected.version}</strong> también a estos vehículos?
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
          {similar.map(s => (
            <label key={s.idx}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                background: checked.has(s.idx) ? 'rgba(245,158,11,0.08)' : 'var(--t-line-soft)',
                border: `1px solid ${checked.has(s.idx) ? 'rgba(245,158,11,0.4)' : 'var(--t-line)'}`,
                transition: 'all 0.12s',
              }}>
              <input type="checkbox" checked={checked.has(s.idx)} onChange={() => toggle(s.idx)}
                style={{ marginTop: 2, accentColor: 'var(--t-amber)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: 'var(--t-text)' }}>{s.vehicle.matricula}</span>
                  <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 4, background: 'rgba(245,158,11,0.15)', color: 'var(--t-amber)', textTransform: 'uppercase' }}>Similar</span>
                </div>
                {s.diffs.length > 0 && (
                  <div style={{ fontSize: 10, color: 'var(--t-text-3)', marginTop: 2 }}>
                    {s.diffs.join(' · ')}
                  </div>
                )}
              </div>
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose}
            style={{ fontSize: 11, fontWeight: 700, padding: '8px 16px', borderRadius: 8, background: 'transparent', border: '1px solid var(--t-line)', color: 'var(--t-text-2)', cursor: 'pointer' }}>
            Solo estos ya aplicados
          </button>
          <button type="button" onClick={() => onApply(Array.from(checked))}
            disabled={checked.size === 0}
            style={{ fontSize: 11, fontWeight: 700, padding: '8px 16px', borderRadius: 8, cursor: checked.size > 0 ? 'pointer' : 'not-allowed', background: checked.size > 0 ? 'linear-gradient(135deg,#1240CC,#3366FF)' : 'var(--t-line)', color: '#fff', border: 'none' }}>
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
    pendiente:    { border: 'rgba(233,165,75,0.3)',  color: 'var(--t-amber)', label: 'Pendiente' },
    listo:        { border: 'rgba(81,184,138,0.25)', color: 'var(--t-green)', label: 'Listo' },
    sin_catalogo: { border: 'rgba(237,133,133,0.3)', color: 'var(--t-red)',   label: 'Sin catálogo' },
  }[status];
  return (
    <span style={{ fontSize: 10, fontWeight: 800, padding: '4px 8px', borderRadius: 4, background: 'transparent', border: `1px solid ${cfg.border}`, color: cfg.color, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
      {cfg.label}
    </span>
  );
}

// ─── HojaPreEmision ───────────────────────────────────────────────────────────

export default function HojaPreEmision({ trabajoRows, initialSeleccion, onCatalogoChange, onVehiclesUpdate }: Props) {
  const initial = useMemo<VehicleEmision[]>(() =>
    trabajoRows.filter(r => r['matricula']?.trim()).map(r => ({
      matricula:           r['matricula'] ?? '',
      marca:               r['marca'] ?? '',
      modelo:              r['modelo'] ?? '',
      tipo:                r['tipo_vehiculo'] ?? '',
      kw:                  r['kw'] ?? '',
      cv:                  r['cv'] ?? '',
      tn:                  r['tn'] ?? '',
      combustible:         r['combustible'] ?? '',
      anyo_matricula:      r['anyo_matricula'] ?? '',
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
  const [sortConfig, setSortConfig]     = useState<{ col: string; dir: 'asc'|'desc' } | null>(null);
  const [lastCheckedDisplayIdx, setLastCheckedDisplayIdx] = useState<number | null>(null);
  // Matrículas con ID ya conocido no se auto-buscan; se pre-cargan desde el catálogo
  const searchedMatsRef                 = useRef<Set<string>>(new Set(initialSeleccion ? Object.keys(initialSeleccion) : []));
  const preloadedRef                    = useRef<Set<string>>(new Set());
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

  // Pre-cargar IDs del catálogo guardadas en sesiones anteriores
  useEffect(() => {
    if (!initialSeleccion) return;
    const toLoad = Object.entries(initialSeleccion).filter(([mat]) => !preloadedRef.current.has(mat));
    if (toLoad.length === 0) return;
    toLoad.forEach(([mat, idVeh]) => {
      preloadedRef.current.add(mat);
      fetch(`/api/catalogo/${encodeURIComponent(idVeh)}`)
        .then(r => r.json())
        .then(json => {
          if (!json.ok || !json.vehiculo) return;
          setVehicles(prev => {
            const idx = prev.findIndex(v => v.matricula === mat);
            if (idx < 0 || prev[idx].seleccionado) return prev;
            const n = [...prev];
            n[idx] = { ...n[idx], seleccionado: json.vehiculo, status: 'listo', candidatos: [json.vehiculo] };
            return n;
          });
          pendingNotifyRef.current = true;
        })
        .catch(() => {});
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSeleccion]);

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
    // anyo_fabricacion primero (Silverdat), luego anyo_matricula (TRABAJO), luego fecha_matriculacion
    for (const s of [v.anyo_fabricacion, v.anyo_matricula, v.fecha_matriculacion]) {
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
    const vOrig = vehicles[i];
    if (!vOrig) return;
    let v = { ...vOrig };
    // Cancel any prior search for this slot
    searchAbortRef.current.get(i)?.abort();
    const ctrl = new AbortController();
    searchAbortRef.current.set(i, ctrl);
    // Timeout de seguridad: si no responde en 20s, abortar y marcar sin_catalogo
    const timeoutId = setTimeout(() => ctrl.abort(), 20000);
    setV(i, { searching: true });
    try {
      const body: Record<string, string | number> = {};
      const TIPOS_REM = new Set(['semirremolque', 'remolque']);
      const isRem = TIPOS_REM.has((v.tipo || '').toLowerCase())
        || /^R[\s-]?\d{4}/i.test(v.matricula);

      // Silverdat a veces devuelve el modelo con la marca incluida: "SCANIA R 450" → limpiar
      let modeloClean = (v.modelo || '').trim();
      if (v.marca && modeloClean.toUpperCase().startsWith(v.marca.toUpperCase())) {
        modeloClean = modeloClean.slice(v.marca.length).trim();
      }

      // Si marca tiene formato combinado "Scania R450" (SINCO a veces mete marca+modelo juntos),
      // separar la marca real. Aplica cuando modelo está vacío O contiene exactamente el sufijo
      // de la marca (dato duplicado: marca="Scania R450" Y modelo="R450" a la vez).
      let marcaClean = v.marca || '';
      if (v.marca && v.marca.includes(' ')) {
        const spaceIdx = v.marca.indexOf(' ');
        const marcaSuffix = v.marca.slice(spaceIdx).trim();
        if (!modeloClean || modeloClean.toUpperCase() === marcaSuffix.toUpperCase()) {
          marcaClean = v.marca.slice(0, spaceIdx).trim();
          if (!modeloClean) modeloClean = marcaSuffix;
        }
      }
      // MERCEDES BENZ ACTROS → marcaClean='MERCEDES', modeloClean='BENZ ACTROS ...'
      // Eliminar 'BENZ' residual del modelo cuando la marca ya es MERCEDES
      if (marcaClean.toUpperCase() === 'MERCEDES' && modeloClean) {
        modeloClean = modeloClean.replace(/^BENZ\s*/i, '').trim();
      }
      // Actualizar estado con valores limpios para que el grid muestre Marca/Modelo correctos
      if (marcaClean !== v.marca || modeloClean !== v.modelo) {
        setV(i, { marca: marcaClean, modelo: modeloClean });
        v = { ...v, marca: marcaClean, modelo: modeloClean };
      }

      // Detectar patrón camión: "R450", "R 450", "SERIE R 450", "XF 460", "TGX 460"
      // Catálogo los tiene como modelo="SERIE R" + version="450 DE 3950"
      let serieBody: Record<string, string | number> | null = null;
      if (!isRem && modeloClean) {
        // Patrón 1: "SERIE X 450" o "SERIE XF 450"
        const mSerie2 = modeloClean.match(/^(SERIE\s+[A-Za-z0-9]{1,5})\s+(\d{3,4})\b/i);
        // Patrón 2: letra(s) cortas + número: "R450", "R 450", "XF 460", "TGX 460"
        const mDirect = modeloClean.match(/^([A-Za-z]{1,5})\s*(\d{3,4})\b/);
        // Patrón 3: número de potencia en cualquier parte: "450 LA", "ACTROS 450"
        const mAny    = modeloClean.match(/\b(\d{3,4})\b/);
        const mUse = mSerie2 ?? mDirect;
        if (mUse) {
          const serieLabel = mUse[1].trim().toUpperCase();
          const cvNum      = parseInt(mUse[2]);
          const kwFromCv   = Math.round(cvNum / 1.36);
          if (kwFromCv > 80 && kwFromCv < 900) {
            // Serie de 1-3 letras → añadir prefijo "SERIE" (Scania: R, S, P; DAF: XF)
            const isShortCode = /^[A-Z]{1,3}$/.test(serieLabel);
            serieBody = {
              marca:  marcaClean,
              modelo: isShortCode ? `SERIE ${serieLabel}` : serieLabel,
              kw:     kwFromCv,
            };
          }
        } else if (mAny) {
          const cvNum    = parseInt(mAny[1]);
          const kwFromCv = Math.round(cvNum / 1.36);
          if (kwFromCv > 80 && kwFromCv < 900) {
            serieBody = { marca: marcaClean, kw: kwFromCv };
          }
        }
      }

      if (isRem) {
        body.marca = 'REMOLQUE';
        const prefix = (v.tipo || '').toLowerCase() === 'semirremolque' ? 'SEMIRREMOLQUE' : 'REMOLQUE';
        // Quitar "SEMIRREMOLQUE"/"REMOLQUE" redundante de v.marca (ej: "SCHMITZ SEMIRREMOLQUE")
        const marcaRem = (v.marca || '').replace(/\b(SEMI-?REMOLQUE|REMOLQUE)\b/gi, '').trim();
        body.modelo = marcaRem ? `${prefix} ${marcaRem}` : prefix;
        if (v.tn) { const n = parseFloat(v.tn); if (!isNaN(n) && n > 0) body.tara = n >= 100 ? n : n * 1000; }
      } else {
        if (marcaClean)     body.marca       = marcaClean;
        if (modeloClean)    body.modelo      = modeloClean;
        if (v.kw)           body.kw          = v.kw;
        else if (v.cv)      body.kw          = String(Math.round(parseFloat(v.cv) / 1.36));
        if (v.combustible)  body.combustible = v.combustible;
        if (v.tn) { const n = parseFloat(v.tn); body.tara = n >= 100 ? n : n * 1000; }
        // Sin Silverdat (sin kw ni combustible): pasar texto crudo para detección de marca en servidor
        if (!v.kw && !v.combustible && v.marca) {
          body.rawText = [v.marca, v.modelo].filter(Boolean).join(' ');
        }
      }

      const realYear = extractYear(v);
      const plateEst = estimateYear(v.matricula);
      // Prioridad: Silverdat/plantilla > algoritmo matrícula. Si hay año de cualquier fuente, usarlo.
      const yearKnown = !!(realYear || plateEst);
      if (realYear) body.anyo = realYear;
      else if (plateEst) body.anyo = plateEst.year;

      // Para camiones con patrón serie+potencia, intentar primero sin año (el catálogo
      // tiene modelos de la generación actual aunque la matrícula sea antigua)
      let candidatos: CandidatoCatalogo[] = [];
      if (serieBody) {
        candidatos = await doSearch(serieBody, ctrl.signal);
        if (ctrl.signal.aborted) return;
        // Si no encontró "SERIE R", probar solo marca+kw
        if (candidatos.length === 0 && serieBody.kw) {
          candidatos = await doSearch({ marca: serieBody.marca, kw: serieBody.kw }, ctrl.signal);
          if (ctrl.signal.aborted) return;
        }
      }

      // Búsqueda normal con datos de Silverdat (sin año primero para camiones viejos)
      if (candidatos.length === 0) candidatos = await doSearch(body, ctrl.signal);
      if (ctrl.signal.aborted) return;
      // Fallback año-1
      if (candidatos.length === 0 && body.anyo) {
        candidatos = await doSearch({ ...body, anyo: (body.anyo as number) - 1 }, ctrl.signal);
      }
      if (ctrl.signal.aborted) return;
      // Fallback año+1
      if (candidatos.length === 0 && body.anyo) {
        candidatos = await doSearch({ ...body, anyo: (body.anyo as number) + 1 }, ctrl.signal);
      }
      if (ctrl.signal.aborted) return;
      // Fallback sin año — solo si el año es completamente desconocido (sin Silverdat, sin plantilla, sin algoritmo)
      if (candidatos.length === 0 && body.anyo && !yearKnown) {
        const { anyo: _, ...sinAnyo } = body; candidatos = await doSearch(sinAnyo, ctrl.signal);
      }
      if (ctrl.signal.aborted) return;
      if (candidatos.length === 0 && body.marca && body.modelo) {
        candidatos = await doSearch({ marca: body.marca, modelo: body.modelo }, ctrl.signal);
      }
      if (ctrl.signal.aborted) return;
      // Extra fallbacks para remolques: prefijo alternativo y búsqueda por marca sola (manteniendo año si se conoce)
      if (isRem && candidatos.length === 0 && v.marca) {
        const altPrefix = (v.tipo || '').toLowerCase() === 'semirremolque' ? 'REMOLQUE' : 'SEMIRREMOLQUE';
        const altBody1: Record<string, string | number> = { marca: 'REMOLQUE', modelo: `${altPrefix} ${v.marca.toUpperCase()}` };
        if (body.anyo) altBody1.anyo = body.anyo;
        candidatos = await doSearch(altBody1, ctrl.signal);
        if (ctrl.signal.aborted) return;
      }
      if (isRem && candidatos.length === 0 && v.marca) {
        const altBody2: Record<string, string | number> = { marca: 'REMOLQUE', modelo: v.marca.toUpperCase() };
        if (body.anyo) altBody2.anyo = body.anyo;
        candidatos = await doSearch(altBody2, ctrl.signal);
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
      if (ctrl.signal.aborted) {
        setV(i, { status: 'sin_catalogo', searching: false });
        return;
      }
      setV(i, { status: 'sin_catalogo', searching: false });
    } finally {
      clearTimeout(timeoutId);
      searchAbortRef.current.delete(i);
    }
  }, [vehicles, setV, extractYear, doSearch, handleSelect]);

  // Auto-buscar al montar y cuando se añaden vehículos nuevos, máx 8 concurrentes
  useEffect(() => {
    if (vehicles.length === 0) return;
    const pending = vehicles.map((v, i) => ({ v, i })).filter(({ v }) =>
      v.candidatos.length === 0 && !v.searching && !v.seleccionado && !searchedMatsRef.current.has(v.matricula)
    );
    if (pending.length === 0) return;
    pending.forEach(({ v }) => searchedMatsRef.current.add(v.matricula));
    let active = 0, idx = 0;
    const runNext = () => {
      while (active < 8 && idx < pending.length) {
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
    onVehiclesUpdate?.(vehicles.map(v => ({
      matricula:   v.matricula,
      marca:       v.marca,
      modelo:      v.modelo,
      tipo:        v.tipo,
      id_catalogo: v.seleccionado?.id_veh ?? '',
      version:     v.seleccionado?.version ?? '',
      anyo:        extractYear(v) ?? v.seleccionado?.anyo ?? 0,
      combustible: v.seleccionado?.combustible ?? '',
      kw:          v.seleccionado?.kw ?? 0,
      cv:          v.seleccionado?.cv ?? 0,
      tara:        v.seleccionado?.tara ?? 0,
      plazas:      v.seleccionado?.plazas ?? 0,
      status:      v.status,
    })));
  }, [vehicles, onCatalogoChange, onVehiclesUpdate]);

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

  const handleBulkDirectId = useCallback(async (idVeh: string) => {
    try {
      const res  = await fetch(`/api/catalogo/${encodeURIComponent(idVeh)}`);
      const json = await res.json();
      if (json.ok && json.vehiculo) {
        applyToMultiple([...checkedRows], json.vehiculo as CandidatoCatalogo);
        setCheckedRows(new Set());
      } else {
        alert(`ID "${idVeh}" no encontrado en el catálogo`);
      }
    } catch {
      alert('Error al buscar el ID');
    }
  }, [checkedRows, applyToMultiple]);

  const handleDownloadEmision = useCallback(async () => {
    const listos = vehicles.filter(v => v.status === 'listo' && v.seleccionado);
    if (listos.length === 0) { alert('No hay vehículos con catálogo asignado todavía.'); return; }
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'MMT Seguros';
    const ws = wb.addWorksheet('PRE-EMISION');
    const COLS = ['MATRICULA', 'MARCA', 'MODELO', 'TIPO', 'VERSION', 'AÑO', 'COMBUSTIBLE', 'KW', 'CV', 'TARA', 'PLAZAS', 'ID'];
    const COL_WIDTHS: Record<string, number> = { MATRICULA: 14, MARCA: 14, MODELO: 14, TIPO: 16, VERSION: 36, AÑO: 8, COMBUSTIBLE: 12, KW: 8, CV: 8, TARA: 10, PLAZAS: 8, ID: 16 };
    ws.columns = COLS.map(h => ({ header: h, key: h, width: COL_WIDTHS[h] ?? 12 }));
    const hr = ws.getRow(1);
    hr.height = 22;
    hr.eachCell(cell => {
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002F82' } };
      cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 10 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border    = { bottom: { style: 'medium', color: { argb: 'FF002F82' } }, right: { style: 'thin', color: { argb: 'FFFFFFFF' } } };
    });
    listos.forEach((v, ri) => {
      const r = ws.addRow([
        v.matricula,
        v.seleccionado!.marca,
        v.seleccionado!.modelo ?? v.modelo,
        v.tipo,
        v.seleccionado!.version,
        (extractYear(v) ?? v.seleccionado!.anyo) || '',
        FUEL_LABEL[v.seleccionado!.combustible] ?? v.seleccionado!.combustible,
        v.seleccionado!.kw || '',
        v.seleccionado!.cv || '',
        v.seleccionado!.tara || '',
        v.seleccionado!.plazas || '',
        v.seleccionado!.id_veh,
      ]);
      r.height = 16;
      r.eachCell(cell => {
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: ri % 2 === 0 ? 'FFFFFFFF' : 'FFF0F4FA' } };
        cell.font      = { name: 'Calibri', size: 9, color: { argb: 'FF0A1628' } };
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
        cell.border    = { bottom: { style: 'thin', color: { argb: 'FFB8C8E8' } }, right: { style: 'thin', color: { argb: 'FFB8C8E8' } } };
      });
    });
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'PRE-EMISION.xlsx'; a.click();
    URL.revokeObjectURL(url);
  }, [vehicles, extractYear]);

  const handleClearSelection = useCallback((i: number) => {
    setVehicles(prev => {
      const n = [...prev];
      n[i] = { ...n[i], seleccionado: null, status: n[i].candidatos.length > 0 ? 'pendiente' : 'sin_catalogo' };
      return n;
    });
    pendingNotifyRef.current = true;
  }, []);

  const displayVehicles = useMemo(() => {
    if (!sortConfig) return vehicles;
    return [...vehicles].sort((a, b) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const av = String((a as any)[sortConfig.col] ?? '').toLowerCase();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bv = String((b as any)[sortConfig.col] ?? '').toLowerCase();
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortConfig.dir === 'asc' ? cmp : -cmp;
    });
  }, [vehicles, sortConfig]);

  const handleSortCol = (col: string) => {
    setSortConfig(prev => {
      if (!prev || prev.col !== col) return { col, dir: 'asc' };
      if (prev.dir === 'asc') return { col, dir: 'desc' };
      return null;
    });
    setCheckedRows(new Set());
    setLastCheckedDisplayIdx(null);
  };

  const listos = vehicles.filter(v => v.status === 'listo').length;
  const pct    = vehicles.length > 0 ? Math.round((listos / vehicles.length) * 100) : 0;

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderBottom: '1px solid var(--t-line)', background: 'transparent', flexShrink: 0, gap: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--t-text-3)' }}>
          Listos: <span style={{ color: 'var(--t-blue)' }}>{listos}</span> / {vehicles.length}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'flex-end' }}>
          {listos > 0 && (
            <button onClick={handleDownloadEmision}
              style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 7, background: 'rgba(81,184,138,0.08)', border: '1px solid rgba(81,184,138,0.25)', color: 'var(--t-green)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Descargar Excel
            </button>
          )}
          {vehicles.some(v => v.searching) && (
            <button
              onClick={() => {
                searchAbortRef.current.forEach(ctrl => ctrl.abort());
                searchAbortRef.current.clear();
                setVehicles(prev => prev.map(v => v.searching ? { ...v, searching: false, status: v.candidatos.length > 0 ? 'pendiente' : 'sin_catalogo' } : v));
              }}
              style={{ fontSize: 10, fontWeight: 700, padding: '4px 12px', borderRadius: 7, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#dc2626', cursor: 'pointer' }}>
              Detener todo
            </button>
          )}
          <div style={{ height: 3, width: 120, background: 'var(--t-line)', borderRadius: 5, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? 'var(--t-green)' : 'var(--t-blue)', borderRadius: 5, transition: 'width 0.3s' }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: pct === 100 ? 'var(--t-green)' : 'var(--t-blue)' }}>{pct}%</span>
        </div>
      </div>

      {/* ── Bulk-assign toolbar ─────────────────────────────────────────────── */}
      {checkedRows.size > 0 && (() => {
        const firstIdx = [...checkedRows].find(i => vehicles[i]?.candidatos.length > 0) ?? -1;
        const candidatos = firstIdx >= 0 ? vehicles[firstIdx].candidatos : [];
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 16px', borderBottom: '1px solid var(--t-line)', background: 'var(--t-line-soft)', flexShrink: 0, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--t-blue)' }}>
              {checkedRows.size} seleccionado{checkedRows.size > 1 ? 's' : ''}
            </span>
            {candidatos.length > 0 && (
              <select
                defaultValue=""
                onChange={e => {
                  const c = candidatos.find(c => c.id_veh === e.target.value);
                  if (c) handleBulkAssign(c);
                }}
                style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--t-line)', background: 'var(--t-bg)', color: 'var(--t-text)', outline: 'none', cursor: 'pointer', maxWidth: 320 }}>
                <option value="" disabled>— Versión de candidatos —</option>
                {candidatos.map(c => (
                  <option key={c.id_veh} value={c.id_veh}>{c.version}{c.score ? ` · ${c.score}%` : ''}</option>
                ))}
              </select>
            )}
            <BulkIdInput onSubmit={handleBulkDirectId} />
            <button onClick={() => setCheckedRows(new Set())}
              style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 5, background: 'transparent', border: '1px solid var(--t-line)', color: 'var(--t-text-3)', cursor: 'pointer', marginLeft: 'auto' }}>
              Cancelar
            </button>
          </div>
        );
      })()}

      {/* ── Grid ────────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto custom-scrollbar" style={{ background: 'var(--t-bg)', padding: 12 }}>
        {vehicles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--t-text-3)', fontSize: 13 }}>
            Añade vehículos en TRABAJO para comenzar la pre-emisión.
          </div>
        ) : (
          <div style={{ background: 'var(--t-surface)', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--t-line)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--t-surface)', borderBottom: '2px solid var(--t-line)' }}>
                  <th style={{ ...thS, width: 42, textAlign: 'center' }}>
                    <input type="checkbox"
                      title="Seleccionar todos"
                      checked={vehicles.length > 0 && checkedRows.size === vehicles.length}
                      onChange={e => { setCheckedRows(e.target.checked ? new Set(vehicles.map((_, i) => i)) : new Set()); setLastCheckedDisplayIdx(null); }}
                      style={{ cursor: 'pointer', width: 14, height: 14 }}
                    />
                  </th>
                  {(['matricula','marca','modelo'] as const).map((col, ci) => {
                    const labels = ['Matrícula','Marca','Modelo'];
                    const widths = [110, 120, 160];
                    const isActive = sortConfig?.col === col;
                    return (
                      <th key={col} style={{ ...thS, width: widths[ci], cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSortCol(col)}>
                        {labels[ci]}
                      </th>
                    );
                  })}
                  <th style={{ ...thS, width: 52, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSortCol('anyo_fabricacion')}>
                    Año
                  </th>
                  <th style={{ ...thS }}>Versión / Acabado</th>
                  <th style={{ ...thS, width: 120 }}>ID Catálogo</th>
                  <th style={{ ...thS, width: 110, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSortCol('status')}>
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayVehicles.map((v, displayIdx) => {
                  const origIdx = vehicles.indexOf(v);
                  return (
                  <React.Fragment key={v.matricula || displayIdx}>
                    {/* ── Fila principal ─────────────────────────────────── */}
                    <tr style={{
                      borderBottom: openSearchRow === origIdx ? 'none' : '1px solid var(--t-line)',
                      background: v.status === 'listo' ? 'rgba(16,185,129,0.04)' : openSearchRow === origIdx ? 'var(--t-line-soft)' : 'transparent',
                      transition: 'background 0.12s',
                    }}
                      onMouseEnter={e => { if (v.status !== 'listo' && openSearchRow !== origIdx) e.currentTarget.style.background = 'var(--t-line-soft)'; }}
                      onMouseLeave={e => { if (v.status !== 'listo' && openSearchRow !== origIdx) e.currentTarget.style.background = 'transparent'; }}>

                      <td style={{ ...tdS, textAlign: 'center' }}>
                        <input type="checkbox"
                          checked={checkedRows.has(origIdx)}
                          onChange={() => {}}
                          onClick={(e: React.MouseEvent<HTMLInputElement>) => {
                            if (e.shiftKey && lastCheckedDisplayIdx !== null) {
                              e.preventDefault();
                              const min = Math.min(lastCheckedDisplayIdx, displayIdx);
                              const max = Math.max(lastCheckedDisplayIdx, displayIdx);
                              const shouldCheck = !checkedRows.has(origIdx);
                              setCheckedRows(prev => {
                                const n = new Set(prev);
                                for (let di = min; di <= max; di++) {
                                  const oi = vehicles.indexOf(displayVehicles[di]);
                                  if (oi >= 0) { if (shouldCheck) n.add(oi); else n.delete(oi); }
                                }
                                return n;
                              });
                              setLastCheckedDisplayIdx(displayIdx);
                            } else {
                              setCheckedRows(prev => { const n = new Set(prev); if (n.has(origIdx)) n.delete(origIdx); else n.add(origIdx); return n; });
                              setLastCheckedDisplayIdx(displayIdx);
                            }
                          }}
                          style={{ cursor: 'pointer', width: 14, height: 14 }}
                        />
                      </td>
                      <td style={{ ...tdS, fontFamily: 'monospace', fontWeight: 800, color: 'var(--t-text)', letterSpacing: '0.04em' }}>{v.matricula}</td>

                      {/* ── Marca editable ──────────────────────────────── */}
                      <td style={{ ...tdS, padding: '2px 6px' }}>
                        <input
                          value={v.marca}
                          onChange={e => setV(origIdx, { marca: e.target.value })}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSearch(origIdx); } }}
                          title="Edita y pulsa Enter para re-buscar"
                          style={{ width: '100%', border: 'none', borderBottom: '1px dashed var(--t-line)', background: 'transparent', fontWeight: 600, color: 'var(--t-text)', fontSize: 12, outline: 'none', cursor: 'text', padding: '2px 0' }}
                        />
                      </td>

                      {/* ── Modelo editable ─────────────────────────────── */}
                      <td style={{ ...tdS, padding: '2px 6px' }}>
                        <input
                          value={v.modelo}
                          onChange={e => setV(origIdx, { modelo: e.target.value })}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSearch(origIdx); } }}
                          title="Edita y pulsa Enter para re-buscar"
                          placeholder="—"
                          style={{ width: '100%', border: 'none', borderBottom: '1px dashed var(--t-line)', background: 'transparent', color: 'var(--t-text-2)', fontSize: 12, outline: 'none', cursor: 'text', padding: '2px 0' }}
                        />
                      </td>

                      {/* ── Año cell + editable ──────────────────────────── */}
                      <td style={{ ...tdS, padding: '2px 6px' }}>
                        {(() => {
                          const y = extractYear(v);
                          const yPlate = !y ? estimateYear(v.matricula)?.year : null;
                          const display = y ?? yPlate;
                          const fromFab = !!v.anyo_fabricacion;
                          const fromPlate = !y && !!yPlate;
                          return (
                            <input
                              value={display ?? ''}
                              onChange={e => {
                                const val = e.target.value.trim();
                                setV(origIdx, { anyo_fabricacion: val, anyo_matricula: val });
                              }}
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSearch(origIdx); } }}
                              title={fromFab ? 'Año fabricación (Silverdat) — edita y Enter para re-buscar' : fromPlate ? 'Estimado del diccionario de matrícula — edita y Enter para re-buscar' : 'Introduce el año y pulsa Enter'}
                              placeholder="—"
                              style={{
                                width: 48, border: 'none', borderBottom: '1px dashed var(--t-line)', background: 'transparent',
                                fontSize: 11, fontWeight: 700, fontFamily: 'monospace', outline: 'none', cursor: 'text', padding: '2px 0',
                                color: fromFab ? 'var(--t-amber)' : fromPlate ? 'var(--t-blue)' : 'var(--t-text-3)',
                              }}
                            />
                          );
                        })()}
                      </td>

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
                            <button type="button" onClick={() => handleClearSelection(origIdx)}
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
                                if (c) handleSelect(origIdx, c);
                              }}
                              style={{ flex: 1, maxWidth: 380, fontSize: 11, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--t-line)', background: 'var(--t-bg)', color: 'var(--t-text)', outline: 'none', cursor: 'pointer' }}>
                              <option value="" disabled>— Seleccionar acabado —</option>
                              {v.candidatos.map(c => (
                                <option key={c.id_veh} value={c.id_veh}>
                                  {c.version}{c.score ? ` · ${c.score}%` : ''}
                                </option>
                              ))}
                            </select>
                            <button type="button"
                              onClick={() => setOpenSearchRow(openSearchRow === origIdx ? null : origIdx)}
                              title="Buscar manualmente en el catálogo"
                              style={{ fontSize: 10, padding: '4px 8px', borderRadius: 6, background: openSearchRow === origIdx ? 'rgba(18,64,204,0.15)' : 'transparent', border: '1px solid var(--t-line)', color: 'var(--t-blue)', cursor: 'pointer', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
                              Buscar
                            </button>
                          </div>
                        ) : (
                          <button type="button"
                            onClick={() => setOpenSearchRow(openSearchRow === origIdx ? null : origIdx)}
                            style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 6,
                              background: v.status === 'sin_catalogo' ? 'rgba(239,68,68,0.06)' : 'transparent',
                              border: `1px solid ${v.status === 'sin_catalogo' ? 'rgba(239,68,68,0.25)' : 'var(--t-line)'}`,
                              color: v.status === 'sin_catalogo' ? 'var(--t-red)' : 'var(--t-blue)', cursor: 'pointer' }}>
                            {v.status === 'sin_catalogo' ? 'Sin coincidencias · Buscar' : 'Buscar en catálogo'}
                          </button>
                        )}
                      </td>

                      <td style={{ ...tdS, fontFamily: 'monospace', fontSize: 11, color: 'var(--t-text-3)' }}>
                        {v.seleccionado ? (
                          <span style={{ color: 'var(--t-text)', fontWeight: 700 }}>{v.seleccionado.id_veh}</span>
                        ) : (
                          <DirectIdCell onSubmit={id => handleDirectId(origIdx, id)} />
                        )}
                      </td>

                      <td style={tdS}><StatusChip status={v.status} /></td>
                    </tr>

                    {/* ── Panel búsqueda manual (fila expandible) ─────────── */}
                    {openSearchRow === origIdx && (
                      <tr style={{ borderBottom: '1px solid var(--t-line)' }}>
                        <td colSpan={8} style={{ padding: 0 }}>
                          <ManualSearchPanel
                            vehicle={v}
                            yearHint={extractYear(v) ?? undefined}
                            onSelect={c => handleSelect(origIdx, c)}
                            onClose={() => setOpenSearchRow(null)}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                  );
                })}
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
        style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: 'transparent', border: '1px solid var(--t-line)', color: 'var(--t-blue)', cursor: 'pointer' }}>
        + ID
      </button>
    );
  }
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <input autoFocus value={val} onChange={e => setVal(e.target.value)}
        placeholder="241210258"
        onKeyDown={e => { if (e.key === 'Enter' && val.trim()) { onSubmit(val.trim()); setEditing(false); setVal(''); } if (e.key === 'Escape') { setEditing(false); setVal(''); } }}
        style={{ width: 90, fontSize: 11, padding: '3px 6px', borderRadius: 5, border: '1px solid var(--t-blue)', outline: 'none', fontFamily: 'monospace', background: 'var(--t-bg)', color: 'var(--t-text)' }} />
      <button type="button" onClick={() => { if (val.trim()) { onSubmit(val.trim()); setEditing(false); setVal(''); } }}
        style={{ fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 5, background: 'var(--t-blue)', color: '#fff', border: 'none', cursor: 'pointer' }}>
        ✓
      </button>
    </div>
  );
}

// ─── BulkIdInput ─────────────────────────────────────────────────────────────

function BulkIdInput({ onSubmit }: { onSubmit: (id: string) => void }) {
  const [val, setVal] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const id = val.trim();
    if (!id) return;
    setLoading(true);
    try { await onSubmit(id); setVal(''); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 10, color: 'var(--t-text-3)', fontWeight: 600, whiteSpace: 'nowrap' }}>o ID directo:</span>
      <input
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        placeholder="241210258"
        style={{ width: 100, fontSize: 11, padding: '3px 6px', borderRadius: 5, border: '1px solid var(--t-line)', outline: 'none', fontFamily: 'monospace', background: 'var(--t-bg)', color: 'var(--t-text)' }}
      />
      <button onClick={submit} disabled={!val.trim() || loading}
        style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 5, background: val.trim() && !loading ? 'var(--t-blue)' : 'var(--t-line)', color: val.trim() && !loading ? '#fff' : 'var(--t-text-3)', border: 'none', cursor: val.trim() && !loading ? 'pointer' : 'not-allowed' }}>
        {loading ? '...' : 'Aplicar'}
      </button>
    </div>
  );
}

// ─── Estilos tabla ────────────────────────────────────────────────────────────

const thS: React.CSSProperties = {
  padding: '9px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700,
  color: 'var(--t-text-3)', borderBottom: '2px solid var(--t-line)', whiteSpace: 'nowrap',
};

const tdS: React.CSSProperties = {
  padding: '10px 12px', fontSize: 12, color: 'var(--t-text)', verticalAlign: 'middle',
};
