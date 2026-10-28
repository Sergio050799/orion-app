import type ExcelJS from 'exceljs';
import type { FlotaCarpeta } from './carpeta';
import {
  FRANQUICIAS_CAT1, FRANQUICIAS_CAT2, FRANQUICIAS_MOTO, PRODUCTOS, grupoCob, productosPermitidos, tipoKeyDesdeEtiqueta,
  type GrupoCob,
} from './catalogoCoberturas';

let _logoMmtCache: string | null = null;
async function fetchLogoMmt(): Promise<string | null> {
  if (_logoMmtCache !== undefined && _logoMmtCache !== null) return _logoMmtCache;
  try {
    const res = await fetch('/LOGOMMT.jpg');
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const CHUNK = 8192;
    let bin = '';
    for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    _logoMmtCache = btoa(bin);
    return _logoMmtCache;
  } catch { return null; }
}

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
  { key: 'cif_nif',               header: 'CIF / NIF',             width: 16 },
  { key: 'tomador',               header: 'TOMADOR',               width: 22 },
  { key: 'cia_actual',            header: 'CIA ACTUAL',            width: 18 },
  { key: 'num_poliza_actual',     header: 'N POLIZA ACTUAL',       width: 20 },
  { key: 'fecha_vencimiento',     header: 'FECHA VENCIMIENTO',     width: 18 },
  { key: 'matricula',             header: 'MATRICULA',             width: 12 },
  { key: 'marca',                 header: 'MARCA',                 width: 14 },
  { key: 'modelo',                header: 'MODELO',                width: 18 },
  { key: 'anyo',                  header: 'AÑO',                   width: 8  },
  { key: 'tipo_vehiculo',         header: 'TIPO VEHICULO',         width: 26 },
  { key: 'uso',                   header: 'USO',                   width: 22 },
  { key: 'adr',                   header: 'ADR',                   width: 8  },
  { key: 'ambito',                header: 'AMBITO',                width: 14 },
  { key: 'coberturas_solicitadas',header: 'COBERTURAS SOLICITADAS',width: 28 },
  { key: 'lunas',                 header: 'LUNAS',                 width: 10 },
  { key: 'animales',              header: 'ANIMALES',              width: 12 },
  { key: 'seguro_conductor',      header: 'SEGURO DEL CONDUCTOR',  width: 22 },
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

export async function generarPlantillaExcel(carpeta?: Pick<FlotaCarpeta, 'nombre' | 'header'>, corredores?: string[]): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default;
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
  const logoBase64 = await fetchLogoMmt();
  if (logoBase64) {
    try {
      const bytes = Uint8Array.from(atob(logoBase64), c => c.charCodeAt(0));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const logoId = wb.addImage({ buffer: bytes.buffer as any, extension: 'jpeg' });
      ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 119, height: 53 } });
    } catch { /* logo not valid */ }
  }

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

  ws.getCell(3, 1).value = 'PERIODICIDAD:'; ws.getCell(3, 1).font = labelFont; ws.getCell(3, 1).alignment = leftAlign;
  ws.getCell(3, 2).value = (carpeta?.header.periodicidad ?? '').toUpperCase(); ws.getCell(3, 2).font = valueFont; ws.getCell(3, 2).alignment = leftAlign;
  ws.getCell(3, 3).value = 'EFECTO:';     ws.getCell(3, 3).font = labelFont; ws.getCell(3, 3).alignment = leftAlign;
  ws.getCell(3, 4).value = carpeta?.header.efecto ?? ''; ws.getCell(3, 4).font = valueFont; ws.getCell(3, 4).alignment = leftAlign;

  // ── Corredor dropdown (fila 3, derecha) ──────────────────────────────────
  const hasCorredores = corredores && corredores.length > 0;
  ws.getCell(3, 11).value = 'CORREDOR:'; ws.getCell(3, 11).font = labelFont; ws.getCell(3, 11).alignment = leftAlign;
  const corrCell = ws.getCell(3, 12);
  corrCell.value = '';
  corrCell.font = { ...valueFont, italic: !hasCorredores, color: { argb: hasCorredores ? 'FF' + C.text : 'FF9CA3AF' } };
  corrCell.alignment = leftAlign;
  corrCell.border = { bottom: { style: 'thin', color: { argb: 'FF' + C.border } } };
  if (hasCorredores) {
    corrCell.dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`_CORREDORES!$A$1:$A$${corredores!.length}`],
      showErrorMessage: false,
      showInputMessage: true,
      promptTitle: 'Corredor',
      prompt: 'Selecciona el corredor de la lista',
    };
  }

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
  // Tipo → Cobertura → Franquicia: tres desplegables encadenados que salen del catálogo único de coberturas
  // (catalogoCoberturas.ts). La tipología limita la cobertura y la cobertura limita la franquicia.
  const TIPOS_PLANTILLA = ['Turismo', 'Furgoneta', 'Cabeza tractora', 'Camion rigido', 'Semirremolque', 'Industrial matriculado', 'Industrial no matriculado', 'Motocicleta'];
  const GRUPOS: GrupoCob[] = ['a1', 'a2', 'ind', 'a3'];
  const NO_APLICA = 'No aplica';
  const wsL = wb.addWorksheet('_LISTAS', { state: 'veryHidden' });
  // A:B → tipo y grupo de coberturas (A1, A2, IND, A3)
  TIPOS_PLANTILLA.forEach((t, i) => {
    wsL.getCell(i + 1, 1).value = t;
    wsL.getCell(i + 1, 2).value = (grupoCob(tipoKeyDesdeEtiqueta(t)) ?? 'a1').toUpperCase();
  });
  const addLista = (col: number, nombre: string, valores: (string | number)[]) => {
    valores.forEach((v, i) => { wsL.getCell(i + 1, col).value = v; });
    const L = colLetter(col);
    wb.definedNames.add(`_LISTAS!$${L}$1:$${L}$${valores.length}`, nombre);
  };
  const tipoRep = (g: GrupoCob) => TIPOS_PLANTILLA.find(t => grupoCob(tipoKeyDesdeEtiqueta(t)) === g)!;
  GRUPOS.forEach((g, i) => {
    const prods = productosPermitidos(tipoKeyDesdeEtiqueta(tipoRep(g)));
    addLista(4 + i, `COB_${g.toUpperCase()}`, prods.map(p => PRODUCTOS.find(x => x.key === p)!.etiquetaHoja));
  });
  addLista(8, 'FRQ_A1', [...FRANQUICIAS_CAT1]);
  addLista(9, 'FRQ_A2', [...FRANQUICIAS_CAT2]);
  addLista(10, 'FRQ_A3', [...FRANQUICIAS_MOTO]);
  addLista(11, 'FRQ_NONE', [NO_APLICA]);
  wb.definedNames.add('_LISTAS!$K$1:$K$1', 'FRQ_IND');
  const COL_TIPO = colLetter(COLUMNS.findIndex(c => c.key === 'tipo_vehiculo') + 1);
  const COL_COB  = colLetter(COLUMNS.findIndex(c => c.key === 'coberturas_solicitadas') + 1);
  const grupoDe = (r: number) => `IFERROR(VLOOKUP($${COL_TIPO}${r},_LISTAS!$A$1:$B$${TIPOS_PLANTILLA.length},2,FALSE),"A1")`;
  const grupoFrq = (r: number) => `IFERROR(VLOOKUP($${COL_TIPO}${r},_LISTAS!$A$1:$B$${TIPOS_PLANTILLA.length},2,FALSE),"A1")`;
  const TIPO_OPTIONS   = `_LISTAS!$A$1:$A$${TIPOS_PLANTILLA.length}`;
  const USO_OPTIONS    = '"Particular,Servicio publico,Transportes propios"';
  const ADR_OPTIONS_DV = '"No,Si"';
  const AMBITO_OPTIONS = '"Nacional,Internacional"';
  const SI_NO_OPTIONS  = '"Si,No"';

  const dvMap: Record<string, string> = {
    uso:                    USO_OPTIONS,
    adr:                    ADR_OPTIONS_DV,
    ambito:                 AMBITO_OPTIONS,
    lunas:                  SI_NO_OPTIONS,
    animales:               SI_NO_OPTIONS,
    seguro_conductor:       SI_NO_OPTIONS,
    asistencia:             SI_NO_OPTIONS,
  };

  for (let r = DATA_START_ROW; r < DATA_START_ROW + 200; r++) {
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

      // Validaciones encadenadas: tipo (lista cerrada) → cobertura (según tipo) → franquicia (según tipo y cobertura)
      const rr = r;
      if (col.key === 'tipo_vehiculo') {
        cell.dataValidation = {
          type: 'list', allowBlank: true, formulae: [TIPO_OPTIONS],
          showErrorMessage: true, errorStyle: 'stop', errorTitle: 'Tipo de vehículo', error: 'Elige un tipo de la lista.',
          showInputMessage: true, promptTitle: col.header, prompt: 'Elige primero el tipo: limita las coberturas y las franquicias.',
        };
      } else if (col.key === 'coberturas_solicitadas') {
        cell.dataValidation = {
          type: 'list', allowBlank: true, formulae: [`INDIRECT("COB_"&${grupoDe(rr)})`],
          showErrorMessage: true, errorStyle: 'stop', errorTitle: 'Cobertura', error: 'Elige una cobertura de la lista (depende del tipo de vehículo).',
          showInputMessage: true, promptTitle: col.header, prompt: 'Las coberturas disponibles dependen del tipo de vehículo.',
        };
      } else if (col.key === 'frq') {
        cell.dataValidation = {
          type: 'list', allowBlank: true,
          formulae: [`INDIRECT("FRQ_"&IF(ISNUMBER(SEARCH("franquicia",$${COL_COB}${rr})),${grupoFrq(rr)},"NONE"))`],
          showErrorMessage: true, errorStyle: 'stop', errorTitle: 'Franquicia', error: 'Elige una franquicia de la lista (depende del tipo y de la cobertura).',
          showInputMessage: true, promptTitle: col.header, prompt: 'Solo las coberturas con franquicia admiten un importe.',
        };
      } else if (dvMap[col.key]) {
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

  // ── Hoja oculta con lista de corredores ──────────────────────────────────
  if (hasCorredores) {
    const wsCorr = wb.addWorksheet('_CORREDORES', { state: 'veryHidden' });
    corredores!.forEach((nombre, i) => { wsCorr.getCell(i + 1, 1).value = nombre; });
  }

  // ── Generar blob ────────────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
