/**
 * V7 Flotas — ÚNICA fuente de verdad: tabla `carpetas` de V5 BD.
 *
 * Antes leía de `flotas`+`estudios`+`emisiones` (tablas nuevas V5) y chocaba con
 * Dashboard/Estudio que leen de `carpetas`. Ahora los 3 usan la misma tabla.
 *
 *   GET /carpetas-summary (Flask V5) → [ { id, nombre, cif, actividad, corredor_id,
 *                                          estado, fecha_vcto, num_vehiculos, prima_total } ]
 *
 * Se transforma al formato RAW que espera el script v7:
 *   RAW = [[ nombre, cif, actividad, corId, cmId,
 *            [[estado, fechaEst, veh, pof, pem, vto]] ]]
 */
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { apiGet } from '@/lib/orionApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type EstadoV7 = 'CONTRATADA' | 'OFERTADA' | 'EN ESTUDIO' | 'RECHAZADA';
const ESTADO_MAP: Record<string, EstadoV7> = {
    'CONTRATADA': 'CONTRATADA',
    'OFERTADA':   'OFERTADA',
    'EN ESTUDIO': 'EN ESTUDIO',
    'RECHAZADA':  'RECHAZADA',
    'ESTUDIADA':  'EN ESTUDIO',
};

interface CarpetaSummary {
    id: string; nombre: string; cif: string; actividad: string;
    corredor_id: string | null; estado: string;
    fecha_vcto: string; num_vehiculos: number; prima_total: number;
    actualizada: string;
}
interface Corredor { id: string; nombre: string; codigo: string | null; cif: string | null; sucursal: string | null; }
interface Comercial { id: string; nombre: string; sucursal: string | null; }

export async function GET(req: NextRequest) {
    const themeParam = new URL(req.url).searchParams.get('theme');
    const initialTheme = themeParam === 'light' ? 'light' : 'dark';
    try {
        const [carpetasR, corredoresR, comercialesR] = await Promise.all([
            apiGet('/carpetas-summary').then(r => r.json() as Promise<CarpetaSummary[]>),
            apiGet('/corredores').then(r => r.json() as Promise<Corredor[]>),
            apiGet('/comerciales').then(r => r.json() as Promise<Comercial[]>),
        ]);

        // Comerciales m1..mN. Clave: el script v7 asigna la SUCURSAL de la flota
        // a partir del comercial (no del corredor). Por eso necesitamos un
        // comercial por sucursal para que las flotas TITAN caigan en TITAN.
        // Añadimos uno "SIN_ASIGNAR" para que las flotas sin corredor NO se pinten como Mediación.
        const COM = comercialesR.map((c, i) => ({
            id: `m${i + 1}`, n: c.nombre,
            s: (c.sucursal || 'MEDIACION').toUpperCase(),
        }));
        COM.push({ id: 'm_na', n: 'Sin asignar', s: 'SIN_ASIGNAR' });
        const comIdMap = new Map(comercialesR.map((c, i) => [c.id, `m${i + 1}`]));
        const comPorSucursal = new Map<string, string>();
        COM.forEach(c => { if (!comPorSucursal.has(c.s)) comPorSucursal.set(c.s, c.id); });
        const DEFAULT_CM_MED = comPorSucursal.get('MEDIACION') || COM[0]?.id || 'm1';
        const DEFAULT_CM_TITAN = comPorSucursal.get('TITAN') || COM[0]?.id || 'm1';
        const DEFAULT_CM_NA = 'm_na';

        // Corredores c1..cN (solo los usados)
        const corredoresUsados = new Set<string>();
        carpetasR.forEach(c => { if (c.corredor_id) corredoresUsados.add(c.corredor_id); });
        const corFiltrados = corredoresR.filter(c => corredoresUsados.has(c.id));
        const COR = corFiltrados.map((c, i) => ({
            id: `c${i + 1}`,
            n: c.nombre || '(sin nombre)',
            s: (c.sucursal || 'MEDIACION').toUpperCase(),
            code: c.codigo || '',
            cif: c.cif || '',
            mail: `flotas@${(c.nombre || 'x').toLowerCase().replace(/[^a-z0-9]+/g, '')}.es`,
        }));
        const corIdMap = new Map(corFiltrados.map((c, i) => [c.id, `c${i + 1}`]));
        const sucursalCorredor = new Map(corFiltrados.map(c => [c.id, (c.sucursal || 'MEDIACION').toUpperCase()]));

        const hoy = new Date().toISOString().substring(0, 10);

        // Mapa v7 ID → ID real (para persistir cambios: edición de corredor en v7)
        const corRealById: Record<string, string> = {};
        corFiltrados.forEach((c, i) => { corRealById[`c${i + 1}`] = c.id; });

        const RAW = carpetasR.map(c => {
            const corId = c.corredor_id ? (corIdMap.get(c.corredor_id) || null) : null;
            const sucFlota = (c.corredor_id && sucursalCorredor.get(c.corredor_id)) || (corId ? 'MEDIACION' : 'SIN_ASIGNAR');
            const cmId  = sucFlota === 'TITAN' ? DEFAULT_CM_TITAN
                        : sucFlota === 'SIN_ASIGNAR' ? DEFAULT_CM_NA
                        : DEFAULT_CM_MED;
            const estado = ESTADO_MAP[(c.estado || '').toUpperCase()] || 'EN ESTUDIO';
            const fechaEst = (c.actualizada || hoy).substring(0, 10);
            const pof = estado === 'CONTRATADA' ? 0 : Math.round(c.prima_total);
            const pem = estado === 'CONTRATADA' ? Math.round(c.prima_total) : 0;
            const vto = c.fecha_vcto || '';
            const est = [[estado, fechaEst, c.num_vehiculos, pof, pem, vto]];
            // 7º elemento: realId de carpeta para poder persistir cambios desde v7
            return [c.nombre || 'Sin nombre', c.cif || '', c.actividad || '', corId, cmId, est, c.id];
        });

        // Leer plantilla y substituir mocks
        const htmlPath = path.join(process.cwd(), 'src', 'app', '(dashboard)', 'flotas', '_v7-template.html');
        let html = fs.readFileSync(htmlPath, 'utf8');

        // Aplicar tema inicial (query ?theme=light) y añadir listener de postMessage
        // para que el iframe cambie tema cuando el parent lo cambie.
        html = html.replace(
            '<html lang="es" data-theme="dark">',
            `<html lang="es" data-theme="${initialTheme}">`,
        );
        const themeSync = `
<script>
window.addEventListener('message', function(e){
  if (e && e.data && e.data.type === 'orion-theme' && (e.data.theme === 'light' || e.data.theme === 'dark')) {
    document.documentElement.dataset.theme = e.data.theme;
  }
});
</script>`;
        html = html.replace('</body>', themeSync + '\n</body>');

        // Extender SUC para que incluya 'Sin asignar'
        html = html.replace(
            /var SUC=\{[^}]+\};/,
            `var SUC={TITAN:'Titán',MEDIACION:'Mediación',SIN_ASIGNAR:'Sin asignar'};`,
        );

        html = html
            .replace(/var COM=\[[\s\S]*?\}\);/, `var COM=${JSON.stringify(COM)};\nvar COR_REAL_BY_V7=${JSON.stringify(corRealById)};`)
            .replace(/var CN=\[[\s\S]*?\];/, `var CN=${JSON.stringify(COR.map(c => c.n))};`)
            .replace(/var COR=CN\.map\([\s\S]*?\}\);/, `var COR=${JSON.stringify(COR)};`)
            .replace(/var RAW=\[[\s\S]*?\];\n/, `var RAW=${JSON.stringify(RAW)};\n`)
            .replace(
                /var TODAY=new Date\(\d+,\d+,\d+\),TODAY_ISO='[^']+';/,
                (() => {
                    const d = new Date();
                    return `var TODAY=new Date(${d.getFullYear()},${d.getMonth()},${d.getDate()}),TODAY_ISO='${d.toISOString().slice(0, 10)}';`;
                })(),
            );

        return new NextResponse(html, {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
        });
    } catch (err) {
        return new NextResponse(`<pre style="color:red;padding:20px">Error: ${String(err)}</pre>`, {
            status: 500,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    }
}
