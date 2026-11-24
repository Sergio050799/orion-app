"use client";

import React, { lazy, Suspense, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import {
  listarCarpetas, crearCarpeta, guardarCarpeta, cargarCarpeta, cargarCarpetaDelServidor, eliminarCarpeta,
  cambiarEstado, listarCorredores, sesionJoin, sesionLeave, sesionHeartbeat,
  cargarCarpetasDelServidor, consolidarSinco, filtrarFilasReales,
  type FlotaCarpeta, type EstadoFlota,
} from '@/core/flotas';
import { hayGuardadosPendientes } from '@/core/flotas/carpeta';
import { useToast } from '@/components/ui/Toast';
import { useTarifa } from '@/core/flotas/primasContext';

// Fecha dd/mm/aaaa (o aaaa-mm-dd) que exista en el calendario.
function fechaValida(raw: string): boolean {
  const t = raw.trim();
  let d: number, m: number, y: number;
  let mt = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mt) { d = +mt[1]; m = +mt[2]; y = +mt[3]; }
  else if ((mt = t.match(/^(\d{4})-(\d{2})-(\d{2})$/))) { y = +mt[1]; m = +mt[2]; d = +mt[3]; }
  else return false;
  if (y < 2000 || y > 2100) return false;
  const f = new Date(y, m - 1, d);
  return f.getFullYear() === y && f.getMonth() === m - 1 && f.getDate() === d;
}

const mismasFilas = (a: Record<string, string>[], b: Record<string, string>[]) =>
  a === b || (a.length === b.length && JSON.stringify(a) === JSON.stringify(b));

// TRABAJO se genera desde ORIGINAL. Si ya había datos de trabajo (Silverdat, etc.) para una matrícula,
// se conservan los campos que el nuevo Original no trae; lo que sí trae el Original manda.
const matLimpiaFila = (r: Record<string, string>) => (r['matricula'] ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
function trabajoDesdeOriginal(original: Record<string, string>[], previo: Record<string, string>[]): Record<string, string>[] {
  const reales = filtrarFilasReales(original);
  if (reales.length === 0) return [];
  const prev = new Map<string, Record<string, string>>();
  previo.forEach(r => { const k = matLimpiaFila(r); if (k) prev.set(k, r); });
  return reales.map(n => {
    const old = prev.get(matLimpiaFila(n));
    if (!old) return n;
    const m = { ...old };
    for (const [k, v] of Object.entries(n)) if (v !== '' || !(k in m)) m[k] = v;
    return m;
  });
}

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
import type { InfoVerificacion } from '@/core/catalogo/verificacion';
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
    anyo_fab_fuente:      v.anyo_fabricacion ? (v.anyo_fab_fuente || 'fabricacion') : '',
    combustible:          v.combustible           || '',
    etiqueta_dgt:         v.etiqueta_dgt          || '',
    euro:                 v.euro                  || '',
    co2:                  v.co2                   || '',
    // Fix 19/11: estos campos ya vienen del catálogo en automaticoVehicles pero antes no se
    // propagaban a trabajoRows. Emision necesita plazas (NUM_PLAZAS) y tara (TARA/TN).
    plazas:               typeof v.plazas === 'number' && v.plazas >= 0 ? String(v.plazas) : (typeof v.plazas === 'string' ? v.plazas : ''),
    tn:                   v.tara > 0 ? String(v.tara) : (v.tn || ''),
    cilindrada:           v.cilindrada            || '',
    version:              v.version               || '',
    variante:             v.variante              || '',
    ...(v.sd_plantilla ? { sd_plantilla: v.sd_plantilla } : {}),
    ...(v.sd_mantener ? { sd_mantener: v.sd_mantener } : {}),
    puertas:              v.puertas > 0 ? String(v.puertas) : (v.puertas || ''),
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
  const [guardadoFallido, setGuardadoFallido] = useState(false);
  const { toast } = useToast();
  const { recargar: recargarTarifa } = useTarifa();
  const [actualizandoPrimas, setActualizandoPrimas] = useState(false);

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
      // sin el recargo de isotermo de esa fila: la prima del INFORME es la base del grupo
      primaMmt: (parseFloat(r['oferta_prima_mmt'] ?? '') - (parseFloat(r['_isoDelta'] ?? '') || 0)) || null,
    })), [ofertaRows]);

  // ─── Autoguardado ─────────────────────────────────────────────────────────

  const carpetaActivaRef = useRef(carpetaActiva);
  carpetaActivaRef.current = carpetaActiva;

  // Verificación de la identificación en el catálogo (la calcula PRE-EMISIÓN; EMISIÓN la lee)
  const [verifInfo, setVerifInfo] = useState<Record<string, InfoVerificacion>>({});
  const verifCarpetaRef = useRef<string | null>(null);
  if (verifCarpetaRef.current !== (carpetaActiva?.id ?? null)) {
    verifCarpetaRef.current = carpetaActiva?.id ?? null;
    // Fix 18/11: al cambiar de carpeta, re-hidratar verifInfo desde lo que guardó
    // PRE-EMISIÓN en carpetaActiva.verificacionOk. Antes se vaciaba y, si el usuario
    // iba directo a EMISIÓN sin pasar por PRE-EMISIÓN, bloqueaba todos los vehículos
    // con "Identificación sin verificar". Los datos ya están guardados por fila.
    const okMap = carpetaActiva?.verificacionOk ?? {};
    const registroMap = carpetaActiva?.verificacionRegistro ?? {};
    const rehidratado: Record<string, InfoVerificacion> = {};
    for (const [matricula, idVeh] of Object.entries(okMap)) {
      if (!idVeh) continue;
      const reg = registroMap[matricula];
      rehidratado[matricula] = {
        bloquea: [],
        avisos: [],
        confirmada: true,
        anio: null,
        anioFab: null,
        anioMat: null,
        confirmadaPor: reg?.por,
        confirmadaFecha: reg?.fecha,
      };
    }
    // Solo actualizar si realmente cambia (evita render loop).
    if (JSON.stringify(verifInfo) !== JSON.stringify(rehidratado)) {
      setVerifInfo(rehidratado);
    }
  }
  const guardaCatalogoRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Lo que se cargó al abrir la flota. Mientras nada cambie respecto a esto NO se autoguarda:
  // antes, sólo con abrir una flota se reenviaba entera a los 2 s (falseaba «último movimiento»
  // y, si el detalle había llegado incompleto, lo escribía encima de lo bueno).
  const baseRef = useRef<{ header: FlotaHeader; original: unknown; trabajo: unknown; sinco: unknown; oferta: unknown } | null>(null);
  const fijarBase = (header: FlotaHeader, original: unknown, trabajo: unknown, sinco: unknown, oferta: unknown) => {
    baseRef.current = { header, original, trabajo, sinco, oferta };
  };

  // Único punto para cambiar campos sueltos de la carpeta activa. Actualiza el ref EN EL ACTO:
  // si dos hojas avisan en el mismo instante (p. ej. primas y coberturas del Informe), la segunda
  // parte de lo que dejó la primera. Antes cada una partía de la copia vieja y una pisaba a la otra.
  const patchCarpeta = useCallback((patch: Partial<FlotaCarpeta>, guardar = true): FlotaCarpeta | null => {
    const cur = carpetaActivaRef.current;
    if (!cur) return null;
    const updated = { ...cur, ...patch };
    carpetaActivaRef.current = updated;
    setCarpetaActiva(updated);
    if (guardar) guardarCarpeta(updated);
    return updated;
  }, []);

  useEffect(() => {
    if (!carpetaActiva) return;
    const b = baseRef.current;
    if (b && b.header === flotaHeader && b.original === originalData && b.trabajo === trabajoRows
      && b.sinco === sincoResultRows && b.oferta === ofertaRows) return;
    const id = carpetaActiva.id;
    const timer = setTimeout(() => {
      const cur = carpetaActivaRef.current;
      // Guarda de identidad: nunca escribir datos de una flota sobre otra.
      if (!cur || cur.id !== id) return;
      const updated: FlotaCarpeta = {
        ...cur,
        header: flotaHeader,
        original: originalData,
        trabajo: trabajoRows,
        sincoResultados: sincoResultRows,
        oferta: ofertaRows,
      };
      guardarCarpeta(updated);
      carpetaActivaRef.current = updated;
      setCarpetaActiva(updated);
      fijarBase(flotaHeader, originalData, trabajoRows, sincoResultRows, ofertaRows);
    }, 2000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalData, trabajoRows, ofertaRows, sincoResultRows, flotaHeader]);

  // ─── Aviso si un guardado no llega al servidor + guarda al cerrar la pestaña ──
  useEffect(() => {
    const onGuardado = (e: Event) => {
      const ok = !!(e as CustomEvent<{ ok: boolean }>).detail?.ok;
      setGuardadoFallido(!ok);
      if (ok) toast('Conexión recuperada: cambios guardados.', 'success');
      else toast('No se pudo guardar en el servidor. Reintentando…', 'error');
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      // Guardado de catálogo en espera (PRE-EMISIÓN): se lanza ya, no a los 800 ms.
      if (guardaCatalogoRef.current) {
        clearTimeout(guardaCatalogoRef.current);
        guardaCatalogoRef.current = null;
        const c = carpetaActivaRef.current;
        if (c) guardarCarpeta(c);
      }
      if (hayGuardadosPendientes()) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('orion:guardado', onGuardado);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('orion:guardado', onGuardado);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [toast]);

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

  const handleSelectCarpeta = useCallback(async (raw: FlotaCarpeta) => {
    // Cada vez que se abre una flota se relee la tarifa del Admin: un estudio nuevo usa siempre los precios vigentes.
    void recargarTarifa();
    // Always read from memCache — it's updated synchronously by guardarCarpeta,
    // so it's always newer than what CarpetaScreen's state might have (race condition).
    const fromCache = cargarCarpeta(raw.id);
    let carpeta = normalizarCarpeta(fromCache ?? raw);
    // Con CarpetaScreen cargando summary=true, TODAS las carpetas llegan aquí sin
    // original/trabajo/sincoResultados/oferta crudos. Siempre pedimos detalle on open
    // (salvo que ya venga con trabajo/original poblados por memCache).
    const necesita_detalle = !carpeta.trabajo?.length && !carpeta.original?.length;
    if (necesita_detalle) {
      const fresh = await cargarCarpetaDelServidor(carpeta.id);
      if (fresh) carpeta = normalizarCarpeta(fresh);
      else if ((raw.vehiculosCount ?? 0) > 0 || Object.values(raw.avance ?? {}).some(Boolean)) {
        // La flota tiene contenido pero el detalle no ha llegado: no abrirla vacía (se vería sin
        // vehículos y cualquier edición se guardaría sobre datos incompletos).
        toast('No se pudo cargar el detalle de la flota. Revisa la conexión y vuelve a intentarlo.', 'error');
        return;
      }
    }
    // Defensa extra: si el detalle aún viene sin arrays (carpeta vacía recién creada),
    // garantizamos arrays vacíos para que los .length no revienten.
    carpeta.trabajo = carpeta.trabajo ?? [];
    carpeta.original = carpeta.original ?? [];
    carpeta.oferta = carpeta.oferta ?? [];
    carpeta.sincoResultados = carpeta.sincoResultados ?? [];
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
    setSincoResultRows(carpeta.sincoResultados);
    setActiveTab('DATOS GENERALES');
    setShowCarpetaScreen(false);
    setFichaMode(carpeta.estado === 'CONTRATADA');
    setTrabajoRows(trabajo);
    fijarBase(carpeta.header, originalToUse, trabajo, carpeta.sincoResultados, carpeta.oferta);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  const trabajoRowsRef = useRef(trabajoRows);
  trabajoRowsRef.current = trabajoRows;
  // Al subir Original, Trabajo se genera solo (antes había que pulsar «Copiar de Original» y la pestaña se quedaba vacía)
  const handleOriginalChange = useCallback((data: Record<string, string>[]) => {
    setOriginalData(data);
    const nuevo = trabajoDesdeOriginal(data, trabajoRowsRef.current);
    if (nuevo.length > 0) {
      trabajoRowsRef.current = nuevo;
      setTrabajoRows(nuevo);
      setTimeout(() => trabajoRef.current?.setData(nuevo), 0);
    }
  }, []);

  // Flota con Original pero sin Trabajo (subida antigua, carpeta importada…): Trabajo se rellena al abrir el estudio
  useEffect(() => {
    if (showCarpetaScreen || !carpetaActiva) return;
    if (trabajoRows.some(r => (r['matricula'] ?? '').trim())) return;
    const nuevo = trabajoDesdeOriginal(originalData, []);
    if (nuevo.length === 0) return;
    setTrabajoRows(nuevo);
    setTimeout(() => trabajoRef.current?.setData(nuevo), 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCarpetaScreen, carpetaActiva?.id, originalData, trabajoRows]);
  // La plantilla subida trae datos de cabecera: se completan los de DATOS GENERALES que estén vacíos (no se pisa nada escrito)
  const handleHeaderDetectado = useCallback((h: { cif?: string; tomador?: string; actividad?: string; periodicidad?: string; efecto?: string }) => {
    setFlotaHeader(prev => {
      const next = { ...prev };
      if (h.cif && !prev.cif?.trim()) next.cif = h.cif;
      if (h.tomador && !prev.tomador?.trim()) next.tomador = h.tomador;
      if (h.actividad && !prev.actividad?.trim()) next.actividad = h.actividad;
      if (h.efecto && !prev.efecto?.trim()) next.efecto = h.efecto;
      if (h.periodicidad && !prev.periodicidad && ['mensual', 'bimestral', 'trimestral', 'semestral', 'anual'].includes(h.periodicidad)) {
        next.periodicidad = h.periodicidad as NonNullable<FlotaHeader['periodicidad']>;
      }
      return next;
    });
  }, []);
  // Si la hoja reenvía exactamente lo mismo (pasa al montar), se conserva la referencia: no hay nada que guardar.
  const handleTrabajoChange = useCallback((data: Record<string, string>[]) => { setTrabajoRows(prev => mismasFilas(prev, data) ? prev : data); }, []);
  const handleOfertaChange = useCallback((data: Record<string, string>[]) => { setOfertaRows(prev => mismasFilas(prev, data) ? prev : data); }, []);
  const getOriginalSnapshot = useCallback(() => originalRef.current?.getData() ?? null, []);
  const handleCarpetaChange = useCallback((updated: FlotaCarpeta) => { const n = normalizarCarpeta(updated); carpetaActivaRef.current = n; setCarpetaActiva(n); }, []);

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
    const sinco = fresh.sincoResultados ?? [];
    setSincoResultRows(sinco);
    setActiveTab('DATOS GENERALES');
    setShowCarpetaScreen(false);
    setFichaMode(fresh.estado === 'CONTRATADA');
    setTrabajoRows(trabajo);
    fijarBase(fresh.header, originalToUse, trabajo, sinco, fresh.oferta);
    setEstadoPopover(null);
  }, [carpetaActiva, flotaHeader, originalData, trabajoRows, sincoResultRows, ofertaRows]);

  const handleConfirmarEstado = useCallback(() => {
    if (!carpetaActiva || !estadoPopover) return;
    if (estadoPopover.estado === 'CONTRATADA' && !fechaValida(estadoPopover.fechaVencimiento)) return;
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

  // ─── Actualizar primas con la tarifa del Admin ──────────────────────────────
  // Relee la tarifa, recalcula todos los vehículos de la OFERTA (salvo los escritos a mano) y deja en el
  // INFORME la prima de cada grupo. Sirve igual para un estudio antiguo que para uno recién hecho.
  const handleActualizarPrimas = useCallback(async () => {
    if (actualizandoPrimas || !carpetaActivaRef.current) return;
    if (!window.confirm('Se va a leer la tarifa actual del Admin y a recalcular las primas de este estudio.\n\nLas primas escritas a mano en la Oferta se conservan. ¿Continuar?')) return;
    setActualizandoPrimas(true);
    try {
      const cfg = await recargarTarifa();
      if (!cfg) { toast('No se ha podido leer la tarifa del Admin. Las primas no se han tocado.', 'error'); return; }
      const res = ofertaRef.current?.actualizarConTarifa(cfg);
      if (!res) { toast('La oferta todavía no está cargada. Vuelve a intentarlo en un momento.', 'error'); return; }
      const cur = carpetaActivaRef.current;
      if (cur) patchCarpeta({ primasMmtInforme: { ...(cur.primasMmtInforme ?? {}), ...res.primasGrupo } });
      const partes = [`${res.recalculadas} ${res.recalculadas === 1 ? 'vehículo recalculado' : 'vehículos recalculados'}`];
      if (res.manuales > 0) partes.push(`${res.manuales} con prima a mano sin tocar`);
      if (res.sinTarifa > 0) partes.push(`${res.sinTarifa} sin precio en la tarifa`);
      toast(`Primas actualizadas con la tarifa del Admin: ${partes.join(' · ')}.`, res.sinTarifa > 0 ? 'info' : 'success');
    } finally {
      setActualizandoPrimas(false);
    }
  }, [actualizandoPrimas, recargarTarifa, patchCarpeta, toast]);

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
    carpetaActivaRef.current = updated;
    setCarpetaActiva(updated);
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 1500);
  }, [flotaHeader, originalData, trabajoRows, sincoResultRows, ofertaRows]);

  const handleRefresh = useCallback(async () => {
    if (!carpetaActiva || isRefreshing) return;
    setIsRefreshing(true);
    try {
      // Fase 1 opt: endpoint individual /carpetas/{id} evita bajar las 364 flotas enteras.
      const indiv = await cargarCarpetaDelServidor(carpetaActiva.id);
      const fresh = normalizarCarpeta(indiv ?? carpetaActiva);
      if (fresh.oferta.length > 0) ofertaRef.current?.setData(fresh.oferta);
      if (fresh.original.length > 0) originalRef.current?.setData(fresh.original);
      if (fresh.trabajo.length > 0) trabajoRef.current?.setData(fresh.trabajo);
      setCarpetaActiva(fresh);
      setFlotaHeader(fresh.header);
      setOriginalData(fresh.original);
      setOfertaRows(fresh.oferta);
      const sinco = fresh.sincoResultados ?? [];
      setSincoResultRows(sinco);
      setTrabajoRows(fresh.trabajo);
      if (indiv) fijarBase(fresh.header, fresh.original, fresh.trabajo, sinco, fresh.oferta);
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
        const sinco = next.sincoResultados ?? [];
        setSincoResultRows(sinco);
        setTrabajoRows(next.trabajo);
        fijarBase(next.header, next.original, next.trabajo, sinco, next.oferta);
        setEstadoPopover(null);
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
    const t = new Date(last.fecha).getTime();
    return isNaN(t) ? 0 : Math.max(0, Math.floor((Date.now() - t) / 86400000));
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
                        {estadoPopover.fechaVencimiento.trim() !== '' && !fechaValida(estadoPopover.fechaVencimiento) && (
                          <p className="hint" role="alert">Fecha no válida. Escríbela como DD/MM/AAAA, por ejemplo 31/12/2027.</p>
                        )}
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
                        disabled={estadoPopover.estado === 'CONTRATADA' && !fechaValida(estadoPopover.fechaVencimiento)}
                        className="btn">
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
                {guardadoFallido && (
                  <div className="banner" role="alert" style={{ '--c': 'var(--warn)' } as React.CSSProperties}>
                    <b>Sin guardar</b>
                    <span>Los últimos cambios no han llegado al servidor. ORION lo reintenta solo; no cierres la pestaña.</span>
                  </div>
                )}
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
                        <HojaDatosGenerales
                          carpetaActiva={carpetaActiva}
                          header={flotaHeader}
                          onHeaderChange={setFlotaHeader}
                          onCarpetaChange={handleCarpetaChange}
                          onConfirmar={() => setActiveTab('AUTOMÁTICO')}
                        />
                      )}
                      {tab === 'AUTOMÁTICO' && (
                        <HojaAutomatico
                          header={flotaHeader}
                          carpetaActiva={carpetaActiva}
                          onHeaderUpdate={(h) => { setFlotaHeader(prev => ({ ...prev, ...h })); }}
                          onVehiclesProcessed={(vehicles) => {
                            patchCarpeta({ automaticoVehicles: vehicles });
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
                        <HojaOriginal ref={originalRef} onDataChange={handleOriginalChange} carpetaOriginalEmpty={carpetaActiva ? carpetaActiva.original.length === 0 : false} initialData={originalData}
                          carpeta={carpetaActiva ? { nombre: carpetaActiva.nombre, header: flotaHeader } : undefined}
                          corredorNombre={corrActivo?.nombre}
                          onHeaderDetected={handleHeaderDetectado} />
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
                          <HojaInforme header={flotaHeader} carpetaNombre={carpetaActiva?.nombre} trabajoRows={trabajoRows} coberturas={coberturas} sincoResultRows={sincoResultRows} sincoManual={carpetaActiva?.sincoManual ?? []} sincoGlobal={carpetaActiva?.sincoGlobal ?? null} primasMmtValues={carpetaActiva?.primasMmtInforme} onPrimasMmtChange={(primas) => { patchCarpeta({ primasMmtInforme: primas }); }} configCoberturas={carpetaActiva?.configCoberturas} onConfigCoberturasChange={(cfg) => { patchCarpeta({ configCoberturas: cfg }); }} onTrabajoRowChange={(matricula, patch) => {
                            const m = (matricula || '').trim().toUpperCase();
                            if (!m) return;
                            const cur = carpetaActivaRef.current;
                            if (!cur) return;
                            const nuevo = trabajoRowsRef.current.map(r =>
                              (r['matricula'] ?? '').trim().toUpperCase() === m ? { ...r, ...patch } : r
                            );
                            setTrabajoRows(nuevo);
                            trabajoRef.current?.setData(nuevo);
                            trabajoRowsRef.current = nuevo;
                            patchCarpeta({ trabajo: nuevo });
                          }} tarifaFlota={carpetaActiva?.tarifaFlota} corredorLabel={corredorLabel} corredorNombre={corredor?.nombre} corredorComercial={corredor?.comercial} danosPropios={carpetaActiva?.danosPropios} observacion={motivoCarpeta} onActualizarPrimas={handleActualizarPrimas} actualizandoPrimas={actualizandoPrimas} />
                        );
                      })()}
                      {tab === 'OFERTA' && (
                        <Suspense fallback={<div className="flex-1 animate-pulse rounded-xl bg-white/5" />}>
                          <HojaOferta
                            ref={ofertaRef}
                            trabajoRows={trabajoRows}
                            header={flotaHeader}
                            carpetaId={carpetaActiva?.id}
                            carpetaNombre={carpetaActiva?.nombre}
                            primasMmt={carpetaActiva?.primasMmtInforme}
                            configCoberturas={carpetaActiva?.configCoberturas}
                            onDataChange={handleOfertaChange}
                            primaClienteTotal={carpetaActiva?.primaClienteTotal}
                            descuentoOferta={carpetaActiva?.descuentoOferta}
                            descuentosCoberturas={carpetaActiva?.descuentosCoberturas}
                            onActualizarPrimas={handleActualizarPrimas}
                            actualizandoPrimas={actualizandoPrimas}
                            onOfertaFieldsChange={(fields) => {
                              patchCarpeta(fields);
                            }}
                          />
                        </Suspense>
                      )}
                      {tab === 'PRE-EMISIÓN' && (
                        <HojaPreEmision
                          // una instancia por flota: al cambiar de flota abierta no se mezclan vehículos ni confirmaciones
                          key={carpetaActiva?.id ?? 'sin-flota'}
                          trabajoRows={trabajoRows}
                          initialSeleccion={carpetaActiva?.catalogoSeleccion}
                          initialVerificacionOk={carpetaActiva?.verificacionOk}
                          initialVerificacionRegistro={carpetaActiva?.verificacionRegistro}
                          // Fix 19/11: propagar plazas/kw/combustible/tara del catálogo seleccionado a trabajoRows.
                          // SOBREESCRIBE lo que haya en la plantilla original cuando hay catálogo asignado —
                          // el dato oficial MMT prevalece sobre lo que puso el cliente. También actualiza
                          // automaticoVehicles (fuente de trabajoRows cuando la plantilla está vacía).
                          onVehiclesUpdate={(exports) => {
                            const cur = carpetaActivaRef.current;
                            if (!cur) return;
                            const porMatricula = new Map(exports.map(e => [e.matricula.replace(/[\s-]/g, '').toUpperCase(), e]));
                            const setFromCat = (next: Record<string, string>, k: string, v: string | number) => {
                              // Fix 23/11: 0 es VÁLIDO para plazas (remolques/semirremolques tienen 0).
                              // -1 es sentinel "no tocar" (PreEmisión envía -1 cuando no hay catálogo asignado).
                              // Antes se descartaba el 0 por error y los remolques quedaban sin plazas o con 2 fallback.
                              if (typeof v === 'number' && v === -1) return false; // sentinel, no tocar
                              const vStr = String(v ?? '').trim();
                              if (vStr === '') return false;
                              if (vStr === '0' && k !== 'plazas') return false;
                              if (String(next[k] ?? '').trim() === vStr) return false;
                              next[k] = vStr;
                              return true;
                            };
                            let cambios = 0;
                            // Se parte de las filas vivas de TRABAJO (no de la copia guardada, que puede ir por detrás)
                            const trabajoNuevo = (trabajoRowsRef.current.length > 0 ? trabajoRowsRef.current : (cur.trabajo ?? [])).map(r => {
                              const mat = String(r['matricula'] ?? '').replace(/[\s-]/g, '').toUpperCase();
                              const ex = porMatricula.get(mat);
                              if (!ex) return r;
                              const manual = (ex.plazas_manual ?? '').trim();
                              // Sin ID y sin plazas a mano: no hay nada que propagar.
                              if (!ex.id_catalogo && manual === '' && (r['plazas_manual'] ?? '') === '') return r;
                              const next = { ...r };
                              let dirty = false;
                              // Plazas escritas a mano en PRE-EMISIÓN: se recuerdan y mandan sobre las del catálogo.
                              if ((next['plazas_manual'] ?? '') !== manual) { next['plazas_manual'] = manual; dirty = true; }
                              if (!ex.id_catalogo) {
                                if (manual !== '' && setFromCat(next, 'plazas', ex.plazas)) dirty = true;
                                if (dirty) cambios++;
                                return next;
                              }
                              if (setFromCat(next, 'plazas', ex.plazas)) dirty = true;
                              if (setFromCat(next, 'kw', ex.kw)) dirty = true;
                              if (setFromCat(next, 'cv', ex.cv)) dirty = true;
                              if (setFromCat(next, 'combustible', ex.combustible)) dirty = true;
                              if (setFromCat(next, 'tn', ex.tara)) dirty = true;
                              if (dirty) cambios++;
                              return next;
                            });
                            // También automaticoVehicles (si existe). trabajoRows lo deriva de ahí
                            // cuando la plantilla está vacía.
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const autoOriginales = (cur as any).automaticoVehicles as any[] | undefined;
                            let autoNuevo = autoOriginales;
                            if (autoOriginales && autoOriginales.length > 0) {
                              autoNuevo = autoOriginales.map(v => {
                                const mat = String(v.matricula ?? '').replace(/[\s-]/g, '').toUpperCase();
                                const ex = porMatricula.get(mat);
                                if (!ex) return v;
                                if (!ex.id_catalogo) {
                                  // sin ID: solo se aplican las plazas escritas a mano
                                  if ((ex.plazas_manual ?? '') !== '' && ex.plazas !== -1 && v.plazas !== ex.plazas) { cambios++; return { ...v, plazas: ex.plazas }; }
                                  return v;
                                }
                                const next = { ...v };
                                let dirty = false;
                                // Fix 23/11: 0 plazas (remolques) es válido; -1 es sentinel "no tocar"
                                if (ex.plazas !== -1 && v.plazas !== ex.plazas) { next.plazas = ex.plazas; dirty = true; }
                                if (ex.kw > 0 && v.kw !== ex.kw) { next.kw = ex.kw; dirty = true; }
                                if (ex.cv > 0 && v.cv !== ex.cv) { next.cv = ex.cv; dirty = true; }
                                if (ex.tara > 0 && v.tara !== ex.tara) { next.tara = ex.tara; dirty = true; }
                                if (ex.combustible && v.combustible !== ex.combustible) { next.combustible = ex.combustible; dirty = true; }
                                if (dirty) cambios++;
                                return next;
                              });
                            }
                            if (cambios === 0) return;
                            const updated = { ...cur, trabajo: trabajoNuevo, ...(autoNuevo ? { automaticoVehicles: autoNuevo } : {}) };
                            carpetaActivaRef.current = updated;
                            setCarpetaActiva(updated);
                            // Las filas vivas también: EMISIÓN, OFERTA y el autoguardado leen de ahí. Antes los datos del
                            // catálogo (plazas, kW, tara) solo iban a la copia guardada y EMISIÓN seguía sin plazas.
                            trabajoRowsRef.current = trabajoNuevo;
                            setTrabajoRows(trabajoNuevo);
                            trabajoRef.current?.setData(trabajoNuevo);
                            if (guardaCatalogoRef.current) clearTimeout(guardaCatalogoRef.current);
                            guardaCatalogoRef.current = setTimeout(() => { const c = carpetaActivaRef.current; if (c) guardarCarpeta(c); }, 800);
                          }}
                          onCatalogoChange={(selecciones) => {
                            const cur = carpetaActivaRef.current;
                            if (!cur) return;
                            const updated = { ...cur, catalogoSeleccion: selecciones };
                            carpetaActivaRef.current = updated;   // las dos notificaciones de PRE-EMISIÓN llegan juntas: la segunda parte de esta
                            setCarpetaActiva(updated);
                            // se guarda (con una pequeña espera, llegan muchas seguidas) para no perder las identificaciones
                            if (guardaCatalogoRef.current) clearTimeout(guardaCatalogoRef.current);
                            guardaCatalogoRef.current = setTimeout(() => { const c = carpetaActivaRef.current; if (c) guardarCarpeta(c); }, 800);
                          }}
                          onVerificacionChange={(info, ok, registro) => {
                            setVerifInfo(info);
                            const cur = carpetaActivaRef.current;
                            if (cur && (JSON.stringify(cur.verificacionOk ?? {}) !== JSON.stringify(ok) || JSON.stringify(cur.verificacionRegistro ?? {}) !== JSON.stringify(registro))) {
                              const updated = { ...cur, verificacionOk: ok, verificacionRegistro: registro };
                              carpetaActivaRef.current = updated;
                              setCarpetaActiva(updated);
                              guardarCarpeta(updated);
                            }
                          }}
                        />
                      )}
                      {tab === 'EMISIÓN' && carpetaActiva && (() => {
                        const corredor = carpetaActiva.corredor_id ? listarCorredores().find(c => c.id === carpetaActiva.corredor_id) : undefined;
                        return (
                          <HojaEmision
                            trabajoRows={trabajoRows}
                            catalogoSeleccion={carpetaActiva.catalogoSeleccion}
                            verificacion={verifInfo}
                            configCoberturas={carpetaActiva.configCoberturas}
                            ofertaRows={ofertaRows}
                            emision={carpetaActiva.emision}
                            onEmisionChange={(emision) => { patchCarpeta({ emision }); }}
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
