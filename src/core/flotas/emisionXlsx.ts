// Generador del Excel de emisión masiva (solo servidor).
//
// Rellena la plantilla oficial de MMT sin recrearla: se edita el XML de la hoja DATOS dentro del .xlsx, así las
// hojas ocultas (HIDDEN_*), las 51 validaciones de lista y los estilos salen exactamente como vienen de origen.
// Las filas de datos de la plantilla están vacías desde la 2 hasta la 100001; solo se rellenan las necesarias.

import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { COLUMNAS_EMISION, MAX_FILAS_EMISION, letraColumna, type ColumnaEmision, type ValoresFila } from './emision';

export const PLANTILLA_EMISION = path.join('public', 'templates', 'PLANTILLA_EMISION_POLIZA.xlsx');

/** Columnas que se escriben como número (el resto, como texto). */
const NUMERICAS = new Set<ColumnaEmision>(['ID_VEH_MMT', 'ANHO_FABRICACION', 'ANHO_MATRICULACION', 'NUM_PLAZAS', 'ID_TOM', 'ID_INTERVINIENTE']);
const DINERO: ColumnaEmision = 'PRECIO_OBJETIVO';     // 0.00, sin símbolo de moneda (el fichero se vuelve a importar)
const FECHA: ColumnaEmision = 'FECHA_EFECTO';

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

function serialExcel(dmy: string): number | null {
    const m = dmy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    return Math.round((Date.UTC(+m[3], +m[2] - 1, +m[1]) - Date.UTC(1899, 11, 30)) / 86400000);
}

function celda(ref: string, col: ColumnaEmision, valor: string, estiloDinero: number, estiloFecha: number): string {
    const v = valor.trim();
    if (col === DINERO && /^\d+(\.\d+)?$/.test(v)) return `<c r="${ref}" s="${estiloDinero}"><v>${v}</v></c>`;
    if (col === FECHA) { const n = serialExcel(v); if (n !== null) return `<c r="${ref}" s="${estiloFecha}"><v>${n}</v></c>`; }
    if (NUMERICAS.has(col) && /^\d{1,15}$/.test(v)) return `<c r="${ref}"><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
}

export async function generarExcelEmision(filas: ValoresFila[], baseDir = process.cwd()): Promise<Buffer> {
    if (filas.length === 0) throw new Error('No hay filas que escribir.');
    if (filas.length > MAX_FILAS_EMISION) throw new Error(`La plantilla admite como máximo ${MAX_FILAS_EMISION} filas.`);

    const zip = await JSZip.loadAsync(fs.readFileSync(path.join(baseDir, PLANTILLA_EMISION)));

    // Estilos nuevos: 0.00 (numFmt 2) y fecha (numFmt 14), añadidos al final de cellXfs
    const stFile = zip.file('xl/styles.xml');
    const hoja = zip.file('xl/worksheets/sheet1.xml');
    if (!stFile || !hoja) throw new Error('La plantilla de emisión no tiene la estructura esperada.');
    let styles = await stFile.async('string');
    const mx = styles.match(/<cellXfs count="(\d+)">/);
    if (!mx) throw new Error('La plantilla de emisión no tiene estilos de celda.');
    const base = parseInt(mx[1], 10);
    const xf = (id: number) => `<xf numFmtId="${id}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="true" applyFont="false" applyBorder="false" applyAlignment="false" applyProtection="false"/>`;
    // Fecha dd/mm/aaaa explícita (el formato 14 de Excel cambia según el idioma del equipo)
    const nf = styles.match(/<numFmts count="(\d+)">/);
    if (nf) styles = styles.replace(nf[0], `<numFmts count="${parseInt(nf[1], 10) + 1}">`).replace('</numFmts>', '<numFmt numFmtId="165" formatCode="dd/mm/yyyy"/></numFmts>');
    styles = styles.replace(mx[0], `<cellXfs count="${base + 2}">`).replace('</cellXfs>', `${xf(2)}${xf(nf ? 165 : 14)}</cellXfs>`);
    zip.file('xl/styles.xml', styles);

    let xml = await hoja.async('string');
    let desde = 0;
    const partes: string[] = [];
    for (let i = 0; i < filas.length; i++) {
        const r = i + 2;
        const ini = xml.indexOf(`<row r="${r}" `, desde);
        if (ini < 0) throw new Error(`La plantilla no tiene la fila ${r}.`);
        const finApertura = xml.indexOf('>', ini) + 1;
        const cierre = xml.indexOf('</row>', finApertura);
        const celdas = COLUMNAS_EMISION
            .map((col, c) => ({ col, c, v: filas[i][col] }))
            .filter(x => x.v !== undefined && String(x.v).trim() !== '')
            .map(x => celda(`${letraColumna(x.c)}${r}`, x.col, String(x.v), base, base + 1))
            .join('');
        partes.push(xml.slice(desde, finApertura), celdas);
        desde = cierre;                                   // se conserva el '</row>' original
    }
    partes.push(xml.slice(desde));
    xml = partes.join('');
    zip.file('xl/worksheets/sheet1.xml', xml);

    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}
