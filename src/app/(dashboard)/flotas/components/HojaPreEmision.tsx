"use client";

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { nf } from '@/lib/fmt';
import CatalogCascade, { type CascadaVersion } from '@/components/saas/CatalogCascade';
import { resolvePlate } from '@/core/_source_of_truth/plates/engine';
import { DetailDrawer } from '@/components/saas/DetailDrawer';
import { TIPO_INFO, type TipoKey } from '@/core/catalogo/tipologia';
import {
  revisarIdentificacion, bloquea, avisos, ventanaAnios,
  type Hallazgo, type VersionCatalogo, type VehiculoDeclarado, type InfoVerificacion, type FuenteAnio,
} from '@/core/catalogo/verificacion';
import { cubreAnio, distanciaAnios } from '@/core/catalogo/seleccion';
import { VENTANAS_SEMILLA, type MapaVentanas } from '@/core/catalogo/ventanasSistema';
import { cargarVentanas } from '@/lib/ventanasSistemaClient';

function estimateYear(plate: string): { year: number } | null {
  const r = resolvePlate(plate.trim().toUpperCase());
  return r ? { year: r.year } : null;
}

const matLimpia = (m: string) => (m ?? '').replace(/[\s-]/g, '').toUpperCase();

/**
 * Año del VEHÍCULO (nunca el de la versión del catálogo): Silverdat, estudio o, si no hay, estimado por la matrícula.
 */
function anioDe(s: string | undefined): number | null {
  const m = (s ?? '').match(/(\d{4})/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  return y >= 1980 && y <= 2040 ? y : null;
}

interface EntradaAnios { anyo_fabricacion: string; anyo_matricula: string; fecha_matriculacion: string; matricula: string; anyo_fab_fuente?: string }

/**
 * Años del vehículo y de dónde sale el de fabricación (el que valida el sistema de emisión).
 * Orden: el de fabricación (plantilla del corredor o Silverdat) → el año de la fecha de matriculación (Silverdat)
 * → el calculado por ORION a partir de la matrícula. Nunca se inventa un año si hay otro dato real.
 */
function aniosDe(v: EntradaAnios): { fab: number | null; mat: number | null; fuente: FuenteAnio | undefined } {
  const fabCol = anioDe(v.anyo_fabricacion);
  const fMat = anioDe(v.fecha_matriculacion);
  const aMat = anioDe(v.anyo_matricula);
  const est = estimateYear(v.matricula)?.year ?? null;
  const mat = fMat ?? aMat ?? est;
  if (fabCol) {
    const f = v.anyo_fab_fuente === 'manual' ? 'manual' : v.anyo_fab_fuente === 'matriculacion' ? 'matriculacion' : 'fabricacion';
    return { fab: fabCol, mat, fuente: f };
  }
  if (fMat) return { fab: fMat, mat, fuente: 'matriculacion' };
  const e = aMat ?? est;
  return { fab: e, mat, fuente: e ? 'estimado' : undefined };
}

const anioVehiculo = (v: EntradaAnios): number | null => aniosDe(v).fab;

const ETIQUETA_FUENTE: Record<FuenteAnio, string> = {
  fabricacion: 'fabricación', matriculacion: 'de la matriculación', estimado: 'calculado por matrícula', manual: 'escrito a mano',
};

/** Lo que el estudio / Silverdat dicen del vehículo, preparado para compararlo con la versión del catálogo. */
function declaradoDe(v: VehicleEmision): VehiculoDeclarado {
  const esRem = ['semirremolque', 'remolque'].includes((v.tipo || '').toLowerCase()) || /^R[\s-]?\d{4}/i.test(v.matricula);
  let marca = (v.marca || '').trim(), modelo = (v.modelo || '').trim();
  // «Scania R450» en la marca y modelo vacío o repetido → separar
  if (marca.includes(' ')) {
    const suf = marca.slice(marca.indexOf(' ')).trim();
    if (!modelo || modelo.toUpperCase() === suf.toUpperCase()) { modelo = suf; marca = marca.slice(0, marca.indexOf(' ')); }
  }
  const kw = parseFloat(v.kw), plazas = parseInt(v.plazas, 10);
  return {
    // los remolques se asignan a entradas genéricas por peso: no se compara el nombre
    marca: esRem ? undefined : marca, modelo: esRem ? undefined : modelo, tipo: v.tipo,
    kw: Number.isFinite(kw) && kw > 0 ? kw : undefined,
    plazas: Number.isFinite(plazas) && plazas > 0 ? plazas : undefined,
    anio: aniosDe(v).fab, anioFab: aniosDe(v).fab, anioMat: aniosDe(v).mat, fuenteAnio: aniosDe(v).fuente,
    aproximada: v.aproximada,
  };
}

function versionDe(c: CandidatoCatalogo): VersionCatalogo {
  return {
    marca: c.marca, modelo: c.modelo, version: c.version, kw: c.kw, anyo: c.anyo,
    desde: c.desde, hasta: c.hasta, tipo: c.tipo,
    plazas: c.plazas, num_plazas_min: c.plazasMin || c.plazas, num_plazas_max: c.plazas,
  };
}

function etiquetaRevision(r: { hall: Hallazgo[]; bloq: Hallazgo[]; confirmada: boolean } | undefined): string {
  if (!r) return '';
  return r.hall.length === 0 ? 'Correcta' : r.confirmada ? 'Dada por buena' : r.bloq.length > 0 ? 'Por revisar' : 'Con avisos';
}

interface Revision {
  hall: Hallazgo[]; bloq: Hallazgo[]; av: Hallazgo[]; confirmada: boolean; anio: number | null;
  fuente?: FuenteAnio; ventana: NonNullable<InfoVerificacion['ventana']>;
  /** el sistema de emisión rechazará seguro este año: no se puede dar por bueno */
  imposible: boolean; por?: string; fecha?: string;
}

const CODIGOS_IMPOSIBLES = new Set(['ANIO_ANTERIOR', 'ANIO_POSTERIOR', 'MATRICULACION_FUERA']);

const fechaCorta = (iso?: string) => { const d = iso ? new Date(iso) : null; return d && !isNaN(d.getTime()) ? d.toLocaleDateString('es-ES') : ''; };
const usuarioActual = () => { try { return sessionStorage.getItem('orion_user') || ''; } catch { return ''; } };

/** «2018 – 2019 (según el sistema)», «2015 – 2020», «2015 – sin fin en el catálogo» */
function textoVentana(w: Revision['ventana']): string {
  if (w.origen === 'sistema') return `${w.min} – ${w.max} (según el sistema)`;
  if (w.min === null && w.max === null) return 'sin dato en el catálogo';
  if (w.min !== null && w.max !== null) return `${w.min} – ${w.max}`;
  if (w.min !== null) return `desde ${w.min} · sin fin en el catálogo`;
  return `hasta ${w.max} · sin inicio en el catálogo`;
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

type EmisionStatus = 'pendiente' | 'listo' | 'sin_catalogo';
/** Estado que se muestra: «revisar» = versión asignada pero con discrepancias graves sin confirmar */
type EstadoVis = EmisionStatus | 'revisar';

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
  /** ventana de comercialización y tipología de la versión (para verificarla) */
  desde?: number;
  hasta?: number;
  plazasMin?: number;
  tipo?: string;
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
  /** origen del año de fabricación: fabricacion | matriculacion | manual (vacío = no se sabe) */
  anyo_fab_fuente: string;
  fecha_matriculacion: string;
  plazas: string;
  status: EmisionStatus;
  candidatos: CandidatoCatalogo[];
  seleccionado: CandidatoCatalogo | null;
  searching: boolean;
  /** la versión se propuso por ser la más cercana en años (ninguna cubre el año del vehículo) */
  aproximada?: boolean;
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
  /** «Correcta», «Con avisos», «Por revisar» o «Dada por buena» (vacío si aún no hay versión asignada) */
  revision: string;
  motivos: string;
}

interface Props {
  trabajoRows: Record<string, string>[];
  initialSeleccion?: Record<string, string>;
  onCatalogoChange?: (selecciones: Record<string, string>) => void;
  onVehiclesUpdate?: (exports: VehiculoExport[]) => void;
  /** matrícula limpia → id de catálogo ya confirmado a mano pese a las discrepancias */
  initialVerificacionOk?: Record<string, string>;
  /** resultado de la verificación por matrícula (lo lee EMISIÓN) y confirmaciones a guardar */
  /** quién y cuándo dio por buena cada identificación (matrícula limpia → registro) */
  initialVerificacionRegistro?: Record<string, { por: string; fecha: string }>;
  onVerificacionChange?: (info: Record<string, InfoVerificacion>, ok: Record<string, string>, registro: Record<string, { por: string; fecha: string }>) => void;
}

export type { InfoVerificacion };

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
    desde: v.desde, hasta: v.hasta, plazasMin: v.plazasMin, tipo: v.tipo,
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

function StatusChip({ status }: { status: EstadoVis }) {
  const cfg = {
    pendiente:    { cls: 'pen', label: 'Pendiente' },
    listo:        { cls: 'ok',  label: 'Asignado' },
    sin_catalogo: { cls: 'no',  label: 'Sin catálogo' },
    revisar:      { cls: 'pen', label: 'Revisar' },
  }[status];
  return <span className={`cstate ${cfg.cls}`}>{cfg.label}</span>;
}

// ─── HojaPreEmision ───────────────────────────────────────────────────────────

export default function HojaPreEmision({ trabajoRows, initialSeleccion, onCatalogoChange, onVehiclesUpdate, initialVerificacionOk, initialVerificacionRegistro, onVerificacionChange }: Props) {
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
      anyo_fab_fuente:     r['anyo_fab_fuente'] ?? '',
      fecha_matriculacion: r['fecha_matriculacion'] ?? '',
      plazas:              r['plazas'] ?? '',
      status:              'pendiente' as EmisionStatus,
      candidatos:          [],
      seleccionado:        null,
      searching:           false,
    })),
    [trabajoRows],
  );

  const [vehicles, setVehicles]         = useState<VehicleEmision[]>(initial);
  // Confirmaciones manuales: matrícula limpia → id de catálogo dado por bueno
  const [verifOk, setVerifOk]           = useState<Record<string, string>>(initialVerificacionOk ?? {});
  const [registro, setRegistro]         = useState<Record<string, { por: string; fecha: string }>>(initialVerificacionRegistro ?? {});
  // Ventanas de años que admite el sistema de emisión por ID (semilla + aprendidas). La búsqueda espera a tenerlas.
  const [ventanas, setVentanas]         = useState<MapaVentanas>(VENTANAS_SEMILLA);
  const [ventanasListas, setVentanasListas] = useState(false);
  const ventanasRef                     = useRef<MapaVentanas>(VENTANAS_SEMILLA);
  useEffect(() => { ventanasRef.current = ventanas; }, [ventanas]);
  useEffect(() => {
    let vivo = true;
    const cargar = () => cargarVentanas().then(m => { if (vivo) { setVentanas(m); ventanasRef.current = m; setVentanasListas(true); } });
    cargar();
    window.addEventListener('orion:ventanas', cargar);
    return () => { vivo = false; window.removeEventListener('orion:ventanas', cargar); };
  }, []);
  const [revAbierta, setRevAbierta]     = useState<number | null>(null);
  const [openSearchRow, setOpenSearchRow] = useState<number | null>(null);
  const [checkedRows, setCheckedRows]   = useState<Set<number>>(new Set());
  const [sortConfig, setSortConfig]     = useState<{ col: string; dir: 'asc'|'desc' } | null>(null);
  const [lastCheckedDisplayIdx, setLastCheckedDisplayIdx] = useState<number | null>(null);
  // Matrículas con ID ya conocido no se auto-buscan; se pre-cargan desde el catálogo
  const searchedMatsRef                 = useRef<Set<string>>(new Set(initialSeleccion ? Object.keys(initialSeleccion) : []));
  const preloadedRef                    = useRef<Set<string>>(new Set());
  // Matrículas cuya identificación guardada se está cargando: no se pierden si se notifica a medias
  const cargandoRef                     = useRef<Set<string>>(new Set());
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
      cargandoRef.current.add(mat);
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
        .catch(() => {})
        .finally(() => { cargandoRef.current.delete(mat); });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSeleccion]);

  const applyToMultiple = useCallback((indices: number[], cat: CandidatoCatalogo) => {
    setVehicles(prev => {
      const updated = [...prev];
      indices.forEach(idx => { updated[idx] = { ...updated[idx], seleccionado: cat, status: 'listo', searching: false, aproximada: false }; });
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
      // Una versión solo se copia a vehículos de su misma época: el resto se identifican por su cuenta
      if (cubreAnio(c, anioVehiculo(v), ventanasRef.current) === false) return;
      if (strictKey(v) === srcKey) identical.push(j);
      else similar.push({ vehicle: v, idx: j, diffs: getDiffs(source, v), identical: false });
    });

    applyToMultiple([i, ...identical], c);
    setOpenSearchRow(null);

    if (similar.length > 0) setModalData({ sourceIdx: i, selected: c, similar });
  }, [vehicles, applyToMultiple]);

  const extractYear = useCallback((v: VehicleEmision): number | null => aniosDe(v).fab, []);

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
        const pz = parseInt(v.plazas, 10);
        if (Number.isFinite(pz) && pz > 0) body.plazas = pz;
        // Sin Silverdat (sin kw ni combustible): pasar texto crudo para detección de marca en servidor
        if (!v.kw && !v.combustible && v.marca) {
          body.rawText = [v.marca, v.modelo].filter(Boolean).join(' ');
        }
      }

      // Año de fabricación: plantilla del corredor / Silverdat → matriculación → calculado por matrícula
      const anioV = aniosDe(v).fab;
      if (anioV) body.anyo = anioV;

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
      // Fallback sin año: el buscador excluye las versiones fuera de su época; si no hay ninguna que cubra el año
      // se buscan igualmente y se propone la más cercana en años, marcada como aproximada (sin darla por buena).
      if (candidatos.length === 0 && body.anyo) {
        const { anyo: _, ...sinAnyo } = body; candidatos = await doSearch(sinAnyo, ctrl.signal);
      }
      if (ctrl.signal.aborted) return;
      // Las plazas del estudio pueden estar mal: si con ellas no sale nada, se busca sin ese dato
      if (candidatos.length === 0 && body.plazas) {
        const { plazas: _pz, ...sinPlazas } = body;
        candidatos = await doSearch(sinPlazas, ctrl.signal);
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

      // Primero las versiones que cubren el año del vehículo; las de otra época van detrás, de la más cercana a la más lejana
      const vs = ventanasRef.current;
      const top = candidatos
        .map((c, k) => ({ c, k, fuera: cubreAnio(c, anioV, vs) === false ? 1 : 0, d: distanciaAnios(c, anioV, vs) }))
        .sort((a, b) => a.fuera - b.fuera || (a.fuera ? a.d - b.d : 0) || a.k - b.k)
        .map(x => x.c)
        .slice(0, 8);

      if (top.length === 1 && cubreAnio(top[0], anioV, vs) !== false) {
        setVehicles(prev => {
          const n = [...prev];
          n[i] = { ...n[i], candidatos: top, searching: false };
          return n;
        });
        setTimeout(() => handleSelect(i, top[0]), 0);
      } else if (!isRem && anioV && top.length > 0 && top.every(c => cubreAnio(c, anioV, vs) === false)) {
        // Ninguna versión cubre el año: se propone la más cercana, marcada como aproximada (queda en «Revisar»)
        setVehicles(prev => {
          const n = [...prev];
          n[i] = { ...n[i], candidatos: top, seleccionado: top[0], status: 'listo', aproximada: true, searching: false };
          return n;
        });
        pendingNotifyRef.current = true;
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
  }, [vehicles, setV, doSearch, handleSelect]);

  // Auto-buscar al montar y cuando se añaden vehículos nuevos, máx 8 concurrentes
  useEffect(() => {
    if (vehicles.length === 0 || !ventanasListas) return;
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
  }, [vehicles.length, ventanasListas]);

  // ── Verificación de cada identificación (reglas en core/catalogo/verificacion.ts) ──
  const revisiones = useMemo(() => {
    const out: Record<string, Revision> = {};
    vehicles.forEach(v => {
      if (!v.seleccionado) return;
      const sel = v.seleccionado;
      const w = ventanas[sel.id_veh];
      const hall = revisarIdentificacion(declaradoDe(v), versionDe(sel), w);
      const vi = ventanaAnios(sel);
      const ventana: Revision['ventana'] = w?.fabMin
        ? { min: w.fabMin, max: w.fabMax, origen: 'sistema' }
        : { min: vi.ini, max: vi.fin, origen: vi.ini !== null && vi.fin !== null ? 'catalogo' : 'abierta' };
      const imposible = !!w?.fabMin && hall.some(h => CODIGOS_IMPOSIBLES.has(h.codigo));
      const reg = registro[matLimpia(v.matricula)];
      out[v.matricula] = {
        hall, bloq: bloquea(hall), av: avisos(hall), anio: aniosDe(v).fab, fuente: aniosDe(v).fuente, ventana, imposible,
        confirmada: verifOk[matLimpia(v.matricula)] === sel.id_veh && !imposible,
        por: reg?.por, fecha: reg?.fecha,
      };
    });
    return out;
  }, [vehicles, verifOk, registro, ventanas]);

  const estadoDe = useCallback((v: VehicleEmision): EstadoVis => {
    const r = revisiones[v.matricula];
    return v.status === 'listo' && r && r.bloq.length > 0 && !r.confirmada ? 'revisar' : v.status;
  }, [revisiones]);

  // Avisar al padre (EMISIÓN lee esto) solo cuando cambia de verdad
  const ultimaVerifRef = useRef('');
  useEffect(() => {
    if (!onVerificacionChange) return;
    const info: Record<string, InfoVerificacion> = {};
    vehicles.forEach(v => {
      const r = revisiones[v.matricula];
      if (!r || !v.matricula) return;
      const an = aniosDe(v);
      info[matLimpia(v.matricula)] = {
        bloquea: r.bloq.map(h => h.texto), avisos: r.av.map(h => h.texto), confirmada: r.confirmada, anio: r.anio,
        anioFab: an.fab, anioMat: an.mat, fuenteAnio: an.fuente, ventana: r.ventana,
        confirmadaPor: r.confirmada ? r.por : undefined, confirmadaFecha: r.confirmada ? r.fecha : undefined,
      };
    });
    const firma = JSON.stringify([info, verifOk, registro]);
    if (firma === ultimaVerifRef.current) return;
    ultimaVerifRef.current = firma;
    onVerificacionChange(info, verifOk, registro);
  }, [vehicles, revisiones, verifOk, registro, onVerificacionChange]);

  // «Dar por bueno»: queda registrado quién y cuándo. No se puede si el sistema rechazará seguro el año.
  const darPorBuenoVarios = useCallback((lista: VehicleEmision[]) => {
    const ahora = new Date().toISOString(), por = usuarioActual();
    const ok: Record<string, string> = {}, reg: Record<string, { por: string; fecha: string }> = {};
    lista.forEach(v => {
      const r = revisiones[v.matricula];
      if (!v.seleccionado || !r || r.imposible) return;
      ok[matLimpia(v.matricula)] = v.seleccionado.id_veh;
      reg[matLimpia(v.matricula)] = { por, fecha: ahora };
    });
    if (Object.keys(ok).length === 0) return;
    setVerifOk(prev => ({ ...prev, ...ok }));
    setRegistro(prev => ({ ...prev, ...reg }));
    pendingNotifyRef.current = true;
  }, [revisiones]);
  const darPorBueno = useCallback((v: VehicleEmision) => darPorBuenoVarios([v]), [darPorBuenoVarios]);
  const quitarConfirmacion = useCallback((v: VehicleEmision) => {
    setVerifOk(prev => { const n = { ...prev }; delete n[matLimpia(v.matricula)]; return n; });
    setRegistro(prev => { const n = { ...prev }; delete n[matLimpia(v.matricula)]; return n; });
    pendingNotifyRef.current = true;
  }, []);

  // Notificar selecciones al padre
  useEffect(() => {
    if (!pendingNotifyRef.current) return;
    pendingNotifyRef.current = false;
    const sel: Record<string, string> = {};
    vehicles.forEach(v => { if (v.seleccionado && v.matricula) sel[v.matricula] = v.seleccionado.id_veh; });
    cargandoRef.current.forEach(mat => { if (initialSeleccion?.[mat] && !sel[mat]) sel[mat] = initialSeleccion[mat]; });
    onCatalogoChange?.(sel);
    onVehiclesUpdate?.(vehicles.map(v => ({
      matricula:   v.matricula,
      marca:       v.marca,
      modelo:      v.modelo,
      tipo:        v.tipo,
      id_catalogo: v.seleccionado?.id_veh ?? '',
      version:     v.seleccionado?.version ?? '',
      anyo:        anioVehiculo(v) ?? 0,
      combustible: v.seleccionado?.combustible ?? '',
      kw:          v.seleccionado?.kw ?? 0,
      cv:          v.seleccionado?.cv ?? 0,
      tara:        v.seleccionado?.tara ?? 0,
      plazas:      v.seleccionado?.plazas ?? 0,
      status:      v.status,
      revision:    etiquetaRevision(revisiones[v.matricula]),
      motivos:     (revisiones[v.matricula]?.hall ?? []).map(h => h.texto).join(' | '),
    })));
  }, [vehicles, revisiones, onCatalogoChange, onVehiclesUpdate, initialSeleccion]);

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
    const COLS = ['MATRICULA', 'MARCA', 'MODELO', 'TIPO', 'VERSION', 'AÑO', 'COMBUSTIBLE', 'KW', 'CV', 'TARA', 'PLAZAS', 'ID', 'REVISION', 'MOTIVOS'];
    const COL_WIDTHS: Record<string, number> = { MATRICULA: 14, MARCA: 14, MODELO: 14, TIPO: 16, VERSION: 36, AÑO: 8, COMBUSTIBLE: 12, KW: 8, CV: 8, TARA: 10, PLAZAS: 8, ID: 16, REVISION: 16, MOTIVOS: 60 };
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
      const rv = revisiones[v.matricula];
      const r = ws.addRow([
        matLimpia(v.matricula),
        v.seleccionado!.marca,
        v.seleccionado!.modelo ?? v.modelo,
        v.tipo,
        v.seleccionado!.version,
        anioVehiculo(v) ?? '',
        FUEL_LABEL[v.seleccionado!.combustible] ?? v.seleccionado!.combustible,
        v.seleccionado!.kw || '',
        v.seleccionado!.cv || '',
        v.seleccionado!.tara || '',
        v.seleccionado!.plazas || '',
        v.seleccionado!.id_veh,
        etiquetaRevision(rv) || 'Correcta',
        rv ? rv.hall.map(h => h.texto).join(' | ') : '',
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
  }, [vehicles, revisiones]);

  const handleClearSelection = useCallback((i: number) => {
    setVehicles(prev => {
      const n = [...prev];
      n[i] = { ...n[i], seleccionado: null, aproximada: false, status: n[i].candidatos.length > 0 ? 'pendiente' : 'sin_catalogo' };
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
  const [flt, setFlt]   = useState<'all' | EstadoVis>('all');
  const [shown, setShown] = useState(15);
  const PAGE = 15;

  const visibles = useMemo(() => {
    const nq = q.trim().toUpperCase().replace(/[\s-]/g, '');
    return displayVehicles.filter(v =>
      (flt === 'all' || estadoDe(v) === flt) &&
      (!nq || `${v.matricula} ${v.marca} ${v.modelo}`.toUpperCase().replace(/[\s-]/g, '').includes(nq)),
    );
  }, [displayVehicles, q, flt, estadoDe]);
  const filas = visibles.slice(0, shown);

  const nRev  = vehicles.filter(v => estadoDe(v) === 'revisar').length;
  const nAsig = vehicles.filter(v => estadoDe(v) === 'listo').length;
  const nPend = vehicles.filter(v => v.status === 'pendiente').length;
  const nSin  = vehicles.filter(v => v.status === 'sin_catalogo').length;
  const idsDistintos = new Set(vehicles.filter(v => v.seleccionado).map(v => v.seleccionado!.id_veh)).size;
  const hayBuscando = vehicles.some(v => v.searching);

  const buscarPendientes = () => {
    vehicles.forEach((v, i) => { if (!v.seleccionado && !v.searching) handleSearch(i); });
  };
  const allVisibleChecked = visibles.length > 0 && visibles.every(v => checkedRows.has(vehicles.indexOf(v)));

  const kpi = (label: string, n: number, f: 'all' | EstadoVis | null) => (
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
              {kpi('Asignados', nAsig, 'listo')}
              {kpi('A revisar', nRev, 'revisar')}
              {kpi('Pendientes de elegir', nPend, 'pendiente')}
              {kpi('Sin catálogo', nSin, 'sin_catalogo')}
              {kpi('IDs distintos', idsDistintos, null)}
            </div>

            <div className="idtool">
              <input className="search" type="search" placeholder="Buscar matrícula, marca o modelo" aria-label="Buscar vehículo"
                value={q} onChange={e => { setQ(e.target.value); setShown(15); }} autoComplete="off" />
              <select className="select" aria-label="Filtrar por estado" value={flt}
                onChange={e => { setFlt(e.target.value as 'all' | EstadoVis); setShown(15); }}>
                <option value="all">Todos los estados</option>
                <option value="listo">Asignados</option>
                <option value="revisar">A revisar</option>
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
                  {(() => {
                    const aConfirmar = [...checkedRows].map(i => vehicles[i]).filter(v => { const r = v && revisiones[v.matricula]; return r && r.bloq.length > 0 && !r.confirmada && !r.imposible; });
                    return aConfirmar.length > 0 && (
                      <button className="mini" title="Da por buena la identificación de los seleccionados que tienen discrepancias graves. Queda registrado quién y cuándo."
                        onClick={() => { if (window.confirm(`¿Dar por buena la identificación de ${aConfirmar.length} vehículo${aConfirmar.length > 1 ? 's' : ''} con discrepancias graves? Quedará registrado con tu usuario y la fecha.`)) darPorBuenoVarios(aConfirmar); }}>
                        Dar por bueno ({nf(aConfirmar.length)})
                      </button>
                    );
                  })()}
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
                    const an = aniosDe(v);
                    const yearShown = an.fab;
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
                          <td>{matLimpia(v.matricula)}</td>
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
                            <input value={yearShown ?? ''} inputMode="numeric" placeholder="—" aria-label={`Año de fabricación de ${v.matricula}`}
                              title={an.fuente ? `Año de fabricación (${ETIQUETA_FUENTE[an.fuente]}). Edita y pulsa Enter para volver a buscar` : 'Introduce el año de fabricación y pulsa Enter'}
                              onChange={e => {
                                const val = e.target.value.trim();
                                // se escribe el de fabricación; el de matriculación solo se toca si no hay fecha real de Silverdat
                                setV(origIdx, { anyo_fabricacion: val, anyo_fab_fuente: val ? 'manual' : '', ...(v.fecha_matriculacion ? {} : { anyo_matricula: val }) });
                              }}
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSearch(origIdx); } }} />
                            {an.fuente && an.fuente !== 'fabricacion' && (
                              <small style={{ display: 'block', fontSize: 10, color: an.fuente === 'estimado' ? 'var(--warn, #b45309)' : 'var(--quiet)', lineHeight: 1.2 }}>{ETIQUETA_FUENTE[an.fuente]}</small>
                            )}
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
                                    <option key={c.id_veh} value={c.id_veh}>{c.version}{c.score ? ` · ${nf(c.score)} %` : ''}{cubreAnio(c, anioVehiculo(v), ventanas) === false ? ' · fuera de año' : ''}</option>
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
                            <StatusChip status={estadoDe(v)} />
                            {revisiones[v.matricula] && revisiones[v.matricula].hall.length > 0 && (
                              <button type="button" className="xlink" onClick={() => setRevAbierta(origIdx)}
                                aria-label={`Ver motivos de ${matLimpia(v.matricula)}`}>
                                {revisiones[v.matricula].confirmada ? 'Dado por bueno' : `${nf(revisiones[v.matricula].hall.length)} ${revisiones[v.matricula].hall.length === 1 ? 'motivo' : 'motivos'}`}
                              </button>
                            )}
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
                Si hay coincidencias eliges el acabado; si no, pulsa Buscar. Cada versión asignada se comprueba contra el estudio (año, modelo, tipología, potencia y plazas): si hay una discrepancia grave el vehículo queda «A revisar» y no se emite hasta que elijas otra versión o lo des por bueno. El mismo ID solo se aplica a vehículos idénticos (marca, modelo, kW y tipo) de la misma época. Edita el ID o el año y pulsa Enter para volver a buscar.
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

      {/* ── Revisión de la identificación ─────────────────────────────────────── */}
      <DetailDrawer isOpen={revAbierta !== null} onClose={() => setRevAbierta(null)} data={null}>
        {revAbierta !== null && vehicles[revAbierta]?.seleccionado && (() => {
          const v = vehicles[revAbierta];
          const sel = v.seleccionado!;
          const r = revisiones[v.matricula];
          const d = declaradoDe(v);
          const fila = (k: string, a: string, b: string) => (
            <div className="vrow" key={k}><label>{k}</label><span>{a || '—'}</span><span>{b || '—'}</span></div>
          );
          return (
            <div className="cfgdr vrf">
              <div className="over">Revisión de la identificación</div>
              <h3>{matLimpia(v.matricula)}</h3>
              <p className="desc">
                {r.imposible
                  ? `El sistema de emisión solo admite esta versión para fabricaciones de ${r.ventana.min} a ${r.ventana.max}: rechazará este vehículo. Corrige el año o elige otra versión.`
                  : r.bloq.length > 0 && !r.confirmada
                  ? 'Hay discrepancias graves entre el estudio y la versión elegida. No se emitirá este vehículo hasta que elijas otra versión o lo des por bueno.'
                  : r.confirmada ? `Esta identificación se dio por buena a pesar de las discrepancias${r.por ? ` · ${r.por}` : ''}${fechaCorta(r.fecha) ? `, el ${fechaCorta(r.fecha)}` : ''}.`
                  : 'La versión es coherente con el estudio; solo hay avisos menores.'}
              </p>

              <h4>Estudio frente a catálogo</h4>
              <div className="vrow vh"><label /><span>Estudio</span><span>Catálogo</span></div>
              {fila('Marca', (v.marca || '').trim(), sel.marca)}
              {fila('Modelo', (v.modelo || '').trim(), [sel.modelo, sel.version].filter(Boolean).join(' · '))}
              {fila('Tipología', v.tipo, sel.tipo ? (TIPO_INFO[sel.tipo as TipoKey]?.label ?? sel.tipo) : '')}
              {fila('Año de fabricación', r.anio ? `${r.anio}${r.fuente ? ` · ${ETIQUETA_FUENTE[r.fuente]}` : ''}` : '', textoVentana(r.ventana))}
              {fila('Potencia', d.kw ? `${nf(Math.round(d.kw))} kW` : '', sel.kw ? `${nf(Math.round(sel.kw))} kW` : '')}
              {fila('Plazas', d.plazas ? nf(d.plazas) : '', sel.plazas ? ((sel.plazasMin && sel.plazasMin !== sel.plazas) ? `${nf(sel.plazasMin)} a ${nf(sel.plazas)}` : nf(sel.plazas)) : '')}
              {fila('ID de catálogo', '', sel.id_veh)}

              <h4>Motivos</h4>
              <ul className="cfwarn">
                {r.hall.map((h, k) => <li key={k}><b>{h.gravedad === 'bloquea' ? 'Grave · ' : 'Aviso · '}</b>{h.texto}</li>)}
              </ul>

              <div className="dacts">
                <button type="button" className="mini pri" onClick={() => { handleClearSelection(revAbierta); setOpenSearchRow(revAbierta); setRevAbierta(null); }}>Buscar otra versión</button>
                {r.bloq.length > 0 && !r.confirmada && !r.imposible && (
                  <button type="button" className="mini" onClick={() => { darPorBueno(v); setRevAbierta(null); }}>Dar por bueno</button>
                )}
                {r.bloq.length > 0 && !r.confirmada && !r.imposible && (() => {
                  const iguales = vehicles.filter(x => x !== v && x.seleccionado?.id_veh === sel.id_veh && strictKey(x) === strictKey(v)
                    && (revisiones[x.matricula]?.bloq.length ?? 0) > 0 && !revisiones[x.matricula]?.confirmada && !revisiones[x.matricula]?.imposible);
                  return iguales.length > 0 && (
                    <button type="button" className="mini" onClick={() => { darPorBuenoVarios([v, ...iguales]); setRevAbierta(null); }}>
                      Dar por bueno a los {nf(iguales.length + 1)} iguales
                    </button>
                  );
                })()}
                {r.confirmada && (
                  <button type="button" className="mini" onClick={() => quitarConfirmacion(v)}>Quitar confirmación</button>
                )}
              </div>
            </div>
          );
        })()}
      </DetailDrawer>

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
