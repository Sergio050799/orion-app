import XLSX from 'xlsx';
import { mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputDir = join(__dirname, 'output');
const outputPath = join(outputDir, 'flota_demo.xlsx');

// --- Helpers ---
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

function genMatricula() {
    const letras = 'BCDFGHJKLMNPRSTVWXYZ';
    const nums = String(randInt(1000, 9999));
    const chars = Array.from({ length: 3 }, () => letras[randInt(0, letras.length - 1)]).join('');
    return `${nums} ${chars}`;
}

function genPoliza(cia) {
    const prefijos = { MAPFRE: 'MP', ALLIANZ: 'AL', AXA: 'AX', ZURICH: 'ZU', GENERALI: 'GE' };
    return `${prefijos[cia] || 'XX'}-2024-${String(randInt(1000, 9999)).padStart(6, '0')}`;
}

function genFechaVencimiento() {
    const mes = randInt(6, 12);
    const dia = randInt(1, 28);
    return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/2026`;
}

// --- Vehiculos base ---
const vehiculos = [
    { marca: 'SEAT', modelo: 'Ibiza', tipo: 'TURISMO', kwMin: 55, kwMax: 85, tnMin: 1.4, tnMax: 1.7 },
    { marca: 'SEAT', modelo: 'Leon', tipo: 'TURISMO', kwMin: 85, kwMax: 150, tnMin: 1.6, tnMax: 2.0 },
    { marca: 'VOLKSWAGEN', modelo: 'Golf', tipo: 'TURISMO', kwMin: 85, kwMax: 150, tnMin: 1.6, tnMax: 2.0 },
    { marca: 'PEUGEOT', modelo: '308', tipo: 'TURISMO', kwMin: 75, kwMax: 130, tnMin: 1.5, tnMax: 1.9 },
    { marca: 'BMW', modelo: 'Serie 3', tipo: 'TURISMO', kwMin: 110, kwMax: 150, tnMin: 1.8, tnMax: 2.2 },
    { marca: 'RENAULT', modelo: 'Clio', tipo: 'TURISMO', kwMin: 55, kwMax: 100, tnMin: 1.3, tnMax: 1.6 },
    { marca: 'SEAT', modelo: 'Arona', tipo: 'TODOTERRENO', kwMin: 70, kwMax: 110, tnMin: 1.5, tnMax: 1.8 },
    { marca: 'PEUGEOT', modelo: '3008', tipo: 'TODOTERRENO', kwMin: 96, kwMax: 133, tnMin: 1.7, tnMax: 2.1 },
    { marca: 'FORD', modelo: 'Transit', tipo: 'FURGONETA', kwMin: 75, kwMax: 120, tnMin: 2.8, tnMax: 3.5 },
    { marca: 'MERCEDES-BENZ', modelo: 'Vito', tipo: 'FURGONETA', kwMin: 85, kwMax: 120, tnMin: 2.8, tnMax: 3.2 },
    { marca: 'RENAULT', modelo: 'Captur', tipo: 'DERIVADO DE TURISMO', kwMin: 74, kwMax: 116, tnMin: 1.4, tnMax: 1.7 },
    { marca: 'IVECO', modelo: 'Daily', tipo: 'CAMION', kwMin: 100, kwMax: 160, tnMin: 3.5, tnMax: 7.5 },
];

const usos = ['PARTICULAR', 'PARTICULAR', 'PARTICULAR', 'PARTICULAR', 'SERVICIO PUBLICO', 'ALQUILER'];
const ambitos = ['NACIONAL', 'NACIONAL', 'NACIONAL', 'PROVINCIAL'];
const coberturas = ['TODO RIESGO', 'TODO RIESGO CON FRANQUICIA', 'TERCEROS AMPLIADO', 'TERCEROS BASICO'];
const franquicias = [150, 300, 600];
const cias = ['MAPFRE', 'ALLIANZ', 'AXA', 'ZURICH', 'GENERALI'];

// --- Generar filas ---
const rows = vehiculos.map((v) => {
    const kw = randInt(v.kwMin, v.kwMax);
    const tn = (randInt(v.tnMin * 10, v.tnMax * 10) / 10).toFixed(1);
    const cobertura = pick(coberturas);
    const cia = pick(cias);
    const esFurgoCamion = ['FURGONETA', 'CAMION'].includes(v.tipo);
    const primaBase = esFurgoCamion ? randInt(600, 1200) : randInt(300, 900);

    return {
        'Matricula': genMatricula(),
        'Marca': v.marca,
        'Modelo': v.modelo,
        'Tipo Vehiculo': v.tipo,
        'Uso': pick(usos),
        'KW': kw,
        'TN': parseFloat(tn),
        'Ambito': pick(ambitos),
        'Coberturas': cobertura,
        'Lunas': pick(['SI', 'NO']),
        'FRQ': cobertura === 'TODO RIESGO CON FRANQUICIA' ? pick(franquicias) : '',
        'Asistencia': pick(['SI', 'NO']),
        'Prima Referencia': primaBase,
        'CIA Actual': cia,
        'Poliza': genPoliza(cia),
        'Fecha Vencimiento': genFechaVencimiento(),
    };
});

// --- Escribir Excel ---
if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

const ws = XLSX.utils.json_to_sheet(rows);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Flota');
XLSX.writeFile(wb, outputPath);

console.log(`Flota demo generada: ${rows.length} vehiculos`);
console.log(`Archivo: ${outputPath}`);
