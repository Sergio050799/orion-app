"use client";

import React, { useState, useCallback, useRef, forwardRef } from 'react';
import FlotaGrid from './FlotaGrid';
import HeaderBlock from './HeaderBlock';
import { makeTrabajoColDefs } from './constants';
import { contarVehiculos, filtrarFilasReales } from '@/core/flotas';
import type { FlotaGridHandle, FlotaHeader } from './types';

interface Props {
  header: FlotaHeader;
  onHeaderChange: (h: FlotaHeader) => void;
  getOriginalSnapshot: () => Record<string, string>[] | null;
  onDataChange?: (data: Record<string, string>[]) => void;
}

const TRABAJO_COL_DEFS = makeTrabajoColDefs();

const HojaTrabajos = forwardRef<FlotaGridHandle, Props>(function HojaTrabajos(
  { header, onHeaderChange, getOriginalSnapshot, onDataChange },
  ref,
) {
  const [confirmPending, setConfirmPending] = useState(false);
  const [vehicleCount, setVehicleCount]   = useState(0);
  const gridRef = useRef<FlotaGridHandle>(null);

  // Forward ref — proxy para que siempre delegue al handle actual del grid
  React.useImperativeHandle(ref, () => ({
    getData:    () => gridRef.current!.getData(),
    setData:    (data) => gridRef.current!.setData(data),
    toRows:     () => gridRef.current!.toRows(),
    getColDefs: () => gridRef.current!.getColDefs(),
  }), []);

  const doImport = useCallback(() => {
    const raw = getOriginalSnapshot();
    if (!raw) return;
    const data = filtrarFilasReales(raw);
    if (data.length === 0) return;
    gridRef.current?.setData(data);
    setConfirmPending(false);
  }, [getOriginalSnapshot]);

  const handleCopy = useCallback(() => {
    const d = gridRef.current?.getData() ?? [];
    const hasData = d.some(r => Object.values(r).some(v => v.trim()));
    if (hasData) setConfirmPending(true);
    else doImport();
  }, [doImport]);

  const handleDataChange = useCallback((data: Record<string, string>[]) => {
    const mats = data.map(r => r['matricula'] ?? '').filter(v => v.trim());
    setVehicleCount(contarVehiculos(mats));
    onDataChange?.(data);
  }, [onDataChange]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <HeaderBlock header={header} onChange={onHeaderChange} />

      {/* Toolbar de hoja */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 16px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb', flexShrink: 0 }}>
        <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md"
          style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.2)' }}>
          Vehículos: {vehicleCount}
        </span>

        <button onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest"
          style={{ color: '#0891b2', background: 'rgba(8,145,178,0.06)', border: '1px solid rgba(8,145,178,0.2)' }}
          onMouseEnter={e=>(e.currentTarget.style.background='rgba(8,145,178,0.12)')}
          onMouseLeave={e=>(e.currentTarget.style.background='rgba(8,145,178,0.06)')}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
          </svg>
          Copiar desde ORIGINAL
        </button>

        {confirmPending && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg"
            style={{ background: '#fffbeb', border: '1px solid #fcd34d' }}>
            <span className="text-[10px] font-bold" style={{ color: '#92400e' }}>¿Sobreescribir datos?</span>
            <button onClick={doImport} className="text-[10px] font-black px-2 py-0.5 rounded"
              style={{ background: '#fef3c7', color: '#92400e' }}>Sí</button>
            <button onClick={() => setConfirmPending(false)} className="text-[10px] font-black px-2 py-0.5 rounded"
              style={{ background: '#f3f4f6', color: '#6b7280' }}>No</button>
          </div>
        )}
      </div>

      <FlotaGrid
        ref={gridRef}
        initialColDefs={TRABAJO_COL_DEFS}
        onDataChange={handleDataChange}
      />
    </div>
  );
});

export default HojaTrabajos;
