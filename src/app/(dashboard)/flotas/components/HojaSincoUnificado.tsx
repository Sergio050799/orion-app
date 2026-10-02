"use client";

import React, { useState, useCallback, useRef } from 'react';
import {
  mergeSincoToTrabajo,
  contarVehiculos,
  calcularAntiguedad, calcularSiniestrosPorAnio, calcularFrecuencia,
  normalizarPoliza,
} from '@/core/flotas';
import type { FlotaCarpeta, DanosPropiosData } from '@/core/flotas';
import type { FlotaHeader } from './types';
import { SINCO_COL_NAMES } from './constants';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface Props {
  header: FlotaHeader;
  trabajoRows: Record<string, string>[];
  carpetaActiva: FlotaCarpeta;
  sincoResultRows: Record<string, string>[];
  onSincoResultChange: (rows: Record<string, string>[]) => void;
  onTrabajoChange: (rows: Record<string, string>[]) => void;
  onCarpetaChange: (c: FlotaCarpeta) => void;
}

// ─── Estilos ─────────────────────────────────────────────────────────────────

const pillBase: React.CSSProperties = {
  padding: '6px 14px', fontSize: 10, fontWeight: 800, borderRadius: 8,
  border: 'none', cursor: 'pointer', textTransform: 'uppercase',
  letterSpacing: '0.06em', transition: 'all 0.15s',
};

const sectionTitle: React.CSSProperties = {
  fontSize: 10, fontWeight: 900, color: 'rgba(178,198,245,0.5)',
  textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14,
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

// ─── SINCO AUTOMÁTICO ────────────────────────────────────────────────────────

function AutomaticoContent({ header, trabajoRows, sincoResultRows, onSincoResultChange, onTrabajoChange }: Pick<Props, 'header' | 'trabajoRows' | 'sincoResultRows' | 'onSincoResultChange' | 'onTrabajoChange'>) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragCounter, setDragCounter] = useState(0);

  const handleExport = useCallback(async () => {
    const ExcelJS = (await import('exceljs')).default;
    function inferTipoDocumento(cif: string): string {
      if (!cif) return 'C';
      const first = cif[0].toUpperCase();
      if (first === 'P') return 'P';
      if (first === 'X' || first === 'Y' || first === 'Z') return 'R';
      return 'C';
    }
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
        const rowCif = r['cif_nif']?.trim() || header.cif;
        const rowData: string[] = Array(16).fill('');
        rowData[0] = 'MMT';
        rowData[1] = inferTipoDocumento(rowCif);
        rowData[2] = rowCif;
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

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const XLSX = await import('xlsx');
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target?.result, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
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

  const handleMerge = useCallback(() => {
    const merged = mergeSincoToTrabajo(trabajoRows, sincoResultRows);
    onTrabajoChange(merged);
  }, [trabajoRows, sincoResultRows, onTrabajoChange]);

  const matriculas = sincoResultRows.map(r => r['Matrícula'] ?? r['matricula'] ?? '').filter(Boolean);
  const numSiniestros = sincoResultRows.reduce((acc, r) => acc + (parseInt(r['Num_Siniestros'] ?? r['num_siniestros'] ?? '0') || 0), 0);
  const totalVeh = contarVehiculos(matriculas);
  const exitosas = sincoResultRows.filter(r => {
    const c = r['Codigo_Retorno'] ?? r['codigo_retorno'] ?? '';
    return !c || c.trim() === '' || c.trim() === '0';
  });
  const conSinco = exitosas.length;
  const numAniosList = exitosas.map(r => {
    const aniosRaw = r['Num_Anios_Asegurado'] ?? r['num_anios_asegurado'] ?? '';
    if (aniosRaw.trim()) {
      const n = parseFloat(aniosRaw);
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
    <>
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
    </>
  );
}

// ─── DAÑOS PROPIOS ───────────────────────────────────────────────────────────

function DanosPropiosSection({ carpetaActiva, trabajoRows, sincoResultRows, onCarpetaChange }: Pick<Props, 'carpetaActiva' | 'trabajoRows' | 'sincoResultRows' | 'onCarpetaChange'>) {
  const data = carpetaActiva.danosPropios;
  const numSiniestros = data?.numSiniestros ?? 0;
  const mostrarEnInforme = data?.mostrarEnInforme ?? false;

  const save = (update: Partial<DanosPropiosData>) => {
    onCarpetaChange({
      ...carpetaActiva,
      danosPropios: { mostrarEnInforme, numSiniestros, ...data, ...update },
    });
  };

  // Derivar vehículos y antigüedad de los datos ya cargados (igual que SINCO automático)
  const totalVeh = trabajoRows.filter(r => r['matricula']?.trim()).length;
  const exitosas = sincoResultRows.filter(r => {
    const c = r['Codigo_Retorno'] ?? r['codigo_retorno'] ?? '';
    return !c || c.trim() === '' || c.trim() === '0';
  });
  const numAniosList = exitosas.map(r => {
    const aniosRaw = r['Num_Anios_Asegurado'] ?? r['num_anios_asegurado'] ?? '';
    if (aniosRaw.trim()) {
      const n = parseFloat(aniosRaw);
      if (!isNaN(n) && n >= 0.08) return n;
    }
    const fec = r['Fec_Ini_Cobertura'] ?? r['fec_ini_cobertura'] ?? '';
    if (fec.trim()) { const y = calcularAntiguedad(fec); if (y > 0) return y; }
    return 0;
  }).filter(n => n > 0);
  const antiguedMedia = numAniosList.length > 0 ? numAniosList.reduce((a, b) => a + b, 0) / numAniosList.length : 0;
  const sinAnio = calcularSiniestrosPorAnio(numSiniestros, antiguedMedia);
  const frecuencia = calcularFrecuencia(sinAnio, totalVeh > 0 ? totalVeh : 1);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <p style={{ ...sectionTitle, marginBottom: 0 }}>Daños Propios</p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={mostrarEnInforme}
            onChange={e => save({ mostrarEnInforme: e.target.checked })}
            style={{ width: 14, height: 14, accentColor: '#3366FF', cursor: 'pointer' }}
          />
          <span style={{
            fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
            color: mostrarEnInforme ? '#3366FF' : 'rgba(178,198,245,0.45)',
          }}>Mostrar en el informe</span>
        </label>
      </div>

      {/* Input nº siniestros */}
      <div style={{ marginBottom: 20 }}>
        <p style={{ ...sectionTitle, marginBottom: 8 }}>Nº siniestros daños propios</p>
        <input
          inputMode="numeric"
          value={numSiniestros > 0 ? numSiniestros : ''}
          placeholder="0"
          onChange={e => {
            const val = e.target.value;
            if (val === '' || /^\d+$/.test(val))
              save({ numSiniestros: val === '' ? 0 : parseInt(val) || 0 });
          }}
          style={{
            width: 120, fontSize: 18, fontWeight: 900, padding: '10px 14px', borderRadius: 10,
            background: 'rgba(6,14,50,0.55)', border: '1px solid rgba(61,112,255,0.3)',
            color: numSiniestros > 0 ? '#f87171' : '#FFFFFF', outline: 'none',
            fontFamily: 'monospace', textAlign: 'center',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = 'rgba(18,64,204,0.7)')}
          onBlur={e => (e.currentTarget.style.borderColor = 'rgba(61,112,255,0.3)')}
        />
      </div>

      {/* KPIs — idéntico al panel SINCO automático */}
      <KpiPanel label="Resultado Daños Propios" kpis={[
        { label: 'Vehículos', value: String(totalVeh) },
        { label: 'Siniestros', value: String(numSiniestros) },
        { label: 'Años media', value: fmt(antiguedMedia) },
        { label: 'Siniestros / año', value: fmt(sinAnio) },
        { label: 'Frecuencia', value: fmtFreq(frecuencia) },
      ]} />
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ───────────────────────────────────────────────────

export default function HojaSincoUnificado({
  header, trabajoRows, carpetaActiva, sincoResultRows, onSincoResultChange, onTrabajoChange, onCarpetaChange,
}: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Banner VPS */}
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
        <span style={{ fontSize: 11, color: '#fbbf24' }}>
          <strong>Servidor SINCO no conectado.</strong> Genera el fichero de consulta, procésalo en el VPS SINCO y sube el resultado aquí.
        </span>
      </div>

      {/* Contenido scrollable */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }} className="custom-scrollbar">
        <div style={{ maxWidth: 800, margin: '0 auto' }}>

          <AutomaticoContent
            header={header}
            trabajoRows={trabajoRows}
            sincoResultRows={sincoResultRows}
            onSincoResultChange={onSincoResultChange}
            onTrabajoChange={onTrabajoChange}
          />

          <div style={{ height: 1, background: 'rgba(61,112,255,0.16)', margin: '32px 0' }} />

          <DanosPropiosSection
            carpetaActiva={carpetaActiva}
            trabajoRows={trabajoRows}
            sincoResultRows={sincoResultRows}
            onCarpetaChange={onCarpetaChange}
          />

        </div>
      </div>
    </div>
  );
}
