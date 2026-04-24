import ExcelJS from 'exceljs';
import type { FlotaCarpeta } from './carpeta';

// ─── Colores corporativos ─────────────────────────────────────────────────────
const C = {
  indigo:       '6366F1',
  indigo_dark:  '4338CA',
  indigo_light: 'EEF2FF',
  white:        'FFFFFF',
  gray_50:      'F9FAFB',
  gray_100:     'F3F4F6',
  gray_300:     'D1D5DB',
  gray_700:     '374151',
  text:         '111827',
  border:       'E5E7EB',
};

// ─── Columnas de datos ────────────────────────────────────────────────────────
const COLUMNS = [
  { key: 'cia_actual',            header: 'CIA ACTUAL',            width: 18 },
  { key: 'num_poliza_actual',     header: 'Nº PÓLIZA ACTUAL',      width: 20 },
  { key: 'fecha_vencimiento',     header: 'FECHA VENCIMIENTO',     width: 18 },
  { key: 'matricula',             header: 'MATRÍCULA',             width: 12 },
  { key: 'marca',                 header: 'MARCA',                 width: 14 },
  { key: 'modelo',                header: 'MODELO',                width: 18 },
  { key: 'tipo_vehiculo',         header: 'TIPO VEHÍCULO',         width: 26 },
  { key: 'uso',                   header: 'USO',                   width: 22 },
  { key: 'kw',                    header: 'KW',                    width: 8  },
  { key: 'cv',                    header: 'CV',                    width: 8  },
  { key: 'tn',                    header: 'TN',                    width: 8  },
  { key: 'ambito',                header: 'ÁMBITO',                width: 14 },
  { key: 'coberturas_solicitadas',header: 'COBERTURAS SOLICITADAS',width: 28 },
  { key: 'lunas',                 header: 'LUNAS',                 width: 8  },
  { key: 'frq',                   header: 'FRQ',                   width: 8  },
  { key: 'asistencia',            header: 'ASISTENCIA',            width: 14 },
  { key: 'prima_referencia',      header: 'PRIMA REFERENCIA',      width: 16 },
];

// Fila de datos empieza en la 7 (rows 1-2: título, 3-4: header empresa, 5: separador, 6: cabeceras)
const DATA_START_ROW = 7;
const KW_COL_INDEX   = COLUMNS.findIndex(c => c.key === 'kw') + 1;   // posición 1-based
const CV_COL_INDEX   = COLUMNS.findIndex(c => c.key === 'cv') + 1;

function colLetter(n: number): string {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// ─── Función principal ────────────────────────────────────────────────────────

export async function generarPlantillaExcel(carpeta?: Pick<FlotaCarpeta, 'nombre' | 'header'>): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Orion';
  wb.created = new Date();

  const ws = wb.addWorksheet('Estudio de Flotas', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: DATA_START_ROW - 1 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });

  // ── Anchos de columna ──────────────────────────────────────────────────────
  ws.columns = COLUMNS.map(col => ({ key: col.key, width: col.width }));

  // ── Fila 1: Título principal ───────────────────────────────────────────────
  ws.mergeCells(1, 1, 1, COLUMNS.length);
  const titleCell = ws.getCell('A1');
  titleCell.value = 'ESTUDIO DE FLOTAS — ORION';
  titleCell.font   = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF' + C.white } };
  titleCell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + C.indigo_dark } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 32;

  // ── Fila 2: Subtítulo / info empresa ──────────────────────────────────────
  const nombreEstudio = carpeta?.nombre ?? 'NUEVO ESTUDIO';
  ws.mergeCells(2, 1, 2, COLUMNS.length);
  const subtitleCell = ws.getCell('A2');
  subtitleCell.value = nombreEstudio.toUpperCase();
  subtitleCell.font  = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF' + C.indigo } };
  subtitleCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + C.indigo_light } };
  subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 22;

  // ── Fila 3: Datos de la empresa (etiquetas) ────────────────────────────────
  const labelStyle = (cell: ExcelJS.Cell, label: string) => {
    cell.value = label;
    cell.font  = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF' + C.gray_700 } };
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + C.gray_100 } };
    cell.alignment = { horizontal: 'left', vertical: 'middle' };
  };
  const valueStyle = (cell: ExcelJS.Cell, value: string) => {
    cell.value = value || '';
    cell.font  = { name: 'Calibri', size: 9, color: { argb: 'FF' + C.text } };
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + C.white } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF' + C.indigo } } };
    cell.alignment = { horizontal: 'left', vertical: 'middle' };
  };

  // CIF | TOMADOR | ACTIVIDAD
  ws.mergeCells(3, 1, 3, 2);  labelStyle(ws.getCell(3, 1), 'CIF:');
  ws.mergeCells(3, 3, 3, 5);  valueStyle(ws.getCell(3, 3), carpeta?.header.cif ?? '');
  ws.mergeCells(3, 6, 3, 7);  labelStyle(ws.getCell(3, 6), 'TOMADOR:');
  ws.mergeCells(3, 8, 3, 12); valueStyle(ws.getCell(3, 8), carpeta?.header.tomador ?? '');
  ws.mergeCells(3, 13, 3, 14);labelStyle(ws.getCell(3, 13), 'ACTIVIDAD:');
  ws.mergeCells(3, 15, 3, COLUMNS.length); valueStyle(ws.getCell(3, 15), carpeta?.header.actividad ?? '');
  ws.getRow(3).height = 18;

  // FORMA DE PAGO | EFECTO
  ws.mergeCells(4, 1, 4, 2);  labelStyle(ws.getCell(4, 1), 'FORMA DE PAGO:');
  ws.mergeCells(4, 3, 4, 5);  valueStyle(ws.getCell(4, 3), carpeta?.header.formaPago ?? '');
  ws.mergeCells(4, 6, 4, 7);  labelStyle(ws.getCell(4, 6), 'EFECTO:');
  ws.mergeCells(4, 8, 4, 12); valueStyle(ws.getCell(4, 8), carpeta?.header.efecto ?? '');
  ws.mergeCells(4, 13, 4, COLUMNS.length); // vacío
  ws.getRow(4).height = 18;

  // ── Fila 5: Separador ─────────────────────────────────────────────────────
  ws.mergeCells(5, 1, 5, COLUMNS.length);
  ws.getCell('A5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + C.indigo } };
  ws.getRow(5).height = 3;

  // ── Fila 6: Cabeceras de columnas ─────────────────────────────────────────
  const headerRow = ws.getRow(6);
  headerRow.height = 28;
  COLUMNS.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.font  = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF' + C.white } };
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + C.indigo } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
    cell.border = {
      right:  { style: 'thin', color: { argb: 'FF' + C.indigo_light } },
      bottom: { style: 'medium', color: { argb: 'FF' + C.indigo_dark } },
    };
  });

  // ── Filas de datos (100 filas) ────────────────────────────────────────────
  const TIPO_OPTIONS   = '"Turismo,Furgoneta,Cabeza tractora,Camión rígido,Semirremolque,Industrial matriculado,Industrial no matriculado"';
  const USO_OPTIONS    = '"Particular,Servicio público,Transportes propios"';
  const AMBITO_OPTIONS = '"Nacional,Internacional"';
  const COB_OPTIONS    = '"Terceros,Terceros Ampliado,Todo Riesgo con Franquicia"';
  const LUNAS_OPTIONS  = '"Sí,No"';
  const ASIST_OPTIONS  = '"no,oro,oro_plus"';

  const kwCol = colLetter(KW_COL_INDEX);

  for (let r = DATA_START_ROW; r < DATA_START_ROW + 100; r++) {
    const row = ws.getRow(r);
    row.height = 18;

    COLUMNS.forEach((col, i) => {
      const cell = row.getCell(i + 1);

      // Estilos alternados
      const isEven = (r - DATA_START_ROW) % 2 === 0;
      cell.fill = { type: 'pattern', pattern: 'solid',
        fgColor: { argb: 'FF' + (isEven ? C.white : C.gray_50) } };
      cell.font = { name: 'Calibri', size: 9, color: { argb: 'FF' + C.text } };
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FF' + C.border } },
        right:  { style: 'thin', color: { argb: 'FF' + C.border } },
      };

      // CV: fórmula automática desde KW
      if (col.key === 'cv') {
        cell.value = { formula: `IF(${kwCol}${r}="","",ROUND(${kwCol}${r}*1.35962,0))` };
        cell.font  = { name: 'Calibri', size: 9, color: { argb: 'FF6366F1' }, italic: true };
        cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } };
        return;
      }

      // Validaciones dropdown
      const dvMap: Record<string, string> = {
        tipo_vehiculo:          TIPO_OPTIONS,
        uso:                    USO_OPTIONS,
        ambito:                 AMBITO_OPTIONS,
        coberturas_solicitadas: COB_OPTIONS,
        lunas:                  LUNAS_OPTIONS,
        asistencia:             ASIST_OPTIONS,
      };
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
  ws.mergeCells(noteRow, 1, noteRow, COLUMNS.length);
  const noteCell = ws.getCell(noteRow, 1);
  noteCell.value = 'Plantilla generada por Orion · La columna CV se calcula automáticamente desde KW · Guarda el archivo y súbelo en Orion para importar los datos';
  noteCell.font  = { name: 'Calibri', size: 8, italic: true, color: { argb: 'FF9CA3AF' } };
  noteCell.alignment = { horizontal: 'center' };

  // ── Generar blob ──────────────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
