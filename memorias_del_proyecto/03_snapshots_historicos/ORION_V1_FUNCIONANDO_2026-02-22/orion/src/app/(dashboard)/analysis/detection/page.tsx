"use client";

import { useState } from "react";
import VehicleReportPanel from "@/components/saas/report/VehicleReportPanel";
import { ValidatedVehicleDTO, FuelType } from "@/types/vehicle";

export default function VehicleDetectionPage() {
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<ValidatedVehicleDTO | null>(null);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        // Simulate detection logic returning a full DTO
        setTimeout(() => {
            const mockResult: ValidatedVehicleDTO = {
                id: "det-123",
                plate: "1234 BBB",
                vin: { value: "WVWZZZAUZEW123456", confidence: 0.98, source: "derived" },
                category: { value: "M1", confidence: 0.95, source: "derived" },
                vehicleCategory: { value: "TURISMO", confidence: 0.95, source: "derived" },
                bodyType: { value: "AB BERLINA CON PORTÓN", confidence: 0.90, source: "derived" },
                make: { value: "VOLKSWAGEN", confidence: 0.99, source: "derived" },
                model: { value: "GOLF", confidence: 0.99, source: "derived" },
                variant: { value: "1.6 TDI 115CV ADVANCE", confidence: 0.85, source: "derived" },
                fuel: { value: FuelType.Diesel, confidence: 0.99, source: "derived" },
                displacement: { value: 1598, confidence: 0.99, source: "derived" },
                powerKw: { value: 85, confidence: 0.99, source: "derived" },
                powerCv: 115,
                emissionLevel: { value: "EURO 6W", confidence: 0.92, source: "derived" },
                engineCode: { value: "DGTE", confidence: 0.96, source: "derived" },
                co2: { value: 106, confidence: 0.90, source: "derived" },
                mma: { value: 1840, confidence: 0.95, source: "derived" },
                mom: { value: 1355, confidence: 0.95, source: "derived" },
                mtma_mma_axle: { value: 1020, confidence: 0.95, source: "derived" },
                mtma_mma_total: { value: 1840, confidence: 0.95, source: "derived" },
                length: { value: 4258, confidence: 0.95, source: "derived" },
                width: { value: 1790, confidence: 0.95, source: "derived" },
                height: { value: 1492, confidence: 0.95, source: "derived" },
                seats: { value: 5, confidence: 0.99, source: "derived" },
                tires: { value: "205/55 R16 91V", confidence: 0.90, source: "derived" },
                registrationDate: { value: "2018-03-15", confidence: 0.99, source: "derived" },
                processingStatus: "completed",
                globalConfidence: 0.94,
                alerts: [],
                humanSummary: "Vehículo identificado como Volkswagen Golf VII fase 2 (2017-2020) con motorización 1.6 TDI EURO 6. Coincidencia alta con bastidor y código de motor aportados."
            };
            setResult(mockResult);
            setIsLoading(false);
        }, 1500);
    };

    return (
        <div className="h-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Left: Input Form */}
            <div className="lg:col-span-4 space-y-6 flex flex-col h-full">
                <div className="glass-panel p-6 rounded-2xl flex-1 flex flex-col bg-slate-900/40">
                    <h2 className="text-sm font-black text-white mb-6 uppercase tracking-widest flex items-center gap-2">
                        <div className="w-1 h-4 bg-[#3CE0FF] rounded-full" />
                        Parámetros de Detección
                    </h2>
                    <form onSubmit={handleSubmit} className="space-y-5 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Identificador Principal</label>
                            <input
                                className="w-full input-field rounded-xl px-4 py-3 font-mono tracking-widest text-white uppercase placeholder:text-slate-700 bg-slate-950/50 border border-white/10 focus:border-[#3CE0FF] transition-colors"
                                placeholder="MATRÍCULA / BASTIDOR"
                                defaultValue="1234 BBB"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Cod. Motor (P.5)</label>
                                <input className="w-full input-field rounded-xl px-4 py-3 text-xs font-bold text-white bg-slate-950/50 border border-white/10 focus:border-[#3CE0FF] transition-colors" placeholder="Ej. CXXB" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Cilindrada (cm³)</label>
                                <input className="w-full input-field rounded-xl px-4 py-3 text-xs font-bold text-white bg-slate-950/50 border border-white/10 focus:border-[#3CE0FF] transition-colors" placeholder="Ej. 1598" />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Marca / Modelo (Opcional)</label>
                            <input className="w-full input-field rounded-xl px-4 py-3 text-xs font-bold text-white bg-slate-950/50 border border-white/10 focus:border-[#3CE0FF] transition-colors" placeholder="Ej. Volkswagen Golf" />
                        </div>

                        <div className="pt-4 border-t border-white/5">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1 mb-2 block">Datos Adicionales</label>
                            <div className="grid grid-cols-2 gap-4">
                                <input className="w-full input-field rounded-xl px-4 py-3 text-xs font-bold text-white bg-slate-950/50 border border-white/10 focus:border-[#3CE0FF]" placeholder="Potencia (CV)" />
                                <input className="w-full input-field rounded-xl px-4 py-3 text-xs font-bold text-white bg-slate-950/50 border border-white/10 focus:border-[#3CE0FF]" placeholder="Año Fab." />
                            </div>
                        </div>

                    </form>

                    <button
                        onClick={handleSubmit}
                        disabled={isLoading}
                        className="w-full btn-primary py-4 flex items-center justify-center gap-3 mt-6 shadow-[0_0_20px_rgba(60,224,255,0.15)] hover:shadow-[0_0_30px_rgba(60,224,255,0.3)] transition-all"
                    >
                        {isLoading ? (
                            <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                        )}
                        <span className="uppercase tracking-widest text-xs font-black">Iniciar Detección</span>
                    </button>

                </div>

                <div className="p-4 rounded-xl border border-[#3CE0FF]/20 bg-[#3CE0FF]/5 flex gap-3 items-start backdrop-blur-sm">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3CE0FF" strokeWidth="2" className="mt-0.5 shrink-0"><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0z" /></svg>
                    <p className="text-[10px] text-slate-300 leading-relaxed font-medium">
                        El sistema utiliza algoritmos de <strong className="text-white">aproximación difusa</strong> contra la base de datos de Industria. Introduzca al menos 2 parámetros técnicos para aumentar la precisión por encima del 90%.
                    </p>
                </div>
            </div>

            {/* Right: Output Summary */}
            <div className="lg:col-span-8 h-full flex flex-col">
                {result ? (
                    <div className="h-full animate-in zoom-in-95 fade-in duration-300 flex flex-col">
                        <VehicleReportPanel
                            data={result}
                            className="h-full rounded-2xl overflow-hidden border border-white/10 shadow-2xl ring-1 ring-white/5"
                            onUpdate={setResult}
                            onApprove={() => alert("Identidad Confirmada")}
                        />
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center glass-panel rounded-2xl border-dashed border-white/10 opacity-40 bg-slate-900/20">
                        <div className="w-20 h-20 rounded-full bg-white/[0.02] flex items-center justify-center mb-6 shadow-inner ring-1 ring-white/5">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-slate-600"><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0z" /></svg>
                        </div>
                        <h3 className="text-sm font-black text-white uppercase tracking-[0.2em] mb-2">Esperando Datos</h3>
                        <p className="text-xs text-slate-500 font-medium max-w-xs text-center leading-relaxed">
                            Configure los parámetros de búsqueda en el panel lateral para iniciar el proceso de detección.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
