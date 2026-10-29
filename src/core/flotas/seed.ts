// ─── SEED DATA — Datos ficticios para demostración ───────────────────────────
// Se ejecuta una sola vez si localStorage está vacío.

import type { Corredor, Periodicidad } from './corredor';
import type { FlotaCarpeta, EstadoFlota } from './carpeta';

const CORREDORES_KEY = 'flotas_corredores_v1';
const CARPETAS_KEY = 'flotas_carpetas_v1';

// ─── Vehicle generators ─────────────────────────────────────────────────────

const MARCAS_MODELOS: [string, string, number, string][] = [
  ['MERCEDES-BENZ', 'SPRINTER 314 CDI', 105, 'Furgoneta'],
  ['MERCEDES-BENZ', 'ATEGO 1224 L', 175, 'Camión rígido'],
  ['IVECO', 'DAILY 35S14', 100, 'Furgoneta'],
  ['IVECO', 'EUROCARGO 120E25', 185, 'Camión rígido'],
  ['RENAULT', 'MASTER L3H2 145', 107, 'Furgoneta'],
  ['RENAULT', 'T480 HIGH', 353, 'Cabeza tractora'],
  ['FORD', 'TRANSIT CUSTOM 320', 96, 'Furgoneta'],
  ['FORD', 'F-MAX 500', 368, 'Cabeza tractora'],
  ['VOLKSWAGEN', 'CRAFTER 35 2.0 TDI', 130, 'Furgoneta'],
  ['MAN', 'TGE 5.180', 130, 'Furgoneta'],
  ['MAN', 'TGX 18.510', 375, 'Cabeza tractora'],
  ['VOLVO', 'FH 460', 338, 'Cabeza tractora'],
  ['VOLVO', 'FL 250', 184, 'Camión rígido'],
  ['SCANIA', 'R450', 331, 'Cabeza tractora'],
  ['DAF', 'XF 480', 355, 'Cabeza tractora'],
  ['PEUGEOT', 'BOXER 335 BHDI 165', 121, 'Furgoneta'],
  ['CITROËN', 'JUMPER 35 BHDI', 121, 'Furgoneta'],
  ['FIAT', 'DUCATO 35 LH', 121, 'Furgoneta'],
  ['NISSAN', 'NV400 L3H2', 120, 'Furgoneta'],
  ['TOYOTA', 'PROACE VERSO', 110, 'Furgoneta'],
];

const COBERTURAS = ['Todo Riesgo', 'Terceros Ampliado', 'Todo Riesgo + Lunas', 'Terceros Básico'];
const USOS = ['Carga propia', 'Carga ajena', 'Servicio público', 'Particular'];

function randomPlate(): string {
  const nums = String(Math.floor(1000 + Math.random() * 9000));
  const letters = 'BCDFGHJKLMNPRSTVWXYZ';
  const l1 = letters[Math.floor(Math.random() * letters.length)];
  const l2 = letters[Math.floor(Math.random() * letters.length)];
  const l3 = letters[Math.floor(Math.random() * letters.length)];
  return `${nums} ${l1}${l2}${l3}`;
}

function randomDate(yearStart: number, yearEnd: number): string {
  const y = yearStart + Math.floor(Math.random() * (yearEnd - yearStart));
  const m = String(Math.floor(1 + Math.random() * 12)).padStart(2, '0');
  const d = String(Math.floor(1 + Math.random() * 28)).padStart(2, '0');
  return `${d}/${m}/${y}`;
}

function generateVehicles(count: number): Record<string, string>[] {
  const vehicles: Record<string, string>[] = [];
  for (let i = 0; i < count; i++) {
    const [marca, modelo, kw, tipo] = MARCAS_MODELOS[Math.floor(Math.random() * MARCAS_MODELOS.length)];
    const cobertura = COBERTURAS[Math.floor(Math.random() * COBERTURAS.length)];
    const uso = USOS[Math.floor(Math.random() * USOS.length)];
    const prima = (600 + Math.random() * 2800).toFixed(2);
    vehicles.push({
      matricula: randomPlate(),
      marca,
      modelo,
      tipo_vehiculo: tipo,
      kw: String(kw),
      plazas: tipo === 'Furgoneta' ? '3' : '2',
      combustible: 'Diesel',
      fecha_matriculacion: randomDate(2018, 2025),
      uso,
      tomador: '',
      cif: '',
      cobertura,
      prima_neta: prima,
    });
  }
  return vehicles;
}

// ─── Corredores ─────────────────────────────────────────────────────────────

const SEED_CORREDORES: Omit<Corredor, 'id' | 'codigo' | 'creadoEn' | 'actualizadoEn'>[] = [
  {
    nombre: 'Mediterránea Brokers S.L.',
    cif: 'B-87234112',
    domicilio: 'Av. Diagonal 477, 08036 Barcelona',
    porcentajeComision: 12.5,
    periodicidad: 'mensual',
    formaPago: 'Transferencia',
    contacto: 'Helena Vidal',
    email: 'contacto@medbrokers.es',
    telefono: '+34 932 044 118',
    observaciones: 'Cliente prioritario · Renovación abril',
  },
  {
    nombre: 'Iberseguros Corredores',
    cif: 'B-44119283',
    domicilio: 'C/ Velázquez 28, 28001 Madrid',
    porcentajeComision: 10.0,
    periodicidad: 'trimestral',
    formaPago: 'Domiciliación',
    contacto: 'Ricardo Pinto',
    email: 'flotas@iberseguros.com',
    telefono: '+34 915 880 412',
    observaciones: 'Especializada en cabezas tractoras',
  },
  {
    nombre: 'Atlántico Risk Advisors',
    cif: 'A-22045591',
    domicilio: 'Ronda do Outeiro 12, 15008 A Coruña',
    porcentajeComision: 14.2,
    periodicidad: 'anual',
    formaPago: 'Transferencia',
    contacto: 'Marta Vázquez',
    email: 'flotas@atlanticorisk.es',
    telefono: '+34 981 220 044',
    observaciones: '',
  },
  {
    nombre: 'Sur & Asociados',
    cif: 'B-09112233',
    domicilio: 'Av. de la Constitución 31, 41004 Sevilla',
    porcentajeComision: 11.0,
    periodicidad: 'semestral',
    formaPago: 'Transferencia',
    contacto: 'Joaquín Romero',
    email: 'info@sur-asociados.es',
    telefono: '+34 954 300 712',
    observaciones: 'Cubre Andalucía + Extremadura',
  },
  {
    nombre: 'Levante Premium',
    cif: 'B-46220180',
    domicilio: 'C/ Colón 22, 46004 Valencia',
    porcentajeComision: 12.0,
    periodicidad: 'trimestral',
    formaPago: 'Transferencia',
    contacto: 'Pablo Ruiz',
    email: 'info@levantepremium.es',
    telefono: '+34 963 220 471',
    observaciones: 'Renovación cliente Premium 2026',
  },
];

// ─── Flotas (2 per corredor) ────────────────────────────────────────────────

interface FlotaSeed {
  nombre: string;
  estado: EstadoFlota;
  corredorIdx: number;
  vehicleCount: number;
  tomador: string;
  cif: string;
  actividad: string;
  vencimiento: string;
  comision: number; // % comisión específico de esta flota
}

const SEED_FLOTAS: FlotaSeed[] = [
  { nombre: 'Logística Atlas S.A.', estado: 'CONTRATADA', corredorIdx: 0, vehicleCount: 24, tomador: 'Logística Atlas SA', cif: 'A-87234112', actividad: 'Transporte mercancías por carretera', vencimiento: '2026-08-15', comision: 12.5 },
  { nombre: 'TransIberia Express', estado: 'EN ESTUDIO', corredorIdx: 0, vehicleCount: 18, tomador: 'TransIberia Express SL', cif: 'B-91234567', actividad: 'Mensajería y paquetería', vencimiento: '2026-07-02', comision: 10.0 },
  { nombre: 'Grupo Oriente Logistics', estado: 'EN ESTUDIO', corredorIdx: 1, vehicleCount: 30, tomador: 'Grupo Oriente SA', cif: 'A-44556677', actividad: 'Transporte internacional', vencimiento: '2026-09-20', comision: 10.0 },
  { nombre: 'Castilla Logistics', estado: 'CONTRATADA', corredorIdx: 1, vehicleCount: 15, tomador: 'Castilla Logistics SL', cif: 'B-33445566', actividad: 'Distribución alimentaria', vencimiento: '2026-11-10', comision: 8.5 },
  { nombre: 'Galaicas Pesca S.L.', estado: 'CONTRATADA', corredorIdx: 2, vehicleCount: 12, tomador: 'Galaicas Pesca SL', cif: 'B-22033044', actividad: 'Transporte refrigerado', vencimiento: '2026-06-28', comision: 14.2 },
  { nombre: 'Cabo Norte Trans', estado: 'EN ESTUDIO', corredorIdx: 2, vehicleCount: 10, tomador: 'Cabo Norte Trans SL', cif: 'B-15022033', actividad: 'Transporte mercancías', vencimiento: '2027-01-15', comision: 11.0 },
  { nombre: 'Andaluza Frigo', estado: 'CONTRATADA', corredorIdx: 3, vehicleCount: 22, tomador: 'Andaluza Frigo SA', cif: 'A-41556677', actividad: 'Transporte frigorífico', vencimiento: '2026-10-01', comision: 11.0 },
  { nombre: 'Bético Logistics', estado: 'RECHAZADA', corredorIdx: 3, vehicleCount: 14, tomador: 'Bético Logistics SL', cif: 'B-41998877', actividad: 'Mudanzas y logística', vencimiento: '2026-05-30', comision: 9.0 },
  { nombre: 'Flota Mediterránea', estado: 'EN ESTUDIO', corredorIdx: 4, vehicleCount: 28, tomador: 'Flota Mediterránea SA', cif: 'A-46112233', actividad: 'Transporte contenedores', vencimiento: '2026-12-01', comision: 12.0 },
  { nombre: 'Naranja Express', estado: 'CONTRATADA', corredorIdx: 4, vehicleCount: 16, tomador: 'Naranja Express SL', cif: 'B-46445566', actividad: 'Distribución fruta', vencimiento: '2027-02-15', comision: 15.0 },
];

// ─── Seed function ──────────────────────────────────────────────────────────

export function seedIfEmpty(): void {
  if (typeof window === 'undefined') return;

  // Seed whenever both stores are empty (no flag check — always re-seeds if data is missing)
  const existingCorredores = JSON.parse(localStorage.getItem(CORREDORES_KEY) ?? '[]');
  const existingCarpetas = JSON.parse(localStorage.getItem(CARPETAS_KEY) ?? '[]');
  if (existingCorredores.length > 0 || existingCarpetas.length > 0) return;

  const now = new Date().toISOString();

  // Create corredores
  const corredores: Corredor[] = SEED_CORREDORES.map((data, i) => ({
    ...data,
    id: `corredor_seed_${i + 1}`,
    codigo: `COR-${String(i + 1).padStart(3, '0')}`,
    creadoEn: new Date(Date.now() - (30 - i * 5) * 86400000).toISOString(),
    actualizadoEn: new Date(Date.now() - i * 86400000).toISOString(),
  }));

  // Create carpetas with vehicles
  const carpetas: FlotaCarpeta[] = SEED_FLOTAS.map((data, i) => {
    const vehicles = generateVehicles(data.vehicleCount);
    // Fill tomador/cif in vehicles
    vehicles.forEach(v => { v.tomador = data.tomador; v.cif = data.cif; });

    const createdAt = new Date(Date.now() - (60 - i * 5) * 86400000).toISOString();
    const updatedAt = new Date(Date.now() - (i * 2) * 86400000).toISOString();

    return {
      id: `carpeta_seed_${i + 1}`,
      nombre: data.nombre,
      creadaEn: createdAt,
      actualizadaEn: updatedAt,
      corredor_id: corredores[data.corredorIdx].id,
      porcentajeComision: data.comision,
      estado: data.estado,
      historico: [{ fecha: createdAt, accion: 'Creación', estadoNuevo: 'EN ESTUDIO' as EstadoFlota }],
      header: {
        cif: data.cif,
        tomador: data.tomador,
        actividad: data.actividad,
        formaPago: data.corredorIdx % 2 === 0 ? 'Transferencia' : 'Domiciliación',
        efecto: new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0],
        fechaVencimiento: data.vencimiento,
        periodicidad: corredores[data.corredorIdx].periodicidad,
      },
      original: vehicles,
      trabajo: vehicles.map(v => ({ ...v })), // copy
      sincoResultados: [],
      oferta: [],
    };
  });

  localStorage.setItem(CORREDORES_KEY, JSON.stringify(corredores));
  localStorage.setItem(CARPETAS_KEY, JSON.stringify(carpetas));
}
