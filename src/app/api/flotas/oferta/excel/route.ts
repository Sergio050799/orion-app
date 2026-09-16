import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

// ── Tipos ───────────────────────────────────────────────────────────────────
interface Vehiculo {
  tomador: string;
  tipologia: string;
  matricula: string;
  marca: string;
  modelo: string;
  coberturas: string;
  forma_pago: string;
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

// Always return dd/mm/yyyy string — never a Date object (avoids serial number issue)
function fmtFecha(raw: unknown): string {
  if (!raw) return '';
  const s = String(raw);
  if (!s || s === 'undefined' || s === 'null') return '';
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return s;  // already correct
  // Excel serial number: integer in plausible date range (40000=2009, 70000=2091)
  const n = Number(s);
  if (!isNaN(n) && Number.isInteger(n) && n > 40000 && n < 70000) {
    const d = new Date((n - 25569) * 86400 * 1000);
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
  }
  // Try ISO (must come AFTER serial check — new Date("46296") parses as year 46296)
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }
  return s;
}

// Currency string for display in cells that SheetJS can't format reliably
function fmtEUR(n: number): string {
  return n > 0 ? n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €' : '';
}

// Style objects
const DARK_BLUE = { rgb: "002F82" };
const WHITE     = { rgb: "FFFFFF" };
const GRAY_BG   = { rgb: "F3F4F6" };
const STRIPE    = { rgb: "F9FAFB" };
const INDIGO_BG = { rgb: "EEF3FF" };

const thin   = { style: "thin"   as const };
const medium = { style: "medium" as const };

const s_title: object = {
  fill: { fgColor: DARK_BLUE, patternType: "solid" },
  font: { bold: true, sz: 26, color: WHITE, name: "Calibri" },
  alignment: { horizontal: "center", vertical: "center" },
};
const s_title_fill: object = {
  fill: { fgColor: DARK_BLUE, patternType: "solid" },
};
const s_company: object = {
  font: { bold: true, sz: 13, name: "Calibri" },
  alignment: { horizontal: "center", vertical: "center" },
  border: { bottom: thin },
};
const s_header: object = {
  fill: { fgColor: DARK_BLUE, patternType: "solid" },
  font: { bold: true, sz: 11, color: WHITE, name: "Calibri" },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: { top: thin, bottom: medium, left: thin, right: thin },
};
const s_data = (even: boolean): object => ({
  fill: { fgColor: even ? { rgb: "FFFFFF" } : STRIPE, patternType: "solid" },
  font: { sz: 11, name: "Calibri" },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: { top: thin, bottom: thin, left: thin, right: thin },
});
const s_data_num = (even: boolean): object => ({
  fill: { fgColor: even ? { rgb: "FFFFFF" } : STRIPE, patternType: "solid" },
  font: { sz: 11, bold: true, name: "Calibri", color: DARK_BLUE },
  alignment: { horizontal: "right", vertical: "center" },
  border: { top: thin, bottom: thin, left: thin, right: thin },
});
const s_total: object = {
  fill: { fgColor: INDIGO_BG, patternType: "solid" },
  font: { bold: true, sz: 12, name: "Calibri" },
  alignment: { horizontal: "center", vertical: "center" },
  border: { top: medium, bottom: medium, left: medium, right: medium },
};
const s_total_num: object = {
  fill: { fgColor: INDIGO_BG, patternType: "solid" },
  font: { bold: true, sz: 13, name: "Calibri", color: DARK_BLUE },
  alignment: { horizontal: "right", vertical: "center" },
  border: { top: medium, bottom: medium, left: medium, right: medium },
};

// ── POST /api/flotas/oferta/excel ───────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body: OfertaBody = await req.json();

    if (!body.vehiculos || body.vehiculos.length === 0) {
      return NextResponse.json({ error: "No hay vehiculos en la oferta." }, { status: 400 });
    }

    const N = body.vehiculos.length;
    const TITLE_ROW  = 0;
    const CO_ROW     = 1;
    const HEAD_ROW   = 2;
    const DATA_START = 3;
    const DATA_END   = DATA_START + N - 1;
    const TOTAL_ROW  = DATA_END + 1;

    // ── Build rows ────────────────────────────────────────────────────────────
    const rows: (string | number)[][] = [];

    rows.push([`OFERTA PARA LA FLOTA ${body.flota_nombre}`, ...Array(8).fill('')]);
    rows.push([`${body.empresa_nombre}  —  ${body.empresa_cif}`, ...Array(8).fill('')]);
    rows.push(['TOMADOR', 'TIPOLOGÍA', 'MATRÍCULA', 'MARCA', 'MODELO',
               'COBERTURAS', 'FORMA PAGO', 'VENCIMIENTO', 'PRIMA OFERTADA MMT']);

    for (const v of body.vehiculos) {
      rows.push([
        v.tomador, v.tipologia, v.matricula, v.marca, v.modelo,
        v.coberturas,
        v.forma_pago,
        fmtFecha(v.fecha_vencimiento),
        fmtEUR(v.prima_ofertada),
      ]);
    }

    // Totals placeholder
    rows.push(['TOTALES', '', '', '', '', '', '', '', '']);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const enc = XLSX.utils.encode_cell;

    // ── Merges ────────────────────────────────────────────────────────────────
    ws['!merges'] = [
      { s: { r: TITLE_ROW, c: 0 }, e: { r: TITLE_ROW, c: 8 } },
      { s: { r: CO_ROW,    c: 0 }, e: { r: CO_ROW,    c: 8 } },
    ];

    // ── Column widths ─────────────────────────────────────────────────────────
    ws['!cols'] = [
      { wch: 28 }, { wch: 16 }, { wch: 13 }, { wch: 16 }, { wch: 22 },
      { wch: 35 }, { wch: 16 }, { wch: 14 }, { wch: 26 },
    ];

    // ── Row heights ───────────────────────────────────────────────────────────
    ws['!rows'] = Array.from({ length: TOTAL_ROW + 1 }, (_, i) => {
      if (i === TITLE_ROW) return { hpt: 56 };
      if (i === CO_ROW)    return { hpt: 28 };
      if (i === HEAD_ROW)  return { hpt: 24 };
      if (i === TOTAL_ROW) return { hpt: 26 };
      return { hpt: 22 };
    });

    // ── Apply styles ──────────────────────────────────────────────────────────

    // Title row (blue background)
    for (let c = 0; c < 9; c++) {
      const ref = enc({ r: TITLE_ROW, c });
      if (!ws[ref]) ws[ref] = { t: 's', v: '' };
      ws[ref].s = c === 0 ? s_title : s_title_fill;
    }

    // Company row
    for (let c = 0; c < 9; c++) {
      const ref = enc({ r: CO_ROW, c });
      if (!ws[ref]) ws[ref] = { t: 's', v: '' };
      ws[ref].s = s_company;
    }

    // Header row (dark blue, white text)
    for (let c = 0; c < 9; c++) {
      const ref = enc({ r: HEAD_ROW, c });
      if (!ws[ref]) ws[ref] = { t: 's', v: '' };
      ws[ref].s = s_header;
    }

    // Data rows
    for (let row = 0; row < N; row++) {
      const r = DATA_START + row;
      const even = row % 2 === 0;
      for (let c = 0; c < 9; c++) {
        const ref = enc({ r, c });
        if (!ws[ref]) ws[ref] = { t: 's', v: '' };
        ws[ref].s = c === 8 ? s_data_num(even) : s_data(even);
      }
    }

    // Totals row
    const totalOferta = body.vehiculos.reduce((s, v) => s + (v.prima_ofertada || 0), 0);

    for (let c = 0; c < 9; c++) {
      const ref = enc({ r: TOTAL_ROW, c });
      if (!ws[ref]) ws[ref] = { t: 's', v: '' };
      ws[ref].s = c === 8 ? s_total_num : s_total;
    }
    ws[enc({ r: TOTAL_ROW, c: 8 })].v = fmtEUR(totalOferta);

    // Print settings
    ws['!pageSetup'] = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1, paperSize: 9 };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Oferta');

    // ── Hoja 2: Detalle de coberturas ─────────────────────────────────────────
    if (body.cobAnexo && body.cobAnexo.length > 0) {
      const BLUE   = { rgb: "002F82" };
      const WHTF   = { rgb: "FFFFFF" };
      const LBLUE  = { rgb: "EEF3FF" };
      const BORD   = { rgb: "D4DFF5" };
      const thin2  = { style: "thin" as const, color: { rgb: "D4DFF5" } };

      const s_cob_title: object = {
        fill: { fgColor: BLUE, patternType: "solid" },
        font: { bold: true, sz: 11, color: WHTF, name: "Calibri" },
        alignment: { horizontal: "left", vertical: "center" },
        border: { top: thin2, bottom: thin2, left: thin2, right: thin2 },
      };
      const s_cob_head: object = {
        fill: { fgColor: LBLUE, patternType: "solid" },
        font: { bold: true, sz: 13, name: "Calibri", color: BLUE },
        alignment: { horizontal: "left", vertical: "center" },
        border: { bottom: { style: "medium" as const, color: BORD } },
      };
      const s_cob_item: object = {
        font: { sz: 11, name: "Calibri" },
        alignment: { horizontal: "left", vertical: "center" },
        border: { bottom: thin2, left: thin2, right: thin2 },
      };

      const s_cob_tipos: object = {
        fill: { fgColor: { rgb: "0a3d91" }, patternType: "solid" },
        font: { sz: 8, name: "Calibri", color: { rgb: "BDD0F5" }, italic: true },
        alignment: { horizontal: "left", vertical: "center" },
      };

      const cob2rows: (string | number)[][] = [];
      cob2rows.push(['DETALLE DE COBERTURAS INCLUIDAS', '']);

      for (const { titulo, tipologias, garantias } of body.cobAnexo) {
        cob2rows.push(['']);
        cob2rows.push([titulo, '']);
        if (tipologias && tipologias.length > 0) cob2rows.push([tipologias.join(' · '), '']);
        for (const g of garantias) cob2rows.push([`  ✓  ${g}`, '']);
      }

      const ws2 = XLSX.utils.aoa_to_sheet(cob2rows);
      const enc2 = XLSX.utils.encode_cell;

      ws2['!cols'] = [{ wch: 55 }, { wch: 10 }];
      ws2['!rows'] = cob2rows.map(() => ({ hpt: 20 }));
      if (ws2['!rows'][0]) ws2['!rows'][0] = { hpt: 30 };

      // Title row
      ws2[enc2({ r: 0, c: 0 })].s = s_cob_head;

      let rowIdx = 2;
      for (const { titulo, tipologias, garantias } of body.cobAnexo) {
        rowIdx++; // blank
        ws2[enc2({ r: rowIdx, c: 0 })] = { t: 's', v: titulo, s: s_cob_title };
        ws2[enc2({ r: rowIdx, c: 1 })] = { t: 's', v: '', s: s_cob_title };
        rowIdx++;
        if (tipologias && tipologias.length > 0) {
          ws2[enc2({ r: rowIdx, c: 0 })] = { t: 's', v: tipologias.join(' · '), s: s_cob_tipos };
          ws2[enc2({ r: rowIdx, c: 1 })] = { t: 's', v: '', s: s_cob_tipos };
          rowIdx++;
        }
        for (const g of garantias) {
          ws2[enc2({ r: rowIdx, c: 0 })] = { t: 's', v: `  ✓  ${g}`, s: s_cob_item };
          ws2[enc2({ r: rowIdx, c: 1 })] = { t: 's', v: '', s: s_cob_item };
          rowIdx++;
        }
      }

      XLSX.utils.book_append_sheet(wb, ws2, 'Coberturas');
    }

    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellStyles: true }) as number[];
    const safeName = body.flota_nombre.replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || 'OFERTA';

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="OFERTA_${safeName}.xlsx"`,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Oferta Excel] Error:', error instanceof Error ? error.stack : error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
