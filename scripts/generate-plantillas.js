// Script: genera las 4 plantillas Excel de Orion en el Escritorio
// Uso: node scripts/generate-plantillas.js

const ExcelJS = require('../node_modules/exceljs');
const path    = require('path');
const fs      = require('fs');

const DESKTOP = path.join(process.env.USERPROFILE || process.env.HOME, 'Desktop');
const OUT_DIR = path.join(DESKTOP, 'PLANTILLA ORION');
fs.mkdirSync(OUT_DIR, { recursive: true });

// ─── Colores corporativos ────────────────────────────────────────────────────
const AZUL   = 'FF1240CC';
const VERDE  = 'FF00B050';
const WHITE  = 'FFFFFFFF';
const GRAY50 = 'FFF0F4FA';
const GRAY100= 'FFE4EAF4';
const TEXT   = 'FF0A1628';
const BORDER = 'FFB8C8E8';

function hdrCell(cell, text) {
  cell.value = text;
  cell.font  = { bold: true, color: { argb: WHITE }, name: 'Calibri', size: 10 };
  cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  cell.border = {
    right:  { style: 'thin', color: { argb: WHITE } },
    bottom: { style: 'medium', color: { argb: AZUL } },
  };
}

// ─── 1. PLANTILLA FLOTAS ─────────────────────────────────────────────────────
async function plantillaFlotas() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MMT Seguros';

  const COLUMNS = [
    { key: 'cia_actual',             header: 'CIA ACTUAL',             width: 18 },
    { key: 'num_poliza_actual',      header: 'N POLIZA ACTUAL',        width: 20 },
    { key: 'fecha_vencimiento',      header: 'FECHA VENCIMIENTO',      width: 18 },
    { key: 'matricula',              header: 'MATRICULA',              width: 12 },
    { key: 'marca',                  header: 'MARCA',                  width: 14 },
    { key: 'modelo',                 header: 'MODELO',                 width: 18 },
    { key: 'anyo',                   header: 'AÑO',                    width: 8  },
    { key: 'tipo_vehiculo',          header: 'TIPO VEHICULO',          width: 26 },
    { key: 'uso',                    header: 'USO',                    width: 22 },
    { key: 'ambito',                 header: 'AMBITO',                 width: 14 },
    { key: 'coberturas_solicitadas', header: 'COBERTURAS SOLICITADAS', width: 28 },
    { key: 'lunas',                  header: 'LUNAS',                  width: 10 },
    { key: 'frq',                    header: 'FRQ',                    width: 8  },
    { key: 'asistencia',             header: 'ASISTENCIA',             width: 16 },
    { key: 'prima_referencia',       header: 'PRIMA REFERENCIA',       width: 16 },
  ];
  const DATA_START = 6;

  const ws = wb.addWorksheet('Estudio de Flotas', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: DATA_START - 1 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });
  ws.columns = COLUMNS.map(c => ({ key: c.key, width: c.width }));

  const azulFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  const grayFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAY100 } };
  const labelFont = { name: 'Calibri', size: 9, bold: true, color: { argb: AZUL } };
  const valueFont = { name: 'Calibri', size: 9, color: { argb: TEXT } };
  const leftAlign = { horizontal: 'left', vertical: 'middle' };

  // Fila 1: título azul
  for (let c = 1; c <= COLUMNS.length; c++) ws.getCell(1, c).fill = azulFill;
  const t = ws.getCell('C1');
  t.value = 'ESTUDIO DE FLOTAS — MMT SEGUROS';
  t.font  = { name: 'Calibri', size: 16, bold: true, color: { argb: WHITE } };
  t.alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getRow(1).height = 42;

  // Fila 2: info empresa
  ws.getRow(2).height = 22;
  for (let c = 1; c <= COLUMNS.length; c++) ws.getCell(2, c).fill = grayFill;
  ws.getCell(2, 1).value = 'CIF:';       ws.getCell(2, 1).font = labelFont; ws.getCell(2, 1).alignment = leftAlign;
  ws.getCell(2, 2).value = '';           ws.getCell(2, 2).font = valueFont; ws.getCell(2, 2).alignment = leftAlign;
  ws.getCell(2, 3).value = 'TOMADOR:';  ws.getCell(2, 3).font = labelFont; ws.getCell(2, 3).alignment = leftAlign;
  ws.getCell(2, 4).value = '';          ws.getCell(2, 4).font = valueFont; ws.getCell(2, 4).alignment = leftAlign;
  ws.getCell(2, 6).value = 'ACTIVIDAD:';ws.getCell(2, 6).font = labelFont; ws.getCell(2, 6).alignment = leftAlign;
  ws.getCell(2, 7).value = '';          ws.getCell(2, 7).font = valueFont; ws.getCell(2, 7).alignment = leftAlign;
  ws.getCell(2, 9).value = 'CORREDOR:'; ws.getCell(2, 9).font = labelFont; ws.getCell(2, 9).alignment = leftAlign;
  ws.getCell(2,10).value = '';          ws.getCell(2,10).font = { ...valueFont, bold: true }; ws.getCell(2,10).alignment = leftAlign;

  // Fila 3: más info
  ws.getRow(3).height = 22;
  for (let c = 1; c <= COLUMNS.length; c++) ws.getCell(3, c).fill = grayFill;
  ws.getCell(3, 1).value = 'FORMA DE PAGO:'; ws.getCell(3, 1).font = labelFont; ws.getCell(3, 1).alignment = leftAlign;
  ws.getCell(3, 2).value = '';               ws.getCell(3, 2).font = valueFont; ws.getCell(3, 2).alignment = leftAlign;
  ws.getCell(3, 3).value = 'EFECTO:';        ws.getCell(3, 3).font = labelFont; ws.getCell(3, 3).alignment = leftAlign;
  ws.getCell(3, 4).value = '';               ws.getCell(3, 4).font = valueFont; ws.getCell(3, 4).alignment = leftAlign;

  // Fila 4: separador azul
  for (let c = 1; c <= COLUMNS.length; c++) ws.getCell(4, c).fill = azulFill;
  ws.getRow(4).height = 3;

  // Fila 5: cabeceras verdes
  const headerRow = ws.getRow(5);
  headerRow.height = 28;
  COLUMNS.forEach((col, i) => hdrCell(headerRow.getCell(i + 1), col.header));

  // Filas de datos (100 filas) con dropdowns
  const dvMap = {
    tipo_vehiculo:          '"Turismo,Furgoneta,Cabeza tractora,Camion rigido,Semirremolque,Industrial matriculado,Industrial no matriculado"',
    uso:                    '"Particular,Servicio publico,Transportes propios"',
    ambito:                 '"Nacional,Internacional"',
    coberturas_solicitadas: '"Terceros,Terceros Ampliado,Todo Riesgo con Franquicia"',
    lunas:                  '"Si,No"',
    asistencia:             '"Si,No"',
  };

  for (let r = DATA_START; r < DATA_START + 100; r++) {
    const row = ws.getRow(r);
    row.height = 18;
    const isEven = (r - DATA_START) % 2 === 0;
    COLUMNS.forEach((col, i) => {
      const cell = row.getCell(i + 1);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? 'FFFFFFFF' : GRAY50 } };
      cell.font = { name: 'Calibri', size: 9, color: { argb: TEXT } };
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
      cell.border = {
        bottom: { style: 'thin', color: { argb: BORDER } },
        right:  { style: 'thin', color: { argb: BORDER } },
      };
      if (dvMap[col.key]) {
        cell.dataValidation = {
          type: 'list', allowBlank: true,
          formulae: [dvMap[col.key]],
          showErrorMessage: false,
          showInputMessage: true,
          promptTitle: col.header,
          prompt: 'Selecciona un valor',
        };
      }
    });
  }

  // Nota al pie
  const noteCell = ws.getCell(DATA_START + 101, 1);
  noteCell.value = 'MMT Seguros | Rellena CIF, Tomador, Actividad y Corredor en las celdas de cabecera';
  noteCell.font  = { name: 'Calibri', size: 8, italic: true, color: { argb: 'FF9CA3AF' } };

  await wb.xlsx.writeFile(path.join(OUT_DIR, 'Plantilla_Flotas.xlsx'));
  console.log('[OK] Plantilla_Flotas.xlsx');
}

// ─── 2. PLANTILLA CORREDORES ─────────────────────────────────────────────────
async function plantillaCorredores() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Corredores');

  const cols = [
    { header: 'NOMBRE',        width: 30 },
    { header: 'CODIGO',        width: 14 },
    { header: 'CIF',           width: 14 },
    { header: 'DOMICILIO',     width: 36 },
    { header: 'COMISION',      width: 12 },
    { header: 'PERIODICIDAD',  width: 14 },
    { header: 'FORMA PAGO',    width: 16 },
    { header: 'CONTACTO',      width: 22 },
    { header: 'EMAIL',         width: 28 },
    { header: 'TELEFONO',      width: 16 },
    { header: 'SUCURSAL',      width: 14 },
    { header: 'COMERCIAL',     width: 18 },
    { header: 'OBSERVACIONES', width: 36 },
  ];
  ws.columns = cols.map(c => ({ header: c.header, key: c.header, width: c.width }));

  const hr = ws.getRow(1);
  hr.height = 22;
  hr.eachCell(cell => {
    cell.font  = { bold: true, color: { argb: WHITE }, name: 'Calibri', size: 10 };
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  // Fila de ejemplo (gris claro, itálica)
  const ex = ws.addRow({
    nombre: 'Corredor Ejemplo S.L.', codigo: 'COR-001', cif: 'B12345678',
    domicilio: 'Calle Mayor 1, Madrid', comision: 15, periodicidad: 'mensual',
    'forma pago': 'Transferencia', contacto: 'Juan García',
    email: 'juan@corredor.com', telefono: '600123456',
    sucursal: 'TITAN', comercial: 'Roberto', observaciones: '',
  });
  ex.eachCell(cell => {
    cell.font = { color: { argb: 'FFAAAAAA' }, name: 'Calibri', size: 10, italic: true };
    cell.alignment = { horizontal: 'left', vertical: 'middle' };
  });

  await wb.xlsx.writeFile(path.join(OUT_DIR, 'plantilla_corredores.xlsx'));
  console.log('[OK] plantilla_corredores.xlsx');
}

// ─── 3. PLANTILLA IMPORTAR FLOTAS CONTRATADAS ────────────────────────────────
async function plantillaFlotasContratadas() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Flotas');

  const headers = [
    'NOMBRE', 'CIF', 'TOMADOR', 'ACTIVIDAD',
    'CORREDOR', 'COMISION', 'FORMA PAGO', 'PERIODICIDAD',
    'FECHA INICIO', 'FECHA VENCIMIENTO',
    'OBSERVACIONES', 'ESTADO',
  ];
  ws.columns = headers.map(() => ({ width: 24 }));

  const hr = ws.addRow(headers);
  hr.height = 22;
  hr.eachCell(cell => {
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
    cell.font  = { bold: true, color: { argb: WHITE }, name: 'Calibri', size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  const ex = ws.addRow([
    'TRANSPORTES GARCIA SL', 'B12345678', 'Transportes Garcia SL', 'Transporte de mercancías',
    'MEDIACION MADRID', '10', 'Domiciliación', 'anual',
    '01/01/2026', '31/12/2026',
    'Renovación acordada', 'CONTRATADA',
  ]);
  ex.eachCell(cell => {
    cell.font = { color: { argb: 'FFAAAAAA' }, name: 'Calibri', size: 10, italic: true };
    cell.alignment = { horizontal: 'left', vertical: 'middle' };
  });

  // Dropdown para estado
  for (let r = 2; r <= 200; r++) {
    ws.getCell(r, 14).dataValidation = {
      type: 'list', allowBlank: true,
      formulae: ['"CONTRATADA,EN ESTUDIO,RECHAZADA"'],
      showErrorMessage: false,
    };
  }

  await wb.xlsx.writeFile(path.join(OUT_DIR, 'Plantilla_Importar_Flotas.xlsx'));
  console.log('[OK] Plantilla_Importar_Flotas.xlsx');
}

// ─── 4. PLANTILLA OFERTA ─────────────────────────────────────────────────────
async function plantillaOferta() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Oferta');

  const AZUL_HDR = { argb: AZUL };
  const WHITE_F  = { argb: WHITE };

  ws.columns = [
    { width: 28 }, { width: 16 }, { width: 13 }, { width: 16 }, { width: 22 },
    { width: 35 }, { width: 16 }, { width: 14 }, { width: 26 },
  ];

  // Fila 1: título
  const t1 = ws.addRow(['OFERTA PARA LA FLOTA — [NOMBRE FLOTA]', '', '', '', '', '', '', '', '']);
  ws.mergeCells('A1:I1');
  t1.height = 36;
  t1.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: AZUL_HDR };
  t1.getCell(1).font = { bold: true, size: 16, color: WHITE_F, name: 'Calibri' };
  t1.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  for (let c = 2; c <= 9; c++) {
    t1.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: AZUL_HDR };
  }

  // Fila 2: empresa
  const t2 = ws.addRow(['[NOMBRE EMPRESA]  —  [CIF]', '', '', '', '', '', '', '', '']);
  ws.mergeCells('A2:I2');
  t2.height = 22;
  t2.getCell(1).font = { bold: true, size: 12, name: 'Calibri' };
  t2.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

  // Fila 3: cabeceras
  const headers = ['TOMADOR', 'TIPOLOGÍA', 'MATRÍCULA', 'MARCA', 'MODELO',
                   'COBERTURAS', 'FORMA PAGO', 'VENCIMIENTO', 'PRIMA OFERTADA MMT'];
  const hr = ws.addRow(headers);
  hr.height = 28;
  hr.eachCell(cell => {
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: AZUL_HDR };
    cell.font  = { bold: true, size: 10, color: WHITE_F, name: 'Calibri' };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin' }, bottom: { style: 'medium' },
      left: { style: 'thin' }, right: { style: 'thin' },
    };
  });

  // 3 filas de ejemplo
  const examples = [
    ['EMPRESA SL', 'Turismo', '1234-ABC', 'VOLKSWAGEN', 'GOLF', 'Todo Riesgo con Franquicia', 'Domiciliación', '31/12/2026', '350,00 €'],
    ['EMPRESA SL', 'Furgoneta', '5678-DEF', 'MERCEDES', 'VITO', 'Terceros Ampliado', 'Domiciliación', '31/12/2026', '420,00 €'],
    ['EMPRESA SL', 'Cabeza tractora', '0001-GHI', 'DAF', 'XF106', 'Terceros Ampliado', 'Domiciliación', '31/12/2026', '1.200,00 €'],
  ];
  examples.forEach((ex, i) => {
    const row = ws.addRow(ex);
    row.height = 18;
    row.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFFFFFFF' : 'FFF9FAFB' } };
      cell.font = { size: 10, name: 'Calibri' };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: { style: 'thin' }, right: { style: 'thin' },
      };
    });
    row.getCell(9).font = { size: 10, bold: true, name: 'Calibri', color: AZUL_HDR };
    row.getCell(9).alignment = { horizontal: 'right', vertical: 'middle' };
  });

  // Fila totales
  const tot = ws.addRow(['TOTALES', '', '', '', '', '', '', '', '2.XXX,00 €']);
  tot.height = 22;
  tot.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF3FF' } };
    cell.font = { bold: true, size: 11, name: 'Calibri' };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'medium' }, bottom: { style: 'medium' },
      left: { style: 'medium' }, right: { style: 'medium' },
    };
  });
  tot.getCell(9).font = { bold: true, size: 12, name: 'Calibri', color: AZUL_HDR };
  tot.getCell(9).alignment = { horizontal: 'right', vertical: 'middle' };

  await wb.xlsx.writeFile(path.join(OUT_DIR, 'OFERTA_PLANTILLA.xlsx'));
  console.log('[OK] OFERTA_PLANTILLA.xlsx');
}

// ─── Ejecutar ─────────────────────────────────────────────────────────────────
(async () => {
  console.log('Generando plantillas en:', OUT_DIR);
  try {
    await plantillaFlotas();
    await plantillaCorredores();
    await plantillaFlotasContratadas();
    await plantillaOferta();
    console.log('\nListo. Carpeta: ' + OUT_DIR);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();
