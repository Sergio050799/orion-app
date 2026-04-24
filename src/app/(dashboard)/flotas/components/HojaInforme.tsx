"use client";

import React, { useMemo } from 'react';
import {
  contarVehiculos, contarVehiculosConSinco,
  calcularAntiguedadMedia, calcularSiniestrosPorAnio, calcularFrecuencia,
} from '@/core/flotas';
import type { CoberturaRow } from './types';

interface Props {
  trabajoRows: Record<string, string>[];
  coberturas: CoberturaRow[];
  sincoRows: string[][];
}

export default function HojaInforme({ trabajoRows, coberturas, sincoRows }: Props) {
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

  // ─── Métricas SINCO ────────────────────────────────────────────────────────
  const matriculas = sincoRows.map(r=>r[4]??'').filter(Boolean);
  const codigosRet = sincoRows.map(r=>r[5]??'');
  const fecInis    = sincoRows.map(r=>r[8]??'').filter(Boolean);
  const numSin     = sincoRows.reduce((a,r)=>a+(parseInt(r[7])||0),0);
  const totalVeh   = contarVehiculos(matriculas);
  const conSinco   = contarVehiculosConSinco(codigosRet);
  const amed       = calcularAntiguedadMedia(fecInis.map(f=>{
    const d=new Date(f.split('/').reverse().join('-'));
    return isNaN(d.getTime())?0:(Date.now()-d.getTime())/(1000*60*60*24*365.25);
  }));
  const sinAnio = calcularSiniestrosPorAnio(numSin, amed);
  const freq    = calcularFrecuencia(sinAnio, conSinco);
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
            <div className="grid grid-cols-3 gap-px" style={{ background:'#e5e7eb' }}>
              {[
                ['VEHÍCULOS', String(totalVeh)], ['CON SINCO', String(conSinco)], ['SINIESTROS', String(numSin)],
                ['AÑOS MEDIA', fmt(amed)], ['SIN / AÑO', fmt(sinAnio)], ['FRECUENCIA', fmt(freq)],
              ].map(([label, value]) => (
                <div key={label} style={{ background:'#ffffff', padding:'10px 14px' }}>
                  <div className="text-[9px] font-black uppercase tracking-widest" style={{ color:'#9ca3af' }}>{label}</div>
                  <div className="text-[16px] font-black" style={{ color:'#111827', fontFamily:'monospace' }}>{value}</div>
                </div>
              ))}
            </div>
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

const thS: React.CSSProperties = { padding:'8px 10px', textAlign:'left', fontSize:11, fontWeight:700, borderBottom:'1px solid #d1d5db', whiteSpace:'nowrap' };
const tdS: React.CSSProperties = { padding:'6px 10px', fontSize:12 };
