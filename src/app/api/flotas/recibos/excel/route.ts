import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import type { ReciboRow, ResumenRecibos } from "@/core/flotas/recibos";

export const runtime = "nodejs";

interface ExcelRequestBody {
  tipo: 'EMISION' | 'REGULARIZACION';
  titulo: string;
  fechaInforme: string;
  rows: ReciboRow[];
  resumen: ResumenRecibos;
}

const NUM_FMT = '#,##0.00';

export async function POST(req: NextRequest) {
  try {
    const body: ExcelRequestBody = await req.json();
    const { tipo, titulo, fechaInforme, rows, resumen } = body;

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: "No hay datos para generar el Excel" }, { status: 400 });
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Recibos');

    // ─── Fila 1: Título ─────────────────────────────────────────────────────
    const titleRow = ws.addRow([titulo || `Informe Recibos ${tipo}`]);
    titleRow.font = { bold: true, size: 14 };
    ws.mergeCells(1, 1, 1, 14);

    // ─── Fila 2: vacía
    ws.addRow([]);

    // ─── Fila 3: Fecha informe ──────────────────────────────────────────────
    const dateRow = ws.addRow([`Fecha informe - ${fechaInforme}`]);
    dateRow.font = { italic: true };

    // ─── Fila 4: Totales ────────────────────────────────────────────────────
    const totalsRow = ws.addRow([
      `${resumen.totalRegistros} registros`,
      '', '', '', '',
      resumen.totalImporte,
      resumen.totalPrimaNeta,
      resumen.totalImpuesto,
      resumen.totalComision,
      resumen.totalLiquidoAbonar,
    ]);
    totalsRow.font = { bold: true };
    [6, 7, 8, 9, 10].forEach(col => {
      totalsRow.getCell(col).numFmt = NUM_FMT;
    });

    // ─── Fila 5: Headers de columna ─────────────────────────────────────────
    const headers = [
      'Póliza', 'Num. Recibo', 'Riesgo', 'Fecha', 'Tipo',
      'Importe', 'P.Neta', 'Impuesto', 'Comisión', 'Líquido a Abonar',
      'Periodicidad', 'Fec.Inicio Póliza', 'Fec.Vencimiento', 'Tomador',
    ];
    const headerRow = ws.addRow(headers);
    headerRow.font = { bold: true };
    headerRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
      cell.border = {
        bottom: { style: 'thin' },
      };
    });

    // ─── Filas 6+: Datos ────────────────────────────────────────────────────
    for (const r of rows) {
      const dataRow = ws.addRow([
        r.poliza, r.numRecibo, r.riesgo, r.fecha, r.tipo,
        r.importe, r.pNeta, r.impuesto, r.comision, r.liquidoAbonar,
        r.periodicidad, r.fechaInicioPoliza, r.fechaVencimiento, r.tomador,
      ]);
      [6, 7, 8, 9, 10].forEach(col => {
        dataRow.getCell(col).numFmt = NUM_FMT;
      });
    }

    // ─── Filas resumen después de datos ─────────────────────────────────────
    ws.addRow([]); // separador
    const addSummaryRow = (label: string, value: number) => {
      const row = ws.addRow([label, '', '', '', '', value]);
      row.font = { bold: true };
      row.getCell(6).numFmt = NUM_FMT;
    };
    addSummaryRow('IMPORTE TOTAL', resumen.totalImporte);
    addSummaryRow('COMISIÓN', resumen.totalComision);
    addSummaryRow('LÍQUIDO A ABONAR', resumen.totalLiquidoAbonar);

    // ─── Bloque resumen desglosado en columnas P-Q (16-17) ──────────────────
    const startRow = 5; // junto a los headers
    const labelCol = 16; // P
    const valueCol = 17; // Q

    const summaryLabels = ['PRIMA NETA', 'IMPUESTO', 'IMPORTE TOTAL', 'COMISIÓN', 'LÍQUIDO A ABONAR'];
    const summaryValues = [
      resumen.totalPrimaNeta,
      resumen.totalImpuesto,
      resumen.totalImporte,
      resumen.totalComision,
      resumen.totalLiquidoAbonar,
    ];

    for (let i = 0; i < summaryLabels.length; i++) {
      const row = ws.getRow(startRow + i);
      const labelCell = row.getCell(labelCol);
      const valueCell = row.getCell(valueCol);
      labelCell.value = summaryLabels[i];
      labelCell.font = { bold: true };
      valueCell.value = summaryValues[i];
      valueCell.numFmt = NUM_FMT;
      valueCell.font = { bold: true };
    }

    // ─── Ajustar anchos ─────────────────────────────────────────────────────
    ws.columns.forEach((col, idx) => {
      if (idx < 14) col.width = idx < 5 ? 16 : 14;
    });

    // ─── Generar buffer ─────────────────────────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer();

    return new NextResponse(buffer as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="recibos_${tipo.toLowerCase()}.xlsx"`,
      },
    });
  } catch (e: unknown) {
    console.error("[RECIBOS] Excel error:", e);
    return NextResponse.json(
      { error: (e instanceof Error ? e.message : "Error desconocido") },
      { status: 500 }
    );
  }
}
