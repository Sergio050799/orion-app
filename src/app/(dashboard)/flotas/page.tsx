"use client";

import React, { lazy, Suspense, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import {
  listarCarpetas, crearCarpeta, guardarCarpeta, cargarCarpeta, eliminarCarpeta,
  cambiarEstado, listarCorredores, sesionJoin, sesionLeave, sesionHeartbeat,
  cargarCarpetasDelServidor,
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
import FichaContratada from './components/FichaContratada';
import HojaAutomatico from './components/HojaAutomatico';
import SilverdatChip from '@/components/saas/SilverdatChip';
import type { FlotaGridHandle, FlotaHeader, CoberturaRow } from './components/types';

// ─── Tipos ───────────────────────────────────────────────────────────────────

type TabName = 'DATOS GENERALES' | 'AUTOMÁTICO' | 'ORIGINAL' | 'TRABAJO' | 'SINCO' | 'INFORME' | 'OFERTA' | 'PRE-EMISIÓN';
const TABS: TabName[] = ['DATOS GENERALES', 'AUTOMÁTICO', 'ORIGINAL', 'TRABAJO', 'SINCO', 'INFORME', 'OFERTA', 'PRE-EMISIÓN'];

const EMPTY_HEADER: FlotaHeader = { cif: '', tomador: '', actividad: '', formaPago: '', efecto: '' };

function normalizarCarpeta(c: FlotaCarpeta): FlotaCarpeta {
  return {
    ...c,
    estado:    c.estado    ?? 'EN ESTUDIO',
    historico: c.historico ?? [],
    header: {
      ...c.header,
      cif:       c.header?.cif       ?? '',
      tomador:   c.header?.tomador   ?? '',
      actividad: c.header?.actividad ?? '',
      formaPago: c.header?.formaPago ?? '',
      efecto:    c.header?.efecto    ?? '',
    },
  };
}

// ─── Descarga zip ────────────────────────────────────────────────────────────

async function descargarTodo(carpeta: FlotaCarpeta, corredorNombre?: string) {
  const XLSX = await import('xlsx');
  const zip = new JSZip();

  // Un solo workbook con todas las hojas → un solo XLSX.write al final
  const wb = XLSX.utils.book_new();
  const addSheet = (name: string, data: Record<string, string>[]) => {
    if (data.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
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

  // Lanzar la API de oferta plantilla en paralelo mientras construimos el XLSX local
  const ofertaVehiculos = carpeta.oferta.filter(r => r['matricula']?.trim()).map(r => ({
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
  const ofertaApiPromise = ofertaVehiculos.length > 0
    ? fetch('/api/flotas/oferta/excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flota_nombre: carpeta.nombre,
          empresa_nombre: carpeta.header.tomador,
          empresa_cif: carpeta.header.cif,
          vehiculos: ofertaVehiculos,
        }),
      }).then(res => res.ok ? res.arrayBuffer() : null).catch(() => null)
    : Promise.resolve(null);

  // Generar el XLSX local una sola vez (5 hojas en 1 write)
  const estudioxlsx = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  zip.file('ESTUDIO.xlsx', estudioxlsx);

  // Esperar la oferta plantilla (ya lleva tiempo ejecutándose en paralelo)
  const ofertaBlob = await ofertaApiPromise;
  if (ofertaBlob) zip.file('OFERTA_PLANTILLA.xlsx', ofertaBlob);

  // Nombre: FLOTA - CORREDOR
  const fecha = new Date().toLocaleDateString('es-ES').replace(/\//g, '-');
  const nombreFlota = carpeta.nombre.replace(/[/\\:*?"<>|]/g, '');
  const nombreCorr = corredorNombre ? ` - ${corredorNombre.replace(/[/\\:*?"<>|]/g, '')}` : '';
  const zipName = `${nombreFlota}${nombreCorr}_${fecha}.zip`;

  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, zipName);
}

// Deriva trabajoRows desde los vehículos procesados guardados (automaticoVehicles)
// cuando la carpeta tiene datos procesados pero el campo trabajo está vacío.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function vehiclesToTrabajoRows(vehicles: any[]): Record<string, string>[] {
  return vehicles.map(v => ({
    matricula:            v.matricula             || '',
    marca:                v.marca                 || '',
    modelo:               v.modelo                || '',
    tipo_vehiculo:        v.tipo_vehiculo         || 'Turismo',
    kw:                   v.kw > 0 ? String(v.kw) : '',
    cv:                   v.cv > 0 ? String(v.cv) : '',
    cif_nif:              v.cif_nif               || '',
    tomador:              v.tomador               || '',
    cia_actual:           v.cia_actual            || '',
    num_poliza_actual:    (v.num_poliza_actual || '').replace(/[\s\-./]/g, ''),
    fecha_vencimiento:    v.fecha_vencimiento     || '',
    uso:                  v.uso                   || '',
    adr:                  v.adr                   || '',
    ambito:               v.ambito                || '',
    coberturas_solicitadas: v.coberturas_solicitadas || '',
    lunas:                v.lunas                 || '',
    frq:                  v.frq                   || '',
    asistencia:           v.asistencia            || '',
    prima_referencia:     parseFloat(v.prima_referencia || '0') > 0 ? v.prima_referencia : '',
    vin:                  v.vin                   || '',
    fecha_matriculacion:  v.fecha_matriculacion   || '',
    anyo_fabricacion:     v.anyo_fabricacion      || '',
    combustible:          v.combustible           || '',
    etiqueta_dgt:         v.etiqueta_dgt          || '',
    euro:                 v.euro                  || '',
    co2:                  v.co2                   || '',
  }));
}

// ─── FlotasPage ─────────────────────────────────────────────────────────────

export default function FlotasPage() {
  const [activeTab, setActiveTab] = useState<TabName>('DATOS GENERALES');
  const [carpetaActiva, setCarpetaActiva] = useState<FlotaCarpeta | null>(null);
  const [showCarpetaScreen, setShowCarpetaScreen] = useState(true);
  const [flotaHeader, setFlotaHeader] = useState<FlotaHeader>(EMPTY_HEADER);
  const [originalData, setOriginalData] = useState<Record<string, string>[]>([]);
  const [trabajoRows, setTrabajoRows] = useState<Record<string, string>[]>([]);
  const [ofertaRows, setOfertaRows] = useState<Record<string, string>[]>([]);
  const [sincoResultRows, setSincoResultRows] = useState<Record<string, string>[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);
  const [estadoPopover, setEstadoPopover] = useState<{ estado: EstadoFlota; motivo: string } | null>(null);
  const [openFlotas, setOpenFlotas] = useState<FlotaCarpeta[]>([]);
  const [fichaMode, setFichaMode] = useState(false);

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

  // ─── Sync grids cuando el study view monta ──────────────────────────────────
  // handleSelectCarpeta es llamado cuando showCarpetaScreen=true (HojaTrabajos no existe).
  // Los setData en ref son no-op en ese momento. Este effect los ejecuta DESPUÉS del mount.
  useEffect(() => {
    if (showCarpetaScreen || !carpetaActiva) return;
    if (trabajoRows.length > 0)  trabajoRef.current?.setData(trabajoRows);
    if (originalData.length > 0) originalRef.current?.setData(originalData);
    if (ofertaRows.length > 0)   ofertaRef.current?.setData(ofertaRows);
  // Solo re-sincronizar cuando cambia qué carpeta está activa o cuándo se muestra el estudio.
  // NO incluir trabajoRows/originalData/ofertaRows: el usuario edita esas y no queremos reset.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCarpetaScreen, carpetaActiva?.id]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleSelectCarpeta = useCallback((raw: FlotaCarpeta) => {
    const carpeta = normalizarCarpeta(raw);
    // Si trabajo está vacío pero hay vehículos procesados guardados, reconstruir filas
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const savedVehicles = (carpeta as any).automaticoVehicles;
    const trabajo = carpeta.trabajo.length > 0
      ? carpeta.trabajo
      : (Array.isArray(savedVehicles) && savedVehicles.length > 0 ? vehiclesToTrabajoRows(savedVehicles) : []);
    // Pre-populate refs BEFORE state updates so the rebuild useEffect in HojaOferta
    // sees savedEditsRef already filled when it fires — prevents spurious auto-calc
    if (carpeta.oferta.length > 0) ofertaRef.current?.setData(carpeta.oferta);
    if (carpeta.original.length > 0) originalRef.current?.setData(carpeta.original);
    if (trabajo.length > 0) trabajoRef.current?.setData(trabajo);
    setOpenFlotas(prev => {
      const rest = prev.filter(f => f.id !== carpeta.id);
      return [carpeta, ...rest].slice(0, 3);
    });
    setCarpetaActiva(carpeta);
    setFlotaHeader(carpeta.header);
    setOriginalData(carpeta.original);
    setOfertaRows(carpeta.oferta);
    setSincoResultRows(carpeta.sincoResultados ?? []);
    setActiveTab('DATOS GENERALES');
    setShowCarpetaScreen(false);
    setFichaMode(carpeta.estado === 'CONTRATADA');
    setTrabajoRows(trabajo);
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const savedVehicles = (fresh as any).automaticoVehicles;
    const trabajo = fresh.trabajo.length > 0
      ? fresh.trabajo
      : (Array.isArray(savedVehicles) && savedVehicles.length > 0 ? vehiclesToTrabajoRows(savedVehicles) : []);
    if (fresh.oferta.length > 0) ofertaRef.current?.setData(fresh.oferta);
    if (fresh.original.length > 0) originalRef.current?.setData(fresh.original);
    if (trabajo.length > 0) trabajoRef.current?.setData(trabajo);
    setCarpetaActiva(fresh);
    setFlotaHeader(fresh.header);
    setOriginalData(fresh.original);
    setOfertaRows(fresh.oferta);
    setSincoResultRows(fresh.sincoResultados ?? []);
    setActiveTab('DATOS GENERALES');
    setShowCarpetaScreen(false);
    setFichaMode(fresh.estado === 'CONTRATADA');
    setTrabajoRows(trabajo);
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
    const current = carpetaActivaRef.current;
    if (!current) return;
    const updated: FlotaCarpeta = {
      ...current,
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
  }, [flotaHeader, originalData, trabajoRows, sincoResultRows, ofertaRows]);

  const handleRefresh = useCallback(async () => {
    if (!carpetaActiva || isRefreshing) return;
    setIsRefreshing(true);
    try {
      const serverCarpetas = await cargarCarpetasDelServidor();
      const fresh = normalizarCarpeta(serverCarpetas.find(c => c.id === carpetaActiva.id) ?? carpetaActiva);
      if (fresh.oferta.length > 0) ofertaRef.current?.setData(fresh.oferta);
      if (fresh.original.length > 0) originalRef.current?.setData(fresh.original);
      if (fresh.trabajo.length > 0) trabajoRef.current?.setData(fresh.trabajo);
      setCarpetaActiva(fresh);
      setFlotaHeader(fresh.header);
      setOriginalData(fresh.original);
      setOfertaRows(fresh.oferta);
      setSincoResultRows(fresh.sincoResultados ?? []);
      setTrabajoRows(fresh.trabajo);
    } catch { /* si falla, mantiene estado actual */ }
    finally { setIsRefreshing(false); }
  }, [carpetaActiva, isRefreshing]);

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

  // ─── handleCloseTab ──────────────────────────────────────────────────────────

  const handleCloseTab = useCallback((f: FlotaCarpeta) => {
    const isActive = f.id === carpetaActiva?.id;
    if (isActive && carpetaActiva) {
      guardarCarpeta({
        ...carpetaActiva,
        header: flotaHeader,
        original: originalRef.current?.getData() ?? originalData,
        trabajo: trabajoRef.current?.getData() ?? trabajoRows,
        sincoResultados: sincoResultRows,
        oferta: ofertaRef.current?.getData() ?? ofertaRows,
      });
    }
    const remaining = openFlotas.filter(x => x.id !== f.id);
    setOpenFlotas(remaining);
    if (isActive) {
      if (remaining.length > 0) {
        const next = normalizarCarpeta(cargarCarpeta(remaining[0].id) ?? remaining[0]);
        if (next.oferta.length > 0) ofertaRef.current?.setData(next.oferta);
        if (next.original.length > 0) originalRef.current?.setData(next.original);
        if (next.trabajo.length > 0) trabajoRef.current?.setData(next.trabajo);
        setCarpetaActiva(next);
        setFlotaHeader(next.header);
        setOriginalData(next.original);
        setOfertaRows(next.oferta);
        setSincoResultRows(next.sincoResultados ?? []);
        setTrabajoRows(next.trabajo);
        setFichaMode(next.estado === 'CONTRATADA');
        setActiveTab('DATOS GENERALES');
      } else {
        setCarpetaActiva(null);
        setShowCarpetaScreen(true);
      }
    }
  }, [carpetaActiva, flotaHeader, originalData, trabajoRows, sincoResultRows, ofertaRows, openFlotas]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
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
        .t-stage:hover { background: rgba(255,255,255,0.04); }
        .t-stage-x:hover { color: #ef4444 !important; }
      `}</style>

      <div className="flex flex-col" style={{ height: 'calc(100vh - 126px)' }}>

        {/* ── CarpetaScreen ── */}
        {showCarpetaScreen && <CarpetaScreen onSelect={handleSelectCarpeta} />}

        {/* ── Study view ── */}
        {!showCarpetaScreen && carpetaActiva && (
          <>
            {/* ── Heading block ── */}
            <div style={{ flexShrink: 0, borderBottom: '1px solid var(--t-line)', padding: '14px 28px 13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 18, paddingBottom: 13, marginBottom: 12, borderBottom: '1px solid var(--t-line)' }}>
                <div>
                  <p style={{ margin: '0 0 5px', fontSize: 10, fontWeight: 750, letterSpacing: '0.13em', textTransform: 'uppercase', color: 'var(--t-muted)' }}>
                    {fichaMode ? 'FICHA CONTRATADA' : `ESTUDIO · ${String(activeTabIndex + 1).padStart(2, '0')} / 08`}
                  </p>
                  <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 720, letterSpacing: '-0.04em', color: 'var(--t-text)', lineHeight: 1.1 }}>
                    Estudio de Flotas
                  </h1>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--t-muted)' }}>
                    {fichaMode ? 'Datos del expediente contratado' : `${activeTab} · ${completedCount}/${TABS.length} pasos completados`}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <SilverdatChip />

                  {/* Actualizar estudio */}
                  <button onClick={handleRefresh} disabled={isRefreshing} style={{
                    border: '1px solid var(--t-line)', color: 'var(--t-text)', background: 'transparent',
                    padding: '8px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: isRefreshing ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: 5, opacity: isRefreshing ? 0.5 : 1, whiteSpace: 'nowrap',
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                      style={{ animation: isRefreshing ? 'spin 0.8s linear infinite' : 'none' }}>
                      <polyline points="23 4 23 10 17 10"/>
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                    </svg>
                    {isRefreshing ? 'Actualizando...' : 'Actualizar estudio'}
                  </button>

                  {/* Guardar */}
                  <button onClick={handleSave} style={{
                    border: `1px solid ${saveFlash ? 'rgba(34,197,94,0.4)' : 'var(--t-line)'}`,
                    color: saveFlash ? '#4ade80' : 'var(--t-text)',
                    background: saveFlash ? 'rgba(34,197,94,0.1)' : 'transparent',
                    padding: '8px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
                    transition: 'all 200ms',
                  }}>
                    {saveFlash ? (
                      <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>Guardado</>
                    ) : (
                      <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>Guardar</>
                    )}
                  </button>

                  {/* Descargar todo */}
                  <button onClick={handleDownload} disabled={isDownloading} style={{
                    background: 'var(--t-blue)', border: '1px solid var(--t-blue)',
                    color: '#fff', padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                    cursor: isDownloading ? 'not-allowed' : 'pointer', opacity: isDownloading ? 0.5 : 1,
                    display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                    </svg>
                    {isDownloading ? 'Generando...' : 'Descargar todo'}
                  </button>
                </div>
              </div>

              {/* Casebar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 15 }}>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t-muted)', marginRight: 2 }}>EXPEDIENTE</span>
                  <strong style={{ fontSize: 15, color: 'var(--t-text)', fontWeight: 700 }}>{carpetaActiva.nombre}</strong>
                  <span style={{ fontSize: 12, color: 'var(--t-muted)' }}>{numVeh} vehículos</span>
                  <EstadoBadge estado={carpetaActiva.estado} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, position: 'relative' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t-muted)' }}>ESTADO</span>
                  <select
                    value=""
                    onChange={e => {
                      const val = e.target.value as EstadoFlota;
                      if (val && val !== carpetaActiva.estado) setEstadoPopover({ estado: val, motivo: '' });
                    }}
                    style={{
                      border: '1px solid var(--t-line)', background: 'var(--t-surface)', color: 'var(--t-text)',
                      padding: '7px 10px', borderRadius: 5, fontSize: 12, cursor: 'pointer', outline: 'none',
                    }}
                  >
                    <option value="">Cambiar estado</option>
                    {(['EN ESTUDIO', 'OFERTADA', 'CONTRATADA', 'RECHAZADA'] as EstadoFlota[])
                      .filter(e => e !== carpetaActiva.estado)
                      .map(e => <option key={e} value={e}>{e}</option>)}
                  </select>

                  {/* Estado popover */}
                  {estadoPopover && (
                    <div style={{
                      position: 'absolute', top: '100%', right: 0, marginTop: 8, zIndex: 100,
                      padding: 14, borderRadius: 8, minWidth: 220,
                      background: 'var(--t-surface)', border: '1px solid var(--t-line)',
                      boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
                    }}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                        Cambiar a <EstadoBadge estado={estadoPopover.estado} small />
                      </p>
                      <input autoFocus placeholder="Motivo (opcional)"
                        value={estadoPopover.motivo}
                        onChange={e => setEstadoPopover(p => p ? { ...p, motivo: e.target.value } : null)}
                        onKeyDown={e => { if (e.key === 'Enter') handleConfirmarEstado(); if (e.key === 'Escape') setEstadoPopover(null); }}
                        style={{
                          width: '100%', fontSize: 12, marginBottom: 10,
                          border: '1px solid var(--t-line)', background: 'var(--t-surface)', color: 'var(--t-text)',
                          padding: '7px 10px', borderRadius: 5, outline: 'none', boxSizing: 'border-box',
                        }} />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={handleConfirmarEstado} style={{
                          flex: 1, fontSize: 11, fontWeight: 600, padding: '6px 0', borderRadius: 6,
                          background: 'var(--t-blue)', color: '#fff', border: 'none', cursor: 'pointer',
                        }}>Confirmar</button>
                        <button onClick={() => setEstadoPopover(null)} style={{
                          fontSize: 11, padding: '6px 12px', borderRadius: 6,
                          background: 'transparent', color: 'var(--t-muted)', border: '1px solid var(--t-line)', cursor: 'pointer',
                        }}>Cancelar</button>
                      </div>
                    </div>
                  )}

                  {/* Cambiar expediente */}
                  <button onClick={() => setShowCarpetaScreen(true)} style={{
                    border: '1px solid var(--t-line)', color: 'var(--t-muted)', background: 'transparent',
                    padding: '7px 12px', borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                  }}>
                    Expedientes
                  </button>
                </div>
              </div>
            </div>

            {/* ── Tabstrip: open flotas ── */}
            {openFlotas.length > 0 && (
              <div style={{
                flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 28px 6px', borderBottom: '1px solid var(--t-line)',
                overflowX: 'auto', scrollbarWidth: 'none',
              }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t-muted)', marginRight: 6, flexShrink: 0, whiteSpace: 'nowrap' }}>
                  ABIERTAS
                </span>
                {openFlotas.map(f => {
                  const isActiveTab = carpetaActiva?.id === f.id;
                  return (
                    <div key={f.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
                      border: `1px solid ${isActiveTab ? 'var(--t-text)' : 'var(--t-line)'}`,
                      borderRadius: 5, padding: '5px 6px 5px 10px',
                      background: isActiveTab ? 'rgba(255,255,255,0.04)' : 'transparent',
                      fontSize: 11, fontWeight: 650,
                      color: isActiveTab ? 'var(--t-text)' : 'var(--t-muted)',
                    }}>
                      <button
                        onClick={() => handleSwitchFlota(f)}
                        style={{ all: 'unset', cursor: 'pointer', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}
                      >
                        {flotaLabel(f)}
                      </button>
                      <button
                        onClick={() => handleCloseTab(f)}
                        className="t-stage-x"
                        title={`Cerrar ${flotaLabel(f)}`}
                        style={{ border: 'none', background: 'transparent', color: 'var(--t-muted)', fontSize: 16, lineHeight: 1, padding: '0 2px', cursor: 'pointer' }}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Stages: navegación de 8 hojas ── */}
            {!fichaMode && (
              <div style={{
                flexShrink: 0, display: 'flex', gap: 0,
                borderBottom: '1px solid var(--t-line)',
                overflowX: 'auto', scrollbarWidth: 'thin',
              }}>
                {TABS.map((tab, idx) => {
                  const isActive = activeTab === tab;
                  const done = tabComplete[tab];
                  return (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className="t-stage"
                      style={{
                        whiteSpace: 'nowrap', flex: '1', textAlign: 'center', minWidth: 120,
                        border: 'none', borderBottom: `2px solid ${isActive ? 'var(--t-blue)' : 'transparent'}`,
                        padding: '14px 9px 12px', background: 'none', cursor: 'pointer',
                        color: isActive ? 'var(--t-text)' : 'var(--t-muted)',
                        fontSize: 10, fontWeight: 750, letterSpacing: '0.025em',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                        transition: 'color 150ms, border-color 150ms',
                      }}
                    >
                      <b style={{ fontSize: 10, opacity: 0.65, marginRight: 3 }}>{String(idx + 1).padStart(2, '0')}</b>
                      {tab.toUpperCase()}
                      {done && <span style={{ color: '#10b981', fontSize: 20, lineHeight: 0, verticalAlign: 'middle', marginLeft: 3 }}>·</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── Content ── */}
            <div className="flex-1 min-h-0">
              {fichaMode ? (
                <FichaContratada
                  carpeta={carpetaActiva}
                  corredor={carpetaActiva.corredor_id ? listarCorredores().find(c => c.id === carpetaActiva.corredor_id) : undefined}
                  onAbrirEstudio={() => setFichaMode(false)}
                />
              ) : (
                <div style={{ position: 'relative', height: '100%' }}>
                  {TABS.map(tab => (
                    <div key={tab} style={{ position: 'absolute', inset: 0, display: activeTab === tab ? 'flex' : 'none', flexDirection: 'column' }}>
                      {tab === 'DATOS GENERALES' && carpetaActiva && (
                        <HojaDatosGenerales carpetaActiva={carpetaActiva} header={flotaHeader} onHeaderChange={setFlotaHeader} onCarpetaChange={handleCarpetaChange} />
                      )}
                      {tab === 'AUTOMÁTICO' && (
                        <HojaAutomatico
                          header={flotaHeader}
                          carpetaActiva={carpetaActiva}
                          onHeaderUpdate={(h) => { setFlotaHeader(prev => ({ ...prev, ...h })); }}
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
                          <HojaInforme header={flotaHeader} trabajoRows={trabajoRows} coberturas={coberturas} sincoResultRows={sincoResultRows} sincoManual={carpetaActiva?.sincoManual ?? []} sincoGlobal={carpetaActiva?.sincoGlobal ?? null} primasMmtValues={carpetaActiva?.primasMmtInforme} onPrimasMmtChange={(primas) => { const cur = carpetaActivaRef.current; if (cur) { const updated = { ...cur, primasMmtInforme: primas }; setCarpetaActiva(updated); guardarCarpeta(updated); } }} tarifaFlota={carpetaActiva?.tarifaFlota} corredorLabel={corredorLabel} danosPropios={carpetaActiva?.danosPropios} />
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
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
