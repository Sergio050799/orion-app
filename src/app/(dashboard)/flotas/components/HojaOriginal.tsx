"use client";

import React, { lazy, Suspense, useState, useRef, forwardRef, useImperativeHandle } from 'react';
const FlotaGrid = lazy(() => import('./FlotaGrid'));
import { BASE_COL_DEFS } from './constants';
import { parseExcelTemplate, generarPlantillaExcel, listarCorredores } from '@/core/flotas';
import type { FlotaGridHandle } from './types';

async function descargarPlantilla() {
  const blob = await generarPlantillaExcel(undefined, listarCorredores().map(c => c.nombre));
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Plantilla_Flotas.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}

interface Props {
  onDataChange?: (data: Record<string, string>[]) => void;
  carpetaOriginalEmpty?: boolean;
  initialData?: Record<string, string>[];
}

const HojaOriginal = forwardRef<FlotaGridHandle, Props>(function HojaOriginal(
  { onDataChange, carpetaOriginalEmpty = false, initialData },
  ref,
) {
  const gridRef = useRef<FlotaGridHandle>(null);
  useImperativeHandle(ref, () => ({
    getData:    () => gridRef.current?.getData() ?? [],
    setData:    (data) => gridRef.current?.setData(data),
    toRows:     () => gridRef.current?.toRows() ?? [],
    getColDefs: () => gridRef.current?.getColDefs() ?? [],
  }), []);

  const [modeSelected, setModeSelected] = useState(false);
  const [unmapped, setUnmapped]         = useState<string[]>([]);
  const [parseError, setParseError]     = useState<string | null>(null);
  const fileRef     = useRef<HTMLInputElement>(null);
  const reuploadRef = useRef<HTMLInputElement>(null);
  const appendRef   = useRef<HTMLInputElement>(null);

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

  const handleAppendFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setParseError(null);
    try {
      const result = await parseExcelTemplate(file);
      if (result.rows.length > 0) {
        const current = gridRef.current?.getData() ?? [];
        gridRef.current?.setData([...current, ...result.rows]);
        if (result.unmapped.length > 0) setUnmapped(result.unmapped);
      }
    } catch {
      setParseError('No se pudo leer el archivo.');
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Cabecera de paso ── */}
      {!showModeSelect && (
        <div className="sh" style={{ flexShrink: 0, padding: '20px 32px', borderBottom: '1px solid var(--line)' }}>
          <div>
            <h2><b>03</b>ORIGINAL</h2>
            <p>Los datos tal como llegaron desde la plantilla. Solo lectura.</p>
          </div>
          <div className="acts">
            <button className="mini" onClick={() => reuploadRef.current?.click()}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              Re-subir
            </button>
            <button className="mini" onClick={() => appendRef.current?.click()}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Añadir vehículos
            </button>
            <button className="mini pri" onClick={descargarPlantilla}>Descargar plantilla</button>
          </div>
        </div>
      )}

      {/* Aviso de columnas no mapeadas */}
      {unmapped.length > 0 && (
        <div style={{ flexShrink: 0, padding: '6px 16px', background: 'rgba(234,179,8,0.07)', borderBottom: '1px solid rgba(234,179,8,0.2)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#fbbf24' }}>
            {unmapped.length} columna{unmapped.length > 1 ? 's' : ''} no reconocida{unmapped.length > 1 ? 's' : ''}:
          </span>
          <span style={{ fontSize: 11, color: 'rgba(251,191,36,0.8)' }}>{unmapped.join(', ')}</span>
          <button onClick={() => setUnmapped([])} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#fbbf24', fontSize: 15, lineHeight: 1 }}>×</button>
        </div>
      )}

      {parseError && (
        <div style={{ flexShrink: 0, padding: '6px 16px', background: 'rgba(239,68,68,0.07)', borderBottom: '1px solid rgba(239,68,68,0.2)' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#f87171' }}>{parseError}</span>
        </div>
      )}

      {/* Grid (siempre montado) */}
      <div style={{ flex: 1, minHeight: 0, display: showModeSelect ? 'none' : 'flex', flexDirection: 'column' }}>
        {/* Lock note */}
        {!showModeSelect && (
          <div style={{ flexShrink: 0, padding: '12px 32px 0' }}>
            <div className="lock">
              <b>Solo lectura</b>
              <span>Aquí está el dato tal como llegó. Para cambiar algo, descarga la plantilla rellena, edítala y súbela otra vez.</span>
            </div>
          </div>
        )}
        <Suspense fallback={<div className="flex-1 animate-pulse rounded-xl bg-white/5" />}>
          <FlotaGrid
            ref={gridRef}
            initialColDefs={BASE_COL_DEFS}
            initialData={initialData}
            onDataChange={onDataChange}
          />
        </Suspense>
      </div>

      {/* Pantalla de elección de modo */}
      {showModeSelect && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, background: 'transparent' }}>
          <div style={{ textAlign: 'center', maxWidth: 480 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--t-line-soft)', border: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--t-blue)" strokeWidth="1.8">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
              </svg>
            </div>
            <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--t-text)', marginBottom: 8, letterSpacing: '-0.01em' }}>
              Cargar datos de la flota
            </p>
            <p style={{ fontSize: 12, color: 'var(--t-text-2)', marginBottom: 32, lineHeight: 1.5 }}>
              Sube el Excel con los vehículos o rellena las celdas manualmente.
            </p>
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center' }}>
              <button
                onClick={() => fileRef.current?.click()}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '22px 28px', borderRadius: 14, border: '1px solid var(--t-line)', background: 'var(--t-surface)', cursor: 'pointer', transition: 'all 0.15s', minWidth: 160 }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--t-blue)'; (e.currentTarget as HTMLElement).style.background = 'var(--t-line-soft)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--t-line)'; (e.currentTarget as HTMLElement).style.background = 'var(--t-surface)'; }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--t-blue)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text)' }}>Subir Excel</span>
                <span style={{ fontSize: 10, color: 'var(--t-text-3)' }}>.xlsx / .xls</span>
                <span
                  onClick={e => { e.stopPropagation(); descargarPlantilla(); }}
                  style={{ marginTop: 2, fontSize: 10, color: 'var(--t-blue)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}>
                  Descargar plantilla
                </span>
              </button>

              <button
                onClick={() => setModeSelected(true)}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '22px 28px', borderRadius: 14, border: '1px solid var(--t-line)', background: 'var(--t-surface)', cursor: 'pointer', transition: 'all 0.15s', minWidth: 160 }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--t-text-3)'; (e.currentTarget as HTMLElement).style.background = 'var(--t-line-soft)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--t-line)'; (e.currentTarget as HTMLElement).style.background = 'var(--t-surface)'; }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--t-text-2)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
                </svg>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text)' }}>Rellenar manual</span>
                <span style={{ fontSize: 10, color: 'var(--t-text-3)' }}>celda por celda</span>
              </button>
            </div>
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFile} />
        </div>
      )}

      {/* Inputs ocultos */}
      <input ref={reuploadRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFile} />
      <input ref={appendRef}   type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleAppendFile} />
    </div>
  );
});

export default HojaOriginal;
