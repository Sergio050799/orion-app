import React, { useState } from "react";
import { ValidatedVehicleDTO } from "@/types/vehicle";

const headerStyle: React.CSSProperties = {
    background: 'rgba(2,6,23,0.97)',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
};

const panelStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)',
};

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

    const containerStyle: React.CSSProperties = {
        background: 'rgba(2,6,23,0.92)',
        border: '1px solid rgba(255,255,255,0.08)',
    };

    if (markdown) {
        return (
            <div className={`flex flex-col overflow-hidden shadow-xl ${className || ''}`} style={containerStyle}>
                <div className="p-4 flex justify-between items-center shrink-0" style={headerStyle}>
                    <div className="flex gap-4 items-center">
                        <div>
                            <h2 className="text-lg font-black tracking-widest" style={{ color: '#1240CC' }}>INFORME DE INSPECCIÓN</h2>
                            <div className="text-xs font-mono tracking-wider mt-1 flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.35)' }}>
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" style={{ boxShadow: '0 0 8px rgba(16,185,129,0.5)' }} />
                                VISTA DE DATOS (ZONA 3)
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {onClose && (
                            <button
                                onClick={onClose}
                                className="p-2 rounded transition-colors"
                                style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'white'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.5)'; }}
                                title="Cerrar Panel"
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-10">
                    <div className="max-w-5xl mx-auto h-full">
                        <div className="rounded-xl p-8 overflow-x-auto min-h-full" style={panelStyle}>
                            <pre className="text-sm font-mono whitespace-pre-wrap leading-relaxed" style={{ color: 'rgba(255,255,255,0.75)' }}>
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
            <div className="flex justify-between items-center py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</span>
                <span className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.85)' }}>{value !== undefined && value !== null ? value : '---'}</span>
            </div>
        );

        const sectionStyle: React.CSSProperties = {
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)',
        };

        return (
            <div className={`flex flex-col overflow-hidden shadow-xl ${className || ''}`} style={containerStyle}>
                <div className="p-4 flex justify-between items-center shrink-0" style={headerStyle}>
                    <div>
                        <h2 className="text-lg font-black tracking-widest text-emerald-400">VEHÍCULO VALIDADO</h2>
                        <div className="text-xs font-mono tracking-wider mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>{data.plate || '---'}</div>
                    </div>
                    <div className="flex gap-2">
                        {onApprove && (
                            <button
                                onClick={onApprove}
                                className="px-4 py-2 font-bold rounded text-xs transition-colors"
                                style={{ background: '#10B981', color: '#020617' }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#34D399'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#10B981'; }}
                            >
                                CONFIRMAR
                            </button>
                        )}
                        {onClose && (
                            <button
                                onClick={onClose}
                                className="p-2 rounded transition-colors"
                                style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'white'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.5)'; }}
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                        )}
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="p-5 rounded-xl" style={sectionStyle}>
                            <h3 className="text-xs font-black uppercase tracking-widest pb-2 mb-3" style={{ color: 'rgba(255,255,255,0.5)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>Identificación</h3>
                            <TechGridRow label="Matrícula" value={data.plate} />
                            <TechGridRow label="Bastidor (E)" value={data.vin.value} />
                            <TechGridRow label="Marca (D.1)" value={data.make.value} />
                            <TechGridRow label="Modelo (D.3)" value={data.model.value} />
                        </div>
                        <div className="p-5 rounded-xl" style={sectionStyle}>
                            <h3 className="text-xs font-black uppercase tracking-widest pb-2 mb-3" style={{ color: 'rgba(255,255,255,0.5)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>Clasificación</h3>
                            <TechGridRow label="Categoría" value={data.category.value} />
                            <TechGridRow label="Carrocería" value={data.bodyType.value} />
                        </div>
                        <div className="p-5 rounded-xl" style={sectionStyle}>
                            <h3 className="text-xs font-black uppercase tracking-widest pb-2 mb-3" style={{ color: 'rgba(255,255,255,0.5)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>Motor y Masas</h3>
                            <TechGridRow label="Combustible" value={data.fuel.value} />
                            <TechGridRow label="Potencia (CV)" value={data.powerCv} />
                        </div>
                        <div className="p-5 rounded-xl" style={sectionStyle}>
                            <h3 className="text-xs font-black uppercase tracking-widest pb-2 mb-3" style={{ color: 'rgba(255,255,255,0.5)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>Equipamiento</h3>
                            <TechGridRow label="Asientos (S.1)" value={data.seats.value} />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return null;
}
