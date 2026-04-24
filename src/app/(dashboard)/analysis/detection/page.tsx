"use client";

import VehicleManualDetectionForm from "@/components/saas/VehicleManualDetectionForm";

export default function VehicleDetectionPage() {
    return (
        <div className="h-full flex flex-col pt-2 animate-in fade-in duration-500 min-h-0">
            <div className="flex items-center gap-3 mb-6 shrink-0">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16h16v-8" />
                        <polyline points="14 2 14 8 20 8" />
                        <path d="m16 13 5.5 5.5" />
                        <circle cx="14.5" cy="11.5" r="2.5" />
                    </svg>
                </div>
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-white">Detección de Vehículo (Buscador)</h1>
                    <p className="text-sm font-medium mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                        Ingesta de parámetros de Inspección en BBDD unificada
                    </p>
                </div>
            </div>

            <div className="glass-card flex-1 min-h-0 mb-8 rounded-2xl relative overflow-hidden flex flex-col">
                <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.4), transparent)' }} />
                <div className="flex-1 flex flex-col min-h-0 p-6">
                    <VehicleManualDetectionForm />
                </div>
            </div>
        </div>
    );
}
