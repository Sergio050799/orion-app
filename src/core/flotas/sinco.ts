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
 * no es vacío ni indica ausencia de datos.
 */
export function contarVehiculosConSinco(codigosRetorno: string[]): number {
    return codigosRetorno.filter(c => c && c.trim() !== '' && c.trim() !== '0').length;
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

/** Resume una flota SINCO entera a estadísticas listas para la UI. */
export function consolidarSinco(rows: Record<string, string>[]): ResumenSinco {
    const reales = filtrarFilasReales(rows);

    let totalSiniestros = 0;
    const antiguedades: number[] = [];
    const codigosRetorno: string[] = [];

    for (const row of reales) {
        // Siniestros
        const sinRaw = row['num_siniestros'];
        if (sinRaw !== undefined) {
            const n = parseFloat(sinRaw);
            if (!isNaN(n)) totalSiniestros += n;
        }

        // Antigüedad
        const fecha = row['fec_ini_cobertura'] ?? row['fecha_ini_cobertura'];
        if (fecha && fecha.trim() !== '') {
            antiguedades.push(calcularAntiguedad(fecha.trim()));
        }

        // Código de retorno
        const cod = row['cod_retorno'] ?? row['codigo_retorno'] ?? '';
        codigosRetorno.push(cod);
    }

    const antiguedadMedia    = calcularAntiguedadMedia(antiguedades);
    const vehiculosConSinco  = contarVehiculosConSinco(codigosRetorno);
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
