import React, { useState } from "react";
import { ValidatedVehicleDTO } from "@/types/vehicle";

export default function VehicleReportPanel({
    markdown,
    data,
    onUpdate,
    onApprove,
    onClose,
    className
}: {
    markdown?: string | null,
    data?: ValidatedVehicleDTO | null,
    onUpdate?: (d: ValidatedVehicleDTO) => void,
    onApprove?: () => void,
    onClose?: () => void,
    className?: string
}) {
    if (!markdown && !data) return null;

    if (markdown) {
        return (
            <div className={`flex flex-col bg-white text-slate-900 border border-slate-200 shadow-xl overflow-hidden ${className || ''}`}>
                <div className="bg-slate-900 text-white p-4 flex justify-between items-center shadow-md relative z-10 shrink-0">
                    <div className="flex gap-4 items-center">
                        <div>
                            <h2 className="text-lg font-black tracking-widest text-[#3CE0FF]">INFORME DE INSPECCIÓN</h2>
                            <div className="text-xs text-slate-400 font-mono tracking-wider mt-1 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                VISTA DE DATOS (ZONA 3)
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {onClose && (
                            <button onClick={onClose} className="p-2 bg-slate-800 hover:bg-slate-700 rounded transition-colors text-slate-300 hover:text-white" title="Cerrar Panel">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-10 bg-white">
                    <div className="max-w-5xl mx-auto h-full">
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 shadow-sm overflow-x-auto min-h-full">
                            <pre className="text-sm text-slate-800 font-mono whitespace-pre-wrap leading-relaxed">
                                {markdown}
                            </pre>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (data) {
        const TechGridRow = ({ label, value }: { label: string, value?: string | number | null }) => (
            <div className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
                <span className="text-xs font-semibold text-slate-500">{label}</span>
                <span className="text-sm font-bold text-slate-900">{value !== undefined && value !== null ? value : '---'}</span>
            </div>
        );

        return (
            <div className={`flex flex-col bg-white text-slate-900 border border-slate-200 shadow-xl overflow-hidden ${className || ''}`}>
                <div className="bg-slate-900 text-white p-4 flex justify-between items-center shadow-md relative z-10 shrink-0">
                    <div>
                        <h2 className="text-lg font-black tracking-widest text-emerald-400">VEHÍCULO VALIDADO</h2>
                        <div className="text-xs text-slate-400 font-mono tracking-wider mt-1">{data.plate || '---'}</div>
                    </div>
                    <div className="flex gap-2">
                        {onApprove && (
                            <button onClick={onApprove} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 font-bold rounded text-white text-xs transition-colors">
                                CONFIRMAR
                            </button>
                        )}
                        {onClose && (
                            <button onClick={onClose} className="p-2 bg-slate-800 hover:bg-slate-700 rounded text-white transition-colors">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                        )}
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-white">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest border-b border-slate-200 pb-2 mb-3">Identificación</h3>
                            <TechGridRow label="Matrícula" value={data.plate} />
                            <TechGridRow label="Bastidor (E)" value={data.vin.value} />
                            <TechGridRow label="Marca (D.1)" value={data.make.value} />
                            <TechGridRow label="Modelo (D.3)" value={data.model.value} />
                        </div>
                        <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest border-b border-slate-200 pb-2 mb-3">Clasificación</h3>
                            <TechGridRow label="Categoría" value={data.category.value} />
                            <TechGridRow label="Carrocería" value={data.bodyType.value} />
                        </div>
                        <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest border-b border-slate-200 pb-2 mb-3">Motor y Masas</h3>
                            <TechGridRow label="Combustible" value={data.fuel.value} />
                            <TechGridRow label="Potencia (CV)" value={data.powerCv} />
                        </div>
                        <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest border-b border-slate-200 pb-2 mb-3">Equipamiento</h3>
                            <TechGridRow label="Asientos (S.1)" value={data.seats.value} />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return null;
}
