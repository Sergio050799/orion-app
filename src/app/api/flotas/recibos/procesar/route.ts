import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import {
  parsearRecibosOriginal,
  calcularComisiones,
  generarResumen,
  agruparPorTomador,
} from "@/core/flotas/recibos";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const corredorJson = formData.get("corredor") as string | null;
    const flotaJson = formData.get("flota") as string | null;
    const tipo = formData.get("tipo") as string | null;
    const porcentajeOverride = formData.get("porcentaje_comision") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No se proporcionó archivo Excel" }, { status: 400 });
    }

    if (!corredorJson) {
      return NextResponse.json({ error: "Corredor no proporcionado" }, { status: 404 });
    }

    if (!flotaJson) {
      return NextResponse.json({ error: "Flota no proporcionada" }, { status: 404 });
    }

    if (!tipo || (tipo !== "EMISION" && tipo !== "REGULARIZACION")) {
      return NextResponse.json({ error: "Tipo debe ser EMISION o REGULARIZACION" }, { status: 400 });
    }

    const corredor = JSON.parse(corredorJson);
    const flota = JSON.parse(flotaJson);

    // Parsear Excel
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return NextResponse.json({ error: "Excel vacío — no se encontró ninguna hoja" }, { status: 400 });
    }
    const sheet = workbook.Sheets[sheetName];

    // Detectar fila de cabecera (buscar fila que contenga "Poliza" y "Riesgo")
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
    let headerRowIndex = -1;

    for (let r = range.s.r; r <= Math.min(range.e.r, 15); r++) {
      const rowValues: string[] = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        rowValues.push(cell ? String(cell.v || '').trim() : '');
      }
      const rowText = rowValues.join(' ').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (rowText.includes('poliza') && rowText.includes('riesgo')) {
        headerRowIndex = r;
        break;
      }
    }

    if (headerRowIndex < 0) {
      return NextResponse.json({ error: "No se encontró cabecera reconocible (columnas 'Poliza' y 'Riesgo')" }, { status: 400 });
    }

    // Extraer headers
    const headers: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: headerRowIndex, c })];
      headers.push(cell ? String(cell.v || '').trim() : `col_${c}`);
    }

    // Extraer filas de datos
    const rawRows: Record<string, string>[] = [];
    for (let r = headerRowIndex + 1; r <= range.e.r; r++) {
      const row: Record<string, string> = {};
      let hasData = false;
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        const val = cell ? String(cell.v ?? '').trim() : '';
        row[headers[c - range.s.c]] = val;
        if (val) hasData = true;
      }
      if (hasData) rawRows.push(row);
    }

    if (rawRows.length === 0) {
      return NextResponse.json({ error: "Excel sin datos después de la cabecera" }, { status: 400 });
    }

    // Procesar
    const parsed = parsearRecibosOriginal(rawRows);
    const porcentaje = porcentajeOverride
      ? parseFloat(porcentajeOverride)
      : (corredor.porcentajeComision || 0);
    const rows = calcularComisiones(parsed, porcentaje);
    const resumen = generarResumen(rows);
    const grupos = agruparPorTomador(rows, porcentaje);

    return NextResponse.json({
      ok: true,
      tipo,
      resumen,
      rows,
      grupos,
      corredor: {
        nombre: corredor.nombre || '',
        cif: corredor.cif || '',
        domicilio: corredor.domicilio || '',
        porcentajeComision: porcentaje,
      },
      flota: {
        nombre: flota.nombre || '',
        tomador: flota.header?.tomador || '',
        cifTomador: flota.header?.cifTomador || '',
        periodicidad: flota.header?.periodicidad || '',
        fechaEmision: flota.header?.fechaEmision || '',
      },
    });
  } catch (e: unknown) {
    console.error("[RECIBOS] Procesar error:", e);
    return NextResponse.json(
      { error: (e instanceof Error ? e.message : "Error desconocido") },
      { status: 500 }
    );
  }
}
