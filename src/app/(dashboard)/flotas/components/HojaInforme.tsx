"use client";

import React, { useMemo } from 'react';
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
}

export default function HojaInforme({ trabajoRows, coberturas, sincoResultRows, sincoManual, sincoGlobal }: Props) {
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
    const asRecords = sincoManual.map(e => ({
      matricula: e.matricula,
      num_siniestros: String(e.num_siniestros),
      fec_ini_cobertura: e.fec_ini_cobertura,
      fec_vcto: e.fec_vcto,
      codigo_retorno: e.codigo_retorno,
      garantias: e.garantias,
      observaciones: e.observaciones,
    }));
    return consolidarSinco(asRecords);
  }, [sincoManual]);

  const hasSincoData = resumenAuto !== null || resumenManual !== null || sincoGlobal !== null;
  const fmt = (n:number) => isNaN(n)||!isFinite(n)?'—':n.toFixed(2);

  // ─── Primas ────────────────────────────────────────────────────────────────
  const primasSol = useMemo(() =>
    trabajoRows
      .filter(r=>r['matricula']?.trim())
      .map(r=>({ mat:r['matricula'], cob:r['coberturas_solicitadas']||'—', frq:r['frq']||'—', prima:r['prima_referencia']||'—' })),
    [trabajoRows],
  );
  const primasMmt = useMemo(() =>
    trabajoRows
      .filter(r=>r['matricula']?.trim())
      .map((r,i)=>({ mat:r['matricula'], cob:coberturas[i]?.cobertura||'—', frq:coberturas[i]?.frq||'—', prima:coberturas[i]?.primaMmt!=null?`${coberturas[i].primaMmt} €`:'—' })),
    [trabajoRows, coberturas],
  );

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
                  <SincoBlock label="Automático" r={resumenAuto} fmt={fmt} />
                )}
                {resumenManual && (
                  <SincoBlock label="Por Matrícula" r={resumenManual} fmt={fmt} />
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
                        ['FRECUENCIA', fmt(sincoGlobal.frecuencia)],
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
          {[
            { title:'Primas solicitadas', rows:primasSol },
            { title:'Primas MMT',         rows:primasMmt },
          ].map(block => (
            <div key={block.title} className="rounded-xl overflow-hidden" style={{ border:'1px solid #e5e7eb', background:'#ffffff' }}>
              <div style={{ padding:'10px 14px', borderBottom:'1px solid #e5e7eb', background:'#f9fafb' }}>
                <span className="text-[11px] font-black uppercase tracking-widest" style={{ color:'#374151' }}>{block.title}</span>
              </div>
              <div style={{ maxHeight:240, overflowY:'auto' }} className="custom-scrollbar">
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ background:'#f3f4f6' }}>
                      {['Matrícula','Cobertura','FRQ','Prima'].map(h=><th key={h} style={thS}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.length===0
                      ? <tr><td colSpan={4} style={{textAlign:'center',padding:'20px 0',color:'#9ca3af'}}>Sin datos</td></tr>
                      : block.rows.map((r,i)=>(
                          <tr key={i} style={{ borderBottom:'1px solid #f3f4f6' }}>
                            <td style={{...tdS,fontFamily:'monospace',fontWeight:700}}>{r.mat}</td>
                            <td style={tdS}>{r.cob}</td>
                            <td style={{...tdS,textAlign:'center'}}>{r.frq}</td>
                            <td style={{...tdS,textAlign:'right',fontFamily:'monospace'}}>{r.prima}</td>
                          </tr>
                        ))
                    }
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

function SincoBlock({ label, r, fmt }: { label: string; r: { totalVehiculos: number; vehiculosConSinco: number; totalSiniestros: number; antiguedadMedia: number; siniestrosPorAnio: number; frecuencia: number }; fmt: (n: number) => string }) {
  return (
    <div>
      <div style={{ padding:'6px 14px', background:'#f9fafb', borderBottom:'1px solid #e5e7eb' }}>
        <span className="text-[9px] font-black uppercase tracking-widest" style={{ color:'#6366f1' }}>{label}</span>
      </div>
      <div className="grid grid-cols-3 gap-px" style={{ background:'#e5e7eb' }}>
        {[
          ['VEHÍCULOS', String(r.totalVehiculos)], ['CON SINCO', String(r.vehiculosConSinco)], ['SINIESTROS', String(r.totalSiniestros)],
          ['AÑOS MEDIA', fmt(r.antiguedadMedia)], ['SIN / AÑO', fmt(r.siniestrosPorAnio)], ['FRECUENCIA', fmt(r.frecuencia)],
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
