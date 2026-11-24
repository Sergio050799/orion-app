// Carpeta de una facturación, tal como se prepara a mano:
//
//   AAAA-MM-DD RECIBOS PRIMER TRIMESTRE 2026 - GEODIS/
//     ORIGINAL/  el informe de recibos de MMT tal cual se subió
//     TRABAJO/   el Excel transformado (sin columnas internas, con comisión y líquido, ordenado por póliza) y el recibo en Word
//     ENVIAR/    el mismo Excel con el número delante y el recibo en PDF
//
// Emisión y regularización son descargas separadas, cada una con su carpeta.

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
  recibo: string; campo: string; antes: string; despues: string; motivo: string; usuario: string; fecha: string;
}

export interface DocumentoFactura {
  id: string;
  serie: Serie;
  tomador: TomadorFacturacion;
  /** RW13012026 */
  numero: string;
  /** fecha del documento (ISO): la del número y la del nombre de la carpeta */
  fechaDocumento: string;
  /** primer día de la fracción (ISO) */
  vencimiento: string;
  /** «PRIMER TRIMESTRE 2026» y su forma corta «1º TRIMESTRE 2026» */
  nombrePeriodo: string;
  nombrePeriodoCorto: string;
  /** línea en negrita del recibo */
  textoPeriodo: string;
  /** inicio del ciclo y renovación (ISO) de la fracción facturada */
  inicioCiclo: string;
  renovacion: string;
  /** fecha del informe de MMT (ISO) */
  fechaInforme: string;
  lineas: LineaRecibo[];
  resumen: ResumenSerie;
  archivo: string;
  sha256: string;
  avisos: string[];
  cambios: CambioLinea[];
}

/** Texto válido como nombre de archivo o carpeta en Windows, en mayúsculas. */
export const paraNombre = (s: string) => s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();

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
const GRIS = 'FFF1F4F9';
const NUM = '#,##0.00';

/** Título del Excel: «Informe Recibos GEODIS PRIMER TRIMESTRE 2026» / «Informe Recibos - Regularización GEODIS CUARTO TRIMESTRE 2026». */
export function tituloInforme(cfg: ConfigFacturacion, doc: DocumentoFactura): string {
  return doc.serie === 'RC'
    ? `Informe Recibos ${cfg.flota.toUpperCase()} ${doc.nombrePeriodo}`
    : `Informe Recibos - Regularización ${cfg.flota.toUpperCase()} ${doc.nombrePeriodo}`;
}

/**
 * Excel de TRABAJO y de ENVIAR: del informe de MMT se quitan Ejercicio, Fin cobertura, Estado, F. último estado,
 * Cobro y los datos del propietario; se añaden Comisión y Líquido a abonar; se ordena por póliza.
 */
async function excelRecibos(doc: DocumentoFactura, cfg: ConfigFacturacion): Promise<ArrayBuffer> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Recibos');
  const cols: Array<{ t: string; w: number; v: (l: LineaRecibo) => string | number; n?: boolean; tot?: keyof ResumenSerie }> = [
    { t: 'PÓLIZA', w: 12, v: l => l.poliza },
    { t: 'NUM. RECIBO', w: 16, v: l => l.recibo },
    { t: 'RIESGO', w: 14, v: l => l.riesgo },
    { t: 'FECHA', w: 12, v: l => esDe(l.fecha) },
    { t: 'TIPO', w: 13, v: l => l.tipo },
    { t: 'P.NETA', w: 14, v: l => l.neta, n: true, tot: 'neta' },
    { t: 'IMPUESTO', w: 13, v: l => l.impuesto, n: true, tot: 'impuesto' },
    { t: 'IMPORTE TOTAL', w: 16, v: l => l.importe, n: true, tot: 'importe' },
    { t: 'COMISIÓN', w: 13, v: l => l.comision, n: true, tot: 'comision' },
    { t: 'LIQUIDO A ABONAR', w: 19, v: l => l.liquido, n: true, tot: 'liquido' },
    { t: 'PERIODICIDAD', w: 14, v: l => l.periodicidad },
    { t: 'FECHA INICIO PÓLIZA', w: 20, v: l => esDe(l.inicioPoliza) },
    { t: 'FECHA VENCIMIENTO', w: 19, v: l => esDe(l.vencimientoPoliza) },
    { t: 'TOMADOR', w: 36, v: l => l.tomador },
  ];
  const r = doc.resumen;
  const filaTotales = () => {
    const f = ws.addRow(cols.map((c, i) => (i === 0 ? r.recibos : c.tot ? (r[c.tot] as number) : '')));
    f.font = { bold: true };
    f.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } }; });
    cols.forEach((c, i) => { if (c.n) f.getCell(i + 1).numFmt = NUM; });
  };

  ws.addRow(['', tituloInforme(cfg, doc)]).getCell(2).font = { bold: true, size: 14, color: { argb: AZUL } };
  ws.mergeCells(1, 2, 1, 10);
  ws.addRow([]);
  ws.addRow([`Fecha informe - ${esDe(doc.fechaInforme || doc.fechaDocumento)}`]).getCell(1).font = { bold: true };
  ws.mergeCells(3, 1, 3, 4);
  filaTotales();
  const cab = ws.addRow(cols.map(c => c.t));
  cab.height = 22;
  cab.eachCell(c => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  // Por póliza y, dentro de cada póliza, en el orden del informe de MMT (el más reciente primero)
  const ordenadas = [...doc.lineas].sort((a, b) => a.poliza.localeCompare(b.poliza, 'es', { numeric: true }) || a.fila - b.fila);
  for (const l of ordenadas) {
    const fila = ws.addRow(cols.map(c => c.v(l)));
    cols.forEach((c, i) => { if (c.n) fila.getCell(i + 1).numFmt = NUM; });
  }
  ws.addRow([]);
  filaTotales();
  ws.addRow([]); ws.addRow([]);
  // Resumen del pie, como en el Excel hecho a mano
  const pie = (etiqueta: string, valor: number) => {
    const f = ws.addRow(['', '', '', '', '', etiqueta, '', valor]);
    f.getCell(6).font = { bold: true }; f.getCell(8).font = { bold: true }; f.getCell(8).numFmt = NUM;
  };
  pie('PRIMA NETA:', r.neta); pie('IMPUESTO:', r.impuesto); pie('IMPORTE TOTAL:', r.importe);
  ws.addRow([]);
  pie('COMISIÓN:', r.comision); pie('LIQUIDO A ABONAR:', r.liquido);
  cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.w; });
  ws.views = [{ state: 'frozen', ySplit: 5 }];

  if (doc.cambios.length > 0) {
    const wc = wb.addWorksheet('Cambios');
    const h = wc.addRow(['FECHA', 'USUARIO', 'RECIBO', 'DATO', 'ANTES', 'DESPUÉS', 'MOTIVO']);
    h.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }; });
    for (const c of doc.cambios) wc.addRow([c.fecha, c.usuario, c.recibo, c.campo, c.antes, c.despues, c.motivo]);
    [22, 16, 16, 14, 16, 18, 40].forEach((w, i) => { wc.getColumn(i + 1).width = w; });
  }
  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

/** «2026-01-13 RECIBOS PRIMER TRIMESTRE 2026 - GEODIS» */
export function nombreCarpeta(cfg: ConfigFacturacion, doc: DocumentoFactura): string {
  return paraNombre(`${doc.fechaDocumento} RECIBOS ${doc.serie === 'RW' ? 'REGULARIZACIÓN ' : ''}${doc.nombrePeriodo} - ${cfg.flota}`);
}

export interface EntradaZip {
  cfg: ConfigFacturacion;
  /** recibos de UNA operación (uno por tomador) */
  docs: DocumentoFactura[];
  /** Excel original tal cual se subió (no lo hay al volver a descargar del histórico) */
  original?: File;
}

export async function construirZip(e: EntradaZip, progreso?: (texto: string) => void): Promise<{ blob: Blob; nombre: string }> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const raiz = nombreCarpeta(e.cfg, e.docs[0]);
  const carpeta = zip.folder(raiz)!;
  const original = carpeta.folder('ORIGINAL')!, trabajo = carpeta.folder('TRABAJO')!, enviar = carpeta.folder('ENVIAR')!;
  const varios = e.docs.length > 1;
  const flota = e.cfg.flota;

  if (e.original) original.file(e.original.name, await e.original.arrayBuffer());
  for (const doc of e.docs) {
    progreso?.(`Generando ${doc.numero}${varios ? ` · ${doc.tomador.nombre}` : ''}…`);
    const cola = varios ? ` - ${doc.tomador.nombre}` : '';
    const recibo = paraNombre(doc.serie === 'RC'
      ? `${doc.numero} RECIBO ${flota} ${doc.nombrePeriodo}${cola}`
      : `${doc.numero} RECIBO REGULARIZACIÓN ${flota} ${doc.nombrePeriodoCorto}${cola}`);
    const libro = paraNombre(`RECIBOS ${doc.serie === 'RW' ? 'REGULARIZACIÓN ' : ''}${doc.nombrePeriodo} ${flota}${cola}`);
    const cuerpo = cuerpoRecibo(e.cfg, doc);
    const [pdf, docx, excel] = await Promise.all([
      pedir('/api/flotas/recibos/factura-pdf', cuerpo),
      pedir('/api/flotas/recibos/factura', cuerpo),
      excelRecibos(doc, e.cfg),
    ]);
    trabajo.file(`${libro}.xlsx`, excel);
    trabajo.file(`${recibo}.docx`, docx);
    enviar.file(`${doc.numero} ${libro}.xlsx`, excel);
    enviar.file(`${recibo}.pdf`, pdf);
  }
  progreso?.('Comprimiendo…');
  return { blob: await zip.generateAsync({ type: 'blob' }), nombre: `${raiz}.zip` };
}

/** Inicio del ciclo por defecto a partir del vencimiento (renovación) de la flota: un año antes. */
export function inicioDesdeVencimiento(vencimiento: string | undefined): string {
  const d = diaDe(vencimiento ?? '');
  return d ? isoDe(moverMeses(d, -12)) : '';
}
