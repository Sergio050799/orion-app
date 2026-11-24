'use client';

// Tarifa de primas en la zona de Estudio. Se lee de la base de datos (la que se edita en orion-admin)
// al entrar, cada vez que se abre una flota y cuando se pulsa «Actualizar primas».

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { PrimasConfig } from './primas';

export type EstadoTarifa = 'cargando' | 'ok' | 'error';

interface ValorTarifa {
    config: PrimasConfig | null;
    estado: EstadoTarifa;
    /** Vuelve a leer la tarifa del servidor. Devuelve la tarifa nueva, o null si no se pudo leer. */
    recargar: () => Promise<PrimasConfig | null>;
}

const PrimasContext = createContext<ValorTarifa>({ config: null, estado: 'cargando', recargar: async () => null });

export function PrimasProvider({ children }: { children: React.ReactNode }) {
    const [config, setConfig] = useState<PrimasConfig | null>(null);
    const [estado, setEstado] = useState<EstadoTarifa>('cargando');
    const enCurso = useRef<Promise<PrimasConfig | null> | null>(null);

    const recargar = useCallback((): Promise<PrimasConfig | null> => {
        if (enCurso.current) return enCurso.current;   // una sola petición a la vez
        const p = (async () => {
            try {
                const r = await fetch('/api/primas/config', { cache: 'no-store' });
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                const d = await r.json() as PrimasConfig;
                if (!d || !d.primas || Object.keys(d.primas).length === 0) throw new Error('tarifa vacía');
                const nueva: PrimasConfig = { primas: d.primas, ajustes: d.ajustes ?? {} };
                setConfig(nueva);
                setEstado('ok');
                return nueva;
            } catch {
                // Se conserva la última tarifa buena que hubiera (si la hay); sin ninguna, no se calcula.
                setEstado('error');
                return null;
            } finally {
                enCurso.current = null;
            }
        })();
        enCurso.current = p;
        return p;
    }, []);

    useEffect(() => { recargar(); }, [recargar]);

    const valor = useMemo(() => ({ config, estado, recargar }), [config, estado, recargar]);
    return <PrimasContext.Provider value={valor}>{children}</PrimasContext.Provider>;
}

/** Tarifa vigente (null mientras carga o si no se ha podido leer). */
export function usePrimasConfig(): PrimasConfig | null {
    return useContext(PrimasContext).config;
}

/** Tarifa, su estado y la función para volver a leerla. */
export function useTarifa(): ValorTarifa {
    return useContext(PrimasContext);
}
