"use client";

import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  mergeSincoToTrabajo,
  contarVehiculos,
  calcularAntiguedad, calcularSiniestrosPorAnio, calcularFrecuencia,
  normalizarPoliza,
} from '@/core/flotas';
import type { FlotaCarpeta, DanosPropiosData } from '@/core/flotas';
import type { FlotaHeader } from './types';
import { SINCO_COL_NAMES } from './constants';
import { DetailDrawer } from '@/components/saas/DetailDrawer';
import type { DetailDrawerData } from '@/components/saas/DetailDrawer';

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
  fontSize: 10, fontWeight: 900, color: 'var(--t-text-3)',
  textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14,
};

const kpiBox: React.CSSProperties = {
  borderRadius: 8, padding: '10px 14px',
  background: 'var(--t-surface)', border: '1px solid var(--t-line)',
};

const thS: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700,
  borderBottom: '1px solid var(--t-line)', whiteSpace: 'nowrap', userSelect: 'none',
};
const tdS: React.CSSProperties = {
  padding: '6px 10px', fontSize: 12, whiteSpace: 'nowrap', fontFamily: 'monospace',
};

const fmt = (n: number) => isNaN(n) || !isFinite(n) ? '—' : n.toFixed(2);
const fmtFreq = (n: number | null) => n === null ? 'Sin exp.' : (isNaN(n) || !isFinite(n) ? '—' : `${(n * 100).toFixed(1)}%`);

// ─── KPI Panel ──────────────────────────────────────────────────────────────

function KpiPanel({ label, kpis }: { label: string; kpis: { label: string; value: string }[] }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <p style={{ ...sectionTitle, marginBottom: 10 }}>{label}</p>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.min(kpis.length, 5)}, minmax(0, 1fr))`,
        gap: 12,
        borderTop: '1px solid var(--t-line)',
        borderBottom: '1px solid var(--t-line)',
        padding: '17px 0',
      }}>
        {kpis.map(k => (
          <div key={k.label}>
            <small style={{ fontSize: 10, color: 'var(--t-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>{k.label}</small>
            <strong style={{ fontSize: 27, display: 'block', letterSpacing: '-0.5px', color: 'var(--t-text)', fontWeight: 700 }}>{k.value}</strong>
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
  const [sincoDrawerKey, setSincoDrawerKey] = useState<string | null>(null);

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
      if (!isNaN(n) && n > 0) return n;  // n=0 = sin historial, no cuenta como exposición
    }
    const fec = r['Fec_Ini_Cobertura'] ?? r['fec_ini_cobertura'] ?? '';
    if (fec.trim()) {
      const y = calcularAntiguedad(fec);
      if (y > 0) return y;
    }
    return null;
  }).filter((n): n is number => n !== null);
  const vehiculosConExposicion = numAniosList.length;
  const antiguedMedia = vehiculosConExposicion > 0 ? numAniosList.reduce((a, b) => a + b, 0) / vehiculosConExposicion : 0;
  const sinAnio = calcularSiniestrosPorAnio(numSiniestros, antiguedMedia);
  const freq: number | null = (conSinco > 0 && vehiculosConExposicion === 0)
    ? null
    : calcularFrecuencia(sinAnio, conSinco);
  const vehiculosSinco = trabajoRows.filter(r => r['matricula']?.trim()).length;

  // ── By-tipología helpers ──
  const tipoMap = useMemo(() => {
    const m = new Map<string, string>();
    trabajoRows.forEach(r => {
      const mat = (r['matricula'] ?? '').trim().toUpperCase();
      if (mat) m.set(mat, r['tipo_vehiculo'] ?? '—');
    });
    return m;
  }, [trabajoRows]);

  const tipos = useMemo(() => {
    const s = new Set<string>();
    trabajoRows.filter(r => r['matricula']?.trim()).forEach(r => s.add(r['tipo_vehiculo'] ?? '—'));
    return [...s];
  }, [trabajoRows]);

  function buildDetailData(key: string): DetailDrawerData {
    const getSincoTipo = (r: Record<string, string>) => {
      const mat = (r['Matrícula'] ?? r['matricula'] ?? '').trim().toUpperCase();
      return tipoMap.get(mat) ?? '—';
    };
    const nf = (n: number) => String(n);
    const dec = (n: number, d: number) => (isNaN(n) || !isFinite(n)) ? '—' : n.toFixed(d);
    const pc = (n: number, d: number) => (isNaN(n) || !isFinite(n)) ? '—' : `${(n * 100).toFixed(d)}%`;

    if (key === 'veh') {
      const rows = tipos.map(t => [t, nf(trabajoRows.filter(r => (r['matricula'] ?? '').trim() && (r['tipo_vehiculo'] ?? '—') === t).length)] as [string, string]);
      return {
        over: 'Resultado · SINCO',
        title: 'Vehículos',
        desc: 'Matrículas incluidas en la consulta SINCO.',
        stats: [['Vehículos', nf(totalVeh)]],
        head: ['Tipología', 'Vehículos'],
        rows,
        fx: [['Total matrículas', `CONTARA(matrícula) = ${nf(totalVeh)}`]],
      };
    }
    if (key === 'con') {
      const rows = tipos.map(t => {
        const ts = sincoResultRows.filter(r => getSincoTipo(r) === t);
        const con = ts.filter(r => { const c = r['Codigo_Retorno'] ?? r['codigo_retorno'] ?? ''; return !c || c.trim() === '' || c.trim() === '0'; }).length;
        return [t, nf(con), nf(ts.length - con)];
      });
      return {
        over: 'Resultado · SINCO',
        title: 'Vehículos con SINCO',
        desc: 'Vehículos para los que SINCO devolvió resultado.',
        stats: [['Con SINCO', nf(conSinco)], ['Sin resultado', nf(totalVeh - conSinco)]],
        head: ['Tipología', 'Con SINCO', 'Sin resultado'],
        rows,
        fx: [['Vehículos con SINCO', `CONTARA(Codigo_Retorno) = ${nf(conSinco)}`]],
      };
    }
    if (key === 'sin') {
      const vecsConSin = sincoResultRows.filter(r => (parseInt(r['Num_Siniestros'] ?? '0') || 0) > 0).length;
      const rows = tipos.map(t => {
        const sins = sincoResultRows.filter(r => getSincoTipo(r) === t).reduce((acc, r) => acc + (parseInt(r['Num_Siniestros'] ?? r['num_siniestros'] ?? '0') || 0), 0);
        return [t, nf(sins)];
      });
      return {
        over: 'Resultado · SINCO',
        title: 'Siniestros',
        desc: 'Siniestros declarados en los últimos años por los vehículos con resultado.',
        stats: [['Siniestros', nf(numSiniestros)], ['Vehículos con siniestros', nf(vecsConSin)]],
        head: ['Tipología', 'Siniestros'],
        rows,
        fx: [['Total siniestros', `SUMA(Num_Siniestros) = ${nf(numSiniestros)}`]],
      };
    }
    if (key === 'ant') {
      const rows = tipos.map(t => {
        const tipoExitosas = exitosas.filter(r => getSincoTipo(r) === t);
        const aniosList = tipoExitosas.map(r => {
          const aniosRaw = r['Num_Anios_Asegurado'] ?? r['num_anios_asegurado'] ?? '';
          if (aniosRaw.trim()) { const n = parseFloat(aniosRaw); if (!isNaN(n) && n > 0) return n; }
          const fec = r['Fec_Ini_Cobertura'] ?? r['fec_ini_cobertura'] ?? '';
          if (fec.trim()) { const y = calcularAntiguedad(fec); if (y > 0) return y; }
          return null;
        }).filter((n): n is number => n !== null);
        const media = aniosList.length > 0 ? aniosList.reduce((a, b) => a + b, 0) / aniosList.length : null;
        return [t, media !== null ? `${dec(media, 1)} años` : '—'];
      });
      return {
        over: 'Resultado · SINCO',
        title: 'Antigüedad media',
        desc: 'Años medios de permanencia de los vehículos asegurados.',
        stats: [['Antigüedad media', `${dec(antiguedMedia, 2)} años`], ['Con exposición', nf(vehiculosConExposicion)]],
        head: ['Tipología', 'Antigüedad media'],
        rows,
        fx: [
          ['Antigüedad de un vehículo', '(HOY − Fec_Ini_Cobertura) ÷ 365,25'],
          ['Antigüedad media', `PROMEDIO(antigüedad) = ${dec(antiguedMedia, 2)} años, sobre ${nf(vehiculosConExposicion)} vehículos con exposición`],
        ],
      };
    }
    // key === 'fr'
    const freqDisplay = freq === null ? 'Sin exp.' : (isNaN(freq) || !isFinite(freq) ? '—' : `${(freq * 100).toFixed(2)}%`);
    const sinAnioDisplay = dec(sinAnio, 2);
    return {
      over: 'Resultado · SINCO',
      title: 'Frecuencia',
      desc: 'Siniestros anuales por vehículo asegurado.',
      stats: [['Siniestros / año', sinAnioDisplay], ['Frecuencia', freqDisplay]],
      head: ['Concepto', 'Valor'],
      rows: [
        ['Total siniestros', nf(numSiniestros)],
        ['Antigüedad media', `${dec(antiguedMedia, 2)} años`],
        ['Siniestros por año', sinAnioDisplay],
        ['Vehículos con SINCO', nf(conSinco)],
        ['Frecuencia', freqDisplay],
      ],
      fx: [
        ['Siniestros por año', `Total siniestros ÷ Antigüedad media = ${nf(numSiniestros)} ÷ ${dec(antiguedMedia, 2)} = ${sinAnioDisplay}`],
        ['Frecuencia', `(Siniestros por año) ÷ Vehículos con SINCO × 100 = ${sinAnioDisplay} ÷ ${nf(conSinco)} × 100 = ${freqDisplay}`],
      ],
    };
  }

  return (
    <>
      <section style={{ marginBottom: 28 }}>
        <p style={sectionTitle}>Generar consulta SINCO</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={handleExport}
            style={{ ...pillBase, background: 'transparent', color: 'var(--t-text)', border: '1px solid var(--t-line)', fontSize: 11, padding: '8px 16px' }}>
            Descargar consulta SINCO (.xlsx)
          </button>
          <span style={{ fontSize: 11, color: 'var(--t-text-2)' }}>
            {vehiculosSinco} vehículos preparados
          </span>
        </div>
      </section>

      <section style={{ marginBottom: 28 }}>
        <p style={sectionTitle}>Importar resultado SINCO</p>
        <div
          style={{
            padding: '16px 20px', borderRadius: 10,
            border: dragCounter > 0 ? '1px dashed var(--t-blue)' : '1px dashed transparent',
            background: dragCounter > 0 ? 'var(--t-line-soft)' : 'transparent',
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
            style={{ ...pillBase, background: 'transparent', color: 'var(--t-text)', border: '1px solid var(--t-line)', fontSize: 11, padding: '8px 16px' }}>
            {dragCounter > 0 ? 'Suelta el archivo aqui' : 'Importar resultado SINCO (.xlsx)'}
          </button>
        </div>
      </section>

      {sincoResultRows.length > 0 && (
        <>
          <div className="stat3" style={{ marginBottom: 20 }}>
            <button onClick={() => setSincoDrawerKey('veh')}>
              <label>Vehículos</label>
              <strong>{String(totalVeh)}</strong>
            </button>
            <button onClick={() => setSincoDrawerKey('con')}>
              <label>Con SINCO</label>
              <strong>{String(conSinco)}</strong>
            </button>
            <button onClick={() => setSincoDrawerKey('sin')}>
              <label>Siniestros</label>
              <strong>{String(numSiniestros)}</strong>
            </button>
            <button onClick={() => setSincoDrawerKey('ant')}>
              <label>Antigüedad media</label>
              <strong>{vehiculosConExposicion > 0 ? fmt(antiguedMedia) + 'a' : '—'}</strong>
            </button>
            <button onClick={() => setSincoDrawerKey('fr')}>
              <label>Frecuencia</label>
              <strong>{fmtFreq(freq)}</strong>
            </button>
          </div>

          <div style={{ marginBottom: 16, display: 'flex', gap: 10 }}>
            <button onClick={handleMerge}
              style={{ ...pillBase, background: 'transparent', color: 'var(--t-blue)', border: '1px solid var(--t-line)', fontSize: 11, padding: '8px 16px' }}>
              Volcar a TRABAJO
            </button>
          </div>

          <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--t-line)' }}>
            <div style={{ overflowX: 'auto', maxHeight: 400, background: 'var(--t-bg)' }} className="custom-scrollbar">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--t-line-soft)', position: 'sticky', top: 0, zIndex: 1 }}>
                    <th style={{ ...thS, width: 44, color: 'var(--t-text-3)' }}>#</th>
                    {SINCO_COL_NAMES.map((name, i) => (
                      <th key={name} style={{ ...thS, background: i < 5 ? 'var(--t-line-soft)' : 'var(--t-line-soft)', color: i < 5 ? 'var(--t-blue)' : 'var(--t-text-3)' }}>{name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sincoResultRows.map((row, ri) => (
                    <tr key={ri} style={{ borderBottom: '1px solid var(--t-line)' }}>
                      <td style={{ ...tdS, color: 'var(--t-text-3)', textAlign: 'center' }}>{ri + 1}</td>
                      {SINCO_COL_NAMES.map((name, ci) => (
                        <td key={ci} style={{ ...tdS, background: ci < 5 ? 'var(--t-line-soft)' : 'var(--t-bg)', color: ci < 5 ? 'var(--t-text-2)' : 'var(--t-text)' }}>
                          {row[name] || <span style={{ color: 'var(--t-text-3)' }}>—</span>}
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

      <DetailDrawer
        isOpen={sincoDrawerKey !== null}
        onClose={() => setSincoDrawerKey(null)}
        data={sincoDrawerKey ? buildDetailData(sincoDrawerKey) : null}
      />
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
      if (!isNaN(n) && n >= 0) return n;
    }
    const fec = r['Fec_Ini_Cobertura'] ?? r['fec_ini_cobertura'] ?? '';
    if (fec.trim()) { const y = calcularAntiguedad(fec); if (y > 0) return y; }
    return null;
  }).filter((n): n is number => n !== null);
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
            color: mostrarEnInforme ? 'var(--t-blue)' : 'var(--t-text-3)',
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
            background: 'var(--t-bg)', border: '1px solid var(--t-line)',
            color: numSiniestros > 0 ? 'var(--t-red)' : 'var(--t-text)', outline: 'none',
            fontFamily: 'monospace', textAlign: 'center',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = 'var(--t-blue)')}
          onBlur={e => (e.currentTarget.style.borderColor = 'var(--t-line)')}
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
      {/* ── Cabecera de paso ── */}
      <div className="sh" style={{ flexShrink: 0, padding: '20px 32px', borderBottom: '1px solid var(--line)' }}>
        <div>
          <h2><b>05</b>SINCO</h2>
          <p>Descarga la consulta, procésala en el servidor SINCO e importa el resultado.</p>
        </div>
        <div className="acts">
          {/* Acciones están dentro del contenido */}
        </div>
      </div>
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

          <div style={{ height: 1, background: 'var(--t-line)', margin: '32px 0' }} />

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
