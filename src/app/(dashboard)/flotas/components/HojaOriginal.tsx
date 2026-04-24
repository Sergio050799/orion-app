"use client";

import React, { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import FlotaGrid from './FlotaGrid';
import HeaderBlock from './HeaderBlock';
import { BASE_COL_DEFS } from './constants';
import { parseExcelTemplate, generarPlantillaExcel } from '@/core/flotas';
import type { FlotaGridHandle, FlotaHeader } from './types';

async function descargarPlantilla() {
  const blob = await generarPlantillaExcel();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Plantilla_Flotas.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}

interface Props {
  header: FlotaHeader;
  onHeaderChange: (h: FlotaHeader) => void;
  onDataChange?: (data: Record<string, string>[]) => void;
  carpetaOriginalEmpty?: boolean;
}

const HojaOriginal = forwardRef<FlotaGridHandle, Props>(function HojaOriginal(
  { header, onHeaderChange, onDataChange, carpetaOriginalEmpty = false },
  ref,
) {
  const gridRef = useRef<FlotaGridHandle>(null);
  useImperativeHandle(ref, () => ({
    getData:    () => gridRef.current!.getData(),
    setData:    (data) => gridRef.current!.setData(data),
    toRows:     () => gridRef.current!.toRows(),
    getColDefs: () => gridRef.current!.getColDefs(),
  }), []);

  const [modeSelected, setModeSelected] = useState(false);
  const [unmapped, setUnmapped]         = useState<string[]>([]);
  const [parseError, setParseError]     = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const showModeSelect = carpetaOriginalEmpty && !modeSelected;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setParseError(null);
    try {
      const result = await parseExcelTemplate(file);
      if (result.rows.length > 0) {
        gridRef.current?.setData(result.rows);
      }
      setUnmapped(result.unmapped);
      setModeSelected(true);
    } catch {
      setParseError('No se pudo leer el archivo. Asegúrate de que es un Excel válido (.xlsx / .xls).');
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <HeaderBlock header={header} onChange={onHeaderChange} />

      {/* Aviso de columnas no mapeadas */}
      {unmapped.length > 0 && (
        <div style={{ flexShrink: 0, padding: '6px 16px', background: '#fffbeb', borderBottom: '1px solid #fcd34d', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#92400e' }}>
            {unmapped.length} columna{unmapped.length > 1 ? 's' : ''} no reconocida{unmapped.length > 1 ? 's' : ''}:
          </span>
          <span style={{ fontSize: 11, color: '#92400e' }}>{unmapped.join(', ')}</span>
          <button onClick={() => setUnmapped([])} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#92400e', fontSize: 15, lineHeight: 1 }}>×</button>
        </div>
      )}

      {parseError && (
        <div style={{ flexShrink: 0, padding: '6px 16px', background: '#fef2f2', borderBottom: '1px solid #fca5a5' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#b91c1c' }}>{parseError}</span>
        </div>
      )}

      {/* Grid (siempre montado) */}
      <div style={{ flex: 1, minHeight: 0, display: showModeSelect ? 'none' : 'flex', flexDirection: 'column' }}>
        <FlotaGrid
          ref={gridRef}
          initialColDefs={BASE_COL_DEFS}
          onDataChange={onDataChange}
        />
      </div>

      {/* Pantalla de elección de modo */}
      {showModeSelect && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, background: '#fff' }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              ¿Cómo quieres empezar?
            </p>
            <p style={{ fontSize: 11, color: '#9ca3af', marginBottom: 32 }}>
              Carga el Excel de la flota o rellena las celdas manualmente.
            </p>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
              <button
                onClick={() => fileRef.current?.click()}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '24px 32px', borderRadius: 14, border: '2px solid #e5e7eb', background: '#f9fafb', cursor: 'pointer', transition: 'all 0.15s', minWidth: 160 }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#6366f1'; (e.currentTarget as HTMLElement).style.background = '#eff0ff'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#e5e7eb'; (e.currentTarget as HTMLElement).style.background = '#f9fafb'; }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                </svg>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>Subir Excel</span>
                <span style={{ fontSize: 10, color: '#9ca3af' }}>.xlsx / .xls</span>
                <span
                  onClick={e => { e.stopPropagation(); descargarPlantilla(); }}
                  style={{ marginTop: 2, fontSize: 10, color: '#6366f1', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}>
                  ¿No tienes la plantilla? Descárgala aquí
                </span>
              </button>

              <button
                onClick={() => setModeSelected(true)}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '24px 32px', borderRadius: 14, border: '2px solid #e5e7eb', background: '#f9fafb', cursor: 'pointer', transition: 'all 0.15s', minWidth: 160 }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#6366f1'; (e.currentTarget as HTMLElement).style.background = '#eff0ff'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#e5e7eb'; (e.currentTarget as HTMLElement).style.background = '#f9fafb'; }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
                </svg>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>Rellenar manualmente</span>
                <span style={{ fontSize: 10, color: '#9ca3af' }}>celda por celda</span>
              </button>
            </div>
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFile} />
        </div>
      )}
    </div>
  );
});

export default HojaOriginal;
