"use client";

import React, { useState, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import * as XLSX from 'xlsx';
import {
  contarVehiculos, contarVehiculosConSinco,
  calcularAntiguedadMedia, calcularSiniestrosPorAnio, calcularFrecuencia,
} from '@/core/flotas';
import { SINCO_COL_NAMES } from './constants';

type SincoRow = string[];

export interface HojaResultadosSincoHandle {
  getRows: () => SincoRow[];
}

interface Props {
  initialRows?: SincoRow[];
  onRowsChange?: (rows: SincoRow[]) => void;
}

const HojaResultadosSinco = forwardRef<HojaResultadosSincoHandle, Props>(
  function HojaResultadosSinco({ initialRows = [], onRowsChange }, ref) {
    const [rows, setRows] = useState<SincoRow[]>(initialRows);
    const fileRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({ getRows: () => rows }));

    const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const wb = XLSX.read(ev.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
        const dataRows = raw.slice(1); // fila 0 siempre es cabecera
        const parsed = dataRows
          .map(r => r.map(c => String(c ?? '')))
          .filter(r => r.some(c => c.trim() !== ''));
        setRows(parsed);
        onRowsChange?.(parsed);
      };
      reader.readAsBinaryString(file);
      e.target.value = '';
    }, []);

    // ─── Métricas ───────────────────────────────────────────────────────────
    const matriculas    = rows.map(r => r[4] ?? '').filter(Boolean);
    const codigosRet    = rows.map(r => r[5] ?? '');
    const fecInis       = rows.map(r => r[8] ?? '').filter(Boolean);
    const numSiniestros = rows.reduce((acc, r) => acc + (parseInt(r[7]) || 0), 0);

    const totalVeh      = contarVehiculos(matriculas);
    const conSinco      = contarVehiculosConSinco(codigosRet);
    const antiguedMedia = calcularAntiguedadMedia(fecInis.map(f => {
      const d = new Date(f.split('/').reverse().join('-'));
      return isNaN(d.getTime()) ? 0 : (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    }));
    const sinAnio = calcularSiniestrosPorAnio(numSiniestros, antiguedMedia);
    const freq    = calcularFrecuencia(sinAnio, conSinco);

    const fmt = (n: number) => isNaN(n) || !isFinite(n) ? '—' : n.toFixed(2);

    return (
      <div className="flex flex-col h-full min-h-0">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 shrink-0"
          style={{ borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#6b7280' }}>
            {rows.length} registros importados
          </span>
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
            <button onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest"
              style={{ color: '#7c3aed', background: 'rgba(124,58,237,0.07)', border: '1px solid rgba(124,58,237,0.25)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(124,58,237,0.14)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(124,58,237,0.07)')}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
              </svg>
              Importar resultado SINCO (.xlsx)
            </button>
          </div>
        </div>

        {/* Panel métricas */}
        {rows.length > 0 && (
          <div className="shrink-0 px-4 py-3" style={{ borderBottom: '1px solid #e5e7eb', background: '#fafafa' }}>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'VEHÍCULOS',          value: String(totalVeh) },
                { label: 'VEHÍCULOS CON SINCO', value: String(conSinco) },
                { label: 'SINIESTROS',          value: String(numSiniestros) },
                { label: 'AÑOS MEDIA',          value: fmt(antiguedMedia) },
                { label: 'SINIESTROS / AÑO',   value: fmt(sinAnio) },
                { label: 'FRECUENCIA',          value: fmt(freq) },
              ].map(m => (
                <div key={m.label} className="rounded-lg px-3 py-2"
                  style={{ background: '#ffffff', border: '1px solid #e5e7eb' }}>
                  <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#9ca3af' }}>{m.label}</div>
                  <div className="text-lg font-black" style={{ color: '#111827', fontFamily: 'monospace' }}>{m.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tabla */}
        <div className="flex-1 overflow-auto custom-scrollbar" style={{ background: '#ffffff' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f3f4f6', position: 'sticky', top: 0, zIndex: 1 }}>
                <th style={{ ...thS, width: 44, color: '#9ca3af' }}>#</th>
                {SINCO_COL_NAMES.map((n, i) => (
                  <th key={n} style={{ ...thS, background: i < 5 ? '#eff0ff' : '#f3f4f6', color: i < 5 ? '#4338ca' : '#374151' }}>{n}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={16} style={{ textAlign:'center', padding:'40px 0', color:'#9ca3af', fontSize:12 }}>
                  Importa el archivo devuelto por SINCO (.xlsx)
                </td></tr>
              ) : rows.map((row, ri) => (
                <tr key={ri} style={{ borderBottom:'1px solid #f3f4f6' }}
                  onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='#fafafa'}
                  onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='#ffffff'}>
                  <td style={{ ...tdS, color:'#9ca3af', textAlign:'center' }}>{ri+1}</td>
                  {row.map((cell, ci) => (
                    <td key={ci} style={{ ...tdS, background: ci<5?'#f8f8ff':'#ffffff', color: ci<5?'#374151':'#111827' }}>
                      {cell||<span style={{color:'#d1d5db'}}>—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  },
);

export default HojaResultadosSinco;

const thS: React.CSSProperties = { padding:'8px 10px', textAlign:'left', fontSize:11, fontWeight:700, borderBottom:'1px solid #d1d5db', whiteSpace:'nowrap' };
const tdS: React.CSSProperties = { padding:'6px 10px', fontSize:12, whiteSpace:'nowrap', fontFamily:'monospace' };
