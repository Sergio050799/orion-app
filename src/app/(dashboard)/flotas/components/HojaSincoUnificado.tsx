"use client";

import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  consolidarSinco, mergeSincoToTrabajo,
  contarVehiculos, contarVehiculosConSinco,
  calcularAntiguedad, calcularAntiguedadMedia, calcularSiniestrosPorAnio, calcularFrecuencia,
  normalizarPoliza,
} from '@/core/flotas';
import type { FlotaCarpeta } from '@/core/flotas';
import type { FlotaHeader } from './types';
import { SINCO_COL_NAMES } from './constants';

// ─── Tipos ───────────────────────────────────────────────────────────────────

type Modo = 'AUTOMATICO' | 'POR_MATRICULA' | 'GLOBAL_FLOTA' | 'CONSOLIDADO';

interface SincoManualEntry {
  matricula: string;
  num_siniestros: number;
  fec_ini_cobertura: string;
  fec_vcto: string;
  codigo_retorno: string;
  garantias: string;
  observaciones: string;
}

interface SincoGlobal {
  siniestrosTotales: number;
  anyosExperiencia: number;
  frecuencia: number;
  observaciones: string;
}

interface Props {
  header: FlotaHeader;
  trabajoRows: Record<string, string>[];
  carpetaActiva: FlotaCarpeta;
  sincoResultRows: Record<string, string>[];
  onSincoResultChange: (rows: Record<string, string>[]) => void;
  onTrabajoChange: (rows: Record<string, string>[]) => void;
  onCarpetaChange: (c: FlotaCarpeta) => void;
}

// ─── Estilos reutilizables ──────────────────────────────────────────────────

const pillBase: React.CSSProperties = {
  padding: '6px 14px', fontSize: 10, fontWeight: 800, borderRadius: 8,
  border: 'none', cursor: 'pointer', textTransform: 'uppercase',
  letterSpacing: '0.06em', transition: 'all 0.15s',
};
const pillActive: React.CSSProperties = {
  ...pillBase, background: 'rgba(18,64,204,0.2)', color: '#3366FF',
};
const pillInactive: React.CSSProperties = {
  ...pillBase, background: 'transparent', color: 'rgba(178,198,245,0.6)',
};

const sectionTitle: React.CSSProperties = {
  fontSize: 10, fontWeight: 900, color: 'rgba(178,198,245,0.5)',
  textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14,
};

const inputStyle: React.CSSProperties = {
  width: '100%', fontSize: 12, padding: '7px 10px', borderRadius: 8,
  background: 'rgba(6,14,50,0.55)', border: '1px solid rgba(61,112,255,0.22)',
  color: '#FFFFFF', outline: 'none', fontFamily: 'inherit',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 800, color: 'rgba(51,102,255,0.8)',
  textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4,
};

const kpiBox: React.CSSProperties = {
  borderRadius: 8, padding: '10px 14px',
  background: 'rgba(6,14,50,0.4)', border: '1px solid rgba(61,112,255,0.16)',
};

const thS: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700,
  borderBottom: '1px solid #d1d5db', whiteSpace: 'nowrap', userSelect: 'none',
};
const tdS: React.CSSProperties = {
  padding: '6px 10px', fontSize: 12, whiteSpace: 'nowrap', fontFamily: 'monospace',
};

const fmt = (n: number) => isNaN(n) || !isFinite(n) ? '—' : n.toFixed(2);
const fmtFreq = (n: number) => isNaN(n) || !isFinite(n) ? '—' : `${(n * 100).toFixed(1)}%`;

// ─── KPI Panel ──────────────────────────────────────────────────────────────

function KpiPanel({ label, kpis }: { label: string; kpis: { label: string; value: string }[] }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <p style={{ ...sectionTitle, marginBottom: 10 }}>{label}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {kpis.map(k => (
          <div key={k.label} style={kpiBox}>
            <div style={{ fontSize: 9, fontWeight: 800, color: 'rgba(178,198,245,0.6)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k.label}</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#FFFFFF', fontFamily: 'monospace', marginTop: 2 }}>{k.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MODO AUTOMÁTICO ────────────────────────────────────────────────────────

function ModoAutomatico({ header, trabajoRows, sincoResultRows, onSincoResultChange, onTrabajoChange }: Pick<Props, 'header' | 'trabajoRows' | 'sincoResultRows' | 'onSincoResultChange' | 'onTrabajoChange'>) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragCounter, setDragCounter] = useState(0);

  // Generar Excel de consulta
  const handleExport = useCallback(async () => {
    const ExcelJS = (await import('exceljs')).default;
    function inferTipoDocumento(cif: string): string {
      if (!cif) return 'C';
      const first = cif[0].toUpperCase();
      if (first === 'P') return 'P';
      if (first === 'X' || first === 'Y' || first === 'Z') return 'R';
      return 'C';
    }
    const tipoDoc = inferTipoDocumento(header.cif);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'MMT Seguros';
    const ws = wb.addWorksheet('SINCO');
    ws.columns = SINCO_COL_NAMES.map(() => ({ width: 18 }));

    const headerRow = ws.addRow(SINCO_COL_NAMES);
    headerRow.height = 24;
    headerRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002F82' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 9 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { bottom: { style: 'medium', color: { argb: 'FF002F82' } }, right: { style: 'thin', color: { argb: 'FFFFFFFF' } } };
    });

    trabajoRows
      .filter(r => r['matricula']?.trim())
      .forEach((r, i) => {
        const rowData: string[] = Array(16).fill('');
        rowData[0] = 'MMT';
        rowData[1] = tipoDoc;
        rowData[2] = header.cif;
        const polizaRaw = r['num_poliza_actual']?.trim() || r['n_poliza_actual']?.trim() || r['poliza_sinco']?.trim() || '';
        rowData[3] = polizaRaw ? normalizarPoliza(polizaRaw) : '';
        rowData[4] = (r['matricula'] ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        const row = ws.addRow(rowData);
        row.height = 18;
        row.eachCell({ includeEmpty: true }, cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFFFFFFF' : 'FFF0F4FA' } };
          cell.font = { name: 'Calibri', size: 9, color: { argb: 'FF0A1628' } };
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
          cell.border = { bottom: { style: 'thin', color: { argb: 'FFB8C8E8' } }, right: { style: 'thin', color: { argb: 'FFB8C8E8' } } };
        });
      });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SINCO_${header.cif || 'flota'}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }, [header, trabajoRows]);

  // Importar resultado
  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const XLSX = await import('xlsx');
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target?.result, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      // Parse by actual column headers from the file (not positional)
      // This handles SINCO responses that include Num_Anios_Asegurado or other extra columns
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: false });
      const asRecords = rawRows
        .filter(r => Object.values(r).some(v => String(v ?? '').trim() !== ''))
        .map(r => {
          const obj: Record<string, string> = {};
          for (const [k, v] of Object.entries(r)) obj[k.trim()] = String(v ?? '');
          return obj;
        });
      onSincoResultChange(asRecords);
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  }, [onSincoResultChange]);

  // Volcar a TRABAJO
  const handleMerge = useCallback(() => {
    const merged = mergeSincoToTrabajo(trabajoRows, sincoResultRows);
    onTrabajoChange(merged);
  }, [trabajoRows, sincoResultRows, onTrabajoChange]);

  // Métricas del resultado importado — fórmula correcta MMT
  const matriculas = sincoResultRows.map(r => r['Matrícula'] ?? r['matricula'] ?? '').filter(Boolean);
  const numSiniestros = sincoResultRows.reduce((acc, r) => acc + (parseInt(r['Num_Siniestros'] ?? r['num_siniestros'] ?? '0') || 0), 0);
  const totalVeh = contarVehiculos(matriculas);
  // Exitosas = Codigo_Retorno vacío
  const exitosas = sincoResultRows.filter(r => {
    const c = r['Codigo_Retorno'] ?? r['codigo_retorno'] ?? '';
    return !c || c.trim() === '' || c.trim() === '0';
  });
  const conSinco = exitosas.length;
  // Antigüedad: Num_Anios_Asegurado si existe; si no, calcular desde Fec_Ini_Cobertura
  const numAniosList = exitosas.map(r => {
    const aniosRaw = r['Num_Anios_Asegurado'] ?? r['num_anios_asegurado'] ?? '';
    if (aniosRaw.trim()) {
      const n = parseFloat(aniosRaw);
      // Reject near-zero values (< ~1 month) — they inflate frequency x100+
      if (!isNaN(n) && n >= 0.08) return n;
    }
    const fec = r['Fec_Ini_Cobertura'] ?? r['fec_ini_cobertura'] ?? '';
    if (fec.trim()) {
      const y = calcularAntiguedad(fec);
      if (y > 0) return y;
    }
    return 0;
  }).filter(n => n > 0);
  const antiguedMedia = numAniosList.length > 0 ? numAniosList.reduce((a, b) => a + b, 0) / numAniosList.length : 0;
  const sinAnio = calcularSiniestrosPorAnio(numSiniestros, antiguedMedia);
  const freq = calcularFrecuencia(sinAnio, conSinco);

  const vehiculosSinco = trabajoRows.filter(r => r['matricula']?.trim()).length;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }} className="custom-scrollbar">
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        {/* Sección descargar */}
        <section style={{ marginBottom: 28 }}>
          <p style={sectionTitle}>Generar consulta SINCO</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={handleExport}
              style={{ ...pillBase, background: 'rgba(22,163,74,0.1)', color: '#16a34a', border: '1px solid rgba(22,163,74,0.25)', fontSize: 11, padding: '8px 16px' }}>
              Descargar consulta SINCO (.xlsx)
            </button>
            <span style={{ fontSize: 11, color: 'rgba(178,198,245,0.6)' }}>
              {vehiculosSinco} vehículos preparados
            </span>
          </div>
        </section>

        {/* Sección importar */}
        <section style={{ marginBottom: 28 }}>
          <p style={sectionTitle}>Importar resultado SINCO</p>
          <div
            style={{
              padding: '16px 20px', borderRadius: 10,
              border: dragCounter > 0 ? '2px dashed #3366FF' : '2px dashed transparent',
              background: dragCounter > 0 ? 'rgba(61,112,255,0.10)' : 'transparent',
              transition: 'border 0.15s, background 0.15s',
            }}
            onDragEnter={e => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer.types.includes('Files')) setDragCounter(c => c + 1); }}
            onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setDragCounter(c => c - 1); }}
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={e => {
              e.preventDefault(); e.stopPropagation(); setDragCounter(0);
              const file = e.dataTransfer.files?.[0];
              if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
                const dt = new DataTransfer();
                dt.items.add(file);
                const syntheticEvent = { target: { files: dt.files, value: '' } } as unknown as React.ChangeEvent<HTMLInputElement>;
                handleImport(syntheticEvent);
              }
            }}
          >
            <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImport} />
            <button onClick={() => fileRef.current?.click()}
              style={{ ...pillBase, background: 'rgba(124,58,237,0.1)', color: '#7c3aed', border: '1px solid rgba(124,58,237,0.25)', fontSize: 11, padding: '8px 16px' }}>
              {dragCounter > 0 ? 'Suelta el archivo aqui' : 'Importar resultado SINCO (.xlsx)'}
            </button>
          </div>
        </section>

        {/* Métricas + tabla */}
        {sincoResultRows.length > 0 && (
          <>
            <KpiPanel label="Resultado SINCO automático" kpis={[
              { label: 'Vehículos', value: String(totalVeh) },
              { label: 'Vehículos con SINCO', value: String(conSinco) },
              { label: 'Siniestros', value: String(numSiniestros) },
              { label: 'Años media', value: fmt(antiguedMedia) },
              { label: 'Siniestros / año', value: fmt(sinAnio) },
              { label: 'Frecuencia', value: fmtFreq(freq) },
            ]} />

            <div style={{ marginBottom: 16, display: 'flex', gap: 10 }}>
              <button onClick={handleMerge}
                style={{ ...pillBase, background: 'rgba(18,64,204,0.15)', color: '#3366FF', border: '1px solid rgba(18,64,204,0.3)', fontSize: 11, padding: '8px 16px' }}>
                Volcar a TRABAJO
              </button>
            </div>

            {/* Tabla de resultados */}
            <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
              <div style={{ overflowX: 'auto', maxHeight: 400, background: '#fff' }} className="custom-scrollbar">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f3f4f6', position: 'sticky', top: 0, zIndex: 1 }}>
                      <th style={{ ...thS, width: 44, color: '#9ca3af' }}>#</th>
                      {SINCO_COL_NAMES.map((name, i) => (
                        <th key={name} style={{ ...thS, background: i < 5 ? '#eff0ff' : '#f3f4f6', color: i < 5 ? '#4338ca' : '#374151' }}>{name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sincoResultRows.map((row, ri) => (
                      <tr key={ri} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ ...tdS, color: '#9ca3af', textAlign: 'center' }}>{ri + 1}</td>
                        {SINCO_COL_NAMES.map((name, ci) => (
                          <td key={ci} style={{ ...tdS, background: ci < 5 ? '#f8f8ff' : '#fff', color: ci < 5 ? '#374151' : '#111827' }}>
                            {row[name] || <span style={{ color: '#d1d5db' }}>—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── MODO POR MATRÍCULA ─────────────────────────────────────────────────────

function ModoPorMatricula({ trabajoRows, carpetaActiva, onCarpetaChange }: Pick<Props, 'trabajoRows' | 'carpetaActiva' | 'onCarpetaChange'>) {
  const matriculas = useMemo(() =>
    trabajoRows.map(r => r['matricula']?.trim()).filter(Boolean),
    [trabajoRows]
  );

  const [manualData, setManualData] = useState<SincoManualEntry[]>(carpetaActiva.sincoManual ?? []);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Sync from carpeta on mount
  useEffect(() => {
    setManualData(carpetaActiva.sincoManual ?? []);
  }, [carpetaActiva.id]);

  const getEntry = (mat: string): SincoManualEntry =>
    manualData.find(e => e.matricula === mat) ?? {
      matricula: mat, num_siniestros: 0, fec_ini_cobertura: '', fec_vcto: '',
      codigo_retorno: '', garantias: '', observaciones: '',
    };

  const saveEntry = (entry: SincoManualEntry) => {
    const updated = [...manualData.filter(e => e.matricula !== entry.matricula), entry];
    setManualData(updated);
    const newCarpeta = { ...carpetaActiva, sincoManual: updated };
    onCarpetaChange(newCarpeta);
  };

  // KPIs en vivo
  const manualAsRecords: Record<string, string>[] = manualData
    .filter(e => e.num_siniestros > 0 || e.fec_ini_cobertura || e.codigo_retorno)
    .map(e => ({
      matricula: e.matricula,
      num_siniestros: String(e.num_siniestros),
      fec_ini_cobertura: e.fec_ini_cobertura,
      fec_vcto: e.fec_vcto,
      codigo_retorno: e.codigo_retorno,
      garantias: e.garantias,
    }));
  const resumen = consolidarSinco(manualAsRecords);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }} className="custom-scrollbar">
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        {manualAsRecords.length > 0 && (
          <KpiPanel label="SINCO Manual — Métricas en vivo" kpis={[
            { label: 'Vehículos', value: String(resumen.totalVehiculos) },
            { label: 'Con SINCO', value: String(resumen.vehiculosConSinco) },
            { label: 'Siniestros', value: String(resumen.totalSiniestros) },
            { label: 'Años media', value: fmt(resumen.antiguedadMedia) },
            { label: 'Siniestros / año', value: fmt(resumen.siniestrosPorAnio) },
            { label: 'Frecuencia', value: fmtFreq(resumen.frecuencia) },
          ]} />
        )}

        {matriculas.length === 0 ? (
          <p style={{ color: 'rgba(178,198,245,0.6)', fontSize: 12, textAlign: 'center', padding: '40px 0' }}>
            Sin matrículas en TRABAJO. Añade vehículos primero.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {matriculas.map(mat => {
              const isOpen = expanded === mat;
              const entry = getEntry(mat);
              const hasSiniestros = entry.num_siniestros > 0;
              return (
                <div key={mat} style={{ borderRadius: 10, border: '1px solid rgba(61,112,255,0.16)', background: 'rgba(3,10,42,0.3)', overflow: 'hidden' }}>
                  {/* Header row */}
                  <button onClick={() => setExpanded(isOpen ? null : mat)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#FFFFFF' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, fontFamily: 'monospace' }}>{mat}</span>
                      {hasSiniestros && (
                        <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>
                          {entry.num_siniestros} siniestros
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: 10, color: 'rgba(178,198,245,0.5)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▼</span>
                  </button>

                  {/* Expanded form */}
                  {isOpen && (
                    <div style={{ padding: '12px 16px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                        <div>
                          <label style={labelStyle}>Nº Siniestros</label>
                          <input inputMode="numeric" style={inputStyle} value={entry.num_siniestros}
                            onChange={e => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) saveEntry({ ...entry, num_siniestros: parseInt(v) || 0 }); }}
                            onFocus={e => (e.currentTarget.style.borderColor = 'rgba(18,64,204,0.5)')}
                            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(61,112,255,0.22)')} />
                        </div>
                        <div>
                          <label style={labelStyle}>Inicio cobertura</label>
                          <input type="date" style={inputStyle} value={entry.fec_ini_cobertura}
                            onChange={e => saveEntry({ ...entry, fec_ini_cobertura: e.target.value })}
                            onFocus={e => (e.currentTarget.style.borderColor = 'rgba(18,64,204,0.5)')}
                            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(61,112,255,0.22)')} />
                        </div>
                        <div>
                          <label style={labelStyle}>Vencimiento</label>
                          <input type="date" style={inputStyle} value={entry.fec_vcto}
                            onChange={e => saveEntry({ ...entry, fec_vcto: e.target.value })}
                            onFocus={e => (e.currentTarget.style.borderColor = 'rgba(18,64,204,0.5)')}
                            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(61,112,255,0.22)')} />
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                        <div>
                          <label style={labelStyle}>Código retorno</label>
                          <input style={inputStyle} value={entry.codigo_retorno}
                            onChange={e => saveEntry({ ...entry, codigo_retorno: e.target.value })}
                            onFocus={e => (e.currentTarget.style.borderColor = 'rgba(18,64,204,0.5)')}
                            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(61,112,255,0.22)')} />
                        </div>
                        <div>
                          <label style={labelStyle}>Garantías</label>
                          <input style={inputStyle} value={entry.garantias}
                            onChange={e => saveEntry({ ...entry, garantias: e.target.value })}
                            onFocus={e => (e.currentTarget.style.borderColor = 'rgba(18,64,204,0.5)')}
                            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(61,112,255,0.22)')} />
                        </div>
                      </div>
                      <div>
                        <label style={labelStyle}>Observaciones</label>
                        <textarea style={{ ...inputStyle, minHeight: 48, resize: 'vertical' }} value={entry.observaciones}
                          onChange={e => saveEntry({ ...entry, observaciones: e.target.value })}
                          onFocus={e => (e.currentTarget.style.borderColor = 'rgba(18,64,204,0.5)')}
                          onBlur={e => (e.currentTarget.style.borderColor = 'rgba(61,112,255,0.22)')} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MODO GLOBAL FLOTA ──────────────────────────────────────────────────────

function ModoGlobalFlota({ carpetaActiva, onCarpetaChange, sincoResultRows }: Pick<Props, 'carpetaActiva' | 'onCarpetaChange' | 'sincoResultRows'>) {
  const [global, setGlobal] = useState<SincoGlobal>(carpetaActiva.sincoGlobal ?? {
    siniestrosTotales: 0, anyosExperiencia: 0, frecuencia: 0, observaciones: '',
  });

  useEffect(() => {
    setGlobal(carpetaActiva.sincoGlobal ?? {
      siniestrosTotales: 0, anyosExperiencia: 0, frecuencia: 0, observaciones: '',
    });
  }, [carpetaActiva.id]);

  const freqCalc = global.anyosExperiencia > 0
    ? global.siniestrosTotales / global.anyosExperiencia
    : 0;

  const save = (patch: Partial<SincoGlobal>) => {
    const updated = { ...global, ...patch, frecuencia: 0 };
    // Recalculate
    updated.frecuencia = updated.anyosExperiencia > 0 ? updated.siniestrosTotales / updated.anyosExperiencia : 0;
    setGlobal(updated);
    onCarpetaChange({ ...carpetaActiva, sincoGlobal: updated });
  };

  // Comparativo
  const hasAuto = sincoResultRows.length > 0;
  const hasManual = (carpetaActiva.sincoManual ?? []).length > 0;
  const autoResumen = hasAuto ? consolidarSinco(sincoResultRows) : null;
  const manualRecords = hasManual
    ? (carpetaActiva.sincoManual ?? []).filter(e => e.num_siniestros > 0 || e.fec_ini_cobertura || e.codigo_retorno).map(e => ({
        matricula: e.matricula, num_siniestros: String(e.num_siniestros),
        fec_ini_cobertura: e.fec_ini_cobertura, fec_vcto: e.fec_vcto,
        codigo_retorno: e.codigo_retorno, garantias: e.garantias,
      }))
    : [];
  const manualResumen = manualRecords.length > 0 ? consolidarSinco(manualRecords) : null;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }} className="custom-scrollbar">
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <section style={{ marginBottom: 28 }}>
          <p style={sectionTitle}>Datos globales de la flota</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Siniestros totales flota</label>
              <input inputMode="numeric" style={inputStyle} value={global.siniestrosTotales}
                onChange={e => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) save({ siniestrosTotales: parseInt(v) || 0 }); }}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(18,64,204,0.5)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(61,112,255,0.22)')} />
            </div>
            <div>
              <label style={labelStyle}>Años de experiencia flota</label>
              <input inputMode="decimal" style={inputStyle} value={global.anyosExperiencia}
                onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d*$/.test(v)) save({ anyosExperiencia: parseFloat(v) || 0 }); }}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(18,64,204,0.5)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(61,112,255,0.22)')} />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Frecuencia global (calculada)</label>
            <div style={{ ...inputStyle, background: 'rgba(3,10,42,0.3)', color: freqCalc > 0 ? '#3366FF' : 'rgba(255,255,255,0.3)', fontWeight: 800, fontFamily: 'monospace' }}>
              {freqCalc > 0 ? `${freqCalc.toFixed(2)}%` : '—'}
            </div>
          </div>
          <div>
            <label style={labelStyle}>Observaciones</label>
            <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={global.observaciones}
              onChange={e => save({ observaciones: e.target.value })}
              onFocus={e => (e.currentTarget.style.borderColor = 'rgba(18,64,204,0.5)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'rgba(61,112,255,0.22)')} />
          </div>
        </section>

        {/* Panel comparativo */}
        {(hasAuto || hasManual) && (
          <section>
            <p style={sectionTitle}>Comparativo con otras fuentes</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {autoResumen && (
                <div style={{ ...kpiBox, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(178,198,245,0.7)' }}>SINCO por vehículo</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#FFFFFF', fontFamily: 'monospace' }}>
                    {autoResumen.totalSiniestros} siniestros, freq {fmtFreq(autoResumen.frecuencia)}
                  </span>
                </div>
              )}
              {manualResumen && (
                <div style={{ ...kpiBox, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(178,198,245,0.7)' }}>SINCO manual</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#FFFFFF', fontFamily: 'monospace' }}>
                    {manualResumen.totalSiniestros} siniestros, freq {fmtFreq(manualResumen.frecuencia)}
                  </span>
                </div>
              )}
              {freqCalc > 0 && (
                <div style={{ ...kpiBox, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(178,198,245,0.7)' }}>Global flota</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#FFFFFF', fontFamily: 'monospace' }}>
                    {global.siniestrosTotales} siniestros, freq {`${freqCalc.toFixed(2)}%`}
                  </span>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// ─── MODO CONSOLIDADO ───────────────────────────────────────────────────────

function ModoConsolidado({ sincoResultRows, carpetaActiva }: Pick<Props, 'sincoResultRows' | 'carpetaActiva'>) {
  const hasAuto = sincoResultRows.length > 0;
  const manualEntries = carpetaActiva.sincoManual ?? [];
  const hasManual = manualEntries.some(e => e.num_siniestros > 0 || e.fec_ini_cobertura || e.codigo_retorno);
  const hasGlobal = carpetaActiva.sincoGlobal && (carpetaActiva.sincoGlobal.siniestrosTotales > 0 || carpetaActiva.sincoGlobal.anyosExperiencia > 0);

  const autoResumen = hasAuto ? consolidarSinco(sincoResultRows) : null;

  const manualRecords = manualEntries
    .filter(e => e.num_siniestros > 0 || e.fec_ini_cobertura || e.codigo_retorno)
    .map(e => ({
      matricula: e.matricula, num_siniestros: String(e.num_siniestros),
      fec_ini_cobertura: e.fec_ini_cobertura, fec_vcto: e.fec_vcto,
      codigo_retorno: e.codigo_retorno, garantias: e.garantias,
    }));
  const manualResumen = manualRecords.length > 0 ? consolidarSinco(manualRecords) : null;

  const globalData = carpetaActiva.sincoGlobal;

  // Tabla unificada
  type UnifiedRow = { matricula: string; fuente: string; siniestros: string; inicio: string; vencimiento: string; garantias: string };
  const unifiedRows: UnifiedRow[] = [];

  if (hasAuto) {
    sincoResultRows.forEach(r => {
      unifiedRows.push({
        matricula: r['Matrícula'] ?? r['matricula'] ?? '',
        fuente: 'Auto',
        siniestros: r['Num_Siniestros'] ?? r['num_siniestros'] ?? '',
        inicio: r['Fec_Ini_Cobertura'] ?? r['fec_ini_cobertura'] ?? '',
        vencimiento: r['Fec_Vcto'] ?? r['fec_vcto'] ?? '',
        garantias: r['Garantias'] ?? r['garantias'] ?? '',
      });
    });
  }

  if (hasManual) {
    manualEntries
      .filter(e => e.num_siniestros > 0 || e.fec_ini_cobertura || e.codigo_retorno)
      .forEach(e => {
        unifiedRows.push({
          matricula: e.matricula,
          fuente: 'Manual',
          siniestros: String(e.num_siniestros),
          inicio: e.fec_ini_cobertura,
          vencimiento: e.fec_vcto,
          garantias: e.garantias,
        });
      });
  }

  const noData = !hasAuto && !hasManual && !hasGlobal;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }} className="custom-scrollbar">
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        {noData ? (
          <p style={{ color: 'rgba(178,198,245,0.6)', fontSize: 12, textAlign: 'center', padding: '60px 0' }}>
            Sin datos SINCO. Usa los modos Automático, Por matrícula o Global para cargar información.
          </p>
        ) : (
          <>
            {/* Paneles KPI */}
            {autoResumen && (
              <KpiPanel label="SINCO Automático" kpis={[
                { label: 'Vehículos', value: String(autoResumen.totalVehiculos) },
                { label: 'Con SINCO', value: String(autoResumen.vehiculosConSinco) },
                { label: 'Siniestros', value: String(autoResumen.totalSiniestros) },
                { label: 'Años media', value: fmt(autoResumen.antiguedadMedia) },
                { label: 'Siniestros / año', value: fmt(autoResumen.siniestrosPorAnio) },
                { label: 'Frecuencia', value: fmtFreq(autoResumen.frecuencia) },
              ]} />
            )}
            {manualResumen && (
              <KpiPanel label="SINCO Manual" kpis={[
                { label: 'Vehículos', value: String(manualResumen.totalVehiculos) },
                { label: 'Con SINCO', value: String(manualResumen.vehiculosConSinco) },
                { label: 'Siniestros', value: String(manualResumen.totalSiniestros) },
                { label: 'Años media', value: fmt(manualResumen.antiguedadMedia) },
                { label: 'Siniestros / año', value: fmt(manualResumen.siniestrosPorAnio) },
                { label: 'Frecuencia', value: fmtFreq(manualResumen.frecuencia) },
              ]} />
            )}
            {hasGlobal && globalData && (
              <KpiPanel label="Global Flota" kpis={[
                { label: 'Siniestros totales', value: String(globalData.siniestrosTotales) },
                { label: 'Años experiencia', value: fmt(globalData.anyosExperiencia) },
                { label: 'Frecuencia', value: globalData.frecuencia > 0 ? `${(globalData.frecuencia * 100).toFixed(1)}%` : '—' },
              ]} />
            )}

            {/* Tabla unificada */}
            {unifiedRows.length > 0 && (
              <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid #e5e7eb', marginTop: 8 }}>
                <div style={{ overflowX: 'auto', maxHeight: 400, background: '#fff' }} className="custom-scrollbar">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#f3f4f6', position: 'sticky', top: 0, zIndex: 1 }}>
                        {['Matrícula', 'Fuente', 'Nº Siniestros', 'Inicio Cobertura', 'Vencimiento', 'Garantías'].map(h => (
                          <th key={h} style={thS}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {unifiedRows.map((row, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ ...tdS, fontWeight: 700 }}>{row.matricula || <span style={{ color: '#d1d5db' }}>—</span>}</td>
                          <td style={tdS}>
                            <span style={{
                              fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 4,
                              background: row.fuente === 'Auto' ? 'rgba(18,64,204,0.1)' : 'rgba(234,179,8,0.1)',
                              color: row.fuente === 'Auto' ? '#3366FF' : '#fbbf24',
                            }}>{row.fuente}</span>
                          </td>
                          <td style={tdS}>{row.siniestros || '—'}</td>
                          <td style={tdS}>{row.inicio || '—'}</td>
                          <td style={tdS}>{row.vencimiento || '—'}</td>
                          <td style={tdS}>{row.garantias || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ───────────────────────────────────────────────────

export default function HojaSincoUnificado(props: Props) {
  const [modo, setModo] = useState<Modo>('AUTOMATICO');

  const modos: { id: Modo; label: string; offline?: boolean }[] = [
    { id: 'AUTOMATICO', label: 'Automático', offline: true },
    { id: 'POR_MATRICULA', label: 'Por matrícula' },
    { id: 'GLOBAL_FLOTA', label: 'Global flota' },
    { id: 'CONSOLIDADO', label: 'Consolidado' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Selector de modo */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4, padding: '10px 24px',
        borderBottom: '1px solid rgba(61,112,255,0.16)', background: 'rgba(0,7,45,0.6)', flexShrink: 0,
      }}>
        {modos.map(m => (
          <button key={m.id} onClick={() => setModo(m.id)}
            style={modo === m.id ? pillActive : pillInactive}
            onMouseEnter={e => { if (modo !== m.id) (e.currentTarget.style.color = 'rgba(178,198,245,0.78)'); }}
            onMouseLeave={e => { if (modo !== m.id) (e.currentTarget.style.color = 'rgba(255,255,255,0.35)'); }}>
            {m.label}
            {m.offline && (
              <span style={{
                marginLeft: 6, fontSize: 8, fontWeight: 900, padding: '1px 5px', borderRadius: 4,
                background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.3)',
                color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.04em', verticalAlign: 'middle',
              }}>SIN VPS</span>
            )}
          </button>
        ))}
      </div>

      {/* Banner offline para modo automático */}
      {modo === 'AUTOMATICO' && (
        <div style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 24px',
          background: 'rgba(234,179,8,0.06)',
          borderBottom: '1px solid rgba(234,179,8,0.2)',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span style={{ fontSize: 11, color: '#fbbf24', flex: 1 }}>
            <strong>Servidor SINCO no conectado.</strong> El modo automático requiere VPS. Usa <em>Por matrícula</em> para entrada manual o <em>Global flota</em> para datos agregados.
          </span>
          <button onClick={() => setModo('POR_MATRICULA')} style={{
            fontSize: 10, fontWeight: 700, padding: '5px 12px', borderRadius: 6,
            background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.35)',
            color: '#fbbf24', cursor: 'pointer', whiteSpace: 'nowrap',
          }}>Ir a entrada manual</button>
        </div>
      )}

      {/* Contenido del modo */}
      {modo === 'AUTOMATICO' && (
        <ModoAutomatico
          header={props.header}
          trabajoRows={props.trabajoRows}
          sincoResultRows={props.sincoResultRows}
          onSincoResultChange={props.onSincoResultChange}
          onTrabajoChange={props.onTrabajoChange}
        />
      )}
      {modo === 'POR_MATRICULA' && (
        <ModoPorMatricula
          trabajoRows={props.trabajoRows}
          carpetaActiva={props.carpetaActiva}
          onCarpetaChange={props.onCarpetaChange}
        />
      )}
      {modo === 'GLOBAL_FLOTA' && (
        <ModoGlobalFlota
          carpetaActiva={props.carpetaActiva}
          onCarpetaChange={props.onCarpetaChange}
          sincoResultRows={props.sincoResultRows}
        />
      )}
      {modo === 'CONSOLIDADO' && (
        <ModoConsolidado
          sincoResultRows={props.sincoResultRows}
          carpetaActiva={props.carpetaActiva}
        />
      )}
    </div>
  );
}
