// ─── J-4: CÁLCULOS RESULTADOS SINCO ──────────────────────────────────────────

/**
 * Antigüedad en años desde la fecha de inicio de cobertura.
 * Acepta formato ISO (YYYY-MM-DD) o DD/MM/YYYY.
 */
export function calcularAntiguedad(fechaIniCobertura: string): number {
    const normalized = fechaIniCobertura.includes('/')
        ? fechaIniCobertura.split('/').reverse().join('-')
        : fechaIniCobertura;
    const ini  = new Date(normalized);
    const hoy  = new Date();
    const ms   = hoy.getTime() - ini.getTime();
    return ms / (1000 * 60 * 60 * 24 * 365.25);
}

/** Media de antigüedades (array de años). */
export function calcularAntiguedadMedia(antiguedades: number[]): number {
    if (antiguedades.length === 0) return 0;
    const suma = antiguedades.reduce((acc, v) => acc + v, 0);
    return suma / antiguedades.length;
}

/** Siniestros por año = totalSiniestros / antiguedadMedia. */
export function calcularSiniestrosPorAnio(totalSiniestros: number, antiguedadMedia: number): number {
    if (antiguedadMedia === 0) return 0;
    return totalSiniestros / antiguedadMedia;
}

/** Frecuencia = siniestrosPorAnio / vehiculosConSinco. */
export function calcularFrecuencia(siniestrosPorAnio: number, vehiculosConSinco: number): number {
    if (vehiculosConSinco === 0) return 0;
    return siniestrosPorAnio / vehiculosConSinco;
}

/** Total de matrículas únicas en la flota. */
export function contarVehiculos(matriculas: string[]): number {
    return matriculas.length;
}

/**
 * Vehículos con registro SINCO: aquellos cuyo código de retorno
 * es vacío (consulta exitosa, el vehículo existe en SINCO).
 * Errores (01, 21, etc.) = no tienen datos SINCO.
 */
export function contarVehiculosConSinco(codigosRetorno: string[]): number {
    return codigosRetorno.filter(c => !c || c.trim() === '' || c.trim() === '0').length;
}

/** Filtra las filas reales (con al menos un campo no vacío) */
export function filtrarFilasReales(rows: Record<string, string>[]): Record<string, string>[] {
    return rows.filter(row => Object.values(row).some(v => v.trim() !== ''));
}

// ─── E-3: CONSOLIDADO Y MERGE SINCO ──────────────────────────────────────────

export interface ResumenSinco {
    totalVehiculos: number;       // filas reales en sincoResultados
    vehiculosConSinco: number;    // con código de retorno válido
    totalSiniestros: number;      // suma de num_siniestros de todas las filas
    antiguedadMedia: number;      // años — media de todas las filas con fecha
    siniestrosPorAnio: number;    // calcularSiniestrosPorAnio(total, antiguedadMedia)
    frecuencia: number;           // calcularFrecuencia(siniestrosPorAnio, vehiculosConSinco)
}

/** Resume una flota SINCO entera a estadísticas listas para la UI.
 *  Fórmula correcta MMT:
 *  - TOTAL_CONSULTAS = filas sin código de error (exitosas)
 *  - ANTIGÜEDAD = media de Num_Anios_Asegurado de las filas exitosas
 *  - SINIESTROS = suma de Num_Siniestros de todas las filas
 *  - FRECUENCIA = (SINIESTROS / ANTIGÜEDAD) / TOTAL_CONSULTAS
 */
export function consolidarSinco(rows: Record<string, string>[]): ResumenSinco {
    const reales = filtrarFilasReales(rows);

    let totalSiniestros = 0;
    const numAniosList: number[] = [];
    const codigosRetorno: string[] = [];

    for (const row of reales) {
        const cod = row['cod_retorno'] ?? row['codigo_retorno'] ?? row['Codigo_Retorno'] ?? '';
        codigosRetorno.push(cod);

        // Siniestros — suma todos (incluidas filas con error que llevan 0)
        const sinRaw = row['num_siniestros'] ?? row['Num_Siniestros'];
        if (sinRaw !== undefined && sinRaw !== '') {
            const n = parseFloat(sinRaw);
            if (!isNaN(n)) totalSiniestros += n;
        }

        // Antigüedad — solo filas exitosas (sin código de error)
        const isOk = !cod || cod.trim() === '' || cod.trim() === '0';
        if (isOk) {
            const anyosRaw = row['Num_Anios_Asegurado'] ?? row['num_anios_asegurado'];
            let pushed = false;
            if (anyosRaw !== undefined && anyosRaw !== '') {
                const n = parseFloat(anyosRaw);
                // Reject suspiciously small values (< ~1 month) — they inflate frequency x100+
                if (!isNaN(n) && n >= 0.08) { numAniosList.push(n); pushed = true; }
            }
            if (!pushed) {
                // Fallback: calcular desde Fec_Ini_Cobertura
                const fec = row['Fec_Ini_Cobertura'] ?? row['fec_ini_cobertura'] ?? '';
                if (fec.trim()) {
                    const years = calcularAntiguedad(fec);
                    if (years > 0) numAniosList.push(years);
                }
            }
        }
    }

    const vehiculosConSinco  = contarVehiculosConSinco(codigosRetorno);
    const antiguedadMedia    = numAniosList.length > 0
        ? numAniosList.reduce((a, b) => a + b, 0) / numAniosList.length
        : 0;
    const siniestrosPorAnio  = calcularSiniestrosPorAnio(totalSiniestros, antiguedadMedia);
    const frecuencia         = calcularFrecuencia(siniestrosPorAnio, vehiculosConSinco);

    return {
        totalVehiculos: reales.length,
        vehiculosConSinco,
        totalSiniestros,
        antiguedadMedia,
        siniestrosPorAnio,
        frecuencia,
    };
}

/**
 * Aplica datos SINCO a filas TRABAJO sin sobreescribir celdas con contenido.
 * Empareja por `matchField` (default: 'matricula').
 */
export function mergeSincoToTrabajo(
    trabajoRows: Record<string, string>[],
    sincoRows:   Record<string, string>[],
    matchField:  string = 'matricula',
): Record<string, string>[] {
    const sincoIndex = new Map<string, Record<string, string>>();
    for (const row of sincoRows) {
        const key = row[matchField]?.trim();
        if (key) sincoIndex.set(key, row);
    }

    return trabajoRows.map(tRow => {
        const key = tRow[matchField]?.trim();
        const sRow = key ? sincoIndex.get(key) : undefined;
        if (!sRow) return { ...tRow };

        const merged: Record<string, string> = { ...tRow };
        for (const [campo, valor] of Object.entries(sRow)) {
            if (!merged[campo] || merged[campo].trim() === '') {
                merged[campo] = valor;
            }
        }
        return merged;
    });
}
