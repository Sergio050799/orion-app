"use client";

/**
 * V5 /emission — tab "Flotas" en el nav. Portfolio completo con la nueva pantalla v7 del jefe.
 *
 * El HTML v7 es autocontenido; se renderiza en iframe. Sincronizamos el tema con el parent:
 *   - al montar, leemos el tema actual de `document.documentElement.dataset.theme`
 *     y lo pasamos como `?theme=X` (tema inicial, sin parpadeo)
 *   - cuando el parent cambia (MutationObserver), avisamos al iframe via postMessage
 *   - el HTML v7 escucha `message` (listener inyectado por /api/v5/flotas-page, con
 *     comprobación de origin) y cambia su propio `data-theme`. Todo el CSS del v7 cuelga
 *     de variables bajo `[data-theme]`, así que repinta sin recargar.
 *
 * NO se remonta el iframe al cambiar de tema: remontarlo perdía scroll, filtros y la
 * edición en curso del drawer.
 *
 * Nota hydration: el tema se calcula desde document.documentElement solo en cliente.
 * Antes causaba hydration mismatch porque el SSR renderizaba 'dark' y el cliente 'light'.
 * Hasta el mount no se renderiza el iframe.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

type Theme = 'dark' | 'light';
const leerTema = (): Theme => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

export default function EmissionPage() {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    // Tema con el que se cargó el iframe: fija el `src` para que no cambie (ni recargue) después.
    const [srcTheme, setSrcTheme] = useState<Theme | null>(null);
    const [theme, setTheme] = useState<Theme>('dark');

    useEffect(() => {
        // Primer tema real al mount
        const inicial = leerTema();
        setTheme(inicial);
        setSrcTheme(inicial);
        // Observar cambios de tema en el parent
        const obs = new MutationObserver(() => {
            const next = leerTema();
            setTheme(prev => prev === next ? prev : next);
        });
        obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        return () => obs.disconnect();
    }, []);

    const enviarTema = useCallback((t: Theme) => {
        // Mismo origen (el iframe carga /api/v5/flotas-page): targetOrigin explícito, nunca '*'.
        iframeRef.current?.contentWindow?.postMessage({ type: 'orion-theme', theme: t }, window.location.origin);
    }, []);

    // Cambio de tema en caliente: postMessage, sin remontar el iframe.
    useEffect(() => {
        if (srcTheme !== null) enviarTema(theme);
    }, [theme, srcTheme, enviarTema]);

    if (srcTheme === null) {
        return <div style={{ position: 'fixed', inset: 0, background: '#0d111b' }} />;
    }

    return (
        <iframe
            ref={iframeRef}
            src={`/api/v5/flotas-page?theme=${srcTheme}`}
            // Por si el tema cambió mientras el iframe cargaba (o tras un "Reintentar" interno).
            onLoad={() => enviarTema(theme)}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                border: 0,
                margin: 0,
                padding: 0,
                background: theme === 'light' ? '#ffffff' : '#0d111b',
            }}
            title="ORION Flotas v7"
            // allow-same-origin: imprescindible (fetch con cookie de sesión a /api/flotas/carpetas y
            //   comprobación de origin del postMessage; sin él el origin sería 'null').
            // allow-forms: submit del formulario "Nueva flota". allow-downloads: exportar CSV.
            // allow-popups: enlace mailto: de "Enviar por email".
            // allow-modals eliminado: el v7 no usa alert/confirm/prompt/print (usa sus propios modales).
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
        />
    );
}
