"use client";

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { consolidarSinco } from '@/core/flotas';
import type { FlotaHeader, CoberturaRow } from './types';

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
  trabajoRows: Record<string, string>[];
  coberturas: CoberturaRow[];
  sincoResultRows: Record<string, string>[];
  sincoManual: SincoManualEntry[];
  sincoGlobal: SincoGlobal | null;
  primasMmtValues?: Record<string, number>;
  onPrimasMmtChange?: (primas: Record<string, number>) => void;
  tarifaFlota?: TarifaEntry[];
  corredorLabel?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const normTipo = (t: string) => {
  const u = t.toUpperCase().trim();
  return u === 'DERIVADO DE TURISMO' ? 'TURISMO' : u || 'SIN TIPO';
};

const fmtEur = (n: number) =>
  n.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';

const fmtEur2 = (n: number) =>
  n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

const fmt2 = (n: number) => (isNaN(n) || !isFinite(n) ? '—' : n.toFixed(2));

// frecuencia es un ratio (0.14 = 14%), se muestra multiplicado ×100
const fmtFreq = (n: number) =>
  isNaN(n) || !isFinite(n) ? '—' : `${(n * 100).toFixed(1)}%`;

const today = () => new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

// ─── PDF Generator ────────────────────────────────────────────────────────────

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
  sinco: { label: string; values: [string, string][] } | null;
  primasSol: { tipo: string; cob: string; count: number; media: number; total: number }[];
  mmtRows: { tipo: string; cob: string; count: number; prima: number | null; total: number | null }[];
  corredorLabel?: string;
  cobAnexo: { titulo: string; garantias: string[] }[];
}): string {
  const { header, pivot, totalVehiculos, ambitoLabel, sinco, primasSol, mmtRows, corredorLabel, cobAnexo } = data;
  const totalSol = primasSol.reduce((a, r) => a + r.total, 0);
  const totalMmt = mmtRows.reduce((a, r) => a + (r.total ?? 0), 0);
  const dif = totalMmt - totalSol;

  const pivotRows = pivot.tipos.map(tipo => {
    const total = pivot.cobs.reduce((a, c) => a + (pivot.counts[tipo]?.[c] ?? 0), 0);
    return `<tr>
      <td>${tipo}</td>
      ${pivot.cobs.map(c => `<td class="center">${pivot.counts[tipo]?.[c] ?? 0}</td>`).join('')}
      <td class="center bold">${total}</td>
    </tr>`;
  }).join('');

  const pivotTotals = pivot.cobs.map(c =>
    `<td class="center bold">${pivot.tipos.reduce((a, t) => a + (pivot.counts[t]?.[c] ?? 0), 0)}</td>`
  ).join('');

  const primasRows = primasSol.map((r, i) => {
    const mmt = mmtRows[i];
    const sol = r.total;
    const mmtT = mmt?.total ?? 0;
    const difRow = mmtT - sol;
    return `<tr>
      <td>${r.tipo}</td>
      <td>${r.cob}</td>
      <td class="center">${r.count}</td>
      <td class="right mono">${r.media ? fmtEur2(r.media) : '—'}</td>
      <td class="right mono">${r.total ? fmtEur(r.total) : '—'}</td>
      <td class="right mono">${mmt?.prima != null ? fmtEur2(mmt.prima) : '—'}</td>
      <td class="right mono">${mmt?.total != null ? fmtEur(mmt.total) : '—'}</td>
      <td class="right mono ${difRow < 0 ? 'red' : difRow > 0 ? 'green' : ''}">${mmt?.total != null ? (difRow >= 0 ? '+' : '') + fmtEur(difRow) : '—'}</td>
    </tr>`;
  }).join('');

  const sincoHtml = sinco ? `
    <div class="sinco-wrap">
      <div class="sinco-head">Siniestralidad SINCO</div>
      <div class="sinco-grid">
        ${sinco.values.map(([l, v]) => `
        <div class="sinco-item">
          <div class="sinco-label">${l}</div>
          <div class="sinco-val">${v}</div>
        </div>`).join('')}
      </div>
    </div>` : '';

  const corredorBadgeHtml = corredorLabel
    ? `<div class="corredor-badge"><span class="dot"></span>${corredorLabel}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Informe de Flota — ${header?.tomador || 'MMT'}</title>
<style>
  @page { size: A4 portrait; margin: 10mm 13mm 10mm; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none; }
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Arial', 'Helvetica Neue', Helvetica, sans-serif; font-size: 11px; color: #1e2a4a; background: #fff; line-height: 1.3; }

  /* ── Header ── */
  .report-header {
    background: linear-gradient(135deg, #0a1560 0%, #1240CC 55%, #2563eb 100%);
    color: #fff; border-radius: 8px; padding: 14px 18px; margin-bottom: 10px;
    display: flex; justify-content: space-between; align-items: flex-start;
  }
  .brand { font-size: 22px; font-weight: 900; letter-spacing: -0.5px; font-family: 'Arial Black', Arial, sans-serif; }
  .subtitle { font-size: 9px; letter-spacing: 0.2em; text-transform: uppercase; margin-top: 2px; opacity: 0.7; }
  .header-right { text-align: right; }
  .header-meta { font-size: 12px; line-height: 1.6; opacity: 0.9; margin-bottom: 7px; }
  .header-meta strong { font-weight: 800; }
  .corredor-badge {
    display: inline-flex; align-items: center; gap: 5px;
    background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.35);
    border-radius: 5px; padding: 4px 10px;
    font-size: 12px; font-weight: 800; letter-spacing: 0.06em; color: #fff;
    font-family: 'Arial Black', Arial, sans-serif;
  }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: #fbbf24; display: inline-block; flex-shrink: 0; }

  /* ── Client card ── */
  .client-card {
    border: 1px solid #d4dff5; border-radius: 7px; padding: 9px 14px;
    margin-bottom: 9px; background: #f4f7ff;
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px 16px;
  }
  .cf-label { font-size: 8.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.11em; color: #6b85b5; display: block; margin-bottom: 1px; }
  .cf-val { font-size: 13px; font-weight: 700; color: #1e2a4a; }

  /* ── Section ── */
  .section { margin-bottom: 9px; }
  .section-title {
    font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.12em;
    color: #1240CC; border-bottom: 2px solid #1240CC;
    padding-bottom: 3px; margin-bottom: 7px;
    font-family: 'Arial Black', Arial, sans-serif;
  }

  /* ── Tables ── */
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #1240CC; color: #fff; font-weight: 800; font-size: 11px; padding: 6px 8px; text-align: left; }
  td { padding: 5px 8px; border-bottom: 1px solid #eaeffb; color: #1e2a4a; }
  tr:last-child td { border-bottom: none; }
  tr:nth-child(even) td { background: #f5f8ff; }
  .tfoot td { background: #e8eeff !important; font-weight: 900; border-top: 2px solid #b8c8f8; font-size: 13px; font-family: 'Arial Black', Arial, sans-serif; }

  .center { text-align: center; }
  .right  { text-align: right; }
  .bold   { font-weight: 800; }
  .mono   { font-family: 'Arial', sans-serif; font-weight: 700; }
  .green  { color: #15803d; font-weight: 800; }
  .red    { color: #dc2626; font-weight: 800; }

  /* ── SINCO ── */
  .sinco-wrap { border: 1px solid #d4dff5; border-radius: 7px; overflow: hidden; margin-bottom: 9px; }
  .sinco-head { padding: 5px 13px; background: #ecf0ff; border-bottom: 1px solid #d4dff5; font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.12em; color: #1240CC; font-family: 'Arial Black', Arial, sans-serif; }
  .sinco-grid { display: flex; gap: 1px; background: #d4dff5; }
  .sinco-item { background: #fff; padding: 8px 10px; flex: 1; display: flex; flex-direction: column; align-items: center; text-align: center; }
  .sinco-label { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #6b85b5; margin-bottom: 3px; }
  .sinco-val { font-size: 20px; font-weight: 900; color: #1240CC; font-family: 'Arial Black', 'Arial Bold', Arial, sans-serif; line-height: 1; }

  /* ── Ámbito ── */
  .ambito-badge { display: inline-block; border-radius: 4px; padding: 2px 9px; font-size: 12px; font-weight: 800; background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }

  /* ── Summary bar ── */
  .summary-bar { background: #eef2ff; border: 1px solid #c0cffa; border-radius: 7px; padding: 9px 14px; margin-top: 8px; display: flex; justify-content: space-between; align-items: center; }
  .s-item { text-align: center; }
  .s-label { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #6b85b5; display: block; margin-bottom: 2px; }
  .s-val { font-size: 16px; font-weight: 900; color: #1240CC; font-family: 'Arial Black', Arial, sans-serif; line-height: 1; }
  .s-val.green { color: #15803d; }
  .s-val.red   { color: #dc2626; }
  .divider { width: 1px; height: 32px; background: #c0cffa; }

  /* ── Footer ── */
  .report-footer { margin-top: 8px; padding-top: 6px; border-top: 1px solid #d4dff5; display: flex; justify-content: space-between; font-size: 10px; color: #8ea3c8; }

  /* ── Anexo coberturas ── */
  .anexo-page { page-break-before: always; padding-top: 14px; }
  .anexo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 8px; }
  .anexo-box { border: 1px solid #d4dff5; border-radius: 7px; overflow: hidden; }
  .anexo-box-head { background: #1240CC; color: #fff; padding: 7px 13px; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.10em; font-family: 'Arial Black', Arial, sans-serif; }
  .anexo-box-body { padding: 8px 13px; }
  .garantia-row { display: flex; align-items: center; gap: 7px; padding: 4px 0; border-bottom: 1px solid #eaeffb; font-size: 11px; color: #1e2a4a; }
  .garantia-row:last-child { border-bottom: none; }
  .garantia-dot { width: 5px; height: 5px; border-radius: 50%; background: #1240CC; flex-shrink: 0; display: inline-block; }
</style>
</head>
<body>

<div class="report-header">
  <div>
    <div class="brand">MMT Seguros</div>
    <div class="subtitle">Informe de Flota</div>
  </div>
  <div class="header-right">
    <div class="header-meta">
      <div><strong>Fecha:</strong> ${today()}</div>
      <div><strong>Total vehículos:</strong> ${totalVehiculos}</div>
    </div>
    ${corredorBadgeHtml}
  </div>
</div>

<div class="client-card">
  ${header?.tomador  ? `<div><span class="cf-label">Tomador</span><span class="cf-val">${header.tomador}</span></div>` : ''}
  ${header?.cif      ? `<div><span class="cf-label">CIF / NIF</span><span class="cf-val">${header.cif}</span></div>` : ''}
  ${header?.actividad ? `<div><span class="cf-label">Actividad</span><span class="cf-val">${header.actividad}</span></div>` : ''}
  ${header?.efecto   ? `<div><span class="cf-label">Fecha efecto</span><span class="cf-val">${fmtDateField(header.efecto)}</span></div>` : ''}
  ${header?.formaPago ? `<div><span class="cf-label">Forma de pago</span><span class="cf-val">${header.formaPago}</span></div>` : ''}
  ${header?.ciaActual ? `<div><span class="cf-label">Compañía actual</span><span class="cf-val">${header.ciaActual}</span></div>` : ''}
  ${ambitoLabel ? `<div><span class="cf-label">Ámbito</span><span class="cf-val"><span class="ambito-badge">${ambitoLabel}</span></span></div>` : ''}
</div>

<div class="section">
  <div class="section-title">Composición de la flota</div>
  <table>
    <thead>
      <tr>
        <th>Tipo de vehículo</th>
        ${pivot.cobs.map(c => `<th class="center">${c || '—'}</th>`).join('')}
        <th class="center">Total</th>
      </tr>
    </thead>
    <tbody>${pivotRows}</tbody>
    <tfoot>
      <tr class="tfoot">
        <td class="bold">TOTAL</td>
        ${pivotTotals}
        <td class="center bold">${totalVehiculos}</td>
      </tr>
    </tfoot>
  </table>
</div>

${sincoHtml}

<div class="section">
  <div class="section-title">Comparativa de primas</div>
  <table>
    <thead>
      <tr>
        <th>Tipo</th><th>Coberturas</th><th class="center">Nº</th>
        <th class="right">Prima sol./veh.</th><th class="right">Total sol.</th>
        <th class="right">Prima MMT/veh.</th><th class="right">Total MMT</th>
        <th class="right">Diferencia</th>
      </tr>
    </thead>
    <tbody>${primasRows}</tbody>
    <tfoot>
      <tr class="tfoot">
        <td colspan="2" class="bold">TOTAL</td>
        <td class="center bold">${primasSol.reduce((a, r) => a + r.count, 0)}</td>
        <td></td>
        <td class="right mono bold">${totalSol ? fmtEur(totalSol) : '—'}</td>
        <td></td>
        <td class="right mono bold">${totalMmt ? fmtEur(totalMmt) : '—'}</td>
        <td class="right mono bold ${dif < 0 ? 'red' : dif > 0 ? 'green' : ''}">${totalMmt ? (dif >= 0 ? '+' : '') + fmtEur(dif) : '—'}</td>
      </tr>
    </tfoot>
  </table>

  ${totalSol && totalMmt ? `
  <div class="summary-bar">
    <div class="s-item"><span class="s-label">Prima sol. total</span><span class="s-val">${fmtEur(totalSol)}</span></div>
    <div class="divider"></div>
    <div class="s-item"><span class="s-label">Prima MMT total</span><span class="s-val">${fmtEur(totalMmt)}</span></div>
    <div class="divider"></div>
    <div class="s-item"><span class="s-label">Diferencia</span><span class="s-val ${dif < 0 ? 'red' : 'green'}">${dif >= 0 ? '+' : ''}${fmtEur(dif)}</span></div>
    <div class="divider"></div>
    <div class="s-item"><span class="s-label">Variación</span><span class="s-val ${dif < 0 ? 'red' : 'green'}">${totalSol ? ((dif / totalSol) * 100).toFixed(1) + '%' : '—'}</span></div>
  </div>` : ''}
</div>

<div class="report-footer">
  <span>MMT Seguros — Documento confidencial</span>
  <span>Generado: ${today()}</span>
</div>

${cobAnexo.length > 0 ? `
<div class="anexo-page">
  <div class="section-title">Anexo — Detalle de coberturas incluidas</div>
  <div class="anexo-grid">
    ${cobAnexo.map(({ titulo, garantias }) => `
    <div class="anexo-box">
      <div class="anexo-box-head">${titulo}</div>
      <div class="anexo-box-body">
        ${garantias.map(g => `<div class="garantia-row"><span class="garantia-dot"></span>${g}</div>`).join('')}
      </div>
    </div>`).join('')}
  </div>
  <div class="report-footer" style="margin-top: 12px;">
    <span>MMT Seguros — Documento confidencial</span>
    <span>Generado: ${today()}</span>
  </div>
</div>` : ''}

<script>window.onload = () => { window.print(); };</script>
</body>
</html>`;
}

// ─── HojaInforme ─────────────────────────────────────────────────────────────

export default function HojaInforme({
  header,
  trabajoRows, coberturas, sincoResultRows, sincoManual, sincoGlobal,
  primasMmtValues, onPrimasMmtChange, tarifaFlota, corredorLabel,
}: Props) {

  // ── Pivot tipo × cobertura ──────────────────────────────────────────────────
  const pivot = useMemo(() => {
    const tipos = new Set<string>();
    const cobs  = new Set<string>();
    const counts: Record<string, Record<string, number>> = {};
    trabajoRows.forEach((r, i) => {
      const tipo = r['tipo_vehiculo'] || 'Sin tipo';
      const cob  = coberturas[i]?.cobertura || r['coberturas_solicitadas'] || 'Sin cobertura';
      tipos.add(tipo); cobs.add(cob);
      if (!counts[tipo]) counts[tipo] = {};
      counts[tipo][cob] = (counts[tipo][cob] ?? 0) + 1;
    });
    return { tipos: Array.from(tipos), cobs: Array.from(cobs), counts };
  }, [trabajoRows, coberturas]);

  const totalVehiculos = trabajoRows.filter(r => r['matricula']?.trim()).length;

  // ── Ámbito ──────────────────────────────────────────────────────────────────
  const ambito = useMemo(() => {
    const rows = trabajoRows.filter(r => r['matricula']?.trim());
    const nacional = rows.filter(r => (r['ambito'] || '').toLowerCase().includes('nac')).length;
    const internacional = rows.filter(r => (r['ambito'] || '').toLowerCase().includes('int')).length;
    const sinDato = rows.length - nacional - internacional;
    const label: string | null = internacional > 0 ? 'Internacional' : nacional > 0 ? 'Nacional' : null;
    return { nacional, internacional, sinDato, label };
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

  // ── Primas agrupadas ─────────────────────────────────────────────────────────
  const isYes = (v?: string) => { const u = (v ?? '').trim().toUpperCase(); return u !== '' && u !== 'NO' && u !== 'N' && u !== '0'; };

  const tipoCobGrupos = useMemo(() => {
    const grupos: Record<string, { tipo: string; cob: string; cobLabel: string; count: number; sumaSol: number }> = {};
    trabajoRows.filter(r => r['matricula']?.trim()).forEach(r => {
      const tipo = normTipo(r['tipo_vehiculo'] || '');
      const cob  = r['coberturas_solicitadas'] || 'Sin cobertura';
      const key  = `${tipo}||${cob}`;                                  // clave estable para saved primas
      const prima = parseFloat(r['prima_referencia'] ?? '');
      if (!grupos[key]) grupos[key] = { tipo, cob, cobLabel: cob, count: 0, sumaSol: 0 };
      // Actualizar cobLabel si este vehículo tiene extras
      const extras: string[] = [];
      if (isYes(r['lunas'])) extras.push('LUNAS');
      if (isYes(r['asistencia'])) extras.push('ASISTENCIA');
      if (extras.length > 0) grupos[key].cobLabel = `${cob} (${extras.join(', ')})`;
      grupos[key].count++;
      if (!isNaN(prima)) grupos[key].sumaSol += prima;
    });
    return grupos;
  }, [trabajoRows]);

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
    const cobMap = new Map<string, boolean>(); // rawCob → hasNonRemolque
    Object.values(tipoCobGrupos).forEach(g => {
      const isRemolque = TIPOS_REMOLQUE.has(g.tipo);
      if (!cobMap.has(g.cob)) cobMap.set(g.cob, false);
      if (!isRemolque) cobMap.set(g.cob, true);
    });

    const result: { titulo: string; garantias: string[] }[] = [];
    const seen = new Set<string>();
    cobMap.forEach((hasNonRemolque, rawCob) => {
      const v = rawCob.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      let key = '';
      if (v.includes('todo') || v.includes('franquicia') || v.includes('riesgo')) key = 'tr';
      else if (v.includes('amplia')) key = 'ta';
      else if (v.includes('tercero')) key = 't';
      if (!key || seen.has(key)) return;
      seen.add(key);
      if (key === 't') {
        result.push({ titulo: 'Terceros', garantias: [...BASE_GARANTIAS] });
      } else if (key === 'ta') {
        result.push({
          titulo: 'Terceros Ampliado',
          garantias: [
            ...BASE_GARANTIAS,
            ...(hasNonRemolque ? ['Lunas (excepto remolques)'] : []),
            'Robo', 'Incendio',
          ],
        });
      } else if (key === 'tr') {
        result.push({
          titulo: 'Todo Riesgo con Franquicia 1.800 €',
          garantias: [
            ...BASE_GARANTIAS,
            ...(hasNonRemolque ? ['Lunas (excepto remolques)'] : []),
            'Robo', 'Incendio', 'Daños propios con franquicia de 1.800 €',
          ],
        });
      }
    });
    // Orden lógico: Terceros → Terceros Ampliado → Todo Riesgo
    return result.sort((a, b) => {
      const order: Record<string, number> = { 'Terceros': 0, 'Terceros Ampliado': 1, 'Todo Riesgo con Franquicia 1.800 €': 2 };
      return (order[a.titulo] ?? 9) - (order[b.titulo] ?? 9);
    });
  }, [tipoCobGrupos]);

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

  // ── PDF ───────────────────────────────────────────────────────────────────────
  const handlePdf = useCallback(() => {
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

    const html = buildPdfHtml({
      header,
      pivot,
      totalVehiculos,
      ambitoLabel: ambito.label,
      sinco: sincoValues ? { label: 'SINCO', values: sincoValues } : null,
      primasSol,
      mmtRows,
      corredorLabel,
      cobAnexo,
    });

    const w = window.open('', '_blank', 'width=860,height=700');
    if (!w) return;
    w.document.write(html);
    w.document.close();
  }, [header, pivot, totalVehiculos, ambito, primasSol, mmtRows, resumenAuto, resumenManual, sincoGlobal, cobAnexo]);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full min-h-0" style={{ background: 'rgba(0,5,30,0.7)', width: '100%', minWidth: 0, overflow: 'hidden' }}>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderBottom: '1px solid rgba(61,112,255,0.15)', background: 'rgba(6,14,50,0.6)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(178,198,245,0.5)' }}>
            Informe · {totalVehiculos} vehículos
          </span>
          {corredorLabel && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)',
              borderRadius: 20, padding: '2px 10px',
              fontSize: 10, fontWeight: 800, letterSpacing: '0.05em', color: '#fbbf24',
            }}>
              ★ {corredorLabel}
            </span>
          )}
        </div>
        <button onClick={handlePdf} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8,
          background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.3)',
          color: '#ef4444', fontSize: 11, fontWeight: 700, cursor: 'pointer',
          textTransform: 'uppercase', letterSpacing: '0.08em',
        }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(220,38,38,0.22)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(220,38,38,0.12)')}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" />
          </svg>
          Descargar PDF
        </button>
      </div>

      {/* Contenido: columna única, scroll vertical; overflowX auto como fallback */}
      <div className="flex-1 custom-scrollbar" style={{ overflowY: 'auto', overflowX: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, width: '100%', boxSizing: 'border-box' }}>

        {/* ── Fila top: Ámbito + SINCO ────────────────────────────────────── */}
        {(ambito.label || hasSincoData) && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', width: '100%', minWidth: 0, boxSizing: 'border-box', flexShrink: 0 }}>
            {ambito.label && (
              <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid #e5e7eb', background: '#ffffff', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px' }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#6b7280', letterSpacing: '0.1em' }}>Ámbito</span>
                <span style={{
                  borderRadius: 6, padding: '3px 12px',
                  background: ambito.label === 'Internacional' ? '#faf5ff' : '#eff6ff',
                  border: `1px solid ${ambito.label === 'Internacional' ? '#d8b4fe' : '#bfdbfe'}`,
                  color: ambito.label === 'Internacional' ? '#7c3aed' : '#1d4ed8',
                  fontSize: 12, fontWeight: 800,
                }}>{ambito.label}</span>
              </div>
            )}
            {hasSincoData && (() => {
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
                ['Antigüedad', fmt2(sincoGlobal.anyosExperiencia) + 'a'],
                ['Frecuencia', fmtFreq(sincoGlobal.frecuencia)],
              ] : [];
              if (!items.length) return null;
              return (
                <div style={{ flex: 1, minWidth: 0, borderRadius: 10, overflow: 'hidden', border: '1px solid #e5e7eb', background: '#ffffff' }}>
                  <div style={{ padding: '6px 14px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
                    <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#374151' }}>Siniestralidad SINCO</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 1, background: '#e5e7eb' }}>
                    {items.map(([l, v]) => (
                      <div key={l} style={{ background: '#fff', padding: '8px 14px', flex: '1 0 80px' }}>
                        <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af' }}>{l}</div>
                        <div style={{ fontSize: 16, fontWeight: 900, color: '#111827', fontFamily: 'monospace' }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ── Composición de flota ─────────────────────────────────────────── */}
        <Card title="Composición de flota">
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%', boxSizing: 'border-box' }}>
            <table style={{ minWidth: 300, width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f3f4f6' }}>
                  <th style={thS}>Tipo vehículo</th>
                  {pivot.cobs.map(c => <th key={c} style={{ ...thS, textAlign: 'center' }}>{c || '—'}</th>)}
                  <th style={{ ...thS, textAlign: 'center', fontWeight: 900 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {pivot.tipos.map(tipo => {
                  const total = pivot.cobs.reduce((a, c) => a + (pivot.counts[tipo]?.[c] ?? 0), 0);
                  return (
                    <tr key={tipo} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={tdS}>{tipo}</td>
                      {pivot.cobs.map(c => <td key={c} style={{ ...tdS, textAlign: 'center' }}>{pivot.counts[tipo]?.[c] ?? 0}</td>)}
                      <td style={{ ...tdS, textAlign: 'center', fontWeight: 900 }}>{total}</td>
                    </tr>
                  );
                })}
                <tr style={{ borderTop: '2px solid #d1d5db', background: '#f9fafb', fontWeight: 900 }}>
                  <td style={tdS}>Total</td>
                  {pivot.cobs.map(c => {
                    const t = pivot.tipos.reduce((a, ti) => a + (pivot.counts[ti]?.[c] ?? 0), 0);
                    return <td key={c} style={{ ...tdS, textAlign: 'center', fontWeight: 900 }}>{t}</td>;
                  })}
                  <td style={{ ...tdS, textAlign: 'center', fontWeight: 900 }}>{totalVehiculos}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>

        {/* ── Primas solicitadas ───────────────────────────────────────────── */}
        <Card title="Primas solicitadas">
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%', boxSizing: 'border-box' }}>
            <table style={{ minWidth: 320, width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f3f4f6' }}>
                  {['Tipo vehículo', 'Coberturas', 'Nº', 'Prima media/veh.', 'Total'].map(h =>
                    <th key={h} style={thS}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {primasSol.length === 0
                  ? <tr><td colSpan={5} style={{ textAlign: 'center', padding: '20px 0', color: '#9ca3af' }}>Sin datos</td></tr>
                  : <>
                      {primasSol.map(r => (
                        <tr key={r.key} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ ...tdS, fontWeight: 600 }}>{r.tipo}</td>
                          <td style={{ ...tdS, fontSize: 11 }}>{r.cob}</td>
                          <td style={{ ...tdS, textAlign: 'center' }}>{r.count}</td>
                          <td style={{ ...tdS, textAlign: 'right', fontFamily: 'monospace' }}>{r.media ? fmtEur2(r.media) : '—'}</td>
                          <td style={{ ...tdS, textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>{r.total ? fmtEur(r.total) : '—'}</td>
                        </tr>
                      ))}
                      <tr style={{ borderTop: '2px solid #d1d5db', background: '#f9fafb', fontWeight: 900 }}>
                        <td colSpan={2} style={tdS}>Total</td>
                        <td style={{ ...tdS, textAlign: 'center' }}>{primasSol.reduce((a, r) => a + r.count, 0)}</td>
                        <td style={tdS} />
                        <td style={{ ...tdS, textAlign: 'right', fontFamily: 'monospace' }}>{totalSol ? fmtEur(totalSol) : '—'}</td>
                      </tr>
                    </>
                }
              </tbody>
            </table>
          </div>
        </Card>

        {/* ── Primas MMT ──────────────────────────────────────────────────── */}
        <Card title="Primas MMT">
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%', boxSizing: 'border-box' }}>
            <table style={{ minWidth: 320, width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f3f4f6' }}>
                  {['Tipo vehículo', 'Coberturas', 'Nº', 'Prima/veh.', 'Total'].map(h =>
                    <th key={h} style={thS}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {mmtRows.length === 0
                  ? <tr><td colSpan={5} style={{ textAlign: 'center', padding: '20px 0', color: '#9ca3af' }}>Sin datos</td></tr>
                  : <>
                      {mmtRows.map(r => (
                        <tr key={r.key} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ ...tdS, fontWeight: 600 }}>{r.tipo}</td>
                          <td style={{ ...tdS, fontSize: 11 }}>{r.cob}</td>
                          <td style={{ ...tdS, textAlign: 'center' }}>{r.count}</td>
                          <td style={{ ...tdS, textAlign: 'right' }}>
                            <input
                              inputMode="decimal"
                              value={r.prima != null ? r.prima : ''}
                              onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d*$/.test(v)) handleMmtChange(r.key, v); }}
                              placeholder="—"
                              style={{
                                width: 90, textAlign: 'right', fontFamily: 'monospace', fontSize: 12,
                                background: 'rgba(178,198,245,0.15)', border: '1px solid rgba(178,198,245,0.4)',
                                outline: 'none', padding: '4px 8px', borderRadius: 6, color: '#111827',
                              }}
                              onFocus={e => { e.currentTarget.style.borderColor = '#1240CC'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(18,64,204,0.2)'; }}
                              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(178,198,245,0.4)'; e.currentTarget.style.boxShadow = 'none'; }}
                            />
                          </td>
                          <td style={{ ...tdS, textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>
                            {r.total != null ? fmtEur(r.total) : '—'}
                          </td>
                        </tr>
                      ))}
                      <tr style={{ borderTop: '2px solid #d1d5db', background: '#f9fafb', fontWeight: 900 }}>
                        <td colSpan={2} style={tdS}>Total</td>
                        <td style={{ ...tdS, textAlign: 'center' }}>{mmtRows.reduce((a, r) => a + r.count, 0)}</td>
                        <td style={tdS} />
                        <td style={{ ...tdS, textAlign: 'right', fontFamily: 'monospace' }}>
                          {mmtRows.some(r => r.total != null) ? fmtEur(totalMmt) : '—'}
                        </td>
                      </tr>
                    </>
                }
              </tbody>
            </table>
          </div>
        </Card>

        {/* ── Diferencia ───────────────────────────────────────────────────── */}
        {totalSol > 0 && totalMmt > 0 && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10,
            width: '100%', boxSizing: 'border-box', flexShrink: 0,
          }}>
            {[
              { label: 'Prima sol. total', value: fmtEur(totalSol), color: '#374151', bg: '#f9fafb', border: '#e5e7eb' },
              { label: 'Prima MMT total', value: fmtEur(totalMmt), color: '#1240CC', bg: '#eff6ff', border: '#bfdbfe' },
              { label: 'Diferencia (€)', value: (dif >= 0 ? '+' : '') + fmtEur(dif), color: difColor(dif), bg: difBg(dif), border: dif < 0 ? 'rgba(220,38,38,0.2)' : dif > 0 ? 'rgba(22,163,74,0.2)' : '#e5e7eb' },
              { label: 'Variación (%)', value: (pctDif >= 0 ? '+' : '') + pctDif.toFixed(1) + '%', color: difColor(dif), bg: difBg(dif), border: dif < 0 ? 'rgba(220,38,38,0.2)' : dif > 0 ? 'rgba(22,163,74,0.2)' : '#e5e7eb' },
            ].map(({ label, value, color, bg, border }) => (
              <div key={label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: '12px 16px' }}>
                <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9ca3af', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 18, fontWeight: 900, fontFamily: 'monospace', color }}>{value}</div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────

function Card({ title, children, style }: { title: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid #e5e7eb', background: '#ffffff', width: '100%', minWidth: 0, boxSizing: 'border-box', flexShrink: 0, ...style }}>
      <div style={{ padding: '8px 14px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
        <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#374151' }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

const thS: React.CSSProperties = { padding: '7px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700, borderBottom: '1px solid #d1d5db', color: '#374151' };
const tdS: React.CSSProperties = { padding: '6px 10px', fontSize: 12, color: '#111827' };
