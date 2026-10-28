"use client";

import React, { lazy, Suspense, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import {
  listarCarpetas, crearCarpeta, guardarCarpeta, cargarCarpeta, eliminarCarpeta,
  cambiarEstado, listarCorredores, sesionJoin, sesionLeave, sesionHeartbeat,
  cargarCarpetasDelServidor, consolidarSinco,
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
import HojaEmision from './components/HojaEmision';
import type { HojaOfertaHandle } from './components/HojaOferta';
const HojaOferta = lazy(() => import('./components/HojaOferta'));
import HojaPreEmision from './components/HojaPreEmision';
import HojaDatosGenerales from './components/HojaDatosGenerales';
import FichaContratada from './components/FichaContratada';
import HojaAutomatico from './components/HojaAutomatico';
import SilverdatChip from '@/components/saas/SilverdatChip';
import type { FlotaGridHandle, FlotaHeader, CoberturaRow } from './components/types';
import { ESTUDIO_CSS } from './estudio-css';

// ─── Tipos ───────────────────────────────────────────────────────────────────

type TabName = 'DATOS GENERALES' | 'AUTOMÁTICO' | 'ORIGINAL' | 'TRABAJO' | 'SINCO' | 'INFORME' | 'OFERTA' | 'PRE-EMISIÓN' | 'EMISIÓN';
const TABS: TabName[] = ['DATOS GENERALES', 'AUTOMÁTICO', 'ORIGINAL', 'TRABAJO', 'SINCO', 'INFORME', 'OFERTA', 'PRE-EMISIÓN', 'EMISIÓN'];

const MOTIVOS_RECHAZO = ['Precio', 'Siniestralidad', 'Actividad', 'ADR', 'Antigüedad de los vehículos', 'Tipología de vehículos', 'Falta de documentación', 'Prefiere seguir con su aseguradora', 'Sin respuesta del corredor', 'Otro'];

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

  // 7. Informe técnico (siempre al final: el importador solo lee la primera hoja)
  {
    const gr = Object.values(grupos);
    const aoa: (string | number | { t: 'n'; f: string; v: number; z?: string })[][] = [
      [`INFORME TÉCNICO · ${carpeta.nombre}`],
      [],
      ['1 · Composición de la flota'],
      ['Tipología', 'Cobertura', 'Vehículos'],
      ...gr.map(g => [g.tipo, g.cob, g.count]),
    ];
    const firstC = 5, lastC = 4 + gr.length;
    const totalVeh = gr.reduce((a, g) => a + g.count, 0);
    if (gr.length > 0) aoa.push(['Total', '', { t: 'n', f: `SUM(C${firstC}:C${lastC})`, v: totalVeh }]);
    if ((carpeta.sincoResultados?.length ?? 0) > 0) {
      const rs = consolidarSinco(carpeta.sincoResultados);
      const r0 = aoa.length + 1; // fila (1-based) donde empieza el bloque SINCO
      aoa.push([], ['2 · Siniestralidad SINCO']);
      aoa.push(['Indicador', '', 'Valor']);
      aoa.push(['Vehículos con SINCO', '', rs.vehiculosConSinco]);
      aoa.push(['Siniestros (Σ)', '', rs.totalSiniestros]);
      aoa.push(['Antigüedad media (años) (*)', '', Math.round(rs.antiguedadMedia * 100) / 100]);
      const rVeh = r0 + 3, rSin = r0 + 4, rAnt = r0 + 5;
      const sinAnio = rs.antiguedadMedia > 0 ? Math.round((rs.totalSiniestros / rs.antiguedadMedia) * 100) / 100 : 0;
      aoa.push(['Siniestros por año (*)', '', { t: 'n', f: `IF(C${rAnt}>0,C${rSin}/C${rAnt},0)`, v: sinAnio, z: '0.00' }]);
      const rSA = r0 + 6;
      const frec = rs.vehiculosConSinco > 0 ? sinAnio / rs.vehiculosConSinco : 0;
      aoa.push(['Frecuencia (*)', '', { t: 'n', f: `IF(C${rVeh}>0,C${rSA}/C${rVeh},0)`, v: rs.frecuencia ?? frec, z: '0.00%' }]);
      aoa.push([], ['Anexo · cómo se calcula']);
      aoa.push(['(*) Antigüedad media = media de Num_Anios_Asegurado de los vehículos con consulta SINCO válida']);
      aoa.push(['(*) Siniestros por año = Σ siniestros ÷ antigüedad media']);
      aoa.push(['(*) Frecuencia = siniestros por año ÷ vehículos con SINCO']);
    }
    aoa.push([], ['Documento confidencial']);
    if (gr.length > 0 || (carpeta.sincoResultados?.length ?? 0) > 0) {
      const wsT = XLSX.utils.aoa_to_sheet(aoa);
      wsT['!cols'] = [{ wch: 34 }, { wch: 34 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, wsT, 'INFORME_TECNICO');
    }
  }

  // Lanzar la API de oferta plantilla en paralelo mientras construimos el XLSX local
  const ofertaVehiculos = carpeta.oferta.filter(r => r['matricula']?.trim()).map(r => ({
    tomador: carpeta.header.tomador,
    tipologia: r['tipo_vehiculo'] ?? '',
    matricula: r['matricula'] ?? '',
    marca: r['marca'] ?? '',
    modelo: r['modelo'] ?? '',
    coberturas: r['coberturas'] ?? r['coberturas_solicitadas'] ?? '',
    franquicia: (r['coberturas'] ?? '') === 'Todo Riesgo con Franquicia' ? (parseFloat(String(r['frq'] ?? '').replace(',', '.')) || 0) : 0,
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

// ─── CSS ─────────────────────────────────────────────────────────────────────


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
  const [estadoPopover, setEstadoPopover] = useState<{ estado: EstadoFlota; motivo: string; fechaVencimiento: string; comentario: string } | null>(null);
  const [openFlotas, setOpenFlotas] = useState<FlotaCarpeta[]>([]);
  const [fichaMode, setFichaMode] = useState(false);

  const motivoCarpeta = useMemo(() => {
    if (!carpetaActiva) return undefined;
    const hist = carpetaActiva.historico ?? [];
    return [...hist].reverse().find(h => h.estadoNuevo === carpetaActiva.estado && h.motivo)?.motivo;
  }, [carpetaActiva]);

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
    // Diferimos al siguiente tick: HojaTrabajos/HojaOriginal montan con display:flex
    // pero su FlotaGrid interior puede necesitar un frame más para inicializar gridRef.
    const id = setTimeout(() => {
      if (trabajoRows.length > 0)  trabajoRef.current?.setData(trabajoRows);
      if (originalData.length > 0) originalRef.current?.setData(originalData);
      if (ofertaRows.length > 0)   ofertaRef.current?.setData(ofertaRows);
    }, 0);
    return () => clearTimeout(id);
  // Solo cuando cambia la carpeta activa o el study view se hace visible.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCarpetaScreen, carpetaActiva?.id]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleSelectCarpeta = useCallback((raw: FlotaCarpeta) => {
    // Always read from memCache — it's updated synchronously by guardarCarpeta,
    // so it's always newer than what CarpetaScreen's state might have (race condition).
    const fromCache = cargarCarpeta(raw.id);
    const carpeta = normalizarCarpeta(fromCache ?? raw);
    // Si trabajo está vacío pero hay vehículos procesados guardados, reconstruir filas
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const savedVehicles = (carpeta as any).automaticoVehicles;
    const trabajo = carpeta.trabajo.length > 0
      ? carpeta.trabajo
      : (Array.isArray(savedVehicles) && savedVehicles.length > 0 ? vehiclesToTrabajoRows(savedVehicles) : []);
    // Pre-populate refs BEFORE state updates so the rebuild useEffect in HojaOferta
    // sees savedEditsRef already filled when it fires — prevents spurious auto-calc
    const originalToUse = carpeta.original.length > 0 ? carpeta.original : trabajo;
    if (carpeta.oferta.length > 0) ofertaRef.current?.setData(carpeta.oferta);
    if (originalToUse.length > 0) originalRef.current?.setData(originalToUse);
    if (trabajo.length > 0) trabajoRef.current?.setData(trabajo);
    setOpenFlotas(prev => {
      const rest = prev.filter(f => f.id !== carpeta.id);
      return [carpeta, ...rest].slice(0, 3);
    });
    setCarpetaActiva(carpeta);
    setFlotaHeader(carpeta.header);
    setOriginalData(originalToUse);
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
    const originalToUse = fresh.original.length > 0 ? fresh.original : trabajo;
    if (fresh.oferta.length > 0) ofertaRef.current?.setData(fresh.oferta);
    if (originalToUse.length > 0) originalRef.current?.setData(originalToUse);
    if (trabajo.length > 0) trabajoRef.current?.setData(trabajo);
    setCarpetaActiva(fresh);
    setFlotaHeader(fresh.header);
    setOriginalData(originalToUse);
    setOfertaRows(fresh.oferta);
    setSincoResultRows(fresh.sincoResultados ?? []);
    setActiveTab('DATOS GENERALES');
    setShowCarpetaScreen(false);
    setFichaMode(fresh.estado === 'CONTRATADA');
    setTrabajoRows(trabajo);
  }, [carpetaActiva, flotaHeader, originalData, trabajoRows, sincoResultRows, ofertaRows]);

  const handleConfirmarEstado = useCallback(() => {
    if (!carpetaActiva || !estadoPopover) return;
    if (estadoPopover.estado === 'CONTRATADA' && !estadoPopover.fechaVencimiento.trim()) return;
    const motivo = estadoPopover.estado === 'RECHAZADA' ? (estadoPopover.motivo || undefined) : undefined;
    const obs    = estadoPopover.estado === 'RECHAZADA' && estadoPopover.comentario.trim() ? estadoPopover.comentario.trim() : undefined;
    const updated = cambiarEstado(carpetaActiva.id, estadoPopover.estado, motivo, obs);
    if (updated) {
      let final = normalizarCarpeta(updated);
      if (estadoPopover.estado === 'CONTRATADA' && estadoPopover.fechaVencimiento.trim()) {
        final = { ...final, header: { ...final.header, fechaVencimiento: estadoPopover.fechaVencimiento.trim() } };
        guardarCarpeta(final);
      }
      setCarpetaActiva(final);
      if (estadoPopover.estado === 'CONTRATADA') setFichaMode(true);
    }
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
    'EMISIÓN': !!(carpetaActiva?.emision?.idCliente?.trim() && carpetaActiva?.emision?.idFlota?.trim()),
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

  // ─── Corredor activo ────────────────────────────────────────────────────────
  const corrActivo = useMemo(() => {
    if (!carpetaActiva?.corredor_id) return null;
    return listarCorredores().find(c => c.id === carpetaActiva.corredor_id) ?? null;
  }, [carpetaActiva?.corredor_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const ofertadaDias = useMemo(() => {
    if (!carpetaActiva || carpetaActiva.estado !== 'OFERTADA') return 0;
    const last = [...(carpetaActiva.historico ?? [])].reverse().find(h => h.estadoNuevo === 'OFERTADA');
    if (!last?.fecha) return 0;
    return Math.floor((Date.now() - new Date(last.fecha).getTime()) / 86400000);
  }, [carpetaActiva]);

  // Escape key cierra el drawer de cambio de estado
  useEffect(() => {
    if (!estadoPopover) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setEstadoPopover(null); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [!!estadoPopover]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ESTUDIO_CSS }} />
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
        .rdg-light .rdg-cell { border-right: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; }
        .rdg-light .rdg-header-row .rdg-cell { font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: 0.03em; color: #374151; text-align: center; justify-content: center; }
      `}</style>

      <div className={`es pg${showCarpetaScreen ? '' : ' ws'}`}>

        {/* ── CarpetaScreen ── */}
        {showCarpetaScreen && <CarpetaScreen onSelect={handleSelectCarpeta} />}

        {/* ── Study view ── */}
        {!showCarpetaScreen && carpetaActiva && (
          <>
            {/* ── Estado drawer (portal) ── */}
            {estadoPopover && typeof document !== 'undefined' && createPortal(
              <>
                <div className="dr-scrim open" onClick={() => setEstadoPopover(null)} />
                <aside className="dr-drawer open" role="dialog" aria-modal="true" tabIndex={-1}>
                  <button className="x" onClick={() => setEstadoPopover(null)} aria-label="Cerrar">&times;</button>
                  <div className="over">CAMBIAR ESTADO</div>
                  <h3>{carpetaActiva?.nombre || 'Estudio'}</h3>
                  <p className="desc">Estado actual: <EstadoBadge estado={carpetaActiva?.estado ?? ''} small />. El cambio se refleja en el Dashboard y en Flotas.</p>
                  <form className="form" onSubmit={e => { e.preventDefault(); handleConfirmarEstado(); }} noValidate>
                    <div className="fld">
                      <label htmlFor="es_estado">Nuevo estado</label>
                      <select id="es_estado" className="select"
                        value={estadoPopover.estado}
                        onChange={e => setEstadoPopover(p => p ? { ...p, estado: e.target.value as EstadoFlota, motivo: MOTIVOS_RECHAZO[0], fechaVencimiento: '', comentario: '' } : null)}>
                        {(['EN ESTUDIO', 'ESTUDIADA', 'OFERTADA', 'CONTRATADA', 'RECHAZADA'] as EstadoFlota[])
                          .filter(s => s !== carpetaActiva?.estado)
                          .map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>

                    {estadoPopover.estado === 'ESTUDIADA' && (
                      <p className="hint">El estudio está terminado y la oferta aún no se ha enviado.</p>
                    )}

                    {estadoPopover.estado === 'CONTRATADA' && (
                      <div className="fld">
                        <label htmlFor="es_vcto">Fecha de vencimiento (DD/MM/AAAA) <span className="req">*</span></label>
                        <input id="es_vcto" className="inp" placeholder="31/12/2027"
                          value={estadoPopover.fechaVencimiento}
                          onChange={e => setEstadoPopover(p => p ? { ...p, fechaVencimiento: e.target.value } : null)} />
                      </div>
                    )}

                    {estadoPopover.estado === 'RECHAZADA' && (
                      <>
                        <div className="fld">
                          <label htmlFor="es_mot">Motivo del rechazo</label>
                          <select id="es_mot" className="select"
                            value={estadoPopover.motivo}
                            onChange={e => setEstadoPopover(p => p ? { ...p, motivo: e.target.value } : null)}>
                            {MOTIVOS_RECHAZO.map(m => <option key={m}>{m}</option>)}
                          </select>
                        </div>
                        <div className="fld">
                          <label htmlFor="es_com">Comentario (opcional)</label>
                          <input id="es_com" className="inp" placeholder="Añade un detalle si hace falta"
                            value={estadoPopover.comentario}
                            onChange={e => setEstadoPopover(p => p ? { ...p, comentario: e.target.value } : null)} />
                        </div>
                      </>
                    )}

                    <div className="fact">
                      <button type="submit"
                        disabled={estadoPopover.estado === 'CONTRATADA' && !estadoPopover.fechaVencimiento.trim()}
                        className="btn"
                        style={{ opacity: (estadoPopover.estado === 'CONTRATADA' && !estadoPopover.fechaVencimiento.trim()) ? 0.5 : 1 }}>
                        Confirmar
                      </button>
                      <button type="button" onClick={() => setEstadoPopover(null)} className="btn ghost">Cancelar</button>
                    </div>
                  </form>
                </aside>
              </>,
              document.body
            )}

            {/* ── wsbar: back + open chips + silverdat ── */}
            <div className="wsbar">
              <button onClick={() => setShowCarpetaScreen(true)} className="mini">Todas las flotas</button>
              <div className="opens">
                {openFlotas.length > 0 && <span className="lb">ABIERTAS</span>}
                {openFlotas.map(f => {
                  const isActiveTab = carpetaActiva?.id === f.id;
                  return (
                    <div key={f.id} className="chip" aria-current={isActiveTab ? 'true' : undefined}>
                      <button onClick={() => handleSwitchFlota(f)}>{flotaLabel(f)}</button>
                      <button className="x" onClick={() => handleCloseTab(f)} title={`Cerrar ${flotaLabel(f)}`}>×</button>
                    </div>
                  );
                })}
              </div>
              <SilverdatChip />
            </div>

            {/* ── case: carpeta heading ── */}
            <div className="case">
              <div>
                {fichaMode && <p className="over">Ficha contratada</p>}
                <h1>{carpetaActiva.nombre || '(sin nombre)'}</h1>
                <div className="meta">
                  {corrActivo?.nombre && <span>{corrActivo.nombre}</span>}
                  {corrActivo?.sucursal && <span>{corrActivo.sucursal}</span>}
                  <span>{numVeh} {numVeh === 1 ? 'vehículo' : 'vehículos'}</span>
                  <EstadoBadge estado={carpetaActiva.estado} />
                </div>
                {carpetaActiva.estado === 'ESTUDIADA' && (
                  <div className="banner" style={{ '--c': 'var(--st-estudiada)' } as React.CSSProperties}>
                    <b>Estudiada</b>
                    <span>El estudio está terminado. Falta enviar la oferta al corredor.</span>
                  </div>
                )}
                {carpetaActiva.estado === 'OFERTADA' && (
                  <div className="banner" style={{ '--c': 'var(--st-ofertada)' } as React.CSSProperties}>
                    <b>Ofertada</b>
                    <span>Enviada hace {ofertadaDias} {ofertadaDias === 1 ? 'día' : 'días'}. A la espera de respuesta del corredor.</span>
                  </div>
                )}
                {carpetaActiva.estado === 'RECHAZADA' && (
                  <div className="banner" style={{ '--c': 'var(--st-rechazada)' } as React.CSSProperties}>
                    <b>Rechazada</b>
                    <span>{motivoCarpeta || 'Sin motivo indicado'}</span>
                  </div>
                )}
              </div>
              <div className="acts">
                <button onClick={handleSave} className={`mini${saveFlash ? ' flash' : ''}`}>{saveFlash ? 'Guardado' : 'Guardar'}</button>
                <button onClick={handleRefresh} disabled={isRefreshing} className="mini">{isRefreshing ? 'Actualizando…' : 'Actualizar'}</button>
                <button className="mini" onClick={() => {
                  const first = (['EN ESTUDIO', 'ESTUDIADA', 'OFERTADA', 'CONTRATADA', 'RECHAZADA'] as EstadoFlota[]).find(s => s !== carpetaActiva.estado)!;
                  setEstadoPopover({ estado: first, motivo: MOTIVOS_RECHAZO[0], fechaVencimiento: '', comentario: '' });
                }}>Cambiar estado</button>
                <button onClick={handleDownload} disabled={isDownloading} className="mini pri">{isDownloading ? 'Generando…' : 'Descargar todo'}</button>
              </div>
            </div>

            {/* ── steps nav ── */}
            {!fichaMode && (
              <nav className="steps">
                {TABS.map((tab, idx) => {
                  const isActive = activeTab === tab;
                  const done = tabComplete[tab];
                  return (
                    <button key={tab} onClick={() => setActiveTab(tab)} className="stp8" aria-current={isActive ? 'step' : undefined}>
                      <b>{String(idx + 1).padStart(2, '0')}</b>
                      {tab}
                      {tab === 'AUTOMÁTICO' && <span className="op">OPCIONAL</span>}
                      {done && <span className="ok" />}
                    </button>
                  );
                })}
              </nav>
            )}

            {/* ── content ── */}
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
                    <div key={tab} className="pane" style={{ display: activeTab === tab ? 'flex' : 'none' }}>
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
                        <HojaOriginal ref={originalRef} onDataChange={handleOriginalChange} carpetaOriginalEmpty={carpetaActiva ? carpetaActiva.original.length === 0 : false} initialData={originalData} />
                      )}
                      {tab === 'TRABAJO' && (
                        <HojaTrabajos ref={trabajoRef} getOriginalSnapshot={getOriginalSnapshot} onDataChange={handleTrabajoChange} initialData={trabajoRows} />
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
                          <HojaInforme header={flotaHeader} carpetaNombre={carpetaActiva?.nombre} trabajoRows={trabajoRows} coberturas={coberturas} sincoResultRows={sincoResultRows} sincoManual={carpetaActiva?.sincoManual ?? []} sincoGlobal={carpetaActiva?.sincoGlobal ?? null} primasMmtValues={carpetaActiva?.primasMmtInforme} onPrimasMmtChange={(primas) => { const cur = carpetaActivaRef.current; if (cur) { const updated = { ...cur, primasMmtInforme: primas }; setCarpetaActiva(updated); guardarCarpeta(updated); } }} configCoberturas={carpetaActiva?.configCoberturas} onConfigCoberturasChange={(cfg) => { const cur = carpetaActivaRef.current; if (cur) { const updated = { ...cur, configCoberturas: cfg }; setCarpetaActiva(updated); guardarCarpeta(updated); } }} tarifaFlota={carpetaActiva?.tarifaFlota} corredorLabel={corredorLabel} danosPropios={carpetaActiva?.danosPropios} observacion={motivoCarpeta} />
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
                            configCoberturas={carpetaActiva?.configCoberturas}
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
                        <HojaPreEmision trabajoRows={trabajoRows} initialSeleccion={carpetaActiva?.catalogoSeleccion} onCatalogoChange={(selecciones) => { if (carpetaActiva) setCarpetaActiva({ ...carpetaActiva, catalogoSeleccion: selecciones }); }} />
                      )}
                      {tab === 'EMISIÓN' && carpetaActiva && (() => {
                        const corredor = carpetaActiva.corredor_id ? listarCorredores().find(c => c.id === carpetaActiva.corredor_id) : undefined;
                        return (
                          <HojaEmision
                            trabajoRows={trabajoRows}
                            catalogoSeleccion={carpetaActiva.catalogoSeleccion}
                            configCoberturas={carpetaActiva.configCoberturas}
                            ofertaRows={ofertaRows}
                            emision={carpetaActiva.emision}
                            onEmisionChange={(emision) => { const cur = carpetaActivaRef.current; if (cur) { const updated = { ...cur, emision }; setCarpetaActiva(updated); guardarCarpeta(updated); } }}
                            idPerceptor={corredor?.idPerceptor}
                            corredorNombre={corredor?.nombre}
                            carpetaNombre={carpetaActiva.nombre}
                            efectoGenerales={flotaHeader.efecto}
                            periodicidadGenerales={flotaHeader.periodicidad}
                          />
                        );
                      })()}
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
