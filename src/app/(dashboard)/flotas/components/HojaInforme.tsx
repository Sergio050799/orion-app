"use client";

import React, { useMemo, useState, useEffect } from 'react';
import { consolidarSinco } from '@/core/flotas';
import type { CoberturaRow } from './types';

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
  trabajoRows: Record<string, string>[];
  coberturas: CoberturaRow[];
  sincoResultRows: Record<string, string>[];
  sincoManual: SincoManualEntry[];
  sincoGlobal: SincoGlobal | null;
  primasMmtValues?: Record<string, number>;
  onPrimasMmtChange?: (primas: Record<string, number>) => void;
}

export default function HojaInforme({ trabajoRows, coberturas, sincoResultRows, sincoManual, sincoGlobal, primasMmtValues, onPrimasMmtChange }: Props) {
  // ─── Tabla dinámica tipo×cobertura ─────────────────────────────────────────
  const pivot = useMemo(() => {
    const tipos = new Set<string>();
    const cobs  = new Set<string>();
    const counts: Record<string, Record<string, number>> = {};

    trabajoRows.forEach((r, i) => {
      const tipo = r['tipo_vehiculo'] || 'Sin tipo';
      const cob  = coberturas[i]?.cobertura || r['coberturas_solicitadas'] || 'Sin cobertura';
      tipos.add(tipo);
      cobs.add(cob);
      if (!counts[tipo]) counts[tipo] = {};
      counts[tipo][cob] = (counts[tipo][cob] ?? 0) + 1;
    });

    return {
      tipos: Array.from(tipos),
      cobs:  Array.from(cobs),
      counts,
    };
  }, [trabajoRows, coberturas]);

  // ─── Métricas SINCO (3 fuentes) ────────────────────────────────────────────
  const resumenAuto = useMemo(() => {
    if (sincoResultRows.length === 0) return null;
    return consolidarSinco(sincoResultRows);
  }, [sincoResultRows]);

  const resumenManual = useMemo(() => {
    if (sincoManual.length === 0) return null;
    const manualRecords = sincoManual
      .filter(e => e.num_siniestros > 0 || e.fec_ini_cobertura || e.codigo_retorno)
      .map(e => ({
        num_siniestros: String(e.num_siniestros),
        fec_ini_cobertura: e.fec_ini_cobertura,
        codigo_retorno: e.codigo_retorno,
      }));
    if (manualRecords.length === 0) return null;
    return consolidarSinco(manualRecords);
  }, [sincoManual]);

  const hasSincoData = resumenAuto !== null || resumenManual !== null || sincoGlobal !== null;
  const fmtFreq = (n: number) => isNaN(n) || !isFinite(n) ? '—' : `${n.toFixed(2)}%`;
  const fmt = (n: number) => isNaN(n) || !isFinite(n) ? '—' : n.toFixed(2);

  // ─── Primas agrupadas por tipo de vehículo ─────────────────────────────────
  const tipoGrupos = useMemo(() => {
    const grupos: Record<string, { count: number; sumaPrimaSol: number }> = {};
    trabajoRows.filter(r => r['matricula']?.trim()).forEach(r => {
      const tipo = r['tipo_vehiculo'] || 'Sin tipo';
      const prima = parseFloat(r['prima_referencia'] ?? '');
      if (!grupos[tipo]) grupos[tipo] = { count: 0, sumaPrimaSol: 0 };
      grupos[tipo].count++;
      if (!isNaN(prima)) grupos[tipo].sumaPrimaSol += prima;
    });
    return grupos;
  }, [trabajoRows]);

  const primasSol = useMemo(() => {
    return Object.entries(tipoGrupos).map(([tipo, g]) => ({
      tipo, count: g.count, media: g.count > 0 ? g.sumaPrimaSol / g.count : 0, total: g.sumaPrimaSol,
    }));
  }, [tipoGrupos]);

  // ─── Primas MMT editables ──────────────────────────────────────────────────
  const [mmtInputs, setMmtInputs] = useState<Record<string, number>>(primasMmtValues ?? {});

  useEffect(() => {
    if (primasMmtValues) setMmtInputs(primasMmtValues);
  }, [primasMmtValues]);

  const handleMmtChange = (tipo: string, value: string) => {
    const num = parseFloat(value);
    const updated = { ...mmtInputs };
    if (value === '' || isNaN(num)) {
      delete updated[tipo];
    } else {
      updated[tipo] = num;
    }
    setMmtInputs(updated);
    onPrimasMmtChange?.(updated);
  };

  const mmtRows = useMemo(() => {
    return Object.entries(tipoGrupos).map(([tipo, g]) => {
      const prima = mmtInputs[tipo];
      const total = prima != null ? prima * g.count : null;
      return { tipo, count: g.count, prima: prima ?? null, total };
    });
  }, [tipoGrupos, mmtInputs]);

  const fmtEur = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 0 }) + ' EUR';

  return (
    <div className="flex-1 overflow-auto custom-scrollbar p-4" style={{ background:'#f9fafb' }}>
      <div className="flex gap-4 min-h-0" style={{ flexWrap:'wrap' }}>

        {/* ── Bloque izquierdo ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-4" style={{ flex:'1 1 400px', minWidth:300 }}>

          {/* Pivot */}
          <div className="rounded-xl overflow-hidden" style={{ border:'1px solid #e5e7eb', background:'#ffffff' }}>
            <div style={{ padding:'10px 14px', borderBottom:'1px solid #e5e7eb', background:'#f9fafb' }}>
              <span className="text-[11px] font-black uppercase tracking-widest" style={{ color:'#374151' }}>Composición de flota</span>
            </div>
            <div className="overflow-auto">
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr style={{ background:'#f3f4f6' }}>
                    <th style={thS}>Tipo vehículo</th>
                    {pivot.cobs.map(c=><th key={c} style={thS}>{c||'—'}</th>)}
                    <th style={{ ...thS, fontWeight:900 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {pivot.tipos.map(tipo=>{
                    const total = pivot.cobs.reduce((a,c)=>a+(pivot.counts[tipo]?.[c]??0),0);
                    return (
                      <tr key={tipo} style={{ borderBottom:'1px solid #f3f4f6' }}>
                        <td style={tdS}>{tipo}</td>
                        {pivot.cobs.map(c=><td key={c} style={{...tdS,textAlign:'center'}}>{pivot.counts[tipo]?.[c]??0}</td>)}
                        <td style={{ ...tdS, textAlign:'center', fontWeight:900 }}>{total}</td>
                      </tr>
                    );
                  })}
                  <tr style={{ borderTop:'2px solid #d1d5db', background:'#f9fafb', fontWeight:900 }}>
                    <td style={tdS}>Total</td>
                    {pivot.cobs.map(c=>{
                      const t = pivot.tipos.reduce((a,ti)=>a+(pivot.counts[ti]?.[c]??0),0);
                      return <td key={c} style={{...tdS,textAlign:'center',fontWeight:900}}>{t}</td>;
                    })}
                    <td style={{...tdS,textAlign:'center',fontWeight:900}}>{trabajoRows.filter(r=>r['matricula']?.trim()).length}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* SINCO metrics */}
          <div className="rounded-xl overflow-hidden" style={{ border:'1px solid #e5e7eb', background:'#ffffff' }}>
            <div style={{ padding:'10px 14px', borderBottom:'1px solid #e5e7eb', background:'#f9fafb' }}>
              <span className="text-[11px] font-black uppercase tracking-widest" style={{ color:'#374151' }}>SINCO</span>
            </div>
            {!hasSincoData ? (
              <div style={{ padding:'20px 14px', textAlign:'center', color:'#9ca3af', fontSize:12 }}>Sin datos SINCO</div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column' }}>
                {resumenAuto && (
                  <SincoBlock label="Automático" r={resumenAuto} fmt={fmt} fmtFreq={fmtFreq} />
                )}
                {resumenManual && (
                  <SincoBlock label="Por Matrícula" r={resumenManual} fmt={fmt} fmtFreq={fmtFreq} />
                )}
                {sincoGlobal && (
                  <div style={{ borderTop: resumenAuto || resumenManual ? '1px solid #e5e7eb' : undefined }}>
                    <div style={{ padding:'6px 14px', background:'#f9fafb' }}>
                      <span className="text-[9px] font-black uppercase tracking-widest" style={{ color:'#6366f1' }}>Global Flota</span>
                    </div>
                    <div className="grid grid-cols-3 gap-px" style={{ background:'#e5e7eb' }}>
                      {[
                        ['SINIESTROS', String(sincoGlobal.siniestrosTotales)],
                        ['AÑOS', String(sincoGlobal.anyosExperiencia)],
                        ['FRECUENCIA', fmtFreq(sincoGlobal.frecuencia)],
                      ].map(([label, value]) => (
                        <div key={label} style={{ background:'#ffffff', padding:'10px 14px' }}>
                          <div className="text-[9px] font-black uppercase tracking-widest" style={{ color:'#9ca3af' }}>{label}</div>
                          <div className="text-[16px] font-black" style={{ color:'#111827', fontFamily:'monospace' }}>{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Bloque derecho — Primas ──────────────────────────────────── */}
        <div style={{ flex:'1 1 400px', minWidth:300, display:'flex', flexDirection:'column', gap:16 }}>

          {/* Primas Solicitadas — solo lectura */}
          <div className="rounded-xl overflow-hidden" style={{ border:'1px solid #e5e7eb', background:'#ffffff' }}>
            <div style={{ padding:'10px 14px', borderBottom:'1px solid #e5e7eb', background:'#f9fafb' }}>
              <span className="text-[11px] font-black uppercase tracking-widest" style={{ color:'#374151' }}>Primas solicitadas</span>
            </div>
            <div style={{ maxHeight:240, overflowY:'auto' }} className="custom-scrollbar">
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr style={{ background:'#f3f4f6' }}>
                    {['Tipo Vehículo','N Vehículos','Prima Media','Total'].map(h=><th key={h} style={thS}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {primasSol.length===0
                    ? <tr><td colSpan={4} style={{textAlign:'center',padding:'20px 0',color:'#9ca3af'}}>Sin datos</td></tr>
                    : <>
                        {primasSol.map(r=>(
                          <tr key={r.tipo} style={{ borderBottom:'1px solid #f3f4f6' }}>
                            <td style={tdS}>{r.tipo}</td>
                            <td style={{...tdS,textAlign:'center'}}>{r.count}</td>
                            <td style={{...tdS,textAlign:'right',fontFamily:'monospace'}}>{r.media ? fmtEur(r.media) : '—'}</td>
                            <td style={{...tdS,textAlign:'right',fontFamily:'monospace',fontWeight:700}}>{r.total ? fmtEur(r.total) : '—'}</td>
                          </tr>
                        ))}
                        <tr style={{ borderTop:'2px solid #d1d5db', background:'#f9fafb', fontWeight:900 }}>
                          <td style={tdS}>Total</td>
                          <td style={{...tdS,textAlign:'center'}}>{primasSol.reduce((a,r)=>a+r.count,0)}</td>
                          <td style={tdS}></td>
                          <td style={{...tdS,textAlign:'right',fontFamily:'monospace'}}>{primasSol.reduce((a,r)=>a+r.total,0) ? fmtEur(primasSol.reduce((a,r)=>a+r.total,0)) : '—'}</td>
                        </tr>
                      </>
                  }
                </tbody>
              </table>
            </div>
          </div>

          {/* Primas MMT — editables */}
          <div className="rounded-xl overflow-hidden" style={{ border:'1px solid #e5e7eb', background:'#ffffff' }}>
            <div style={{ padding:'10px 14px', borderBottom:'1px solid #e5e7eb', background:'#f9fafb' }}>
              <span className="text-[11px] font-black uppercase tracking-widest" style={{ color:'#374151' }}>Primas MMT</span>
            </div>
            <div style={{ maxHeight:240, overflowY:'auto' }} className="custom-scrollbar">
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr style={{ background:'#f3f4f6' }}>
                    {['Tipo Vehículo','N Vehículos','Prima Media','Total'].map(h=><th key={h} style={thS}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {mmtRows.length===0
                    ? <tr><td colSpan={4} style={{textAlign:'center',padding:'20px 0',color:'#9ca3af'}}>Sin datos</td></tr>
                    : <>
                        {mmtRows.map(r=>(
                          <tr key={r.tipo} style={{ borderBottom:'1px solid #f3f4f6' }}>
                            <td style={tdS}>{r.tipo}</td>
                            <td style={{...tdS,textAlign:'center'}}>{r.count}</td>
                            <td style={{...tdS,textAlign:'right'}}>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={r.prima != null ? r.prima : ''}
                                onChange={e => handleMmtChange(r.tipo, e.target.value)}
                                placeholder="—"
                                style={{
                                  width: 90, textAlign: 'right', fontFamily: 'monospace', fontSize: 12,
                                  background: 'transparent', border: 'none', outline: 'none',
                                  padding: '2px 4px', borderRadius: 4, color: '#111827',
                                }}
                                onFocus={e => { e.currentTarget.style.boxShadow = '0 0 0 2px #6366f1'; }}
                                onBlur={e => { e.currentTarget.style.boxShadow = 'none'; }}
                              />
                            </td>
                            <td style={{...tdS,textAlign:'right',fontFamily:'monospace',fontWeight:700}}>
                              {r.total != null ? fmtEur(r.total) : '—'}
                            </td>
                          </tr>
                        ))}
                        <tr style={{ borderTop:'2px solid #d1d5db', background:'#f9fafb', fontWeight:900 }}>
                          <td style={tdS}>Total</td>
                          <td style={{...tdS,textAlign:'center'}}>{mmtRows.reduce((a,r)=>a+r.count,0)}</td>
                          <td style={tdS}></td>
                          <td style={{...tdS,textAlign:'right',fontFamily:'monospace'}}>
                            {mmtRows.some(r => r.total != null)
                              ? fmtEur(mmtRows.reduce((a,r)=>a+(r.total ?? 0),0))
                              : '—'}
                          </td>
                        </tr>
                      </>
                  }
                </tbody>
              </table>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}

function SincoBlock({ label, r, fmt, fmtFreq }: { label: string; r: { totalVehiculos: number; vehiculosConSinco: number; totalSiniestros: number; antiguedadMedia: number; siniestrosPorAnio: number; frecuencia: number }; fmt: (n: number) => string; fmtFreq: (n: number) => string }) {
  return (
    <div>
      <div style={{ padding:'6px 14px', background:'#f9fafb', borderBottom:'1px solid #e5e7eb' }}>
        <span className="text-[9px] font-black uppercase tracking-widest" style={{ color:'#6366f1' }}>{label}</span>
      </div>
      <div className="grid grid-cols-3 gap-px" style={{ background:'#e5e7eb' }}>
        {[
          ['VEHÍCULOS', String(r.totalVehiculos)], ['CON SINCO', String(r.vehiculosConSinco)], ['SINIESTROS', String(r.totalSiniestros)],
          ['AÑOS MEDIA', fmt(r.antiguedadMedia)], ['SIN / AÑO', fmt(r.siniestrosPorAnio)], ['FRECUENCIA', fmtFreq(r.frecuencia)],
        ].map(([l, v]) => (
          <div key={l} style={{ background:'#ffffff', padding:'10px 14px' }}>
            <div className="text-[9px] font-black uppercase tracking-widest" style={{ color:'#9ca3af' }}>{l}</div>
            <div className="text-[16px] font-black" style={{ color:'#111827', fontFamily:'monospace' }}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const thS: React.CSSProperties = { padding:'8px 10px', textAlign:'left', fontSize:11, fontWeight:700, borderBottom:'1px solid #d1d5db', whiteSpace:'nowrap' };
const tdS: React.CSSProperties = { padding:'6px 10px', fontSize:12 };
