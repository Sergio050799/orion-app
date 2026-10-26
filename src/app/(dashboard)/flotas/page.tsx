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

// ─── CSS ─────────────────────────────────────────────────────────────────────

const ESTUDIO_CSS = `
.es{--soft:#121927;--hover:#172235;--line:#283247;--text:#f3f6fc;--sub:#b5bfd0;--quiet:#98a6bd;--blue:#4989ff;--blue-2:#9cc2ff;--warn:#e3a96a;--head:#d6deed;--st-contratada:#2f6df0;--st-estudio:#5f9bff;--st-estudiada:#a99af5;--st-ofertada:#a3c7ff;--st-rechazada:#66758f;--silver:#f08a3c;--sdoff:#e5756c;container-type:inline-size;container-name:es;display:flex;flex-direction:column;height:calc(100vh - 126px)}
[data-theme="light"] .es{--soft:#f7f9fd;--hover:#f0f4fa;--line:#d8e0eb;--text:#18243a;--sub:#4b5b72;--quiet:#586780;--blue:#265fc9;--blue-2:#2a56b3;--warn:#b36d1f;--head:#1b2a44;--st-contratada:#17399a;--st-estudio:#2f67cf;--st-estudiada:#6a55d8;--st-ofertada:#5f93dd;--st-rechazada:#8793a8;--silver:#b85a0e;--sdoff:#c9483f}
.es .cs-scroll{padding:28px 32px 60px;height:100%;overflow-y:auto;flex-shrink:0}
.es .intro{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-bottom:28px}
.es .intro h1{font:600 clamp(28px,3.2cqw,42px)/1.1 var(--font-display);letter-spacing:-.05em;margin:0 0 7px;color:var(--text)}
.es .intro p{margin:0;color:var(--sub);font-size:14px}
.es .actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.es .kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.es .kpi{all:unset;box-sizing:border-box;font:inherit;display:flex;flex-direction:column;justify-content:flex-start;padding:22px 18px 22px 0;min-width:0;cursor:pointer;text-align:left;transition:background .14s;border-radius:4px}
.es .kpi:hover{background:var(--hover)}
.es .kpi+.kpi{padding-left:clamp(14px,1.8cqw,24px);border-left:1px solid var(--line)}
.es .kpi .l{font-size:11px;font-weight:600;color:var(--sub);text-transform:uppercase;letter-spacing:.09em}
.es .kpi .v{font:600 clamp(32px,3.1cqw,48px)/1.05 var(--font-display);letter-spacing:-.055em;margin:8px 0 0;font-variant-numeric:tabular-nums;color:var(--text)}
.es .kpi .v.mny{font-size:clamp(22px,2.2cqw,34px);white-space:nowrap}
.es .kpi .n{font-size:12px;color:var(--quiet);margin-top:5px;line-height:1.4}
.es .grid2>section{padding:28px 0 30px;min-width:0}
.es .grid2>section:first-child{padding-right:clamp(20px,3cqw,44px)}
.es .grid2>section+section{padding-left:clamp(20px,3cqw,44px);border-left:1px solid var(--line)}
.es .shead{margin-bottom:16px}
.es .shead h2{font:600 clamp(17px,1.5cqw,21px)/1.25 var(--font-display);letter-spacing:-.03em;margin:0}
.es .shead .sub-note{font-size:13px;color:var(--sub);margin:5px 0 0}
.es .pipe-bar{all:unset;box-sizing:border-box;font:inherit;display:grid;grid-template-columns:minmax(120px,190px) 1fr 40px;gap:12px;align-items:center;padding:9px 4px;font-size:14px;cursor:pointer;width:100%;transition:background .14s;border-radius:4px}
.es .pipe-bar:hover{background:var(--hover)}
.es .pipe-bar .pn{color:var(--sub)}.es .pipe-bar .pn .no{color:var(--quiet);font-size:13px;font-variant-numeric:tabular-nums;margin-right:8px}
.es .pipe-bar .pt{height:10px;background:var(--soft);border-radius:2px;overflow:hidden}
.es .pipe-bar .pf{height:100%;background:var(--blue);border-radius:2px;transition:width .85s cubic-bezier(.2,.8,.2,1)}
.es .pipe-bar .pv{text-align:right;font-weight:600;font-variant-numeric:tabular-nums}
.es .seg8{display:inline-grid;grid-template-columns:repeat(8,8px);gap:2px;vertical-align:middle}
.es .seg8 i{display:block;height:8px;border-radius:1px;background:var(--line)}
.es .seg8 i.on{background:var(--blue)}
.es .prog{display:inline-flex;align-items:center;gap:10px}
.es .prog b{font-weight:600;font-variant-numeric:tabular-nums;font-size:12px;min-width:28px;color:var(--sub)}
.es .dirhead{display:flex;justify-content:space-between;align-items:flex-end;gap:16px 28px;flex-wrap:wrap;margin-bottom:18px}
.es .dirhead h2{font:600 clamp(17px,1.5cqw,21px)/1.25 var(--font-display);letter-spacing:-.03em;margin:0}
.es .filterbar{display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-top:24px;margin-bottom:20px}
.es .grid2{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);margin-top:24px;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.es .search{flex:1 1 360px;max-width:640px;background:var(--soft);border:1px solid var(--line);border-radius:5px;padding:12px 16px;font-size:15px;color:var(--text);font:inherit;outline:none;box-sizing:border-box}
.es .search::placeholder{color:var(--quiet)}
.es .search:focus{border-color:var(--blue)}
.es .select{appearance:none;-webkit-appearance:none;height:42px;background:var(--soft) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16' fill='none' stroke='%23909db4' stroke-width='1.6' stroke-linecap='round'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E") no-repeat right 12px center;border:1px solid var(--line);border-radius:9px;padding:0 38px 0 14px;font-size:13px;color:var(--text);cursor:pointer;min-width:190px;font:inherit}
.es .select:focus{outline:none;border-color:var(--blue)}
.es .dir{margin-top:24px;overflow-x:auto}
.es .tbl{width:100%;border-collapse:collapse;font-size:14px}
.es .tbl th{text-align:left;font-size:11px;font-weight:600;letter-spacing:.07em;color:var(--head);padding:0 12px 14px 0;text-transform:uppercase;border-bottom:1px solid var(--line);white-space:nowrap}
.es .tbl td{padding:14px 12px 14px 0;border-bottom:1px solid var(--line);vertical-align:middle}
.es .tbl tbody tr{cursor:pointer}
.es .tbl tbody tr:hover td{background:var(--hover)}
.es .th{all:unset;cursor:pointer;display:inline-block;padding-bottom:3px;border-bottom:2px solid transparent;font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--head);transition:color .16s}
.es .th:hover{color:var(--text)}
.es .th[aria-pressed=true]{color:var(--blue-2);border-bottom-color:var(--blue)}
.es .tag{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:700;color:var(--text)}
.es .tag::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--c,var(--blue))}
.es .btn{border:0;background:var(--blue);color:#fff;border-radius:9px;padding:0 18px;height:38px;font-size:13px;font-weight:600;cursor:pointer;font:inherit;white-space:nowrap;display:inline-flex;align-items:center;gap:6px;transition:filter .16s}
.es .btn:hover{filter:brightness(1.08)}
.es .btn.ghost{background:none;border:1px solid var(--line);color:var(--text)}
.es .btn.ghost:hover{border-color:var(--blue);filter:none}
.es .mini{border:1px solid var(--line);background:transparent;border-radius:6px;padding:8px 12px;font-size:12px;font-weight:600;cursor:pointer;font:inherit;color:var(--text);white-space:nowrap;display:inline-flex;align-items:center;gap:5px;transition:border-color .16s,background .16s}
.es .mini:hover{border-color:var(--blue);background:var(--hover)}
.es .mini.pri{background:var(--blue);border-color:var(--blue);color:#fff}
.es .mini.pri:hover{filter:brightness(1.08);background:var(--blue)}
.es .mini[disabled]{opacity:.5;cursor:default}
.es .mini.flash{border-color:rgba(34,197,94,0.4);color:#4ade80;background:rgba(34,197,94,0.1)}
.es .inp{width:100%;min-width:0;background:var(--soft);border:1px solid var(--line);border-radius:9px;padding:0 14px;height:38px;font-size:13px;color:var(--text);font:inherit;box-sizing:border-box}
.es .inp::placeholder{color:var(--quiet)}
.es .inp:focus{outline:none;border-color:var(--blue)}
.es .empty{padding:64px 0;color:var(--quiet);font-size:13px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:12px}
.es .new-form{margin-top:16px;padding:20px 24px;border:1px solid var(--line);border-radius:12px;background:var(--soft)}
.es .wsbar{display:flex;gap:10px;align-items:center;padding:8px 32px;border-bottom:1px solid var(--line);flex-shrink:0;min-width:0}
.es .opens{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;min-width:0;align-items:center;flex:1}
.es .opens .lb{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--quiet);white-space:nowrap;flex-shrink:0}
.es .chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:5px;padding:5px 6px 5px 11px;font-size:12px;font-weight:650;color:var(--sub);white-space:nowrap}
.es .chip[aria-current=true]{border-color:var(--text);color:var(--text)}
.es .chip button{all:unset;cursor:pointer;max-width:160px;overflow:hidden;text-overflow:ellipsis}
.es .chip button.x{padding:0 4px;font-size:16px;line-height:1;color:var(--quiet)}
.es .chip button.x:hover{color:var(--text)}
.es .steps{display:flex;border-top:1px solid var(--line);border-bottom:1px solid var(--line);flex-shrink:0;overflow-x:auto;scrollbar-width:thin}
.es .stp8{all:unset;box-sizing:border-box;flex:1 0 auto;min-width:128px;cursor:pointer;padding:15px 14px 13px;text-align:center;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--quiet);border-bottom:2px solid transparent;margin-bottom:-1px;transition:color .16s,border-color .16s;white-space:nowrap}
.es .stp8:hover{color:var(--text)}
.es .stp8[aria-current=step]{color:var(--text);border-bottom-color:var(--blue)}
.es .stp8 b{margin-right:6px;opacity:.7;font-variant-numeric:tabular-nums}
.es .stp8 .ok{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--blue);margin-left:7px;vertical-align:middle}
.es .stp8 .op{margin-left:6px;font-size:10px;letter-spacing:.06em;color:var(--quiet);font-weight:600}
.es .case{display:flex;justify-content:space-between;align-items:flex-end;gap:18px 24px;flex-wrap:wrap;padding:18px 32px 20px;border-bottom:1px solid var(--line);flex-shrink:0}
.es .case h1{font-size:clamp(22px,2.4cqw,34px);font-weight:720;letter-spacing:-.04em;color:var(--text);margin:0 0 8px;line-height:1.1}
.es .case .over{font-size:10px;font-weight:750;letter-spacing:.13em;text-transform:uppercase;color:var(--quiet);margin:0 0 5px}
.es .case .meta{display:flex;gap:6px 18px;flex-wrap:wrap;color:var(--sub);font-size:14px;align-items:center}
.es .case .acts{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.es .banner{margin:10px 0 0;padding:8px 14px;border:1px solid var(--line);border-left:3px solid var(--c,var(--blue));border-radius:5px;font-size:13px;color:var(--sub);display:flex;gap:10px;align-items:center}
.es .banner b{letter-spacing:.06em;text-transform:uppercase;font-size:10px;font-weight:700;flex-shrink:0;color:var(--text)}
.es .more{display:flex;justify-content:center;padding-top:20px}
.es .more button{all:unset;box-sizing:border-box;font:inherit;cursor:pointer;border:1px solid var(--line);background:var(--soft);border-radius:5px;padding:11px 24px;font-size:13px;font-weight:600;color:var(--text);transition:border-color .16s,background .16s}
.es .more button:hover{border-color:var(--blue);background:var(--hover)}
/* ── Panel lateral (drawer) ── */
.es-scrim{position:fixed;inset:0;background:rgba(2,5,16,.6);z-index:9990;opacity:0;pointer-events:none;transition:opacity .22s}
.es-scrim.open{opacity:1;pointer-events:auto}
.es-drawer{position:fixed;top:0;right:0;bottom:0;width:min(560px,100%);z-index:9991;background:var(--bg);border-left:1px solid var(--line);transform:translateX(102%);transition:transform .35s cubic-bezier(.2,.8,.2,1);overflow-y:auto;padding:28px 40px 48px;font-family:var(--font-body);color:var(--text)}
.es-drawer.open{transform:none;box-shadow:-25px 0 80px rgba(0,0,0,.35)}
.es-drawer:focus{outline:none}
.es-drawer .x{position:absolute;right:14px;top:14px;all:unset;cursor:pointer;font-size:26px;line-height:1;color:var(--quiet)}
.es-drawer .x:hover{color:var(--text)}
.es-drawer .over{margin-top:36px;font-size:11px;font-weight:600;letter-spacing:.15em;text-transform:uppercase;color:var(--blue-2)}
.es-drawer h3{font:600 clamp(26px,2.8cqw,34px)/1.12 var(--font-display);letter-spacing:-.04em;margin:10px 0 10px;color:var(--text)}
.es-drawer .desc{color:var(--sub);font-size:14px;line-height:1.7;margin:0}
.es-drawer h4{font-size:11px;font-weight:600;letter-spacing:.15em;text-transform:uppercase;color:var(--quiet);margin:26px 0 10px;padding-bottom:10px;border-bottom:1px solid var(--line)}
.es-drawer .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));border-top:1px solid var(--line);border-bottom:1px solid var(--line);margin:20px 0}
.es-drawer .stats div{padding:16px 12px 16px 0}
.es-drawer .stats div+div{padding-left:14px;border-left:1px solid var(--line)}
.es-drawer .stats label{display:block;font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:var(--quiet);margin-bottom:6px;cursor:default}
.es-drawer .stats strong{font:600 26px/1.1 var(--font-display);letter-spacing:-.04em;font-variant-numeric:tabular-nums;color:var(--text)}
.es-drawer .tbl{width:100%;border-collapse:collapse;font-size:14px}
.es-drawer .tbl th{text-align:left;font-size:11px;font-weight:600;letter-spacing:.07em;color:var(--head,#d6deed);padding:0 12px 10px 0;text-transform:uppercase;border-bottom:1px solid var(--line);white-space:nowrap}
.es-drawer .tbl td{padding:10px 12px 10px 0;border-bottom:1px solid var(--line);vertical-align:middle;color:var(--sub)}
.es-drawer .annex{display:grid;gap:8px;margin-top:12px}
.es-drawer .annex .fx{display:flex;gap:10px;align-items:baseline}
.es-drawer .annex .fx b{color:var(--text);font-weight:600;min-width:110px;flex-shrink:0;font-size:12.5px}
.es-drawer .annex code{font-family:var(--font-mono);color:var(--sub);font-size:12px}
/* ── Nueva carpeta form ── */
.es-drawer .form{display:grid;gap:16px;margin-top:20px}
.es-drawer .frow{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.es-drawer .fld label{display:block;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--quiet);margin-bottom:6px}
.es-drawer .req{color:var(--blue-2)}
.es-drawer .fact{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}
.es-drawer .inp{width:100%;min-width:0;background:var(--soft);border:1px solid var(--line);border-radius:5px;padding:11px 14px;font-size:15px;color:var(--text);font:inherit;box-sizing:border-box;outline:none}
.es-drawer .inp:focus{border-color:var(--blue)}
.es-drawer .inp::placeholder{color:var(--quiet)}
.es-drawer .select{appearance:none;-webkit-appearance:none;width:100%;background:var(--soft);border:1px solid var(--line);border-radius:5px;padding:11px 14px;font-size:15px;color:var(--text);font:inherit;outline:none;cursor:pointer}
.es-drawer .select:focus{border-color:var(--blue)}
.es-drawer .btn{all:unset;box-sizing:border-box;font:inherit;background:var(--blue);color:#fff;border-radius:5px;padding:12px 22px;font-size:14px;font-weight:600;cursor:pointer;transition:filter .16s;white-space:nowrap}
.es-drawer .btn:hover{filter:brightness(1.08)}
.es-drawer .btn.ghost{background:none;border:1px solid var(--line);color:var(--text)}
.es-drawer .btn.ghost:hover{border-color:var(--blue);filter:none}
.es-drawer .btn[disabled]{opacity:.5;cursor:default}
/* ── Silverdat chip ── */
.sdchip{all:unset;box-sizing:border-box;cursor:pointer;margin-left:auto;display:inline-flex;align-items:center;gap:8px;border:1px solid;border-radius:5px;padding:6px 12px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--sdoff);border-color:color-mix(in srgb,var(--sdoff) 55%,var(--line));white-space:nowrap;flex-shrink:0}
.sdchip::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--sdoff);flex-shrink:0}
.sdchip[data-on=true]{border-color:var(--silver);color:var(--silver)}
.sdchip[data-on=true]::before{background:var(--silver);box-shadow:0 0 0 3px color-mix(in srgb,var(--silver) 28%,transparent)}
.sdchip:hover{border-color:var(--text)}
.sdchip:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
`;

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

      <div className="es">

        {/* ── CarpetaScreen ── */}
        {showCarpetaScreen && <CarpetaScreen onSelect={handleSelectCarpeta} />}

        {/* ── Study view ── */}
        {!showCarpetaScreen && carpetaActiva && (
          <>
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
                <p className="over">
                  {fichaMode ? 'FICHA CONTRATADA' : `ESTUDIO · ${String(activeTabIndex + 1).padStart(2, '0')} / 08`}
                </p>
                <h1>{carpetaActiva.nombre || '(sin nombre)'}</h1>
                <div className="meta">
                  {carpetaActiva.header?.tomador && <span>{carpetaActiva.header.tomador}</span>}
                  {numVeh > 0 && <span>{numVeh} veh.</span>}
                  <EstadoBadge estado={carpetaActiva.estado} />
                </div>
                {(carpetaActiva.estado === 'RECHAZADA' || carpetaActiva.estado === 'OFERTADA') && (
                  <div className="banner" style={{ '--c': carpetaActiva.estado === 'RECHAZADA' ? 'rgba(239,77,90,0.9)' : 'rgba(240,185,77,0.9)' } as React.CSSProperties}>
                    <b>{carpetaActiva.estado}</b>
                    {motivoCarpeta && <span style={{ fontSize: 12, fontStyle: 'italic' }}>{motivoCarpeta}</span>}
                  </div>
                )}
              </div>
              <div className="acts">
                <div style={{ position: 'relative' }}>
                  <select
                    value=""
                    onChange={e => {
                      const val = e.target.value as EstadoFlota;
                      if (val && val !== carpetaActiva.estado) setEstadoPopover({ estado: val, motivo: '' });
                    }}
                    style={{
                      border: '1px solid var(--line)', background: 'var(--soft)', color: 'var(--text)',
                      padding: '7px 10px', borderRadius: 5, fontSize: 12, cursor: 'pointer', outline: 'none', font: 'inherit',
                    }}
                  >
                    <option value="">Cambiar estado</option>
                    {(['EN ESTUDIO', 'OFERTADA', 'CONTRATADA', 'RECHAZADA'] as EstadoFlota[])
                      .filter(e => e !== carpetaActiva.estado)
                      .map(e => <option key={e} value={e}>{e}</option>)}
                  </select>

                  {estadoPopover && (
                    <div style={{
                      position: 'absolute', top: '100%', right: 0, marginTop: 8, zIndex: 100,
                      padding: 14, borderRadius: 8, minWidth: 220,
                      background: 'var(--soft)', border: '1px solid var(--line)',
                      boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
                    }}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--quiet)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                        Cambiar a <EstadoBadge estado={estadoPopover.estado} small />
                      </p>
                      <input autoFocus placeholder="Motivo (opcional)"
                        value={estadoPopover.motivo}
                        onChange={e => setEstadoPopover(p => p ? { ...p, motivo: e.target.value } : null)}
                        onKeyDown={e => { if (e.key === 'Enter') handleConfirmarEstado(); if (e.key === 'Escape') setEstadoPopover(null); }}
                        style={{
                          width: '100%', fontSize: 12, marginBottom: 10,
                          border: '1px solid var(--line)', background: 'var(--soft)', color: 'var(--text)',
                          padding: '7px 10px', borderRadius: 5, outline: 'none', boxSizing: 'border-box', font: 'inherit',
                        }} />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={handleConfirmarEstado} className="mini pri" style={{ flex: 1, justifyContent: 'center' }}>Confirmar</button>
                        <button onClick={() => setEstadoPopover(null)} className="mini">Cancelar</button>
                      </div>
                    </div>
                  )}
                </div>

                <button onClick={handleRefresh} disabled={isRefreshing} className="mini" style={{ opacity: isRefreshing ? 0.5 : 1 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                    style={{ animation: isRefreshing ? 'spin 0.8s linear infinite' : 'none' }}>
                    <polyline points="23 4 23 10 17 10"/>
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                  </svg>
                  {isRefreshing ? 'Actualizando...' : 'Actualizar'}
                </button>

                <button onClick={handleSave} className={`mini${saveFlash ? ' flash' : ''}`}>
                  {saveFlash ? (
                    <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>Guardado</>
                  ) : (
                    <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>Guardar</>
                  )}
                </button>

                <button onClick={handleDownload} disabled={isDownloading} className="mini pri" style={{ opacity: isDownloading ? 0.5 : 1 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                  </svg>
                  {isDownloading ? 'Generando...' : 'Descargar todo'}
                </button>
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
                      {tab === 'AUTOMÁTICO' && <span className="op">(OPT)</span>}
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
                        <HojaOriginal ref={originalRef} header={flotaHeader} onHeaderChange={setFlotaHeader} onDataChange={handleOriginalChange} carpetaOriginalEmpty={carpetaActiva ? carpetaActiva.original.length === 0 : false} initialData={originalData} />
                      )}
                      {tab === 'TRABAJO' && (
                        <HojaTrabajos ref={trabajoRef} header={flotaHeader} onHeaderChange={setFlotaHeader} getOriginalSnapshot={getOriginalSnapshot} onDataChange={handleTrabajoChange} initialData={trabajoRows} />
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
                          <HojaInforme header={flotaHeader} carpetaNombre={carpetaActiva?.nombre} trabajoRows={trabajoRows} coberturas={coberturas} sincoResultRows={sincoResultRows} sincoManual={carpetaActiva?.sincoManual ?? []} sincoGlobal={carpetaActiva?.sincoGlobal ?? null} primasMmtValues={carpetaActiva?.primasMmtInforme} onPrimasMmtChange={(primas) => { const cur = carpetaActivaRef.current; if (cur) { const updated = { ...cur, primasMmtInforme: primas }; setCarpetaActiva(updated); guardarCarpeta(updated); } }} tarifaFlota={carpetaActiva?.tarifaFlota} corredorLabel={corredorLabel} danosPropios={carpetaActiva?.danosPropios} observacion={motivoCarpeta} />
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
                        <HojaPreEmision trabajoRows={trabajoRows} initialSeleccion={carpetaActiva?.catalogoSeleccion} onCatalogoChange={(selecciones) => { if (carpetaActiva) setCarpetaActiva({ ...carpetaActiva, catalogoSeleccion: selecciones }); }} />
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
