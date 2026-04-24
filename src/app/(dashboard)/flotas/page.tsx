"use client";

import React, { lazy, Suspense, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import {
  listarCarpetas, crearCarpeta, guardarCarpeta, cargarCarpeta, eliminarCarpeta,
  cambiarEstado,
  type FlotaCarpeta, type EstadoFlota,
} from '@/core/flotas';
import CarpetaScreen, { EstadoBadge } from './components/CarpetaScreen';
import HojaOriginal from './components/HojaOriginal';
import HojaTrabajos from './components/HojaTrabajos';
import HojaSincoUnificado from './components/HojaSincoUnificado';
import HojaInforme from './components/HojaInforme';
import type { HojaOfertaHandle } from './components/HojaOferta';
const HojaOferta = lazy(() => import('./components/HojaOferta'));
import HojaPreEmision from './components/HojaPreEmision';
import HojaDatosGenerales from './components/HojaDatosGenerales';
import type { FlotaGridHandle, FlotaHeader, CoberturaRow } from './components/types';

// ─── Tipos ───────────────────────────────────────────────────────────────────

type TabName = 'DATOS GENERALES' | 'ORIGINAL' | 'TRABAJO' | 'SINCO' | 'INFORME' | 'OFERTA' | 'PRE-EMISIÓN';
const TABS: TabName[] = ['DATOS GENERALES', 'ORIGINAL', 'TRABAJO', 'SINCO', 'INFORME', 'OFERTA', 'PRE-EMISIÓN'];

const EMPTY_HEADER: FlotaHeader = { cif: '', tomador: '', actividad: '', formaPago: '', efecto: '' };

function normalizarCarpeta(c: FlotaCarpeta): FlotaCarpeta {
  return { ...c, estado: c.estado ?? 'EN ESTUDIO', historico: c.historico ?? [] };
}

// ─── Descarga zip ─────────────────────────────────────────────────────────────

async function descargarTodo(carpeta: FlotaCarpeta) {
  const XLSX = await import('xlsx');
  const zip = new JSZip();

  const addSheet = (name: string, data: Record<string, string>[]) => {
    if (data.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, name);
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    zip.file(`${name}.xlsx`, buf);
  };

  addSheet('ORIGINAL',         carpeta.original);
  addSheet('TRABAJO',          carpeta.trabajo);
  addSheet('SINCO_resultados', carpeta.sincoResultados);
  addSheet('OFERTA',           carpeta.oferta);

  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, `${carpeta.nombre}_${new Date().toLocaleDateString('es-ES').replace(/\//g, '-')}.zip`);
}

// ─── FlotasPage ───────────────────────────────────────────────────────────────

export default function FlotasPage() {
  const [activeTab, setActiveTab]         = useState<TabName>('ORIGINAL');
  const [carpetaActiva, setCarpetaActiva] = useState<FlotaCarpeta | null>(null);
  const [showCarpetaScreen, setShowCarpetaScreen] = useState(true);
  const [flotaHeader, setFlotaHeader]     = useState<FlotaHeader>(EMPTY_HEADER);
  const [originalData, setOriginalData]   = useState<Record<string, string>[]>([]);
  const [trabajoRows, setTrabajoRows]     = useState<Record<string, string>[]>([]);
  const [ofertaRows, setOfertaRows]       = useState<Record<string, string>[]>([]);
  const [sincoResultRows, setSincoResultRows] = useState<Record<string, string>[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [estadoPopover, setEstadoPopover] = useState<{ estado: EstadoFlota; motivo: string } | null>(null);

  const originalRef = useRef<FlotaGridHandle>(null);
  const trabajoRef  = useRef<FlotaGridHandle>(null);
  const ofertaRef   = useRef<HojaOfertaHandle>(null);

  // coberturas derivadas de ofertaRows (T-E)
  const coberturas = useMemo<CoberturaRow[]>(() =>
    ofertaRows.map(r => ({
      cobertura:    r['coberturas']        ?? '',
      frq:          r['frq']              ?? '',
      asistencia:   '',
      animales:     false,
      perdidaTotal: false,
      primaMmt:     parseFloat(r['oferta_prima_mmt'] ?? '') || null,
    })), [ofertaRows]);

  // ─── Autoguardado con debounce 500ms (T-C) ─────────────────────────────────

  const carpetaActivaRef = useRef(carpetaActiva);
  carpetaActivaRef.current = carpetaActiva;

  useEffect(() => {
    if (!carpetaActiva) return;
    const timer = setTimeout(() => {
      const updated: FlotaCarpeta = {
        ...carpetaActivaRef.current!,
        header:          flotaHeader,
        original:        originalData,
        trabajo:         trabajoRows,
        sincoResultados: sincoResultRows,
        oferta:          ofertaRows,
      };
      guardarCarpeta(updated);
      setCarpetaActiva(updated);
    }, 500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalData, trabajoRows, ofertaRows, sincoResultRows, flotaHeader]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleSelectCarpeta = useCallback((raw: FlotaCarpeta) => {
    const carpeta = normalizarCarpeta(raw);
    setCarpetaActiva(carpeta);
    setFlotaHeader(carpeta.header);
    setOriginalData(carpeta.original);
    setTrabajoRows(carpeta.trabajo);
    setOfertaRows(carpeta.oferta);
    setSincoResultRows(carpeta.sincoResultados);
    setShowCarpetaScreen(false);
    // Sync grids via refs (mounted in always-visible tabs)
    setTimeout(() => {
      if (carpeta.original.length > 0) originalRef.current?.setData(carpeta.original);
      if (carpeta.trabajo.length > 0)  trabajoRef.current?.setData(carpeta.trabajo);
      if (carpeta.oferta.length > 0)   ofertaRef.current?.setData(carpeta.oferta);
    }, 0);
  }, []);

  const handleOriginalChange = useCallback((data: Record<string, string>[]) => {
    setOriginalData(data);
  }, []);

  const handleTrabajoChange = useCallback((data: Record<string, string>[]) => {
    setTrabajoRows(data);
  }, []);

  const handleOfertaChange = useCallback((data: Record<string, string>[]) => {
    setOfertaRows(data);
  }, []);


  const getOriginalSnapshot = useCallback(() => {
    return originalRef.current?.getData() ?? null;
  }, []);

  const handleCarpetaChange = useCallback((updated: FlotaCarpeta) => {
    setCarpetaActiva(normalizarCarpeta(updated));
  }, []);

  const handleConfirmarEstado = useCallback(() => {
    if (!carpetaActiva || !estadoPopover) return;
    const updated = cambiarEstado(carpetaActiva.id, estadoPopover.estado, estadoPopover.motivo || undefined);
    if (updated) setCarpetaActiva(normalizarCarpeta(updated));
    setEstadoPopover(null);
  }, [carpetaActiva, estadoPopover]);

  const handleDownload = useCallback(async () => {
    if (!carpetaActiva || isDownloading) return;
    setIsDownloading(true);
    try {
      // Snapshot current state before downloading
      const snap: FlotaCarpeta = {
        ...carpetaActiva,
        original:        originalRef.current?.getData() ?? carpetaActiva.original,
        trabajo:         trabajoRef.current?.getData()  ?? carpetaActiva.trabajo,
        oferta:          ofertaRef.current?.getData()   ?? carpetaActiva.oferta,
        sincoResultados: sincoResultRows.length > 0 ? sincoResultRows : carpetaActiva.sincoResultados,
      };
      await descargarTodo(snap);
    } finally {
      setIsDownloading(false);
    }
  }, [carpetaActiva, isDownloading, sincoResultRows]);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Estilos globales grid blanco */}
      <style>{`
        .rdg-light {
          --rdg-background-color: #ffffff;
          --rdg-header-background-color: #f3f4f6;
          --rdg-row-hover-background-color: #f9fafb;
          --rdg-selection-color: #6366f1;
          --rdg-font-size: 12px;
          --rdg-border-color: #e5e7eb;
          color: #111827;
        }
        .rdg-light .rdg-cell {
          border-right: 1px solid #e5e7eb;
          border-bottom: 1px solid #e5e7eb;
        }
        .rdg-light .rdg-header-row .rdg-cell {
          font-weight: 700;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #374151;
        }
      `}</style>

      <div className="h-full flex flex-col animate-in fade-in duration-500">
        {/* Header zona */}
        <div className="glass-card flex items-center justify-between px-5 py-3 rounded-2xl shrink-0 mb-4">
          <div>
            <h1 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
              <div className="w-1.5 h-4 rounded-full" style={{ background: '#6366f1' }} />
              Estudio de Flotas
            </h1>
            <p className="text-[10px] mt-0.5 uppercase tracking-widest font-bold" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Análisis y gestión de flotas de vehículos
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Nombre de carpeta activa + cambiar */}
            {carpetaActiva && !showCarpetaScreen && (
              <>
                {/* Nombre carpeta */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                  style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)' }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2.5">
                    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                  </svg>
                  <span className="text-[11px] font-black" style={{ color: '#818cf8', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {carpetaActiva.nombre}
                  </span>
                  <button onClick={() => setShowCarpetaScreen(true)}
                    className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded"
                    style={{ color: 'rgba(129,140,248,0.7)', background: 'rgba(99,102,241,0.15)', border: 'none', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#818cf8')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'rgba(129,140,248,0.7)')}>
                    Cambiar
                  </button>
                </div>

                {/* Badge estado + dropdown */}
                <div style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <EstadoBadge estado={carpetaActiva.estado} />
                    <select
                      value=""
                      onChange={e => {
                        const val = e.target.value as EstadoFlota;
                        if (val && val !== carpetaActiva.estado) {
                          setEstadoPopover({ estado: val, motivo: '' });
                        }
                      }}
                      style={{ fontSize: 9, background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', outline: 'none', padding: 0, width: 14 }}>
                      <option value="">▼</option>
                      {(['EN ESTUDIO', 'CONTRATADA', 'RECHAZADA'] as EstadoFlota[])
                        .filter(e => e !== carpetaActiva.estado)
                        .map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                  </div>

                  {/* Popover motivo */}
                  {estadoPopover && (
                    <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 50, padding: 12, borderRadius: 10, background: 'rgba(2,6,23,0.97)', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', minWidth: 220 }}>
                      <p style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                        Cambiar a <EstadoBadge estado={estadoPopover.estado} small />
                      </p>
                      <input
                        autoFocus
                        placeholder="Motivo (opcional)"
                        value={estadoPopover.motivo}
                        onChange={e => setEstadoPopover(p => p ? { ...p, motivo: e.target.value } : null)}
                        onKeyDown={e => { if (e.key === 'Enter') handleConfirmarEstado(); if (e.key === 'Escape') setEstadoPopover(null); }}
                        className="orion-input"
                        style={{ width: '100%', fontSize: 11, marginBottom: 8 }}
                      />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={handleConfirmarEstado}
                          style={{ flex: 1, fontSize: 10, fontWeight: 800, padding: '4px 0', borderRadius: 6, background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer' }}>
                          Confirmar
                        </button>
                        <button onClick={() => setEstadoPopover(null)}
                          style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', border: 'none', cursor: 'pointer' }}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Descargar todo */}
                <button onClick={handleDownload} disabled={isDownloading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: '#16a34a', background: 'rgba(22,163,74,0.07)', border: '1px solid rgba(22,163,74,0.25)', opacity: isDownloading ? 0.5 : 1, cursor: isDownloading ? 'not-allowed' : 'pointer' }}
                  onMouseEnter={e => { if (!isDownloading) (e.currentTarget.style.background = 'rgba(22,163,74,0.14)'); }}
                  onMouseLeave={e => { if (!isDownloading) (e.currentTarget.style.background = 'rgba(22,163,74,0.07)'); }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                  </svg>
                  {isDownloading ? 'Generando...' : 'Descargar todo'}
                </button>
              </>
            )}

            <div className="text-[10px] font-black px-2 py-1 rounded-lg"
              style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.3)' }}>
              {showCarpetaScreen ? 'CARPETAS' : activeTab}
            </div>
          </div>
        </div>

        {/* Contenedor principal */}
        <div className="flex-1 flex flex-col min-h-0 rounded-2xl overflow-hidden"
          style={{ background: 'rgba(2,6,23,0.85)', border: '1px solid rgba(255,255,255,0.08)' }}>

          {/* Pantalla de carpeta */}
          {showCarpetaScreen && (
            <CarpetaScreen onSelect={handleSelectCarpeta} />
          )}

          {/* Hojas — siempre montadas, visibilidad por display */}
          <div className="flex-1 min-h-0 relative" style={{ display: showCarpetaScreen ? 'none' : 'block' }}>
            {TABS.map(tab => (
              <div key={tab}
                style={{ position: 'absolute', inset: 0, display: activeTab === tab ? 'flex' : 'none', flexDirection: 'column' }}>
                {tab === 'DATOS GENERALES' && carpetaActiva && (
                  <HojaDatosGenerales
                    carpetaActiva={carpetaActiva}
                    header={flotaHeader}
                    onHeaderChange={setFlotaHeader}
                    onCarpetaChange={handleCarpetaChange}
                  />
                )}
                {tab === 'ORIGINAL' && (
                  <HojaOriginal
                    ref={originalRef}
                    header={flotaHeader}
                    onHeaderChange={setFlotaHeader}
                    onDataChange={handleOriginalChange}
                    carpetaOriginalEmpty={carpetaActiva ? carpetaActiva.original.length === 0 : false}
                  />
                )}
                {tab === 'TRABAJO' && (
                  <HojaTrabajos
                    ref={trabajoRef}
                    header={flotaHeader}
                    onHeaderChange={setFlotaHeader}
                    getOriginalSnapshot={getOriginalSnapshot}
                    onDataChange={handleTrabajoChange}
                  />
                )}
                {tab === 'SINCO' && carpetaActiva && (
                  <HojaSincoUnificado
                    header={flotaHeader}
                    trabajoRows={trabajoRows}
                    carpetaActiva={carpetaActiva}
                    sincoResultRows={sincoResultRows}
                    onSincoResultChange={setSincoResultRows}
                    onTrabajoChange={setTrabajoRows}
                    onCarpetaChange={handleCarpetaChange}
                  />
                )}
                {tab === 'INFORME' && (
                  <HojaInforme
                    trabajoRows={trabajoRows}
                    coberturas={coberturas}
                    sincoResultRows={sincoResultRows}
                    sincoManual={carpetaActiva?.sincoManual ?? []}
                    sincoGlobal={carpetaActiva?.sincoGlobal ?? null}
                  />
                )}
                {tab === 'OFERTA' && (
                  <Suspense fallback={<div className="flex-1 animate-pulse rounded-xl bg-white/5" />}>
                    <HojaOferta
                      ref={ofertaRef}
                      trabajoRows={trabajoRows}
                      onDataChange={handleOfertaChange}
                    />
                  </Suspense>
                )}
                {tab === 'PRE-EMISIÓN' && (
                  <HojaPreEmision trabajoRows={trabajoRows} />
                )}
              </div>
            ))}
          </div>

          {/* Tabs Excel inferiores */}
          {!showCarpetaScreen && (
            <div className="flex items-end shrink-0 px-2 gap-0.5 flex-wrap"
              style={{ borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.3)' }}>
              {TABS.map(tab => {
                const isActive = activeTab === tab;
                return (
                  <button key={tab} onClick={() => setActiveTab(tab)}
                    className="px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap rounded-t-lg"
                    style={isActive
                      ? { background: 'rgba(99,102,241,0.2)', color: '#818cf8', borderTop: '2px solid #6366f1', borderLeft: '1px solid rgba(99,102,241,0.3)', borderRight: '1px solid rgba(99,102,241,0.3)', marginBottom: '-1px' }
                      : { background: 'transparent', color: 'rgba(255,255,255,0.3)', borderTop: '2px solid transparent' }}
                    onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.6)'; }}
                    onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.3)'; }}>
                    {tab}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
