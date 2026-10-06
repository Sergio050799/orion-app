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

const glass: React.CSSProperties = {
  background: 'rgba(12, 28, 82, 0.75)',
  border: '1px solid rgba(61, 112, 255, 0.22)',
  borderRadius: 22,
  padding: '24px 26px',
  boxShadow: '0 30px 80px -20px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.08) inset, 0 0 0 1px rgba(61,112,255,0.12) inset',
};

const CAT_BORDER = ['#1240cc', '#6366f1', '#10b981', '#6b7280'];
const CAT_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#6b7280'];

function Badge({ type, sm, children }: { type: 'estudio' | 'ofertada' | 'contratada'; sm?: boolean; children: React.ReactNode }) {
  const s: Record<string, React.CSSProperties> = {
    estudio:    { background: '#fef3c7', color: '#92400e' },
    ofertada:   { background: '#dbeafe', color: '#1e40af' },
    contratada: { background: '#d1fae5', color: '#065f46' },
  };
  return (
    <span style={{ display: 'inline-block', ...s[type], fontSize: sm ? 12 : 14, fontWeight: 700, padding: sm ? '2px 8px' : '4px 13px', borderRadius: 20 }}>
      {children}
    </span>
  );
}

function SecTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 700, color: '#0c1c52', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
      {children}
      <div style={{ flex: 1, height: 1, background: '#dde6ff' }} />
    </div>
  );
}

function buildPdfHtml(stats: CatStats[], fecha: string): string {
  const totalAll   = stats.reduce((s, c) => s + c.total, 0);
  const totalContr = stats.reduce((s, c) => s + c.contratada, 0);
  const totalEst   = stats.reduce((s, c) => s + c.estudio, 0);
  const tasa = totalAll > 0 ? Math.round((totalContr / totalAll) * 100) : 0;

  const catRows = stats.map(c => {
    const t = c.total > 0 ? Math.round((c.contratada / c.total) * 100) : 0;
    return `<tr>
      <td class="tdl"><strong>${c.categoria}</strong><br><small>${c.subtitulo}</small></td>
      <td class="tdc"><span class="best">${c.estudio}</span></td>
      <td class="tdc"><span class="bofe">${c.ofertada}</span></td>
      <td class="tdc"><span class="bcon">${c.contratada}</span></td>
      <td class="tdc"><strong>${c.total}</strong></td>
      <td class="tdc pct">${t}%</td>
    </tr>`;
  }).join('');

  const detailBlocks = stats.map((c, i) => {
    const t = c.total > 0 ? Math.round((c.contratada / c.total) * 100) : 0;
    const tipRows = c.tipologias.map(tip => {
      const pct = c.total > 0 ? Math.round((tip.total / c.total) * 100) : 0;
      return `<tr>
        <td class="tdl">${tip.tipologia}</td>
        <td class="tdc"><span class="bests">${tip.estudio}</span></td>
        <td class="tdc">${tip.ofertada}</td>
        <td class="tdc"><span class="bcons">${tip.contratada}</span></td>
        <td class="tdc"><strong>${tip.total}</strong></td>
        <td class="tdc pct">${pct}%</td>
      </tr>`;
    }).join('');
    return `<div class="cb">
      <div class="cbh" style="border-left-color:${CAT_BORDER[i] ?? '#1240cc'}">
        <strong>${c.categoria}</strong><span>${c.total} vehículos · ${t}% contratación</span>
      </div>
      <table><thead><tr><th class="thl">Tipología</th><th>En estudio</th><th>Ofertados</th><th>Contratados</th><th>Total</th><th>% s/ cat.</th></tr></thead>
      <tbody>${tipRows}</tbody></table>
    </div>`;
  }).join('');

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Informe Vehículos por Categoría</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;color:#0f1a2e;background:#f0f4f8;padding:20px}
.wrap{max-width:840px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.1)}
.hdr{background:linear-gradient(135deg,#0c1c52,#1240cc);padding:24px 28px;display:flex;justify-content:space-between;align-items:flex-end}
.hdr h1{font-size:19px;font-weight:700;color:#fff;margin-bottom:3px}
.hdr p{font-size:11px;color:rgba(178,206,255,.7)}
.hdr .meta{text-align:right;font-size:12px;color:rgba(255,255,255,.85)}
.body{padding:24px 28px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:24px}
.kpi{background:#f8faff;border:1px solid #dde6ff;border-radius:10px;padding:12px 14px}
.kpi .lbl{font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#6b7ea0;display:block}
.kpi .val{font-size:24px;font-weight:700;letter-spacing:-.03em;display:block;line-height:1.1}
.kpi .sub{font-size:9px;color:#8fa0c0;display:block;margin-top:2px}
.st{font-size:12px;font-weight:700;color:#0c1c52;text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px;border-bottom:2px solid #dde6ff;padding-bottom:5px}
table{width:100%;border-collapse:collapse;margin-bottom:22px}
th{font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#8fa0c0;padding:7px 10px;background:#fafbff;border-bottom:2px solid #dde6ff;text-align:center}
.thl{text-align:left}
.tdl{padding:11px 10px;border-bottom:1px solid #f0f4f8;font-size:13px}
.tdl strong{display:block;font-weight:600;color:#0c1c52}
.tdl small{font-size:10px;color:#8fa0c0}
.tdc{padding:11px 10px;border-bottom:1px solid #f0f4f8;font-size:13px;text-align:center;color:#2a3a5e}
.pct{font-weight:700;color:#1240cc}
.best{background:#fef3c7;color:#92400e;font-size:13px;font-weight:700;padding:3px 9px;border-radius:20px;display:inline-block}
.bofe{background:#dbeafe;color:#1e40af;font-size:13px;font-weight:700;padding:3px 9px;border-radius:20px;display:inline-block}
.bcon{background:#d1fae5;color:#065f46;font-size:13px;font-weight:700;padding:3px 9px;border-radius:20px;display:inline-block}
.bests{background:#fef3c7;color:#92400e;font-size:12px;font-weight:700;padding:2px 7px;border-radius:20px;display:inline-block}
.bcons{background:#d1fae5;color:#065f46;font-size:12px;font-weight:700;padding:2px 7px;border-radius:20px;display:inline-block}
.cb{margin-bottom:20px}
.cbh{background:#f0f4ff;border-left:4px solid #1240cc;padding:7px 12px;border-radius:0 6px 6px 0;margin-bottom:7px;display:flex;justify-content:space-between;align-items:center}
.cbh strong{font-size:12px;font-weight:700;color:#0c1c52}
.cbh span{font-size:10px;color:#6b7ea0}
.fml{background:#f8faff;border:1px solid #dde6ff;border-radius:8px;padding:14px 16px;margin-top:20px}
.fml .ft{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#6b7ea0;margin-bottom:10px}
.fg{display:grid;grid-template-columns:1fr 1fr;gap:8px 20px}
.fl{font-size:10px;font-weight:600;color:#0c1c52;margin-bottom:2px}
.fc{font-size:10px;color:#6b7ea0;font-family:monospace;background:#edf1ff;padding:3px 6px;border-radius:3px;display:inline-block}
.fd{font-size:9px;color:#8fa0c0;margin-top:2px}
.footer{border-top:1px solid #e8eef8;padding:12px 28px;display:flex;justify-content:space-between}
.footer span{font-size:9px;color:#8fa0c0}
@media print{body{background:#fff;padding:0}.wrap{box-shadow:none;border-radius:0}}
</style></head><body>
<div class="wrap">
<div class="hdr"><div><h1>Informe — Vehículos por Categoría</h1><p>ORION · Análisis global del período</p></div><div class="meta">${fecha}</div></div>
<div class="body">
<div class="kpis">
  <div class="kpi"><span class="lbl">Total vehículos</span><span class="val">${totalAll}</span><span class="sub">todos los estudios</span></div>
  <div class="kpi"><span class="lbl">En estudio</span><span class="val" style="color:#b45309">${totalEst}</span><span class="sub">${totalAll > 0 ? Math.round(totalEst/totalAll*100) : 0}% del total</span></div>
  <div class="kpi"><span class="lbl">Contratados</span><span class="val" style="color:#0d7a50">${totalContr}</span><span class="sub">${totalAll > 0 ? Math.round(totalContr/totalAll*100) : 0}% del total</span></div>
  <div class="kpi"><span class="lbl">Tasa contratación</span><span class="val" style="color:#1240cc">${tasa}%</span><span class="sub">sobre total vehículos</span></div>
</div>
<div class="st">Resumen por categoría</div>
<table><thead><tr><th class="thl">Categoría</th><th>En estudio</th><th>Ofertados</th><th>Contratados</th><th>Total</th><th>Tasa contr.</th></tr></thead>
<tbody>${catRows}</tbody></table>
<div class="st">Detalle por tipología</div>
${detailBlocks}
<div class="fml"><div class="ft">Cómo se calculan los porcentajes</div><div class="fg">
  <div><div class="fl">Tasa contratación (KPI global)</div><div class="fc">contratados / total_vehículos × 100</div><div class="fd">Ej: ${totalContr} / ${totalAll} = ${tasa}%</div></div>
  <div><div class="fl">Tasa contr. por categoría</div><div class="fc">contratados_cat / total_cat × 100</div><div class="fd">Solo vehículos de esa categoría</div></div>
  <div><div class="fl">% s/ categoría (tipología)</div><div class="fc">total_tip / total_cat × 100</div><div class="fd">Peso de la tipología dentro de su categoría</div></div>
  <div><div class="fl">Fuente de datos</div><div class="fc">trabajoRows de todas las carpetas</div><div class="fd">Clasificado por tipo_vehiculo · sin tipo → Sin clasificar</div></div>
</div></div>
</div>
<div class="footer"><span>ORION · ${fecha}</span><span>Datos: todas las carpetas del período</span></div>
</div></body></html>`;
}

export default function VehiculosCategorias({ stats }: { stats: CatStats[] }) {
  const [open, setOpen] = useState(false);

  const handlePdf = useCallback(() => {
    const fecha = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(buildPdfHtml(stats, fecha));
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

  const thStyle: React.CSSProperties = {
    padding: '0 0 12px 0', fontSize: 10, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.12em',
    color: 'rgba(80,130,255,0.80)', borderBottom: '1px solid rgba(61,112,255,0.20)',
    textAlign: 'left',
  };

  return (
    <>
      {/* ── Tarjeta compacta — V4 style ── */}
      <div style={glass}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <button
            onClick={() => setOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            <h3 style={{ fontFamily: 'var(--font-display), Inter, sans-serif', fontWeight: 600, fontSize: 17, margin: 0, color: '#FFFFFF' }}>
              Vehículos por categoría
            </h3>
            <span style={{ fontSize: 11, color: 'rgba(80,130,255,0.80)', background: 'rgba(51,102,255,0.12)', border: '1px solid rgba(61,112,255,0.25)', padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap' }}>
              Ver informe →
            </span>
          </button>
          {totalVeh > 0 && (
            <span style={{ fontSize: 11, color: 'rgba(178,206,255,0.35)', background: 'rgba(51,102,255,0.1)', border: '1px solid rgba(51,102,255,0.2)', borderRadius: 6, padding: '4px 10px', letterSpacing: '0.06em' }}>
              {totalVeh.toLocaleString('es')} vehículos
            </span>
          )}
        </div>

        {totalVeh === 0 ? (
          <p style={{ color: 'rgba(178,198,245,0.38)', fontSize: 12, textAlign: 'center', padding: '40px 0', margin: 0 }}>Sin datos</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 480 }}>
              <colgroup>
                <col />
                <col style={{ width: 200 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 80 }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={thStyle}>Categoría</th>
                  <th style={thStyle}>Distribución</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>En estudio</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Contratados</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {visibleStats.map((c, i) => {
                  const pct = totalVeh > 0 ? Math.round((c.total / totalVeh) * 100) : 0;
                  return (
                    <tr
                      key={c.categoria}
                      onClick={() => setOpen(true)}
                      style={{ cursor: 'pointer', transition: 'background 0.15s' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(51,102,255,0.05)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                    >
                      <td style={{ padding: '16px 0', borderBottom: '1px solid rgba(61,112,255,0.07)', verticalAlign: 'middle' }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF' }}>{c.categoria}</div>
                        <div style={{ fontSize: 11, color: 'rgba(178,198,245,0.55)', marginTop: 2 }}>{c.subtitulo}</div>
                      </td>
                      <td style={{ padding: '16px 0 16px 8px', borderBottom: '1px solid rgba(61,112,255,0.07)', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ flex: 1, height: 6, background: 'rgba(61,112,255,0.10)', borderRadius: 99, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: CAT_COLORS[i] ?? '#3b82f6', borderRadius: 99 }} />
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(178,198,245,0.70)', whiteSpace: 'nowrap', minWidth: 36, textAlign: 'right' }}>{pct}%</span>
                        </div>
                      </td>
                      <td style={{ padding: '16px 0', borderBottom: '1px solid rgba(61,112,255,0.07)', textAlign: 'right', verticalAlign: 'middle' }}>
                        <span style={{ fontSize: 16, fontWeight: 700, color: '#f59e0b', fontVariantNumeric: 'tabular-nums' }}>{c.estudio}</span>
                      </td>
                      <td style={{ padding: '16px 0', borderBottom: '1px solid rgba(61,112,255,0.07)', textAlign: 'right', verticalAlign: 'middle' }}>
                        <span style={{ fontSize: 16, fontWeight: 700, color: '#10b981', fontVariantNumeric: 'tabular-nums' }}>{c.contratada}</span>
                      </td>
                      <td style={{ padding: '16px 0', borderBottom: '1px solid rgba(61,112,255,0.07)', textAlign: 'right', verticalAlign: 'middle' }}>
                        <span style={{ fontSize: 16, fontWeight: 600, color: 'rgba(178,198,245,0.70)', fontVariantNumeric: 'tabular-nums' }}>{c.total}</span>
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td style={{ padding: '12px 0', borderTop: '1px solid rgba(61,112,255,0.18)' }}>
                    <span style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(178,206,255,0.5)' }}>Total</span>
                  </td>
                  <td style={{ padding: '12px 0', borderTop: '1px solid rgba(61,112,255,0.18)' }} />
                  <td style={{ padding: '12px 0', borderTop: '1px solid rgba(61,112,255,0.18)', textAlign: 'right' }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: '#f59e0b' }}>{totalEst}</span>
                  </td>
                  <td style={{ padding: '12px 0', borderTop: '1px solid rgba(61,112,255,0.18)', textAlign: 'right' }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: '#10b981' }}>{totalContr}</span>
                  </td>
                  <td style={{ padding: '12px 0', borderTop: '1px solid rgba(61,112,255,0.18)', textAlign: 'right' }}>
                    <span style={{ fontSize: 16, fontWeight: 600, color: 'rgba(178,198,245,0.70)' }}>{totalVeh}</span>
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
          <div style={{ background: '#fff', borderRadius: 16, maxWidth: 860, width: '100%', overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.45)', marginBottom: 32 }}>

            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg, #0c1c52 0%, #1240cc 100%)', padding: '28px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <h1 style={{ fontSize: 20, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', marginBottom: 4 }}>Informe — Vehículos por Categoría</h1>
                <p style={{ fontSize: 11, color: 'rgba(178,206,255,0.7)', letterSpacing: '0.08em' }}>ORION · Análisis global del período</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>
                  {new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handlePdf} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 12, fontWeight: 500, padding: '7px 14px', borderRadius: 8, cursor: 'pointer', letterSpacing: '0.04em' }}>
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                      <path d="M6.5 1v8M3 6.5l3.5 3.5L10 6.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                      <path d="M1.5 11.5h10" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    Descargar PDF
                  </button>
                  <button onClick={() => setOpen(false)} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, cursor: 'pointer', color: '#fff', fontSize: 18, lineHeight: 1 }}>
                    ×
                  </button>
                </div>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: '28px 32px', fontFamily: 'Inter, -apple-system, sans-serif', color: '#0f1a2e' }}>

              {/* KPIs */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
                {([
                  { label: 'Total vehículos', val: totalVeh, sub: 'todos los estudios', color: '#0c1c52' },
                  { label: 'En estudio',      val: totalEst,   sub: `${totalVeh > 0 ? Math.round(totalEst/totalVeh*100) : 0}% del total`, color: '#b45309' },
                  { label: 'Contratados',     val: totalContr, sub: `${totalVeh > 0 ? Math.round(totalContr/totalVeh*100) : 0}% del total`, color: '#0d7a50' },
                  { label: 'Tasa contratación', val: `${totalVeh > 0 ? Math.round((totalContr / totalVeh) * 100) : 0}%`, sub: 'sobre total vehículos', color: '#1240cc' },
                ] as const).map(k => (
                  <div key={k.label} style={{ background: '#f8faff', border: '1px solid #dde6ff', borderRadius: 12, padding: '14px 16px' }}>
                    <span style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#6b7ea0', display: 'block' }}>{k.label}</span>
                    <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.04em', color: k.color, lineHeight: 1, display: 'block', marginTop: 4 }}>{k.val}</span>
                    <span style={{ fontSize: 10, color: '#8fa0c0', display: 'block', marginTop: 2 }}>{k.sub}</span>
                  </div>
                ))}
              </div>

              {/* Resumen */}
              <SecTitle>Resumen por categoría</SecTitle>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
                <thead>
                  <tr>
                    {(['Categoría', 'En estudio', 'Ofertados', 'Contratados', 'Total', 'Tasa contr.'] as const).map(h => (
                      <th key={h} style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8fa0c0', padding: '8px 12px', background: '#fafbff', borderBottom: '2px solid #dde6ff', textAlign: h === 'Categoría' ? 'left' : 'center' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stats.map(c => {
                    const t = c.total > 0 ? Math.round((c.contratada / c.total) * 100) : 0;
                    return (
                      <tr key={c.categoria} onMouseEnter={e => { e.currentTarget.style.background = '#f5f8ff'; }} onMouseLeave={e => { e.currentTarget.style.background = ''; }}>
                        <td style={{ padding: '12px', borderBottom: '1px solid #f0f4f8' }}>
                          <strong style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#0c1c52' }}>{c.categoria}</strong>
                          <span style={{ fontSize: 10, color: '#8fa0c0' }}>{c.subtitulo}</span>
                        </td>
                        <td style={{ padding: '12px', borderBottom: '1px solid #f0f4f8', textAlign: 'center' }}><Badge type="estudio">{c.estudio}</Badge></td>
                        <td style={{ padding: '12px', borderBottom: '1px solid #f0f4f8', textAlign: 'center' }}><Badge type="ofertada">{c.ofertada}</Badge></td>
                        <td style={{ padding: '12px', borderBottom: '1px solid #f0f4f8', textAlign: 'center' }}><Badge type="contratada">{c.contratada}</Badge></td>
                        <td style={{ padding: '12px', borderBottom: '1px solid #f0f4f8', textAlign: 'center', fontSize: 14 }}><strong>{c.total}</strong></td>
                        <td style={{ padding: '12px', borderBottom: '1px solid #f0f4f8', textAlign: 'center', fontSize: 14, fontWeight: 700, color: '#1240cc' }}>{t}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Detalle por tipología */}
              <SecTitle>Detalle por tipología</SecTitle>
              {stats.map((c, i) => {
                const t = c.total > 0 ? Math.round((c.contratada / c.total) * 100) : 0;
                return (
                  <div key={c.categoria} style={{ marginBottom: 24 }}>
                    <div style={{ background: '#f0f4ff', borderLeft: `4px solid ${CAT_BORDER[i] ?? '#1240cc'}`, padding: '8px 14px', borderRadius: '0 8px 8px 0', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: 13, fontWeight: 700, color: '#0c1c52' }}>{c.categoria}</strong>
                      <span style={{ fontSize: 11, color: '#6b7ea0' }}>{c.total} vehículos · {t}% contratación</span>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          {(['Tipología', 'En estudio', 'Ofertados', 'Contratados', 'Total', '% s/ cat.'] as const).map(h => (
                            <th key={h} style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8fa0c0', padding: '6px 12px', background: '#fafbff', borderTop: '1px solid #edf0f8', borderBottom: '1px solid #edf0f8', textAlign: h === 'Tipología' ? 'left' : 'center' }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {c.tipologias.map(tip => {
                          const pct = c.total > 0 ? Math.round((tip.total / c.total) * 100) : 0;
                          return (
                            <tr key={tip.tipologia} onMouseEnter={e => { e.currentTarget.style.background = '#f7f9ff'; }} onMouseLeave={e => { e.currentTarget.style.background = ''; }}>
                              <td style={{ padding: '11px 12px', borderBottom: '1px solid #f5f7fc', fontSize: 14, fontWeight: 600, color: '#2a3a5e' }}>{tip.tipologia}</td>
                              <td style={{ padding: '11px 12px', borderBottom: '1px solid #f5f7fc', textAlign: 'center' }}><Badge type="estudio" sm>{tip.estudio}</Badge></td>
                              <td style={{ padding: '11px 12px', borderBottom: '1px solid #f5f7fc', textAlign: 'center', fontSize: 14, color: '#2a3a5e' }}>{tip.ofertada}</td>
                              <td style={{ padding: '11px 12px', borderBottom: '1px solid #f5f7fc', textAlign: 'center' }}><Badge type="contratada" sm>{tip.contratada}</Badge></td>
                              <td style={{ padding: '11px 12px', borderBottom: '1px solid #f5f7fc', textAlign: 'center', fontSize: 14 }}><strong>{tip.total}</strong></td>
                              <td style={{ padding: '11px 12px', borderBottom: '1px solid #f5f7fc', textAlign: 'center', fontSize: 14, fontWeight: 700, color: '#1240cc' }}>{pct}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}

              {/* Fórmulas */}
              <div style={{ background: '#f8faff', border: '1px solid #dde6ff', borderRadius: 10, padding: '16px 20px' }}>
                <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#6b7ea0', marginBottom: 12, fontWeight: 700 }}>Cómo se calculan los porcentajes</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 28px' }}>
                  {[
                    { label: 'Tasa contratación (KPI global)',   code: 'contratados / total_vehículos × 100', desc: `Ej: ${totalContr} / ${totalVeh} = ${totalVeh > 0 ? Math.round((totalContr / totalVeh) * 100) : 0}%` },
                    { label: 'Tasa contr. por categoría',        code: 'contratados_cat / total_cat × 100',   desc: 'Solo vehículos de esa categoría' },
                    { label: '% s/ categoría (tipología)',       code: 'total_tip / total_cat × 100',         desc: 'Peso de la tipología dentro de su categoría' },
                    { label: 'Fuente de datos',                  code: 'trabajoRows de todas las carpetas',   desc: 'Clasificado por tipo_vehiculo · sin tipo → Sin clasificar' },
                  ].map(f => (
                    <div key={f.label}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#0c1c52', marginBottom: 2 }}>{f.label}</div>
                      <div style={{ fontSize: 11, color: '#6b7ea0', fontFamily: 'monospace', background: '#edf1ff', padding: '3px 7px', borderRadius: 4, display: 'inline-block' }}>{f.code}</div>
                      <div style={{ fontSize: 10, color: '#8fa0c0', marginTop: 2 }}>{f.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ borderTop: '1px solid #e8eef8', padding: '14px 32px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 10, color: '#8fa0c0' }}>ORION · {new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
              <span style={{ fontSize: 10, color: '#8fa0c0' }}>Datos: todas las carpetas del período</span>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
