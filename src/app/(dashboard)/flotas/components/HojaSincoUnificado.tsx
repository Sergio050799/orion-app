"use client";

import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  consolidarSinco, mergeSincoToTrabajo,
  contarVehiculos, contarVehiculosConSinco,
  calcularAntiguedadMedia, calcularSiniestrosPorAnio, calcularFrecuencia,
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
  ...pillBase, background: 'rgba(99,102,241,0.2)', color: '#818cf8',
};
const pillInactive: React.CSSProperties = {
  ...pillBase, background: 'transparent', color: 'rgba(255,255,255,0.35)',
};

const sectionTitle: React.CSSProperties = {
  fontSize: 10, fontWeight: 900, color: 'rgba(255,255,255,0.3)',
  textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14,
};

const inputStyle: React.CSSProperties = {
  width: '100%', fontSize: 12, padding: '7px 10px', borderRadius: 8,
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
  color: '#e2e8f0', outline: 'none', fontFamily: 'inherit',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 800, color: 'rgba(129,140,248,0.8)',
  textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4,
};

const kpiBox: React.CSSProperties = {
  borderRadius: 8, padding: '10px 14px',
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
};

const thS: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700,
  borderBottom: '1px solid #d1d5db', whiteSpace: 'nowrap', userSelect: 'none',
};
const tdS: React.CSSProperties = {
  padding: '6px 10px', fontSize: 12, whiteSpace: 'nowrap', fontFamily: 'monospace',
};

const fmt = (n: number) => isNaN(n) || !isFinite(n) ? '—' : n.toFixed(2);

// ─── KPI Panel ──────────────────────────────────────────────────────────────

function KpiPanel({ label, kpis }: { label: string; kpis: { label: string; value: string }[] }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <p style={{ ...sectionTitle, marginBottom: 10 }}>{label}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {kpis.map(k => (
          <div key={k.label} style={kpiBox}>
            <div style={{ fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k.label}</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#e2e8f0', fontFamily: 'monospace', marginTop: 2 }}>{k.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MODO AUTOMÁTICO ────────────────────────────────────────────────────────

function ModoAutomatico({ header, trabajoRows, sincoResultRows, onSincoResultChange, onTrabajoChange }: Pick<Props, 'header' | 'trabajoRows' | 'sincoResultRows' | 'onSincoResultChange' | 'onTrabajoChange'>) {
  const fileRef = useRef<HTMLInputElement>(null);

  // Generar Excel de consulta
  const handleExport = useCallback(() => {
    function inferTipoDocumento(cif: string): string {
      if (!cif) return 'C';
      const first = cif[0].toUpperCase();
      if (first === 'P') return 'P';
      if (first === 'X' || first === 'Y' || first === 'Z') return 'R';
      return 'C';
    }
    const tipoDoc = inferTipoDocumento(header.cif);
    const rows = trabajoRows
      .filter(r => r['matricula']?.trim())
      .map(r => {
        const row: string[] = Array(15).fill('');
        row[0] = 'MMT';
        row[1] = tipoDoc;
        row[2] = header.cif;
        row[3] = r['poliza_sinco']?.trim() || normalizarPoliza(r['num_poliza_actual'] ?? '');
        row[4] = r['matricula'] ?? '';
        return row;
      });
    const wsData = [SINCO_COL_NAMES, ...rows];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = SINCO_COL_NAMES.map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, ws, 'SINCO');
    XLSX.writeFile(wb, `SINCO_${header.cif || 'flota'}.xlsx`);
  }, [header, trabajoRows]);

  // Importar resultado
  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target?.result, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
      const dataRows = raw.slice(1);
      const parsed = dataRows
        .map(r => r.map(c => String(c ?? '')))
        .filter(r => r.some(c => c.trim() !== ''));
      const asRecords = parsed.map(r => {
        const obj: Record<string, string> = {};
        SINCO_COL_NAMES.forEach((name, i) => { obj[name] = r[i] ?? ''; });
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

  // Métricas del resultado importado
  const matriculas = sincoResultRows.map(r => r['Matrícula'] ?? r['matricula'] ?? '').filter(Boolean);
  const codigosRet = sincoResultRows.map(r => r['Codigo_Retorno'] ?? r['codigo_retorno'] ?? '');
  const fecInis = sincoResultRows.map(r => r['Fec_Ini_Cobertura'] ?? r['fec_ini_cobertura'] ?? '').filter(Boolean);
  const numSiniestros = sincoResultRows.reduce((acc, r) => acc + (parseInt(r['Num_Siniestros'] ?? r['num_siniestros'] ?? '') || 0), 0);
  const totalVeh = contarVehiculos(matriculas);
  const conSinco = contarVehiculosConSinco(codigosRet);
  const antiguedMedia = calcularAntiguedadMedia(fecInis.map(f => {
    const d = new Date(f.includes('/') ? f.split('/').reverse().join('-') : f);
    return isNaN(d.getTime()) ? 0 : (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  }));
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
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
              {vehiculosSinco} vehículos preparados
            </span>
          </div>
        </section>

        {/* Sección importar */}
        <section style={{ marginBottom: 28 }}>
          <p style={sectionTitle}>Importar resultado SINCO</p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImport} />
          <button onClick={() => fileRef.current?.click()}
            style={{ ...pillBase, background: 'rgba(124,58,237,0.1)', color: '#7c3aed', border: '1px solid rgba(124,58,237,0.25)', fontSize: 11, padding: '8px 16px' }}>
            Importar resultado SINCO (.xlsx)
          </button>
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
              { label: 'Frecuencia', value: fmt(freq) },
            ]} />

            <div style={{ marginBottom: 16, display: 'flex', gap: 10 }}>
              <button onClick={handleMerge}
                style={{ ...pillBase, background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.3)', fontSize: 11, padding: '8px 16px' }}>
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
            { label: 'Frecuencia', value: fmt(resumen.frecuencia) },
          ]} />
        )}

        {matriculas.length === 0 ? (
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, textAlign: 'center', padding: '40px 0' }}>
            Sin matrículas en TRABAJO. Añade vehículos primero.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {matriculas.map(mat => {
              const isOpen = expanded === mat;
              const entry = getEntry(mat);
              const hasSiniestros = entry.num_siniestros > 0;
              return (
                <div key={mat} style={{ borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', overflow: 'hidden' }}>
                  {/* Header row */}
                  <button onClick={() => setExpanded(isOpen ? null : mat)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, fontFamily: 'monospace' }}>{mat}</span>
                      {hasSiniestros && (
                        <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>
                          {entry.num_siniestros} siniestros
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▼</span>
                  </button>

                  {/* Expanded form */}
                  {isOpen && (
                    <div style={{ padding: '12px 16px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                        <div>
                          <label style={labelStyle}>Nº Siniestros</label>
                          <input type="number" min="0" style={inputStyle} value={entry.num_siniestros}
                            onChange={e => saveEntry({ ...entry, num_siniestros: parseInt(e.target.value) || 0 })}
                            onFocus={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)')}
                            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')} />
                        </div>
                        <div>
                          <label style={labelStyle}>Inicio cobertura</label>
                          <input type="date" style={inputStyle} value={entry.fec_ini_cobertura}
                            onChange={e => saveEntry({ ...entry, fec_ini_cobertura: e.target.value })}
                            onFocus={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)')}
                            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')} />
                        </div>
                        <div>
                          <label style={labelStyle}>Vencimiento</label>
                          <input type="date" style={inputStyle} value={entry.fec_vcto}
                            onChange={e => saveEntry({ ...entry, fec_vcto: e.target.value })}
                            onFocus={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)')}
                            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')} />
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                        <div>
                          <label style={labelStyle}>Código retorno</label>
                          <input style={inputStyle} value={entry.codigo_retorno}
                            onChange={e => saveEntry({ ...entry, codigo_retorno: e.target.value })}
                            onFocus={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)')}
                            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')} />
                        </div>
                        <div>
                          <label style={labelStyle}>Garantías</label>
                          <input style={inputStyle} value={entry.garantias}
                            onChange={e => saveEntry({ ...entry, garantias: e.target.value })}
                            onFocus={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)')}
                            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')} />
                        </div>
                      </div>
                      <div>
                        <label style={labelStyle}>Observaciones</label>
                        <textarea style={{ ...inputStyle, minHeight: 48, resize: 'vertical' }} value={entry.observaciones}
                          onChange={e => saveEntry({ ...entry, observaciones: e.target.value })}
                          onFocus={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)')}
                          onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')} />
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
              <input type="number" min="0" style={inputStyle} value={global.siniestrosTotales}
                onChange={e => save({ siniestrosTotales: parseInt(e.target.value) || 0 })}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')} />
            </div>
            <div>
              <label style={labelStyle}>Años de experiencia flota</label>
              <input type="number" min="0" step="0.1" style={inputStyle} value={global.anyosExperiencia}
                onChange={e => save({ anyosExperiencia: parseFloat(e.target.value) || 0 })}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')} />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Frecuencia global (calculada)</label>
            <div style={{ ...inputStyle, background: 'rgba(255,255,255,0.02)', color: freqCalc > 0 ? '#818cf8' : 'rgba(255,255,255,0.3)', fontWeight: 800, fontFamily: 'monospace' }}>
              {freqCalc > 0 ? freqCalc.toFixed(4) : '—'}
            </div>
          </div>
          <div>
            <label style={labelStyle}>Observaciones</label>
            <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={global.observaciones}
              onChange={e => save({ observaciones: e.target.value })}
              onFocus={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')} />
          </div>
        </section>

        {/* Panel comparativo */}
        {(hasAuto || hasManual) && (
          <section>
            <p style={sectionTitle}>Comparativo con otras fuentes</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {autoResumen && (
                <div style={{ ...kpiBox, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>SINCO por vehículo</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#e2e8f0', fontFamily: 'monospace' }}>
                    {autoResumen.totalSiniestros} siniestros, freq {fmt(autoResumen.frecuencia)}
                  </span>
                </div>
              )}
              {manualResumen && (
                <div style={{ ...kpiBox, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>SINCO manual</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#e2e8f0', fontFamily: 'monospace' }}>
                    {manualResumen.totalSiniestros} siniestros, freq {fmt(manualResumen.frecuencia)}
                  </span>
                </div>
              )}
              {freqCalc > 0 && (
                <div style={{ ...kpiBox, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>Global flota</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#e2e8f0', fontFamily: 'monospace' }}>
                    {global.siniestrosTotales} siniestros, freq {freqCalc.toFixed(4)}
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
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, textAlign: 'center', padding: '60px 0' }}>
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
                { label: 'Frecuencia', value: fmt(autoResumen.frecuencia) },
              ]} />
            )}
            {manualResumen && (
              <KpiPanel label="SINCO Manual" kpis={[
                { label: 'Vehículos', value: String(manualResumen.totalVehiculos) },
                { label: 'Con SINCO', value: String(manualResumen.vehiculosConSinco) },
                { label: 'Siniestros', value: String(manualResumen.totalSiniestros) },
                { label: 'Años media', value: fmt(manualResumen.antiguedadMedia) },
                { label: 'Siniestros / año', value: fmt(manualResumen.siniestrosPorAnio) },
                { label: 'Frecuencia', value: fmt(manualResumen.frecuencia) },
              ]} />
            )}
            {hasGlobal && globalData && (
              <KpiPanel label="Global Flota" kpis={[
                { label: 'Siniestros totales', value: String(globalData.siniestrosTotales) },
                { label: 'Años experiencia', value: fmt(globalData.anyosExperiencia) },
                { label: 'Frecuencia', value: globalData.frecuencia > 0 ? globalData.frecuencia.toFixed(4) : '—' },
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
                              background: row.fuente === 'Auto' ? 'rgba(99,102,241,0.1)' : 'rgba(234,179,8,0.1)',
                              color: row.fuente === 'Auto' ? '#818cf8' : '#fbbf24',
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

  const modos: { id: Modo; label: string }[] = [
    { id: 'AUTOMATICO', label: 'Automático' },
    { id: 'POR_MATRICULA', label: 'Por matrícula' },
    { id: 'GLOBAL_FLOTA', label: 'Global flota' },
    { id: 'CONSOLIDADO', label: 'Consolidado' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Selector de modo */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4, padding: '10px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.2)', flexShrink: 0,
      }}>
        {modos.map(m => (
          <button key={m.id} onClick={() => setModo(m.id)}
            style={modo === m.id ? pillActive : pillInactive}
            onMouseEnter={e => { if (modo !== m.id) (e.currentTarget.style.color = 'rgba(255,255,255,0.6)'); }}
            onMouseLeave={e => { if (modo !== m.id) (e.currentTarget.style.color = 'rgba(255,255,255,0.35)'); }}>
            {m.label}
          </button>
        ))}
      </div>

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
