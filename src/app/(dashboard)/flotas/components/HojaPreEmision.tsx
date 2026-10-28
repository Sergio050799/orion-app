"use client";

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { nf } from '@/lib/fmt';
import CatalogCascade, { type CascadaVersion } from '@/components/saas/CatalogCascade';
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
  if (base.kw !== other.kw) diffs.push(`KW: ${base.kw} frente a ${other.kw}`);
  if (base.cv !== other.cv) diffs.push(`CV: ${base.cv} frente a ${other.cv}`);
  if (base.tn !== other.tn) diffs.push(`TN: ${base.tn} frente a ${other.tn}`);
  if (base.tipo.toUpperCase() !== other.tipo.toUpperCase()) diffs.push(`Tipo: ${base.tipo} frente a ${other.tipo}`);
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

  const pick = (v: CascadaVersion) => onSelect({
    id_veh: v.id_veh, marca: v.marca, modelo: v.modelo, version: v.version,
    combustible: v.combustible, kw: v.kw, cv: v.cv, cilindrada: v.cilindrada,
    plazas: v.plazas, tara: v.tara, pma: v.pma, puertas: v.puertas, anyo: v.anyo, pvp: v.pvp, score: 100,
  });

  return (
    <div className="srch">
      <div className="note" style={{ margin: '0 0 12px' }}>
        Búsqueda manual en el catálogo: elige marca, modelo, año y versión; después puedes filtrar por combustible, potencia y plazas.
      </div>
      <CatalogCascade
        idPrefix={`pe_${vehicle.matricula.replace(/\W/g, '')}`}
        initial={{ marca: initMarca, modelo: initModelo, anyo: yearHint }}
        onSelect={pick}
        onClose={onClose}
      />
    </div>
  );
}

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
    <div className="mdl-wrap" role="dialog" aria-modal="true" aria-label="Vehículos muy parecidos" onClick={onClose}>
      <div className="mdl" onClick={e => e.stopPropagation()}>
        <div className="mdl-over">Identificación</div>
        <h3>Vehículos muy parecidos</h3>
        <p className="mdl-desc">
          ¿Asignar «{selected.version}» (ID {selected.id_veh}) también a estos vehículos, que se parecen a {source.matricula} ({source.marca} {source.modelo}) pero no son idénticos?
        </p>
        <ul className="mdl-list">
          {similar.map(s => (
            <li key={s.idx}>
              <label>
                <input type="checkbox" checked={checked.has(s.idx)} onChange={() => toggle(s.idx)} />
                <span>
                  <b>{s.vehicle.matricula}</b>{s.identical ? ' · idéntico' : ''}
                  <br />
                  <span className="mdl-sub">{s.diffs.join(' · ') || 'Sin diferencias relevantes'}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <div className="mdl-act">
          <button type="button" className="mini" onClick={onClose}>Solo el vehículo ya asignado</button>
          <button type="button" className="mini pri" onClick={() => onApply(Array.from(checked))} disabled={checked.size === 0}>
            Aplicar a los marcados{checked.size ? ` (${nf(checked.size)})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── StatusChip ───────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: EmisionStatus }) {
  const cfg = {
    pendiente:    { cls: 'pen', label: 'Pendiente' },
    listo:        { cls: 'ok',  label: 'Asignado' },
    sin_catalogo: { cls: 'no',  label: 'Sin catálogo' },
  }[status];
  return <span className={`cstate ${cfg.cls}`}>{cfg.label}</span>;
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

  // ── Filtros, búsqueda y paginación (solo presentación) ──────────────────────
  const [q, setQ]       = useState('');
  const [flt, setFlt]   = useState<'all' | EmisionStatus>('all');
  const [shown, setShown] = useState(15);
  const PAGE = 15;

  const visibles = useMemo(() => {
    const nq = q.trim().toUpperCase().replace(/[\s-]/g, '');
    return displayVehicles.filter(v =>
      (flt === 'all' || v.status === flt) &&
      (!nq || `${v.matricula} ${v.marca} ${v.modelo}`.toUpperCase().replace(/[\s-]/g, '').includes(nq)),
    );
  }, [displayVehicles, q, flt]);
  const filas = visibles.slice(0, shown);

  const nPend = vehicles.filter(v => v.status === 'pendiente').length;
  const nSin  = vehicles.filter(v => v.status === 'sin_catalogo').length;
  const idsDistintos = new Set(vehicles.filter(v => v.seleccionado).map(v => v.seleccionado!.id_veh)).size;
  const hayBuscando = vehicles.some(v => v.searching);

  const buscarPendientes = () => {
    vehicles.forEach((v, i) => { if (!v.seleccionado && !v.searching) handleSearch(i); });
  };
  const allVisibleChecked = visibles.length > 0 && visibles.every(v => checkedRows.has(vehicles.indexOf(v)));

  const kpi = (label: string, n: number, f: 'all' | EmisionStatus | null) => (
    <button type="button" onClick={() => { if (f) { setFlt(f); setShown(15); } }} aria-pressed={f !== null && flt === f}>
      <label>{label}</label><strong>{nf(n)}</strong>
    </button>
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Cabecera de paso ── */}
      <div className="sh" style={{ flexShrink: 0 }}>
        <div>
          <h2><b>08 ·</b>Pre-emisión</h2>
          <p>Asignación de cada vehículo al catálogo antes de emitir.</p>
        </div>
        <div className="acts">
          {hayBuscando && (
            <button className="mini" onClick={() => {
              searchAbortRef.current.forEach(ctrl => ctrl.abort());
              searchAbortRef.current.clear();
              setVehicles(prev => prev.map(v => v.searching ? { ...v, searching: false, status: v.candidatos.length > 0 ? 'pendiente' : 'sin_catalogo' } : v));
            }}>Detener búsqueda</button>
          )}
          <button className="mini" onClick={handleDownloadEmision} disabled={listos === 0}>Exportar Excel</button>
        </div>
      </div>

      <div className="stepscroll">
        {vehicles.length === 0 ? (
          <div className="notice">Añade vehículos en Trabajo para comenzar la pre-emisión.</div>
        ) : (
          <>
            <div className="stat3">
              {kpi('Vehículos', vehicles.length, 'all')}
              {kpi('Asignados', listos, 'listo')}
              {kpi('Pendientes de elegir', nPend, 'pendiente')}
              {kpi('Sin catálogo', nSin, 'sin_catalogo')}
              {kpi('IDs distintos', idsDistintos, null)}
            </div>

            <div className="idtool">
              <input className="search" type="search" placeholder="Buscar matrícula, marca o modelo" aria-label="Buscar vehículo"
                value={q} onChange={e => { setQ(e.target.value); setShown(15); }} autoComplete="off" />
              <select className="select" aria-label="Filtrar por estado" value={flt}
                onChange={e => { setFlt(e.target.value as 'all' | EmisionStatus); setShown(15); }}>
                <option value="all">Todos los estados</option>
                <option value="listo">Asignados</option>
                <option value="pendiente">Pendientes de elegir</option>
                <option value="sin_catalogo">Sin catálogo</option>
              </select>
              <button className="mini" onClick={buscarPendientes} disabled={hayBuscando}>Buscar pendientes en catálogo</button>
            </div>

            {/* ── Selección múltiple ── */}
            {checkedRows.size > 0 && (() => {
              const firstIdx = [...checkedRows].find(i => vehicles[i]?.candidatos.length > 0) ?? -1;
              const candidatos = firstIdx >= 0 ? vehicles[firstIdx].candidatos : [];
              return (
                <div className="selbar on">
                  <span><b>{nf(checkedRows.size)}</b> vehículo{checkedRows.size > 1 ? 's' : ''} seleccionado{checkedRows.size > 1 ? 's' : ''}</span>
                  {candidatos.length > 0 && (
                    <select className="select" defaultValue="" aria-label="Versión de los candidatos"
                      onChange={e => { const c = candidatos.find(c => c.id_veh === e.target.value); if (c) handleBulkAssign(c); }}>
                      <option value="" disabled>Versión de los candidatos</option>
                      {candidatos.map(c => (
                        <option key={c.id_veh} value={c.id_veh}>{c.version}{c.score ? ` · ${nf(c.score)} %` : ''}</option>
                      ))}
                    </select>
                  )}
                  <BulkIdInput onSubmit={handleBulkDirectId} />
                  <button className="mini" onClick={() => setCheckedRows(new Set())}>Quitar selección</button>
                </div>
              );
            })()}

            <div className="xwrap" style={{ maxHeight: 'none' }}>
              <table className="xg">
                <thead>
                  <tr>
                    <th className="chk">
                      <input type="checkbox" aria-label="Seleccionar todos los visibles" checked={allVisibleChecked}
                        onChange={e => {
                          setCheckedRows(e.target.checked ? new Set(visibles.map(v => vehicles.indexOf(v))) : new Set());
                          setLastCheckedDisplayIdx(null);
                        }} />
                    </th>
                    <th style={{ cursor: 'pointer' }} onClick={() => handleSortCol('matricula')}>Matrícula</th>
                    <th style={{ cursor: 'pointer' }} onClick={() => handleSortCol('marca')}>Marca y modelo</th>
                    <th>Tipo</th>
                    <th className="n">kW</th>
                    <th className="n" style={{ cursor: 'pointer' }} onClick={() => handleSortCol('anyo_fabricacion')}>Año</th>
                    <th>ID catálogo</th>
                    <th>Versión / acabado</th>
                    <th style={{ cursor: 'pointer' }} onClick={() => handleSortCol('status')}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.length === 0 && (
                    <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--quiet)', padding: 26 }}>Ningún vehículo coincide con el filtro.</td></tr>
                  )}
                  {filas.map((v, displayIdx) => {
                    const origIdx = vehicles.indexOf(v);
                    const sel = checkedRows.has(origIdx);
                    const y = extractYear(v);
                    const yPlate = !y ? estimateYear(v.matricula)?.year : null;
                    const yearShown = y ?? yPlate;
                    const fromFab = !!v.anyo_fabricacion;
                    const fromPlate = !y && !!yPlate;
                    const grp = v.seleccionado
                      ? vehicles.filter(x => x.seleccionado && x.seleccionado.id_veh === v.seleccionado!.id_veh && strictKey(x) === strictKey(v)).length
                      : 0;
                    return (
                      <React.Fragment key={v.matricula || displayIdx}>
                        <tr className={sel ? 'sel' : undefined}>
                          <td className="chk">
                            <input type="checkbox" aria-label={`Seleccionar ${v.matricula}`} checked={sel} onChange={() => {}}
                              onClick={(e: React.MouseEvent<HTMLInputElement>) => {
                                if (e.shiftKey && lastCheckedDisplayIdx !== null) {
                                  e.preventDefault();
                                  const min = Math.min(lastCheckedDisplayIdx, displayIdx);
                                  const max = Math.max(lastCheckedDisplayIdx, displayIdx);
                                  const shouldCheck = !checkedRows.has(origIdx);
                                  setCheckedRows(prev => {
                                    const n = new Set(prev);
                                    for (let di = min; di <= max; di++) {
                                      const oi = vehicles.indexOf(filas[di]);
                                      if (oi >= 0) { if (shouldCheck) n.add(oi); else n.delete(oi); }
                                    }
                                    return n;
                                  });
                                  setLastCheckedDisplayIdx(displayIdx);
                                } else {
                                  setCheckedRows(prev => { const n = new Set(prev); if (n.has(origIdx)) n.delete(origIdx); else n.add(origIdx); return n; });
                                  setLastCheckedDisplayIdx(displayIdx);
                                }
                              }} />
                          </td>
                          <td>{v.matricula}</td>
                          <td>
                            <div className="mm">
                              <input value={v.marca} aria-label={`Marca de ${v.matricula}`} title="Edita y pulsa Enter para volver a buscar"
                                onChange={e => setV(origIdx, { marca: e.target.value })}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSearch(origIdx); } }} />
                              <input value={v.modelo} placeholder="—" aria-label={`Modelo de ${v.matricula}`} title="Edita y pulsa Enter para volver a buscar"
                                onChange={e => setV(origIdx, { modelo: e.target.value })}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSearch(origIdx); } }} />
                            </div>
                          </td>
                          <td>{v.tipo || <span className="em">—</span>}</td>
                          <td className="n">{v.kw ? nf(parseFloat(v.kw) || 0) : <span className="em">—</span>}</td>
                          <td className="n yr">
                            <input value={yearShown ?? ''} inputMode="numeric" placeholder="—" aria-label={`Año de ${v.matricula}`}
                              title={fromFab ? 'Año de fabricación (Silverdat). Edita y pulsa Enter para volver a buscar' : fromPlate ? 'Estimado a partir de la matrícula. Edita y pulsa Enter para volver a buscar' : 'Introduce el año y pulsa Enter'}
                              onChange={e => { const val = e.target.value.trim(); setV(origIdx, { anyo_fabricacion: val, anyo_matricula: val }); }}
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSearch(origIdx); } }} />
                          </td>
                          <td>
                            {v.seleccionado
                              ? <input value={v.seleccionado.id_veh} readOnly aria-label={`ID de catálogo de ${v.matricula}`} />
                              : <DirectIdCell label={`ID de catálogo de ${v.matricula}`} onSubmit={id => handleDirectId(origIdx, id)} />}
                          </td>
                          <td>
                            {v.searching ? (
                              <span className="em">Buscando…</span>
                            ) : v.seleccionado ? (
                              <div className="selv">
                                <b>{v.seleccionado.version}</b>
                                <button type="button" className="xbtn" title="Cambiar versión" aria-label={`Cambiar la versión de ${v.matricula}`}
                                  onClick={() => handleClearSelection(origIdx)}>×</button>
                              </div>
                            ) : v.candidatos.length > 0 ? (
                              <div className="selv">
                                <select defaultValue="" aria-label={`Seleccionar acabado de ${v.matricula}`}
                                  onChange={e => { const c = v.candidatos.find(c => c.id_veh === e.target.value); if (c) handleSelect(origIdx, c); }}>
                                  <option value="" disabled>Seleccionar acabado</option>
                                  {v.candidatos.map(c => (
                                    <option key={c.id_veh} value={c.id_veh}>{c.version}{c.score ? ` · ${nf(c.score)} %` : ''}</option>
                                  ))}
                                </select>
                                <button type="button" className="mini" title="Buscar manualmente en el catálogo"
                                  onClick={() => setOpenSearchRow(openSearchRow === origIdx ? null : origIdx)}>Buscar</button>
                              </div>
                            ) : (
                              <button type="button" className="mini" style={{ color: 'var(--quiet)' }}
                                onClick={() => setOpenSearchRow(openSearchRow === origIdx ? null : origIdx)}>
                                {v.status === 'sin_catalogo' ? 'Sin coincidencias · Buscar' : 'Buscar en catálogo'}
                              </button>
                            )}
                          </td>
                          <td>
                            <StatusChip status={v.status} />
                            {grp > 1 && <span className="grp"> · mismo ID ×{nf(grp)}</span>}
                          </td>
                        </tr>

                        {openSearchRow === origIdx && (
                          <tr className="srchrow">
                            <td colSpan={9}>
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

            <div className="xnote">
              <span>
                Si hay coincidencias eliges el acabado; si no, pulsa Buscar. Al asignar una versión, ORION aplica el mismo ID a los vehículos idénticos (marca, modelo, kW y tipo) y te pregunta por los muy parecidos. Edita el ID o el año y pulsa Enter para volver a buscar.
              </span>
              <span>Mostrando {nf(filas.length)} de {nf(visibles.length)}</span>
            </div>
            {shown < visibles.length && (
              <div className="more">
                <button onClick={() => setShown(n => n + PAGE)}>
                  Mostrar {nf(Math.min(PAGE, visibles.length - shown))} más &middot; quedan {nf(visibles.length - shown)}
                </button>
              </div>
            )}
          </>
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

    </div>
  );
}

// ─── DirectIdCell ─────────────────────────────────────────────────────────────

function DirectIdCell({ onSubmit, label }: { onSubmit: (id: string) => void; label: string }) {
  const [val, setVal] = useState('');
  return (
    <input value={val} inputMode="numeric" placeholder="241210258" aria-label={label}
      title="Escribe el ID de catálogo y pulsa Enter"
      onChange={e => setVal(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter' && val.trim()) { onSubmit(val.trim()); setVal(''); }
        if (e.key === 'Escape') setVal('');
      }} />
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
    <>
      <input className="inp" style={{ width: 150 }} value={val} inputMode="numeric" placeholder="ID directo, ej. 241210258" aria-label="ID de catálogo para los seleccionados"
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); }} />
      <button className="mini pri" onClick={submit} disabled={!val.trim() || loading}>
        {loading ? 'Asignando…' : 'Asignar el mismo ID'}
      </button>
    </>
  );
}
