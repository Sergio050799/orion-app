// ─── J-3: NORMALIZACIÓN DE PÓLIZA ────────────────────────────────────────────

export function normalizarPoliza(poliza: string): string {
    const digits = poliza.replace(/\D/g, '');
    return digits.slice(-5).padStart(5, '0');
}

// ─── Detección de clave de flota ─────────────────────────────────────────────

export interface ClaveFlotaGrupo {
    prefijo: string;
    afectadas: string[];
}

/**
 * Detecta grupos de pólizas que comparten una clave de flota (prefijo común largo,
 * sufijo individual corto ≤3 dígitos). Ejemplo: 5343121, 5343122, 5343123
 * → prefijo "534312", individuales 1, 2, 3.
 */
export function detectarClaveFlota(polizas: string[]): ClaveFlotaGrupo[] {
    const entries = polizas
        .map(p => ({ original: p, digits: p.replace(/[\s\-\.\/]/g, '').replace(/\D/g, '') }))
        .filter(e => e.digits.length > 5);

    if (entries.length < 2) return [];

    const sorted = [...entries].sort((a, b) => a.digits.localeCompare(b.digits));
    const groups = new Map<string, string[]>();

    for (let i = 0; i < sorted.length - 1; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
            const a = sorted[i].digits;
            const b = sorted[j].digits;
            let k = 0;
            while (k < a.length && k < b.length && a[k] === b[k]) k++;
            const prefijo = a.slice(0, k);
            const sufA = a.slice(k).length;
            const sufB = b.slice(k).length;
            if (prefijo.length >= 4 && sufA <= 3 && sufA > 0 && sufB <= 3) {
                if (!groups.has(prefijo)) groups.set(prefijo, []);
                const g = groups.get(prefijo)!;
                if (!g.includes(sorted[i].original)) g.push(sorted[i].original);
                if (!g.includes(sorted[j].original)) g.push(sorted[j].original);
            }
        }
    }

    return Array.from(groups.entries())
        .filter(([, afs]) => afs.length >= 2)
        .map(([prefijo, afectadas]) => ({ prefijo, afectadas }));
}

/**
 * Normaliza una póliza usando la clave de flota detectada.
 * Extrae el sufijo individual y lo rellena hasta 5 dígitos.
 */
export function normalizarPolizaConClave(poliza: string, prefijo: string): string {
    const digits = poliza.replace(/[\s\-\.\/]/g, '').replace(/\D/g, '');
    if (digits.startsWith(prefijo)) {
        const individual = digits.slice(prefijo.length);
        return individual.padStart(5, '0');
    }
    return normalizarPoliza(poliza);
}
