// ─── RECIBOS — Lógica pura de parseo, cálculo y generación ──────────────────

export interface ReciboRow {
  poliza: string;
  numRecibo: string;
  riesgo: string;            // matrícula del vehículo
  fecha: string;
  tipo: string;               // "Normal", "Anulacion", etc.
  importe: number;
  pNeta: number;
  impuesto: number;
  comision: number;           // calculado
  liquidoAbonar: number;      // calculado
  periodicidad: string;
  fechaInicioPoliza: string;
  fechaVencimiento: string;
  tomador: string;
}

export interface ResumenRecibos {
  totalRegistros: number;
  totalVehiculos: number;      // matrículas únicas en columna riesgo
  totalImporte: number;
  totalPrimaNeta: number;
  totalImpuesto: number;
  totalComision: number;
  totalLiquidoAbonar: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const round2 = (n: number): number => Math.round(n * 100) / 100;

function parseNumES(val: string | undefined | null): number {
  if (!val) return 0;
  let s = String(val).trim();
  // Formato español: "1.234,56" → "1234.56"
  // Primero quitar puntos de miles, luego coma → punto decimal
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// ─── Normalización de cabeceras ──────────────────────────────────────────────

const HEADER_MAP: Record<string, string> = {
  'poliza': 'poliza',
  'póliza': 'poliza',
  'num. recibo': 'numRecibo',
  'num.recibo': 'numRecibo',
  'nº recibo': 'numRecibo',
  'numero recibo': 'numRecibo',
  'recibo': 'numRecibo',
  'riesgo': 'riesgo',
  'fecha': 'fecha',
  'tipo': 'tipo',
  'importe': 'importe',
  'importe total': 'importe',
  'p.neta': 'pNeta',
  'p. neta': 'pNeta',
  'prima neta': 'pNeta',
  'impuesto': 'impuesto',
  'impuestos': 'impuesto',
  'periodicidad': 'periodicidad',
  'fec.inicio poliza': 'fechaInicioPoliza',
  'fec. inicio poliza': 'fechaInicioPoliza',
  'fecha inicio poliza': 'fechaInicioPoliza',
  'fec.vencimiento': 'fechaVencimiento',
  'fec. vencimiento': 'fechaVencimiento',
  'fecha vencimiento': 'fechaVencimiento',
  'tomador': 'tomador',
};

function normalizeHeader(raw: string): string | null {
  const clean = raw.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return HEADER_MAP[clean] ?? null;
}

// ─── 3.1 Parsear Excel original ──────────────────────────────────────────────

export function parsearRecibosOriginal(rows: Record<string, string>[]): ReciboRow[] {
  return rows
    .filter(row => {
      // Filtrar filas vacías (sin póliza ni matrícula)
      const poliza = (row.poliza || row['Poliza'] || row['Póliza'] || '').trim();
      const riesgo = (row.riesgo || row['Riesgo'] || '').trim();
      return poliza.length > 0 || riesgo.length > 0;
    })
    .map(row => {
      // Intentar mapear por nombre normalizado
      const mapped: Record<string, string> = {};
      for (const [key, val] of Object.entries(row)) {
        const norm = normalizeHeader(key);
        if (norm) mapped[norm] = val;
      }
      // Fallback: usar keys originales en minúscula
      const get = (field: string): string => mapped[field] || row[field] || '';

      return {
        poliza: get('poliza').trim(),
        numRecibo: get('numRecibo').trim(),
        riesgo: get('riesgo').trim(),
        fecha: get('fecha').trim(),
        tipo: get('tipo').trim(),
        importe: parseNumES(get('importe')),
        pNeta: parseNumES(get('pNeta')),
        impuesto: parseNumES(get('impuesto')),
        comision: 0,
        liquidoAbonar: 0,
        periodicidad: get('periodicidad').trim(),
        fechaInicioPoliza: get('fechaInicioPoliza').trim(),
        fechaVencimiento: get('fechaVencimiento').trim(),
        tomador: get('tomador').trim(),
      };
    });
}

// ─── 3.2 Calcular comisiones ─────────────────────────────────────────────────

export function calcularComisiones(rows: ReciboRow[], porcentajeComision: number): ReciboRow[] {
  return rows.map(row => {
    const comision = round2(row.pNeta * (porcentajeComision / 100));
    const liquidoAbonar = round2(row.importe - comision);
    return { ...row, comision, liquidoAbonar };
  });
}

// ─── 3.3 Generar resumen ─────────────────────────────────────────────────────

export function generarResumen(rows: ReciboRow[]): ResumenRecibos {
  const vehiculos = new Set(rows.map(r => r.riesgo).filter(Boolean));

  let totalImporte = 0;
  let totalPrimaNeta = 0;
  let totalImpuesto = 0;
  let totalComision = 0;
  let totalLiquidoAbonar = 0;

  for (const r of rows) {
    totalImporte += r.importe;
    totalPrimaNeta += r.pNeta;
    totalImpuesto += r.impuesto;
    totalComision += r.comision;
    totalLiquidoAbonar += r.liquidoAbonar;
  }

  return {
    totalRegistros: rows.length,
    totalVehiculos: vehiculos.size,
    totalImporte: round2(totalImporte),
    totalPrimaNeta: round2(totalPrimaNeta),
    totalImpuesto: round2(totalImpuesto),
    totalComision: round2(totalComision),
    totalLiquidoAbonar: round2(totalLiquidoAbonar),
  };
}

// ─── 3.4 Generar número de recibo ────────────────────────────────────────────

export function generarNumeroRecibo(nombreCorredor: string, fecha: Date): string {
  const letra = (nombreCorredor || 'X').charAt(0).toUpperCase();
  const dd = String(fecha.getDate()).padStart(2, '0');
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  const yyyy = String(fecha.getFullYear());
  return `R${letra}${dd}${mm}${yyyy}`;
}

// ─── 3.5 Generar descripción de periodo ──────────────────────────────────────

const MESES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
];

const TRIMESTRE_NOMBRES = ['PRIMER', 'SEGUNDO', 'TERCER', 'CUARTO'];
const SEMESTRE_NOMBRES = ['PRIMER', 'SEGUNDO'];

function formatFechaES(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function calcPeriodo(periodicidad: string, fecha: Date, fechaEmision?: Date): { nombre: string; desde: Date; hasta: Date } {
  const y = fecha.getFullYear();
  const m = fecha.getMonth(); // 0-based

  const lower = periodicidad.toLowerCase().trim();

  if (lower === 'trimestral') {
    if (fechaEmision) {
      // Periodos desde la fecha de emisión: cada 3 meses desde ese día
      const emD = fechaEmision.getDate();
      const emM = fechaEmision.getMonth();
      const emY = fechaEmision.getFullYear();
      // Meses transcurridos desde la emisión
      const totalMonths = (y - emY) * 12 + (m - emM);
      const q = Math.floor(totalMonths / 3);
      const baseMonth = emM + q * 3;
      const baseYear = emY + Math.floor((emM + q * 3) / 12);
      const adjustedMonth = (emM + q * 3) % 12;
      const desde = new Date(baseYear, adjustedMonth, emD);
      const hasta = new Date(baseYear, adjustedMonth + 3, emD - 1);
      return { nombre: `${TRIMESTRE_NOMBRES[Math.min(q % 4, 3)]} TRIMESTRE ${y}`, desde, hasta };
    }
    const q = Math.floor(m / 3);
    const desde = new Date(y, q * 3, 1);
    const hasta = new Date(y, q * 3 + 3, 0); // last day of quarter
    return { nombre: `${TRIMESTRE_NOMBRES[q]} TRIMESTRE ${y}`, desde, hasta };
  }

  if (lower === 'semestral') {
    if (fechaEmision) {
      const emD = fechaEmision.getDate();
      const emM = fechaEmision.getMonth();
      const emY = fechaEmision.getFullYear();
      const totalMonths = (y - emY) * 12 + (m - emM);
      const s = Math.floor(totalMonths / 6);
      const baseMonth = emM + s * 6;
      const baseYear = emY + Math.floor(baseMonth / 12);
      const adjustedMonth = baseMonth % 12;
      const desde = new Date(baseYear, adjustedMonth, emD);
      const hasta = new Date(baseYear, adjustedMonth + 6, emD - 1);
      return { nombre: `${SEMESTRE_NOMBRES[Math.min(s % 2, 1)]} SEMESTRE ${y}`, desde, hasta };
    }
    const s = m < 6 ? 0 : 1;
    const desde = new Date(y, s * 6, 1);
    const hasta = new Date(y, s * 6 + 6, 0);
    return { nombre: `${SEMESTRE_NOMBRES[s]} SEMESTRE ${y}`, desde, hasta };
  }

  if (lower === 'anual') {
    if (fechaEmision) {
      const emD = fechaEmision.getDate();
      const emM = fechaEmision.getMonth();
      // Determinar el año del periodo actual
      const periodoYear = (m < emM || (m === emM && fecha.getDate() < emD)) ? y - 1 : y;
      const desde = new Date(periodoYear, emM, emD);
      const hasta = new Date(periodoYear + 1, emM, emD - 1);
      return { nombre: `AÑO ${periodoYear}–${periodoYear + 1}`, desde, hasta };
    }
    const desde = new Date(y, 0, 1);
    const hasta = new Date(y, 11, 31);
    return { nombre: `AÑO ${y}`, desde, hasta };
  }

  // mensual (default)
  const desde = new Date(y, m, 1);
  const hasta = new Date(y, m + 1, 0);
  return { nombre: `MES DE ${MESES[m]} ${y}`, desde, hasta };
}

export function generarDescripcionPeriodo(
  tipo: 'EMISION' | 'REGULARIZACION',
  periodicidad: string,
  fecha: Date,
  fechaEmision?: Date
): string {
  const { nombre, desde, hasta } = calcPeriodo(periodicidad, fecha, fechaEmision);
  const desdeStr = formatFechaES(desde);
  const hastaStr = formatFechaES(hasta);

  if (tipo === 'REGULARIZACION') {
    return `REGULARIZACIÓN ${nombre}: Recibos del ${desdeStr} al ${hastaStr}`;
  }
  return `${nombre}: ${desdeStr} al ${hastaStr}`;
}

// ─── 3.6 Agrupar recibos por tomador ──────────────────────────────────────────

export interface GrupoTomador {
  tomador: string;
  cifTomador: string;
  rows: ReciboRow[];
  resumen: ResumenRecibos;
  porcentajeComision: number;
}

export function agruparPorTomador(
  rows: ReciboRow[],
  porcentajeComision: number
): GrupoTomador[] {
  const mapa = new Map<string, ReciboRow[]>();

  for (const row of rows) {
    const key = (row.tomador || 'SIN TOMADOR').trim().toUpperCase();
    if (!mapa.has(key)) mapa.set(key, []);
    mapa.get(key)!.push(row);
  }

  return Array.from(mapa.entries()).map(([tomador, filas]) => ({
    tomador,
    cifTomador: '',
    rows: filas,
    resumen: generarResumen(filas),
    porcentajeComision,
  }));
}

// ─── Formato moneda español ──────────────────────────────────────────────────

export function formatMonedaES(n: number): string {
  // 122716.22 → "122.716,22 €"
  const abs = Math.abs(n);
  const [intPart, decPart = '00'] = abs.toFixed(2).split('.');
  // Insertar puntos de miles
  const withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const sign = n < 0 ? '-' : '';
  return `${sign}${withDots},${decPart} €`;
}
