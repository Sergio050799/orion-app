"use client";

import React, {
  useState, useCallback, useMemo, useRef, forwardRef, useImperativeHandle, useEffect,
} from 'react';
import { createPortal } from 'react-dom';
import { calcularPrima, validarCobertura, productosDisponibles, franquiciasValidas, getCategoria } from '@/core/flotas';
import {
  TIPO_VEH_MAP, PRODUCT_LABELS, PRODUCT_CODES, AMBITO_OPTIONS,
} from './constants';
import type { CoberturaRow, HojaCoberturasHandle } from './types';
import type { TipoVehiculo, Producto } from '@/core/flotas';

// ─── Tipos locales ────────────────────────────────────────────────────────────

interface VehicleRow {
  matricula: string;
  tipo: string;
  ambito: string;
  // cobertura asignada
  cobertura: string;
  frq: string;
  asistencia: string;
  animales: boolean;
  perdidaTotal: boolean;
}

interface Props {
  trabajoRows: Record<string, string>[];
  onCoberturasChange?: (coberturas: CoberturaRow[]) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getOptions(tipo: string): { coberturas: string[]; frqs: string[]; asistencias: string[]; isIndustrial: boolean } {
  const tv = TIPO_VEH_MAP[tipo] as TipoVehiculo | undefined;
  const isIndustrial = tv === 'industrial_matriculado' || tv === 'industrial_no_matriculado';
  if (!tv) return { coberturas: Object.values(PRODUCT_LABELS), frqs: [], asistencias: ['no', 'oro', 'oro_plus'], isIndustrial: false };
  const coberturas = productosDisponibles(tv).map(p => PRODUCT_LABELS[p]);
  const frqs = isIndustrial ? [] : franquiciasValidas(tv).map(String);
  const cat = getCategoria(tv);
  const asistencias = isIndustrial ? [] : (cat === 1 ? ['no', 'oro', 'oro_plus'] : ['no', 'oro']);
  return { coberturas, frqs, asistencias, isIndustrial };
}

function computePrima(row: VehicleRow): number | null {
  const tv = TIPO_VEH_MAP[row.tipo] as TipoVehiculo | undefined;
  const prod = PRODUCT_CODES[row.cobertura] as Producto | undefined;
  if (!tv || !prod) return null;
  return calcularPrima({
    tipoVehiculo: tv,
    producto: prod,
    ambito: row.ambito === 'Internacional' ? 'internacional' : 'nacional',
    franquicia: parseInt(row.frq) || undefined,
    asistencia: (row.asistencia || 'no') as any,
    animales: row.animales,
    perdidaTotal: row.perdidaTotal,
  });
}

// ─── Mini dropdown inline ─────────────────────────────────────────────────────

function CellDropdown({ value, options, disabled, onChange }: {
  value: string; options: string[]; disabled?: boolean; onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  if (disabled) return <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>;

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', padding:'2px 6px', fontSize:12, background:'#ffffff', border:'1px solid #e5e7eb', borderRadius:4, cursor:'pointer', minWidth:80 }}>
        <span style={{ color: value ? '#111827' : '#9ca3af', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1, textAlign:'left' }}>{value||'—'}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      {open && createPortal(
        <div style={{
          position: 'fixed',
          top: (ref.current?.getBoundingClientRect().bottom ?? 0) + window.scrollY,
          left: (ref.current?.getBoundingClientRect().left ?? 0) + window.scrollX,
          width: Math.max(ref.current?.getBoundingClientRect().width ?? 0, 160),
          zIndex: 9999, background:'#ffffff', border:'1px solid #e5e7eb', borderRadius:8,
          boxShadow:'0 4px 16px rgba(0,0,0,0.12)', maxHeight:200, overflowY:'auto',
        }} className="custom-scrollbar">
          {options.map(opt => (
            <button key={opt||'__empty__'} type="button"
              style={{ display:'block', width:'100%', textAlign:'left', padding:'6px 10px', fontSize:12, background: value===opt?'#eff0ff':'transparent', color: value===opt?'#4338ca':'#374151', cursor:'pointer' }}
              onMouseEnter={e=>{if(value!==opt)(e.currentTarget as HTMLElement).style.background='#f9fafb';}}
              onMouseLeave={e=>{if(value!==opt)(e.currentTarget as HTMLElement).style.background='transparent';}}
              onClick={()=>{ onChange(opt); setOpen(false); }}>
              {opt||<span style={{color:'#9ca3af'}}>(vacío)</span>}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

// ─── Componente ──────────────────────────────────────────────────────────────

const HojaCoberturas = forwardRef<HojaCoberturasHandle, Props>(
  function HojaCoberturas({ trabajoRows, onCoberturasChange }, ref) {
    const vehicles = useMemo<VehicleRow[]>(() =>
      trabajoRows
        .filter(r => r['matricula']?.trim())
        .map(r => ({
          matricula: r['matricula'] ?? '',
          tipo: r['tipo_vehiculo'] ?? '',
          ambito: r['ambito'] ?? 'Nacional',
          cobertura: '', frq: '', asistencia: '',
          animales: false, perdidaTotal: false,
        })),
      [trabajoRows],
    );

    const [rows, setRows] = useState<VehicleRow[]>(vehicles);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [bulkCobertura, setBulkCobertura] = useState('');
    const lastSelected = useRef<number>(-1);

    // Re-sync when vehicles change (new import from TRABAJO)
    useEffect(() => {
      setRows(prev => vehicles.map((v, i) => prev[i]
        ? { ...prev[i], matricula: v.matricula, tipo: v.tipo, ambito: v.ambito }
        : v,
      ));
    }, [vehicles]);

    const setRow = useCallback((i: number, patch: Partial<VehicleRow>) => {
      setRows(prev => {
        const next = [...prev];
        next[i] = { ...next[i], ...patch };
        return next;
      });
    }, []);

    // Notify parent when rows change
    useEffect(() => {
      onCoberturasChange?.(rows.map(r => ({
        cobertura: r.cobertura, frq: r.frq, asistencia: r.asistencia,
        animales: r.animales, perdidaTotal: r.perdidaTotal,
        primaMmt: computePrima(r),
      })));
    }, [rows]); // eslint-disable-line

    useImperativeHandle(ref, () => ({
      getCoberturas: () => rows.map(r => ({
        cobertura: r.cobertura, frq: r.frq, asistencia: r.asistencia,
        animales: r.animales, perdidaTotal: r.perdidaTotal,
        primaMmt: computePrima(r),
      })),
      setCoberturas: (coberturas) => {
        setRows(prev => prev.map((v, i) => coberturas[i]
          ? { ...v, ...coberturas[i] }
          : v,
        ));
      },
    }));

    const handleRowClick = (i: number, e: React.MouseEvent) => {
      if (e.ctrlKey || e.metaKey) {
        setSelected(prev => { const s = new Set(prev); s.has(i) ? s.delete(i) : s.add(i); return s; });
        lastSelected.current = i;
      } else if (e.shiftKey && lastSelected.current >= 0) {
        const a = Math.min(lastSelected.current, i), b = Math.max(lastSelected.current, i);
        setSelected(prev => { const s = new Set(prev); for(let j=a;j<=b;j++) s.add(j); return s; });
      } else {
        setSelected(new Set());
        lastSelected.current = -1;
      }
    };

    const applyBulk = () => {
      setRows(prev => {
        const next = [...prev];
        selected.forEach(i => { next[i] = { ...next[i], cobertura: bulkCobertura, frq: '', asistencia: '' }; });
        return next;
      });
      setSelected(new Set());
      setBulkCobertura('');
    };

    const totalPrima = rows.reduce((acc, r) => acc + (computePrima(r) ?? 0), 0);

    const cols = ['#', 'MATRÍCULA', 'TIPO', 'COBERTURA', 'FRQ', 'ASISTENCIA', 'ANIMALES', 'PÉRDIDA TOTAL', 'PRIMA MMT'];

    return (
      <div className="flex flex-col h-full min-h-0">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 shrink-0"
          style={{ borderBottom:'1px solid #e5e7eb', background:'#f9fafb' }}>
          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color:'#6b7280' }}>
            {rows.length} vehículos · Ctrl+Click para selección múltiple
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-black" style={{ color:'#374151' }}>Total prima MMT:</span>
            <span className="text-[13px] font-black px-2 py-1 rounded-md"
              style={{ background:'rgba(99,102,241,0.1)', color:'#4338ca', border:'1px solid rgba(99,102,241,0.2)' }}>
              {totalPrima > 0 ? `${totalPrima.toLocaleString('es-ES')} €` : '—'}
            </span>
          </div>
        </div>

        {/* Bulk panel */}
        {selected.size > 1 && (
          <div className="flex items-center gap-3 px-4 py-2 shrink-0"
            style={{ background:'#eff6ff', borderBottom:'1px solid #bfdbfe' }}>
            <span className="text-[11px] font-bold" style={{ color:'#1d4ed8' }}>
              {selected.size} vehículos seleccionados
            </span>
            <select value={bulkCobertura} onChange={e=>setBulkCobertura(e.target.value)}
              className="orion-input text-[11px] py-1 w-48">
              <option value="">Selecciona cobertura...</option>
              {Object.values(PRODUCT_LABELS).map(l=><option key={l} value={l}>{l}</option>)}
            </select>
            <button onClick={applyBulk} disabled={!bulkCobertura}
              className="px-3 py-1 rounded-lg text-[11px] font-bold"
              style={{ background: bulkCobertura?'#1d4ed8':'#93c5fd', color:'#ffffff', cursor: bulkCobertura?'pointer':'not-allowed' }}>
              Aplicar a {selected.size} vehículos
            </button>
            <button onClick={()=>setSelected(new Set())} className="text-[11px]" style={{ color:'#6b7280' }}>Cancelar</button>
          </div>
        )}

        {/* Tabla */}
        <div className="flex-1 overflow-auto custom-scrollbar" style={{ background:'#ffffff' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'#f3f4f6', position:'sticky', top:0, zIndex:1 }}>
                {cols.map(c => <th key={c} style={thS}>{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign:'center', padding:'40px 0', color:'#9ca3af' }}>
                  Añade vehículos en TRABAJO para asignar coberturas.
                </td></tr>
              ) : rows.map((row, i) => {
                const opts = getOptions(row.tipo);
                const prima = computePrima(row);
                const isSel = selected.has(i);
                const isTR = PRODUCT_CODES[row.cobertura] === 'todo_riesgo';
                const tv = TIPO_VEH_MAP[row.tipo] as TipoVehiculo | undefined;
                const cat = tv ? getCategoria(tv) : 1;

                const validation = (tv && row.cobertura)
                  ? validarCobertura({
                      tipoVehiculo: tv,
                      producto: PRODUCT_CODES[row.cobertura] ?? 'terceros',
                      franquicia: parseInt(row.frq) || 0,
                      categoria: cat,
                    })
                  : { valido: true, errores: [] };

                return (
                  <tr key={i}
                    onClick={e => handleRowClick(i, e)}
                    style={{ borderBottom:'1px solid #f3f4f6', background: isSel?'#eff6ff':'#ffffff', cursor:'pointer', transition:'background 0.1s' }}
                    onMouseEnter={e=>{ if(!isSel)(e.currentTarget as HTMLElement).style.background='#fafafa'; }}
                    onMouseLeave={e=>{ if(!isSel)(e.currentTarget as HTMLElement).style.background='#ffffff'; }}>
                    <td style={tdS}>{i + 1}</td>
                    <td style={{ ...tdS, fontFamily:'monospace', fontWeight:700 }}>{row.matricula}</td>
                    <td style={{ ...tdS, color:'#6b7280', fontSize:11 }}>{row.tipo || '—'}</td>
                    <td style={{ ...tdS, minWidth:180 }} onClick={e=>e.stopPropagation()}>
                      <CellDropdown value={row.cobertura} options={opts.coberturas}
                        onChange={v=>setRow(i,{cobertura:v,frq:'',asistencia:''})} />
                      {!validation.valido && (
                        <div className="text-[10px] mt-0.5" style={{color:'#ef4444'}} title={validation.errores.join(' ')}>⚠ {validation.errores[0]}</div>
                      )}
                    </td>
                    <td style={{ ...tdS, minWidth:80 }} onClick={e=>e.stopPropagation()}>
                      <CellDropdown value={row.frq} options={opts.frqs} disabled={!isTR}
                        onChange={v=>setRow(i,{frq:v})} />
                    </td>
                    <td style={{ ...tdS, minWidth:120 }} onClick={e=>e.stopPropagation()}>
                      <CellDropdown value={row.asistencia} options={opts.asistencias}
                        disabled={opts.isIndustrial}
                        onChange={v=>setRow(i,{asistencia:v})} />
                    </td>
                    <td style={{...tdS,textAlign:'center'}} onClick={e=>e.stopPropagation()}>
                      <input type="checkbox" checked={row.animales}
                        onChange={e=>setRow(i,{animales:e.target.checked})}
                        style={{accentColor:'#6366f1',cursor:'pointer',width:14,height:14}} />
                    </td>
                    <td style={{...tdS,textAlign:'center'}} onClick={e=>e.stopPropagation()}>
                      <input type="checkbox" checked={row.perdidaTotal}
                        onChange={e=>setRow(i,{perdidaTotal:e.target.checked})}
                        style={{accentColor:'#6366f1',cursor:'pointer',width:14,height:14}} />
                    </td>
                    <td style={{...tdS,fontFamily:'monospace',fontWeight:700,textAlign:'right',
                      color: !validation.valido?'#ef4444':(prima!==null?'#374151':'#9ca3af')}}>
                      {prima !== null ? `${prima.toLocaleString('es-ES')} €` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  },
);

export default HojaCoberturas;

const thS: React.CSSProperties = { padding:'8px 10px', textAlign:'left', fontSize:11, fontWeight:700, borderBottom:'1px solid #d1d5db', whiteSpace:'nowrap', userSelect:'none' };
const tdS: React.CSSProperties = { padding:'6px 10px', fontSize:12, verticalAlign:'middle' };
