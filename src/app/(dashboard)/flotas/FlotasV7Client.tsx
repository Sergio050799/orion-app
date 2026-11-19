"use client";

/**
 * Wrapper que renderiza el HTML v7 del jefe tal cual (diseño exacto)
 * pero sustituyendo los datos mock por los reales de la BD V5.
 *
 * El HTML v7 se parsea a styleHtml / bodyHtml / scriptCode en el Server Component padre
 * (page.tsx) y llegan aquí como props. El script v7 depende de que el DOM esté montado
 * antes de ejecutarse; useEffect garantiza ese orden.
 */
import { useEffect, useRef, useState } from 'react';

interface Props {
    styleHtml: string;
    bodyHtml: string;
    scriptCode: string;
}

interface RawData {
    raw: unknown[][];
    cor: Array<{ id: string; n: string; s: string; code: string; cif: string; mail: string }>;
    com: Array<{ id: string; n: string; s: string }>;
}

export default function FlotasV7Client({ styleHtml, bodyHtml, scriptCode }: Props) {
    const ref = useRef<HTMLDivElement>(null);
    const [error, setError] = useState<string | null>(null);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                // 1) Cargar datos reales V5 en formato RAW v7
                const res = await fetch('/api/v5/flotas-raw');
                const data = (await res.json()) as RawData | { error: string };
                if ('error' in data) throw new Error(data.error);
                if (cancelled) return;

                // 2) Serializar para inyectar en el script v7
                const RAW_JSON = JSON.stringify(data.raw);
                const COR_JSON = JSON.stringify(data.cor);
                const COM_JSON = JSON.stringify(data.com);

                // 3) Sustituir el bloque de datos mock del script v7 por los reales.
                //    El script v7 define:  var COM=[...]; var CN=[...]; var COR=CN.map(...); var RAW=[...];
                //    Los reemplazamos por asignaciones directas sin tocar el resto.
                let modified = scriptCode
                    .replace(/var COM=\[[\s\S]*?\}\);/, `var COM=${COM_JSON};`)
                    .replace(/var CN=\[[\s\S]*?\];/, `var CN=${JSON.stringify(data.cor.map(c => c.n))};`)
                    .replace(/var COR=CN\.map\([\s\S]*?\}\);/, `var COR=${COR_JSON};`)
                    .replace(/var RAW=\[[\s\S]*?\];\n/, `var RAW=${RAW_JSON};\n`);

                // Hoy real en vez del TODAY fijo del prototipo
                const hoy = new Date();
                modified = modified.replace(
                    /var TODAY=new Date\(\d+,\d+,\d+\),TODAY_ISO='[^']+';/,
                    `var TODAY=new Date(${hoy.getFullYear()},${hoy.getMonth()},${hoy.getDate()}),TODAY_ISO='${hoy.toISOString().slice(0, 10)}';`,
                );

                // DEBUG 19/11: confirmar reemplazos antes de ejecutar
                console.log('[V7] RAW reemplazado?', modified.includes(`var RAW=[["`) || modified.includes('var RAW=['));
                console.log('[V7] RAW length chars:', RAW_JSON.length);
                console.log('[V7] COM reemplazado?', modified.includes(`var COM=[{`));
                console.log('[V7] CN reemplazado?', modified.includes(`var CN=["`));
                console.log('[V7] COR reemplazado?', modified.includes(`var COR=[{`));

                // 4) Ejecutar el script con try/catch global para capturar errores silenciosos
                const wrapped = `try { ${modified} } catch (__e) { console.error('[V7 script crash]', __e && __e.message, __e && __e.stack && __e.stack.substring(0, 500)); window.__v7_error = __e; }`;
                const scriptEl = document.createElement('script');
                scriptEl.setAttribute('data-orion-v7', '1');
                scriptEl.textContent = wrapped;
                document.body.appendChild(scriptEl);
                console.log('[V7] script apendizado');

                if (!cancelled) setLoaded(true);
            } catch (e) {
                if (!cancelled) setError(String(e));
            }
        })();
        return () => { cancelled = true; };
    }, [scriptCode]);

    return (
        <>
            <style dangerouslySetInnerHTML={{ __html: styleHtml }} />
            <div ref={ref} dangerouslySetInnerHTML={{ __html: bodyHtml }} />
            {!loaded && !error && (
                <div style={{ position: 'fixed', top: 60, left: '50%', transform: 'translateX(-50%)', color: 'var(--quiet)', fontSize: 13, zIndex: 10000 }}>
                    Cargando datos V5…
                </div>
            )}
            {error && (
                <div style={{ position: 'fixed', top: 60, left: '50%', transform: 'translateX(-50%)', color: 'var(--danger)', fontSize: 13, zIndex: 10000, background: 'var(--soft)', padding: 10, border: '1px solid var(--danger)', borderRadius: 6 }}>
                    Error cargando datos V5: {error}
                </div>
            )}
        </>
    );
}
