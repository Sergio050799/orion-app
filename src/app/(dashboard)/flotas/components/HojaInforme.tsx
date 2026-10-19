"use client";

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { consolidarSinco, consolidarSincoPorTipo } from '@/core/flotas';
import type { ResumenSinco } from '@/core/flotas';
import type { FlotaHeader, CoberturaRow } from './types';
import type { DanosPropiosData } from '@/core/flotas';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SincoManualEntry {
  matricula: string;
  num_siniestros: number;
  fec_ini_cobertura: string;
  fec_vcto: string;
  codigo_retorno: string;
  garantias: string;
  observaciones: string;
}

interface SincoGlobal {
  siniestrosTotales: number;
  anyosExperiencia: number;
  frecuencia: number;
  observaciones: string;
}

interface TarifaEntry {
  tipo: string;
  cobertura: string;
  precio: number;
}

interface Props {
  header?: FlotaHeader;
  carpetaNombre?: string;
  trabajoRows: Record<string, string>[];
  coberturas: CoberturaRow[];
  sincoResultRows: Record<string, string>[];
  sincoManual: SincoManualEntry[];
  sincoGlobal: SincoGlobal | null;
  primasMmtValues?: Record<string, number>;
  onPrimasMmtChange?: (primas: Record<string, number>) => void;
  tarifaFlota?: TarifaEntry[];
  corredorLabel?: string;
  danosPropios?: DanosPropiosData;
  observacion?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const normTipo = (t: string) => {
  const u = t.toUpperCase().trim();
  return u === 'DERIVADO DE TURISMO' ? 'TURISMO' : u || 'SIN TIPO';
};

const fmtEur = (n: number) =>
  n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

const fmtEur2 = (n: number) =>
  n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

const fmt2 = (n: number) =>
  (isNaN(n) || !isFinite(n) ? '—' : n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

// frecuencia es un ratio (0.14 = 14%); null = sin exposición válida
const fmtFreq = (n: number | null) =>
  n === null ? 'Sin exp.' : (isNaN(n) || !isFinite(n) ? '—' : `${(n * 100).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`);

const today = () => new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

const COB_NOMBRES: Record<string, string> = {
  RC:       'Responsabilidad Civil',
  RCO_1:   'RC — Daños Materiales',
  RCO_2:   'RC — Daños Corporales',
  RCS_1:   'RC Voluntaria',
  DEFA_1:  'Defensa Jurídica',
  DEFC_1:  'Defensa Jurídica',
  DEFM_1:  'Defensa Jurídica',
  DEFM_2:  'Defensa — Infracciones',
  DEF_2:   'Asesoramiento Jurídico',
  DEF_3:   'Defensa — Infracciones',
  DEF_4:   'Recuperación de Puntos',
  DP_1:    'Daños Propios',
  DP_2:    'Daños Propios — Pintura',
  ROBO_1:  'Robo',
  ROBO_2:  'Intento de Robo',
  ROBOM_1: 'Robo (Moto)',
  ROBOM_2: 'Robo (Moto)',
  LUN_1:   'Rotura de Lunas',
  LUN_2:   'Reparación de Lunas',
  LCE_1:   'Asistencia en Viaje',
  AV_1:    'Asistencia en Viaje',
  AV_4:    'Asistencia en Viaje',
  AVM_1:   'Asistencia en Viaje (Moto)',
  INC_1:   'Incendio',
  INCM_1:  'Incendio (Moto)',
  OCA_1:   'Seguro del Conductor',
  OCA_2:   'Conductor y Ocupantes',
  OC_1:    'Seguro del Conductor',
  OCM_1:   'Seguro del Conductor (Moto)',
  ANI_1:   'Colisión con Animales',
  PTOT_1:  'Pérdida Total',
  PTOT_2:  'Robo con Pérdida Total',
  INV_1:   'Seguro Individual',
  CA_1:    'Daños al Casco',
};

// ─── PDF Generator ────────────────────────────────────────────────────────────

// SVG logo fallback (si falla la carga del PNG)
const LOGO_SVG_FALLBACK = `<svg class="orion-mark" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg"><path d="M17.5 3.3 29.5 9.1 29.5 23.3 17.4 31.4 5.1 24.5 5.1 10.4Z" fill="none" stroke="#000" stroke-linejoin="round" stroke-width="3"/><path d="M8.3 23.2 22.2 15.1M23.2 3.9 32.9 8.8 32.9 16.7M19.5 29.8 29.4 24.1" fill="none" stroke="#000" stroke-linecap="round" stroke-width="3"/></svg>`;

let _logoCache: string | null = null;
async function fetchLogoDataUrl(): Promise<string> {
  if (_logoCache) return _logoCache;
  try {
    const res = await fetch('/ORION_LOGO.png');
    if (!res.ok) return '';
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const CHUNK = 8192;
    let bin = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    _logoCache = 'data:image/png;base64,' + btoa(bin);
    return _logoCache;
  } catch {
    return '';
  }
}

// Convierte serial de Excel a dd/mm/yyyy si el valor es un número puro de 5+ dígitos > 40000
const fmtDateField = (v?: string): string => {
  if (!v) return '';
  const trimmed = v.trim();
  if (/^\d{5,}$/.test(trimmed)) {
    const n = parseInt(trimmed, 10);
    if (n > 40000) {
      const d = new Date(Math.round((n - 25569) * 86400 * 1000));
      return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
  }
  return v;
};

function buildPdfHtml(data: {
  header?: FlotaHeader;
  pivot: { tipos: string[]; cobs: string[]; counts: Record<string, Record<string, number>> };
  totalVehiculos: number;
  ambitoLabel: string | null;
  numTomadores: number;
  adrActivo: boolean;
  sinco: { label: string; values: [string, string][] } | null;
  danosPropiosPdf?: { values: [string, string][] } | null;
  primasSol: { tipo: string; cob: string; count: number; media: number; total: number }[];
  mmtRows: { tipo: string; cob: string; count: number; prima: number | null; total: number | null }[];
  corredorLabel?: string;
  cobAnexo: { titulo: string; tipologias?: string[]; garantias: string[] }[];
  sincoPorTipo?: { tipologia: string; resumen: ResumenSinco }[];
  fechaVctoDisplay?: string | null;
  logoSrc?: string;
  tomadoresArr?: string[];
  carpetaNombre?: string;
  observacion?: string;
}): string {
  const { header, pivot, totalVehiculos, ambitoLabel, numTomadores, adrActivo, sinco, danosPropiosPdf, primasSol, mmtRows, corredorLabel, cobAnexo, sincoPorTipo } = data;
  const escObs = data.observacion ? data.observacion.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : '';
  const totalSol = primasSol.reduce((a, r) => a + r.total, 0);
  const totalMmt = mmtRows.reduce((a, r) => a + (r.total ?? 0), 0);
  const dif      = totalMmt - totalSol;
  const pctDif   = totalSol > 0 ? (dif / totalSol) * 100 : 0;
  const dateStr  = today();

  const fleetName = data.carpetaNombre?.trim() || header?.tomador?.trim() || data.tomadoresArr?.[0]?.trim() || '';

  const logoRight = data.logoSrc
    ? `<img src="${data.logoSrc}" alt="ORION" style="width:32px;height:32px;object-fit:contain;display:block;filter:brightness(0)">`
    : LOGO_SVG_FALLBACK;

  const brandrow = `<div class="brandrow">
  <div class="brandname">MMT SEGUROS</div>
  ${logoRight}
</div>`;

  // Pivot rows
  const pivotRows = pivot.tipos.map(tipo => {
    const total = pivot.cobs.reduce((a, c) => a + (pivot.counts[tipo]?.[c] ?? 0), 0);
    return `<tr>
      <td>${tipo}</td>
      <td class="cnt"><b>${total}</b></td>
      ${pivot.cobs.map(c => `<td class="cnt">${pivot.counts[tipo]?.[c] ?? 0}</td>`).join('')}
    </tr>`;
  }).join('');
  const pivotTotals = pivot.cobs.map(c =>
    `<td class="cnt">${pivot.tipos.reduce((a, t) => a + (pivot.counts[t]?.[c] ?? 0), 0)}</td>`
  ).join('');

  const primasRows = primasSol.map((r, i) => {
    const mmt    = mmtRows[i];
    const difRow = (mmt?.total ?? 0) - r.total;
    const difCls = difRow < 0 ? ' neg' : difRow > 0 ? ' pos' : '';
    return `<tr>
      <td><strong>${r.tipo}</strong><span class="minor">${r.cob}</span></td>
      <td class="cnt">${r.count}</td>
      <td class="num">${r.media ? fmtEur2(r.media) : '—'}</td>
      <td class="num">${r.total ? fmtEur(r.total) : '—'}</td>
      <td class="num">${mmt?.prima != null ? fmtEur2(mmt.prima) : '—'}</td>
      <td class="num">${mmt?.total != null ? fmtEur(mmt.total) : '—'}</td>
      <td class="num${difCls}">${mmt?.total != null ? (difRow >= 0 ? '+' : '') + fmtEur(difRow) : '—'}</td>
    </tr>`;
  }).join('');

  // Hero strip (vencimiento / ámbito / tomadores / observaciones)
  const obsLine = corredorLabel
    ? `${corredorLabel} · que ${adrActivo ? 'SÍ' : 'NO'} lleva ADR`
    : adrActivo ? 'ADR SÍ' : null;
  const heroHtml = `<div class="hero">
    ${data.fechaVctoDisplay ? `<div><small>Vencimiento</small><strong>${data.fechaVctoDisplay}</strong></div>` : ''}
    ${ambitoLabel           ? `<div><small>Ámbito</small><strong>${ambitoLabel}</strong></div>` : ''}
    ${header?.cif           ? `<div><small>CIF / NIF</small><strong>${header.cif}</strong></div>` : ''}
    ${numTomadores > 1      ? `<div><small>Composición</small><strong>${numTomadores} tomadores</strong></div>` : ''}
    ${obsLine               ? `<div style="flex:2"><small>Observaciones</small><strong>${obsLine}</strong></div>` : ''}
  </div>`;

  // SINCO — metricstrip global + tabla tipología en una sola sección (igual que V4)
  const sincoSection = sinco ? (() => {
    const hasSinExp = sinco.values.some(([, v]) => v === 'Sin exp.');
    const items = sinco.values.map(([l, v]) =>
      `<div class="metric"><b>${v}</b><small>${l}</small></div>`
    ).join('');
    const tipoRows = (sincoPorTipo && sincoPorTipo.length > 1)
      ? sincoPorTipo.map(({ tipologia, resumen: r }) => `<tr>
          <td>${tipologia}</td>
          <td class="cnt">${r.totalVehiculos}</td>
          <td class="cnt">${r.vehiculosConSinco}</td>
          <td class="cnt">${r.totalSiniestros}</td>
          <td class="num">${fmt2(r.antiguedadMedia)} a</td>
          <td class="num">${fmt2(r.siniestrosPorAnio)}</td>
          <td class="num">${fmtFreq(r.frecuencia)}</td>
        </tr>`).join('')
      : null;
    return `<section class="report-section section-break">
    <h2 class="sec-title">Siniestralidad SINCO <em>Resumen global</em></h2>
    <div class="metricstrip">${items}</div>
    ${hasSinExp ? `<p class="method">Sin exposición válida: la frecuencia no puede interpretarse como 0 %.</p>` : ''}
    ${tipoRows ? `<table class="table">
      <thead><tr>
        <th>Tipología</th>
        <th class="cnt">Veh.</th><th class="cnt">SINCO</th><th class="cnt">Sin.</th>
        <th class="num">Antig.</th><th class="num">Sin./año</th><th class="num">Frec.</th>
      </tr></thead>
      <tbody>${tipoRows}</tbody>
    </table>` : ''}
  </section>`;
  })() : '';

  const sincoPorTipoSection = '';

  // Daños Propios
  const danosPropiosSection = danosPropiosPdf ? (() => {
    const items = danosPropiosPdf.values.map(([l, v]) =>
      `<div class="metric"><b>${v}</b><small>${l}</small></div>`
    ).join('');
    return `<section class="report-section section-break">
    <h2 class="sec-title">Siniestralidad Daños Propios <em>Resumen global</em></h2>
    <div class="metricstrip">${items}</div>
  </section>`;
  })() : '';

  // Comparativa de primas
  const economyHtml = (totalSol && totalMmt) ? `<div class="economy">
    <div><small>Prima solicitada</small><strong>${fmtEur(totalSol)}</strong></div>
    <div><small>Prima MMT</small><strong>${fmtEur(totalMmt)}</strong></div>
    <div><small>Diferencia</small><strong class="${dif >= 0 ? 'pos' : 'neg'}">${dif >= 0 ? '+' : ''}${fmtEur(dif)}</strong></div>
    <div><small>Variación</small><strong class="${dif >= 0 ? 'pos' : 'neg'}">${totalSol ? (dif >= 0 ? '+' : '') + pctDif.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %' : '—'}</strong></div>
  </div>
  <p class="method">Diferencia calculada como prima MMT menos prima solicitada.</p>` : '';

  const primasSection = `<section class="report-section section-break">
    <h2 class="sec-title">Comparativa de primas <em>Importes anuales</em></h2>
    <table class="table">
      <colgroup><col style="width:28%"><col style="width:7%"><col style="width:12%"><col style="width:13%"><col style="width:12%"><col style="width:13%"><col style="width:15%"></colgroup>
      <thead><tr>
        <th>Tipo y cobertura</th>
        <th class="cnt">Nº</th>
        <th class="num">Sol./veh.</th>
        <th class="num">Total sol.</th>
        <th class="num">MMT/veh.</th>
        <th class="num">Total MMT</th>
        <th class="num">Diferencia</th>
      </tr></thead>
      <tbody>${primasRows}</tbody>
      <tbody><tr class="total">
        <td>TOTAL</td>
        <td class="cnt">${primasSol.reduce((a, r) => a + r.count, 0)}</td>
        <td class="num">—</td>
        <td class="num">${totalSol ? fmtEur(totalSol) : '—'}</td>
        <td class="num">—</td>
        <td class="num">${totalMmt ? fmtEur(totalMmt) : '—'}</td>
        <td class="num ${dif < 0 ? 'neg' : dif > 0 ? 'pos' : ''}">${totalMmt ? (dif >= 0 ? '+' : '') + fmtEur(dif) : '—'}</td>
      </tr></tbody>
    </table>
    ${economyHtml}
  </section>`;

  // Coverage — páginas dinámicas (máx 4 secciones por página)
  const CPCOV = 4;
  const covChunks: typeof cobAnexo[] = [];
  for (let i = 0; i < cobAnexo.length; i += CPCOV) covChunks.push(cobAnexo.slice(i, i + CPCOV));
  const hasPrimasData = primasSol.length > 0;
  const totalPages = 1 + (hasPrimasData ? 1 : 0) + covChunks.length;

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Informe — ${fleetName || header?.tomador || 'ORION'}</title>
<style>
@page{size:A4;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
:root{--ink:#181d24;--muted:#5b6470;--line:#d9dde3;--soft:#f3f5f7;--blue:#1240cc;--green:#157858}
html,body,.page,.page *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}
html{background:#e8ebef}
body{margin:0;font-family:Arial,Helvetica,sans-serif;color:var(--ink)}
.pages{padding:20px}
.page{width:210mm;height:297mm;background:white;margin:0 auto 20px;padding:11mm 12.5mm 20mm;box-shadow:0 7px 35px rgba(15,19,28,.15);position:relative;overflow:hidden;display:flex;flex-direction:column}
.brandrow{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #d1d6df;padding-bottom:7px;margin-bottom:8px}
.brandname{font-size:17px;font-weight:800;letter-spacing:.115em;color:var(--ink)}
.orion-mark{width:32px;height:32px;display:block;flex:none}
.kicker{font-size:10px;letter-spacing:.18em;font-weight:750;color:var(--blue);margin:1px 0 5px}
.report-title{font-size:23px;line-height:1.05;letter-spacing:-.045em;margin:0 0 5px;font-weight:800;color:var(--ink)}
.subtitle{font-size:11px;color:var(--muted);margin:0}
.hero{display:flex;justify-content:space-between;gap:10px;margin-top:8px;margin-bottom:9px;padding:8px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.hero div{flex:1}
.hero small{display:block;text-transform:uppercase;color:var(--muted);font-size:9px;letter-spacing:.07em;font-weight:750;margin-bottom:5px}
.hero strong{font-size:12px;line-height:1.3;font-weight:700;color:var(--ink)}
.report-section{margin-top:6px}
.section-break{margin-top:9px}
.sec-title{font-size:14px;margin:0 0 7px;font-weight:780;letter-spacing:-.02em;display:flex;align-items:center;justify-content:space-between;color:var(--ink)}
.sec-title em{font-style:normal;font-size:10px;color:var(--muted);font-weight:normal}
.table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:11.2px;line-height:1.32}
.table th{padding:8px 7px;background:#e8edf4;font-size:9.6px;color:#303948;font-weight:750;text-align:left;border-bottom:1px solid var(--line)}
.table td{padding:8px 7px;border-bottom:1px solid #e4e7eb;vertical-align:top;line-height:1.4;color:var(--ink)}
.table td.num,.table th.num{text-align:right;font-variant-numeric:tabular-nums}
.table td.cnt,.table th.cnt{text-align:center;font-variant-numeric:tabular-nums}
.table tbody tr:nth-child(even):not(.total) td{background:#f8fafd}
.table .total td{font-weight:800;background:#e9edf3;border-top:1px solid #aeb8c8}
.table td:first-child{font-weight:550}
.table td:first-child b{font-size:11px}
.minor{display:block;font-size:10px;color:var(--muted);margin-top:3px;line-height:1.35}
.metricstrip{display:grid;grid-template-columns:repeat(6,1fr);border-top:1px solid var(--line);border-bottom:1px solid var(--line);margin:7px 0 9px;background:#f8fafd}
.metric{padding:8px 7px;border-right:1px solid var(--line)}
.metric:first-child{padding-left:0}
.metric:last-child{border:0}
.metric b{font-size:15px;display:block;line-height:1.2;color:var(--ink)}
.metric small{font-size:8.2px;text-transform:uppercase;letter-spacing:.035em;color:var(--muted);font-weight:740}
.economy{display:grid;grid-template-columns:repeat(4,1fr);border-top:1.3px solid var(--line);border-bottom:1.3px solid var(--line);margin-top:9px;background:#f8fafd}
.economy div{padding:9px 8px;border-right:1px solid var(--line)}
.economy div:first-child{padding-left:0}
.economy div:last-child{border:0}
.economy small{display:block;color:var(--muted);font-size:8.8px;text-transform:uppercase;font-weight:bold;margin-bottom:4px}
.economy strong{font-size:17px;font-variant-numeric:tabular-nums;color:var(--ink)}
.pos{color:var(--green)}.neg{color:#b84b56}
.method{font-size:9.2px;color:var(--muted);padding-top:6px}
.coverage-grid{display:grid;grid-template-columns:1fr 1fr;gap:7mm;align-content:start;margin-top:14px}
.coverage{border-top:2px solid #272d36;padding-top:7px;break-inside:avoid}
.coverage h3{font-size:14px;margin:0 0 3px;font-weight:800;color:var(--ink)}
.coverage .type{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:9px;border-bottom:1px solid var(--line);padding-bottom:6px}
.coverage ul{padding:0;margin:0;list-style:none}
.coverage li{display:flex;gap:9px;align-items:flex-start;border-bottom:1px solid #eceef1;padding:7px 0;font-size:11px;line-height:1.35;color:var(--ink)}
.coverage li::before{content:"";width:9px;flex:none;height:2px;background:var(--blue);margin-top:5px}
.note{border-left:3px solid var(--blue);background:#edf3fc;color:#485160;padding:9px 11px;font-size:10px;line-height:1.5;margin-top:13px}
.footer{position:absolute;bottom:8mm;left:12.5mm;right:12.5mm;border-top:1px solid var(--line);padding-top:7px;display:flex;justify-content:space-between;color:var(--muted);font-size:9px}
@media print{
  body{background:white}
  .pages{padding:0}
  .page{height:296mm;width:210mm;margin:0;box-shadow:none;break-after:page;page-break-after:always}
  .page:last-child{break-after:auto;page-break-after:auto}
  .table th{background:#e8edf4 !important}
  .table .total td{background:#e9edf3 !important}
  .metricstrip,.economy{background:#f8fafd !important}
  .note{background:#edf3fc !important}
}
</style>
</head><body>
<div class="pages">

<article class="page">
${brandrow}
<div class="kicker">ANÁLISIS TÉCNICO DE FLOTAS</div>
<h1 class="report-title">${fleetName || 'Informe de estudio de flota'}</h1>
<p class="subtitle">Composición del riesgo, siniestralidad y comparativa económica</p>
${heroHtml}
<section class="report-section">
  <h2 class="sec-title">Composición de la flota <em>${totalVehiculos} vehículos informados</em></h2>
  <table class="table">
    <colgroup><col style="width:35%"><col style="width:9%">${pivot.cobs.map(() => `<col style="width:${Math.floor(56/Math.max(pivot.cobs.length,1))}%">`).join('')}</colgroup>
    <thead><tr>
      <th>Tipo</th>
      <th class="cnt">Nº</th>
      ${pivot.cobs.map(c => `<th class="cnt">${c || '—'}</th>`).join('')}
    </tr></thead>
    <tbody>${pivotRows}</tbody>
    <tbody><tr class="total">
      <td>Total declarado</td>
      <td class="cnt"><b>${totalVehiculos}</b></td>
      ${pivotTotals}
    </tr></tbody>
  </table>
</section>
${sincoSection}
${sincoPorTipoSection}
${danosPropiosSection}
<div class="footer"${escObs ? ' style="flex-direction:column;gap:4px"' : ''}>
  ${escObs ? `<div style="font-style:italic;color:#7a8594;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9px">Obs.: ${escObs}</div>` : ''}
  <div style="display:flex;justify-content:space-between;width:100%">
    <span>ORION · Documento confidencial</span>
    <span>${dateStr} · Página 1 de ${totalPages}</span>
  </div>
</div>
</article>

${hasPrimasData ? `<article class="page">
${brandrow}
<div class="kicker">ANÁLISIS ECONÓMICO</div>
<h1 class="report-title">${fleetName || 'Comparativa de primas'}</h1>
<p class="subtitle">Importes anuales — Prima solicitada vs Prima MMT de referencia</p>
${primasSection}
<div class="footer">
  <span>ORION · Documento confidencial</span>
  <span>${dateStr} · Página 2 de ${totalPages}</span>
</div>
</article>` : ''}

${covChunks.map((chunk, ci) => `<article class="page">
${brandrow}
<div class="kicker">ANEXO DE CONDICIONES</div>
<h1 class="report-title">${fleetName || 'Coberturas del estudio'}</h1>
${ci === 0 ? `<p class="subtitle">Relación de garantías declaradas según modalidad y tipología. Las condiciones definitivas corresponden a la póliza emitida.</p>` : ''}
<div class="coverage-grid">
  ${chunk.map(({ titulo, tipologias, garantias }) => `<section class="coverage">
    <h3>${titulo}</h3>
    ${tipologias && tipologias.length > 0 ? `<div class="type">${tipologias.join(' · ')}</div>` : ''}
    <ul>${garantias.map(g => `<li>${g}</li>`).join('')}</ul>
  </section>`).join('')}
</div>
${ci === covChunks.length - 1 ? `<div class="note">Las coberturas mostradas proceden del informe de referencia aportado. Condiciones sujetas a la póliza definitiva emitida por MMT Seguros.</div>` : ''}
<div class="footer">
  <span>ORION · Documento confidencial</span>
  <span>${dateStr} · Página ${(hasPrimasData ? 3 : 2) + ci} de ${totalPages}</span>
</div>
</article>`).join('\n')}

</div>
</body></html>`;
}

// ─── HojaInforme ─────────────────────────────────────────────────────────────

export default function HojaInforme({
  header, carpetaNombre,
  trabajoRows, coberturas, sincoResultRows, sincoManual, sincoGlobal,
  primasMmtValues, onPrimasMmtChange, tarifaFlota, corredorLabel, danosPropios, observacion,
}: Props) {

  // ── Pivot tipo × cobertura ──────────────────────────────────────────────────
  const pivot = useMemo(() => {
    const tipos = new Set<string>();
    const cobs  = new Set<string>();
    const counts: Record<string, Record<string, number>> = {};
    trabajoRows.forEach((r, i) => {
      if (!r['matricula']?.trim()) return;
      const tipo = r['tipo_vehiculo'] || 'Sin tipo';
      const cob  = coberturas[i]?.cobertura || r['coberturas_solicitadas'] || 'Sin cobertura';
      tipos.add(tipo); cobs.add(cob);
      if (!counts[tipo]) counts[tipo] = {};
      counts[tipo][cob] = (counts[tipo][cob] ?? 0) + 1;
    });
    return { tipos: Array.from(tipos), cobs: Array.from(cobs), counts };
  }, [trabajoRows, coberturas]);

  const totalVehiculos = trabajoRows.filter(r => r['matricula']?.trim()).length;

  // ── Fecha vencimiento — header o fallback a primera fila con valor ───────────
  const fechaVctoDisplay = useMemo(() => {
    const raw = header?.fechaVencimiento?.trim()
      || trabajoRows.find(r => r['matricula']?.trim() && r['fecha_vencimiento']?.trim())?.[  'fecha_vencimiento']?.trim()
      || null;
    return raw ? fmtDateField(raw) : null;
  }, [header, trabajoRows]);

  // ── Ámbito ──────────────────────────────────────────────────────────────────
  const ambito = useMemo(() => {
    const rows = trabajoRows.filter(r => r['matricula']?.trim());
    const getAmb = (r: Record<string, string>) => (r['ambito'] || r['ámbito'] || '').toLowerCase();
    const nacional = rows.filter(r => getAmb(r).includes('nac')).length;
    const internacional = rows.filter(r => getAmb(r).includes('int')).length;
    const sinDato = rows.length - nacional - internacional;
    // Si hay vehículos pero ninguno tiene ámbito explícito → Nacional por defecto
    const label: string | null = internacional > 0 ? 'Internacional' : (nacional > 0 || rows.length > 0) ? 'Nacional' : null;
    return { nacional, internacional, sinDato, label };
  }, [trabajoRows]);

  // ── Tomadores ────────────────────────────────────────────────────────────────
  const tomadores = useMemo(() => {
    const set = new Set<string>();
    trabajoRows.filter(r => r['matricula']?.trim()).forEach(r => {
      const t = (r['tomador'] ?? '').trim();
      if (t) set.add(t.toUpperCase());
    });
    return set;
  }, [trabajoRows]);

  // ── ADR ─────────────────────────────────────────────────────────────────────
  const adrActivo = useMemo(() => {
    const rows = trabajoRows.filter(r => r['matricula']?.trim());
    return rows.some(r => (r['adr'] || '').toLowerCase().includes('s'));
  }, [trabajoRows]);

  // ── SINCO ────────────────────────────────────────────────────────────────────
  const resumenAuto   = useMemo(() => sincoResultRows.length > 0 ? consolidarSinco(sincoResultRows) : null, [sincoResultRows]);
  const resumenManual = useMemo(() => {
    if (sincoManual.length === 0) return null;
    const recs = sincoManual
      .filter(e => e.num_siniestros > 0 || e.fec_ini_cobertura || e.codigo_retorno)
      .map(e => ({ num_siniestros: String(e.num_siniestros), fec_ini_cobertura: e.fec_ini_cobertura, codigo_retorno: e.codigo_retorno }));
    return recs.length > 0 ? consolidarSinco(recs) : null;
  }, [sincoManual]);

  const hasSincoData = resumenAuto !== null || resumenManual !== null || sincoGlobal !== null;

  const sincoPorTipo = useMemo(
    () => sincoResultRows.length > 0 ? consolidarSincoPorTipo(sincoResultRows, trabajoRows) : [],
    [sincoResultRows, trabajoRows],
  );

  // ── Motor ORION — solo estados (handler y constantes se declaran post tipoCobGrupos)
  type OrionTecnicaDetalle = {
    garantia: string;
    prima_tecnica_veh: number;
    tipo: 'rc_ajustado_sinco' | 'rc_referencia_mmt' | 'prima_mmt_referencia';
    ratio_sinco: number | null;
    nota: string;
  };
  type OrionResult = {
    estado: 'calculado' | 'revisar' | 'no_calculable' | 'error' | 'sin_datos';
    coste_total_grupo: number;
    coste_por_vehiculo: number | null;
    prima_orientativa_mmt_veh: number | null;
    prima_orientativa_mmt_grupo: number | null;
    prima_mmt_parcial: boolean;
    prima_tecnica_orion_veh: number | null;
    prima_tecnica_orion_grupo: number | null;
    prima_tecnica_parcial: boolean;
    prima_tecnica_sin_datos: string[];
    prima_tecnica_detalle: OrionTecnicaDetalle[];
    prima_orion_grupo: number | null;
    prima_orion_veh: number | null;
    advertencias: string[];
    grupos: { garantia: string; detalle: Record<string, unknown> }[];
    tipologia_mmt: string;
    fecha_foto: string;
    pendientes: string[];
    sinco_freq_usado: number | null;
  };

  const [orionResults, setOrionResults] = useState<Record<string, OrionResult | null>>({});
  const [orionLoading, setOrionLoading] = useState(false);
  const [orionExpanded, setOrionExpanded] = useState<Record<string, boolean>>({});

  // ── Daños Propios ────────────────────────────────────────────────────────────
  const danosPropiosItems = useMemo((): [string, string][] | null => {
    if (!danosPropios?.mostrarEnInforme) return null;
    const numSin = danosPropios.numSiniestros ?? 0;
    const totalVeh = trabajoRows.filter(r => r['matricula']?.trim()).length;
    const antiguedMedia = resumenAuto?.antiguedadMedia ?? 0;
    const sinAnio = antiguedMedia > 0 ? numSin / antiguedMedia : 0;
    const frecuencia = totalVeh > 0 ? sinAnio / totalVeh : 0;
    return [
      ['Vehículos', String(totalVeh)],
      ['Siniestros', String(numSin)],
      ['Años media', fmt2(antiguedMedia) + 'a'],
      ['Sin./año', fmt2(sinAnio)],
      ['Frecuencia', fmtFreq(frecuencia)],
    ];
  }, [danosPropios, trabajoRows, resumenAuto]);

  // ── Primas agrupadas ─────────────────────────────────────────────────────────
  const isYes = (v?: string) => { const u = (v ?? '').trim().toUpperCase(); return u !== '' && u !== 'NO' && u !== 'N' && u !== '0'; };

  const tipoCobGrupos = useMemo(() => {
    const grupos: Record<string, { tipo: string; cob: string; cobLabel: string; count: number; sumaSol: number; hasAsistencia: boolean; hasLunas: boolean; hasAnimales: boolean; hasSeguroConductor: boolean }> = {};
    trabajoRows.filter(r => r['matricula']?.trim()).forEach(r => {
      const tipo = normTipo(r['tipo_vehiculo'] || '');
      const cob  = r['coberturas_solicitadas'] || 'Sin cobertura';
      const key  = `${tipo}||${cob}`;                                  // clave estable para saved primas
      const prima = parseFloat(r['prima_referencia'] ?? '');
      if (!grupos[key]) grupos[key] = { tipo, cob, cobLabel: cob, count: 0, sumaSol: 0, hasAsistencia: false, hasLunas: false, hasAnimales: false, hasSeguroConductor: false };
      // Actualizar cobLabel si este vehículo tiene extras
      const extras: string[] = [];
      if (isYes(r['lunas']))            { extras.push('LUNAS');           grupos[key].hasLunas = true; }
      if (isYes(r['asistencia']))       { extras.push('ASISTENCIA');      grupos[key].hasAsistencia = true; }
      if (isYes(r['animales']))         { extras.push('ANIMALES');        grupos[key].hasAnimales = true; }
      if (isYes(r['seguro_conductor'])) { extras.push('SEGURO CONDUCTOR');grupos[key].hasSeguroConductor = true; }
      if (extras.length > 0) grupos[key].cobLabel = `${cob} (${extras.join(', ')})`;
      grupos[key].count++;
      if (!isNaN(prima)) grupos[key].sumaSol += prima;
    });
    return grupos;
  }, [trabajoRows]);

  // ── Motor ORION — constantes y handler (post tipoCobGrupos) ─────────────────
  const ORION_TO_MMT: Record<string, string> = {
    'CABEZA TRACTORA':     'TRACTOCAMION',
    'SEMIRREMOLQUE':       'REMOLQUE-SEMI',
    'CAMION RIGIDO':       'CAMION',
    'FURGONETA':           'FURGON',
    'TURISMO':             'TRUISMOS -1000',
    'MOTOCICLETA':         'MOTOCICLETAS',
    'FURGON PESADO':       'FURGON PESADO',
    'CAMION LIGERO':       'CAMION LIGERO',
    'DERIVADO TT':         'DERIVADO TT',
    'VH-AGRICOLA':         'VH-AGRICOLA',
    'VEHICULO INDUSTRIAL': 'VEHICULO INDUSTRIAL',
  };

  const TIPOLOGIA_DEF_MAP: Record<string, string> = {
    'TRACTOCAMION':       'DEFC_1', 'REMOLQUE-SEMI':      'DEFC_1', 'CAMION':           'DEFC_1',
    'FURGON PESADO':      'DEFC_1', 'VEHICULO INDUSTRIAL':'DEFC_1', 'VH-AGRICOLA':       'DEFC_1',
    'CAMION LIGERO':      'DEFA_1', 'FURGON':             'DEFA_1', 'TRUISMOS -1000':    'DEFA_1',
    'DERIVADO DE TURISMO':'DEFA_1', 'DERIVADO TT':        'DEFA_1', 'MOTOCICLETAS':      'DEFM_1',
  };
  const TIPOLOGIA_ROBO_MAP: Record<string, string | null> = {
    'TRACTOCAMION':       'ROBO_1', 'REMOLQUE-SEMI':      'ROBO_1', 'CAMION':            'ROBO_1',
    'CAMION LIGERO':      'ROBO_1', 'FURGON':             'ROBO_1', 'TRUISMOS -1000':    'ROBO_1',
    'DERIVADO DE TURISMO':'ROBO_1', 'DERIVADO TT':        'ROBO_1', 'MOTOCICLETAS':      'ROBOM_1',
    'FURGON PESADO':      null,     'VEHICULO INDUSTRIAL': null,     'VH-AGRICOLA':       null,
  };

  // Devuelve { garantias: id_cobertura[] para el motor, pendientes: string[] sin datos calculables }
  // LCE_1 es el proxy estadístico de Asistencia en Viaje (AV) en mmt_stats para:
  //   REMOLQUE-SEMI, FURGON, TRUISMOS -1000 → coste histórico MMT = 0 (cero siniestros en todas las fotos)
  // Para otras tipologías (TRACTOCAMION, etc.) no existe LCE_1 → pendiente real.
  const TIPOLOGIAS_CON_LCE_1 = new Set(['REMOLQUE-SEMI', 'FURGON', 'TRUISMOS -1000']);
  const cobToGarantias = (cob: string, mmtTip: string, hasLunas: boolean, hasAsistencia: boolean): { garantias: string[]; pendientes: string[] } => {
    const v = cob.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const defCob  = TIPOLOGIA_DEF_MAP[mmtTip]  ?? 'DEFC_1';
    const roboCob = TIPOLOGIA_ROBO_MAP[mmtTip] ?? null;
    const lunasArr    = hasLunas ? ['LUN_1'] : [];
    const roboArr     = roboCob  ? [roboCob] : [];
    const pendientes: string[] = [];
    const asistenciaArr: string[] = [];
    if (hasAsistencia) {
      if (TIPOLOGIAS_CON_LCE_1.has(mmtTip)) {
        asistenciaArr.push('LCE_1');
        pendientes.push('LCE_1 = Subsidio por Paralización del vehículo — usado como proxy de AV; equivalencia con producto AV completo no documentada');
      } else {
        pendientes.push(`AV — Asistencia en Viaje (sin datos en mmt_stats para ${mmtTip})`);
      }
    }
    if (v.includes('todo') || v.includes('franquicia') || v.includes('riesgo'))
      return { garantias: ['RCO_1', 'RCO_2', defCob, ...lunasArr, ...roboArr, 'INC_1', 'DP_1', ...asistenciaArr], pendientes };
    if (v.includes('amplia'))
      return { garantias: ['RCO_1', 'RCO_2', defCob, ...lunasArr, ...roboArr, 'INC_1', ...asistenciaArr], pendientes };
    return { garantias: ['RCO_1', 'RCO_2', defCob, ...lunasArr, ...asistenciaArr], pendientes };
  };

  const handleCalcularOrion = useCallback(async () => {
    setOrionLoading(true);
    const nuevosResultados: Record<string, OrionResult | null> = {};

    // Leer foto_activa desde motor_params; caer a 202609 si el motor no responde
    let fecha_foto = '202609';
    try {
      const paramsRes = await fetch('/api/flotas/motor?resource=params');
      if (paramsRes.ok) {
        const paramsData = await paramsRes.json();
        const fp = (paramsData.params ?? []).find((p: { clave: string; valor: string | null }) => p.clave === 'foto_activa');
        if (fp?.valor) fecha_foto = fp.valor;
      }
    } catch { /* usar fallback */ }

    for (const [key, g] of Object.entries(tipoCobGrupos)) {
      const mmtTip = ORION_TO_MMT[g.tipo];
      if (!mmtTip) {
        nuevosResultados[key] = {
          estado: 'sin_datos', coste_total_grupo: 0, coste_por_vehiculo: null,
          prima_orientativa_mmt_veh: null, prima_orientativa_mmt_grupo: null, prima_mmt_parcial: false,
          prima_tecnica_orion_veh: null, prima_tecnica_orion_grupo: null,
          prima_tecnica_parcial: false, prima_tecnica_sin_datos: [], prima_tecnica_detalle: [],
          prima_orion_grupo: null, prima_orion_veh: null,
          advertencias: [`Tipología '${g.tipo}' sin mapeo MMT definido`],
          grupos: [], tipologia_mmt: '', fecha_foto,
          pendientes: [], sinco_freq_usado: null,
        };
        continue;
      }

      const sincoEntry = sincoPorTipo.find(
        s => s.tipologia.toUpperCase().trim() === g.tipo.toUpperCase().trim()
      );
      const sinco_freq = sincoEntry?.resumen.frecuencia ?? null;
      const sinco_n_exposicion = sincoEntry
        ? (sincoEntry.resumen.vehiculosConExposicion * sincoEntry.resumen.antiguedadMedia) || null
        : null;
      const { garantias, pendientes } = cobToGarantias(g.cob, mmtTip, g.hasLunas, g.hasAsistencia);

      try {
        const res = await fetch('/api/flotas/motor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'diagnostico',
            tipologia_mmt: mmtTip,
            n_vehiculos: g.count,
            sinco_freq,
            sinco_n_exposicion,
            coberturas: garantias,
            fecha_foto,
            prima_solicitada_veh: g.count > 0 && g.sumaSol > 0 ? g.sumaSol / g.count : null,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        nuevosResultados[key] = { ...data, tipologia_mmt: mmtTip, pendientes, sinco_freq_usado: sinco_freq };
      } catch (e) {
        nuevosResultados[key] = {
          estado: 'error', coste_total_grupo: 0, coste_por_vehiculo: null,
          prima_orientativa_mmt_veh: null, prima_orientativa_mmt_grupo: null, prima_mmt_parcial: false,
          prima_tecnica_orion_veh: null, prima_tecnica_orion_grupo: null,
          prima_tecnica_parcial: false, prima_tecnica_sin_datos: [], prima_tecnica_detalle: [],
          prima_orion_grupo: null, prima_orion_veh: null,
          advertencias: [`Error al consultar motor: ${String(e)}`],
          grupos: [], tipologia_mmt: mmtTip, fecha_foto,
          pendientes, sinco_freq_usado: sinco_freq,
        };
      }
    }

    setOrionResults(nuevosResultados);
    setOrionLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipoCobGrupos, sincoPorTipo]);

  const primasSol = useMemo(() =>
    Object.entries(tipoCobGrupos).map(([key, g]) => ({
      key, tipo: g.tipo, cob: g.cobLabel, count: g.count,
      media: g.count > 0 ? g.sumaSol / g.count : 0,
      total: g.sumaSol,
    })),
  [tipoCobGrupos]);

  // ── Anexo de coberturas ───────────────────────────────────────────────────────
  const BASE_GARANTIAS = [
    'Responsabilidad civil obligatoria',
    'Responsabilidad civil voluntaria (hasta 50 millones)',
    'Defensa jurídica y reclamación de daños',
    'Seguro del Conductor (22.550 €)',
  ];

  const cobAnexo = useMemo(() => {
    const TIPOS_REMOLQUE = new Set(['SEMIRREMOLQUE', 'REMOLQUE']);
    const BASE_NO_CONDUCTOR = BASE_GARANTIAS.filter(g => !g.includes('Conductor'));
    type CobEntry = { nonRem: Set<string>; rem: Set<string>; hasLunas: boolean; hasAnimales: boolean; hasSeguroConductor: boolean };
    const makeCobMap = () => new Map<string, CobEntry>();
    const cobMapSin = makeCobMap();
    const cobMapCon = makeCobMap();
    trabajoRows.filter(r => r['matricula']?.trim()).forEach(r => {
      const cob = r['coberturas_solicitadas'] || '';
      if (!cob) return;
      const tipo = normTipo(r['tipo_vehiculo'] || '');
      const isRem = TIPOS_REMOLQUE.has(tipo);
      const hasLunas = !isRem && isYes(r['lunas']);
      const hasAnimales = isYes(r['animales']);
      const hasSeguroConductor = !isRem && isYes(r['seguro_conductor']);
      const cobKey = `${cob}||${hasLunas ? 'lunas' : 'no_lunas'}||${hasAnimales ? 'anim' : 'no_anim'}||${hasSeguroConductor ? 'cond' : 'no_cond'}`;
      const targetMap = isYes(r['asistencia']) ? cobMapCon : cobMapSin;
      if (!targetMap.has(cobKey)) targetMap.set(cobKey, { nonRem: new Set(), rem: new Set(), hasLunas, hasAnimales, hasSeguroConductor });
      const entry = targetMap.get(cobKey)!;
      // propagate extras if any vehicle in this cobKey group has them
      if (hasAnimales) entry.hasAnimales = true;
      if (hasSeguroConductor) entry.hasSeguroConductor = true;
      const tip = tipo.charAt(0).toUpperCase() + tipo.slice(1).toLowerCase();
      if (isRem) entry.rem.add(tip);
      else entry.nonRem.add(tip);
    });
    const result: { titulo: string; tipologias: string[]; garantias: string[] }[] = [];
    const seen = new Set<string>();
    const buildEntries = (cobMap: Map<string, CobEntry>, asistGar: string[]) => {
      cobMap.forEach(({ nonRem, rem, hasLunas, hasAnimales, hasSeguroConductor }, cobKey) => {
        const rawCob = cobKey.split('||')[0];
        const v = rawCob.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        let key = '';
        if (v.includes('todo') || v.includes('franquicia') || v.includes('riesgo')) key = 'tr';
        else if (v.includes('amplia')) key = 'ta';
        else if (v.includes('tercero')) key = 't';
        if (!key) return;
        const lunasGar = hasLunas ? ['Lunas'] : [];
        const animalesGar = hasAnimales ? ['Animales'] : [];
        const conductorGar = hasSeguroConductor ? ['Seguro del Conductor'] : [];
        const keyFull = key + (hasLunas ? '_l' : '') + (asistGar.length ? '_asist' : '') + (hasAnimales ? '_anim' : '') + (hasSeguroConductor ? '_cond' : '');
        if (nonRem.size > 0 && !seen.has(keyFull)) {
          seen.add(keyFull);
          const tipologias = [...nonRem];
          if (key === 't') result.push({ titulo: 'Terceros', tipologias, garantias: [...BASE_GARANTIAS, ...lunasGar, ...animalesGar, ...conductorGar, ...asistGar] });
          else if (key === 'ta') result.push({ titulo: 'Terceros Ampliado', tipologias, garantias: [...BASE_GARANTIAS, 'Lunas', 'Robo', 'Incendio', ...animalesGar, ...conductorGar, ...asistGar] });
          else if (key === 'tr') result.push({ titulo: 'Todo Riesgo con Franquicia 1.800 €', tipologias, garantias: [...BASE_GARANTIAS, 'Lunas', 'Robo', 'Incendio', 'Daños propios con franquicia de 1.800 €', ...animalesGar, ...conductorGar, ...asistGar] });
        }
        if (rem.size > 0 && !seen.has(keyFull + '_rem')) {
          seen.add(keyFull + '_rem');
          const tipologias = [...rem];
          if (key === 't') result.push({ titulo: 'Terceros — Remolques', tipologias, garantias: [...BASE_NO_CONDUCTOR, ...animalesGar, ...asistGar] });
          else if (key === 'ta') result.push({ titulo: 'Terceros Ampliado — Remolques', tipologias, garantias: [...BASE_NO_CONDUCTOR, 'Robo', 'Incendio', ...animalesGar, ...asistGar] });
          else if (key === 'tr') result.push({ titulo: 'Todo Riesgo — Remolques', tipologias, garantias: [...BASE_NO_CONDUCTOR, 'Robo', 'Incendio', 'Daños propios con franquicia de 1.800 €', ...animalesGar, ...asistGar] });
        }
      });
    };
    buildEntries(cobMapSin, []);
    buildEntries(cobMapCon, ['Asistencia en Viaje']);
    // Dedup: mismo título+tipologías puede aparecer de cobMapSin y cobMapCon; conservar el de más garantías
    const dedupMap = new Map<string, typeof result[0]>();
    for (const entry of result) {
      const k = `${entry.titulo}||${[...entry.tipologias].sort().join(',')}`;
      const prev = dedupMap.get(k);
      if (!prev || entry.garantias.length > prev.garantias.length) dedupMap.set(k, entry);
    }
    const titleOrder: Record<string, number> = { 'Terceros': 0, 'Terceros — Remolques': 1, 'Terceros Ampliado': 2, 'Terceros Ampliado — Remolques': 3, 'Todo Riesgo con Franquicia 1.800 €': 4, 'Todo Riesgo — Remolques': 5 };
    return [...dedupMap.values()].sort((a, b) => (titleOrder[a.titulo] ?? 9) - (titleOrder[b.titulo] ?? 9));
  }, [trabajoRows]);

  // ── Defaults tarifa ───────────────────────────────────────────────────────────
  const tarifaDefaults = useMemo(() => {
    if (!tarifaFlota?.length) return {};
    const d: Record<string, number> = {};
    for (const t of tarifaFlota) {
      if (!t.tipo || !t.precio) continue;
      for (const [key, g] of Object.entries(tipoCobGrupos)) {
        if (normTipo(t.tipo) === g.tipo && (!t.cobertura || t.cobertura === g.cob)) d[key] = t.precio;
      }
    }
    return d;
  }, [tarifaFlota, tipoCobGrupos]);

  // ── Defaults desde oferta (oferta_prima_mmt) — prioridad máxima sobre tarifa ──
  const ofertaDefaults = useMemo(() => {
    const d: Record<string, number> = {};
    trabajoRows.filter(r => r['matricula']?.trim()).forEach((r, i) => {
      const tipo = normTipo(r['tipo_vehiculo'] || '');
      const cob  = r['coberturas_solicitadas'] || 'Sin cobertura';
      const key  = `${tipo}||${cob}`;
      if (key in d) return;
      const mmt = coberturas[i]?.primaMmt;
      if (mmt != null && mmt > 0) d[key] = mmt;
    });
    return d;
  }, [trabajoRows, coberturas]);

  // ── Primas MMT ────────────────────────────────────────────────────────────────
  const [mmtInputs, setMmtInputs] = useState<Record<string, number>>(primasMmtValues ?? {});

  useEffect(() => {
    let base: Record<string, number> = {};
    const hasSaved = primasMmtValues && Object.keys(primasMmtValues).length > 0;

    if (hasSaved) {
      base = { ...primasMmtValues };
    } else if (Object.keys(ofertaDefaults).length > 0) {
      base = { ...ofertaDefaults };
    } else if (Object.keys(tarifaDefaults).length > 0) {
      base = { ...tarifaDefaults };
    }

    if (Object.keys(base).length > 0) {
      setMmtInputs(base);
      if (!hasSaved) onPrimasMmtChange?.(base);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primasMmtValues, ofertaDefaults, tarifaDefaults]);

  const handleMmtChange = (key: string, value: string) => {
    const num = parseFloat(value);
    const updated = { ...mmtInputs };
    if (value === '' || isNaN(num)) delete updated[key]; else updated[key] = num;
    setMmtInputs(updated);
    onPrimasMmtChange?.(updated);
  };

  const mmtRows = useMemo(() =>
    Object.entries(tipoCobGrupos).map(([key, g]) => {
      const prima = mmtInputs[key];
      return { key, tipo: g.tipo, cob: g.cobLabel, count: g.count, prima: prima ?? null, total: prima != null ? prima * g.count : null };
    }),
  [tipoCobGrupos, mmtInputs]);

  // ── Totales y diferencia ─────────────────────────────────────────────────────
  const totalSol = primasSol.reduce((a, r) => a + r.total, 0);
  const totalMmt = mmtRows.reduce((a, r) => a + (r.total ?? 0), 0);
  const dif      = totalMmt - totalSol;
  const pctDif   = totalSol > 0 ? (dif / totalSol) * 100 : 0;

  const difColor   = (d: number) => d < 0 ? '#dc2626' : d > 0 ? '#16a34a' : '#6b7280';
  const difBg      = (d: number) => d < 0 ? 'rgba(220,38,38,0.06)' : d > 0 ? 'rgba(22,163,74,0.06)' : 'transparent';

  // ── Recalcular primas MMT desde oferta/tarifa ─────────────────────────────────
  const handleRecalcPrimas = useCallback(() => {
    const newInputs: Record<string, number> = {};
    for (const key of Object.keys(tipoCobGrupos)) {
      if (ofertaDefaults[key] != null) newInputs[key] = ofertaDefaults[key];
      else if (tarifaDefaults[key] != null) newInputs[key] = tarifaDefaults[key];
    }
    setMmtInputs(newInputs);
    onPrimasMmtChange?.(newInputs);
  }, [tipoCobGrupos, ofertaDefaults, tarifaDefaults, onPrimasMmtChange]);

  // ── PDF ───────────────────────────────────────────────────────────────────────
  const handlePdf = useCallback(async () => {
    const logoSrc = await fetchLogoDataUrl();
    const r = resumenAuto ?? resumenManual;
    const sincoValues: [string, string][] | null = (() => {
      if (r) return [
        ['Vehículos', String(r.totalVehiculos)],
        ['Con SINCO',  String(r.vehiculosConSinco)],
        ['Siniestros', String(r.totalSiniestros)],
        ['Antigüedad media', fmt2(r.antiguedadMedia) + ' años'],
        ['Sin./año', fmt2(r.siniestrosPorAnio)],
        ['Frecuencia', fmtFreq(r.frecuencia)],
      ];
      if (sincoGlobal) return [
        ['Siniestros', String(sincoGlobal.siniestrosTotales)],
        ['Años exp.', fmt2(sincoGlobal.anyosExperiencia)],
        ['Frecuencia', fmtFreq(sincoGlobal.frecuencia)],
      ];
      return null;
    })();

    const danosPropiosPdfValues: [string, string][] | null = (() => {
      if (!danosPropios?.mostrarEnInforme) return null;
      const numSin = danosPropios.numSiniestros ?? 0;
      const tVeh = trabajoRows.filter(r => r['matricula']?.trim()).length;
      const antiguedMedia2 = resumenAuto?.antiguedadMedia ?? 0;
      const sinAnio2 = antiguedMedia2 > 0 ? numSin / antiguedMedia2 : 0;
      const frecuencia2 = tVeh > 0 ? sinAnio2 / tVeh : 0;
      return [
        ['Vehículos', String(tVeh)],
        ['Siniestros', String(numSin)],
        ['Antigüedad', fmt2(antiguedMedia2) + ' años'],
        ['Sin./año', fmt2(sinAnio2)],
        ['Frecuencia', fmtFreq(frecuencia2)],
      ];
    })();

    const html = buildPdfHtml({
      header,
      pivot,
      totalVehiculos,
      ambitoLabel: totalVehiculos > 0 ? (ambito.label ?? 'Nacional') : null,
      numTomadores: tomadores.size,
      adrActivo,
      sinco: sincoValues ? { label: 'SINCO', values: sincoValues } : null,
      danosPropiosPdf: danosPropiosPdfValues ? { values: danosPropiosPdfValues } : null,
      primasSol,
      mmtRows,
      corredorLabel,
      cobAnexo,
      sincoPorTipo,
      fechaVctoDisplay,
      logoSrc,
      tomadoresArr: [...tomadores],
      carpetaNombre,
      observacion,
    });

    const w = window.open('', '_blank', 'width=860,height=700');
    if (!w) return;
    w.document.write(html);
    w.document.close();
  }, [header, pivot, totalVehiculos, ambito, adrActivo, primasSol, mmtRows, resumenAuto, resumenManual, sincoGlobal, danosPropios, cobAnexo, sincoPorTipo, fechaVctoDisplay]);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full min-h-0" style={{ background: 'transparent', width: '100%', minWidth: 0, overflow: 'hidden' }}>

      {/* report-actions — cabecera del informe */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--t-line)', flexShrink: 0, gap: 20 }}>
        <div>
          <strong style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-text)', display: 'block', lineHeight: 1.2 }}>
            Informe · {totalVehiculos} vehículos
          </strong>
          <div style={{ fontSize: 12, color: 'var(--t-text-2)', marginTop: 5, lineHeight: 1.4 }}>
            {[
              tomadores.size > 1 ? `${tomadores.size} tomadores` : null,
              totalVehiculos > 0 ? (ambito.label ?? 'Nacional') : null,
              fechaVctoDisplay ? `vencimiento ${fechaVctoDisplay}` : null,
              corredorLabel ? `${corredorLabel} · ${adrActivo ? 'SÍ lleva ADR' : 'NO lleva ADR'}` : (adrActivo ? 'ADR SÍ' : null),
            ].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0 }}>
          <button onClick={handleRecalcPrimas} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 6,
            background: 'transparent', border: '1px solid var(--t-line)',
            color: 'var(--t-text)', fontSize: 12, fontWeight: 650, cursor: 'pointer',
          }}
            title="Recalcula las primas MMT desde los valores de la Oferta y la tarifa"
            onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.13)')}
            onMouseLeave={e => (e.currentTarget.style.filter = '')}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
            Recalcular primas
          </button>
          <button onClick={handlePdf} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 6,
            background: 'var(--t-blue)', border: '1px solid var(--t-blue)',
            color: '#fff', fontSize: 12, fontWeight: 650, cursor: 'pointer',
          }}
            onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.13)')}
            onMouseLeave={e => (e.currentTarget.style.filter = '')}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" />
            </svg>
            Descargar PDF
          </button>
        </div>
      </div>

      {/* Contenido: columna única, scroll vertical */}
      <div className="flex-1 custom-scrollbar" style={{ overflowY: 'auto', overflowX: 'auto', padding: '24px 24px 40px', display: 'flex', flexDirection: 'column', gap: 20, width: '100%', boxSizing: 'border-box' }}>

        {/* ── Summary bar: Ámbito · Vencimiento · SINCO ───────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '160px 180px 1fr', gap: 0, border: '1px solid var(--t-line)', borderRadius: 8, overflow: 'hidden', background: 'var(--t-surface)', alignItems: 'stretch', flexShrink: 0 }}>
          {/* Ámbito */}
          <div style={{ padding: '20px 22px', borderRight: '1px solid var(--t-line)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
            <small style={{ display: 'block', fontSize: 11.4, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--t-text-2)', marginBottom: 10, textTransform: 'uppercase' }}>Ámbito</small>
            <strong style={{ fontSize: 23, lineHeight: 1.1, color: 'var(--t-text)', fontWeight: 700 }}>{totalVehiculos > 0 ? (ambito.label ?? 'Nacional') : '—'}</strong>
          </div>
          {/* Vencimiento */}
          <div style={{ padding: '20px 22px', borderRight: '1px solid var(--t-line)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
            <small style={{ display: 'block', fontSize: 11.4, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--t-text-2)', marginBottom: 10, textTransform: 'uppercase' }}>Vencimiento</small>
            <strong style={{ fontSize: 23, lineHeight: 1.1, color: 'var(--t-text)', fontWeight: 700 }}>{fechaVctoDisplay ?? '—'}</strong>
          </div>
          {/* SINCO global */}
          {(() => {
            const r = resumenAuto ?? resumenManual;
            const items: [string, string][] = r ? [
              ['Vehículos', String(r.totalVehiculos)],
              ['Con SINCO', String(r.vehiculosConSinco)],
              ['Siniestros', String(r.totalSiniestros)],
              ['Antigüedad', fmt2(r.antiguedadMedia) + 'a'],
              ['Sin./año', fmt2(r.siniestrosPorAnio)],
              ['Frecuencia', fmtFreq(r.frecuencia)],
            ] : sincoGlobal ? [
              ['Siniestros', String(sincoGlobal.siniestrosTotales)],
              ['Años exp.', fmt2(sincoGlobal.anyosExperiencia) + 'a'],
              ['Frecuencia', fmtFreq(sincoGlobal.frecuencia)],
            ] : [];
            return (
              <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <small style={{ display: 'block', fontSize: 11.4, letterSpacing: '0.07em', color: 'var(--t-text-2)', fontWeight: 700, marginBottom: 14, textTransform: 'uppercase' }}>
                  Siniestralidad SINCO · Vista Global
                </small>
                {items.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: 14, alignItems: 'stretch' }}>
                    {items.map(([l, v]) => (
                      <div key={l} style={{ textAlign: 'center' }}>
                        <b style={{ display: 'block', fontSize: 22, lineHeight: 1.05, marginBottom: 5, color: 'var(--t-text)', fontWeight: 700 }}>{v}</b>
                        <span style={{ fontSize: 10.6, color: 'var(--t-text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{l}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--t-text-3)' }}>Sin datos SINCO</span>
                )}
              </div>
            );
          })()}
        </div>

        {/* ── Desglose SINCO por tipología ─────────────────────────────── */}
        {sincoPorTipo.length > 1 && (
          <Card title="Siniestralidad por tipología" desc="Histórico SINCO registrado">
            <div style={tableWrapS}>
              <table style={{ minWidth: 400, width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Tipología', 'Veh.', 'Con SINCO', 'Siniestros', 'Antigüedad', 'Sin./año', 'Frecuencia'].map(h =>
                      <th key={h} style={thS}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {sincoPorTipo.map(({ tipologia, resumen: r }) => (
                    <tr key={tipologia}>
                      <td style={{ ...tdS, fontWeight: 710 }}>{tipologia}</td>
                      <td style={{ ...tdS, textAlign: 'center' }}>{r.totalVehiculos}</td>
                      <td style={{ ...tdS, textAlign: 'center' }}>{r.vehiculosConSinco}</td>
                      <td style={{ ...tdS, textAlign: 'center' }}>{r.totalSiniestros}</td>
                      <td style={{ ...tdS, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt2(r.antiguedadMedia)} a</td>
                      <td style={{ ...tdS, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt2(r.siniestrosPorAnio)}</td>
                      <td style={{ ...tdS, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtFreq(r.frecuencia)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* ── Siniestralidad Daños Propios ──────────────────────────────── */}
        {danosPropiosItems && (
          <div style={{ borderTop: '1px solid var(--t-line)', paddingTop: 14, flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14, gap: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 720, letterSpacing: '-0.025em', color: 'var(--t-text)' }}>Siniestralidad Daños Propios</h2>
              <span style={{ fontSize: 12.6, color: 'var(--t-text-2)' }}>Resumen global</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${danosPropiosItems.length}, 1fr)`, border: '1px solid var(--t-line)', borderRadius: 7, overflow: 'hidden', background: 'var(--t-surface)' }}>
              {danosPropiosItems.map(([l, v], idx) => (
                <div key={l} style={{ padding: '18px 16px', borderRight: idx < danosPropiosItems.length - 1 ? '1px solid var(--t-line)' : 'none', textAlign: 'center' }}>
                  <div style={{ fontSize: 10.6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--t-text-3)', marginBottom: 6 }}>{l}</div>
                  <div style={{ fontSize: 22, fontWeight: 720, color: 'var(--t-text)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.025em' }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Composición de flota ─────────────────────────────────────────── */}
        <Card title="Composición de la flota" desc="Distribución por modalidad">
          <div style={tableWrapS}>
            <table style={{ minWidth: 300, width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thS}>Tipo de vehículo</th>
                  {pivot.cobs.map(c => <th key={c} style={{ ...thS, textAlign: 'center' }}>{c || '—'}</th>)}
                  <th style={{ ...thS, textAlign: 'center' }}>Total informado</th>
                </tr>
              </thead>
              <tbody>
                {pivot.tipos.map(tipo => {
                  const total = pivot.cobs.reduce((a, c) => a + (pivot.counts[tipo]?.[c] ?? 0), 0);
                  return (
                    <tr key={tipo}>
                      <td style={{ ...tdS, fontWeight: 710 }}>{tipo}</td>
                      {pivot.cobs.map(c => <td key={c} style={{ ...tdS, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{pivot.counts[tipo]?.[c] ?? 0}</td>)}
                      <td style={{ ...tdS, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{total}</td>
                    </tr>
                  );
                })}
                <tr style={{ background: 'var(--t-head)', fontWeight: 760 }}>
                  <td style={{ ...tdS, borderTop: '2px solid var(--t-line)' }}>Total declarado por expediente</td>
                  {pivot.cobs.map(c => {
                    const t = pivot.tipos.reduce((a, ti) => a + (pivot.counts[ti]?.[c] ?? 0), 0);
                    return <td key={c} style={{ ...tdS, textAlign: 'center', fontVariantNumeric: 'tabular-nums', borderTop: '2px solid var(--t-line)' }}>{t}</td>;
                  })}
                  <td style={{ ...tdS, textAlign: 'center', fontVariantNumeric: 'tabular-nums', borderTop: '2px solid var(--t-line)' }}>{totalVehiculos}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>

        {/* ── Comparativa de primas ────────────────────────────────────────── */}
        <Card title="Comparativa de primas" desc="Importes anuales · valores por vehículo y total">
          <div style={tableWrapS}>
            <table style={{ minWidth: 560, width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...thS, width: '28%' }}>Tipología y coberturas</th>
                  <th style={{ ...thS, textAlign: 'center' }}>Veh.</th>
                  <th style={{ ...thS, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>Sol./veh.</th>
                  <th style={{ ...thS, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>Prima solicitada</th>
                  <th style={{ ...thS, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>MMT/veh.</th>
                  <th style={{ ...thS, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>Prima MMT</th>
                  <th style={{ ...thS, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {primasSol.length === 0
                  ? <tr><td colSpan={7} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--t-text-3)', fontSize: 13.8 }}>Sin datos</td></tr>
                  : primasSol.map((r, i) => {
                      const mmt = mmtRows[i];
                      const difRow = (mmt?.total ?? 0) - r.total;
                      const hasDif = mmt?.total != null;
                      return (
                        <tr key={r.key}>
                          <td style={tdS}>
                            <span style={{ fontWeight: 710 }}>{r.tipo}</span>
                            <div style={{ fontSize: 12, color: 'var(--t-text-2)', marginTop: 4, lineHeight: 1.35 }}>{r.cob}</div>
                          </td>
                          <td style={{ ...tdS, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{r.count}</td>
                          <td style={{ ...tdS, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{r.media ? fmtEur2(r.media) : '—'}</td>
                          <td style={{ ...tdS, textAlign: 'center', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{r.total ? fmtEur(r.total) : '—'}</td>
                          <td style={{ ...tdS, textAlign: 'right' }}>
                            <input
                              inputMode="decimal"
                              value={mmt?.prima != null ? mmt.prima : ''}
                              onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d*$/.test(v)) handleMmtChange(r.key, v); }}
                              placeholder="—"
                              style={{
                                minWidth: 96, textAlign: 'center', fontVariantNumeric: 'tabular-nums', fontSize: 13,
                                background: 'var(--t-surface)', border: '1px solid var(--t-line)',
                                outline: 'none', padding: '9px 10px', borderRadius: 5, color: 'var(--t-text)',
                              }}
                              onFocus={e => { e.currentTarget.style.borderColor = 'var(--t-blue)'; }}
                              onBlur={e => { e.currentTarget.style.borderColor = 'var(--t-line)'; }}
                            />
                          </td>
                          <td style={{ ...tdS, textAlign: 'center', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{mmt?.total != null ? fmtEur(mmt.total) : '—'}</td>
                          <td style={{ ...tdS, textAlign: 'center', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: hasDif ? difColor(difRow) : 'var(--t-text-3)' }}>
                            {hasDif ? (difRow >= 0 ? '+' : '') + fmtEur(difRow) : '—'}
                          </td>
                        </tr>
                      );
                    })
                }
                {primasSol.length > 0 && (
                  <tr style={{ background: 'var(--t-head)', fontWeight: 760 }}>
                    <td style={{ ...tdS, borderTop: '2px solid var(--t-line)' }}>TOTAL</td>
                    <td style={{ ...tdS, textAlign: 'center', fontVariantNumeric: 'tabular-nums', borderTop: '2px solid var(--t-line)' }}>{primasSol.reduce((a, r) => a + r.count, 0)}</td>
                    <td style={{ ...tdS, borderTop: '2px solid var(--t-line)' }}>—</td>
                    <td style={{ ...tdS, textAlign: 'right', fontVariantNumeric: 'tabular-nums', borderTop: '2px solid var(--t-line)' }}>{totalSol ? fmtEur(totalSol) : '—'}</td>
                    <td style={{ ...tdS, borderTop: '2px solid var(--t-line)' }}>—</td>
                    <td style={{ ...tdS, textAlign: 'right', fontVariantNumeric: 'tabular-nums', borderTop: '2px solid var(--t-line)' }}>{mmtRows.some(r => r.total != null) ? fmtEur(totalMmt) : '—'}</td>
                    <td style={{ ...tdS, textAlign: 'right', fontVariantNumeric: 'tabular-nums', borderTop: '2px solid var(--t-line)', color: difColor(dif) }}>{totalMmt ? (dif >= 0 ? '+' : '') + fmtEur(dif) : '—'}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {totalSol > 0 && totalMmt > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderTop: '1px solid var(--t-line)', borderBottom: '1px solid var(--t-line)', marginTop: 19 }}>
              {[
                { label: 'Prima solicitada total', value: fmtEur(totalSol), color: 'var(--t-text)' },
                { label: 'Prima de referencia MMT', value: fmtEur(totalMmt), color: 'var(--t-text)' },
                { label: 'Diferencia', value: (dif >= 0 ? '+' : '') + fmtEur(dif), color: dif > 0 ? '#54bc8d' : dif < 0 ? '#dc2626' : 'var(--t-text)' },
                { label: 'Variación', value: (pctDif >= 0 ? '+' : '') + pctDif.toFixed(1) + ' %', color: dif > 0 ? '#54bc8d' : dif < 0 ? '#dc2626' : 'var(--t-text)' },
              ].map(({ label, value, color }, idx) => (
                <div key={label} style={{ padding: '22px 18px', borderRight: idx < 3 ? '1px solid var(--t-line)' : 'none', textAlign: 'center' }}>
                  <label style={{ display: 'block', fontSize: 11.4, color: 'var(--t-text-2)', fontWeight: 650, marginBottom: 10 }}>{label}</label>
                  <strong style={{ display: 'block', fontSize: 30, letterSpacing: '-0.04em', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color }}>{value}</strong>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ── Coste estimado ORION ────────────────────────────────────────── */}
        {Object.keys(orionResults).length > 0 && (() => {
          const fotoUsada = Object.values(orionResults).find(r => r?.fecha_foto)?.fecha_foto ?? '—';
          return (
          <Card title="Análisis ORION — Coste y Primas">
            <div style={tableWrapS}>
              <table style={{ minWidth: 560, width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--t-line-soft)' }}>
                    {['Tipo vehículo', 'Coberturas', 'Nº', 'P.Sol./veh', 'P.MMT/veh', 'Coste ORION/veh', 'P.ORION/veh', 'Estado'].map(h =>
                      <th key={h} style={{ ...thS, color: 'var(--t-text-3)' }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(tipoCobGrupos).map(([key, g]) => {
                    const r = orionResults[key];
                    if (!r) return null;

                    const estadoColor: Record<string, string> = {
                      calculado: '#16a34a', revisar: '#d97706', no_calculable: '#9ca3af',
                      sin_datos: '#9ca3af', error: '#dc2626',
                    };
                    const estadoLabel: Record<string, string> = {
                      calculado: 'Calculado', revisar: 'Revisar', no_calculable: 'Sin datos',
                      sin_datos: 'Sin datos', error: 'Error',
                    };

                    const expanded = orionExpanded[key] ?? false;
                    const primaSolVeh = g.count > 0 && g.sumaSol > 0 ? g.sumaSol / g.count : null;
                    const primaMmtVeh = mmtInputs[key] ?? null;

                    return (
                      <React.Fragment key={key}>
                        <tr style={{ borderBottom: expanded ? 'none' : '1px solid var(--t-line)' }}>
                          <td style={{ ...tdS, fontWeight: 600 }}>{g.tipo}</td>
                          <td style={{ ...tdS, fontSize: 11 }}>{g.cob}</td>
                          <td style={{ ...tdS, textAlign: 'center' }}>{g.count}</td>
                          <td style={{ ...tdS, textAlign: 'right', fontFamily: 'monospace', color: 'var(--t-text-3)' }}>
                            {primaSolVeh != null ? fmtEur2(primaSolVeh) : '—'}
                          </td>
                          <td style={{ ...tdS, textAlign: 'right', fontFamily: 'monospace', color: 'var(--t-blue)' }}>
                            {primaMmtVeh != null ? fmtEur2(primaMmtVeh) : '—'}
                          </td>
                          <td style={{ ...tdS, textAlign: 'right', fontFamily: 'monospace' }}>
                            {r.coste_por_vehiculo != null ? fmtEur2(r.coste_por_vehiculo) : '—'}
                          </td>
                          <td style={{ ...tdS, textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: 'var(--t-text)' }}>
                            {r.prima_tecnica_orion_veh != null ? fmtEur2(r.prima_tecnica_orion_veh) : '—'}
                            {r.prima_tecnica_parcial && r.prima_tecnica_orion_veh != null && <span style={{ fontSize: 9, color: '#d97706' }}> *</span>}
                          </td>
                          <td style={{ ...tdS }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: estadoColor[r.estado] ?? '#9ca3af' }}>
                                {estadoLabel[r.estado] ?? r.estado}
                              </span>
                              {(r.advertencias.length > 0 || r.grupos.length > 0) && (
                                <button
                                  onClick={() => setOrionExpanded(prev => ({ ...prev, [key]: !prev[key] }))}
                                  style={{
                                    fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 4,
                                    background: 'var(--t-line-soft)', border: '1px solid var(--t-line)',
                                    color: 'var(--t-text-2)', cursor: 'pointer', textTransform: 'uppercase',
                                  }}>
                                  {expanded ? 'Cerrar' : 'Detalle'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {expanded && (
                          <tr style={{ borderBottom: '1px solid var(--t-line)' }}>
                            <td colSpan={7} style={{ padding: '8px 14px 14px', background: 'var(--t-line-soft)' }}>
                              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t-text-2)', marginBottom: 8 }}>
                                Análisis detallado ORION
                              </div>
                              {/* Comparativa cuatro primas: Sol / MMT oferta / Coste A / Prima MMT media B / Prima ORION C */}
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 6, marginBottom: 10 }}>
                                {[
                                  { label: 'Prima solicitada', val: primaSolVeh, col: '#6b7280', bg: '#f9fafb', note: 'Prima corredor' },
                                  { label: 'Prima ofertada MMT', val: primaMmtVeh, col: '#1d4ed8', bg: '#eff6ff', note: 'Oferta específica flota' },
                                ].map(({ label, val, col, bg, note }) => (
                                  <div key={label} style={{ background: bg, border: `1px solid ${col}33`, borderRadius: 6, padding: '8px 12px' }}>
                                    <div style={{ fontSize: 9, fontWeight: 800, color: col, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                                    <div style={{ fontSize: 15, fontWeight: 900, fontFamily: 'monospace', color: col }}>
                                      {val != null ? fmtEur2(val) : '—'}
                                    </div>
                                    <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>{note}</div>
                                  </div>
                                ))}
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginBottom: 10 }}>
                                <div style={{ background: 'rgba(81,184,138,0.08)', border: '1px solid rgba(81,184,138,0.3)', borderRadius: 6, padding: '8px 12px' }}>
                                  <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--t-green)', textTransform: 'uppercase', marginBottom: 4 }}>A — Coste técnico</div>
                                  <div style={{ fontSize: 15, fontWeight: 900, fontFamily: 'monospace', color: 'var(--t-green)' }}>
                                    {r.coste_por_vehiculo != null ? fmtEur2(r.coste_por_vehiculo) : '—'}
                                  </div>
                                  <div style={{ fontSize: 9, color: 'var(--t-text-3)', marginTop: 2 }}>Siniestralidad histórica MMT</div>
                                </div>
                                <div style={{ background: 'rgba(233,165,75,0.08)', border: '1px solid rgba(233,165,75,0.3)', borderRadius: 6, padding: '8px 12px' }}>
                                  <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--t-amber)', textTransform: 'uppercase', marginBottom: 4 }}>
                                    B — Prima media MMT{r.prima_mmt_parcial ? ' *' : ''}
                                  </div>
                                  <div style={{ fontSize: 15, fontWeight: 900, fontFamily: 'monospace', color: 'var(--t-amber)' }}>
                                    {r.prima_orientativa_mmt_veh != null ? fmtEur2(r.prima_orientativa_mmt_veh) : '—'}
                                  </div>
                                  <div style={{ fontSize: 9, color: 'var(--t-text-3)', marginTop: 2 }}>
                                    {r.prima_mmt_parcial ? '* incompleta — hay coberturas sin dato' : 'Media mercado MMT por cobertura'}
                                  </div>
                                </div>
                                <div style={{ background: 'var(--t-line-soft)', border: '1px solid var(--t-line)', borderRadius: 6, padding: '8px 12px' }}>
                                  <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--t-blue)', textTransform: 'uppercase', marginBottom: 4 }}>
                                    Prima técnica ORION{r.prima_tecnica_parcial ? ' *' : ''}
                                  </div>
                                  <div style={{ fontSize: 15, fontWeight: 900, fontFamily: 'monospace', color: 'var(--t-blue)' }}>
                                    {r.prima_tecnica_orion_veh != null ? fmtEur2(r.prima_tecnica_orion_veh) : '—'}
                                  </div>
                                  <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>
                                    {r.prima_tecnica_orion_veh != null
                                      ? (r.sinco_freq_usado != null
                                          ? `RC ajustado SINCO (freq. ${fmtFreq(r.sinco_freq_usado)})`
                                          : 'Referencia MMT — sin SINCO válido')
                                      : '—'}
                                    {r.prima_tecnica_parcial ? ' · incompleta' : ''}
                                  </div>
                                </div>
                              </div>
                              {/* Interpretación técnica basada en números reales */}
                              {(() => {
                                const costVeh = r.coste_por_vehiculo;
                                const hasPending = r.pendientes && r.pendientes.length > 0;
                                if (costVeh == null || costVeh === 0) return null;
                                const lines: string[] = [];
                                // Fuente del cálculo RC
                                const rcGrp = r.grupos.find(gr => gr.garantia === 'RC');
                                const rcDetalle = rcGrp?.detalle as Record<string, unknown> | undefined;
                                const rcTipo = rcDetalle?.tipo as string | undefined;
                                const lrRco1  = rcDetalle?.lr_rco1  as number | null | undefined;
                                const mmtFreq = rcDetalle?.mmt_freq_rco1 as number | null | undefined;
                                if (rcTipo === 'rc_con_sinco') {
                                  const ratio = rcDetalle!.ratio_sinco as number;
                                  lines.push(`RC ajustado por SINCO (ratio ${ratio?.toFixed(3) ?? '—'} vs media MMT). Las estadísticas del cliente inciden directamente en el coste.`);
                                } else {
                                  const freqStr = mmtFreq != null ? ` (freq. MMT: ${(mmtFreq * 100).toFixed(2)}%/veh·año)` : '';
                                  lines.push(`RC calculado sobre diagnóstico base MMT${freqStr}. Sin frecuencia SINCO con exposición válida para este grupo.`);
                                }
                                // Alerta LR excepcional en la foto activa
                                if (lrRco1 != null && lrRco1 > 1.5) {
                                  lines.push(`Alerta: la fotografía ${r.fecha_foto} tiene ratio de pérdida RC = ${(lrRco1 * 100).toFixed(0)}% (coste > prima). El período captura siniestros de coste excepcional. Las fotos anteriores pueden mostrar condiciones más moderadas.`);
                                }
                                // Option B: prima media MMT vs coste técnico
                                const pmMmt = r.prima_orientativa_mmt_veh;
                                if (pmMmt != null && costVeh != null) {
                                  if (costVeh > pmMmt * 1.5) {
                                    lines.push(`La prima media que cobra MMT por estas coberturas es ${fmtEur2(pmMmt)}/veh (B). El coste técnico ORION (${fmtEur2(costVeh)}) supera ese nivel porque la fotografía activa captura un período con siniestralidad anormalmente alta. Las fotos anteriores muestran costes mucho menores.`);
                                  } else if (pmMmt > costVeh * 1.3) {
                                    lines.push(`La prima media que cobra MMT por estas coberturas es ${fmtEur2(pmMmt)}/veh (B), ${((pmMmt/costVeh-1)*100).toFixed(0)}% por encima del coste técnico ORION (${fmtEur2(costVeh)}). La diferencia representa la carga comercial de MMT (gastos, comisión, margen).`);
                                  } else {
                                    lines.push(`Prima media MMT: ${fmtEur2(pmMmt)}/veh (B). Coste técnico ORION: ${fmtEur2(costVeh)}/veh (A). Ambos están en rango similar para la foto activa.`);
                                  }
                                }
                                // Relación coste/prima solicitada
                                if (primaSolVeh != null && primaSolVeh > 0) {
                                  const pct = (costVeh / primaSolVeh) * 100;
                                  if (pct >= 80) {
                                    lines.push(`El coste técnico estimado (${fmtEur2(costVeh)}) representa el ${pct.toFixed(0)}% de la prima solicitada (${fmtEur2(primaSolVeh)}). Sin gastos ni margen incorporados, la prima solicitada puede ser insuficiente${hasPending ? ' — y el cálculo excluye garantías pendientes' : ''}.`);
                                  } else if (pct >= 40) {
                                    lines.push(`El coste técnico estimado (${fmtEur2(costVeh)}) es el ${pct.toFixed(0)}% de la prima solicitada (${fmtEur2(primaSolVeh)}). El margen aparente no incluye gastos de estructura ni prima ORION final${hasPending ? ', y hay garantías pendientes de calcular' : ''}.`);
                                  } else {
                                    lines.push(`El coste técnico estimado (${fmtEur2(costVeh)}) es el ${pct.toFixed(0)}% de la prima solicitada (${fmtEur2(primaSolVeh)})${hasPending ? '. Hay garantías contratadas sin estadísticas MMT que no están incluidas en el coste' : ''}.`);
                                  }
                                }
                                if (!lines.length) return null;
                                return (
                                  <div style={{ background: 'var(--t-line-soft)', border: '1px solid var(--t-line)', borderRadius: 6, padding: '6px 10px', marginBottom: 8 }}>
                                    <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--t-text-2)', textTransform: 'uppercase', marginBottom: 4 }}>Interpretación técnica</div>
                                    {lines.map((l, i) => <div key={i} style={{ fontSize: 11, color: 'var(--t-text)', marginBottom: 2 }}>• {l}</div>)}
                                  </div>
                                );
                              })()}
                              {/* Garantías pendientes sin datos calculables en mmt_stats */}
                              {r.pendientes && r.pendientes.length > 0 && (
                                <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 6, padding: '6px 10px', marginBottom: 8 }}>
                                  <div style={{ fontSize: 9, fontWeight: 800, color: '#b91c1c', textTransform: 'uppercase', marginBottom: 4 }}>Garantías contratadas sin datos en mmt_stats</div>
                                  {r.pendientes.map((p, i) => (
                                    <div key={i} style={{ fontSize: 11, color: '#7f1d1d' }}>• {p} — sin datos para calcular coste, no incluido en el total</div>
                                  ))}
                                </div>
                              )}
                              {/* Desglose parámetros */}
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 6, marginBottom: 8 }}>
                                {[
                                  ['Tipología MMT', r.tipologia_mmt || '—'],
                                  ['Foto estadística', r.fecha_foto || '—'],
                                  ['Vehículos grupo', String(g.count)],
                                  ['Frec. SINCO', fmtFreq(r.sinco_freq_usado)],
                                ].map(([l, v]) => (
                                  <div key={l} style={{ background: 'var(--t-bg)', border: '1px solid var(--t-line)', borderRadius: 6, padding: '6px 10px' }}>
                                    <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--t-text-3)', textTransform: 'uppercase' }}>{l}</div>
                                    <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: 'var(--t-text)' }}>{v}</div>
                                  </div>
                                ))}
                              </div>
                              {/* Tabla desglose por garantía */}
                              {r.grupos.length > 0 && (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 8 }}>
                                  <thead>
                                    <tr style={{ background: 'var(--t-line-soft)' }}>
                                      <th style={{ ...thS, fontSize: 10 }}>Garantía</th>
                                      <th style={{ ...thS, fontSize: 10, textAlign: 'right' }}>Coste (A)/veh.</th>
                                      <th style={{ ...thS, fontSize: 10, textAlign: 'right', color: 'var(--t-amber)' }}>Prima MMT (B)/veh.</th>
                                      <th style={{ ...thS, fontSize: 10, textAlign: 'right' }}>Total coste grupo</th>
                                      <th style={{ ...thS, fontSize: 10 }}>Fuente</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {r.grupos.map(gr => {
                                      const d = gr.detalle as Record<string, unknown>;
                                      const cosVeh = (d.coste_puro_veh ?? d.coste_rc_por_veh ?? d.coste_puro_rc_mmt_veh) as number | null;
                                      const cosGrp = (d.coste_grupo ?? d.escenario_alto_grupo ?? d.coste_rc_grupo_base) as number | null;
                                      const primaMmtGar = d.prima_mmt_veh as number | null | undefined;
                                      const tipo = String(d.tipo ?? '—');
                                      const fuenteLabel: Record<string, string> = {
                                        rc_con_sinco:       'RC + SINCO',
                                        rc_sin_sinco:       'RC base MMT',
                                        coste_historico_mmt:'Histórico MMT',
                                        cero_siniestros:    'MMT histórico = 0',
                                        no_calculable:      'Sin datos',
                                      };
                                      return (
                                        <tr key={gr.garantia} style={{ borderBottom: '1px solid var(--t-line)' }}>
                                          <td style={{ ...tdS, fontWeight: 700 }}>
                                            {COB_NOMBRES[gr.garantia] ?? gr.garantia}
                                            <span style={{ marginLeft: 4, fontSize: 9, color: '#9ca3af', fontWeight: 400 }}>{gr.garantia}</span>
                                          </td>
                                          <td style={{ ...tdS, textAlign: 'right', fontFamily: 'monospace' }}>
                                            {cosVeh != null ? fmtEur2(cosVeh) : '—'}
                                          </td>
                                          <td style={{ ...tdS, textAlign: 'right', fontFamily: 'monospace', color: 'var(--t-amber)' }}>
                                            {primaMmtGar != null ? fmtEur2(primaMmtGar) : '—'}
                                          </td>
                                          <td style={{ ...tdS, textAlign: 'right', fontFamily: 'monospace' }}>
                                            {cosGrp != null ? fmtEur(cosGrp) : '—'}
                                          </td>
                                          <td style={{ ...tdS, fontSize: 10, color: '#6b7280' }}>{fuenteLabel[tipo] ?? tipo}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              )}
                              {/* Historial RC multi-foto (contexto siniestralidad) */}
                              {(() => {
                                const rcGrp = r.grupos.find(gr => gr.garantia === 'RC');
                                const hist = (rcGrp?.detalle as Record<string,unknown>)?.rc_historial_fotos as {fecha_foto:string;coste_rc_veh:number;prima_mmt_rc_veh:number;lr_rco1:number|null;stros:number}[] | undefined;
                                if (!hist || hist.length <= 1) return null;
                                return (
                                  <div style={{ marginBottom: 8 }}>
                                    <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--t-text-2)', textTransform: 'uppercase', marginBottom: 4 }}>Historial RC por fotografía estadística</div>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                                      <thead>
                                        <tr style={{ background: 'var(--t-line-soft)' }}>
                                          {['Foto', 'Coste RC/veh', 'Prima MMT RC/veh', 'LR%', 'Sinistros'].map(h =>
                                            <th key={h} style={{ ...thS, fontSize: 9, textAlign: h === 'Foto' ? 'left' : 'right' }}>{h}</th>
                                          )}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {hist.map(h => (
                                          <tr key={h.fecha_foto} style={{
                                            borderBottom: '1px solid #ede9fe',
                                            background: h.fecha_foto === r.fecha_foto ? 'var(--t-line-soft)' : undefined,
                                            fontWeight: h.fecha_foto === r.fecha_foto ? 700 : undefined,
                                          }}>
                                            <td style={tdS}>{h.fecha_foto}{h.fecha_foto === r.fecha_foto ? ' ◄' : ''}</td>
                                            <td style={{ ...tdS, textAlign: 'right', fontFamily: 'monospace' }}>{fmtEur2(h.coste_rc_veh)}</td>
                                            <td style={{ ...tdS, textAlign: 'right', fontFamily: 'monospace', color: '#854d0e' }}>{fmtEur2(h.prima_mmt_rc_veh)}</td>
                                            <td style={{ ...tdS, textAlign: 'right', fontFamily: 'monospace', color: h.lr_rco1 != null && h.lr_rco1 > 1.5 ? '#dc2626' : undefined }}>
                                              {h.lr_rco1 != null ? `${(h.lr_rco1*100).toFixed(0)}%` : '—'}
                                            </td>
                                            <td style={{ ...tdS, textAlign: 'right' }}>{h.stros}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                );
                              })()}
                              {/* Desglose Prima técnica ORION */}
                              {r.prima_tecnica_detalle && r.prima_tecnica_detalle.length > 0 && (
                                <div style={{ marginBottom: 8 }}>
                                  <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--t-text-2)', textTransform: 'uppercase', marginBottom: 4 }}>
                                    Desglose Prima técnica ORION
                                    {r.prima_tecnica_parcial && <span style={{ color: '#d97706' }}> — incompleta</span>}
                                  </div>
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                                    <thead>
                                      <tr style={{ background: 'var(--t-line-soft)' }}>
                                        {['Garantía', 'Prima técnica/veh', 'Ratio SINCO', 'Método'].map(h =>
                                          <th key={h} style={{ ...thS, fontSize: 9, textAlign: h === 'Garantía' || h === 'Método' ? 'left' : 'right' }}>{h}</th>)}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {r.prima_tecnica_detalle.map(dt => (
                                        <tr key={dt.garantia} style={{ borderBottom: '1px solid var(--t-line)' }}>
                                          <td style={{ ...tdS, fontWeight: 700 }}>
                                            {COB_NOMBRES[dt.garantia] ?? dt.garantia}
                                            <span style={{ marginLeft: 4, fontSize: 9, color: '#9ca3af', fontWeight: 400 }}>{dt.garantia}</span>
                                          </td>
                                          <td style={{ ...tdS, textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: 'var(--t-blue)' }}>{fmtEur2(dt.prima_tecnica_veh)}</td>
                                          <td style={{ ...tdS, textAlign: 'right', fontFamily: 'monospace' }}>
                                            {dt.ratio_sinco != null ? dt.ratio_sinco.toFixed(3) : '—'}
                                          </td>
                                          <td style={{ ...tdS, fontSize: 9, color: '#6b7280', maxWidth: 220 }}>
                                            {dt.tipo === 'rc_ajustado_sinco' ? 'RC ajustado por freq. SINCO' :
                                             dt.tipo === 'rc_referencia_mmt' ? 'RC — referencia MMT sin SINCO' :
                                             'Prima media MMT (sin ajuste)'}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                  {r.prima_tecnica_sin_datos.length > 0 && (
                                    <div style={{ marginTop: 4 }}>
                                      {r.prima_tecnica_sin_datos.map((s, i) => (
                                        <div key={i} style={{ fontSize: 10, color: '#d97706' }}>• {s} — no incluido en el total</div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                              {/* Advertencias del motor */}
                              {r.advertencias.length > 0 && (
                                <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 6, padding: '6px 10px' }}>
                                  <div style={{ fontSize: 9, fontWeight: 800, color: '#92400e', textTransform: 'uppercase', marginBottom: 4 }}>Advertencias del motor</div>
                                  {r.advertencias.map((a, i) => (
                                    <div key={i} style={{ fontSize: 11, color: '#78350f' }}>• {a}</div>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  <tr style={{ borderTop: '2px solid var(--t-line)', background: 'var(--t-line-soft)', fontWeight: 900 }}>
                    <td colSpan={2} style={tdS}>Total coste estimado ORION</td>
                    <td style={{ ...tdS, textAlign: 'center' }}>{Object.values(tipoCobGrupos).reduce((a, g) => a + g.count, 0)}</td>
                    <td style={{ ...tdS, textAlign: 'right', fontFamily: 'monospace', color: 'var(--t-text-3)' }}>
                      {fmtEur(primasSol.reduce((a, p) => a + p.total, 0))}
                    </td>
                    <td style={{ ...tdS, textAlign: 'right', fontFamily: 'monospace', color: 'var(--t-blue)' }}>
                      {fmtEur(mmtRows.reduce((a, r) => a + (r.total ?? 0), 0))}
                    </td>
                    <td style={{ ...tdS, textAlign: 'right', fontFamily: 'monospace' }}>
                      {fmtEur(Object.values(orionResults).reduce((a, r) => a + (r?.coste_total_grupo ?? 0), 0))}
                    </td>
                    <td style={{ ...tdS, textAlign: 'right', fontFamily: 'monospace', color: 'var(--t-text)' }}>
                      {(() => {
                        const tot = Object.values(orionResults).reduce((a, r) => a + (r?.prima_tecnica_orion_grupo ?? 0), 0);
                        return tot > 0 ? fmtEur(tot) : '—';
                      })()}
                    </td>
                    <td style={tdS} />
                  </tr>
                </tbody>
              </table>
              <div style={{ marginTop: 8, fontSize: 10, color: 'var(--t-text-3)', fontStyle: 'italic' }}>
                Prima técnica ORION = prima media MMT ajustada por frecuencia SINCO en RC cuando hay exposición válida.
                No incluye gastos ni margen. Cuando no hay SINCO, se muestra la referencia histórica MMT sin ajuste individual.
                Estadísticas MMT foto {fotoUsada}. El recálculo no modifica la prima solicitada ni la tarifa MMT.
              </div>
            </div>
          </Card>
          );
        })()}

      </div>
    </div>
  );
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────

function Card({ title, desc, children, style }: { title: string; desc?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ borderTop: '1px solid var(--t-line)', paddingTop: 14, width: '100%', minWidth: 0, boxSizing: 'border-box', flexShrink: 0, ...style }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14, gap: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 720, letterSpacing: '-0.025em', color: 'var(--t-text)' }}>{title}</h2>
        {desc && <span style={{ fontSize: 12.6, color: 'var(--t-text-2)', flexShrink: 0 }}>{desc}</span>}
      </div>
      {children}
    </div>
  );
}

const tableWrapS: React.CSSProperties = { overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%', boxSizing: 'border-box', border: '1px solid var(--t-line)', borderRadius: 7, background: 'var(--t-surface)' };
const thS: React.CSSProperties = { padding: '13px 16px', textAlign: 'left', fontSize: 11.6, fontWeight: 680, borderBottom: '1px solid var(--t-line)', color: 'var(--t-text-2)', letterSpacing: '0.02em', background: 'var(--t-head)', whiteSpace: 'nowrap' };
const tdS: React.CSSProperties = { padding: '15px 16px', fontSize: 13.8, color: 'var(--t-text)', borderTop: '1px solid var(--t-line)', verticalAlign: 'middle' };
