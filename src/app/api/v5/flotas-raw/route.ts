/**
 * Transforma los datos de la BD V5 (flotas + estudios + corredores + comerciales + sucursales)
 * al formato RAW que espera el script v7 del HTML del jefe:
 *   RAW = [[nombre, cif, actividad, corredor_id, comercial_id, [[estado,fecha,veh,pof,pem,vto,mot?,cm?], ...]], ...]
 *   COR = [{id, n, s, code, cif, mail}, ...]
 *   COM = [{id, n, s}, ...]
 */
import { NextResponse } from 'next/server';
import { apiGet } from '@/lib/orionApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ESTADO_MAP: Record<string, 'C' | 'O' | 'E' | 'R' | 'ES'> = {
    'CONTRATADA': 'C',
    'OFERTADA': 'O',
    'EN ESTUDIO': 'E',
    'RECHAZADA': 'R',
    'ESTUDIADA': 'ES',
};

interface FlotaV5 { id: string; cif: string | null; nombre: string; actividad: string; corredor_id: string | null; comercial_traido_id: string | null; }
interface Estudio { flota_id: string; estado: string; fecha_vcto: string | null; prima_ofertada_total: number | null; prima_emitida_total: number | null; actualizado_en: string | null; data?: string | null; }
interface Corredor { id: string; nombre: string; codigo: string | null; cif: string | null; sucursal: string | null; }
interface Comercial { id: string; nombre: string; sucursal: string | null; }

export async function GET() {
    try {
        const [flotasR, corredoresR, comercialesR] = await Promise.all([
            apiGet('/flotas-v5').then(r => r.json() as Promise<FlotaV5[]>),
            apiGet('/corredores').then(r => r.json() as Promise<Corredor[]>),
            apiGet('/comerciales').then(r => r.json() as Promise<Comercial[]>),
        ]);

        // Comerciales cortos m1..mN (índice 1-based)
        const COM = comercialesR.map((c, i) => ({ id: `m${i + 1}`, n: c.nombre, s: (c.sucursal || 'MEDIACION').toUpperCase() }));
        const comIdMap = new Map(comercialesR.map((c, i) => [c.id, `m${i + 1}`]));

        // Solo corredores con flotas asociadas (ahorra payload — son 500+).
        const corredoresUsados = new Set<string>();
        flotasR.forEach(f => { if (f.corredor_id) corredoresUsados.add(f.corredor_id); });

        const corFiltrados = corredoresR.filter(c => corredoresUsados.has(c.id));
        const COR = corFiltrados.map((c, i) => ({
            id: `c${i + 1}`,
            n: c.nombre,
            s: (c.sucursal || 'MEDIACION').toUpperCase(),
            code: c.codigo || '',
            cif: c.cif || '',
            mail: `flotas@${c.nombre.toLowerCase().replace(/[^a-z0-9]+/g, '')}.es`,
        }));
        const corIdMap = new Map(corFiltrados.map((c, i) => [c.id, `c${i + 1}`]));

        // Traer todos los estudios de una vez? mejor por flota via /flotas-v5/<id>
        // Pero eso serían 387 llamadas. Mejor crear otro endpoint que devuelva todos los estudios.
        // Por ahora construimos RAW solo con el último estudio de cada flota (viene en /flotas-v5).
        // Para la v2 harían falta todos los estudios por flota para el drawer de versiones.

        // Default fallback: siempre al primer comercial para evitar null.s crash en el script v7.
        // Si la flota no tiene corredor asignado se queda null (el script v7 lo maneja con "Sin corredor").
        const DEFAULT_CM = COM[0]?.id || 'm1';

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const RAW = flotasR.map((f: any) => {
            const corId = f.corredor_id ? (corIdMap.get(f.corredor_id) || null) : null;
            const cmId = (f.comercial_traido_id && comIdMap.get(f.comercial_traido_id)) || DEFAULT_CM;
            const estado = ESTADO_MAP[f.estado_actual || ''] || 'E';
            const hoy = new Date().toISOString().substring(0, 10);
            const fecha = f.fecha_vcto || hoy;
            const veh = 0;  // no tenemos nº vehículos agregado en el endpoint; drawer lo calcula desde estudios
            const pof = Math.round(f.prima_ofertada || 0);
            const pem = Math.round(f.prima_emitida || 0);
            // Formato de estudio: [estado, fecha_estudio, nº_veh, prima_ofertada, prima_emitida, fecha_vcto]
            const estudios: unknown[][] = [[estado, hoy, veh, pof, pem, fecha]];
            return [f.nombre || 'Sin nombre', f.cif || '', f.actividad || '', corId, cmId, estudios];
        });

        return NextResponse.json({ raw: RAW, cor: COR, com: COM }, {
            headers: { 'Cache-Control': 'no-store' },
        });
    } catch (err) {
        return NextResponse.json({ error: String(err) }, { status: 502 });
    }
}
