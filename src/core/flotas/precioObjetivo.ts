// ─── RECALCULAR PRECIO OBJETIVO ──────────────────────────────────────────────
//
// El sistema de emisión recibe un PRECIO_OBJETIVO por vehículo y devuelve la PRIMA que consigue, que no
// coincide al céntimo (1.650 → 1.649,97). Es determinista: mismo vehículo y mismo precio → misma prima.
// Este módulo calcula qué PRECIO_OBJETIVO hay que enviar para que la PRIMA salga EXACTAMENTE la buscada.
//
//   · 1 intento conocido  → proporcional:   x = enviado × buscada / obtenida
//   · 2 o más intentos    → secante con los dos últimos puntos (relación lineal del sistema en ese tramo)
//   · si el sistema trabaja con escalones y el cálculo repite un precio ya probado, se mueve 1 céntimo
//
// Módulo puro (sin React ni ficheros).

export interface PuntoPrecio {
    /** PRECIO_OBJETIVO que se envió */
    enviado: number;
    /** PRIMA que devolvió el sistema */
    obtenido: number;
}

export interface AjustePrecio {
    /** prima buscada: el PRECIO_OBJETIVO original del vehículo */
    objetivo: number;
    /** intentos conocidos, en orden */
    puntos: PuntoPrecio[];
    /** PRECIO_OBJETIVO que hay que enviar en la próxima emisión */
    enviar: number;
    /**
     * 'exacto'      = la última prima devuelta ya es la buscada
     * 'ajustado'    = hay un precio nuevo que probar
     * 'mas_cercano' = el sistema no permite ese céntimo: entre dos precios separados 1 céntimo salta por encima;
     *                 se deja el que da la prima más cercana
     */
    estado: 'exacto' | 'ajustado' | 'mas_cercano';
}

export type AjustesPrecio = Record<string, AjustePrecio>;

const r2 = (n: number) => Math.round(n * 100) / 100;
const iguales = (a: number, b: number) => Math.abs(a - b) < 0.005;

/** Siguiente PRECIO_OBJETIVO a enviar, a partir de los intentos conocidos. */
export function siguientePrecio(objetivo: number, puntos: PuntoPrecio[]): { enviar: number; estado: AjustePrecio['estado'] } {
    const ult = puntos[puntos.length - 1];
    if (!ult) return { enviar: r2(objetivo), estado: 'ajustado' };
    if (iguales(ult.obtenido, objetivo)) return { enviar: r2(ult.enviado), estado: 'exacto' };

    // Si algún intento anterior ya dio la prima exacta, se vuelve a ese precio
    const bueno = puntos.find(p => iguales(p.obtenido, objetivo));
    if (bueno) return { enviar: r2(bueno.enviado), estado: 'ajustado' };

    // Horquilla: el mayor precio que se quedó corto y el menor que se pasó (a más precio, más prima)
    const cortos = puntos.filter(p => p.obtenido < objetivo), largos = puntos.filter(p => p.obtenido > objetivo);
    const lo = cortos.length ? cortos.reduce((a, b) => (b.enviado > a.enviado ? b : a)) : null;
    const hi = largos.length ? largos.reduce((a, b) => (b.enviado < a.enviado ? b : a)) : null;
    if (lo && hi && hi.enviado - lo.enviado <= 0.0101) {
        // No hay ningún céntimo entre los dos: el sistema no puede dar esa prima exacta
        const mejor = Math.abs(lo.obtenido - objetivo) <= Math.abs(hi.obtenido - objetivo) ? lo : hi;
        return { enviar: r2(mejor.enviado), estado: 'mas_cercano' };
    }

    // Secante con el último intento y el anterior que tenga un precio distinto.
    // Con horquilla y 3 o más intentos, bisección: si el sistema va a escalones la secante se atasca.
    let x: number | null = lo && hi && puntos.length >= 3 ? (lo.enviado + hi.enviado) / 2 : null;
    for (let i = puntos.length - 2; i >= 0 && x === null; i--) {
        const p = puntos[i];
        if (iguales(p.enviado, ult.enviado) || iguales(p.obtenido, ult.obtenido)) continue;
        const pendiente = (ult.obtenido - p.obtenido) / (ult.enviado - p.enviado);
        if (pendiente > 0) x = ult.enviado + (objetivo - ult.obtenido) / pendiente;
    }
    // Proporcional
    if (x === null || !Number.isFinite(x)) x = ult.obtenido > 0 ? ult.enviado * (objetivo / ult.obtenido) : objetivo;

    let enviar = r2(x);
    // Dentro de la horquilla conocida (si el cálculo se sale, punto medio)
    if (lo && hi && (enviar <= lo.enviado || enviar >= hi.enviado)) enviar = r2((lo.enviado + hi.enviado) / 2);
    if (lo && enviar <= lo.enviado) enviar = r2(lo.enviado + 0.01);
    if (hi && enviar >= hi.enviado) enviar = r2(hi.enviado - 0.01);
    // Escalones: si el cálculo cae en un precio ya probado sin acierto, se avanza 1 céntimo en la dirección buena
    const paso = objetivo > ult.obtenido ? 0.01 : -0.01;
    for (let k = 0; k < 50 && puntos.some(p => iguales(p.enviado, enviar)); k++) enviar = r2(enviar + paso);
    return { enviar, estado: 'ajustado' };
}

export interface FilaResultado {
    matricula: string;
    enviado: number;
    obtenido: number;
}

export interface ResumenRecalculo {
    ajustes: AjustesPrecio;
    exactos: number;
    corregidos: number;
    /** vehículos en los que el sistema no permite la prima exacta: se deja la más cercana posible */
    masCercanos: number;
    /** matrículas del fichero que no están en esta emisión */
    noEncontradas: string[];
    /** matrículas del fichero sin prima (error en esa fila) */
    sinPrima: string[];
}

/**
 * Incorpora un fichero de resultado del sistema a los ajustes que ya hubiera.
 * `objetivos`: matrícula limpia → prima buscada (el PRECIO_OBJETIVO original de cada vehículo).
 */
export function aplicarResultado(
    previos: AjustesPrecio | undefined,
    objetivos: Record<string, number>,
    filas: FilaResultado[],
): ResumenRecalculo {
    const ajustes: AjustesPrecio = { ...(previos ?? {}) };
    const noEncontradas: string[] = [], sinPrima: string[] = [];
    let exactos = 0, corregidos = 0, masCercanos = 0;
    for (const f of filas) {
        const objetivo = objetivos[f.matricula];
        if (objetivo === undefined) { noEncontradas.push(f.matricula); continue; }
        if (!(f.obtenido > 0) || !(f.enviado > 0)) { sinPrima.push(f.matricula); continue; }
        const prev = ajustes[f.matricula];
        // Si la prima buscada ha cambiado desde el último fichero (se cambió la oferta), se empieza de cero
        const puntos = prev && iguales(prev.objetivo, objetivo) ? [...prev.puntos] : [];
        const ult = puntos[puntos.length - 1];
        // Subir dos veces el mismo fichero no añade información
        if (!ult || !iguales(ult.enviado, f.enviado) || !iguales(ult.obtenido, f.obtenido)) {
            puntos.push({ enviado: r2(f.enviado), obtenido: r2(f.obtenido) });
        }
        const s = siguientePrecio(objetivo, puntos);
        ajustes[f.matricula] = { objetivo: r2(objetivo), puntos, enviar: s.enviar, estado: s.estado };
        if (s.estado === 'exacto') exactos++; else if (s.estado === 'mas_cercano') masCercanos++; else corregidos++;
    }
    return { ajustes, exactos, corregidos, masCercanos, noEncontradas, sinPrima };
}

/** Número en formato del fichero: 1649.97, «1649,97», «1.649,97». */
export function numeroFichero(v: unknown): number {
    if (typeof v === 'number') return v;
    const t = String(v ?? '').trim();
    if (!t) return NaN;
    if (t.includes(',')) return parseFloat(t.replace(/\./g, '').replace(',', '.'));
    return parseFloat(t);
}
