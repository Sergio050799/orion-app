"use client";

import React, { useState, useCallback, useMemo, useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import { DataGrid, renderTextEditor } from 'react-data-grid';
import type { Column, RenderCellProps, RenderEditCellProps } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import { COBERTURA_OPTS, LUNAS_OPTS, AMBITO_OPTS } from '@/core/flotas';
import { nf, dec, eur } from '@/lib/fmt';
import { calcularPrima, type CalcPrimaParams, type TipoVehiculo, type Producto, type PrimasConfig } from '@/core/flotas/primas';
import { usePrimasConfig } from '@/core/flotas/primasContext';
import { aEmision, aOfertaRow, camposDe, franquiciasPermitidas, garantiasOferta, grupoCob, inferirConfig, normalizarConfig, pendientesEmision, productosPermitidos, resumenConfig, tipoKeyDesdeEtiqueta, PRODUCTO_DEF, type ConfigCobertura, type ProductoKey } from '@/core/flotas/catalogoCoberturas';
import { TIPO_INFO, type TipoKey } from '@/core/catalogo/tipologia';
import { DetailDrawer } from '@/components/saas/DetailDrawer';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface OfertaRow {
  _id: number;
  tomador: string;
  matricula: string;
  marca_modelo: string;
  tipo_vehiculo: string;
  uso: string;
  cv: string;
  prima_referencia: string;
  coberturas: string;
  lunas: string;
  asistencia: string;    // 'oro' | 'oro_plus' | 'no' | ''
  ambito: string;
  frq: string;
  animales: string;      // 'true' | ''
  isotermo: string;      // 'true' | ''
  perdida_total: string; // 'true' | ''
  oferta_prima_mmt: string;
  _primaOverride: string; // 'true' si usuario escribió a mano
  cob_solicitada: string; // cobertura que pidió el corredor (clave de la prima MMT del informe)
  _cfg: string;           // 'true' si las coberturas las fija la configuración confirmada en INFORME
}

export interface HojaOfertaHandle {
  getData: () => Record<string, string>[];
  setData: (data: Record<string, string>[]) => void;
}

interface OfertaFields {
  primaClienteTotal?: number;
  descuentoOferta?: number;
  descuentosCoberturas?: Record<string, number>;
}

interface Props {
  trabajoRows: Record<string, string>[];
  header?: { cif: string; tomador: string; actividad: string; formaPago: string; efecto: string; periodicidad?: string };
  carpetaId?: string;
  carpetaNombre?: string;
  primasMmt?: Record<string, number>;  // key: "TIPO||COBERTURA", value: prima media (from Informe)
  configCoberturas?: Record<string, ConfigCobertura>; // coberturas confirmadas en INFORME, key: "TIPO||COBERTURA SOLICITADA"
  onDataChange?: (data: Record<string, string>[]) => void;
  // Campos de carpeta para descuentos y prima cliente
  primaClienteTotal?: number;
  descuentoOferta?: number;
  descuentosCoberturas?: Record<string, number>;
  onOfertaFieldsChange?: (fields: OfertaFields) => void;
}

// ─── Mapeos para calcularPrima ──────────────────────────────────────────────

const TIPO_MAP: Record<string, TipoVehiculo> = {
  'turismo': 'turismo',
  'derivado de turismo': 'derivado_turismo',
  'derivado de todoterreno': 'derivado_todoterreno',
  'furgoneta': 'furgoneta',
  'furgón': 'furgon', 'furgon': 'furgon',
  'motocicleta': 'moto', 'moto': 'moto',
  'cabeza tractora': 'cabeza_tractora',
  'camión rígido': 'camion_rigido',
  'camion rigido': 'camion_rigido',
  'semirremolque': 'semirremolque',
  'industrial matriculado': 'industrial_matriculado',
  'industrial no matriculado': 'industrial_no_matriculado',
};

const PRODUCTO_MAP: Record<string, Producto> = {
  'terceros': 'terceros',
  'terceros ampliado': 'terceros_ampliado',
  'todo riesgo con franquicia': 'todo_riesgo',
};

const USO_MAP: Record<string, CalcPrimaParams['uso']> = {
  'particular': 'particular',
  'servicio público': 'servicio_publico',
  'servicio publico': 'servicio_publico',
  'transportes propios': 'transportes_propios',
};

const AMBITO_MAP: Record<string, CalcPrimaParams['ambito']> = {
  'nacional': 'nacional',
  'internacional': 'internacional',
};

// Tipos que aplican a cada checkbox
const NO_LUNAS_TIPOS = new Set(['semirremolque', 'industrial no matriculado']);
const ANIMALES_TIPOS = new Set<TipoVehiculo>([
  'turismo', 'derivado_turismo', 'derivado_todoterreno', 'furgoneta', 'furgon', 'moto',
  // 2.ª cat.: hoy el motor también lo cobra (ajuste plano 25 €).
  'cabeza_tractora', 'camion_rigido', 'semirremolque',
]);
const ISOTERMO_TIPOS = new Set(['camion_rigido', 'semirremolque']);
const PERDIDA_TOTAL_TIPOS = new Set(['cabeza_tractora', 'camion_rigido', 'semirremolque']);

function getTipoKey(tv: string): TipoVehiculo | null {
  return TIPO_MAP[tv.toLowerCase()] ?? null;
}

// ─── rowToPrimaParams ───────────────────────────────────────────────────────

function rowToPrimaParams(row: OfertaRow): CalcPrimaParams | null {
  const tipoVehiculo = getTipoKey(row.tipo_vehiculo);
  if (!tipoVehiculo) return null;

  // Determinar producto
  const cobLower = row.coberturas.toLowerCase();
  let producto = PRODUCTO_MAP[cobLower];
  if (!producto) return null;

  // Terceros + Lunas Sí: en 2.ª cat. existe fila `terceros_con_luna` (dato histórico). En 1.ª y 3.ª cat.
  // las lunas son un suplemento sobre Terceros (D11 03/11/2026).
  const lunasActive = ['sí', 'si', 'true', 's', 'oro'].includes((row.lunas ?? '').toLowerCase());
  const esCat2 = !!(tipoVehiculo === 'cabeza_tractora' || tipoVehiculo === 'camion_rigido' ||
                     tipoVehiculo === 'semirremolque' || tipoVehiculo === 'industrial_matriculado' ||
                     tipoVehiculo === 'industrial_no_matriculado');
  if (producto === 'terceros' && lunasActive && esCat2) {
    producto = 'terceros_con_luna';
  }

  const uso = USO_MAP[row.uso.toLowerCase()];
  const ambito = AMBITO_MAP[row.ambito.toLowerCase()];
  const franquicia = producto === 'todo_riesgo' ? (parseFloat(row.frq) || undefined) : undefined;

  // Asistencia: 1.ª cat + moto → no/oro/oro_plus/platino · 2.ª cat → no/nacional/internacional.
  // Fix 18/11: si en 2.ª cat llega 'sí/oro' genérico, mapear según el ÁMBITO del vehículo.
  // Antes se quedaba en 'oro' y el motor cat2 lo ignoraba (devolvía 0, no sumaba asistencia).
  // Fix 18/11 bis: en 2.ª cat, si la asistencia viene como valor específico 'nacional'/'internacional',
  // RESPETAR el ÁMBITO del vehículo aunque el texto diga otra cosa. Así, si una fila trae
  // ambito=internacional pero asistencia='nacional' (porque el corredor puso todo igual),
  // se corrige automáticamente a internacional (regla de negocio del jefe 18/11).
  const asistVal = (row.asistencia ?? '').toLowerCase();
  const asistenciaMarcada = ['oro', 'sí', 'si', 'true', 's', 'nacional', 'internacional'].includes(asistVal);
  type Niv = 'no' | 'oro' | 'oro_plus' | 'platino' | 'nacional' | 'internacional';
  const asistencia: Niv =
    asistVal === 'oro_plus'     ? 'oro_plus' :
    asistVal === 'platino'      ? 'platino' :
    esCat2 && asistenciaMarcada
      ? (ambito === 'internacional' ? 'internacional' : 'nacional')   // 2.ª cat → siempre según ámbito del vehículo
      : asistVal === 'nacional'     ? 'nacional'
      : asistVal === 'internacional'? 'internacional'
      : asistenciaMarcada            ? 'oro'                           // 1.ª cat / moto default
      : 'no';

  return {
    tipoVehiculo,
    producto,
    uso,
    ambito,
    franquicia,
    asistencia,
    animales: row.animales === 'true',
    lunas: lunasActive && !esCat2,          // 1.ª / 3.ª cat.: suplemento
    isotermo: row.isotermo === 'true',
    perdidaTotal: row.perdida_total === 'true',
  };
}

// ─── Calcula prima para una fila ────────────────────────────────────────────

function calcPrimaForRow(row: OfertaRow, config?: PrimasConfig | null): string {
  const params = rowToPrimaParams(row);
  if (!params) return '';
  const result = calcularPrima(params, config);
  if (result === null) return '';
  return String(result);
}

// Franquicia legible («1.800 €») solo si la cobertura la lleva; vacío si no aplica.
const frqTexto = (r: Pick<OfertaRow, 'coberturas' | 'frq'>) => {
  if (!/franquicia/i.test(r.coberturas ?? '') || !r.frq) return '';
  const n = parseFloat(String(r.frq).replace(',', '.'));
  return n > 0 ? `${nf(n)} €` : '';
};

// ─── PDF builder ─────────────────────────────────────────────────────────────

// Base de la oferta (03/11/2026, D4): Seguro del Conductor ya no viaja por defecto, se añade solo si se
// contrata explícitamente.
const BASE_GARANTIAS_OFERTA = [
  'Responsabilidad civil obligatoria',
  'Responsabilidad civil voluntaria (hasta 50 millones)',
  'Defensa jurídica y reclamación de daños',
];

function buildOfertaPdfHtml(data: {
  rows: OfertaRow[];
  header?: Props['header'];
  carpetaNombre?: string;
  cobAnexo: { titulo: string; tipologias: string[]; garantias: string[] }[];
  primaTotal: number;
}): string {
  const { rows, header, carpetaNombre, cobAnexo, primaTotal } = data;
  const fmtE = (n: number) => eur(n, 2);
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const today = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const fleetName = (carpetaNombre ?? '').trim() || (header?.tomador ?? '').trim() || 'Flota';

  const veh = rows.filter(r => r.matricula.trim());
  const primaDe = (r: OfertaRow) => parseFloat(r.oferta_prima_mmt) || 0;
  const tipoDe = (r: OfertaRow) => (r.tipo_vehiculo || 'Sin tipo').toUpperCase();
  const cobDe = (r: OfertaRow) => r.coberturas || 'Sin cobertura';

  // Resumen por tipología y cobertura
  const grupos = new Map<string, { tipo: string; cob: string; n: number; total: number }>();
  veh.forEach(r => {
    const k = `${tipoDe(r)}||${cobDe(r)}`;
    const g = grupos.get(k) ?? { tipo: tipoDe(r), cob: cobDe(r), n: 0, total: 0 };
    g.n += 1; g.total += primaDe(r);
    grupos.set(k, g);
  });
  const gruposArr = [...grupos.values()].sort((a, b) => a.tipo.localeCompare(b.tipo) || a.cob.localeCompare(b.cob));

  // Resumen por cobertura
  const porCob = new Map<string, { n: number; total: number }>();
  veh.forEach(r => {
    const g = porCob.get(cobDe(r)) ?? { n: 0, total: 0 };
    g.n += 1; g.total += primaDe(r);
    porCob.set(cobDe(r), g);
  });
  const cobArr = [...porCob.entries()].sort((a, b) => b[1].total - a[1].total);
  const sumTotal = cobArr.reduce((a, [, g]) => a + g.total, 0);
  const nTipos = new Set(veh.map(tipoDe)).size;

  const efecto = parseFecha(header?.efecto) || '—';
  const periodicidad = (header?.periodicidad ?? 'anual');

  // ── Contenido de origen ─────────────────────────────────────────────────
  // La paginación se hace en el propio documento midiendo la altura REAL de cada bloque (ver PAGINADOR),
  // así las tablas se parten por filas y las coberturas se reparten en 2 columnas, 2 o 4 por hoja, sin solaparse.
  const tbl = (head: string[], body: string[][], widths: string[], tot?: string[], wrap: number[] = []) => {
    const cell = (c: string, i: number) => `<td${i === 0 ? ' class="l"' : wrap.includes(i) ? ' class="w"' : ''}>${c}</td>`;
    const th = head.map((h, i) => `<th${i === 0 ? ' class="l"' : ''}>${h}</th>`).join('');
    const tr = body.map(r => `<tr>${r.map(cell).join('')}</tr>`).join('');
    const tf = tot ? `<tfoot><tr class="total">${tot.map(cell).join('')}</tr></tfoot>` : '';
    return `<table class="tb"><colgroup>${widths.map(w => `<col style="width:${w}">`).join('')}</colgroup><thead><tr>${th}</tr></thead><tbody>${tr}</tbody>${tf}</table>`;
  };
  const items: string[] = [];
  const addTable = (titulo: string, head: string[], rowsData: string[][], widths: string[], tot?: string[], wrap: number[] = []) => {
    items.push(`<section class="it tsec" data-t="${esc(titulo)}">${tbl(head, rowsData, widths, tot, wrap)}</section>`);
  };

  // Datos + KPIs
  const kpi = (l: string, v: string) => `<div><small>${l}</small><strong>${v}</strong></div>`;
  items.push(`<div class="it blk"><div class="kicker">OFERTA</div>
<h1>Oferta para la flota ${esc(fleetName)}</h1>
<p class="sub">${esc((header?.tomador ?? '').toUpperCase())}${header?.cif ? ` · ${esc(header.cif.toUpperCase())}` : ''}</p>
<div class="data">
  ${kpi('Fecha de efecto', efecto)}${kpi('Periodicidad', esc(periodicidad.charAt(0).toUpperCase() + periodicidad.slice(1)))}${kpi('Fecha de emisión', today)}
</div>
<div class="kb">
  ${kpi('Vehículos', nf(veh.length))}${kpi('Tipologías', nf(nTipos))}${kpi('Coberturas', nf(porCob.size))}${kpi('Prima total anual', fmtE(primaTotal))}
</div></div>`);

  addTable('1 · Resumen de primas por tipología y cobertura',
    ['Tipología y cobertura', 'Vehículos', 'Prima media', 'Prima total'],
    gruposArr.map(g => [`<b>${esc(g.tipo)}</b><span class="mi">${esc(g.cob)}</span>`, nf(g.n), g.n ? fmtE(g.total / g.n) : '—', fmtE(g.total)]),
    ['46%', '14%', '20%', '20%'],
    ['Total', nf(veh.length), '—', fmtE(sumTotal)]);

  addTable('2 · Resumen por cobertura',
    ['Cobertura', 'Vehículos', 'Prima total', '% de la prima'],
    cobArr.map(([c, g]) => [esc(c), nf(g.n), fmtE(g.total), sumTotal > 0 ? dec(g.total / sumTotal * 100, 1) + ' %' : '—']),
    ['46%', '14%', '20%', '20%'],
    ['Total', nf(veh.length), fmtE(sumTotal), sumTotal > 0 ? '100 %' : '—']);

  // Coberturas incluidas (solo nombres): tarjetas que se reparten en 2 columnas
  if (cobAnexo.length > 0) {
    const cov = (c: { titulo: string; tipologias: string[]; garantias: string[] }) =>
      `<div class="cv"><h3>${esc(c.titulo)}</h3>${c.tipologias.length ? `<div class="ty">${esc(c.tipologias.join(' · '))}</div>` : ''}<ul>${c.garantias.map(g => `<li>${esc(g)}</li>`).join('')}</ul></div>`;
    items.push(`<section class="it csec" data-t="3 · Coberturas incluidas">${cobAnexo.map(cov).join('')}</section>`);
  }

  // Detalle por vehículo
  const detRows = veh.map(r => [
    `<b class="mt">${esc(r.matricula)}</b>`,
    esc(tipoDe(r)),
    esc(r.marca_modelo || '—'),
    esc(cobDe(r)),
    frqTexto(r) || '—',
    r.oferta_prima_mmt ? fmtE(primaDe(r)) : '—',
  ]);
  addTable('4 · Detalle por vehículo',
    ['Matrícula', 'Tipología', 'Marca y modelo', 'Cobertura', 'Franquicia', 'Prima'],
    detRows, ['13%', '16%', '23%', '22%', '12%', '14%'], ['Total', '', '', '', '', fmtE(primaTotal)], [1, 2, 3]);

  // PAGINADOR: se ejecuta al cargar. Mide en mm reales, coloca cada bloque donde cabe y reparte tablas y tarjetas.
  const PAGINADOR = `(function(){
var src=document.getElementById('src'),out=document.getElementById('out');
var fleet=src.getAttribute('data-fleet')||'';
var pr=document.createElement('div');pr.style.cssText='position:absolute;visibility:hidden;height:100mm;width:1px';document.body.appendChild(pr);
var MM=pr.offsetHeight/100;document.body.removeChild(pr);
var pages=[],cur=null;
function esc(t){return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function newPage(){
  var slim=pages.length>0,a=document.createElement('article');a.className='page';
  a.innerHTML='<div class="band'+(slim?' slim':'')+'"><img src="/LOGOMMT.jpg" alt="MMT Seguros" onerror="this.style.display=\\'none\\'"><span>'+(slim?esc(fleet):'Oferta de seguro de flotas')+'</span></div><div class="body"><div class="inner"></div></div><div class="footer"><span>Documento confidencial</span><span class="pn"></span></div>';
  out.appendChild(a);
  cur={el:a,inner:a.querySelector('.inner'),limit:(297-(slim?18:30)-8-22)*MM};pages.push(cur);
}
function over(){return cur.inner.offsetHeight>cur.limit;}
function alone(){return cur.inner.children.length<=1;}
function placeBlock(b){var n=b.cloneNode(true);cur.inner.appendChild(n);if(over()&&!alone()){cur.inner.removeChild(n);newPage();cur.inner.appendChild(n);}}
function placeTable(sec){
  var title=sec.getAttribute('data-t'),rows=[].slice.call(sec.querySelectorAll('tbody tr')),foot=sec.querySelector('tfoot tr');
  var cg=sec.querySelector('colgroup').outerHTML,th=sec.querySelector('thead').outerHTML;
  var i=0,first=true;
  while(i<rows.length||(first&&rows.length===0)){
    var s=document.createElement('section');
    s.innerHTML='<h2>'+title+(first?'':' <em>(continúa)</em>')+'</h2><table class="tb">'+cg+th+'<tbody></tbody></table>';
    var tb=s.querySelector('tbody'),tab=s.querySelector('table'),placed=0;
    cur.inner.appendChild(s);
    while(i<rows.length){tb.appendChild(rows[i].cloneNode(true));if(over()){tb.removeChild(tb.lastChild);break;}i++;placed++;}
    if(placed===0&&rows.length>0){
      if(!alone()){cur.inner.removeChild(s);newPage();continue;}
      tb.appendChild(rows[i].cloneNode(true));i++;placed++;
    }
    if(i>=rows.length&&foot){
      var f=document.createElement('tfoot');f.appendChild(foot.cloneNode(true));tab.appendChild(f);
      if(over()){
        tab.removeChild(f);
        if(placed>1){tb.removeChild(tb.lastChild);i--;}
        else if(!alone()){cur.inner.removeChild(s);i-=placed;newPage();continue;}
        else{tab.appendChild(f);}
      }
    }
    first=false;
    if(i<rows.length)newPage();
  }
}
function placeCovers(sec){
  var title=sec.getAttribute('data-t'),cards=[].slice.call(sec.querySelectorAll('.cv')),first=true,g=null,cols=null,count=0;
  function mk(){g=document.createElement('section');g.innerHTML='<h2>'+title+(first?'':' <em>(continúa)</em>')+'</h2><div class="cg"><div class="col"></div><div class="col"></div></div>';cur.inner.appendChild(g);cols=g.querySelectorAll('.col');count=0;}
  function tryPlace(c){
    var order=[cols[0],cols[1]].sort(function(a,b){return a.offsetHeight-b.offsetHeight;});
    for(var k=0;k<2;k++){var n=c.cloneNode(true);order[k].appendChild(n);if(!over()){count++;return true;}order[k].removeChild(n);}
    return false;
  }
  var q=cards.slice();
  function placeAny(){for(var qi=0;qi<q.length;qi++){if(tryPlace(q[qi])){q.splice(qi,1);return true;}}return false;}
  mk();
  while(q.length){
    if(placeAny())continue;
    if(count===0&&!alone()){cur.inner.removeChild(g);newPage();mk();}
    else{first=false;newPage();mk();}
    if(!placeAny()){cols[0].appendChild(q.shift().cloneNode(true));count++;}
  }
}
newPage();
[].slice.call(src.children).forEach(function(it){
  if(it.classList.contains('tsec'))placeTable(it);
  else if(it.classList.contains('csec'))placeCovers(it);
  else placeBlock(it);
});
var N=pages.length;
pages.forEach(function(p,i){p.el.querySelector('.pn').textContent='Página '+(i+1)+' de '+N;});
src.parentNode.removeChild(src);
setTimeout(function(){window.print();},350);
})();`;

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>Oferta ${esc(fleetName)}</title>
<style>
@page{size:A4;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
:root{--ink:#18243a;--muted:#5d6b82;--line:#d6deea;--soft:#f7f9fd;--blue:#002F82;--tot:#eaf0fa}
html,body,.page,.page *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}
html{background:#e8ebef}
body{font-family:Arial,Helvetica,sans-serif;color:var(--ink);font-size:11px}
.page{width:210mm;height:297mm;background:#fff;margin:0 auto 20px;position:relative;overflow:hidden;box-shadow:0 7px 35px rgba(15,19,28,.15)}
.band{background:var(--blue);height:30mm;display:flex;align-items:center;justify-content:space-between;padding:0 12.5mm;color:#fff}
.band img{height:17mm;object-fit:contain}
.band span{font-size:15px;font-weight:700;letter-spacing:.02em}
.band.slim{height:18mm}.band.slim img{height:10mm}.band.slim span{font-size:11px;font-weight:600}
.body{padding:8mm 12.5mm 0}
.inner{display:flow-root}
#src{display:none}
.kicker{font-size:10px;letter-spacing:.18em;font-weight:750;color:var(--blue);margin-bottom:5px}
h1{font-size:22px;line-height:1.1;letter-spacing:-.03em;font-weight:800;margin-bottom:5px}
.sub{font-size:11px;color:var(--muted)}
.data,.kb{display:grid;grid-template-columns:repeat(4,1fr);margin-top:10px;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.data{grid-template-columns:repeat(3,1fr)}
.kb{background:var(--soft);margin-top:8px}
.data>div,.kb>div{padding:8px 8px;border-right:1px solid var(--line)}
.data>div:first-child,.kb>div:first-child{padding-left:0}
.data>div:last-child,.kb>div:last-child{border:0}
small{display:block;font-size:8.6px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:750;margin-bottom:4px}
.data strong{font-size:12px}
.kb strong{font-size:16px;color:var(--blue);white-space:nowrap}
section{margin-top:12px}
h2{font-size:13.5px;font-weight:780;color:var(--blue);margin-bottom:7px}
h2 em{font-style:normal;font-weight:400;font-size:10px;color:var(--muted)}
.tb{width:100%;border-collapse:collapse;table-layout:fixed;font-size:10.6px}
.tb th{background:var(--blue);color:#fff;padding:7px 7px;font-size:9.2px;font-weight:750;text-align:center}
.tb td{padding:6px 7px;border-bottom:1px solid var(--line);text-align:center;white-space:nowrap;font-variant-numeric:tabular-nums}
.tb th.l,.tb td.l{text-align:left}
.tb td.l,.tb td.w{white-space:normal;overflow-wrap:anywhere}
.tb tbody tr:nth-child(even):not(.total) td{background:var(--soft)}
.tb .total td{font-weight:800;background:var(--tot);border-top:1.5px solid var(--blue)}
.mi{display:block;font-size:9.4px;color:var(--muted);margin-top:2px}
.mt{letter-spacing:.04em;color:var(--blue)}
.cg{display:flex;gap:6mm;margin-top:6px;align-items:flex-start}
.cg .col{flex:1;min-width:0;display:flex;flex-direction:column;gap:5mm}
.cv{border-top:2px solid var(--blue);padding-top:6px;break-inside:avoid}
.cv h3{font-size:12.5px;font-weight:800;margin-bottom:3px}
.ty{font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;padding-bottom:5px;border-bottom:1px solid var(--line)}
.cv ul{list-style:none}
.cv li{display:flex;gap:8px;padding:4px 0;border-bottom:1px solid var(--line);font-size:10.4px;line-height:1.3}
.cv li::before{content:"✓";color:var(--blue);font-weight:800;flex:none}
.footer{position:absolute;bottom:8mm;left:12.5mm;right:12.5mm;border-top:1px solid var(--line);padding-top:7px;display:flex;justify-content:space-between;color:var(--muted);font-size:9px}
@media print{html,body{background:#fff}.page{margin:0;box-shadow:none;height:296mm;break-after:page;page-break-after:always}.page:last-child{break-after:auto;page-break-after:auto}}
</style></head><body>
<div id="src" data-fleet="${esc(fleetName).replace(/"/g, '&quot;')}">${items.join('\n')}</div>
<div id="out"></div>
<script>${PAGINADOR}</script>
</body></html>`;
}

// ─── DropdownEditor ────────────────────────────────────────────────────────────

function DropdownEditor({ options, row, column, onRowChange, onClose }: RenderEditCellProps<OfertaRow> & { options: string[] }) {
  return (
    <select
      autoFocus
      value={String((row as unknown as Record<string, string>)[column.key] ?? '')}
      onChange={e => {
        onRowChange({ ...row, [column.key]: e.target.value });
        onClose(true);
      }}
      style={{ width: '100%', height: '100%', border: 'none', outline: 'none', fontSize: 12, padding: '0 8px', background: '#fff', cursor: 'pointer' }}>
      <option value="">—</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// ─── CheckboxCell ───────────────────────────────────────────────────────────

function CheckboxCell({ row, columnKey, enabled, onToggle }: {
  row: OfertaRow; columnKey: string; enabled: boolean;
  onToggle: (row: OfertaRow, key: string) => void;
}) {
  const checked = (row as unknown as Record<string, string>)[columnKey] === 'true';
  if (!enabled) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6' }}>
        <span style={{ color: '#d1d5db', fontSize: 10 }}>—</span>
      </div>
    );
  }
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: row._cfg === 'true' ? 'default' : 'pointer', opacity: row._cfg === 'true' ? 0.65 : 1 }}
      title={row._cfg === 'true' ? 'Definido en INFORME' : undefined}
      onClick={() => { if (row._cfg !== 'true') onToggle(row, columnKey); }}>
      <div style={{
        width: 16, height: 16, borderRadius: 4,
        border: checked ? '2px solid #1240CC' : '2px solid #d1d5db',
        background: checked ? '#1240CC' : '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.1s',
      }}>
        {checked && (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.5l2.2 2.2L9.5 3.8"/></svg>
        )}
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseFecha(raw: unknown): string {
  if (!raw) return '';
  const s = String(raw);
  if (!s || s === 'undefined' || s === 'null') return '';
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return s;
  const n = Number(s);
  if (!isNaN(n) && Number.isInteger(n) && n > 40000 && n < 70000) {
    const d = new Date((n - 25569) * 86400 * 1000);
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }
  return s;
}

function trabajoToOferta(rows: Record<string, string>[]): OfertaRow[] {
  return rows
    .filter(r => r['matricula']?.trim())
    .map((r, i) => ({
      _id: i,
      tomador:         r['tomador'] ?? '',
      matricula:       (r['matricula'] ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase(),
      marca_modelo:    `${r['marca'] ?? ''} ${r['modelo'] ?? ''}`.trim(),
      tipo_vehiculo:   r['tipo_vehiculo']          ?? '',
      uso:             r['uso']                    ?? '',
      cv:              r['cv']                     ?? '',
      prima_referencia: r['prima_referencia']       ?? '',
      coberturas:      r['coberturas_solicitadas'] ?? '',
      lunas:           NO_LUNAS_TIPOS.has((r['tipo_vehiculo'] ?? '').toLowerCase()) ? 'No' : (r['lunas'] ?? ''),
      asistencia:      r['asistencia']             ?? '',
      ambito:          r['ambito']                 ?? '',
      frq:             r['frq']                    ?? '',
      animales:        '',
      isotermo:        '',
      perdida_total:   '',
      oferta_prima_mmt: '',
      _primaOverride:  '',
      cob_solicitada:  r['coberturas_solicitadas'] ?? '',
      _cfg:            '',
    }));
}

function rowToRecord(row: OfertaRow): Record<string, string> {
  const { _id, ...rest } = row;
  void _id;
  return rest;
}

const PRODUCTO_LABEL_OFERTA: Record<ConfigCobertura['producto'], string> = {
  terceros: 'Terceros', terceros_ampliado: 'Terceros ampliado', todo_riesgo: 'Todo riesgo con franquicia',
  moto_terceros: 'Terceros', moto_ampliado: 'Terceros ampliado con franquicia',
};
const ORDEN_PRODUCTO: Record<ConfigCobertura['producto'], number> = {
  terceros: 0, terceros_ampliado: 1, todo_riesgo: 2, moto_terceros: 3, moto_ampliado: 4,
};

// Clave de INFORME de una fila: «TIPO||Cobertura solicitada».
const tipoNormDe = (tv: string) => (tv || '').toUpperCase().trim() || 'SIN TIPO';
const claveInforme = (row: Pick<OfertaRow, 'tipo_vehiculo' | 'cob_solicitada' | 'coberturas'>) =>
  `${tipoNormDe(row.tipo_vehiculo)}||${row.cob_solicitada || row.coberturas || 'Sin cobertura'}`;

// ─── HojaOferta ───────────────────────────────────────────────────────────────

const HojaOferta = forwardRef<HojaOfertaHandle, Props>(function HojaOferta(
  { trabajoRows, header, carpetaId, carpetaNombre, primasMmt, configCoberturas, onDataChange, primaClienteTotal, descuentoOferta, descuentosCoberturas, onOfertaFieldsChange },
  ref,
) {
  // Primas config del admin (Bug fix 18/11: calcPrimaForRow ignoraba el config y siempre usaba fallback hardcoded)
  const primasConfig = usePrimasConfig();
  const primasConfigRef = useRef<PrimasConfig | null>(primasConfig);
  primasConfigRef.current = primasConfig;

  const [rows, setRows] = useState<OfertaRow[]>([]);
  const [seeded, setSeeded] = useState(false);
  const onDataChangeRef = useRef(onDataChange);
  onDataChangeRef.current = onDataChange;
  // Saved user edits from carpeta (keyed by matrícula)
  const savedEditsRef = useRef<Map<string, Partial<OfertaRow>>>(new Map());
  const [editsVersion, setEditsVersion] = useState(0);

  // ─── Ajustes de oferta ────────────────────────────────────────────────────
  const [localDescuento, setLocalDescuento] = useState('');
  const [localDescCob, setLocalDescCob] = useState<Record<string, string>>({});
  const onOfertaFieldsRef = useRef(onOfertaFieldsChange);
  onOfertaFieldsRef.current = onOfertaFieldsChange;

  // ─── Cambio de coberturas por matrícula ──────────────────────────────────
  // Mismo drawer que el Informe (producto, franquicia, defensa, asistencia con
  // sus variantes, seguro conductor, lunas, animales). Se aplica a las matrículas
  // seleccionadas de la tipología mostrada en el drawer.
  const [selMats, setSelMats] = useState<Set<number>>(new Set());
  const [drawerTipo, setDrawerTipo] = useState<TipoKey | null>(null);
  const [drawerDraft, setDrawerDraft] = useState<ConfigCobertura | null>(null);
  const [drawerAviso, setDrawerAviso] = useState('');

  // Sync props → local state SOLO cuando cambia la carpeta activa.
  // Antes se resincronizaba en cada cambio de las props de descuento, lo que pisaba lo que el usuario
  // estaba escribiendo cuando el padre re-renderizaba (heartbeat, refetch de carpetas, etc.).
  const lastCarpetaIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (lastCarpetaIdRef.current === carpetaId) return;
    lastCarpetaIdRef.current = carpetaId;
    setLocalDescuento(descuentoOferta != null ? String(descuentoOferta) : '');
    const cobMap: Record<string, string> = {};
    if (descuentosCoberturas) {
      for (const [k, v] of Object.entries(descuentosCoberturas)) cobMap[k] = String(v);
    }
    setLocalDescCob(cobMap);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carpetaId]);

  const emitAjustes = useCallback((fields: OfertaFields) => {
    onOfertaFieldsRef.current?.(fields);
  }, []);

  // Coberturas únicas presentes en la oferta
  const coberturasList = useMemo(() => {
    const seen = new Set<string>();
    for (const r of rows) if (r.coberturas) seen.add(r.coberturas);
    return [...seen].sort();
  }, [rows]);

  // Always rebuild oferta from trabajo + merge user edits
  useEffect(() => {
    if (trabajoRows.length === 0) return;

    const fromTrabajo = trabajoToOferta(trabajoRows);
    const savedEdits = savedEditsRef.current;

    // On first seed or always: rebuild from trabajo, merging user edits
    const existingByMat = new Map(rows.map(r => [r.matricula, r]));

    const rebuilt = fromTrabajo.map((src, i) => {
      // Check if we have user edits from saved oferta data
      const saved = savedEdits.get(src.matricula);
      // Check if we have existing row with user edits made in this session
      const existing = existingByMat.get(src.matricula);

      const row: OfertaRow = {
        ...src,
        _id: i,
        // Prefer trabajo data for identification fields (always fresh)
        matricula: src.matricula,
        marca_modelo: src.marca_modelo,
        tipo_vehiculo: src.tipo_vehiculo,
        uso: src.uso,
        cv: src.cv,
        // For cotización fields: existing session edit > saved edit > trabajo data
        coberturas: existing?.coberturas || saved?.coberturas || src.coberturas,
        lunas: existing?.lunas || saved?.lunas || src.lunas,
        asistencia: existing?.asistencia || saved?.asistencia || src.asistencia,
        ambito: existing?.ambito || saved?.ambito || src.ambito,
        frq: existing?.frq || saved?.frq || src.frq,
        // Checkboxes + prima: only from existing/saved (not in trabajo)
        animales: existing?.animales || saved?.animales || '',
        isotermo: existing?.isotermo || saved?.isotermo || '',
        perdida_total: existing?.perdida_total || saved?.perdida_total || '',
        oferta_prima_mmt: existing?.oferta_prima_mmt || saved?.oferta_prima_mmt || '',
        _primaOverride: existing?._primaOverride || saved?._primaOverride || '',
      };

      // Force lunas='No' for types that can't have lunas
      if (NO_LUNAS_TIPOS.has(row.tipo_vehiculo.toLowerCase())) row.lunas = 'No';

      // Coberturas confirmadas en INFORME: mandan sobre lo que pidió el corredor y sobre ediciones antiguas
      const claveInf = claveInforme(src);
      const cfg = normalizarConfig(tipoKeyDesdeEtiqueta(tipoNormDe(src.tipo_vehiculo)), configCoberturas?.[claveInf]);
      if (cfg) {
        const o = aOfertaRow(tipoKeyDesdeEtiqueta(tipoNormDe(src.tipo_vehiculo)), cfg);
        row.coberturas = o.coberturas; row.frq = o.frq; row.lunas = o.lunas; row.asistencia = o.asistencia;
        row.animales = o.animales; row.perdida_total = o.perdida_total;
        row._cfg = 'true';
        // La prima la fija el informe (prima MMT del grupo) salvo que alguien la haya escrito a mano en la oferta
        const informePrima = primasMmt?.[claveInf];
        if (informePrima && row._primaOverride !== 'true') {
          row.oferta_prima_mmt = String(informePrima);
          return row;
        }
      }

      // Prima priority:
      // 1. Si hay prima guardada (saved o existing) → respetarla siempre
      // 2. Solo auto-calc si no hay ninguna prima guardada en absoluto
      const hasSavedPrima = !!(saved?.oferta_prima_mmt || existing?.oferta_prima_mmt);
      if (!hasSavedPrima) {
        const auto = calcPrimaForRow(row, primasConfigRef.current);
        if (auto) {
          row.oferta_prima_mmt = auto;
        } else {
          const informePrima = primasMmt?.[claveInforme(row)];
          row.oferta_prima_mmt = informePrima ? String(informePrima) : '';
        }
      }

      return row;
    });

    setRows(rebuilt);
    if (!seeded) setSeeded(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trabajoRows, editsVersion, primasMmt, configCoberturas]);

  // Notify parent of changes
  useEffect(() => {
    if (!seeded) return;
    const timer = setTimeout(() => {
      onDataChangeRef.current?.(rows.map(rowToRecord));
    }, 300);
    return () => clearTimeout(timer);
  }, [rows, seeded]);

  useImperativeHandle(ref, () => ({
    getData: () => rows.map(rowToRecord),
    setData: (data) => {
      // Store saved user edits keyed by matrícula — the useEffect will merge them
      const edits = new Map<string, Partial<OfertaRow>>();
      for (const r of data) {
        const mat = (r['matricula'] ?? '').trim();
        if (!mat) continue;
        edits.set(mat, {
          coberturas:       r['coberturas']        ?? '',
          lunas:            r['lunas']             ?? '',
          asistencia:       r['asistencia']        ?? '',
          ambito:           r['ambito']            ?? '',
          frq:              r['frq']               ?? '',
          animales:         r['animales']          ?? '',
          isotermo:         r['isotermo']          ?? '',
          perdida_total:    r['perdida_total']     ?? '',
          oferta_prima_mmt: r['oferta_prima_mmt']  ?? '',
          _primaOverride:   r['_primaOverride']    ?? '',
        });
      }
      savedEditsRef.current = edits;
      // Bump version to trigger useEffect rebuild with these edits merged
      setEditsVersion(v => v + 1);
    },
  }));

  // Recalculate prima when relevant fields change (via handleRowsChange)
  const handleRowsChange = useCallback((newRows: OfertaRow[]) => {
    const recalculated = newRows.map((row, i) => {
      const prev = rows[i];
      if (!prev) return row;

      // Detect if user manually edited oferta_prima_mmt
      const primaChanged = row.oferta_prima_mmt !== prev.oferta_prima_mmt;
      const primaFieldsChanged =
        row.coberturas !== prev.coberturas ||
        row.lunas !== prev.lunas ||
        row.ambito !== prev.ambito ||
        row.frq !== prev.frq ||
        row.animales !== prev.animales ||
        row.isotermo !== prev.isotermo ||
        row.perdida_total !== prev.perdida_total;

      if (primaChanged && !primaFieldsChanged) {
        // User typed in the prima field manually
        if (row.oferta_prima_mmt.trim() === '') {
          // User cleared → back to auto
          const auto = calcPrimaForRow(row, primasConfigRef.current);
          return { ...row, oferta_prima_mmt: auto, _primaOverride: '' };
        }
        return { ...row, _primaOverride: 'true' };
      }

      if (primaFieldsChanged && row._primaOverride !== 'true') {
        // Auto-recalc
        const auto = calcPrimaForRow(row, primasConfigRef.current);
        return { ...row, oferta_prima_mmt: auto };
      }

      return row;
    });
    setRows(recalculated);
  }, [rows]);

  // Toggle checkbox handler
  const handleCheckboxToggle = useCallback((row: OfertaRow, key: string) => {
    const current = (row as unknown as Record<string, string>)[key] === 'true';
    const updated = { ...row, [key]: current ? '' : 'true' };
    // Recalc prima if not overridden
    if (updated._primaOverride !== 'true') {
      updated.oferta_prima_mmt = calcPrimaForRow(updated, primasConfigRef.current);
    }
    setRows(prev => prev.map(r => r._id === row._id ? updated : r));
  }, []);

  // Prima total
  const primaTotal = useMemo(() => {
    return rows.reduce((sum, r) => {
      const v = parseFloat(r.oferta_prima_mmt);
      return sum + (isNaN(v) ? 0 : v);
    }, 0);
  }, [rows]);

  // Ajuste aplicable a una fila: cobertura (si hay) prioriza sobre global.
  // Las primas con override manual (precio propio) NO se ajustan — el override es inmutable.
  const ajusteAplicable = useCallback((r: OfertaRow): number => {
    if (r._primaOverride === 'true') return 0;
    const ajusteG = parseFloat(localDescuento) || 0;
    const ajusteCob = parseFloat(localDescCob[r.coberturas] ?? '') || 0;
    return ajusteCob !== 0 ? ajusteCob : ajusteG;
  }, [localDescuento, localDescCob]);

  const primaAjustadaDe = useCallback((r: OfertaRow): number => {
    const v = parseFloat(r.oferta_prima_mmt);
    if (isNaN(v)) return NaN;
    const aj = ajusteAplicable(r);
    return aj === 0 ? v : v * (1 + aj / 100);
  }, [ajusteAplicable]);

  // Prima ajustada total: suma de primaAjustadaDe por fila
  const primaNetaTotal = useMemo(() => {
    return rows.reduce((sum, r) => {
      const v = primaAjustadaDe(r);
      return sum + (isNaN(v) ? 0 : v);
    }, 0);
  }, [rows, primaAjustadaDe]);

  // ── Coberturas para el anexo ──────────────────────────────────────────────
  const cobAnexo = useMemo(() => {
    const TIPOS_REMOLQUE = new Set(['semirremolque', 'remolque']);
    // Base común también para remolques desde que Seguro del Conductor salió de la base.
    const BASE_NO_CONDUCTOR = BASE_GARANTIAS_OFERTA;
    const makeCobMap = () => new Map<string, { nonRem: Set<string>; rem: Set<string>; hasLunas: boolean }>();
    const cobMapSin = makeCobMap();
    const cobMapCon = makeCobMap();
    rows.forEach(r => {
      if (!r.coberturas || r._cfg === 'true') return;
      const isRem = TIPOS_REMOLQUE.has(r.tipo_vehiculo.toLowerCase());
      const asist = (r.asistencia || '').toLowerCase();
      const targetMap = (asist && asist !== 'no') ? cobMapCon : cobMapSin;
      if (!targetMap.has(r.coberturas)) targetMap.set(r.coberturas, { nonRem: new Set(), rem: new Set(), hasLunas: false });
      const entry = targetMap.get(r.coberturas)!;
      const tip = r.tipo_vehiculo.charAt(0).toUpperCase() + r.tipo_vehiculo.slice(1).toLowerCase();
      if (isRem) entry.rem.add(tip);
      else entry.nonRem.add(tip);
      if (!isRem && ['sí', 'si', 'true', 's'].includes((r.lunas ?? '').toLowerCase())) entry.hasLunas = true;
    });
    const result: { titulo: string; tipologias: string[]; garantias: string[] }[] = [];
    // Filas con coberturas confirmadas en INFORME: el anexo sale del mismo catálogo que el panel y la emisión
    const porCfg = new Map<string, { titulo: string; tipologias: Set<string>; garantias: string[]; orden: number }>();
    rows.forEach(r => {
      if (r._cfg !== 'true') return;
      const tipo = tipoKeyDesdeEtiqueta(tipoNormDe(r.tipo_vehiculo));
      const cfg = normalizarConfig(tipo, configCoberturas?.[claveInforme(r)]);
      if (!cfg) return;
      const garantias = garantiasOferta(tipo, cfg);
      const base = PRODUCTO_LABEL_OFERTA[cfg.producto];
      const titulo = cfg.franquicia ? `${base} ${nf(cfg.franquicia)} €` : base;
      const sig = `${titulo}|${garantias.join('|')}`;
      const e = porCfg.get(sig) ?? { titulo, tipologias: new Set<string>(), garantias, orden: ORDEN_PRODUCTO[cfg.producto] };
      e.tipologias.add(r.tipo_vehiculo.charAt(0).toUpperCase() + r.tipo_vehiculo.slice(1).toLowerCase());
      porCfg.set(sig, e);
    });
    [...porCfg.values()].sort((a, b) => a.orden - b.orden || a.titulo.localeCompare(b.titulo))
      .forEach(e => result.push({ titulo: e.titulo, tipologias: [...e.tipologias], garantias: e.garantias }));
    const seen = new Set<string>();
    const buildEntries = (cobMap: Map<string, { nonRem: Set<string>; rem: Set<string>; hasLunas: boolean }>, asistGar: string[]) => {
      cobMap.forEach(({ nonRem, rem, hasLunas }, rawCob) => {
        const v = rawCob.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        let key = '';
        if (v.includes('todo') || v.includes('franquicia') || v.includes('riesgo')) key = 'tr';
        else if (v.includes('amplia')) key = 'ta';
        else if (v.includes('tercero')) key = 't';
        if (!key) return;
        const lunasGar = hasLunas ? ['Lunas'] : [];
        const keyFull = key + (asistGar.length ? '_asist' : '');
        if (nonRem.size > 0 && !seen.has(keyFull)) {
          seen.add(keyFull);
          const tipologias = [...nonRem];
          if (key === 't') result.push({ titulo: 'Terceros', tipologias, garantias: [...BASE_GARANTIAS_OFERTA, ...lunasGar, ...asistGar] });
          else if (key === 'ta') result.push({ titulo: 'Terceros Ampliado', tipologias, garantias: [...BASE_GARANTIAS_OFERTA, 'Lunas', 'Robo', 'Incendio', ...asistGar] });
          else if (key === 'tr') result.push({ titulo: 'Todo Riesgo con Franquicia', tipologias, garantias: [...BASE_GARANTIAS_OFERTA, 'Lunas', 'Robo', 'Incendio', 'Daños propios con franquicia', ...asistGar] });
        }
        if (rem.size > 0 && !seen.has(keyFull + '_rem')) {
          seen.add(keyFull + '_rem');
          const tipologias = [...rem];
          if (key === 't') result.push({ titulo: 'Terceros — Remolques', tipologias, garantias: [...BASE_NO_CONDUCTOR, ...asistGar] });
          else if (key === 'ta') result.push({ titulo: 'Terceros Ampliado — Remolques', tipologias, garantias: [...BASE_NO_CONDUCTOR, 'Robo', 'Incendio', ...asistGar] });
          else if (key === 'tr') result.push({ titulo: 'Todo Riesgo — Remolques', tipologias, garantias: [...BASE_NO_CONDUCTOR, 'Robo', 'Incendio', 'Daños propios con franquicia', ...asistGar] });
        }
      });
    };
    buildEntries(cobMapSin, []);
    buildEntries(cobMapCon, ['Asistencia en Viaje']);
    const titleOrder: Record<string, number> = { 'Terceros': 0, 'Terceros — Remolques': 1, 'Terceros Ampliado': 2, 'Terceros Ampliado — Remolques': 3, 'Todo Riesgo con Franquicia': 4, 'Todo Riesgo — Remolques': 5 };
    const legacy = result.slice(porCfg.size).sort((a, b) => (titleOrder[a.titulo] ?? 9) - (titleOrder[b.titulo] ?? 9));
    return [...result.slice(0, porCfg.size), ...legacy];
  }, [rows, configCoberturas]);

  // ── Actualizar primas desde Informe ──────────────────────────────────────
  const handleActualizarDesdeInforme = useCallback(() => {
    if (!primasMmt || Object.keys(primasMmt).length === 0) return;
    setRows(prev => prev.map(row => {
      const prima = primasMmt[claveInforme(row)];
      if (prima != null) return { ...row, oferta_prima_mmt: String(prima), _primaOverride: row._cfg === 'true' ? '' : 'true' };
      return row;
    }));
  }, [primasMmt]);

  // ── Exportar PDF ──────────────────────────────────────────────────────────
  // El PDF refleja los ajustes aplicados (columna + totales). Las filas se clonan con la prima
  // ajustada en oferta_prima_mmt, así el detalle y el total ajustados son consistentes.
  const handleExportPdf = useCallback(() => {
    const rowsExport = rows.map(r => {
      const aj = ajusteAplicable(r);
      if (aj === 0) return r;
      const v = parseFloat(r.oferta_prima_mmt);
      if (isNaN(v)) return r;
      return { ...r, oferta_prima_mmt: (v * (1 + aj / 100)).toFixed(2) };
    });
    const html = buildOfertaPdfHtml({ rows: rowsExport, header, carpetaNombre, cobAnexo, primaTotal: primaNetaTotal });
    const w = window.open('', '_blank', 'width=960,height=720');
    if (!w) return;
    w.document.write(html);
    w.document.close();
  }, [rows, header, carpetaNombre, cobAnexo, primaNetaTotal, ajusteAplicable]);

  // ─── Generar Oferta Excel (via endpoint con formato MMT) ───────────────────
  const [exporting, setExporting] = useState(false);

  const handleExportOferta = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const vehiculos = rows.map(r => {
        const marcaModelo = r.marca_modelo ?? '';
        const [marca, ...modeloParts] = marcaModelo.split(' ');
        // El Excel refleja la prima ajustada (igual que la tabla y el PDF).
        const primaAjustada = primaAjustadaDe(r);
        return {
          tomador: (r.tomador ?? '').toUpperCase(),
          tipologia: (r.tipo_vehiculo ?? '').toUpperCase(),
          matricula: (r.matricula ?? '').toUpperCase(),
          marca: (marca ?? '').toUpperCase(),
          modelo: modeloParts.join(' ').toUpperCase(),
          coberturas: (r.coberturas ?? '').toUpperCase(),
          franquicia: /franquicia/i.test(r.coberturas ?? '') ? (parseFloat(String(r.frq).replace(',', '.')) || 0) : 0,
          periodicidad: (header?.periodicidad ?? 'anual').toUpperCase(),
          fecha_vencimiento: parseFecha(header?.efecto),
          prima_ofertada: isNaN(primaAjustada) ? 0 : primaAjustada,
        };
      });

      const payload = {
        flota_nombre: (carpetaNombre ?? 'FLOTA').toUpperCase(),
        empresa_nombre: (header?.tomador ?? '').toUpperCase(),
        empresa_cif: (header?.cif ?? '').toUpperCase(),
        vehiculos,
        cobAnexo,
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      let res: Response;
      try {
        res = await fetch('/api/flotas/oferta/excel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!res.ok) {
        let errMsg = `HTTP ${res.status}`;
        try {
          const err = await res.json();
          errMsg = err.error || err.message || errMsg;
        } catch {
          try { errMsg += ': ' + (await res.text()).slice(0, 200); } catch { /* noop */ }
        }
        alert(`Error generando oferta: ${errMsg}`);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `OFERTA_${(carpetaNombre ?? 'FLOTA').replace(/[^a-zA-Z0-9_\- ]/g, '').trim().toUpperCase()}.xlsx`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Oferta Excel]', err);
      alert(`Error generando la oferta: ${msg}`);
    } finally {
      setExporting(false);
    }
  }, [rows, header, carpetaNombre, exporting]);

  const columns = useMemo((): Column<OfertaRow>[] => [
    {
      key: '_idx', name: '#', width: 44, frozen: true, resizable: false,
      renderCell: ({ rowIdx }: RenderCellProps<OfertaRow>) => (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 11, fontWeight: 700 }}>
          {rowIdx + 1}
        </div>
      ),
    },
    {
      key: 'matricula', name: 'MATRÍCULA', width: 100, editable: false,
      renderCell: readonlyCell,
    },
    {
      key: 'marca_modelo', name: 'MARCA / MODELO', width: 160, editable: false,
      renderCell: readonlyCell,
    },
    {
      key: 'tipo_vehiculo', name: 'TIPO VEHÍCULO', width: 155, editable: false,
      renderCell: readonlyCell,
    },
    {
      key: 'cv', name: 'CV', width: 55, editable: false,
      renderCell: readonlyCell,
    },
    {
      key: 'coberturas', name: 'COBERTURAS', width: 200,
      editable: (row: OfertaRow) => row._cfg !== 'true',
      renderEditCell: (props) => <DropdownEditor {...props} options={COBERTURA_OPTS} />,
      renderCell: ({ row }: RenderCellProps<OfertaRow>) => (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', paddingLeft: 8, fontSize: 12, color: row.coberturas ? '#000000' : '#9ca3af', fontStyle: row.coberturas ? 'normal' : 'italic' }}>
          {row.coberturas || '—'}
        </div>
      ),
    },
    {
      key: 'lunas', name: 'LUNAS', width: 70,
      editable: (row: OfertaRow) => row._cfg !== 'true',
      renderEditCell: (props) => NO_LUNAS_TIPOS.has(props.row.tipo_vehiculo.toLowerCase()) ? <div /> : <DropdownEditor {...props} options={LUNAS_OPTS} />,
      renderCell: ({ row }: RenderCellProps<OfertaRow>) => {
        if (NO_LUNAS_TIPOS.has(row.tipo_vehiculo.toLowerCase())) {
          return (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6' }}>
              <span style={{ color: '#d1d5db', fontSize: 10 }}>N/A</span>
            </div>
          );
        }
        return (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', paddingLeft: 8, fontSize: 12, color: row.lunas ? '#000000' : '#9ca3af' }}>
            {row.lunas || '—'}
          </div>
        );
      },
    },
    {
      key: 'ambito', name: 'ÁMBITO', width: 110,
      editable: true,
      renderEditCell: (props) => <DropdownEditor {...props} options={AMBITO_OPTS} />,
      renderCell: ({ row }: RenderCellProps<OfertaRow>) => (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', paddingLeft: 8, fontSize: 12, color: row.ambito ? '#000000' : '#9ca3af' }}>
          {row.ambito || '—'}
        </div>
      ),
    },
    {
      key: 'frq', name: 'FRQ', width: 70,
      editable: (row: OfertaRow) => row._cfg !== 'true',
      renderEditCell: renderTextEditor,
      renderCell: ({ row }: RenderCellProps<OfertaRow>) => {
        const disabled = !/franquicia/i.test(row.coberturas ?? '');
        return (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', paddingLeft: 8, fontSize: 12, color: disabled ? '#9ca3af' : '#000000', fontStyle: disabled ? 'italic' : 'normal' }}>
            {row.frq || ''}
          </div>
        );
      },
    },
    {
      key: 'animales', name: 'ANIM', width: 52,
      editable: false,
      renderCell: ({ row }: RenderCellProps<OfertaRow>) => {
        const tipo = getTipoKey(row.tipo_vehiculo);
        return <CheckboxCell row={row} columnKey="animales" enabled={!!tipo && ANIMALES_TIPOS.has(tipo)} onToggle={handleCheckboxToggle} />;
      },
    },
    {
      key: 'isotermo', name: 'ISOT', width: 52,
      editable: false,
      renderCell: ({ row }: RenderCellProps<OfertaRow>) => {
        const tipo = getTipoKey(row.tipo_vehiculo);
        return <CheckboxCell row={row} columnKey="isotermo" enabled={!!tipo && ISOTERMO_TIPOS.has(tipo)} onToggle={handleCheckboxToggle} />;
      },
    },
    {
      key: 'perdida_total', name: 'P.TOT', width: 52,
      editable: false,
      renderCell: ({ row }: RenderCellProps<OfertaRow>) => {
        const tipo = getTipoKey(row.tipo_vehiculo);
        return <CheckboxCell row={row} columnKey="perdida_total" enabled={!!tipo && PERDIDA_TOTAL_TIPOS.has(tipo)} onToggle={handleCheckboxToggle} />;
      },
    },
    {
      key: 'oferta_prima_mmt', name: 'PRIMA MMT', width: 130,
      editable: true,
      renderEditCell: renderTextEditor,
      renderCell: ({ row }: RenderCellProps<OfertaRow>) => {
        const isOverride = row._primaOverride === 'true';
        const hasValue = !!row.oferta_prima_mmt;
        return (
          <div style={{
            height: '100%', display: 'flex', alignItems: 'center', paddingLeft: 8, fontSize: 12,
            fontWeight: hasValue ? 700 : 400,
            color: hasValue ? '#000000' : '#9ca3af',
            fontFamily: hasValue ? 'monospace' : 'inherit',
          }}>
            {row.oferta_prima_mmt ? `${row.oferta_prima_mmt} €` : '—'}
          </div>
        );
      },
    },
  ], [handleCheckboxToggle]);

  const filledRows = rows.filter(r => r.matricula.trim()).length;
  const noAdmitidos = rows.filter(r => r.matricula.trim() && tipoKeyDesdeEtiqueta(tipoNormDe(r.tipo_vehiculo)) === 'minibus_autocar').length;

  // ── Cambio de coberturas: selección + drawer idéntico al del Informe ──────
  const toggleSel = useCallback((id: number) => {
    setSelMats(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);
  const toggleAllSel = useCallback((ids: number[]) => {
    setSelMats(prev => {
      const todos = ids.every(id => prev.has(id));
      return todos ? new Set() : new Set(ids);
    });
  }, []);

  // Tipologías presentes en la selección actual (en orden de aparición).
  const tiposEnSeleccion = useMemo<TipoKey[]>(() => {
    const vistos = new Set<TipoKey>();
    const orden: TipoKey[] = [];
    rows.forEach(r => {
      if (!selMats.has(r._id)) return;
      const t = tipoKeyDesdeEtiqueta(tipoNormDe(r.tipo_vehiculo));
      if (!vistos.has(t) && grupoCob(t)) { vistos.add(t); orden.push(t); }
    });
    return orden;
  }, [rows, selMats]);

  const abrirDrawerCobertura = useCallback(() => {
    if (tiposEnSeleccion.length === 0) return;
    const primera = tiposEnSeleccion[0];
    const cuentaCob: Record<string, number> = {};
    rows.forEach(r => {
      if (!selMats.has(r._id)) return;
      const t = tipoKeyDesdeEtiqueta(tipoNormDe(r.tipo_vehiculo));
      if (t !== primera) return;
      const cob = r.cob_solicitada || r.coberturas || '';
      cuentaCob[cob] = (cuentaCob[cob] ?? 0) + 1;
    });
    const cobDominante = Object.entries(cuentaCob).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    const filasInfer = rows.filter(r => selMats.has(r._id) && tipoKeyDesdeEtiqueta(tipoNormDe(r.tipo_vehiculo)) === primera)
      .map(r => ({ frq: r.frq, lunas: r.lunas, animales: r.animales }));
    const propuesta = inferirConfig(primera, cobDominante, filasInfer)
      ?? { producto: productosPermitidos(primera)[0] ?? 'terceros', opciones: {} };
    setDrawerTipo(primera);
    setDrawerDraft(normalizarConfig(primera, propuesta) ?? propuesta);
    setDrawerAviso('');
  }, [tiposEnSeleccion, rows, selMats]);

  const cambiarTipoDrawer = useCallback((t: TipoKey) => {
    const filasT = rows.filter(r => selMats.has(r._id) && tipoKeyDesdeEtiqueta(tipoNormDe(r.tipo_vehiculo)) === t);
    const cuentaCob: Record<string, number> = {};
    filasT.forEach(r => {
      const cob = r.cob_solicitada || r.coberturas || '';
      cuentaCob[cob] = (cuentaCob[cob] ?? 0) + 1;
    });
    const cobDominante = Object.entries(cuentaCob).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    const filasInfer = filasT.map(r => ({ frq: r.frq, lunas: r.lunas, animales: r.animales }));
    const propuesta = inferirConfig(t, cobDominante, filasInfer)
      ?? { producto: productosPermitidos(t)[0] ?? 'terceros', opciones: {} };
    setDrawerTipo(t);
    setDrawerDraft(normalizarConfig(t, propuesta) ?? propuesta);
    setDrawerAviso('');
  }, [rows, selMats]);

  const cerrarDrawer = useCallback(() => { setDrawerTipo(null); setDrawerDraft(null); setDrawerAviso(''); }, []);

  const confirmarDrawer = useCallback(() => {
    if (!drawerTipo || !drawerDraft) return;
    const cfg = drawerDraft;
    const ofRow = aOfertaRow(drawerTipo, cfg);
    let aplicadas = 0;
    setRows(prev => prev.map(r => {
      if (!selMats.has(r._id)) return r;
      const t = tipoKeyDesdeEtiqueta(tipoNormDe(r.tipo_vehiculo));
      if (t !== drawerTipo) return r;
      const primaInforme = primasMmt?.[claveInforme(r)];
      let primaFinal: string | null = null;
      let fromInforme = false;
      if (primaInforme != null) {
        primaFinal = String(primaInforme);
        fromInforme = true;
      } else {
        const simulada: OfertaRow = { ...r, coberturas: ofRow.coberturas, frq: ofRow.frq, lunas: ofRow.lunas, asistencia: ofRow.asistencia, animales: ofRow.animales, _primaOverride: '' };
        const calc = calcPrimaForRow(simulada, primasConfigRef.current);
        if (calc !== '') primaFinal = calc;
      }
      if (primaFinal === null) return r;
      aplicadas++;
      return {
        ...r,
        coberturas: ofRow.coberturas,
        frq: ofRow.frq,
        lunas: ofRow.lunas,
        asistencia: ofRow.asistencia,
        animales: ofRow.animales,
        oferta_prima_mmt: primaFinal,
        _primaOverride: fromInforme ? '' : 'true',
        _cfg: 'true',
      };
    }));
    setDrawerAviso(`${nf(aplicadas)} ${aplicadas === 1 ? 'matrícula actualizada' : 'matrículas actualizadas'}.`);
  }, [drawerTipo, drawerDraft, selMats, primasMmt]);

  // ─── Vista: tabla de trabajo · documento del cliente · edición de datos ────
  const [vista, setVista] = useState<'tabla' | 'cliente' | 'datos'>('tabla');
  const [shown, setShown] = useState(15);
  const PAGE = 15;

  const fmtEUR = (n: number) => eur(n, 2);
  const sg = (n: number) => (n > 0 ? '+' : '') + eur(n, 2);
  const hoyDMY = () => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  };

  // Handle inline prima edit
  const handlePreviewPrimaChange = useCallback((id: number, value: string) => {
    setRows(prev => prev.map(r => {
      if (r._id !== id) return r;
      if (value.trim() === '') {
        const informe = r._cfg === 'true' ? primasMmt?.[claveInforme(r)] : undefined;
        const auto = informe ? String(informe) : calcPrimaForRow(r, primasConfigRef.current);
        return { ...r, oferta_prima_mmt: auto, _primaOverride: '' };
      }
      return { ...r, oferta_prima_mmt: value, _primaOverride: 'true' };
    }));
  }, [primasMmt]);

  // ─── Precio propio por grupo (tipología + cobertura) ────────────────────────
  const [poTipo, setPoTipo] = useState('');
  const [poCob, setPoCob] = useState('');
  const [poPrima, setPoPrima] = useState('');
  const tiposList = useMemo(() => {
    const seen = new Set<string>();
    for (const r of rows) if (r.tipo_vehiculo) seen.add(r.tipo_vehiculo);
    return [...seen].sort();
  }, [rows]);
  const nOverrides = useMemo(() => rows.filter(r => r._primaOverride === 'true').length, [rows]);
  const poValor = parseFloat(poPrima.replace(',', '.'));
  const handleAplicarGrupo = useCallback(() => {
    if (isNaN(poValor) || poValor < 0) return;
    const txt = poValor.toFixed(2);
    setRows(prev => prev.map(r => {
      if (!r.matricula.trim()) return r;
      if (poTipo && r.tipo_vehiculo !== poTipo) return r;
      if (poCob && r.coberturas !== poCob) return r;
      return { ...r, oferta_prima_mmt: txt, _primaOverride: 'true' };
    }));
  }, [poTipo, poCob, poValor]);
  const handleQuitarPropios = useCallback(() => {
    setRows(prev => prev.map(r => r._primaOverride === 'true'
      ? { ...r, oferta_prima_mmt: calcPrimaForRow(r, primasConfigRef.current), _primaOverride: '' }
      : r));
  }, []);

  const visibles = useMemo(() => rows.filter(r => r.matricula.trim()), [rows]);
  const primaSolTotal = useMemo(() => visibles.reduce((sum, r) => sum + (parseFloat(r.prima_referencia) || 0), 0), [visibles]);
  const hayAjustes = primaNetaTotal > 0 && primaNetaTotal !== primaTotal;
  const emitirAjustes = () => emitAjustes({
    descuentoOferta: localDescuento ? parseFloat(localDescuento) : undefined,
    descuentosCoberturas: Object.fromEntries(Object.entries(localDescCob).filter(([, v]) => v).map(([k, v]) => [k, parseFloat(v)])),
  });

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Cabecera de paso ── */}
      <div className="sh" style={{ flexShrink: 0 }}>
        <div>
          <h2><b>07 ·</b>Oferta</h2>
          <p>Prima ofertada por vehículo y diferencia con la solicitada.</p>
        </div>
        <div className="acts">
          {primasMmt && Object.keys(primasMmt).length > 0 && (
            <button className="mini" onClick={handleActualizarDesdeInforme}>Actualizar primas</button>
          )}
          <button className="mini" onClick={() => setVista(vista === 'cliente' ? 'tabla' : 'cliente')}>
            {vista === 'cliente' ? 'Volver a la tabla' : 'Vista del cliente'}
          </button>
          <button className="mini" onClick={() => setVista(vista === 'datos' ? 'tabla' : 'datos')}>
            {vista === 'datos' ? 'Volver a la tabla' : 'Editar datos'}
          </button>
          {rows.length > 0 && (
            <>
              <button className="mini" onClick={handleExportPdf}>Descargar oferta (PDF)</button>
              <button className="mini pri" onClick={handleExportOferta} disabled={exporting}>
                {exporting ? 'Generando…' : 'Descargar oferta (Excel)'}
              </button>
            </>
          )}
        </div>
      </div>

      {vista === 'tabla' && (
        <div className="stepscroll">
          {/* Ajustes: uno por cobertura y global */}
          <div className="adj">
            {coberturasList.map(cob => (
              <div className="fld" key={cob}>
                <label htmlFor={`aj_${cob}`}>Ajuste {cob.toLowerCase()} %</label>
                <input
                  id={`aj_${cob}`} className="inp" type="number" step="0.1" placeholder="ej. −5 ó +10"
                  value={localDescCob[cob] ?? ''}
                  onChange={e => setLocalDescCob(prev => ({ ...prev, [cob]: e.target.value }))}
                  onBlur={emitirAjustes}
                  onKeyDown={e => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); } }}
                />
              </div>
            ))}
            <div className="fld">
              <label htmlFor="aj_global">Ajuste global %</label>
              <input
                id="aj_global" className="inp" type="number" step="0.1" placeholder="ej. −5 ó +10"
                value={localDescuento}
                onChange={e => setLocalDescuento(e.target.value)}
                onBlur={emitirAjustes}
                onKeyDown={e => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); } }}
              />
            </div>
          </div>

          {/* Precio propio por grupo */}
          <div className="adj poset" style={{ marginTop: 18 }}>
            <div className="fld">
              <label htmlFor="po_t">Precio propio para</label>
              <select id="po_t" className="select" value={poTipo} onChange={e => setPoTipo(e.target.value)}>
                <option value="">Todas las tipologías</option>
                {tiposList.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="fld">
              <label htmlFor="po_c">Cobertura</label>
              <select id="po_c" className="select" value={poCob} onChange={e => setPoCob(e.target.value)}>
                <option value="">Todas</option>
                {coberturasList.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="fld">
              <label htmlFor="po_p">Prima ofertada €</label>
              <input id="po_p" className="inp" inputMode="decimal" placeholder="ej. 450,00" value={poPrima} onChange={e => setPoPrima(e.target.value)} />
            </div>
            <button className="mini" onClick={handleAplicarGrupo} disabled={isNaN(poValor)}>Aplicar a ese grupo</button>
            <button className="mini" onClick={handleQuitarPropios} disabled={nOverrides === 0}>
              Quitar precios propios{nOverrides ? ` (${nf(nOverrides)})` : ''}
            </button>
          </div>
          <div className="note" style={{ marginTop: 8 }}>
            También puedes escribir el precio de cada vehículo en la tabla. Un precio propio no cambia al recalcular con otra cobertura.
          </div>

          {visibles.length === 0 ? (
            <div className="notice" style={{ marginTop: 18 }}>Todavía no hay vehículos en el trabajo para ofertar.</div>
          ) : (
            <>
              {noAdmitidos > 0 && (
                <div className="notice" style={{ marginTop: 14 }}>
                  {nf(noAdmitidos)} {noAdmitidos === 1 ? 'vehículo es' : 'vehículos son'} de una tipología que MMT no admite en flotas (minibús, autocar). No debería ofertarse; revísalo en el trabajo.
                </div>
              )}
              {selMats.size > 0 && (
                <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--soft, #f7f9fd)', border: '1px solid var(--line, #d6deea)', borderRadius: 8, display: 'flex', gap: 10, alignItems: 'center' }}>
                  <strong style={{ fontSize: 13 }}>{nf(selMats.size)} {selMats.size === 1 ? 'matrícula seleccionada' : 'matrículas seleccionadas'}</strong>
                  {tiposEnSeleccion.length > 1 && (
                    <span style={{ fontSize: 11, color: '#6b7280' }}>· {tiposEnSeleccion.length} tipologías distintas</span>
                  )}
                  <div style={{ flex: 1 }} />
                  <button className="mini pri" onClick={abrirDrawerCobertura} disabled={tiposEnSeleccion.length === 0}>Cambiar cobertura</button>
                  <button className="mini" onClick={() => setSelMats(new Set())}>Quitar selección</button>
                </div>
              )}
              <div className="xwrap" style={{ marginTop: 14, maxHeight: 'none' }}>
                <table className="xg">
                  <thead>
                    <tr>
                      <th style={{ width: 32 }}>
                        <input type="checkbox" aria-label="Seleccionar todos"
                          checked={visibles.length > 0 && visibles.slice(0, shown).every(r => selMats.has(r._id))}
                          onChange={() => toggleAllSel(visibles.slice(0, shown).map(r => r._id))}
                        />
                      </th>
                      <th>Matrícula</th><th>Tipología</th><th>Cobertura</th><th className="n">Franquicia</th>
                      <th>Periodicidad</th><th>Vencimiento</th>
                      <th className="n">Prima solicitada</th><th className="n">Prima ofertada MMT</th><th className="n">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.slice(0, shown).map(r => {
                      const sol = parseFloat(r.prima_referencia);
                      const ov = r._primaOverride === 'true';
                      const aj = ajusteAplicable(r);
                      const primaFinal = primaAjustadaDe(r);
                      const hasAj = aj !== 0 && !isNaN(primaFinal);
                      return (
                        <tr key={r._id} style={selMats.has(r._id) ? { background: 'rgba(0,47,130,0.04)' } : undefined}>
                          <td>
                            <input type="checkbox" aria-label={`Seleccionar ${r.matricula}`}
                              checked={selMats.has(r._id)}
                              onChange={() => toggleSel(r._id)}
                            />
                          </td>
                          <td>{r.matricula.toUpperCase()}</td>
                          <td>{r.tipo_vehiculo || '—'}</td>
                          <td>{r.coberturas || <span className="em">—</span>}</td>
                          <td className="n">{frqTexto(r) || <span className="em">—</span>}</td>
                          <td>{header?.periodicidad ? header.periodicidad.charAt(0).toUpperCase() + header.periodicidad.slice(1) : 'Anual'}</td>
                          <td>{parseFecha(header?.efecto) || '—'}</td>
                          <td className="n">{isNaN(sol) ? <span className="em">—</span> : eur(sol, 2)}</td>
                          <td className={`n${ov ? ' ov' : ''}`}>
                            <PrimaInput value={r.oferta_prima_mmt} onCommit={v => handlePreviewPrimaChange(r._id, v)} label={`Prima ofertada de ${r.matricula}`} />
                            {hasAj && (
                              <div style={{ fontSize: 10, color: aj < 0 ? '#15803d' : '#b84b56', marginTop: 2, fontWeight: 600 }}>
                                → {eur(primaFinal, 2)} ({aj > 0 ? '+' : ''}{dec(aj, 1)} %)
                              </div>
                            )}
                          </td>
                          <td className="n">{isNaN(sol) || isNaN(primaFinal) ? <span className="em">—</span> : sg(primaFinal - sol)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td></td>
                      <td>Totales</td>
                      <td colSpan={5}>{nf(filledRows)} vehículos</td>
                      <td className="n">{eur(primaSolTotal, 2)}</td>
                      <td className="n">{eur(primaNetaTotal, 2)}</td>
                      <td className="n">{primaSolTotal > 0 ? sg(primaNetaTotal - primaSolTotal) : '—'}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="note">
                Prima ofertada = tarifa MMT ajustada con los porcentajes de arriba (los precios propios no se ajustan). Diferencia = ofertada ajustada − solicitada.
              </div>
              <div className="note" style={{ marginTop: 6 }}>Mostrando {nf(Math.min(shown, visibles.length))} de {nf(visibles.length)}</div>
              {shown < visibles.length && (
                <div className="more" style={{ paddingBottom: 8 }}>
                  <button onClick={() => setShown(n => n + PAGE)}>
                    Mostrar {nf(Math.min(PAGE, visibles.length - shown))} más &middot; quedan {nf(visibles.length - shown)}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {vista === 'cliente' && (
        <div className="flex-1 min-h-0" style={{ overflow: 'auto', padding: '24px clamp(12px,2cqw,28px)', background: 'var(--soft)', borderRadius: 6 }}>
          <div style={{ maxWidth: 1400, margin: '0 auto', boxShadow: '0 8px 40px rgba(0,0,0,0.18)', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>

            {/* Header azul */}
            <div style={{ background: '#002F82', padding: '36px 40px', position: 'relative', minHeight: 110, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img
                src="/LOGOMMT.jpg"
                alt="Logo MMT"
                style={{ position: 'absolute', left: 28, top: '50%', transform: 'translateY(-50%)', height: 60, objectFit: 'contain' }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <span style={{ color: '#fff', fontSize: 26, fontWeight: 800, textAlign: 'center', letterSpacing: '0.03em', fontFamily: "'Space Grotesk', Calibri, sans-serif" }}>
                OFERTA PARA LA FLOTA {(carpetaNombre ?? 'FLOTA').toUpperCase()}
              </span>
            </div>

            {/* Subtítulo empresa */}
            <div style={{ padding: '14px 40px', textAlign: 'center', borderBottom: '2px solid #e5e7eb', background: '#fafbfc' }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#000', letterSpacing: '0.02em' }}>
                {(header?.tomador ?? '').toUpperCase()}
                {header?.cif ? ` — ${header.cif.toUpperCase()}` : ''}
              </span>
            </div>

            {/* Tabla de vehículos */}
            <div style={{ overflowX: 'auto', padding: '0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: '#002F82' }}>
                    {['Tomador', 'Tipología', 'Matrícula', 'Marca', 'Modelo', 'Coberturas', 'Periodicidad', 'F.Vencimiento', 'Prima Ofertada MMT'].map(h => (
                      <th key={h} style={{ padding: '14px 12px', color: '#fff', fontWeight: 800, fontSize: 12, textTransform: 'uppercase', textAlign: 'center', borderBottom: '3px solid #001a4f', whiteSpace: 'nowrap', letterSpacing: '0.04em' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.filter(r => r.matricula.trim()).map((r, idx) => {
                    const [marca, ...modeloParts] = r.marca_modelo.split(' ');
                    const isOverride = r._primaOverride === 'true';
                    const stripe = idx % 2 === 1 ? '#f7f8fa' : '#fff';
                    return (
                      <tr key={r._id} style={{ borderBottom: '1px solid #e8eaed', background: stripe, transition: 'background 0.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#eef3ff'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = stripe; }}>
                        <td style={{ padding: '12px 10px', textAlign: 'center', color: '#000', fontSize: 13 }}>{(r.tomador ?? '').toUpperCase()}</td>
                        <td style={{ padding: '12px 10px', textAlign: 'center', color: '#000', fontSize: 13, fontWeight: 600 }}>{r.tipo_vehiculo.toUpperCase()}</td>
                        <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 800, color: '#002F82', fontSize: 14, letterSpacing: '0.04em' }}>{r.matricula.toUpperCase()}</td>
                        <td style={{ padding: '12px 10px', textAlign: 'center', color: '#000', fontSize: 13, fontWeight: 600 }}>{(marca ?? '').toUpperCase()}</td>
                        <td style={{ padding: '12px 10px', textAlign: 'center', color: '#000', fontSize: 13 }}>{modeloParts.join(' ').toUpperCase()}</td>
                        <td style={{ padding: '12px 10px', textAlign: 'center', color: '#000', fontSize: 13, fontWeight: 600 }}>{r.coberturas.toUpperCase()}{frqTexto(r) ? ` · ${frqTexto(r)}` : ''}</td>
                        <td style={{ padding: '12px 10px', textAlign: 'center', color: '#000', fontSize: 13 }}>{(header?.periodicidad ?? 'anual').toUpperCase()}</td>
                        <td style={{ padding: '12px 10px', textAlign: 'center', color: '#000', fontSize: 13, fontWeight: 600 }}>{parseFecha(header?.efecto)}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          <input
                            type="text"
                            value={r.oferta_prima_mmt}
                            onChange={e => handlePreviewPrimaChange(r._id, e.target.value)}
                            style={{
                              width: 110, textAlign: 'right', fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                              padding: '6px 10px', borderRadius: 6, color: '#000',
                              border: '2px solid #d1d5db',
                              background: '#fff',
                              outline: 'none', transition: 'border-color 0.15s',
                            }}
                            onFocus={e => { e.target.style.borderColor = '#002F82'; e.target.style.boxShadow = '0 0 0 3px rgba(0,48,132,0.12)'; }}
                            onBlur={e => { e.target.style.borderColor = '#d1d5db'; e.target.style.boxShadow = 'none'; }}
                            placeholder="0.00"
                          />
                        </td>
                      </tr>
                    );
                  })}
                  {/* Totals row */}
                  <tr style={{ background: '#f0f2f5', borderTop: '3px solid #002F82' }}>
                    <td colSpan={8} style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 900, fontSize: 15, color: '#000', letterSpacing: '0.03em' }}>TOTALES</td>
                    <td style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 900, fontVariantNumeric: 'tabular-nums', fontSize: 16, color: '#002F82' }}>
                      {fmtEUR(primaTotal)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Resumen inferior */}
            <div style={{ padding: '20px 40px', borderTop: '2px solid #e5e7eb', background: '#fafbfc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Vehículos</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#002F82', fontVariantNumeric: 'tabular-nums' }}>{filledRows}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Prima Ofertada MMT</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#002F82', fontVariantNumeric: 'tabular-nums' }}>{fmtEUR(primaTotal)}</div>
                </div>
                {primaNetaTotal > 0 && primaNetaTotal !== primaTotal && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: (parseFloat(localDescuento)||0) < 0 ? '#15803d' : '#dc2626', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Prima ajustada ({dec(parseFloat(localDescuento) || 0, 1)} %)
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: (parseFloat(localDescuento)||0) < 0 ? '#16a34a' : '#dc2626', fontVariantNumeric: 'tabular-nums' }}>{fmtEUR(primaNetaTotal)}</div>
                  </div>
                )}
                {(() => {
                  const base = rows.reduce((s, r) => s + (parseFloat(r.prima_referencia) || 0), 0);
                  const comparar = primaNetaTotal > 0 && primaNetaTotal !== primaTotal ? primaNetaTotal : primaTotal;
                  if (base <= 0 || comparar <= 0) return null;
                  const diff = comparar - base;
                  const pctN = (diff / base) * 100;
                  return (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Diferencia</div>
                      <div style={{ fontSize: 22, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: diff <= 0 ? '#16a34a' : '#dc2626' }}>
                        {diff > 0 ? '+' : ''}{fmtEUR(diff)} <span style={{ fontSize: 14, fontWeight: 700 }}>({dec(pctN, 1)} %)</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 40px', textAlign: 'center', borderTop: '1px solid #e5e7eb', background: '#f5f6f8' }}>
              <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>
                MMT Seguros · {hoyDMY()}
              </span>
            </div>
          </div>
        </div>
      )}

      {vista === 'datos' && (
        <div className="flex-1 min-h-0">
          <DataGrid
            columns={columns}
            rows={rows}
            onRowsChange={handleRowsChange}
            rowKeyGetter={(row: OfertaRow) => row._id}
            style={{ height: '100%', fontFamily: 'ui-sans-serif, system-ui, sans-serif', fontSize: 12 }}
            className="rdg-light"
            defaultColumnOptions={{ resizable: true, sortable: false }}
          />
        </div>
      )}

      <DetailDrawer isOpen={!!drawerTipo && !!drawerDraft} onClose={cerrarDrawer} data={null}>
        {drawerTipo && drawerDraft && (() => {
          const campos = camposDe(drawerTipo, drawerDraft.producto, drawerDraft.franquicia);
          const grupoNombres: string[] = [];
          campos.forEach(c => { if (!grupoNombres.includes(c.grupo)) grupoNombres.push(c.grupo); });
          const frqs = franquiciasPermitidas(drawerTipo, drawerDraft.producto);
          const pend = pendientesEmision(drawerTipo, drawerDraft);
          const codigos = Object.entries(aEmision(drawerTipo, drawerDraft));
          const tipoInfo = TIPO_INFO[drawerTipo];
          const mats = rows.filter(r => selMats.has(r._id) && tipoKeyDesdeEtiqueta(tipoNormDe(r.tipo_vehiculo)) === drawerTipo);
          const setProd = (p: ProductoKey) => {
            const nuevo = normalizarConfig(drawerTipo, { producto: p, franquicia: drawerDraft.franquicia, opciones: drawerDraft.opciones });
            if (nuevo) setDrawerDraft(nuevo);
          };
          const setFrq = (v: string) => setDrawerDraft({ ...drawerDraft, franquicia: v ? Number(v) : undefined });
          const setOpc = (campo: string, v: string) => setDrawerDraft({ ...drawerDraft, opciones: { ...drawerDraft.opciones, [campo]: v } });
          return (
            <div className="cfgdr">
              <div className="over">Cambiar cobertura</div>
              <h3>{tipoInfo ? tipoInfo.label : drawerTipo}</h3>
              <p className="desc">{nf(mats.length)} {mats.length === 1 ? 'matrícula' : 'matrículas'} de esta tipología en la selección.</p>

              {tiposEnSeleccion.length > 1 && (
                <>
                  <h4>Tipología</h4>
                  <div className="cfrow">
                    <label htmlFor="cob-tipo">Configurar</label>
                    <select id="cob-tipo" className="select" value={drawerTipo} onChange={e => cambiarTipoDrawer(e.target.value as TipoKey)}>
                      {tiposEnSeleccion.map(t => <option key={t} value={t}>{TIPO_INFO[t]?.label ?? t}</option>)}
                    </select>
                  </div>
                </>
              )}

              <h4>Cobertura y franquicia</h4>
              <div className="cfrow">
                <label htmlFor="cob-prod">Cobertura</label>
                <select id="cob-prod" className="select" value={drawerDraft.producto} onChange={e => setProd(e.target.value as ProductoKey)}>
                  {productosPermitidos(drawerTipo).map(p => <option key={p} value={p}>{PRODUCTO_DEF[p].label}</option>)}
                </select>
              </div>
              {frqs.length > 0 && (
                <div className="cfrow">
                  <label htmlFor="cob-frq">Franquicia</label>
                  <select id="cob-frq" className="select" value={drawerDraft.franquicia ?? ''} onChange={e => setFrq(e.target.value)}>
                    <option value="">Elegir…</option>
                    {frqs.map(n => <option key={n} value={n}>{nf(n)} €</option>)}
                  </select>
                </div>
              )}

              {grupoNombres.map(gn => (
                <React.Fragment key={gn}>
                  <h4>{gn}</h4>
                  {campos.filter(c => c.grupo === gn).map(c => (
                    <div className="cfrow" key={c.id}>
                      <label htmlFor={`cob-${c.id}`}>{c.label}</label>
                      {c.kind === 'fijo' ? (
                        <span className="cffix" id={`cob-${c.id}`}>{c.fijo}</span>
                      ) : (
                        <select id={`cob-${c.id}`} className="select" value={drawerDraft.opciones[c.id] ?? c.defecto ?? ''} onChange={e => setOpc(c.id, e.target.value)}>
                          {c.opciones?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      )}
                    </div>
                  ))}
                </React.Fragment>
              ))}

              {pend.length > 0 && (
                <>
                  <h4>Avisos para la emisión</h4>
                  <ul className="cfwarn">{pend.map(p => <li key={p}>{p}</li>)}</ul>
                </>
              )}

              <h4>Resumen y códigos</h4>
              <p className="desc">{resumenConfig(drawerTipo, drawerDraft)}</p>
              <div className="kv">
                {codigos.map(([k, v]) => <div key={k}><label>{k.replace(/_/g, ' ')}</label><span>{v}</span></div>)}
              </div>

              {(() => {
                const ofRowPrev = aOfertaRow(drawerTipo, drawerDraft);
                let totalAnt = 0, totalNue = 0, noAdmite = 0, desdeInforme = 0, desdeCalc = 0;
                const detalle: { matricula: string; ant: number; nue: number | null; fuente: 'informe' | 'calc' | 'nada' }[] = [];
                for (const r of mats) {
                  const ant = parseFloat(r.oferta_prima_mmt) || 0;
                  const primaInforme = primasMmt?.[claveInforme(r)];
                  let nue: number | null = null;
                  let fuente: 'informe' | 'calc' | 'nada' = 'nada';
                  if (primaInforme != null) {
                    nue = primaInforme;
                    fuente = 'informe';
                    desdeInforme++;
                  } else {
                    const simulada: OfertaRow = { ...r, coberturas: ofRowPrev.coberturas, frq: ofRowPrev.frq, lunas: ofRowPrev.lunas, asistencia: ofRowPrev.asistencia, animales: ofRowPrev.animales, _primaOverride: '' };
                    const calc = calcPrimaForRow(simulada, primasConfigRef.current);
                    if (calc !== '') { nue = parseFloat(calc); fuente = 'calc'; desdeCalc++; }
                    else { noAdmite++; }
                  }
                  totalAnt += ant;
                  if (nue != null) totalNue += nue;
                  detalle.push({ matricula: r.matricula, ant, nue, fuente });
                }
                const dif = totalNue - totalAnt;
                const pct = totalAnt > 0 ? (dif / totalAnt) * 100 : 0;
                return (
                  <>
                    <h4>Diferencia de precios</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, background: '#f7f9fd', padding: 10, borderRadius: 6, border: '1px solid #e5e7eb' }}>
                      <div>
                        <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#6b7280', fontWeight: 700 }}>Prima actual</div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: '#002F82', fontVariantNumeric: 'tabular-nums' }}>{eur(totalAnt, 2)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#6b7280', fontWeight: 700 }}>Prima nueva</div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: '#002F82', fontVariantNumeric: 'tabular-nums' }}>{eur(totalNue, 2)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#6b7280', fontWeight: 700 }}>Diferencia</div>
                        <div style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: dif > 0 ? '#b84b56' : dif < 0 ? '#15803d' : '#6b7280' }}>
                          {(dif > 0 ? '+' : '') + eur(dif, 2)}
                          {totalAnt > 0 && <span style={{ fontSize: 11, marginLeft: 6, fontWeight: 600 }}>({dif > 0 ? '+' : ''}{dec(pct, 1)} %)</span>}
                        </div>
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: '#6b7280', marginTop: 6 }}>
                      {desdeInforme > 0 && <span>{nf(desdeInforme)} desde Informe</span>}
                      {desdeInforme > 0 && desdeCalc > 0 && <span> · </span>}
                      {desdeCalc > 0 && <span>{nf(desdeCalc)} por cálculo local</span>}
                      {noAdmite > 0 && <span style={{ color: '#b84b56', fontWeight: 600 }}> · {nf(noAdmite)} no admite esta cobertura y se saltará</span>}
                    </div>
                    {mats.length <= 20 && (
                      <details style={{ marginTop: 8 }}>
                        <summary style={{ fontSize: 11, color: '#6b7280', cursor: 'pointer' }}>Ver detalle por matrícula</summary>
                        <table className="xg" style={{ marginTop: 6, width: '100%', fontSize: 11 }}>
                          <thead>
                            <tr><th>Matrícula</th><th className="n">Actual</th><th className="n">Nueva</th><th className="n">Δ</th></tr>
                          </thead>
                          <tbody>
                            {detalle.map(d => {
                              const delta = d.nue != null ? d.nue - d.ant : null;
                              return (
                                <tr key={d.matricula}>
                                  <td>{d.matricula.toUpperCase()}</td>
                                  <td className="n">{eur(d.ant, 2)}</td>
                                  <td className="n">{d.nue != null ? eur(d.nue, 2) : <span style={{ color: '#b84b56' }}>No admite</span>}</td>
                                  <td className="n" style={{ color: delta == null ? undefined : delta > 0 ? '#b84b56' : delta < 0 ? '#15803d' : undefined, fontWeight: 600 }}>
                                    {delta == null ? '—' : (delta > 0 ? '+' : '') + eur(delta, 2)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </details>
                    )}
                  </>
                );
              })()}

              {drawerAviso && <div className="cfgaviso" role="status" style={{ marginTop: 10 }}>{drawerAviso}</div>}

              <div className="dacts" style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--line)', paddingTop: 14 }}>
                <button type="button" className="mini" onClick={cerrarDrawer}>Cancelar</button>
                <button type="button" className="mini pri" onClick={confirmarDrawer} disabled={mats.length === 0}>Aplicar a {nf(mats.length)}</button>
              </div>
            </div>
          );
        })()}
      </DetailDrawer>
    </div>
  );
});

function PrimaInput({ value, onCommit, label }: { value: string; onCommit: (v: string) => void; label: string }) {
  const [focus, setFocus] = useState(false);
  const num = parseFloat(value);
  const shown = focus || isNaN(num) ? value.replace('.', ',') : dec(num, 2);
  return (
    <input
      className="inp pm" inputMode="decimal" aria-label={label} placeholder="0,00"
      value={shown}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      onChange={e => onCommit(e.target.value.replace(',', '.'))}
    />
  );
}

function readonlyCell({ row, column }: RenderCellProps<OfertaRow>) {
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', paddingLeft: 8, fontSize: 12, color: '#000000', background: '#f9fafb' }}>
      {String((row as unknown as Record<string, string>)[column.key] ?? '')}
    </div>
  );
}

export default HojaOferta;
