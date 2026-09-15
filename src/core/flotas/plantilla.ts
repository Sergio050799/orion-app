import ExcelJS from 'exceljs';
import type { FlotaCarpeta } from './carpeta';

// ─── Paleta MMT ────────────────────────────────────────────────────────────
const C = {
  azul_mmt:   '002F82',   // azul corporativo MMT
  verde:      '00B050',   // verde MMT (headers tabla)
  white:      'FFFFFF',
  gray_50:    'F0F4FA',   // zebra clara
  gray_100:   'E4EAF4',
  text:       '0A1628',
  border:     'B8C8E8',
};

// ─── Columnas de datos ────────────────────────────────────────────────────────
const COLUMNS = [
  { key: 'cia_actual',            header: 'CIA ACTUAL',            width: 18 },
  { key: 'num_poliza_actual',     header: 'N POLIZA ACTUAL',       width: 20 },
  { key: 'fecha_vencimiento',     header: 'FECHA VENCIMIENTO',     width: 18 },
  { key: 'matricula',             header: 'MATRICULA',             width: 12 },
  { key: 'marca',                 header: 'MARCA',                 width: 14 },
  { key: 'modelo',                header: 'MODELO',                width: 18 },
  { key: 'tipo_vehiculo',         header: 'TIPO VEHICULO',         width: 26 },
  { key: 'uso',                   header: 'USO',                   width: 22 },
  { key: 'ambito',                header: 'AMBITO',                width: 14 },
  { key: 'coberturas_solicitadas',header: 'COBERTURAS SOLICITADAS',width: 28 },
  { key: 'lunas',                 header: 'LUNAS',                 width: 10 },
  { key: 'frq',                   header: 'FRQ',                   width: 8  },
  { key: 'asistencia',            header: 'ASISTENCIA',            width: 16 },
  { key: 'prima_referencia',      header: 'PRIMA REFERENCIA',      width: 16 },
];

const DATA_START_ROW = 6; // filas 1-2: título+info, 3: info, 4: separador, 5: cabeceras

function colLetter(n: number): string {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}


// ─── Aplicar estilo a fila completa (sin merge) ────────────────────────────
function fillRow(ws: ExcelJS.Worksheet, row: number, fill: ExcelJS.Fill) {
  for (let c = 1; c <= COLUMNS.length; c++) {
    ws.getCell(row, c).fill = fill;
  }
}

// ─── Funcion principal ────────────────────────────────────────────────────────

export async function generarPlantillaExcel(carpeta?: Pick<FlotaCarpeta, 'nombre' | 'header'>): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MMT Seguros';
  wb.created = new Date();

  const ws = wb.addWorksheet('Estudio de Flotas', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: DATA_START_ROW - 1 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });

  ws.columns = COLUMNS.map(col => ({ key: col.key, width: col.width }));

  const azulFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + C.azul_mmt } };

  // ── Fila 1: Titulo principal (fondo azul MMT) ─────────────────────────────
  fillRow(ws, 1, azulFill);
  const titleCell = ws.getCell('C1');
  titleCell.value = 'ESTUDIO DE FLOTAS';
  titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF' + C.white } };
  titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getRow(1).height = 42;
  for (let c = 1; c <= COLUMNS.length; c++) {
    ws.getCell(1, c).fill = azulFill;
  }

  // ── Logo MMT en la cabecera (esquina izquierda) ──────────────────────────
  try {
    const res = await fetch('/LOGOMMT.jpg');
    if (res.ok) {
      const buf = await res.arrayBuffer();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const logoId = wb.addImage({ buffer: Buffer.from(buf) as any, extension: 'jpeg' });
      ws.addImage(logoId, {
        tl: { col: 0, row: 0 },
        ext: { width: 119, height: 53 },  // 3.15cm x 1.4cm
      });
    }
  } catch { /* logo not found — continue without it */ }

  // ── Fila 2: Info empresa ───────────────────────────────────────────────────
  const nombreEstudio = carpeta?.nombre ?? 'NUEVO ESTUDIO';
  ws.getRow(2).height = 22;
  fillRow(ws, 2, { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + C.gray_100 } });

  const labelFont: Partial<ExcelJS.Font> = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF' + C.azul_mmt } };
  const valueFont: Partial<ExcelJS.Font> = { name: 'Calibri', size: 9, color: { argb: 'FF' + C.text } };
  const leftAlign: Partial<ExcelJS.Alignment> = { horizontal: 'left', vertical: 'middle' };

  ws.getCell(2, 1).value = 'CIF:';        ws.getCell(2, 1).font = labelFont; ws.getCell(2, 1).alignment = leftAlign;
  ws.getCell(2, 2).value = carpeta?.header.cif ?? '';   ws.getCell(2, 2).font = valueFont; ws.getCell(2, 2).alignment = leftAlign;
  ws.getCell(2, 3).value = 'TOMADOR:';    ws.getCell(2, 3).font = labelFont; ws.getCell(2, 3).alignment = leftAlign;
  ws.getCell(2, 4).value = carpeta?.header.tomador ?? '';  ws.getCell(2, 4).font = valueFont; ws.getCell(2, 4).alignment = leftAlign;
  ws.getCell(2, 6).value = 'ACTIVIDAD:';  ws.getCell(2, 6).font = labelFont; ws.getCell(2, 6).alignment = leftAlign;
  ws.getCell(2, 7).value = carpeta?.header.actividad ?? ''; ws.getCell(2, 7).font = valueFont; ws.getCell(2, 7).alignment = leftAlign;
  ws.getCell(2, 9).value = 'ESTUDIO:';    ws.getCell(2, 9).font = labelFont; ws.getCell(2, 9).alignment = leftAlign;
  ws.getCell(2, 10).value = nombreEstudio.toUpperCase(); ws.getCell(2, 10).font = { ...valueFont, bold: true }; ws.getCell(2, 10).alignment = leftAlign;

  // ── Fila 3: Mas info ──────────────────────────────────────────────────────
  ws.getRow(3).height = 22;
  fillRow(ws, 3, { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + C.gray_100 } });

  ws.getCell(3, 1).value = 'FORMA DE PAGO:'; ws.getCell(3, 1).font = labelFont; ws.getCell(3, 1).alignment = leftAlign;
  ws.getCell(3, 2).value = carpeta?.header.formaPago ?? ''; ws.getCell(3, 2).font = valueFont; ws.getCell(3, 2).alignment = leftAlign;
  ws.getCell(3, 3).value = 'EFECTO:';     ws.getCell(3, 3).font = labelFont; ws.getCell(3, 3).alignment = leftAlign;
  ws.getCell(3, 4).value = carpeta?.header.efecto ?? ''; ws.getCell(3, 4).font = valueFont; ws.getCell(3, 4).alignment = leftAlign;

  // ── Fila 4: Separador (azul MMT) ──────────────────────────────────────────
  fillRow(ws, 4, azulFill);
  ws.getRow(4).height = 3;

  // ── Fila 5: Cabeceras de columnas (verde MMT) ─────────────────────────────
  const headerRow = ws.getRow(5);
  headerRow.height = 28;
  COLUMNS.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF' + C.white } };
    cell.fill = azulFill;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
    cell.border = {
      right:  { style: 'thin', color: { argb: 'FFFFFFFF' } },
      bottom: { style: 'medium', color: { argb: 'FF' + C.azul_mmt } },
    };
  });

  // ── Filas de datos (100 filas) ───────────────────────────────────────────
  const TIPO_OPTIONS   = '"Turismo,Furgoneta,Cabeza tractora,Camion rigido,Semirremolque,Industrial matriculado,Industrial no matriculado"';
  const USO_OPTIONS    = '"Particular,Servicio publico,Transportes propios"';
  const AMBITO_OPTIONS = '"Nacional,Internacional"';
  const COB_OPTIONS    = '"Terceros,Terceros Ampliado,Todo Riesgo con Franquicia"';
  const LUNAS_OPTIONS  = '"Si,No"';
  const ASIST_OPTIONS  = '"Si,No"';

  const dvMap: Record<string, string> = {
    tipo_vehiculo:          TIPO_OPTIONS,
    uso:                    USO_OPTIONS,
    ambito:                 AMBITO_OPTIONS,
    coberturas_solicitadas: COB_OPTIONS,
    lunas:                  LUNAS_OPTIONS,
    asistencia:             ASIST_OPTIONS,
  };

  for (let r = DATA_START_ROW; r < DATA_START_ROW + 100; r++) {
    const row = ws.getRow(r);
    row.height = 18;
    const isEven = (r - DATA_START_ROW) % 2 === 0;

    COLUMNS.forEach((col, i) => {
      const cell = row.getCell(i + 1);

      cell.fill = { type: 'pattern', pattern: 'solid',
        fgColor: { argb: 'FF' + (isEven ? C.white : C.gray_50) } };
      cell.font = { name: 'Calibri', size: 9, color: { argb: 'FF' + C.text } };
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FF' + C.border } },
        right:  { style: 'thin', color: { argb: 'FF' + C.border } },
      };

      // Validaciones dropdown
      if (dvMap[col.key]) {
        cell.dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [dvMap[col.key]],
          showErrorMessage: false,
          showInputMessage: true,
          promptTitle: col.header,
          prompt: 'Selecciona un valor de la lista',
        };
      }
    });
  }

  // ── Nota al pie ───────────────────────────────────────────────────────────
  const noteRow = DATA_START_ROW + 101;
  const noteCell = ws.getCell(noteRow, 1);
  noteCell.value = 'MMT Seguros | LUNAS y ASISTENCIA: escribe Si o No';
  noteCell.font = { name: 'Calibri', size: 8, italic: true, color: { argb: 'FF9CA3AF' } };
  noteCell.alignment = { horizontal: 'left' };

  // ── Generar blob ────────────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
