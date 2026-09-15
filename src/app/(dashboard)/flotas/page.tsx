"use client";

import React, { lazy, Suspense, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import {
  listarCarpetas, crearCarpeta, guardarCarpeta, cargarCarpeta, eliminarCarpeta,
  cambiarEstado, listarCorredores, sesionJoin, sesionLeave, sesionHeartbeat,
  type FlotaCarpeta, type EstadoFlota,
} from '@/core/flotas';

// Simple identity for open-flotas tab label
function flotaLabel(f: FlotaCarpeta) {
  return f.nombre?.trim() || 'Sin nombre';
}
import CarpetaScreen, { EstadoBadge } from './components/CarpetaScreen';
import HojaOriginal from './components/HojaOriginal';
import HojaTrabajos from './components/HojaTrabajos';
import HojaSincoUnificado from './components/HojaSincoUnificado';
import HojaInforme from './components/HojaInforme';
import type { HojaOfertaHandle } from './components/HojaOferta';
const HojaOferta = lazy(() => import('./components/HojaOferta'));
import HojaPreEmision from './components/HojaPreEmision';
import HojaDatosGenerales from './components/HojaDatosGenerales';
import HojaAutomatico from './components/HojaAutomatico';
import type { FlotaGridHandle, FlotaHeader, CoberturaRow } from './components/types';

// ─── Tipos ───────────────────────────────────────────────────────────────────

type TabName = 'DATOS GENERALES' | 'AUTOMÁTICO' | 'ORIGINAL' | 'TRABAJO' | 'SINCO' | 'INFORME' | 'OFERTA' | 'PRE-EMISIÓN';
const TABS: TabName[] = ['DATOS GENERALES', 'AUTOMÁTICO', 'ORIGINAL', 'TRABAJO', 'SINCO', 'INFORME', 'OFERTA', 'PRE-EMISIÓN'];

const EMPTY_HEADER: FlotaHeader = { cif: '', tomador: '', actividad: '', formaPago: '', efecto: '' };

function normalizarCarpeta(c: FlotaCarpeta): FlotaCarpeta {
  return { ...c, estado: c.estado ?? 'EN ESTUDIO', historico: c.historico ?? [] };
}

// ─── Descarga zip ────────────────────────────────────────────────────────────

async function descargarTodo(carpeta: FlotaCarpeta, corredorNombre?: string) {
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

  // 1. Datos generales
  const datosGenerales: Record<string, string>[] = [
    { campo: 'CIF', valor: carpeta.header.cif },
    { campo: 'Tomador', valor: carpeta.header.tomador },
    { campo: 'CIF Tomador', valor: carpeta.header.cifTomador ?? '' },
    { campo: 'Actividad', valor: carpeta.header.actividad },
    { campo: 'Forma de pago', valor: carpeta.header.formaPago },
    { campo: 'Periodicidad', valor: carpeta.header.periodicidad ?? '' },
    { campo: 'Efecto', valor: carpeta.header.efecto },
    { campo: 'Fecha inicio', valor: carpeta.header.fechaInicio ?? '' },
    { campo: 'Fecha vencimiento', valor: carpeta.header.fechaVencimiento ?? '' },
    { campo: 'Poliza actual', valor: carpeta.header.polizaActual ?? '' },
    { campo: 'CIA Actual', valor: carpeta.header.ciaActual ?? '' },
    { campo: 'Fecha emision', valor: carpeta.header.fechaEmision ?? '' },
  ];
  if (carpeta.tarifaFlota && carpeta.tarifaFlota.length > 0) {
    datosGenerales.push({ campo: '', valor: '' });
    datosGenerales.push({ campo: '--- TARIFA ACORDADA ---', valor: '' });
    for (const t of carpeta.tarifaFlota) {
      datosGenerales.push({ campo: `${t.tipo} / ${t.cobertura}`, valor: String(t.precio) });
    }
  }
  addSheet('DATOS_GENERALES', datosGenerales);

  // 2. Original
  addSheet('ORIGINAL', carpeta.original);

  // 3. Trabajo
  addSheet('TRABAJO', carpeta.trabajo);

  // 4. SINCO
  addSheet('SINCO', carpeta.sincoResultados);

  // 5. Informe — composición + primas MMT
  const informeRows: Record<string, string>[] = [];
  // Agrupar por tipo+cobertura
  const grupos: Record<string, { tipo: string; cob: string; count: number; sumaPrima: number }> = {};
  carpeta.trabajo.filter(r => r['matricula']?.trim()).forEach(r => {
    const tipo = (r['tipo_vehiculo'] || 'Sin tipo').toUpperCase().trim();
    const cob = r['coberturas_solicitadas'] || 'Sin cobertura';
    const key = `${tipo}||${cob}`;
    const prima = parseFloat(r['prima_referencia'] ?? '');
    if (!grupos[key]) grupos[key] = { tipo, cob, count: 0, sumaPrima: 0 };
    grupos[key].count++;
    if (!isNaN(prima)) grupos[key].sumaPrima += prima;
  });
  const primasMmt = carpeta.primasMmtInforme ?? {};
  for (const [key, g] of Object.entries(grupos)) {
    const mmtPrima = primasMmt[key];
    informeRows.push({
      'Tipo Vehiculo': g.tipo,
      'Coberturas': g.cob,
      'Num Vehiculos': String(g.count),
      'Prima Referencia Media': g.count > 0 ? (g.sumaPrima / g.count).toFixed(2) : '0',
      'Prima Referencia Total': g.sumaPrima.toFixed(2),
      'Prima MMT': mmtPrima != null ? String(mmtPrima) : '',
      'Prima MMT Total': mmtPrima != null ? (mmtPrima * g.count).toFixed(2) : '',
    });
  }
  addSheet('INFORME', informeRows);

  // 6. Oferta
  addSheet('OFERTA', carpeta.oferta);

  // 7. Intentar descargar oferta con plantilla via API
  try {
    const vehiculos = carpeta.oferta.filter(r => r['matricula']?.trim()).map(r => ({
      tomador: carpeta.header.tomador,
      tipologia: r['tipo_vehiculo'] ?? '',
      matricula: r['matricula'] ?? '',
      marca: r['marca'] ?? '',
      modelo: r['modelo'] ?? '',
      coberturas: r['coberturas'] ?? r['coberturas_solicitadas'] ?? '',
      prima_actual: parseFloat(r['prima_referencia'] ?? '0') || 0,
      forma_pago: carpeta.header.formaPago,
      fecha_vencimiento: r['fecha_vencimiento'] ?? carpeta.header.fechaVencimiento ?? '',
      prima_ofertada: parseFloat(r['oferta_prima_mmt'] ?? '0') || 0,
    }));
    if (vehiculos.length > 0) {
      const res = await fetch('/api/flotas/oferta/excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flota_nombre: carpeta.nombre,
          empresa_nombre: carpeta.header.tomador,
          empresa_cif: carpeta.header.cif,
          vehiculos,
        }),
      });
      if (res.ok) {
        const ofertaBlob = await res.arrayBuffer();
        zip.file('OFERTA_PLANTILLA.xlsx', ofertaBlob);
      }
    }
  } catch { /* si falla la plantilla, no pasa nada, ya tiene OFERTA.xlsx */ }

  // Nombre: FLOTA - CORREDOR
  const fecha = new Date().toLocaleDateString('es-ES').replace(/\//g, '-');
  const nombreFlota = carpeta.nombre.replace(/[/\\:*?"<>|]/g, '');
  const nombreCorr = corredorNombre ? ` - ${corredorNombre.replace(/[/\\:*?"<>|]/g, '')}` : '';
  const zipName = `${nombreFlota}${nombreCorr}_${fecha}.zip`;

  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, zipName);
}

// ─── FlotasPage ─────────────────────────────────────────────────────────────

export default function FlotasPage() {
  const [activeTab, setActiveTab] = useState<TabName>('ORIGINAL');
  const [carpetaActiva, setCarpetaActiva] = useState<FlotaCarpeta | null>(null);
  const [showCarpetaScreen, setShowCarpetaScreen] = useState(true);
  const [flotaHeader, setFlotaHeader] = useState<FlotaHeader>(EMPTY_HEADER);
  const [originalData, setOriginalData] = useState<Record<string, string>[]>([]);
  const [trabajoRows, setTrabajoRows] = useState<Record<string, string>[]>([]);
  const [ofertaRows, setOfertaRows] = useState<Record<string, string>[]>([]);
  const [sincoResultRows, setSincoResultRows] = useState<Record<string, string>[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);
  const [estadoPopover, setEstadoPopover] = useState<{ estado: EstadoFlota; motivo: string } | null>(null);
  const [openFlotas, setOpenFlotas] = useState<FlotaCarpeta[]>([]);

  const originalRef = useRef<FlotaGridHandle>(null);
  const trabajoRef = useRef<FlotaGridHandle>(null);
  const ofertaRef = useRef<HojaOfertaHandle>(null);

  const coberturas = useMemo<CoberturaRow[]>(() =>
    ofertaRows.map(r => ({
      cobertura: r['coberturas'] ?? '',
      frq: r['frq'] ?? '',
      asistencia: '',
      animales: false,
      perdidaTotal: false,
      primaMmt: parseFloat(r['oferta_prima_mmt'] ?? '') || null,
    })), [ofertaRows]);

  // ─── Autoguardado ─────────────────────────────────────────────────────────

  const carpetaActivaRef = useRef(carpetaActiva);
  carpetaActivaRef.current = carpetaActiva;

  useEffect(() => {
    if (!carpetaActiva) return;
    const timer = setTimeout(() => {
      const updated: FlotaCarpeta = {
        ...carpetaActivaRef.current!,
        header: flotaHeader,
        original: originalData,
        trabajo: trabajoRows,
        sincoResultados: sincoResultRows,
        oferta: ofertaRows,
      };
      guardarCarpeta(updated);
      setCarpetaActiva(updated);
    }, 2000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalData, trabajoRows, ofertaRows, sincoResultRows, flotaHeader]);

  // ─── Sesión activa — heartbeat mientras se estudia una carpeta ───────────────

  useEffect(() => {
    if (!carpetaActiva) return;
    const id = carpetaActiva.id;
    sesionJoin(id);
    const hb = setInterval(() => sesionHeartbeat(id), 30_000);
    return () => {
      clearInterval(hb);
      sesionLeave(id);
    };
  }, [carpetaActiva?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleSelectCarpeta = useCallback((raw: FlotaCarpeta) => {
    const carpeta = normalizarCarpeta(raw);
    setOpenFlotas(prev => {
      const rest = prev.filter(f => f.id !== carpeta.id);
      return [carpeta, ...rest].slice(0, 3);
    });
    setCarpetaActiva(carpeta);
    setFlotaHeader(carpeta.header);
    setOriginalData(carpeta.original);
    setOfertaRows(carpeta.oferta);
    setSincoResultRows(carpeta.sincoResultados);
    setShowCarpetaScreen(false);
    setTimeout(() => {
      if (carpeta.oferta.length > 0) ofertaRef.current?.setData(carpeta.oferta);
      if (carpeta.original.length > 0) originalRef.current?.setData(carpeta.original);
      if (carpeta.trabajo.length > 0) trabajoRef.current?.setData(carpeta.trabajo);
    }, 0);
    setTrabajoRows(carpeta.trabajo);
  }, []);

  const handleOriginalChange = useCallback((data: Record<string, string>[]) => { setOriginalData(data); }, []);
  const handleTrabajoChange = useCallback((data: Record<string, string>[]) => { setTrabajoRows(data); }, []);
  const handleOfertaChange = useCallback((data: Record<string, string>[]) => { setOfertaRows(data); }, []);
  const getOriginalSnapshot = useCallback(() => originalRef.current?.getData() ?? null, []);
  const handleCarpetaChange = useCallback((updated: FlotaCarpeta) => { setCarpetaActiva(normalizarCarpeta(updated)); }, []);

  const handleSwitchFlota = useCallback((target: FlotaCarpeta) => {
    if (carpetaActiva?.id === target.id) { setShowCarpetaScreen(false); return; }
    // Flush current state
    if (carpetaActiva) {
      guardarCarpeta({
        ...carpetaActiva,
        header: flotaHeader,
        original: originalRef.current?.getData() ?? originalData,
        trabajo: trabajoRef.current?.getData() ?? trabajoRows,
        sincoResultados: sincoResultRows,
        oferta: ofertaRef.current?.getData() ?? ofertaRows,
      });
    }
    // Load fresh from localStorage (autosave already persisted the target)
    const fresh = normalizarCarpeta(cargarCarpeta(target.id) ?? target);
    setCarpetaActiva(fresh);
    setFlotaHeader(fresh.header);
    setOriginalData(fresh.original);
    setOfertaRows(fresh.oferta);
    setSincoResultRows(fresh.sincoResultados);
    setShowCarpetaScreen(false);
    setTimeout(() => {
      if (fresh.oferta.length > 0) ofertaRef.current?.setData(fresh.oferta);
      if (fresh.original.length > 0) originalRef.current?.setData(fresh.original);
      if (fresh.trabajo.length > 0) trabajoRef.current?.setData(fresh.trabajo);
    }, 0);
    setTrabajoRows(fresh.trabajo);
  }, [carpetaActiva, flotaHeader, originalData, trabajoRows, sincoResultRows, ofertaRows]);

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
      const snap: FlotaCarpeta = {
        ...carpetaActiva,
        original: originalRef.current?.getData() ?? carpetaActiva.original,
        trabajo: trabajoRef.current?.getData() ?? carpetaActiva.trabajo,
        oferta: ofertaRef.current?.getData() ?? carpetaActiva.oferta,
        sincoResultados: sincoResultRows.length > 0 ? sincoResultRows : carpetaActiva.sincoResultados,
      };
      // Buscar nombre del corredor
      let corredorNombre: string | undefined;
      if (snap.corredor_id) {
        const corredores = listarCorredores();
        const corr = corredores.find(c => c.id === snap.corredor_id);
        if (corr) corredorNombre = corr.nombre;
      }
      await descargarTodo(snap, corredorNombre);
    } finally { setIsDownloading(false); }
  }, [carpetaActiva, isDownloading, sincoResultRows]);

  const handleSave = useCallback(() => {
    if (!carpetaActiva) return;
    const updated: FlotaCarpeta = {
      ...carpetaActiva,
      header: flotaHeader,
      original: originalRef.current?.getData() ?? originalData,
      trabajo: trabajoRef.current?.getData() ?? trabajoRows,
      sincoResultados: sincoResultRows,
      oferta: ofertaRef.current?.getData() ?? ofertaRows,
    };
    guardarCarpeta(updated);
    setCarpetaActiva(updated);
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 1500);
  }, [carpetaActiva, flotaHeader, originalData, trabajoRows, sincoResultRows, ofertaRows]);

  const numVeh = carpetaActiva
    ? ((carpetaActiva.trabajo?.length > 0 ? carpetaActiva.trabajo : carpetaActiva.original)?.filter(r => r['matricula']?.trim()).length ?? 0)
    : 0;

  const tabComplete = useMemo<Record<TabName, boolean>>(() => ({
    'DATOS GENERALES': !!flotaHeader.tomador?.trim(),
    'AUTOMÁTICO': false,
    'ORIGINAL': originalData.length > 0,
    'TRABAJO': trabajoRows.length > 0,
    'SINCO': sincoResultRows.length > 0,
    'INFORME': Object.keys(carpetaActiva?.primasMmtInforme ?? {}).length > 0,
    'OFERTA': ofertaRows.length > 0,
    'PRE-EMISIÓN': Object.keys(carpetaActiva?.catalogoSeleccion ?? {}).length > 0,
  }), [flotaHeader, originalData, trabajoRows, sincoResultRows, carpetaActiva, ofertaRows]);

  const completedCount = useMemo(() => TABS.filter(t => tabComplete[t]).length, [tabComplete]);
  const activeTabIndex = TABS.indexOf(activeTab);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        .rdg-light {
          --rdg-background-color: #ffffff;
          --rdg-header-background-color: #f3f4f6;
          --rdg-row-hover-background-color: #f9fafb;
          --rdg-selection-color: #1240CC;
          --rdg-font-size: 13px;
          --rdg-border-color: #e5e7eb;
          color: #111827;
        }
        .rdg-light .rdg-cell {
          border-right: 1px solid #e5e7eb;
          border-bottom: 1px solid #e5e7eb;
        }
        .rdg-light .rdg-header-row .rdg-cell {
          font-weight: 700;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          color: #374151;
          text-align: center;
          justify-content: center;
        }
      `}</style>

      <div className="flex flex-col animate-in fade-in duration-500" style={{ height: 'calc(100vh - 126px)' }}>
        {/* Zone header */}
        {!showCarpetaScreen && carpetaActiva && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 12,
            padding: '14px 22px', marginBottom: 18, borderRadius: 18,
            background: 'rgba(12, 28, 82, 0.75)',
            border: '1px solid rgba(61, 112, 255, 0.22)',
            position: 'relative', zIndex: 20,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 4, height: 32, borderRadius: 2,
                background: 'linear-gradient(180deg, #1240CC, #3366FF)',
                boxShadow: '0 0 12px rgba(70,120,255,0.5)',
              }} />
              <div>
                <h1 style={{
                  margin: 0, fontSize: 18, color: '#FFFFFF',
                  fontFamily: 'var(--font-display), Inter, sans-serif', fontWeight: 700,
                }}>Estudio de Flotas</h1>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(178,198,245,0.6)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>Paso {activeTabIndex + 1}/{TABS.length} — {activeTab}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    color: completedCount === TABS.length ? '#10b981' : '#3366FF',
                    background: completedCount === TABS.length ? 'rgba(16,185,129,0.12)' : 'rgba(51,102,255,0.12)',
                    border: `1px solid ${completedCount === TABS.length ? 'rgba(16,185,129,0.3)' : 'rgba(51,102,255,0.25)'}`,
                    borderRadius: 999, padding: '1px 7px',
                  }}>{completedCount}/{TABS.length} completos</span>
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {/* Folder pill */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 14px', borderRadius: 999,
                background: 'rgba(61,112,255,0.12)', border: '1px solid rgba(51,102,255,0.2)',
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {carpetaActiva.nombre}
                </span>
                <span style={{ fontSize: 12, color: 'rgba(178,198,245,0.6)', fontStyle: 'italic' }}>
                  {numVeh} veh.
                </span>
              </div>

              {/* Estado */}
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 4 }}>
                <EstadoBadge estado={carpetaActiva.estado} />
                <select value="" onChange={e => {
                  const val = e.target.value as EstadoFlota;
                  if (val && val !== carpetaActiva.estado) setEstadoPopover({ estado: val, motivo: '' });
                }} style={{
                  fontSize: 13, background: 'rgba(3,10,42,0.8)', border: '1px solid rgba(61,112,255,0.22)',
                  color: '#BDD4FF', cursor: 'pointer', outline: 'none', padding: '4px 8px',
                  borderRadius: 6, appearance: 'auto',
                }}>
                  <option value="" style={{ background: '#020B1A', color: '#BDD4FF' }}>Cambiar estado</option>
                  {(['EN ESTUDIO', 'OFERTADA', 'CONTRATADA', 'RECHAZADA'] as EstadoFlota[])
                    .filter(e => e !== carpetaActiva.estado)
                    .map(e => <option key={e} value={e} style={{ background: '#020B1A', color: '#BDD4FF' }}>{e}</option>)}
                </select>

                {estadoPopover && (
                  <div style={{
                    position: 'absolute', top: '100%', right: 0, marginTop: 8, zIndex: 100,
                    padding: 14, borderRadius: 14,
                    background: 'rgba(0,7,45,0.97)', border: '1px solid rgba(61,112,255,0.22)',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.6)', minWidth: 220,
                  }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(178,198,245,0.6)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                      Cambiar a <EstadoBadge estado={estadoPopover.estado} small />
                    </p>
                    <input autoFocus placeholder="Motivo (opcional)"
                      value={estadoPopover.motivo}
                      onChange={e => setEstadoPopover(p => p ? { ...p, motivo: e.target.value } : null)}
                      onKeyDown={e => { if (e.key === 'Enter') handleConfirmarEstado(); if (e.key === 'Escape') setEstadoPopover(null); }}
                      className="orion-input" style={{ width: '100%', fontSize: 12, marginBottom: 10 }} />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={handleConfirmarEstado} style={{
                        flex: 1, fontSize: 11, fontWeight: 600, padding: '6px 0', borderRadius: 8,
                        background: 'linear-gradient(135deg, #1240CC, #3366FF)', color: '#fff', border: 'none', cursor: 'pointer',
                      }}>Confirmar</button>
                      <button onClick={() => setEstadoPopover(null)} style={{
                        fontSize: 11, padding: '6px 12px', borderRadius: 8,
                        background: 'rgba(6,14,50,0.5)', color: '#BDD4FF', border: '1px solid rgba(61,112,255,0.22)', cursor: 'pointer',
                      }}>Cancelar</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Cambiar */}
              <button onClick={() => setShowCarpetaScreen(true)} style={{
                background: 'rgba(6,14,50,0.5)', border: '1px solid rgba(61,112,255,0.22)',
                borderRadius: 8, padding: '5px 12px', color: '#BDD4FF', fontSize: 13, cursor: 'pointer', fontWeight: 500,
              }}>Cambiar</button>

              {/* Guardar */}
              <button onClick={handleSave} style={{
                background: saveFlash ? 'rgba(34,197,94,0.2)' : 'rgba(6,14,50,0.5)',
                border: `1px solid ${saveFlash ? 'rgba(34,197,94,0.4)' : 'rgba(61,112,255,0.22)'}`,
                borderRadius: 8, padding: '6px 14px',
                color: saveFlash ? '#4ade80' : '#BDD4FF', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5,
                transition: 'all 300ms',
              }}>
                {saveFlash ? (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    Guardado
                  </>
                ) : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
                      <polyline points="17 21 17 13 7 13 7 21"/>
                      <polyline points="7 3 7 8 15 8"/>
                    </svg>
                    Guardar
                  </>
                )}
              </button>

              {/* Download */}
              <button onClick={handleDownload} disabled={isDownloading} style={{
                background: 'linear-gradient(135deg, #1240CC, #3366FF)',
                border: 'none', borderRadius: 8, padding: '6px 14px',
                color: '#fff', fontSize: 13, fontWeight: 600, cursor: isDownloading ? 'not-allowed' : 'pointer',
                opacity: isDownloading ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 5,
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                </svg>
                {isDownloading ? 'Generando...' : 'Descargar todo'}
              </button>
            </div>
          </div>
        )}

        {/* Open flotas quick-switch strip */}
        {openFlotas.length > 1 && (
          <div style={{
            flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 22px', marginBottom: 6,
            background: 'rgba(0,7,45,0.5)',
            borderRadius: 12, border: '1px solid rgba(51,102,255,0.1)',
          }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(178,198,245,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: 4 }}>Abiertas</span>
            {openFlotas.map(f => (
              <button key={f.id} onClick={() => handleSwitchFlota(f)} style={{
                padding: '3px 12px', fontSize: 11, fontWeight: 600, borderRadius: 6,
                background: carpetaActiva?.id === f.id ? 'rgba(18,64,204,0.3)' : 'rgba(6,14,50,0.5)',
                border: `1px solid ${carpetaActiva?.id === f.id ? 'rgba(51,102,255,0.45)' : 'rgba(61,112,255,0.15)'}`,
                color: carpetaActiva?.id === f.id ? '#3D7BFF' : 'rgba(178,198,245,0.7)',
                cursor: carpetaActiva?.id === f.id ? 'default' : 'pointer',
                maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                transition: 'all 150ms',
              }}>
                {flotaLabel(f)}
              </button>
            ))}
          </div>
        )}

        {/* Main container */}
        <div className="flex-1 flex flex-col min-h-0 rounded-2xl overflow-hidden"
          style={{ background: 'rgba(0,7,45,0.85)', border: '1px solid rgba(51,102,255,0.1)' }}>

          {showCarpetaScreen && <CarpetaScreen onSelect={handleSelectCarpeta} />}

          {/* Hojas */}
          <div className="flex-1 min-h-0 relative" style={{ display: showCarpetaScreen ? 'none' : 'block' }}>
            {TABS.map(tab => (
              <div key={tab} style={{ position: 'absolute', inset: 0, display: activeTab === tab ? 'flex' : 'none', flexDirection: 'column' }}>
                {tab === 'DATOS GENERALES' && carpetaActiva && (
                  <HojaDatosGenerales carpetaActiva={carpetaActiva} header={flotaHeader} onHeaderChange={setFlotaHeader} onCarpetaChange={handleCarpetaChange} />
                )}
                {tab === 'AUTOMÁTICO' && (
                  <HojaAutomatico
                    header={flotaHeader}
                    carpetaActiva={carpetaActiva}
                    onHeaderUpdate={(h) => {
                      setFlotaHeader(prev => ({ ...prev, ...h }));
                    }}
                    onVehiclesProcessed={(vehicles) => {
                      if (!carpetaActiva) return;
                      const updated = { ...carpetaActiva, automaticoVehicles: vehicles };
                      guardarCarpeta(updated);
                      setCarpetaActiva(normalizarCarpeta(updated));
                    }}
                    onComplete={(rows) => {
                      setTrabajoRows(rows);
                      setOriginalData(rows);
                      setTimeout(() => {
                        trabajoRef.current?.setData(rows);
                        originalRef.current?.setData(rows);
                      }, 0);
                      setActiveTab('SINCO');
                    }}
                  />
                )}
                {tab === 'ORIGINAL' && (
                  <HojaOriginal ref={originalRef} header={flotaHeader} onHeaderChange={setFlotaHeader} onDataChange={handleOriginalChange} carpetaOriginalEmpty={carpetaActiva ? carpetaActiva.original.length === 0 : false} />
                )}
                {tab === 'TRABAJO' && (
                  <HojaTrabajos ref={trabajoRef} header={flotaHeader} onHeaderChange={setFlotaHeader} getOriginalSnapshot={getOriginalSnapshot} onDataChange={handleTrabajoChange} />
                )}
                {tab === 'SINCO' && carpetaActiva && (
                  <HojaSincoUnificado header={flotaHeader} trabajoRows={trabajoRows} carpetaActiva={carpetaActiva} sincoResultRows={sincoResultRows} onSincoResultChange={setSincoResultRows} onTrabajoChange={setTrabajoRows} onCarpetaChange={handleCarpetaChange} />
                )}
                {tab === 'INFORME' && (() => {
                  const corredor = carpetaActiva?.corredor_id
                    ? listarCorredores().find(c => c.id === carpetaActiva.corredor_id)
                    : null;
                  const corredorLabel = corredor
                    ? [corredor.comercial, corredor.nombre].filter(Boolean).join(' · ')
                    : undefined;
                  return (
                    <HojaInforme header={flotaHeader} trabajoRows={trabajoRows} coberturas={coberturas} sincoResultRows={sincoResultRows} sincoManual={carpetaActiva?.sincoManual ?? []} sincoGlobal={carpetaActiva?.sincoGlobal ?? null} primasMmtValues={carpetaActiva?.primasMmtInforme} onPrimasMmtChange={(primas) => { if (carpetaActiva) { const updated = { ...carpetaActiva, primasMmtInforme: primas }; setCarpetaActiva(updated); guardarCarpeta(updated); } }} tarifaFlota={carpetaActiva?.tarifaFlota} corredorLabel={corredorLabel} />
                  );
                })()}
                {tab === 'OFERTA' && (
                  <Suspense fallback={<div className="flex-1 animate-pulse rounded-xl bg-white/5" />}>
                    <HojaOferta
                      ref={ofertaRef}
                      trabajoRows={trabajoRows}
                      header={flotaHeader}
                      carpetaNombre={carpetaActiva?.nombre}
                      primasMmt={carpetaActiva?.primasMmtInforme}
                      onDataChange={handleOfertaChange}
                      primaClienteTotal={carpetaActiva?.primaClienteTotal}
                      descuentoOferta={carpetaActiva?.descuentoOferta}
                      descuentosCoberturas={carpetaActiva?.descuentosCoberturas}
                      onOfertaFieldsChange={(fields) => {
                        if (!carpetaActiva) return;
                        const updated = { ...carpetaActiva, ...fields };
                        setCarpetaActiva(normalizarCarpeta(updated));
                        guardarCarpeta(updated);
                      }}
                    />
                  </Suspense>
                )}
                {tab === 'PRE-EMISIÓN' && (
                  <HojaPreEmision trabajoRows={trabajoRows} onCatalogoChange={(selecciones) => { if (carpetaActiva) setCarpetaActiva({ ...carpetaActiva, catalogoSeleccion: selecciones }); }} />
                )}
              </div>
            ))}
          </div>

          {/* Tab bar at bottom */}
          {!showCarpetaScreen && (
            <div style={{
              display: 'flex', alignItems: 'stretch', gap: 0, padding: '0 8px',
              borderTop: '1px solid rgba(61,112,255,0.16)', background: 'rgba(0,7,45,0.6)',
              flexShrink: 0,
            }}>
              {/* Prev */}
              <button
                onClick={() => { if (activeTabIndex > 0) setActiveTab(TABS[activeTabIndex - 1]); }}
                disabled={activeTabIndex === 0}
                style={{
                  padding: '0 10px', fontSize: 11, fontWeight: 600, border: 'none',
                  background: 'transparent', cursor: activeTabIndex === 0 ? 'default' : 'pointer',
                  color: activeTabIndex === 0 ? 'rgba(178,198,245,0.15)' : 'rgba(178,198,245,0.5)',
                  display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
                  transition: 'color 150ms',
                }}
                onMouseEnter={e => { if (activeTabIndex > 0) e.currentTarget.style.color = '#BDD4FF'; }}
                onMouseLeave={e => { if (activeTabIndex > 0) e.currentTarget.style.color = 'rgba(178,198,245,0.5)'; }}
                title="Paso anterior"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
              </button>

              {/* Tabs */}
              {TABS.map((tab, idx) => {
                const isActive = activeTab === tab;
                const done = tabComplete[tab];
                return (
                  <button key={tab} onClick={() => setActiveTab(tab)} style={{
                    padding: '9px 14px', fontSize: 11, fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                    whiteSpace: 'nowrap', border: 'none', cursor: 'pointer',
                    borderTopLeftRadius: 8, borderTopRightRadius: 8,
                    borderTop: isActive ? '2px solid #1240CC' : '2px solid transparent',
                    background: isActive ? 'rgba(18,64,204,0.15)' : 'transparent',
                    color: isActive ? '#3366FF' : done ? 'rgba(178,198,245,0.55)' : 'rgba(178,198,245,0.35)',
                    transition: 'all 180ms',
                    marginBottom: -1,
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = '#BDD4FF'; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = done ? 'rgba(178,198,245,0.55)' : 'rgba(178,198,245,0.35)'; }}
                  >
                    <span style={{
                      fontSize: 8, fontWeight: 800, lineHeight: 1,
                      color: isActive ? '#3366FF' : done ? 'rgba(16,185,129,0.7)' : 'rgba(178,198,245,0.25)',
                    }}>{String(idx + 1).padStart(2, '0')}</span>
                    {tab}
                    {done && (
                      <span style={{
                        width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                        background: isActive ? '#3366FF' : '#10b981',
                        boxShadow: `0 0 5px ${isActive ? 'rgba(51,102,255,0.5)' : 'rgba(16,185,129,0.5)'}`,
                      }} />
                    )}
                  </button>
                );
              })}

              <div style={{ flex: 1 }} />

              {/* Next */}
              <button
                onClick={() => { if (activeTabIndex < TABS.length - 1) setActiveTab(TABS[activeTabIndex + 1]); }}
                disabled={activeTabIndex === TABS.length - 1}
                style={{
                  padding: '0 12px', fontSize: 11, fontWeight: 600,
                  border: activeTabIndex < TABS.length - 1 ? '1px solid rgba(61,112,255,0.22)' : 'none',
                  borderRadius: 7, margin: '6px 4px',
                  background: activeTabIndex < TABS.length - 1 ? 'rgba(18,64,204,0.14)' : 'transparent',
                  cursor: activeTabIndex === TABS.length - 1 ? 'default' : 'pointer',
                  color: activeTabIndex === TABS.length - 1 ? 'rgba(178,198,245,0.15)' : '#BDD4FF',
                  display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
                  transition: 'all 150ms',
                }}
                onMouseEnter={e => { if (activeTabIndex < TABS.length - 1) { e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.background = 'rgba(18,64,204,0.28)'; } }}
                onMouseLeave={e => { if (activeTabIndex < TABS.length - 1) { e.currentTarget.style.color = '#BDD4FF'; e.currentTarget.style.background = 'rgba(18,64,204,0.14)'; } }}
                title="Paso siguiente"
              >
                Siguiente
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
