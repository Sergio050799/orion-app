"use client";

import React, { useMemo, useCallback, forwardRef, useImperativeHandle, useState } from 'react';
import type { FlotaHeader, FlotaGridHandle, ColDef } from './types';
import { SINCO_COL_NAMES } from './constants';
import { normalizarPoliza } from '@/core/flotas';

// ─── Tipos ───────────────────────────────────────────────────────────────────

type SincoRow = string[]; // 16 valores

interface Props {
  header: FlotaHeader;
  trabajoRows: Record<string, string>[];  // from HojaTrabajos.toRows()
}

export interface HojaSincoHandle {
  getRows: () => SincoRow[];
  setRows: (rows: SincoRow[]) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function inferTipoDocumento(cif: string): string {
  if (!cif) return 'C';
  const first = cif[0].toUpperCase();
  if (first === 'P') return 'P';
  if (first === 'X' || first === 'Y' || first === 'Z') return 'R';
  return 'C';
}

function buildSincoRows(header: FlotaHeader, trabajoRows: Record<string, string>[]): SincoRow[] {
  const tipoDoc = inferTipoDocumento(header.cif);
  return trabajoRows
    .filter(r => r['matricula']?.trim())
    .map(r => {
      const row: string[] = Array(16).fill('');
      row[0] = 'MMT';
      row[1] = tipoDoc;
      row[2] = header.cif;
      // Use full póliza — SINCO truncates to last 5 automatically
      const polizaFull = r['num_poliza_actual']?.trim() || '';
      const polizaComp = r['poliza_sinco']?.trim() || '';
      row[3] = polizaFull || (polizaComp !== '00000' ? polizaComp : '');
      row[4] = r['matricula'] ?? '';
      // cols 5-15: empty (filled by SINCO)
      return row;
    });
}

// ─── Componente ──────────────────────────────────────────────────────────────

const HojaSinco = forwardRef<HojaSincoHandle, Props>(function HojaSinco({ header, trabajoRows }, ref) {
  // Rows auto-computed from props, but user can also have imported SINCO results merged here
  const autoRows = useMemo(() => buildSincoRows(header, trabajoRows), [header, trabajoRows]);
  const [overrideRows, setOverrideRows] = useState<SincoRow[] | null>(null);

  const rows = overrideRows ?? autoRows;

  useImperativeHandle(ref, () => ({
    getRows: () => rows,
    setRows: (r) => setOverrideRows(r),
  }));

  const handleExport = useCallback(async () => {
    const XLSX = await import('xlsx');
    const wsData = [SINCO_COL_NAMES, ...rows];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = SINCO_COL_NAMES.map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, ws, 'SINCO');
    XLSX.writeFile(wb, `SINCO_${header.cif || 'flota'}.xlsx`);
  }, [rows, header.cif]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 shrink-0"
        style={{ borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
        <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#6b7280' }}>
          {rows.length} vehículos preparados para SINCO
        </span>
        <button onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest"
          style={{ color: '#16a34a', background: 'rgba(22,163,74,0.07)', border: '1px solid rgba(22,163,74,0.25)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(22,163,74,0.14)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(22,163,74,0.07)')}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
          </svg>
          Descargar SINCO (.xlsx)
        </button>
      </div>

      {/* Tabla */}
      <div className="flex-1 overflow-auto custom-scrollbar" style={{ background: '#ffffff' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#f3f4f6', position: 'sticky', top: 0, zIndex: 1 }}>
              <th style={{ ...thStyle, width: 44, color: '#9ca3af' }}>#</th>
              {SINCO_COL_NAMES.map((name, i) => (
                <th key={name} style={{ ...thStyle, background: i < 5 ? '#eff0ff' : '#f3f4f6', color: i < 5 ? '#4338ca' : '#374151' }}>
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={16} style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontSize: 12 }}>
                  Sin datos. Añade vehículos en TRABAJO con matrícula y nº de póliza.
                </td>
              </tr>
            ) : rows.map((row, ri) => (
              <tr key={ri} style={{ borderBottom: '1px solid #f3f4f6' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#fafafa'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#ffffff'}>
                <td style={{ ...tdStyle, color: '#9ca3af', textAlign: 'center' }}>{ri + 1}</td>
                {row.map((cell, ci) => (
                  <td key={ci} style={{ ...tdStyle, background: ci < 5 ? '#f8f8ff' : '#ffffff', color: ci < 5 ? '#374151' : '#6b7280' }}>
                    {cell || <span style={{ color: '#d1d5db' }}>—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});

export default HojaSinco;

const thStyle: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700,
  borderBottom: '1px solid #d1d5db', whiteSpace: 'nowrap', userSelect: 'none',
};
const tdStyle: React.CSSProperties = {
  padding: '6px 10px', fontSize: 12, whiteSpace: 'nowrap', fontFamily: 'monospace',
};
