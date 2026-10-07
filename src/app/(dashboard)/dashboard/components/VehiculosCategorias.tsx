"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';

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

// ─── Helpers de color semántico ────────────────────────────────────────────────
// Cuerpo claro (#FAFAFB) → colores ajustados para contraste sobre blanco

const C = {
  text:     '#111827',   // negro casi puro
  sec:      '#374151',   // gris oscuro — subtítulos y labels
  muted:    '#4B5563',   // gris medio — notas secundarias
  div:      '#E5E7EB',
  bg:       '#FAFAFB',
  amber:    '#D99A25',   // En estudio > 0
  green:    '#16A34A',   // Contratados > 0
  violet:   '#7C5CFC',   // Ofertados > 0
  blue:     '#4387FF',   // Porcentajes / acento
  zero:     '#6B7280',   // Ceros — visible pero neutro
} as const;

function numColor(val: number, type: 'estudio' | 'ofertada' | 'contratada' | 'tasa'): string {
  if (val === 0) return C.zero;
  if (type === 'estudio')    return C.amber;
  if (type === 'ofertada')   return C.violet;
  if (type === 'contratada') return C.green;
  if (type === 'tasa')       return C.blue;
  return C.text;
}

// ─── PDF (editorial claro) ─────────────────────────────────────────────────────

function buildPdfHtml(stats: CatStats[], fecha: string): string {
  const totalAll   = stats.reduce((s, c) => s + c.total, 0);
  const totalContr = stats.reduce((s, c) => s + c.contratada, 0);
  const totalEst   = stats.reduce((s, c) => s + c.estudio, 0);
  const tasa = totalAll > 0 ? Math.round((totalContr / totalAll) * 100) : 0;

  const ec = (_v: number) => 'color:#111827;font-weight:600';
  const oc = (_v: number) => 'color:#111827;font-weight:600';
  const cc = (_v: number) => 'color:#111827;font-weight:600';
  const pc = (_v: number) => 'color:#111827;font-weight:600';

  const catRows = stats.map(c => {
    const t = c.total > 0 ? Math.round((c.contratada / c.total) * 100) : 0;
    return `<tr>
      <td class="tdl"><strong>${c.categoria}</strong><span>${c.subtitulo}</span></td>
      <td class="tdc" style="${ec(c.estudio)}">${c.estudio}</td>
      <td class="tdc" style="${oc(c.ofertada)}">${c.ofertada}</td>
      <td class="tdc" style="${cc(c.contratada)}">${c.contratada}</td>
      <td class="tdc fw">${c.total}</td>
      <td class="tdc" style="${pc(t)}">${t}%</td>
    </tr>`;
  }).join('');

  const detailBlocks = stats.map(c => {
    const t = c.total > 0 ? Math.round((c.contratada / c.total) * 100) : 0;
    const tipRows = c.tipologias.map(tip => {
      const pct = c.total > 0 ? Math.round((tip.total / c.total) * 100) : 0;
      const bar = `<div style="display:inline-flex;align-items:center;gap:7px;justify-content:center">
        <span style="${pc(pct)}">${pct}%</span>
        <div style="width:36px;height:4px;background:#E5E7EB;border-radius:2px;overflow:hidden;flex-shrink:0">
          <div style="width:${pct}%;height:100%;background:#4387FF;border-radius:2px"></div>
        </div></div>`;
      return `<tr>
        <td class="tdl">${tip.tipologia}</td>
        <td class="tdc" style="${ec(tip.estudio)}">${tip.estudio}</td>
        <td class="tdc" style="${oc(tip.ofertada)}">${tip.ofertada}</td>
        <td class="tdc" style="${cc(tip.contratada)}">${tip.contratada}</td>
        <td class="tdc fw">${tip.total}</td>
        <td class="tdc">${bar}</td>
      </tr>`;
    }).join('');
    return `<div class="cat-block">
      <div class="cat-hdr">
        <div class="cat-hdr-left">
          <div class="cat-bar"></div>
          <strong>${c.categoria}</strong><span>${c.subtitulo}</span>
        </div>
        <span>${c.total} vehículos · <span style="${pc(t)}">${t}%</span> contratación</span>
      </div>
      <table><thead><tr>
        <th class="thl">Tipología</th><th>En estudio</th><th>Ofertados</th>
        <th>Contratados</th><th>Total</th><th>% s/ cat.</th>
      </tr></thead><tbody>${tipRows}</tbody></table>
    </div>`;
  }).join('');

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>ORION — Vehículos por Categoría</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:"Segoe UI",Arial,Helvetica,sans-serif;color:#111827;background:#FAFAFB;font-size:14px;-webkit-font-smoothing:antialiased}
@page{margin:0;size:A4}
.page{max-width:900px;margin:0 auto}
/* ── CABECERA OSCURA ── */
.hdr{background:#050607;padding:26px 40px 22px;display:flex;justify-content:space-between;align-items:flex-start}
.hdr-brand{font-size:11px;font-weight:700;letter-spacing:.2em;color:rgba(244,244,245,.45);display:block;margin-bottom:7px;text-transform:uppercase}
.hdr-title{font-size:24px;font-weight:650;color:#F4F4F5;display:block;letter-spacing:-.025em;line-height:1.1}
.hdr-sub{font-size:13px;color:#8d9198;display:block;margin-top:5px}
.hdr-right{text-align:right;padding-top:4px}
.hdr-date{font-size:12px;color:#8d9198;display:block}
/* ── CUERPO CLARO ── */
.body{padding:28px 40px 48px;background:#FAFAFB}
/* KPIs */
.kpis{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;margin-bottom:32px;background:#fff}
.kpi{padding:16px 20px;border-right:1px solid #E5E7EB}
.kpi:last-child{border-right:none}
.kpi-lbl{font-size:11px;color:#6B7280;display:block;margin-bottom:5px;letter-spacing:.04em;text-transform:uppercase}
.kpi-val{font-size:36px;font-weight:650;color:#111827;display:block;line-height:1;letter-spacing:-.04em}
.kpi-sub{font-size:11px;color:#9CA3AF;display:block;margin-top:4px}
/* Secciones */
.sec{display:flex;align-items:center;gap:10px;margin:28px 0 14px}
.sec-bar{width:3px;height:24px;background:#4387FF;border-radius:2px;flex-shrink:0}
.sec h2{font-size:19px;font-weight:650;color:#111827;margin:0}
/* Tablas */
table{width:100%;border-collapse:collapse;margin-bottom:24px}
th{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#6B7280;padding:10px 12px;background:#F3F4F6;border-bottom:1px solid #E5E7EB;text-align:center;font-weight:600}
.thl{text-align:left}
.tdl{padding:12px 12px;border-bottom:1px solid #F3F4F6;vertical-align:middle}
.tdl strong{display:block;font-weight:600;font-size:14px;color:#111827}
.tdl span{font-size:11px;color:#9CA3AF;display:block;margin-top:1px}
.tdc{padding:12px 12px;border-bottom:1px solid #F3F4F6;text-align:center;color:#111827;vertical-align:middle;font-size:14px}
.fw{font-weight:700;color:#111827}
.total-row td{border-top:2px solid #D1D5DB;border-bottom:none;font-weight:700;color:#111827;padding:12px;text-align:center}
.total-row td:first-child{text-align:left}
/* Bloques categoría */
.cat-block{margin-bottom:28px;page-break-inside:avoid}
.cat-hdr{display:flex;justify-content:space-between;align-items:center;padding-bottom:10px;margin-bottom:12px;border-bottom:1px solid #E5E7EB}
.cat-hdr-left{display:flex;align-items:center;gap:8px}
.cat-bar{width:3px;height:20px;background:#4387FF;border-radius:2px;flex-shrink:0}
.cat-hdr strong{font-size:15px;font-weight:650;color:#111827}
.cat-hdr-left span{font-size:13px;color:#9CA3AF;margin-left:2px}
.cat-hdr>span{font-size:12px;color:#111827}
/* Fórmulas */
.fml{background:#050607;border-radius:8px;padding:20px 24px;margin-top:28px}
.fml-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:rgba(244,244,245,.4);margin-bottom:14px}
.fml-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 28px}
.fml-lbl{font-size:11px;font-weight:600;color:#F4F4F5;margin-bottom:3px}
.fml-code{font-size:10px;font-family:monospace;color:#c8ccd2;background:rgba(255,255,255,.08);padding:2px 7px;border-radius:3px;display:inline-block}
.fml-desc{font-size:10px;color:#8d9198;margin-top:3px}
/* Footer */
.footer{margin-top:28px;padding-top:10px;border-top:1px solid #E5E7EB;display:flex;justify-content:space-between}
.footer span{font-size:10px;color:#9CA3AF}
@media print{
  body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .hdr{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .cat-block{page-break-inside:avoid}
  thead{display:table-header-group}
}
</style></head><body>
<div class="page">
<div class="hdr">
  <div>
    <span class="hdr-brand">ORION</span>
    <span class="hdr-title">Vehículos por Categoría</span>
    <span class="hdr-sub">Informe global del período</span>
  </div>
  <div class="hdr-right"><span class="hdr-date">${fecha}</span></div>
</div>
<div class="body">
<div class="kpis">
  <div class="kpi"><span class="kpi-lbl">Total vehículos</span><span class="kpi-val">${totalAll}</span><span class="kpi-sub">todos los estudios</span></div>
  <div class="kpi"><span class="kpi-lbl">En estudio</span><span class="kpi-val" style="${ec(totalEst)}">${totalEst}</span><span class="kpi-sub">${totalAll > 0 ? Math.round(totalEst / totalAll * 100) : 0}% del total</span></div>
  <div class="kpi"><span class="kpi-lbl">Contratados</span><span class="kpi-val" style="${cc(totalContr)}">${totalContr}</span><span class="kpi-sub">${totalAll > 0 ? Math.round(totalContr / totalAll * 100) : 0}% del total</span></div>
  <div class="kpi"><span class="kpi-lbl">Tasa contratación</span><span class="kpi-val" style="${pc(tasa)}">${tasa}%</span><span class="kpi-sub">sobre total vehículos</span></div>
</div>
<div class="sec"><div class="sec-bar"></div><h2>Resumen por categoría</h2></div>
<table><thead><tr>
  <th class="thl">Categoría</th><th>En estudio</th><th>Ofertados</th>
  <th>Contratados</th><th>Total</th><th>Tasa contr.</th>
</tr></thead><tbody>
${catRows}
<tr class="total-row">
  <td>TOTAL</td>
  <td style="${ec(totalEst)}">${totalEst}</td>
  <td style="color:#9CA3AF">—</td>
  <td style="${cc(totalContr)}">${totalContr}</td>
  <td>${totalAll}</td>
  <td style="${pc(tasa)}">${tasa}%</td>
</tr>
</tbody></table>
<div class="sec"><div class="sec-bar"></div><h2>Detalle por tipología</h2></div>
${detailBlocks}
<div class="fml">
  <div class="fml-title">Cómo se calculan los porcentajes</div>
  <div class="fml-grid">
    <div><div class="fml-lbl">Tasa contratación (KPI global)</div><div class="fml-code">contratados / total_vehículos × 100</div><div class="fml-desc">Ej: ${totalContr} / ${totalAll} = ${tasa}%</div></div>
    <div><div class="fml-lbl">Tasa contr. por categoría</div><div class="fml-code">contratados_cat / total_cat × 100</div><div class="fml-desc">Solo vehículos de esa categoría</div></div>
    <div><div class="fml-lbl">% s/ categoría (tipología)</div><div class="fml-code">total_tip / total_cat × 100</div><div class="fml-desc">Peso de la tipología dentro de su categoría</div></div>
    <div><div class="fml-lbl">Fuente de datos</div><div class="fml-code">trabajoRows de todas las carpetas</div><div class="fml-desc">Clasificado por tipo_vehiculo · sin tipo → Sin clasificar</div></div>
  </div>
</div>
<div class="footer"><span>ORION · ${fecha}</span><span>Datos: todas las carpetas del período</span></div>
</div></div></body></html>`;
}

// ─── Título de sección (barra azul vertical + texto) ──────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '32px 0 18px' }}>
      <div style={{ width: 3, height: 26, background: C.blue, borderRadius: 2, flexShrink: 0 }} />
      <h2 style={{ fontSize: 21, fontWeight: 650, color: C.text, margin: 0 }}>{children}</h2>
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────────

export default function VehiculosCategorias({ stats }: { stats: CatStats[] }) {
  const [open, setOpen] = useState(false);

  const handlePdf = useCallback(() => {
    const fecha = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
    const html = buildPdfHtml(stats, fecha);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const win  = window.open(url, '_blank');
    if (!win) { URL.revokeObjectURL(url); return; }
    win.onload = () => {
      setTimeout(() => {
        win.print();
        URL.revokeObjectURL(url);
      }, 400);
    };
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
  const tasa = totalVeh > 0 ? Math.round((totalContr / totalVeh) * 100) : 0;

  // ── Tabla dark (widget en Dashboard) ──────────────────────────────────────────
  const thDark: React.CSSProperties = {
    padding: '0 0 10px', fontSize: 10, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.08em',
    color: '#6d727a', borderBottom: '1px solid rgba(255,255,255,0.08)', textAlign: 'left',
  };

  // ── KPIs del modal (números grandes sobre fondo claro) ─────────────────────
  const modalKpis: { label: string; val: string | number; numColor: string; labelColor: string; sub: string }[] = [
    { label: 'Total vehículos',   val: totalVeh,   numColor: C.text,                              labelColor: C.sec,   sub: 'todos los estudios' },
    { label: 'En estudio',        val: totalEst,   numColor: totalEst   > 0 ? C.amber  : C.zero,  labelColor: totalEst   > 0 ? C.amber : C.muted, sub: `${totalVeh > 0 ? Math.round(totalEst   / totalVeh * 100) : 0}% del total` },
    { label: 'Contratados',       val: totalContr, numColor: totalContr > 0 ? C.green  : C.zero,  labelColor: C.sec,   sub: `${totalVeh > 0 ? Math.round(totalContr / totalVeh * 100) : 0}% del total` },
    { label: 'Tasa contratación', val: `${tasa}%`, numColor: tasa       > 0 ? C.blue   : C.zero,  labelColor: C.sec,   sub: 'sobre total vehículos' },
  ];

  // ── Estilos de celdas numéricas en tablas claras ───────────────────────────
  const tdNum = (align: 'left' | 'right' | 'center' = 'center'): React.CSSProperties => ({
    padding: '14px 14px', borderBottom: `1px solid ${C.div}`,
    textAlign: align, fontSize: 15, verticalAlign: 'middle',
  });

  return (
    <>
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          WIDGET EN DASHBOARD — integrado sobre fondo negro
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div style={{ marginTop: 40, paddingTop: 40, borderTop: '1px solid rgba(255,255,255,0.08)' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 22 }}>
          <h2 style={{ fontSize: 16, fontWeight: 620, color: '#F4F4F5', margin: 0 }}>
            Vehículos por categoría
          </h2>
          <button
            onClick={() => setOpen(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4387FF', fontSize: 13, fontWeight: 500, padding: 0, transition: 'opacity 120ms' }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            Ver informe →
          </button>
          {totalVeh > 0 && (
            <span style={{ marginLeft: 'auto', fontSize: 12, color: '#6d727a' }}>
              {totalVeh.toLocaleString('es')} vehículos
            </span>
          )}
        </div>

        {totalVeh === 0 ? (
          <p style={{ color: '#6d727a', fontSize: 13 }}>Sin datos de vehículos.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
              <colgroup>
                <col /><col style={{ width: 200 }} /><col style={{ width: 90 }} />
                <col style={{ width: 100 }} /><col style={{ width: 70 }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={thDark}>Categoría</th>
                  <th style={thDark}>Distribución</th>
                  <th style={{ ...thDark, textAlign: 'right' }}>En estudio</th>
                  <th style={{ ...thDark, textAlign: 'right' }}>Contratados</th>
                  <th style={{ ...thDark, textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {visibleStats.map(c => {
                  const pct = totalVeh > 0 ? Math.round((c.total / totalVeh) * 100) : 0;
                  return (
                    <tr key={c.categoria} onClick={() => setOpen(true)} style={{ cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <td style={{ padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', verticalAlign: 'middle' }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#F4F4F5' }}>{c.categoria}</div>
                        <div style={{ fontSize: 11, color: '#8d9198', marginTop: 2 }}>{c.subtitulo}</div>
                      </td>
                      <td style={{ padding: '14px 0 14px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: '#4387FF', borderRadius: 99 }} />
                          </div>
                          <span style={{ fontSize: 12, color: '#8d9198', minWidth: 32, textAlign: 'right' }}>{pct}%</span>
                        </div>
                      </td>
                      <td style={{ padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', textAlign: 'right', verticalAlign: 'middle' }}>
                        <span style={{ fontSize: 15, fontWeight: 500, color: '#F4F4F5', fontVariantNumeric: 'tabular-nums' }}>{c.estudio}</span>
                      </td>
                      <td style={{ padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', textAlign: 'right', verticalAlign: 'middle' }}>
                        <span style={{ fontSize: 15, fontWeight: 600, color: c.contratada > 0 ? '#20C982' : '#6d727a', fontVariantNumeric: 'tabular-nums' }}>{c.contratada}</span>
                      </td>
                      <td style={{ padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', textAlign: 'right', verticalAlign: 'middle' }}>
                        <span style={{ fontSize: 15, fontWeight: 500, color: '#F4F4F5', fontVariantNumeric: 'tabular-nums' }}>{c.total}</span>
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td style={{ padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8d9198' }}>Total</span>
                  </td>
                  <td style={{ padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.12)' }} />
                  <td style={{ padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.12)', textAlign: 'right' }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: '#F4F4F5' }}>{totalEst}</span>
                  </td>
                  <td style={{ padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.12)', textAlign: 'right' }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: totalContr > 0 ? '#20C982' : '#6d727a' }}>{totalContr}</span>
                  </td>
                  <td style={{ padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.12)', textAlign: 'right' }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: '#F4F4F5' }}>{totalVeh}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          MODAL INFORME — cabecera negra + cuerpo claro
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {open && createPortal(
        <div
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            padding: '28px 20px', overflowY: 'auto',
          }}
        >
          <div style={{
            background: C.bg,
            borderRadius: 14, width: '100%', maxWidth: 1060,
            overflow: 'hidden', marginBottom: 28, flexShrink: 0,
            boxShadow: '0 24px 80px rgba(0,0,0,0.55)',
          }}>

            {/* ── Cabecera oscura ── */}
            <div style={{ background: '#050607', padding: '22px 32px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                  {/* Logo ORION */}
                  <div style={{ position: 'relative', width: 26, height: 26, flexShrink: 0 }}>
                    <Image src="/ORION_LOGO.png" alt="ORION" fill style={{ objectFit: 'contain' }} />
                  </div>
                  {/* Pipe */}
                  <div style={{ width: 1, height: 44, background: 'rgba(255,255,255,0.18)', flexShrink: 0 }} />
                  {/* Title block */}
                  <div>
                    <h1 style={{ fontSize: 24, fontWeight: 650, color: '#F4F4F5', letterSpacing: '-0.02em', margin: 0, lineHeight: 1.1 }}>
                      Informe — Vehículos por Categoría
                    </h1>
                    <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.42)', margin: '4px 0 0' }}>
                      Análisis global del período
                    </p>
                  </div>
                </div>
                {/* Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <button
                    onClick={handlePdf}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 7,
                      background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.16)',
                      color: '#F4F4F5', fontSize: 13, fontWeight: 500,
                      padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
                      transition: 'background 120ms', letterSpacing: '0.01em',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.14)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M12 3v12M8 11l4 4 4-4M3 17v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2" />
                    </svg>
                    Descargar PDF
                  </button>
                  <button
                    onClick={() => setOpen(false)}
                    style={{
                      width: 34, height: 34, display: 'grid', placeItems: 'center',
                      background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)',
                      borderRadius: 8, cursor: 'pointer', color: 'rgba(255,255,255,0.5)', fontSize: 18,
                      transition: 'color 120ms, background 120ms',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#F4F4F5'; e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; }}
                  >
                    ×
                  </button>
                </div>
              </div>
              {/* Fecha */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 14 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.8" strokeLinecap="round">
                  <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>
                  {new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              </div>
            </div>

            {/* ── KPIs band — cuerpo claro ── */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
              background: '#FFFFFF',
              borderBottom: `1px solid ${C.div}`,
            }}>
              {modalKpis.map((k, i) => (
                <div key={k.label} style={{
                  padding: '22px 32px',
                  borderRight: i < 3 ? `1px solid ${C.div}` : 'none',
                }}>
                  <b style={{ display: 'block', fontSize: 44, fontWeight: 650, letterSpacing: '-0.04em', lineHeight: 1, color: k.numColor }}>
                    {k.val}
                  </b>
                  <span style={{ display: 'block', marginTop: 7, fontSize: 14, color: k.labelColor }}>
                    {k.label}
                  </span>
                  <em style={{ display: 'block', marginTop: 3, fontSize: 12, color: C.muted, fontStyle: 'normal' }}>
                    {k.sub}
                  </em>
                </div>
              ))}
            </div>

            {/* ── Contenido claro ── */}
            <div style={{ padding: '8px 32px 32px', background: C.bg }}>

              {/* Resumen por categoría */}
              <SectionTitle>Resumen por categoría</SectionTitle>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
                <thead>
                  <tr>
                    {(['Categoría', 'En estudio', 'Ofertados', 'Contratados', 'Total', 'Tasa contr.'] as const).map(h => (
                      <th key={h} style={{
                        padding: '10px 14px', fontSize: 12, fontWeight: 600,
                        textTransform: 'uppercase', letterSpacing: '0.06em', color: C.sec,
                        borderBottom: `2px solid ${C.div}`,
                        textAlign: h === 'Categoría' ? 'left' : 'center',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stats.map(c => {
                    const t = c.total > 0 ? Math.round((c.contratada / c.total) * 100) : 0;
                    return (
                      <tr key={c.categoria}
                        onMouseEnter={e => (e.currentTarget.style.background = '#F4F5F6')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}>
                        <td style={{ ...tdNum('left'), padding: '14px 14px' }}>
                          <strong style={{ display: 'block', fontSize: 15, fontWeight: 600, color: C.text }}>{c.categoria}</strong>
                          <span style={{ fontSize: 13, color: C.sec, marginTop: 2, display: 'block' }}>{c.subtitulo}</span>
                        </td>
                        <td style={{ ...tdNum(), fontWeight: 600, color: numColor(c.estudio, 'estudio') }}>{c.estudio}</td>
                        <td style={{ ...tdNum(), color: numColor(c.ofertada, 'ofertada'), fontWeight: c.ofertada > 0 ? 600 : 400 }}>{c.ofertada}</td>
                        <td style={{ ...tdNum(), fontWeight: c.contratada > 0 ? 700 : 400, color: numColor(c.contratada, 'contratada') }}>{c.contratada}</td>
                        <td style={{ ...tdNum(), fontWeight: 700, color: C.text }}>{c.total}</td>
                        <td style={{ ...tdNum(), fontWeight: 700, color: numColor(t, 'tasa') }}>{t}%</td>
                      </tr>
                    );
                  })}
                  {/* Fila TOTAL */}
                  <tr style={{ borderTop: `2px solid #D1D5DB` }}>
                    <td style={{ padding: '14px 14px', fontSize: 13, fontWeight: 700, color: C.text, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Total
                    </td>
                    <td style={{ ...tdNum(), fontWeight: 700, color: numColor(totalEst, 'estudio'), borderTop: `2px solid #D1D5DB` }}>{totalEst}</td>
                    <td style={{ ...tdNum(), color: C.muted, borderTop: `2px solid #D1D5DB` }}>—</td>
                    <td style={{ ...tdNum(), fontWeight: 700, color: numColor(totalContr, 'contratada'), borderTop: `2px solid #D1D5DB` }}>{totalContr}</td>
                    <td style={{ ...tdNum(), fontWeight: 700, color: C.text, borderTop: `2px solid #D1D5DB` }}>{totalVeh}</td>
                    <td style={{ ...tdNum(), fontWeight: 700, color: numColor(tasa, 'tasa'), borderTop: `2px solid #D1D5DB` }}>{tasa}%</td>
                  </tr>
                </tbody>
              </table>

              {/* Detalle por tipología */}
              <SectionTitle>Detalle por tipología</SectionTitle>
              {stats.map(c => {
                const t = c.total > 0 ? Math.round((c.contratada / c.total) * 100) : 0;
                return (
                  <div key={c.categoria} style={{ marginBottom: 32 }}>
                    {/* Category header */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 3, height: 20, background: C.blue, borderRadius: 2, flexShrink: 0 }} />
                        <span style={{ fontSize: 16, fontWeight: 650, color: C.text }}>{c.categoria}</span>
                        <span style={{ fontSize: 14, color: C.sec, marginLeft: 2 }}>{c.subtitulo}</span>
                      </div>
                      <div style={{ fontSize: 13, color: C.muted, marginTop: 4, paddingLeft: 13 }}>
                        {c.total} vehículos ·{' '}
                        <span style={{ color: t > 0 ? C.blue : C.muted, fontWeight: t > 0 ? 600 : 400 }}>{t}%</span>
                        {' '}contratación
                      </div>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          {(['Tipología', 'En estudio', 'Ofertados', 'Contratados', 'Total', '% s/ cat.'] as const).map(h => (
                            <th key={h} style={{
                              padding: '9px 14px', fontSize: 12, fontWeight: 600,
                              textTransform: 'uppercase', letterSpacing: '0.06em', color: C.sec,
                              borderBottom: `1px solid ${C.div}`,
                              textAlign: h === 'Tipología' ? 'left' : h === '% s/ cat.' ? 'right' : 'center',
                              background: '#F3F4F6',
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {c.tipologias.map(tip => {
                          const pct = c.total > 0 ? Math.round((tip.total / c.total) * 100) : 0;
                          return (
                            <tr key={tip.tipologia}
                              onMouseEnter={e => (e.currentTarget.style.background = '#F4F5F6')}
                              onMouseLeave={e => (e.currentTarget.style.background = '')}>
                              <td style={{ padding: '12px 14px', borderBottom: `1px solid ${C.div}`, fontSize: 14, color: C.text }}>{tip.tipologia}</td>
                              <td style={{ ...tdNum(), padding: '12px 14px', fontWeight: tip.estudio > 0 ? 600 : 400, color: numColor(tip.estudio, 'estudio') }}>{tip.estudio}</td>
                              <td style={{ ...tdNum(), padding: '12px 14px', color: numColor(tip.ofertada, 'ofertada'), fontWeight: tip.ofertada > 0 ? 600 : 400 }}>{tip.ofertada}</td>
                              <td style={{ ...tdNum(), padding: '12px 14px', color: numColor(tip.contratada, 'contratada'), fontWeight: tip.contratada > 0 ? 700 : 400 }}>{tip.contratada}</td>
                              <td style={{ ...tdNum(), padding: '12px 14px', fontWeight: 700, color: C.text }}>{tip.total}</td>
                              {/* % s/cat con mini barra */}
                              <td style={{ padding: '12px 14px', borderBottom: `1px solid ${C.div}`, verticalAlign: 'middle' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                                  <span style={{ fontSize: 14, fontWeight: 600, color: pct > 0 ? C.blue : C.muted, minWidth: 32, textAlign: 'right' }}>
                                    {pct}%
                                  </span>
                                  <div style={{ width: 44, height: 4, background: C.div, borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
                                    <div style={{ width: `${pct}%`, height: '100%', background: C.blue, borderRadius: 2 }} />
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}

              {/* Fórmulas — sección técnica secundaria */}
              <div style={{ background: '#F0F1F3', border: `1px solid ${C.div}`, borderRadius: 10, padding: '18px 22px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.sec, marginBottom: 14 }}>
                  Cómo se calculan los porcentajes
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 36px' }}>
                  {[
                    { label: 'Tasa contratación (KPI global)',  code: 'contratados / total_vehículos × 100', desc: `Ej: ${totalContr} / ${totalVeh} = ${tasa}%` },
                    { label: 'Tasa contr. por categoría',       code: 'contratados_cat / total_cat × 100',   desc: 'Solo vehículos de esa categoría' },
                    { label: '% s/ categoría (tipología)',      code: 'total_tip / total_cat × 100',         desc: 'Peso de la tipología dentro de su categoría' },
                    { label: 'Fuente de datos',                 code: 'trabajoRows de todas las carpetas',   desc: 'Clasificado por tipo_vehiculo · sin tipo → Sin clasificar' },
                  ].map(f => (
                    <div key={f.label}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 3 }}>{f.label}</div>
                      <code style={{ fontSize: 12, color: '#4B5563', fontFamily: 'monospace', background: '#E4E5E8', padding: '2px 7px', borderRadius: 4 }}>{f.code}</code>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{f.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Footer ── */}
            <div style={{ borderTop: `1px solid ${C.div}`, padding: '11px 32px', display: 'flex', justifyContent: 'space-between', background: '#F0F1F3' }}>
              <span style={{ fontSize: 11, color: C.muted }}>
                ORION · {new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </span>
              <span style={{ fontSize: 11, color: C.muted }}>Datos: todas las carpetas del período</span>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
