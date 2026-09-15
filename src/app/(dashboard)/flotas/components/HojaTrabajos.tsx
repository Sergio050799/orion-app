"use client";

import React, { lazy, Suspense, useState, useCallback, useRef, forwardRef } from 'react';
const FlotaGrid = lazy(() => import('./FlotaGrid'));
import HeaderBlock from './HeaderBlock';
import { makeTrabajoColDefs } from './constants';
import { contarVehiculos, filtrarFilasReales } from '@/core/flotas';
import type { FlotaGridHandle, FlotaHeader } from './types';

interface Props {
  header: FlotaHeader;
  onHeaderChange: (h: FlotaHeader) => void;
  getOriginalSnapshot: () => Record<string, string>[] | null;
  onDataChange?: (data: Record<string, string>[]) => void;
}

const TRABAJO_COL_DEFS = makeTrabajoColDefs();

// ─── Silverdat types ────────────────────────────────────────────────────────

interface SilverdatVehicle {
  matricula: string;
  vin?: string;
  marca?: string;
  modelo?: string;
  version?: string;
  variante?: string;
  combustible?: string;
  kw?: number;
  cv?: number;
  cilindrada?: number;
  plazas?: number;
  puertas?: number;
  anyo_fabricacion?: string;
  fecha_matriculacion?: string;
  tara?: number;
  tipo_vehiculo?: string;
  etiqueta_dgt?: string;
  co2?: number;
  euro?: string;
  tipo_cambio?: string;
  color?: string;
  kilometraje?: number;
  precio_nuevo?: number;
  precio_nuevo_total?: number;
  valor_venta?: number;
  valor_compra?: number;
  num_titulares?: number;
  servicio?: string;
  tipo_alimentacion?: string;
  renting?: string;
  distancia_ejes?: number;
  raw_mat?: any;
}

interface SilverdatResult {
  matricula: string;
  ok: boolean;
  vehicle?: SilverdatVehicle;
  error?: string;
  debug?: string;
}

interface Mismatch {
  matricula: string;
  campo: string;
  excel: string;
  silverdat: string;
}

// ─── Silverdat credential modal ─────────────────────────────────────────────

function SilverdatLoginModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [datId, setDatId] = useState('');
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!datId.trim() || !user.trim() || !pass.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/silverdat/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datId: datId.trim(), user: user.trim(), pass: pass.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        onSuccess();
      } else {
        setError((data.error || 'Error de autenticación') + (data.debug ? `\n\nDEBUG: ${data.debug}` : ''));
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 380, padding: 28, borderRadius: 18,
        background: 'rgba(8,22,72,0.97)', border: '1px solid rgba(51,102,255,0.25)',
        boxShadow: '0 30px 80px rgba(0,0,0,0.7)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18,
          }}>S</div>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, color: '#FFFFFF', fontWeight: 700 }}>Silverdat</h2>
            <p style={{ margin: 0, fontSize: 11, color: 'rgba(178,198,245,0.6)' }}>Credenciales DAT / fastVALUATE</p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            autoFocus
            placeholder="DAT N. Cliente"
            value={datId} onChange={e => setDatId(e.target.value)}
            className="orion-input" style={{ fontSize: 13 }}
            onKeyDown={e => { if (e.key === 'Enter') handleLogin(); }}
          />
          <input
            placeholder="Usuario"
            value={user} onChange={e => setUser(e.target.value)}
            className="orion-input" style={{ fontSize: 13 }}
            onKeyDown={e => { if (e.key === 'Enter') handleLogin(); }}
          />
          <input
            placeholder="Contraseña"
            type="password"
            value={pass} onChange={e => setPass(e.target.value)}
            className="orion-input" style={{ fontSize: 13 }}
            onKeyDown={e => { if (e.key === 'Enter') handleLogin(); }}
          />
        </div>

        {error && (
          <pre style={{ margin: '10px 0 0', fontSize: 11, color: '#ef4444', fontWeight: 600, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 120, overflow: 'auto', background: 'rgba(239,68,68,0.06)', padding: 8, borderRadius: 8 }}>{error}</pre>
        )}

        <p style={{ margin: '12px 0', fontSize: 10, color: 'rgba(178,198,245,0.42)', lineHeight: 1.4 }}>
          Las credenciales NO se guardan. Se usan solo para esta sesión.
        </p>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleLogin} disabled={loading || !datId.trim() || !user.trim() || !pass.trim()} style={{
            flex: 1, fontSize: 12, fontWeight: 700, padding: '10px 0', borderRadius: 10,
            background: loading ? 'rgba(18,64,204,0.3)' : 'linear-gradient(135deg, #d97706, #f59e0b)',
            color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
          }}>
            {loading ? 'Conectando...' : 'Iniciar sesión'}
          </button>
          <button onClick={onClose} style={{
            fontSize: 12, padding: '10px 16px', borderRadius: 10,
            background: 'rgba(6,14,50,0.5)', color: '#BDD4FF',
            border: '1px solid rgba(61,112,255,0.22)', cursor: 'pointer',
          }}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Silverdat mismatch report ──────────────────────────────────────────────

function SilverdatReport({ mismatches, enriched, noData, total, vehicles, onClose }: {
  mismatches: Mismatch[];
  enriched: number;
  noData: string[];
  total: number;
  vehicles: SilverdatVehicle[];
  onClose: () => void;
}) {
  const fields: [string, (v: SilverdatVehicle) => any][] = [
    ['Marca', v => v.marca], ['Modelo', v => v.modelo], ['Tipo veh.', v => v.tipo_vehiculo],
    ['Version', v => v.version], ['Variante', v => v.variante], ['Combustible', v => v.combustible],
    ['kW', v => v.kw], ['CV', v => v.cv], ['Cilindrada', v => v.cilindrada],
    ['Plazas', v => v.plazas], ['Puertas', v => v.puertas], ['VIN', v => v.vin],
    ['Etiqueta', v => v.etiqueta_dgt], ['Fecha mat.', v => v.fecha_matriculacion],
    ['Año fab.', v => v.anyo_fabricacion], ['CO2', v => v.co2], ['Euro', v => v.euro],
    ['Cambio', v => v.tipo_cambio], ['Km', v => v.kilometraje],
    ['Precio nuevo', v => v.precio_nuevo], ['Precio nuevo tot.', v => v.precio_nuevo_total],
    ['Valor venta', v => v.valor_venta], ['Valor compra', v => v.valor_compra],
    ['Servicio', v => v.servicio], ['Renting', v => v.renting],
    ['Nº titulares', v => v.num_titulares], ['Alimentación', v => v.tipo_alimentacion],
    ['Dist. ejes', v => v.distancia_ejes],
  ];

  const exportCsv = () => {
    const sep = ';';
    const lines: string[] = [];

    // Sección 1: Discrepancias
    if (mismatches.length > 0) {
      lines.push('TIPO;MATRICULA;CAMPO;VALOR EXCEL;VALOR SILVERDAT');
      for (const m of mismatches) {
        lines.push(`DISCREPANCIA${sep}${m.matricula}${sep}${m.campo}${sep}${String(m.excel).replace(/;/g, ',')}${sep}${String(m.silverdat).replace(/;/g, ',')}`);
      }
      lines.push('');
    }

    // Sección 2: Sin datos
    if (noData.length > 0) {
      lines.push('TIPO;MATRICULA;MOTIVO');
      for (const mat of noData) {
        lines.push(`SIN DATOS${sep}${mat}${sep}No encontrado en Silverdat`);
      }
      lines.push('');
    }

    // Sección 3: Datos Silverdat completos
    if (vehicles.length > 0) {
      const headers = ['MATRICULA', ...fields.map(([k]) => k.toUpperCase())];
      lines.push(headers.join(sep));
      for (const sv of vehicles) {
        const row = [sv.matricula, ...fields.map(([, fn]) => String(fn(sv) ?? '').replace(/;/g, ','))];
        lines.push(row.join(sep));
      }
    }

    const bom = '\uFEFF';
    const blob = new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Silverdat_Reporte_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 600, maxHeight: '85vh', overflow: 'auto', padding: 28, borderRadius: 18,
        background: 'rgba(8,22,72,0.97)', border: '1px solid rgba(51,102,255,0.25)',
        boxShadow: '0 30px 80px rgba(0,0,0,0.7)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: '0 0 4px', fontSize: 16, color: '#FFFFFF', fontWeight: 700 }}>
              Resultado Silverdat
            </h2>
            <p style={{ margin: 0, fontSize: 12, color: 'rgba(178,198,245,0.6)' }}>
              {total} consultadas · {enriched} enriquecidas · {noData.length} sin datos · {mismatches.length} discrepancias
            </p>
          </div>
          <button onClick={exportCsv} style={{
            fontSize: 11, fontWeight: 700, padding: '7px 14px', borderRadius: 8,
            background: 'rgba(16,185,129,0.15)', color: '#10b981',
            border: '1px solid rgba(16,185,129,0.3)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Exportar CSV
          </button>
        </div>

        {/* All vehicles data */}
        {vehicles.map((sv) => (
          <div key={sv.matricula} style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 10, background: 'rgba(61,112,255,0.10)', border: '1px solid rgba(51,102,255,0.15)' }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#3366FF', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>
              {sv.matricula} — {sv.marca} {sv.modelo}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px', fontSize: 11 }}>
              {fields.map(([k, fn]) => {
                const val = fn(sv);
                if (val === undefined || val === null) return null;
                return (
                  <div key={k}>
                    <span style={{ color: 'rgba(178,198,245,0.6)' }}>{k}: </span>
                    <span style={{ color: '#BDD4FF', fontWeight: 600 }}>{String(val)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {enriched > 0 && (
          <div style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', marginBottom: 12 }}>
            <p style={{ margin: 0, fontSize: 12, color: '#10b981', fontWeight: 600 }}>
              {enriched} vehículos enriquecidos con datos de Silverdat
            </p>
          </div>
        )}

        {mismatches.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Discrepancias detectadas
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {mismatches.map((m, i) => (
                <div key={i} style={{
                  padding: '6px 10px', borderRadius: 8,
                  background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)',
                  fontSize: 11, color: '#fbbf24',
                }}>
                  <b>{m.matricula}</b> — {m.campo}: Excel=<span style={{ color: '#BDD4FF' }}>{m.excel}</span> vs Silverdat=<span style={{ color: '#f59e0b' }}>{m.silverdat}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {noData.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Sin datos en Silverdat
            </p>
            <p style={{ fontSize: 11, color: 'rgba(178,198,245,0.6)' }}>
              {noData.join(', ')}
            </p>
          </div>
        )}

        <button onClick={onClose} style={{
          width: '100%', fontSize: 12, fontWeight: 600, padding: '10px 0', borderRadius: 10,
          background: 'linear-gradient(135deg, #1240CC, #3366FF)',
          color: '#fff', border: 'none', cursor: 'pointer', marginTop: 8,
        }}>Cerrar</button>
      </div>
    </div>
  );
}

// ─── HojaTrabajos ───────────────────────────────────────────────────────────

const HojaTrabajos = forwardRef<FlotaGridHandle, Props>(function HojaTrabajos(
  { header, onHeaderChange, getOriginalSnapshot, onDataChange },
  ref,
) {
  const [confirmPending, setConfirmPending] = useState(false);
  const [vehicleCount, setVehicleCount]   = useState(0);
  const gridRef = useRef<FlotaGridHandle>(null);

  // Silverdat state
  const [showLogin, setShowLogin] = useState(false);
  const [silverdatLoading, setSilverdatLoading] = useState(false);
  const [silverdatProgress, setSilverdatProgress] = useState('');
  const [silverdatReport, setSilverdatReport] = useState<{
    mismatches: Mismatch[];
    enriched: number;
    noData: string[];
    total: number;
    vehicles: SilverdatVehicle[];
  } | null>(null);
  const silverdatPendingRef = useRef(false);
  const silverdatStopRef = useRef(false);

  // Forward ref
  React.useImperativeHandle(ref, () => ({
    getData:    () => gridRef.current!.getData(),
    setData:    (data) => gridRef.current!.setData(data),
    toRows:     () => gridRef.current!.toRows(),
    getColDefs: () => gridRef.current!.getColDefs(),
  }), []);

  const doImport = useCallback(() => {
    const raw = getOriginalSnapshot();
    if (!raw) return;
    const data = filtrarFilasReales(raw);
    if (data.length === 0) return;
    gridRef.current?.setData(data);
    setConfirmPending(false);
  }, [getOriginalSnapshot]);

  const handleCopy = useCallback(() => {
    const d = gridRef.current?.getData() ?? [];
    const hasData = d.some(r => Object.values(r).some(v => v.trim()));
    if (hasData) setConfirmPending(true);
    else doImport();
  }, [doImport]);

  const handleDataChange = useCallback((data: Record<string, string>[]) => {
    const mats = data.map(r => r['matricula'] ?? '').filter(v => v.trim());
    setVehicleCount(contarVehiculos(mats));
    onDataChange?.(data);
  }, [onDataChange]);

  // ─── Silverdat enrichment logic ──────────────────────────────────────────

  // ── Enrich helper: apply one vehicle's data to all matching rows ──────────
  const applyVehicleToGrid = useCallback((sv: SilverdatVehicle, mismatches: Mismatch[]): boolean => {
    const allData = gridRef.current!.getData();
    let didEnrich = false;

    const newData = allData.map(row => {
      const mat = (row['matricula'] ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      if (mat !== sv.matricula) return row;

      const updated = { ...row };
      let rowEnriched = false;

      const fill = (excelKey: string, svValue: string | number | undefined, label: string) => {
        if (svValue === undefined || svValue === null || svValue === '') return;
        const svStr = String(svValue);
        const excelVal = (row[excelKey] ?? '').trim();
        if (!excelVal) {
          updated[excelKey] = svStr;
          rowEnriched = true;
        } else if (excelVal.toUpperCase() !== svStr.toUpperCase()) {
          const nExcel = parseFloat(excelVal);
          const nSv = parseFloat(svStr);
          if (!isNaN(nExcel) && !isNaN(nSv) && Math.abs(nExcel - nSv) / Math.max(nExcel, nSv) < 0.05) return;
          mismatches.push({ matricula: mat, campo: label, excel: excelVal, silverdat: svStr });
        }
      };

      fill('marca', sv.marca, 'Marca');
      fill('modelo', sv.modelo, 'Modelo');
      fill('tipo_vehiculo', sv.tipo_vehiculo, 'Tipo vehículo');
      fill('kw', sv.kw, 'kW');
      fill('tn', sv.tara ? (sv.tara / 1000).toFixed(3) : undefined, 'Tara (Tn)');
      fill('combustible', sv.combustible, 'Combustible');
      fill('cilindrada', sv.cilindrada, 'Cilindrada');
      fill('plazas', sv.plazas, 'Plazas');
      fill('puertas', sv.puertas, 'Puertas');
      fill('cv', sv.cv, 'CV');
      fill('version', sv.version, 'Versión');
      fill('variante', sv.variante, 'Variante');
      fill('vin', sv.vin, 'VIN');
      fill('anyo_fabricacion', sv.anyo_fabricacion, 'Año fabricación');
      fill('fecha_matriculacion', sv.fecha_matriculacion, 'Fecha matriculación');
      fill('etiqueta_dgt', sv.etiqueta_dgt, 'Etiqueta DGT');
      fill('tipo_cambio', sv.tipo_cambio, 'Tipo cambio');
      fill('kilometraje', sv.kilometraje, 'Kilometraje');
      fill('co2', sv.co2, 'CO2');
      fill('euro', sv.euro, 'Euro');
      fill('precio_nuevo', sv.precio_nuevo, 'Precio nuevo');
      fill('precio_nuevo_total', sv.precio_nuevo_total, 'Precio nuevo total');
      fill('valor_venta', sv.valor_venta, 'Valor venta');
      fill('valor_compra', sv.valor_compra, 'Valor compra');
      fill('servicio', sv.servicio, 'Servicio');
      fill('renting', sv.renting, 'Renting');
      fill('num_titulares', sv.num_titulares, 'Nº titulares');
      fill('tipo_alimentacion', sv.tipo_alimentacion, 'Tipo alimentación');
      fill('distancia_ejes', sv.distancia_ejes, 'Distancia ejes');

      // Servicio → USO
      if (sv.servicio && !(row['uso'] ?? '').trim()) {
        const svc = sv.servicio.toLowerCase();
        if (svc.startsWith('particular'))       updated['uso'] = 'Particular';
        else if (svc.startsWith('públ') || svc.startsWith('publ')) updated['uso'] = 'Servicio público';
        else if (svc.includes('propios'))        updated['uso'] = 'Transportes propios';
        else                                     updated['uso'] = sv.servicio;
        rowEnriched = true;
      }

      if (rowEnriched) didEnrich = true;
      return updated;
    });

    gridRef.current!.setData(newData);
    return didEnrich;
  }, []);

  // ── Main enrichment — one by one with stop support ──────────────────────
  const runSilverdatEnrich = useCallback(async () => {
    const data = gridRef.current?.getData();
    if (!data) return;

    const rows = data.filter(r => (r['matricula'] ?? '').trim());
    if (rows.length === 0) {
      setSilverdatProgress('No hay matrículas en la hoja');
      setTimeout(() => setSilverdatProgress(''), 3000);
      return;
    }

    const matriculas = rows.map(r => r['matricula'].replace(/[^a-zA-Z0-9]/g, '').toUpperCase());
    // Semirremolques (R + digit) are skipped in the query loop — Silverdat has no data for them
    const unique = [...new Set(matriculas)];

    setSilverdatLoading(true);
    silverdatStopRef.current = false;

    const allVehicles: SilverdatVehicle[] = [];
    const noData: string[] = [];
    const mismatches: Mismatch[] = [];
    let enrichedCount = 0;

    for (let i = 0; i < unique.length; i++) {
      if (silverdatStopRef.current) {
        console.log(`[Silverdat] Detenido por el usuario en ${i}/${unique.length}`);
        break;
      }

      const mat = unique[i];
      setSilverdatProgress(`${i + 1}/${unique.length} — ${mat}`);

      // Solo consultar matrículas en formato estándar español: 4 dígitos + 3 letras (1234ABC)
      // Semirremolques (R+número), vehículos especiales, formatos extranjeros → skip
      if (!/^\d{4}[A-Z]{3}$/i.test(mat)) {
        console.log(`[Silverdat] ${mat}: SKIPPED (formato no estándar)`);
        continue;
      }

      try {
        const res = await fetch('/api/silverdat/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ matriculas: [mat] }),
        });

        if (res.status === 401) {
          setSilverdatLoading(false);
          setSilverdatProgress('');
          setShowLogin(true);
          silverdatPendingRef.current = true;
          return;
        }

        const json = await res.json();
        const r = json.results?.[0] as SilverdatResult | undefined;

        if (r?.ok && r.vehicle) {
          allVehicles.push(r.vehicle);
          const didEnrich = applyVehicleToGrid(r.vehicle, mismatches);
          if (didEnrich) enrichedCount++;
          console.log(`[Silverdat] ${mat}: OK`);
        } else {
          noData.push(mat);
          console.log(`[Silverdat] ${mat}: FAIL — ${r?.error || ''}`);
        }
      } catch (err: any) {
        noData.push(mat);
        console.log(`[Silverdat] ${mat}: ERROR — ${err.message}`);
      }
    }

    const consultadas = silverdatStopRef.current
      ? allVehicles.length + noData.length
      : unique.length;

    setSilverdatReport({
      mismatches,
      enriched: enrichedCount,
      noData,
      total: consultadas,
      vehicles: allVehicles,
    });

    const updatedData = gridRef.current?.getData();
    if (updatedData) onDataChange?.(updatedData);

    setSilverdatLoading(false);
    setSilverdatProgress('');
  }, [applyVehicleToGrid, onDataChange]);

  const handleSilverdatClick = useCallback(async () => {
    // First check if session exists
    try {
      const check = await fetch('/api/silverdat/login');
      const data = await check.json();
      if (data.hasSession) {
        runSilverdatEnrich();
      } else {
        silverdatPendingRef.current = true;
        setShowLogin(true);
      }
    } catch {
      silverdatPendingRef.current = true;
      setShowLogin(true);
    }
  }, [runSilverdatEnrich]);

  const handleLoginSuccess = useCallback(() => {
    setShowLogin(false);
    if (silverdatPendingRef.current) {
      silverdatPendingRef.current = false;
      runSilverdatEnrich();
    }
  }, [runSilverdatEnrich]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <HeaderBlock header={header} onChange={onHeaderChange} />

      {/* Toolbar de hoja */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 16px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb', flexShrink: 0 }}>
        <span className="text-[12px] font-black uppercase tracking-widest px-2 py-1 rounded-md"
          style={{ background: 'rgba(18,64,204,0.1)', color: '#1240CC', border: '1px solid rgba(18,64,204,0.2)' }}>
          Vehículos: {vehicleCount}
        </span>

        <button onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold uppercase tracking-widest"
          style={{ color: '#0891b2', background: 'rgba(8,145,178,0.06)', border: '1px solid rgba(8,145,178,0.2)' }}
          onMouseEnter={e=>(e.currentTarget.style.background='rgba(8,145,178,0.12)')}
          onMouseLeave={e=>(e.currentTarget.style.background='rgba(8,145,178,0.06)')}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
          </svg>
          Copiar desde ORIGINAL
        </button>

        {/* Silverdat button */}
        {!silverdatLoading ? (
          <button onClick={handleSilverdatClick}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold uppercase tracking-widest"
            style={{
              color: '#d97706',
              background: 'rgba(217,119,6,0.06)',
              border: '1px solid rgba(217,119,6,0.25)',
              cursor: 'pointer',
            }}
            onMouseEnter={e=>{ e.currentTarget.style.background='rgba(217,119,6,0.15)'; }}
            onMouseLeave={e=>{ e.currentTarget.style.background='rgba(217,119,6,0.06)'; }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
            </svg>
            Verificar con Silverdat
          </button>
        ) : (
          <button onClick={() => { silverdatStopRef.current = true; }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold uppercase tracking-widest"
            style={{
              color: '#ef4444',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.35)',
              cursor: 'pointer',
            }}
            onMouseEnter={e=>{ e.currentTarget.style.background='rgba(239,68,68,0.2)'; }}
            onMouseLeave={e=>{ e.currentTarget.style.background='rgba(239,68,68,0.1)'; }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <rect x="4" y="4" width="16" height="16" rx="2"/>
            </svg>
            Detener
          </button>
        )}

        {silverdatProgress && (
          <span style={{ fontSize: 12, fontWeight: 600, color: silverdatStopRef.current ? '#ef4444' : '#d97706', animation: 'pulse 1.5s infinite' }}>
            {silverdatProgress}
          </span>
        )}

        {confirmPending && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg"
            style={{ background: '#fffbeb', border: '1px solid #fcd34d' }}>
            <span className="text-[12px] font-bold" style={{ color: '#92400e' }}>¿Sobreescribir datos?</span>
            <button onClick={doImport} className="text-[12px] font-black px-2 py-0.5 rounded"
              style={{ background: '#fef3c7', color: '#92400e' }}>Sí</button>
            <button onClick={() => setConfirmPending(false)} className="text-[12px] font-black px-2 py-0.5 rounded"
              style={{ background: '#f3f4f6', color: '#6b7280' }}>No</button>
          </div>
        )}
      </div>

      <Suspense fallback={<div className="flex-1 animate-pulse rounded-xl bg-white/5" />}>
        <FlotaGrid
          ref={gridRef}
          initialColDefs={TRABAJO_COL_DEFS}
          onDataChange={handleDataChange}
        />
      </Suspense>

      {/* Silverdat modals */}
      {showLogin && (
        <SilverdatLoginModal
          onClose={() => { setShowLogin(false); silverdatPendingRef.current = false; }}
          onSuccess={handleLoginSuccess}
        />
      )}
      {silverdatReport && (
        <SilverdatReport
          {...silverdatReport}
          onClose={() => setSilverdatReport(null)}
        />
      )}
    </div>
  );
});

export default HojaTrabajos;
