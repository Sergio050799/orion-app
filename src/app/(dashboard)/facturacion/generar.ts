// Carpeta de una facturación: <FLOTA>_<AAAAMMDD>/TRABAJO y /ENVIAR, en un ZIP.
//   ENVIAR  → por cada recibo (RC / RW y tomador): PDF, Word y anexo Excel con el detalle.
//   TRABAJO → Excel originales tal cual se subieron, detalle interno con la fila de origen y los cambios, y auditoría.

import {
  esDe, isoDe, diaDe, moverMeses, NOMBRE_PERIODICIDAD, MESES_PERIODICIDAD,
  type LineaRecibo, type ResumenSerie, type Serie, type TomadorFacturacion,
} from '@/core/flotas/facturacion';

export interface ConfigFacturacion {
  /** nombre de la flota que se imprime */
  flota: string;
  /** inicio del ciclo anual (ISO); solo cuentan el día y el mes para los años siguientes */
  inicioCiclo: string;
  periodicidad: string;
  corredor: { nombre: string; cif: string; domicilio: string; comision: number };
  tomadores: TomadorFacturacion[];
}

export interface CambioLinea {
  serie: Serie; recibo: string; campo: string; antes: string; despues: string; motivo: string; usuario: string; fecha: string;
}

export interface DocumentoFactura {
  id: string;
  serie: Serie;
  tomador: TomadorFacturacion;
  numero: string;
  /** vencimiento de la fracción (ISO) */
  vencimiento: string;
  textoPeriodo: string;
  /** inicio del ciclo y renovación (ISO) de la fracción facturada */
  inicioCiclo: string;
  renovacion: string;
  lineas: LineaRecibo[];
  resumen: ResumenSerie;
  archivo: string;
  sha256: string;
  excluidas: number[];
  avisos: string[];
  cambios: CambioLinea[];
}

export const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase() || 'FLOTA';

/** Último día cubierto por el ciclo (renovación − 1 día), dd/mm/aaaa. */
function finCobertura(renovacionIso: string): string {
  const d = diaDe(renovacionIso);
  if (!d) return '';
  const f = new Date(Date.UTC(d.y, d.m - 1, d.d) - 86400000);
  return esDe(isoDe({ y: f.getUTCFullYear(), m: f.getUTCMonth() + 1, d: f.getUTCDate() }));
}

function cuerpoRecibo(cfg: ConfigFacturacion, doc: DocumentoFactura) {
  const meses = MESES_PERIODICIDAD[cfg.periodicidad] ?? 0;
  return {
    tipo: doc.serie === 'RC' ? 'EMISION' : 'REGULARIZACION',
    numeroRecibo: doc.numero,
    corredor: { nombre: cfg.corredor.nombre, cif: cfg.corredor.cif, domicilio: cfg.corredor.domicilio },
    flota: cfg.flota,
    tomador: { nombre: doc.tomador.nombre, cif: doc.tomador.cif },
    periodoCobertura: { desde: esDe(doc.inicioCiclo), hasta: finCobertura(doc.renovacion) },
    formaPago: NOMBRE_PERIODICIDAD[meses] ?? cfg.periodicidad,
    descripcionPeriodo: doc.textoPeriodo,
    primaNeta: doc.resumen.neta, impuestos: doc.resumen.impuesto, importeTotal: doc.resumen.importe,
  };
}

async function pedir(ruta: string, cuerpo: unknown): Promise<ArrayBuffer> {
  const res = await fetch(ruta, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
  if (!res.ok) throw new Error('No se pudo generar el recibo. Inténtalo de nuevo.');
  return res.arrayBuffer();
}

const AZUL = 'FF002F82';

async function excelDetalle(doc: DocumentoFactura, cfg: ConfigFacturacion, interno: boolean): Promise<ArrayBuffer> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Recibos');
  const cols: Array<{ t: string; w: number; v: (l: LineaRecibo) => string | number; n?: boolean }> = [
    { t: 'PÓLIZA', w: 12, v: l => l.poliza },
    { t: 'Nº RECIBO', w: 16, v: l => l.recibo },
    { t: 'RIESGO', w: 14, v: l => l.riesgo },
    { t: 'FECHA', w: 12, v: l => esDe(l.fecha) },
    { t: 'TIPO', w: 12, v: l => l.tipo },
    { t: 'PRIMA NETA', w: 14, v: l => l.neta, n: true },
    { t: 'IMPUESTO', w: 13, v: l => l.impuesto, n: true },
    { t: 'IMPORTE', w: 14, v: l => l.importe, n: true },
    { t: 'COMISIÓN', w: 13, v: l => l.comision, n: true },
    { t: 'LÍQUIDO A ABONAR', w: 18, v: l => l.liquido, n: true },
    { t: 'PERIODICIDAD', w: 14, v: l => l.periodicidad },
    { t: 'INICIO PÓLIZA', w: 14, v: l => esDe(l.inicioPoliza) },
    { t: 'VENCIMIENTO', w: 14, v: l => esDe(l.vencimientoPoliza) },
    { t: 'TOMADOR', w: 36, v: l => l.tomador },
  ];
  if (interno) cols.push({ t: 'FILA ORIGEN', w: 12, v: l => l.fila });

  ws.addRow([`${doc.numero} · ${cfg.flota} · ${doc.tomador.nombre}`]).font = { bold: true, size: 13 };
  ws.addRow([doc.textoPeriodo]);
  ws.addRow([]);
  const cab = ws.addRow(cols.map(c => c.t));
  cab.eachCell(c => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
    c.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  for (const l of doc.lineas) {
    const fila = ws.addRow(cols.map(c => c.v(l)));
    cols.forEach((c, i) => { if (c.n) fila.getCell(i + 1).numFmt = '#,##0.00'; });
  }
  const r = doc.resumen;
  const tot = ws.addRow(cols.map(c => ({ 'PÓLIZA': `TOTAL (${r.recibos} recibos)`, 'PRIMA NETA': r.neta, 'IMPUESTO': r.impuesto, 'IMPORTE': r.importe, 'COMISIÓN': r.comision, 'LÍQUIDO A ABONAR': r.liquido } as Record<string, string | number>)[c.t] ?? ''));
  tot.font = { bold: true };
  cols.forEach((c, i) => { if (c.n) tot.getCell(i + 1).numFmt = '#,##0.00'; ws.getColumn(i + 1).width = c.w; });
  ws.views = [{ state: 'frozen', ySplit: 4 }];

  if (interno && doc.cambios.length > 0) {
    const wc = wb.addWorksheet('Cambios');
    const h = wc.addRow(['FECHA', 'USUARIO', 'RECIBO', 'DATO', 'ANTES', 'DESPUÉS', 'MOTIVO']);
    h.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }; });
    for (const c of doc.cambios) wc.addRow([c.fecha, c.usuario, c.recibo, c.campo, c.antes, c.despues, c.motivo]);
    [20, 16, 16, 14, 14, 14, 40].forEach((w, i) => { wc.getColumn(i + 1).width = w; });
  }
  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

export interface EntradaZip {
  cfg: ConfigFacturacion;
  docs: DocumentoFactura[];
  /** Excel originales tal cual se subieron (no los hay al volver a descargar del histórico) */
  originales: Partial<Record<Serie, File>>;
  usuario: string;
  /** fecha y hora de la emisión (ISO) */
  emitidoEn: string;
}

export async function construirZip(e: EntradaZip, progreso?: (texto: string) => void): Promise<{ blob: Blob; nombre: string }> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const venc = e.docs[0]?.vencimiento ?? '';
  const raiz = `${slug(e.cfg.flota)}_${venc.replace(/-/g, '')}`;
  const trabajo = zip.folder(raiz)!.folder('TRABAJO')!, enviar = zip.folder(raiz)!.folder('ENVIAR')!;
  const variosTomadores = new Set(e.docs.map(d => d.tomador.id)).size > 1;

  for (const s of ['RC', 'RW'] as Serie[]) {
    const f = e.originales[s];
    if (f) trabajo.file(`${s}_ORIGINAL_${f.name}`, await f.arrayBuffer());
  }
  for (const doc of e.docs) {
    const base = doc.numero + (variosTomadores ? `_${slug(doc.tomador.nombre).slice(0, 40)}` : '');
    progreso?.(`Generando ${doc.numero}${variosTomadores ? ` · ${doc.tomador.nombre}` : ''}…`);
    const cuerpo = cuerpoRecibo(e.cfg, doc);
    const [pdf, docx, anexo, interno] = await Promise.all([
      pedir('/api/flotas/recibos/factura-pdf', cuerpo),
      pedir('/api/flotas/recibos/factura', cuerpo),
      excelDetalle(doc, e.cfg, false),
      excelDetalle(doc, e.cfg, true),
    ]);
    enviar.file(`${base}.pdf`, pdf);
    enviar.file(`${base}.docx`, docx);
    enviar.file(`${base}_ANEXO.xlsx`, anexo);
    trabajo.file(`${base}_DETALLE_INTERNO.xlsx`, interno);
  }
  trabajo.file('auditoria.json', JSON.stringify({
    flota: e.cfg.flota, emitido_por: e.usuario, emitido_en: e.emitidoEn, configuracion: e.cfg,
    documentos: e.docs.map(d => ({
      id: d.id, numero: d.numero, serie: d.serie, tomador: d.tomador, vencimiento: d.vencimiento, texto_periodo: d.textoPeriodo,
      archivo: d.archivo, sha256: d.sha256, filas_excluidas: d.excluidas, totales: d.resumen, avisos: d.avisos, cambios: d.cambios,
    })),
  }, null, 2));
  progreso?.('Comprimiendo…');
  return { blob: await zip.generateAsync({ type: 'blob' }), nombre: `${raiz}.zip` };
}

/** Inicio del ciclo por defecto a partir del vencimiento (renovación) de la flota: un año antes. */
export function inicioDesdeVencimiento(vencimiento: string | undefined): string {
  const d = diaDe(vencimiento ?? '');
  return d ? isoDe(moverMeses(d, -12)) : '';
}
