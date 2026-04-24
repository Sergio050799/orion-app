// Cell-pair format constants for Ficha Tecnica A4 / ITV regional documents
// Tabla de 4 columnas: Codigo | Valor | Codigo | Valor
// El OCR devuelve cada celda como linea propia — parear codigo con la linea siguiente.

export const CELL_PAIR_CODE_MAP: Record<string, string> = {
    "Z":      "E",    // Numero de bastidor (VIN)
    "D.1.":   "D1",   // Marca
    "D.2.":   "D2",   // Tipo
    "D.3.":   "D3",   // Variante/version
    "J":      "J",    // Carroceria
    "CL":     "CL",   // Categoria vehiculo
    "M.1.":   "M1",   // Masa maxima tecnica autorizada (kg)
    "G":      "G",    // Masa en vacio / tara (kg)
    "F.1.":   "F1",   // Longitud total (mm)
    "F.1.1.": "F11",  // Distancia entre ejes (mm)
    "F.1.5.": "F15",  // Voladizo trasero (mm)
    "F.2.":   "F2",   // Anchura maxima (mm)
    "F.2.1.": "F21",  // Anchura max. cargado (mm)
    "F.3.":   "F3",   // Altura maxima (mm)
    "F.3.1.": "F31",  // Altura max. cargado (mm)
    "L":      "L",    // Numero de ejes / via delantera
    "L.O.":   "LO",   // Via trasera
    "L.1.":   "L1",   // Eje director
    "L.2.":   "L2",   // Neumaticos
    "P.3.":   "P3",   // Combustible
    "P.5.":   "P5",   // Tipo motor / cilindrada
    "P.5.1.": "P51",  // Marca motor
    "A.1.":   "A1",   // Fabricante
    "A.2.":   "A2",   // Pais/direccion fabricante
    "B.1.":   "B1",   // Base de medicion
    "J.1.":   "J1",   // Codigo carroceria ITV
    "J.2.":   "J2",   // Codigo carroceria adicional
    "J.3.":   "J3",   // Codigo carroceria adicional
    "F.5.":   "F5",   // Anchura (mm)
    "F.6.":   "F6",   // Longitud (mm)
    "P.1.":   "P1",   // Cilindrada (cc)
    "P.2.":   "P2",   // Potencia (kW)
    "P.2.1.": "P21",  // Potencia motor electrico (kW) — hibridos
    "S.1.":   "S1",   // Numero de plazas sentadas
    "S.2.":   "S2",   // Numero de plazas de pie
};

export function isItvCodeLine(line: string): boolean {
    const t = line.trim();
    // Cubre: G, L, Z, J, CL, M.1., F.1., F.1.1., L.O., P.5.1., A.2., etc.
    return /^[A-Z]{1,3}(\.[A-Z0-9]+)*\.?$/.test(t);
}

// Codigos ITV estructurales que NO estan en el mapa de extraccion pero son codigos reales del doc.
export const STRUCTURAL_ITV_CODES = new Set([
    "E", "R", "M.4.", "B.2.", "L.O."
]);

// Guard estricto: true si es codigo conocido del mapa, codigo estructural, o patron con punto.
// Evita que valores como "D" (diesel) o "AXD" (codigo motor) se traten como codigos.
export function isItvKnownOrDottedCode(line: string): boolean {
    const t = line.trim();
    if (CELL_PAIR_CODE_MAP.hasOwnProperty(t)) return true;
    if (STRUCTURAL_ITV_CODES.has(t)) return true;
    if (/^[A-Z]{1,3}\.[A-Z0-9]/.test(t)) return true;
    return false;
}
