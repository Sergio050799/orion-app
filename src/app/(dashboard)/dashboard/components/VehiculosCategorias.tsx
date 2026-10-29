"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';

export type TipologiaStat = {
  tipologia: string;
  estudio: number;
  ofertada: number;
  contratada: number;
  total: number;
};

export type CatStats = {
  categoria: string;
  subtitulo: string;
  tipologias: TipologiaStat[];
  estudio: number;
  ofertada: number;
  contratada: number;
  total: number;
};

const sectionStyle: React.CSSProperties = {
  paddingTop: 28,
  borderTop: '1px solid var(--t-line)',
};

const CAT_COLORS = ['#4387ff', '#7c5cfc', '#20c982', '#ef4d5a'];
const CAT_ACCENT = ['#1240cc', '#6366f1', '#10b981', '#6b7280'];

// ─── PDF logo helper ──────────────────────────────────────────────────────────

async function fetchLogoDataUrl(): Promise<string> {
  try {
    const res = await fetch('/ORION_LOGO.png');
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = '';
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    return 'data:image/png;base64,' + btoa(bin);
  } catch {
    return '';
  }
}

// ─── PDF HTML builder ─────────────────────────────────────────────────────────

function buildPdfHtml(stats: CatStats[], fecha: string, logoSrc: string): string {
  const totalAll   = stats.reduce((s, c) => s + c.total, 0);
  const totalContr = stats.reduce((s, c) => s + c.contratada, 0);
  const totalEst   = stats.reduce((s, c) => s + c.estudio, 0);
  const totalOfer  = stats.reduce((s, c) => s + c.ofertada, 0);
  const tasa       = totalAll > 0 ? Math.round((totalContr / totalAll) * 100) : 0;
  const pctEst     = totalAll > 0 ? Math.round((totalEst  / totalAll) * 100) : 0;
  const pctContr   = totalAll > 0 ? Math.round((totalContr / totalAll) * 100) : 0;
  const refCode    = 'CAT-' + new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const shortDate  = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const logoImg = logoSrc
    ? `<img class="orion-mark" src="${logoSrc}" alt="ORION" style="filter:brightness(0);">`
    : `<svg class="orion-mark" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg"><path d="M17.5 3.3 29.5 9.1 29.5 23.3 17.4 31.4 5.1 24.5 5.1 10.4Z" fill="none" stroke="#15171b" stroke-linejoin="round" stroke-width="3"/><path d="M8.3 23.2 22.2 15.1M23.2 3.9 32.9 8.8 32.9 16.7M19.5 29.8 29.4 24.1" fill="none" stroke="#15171b" stroke-linecap="round" stroke-width="3"/></svg>`;

  const catRows = stats.map(c => `<tr>
    <td><strong>${c.categoria}</strong><span class="subline">${c.subtitulo}</span></td>
    <td class="num">${c.estudio}</td><td class="num">${c.ofertada}</td>
    <td class="num">${c.contratada}</td><td class="num"><strong>${c.total}</strong></td>
  </tr>`).join('');

  const tipRows = stats.flatMap(c => {
    const prefix = c.categoria.split(' ')[0];
    return c.tipologias.map((tip, idx) => {
      const pct = c.total > 0 ? Math.round((tip.total / c.total) * 100) : 0;
      const label = `${prefix} · ${tip.tipologia}`;
      return `<tr>
        <td>${idx === 0 ? `<strong>${label}</strong>` : label}</td>
        <td class="num">${tip.estudio}</td>
        <td class="num">${tip.total}</td>
        <td class="num">${pct} %</td>
      </tr>`;
    });
  }).join('');

  const reportHead = `<header class="report-head">
  <div>
    <div class="report-wordmark">${logoImg} ORION</div>
    <div class="docseries">REPORTS / ANÁLISIS DE CARTERA</div>
  </div>
  <div class="meta"><strong>${fecha}</strong>Informe de distribución<br>REF · ${refCode}</div>
</header>`;

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Informe — Vehículos por Categoría · ORION</title>
<style>
@page{size:A4;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
html{font-family:Inter,'Segoe UI',Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{background:#e9edf1;color:#15171b;font-size:12px;line-height:1.45}
.report{width:210mm;min-height:297mm;padding:19mm 18mm 17mm;background:#fff;display:flex;flex-direction:column;margin:0 auto 20px;box-shadow:0 2px 16px rgba(0,0,0,.12)}
.report-main{flex:1}
.report-head{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:17px;border-bottom:1.5px solid #15171b}
.report-wordmark{display:flex;align-items:center;gap:11px;font-size:19px;letter-spacing:.115em;font-weight:780;color:#15171b}
.orion-mark{width:32px;height:32px;display:block;flex:none}
.docseries{font-size:10px;margin:6px 0 0 43px;color:#555D69;text-transform:uppercase;letter-spacing:.13em}
.meta{font-size:11px;line-height:1.65;text-align:right;color:#555D69}
.meta strong{font-size:12px;color:#15171b;display:block}
.report-title{margin:27px 0 20px}
.eyebrow{font-size:10.5px;color:#1240cc;letter-spacing:.16em;font-weight:750;text-transform:uppercase;display:block}
.report-title h2{font-size:31px;font-weight:730;letter-spacing:-.04em;margin:7px 0;line-height:1.13;color:#15171b}
.report-title p{font-size:12.5px;line-height:1.55;color:#555D69}
.metric-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));padding:22px 0 27px;border-bottom:1px solid #dfe3e8;gap:15px}
.metric{border-right:1px solid #dfe3e8;padding-right:8px}
.metric:last-child{border-right:none}
.metric .num{font-size:35px;font-weight:720;letter-spacing:-.045em;line-height:1;color:#15171b}
.metric .lab{margin-top:9px;font-size:10px;text-transform:uppercase;letter-spacing:.045em;color:#555D69;font-weight:660}
.metric .sub{font-size:10.5px;color:#9aa1aa;margin-top:5px}
.section{margin-top:28px}
.section-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding-bottom:11px;border-bottom:1px solid #dfe3e8;margin-bottom:9px}
.section-head h3{font-size:15px;letter-spacing:-.01em;font-weight:730;color:#15171b}
.section-kicker{font-size:10px;color:#555D69}
table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:12px}
th{font-size:9.5px;letter-spacing:.03em;color:#7d8590;font-weight:730;border-bottom:1px solid #dfe3e8;padding:10px 6px 10px 0;text-transform:uppercase}
td{padding:12px 6px 12px 0;border-bottom:1px solid #edf0f3;vertical-align:middle;line-height:1.4;color:#15171b}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
.subline{display:block;font-size:10.5px;color:#555D69;margin-top:3px}
.sum-row td{border-top:1.5px solid #b4bbc4;border-bottom:0;font-weight:730;color:#15171b}
.smallnote{font-size:11px;line-height:1.55;color:#555D69;margin-top:12px}
.report-footer{border-top:1px solid #dfe3e8;padding-top:11px;margin-top:27px;display:flex;justify-content:space-between;gap:15px;color:#555D69;font-size:10px}
.continuation{margin-bottom:25px}
@media print{
  body{background:white}
  .report{box-shadow:none;width:210mm;height:297mm;min-height:297mm;page-break-after:always;break-after:page;padding:19mm 18mm 17mm;overflow:hidden;margin:0}
  .report:last-of-type{page-break-after:auto;break-after:auto}
  .section{break-inside:avoid}
  tr{break-inside:avoid}
}
</style>
</head><body>

<article class="report">
<div class="report-main">
${reportHead}
<div class="report-title">
  <span class="eyebrow">Cartera · Informe estadístico</span>
  <h2>Vehículos por categoría</h2>
  <p>Distribución de vehículos del período por clasificación y tipología.</p>
</div>
<div class="metric-row">
  <div class="metric"><div class="num">${totalAll}</div><div class="lab">Total vehículos</div><div class="sub">Todos los estudios</div></div>
  <div class="metric"><div class="num">${totalEst}</div><div class="lab">En estudio</div><div class="sub">${pctEst} % del total</div></div>
  <div class="metric"><div class="num">${totalContr}</div><div class="lab">Contratados</div><div class="sub">${pctContr} % del total</div></div>
  <div class="metric"><div class="num">${tasa} %</div><div class="lab">Tasa contratación</div><div class="sub">Sobre total de vehículos</div></div>
</div>
<section class="section">
  <div class="section-head"><h3>01 / Resumen por categoría</h3><span class="section-kicker">Todas las categorías</span></div>
  <table>
    <colgroup><col style="width:43%"><col style="width:14%"><col style="width:14%"><col style="width:14%"><col style="width:15%"></colgroup>
    <thead><tr>
      <th>Categoría</th>
      <th class="num">En estudio</th><th class="num">Ofertados</th>
      <th class="num">Contratados</th><th class="num">Total</th>
    </tr></thead>
    <tbody>
      ${catRows}
      <tr class="sum-row">
        <td>TOTAL</td>
        <td class="num">${totalEst}</td><td class="num">${totalOfer}</td>
        <td class="num">${totalContr}</td><td class="num">${totalAll}</td>
      </tr>
    </tbody>
  </table>
</section>
</div>
<footer class="report-footer">
  <span>ORION · Documento de análisis de cartera</span>
  <span>${shortDate} · 01 / 02</span>
</footer>
</article>

<article class="report">
<div class="report-main">
${reportHead}
<div class="report-title continuation">
  <span class="eyebrow">Cartera · Continuación</span>
  <h2>Detalle por tipología</h2>
  <p>Composición por categorías, cifras y metodología de cálculo.</p>
</div>
<section class="section">
  <div class="section-head"><h3>02 / Detalle por tipología</h3><span class="section-kicker">Composición de las categorías</span></div>
  <table>
    <colgroup><col style="width:54%"><col style="width:15%"><col style="width:15%"><col style="width:16%"></colgroup>
    <thead><tr>
      <th>Tipología / categoría</th>
      <th class="num">En estudio</th><th class="num">Total</th><th class="num">% s/ categoría</th>
    </tr></thead>
    <tbody>${tipRows}</tbody>
  </table>
</section>
<section class="section">
  <div class="section-head"><h3>03 / Metodología</h3><span class="section-kicker">Definiciones para lectura</span></div>
  <p class="smallnote">Tasa de contratación global: contratados / total de vehículos × 100. Ejemplo: ${totalContr} / ${totalAll} = ${tasa} %. Distribución por tipología: vehículos de la tipología / total de la categoría × 100. Los porcentajes se redondean al entero más próximo. Datos obtenidos de todas las carpetas activas, clasificados por tipo_vehiculo.</p>
</section>
</div>
<footer class="report-footer">
  <span>ORION · Documento de análisis de cartera</span>
  <span>${shortDate} · 02 / 02</span>
</footer>
</article>

</body></html>`;
}

// ─── SecTitle (modal preview) ─────────────────────────────────────────────────

function SecTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em',
      color: '#555D69', borderBottom: '1px solid #dfe3e8', paddingBottom: 6,
      marginTop: 24, marginBottom: 12,
    }}>
      {children}
    </div>
  );
}

// ─── VehiculosCategorias ──────────────────────────────────────────────────────

export default function VehiculosCategorias({ stats }: { stats: CatStats[] }) {
  const [open, setOpen] = useState(false);

  const handlePdf = useCallback(async () => {
    const fecha = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
    const logoSrc = await fetchLogoDataUrl();
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(buildPdfHtml(stats, fecha, logoSrc));
    win.document.close();
    win.onload = () => { setTimeout(() => win.print(), 300); };
  }, [stats]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const visibleStats = stats.filter(c => c.categoria !== 'Sin clasificar');
  const totalVeh   = stats.reduce((s, c) => s + c.total, 0);
  const totalContr = stats.reduce((s, c) => s + c.contratada, 0);
  const totalEst   = stats.reduce((s, c) => s + c.estudio, 0);
  const totalOfer  = stats.reduce((s, c) => s + c.ofertada, 0);

  const thStyle: React.CSSProperties = {
    padding: '0 0 12px 0', fontSize: 10, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.12em',
    color: 'var(--t-text-3)', borderBottom: '1px solid var(--t-line)',
    textAlign: 'left',
  };

  return (
    <>
      {/* ── Sección integrada ── */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <button
            onClick={() => setOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 620, color: 'var(--t-text)', margin: 0, pointerEvents: 'none' }}>
              Vehículos por categoría
            </h2>
            <span style={{ fontSize: 12, color: 'var(--t-blue)', opacity: 0.8, whiteSpace: 'nowrap' }}>
              Ver informe →
            </span>
          </button>
          {totalVeh > 0 && (
            <span style={{ fontSize: 11, color: 'var(--t-text-3)', letterSpacing: '0.06em' }}>
              {totalVeh.toLocaleString('es')} vehículos
            </span>
          )}
        </div>

        {totalVeh === 0 ? (
          <p style={{ color: 'var(--t-text-3)', fontSize: 12, textAlign: 'center', padding: '40px 0', margin: 0 }}>Sin datos</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 520, fontFamily: 'inherit' }}>
              <colgroup>
                <col style={{ width: 180 }} />
                <col style={{ width: 160 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 105 }} />
                <col style={{ width: 72 }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={thStyle}>Categoría</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Distribución</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>En estudio</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Contratados</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {visibleStats.map((c, i) => {
                  const pct = totalVeh > 0 ? Math.round((c.total / totalVeh) * 100) : 0;
                  return (
                    <tr
                      key={c.categoria}
                      onClick={() => setOpen(true)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td style={{ padding: '16px 0', borderBottom: '1px solid var(--t-line-soft)', verticalAlign: 'middle' }}>
                        <div
                          style={{ fontSize: 14, fontWeight: 600, color: 'var(--t-text)' }}
                          onMouseEnter={e => { e.currentTarget.style.color = 'var(--t-blue)'; }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'var(--t-text)'; }}
                        >
                          {c.categoria}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--t-text-2)', marginTop: 2 }}>{c.subtitulo}</div>
                      </td>
                      <td style={{ padding: '16px 0 16px 2px', borderBottom: '1px solid var(--t-line-soft)', textAlign: 'center', verticalAlign: 'middle' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                          <div style={{ width: 80, height: 4, background: 'var(--t-line)', borderRadius: 2, flexShrink: 0, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: CAT_COLORS[i] ?? '#4387ff' }} />
                          </div>
                          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--t-text-2)', whiteSpace: 'nowrap' }}>{pct}%</span>
                        </div>
                      </td>
                      <td style={{ padding: '16px 0', borderBottom: '1px solid var(--t-line-soft)', textAlign: 'center', verticalAlign: 'middle' }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--t-text)' }}>{c.estudio}</span>
                      </td>
                      <td style={{ padding: '16px 0', borderBottom: '1px solid var(--t-line-soft)', textAlign: 'center', verticalAlign: 'middle' }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--t-text)' }}>{c.contratada}</span>
                      </td>
                      <td style={{ padding: '16px 0', borderBottom: '1px solid var(--t-line-soft)', textAlign: 'center', verticalAlign: 'middle' }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--t-text-2)' }}>{c.total}</span>
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td style={{ padding: '12px 0', borderTop: '1px solid var(--t-line)' }}>
                    <span style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t-text-3)' }}>Total</span>
                  </td>
                  <td style={{ padding: '12px 0', borderTop: '1px solid var(--t-line)' }} />
                  <td style={{ padding: '12px 0', borderTop: '1px solid var(--t-line)', textAlign: 'center' }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--t-text)' }}>{totalEst}</span>
                  </td>
                  <td style={{ padding: '12px 0', borderTop: '1px solid var(--t-line)', textAlign: 'center' }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--t-text)' }}>{totalContr}</span>
                  </td>
                  <td style={{ padding: '12px 0', borderTop: '1px solid var(--t-line)', textAlign: 'center' }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--t-text-2)' }}>{totalVeh}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal informe completo — renderizado en document.body (portal) ── */}
      {open && createPortal(
        <div
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 24px', overflowY: 'auto', backdropFilter: 'blur(4px)' }}
        >
          <div style={{ background: '#fff', borderRadius: 12, maxWidth: 860, width: '100%', overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.45)', marginBottom: 32, fontFamily: 'Inter, -apple-system, sans-serif' }}>

            {/* ── Toolbar ── */}
            <div style={{ background: '#0a0b0d', padding: '16px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/ORION_LOGO.png" alt="ORION" style={{ width: 24, height: 24, objectFit: 'contain', filter: 'brightness(0) invert(1)', flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.11em', color: '#fff' }}>ORION</span>
                <span style={{ fontSize: 10, color: '#6b7280', marginLeft: 8 }}>Vehículos por categoría</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handlePdf}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', border: 'none', color: '#15171b', fontSize: 12, fontWeight: 600, padding: '7px 14px', borderRadius: 6, cursor: 'pointer', letterSpacing: '0.03em' }}
                >
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <path d="M6.5 1v8M3 6.5l3.5 3.5L10 6.5" stroke="#15171b" strokeWidth="1.5" strokeLinecap="round" />
                    <path d="M1.5 11.5h10" stroke="#15171b" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  PDF
                </button>
                <button
                  onClick={() => setOpen(false)}
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, background: 'none', border: '1px solid #2a2d32', borderRadius: 6, cursor: 'pointer', color: '#9aa1aa', fontSize: 18, lineHeight: 1 }}
                >
                  ×
                </button>
              </div>
            </div>

            {/* ── Body ── */}
            <div style={{ padding: '32px 40px', color: '#15171b', maxHeight: 'calc(90vh - 80px)', overflowY: 'auto' }}>

              {/* report-head */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 17, borderBottom: '1.5px solid #15171b' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11, fontSize: 19, fontWeight: 780, letterSpacing: '0.115em', color: '#15171b' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/ORION_LOGO.png" alt="" style={{ width: 32, height: 32, objectFit: 'contain', filter: 'brightness(0)', flexShrink: 0 }} />
                    ORION
                  </div>
                  <div style={{ fontSize: 10, marginTop: 6, marginLeft: 43, color: '#555D69', textTransform: 'uppercase', letterSpacing: '0.13em' }}>REPORTS / ANÁLISIS DE CARTERA</div>
                </div>
                <div style={{ textAlign: 'right', fontSize: 11, lineHeight: 1.65, color: '#555D69' }}>
                  <strong style={{ display: 'block', fontSize: 12, color: '#15171b' }}>
                    {new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </strong>
                  Informe de distribución<br />{'REF · CAT-' + new Date().toISOString().slice(0, 10).replace(/-/g, '')}
                </div>
              </div>

              {/* report-title */}
              <div style={{ margin: '27px 0 20px' }}>
                <span style={{ display: 'block', fontSize: 10.5, color: '#1240cc', letterSpacing: '0.16em', fontWeight: 750, textTransform: 'uppercase' }}>Cartera · Informe estadístico</span>
                <h2 style={{ fontSize: 31, fontWeight: 730, letterSpacing: '-0.04em', margin: '7px 0', lineHeight: 1.13, color: '#15171b' }}>Vehículos por categoría</h2>
                <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: '#555D69' }}>Distribución de vehículos del período por clasificación y tipología.</p>
              </div>

              {/* metric-row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', padding: '22px 0 27px', borderBottom: '1px solid #dfe3e8', gap: 15 }}>
                {[
                  { num: String(totalVeh),   lab: 'Total vehículos',    sub: 'Todos los estudios' },
                  { num: String(totalEst),   lab: 'En estudio',          sub: `${totalVeh > 0 ? Math.round(totalEst / totalVeh * 100) : 0} % del total` },
                  { num: String(totalContr), lab: 'Contratados',         sub: `${totalVeh > 0 ? Math.round(totalContr / totalVeh * 100) : 0} % del total` },
                  { num: `${totalVeh > 0 ? Math.round((totalContr / totalVeh) * 100) : 0} %`, lab: 'Tasa contratación', sub: 'Sobre total de vehículos' },
                ].map((m, i, arr) => (
                  <div key={m.lab} style={{ borderRight: i < arr.length - 1 ? '1px solid #dfe3e8' : 'none', paddingRight: 8 }}>
                    <div style={{ fontSize: 35, fontWeight: 720, letterSpacing: '-0.045em', lineHeight: 1, color: '#15171b' }}>{m.num}</div>
                    <div style={{ marginTop: 9, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.045em', color: '#555D69', fontWeight: 660, lineHeight: 1.35 }}>{m.lab}</div>
                    <div style={{ fontSize: 10.5, color: '#9aa1aa', marginTop: 5, lineHeight: 1.4 }}>{m.sub}</div>
                  </div>
                ))}
              </div>

              {/* Section 01: Resumen por categoría */}
              <div style={{ marginTop: 32 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, paddingBottom: 13, borderBottom: '1px solid #dfe3e8', marginBottom: 11 }}>
                  <h3 style={{ fontSize: 17, letterSpacing: '-0.01em', fontWeight: 730, color: '#15171b', margin: 0 }}>01 / Resumen por categoría</h3>
                  <span style={{ fontSize: 11.5, color: '#555D69' }}>Todas las categorías</span>
                </div>
                <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed', fontSize: 14 }}>
                  <colgroup>
                    <col style={{ width: '43%' }} /><col style={{ width: '14%' }} /><col style={{ width: '14%' }} /><col style={{ width: '14%' }} /><col style={{ width: '15%' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      {['Categoría', 'En estudio', 'Ofertados', 'Contratados', 'Total'].map((h, i) => (
                        <th key={h} style={{ textAlign: i === 0 ? 'left' : 'right', fontSize: 11.5, letterSpacing: '0.03em', color: '#7d8590', fontWeight: 730, borderBottom: '1px solid #dfe3e8', padding: '14px 6px 14px 0', textTransform: 'uppercase', lineHeight: 1.25 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stats.map(c => (
                      <tr key={c.categoria}>
                        <td style={{ padding: '14px 6px 14px 0', borderBottom: '1px solid #edf0f3', verticalAlign: 'middle', lineHeight: 1.4 }}>
                          <strong>{c.categoria}</strong>
                          <span style={{ display: 'block', fontSize: 10.5, color: '#555D69', marginTop: 3 }}>{c.subtitulo}</span>
                        </td>
                        <td style={{ padding: '14px 6px 14px 0', borderBottom: '1px solid #edf0f3', textAlign: 'right', fontVariantNumeric: 'tabular-nums', lineHeight: 1.4 }}>{c.estudio}</td>
                        <td style={{ padding: '14px 6px 14px 0', borderBottom: '1px solid #edf0f3', textAlign: 'right', fontVariantNumeric: 'tabular-nums', lineHeight: 1.4 }}>{c.ofertada}</td>
                        <td style={{ padding: '14px 6px 14px 0', borderBottom: '1px solid #edf0f3', textAlign: 'right', fontVariantNumeric: 'tabular-nums', lineHeight: 1.4 }}>{c.contratada}</td>
                        <td style={{ padding: '14px 6px 14px 0', borderBottom: '1px solid #edf0f3', textAlign: 'right', fontVariantNumeric: 'tabular-nums', lineHeight: 1.4 }}><strong>{c.total}</strong></td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{ padding: '14px 6px 14px 0', borderTop: '1.5px solid #b4bbc4', borderBottom: 0, fontWeight: 730 }}>TOTAL</td>
                      <td style={{ padding: '14px 6px 14px 0', borderTop: '1.5px solid #b4bbc4', borderBottom: 0, fontWeight: 730, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{totalEst}</td>
                      <td style={{ padding: '14px 6px 14px 0', borderTop: '1.5px solid #b4bbc4', borderBottom: 0, fontWeight: 730, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{totalOfer}</td>
                      <td style={{ padding: '14px 6px 14px 0', borderTop: '1.5px solid #b4bbc4', borderBottom: 0, fontWeight: 730, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{totalContr}</td>
                      <td style={{ padding: '14px 6px 14px 0', borderTop: '1.5px solid #b4bbc4', borderBottom: 0, fontWeight: 730, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{totalVeh}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Section 02: Detalle por tipología */}
              <div style={{ marginTop: 32 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, paddingBottom: 13, borderBottom: '1px solid #dfe3e8', marginBottom: 11 }}>
                  <h3 style={{ fontSize: 17, letterSpacing: '-0.01em', fontWeight: 730, color: '#15171b', margin: 0 }}>02 / Detalle por tipología</h3>
                  <span style={{ fontSize: 11.5, color: '#555D69' }}>Composición de las categorías</span>
                </div>
                <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed', fontSize: 14 }}>
                  <colgroup>
                    <col style={{ width: '54%' }} /><col style={{ width: '15%' }} /><col style={{ width: '15%' }} /><col style={{ width: '16%' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      {['Tipología / categoría', 'En estudio', 'Total', '% s/ categoría'].map((h, i) => (
                        <th key={h} style={{ textAlign: i === 0 ? 'left' : 'right', fontSize: 11.5, letterSpacing: '0.03em', color: '#7d8590', fontWeight: 730, borderBottom: '1px solid #dfe3e8', padding: '14px 6px 14px 0', textTransform: 'uppercase', lineHeight: 1.25 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stats.flatMap(c => {
                      const prefix = c.categoria.split(' ')[0];
                      return c.tipologias.map((tip, idx) => {
                        const pct = c.total > 0 ? Math.round((tip.total / c.total) * 100) : 0;
                        const label = `${prefix} · ${tip.tipologia}`;
                        return (
                          <tr key={`${c.categoria}-${tip.tipologia}`}>
                            <td style={{ padding: '14px 6px 14px 0', borderBottom: '1px solid #edf0f3', verticalAlign: 'middle', lineHeight: 1.4 }}>
                              {idx === 0 ? <strong>{label}</strong> : label}
                            </td>
                            <td style={{ padding: '14px 6px 14px 0', borderBottom: '1px solid #edf0f3', textAlign: 'right', fontVariantNumeric: 'tabular-nums', lineHeight: 1.4 }}>{tip.estudio}</td>
                            <td style={{ padding: '14px 6px 14px 0', borderBottom: '1px solid #edf0f3', textAlign: 'right', fontVariantNumeric: 'tabular-nums', lineHeight: 1.4 }}>{tip.total}</td>
                            <td style={{ padding: '14px 6px 14px 0', borderBottom: '1px solid #edf0f3', textAlign: 'right', fontVariantNumeric: 'tabular-nums', lineHeight: 1.4 }}>{pct} %</td>
                          </tr>
                        );
                      });
                    })}
                  </tbody>
                </table>
                <p style={{ fontSize: 13, lineHeight: 1.55, color: '#555D69', marginTop: 12, marginBottom: 0 }}>% s/ categoría: vehículos de la tipología / total de la categoría × 100. Los porcentajes se redondean al entero más próximo.</p>
              </div>

              {/* Section 03: Metodología */}
              <div style={{ marginTop: 32 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, paddingBottom: 13, borderBottom: '1px solid #dfe3e8', marginBottom: 11 }}>
                  <h3 style={{ fontSize: 17, letterSpacing: '-0.01em', fontWeight: 730, color: '#15171b', margin: 0 }}>03 / Metodología</h3>
                  <span style={{ fontSize: 11.5, color: '#555D69' }}>Definiciones para lectura</span>
                </div>
                <p style={{ fontSize: 13, lineHeight: 1.55, color: '#555D69', marginTop: 0, marginBottom: 0 }}>
                  <strong style={{ color: '#15171b' }}>Tasa de contratación global:</strong> contratados / total de vehículos × 100. Ejemplo: {totalContr} / {totalVeh} = {totalVeh > 0 ? Math.round((totalContr / totalVeh) * 100) : 0} %. <strong style={{ color: '#15171b' }}>Distribución por tipología:</strong> vehículos de la tipología / total de la categoría × 100. Los porcentajes se redondean al entero más próximo. Datos obtenidos de todas las carpetas activas, clasificados por tipo_vehiculo.
                </p>
              </div>

              {/* report-footer */}
              <div style={{ borderTop: '1px solid #dfe3e8', paddingTop: 13, marginTop: 30, display: 'flex', justifyContent: 'space-between', gap: 15, color: '#555D69', fontSize: 10 }}>
                <span>ORION · Documento de análisis de cartera</span>
                <span>{new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
              </div>

            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
