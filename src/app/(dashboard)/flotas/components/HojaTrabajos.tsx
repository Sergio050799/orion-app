"use client";

import React, { useState, useCallback, useRef, forwardRef, useImperativeHandle, useMemo } from 'react';
import { ANYO_MATRICULA_DEF, POLIZA_SINCO_DEF } from './constants';
import {
  contarVehiculos, filtrarFilasReales, detectarClaveFlota,
  normalizarPoliza, normalizarPolizaConClave,
} from '@/core/flotas';
import type { ClaveFlotaGrupo } from '@/core/flotas';
import type { FlotaGridHandle } from './types';
import { DetailDrawer } from '@/components/saas/DetailDrawer';

// ─── Silverdat types ─────────────────────────────────────────────────────────

interface SilverdatVehicle {
  matricula: string;
  vin?: string; marca?: string; modelo?: string; version?: string; variante?: string;
  combustible?: string; kw?: number; cv?: number; cilindrada?: number;
  plazas?: number; puertas?: number; anyo_fabricacion?: string;
  fecha_matriculacion?: string; tara?: number; tipo_vehiculo?: string;
  etiqueta_dgt?: string; co2?: number; euro?: string; tipo_cambio?: string;
  color?: string; kilometraje?: number; precio_nuevo?: number;
  precio_nuevo_total?: number; valor_venta?: number; valor_compra?: number;
  num_titulares?: number; servicio?: string; tipo_alimentacion?: string;
  renting?: string; distancia_ejes?: number; raw_mat?: unknown;
}

interface SilverdatResult { matricula: string; ok: boolean; vehicle?: SilverdatVehicle; error?: string; debug?: string; }
interface Mismatch { matricula: string; campo: string; excel: string; silverdat: string; }

// ─── Silverdat credential modal ──────────────────────────────────────────────

function SilverdatLoginModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [datId, setDatId] = useState('');
  const [user, setUser]   = useState('');
  const [pass, setPass]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const handleLogin = async () => {
    if (!datId.trim() || !user.trim() || !pass.trim()) return;
    setLoading(true); setError('');
    try {
      const res  = await fetch('/api/silverdat/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ datId: datId.trim(), user: user.trim(), pass: pass.trim() }) });
      const data = await res.json();
      if (data.ok) onSuccess();
      else setError((data.error || 'Error de autenticación') + (data.debug ? `\n\nDEBUG: ${data.debug}` : ''));
    } catch { setError('Error de conexión'); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 380, padding: 28, borderRadius: 18, background: 'rgba(8,22,72,0.97)', border: '1px solid rgba(51,102,255,0.25)', boxShadow: '0 30px 80px rgba(0,0,0,0.7)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#f59e0b,#d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>S</div>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, color: '#fff', fontWeight: 700 }}>Silverdat</h2>
            <p style={{ margin: 0, fontSize: 11, color: 'rgba(178,198,245,0.6)' }}>Credenciales DAT / fastVALUATE</p>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(['DAT N. Cliente', 'Usuario'] as const).map((ph, i) => (
            <input key={i} autoFocus={i === 0} placeholder={ph} value={i === 0 ? datId : user}
              onChange={e => i === 0 ? setDatId(e.target.value) : setUser(e.target.value)}
              className="orion-input" style={{ fontSize: 13 }}
              onKeyDown={e => { if (e.key === 'Enter') handleLogin(); }} />
          ))}
          <input placeholder="Contraseña" type="password" value={pass} onChange={e => setPass(e.target.value)}
            className="orion-input" style={{ fontSize: 13 }} onKeyDown={e => { if (e.key === 'Enter') handleLogin(); }} />
        </div>
        {error && <pre style={{ margin: '10px 0 0', fontSize: 11, color: '#ef4444', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 120, overflow: 'auto', background: 'rgba(239,68,68,0.06)', padding: 8, borderRadius: 8 }}>{error}</pre>}
        <p style={{ margin: '12px 0', fontSize: 10, color: 'rgba(178,198,245,0.42)', lineHeight: 1.4 }}>Las credenciales NO se guardan. Se usan solo para esta sesión.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleLogin} disabled={loading || !datId.trim() || !user.trim() || !pass.trim()} style={{ flex: 1, fontSize: 12, fontWeight: 700, padding: '10px 0', borderRadius: 10, background: loading ? 'rgba(18,64,204,0.3)' : 'linear-gradient(135deg,#d97706,#f59e0b)', color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Conectando...' : 'Iniciar sesión'}
          </button>
          <button onClick={onClose} style={{ fontSize: 12, padding: '10px 16px', borderRadius: 10, background: 'transparent', color: 'var(--sub)', border: '1px solid var(--line)', cursor: 'pointer' }}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Silverdat report ────────────────────────────────────────────────────────

function SilverdatReport({ mismatches, enriched, noData, total, vehicles, onClose }: { mismatches: Mismatch[]; enriched: number; noData: string[]; total: number; vehicles: SilverdatVehicle[]; onClose: () => void }) {
  const fields: [string, (v: SilverdatVehicle) => unknown][] = [
    ['Marca', v => v.marca], ['Modelo', v => v.modelo], ['Tipo veh.', v => v.tipo_vehiculo],
    ['kW', v => v.kw], ['CV', v => v.cv], ['Combustible', v => v.combustible],
    ['Cilindrada', v => v.cilindrada], ['Etiqueta', v => v.etiqueta_dgt],
    ['Fecha mat.', v => v.fecha_matriculacion], ['VIN', v => v.vin],
  ];
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 600, maxHeight: '85vh', overflow: 'auto', padding: 28, borderRadius: 18, background: 'rgba(8,22,72,0.97)', border: '1px solid rgba(51,102,255,0.25)', boxShadow: '0 30px 80px rgba(0,0,0,0.7)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: '0 0 4px', fontSize: 16, color: '#fff', fontWeight: 700 }}>Resultado Silverdat</h2>
            <p style={{ margin: 0, fontSize: 12, color: 'rgba(178,198,245,0.6)' }}>{total} consultadas · {enriched} enriquecidas · {noData.length} sin datos · {mismatches.length} discrepancias</p>
          </div>
        </div>
        {vehicles.map(sv => (
          <div key={sv.matricula} style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 10, background: 'rgba(61,112,255,0.10)', border: '1px solid rgba(51,102,255,0.15)' }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#3366FF', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>{sv.matricula} — {sv.marca} {sv.modelo}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px', fontSize: 11 }}>
              {fields.map(([k, fn]) => { const val = fn(sv); if (val == null) return null; return <div key={k}><span style={{ color: 'rgba(178,198,245,0.6)' }}>{k}: </span><span style={{ color: '#BDD4FF', fontWeight: 600 }}>{String(val)}</span></div>; })}
            </div>
          </div>
        ))}
        {mismatches.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Discrepancias</p>
            {mismatches.map((m, i) => <div key={i} style={{ padding: '6px 10px', borderRadius: 8, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', fontSize: 11, color: '#fbbf24', marginBottom: 4 }}><b>{m.matricula}</b> — {m.campo}: <span style={{ color: '#BDD4FF' }}>{m.excel}</span> vs <span style={{ color: '#f59e0b' }}>{m.silverdat}</span></div>)}
          </div>
        )}
        {noData.length > 0 && <p style={{ fontSize: 11, color: 'rgba(178,198,245,0.6)', marginBottom: 12 }}>Sin datos: {noData.join(', ')}</p>}
        <button onClick={onClose} style={{ width: '100%', fontSize: 12, fontWeight: 600, padding: '10px 0', borderRadius: 10, background: 'linear-gradient(135deg,#1240CC,#3366FF)', color: '#fff', border: 'none', cursor: 'pointer', marginTop: 8 }}>Cerrar</button>
      </div>
    </div>
  );
}

// ─── Columnas tabla TRABAJO ──────────────────────────────────────────────────

type TrabCol = { key: string; label: string; n?: boolean; fx?: boolean; compute?: (row: Record<string, string>) => string };

const TRAB_COLS: TrabCol[] = [
  { key: 'matricula',              label: 'Matrícula' },
  { key: 'num_poliza_actual',      label: 'Nº póliza actual' },
  { key: 'poliza_sinco',           label: 'Nº póliza SINCO', fx: true,
    compute: row => POLIZA_SINCO_DEF.computeFn!(row) },
  { key: 'anyo_matricula',         label: 'Año matr.', fx: true, n: true,
    compute: row => row['anyo_matricula'] || ANYO_MATRICULA_DEF.computeFn!(row) || '—' },
  { key: 'tipo_vehiculo',          label: 'Tipo' },
  { key: 'uso',                    label: 'Uso' },
  { key: 'marca',                  label: 'Marca' },
  { key: 'modelo',                 label: 'Modelo' },
  { key: 'kw',                     label: 'kW', n: true },
  { key: 'cv',                     label: 'CV', fx: true, n: true,
    compute: row => { const kw = parseFloat(row['kw'] || ''); return isNaN(kw) ? '—' : String(Math.round(kw * 1.35962)); } },
  { key: 'ambito',                 label: 'Ámbito' },
  { key: 'coberturas_solicitadas', label: 'Cobertura' },
  { key: 'frq',                    label: 'Franq.', n: true },
];

// ─── HojaTrabajos ────────────────────────────────────────────────────────────

interface Props {
  getOriginalSnapshot: () => Record<string, string>[] | null;
  onDataChange?: (data: Record<string, string>[]) => void;
  initialData?: Record<string, string>[];
}

const HojaTrabajos = forwardRef<FlotaGridHandle, Props>(function HojaTrabajos(
  { getOriginalSnapshot, onDataChange, initialData },
  ref,
) {
  const [rows, setRowsState] = useState<Record<string, string>[]>(() => initialData ?? []);
  const [confirmPending,    setConfirmPending]    = useState(false);
  const [claveGrupos,       setClaveGrupos]       = useState<ClaveFlotaGrupo[]>([]);
  const [polizaResolucion,  setPolizaResolucion]  = useState<'none' | 'ultimos5' | 'clave'>('none');
  const [uploadDrawerOpen,  setUploadDrawerOpen]  = useState(false);
  const [correctionParseError, setCorrectionParseError] = useState('');
  const [showLogin,         setShowLogin]         = useState(false);
  const [silverdatLoading,  setSilverdatLoading]  = useState(false);
  const [silverdatProgress, setSilverdatProgress] = useState('');
  const [silverdatReport,   setSilverdatReport]   = useState<{ mismatches: Mismatch[]; enriched: number; noData: string[]; total: number; vehicles: SilverdatVehicle[] } | null>(null);

  const prevClaveKeyRef   = useRef('');
  const silverdatPendingRef = useRef(false);
  const silverdatStopRef  = useRef(false);
  const correctionFileRef = useRef<HTMLInputElement>(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const setRows = useCallback((d: Record<string, string>[]) => {
    setRowsState(d);
    onDataChange?.(d);
  }, [onDataChange]);

  useImperativeHandle(ref, () => ({
    getData:    () => rowsRef.current,
    setData:    (d) => setRowsState(d),
    toRows:     () => rowsRef.current,
    getColDefs: () => [],
  }), []);

  const vehicleCount = useMemo(() => {
    const mats = rows.map(r => r['matricula'] ?? '').filter(v => v.trim());
    return contarVehiculos(mats);
  }, [rows]);

  const visibleRows = useMemo(() => rows.filter(r => (r['matricula'] ?? '').trim()), [rows]);

  const tipologias = useMemo(() => new Set(visibleRows.map(r => r['tipo_vehiculo']).filter(Boolean)).size, [visibleRows]);

  const conPolizaSinco = useMemo(() => visibleRows.filter(r => (r['num_poliza_actual'] ?? '').trim()).length, [visibleRows]);

  const runClaveDetection = useCallback((data: Record<string, string>[]) => {
    const polizas = data.map(r => r['num_poliza_actual'] ?? '').filter(Boolean);
    const grupos  = detectarClaveFlota(polizas);
    const key     = grupos.map(g => g.prefijo).sort().join(',');
    if (key !== prevClaveKeyRef.current) {
      prevClaveKeyRef.current = key;
      setClaveGrupos(grupos);
    }
    if (grupos.length > 0) setPolizaResolucion('none');
  }, []);

  const doImport = useCallback(() => {
    const raw = getOriginalSnapshot();
    if (!raw) return;
    const data = filtrarFilasReales(raw);
    if (data.length === 0) return;
    setRows(data);
    setConfirmPending(false);
    runClaveDetection(data);
  }, [getOriginalSnapshot, setRows, runClaveDetection]);

  const handleCopy = useCallback(() => {
    const hasData = visibleRows.length > 0;
    if (hasData) setConfirmPending(true);
    else doImport();
  }, [visibleRows.length, doImport]);

  const handleApplyPolizaOverride = useCallback((modo: 'ultimos5' | 'clave') => {
    if (modo === 'ultimos5') { setPolizaResolucion('ultimos5'); return; }
    const updated = rows.map(row => {
      const polizaRaw = (row['num_poliza_actual'] ?? '').trim();
      if (!polizaRaw) return row;
      const digits = polizaRaw.replace(/[\s\-\.\/]/g, '').replace(/\D/g, '');
      const grupo  = claveGrupos.find(g => digits.startsWith(g.prefijo));
      const override = grupo
        ? normalizarPolizaConClave(polizaRaw, grupo.prefijo)
        : normalizarPoliza(polizaRaw);
      return { ...row, poliza_sinco_override: override };
    });
    setRows(updated);
    setPolizaResolucion('clave');
  }, [rows, claveGrupos, setRows]);

  const handleUndoPolizaOverride = useCallback(() => {
    const updated = rows.map(({ poliza_sinco_override: _, ...rest }) => rest);
    setRows(updated);
    setPolizaResolucion('none');
  }, [rows, setRows]);

  // ─── Silverdat ───────────────────────────────────────────────────────────────

  const applyVehicleToRows = useCallback((
    currentRows: Record<string, string>[],
    sv: SilverdatVehicle,
    mismatches: Mismatch[],
  ): { rows: Record<string, string>[]; enriched: boolean } => {
    let enriched = false;
    const newRows = currentRows.map(row => {
      const mat = (row['matricula'] ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      if (mat !== sv.matricula) return row;
      const updated = { ...row };
      let rowEnriched = false;
      const fill = (excelKey: string, svValue: string | number | undefined, label: string) => {
        if (svValue === undefined || svValue === null || svValue === '') return;
        const svStr    = String(svValue);
        const excelVal = (row[excelKey] ?? '').trim();
        if (!excelVal) { updated[excelKey] = svStr; rowEnriched = true; }
        else if (excelVal.toUpperCase() !== svStr.toUpperCase()) {
          const nE = parseFloat(excelVal), nS = parseFloat(svStr);
          if (!isNaN(nE) && !isNaN(nS) && Math.abs(nE - nS) / Math.max(nE, nS) < 0.05) return;
          mismatches.push({ matricula: mat, campo: label, excel: excelVal, silverdat: svStr });
        }
      };
      fill('marca', sv.marca, 'Marca'); fill('modelo', sv.modelo, 'Modelo');
      fill('tipo_vehiculo', sv.tipo_vehiculo, 'Tipo vehículo'); fill('kw', sv.kw, 'kW');
      fill('tn', sv.tara ? (sv.tara / 1000).toFixed(3) : undefined, 'Tara (Tn)');
      fill('combustible', sv.combustible, 'Combustible'); fill('cilindrada', sv.cilindrada, 'Cilindrada');
      fill('plazas', sv.plazas, 'Plazas'); fill('puertas', sv.puertas, 'Puertas');
      fill('cv', sv.cv, 'CV'); fill('version', sv.version, 'Versión');
      fill('variante', sv.variante, 'Variante'); fill('vin', sv.vin, 'VIN');
      fill('anyo_fabricacion', sv.anyo_fabricacion, 'Año fabricación');
      fill('fecha_matriculacion', sv.fecha_matriculacion, 'Fecha matriculación');
      fill('etiqueta_dgt', sv.etiqueta_dgt, 'Etiqueta DGT');
      fill('tipo_cambio', sv.tipo_cambio, 'Tipo cambio'); fill('kilometraje', sv.kilometraje, 'Kilometraje');
      fill('co2', sv.co2, 'CO2'); fill('euro', sv.euro, 'Euro');
      fill('precio_nuevo', sv.precio_nuevo, 'Precio nuevo'); fill('precio_nuevo_total', sv.precio_nuevo_total, 'Precio nuevo total');
      fill('valor_venta', sv.valor_venta, 'Valor venta'); fill('valor_compra', sv.valor_compra, 'Valor compra');
      fill('servicio', sv.servicio, 'Servicio'); fill('renting', sv.renting, 'Renting');
      fill('num_titulares', sv.num_titulares, 'Nº titulares');
      fill('tipo_alimentacion', sv.tipo_alimentacion, 'Tipo alimentación');
      fill('distancia_ejes', sv.distancia_ejes, 'Distancia ejes');
      if (sv.servicio && !(row['uso'] ?? '').trim()) {
        const svc = sv.servicio.toLowerCase();
        if (svc.startsWith('particular')) updated['uso'] = 'Particular';
        else if (svc.startsWith('públ') || svc.startsWith('publ')) updated['uso'] = 'Servicio público';
        else if (svc.includes('propios')) updated['uso'] = 'Transportes propios';
        else updated['uso'] = sv.servicio;
        rowEnriched = true;
      }
      if (rowEnriched) enriched = true;
      return updated;
    });
    return { rows: newRows, enriched };
  }, []);

  const runSilverdatEnrich = useCallback(async () => {
    const currentRows = rowsRef.current;
    const filtered    = currentRows.filter(r => (r['matricula'] ?? '').trim());
    if (filtered.length === 0) { setSilverdatProgress('No hay matrículas en la hoja'); setTimeout(() => setSilverdatProgress(''), 3000); return; }
    const matriculas  = filtered.map(r => r['matricula'].replace(/[^a-zA-Z0-9]/g, '').toUpperCase());
    const unique      = [...new Set(matriculas)];
    setSilverdatLoading(true);
    silverdatStopRef.current = false;
    const allVehicles: SilverdatVehicle[] = [];
    const noData: string[] = [];
    const mismatches: Mismatch[] = [];
    let enrichedCount = 0;
    let workRows = [...currentRows];
    for (let i = 0; i < unique.length; i++) {
      if (silverdatStopRef.current) break;
      const mat = unique[i];
      setSilverdatProgress(`${i + 1}/${unique.length} — ${mat}`);
      if (!/^\d{4}[A-Z]{3}$/i.test(mat)) continue;
      try {
        const res = await fetch('/api/silverdat/enrich', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ matriculas: [mat] }) });
        if (res.status === 401) { setSilverdatLoading(false); setSilverdatProgress(''); setShowLogin(true); silverdatPendingRef.current = true; return; }
        const json = await res.json();
        const r    = json.results?.[0] as SilverdatResult | undefined;
        if (r?.ok && r.vehicle) {
          allVehicles.push(r.vehicle);
          const { rows: newWorkRows, enriched } = applyVehicleToRows(workRows, r.vehicle, mismatches);
          workRows = newWorkRows;
          if (enriched) enrichedCount++;
        } else { noData.push(mat); }
      } catch { noData.push(mat); }
    }
    setRows(workRows);
    setSilverdatReport({ mismatches, enriched: enrichedCount, noData, total: allVehicles.length + noData.length, vehicles: allVehicles });
    setSilverdatLoading(false);
    setSilverdatProgress('');
  }, [applyVehicleToRows, setRows]);

  const handleSilverdatClick = useCallback(async () => {
    try {
      const check = await fetch('/api/silverdat/login');
      const data  = await check.json();
      if (data.hasSession) runSilverdatEnrich();
      else { silverdatPendingRef.current = true; setShowLogin(true); }
    } catch { silverdatPendingRef.current = true; setShowLogin(true); }
  }, [runSilverdatEnrich]);

  const handleLoginSuccess = useCallback(() => {
    setShowLogin(false);
    if (silverdatPendingRef.current) { silverdatPendingRef.current = false; runSilverdatEnrich(); }
  }, [runSilverdatEnrich]);

  const handleCorrectionFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setCorrectionParseError('');
    try {
      const { parseExcelTemplate } = await import('@/core/flotas');
      const result  = await parseExcelTemplate(file);
      const filtered = filtrarFilasReales(result.rows.length > 0 ? result.rows : []);
      const data    = filtered.length > 0 ? filtered : result.rows;
      setRows(data);
      runClaveDetection(data);
      setUploadDrawerOpen(false);
    } catch { setCorrectionParseError('No se pudo leer el archivo. Asegúrate de que es un Excel válido (.xlsx / .xls).'); }
  };

  return (
    <div className="flex flex-col h-full min-h-0" style={{ overflow: 'hidden' }}>

      {/* ── Cabecera ── */}
      <div className="sh" style={{ flexShrink: 0, padding: '20px 32px', borderBottom: '1px solid var(--line)' }}>
        <div>
          <h2><b>04</b>TRABAJO</h2>
          <p>Datos normalizados desde Original. Solo lectura: descarga, edita y sube para modificar.</p>
        </div>
        <div className="acts">
          <button className="mini" onClick={handleCopy}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
            </svg>
            Copiar de Original
          </button>
          <button className="mini" onClick={() => setUploadDrawerOpen(true)}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Subir Trabajo modificado
          </button>
          {!silverdatLoading ? (
            <button className="mini sd" onClick={handleSilverdatClick}>Añadir datos Silverdat</button>
          ) : (
            <button className="mini" onClick={() => { silverdatStopRef.current = true; }} style={{ color: 'var(--warn)' }}>Detener</button>
          )}
        </div>
      </div>

      {/* ── Avisos inline ── */}
      {correctionParseError && (
        <div style={{ flexShrink: 0, padding: '6px 16px', background: 'rgba(239,68,68,0.07)', borderBottom: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#f87171' }}>{correctionParseError}</span>
          <button onClick={() => setCorrectionParseError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', fontSize: 15 }}>×</button>
        </div>
      )}
      {silverdatProgress && (
        <div style={{ flexShrink: 0, padding: '5px 32px', borderBottom: '1px solid var(--line)', fontSize: 12, fontWeight: 600, color: silverdatStopRef.current ? '#ef4444' : '#d97706' }}>
          Silverdat: {silverdatProgress}
        </div>
      )}
      {confirmPending && (
        <div style={{ flexShrink: 0, padding: '8px 32px', borderBottom: '1px solid rgba(252,211,77,0.3)', background: 'rgba(252,211,77,0.06)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#92400e' }}>¿Sobreescribir los datos actuales de Trabajo?</span>
          <button onClick={doImport} style={{ fontSize: 12, fontWeight: 800, padding: '3px 12px', borderRadius: 6, background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', cursor: 'pointer' }}>Sí, sobreescribir</button>
          <button onClick={() => setConfirmPending(false)} style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: 'transparent', color: 'var(--sub)', border: '1px solid var(--line)', cursor: 'pointer' }}>Cancelar</button>
        </div>
      )}

      {/* ── Banner clave de flota ── */}
      {claveGrupos.length > 0 && polizaResolucion === 'none' && (
        <div style={{ background: 'rgba(252,211,77,0.05)', borderBottom: '1px solid rgba(252,211,77,0.2)', padding: '8px 32px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--warn)' }}>
            Posible clave de flota: {claveGrupos.map(g => `"${g.prefijo}" (${g.afectadas.length} pólizas)`).join(' · ')}
          </span>
          <span style={{ fontSize: 11, color: 'var(--sub)' }}>¿Cómo normalizar Nº póliza SINCO?</span>
          <button onClick={() => handleApplyPolizaOverride('ultimos5')} className="mini">Últimos 5 dígitos</button>
          <button onClick={() => handleApplyPolizaOverride('clave')} className="mini pri">Normalizar con clave de flota</button>
        </div>
      )}
      {claveGrupos.length > 0 && polizaResolucion !== 'none' && (
        <div style={{ background: 'rgba(16,185,129,0.04)', borderBottom: '1px solid rgba(16,185,129,0.15)', padding: '6px 32px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#15803d' }}>
            Póliza SINCO: {polizaResolucion === 'clave' ? 'normalizada con clave de flota' : 'últimos 5 dígitos (por defecto)'}
          </span>
          <button onClick={handleUndoPolizaOverride} className="mini" style={{ marginLeft: 4 }}>Deshacer</button>
        </div>
      )}

      {/* ── Contenido ── */}
      {visibleRows.length > 0 ? (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '20px 32px' }}>
          <div className="lock">
            <b>Solo lectura</b>
            <span>Se calcula desde Original. Para corregir algo, descarga la plantilla de trabajo, edítala y súbela: el cambio llega a SINCO, Informe, Oferta y Pre-emisión, pero Original no se toca.</span>
          </div>

          {/* stat3 KPIs */}
          <div className="stat3">
            <button>
              <label>Total vehículos</label>
              <strong>{vehicleCount}</strong>
            </button>
            <button>
              <label>Con póliza SINCO</label>
              <strong>{conPolizaSinco}</strong>
            </button>
            <button>
              <label>Tipologías</label>
              <strong>{tipologias}</strong>
            </button>
          </div>

          <div className="xwrap">
            <table className="xg">
              <thead>
                <tr>
                  {TRAB_COLS.map(c => (
                    <th key={c.key} className={[c.fx ? 'fx' : '', c.n ? 'n' : ''].filter(Boolean).join(' ')}>
                      {c.label}
                      {c.fx && <i style={{ color: 'var(--blue-2)', marginLeft: 4, fontStyle: 'normal', fontSize: 10 }}>fx</i>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, i) => (
                  <tr key={i}>
                    {TRAB_COLS.map(c => {
                      const val = c.compute ? c.compute(row) : (row[c.key] || '—');
                      return (
                        <td key={c.key} className={[c.fx ? 'fx' : '', c.n ? 'n' : ''].filter(Boolean).join(' ')}>
                          {val}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="xnote">
            <span>Las columnas con <i style={{ color: 'var(--blue-2)', fontStyle: 'normal', fontWeight: 700 }}>fx</i> se calculan solas.</span>
            <span>Mostrando {visibleRows.length} de {visibleRows.length}</span>
          </div>
        </div>
      ) : (
        /* ── Estado vacío ── */
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <div style={{ textAlign: 'center', maxWidth: 400 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--soft)', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="1.8">
                <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
            </div>
            <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', marginBottom: 8, letterSpacing: '-0.01em' }}>
              Trabajo vacío
            </p>
            <p style={{ fontSize: 12, color: 'var(--sub)', marginBottom: 28, lineHeight: 1.5 }}>
              Primero sube la plantilla en Original y usa "Copiar de Original" para normalizar los datos aquí.
            </p>
            <button onClick={handleCopy}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 24px', borderRadius: 8, background: 'var(--blue)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', margin: '0 auto' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
              Copiar de Original
            </button>
          </div>
        </div>
      )}

      <input ref={correctionFileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleCorrectionFile} />

      {/* ── Silverdat modals ── */}
      {showLogin && (
        <SilverdatLoginModal
          onClose={() => { setShowLogin(false); silverdatPendingRef.current = false; }}
          onSuccess={handleLoginSuccess}
        />
      )}
      {silverdatReport && <SilverdatReport {...silverdatReport} onClose={() => setSilverdatReport(null)} />}

      {/* ── Drawer: subir trabajo modificado ── */}
      <DetailDrawer isOpen={uploadDrawerOpen} onClose={() => setUploadDrawerOpen(false)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--blue-2)', marginBottom: 8 }}>
              TRABAJO · MODIFICAR
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800, color: 'var(--text)', letterSpacing: '-.03em' }}>
              Subir Trabajo modificado
            </h3>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--sub)', lineHeight: 1.65 }}>
              Corrige datos de Trabajo sin tocar Original.
            </p>
          </div>

          <div>
            <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--quiet)' }}>
              Qué se recalcula
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[
                { step: 'Original', keep: true },
                { step: 'Trabajo', keep: false },
                { step: 'SINCO', keep: false },
                { step: 'Informe', keep: false },
                { step: 'Oferta', keep: false },
                { step: 'Pre-emisión', keep: false },
              ].map(({ step, keep }) => (
                <span key={step} style={{ padding: '4px 10px', borderRadius: 5, background: keep ? 'rgba(148,163,184,0.08)' : 'rgba(73,137,255,0.1)', border: `1px solid ${keep ? 'rgba(148,163,184,0.2)' : 'rgba(73,137,255,0.25)'}`, fontSize: 12, color: keep ? 'var(--quiet)' : 'var(--blue-2)', fontWeight: 600 }}>
                  {step}{keep ? ' · no cambia' : ''}
                </span>
              ))}
            </div>
          </div>

          <div>
            <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--quiet)' }}>
              Qué se conserva
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {([
                ['Prima solicitada y tipología del paso 02', `${visibleRows.length} vehículos`],
                ['Ajustes de la oferta', 'por cobertura y global'],
                ['Primas MMT y texto editados en el informe', 'se mantienen'],
                ['IDs de catálogo ya asignados', 'si la matrícula no cambia'],
              ] as [string, string][]).map(([label, detail], i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 6, background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.14)', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--sub)' }}>
                    <span style={{ color: '#10b981', fontWeight: 800, flexShrink: 0 }}>✓</span>
                    {label}
                  </div>
                  <b style={{ fontSize: 12, color: 'var(--text)', flexShrink: 0, whiteSpace: 'nowrap' }}>{detail}</b>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => correctionFileRef.current?.click()}
            style={{ padding: '13px 0', borderRadius: 8, background: 'linear-gradient(135deg,#1240CC,#3366FF)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            Seleccionar archivo Excel
          </button>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--quiet)', lineHeight: 1.5 }}>
            Si cambian las matrículas, repite la consulta SINCO.
          </p>
        </div>
      </DetailDrawer>
    </div>
  );
});

export default HojaTrabajos;
