import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import path from "path";
import fs from "fs";

export const runtime = "nodejs";

// ── Tipos ───────────────────────────────────────────────────────────────────
interface Vehiculo {
  tomador: string;
  tipologia: string;
  matricula: string;
  marca: string;
  modelo: string;
  coberturas: string;
  franquicia?: number;
  periodicidad: string;
  fecha_vencimiento: string;
  prima_ofertada: number;
}

interface OfertaBody {
  flota_nombre: string;
  empresa_nombre: string;
  empresa_cif: string;
  vehiculos: Vehiculo[];
  cobAnexo?: { titulo: string; tipologias?: string[]; garantias: string[] }[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const NUM_EUR = '#,##0.00 "€"';

function toDate(raw: unknown): Date | null {
  const t = fmtFecha(raw);
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])) : null;
}

function fmtFecha(raw: unknown): string {
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

// ── Paleta ──────────────────────────────────────────────────────────────────
const DARK_BLUE  = 'FF002F82';
const WHITE      = 'FFFFFFFF';
const STRIPE_ODD = 'FFF7F9FD';
const INDIGO_BG  = 'FFEAF0FA';
const COB_DARK   = 'FF002F82';
const COB_LIGHT  = 'FFEAF0FA';
const BORDER_C   = 'FFD4DFF5';

const thin: ExcelJS.BorderStyle = 'thin';
const medium: ExcelJS.BorderStyle = 'medium';

function cellBorder(style: ExcelJS.BorderStyle = thin, color = 'FFD1D5DB'): ExcelJS.Border {
  return { style, color: { argb: color } };
}

// ── Cache de logo ────────────────────────────────────────────────────────────
let _cachedLogoBuffer: Buffer | null | undefined = undefined;
function getLogoBuffer(): Buffer | null {
  if (_cachedLogoBuffer !== undefined) return _cachedLogoBuffer;
  try {
    const logoPath = path.join(process.cwd(), 'public', 'LOGOMMT.jpg');
    _cachedLogoBuffer = fs.existsSync(logoPath) ? fs.readFileSync(logoPath) : null;
  } catch { _cachedLogoBuffer = null; }
  return _cachedLogoBuffer;
}

// ── POST /api/flotas/oferta/excel ───────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body: OfertaBody = await req.json();

    if (!body.vehiculos || body.vehiculos.length === 0) {
      return Response.json({ error: "No hay vehiculos en la oferta." }, { status: 400 });
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = 'MMT Seguros';
    wb.created = new Date();

    // ── Logo ──────────────────────────────────────────────────────────────────
    let logoId: number | undefined;
    const logoBuffer = getLogoBuffer();
    if (logoBuffer) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        logoId = wb.addImage({ buffer: logoBuffer as any, extension: 'jpeg' });
      } catch { /* logo not valid */ }
    }

    // ── Hoja 1: Oferta ────────────────────────────────────────────────────────
    const ws = wb.addWorksheet('Oferta', {
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
      headerFooter: { oddFooter: '&L&8Documento confidencial&R&8Página &P de &N' },
      views: [{ state: 'frozen', ySplit: 3 }],
    });

    const COLS = [
      { header: 'TOMADOR',            key: 'tomador',       width: 28 },
      { header: 'TIPOLOGÍA',          key: 'tipologia',     width: 17 },
      { header: 'MATRÍCULA',          key: 'matricula',     width: 13 },
      { header: 'MARCA',              key: 'marca',         width: 16 },
      { header: 'MODELO',             key: 'modelo',        width: 22 },
      { header: 'COBERTURAS',         key: 'coberturas',    width: 35 },
      { header: 'FRANQUICIA',         key: 'franquicia',    width: 16 },
      { header: 'PERIODICIDAD',       key: 'periodicidad',  width: 16 },
      { header: 'VENCIMIENTO',        key: 'vencimiento',   width: 14 },
      { header: 'PRIMA OFERTADA MMT', key: 'prima',        width: 26 },
    ];

    ws.columns = COLS.map(c => ({ key: c.key, width: c.width }));

    // Track max content length per column for auto-fit after rows are added
    const colMaxLen: number[] = COLS.map(c => c.header.length);

    // ── Fila 1: Título ────────────────────────────────────────────────────────
    const titleRow = ws.addRow([`OFERTA PARA LA FLOTA ${body.flota_nombre}`, '', '', '', '', '', '', '', '', '']);
    titleRow.height = 56;
    ws.mergeCells(`A1:J1`);
    const titleCell = ws.getCell('A1');
    titleCell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK_BLUE } };
    titleCell.font   = { bold: true, size: 22, color: { argb: WHITE }, name: 'Calibri' };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    // Fill remaining cells in title row with blue background
    for (let c = 2; c <= 10; c++) {
      const cell = titleRow.getCell(c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK_BLUE } };
    }

    // Add logo in the title row — oneCell keeps it anchored to the row without overflowing
    if (logoId !== undefined) {
      ws.addImage(logoId, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tl: { col: 0, row: 0 } as any,
        ext: { width: 150, height: 48 },
        editAs: 'oneCell',
      });
    }

    // ── Fila 2: Empresa ───────────────────────────────────────────────────────
    const coLabel = body.empresa_cif
      ? `${body.empresa_nombre}  —  ${body.empresa_cif}`
      : body.empresa_nombre;
    const coRow = ws.addRow([coLabel, '', '', '', '', '', '', '', '', '']);
    coRow.height = 28;
    ws.mergeCells('A2:J2');
    const coCell = ws.getCell('A2');
    coCell.font      = { bold: true, size: 13, name: 'Calibri' };
    coCell.alignment = { horizontal: 'center', vertical: 'middle' };
    coCell.border    = { bottom: cellBorder(medium, 'FFE5E7EB') };
    for (let c = 2; c <= 10; c++) {
      ws.getCell(2, c).border = { bottom: cellBorder(medium, 'FFE5E7EB') };
    }

    // ── Fila 3: Cabeceras ─────────────────────────────────────────────────────
    const headRow = ws.addRow(COLS.map(c => c.header));
    headRow.height = 24;
    headRow.eachCell(cell => {
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK_BLUE } };
      cell.font      = { bold: true, size: 11, color: { argb: WHITE }, name: 'Calibri' };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border    = { top: cellBorder(thin), bottom: cellBorder(medium), left: cellBorder(thin), right: cellBorder(thin) };
    });

    // ── Filas de datos ────────────────────────────────────────────────────────
    const totalOferta = body.vehiculos.reduce((s, v) => s + (v.prima_ofertada || 0), 0);

    body.vehiculos.forEach((v, idx) => {
      const even = idx % 2 === 0;
      const bgColor = even ? 'FFFFFFFF' : STRIPE_ODD;
      const rowValues = [
        v.tomador, v.tipologia, v.matricula, v.marca, v.modelo,
        v.coberturas,
        v.franquicia && v.franquicia > 0 ? v.franquicia : '',
        v.periodicidad,
        toDate(v.fecha_vencimiento) ?? fmtFecha(v.fecha_vencimiento),
        v.prima_ofertada > 0 ? v.prima_ofertada : '',
      ];
      // Track max col lengths for auto-fit
      rowValues.forEach((val, ci) => {
        const len = val ? String(val).length : 0;
        if (len > colMaxLen[ci]) colMaxLen[ci] = len;
      });
      const cobLen = v.coberturas?.length || 0;
      const dr = ws.addRow(rowValues);
      dr.height = cobLen > 60 ? Math.min(22 + Math.ceil((cobLen - 30) / 40) * 14, 90) : 22;
      dr.eachCell((cell, colNumber) => {
        const isLast = colNumber === 10;
        if (colNumber === 7 || isLast) cell.numFmt = NUM_EUR;
        if (colNumber === 9) cell.numFmt = 'dd/mm/yyyy';
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        cell.font      = isLast
          ? { bold: true, size: 11, name: 'Calibri', color: { argb: DARK_BLUE } }
          : { size: 11, name: 'Calibri' };
        cell.alignment = { horizontal: colNumber === 1 ? 'left' : 'center', vertical: 'middle', wrapText: true };
        cell.border    = { top: cellBorder(), bottom: cellBorder(), left: cellBorder(), right: cellBorder() };
      });
    });

    // ── Fila de totales ───────────────────────────────────────────────────────
    const firstData = 4, lastData = 3 + body.vehiculos.length;
    const totalRow = ws.addRow(['TOTALES', '', '', '', '', '', '', '', '', { formula: `SUM(J${firstData}:J${lastData})`, result: totalOferta }]);
    totalRow.height = 26;
    ws.mergeCells(`A${totalRow.number}:I${totalRow.number}`);
    totalRow.eachCell((cell, colNumber) => {
      const isLast = colNumber === 10;
      if (isLast) cell.numFmt = NUM_EUR;
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: INDIGO_BG } };
      cell.font      = { bold: true, size: isLast ? 13 : 12, name: 'Calibri', color: isLast ? { argb: DARK_BLUE } : undefined };
      cell.alignment = { horizontal: isLast ? 'center' : 'right', vertical: 'middle' };
      cell.border    = { top: cellBorder(medium), bottom: cellBorder(medium), left: cellBorder(medium), right: cellBorder(medium) };
    });
    // Label in merged cell
    ws.getCell(`A${totalRow.number}`).alignment = { horizontal: 'right', vertical: 'middle' };
    ws.getCell(`A${totalRow.number}`).value = 'TOTALES';

    // Auto-fit column widths based on content
    ws.columns.forEach((col, i) => {
      const minW = COLS[i]?.width ?? 10;
      const autoW = Math.min(colMaxLen[i] + 3, 55);
      col.width = Math.max(minW, autoW);
    });

    // ── Hoja 2: Coberturas ────────────────────────────────────────────────────
    if (body.cobAnexo && body.cobAnexo.length > 0) {
      const ws2 = wb.addWorksheet('Coberturas', {
        pageSetup: { orientation: 'portrait', fitToPage: true },
        headerFooter: { oddFooter: '&L&8Documento confidencial&R&8Página &P de &N' },
      });
      ws2.columns = [{ width: 56 }, { width: 6 }];

      // Título de hoja
      const h1 = ws2.addRow(['DETALLE DE COBERTURAS INCLUIDAS', '']);
      h1.height = 30;
      ws2.mergeCells('A1:B1');
      const h1Cell = ws2.getCell('A1');
      h1Cell.font      = { bold: true, size: 13, name: 'Calibri', color: { argb: DARK_BLUE } };
      h1Cell.alignment = { horizontal: 'left', vertical: 'middle' };
      h1Cell.border    = { bottom: cellBorder(medium, BORDER_C) };
      h1Cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: COB_LIGHT } };

      for (const { titulo, tipologias, garantias } of body.cobAnexo) {
        // Blank separator
        const blank = ws2.addRow(['', '']);
        blank.height = 6;

        // Block title (dark blue bg)
        const tRow = ws2.addRow([titulo, '']);
        tRow.height = 20;
        ws2.mergeCells(`A${tRow.number}:B${tRow.number}`);
        const tCell = ws2.getCell(`A${tRow.number}`);
        tCell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK_BLUE } };
        tCell.font      = { bold: true, size: 11, color: { argb: WHITE }, name: 'Calibri' };
        tCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        tCell.border    = { top: cellBorder(thin, BORDER_C), bottom: cellBorder(thin, BORDER_C), left: cellBorder(thin, BORDER_C), right: cellBorder(thin, BORDER_C) };

        // Tipologías (dark variant)
        if (tipologias && tipologias.length > 0) {
          const tipRow = ws2.addRow([tipologias.join(' · '), '']);
          tipRow.height = 16;
          ws2.mergeCells(`A${tipRow.number}:B${tipRow.number}`);
          const tipCell = ws2.getCell(`A${tipRow.number}`);
          tipCell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: COB_DARK } };
          tipCell.font      = { italic: true, size: 9, color: { argb: 'FFBDD0F5' }, name: 'Calibri' };
          tipCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        }

        // Garantías
        for (const g of garantias) {
          const gRow = ws2.addRow([`  ✓  ${g}`, '']);
          gRow.height = 20;
          ws2.mergeCells(`A${gRow.number}:B${gRow.number}`);
          const gCell = ws2.getCell(`A${gRow.number}`);
          gCell.font      = { size: 11, name: 'Calibri', color: { argb: 'FF1E2A4A' } };
          gCell.alignment = { horizontal: 'left', vertical: 'middle' };
          gCell.border    = { bottom: cellBorder(thin, BORDER_C), left: cellBorder(thin, BORDER_C), right: cellBorder(thin, BORDER_C) };
        }
      }

      // Footer coberturas
      const footer2 = ws2.addRow(['']);
      footer2.height = 6;
      const footerRow = ws2.addRow(['Documento confidencial', '']);
      footerRow.height = 18;
      ws2.mergeCells(`A${footerRow.number}:B${footerRow.number}`);
      const footerCell = ws2.getCell(`A${footerRow.number}`);
      footerCell.font      = { size: 9, italic: true, color: { argb: 'FF5D6B82' }, name: 'Calibri' };
      footerCell.alignment = { horizontal: 'left', vertical: 'middle' };
      footerCell.border    = { top: cellBorder(thin, BORDER_C) };
    }

    // ── Generar buffer ────────────────────────────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer();
    const safeName = body.flota_nombre.replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || 'OFERTA';

    return new Response(new Uint8Array(buffer as unknown as ArrayBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="OFERTA_${safeName}.xlsx"`,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Oferta Excel] Error:', error instanceof Error ? error.stack : error);
    return Response.json({ error: msg }, { status: 500 });
  }
}
