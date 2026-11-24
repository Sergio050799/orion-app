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
    observaciones?: string; comercial_id?: string | null; tomador?: string;
    efecto?: string; cia_actual?: string; poliza_actual?: string; periodicidad?: string;
}
interface Corredor { id: string; nombre: string; codigo: string | null; cif: string | null; sucursal: string | null; email?: string | null; }
interface Comercial { id: string; nombre: string; sucursal: string | null; }

/** GET a Flask de un endpoint que debe devolver un array. Lanza con mensaje claro si no. */
async function getLista<T>(ruta: string): Promise<T[]> {
    const r = await apiGet(ruta);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data: unknown = await r.json();
    if (!Array.isArray(data)) throw new Error('respuesta inesperada');
    return data as T[];
}

const escHtml = (t: string) => t.replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);

/** JSON seguro para incrustar dentro de <script>: un dato con "</script>" o "<!--" no puede romper el bloque. */
const jsonParaScript = (v: unknown) => JSON.stringify(v)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

/** Slug seguro para el dominio del email de respaldo (sin acentos, solo a-z0-9, máx. 40). */
function slugDominio(nombre: string): string {
    const s = nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 40);
    return s || 'corredor';
}
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
/** Email real del corredor si es válido; si no, el de respaldo generado con slug. */
function mailCorredor(c: Corredor): string {
    const real = (c.email || '').trim();
    if (real.length <= 254 && EMAIL_RE.test(real)) return real;
    return `flotas@${slugDominio(c.nombre || '')}.es`;
}

/** Página de error (Flask caído o respuesta inválida): sin datos, con botón Reintentar. */
function paginaError(theme: 'dark' | 'light', fallos: string[]): NextResponse {
    const dark = theme === 'dark';
    const bg = dark ? '#0d111b' : '#ffffff', fg = dark ? '#e6e9f0' : '#1a2233', mut = dark ? '#8b93a7' : '#5b6477';
    const bd = dark ? '#2a3142' : '#d5dae4';
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Flotas · sin conexión</title></head>
<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:${bg};color:${fg};font-family:system-ui,-apple-system,'Segoe UI',sans-serif">
<div style="max-width:460px;padding:24px;text-align:center">
<h1 style="font-size:18px;margin:0 0 8px">No se han podido cargar las flotas</h1>
<p style="font-size:14px;line-height:1.5;margin:0 0 6px;color:${mut}">El servidor de datos no responde o ha devuelto un error. No se muestra ningún dato para evitar trabajar sobre información obsoleta.</p>
<p style="font-size:12px;margin:0 0 18px;color:${mut}">${fallos.map(escHtml).join('<br>')}</p>
<button type="button" onclick="this.disabled=true;this.textContent='Reintentando…';location.reload()" style="font:inherit;font-size:14px;font-weight:600;padding:8px 18px;border-radius:8px;border:1px solid ${bd};background:transparent;color:${fg};cursor:pointer">Reintentar</button>
</div></body></html>`;
    return new NextResponse(html, {
        status: 503,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
}

export async function GET(req: NextRequest) {
    const themeParam = new URL(req.url).searchParams.get('theme');
    const initialTheme = themeParam === 'light' ? 'light' : 'dark';
    try {
        // Cada endpoint se trata por separado: si alguno falla se devuelve una página de
        // error clara con "Reintentar" (nunca datos parciales ni cacheados: se podría
        // guardar encima de información obsoleta).
        const [carpetasS, corredoresS, comercialesS] = await Promise.allSettled([
            getLista<CarpetaSummary>('/carpetas-summary'),
            getLista<Corredor>('/corredores'),
            getLista<Comercial>('/comerciales'),
        ]);
        const motivo = (e: unknown) => (e instanceof Error ? e.message : String(e));
        const fallos: string[] = [];
        if (carpetasS.status === 'rejected')    fallos.push(`Flotas: ${motivo(carpetasS.reason)}`);
        if (corredoresS.status === 'rejected')  fallos.push(`Corredores: ${motivo(corredoresS.reason)}`);
        if (comercialesS.status === 'rejected') fallos.push(`Comerciales: ${motivo(comercialesS.reason)}`);
        if (carpetasS.status !== 'fulfilled' || corredoresS.status !== 'fulfilled' || comercialesS.status !== 'fulfilled') {
            console.error('[flotas-page] fallo cargando datos:', fallos.join(' | '));
            return paginaError(initialTheme, fallos);
        }
        const carpetasR = carpetasS.value, corredoresR = corredoresS.value, comercialesR = comercialesS.value;

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

        // Corredores c1..cN: TODOS, para poder asignar a una flota cualquier corredor
        // (antes solo salían los que ya tenían alguna flota y los demás no se podían elegir).
        const corFiltrados = corredoresR;
        const COR = corFiltrados.map((c, i) => ({
            id: `c${i + 1}`,
            n: c.nombre || '(sin nombre)',
            s: (c.sucursal || 'MEDIACION').toUpperCase(),
            code: c.codigo || '',
            cif: c.cif || '',
            mail: mailCorredor(c),
        }));
        const corIdMap = new Map(corFiltrados.map((c, i) => [c.id, `c${i + 1}`]));
        const sucursalCorredor = new Map(corFiltrados.map(c => [c.id, (c.sucursal || 'MEDIACION').toUpperCase()]));

        const hoy = new Date().toISOString().substring(0, 10);

        // Mapa v7 ID → ID real (para persistir cambios: edición de corredor en v7)
        const corRealById: Record<string, string> = {};
        corFiltrados.forEach((c, i) => { corRealById[`c${i + 1}`] = c.id; });
        // Lo mismo para comerciales: el comercial elegido en la ficha se guarda en la carpeta
        const comRealById: Record<string, string> = {};
        comercialesR.forEach((c, i) => { comRealById[`m${i + 1}`] = c.id; });

        const RAW = carpetasR.map(c => {
            const corId = c.corredor_id ? (corIdMap.get(c.corredor_id) || null) : null;
            const sucFlota = (c.corredor_id && sucursalCorredor.get(c.corredor_id)) || (corId ? 'MEDIACION' : 'SIN_ASIGNAR');
            // Comercial: el guardado en la ficha manda; si no hay, uno de la sucursal del corredor
            const cmGuardado = c.comercial_id ? comIdMap.get(c.comercial_id) : undefined;
            const cmId  = cmGuardado
                        ?? (sucFlota === 'TITAN' ? DEFAULT_CM_TITAN
                        : sucFlota === 'SIN_ASIGNAR' ? DEFAULT_CM_NA
                        : DEFAULT_CM_MED);
            const estado = ESTADO_MAP[(c.estado || '').toUpperCase()] || 'EN ESTUDIO';
            const fechaEst = (c.actualizada || hoy).substring(0, 10);
            const pof = estado === 'CONTRATADA' ? 0 : Math.round(c.prima_total);
            const pem = estado === 'CONTRATADA' ? Math.round(c.prima_total) : 0;
            const vto = c.fecha_vcto || '';
            const est = [[estado, fechaEst, c.num_vehiculos, pof, pem, vto]];
            // 7º elemento: realId de carpeta para poder persistir cambios desde v7
            // 8º elemento: datos reales de la ficha (observaciones, tomador, fechas, póliza…)
            const extra = {
                obs: c.observaciones || '', tom: c.tomador || '', efecto: c.efecto || '',
                cia: c.cia_actual || '', pol: c.poliza_actual || '', per: c.periodicidad || '',
                est: (c.estado || '').toUpperCase(), mod: (c.actualizada || '').substring(0, 10), suc: sucFlota,
            };
            return [c.nombre || 'Sin nombre', c.cif || '', c.actividad || '', corId, cmId, est, c.id, extra];
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
  if (!e || e.origin !== window.location.origin || e.source !== window.parent) return;
  if (e.data && e.data.type === 'orion-theme' && (e.data.theme === 'light' || e.data.theme === 'dark')) {
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
            // Replacers como función: un dato con "$&" o "$'" no puede alterar la sustitución.
            .replace(/var COM=\[[\s\S]*?\}\);/, () => `var COM=${jsonParaScript(COM)};\nvar COR_REAL_BY_V7=${jsonParaScript(corRealById)};
var COM_REAL_BY_V7=${jsonParaScript(comRealById)};`)
            .replace(/var CN=\[[\s\S]*?\];/, () => `var CN=${jsonParaScript(COR.map(c => c.n))};`)
            .replace(/var COR=CN\.map\([\s\S]*?\}\);/, () => `var COR=${jsonParaScript(COR)};`)
            .replace(/var RAW=\[[\s\S]*?\];\r?\n/, () => `var RAW=${jsonParaScript(RAW)};\n`)
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
        console.error('[flotas-page]', err);
        return paginaError(initialTheme, [`Error interno: ${err instanceof Error ? err.message : String(err)}`]);
    }
}
