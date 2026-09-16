"use client";

import React, { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import HojaPreEmision, { type VehiculoExport } from '@/app/(dashboard)/flotas/components/HojaPreEmision';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FUEL_LABEL: Record<string, string> = {
  D: 'Diésel', G: 'Gasolina', E: 'Eléctrico', X: 'HEV-G', Y: 'HEV-D',
  P: 'PHEV-G', R: 'PHEV-D', L: 'Gas', Z: 'REEV', B: 'Bio', H: 'H₂',
};

function normalizeKey(k: string): string {
  return k.toLowerCase().trim()
    .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u').replace(/ñ/g, 'n')
    .replace(/[^a-z0-9_]/g, '_');
}

function parseExcelRows(buffer: ArrayBuffer): Record<string, string>[] {
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  return raw.map(row => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      const nk = normalizeKey(k);
      const mapped: Record<string, string> = {
        matricula: 'matricula', matricula_: 'matricula',
        marca: 'marca', modelo: 'modelo',
        tipo: 'tipo_vehiculo', tipo_vehiculo: 'tipo_vehiculo', tipologia: 'tipo_vehiculo',
        kw: 'kw', cv: 'cv', tn: 'tn', tara: 'tn',
        anyo: 'anyo_fabricacion', ano: 'anyo_fabricacion', anyo_fabricacion: 'anyo_fabricacion',
        fecha_matriculacion: 'fecha_matriculacion', fecha_mat: 'fecha_matriculacion',
      };
      const dest = mapped[nk] ?? nk;
      out[dest] = String(v ?? '').trim();
    }
    return out;
  }).filter(r => r['matricula']);
}

// ─── Export Excel ─────────────────────────────────────────────────────────────

function exportExcel(vehicles: VehiculoExport[]) {
  const rows = vehicles.map(v => ({
    'Matrícula':   v.matricula,
    'Tipo':        v.tipo,
    'Marca':       v.marca,
    'Modelo':      v.modelo,
    'Versión':     v.version,
    'ID Catálogo': v.id_catalogo,
    'Año':         v.anyo > 0 ? v.anyo : '',
    'Combustible': FUEL_LABEL[v.combustible] ?? v.combustible,
    'kW':          v.kw > 0 ? v.kw : '',
    'CV':          v.cv > 0 ? v.cv : '',
    'Tara (kg)':   v.tara > 0 ? v.tara : '',
    'Estado':      v.status,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = Object.keys(rows[0] ?? {}).map((_, i) => ({ wch: [12,16,16,22,40,14,8,12,8,8,10,14][i] ?? 14 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Vehículos');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as number[];
  const blob = new Blob([new Uint8Array(buf)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `identificacion_vehiculos_${new Date().toISOString().slice(0, 10)}.xlsx`; a.click();
  URL.revokeObjectURL(url);
}

// ─── SilverdatModal ───────────────────────────────────────────────────────────

const FIELD: React.CSSProperties = {
  background: 'rgba(6,14,50,0.6)', border: '1px solid rgba(61,112,255,0.2)',
  borderRadius: 8, color: '#FFFFFF', fontSize: 13, padding: '9px 12px',
  outline: 'none', width: '100%', fontFamily: 'inherit',
};

function SilverdatModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [datId, setDatId] = useState('');
  const [user,  setUser]  = useState('');
  const [pass,  setPass]  = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const go = async () => {
    if (!datId || !user || !pass) return;
    setLoading(true); setError('');
    try {
      const r = await fetch('/api/silverdat/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datId, user, pass }),
      });
      const d = await r.json();
      if (d.ok) onSuccess(); else setError(d.error || 'Credenciales incorrectas');
    } catch { setError('Error de conexión'); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 340, padding: 26, borderRadius: 18, background: 'rgba(6,16,60,0.97)', border: '1px solid rgba(245,158,11,0.3)', boxShadow: '0 30px 80px rgba(0,0,0,0.7)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: 'linear-gradient(135deg,#f59e0b,#d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff', fontSize: 16 }}>S</div>
          <div>
            <p style={{ margin: 0, fontSize: 15, color: '#fff', fontWeight: 700 }}>Silverdat</p>
            <p style={{ margin: 0, fontSize: 11, color: 'rgba(178,198,245,0.55)' }}>DAT / fastVALUATE</p>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <input autoFocus placeholder="N. Cliente DAT" value={datId} onChange={e => setDatId(e.target.value)} style={FIELD} onKeyDown={e => e.key === 'Enter' && go()} />
          <input placeholder="Usuario" value={user} onChange={e => setUser(e.target.value)} style={FIELD} onKeyDown={e => e.key === 'Enter' && go()} />
          <input type="password" placeholder="Contraseña" value={pass} onChange={e => setPass(e.target.value)} style={FIELD} onKeyDown={e => e.key === 'Enter' && go()} />
        </div>
        {error && <p style={{ margin: '8px 0 0', fontSize: 11, color: '#ef4444', fontWeight: 600 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={go} disabled={loading || !datId || !user || !pass}
            style={{ flex: 1, padding: '10px 0', borderRadius: 9, background: loading ? 'rgba(245,158,11,0.3)' : 'linear-gradient(135deg,#d97706,#f59e0b)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 12, cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Conectando...' : 'Iniciar sesión'}
          </button>
          <button onClick={onClose} style={{ padding: '10px 14px', borderRadius: 9, background: 'rgba(6,14,50,0.5)', color: '#BDD4FF', border: '1px solid rgba(61,112,255,0.22)', fontSize: 12, cursor: 'pointer' }}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ─── IdentificacionMasiva ─────────────────────────────────────────────────────

type Phase = 'upload' | 'enrich' | 'grid';
interface EnrichLog { matricula: string; ok: boolean; marca?: string; modelo?: string }

export default function IdentificacionMasiva() {
  const [phase,        setPhase]        = useState<Phase>('upload');
  const [rawRows,      setRawRows]      = useState<Record<string, string>[]>([]);
  const [enrichedRows, setEnrichedRows] = useState<Record<string, string>[]>([]);
  const [vehicles,     setVehicles]     = useState<VehiculoExport[]>([]);
  const [parseError,   setParseError]   = useState('');
  const [showSdModal,  setShowSdModal]  = useState(false);
  const [sdPending,    setSdPending]    = useState(false);
  const [progress,     setProgress]     = useState({ current: 0, total: 0 });
  const [log,          setLog]          = useState<EnrichLog[]>([]);
  const abortRef = useRef(false);
  const fileRef  = useRef<HTMLInputElement>(null);

  const handleDescargarPlantilla = async () => {
    const ExcelJS = (await import('exceljs')).default;
    const headers = ['matricula', 'marca', 'modelo', 'tipo_vehiculo', 'kw', 'cv', 'tn', 'anyo_fabricacion'];
    const example = ['1234ABC', 'RENAULT', 'MEGANE', 'Turismo', '85', '', '', '2019'];
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Vehículos');
    ws.columns = headers.map(() => ({ width: 22 }));
    const hr = ws.addRow(headers);
    hr.height = 22;
    hr.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1240CC' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 10 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    const er = ws.addRow(example);
    er.eachCell(cell => {
      cell.font = { color: { argb: 'FFAAAAAA' }, name: 'Calibri', size: 10, italic: true };
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
    });
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'Plantilla_Identificacion_Vehiculos.xlsx'; a.click();
    URL.revokeObjectURL(url);
  };

  const enrichOne = async (row: Record<string, string>): Promise<Record<string, string>> => {
    const mat = (row.matricula || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!mat) return row;
    try {
      const res = await fetch('/api/silverdat/enrich', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matriculas: [mat] }),
      });
      if (!res.ok) return row;
      const data = await res.json();
      if (data.ok && data.results?.[0]?.ok && data.results[0].vehicle) {
        const sd = data.results[0].vehicle as Record<string, unknown>;
        const enriched = { ...row };
        if (!enriched.marca && sd.marca) enriched.marca = sd.marca as string;
        if (!enriched.modelo && sd.modelo) {
          let m = sd.modelo as string;
          if (sd.marca && m.toUpperCase().startsWith((sd.marca as string).toUpperCase()))
            m = m.slice((sd.marca as string).length).trim();
          enriched.modelo = m;
        }
        if (!enriched.kw    && sd.kw)    enriched.kw    = String(sd.kw);
        if (!enriched.cv    && sd.cv)    enriched.cv    = String(sd.cv);
        if (!enriched.tn    && sd.tara)  enriched.tn    = String(sd.tara);
        if (!enriched.fecha_matriculacion && sd.fecha_matriculacion)
          enriched.fecha_matriculacion = sd.fecha_matriculacion as string;
        if (!enriched.anyo_fabricacion && sd.anyo_fabricacion)
          enriched.anyo_fabricacion = sd.anyo_fabricacion as string;
        if (!enriched.tipo_vehiculo && sd.tipo_vehiculo)
          enriched.tipo_vehiculo = sd.tipo_vehiculo as string;
        return enriched;
      }
    } catch { /* ignore */ }
    return row;
  };

  const startEnrichment = useCallback(async (rows: Record<string, string>[]) => {
    abortRef.current = false;
    setPhase('enrich');
    setProgress({ current: 0, total: rows.length });
    setLog([]);

    const results: Record<string, string>[] = new Array(rows.length);
    let done = 0;
    let queueIdx = 0;

    const worker = async () => {
      while (!abortRef.current) {
        const myIdx = queueIdx++;
        if (myIdx >= rows.length) break;
        const enriched = await enrichOne(rows[myIdx]);
        results[myIdx] = enriched;
        if (abortRef.current) break;
        done++;
        const entry: EnrichLog = {
          matricula: rows[myIdx].matricula,
          ok: !!(enriched.marca || enriched.modelo),
          marca: enriched.marca,
          modelo: enriched.modelo,
        };
        setProgress(p => ({ ...p, current: done }));
        setLog(prev => [entry, ...prev].slice(0, 80));
      }
    };

    await Promise.all([worker(), worker(), worker()]);

    if (!abortRef.current) {
      setEnrichedRows(rows.map((r, i) => results[i] ?? r));
      setPhase('grid');
    }
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError('');
    try {
      const buf = await file.arrayBuffer();
      const rows = parseExcelRows(buf);
      if (rows.length === 0) { setParseError('El archivo no tiene filas válidas con matrícula.'); return; }
      setRawRows(rows);
      setVehicles([]);
      try {
        const d = await (await fetch('/api/silverdat/login')).json();
        if (!d.hasSession) { setSdPending(true); setShowSdModal(true); return; }
      } catch { setSdPending(true); setShowSdModal(true); return; }
      startEnrichment(rows);
    } catch {
      setParseError('Error al leer el archivo. Asegúrate de que es un Excel válido.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleVehiclesUpdate = useCallback((exports: VehiculoExport[]) => {
    setVehicles(exports);
  }, []);

  const listos  = vehicles.filter(v => v.status === 'listo').length;
  const pct     = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  const sdHits  = log.filter(l => l.ok).length;

  // ── Phase 1: upload ──────────────────────────────────────────────────────────
  if (phase === 'upload') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 24, padding: 32 }}>
        {showSdModal && (
          <SilverdatModal
            onClose={() => setShowSdModal(false)}
            onSuccess={() => { setShowSdModal(false); setSdPending(false); startEnrichment(rawRows); }}
          />
        )}

        {sdPending && !showSdModal && (
          <div style={{ textAlign: 'center', padding: '16px 24px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 12, maxWidth: 440 }}>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#fbbf24', fontWeight: 600 }}>
              Archivo cargado — falta iniciar sesión en Silverdat
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button onClick={() => setShowSdModal(true)}
                style={{ padding: '9px 22px', borderRadius: 9, background: 'linear-gradient(135deg,#d97706,#f59e0b)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                Introducir credenciales
              </button>
              <button onClick={() => { setSdPending(false); setRawRows([]); }}
                style={{ padding: '9px 16px', borderRadius: 9, background: 'rgba(6,14,50,0.5)', color: 'rgba(178,198,245,0.6)', border: '1px solid rgba(61,112,255,0.2)', fontSize: 12, cursor: 'pointer' }}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {!sdPending && (
          <>
            <div style={{ textAlign: 'center', maxWidth: 480 }}>
              <h2 style={{ margin: '0 0 8px', fontSize: 20, color: '#FFFFFF', fontWeight: 700 }}>Identificación masiva</h2>
              <p style={{ margin: 0, fontSize: 13, color: 'rgba(178,198,245,0.6)', lineHeight: 1.6 }}>
                Con solo la matrícula Silverdat obtiene la marca, modelo y datos del vehículo. Después el catálogo asigna el ID automáticamente.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              <button onClick={handleDescargarPlantilla} style={{ background: 'rgba(6,14,50,0.5)', border: '1px solid rgba(61,112,255,0.3)', borderRadius: 12, padding: '12px 24px', color: '#BDD4FF', fontSize: 13, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                Descargar plantilla
              </button>
              <label style={{ background: 'linear-gradient(135deg, #1240CC, #3366FF)', border: 'none', borderRadius: 12, padding: '12px 24px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 0 24px rgba(18,64,204,0.4)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                Subir Excel
                <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFileUpload} />
              </label>
            </div>

            {parseError && (
              <p style={{ color: '#f87171', fontSize: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '8px 16px' }}>
                {parseError}
              </p>
            )}

            <div style={{ fontSize: 11, color: 'rgba(178,198,245,0.35)', textAlign: 'center', maxWidth: 360 }}>
              Columna requerida: <span style={{ color: 'rgba(178,198,245,0.6)' }}>matricula</span><br />
              Opcionales (mejoran precisión): marca, modelo, tipo_vehiculo, kw, cv, tn, anyo_fabricacion
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Phase 2: Silverdat enrichment ────────────────────────────────────────────
  if (phase === 'enrich') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 32 }}>
        {showSdModal && (
          <SilverdatModal
            onClose={() => { setShowSdModal(false); setPhase('upload'); setRawRows([]); }}
            onSuccess={() => { setShowSdModal(false); startEnrichment(rawRows); }}
          />
        )}

        <div style={{ width: '100%', maxWidth: 560 }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#f59e0b', marginBottom: 6 }}>Consultando Silverdat</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#FFFFFF', margin: '0 0 6px' }}>
              {progress.current} / {progress.total} vehículos
            </h2>
            <p style={{ fontSize: 12, color: 'rgba(178,198,245,0.5)', margin: 0 }}>
              3 consultas en paralelo · aprox. {Math.max(0, Math.ceil((progress.total - progress.current) / 3 * 0.8))}s restantes
            </p>
          </div>

          <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#d97706,#f59e0b)', borderRadius: 4, transition: 'width 0.3s' }} />
          </div>

          <div style={{ height: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 20 }}>
            {log.map((entry, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 10px', borderRadius: 6,
                background: entry.ok ? 'rgba(16,185,129,0.05)' : 'rgba(245,158,11,0.05)',
                border: `1px solid ${entry.ok ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.1)'}` }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: entry.ok ? '#10b981' : '#f59e0b', width: 14, textAlign: 'center', flexShrink: 0 }}>
                  {entry.ok ? '✓' : '–'}
                </span>
                <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: '#FFFFFF', width: 90, flexShrink: 0 }}>{entry.matricula}</span>
                {entry.ok && (
                  <span style={{ fontSize: 11, color: 'rgba(178,198,245,0.6)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.marca} {entry.modelo}
                  </span>
                )}
              </div>
            ))}
            {progress.current < progress.total && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', color: 'rgba(178,198,245,0.35)', fontSize: 11 }}>
                <svg style={{ animation: 'sdSpin 1s linear infinite', flexShrink: 0 }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10" opacity="0.2"/><path d="M12 2a10 10 0 0110 10"/>
                </svg>
                Consultando...
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              onClick={() => { abortRef.current = true; setPhase('upload'); setRawRows([]); setLog([]); }}
              style={{ padding: '10px 32px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              Detener
            </button>
          </div>
        </div>
        <style>{`@keyframes sdSpin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Phase 3: grid ────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb', flexShrink: 0, flexWrap: 'wrap' }}>
        <button onClick={() => { setPhase('upload'); setRawRows([]); setVehicles([]); setEnrichedRows([]); }}
          style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 7, background: 'rgba(6,14,50,0.08)', border: '1px solid rgba(61,112,255,0.2)', color: '#1240CC', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          Nueva búsqueda
        </button>
        <span style={{ fontSize: 11, color: '#6b7280' }}>
          {enrichedRows.length} vehículos · {sdHits} con datos Silverdat
          {listos > 0 && <span style={{ color: '#059669', fontWeight: 700 }}> · {listos} identificados</span>}
        </span>
        <span style={{ flex: 1 }} />
        {listos > 0 && (
          <button onClick={() => exportExcel(vehicles)}
            style={{ fontSize: 11, fontWeight: 700, padding: '6px 16px', borderRadius: 8, background: 'linear-gradient(135deg, #1240CC, #3366FF)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            Exportar Excel ({listos})
          </button>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <HojaPreEmision
          trabajoRows={enrichedRows}
          onCatalogoChange={() => {}}
          onVehiclesUpdate={handleVehiclesUpdate}
        />
      </div>
    </div>
  );
}
