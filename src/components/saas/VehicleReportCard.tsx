import React, { useState } from 'react';

export interface ReportCardModel {
    plate?: string | null;
    E?: string | null;
    S1?: string | null;
    P1?: string | null;
    P2?: string | null;
    powerCv?: string | null;
    F2?: string | null;
    F4?: string | null;
    F5?: string | null;
    F6?: string | null;
    J?: string | null;
    J1?: string | null;
    J2?: string | null;
    CL?: string | null;

    makeModel?: string | null;
    fuel?: string | null;
    fechaEmision?: string | null;
    fechaPrimeraMatriculacion?: string | null;
    fechaMatriculacionEstimada?: string | null;

    vehicleClassLabel?: string | null;
    vehicleClassCode?: string | null;
    ueCategoryLabel?: string | null;
    ueCategoryCode?: string | null;
    bodyLabel?: string | null;
    bodyCode?: string | null;
    claseLabel?: string | null;
    claseCode?: string | null;

    fullCategoria?: string | null;
    fullCarroceria?: string | null;
    fullClase?: string | null;
    decodedCL?: any | null;
    resumen?: string | null;

    P21?: string | null;
    cvTermico?: string | null;
    cvTotal?: string | null;
    esHibrido?: boolean | null;

    catalogoVersion?: string | null;
    catalogoIdVeh?: string | null;
    catalogoScore?: number | null;

    usedModel?: string | null;
    ocrQuality?: { quality: string } | null;
}

interface VehicleReportCardProps {
    ui: ReportCardModel | null;
    isLoading?: boolean;
}

const cardStyle: React.CSSProperties = {
    background: 'rgba(2,6,23,0.85)',
    border: '1px solid rgba(255,255,255,0.08)',
    backdropFilter: 'blur(24px)',
};

const sectionDivider: React.CSSProperties = {
    borderBottom: '1px solid rgba(255,255,255,0.06)',
};

export default function VehicleReportCard({ ui, isLoading }: VehicleReportCardProps) {
    const [showDecoded, setShowDecoded] = useState(false);
    const [copiedBtn, setCopiedBtn] = useState<'plate' | 'vin' | null>(null);

    if (isLoading) {
        return (
            <div className="flex-[0.8] xl:flex-[0.6] min-w-[400px] rounded-2xl flex flex-col p-6 overflow-hidden relative" style={cardStyle}>
                <div className="absolute top-0 left-0 right-0 h-px animate-pulse" style={{ background: 'linear-gradient(90deg, transparent, #6366f1, transparent)' }} />
                <div className="animate-pulse space-y-6 flex-1 mt-4">
                    <div className="h-12 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }} />
                    <div className="grid grid-cols-3 gap-4">
                        {[1,2,3].map(i => <div key={i} className="h-8 rounded" style={{ background: 'rgba(255,255,255,0.05)' }} />)}
                    </div>
                </div>
            </div>
        );
    }

    if (!ui) {
        return (
            <div className="flex-[0.8] xl:flex-[0.6] min-w-[400px] rounded-2xl flex items-center justify-center p-8 text-center text-sm" style={{ ...cardStyle, color: 'rgba(255,255,255,0.25)' }}>
                <div className="max-w-[200px]">
                    <svg className="w-12 h-12 mx-auto mb-4 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                    </svg>
                    A la espera de datos para mostrar el informe.
                </div>
            </div>
        );
    }

    const { ocrQuality, usedModel } = ui;

    const handleCopy = (text: string, type: 'plate' | 'vin') => {
        navigator.clipboard.writeText(text);
        setCopiedBtn(type);
        setTimeout(() => setCopiedBtn(null), 2000);
    };

    const CopyIcon = ({ type }: { type: 'plate' | 'vin' }) => copiedBtn === type
        ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
        : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'rgba(255,255,255,0.3)' }} className="hover:text-white transition-colors"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>;

    const DataRow = ({ label, value }: { label: string, value?: string | number | null }) => {
        if (!value) return null;
        return (
            <div className="flex flex-col mb-3">
                <span className="text-[10px] font-black uppercase tracking-widest leading-none mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>{label}</span>
                <span className="text-sm font-semibold text-white/80 line-clamp-1" title={String(value)}>{value}</span>
            </div>
        );
    };

    return (
        <div className="flex-1 w-full min-w-[400px] rounded-2xl flex flex-col overflow-hidden relative animate-in slide-in-from-right-8 duration-300" style={cardStyle}>
            <div className="flex-1 overflow-y-auto custom-scrollbar">

                {/* 1. HEADER: Plate + Badges */}
                <div className="px-6 py-4 shrink-0 flex flex-col gap-4" style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <h2 className="font-mono text-2xl font-black text-white tracking-widest uppercase">
                                {ui.plate || 'S/M'}
                            </h2>
                            {ui.plate && (
                                <button onClick={() => handleCopy(ui.plate!, 'plate')} title="Copiar matrícula">
                                    <CopyIcon type="plate" />
                                </button>
                            )}
                        </div>
                        {ocrQuality && (
                            <div className="flex gap-2">
                                <span className="text-[9px] px-2 py-1 rounded font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.07)' }}>
                                    {usedModel === 'prebuilt-layout' ? 'LAYOUT' : 'READ'}
                                </span>
                                <span className="text-[9px] px-2 py-1 rounded font-bold uppercase tracking-widest" style={ocrQuality.quality === 'high' ? { color: '#10B981', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' } : { color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.05)' }}>
                                    {ocrQuality.quality}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Identidad del vehículo — anclada cuando hay selección del catálogo */}
                    {ui.catalogoVersion && (
                        <div
                            className="px-4 py-2 rounded-lg flex items-start gap-3"
                            style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}
                        >
                            <div className="w-1 self-stretch rounded-full shrink-0" style={{ background: '#6366f1' }} />
                            <div className="flex flex-col min-w-0">
                                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(99,102,241,0.7)' }}>
                                    Versión catálogo confirmada
                                </span>
                                <span className="text-sm font-black text-white truncate">{ui.makeModel}</span>
                                <span className="text-xs font-semibold truncate" style={{ color: 'rgba(255,255,255,0.6)' }}>
                                    {ui.catalogoVersion}
                                </span>
                                {ui.catalogoIdVeh && (
                                    <span className="text-[9px] font-mono mt-0.5" style={{ color: 'rgba(99,102,241,0.5)' }}>
                                        ID: {ui.catalogoIdVeh} · {ui.catalogoScore}% coincidencia
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Header Grid: Dates & Category */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        {ui.ueCategoryCode && (
                            <div className="flex flex-col">
                                <span className="text-[9px] font-bold uppercase tracking-wider mb-0.5 flex gap-1.5 items-center" style={{ color: 'rgba(255,255,255,0.3)' }}>
                                    Categoría UE
                                    {ui.ueCategoryLabel?.toUpperCase() === ui.ueCategoryCode?.toUpperCase() && (
                                        <span className="text-[7px] px-1 py-0.5 rounded leading-none" style={{ color: '#F59E0B', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>NO DICT</span>
                                    )}
                                </span>
                                <span className="text-xs font-semibold text-white/75 truncate" title={ui.ueCategoryLabel || ui.ueCategoryCode}>{ui.ueCategoryLabel}</span>
                            </div>
                        )}
                        {ui.fechaEmision && (
                            <div className="flex flex-col">
                                <span className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>Dcto. Emisión</span>
                                <span className="text-xs font-semibold text-white/75 truncate">{ui.fechaEmision}</span>
                            </div>
                        )}
                        {ui.fechaMatriculacionEstimada && (
                            <div className="flex flex-col">
                                <span className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>Mat. Estimada (ORIÓN)</span>
                                <span className="text-xs font-bold truncate" style={{ color: '#6366f1' }}>{ui.fechaMatriculacionEstimada}</span>
                            </div>
                        )}
                        {ui.fechaPrimeraMatriculacion && (!ui.fechaMatriculacionEstimada || ui.usedModel === 'manual-entry') && (
                            <div className="flex flex-col">
                                <span className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                                    {ui.usedModel === 'manual-entry' ? '1ª Mat. (Real)' : '1ª Mat. (B)'}
                                </span>
                                <span className="text-xs font-semibold text-white/75 truncate">{ui.fechaPrimeraMatriculacion}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* 2. FICHA RÁPIDA */}
                <div className="p-6 flex flex-col gap-4 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.01)' }}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {ui.vehicleClassCode && (
                            <div className="flex flex-col px-4 py-3 rounded-xl relative overflow-hidden" style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)' }}>
                                <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-r-full" style={{ background: '#6366f1' }} />
                                <span className="text-[10px] font-bold uppercase tracking-widest mb-1 flex items-center justify-between" style={{ color: '#6366f1' }}>
                                    <span className="flex items-center gap-1.5">
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                                        Clase Vehículo
                                    </span>
                                    {!ui.decodedCL && <span className="text-[8px] px-1.5 py-0.5 rounded leading-none" style={{ color: '#F59E0B', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>NO DICT</span>}
                                </span>
                                <span className="text-[15px] font-black text-white leading-tight" title={ui.vehicleClassLabel || ui.vehicleClassCode}>{ui.vehicleClassLabel}</span>
                            </div>
                        )}
                        {ui.makeModel && (
                            <div className="flex flex-col px-4 py-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                <span className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Marca / Modelo</span>
                                <span className="text-[15px] font-black text-white line-clamp-2 leading-tight" title={ui.makeModel}>{ui.makeModel}</span>
                            </div>
                        )}
                        {ui.bodyCode && (
                            <div className="flex flex-col px-4 py-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                <span className="text-[10px] font-bold uppercase tracking-widest mb-1 flex justify-between items-center" style={{ color: 'rgba(255,255,255,0.3)' }}>
                                    Carrocería
                                    {ui.bodyLabel?.toUpperCase() === ui.bodyCode?.toUpperCase() && (
                                        <span className="text-[8px] px-1.5 py-0.5 rounded leading-none" style={{ color: '#F59E0B', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>NO DICT</span>
                                    )}
                                </span>
                                <span className="text-[13px] font-bold text-white/80 line-clamp-2 leading-tight" title={ui.bodyLabel || ui.bodyCode}>{ui.bodyLabel}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Bastidor */}
                <div className="px-6 py-2 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.15)' }}>
                    <span className="text-[9px] font-bold uppercase tracking-wider flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /></svg>
                        Número de Bastidor (E)
                    </span>
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-mono font-bold text-white/75 truncate">{ui.E || '—'}</span>
                        {ui.E && <button onClick={() => handleCopy(ui.E!, 'vin')}><CopyIcon type="vin" /></button>}
                    </div>
                </div>

                {/* 3. DATOS TÉCNICOS */}
                <div className="p-6 pb-2">
                    <div className="text-[10px] font-black uppercase tracking-widest mb-4 pb-2" style={{ color: 'rgba(255,255,255,0.3)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        Especificaciones Técnicas
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 lg:gap-6">
                        <div>
                            {ui.esHibrido ? (
                                <>
                                    {ui.P2 && <DataRow label="Motor térmico" value={`${ui.P2} kW${ui.cvTermico ? ` (${ui.cvTermico} CV)` : ''}`} />}
                                    {ui.P21 && <DataRow label="Motor eléctrico" value={`${ui.P21} kW`} />}
                                    {ui.cvTotal && <DataRow label="Total combinado" value={`${ui.cvTotal} CV`} />}
                                </>
                            ) : (
                                <>
                                    {ui.P2 && <DataRow label="Potencia" value={`${ui.P2} kW`} />}
                                    {ui.powerCv && <DataRow label="Caballos" value={`${ui.powerCv} CV`} />}
                                </>
                            )}
                            {ui.P1 && <DataRow label="Cilindrada" value={`${ui.P1} cc`} />}
                            <DataRow label="Propulsión" value={ui.fuel} />
                        </div>
                        <div>
                            {ui.F2 && <DataRow label="Masa Max (MMA)" value={`${ui.F2} kg`} />}
                            {ui.F6 && <DataRow label="Longitud" value={`${ui.F6} mm`} />}
                            {ui.F5 && <DataRow label="Anchura" value={`${ui.F5} mm`} />}
                            {ui.F4 && <DataRow label="Altura" value={`${ui.F4} mm`} />}
                        </div>
                        <div>
                            {ui.S1 && <DataRow label="Plazas (S.1)" value={`${ui.S1} plazas`} />}
                        </div>
                    </div>
                </div>

                {/* 4. DECODIFICACIÓN (collapsible) */}
                {(ui.vehicleClassCode || ui.ueCategoryCode || ui.bodyCode || ui.claseCode) && (
                    <div className="px-6 py-2">
                        <div className="rounded-xl overflow-hidden transition-all duration-300" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
                            <button
                                onClick={() => setShowDecoded(!showDecoded)}
                                className="w-full px-4 py-3 flex items-center justify-between text-xs font-bold transition-colors"
                                style={{ color: 'rgba(255,255,255,0.5)' }}
                            >
                                <span className="flex items-center gap-2">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'rgba(255,255,255,0.3)' }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                                    Ver decodificación oficial de Códigos
                                </span>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${showDecoded ? 'rotate-180' : ''}`} style={{ color: 'rgba(255,255,255,0.3)' }}><polyline points="6 9 12 15 18 9" /></svg>
                            </button>
                            {showDecoded && (
                                <div className="px-4 pb-4 pt-1 space-y-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                    {ui.vehicleClassCode && (
                                        <div>
                                            <div className="text-[10px] font-bold uppercase" style={{ color: '#6366f1' }}>Clasificación Vehículo (C.L: {ui.vehicleClassCode})</div>
                                            {ui.decodedCL ? (
                                                <div className="text-xs mt-1 leading-relaxed space-y-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
                                                    <div><span className="font-semibold text-white/70">Construcción:</span> {ui.decodedCL.construccion.code} — {ui.decodedCL.construccion.label}</div>
                                                    <div><span className="font-semibold text-white/70">Uso:</span> {ui.decodedCL.uso.code} — {ui.decodedCL.uso.label}</div>
                                                </div>
                                            ) : (
                                                <div className="text-xs mt-0.5 leading-relaxed" style={{ color: 'rgba(255,255,255,0.4)' }}>{ui.vehicleClassCode} (Sin decodificar)</div>
                                            )}
                                        </div>
                                    )}
                                    {ui.ueCategoryCode && (
                                        <div>
                                            <div className="text-[10px] font-bold uppercase" style={{ color: '#6366f1' }}>Categoría UE (J: {ui.ueCategoryCode})</div>
                                            <div className="text-xs mt-0.5 leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>{ui.fullCategoria || ui.ueCategoryCode}</div>
                                        </div>
                                    )}
                                    {ui.bodyCode && (
                                        <div>
                                            <div className="text-[10px] font-bold uppercase" style={{ color: '#6366f1' }}>Carrocería UE (J.1: {ui.bodyCode})</div>
                                            <div className="text-xs mt-0.5 leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>{ui.fullCarroceria || ui.bodyCode}</div>
                                        </div>
                                    )}
                                    {ui.claseCode && (
                                        <div>
                                            <div className="text-[10px] font-bold uppercase" style={{ color: '#6366f1' }}>Clase Específica (J.2: {ui.claseCode})</div>
                                            <div className="text-xs mt-0.5 leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>{ui.fullClase || ui.claseCode}</div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* 5. RESUMEN OPERATIVO */}
                <div className="p-6">
                    <div className="text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-2 pt-4" style={{ color: 'rgba(255,255,255,0.3)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                            <polyline points="10 9 9 9 8 9" />
                        </svg>
                        Resumen de Negocio
                    </div>
                    <div
                        className="p-4 rounded-xl text-sm font-semibold leading-relaxed whitespace-pre-wrap"
                        style={{ background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.12)', color: 'rgba(255,255,255,0.7)' }}
                    >
                        {ui.resumen}
                    </div>
                </div>

            </div>
        </div>
    );
}
