'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { PrimasConfig } from './primas';

const PrimasContext = createContext<PrimasConfig | null>(null);

export function PrimasProvider({ children }: { children: React.ReactNode }) {
    const [config, setConfig] = useState<PrimasConfig | null>(null);

    useEffect(() => {
        fetch('/api/primas/config')
            .then(r => r.json())
            .then((d: PrimasConfig) => {
                // Solo activar si hay datos reales (no vacíos)
                if (Object.keys(d.primas).length > 0) setConfig(d);
            })
            .catch(() => {}); // silencioso — calcularPrima usa fallback hardcodeado
    }, []);

    return (
        <PrimasContext.Provider value={config}>
            {children}
        </PrimasContext.Provider>
    );
}

export function usePrimasConfig(): PrimasConfig | null {
    return useContext(PrimasContext);
}
