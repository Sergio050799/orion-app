"use client";

/**
 * V5 /emission — tab "Flotas" en el nav. Portfolio completo con la nueva pantalla v7 del jefe.
 *
 * El HTML v7 es autocontenido; se renderiza en iframe. Sincronizamos el tema con el parent:
 *   - al montar, leemos el tema actual de `document.documentElement.dataset.theme`
 *   - cuando el parent cambia (MutationObserver), avisamos al iframe via postMessage
 *   - el HTML v7 escucha `message` y cambia su propio `data-theme`
 */
import { useEffect, useRef, useState } from 'react';

/**
 * V5 /emission — tab Flotas (iframe con HTML v7 del jefe).
 *
 * Sincronización de tema: el script v7 inyecta sus estilos desde su propio `<style>` y
 * no re-pinta solo con cambiar `data-theme` en caliente. Lo más fiable es recargar el
 * iframe con `?theme=X` cuando el parent cambia el tema. Parpadea ~300ms pero sale limpio.
 *
 * Nota hydration: el `theme` se calcula desde document.documentElement en cliente solo.
 * Antes causaba hydration mismatch porque el SSR renderizaba 'dark' y el cliente 'light'.
 * Lo resolvemos con mounted-flag: hasta mount no se renderiza el iframe.
 */
export default function EmissionPage() {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [mounted, setMounted] = useState(false);
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');

    useEffect(() => {
        // Primer tema real al mount
        setTheme((document.documentElement.dataset.theme as 'light') || 'dark');
        setMounted(true);
        // Observar cambios en el parent para recargar el iframe
        const obs = new MutationObserver(() => {
            const next = (document.documentElement.dataset.theme as 'light') || 'dark';
            setTheme(prev => prev === next ? prev : next);
        });
        obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        return () => obs.disconnect();
    }, []);

    if (!mounted) {
        return <div style={{ position: 'fixed', inset: 0, background: '#0d111b' }} />;
    }

    return (
        <iframe
            ref={iframeRef}
            key={theme}
            src={`/api/v5/flotas-page?theme=${theme}`}
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
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals"
        />
    );
}
