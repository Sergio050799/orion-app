"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
import * as XLSX from 'xlsx';
import HojaPreEmision, { type VehiculoExport } from '@/app/(dashboard)/flotas/components/HojaPreEmision';
import SilverdatModal from '@/components/saas/SilverdatModal';
import { ESTUDIO_CSS } from '@/app/(dashboard)/flotas/estudio-css';
import { nf } from '@/lib/fmt';
import { guardarConsulta, nuevoIdConsulta, type ConsultaCompleta } from '@/lib/consultasVehiculos';

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

async function exportExcel(vehicles: VehiculoExport[]) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MMT Seguros';
  const ws = wb.addWorksheet('Vehículos');

  const COLS = [
    { header: 'Matrícula',   width: 13 },
    { header: 'Tipo',        width: 18 },
    { header: 'Marca',       width: 16 },
    { header: 'Modelo',      width: 22 },
    { header: 'Versión',     width: 38 },
    { header: 'ID Catálogo', width: 14 },
    { header: 'Año',         width: 8  },
    { header: 'Combustible', width: 13 },
    { header: 'kW',          width: 8  },
    { header: 'CV',          width: 8  },
    { header: 'Plazas',      width: 9  },
    { header: 'Tara (kg)',   width: 11 },
    { header: 'Estado',      width: 16 },
    { header: 'Revisión',    width: 16 },
    { header: 'Motivos',     width: 60 },
  ];
  ws.columns = COLS.map(c => ({ width: c.width }));

  const hr = ws.addRow(COLS.map(c => c.header));
  hr.height = 22;
  hr.eachCell(cell => {
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002F82' } };
    cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border    = { bottom: { style: 'medium', color: { argb: 'FF002F82' } }, right: { style: 'thin', color: { argb: 'FFFFFFFF' } } };
  });

  vehicles.forEach((v, i) => {
    const r = ws.addRow([
      v.matricula.replace(/[\s-]/g, '').toUpperCase(),
      v.tipo,
      v.marca,
      v.modelo,
      v.version,
      v.id_catalogo,
      v.anyo > 0 ? v.anyo : '',
      FUEL_LABEL[v.combustible] ?? v.combustible,
      v.kw > 0 ? v.kw : '',
      v.cv > 0 ? v.cv : '',
      v.plazas > 0 ? v.plazas : '',
      v.tara > 0 ? v.tara : '',
      v.status,
      v.revision,
      v.motivos,
    ]);
    r.height = 16;
    r.eachCell({ includeEmpty: true }, cell => {
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFFFFFFF' : 'FFF0F4FA' } };
      cell.font      = { name: 'Calibri', size: 9, color: { argb: 'FF0A1628' } };
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
      cell.border    = { bottom: { style: 'thin', color: { argb: 'FFB8C8E8' } }, right: { style: 'thin', color: { argb: 'FFB8C8E8' } } };
    });
  });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([new Uint8Array(buf as ArrayBuffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `identificacion_vehiculos_${new Date().toISOString().slice(0, 10)}.xlsx`; a.click();
  URL.revokeObjectURL(url);
}

// ─── IdentificacionMasiva ─────────────────────────────────────────────────────

type Phase = 'upload' | 'enrich' | 'grid';
interface EnrichLog { matricula: string; ok: boolean; marca?: string; modelo?: string }

interface Props {
  /** consulta guardada que se reabre (con todo lo que tenía) */
  consulta?: ConsultaCompleta | null;
  /** avisa cuando se ha guardado algo, para refrescar el directorio */
  onGuardada?: () => void;
}

export default function IdentificacionMasiva({ consulta = null, onGuardada }: Props = {}) {
  const guardada = consulta?.data ?? null;
  const [phase,        setPhase]        = useState<Phase>(() => (guardada?.enrichedRows?.length ? 'grid' : 'upload'));
  const [rawRows,      setRawRows]      = useState<Record<string, string>[]>(() => guardada?.rawRows ?? []);
  const [enrichedRows, setEnrichedRows] = useState<Record<string, string>[]>(() => guardada?.enrichedRows ?? []);
  const [vehicles,     setVehicles]     = useState<VehiculoExport[]>([]);
  const [parseError,   setParseError]   = useState('');
  const [showSdModal,  setShowSdModal]  = useState(false);
  const [sdPending,    setSdPending]    = useState(false);
  const [progress,     setProgress]     = useState({ current: 0, total: 0 });
  const [log,          setLog]          = useState<EnrichLog[]>([]);
  const abortRef = useRef(false);
  const fileRef  = useRef<HTMLInputElement>(null);

  // ── Guardado de la consulta (se guarda sola; así un lote no se pierde si se cierra la pantalla) ──
  const consultaIdRef = useRef<string>(consulta?.id ?? '');
  const archivoRef    = useRef<string>(guardada?.archivo ?? '');
  const ultimoRef = useRef<{ rawRows: Record<string, string>[]; enrichedRows: Record<string, string>[]; seleccion: Record<string, string>; verifOk: Record<string, string>; listos: number }>({
    rawRows: guardada?.rawRows ?? [], enrichedRows: guardada?.enrichedRows ?? [],
    seleccion: guardada?.seleccion ?? {}, verifOk: guardada?.verifOk ?? {}, listos: consulta?.n_identificados ?? 0,
  });
  const firmaGuardadaRef = useRef<string>('');
  const timerGuardaRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const guardaAhora = useCallback(async () => {
    const u = ultimoRef.current;
    const n = u.enrichedRows.length || u.rawRows.length;
    if (n === 0) return;
    if (!consultaIdRef.current) consultaIdRef.current = nuevoIdConsulta();
    const firma = JSON.stringify([u.rawRows.length, u.enrichedRows.length, u.seleccion, u.verifOk, u.listos]);
    if (firma === firmaGuardadaRef.current) return;
    firmaGuardadaRef.current = firma;
    const nombre = `Masiva${archivoRef.current ? ` · ${archivoRef.current}` : ''} · ${nf(n)} vehículos`;
    await guardarConsulta({
      id: consultaIdRef.current, tipo: 'masiva', nombre, n_vehiculos: n, n_identificados: u.listos,
      data: { fase: u.enrichedRows.length ? 'grid' : 'cargada', archivo: archivoRef.current, rawRows: u.rawRows, enrichedRows: u.enrichedRows, seleccion: u.seleccion, verifOk: u.verifOk },
    });
    onGuardada?.();
  }, [onGuardada]);

  const programaGuardado = useCallback((ms = 1500) => {
    if (timerGuardaRef.current) clearTimeout(timerGuardaRef.current);
    timerGuardaRef.current = setTimeout(() => { guardaAhora(); }, ms);
  }, [guardaAhora]);
  const [dupWarning, setDupWarning] = useState<{ plates: string[]; uniqueRows: Record<string, string>[] } | null>(null);

  const handleDescargarPlantilla = async () => {
    const ExcelJS = (await import('exceljs')).default;
    const headers = ['matricula', 'marca', 'modelo', 'tipo_vehiculo', 'kw', 'cv', 'tn', 'anyo_fabricacion'];
    const example = ['1234ABC', 'RENAULT', 'MEGANE', 'Turismo', '85', '', '', '2019'];
    const wb = new ExcelJS.Workbook();
    wb.creator = 'MMT Seguros';
    const ws = wb.addWorksheet('Vehículos');
    ws.columns = headers.map(() => ({ width: 22 }));
    const hr = ws.addRow(headers);
    hr.height = 22;
    hr.eachCell(cell => {
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002F82' } };
      cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 10 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border    = { bottom: { style: 'medium', color: { argb: 'FF002F82' } }, right: { style: 'thin', color: { argb: 'FFFFFFFF' } } };
    });
    const er = ws.addRow(example);
    er.eachCell(cell => {
      cell.font      = { color: { argb: 'FFAAAAAA' }, name: 'Calibri', size: 10, italic: true };
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
        signal: AbortSignal.timeout(45000),
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
        if (!enriched.anyo_fabricacion && sd.anyo_fabricacion) {
          enriched.anyo_fabricacion = sd.anyo_fabricacion as string;
          enriched.anyo_fab_fuente = (sd.anyo_fab_fuente as string) || 'fabricacion';
        } else if (enriched.anyo_fabricacion && !enriched.anyo_fab_fuente) {
          enriched.anyo_fab_fuente = 'fabricacion';
        }
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
      const final = rows.map((r, i) => results[i] ?? r);
      setEnrichedRows(final);
      setPhase('grid');
      ultimoRef.current = { ...ultimoRef.current, rawRows: rows, enrichedRows: final };
      guardaAhora();
    }
  }, [guardaAhora]);

  const proceedWithRows = async (rows: Record<string, string>[]) => {
    setDupWarning(null);
    setRawRows(rows);
    setVehicles([]);
    ultimoRef.current = { rawRows: rows, enrichedRows: [], seleccion: {}, verifOk: {}, listos: 0 };
    guardaAhora();
    try {
      const d = await (await fetch('/api/silverdat/login', { signal: AbortSignal.timeout(8000) })).json();
      if (!d.hasSession) { setSdPending(true); setShowSdModal(true); return; }
    } catch { setSdPending(true); setShowSdModal(true); return; }
    startEnrichment(rows);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError('');
    consultaIdRef.current = nuevoIdConsulta();   // cada archivo es una consulta nueva
    archivoRef.current = file.name.replace(/\.(xlsx|xls)$/i, '');
    firmaGuardadaRef.current = '';
    try {
      const buf = await file.arrayBuffer();
      const rows = parseExcelRows(buf);
      if (rows.length === 0) { setParseError('El archivo no tiene filas válidas con matrícula.'); return; }

      // Detect duplicates
      const countMap = new Map<string, number>();
      rows.forEach(r => {
        const mat = (r.matricula || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (mat) countMap.set(mat, (countMap.get(mat) ?? 0) + 1);
      });
      const dupPlates = Array.from(countMap.entries()).filter(([, n]) => n > 1).map(([m]) => m);

      // Always dedup before processing
      const seenMats = new Set<string>();
      const uniqueRows = rows.filter(r => {
        const mat = (r.matricula || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!mat || seenMats.has(mat)) return false;
        seenMats.add(mat);
        return true;
      });

      if (dupPlates.length > 0) {
        setDupWarning({ plates: dupPlates, uniqueRows });
        return;
      }

      await proceedWithRows(uniqueRows);
    } catch {
      setParseError('Error al leer el archivo. Asegúrate de que es un Excel válido.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleVehiclesUpdate = useCallback((exports: VehiculoExport[]) => {
    setVehicles(exports);
    const listos = exports.filter(v => v.status === 'listo').length;
    if (listos !== ultimoRef.current.listos) { ultimoRef.current = { ...ultimoRef.current, listos }; programaGuardado(); }
  }, [programaGuardado]);

  const handleCatalogoChange = useCallback((seleccion: Record<string, string>) => {
    ultimoRef.current = { ...ultimoRef.current, seleccion };
    programaGuardado();
  }, [programaGuardado]);

  const handleVerificacionChange = useCallback((_info: unknown, ok: Record<string, string>) => {
    if (JSON.stringify(ok) === JSON.stringify(ultimoRef.current.verifOk)) return;
    ultimoRef.current = { ...ultimoRef.current, verifOk: ok };
    programaGuardado();
  }, [programaGuardado]);

  // Consulta reabierta que se quedó a medias (archivo cargado pero sin terminar de consultar Silverdat): se continúa
  const reanudadaRef = useRef(false);
  useEffect(() => {
    if (reanudadaRef.current) return;
    reanudadaRef.current = true;
    if (guardada && !(guardada.enrichedRows?.length) && (guardada.rawRows?.length)) proceedWithRows(guardada.rawRows);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const listos  = vehicles.filter(v => v.status === 'listo').length;
  const pct     = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  const sdHits  = log.filter(l => l.ok).length;

  // ── Phase 1: upload ──────────────────────────────────────────────────────────
  if (phase === 'upload') {
    return (
      <div className="mas">
        {showSdModal && (
          <SilverdatModal
            onClose={() => setShowSdModal(false)}
            onSuccess={() => { setShowSdModal(false); setSdPending(false); startEnrichment(rawRows); }}
          />
        )}

        {sdPending && !showSdModal && (
          <div className="chkbox" style={{ ['--c' as string]: 'var(--silver)' }}>
            <h3>Archivo cargado: falta conectar con Silverdat</h3>
            <p>ORION necesita Silverdat para completar marca, modelo y datos técnicos de cada matrícula.</p>
            <div className="runrow">
              <button className="mini sd" onClick={() => setShowSdModal(true)}>Introducir credenciales</button>
              <button className="mini" onClick={() => { setSdPending(false); setRawRows([]); }}>Cancelar</button>
            </div>
          </div>
        )}

        {dupWarning && (
          <div className="chkbox" style={{ ['--c' as string]: 'var(--warn)' }}>
            <h3>{nf(dupWarning.plates.length)} matrícula{dupWarning.plates.length !== 1 ? 's' : ''} duplicada{dupWarning.plates.length !== 1 ? 's' : ''} en el archivo</h3>
            <div className="vtags" style={{ margin: '10px 0 12px' }}>
              {dupWarning.plates.map(m => <span key={m} className="chip mono">{m}</span>)}
            </div>
            <p>
              Se procesarán <b style={{ color: 'var(--text)' }}>{nf(dupWarning.uniqueRows.length)} vehículos únicos</b>. Las duplicadas se eliminan para no consultar Silverdat más de una vez por matrícula.
            </p>
            <div className="runrow">
              <button className="mini pri" onClick={() => proceedWithRows(dupWarning.uniqueRows)}>Continuar con {nf(dupWarning.uniqueRows.length)} únicos</button>
              <button className="mini" onClick={() => setDupWarning(null)}>Cancelar</button>
            </div>
          </div>
        )}

        {!sdPending && !dupWarning && (
          <div className="vtri two">
            <div>
              <span className="no">Paso 1 de 2</span>
              <h3>Preparar el Excel</h3>
              <p>Columna obligatoria: <b style={{ color: 'var(--text)' }}>matricula</b>. Opcionales, que mejoran la precisión: marca, modelo, tipo_vehiculo, kw, cv, tn y anyo_fabricacion.</p>
              <button className="mini" onClick={handleDescargarPlantilla}>Descargar plantilla</button>
            </div>
            <div>
              <span className="no">Paso 2 de 2</span>
              <h3>Subir el Excel</h3>
              <p>ORION consulta Silverdat para cada matrícula y después el catálogo asigna el ID automáticamente.</p>
              <label className="mini pri filebtn">
                Seleccionar archivo .xlsx
                <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFileUpload} />
              </label>
              {parseError && <p className="note" style={{ color: 'var(--sdoff)' }} role="alert">{parseError}</p>}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Phase 2: Silverdat enrichment ────────────────────────────────────────────
  if (phase === 'enrich') {
    return (
      <div className="mas">
        {showSdModal && (
          <SilverdatModal
            onClose={() => { setShowSdModal(false); setPhase('upload'); setRawRows([]); }}
            onSuccess={() => { setShowSdModal(false); startEnrichment(rawRows); }}
          />
        )}

        <div className="vtri two" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
          <div style={{ paddingRight: 0 }}>
            <span className="no" style={{ color: 'var(--silver)' }}>Consultando Silverdat</span>
            <h3>{nf(progress.current)} de {nf(progress.total)} vehículos</h3>
            <p>3 consultas en paralelo · quedan unos {nf(Math.max(0, Math.ceil((progress.total - progress.current) / 3 * 0.8)))} s</p>
            <div className="pbar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>
            <div className="elog">
              {log.map((entry, i) => (
                <div key={i} className={entry.ok ? 'ok' : ''}>
                  <span className="mono">{entry.matricula}</span>
                  <span>{entry.ok ? `${entry.marca ?? ''} ${entry.modelo ?? ''}`.trim() : 'Sin datos'}</span>
                </div>
              ))}
              {progress.current < progress.total && <div><span>Consultando…</span></div>}
            </div>
            <div className="runrow">
              <button className="mini danger" onClick={() => { abortRef.current = true; setPhase('upload'); setRawRows([]); setLog([]); }}>Detener</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Phase 3: grid ────────────────────────────────────────────────────────────
  return (
    <div className="mas">
      <div className="pcount" style={{ marginTop: 0, padding: '14px 20px', borderBottom: '1px solid var(--line)' }}>
        <button className="mini" onClick={() => { if (timerGuardaRef.current) clearTimeout(timerGuardaRef.current); guardaAhora(); consultaIdRef.current = ''; archivoRef.current = ''; firmaGuardadaRef.current = ''; ultimoRef.current = { rawRows: [], enrichedRows: [], seleccion: {}, verifOk: {}, listos: 0 }; setPhase('upload'); setRawRows([]); setVehicles([]); setEnrichedRows([]); }}>Nueva búsqueda</button>
        <span><b>{nf(enrichedRows.length)}</b> vehículos · {nf(sdHits)} con datos de Silverdat{listos > 0 && <> · <b>{nf(listos)}</b> identificados</>}</span>
        {listos > 0 && <button className="mini pri" style={{ marginLeft: 'auto' }} onClick={() => exportExcel(vehicles)}>Exportar Excel ({nf(listos)})</button>}
      </div>
      <style dangerouslySetInnerHTML={{ __html: ESTUDIO_CSS }} />
      <div className="es pg" style={{ padding: '4px 20px 20px' }}>
        <HojaPreEmision
          trabajoRows={enrichedRows}
          initialSeleccion={guardada?.seleccion}
          initialVerificacionOk={guardada?.verifOk}
          onCatalogoChange={handleCatalogoChange}
          onVerificacionChange={handleVerificacionChange}
          onVehiclesUpdate={handleVehiclesUpdate}
        />
      </div>
    </div>
  );
}
