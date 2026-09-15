import React, { useState } from 'react';
import { PermissionCirculationRecord, FieldValue } from '@/core/pipelines/permiso/permiso.types';

interface PermisoReportCardProps {
    docId?: string;
    ui: PermissionCirculationRecord | null;
    isLoading?: boolean;
}

const cardStyle: React.CSSProperties = {
    background: 'rgba(2,6,23,0.92)',
    border: '1px solid rgba(255,255,255,0.08)',
};

const panelStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)',
};

export default function PermisoReportCard({ ui: initialUi, docId, isLoading }: PermisoReportCardProps) {
    const [ui, setUi] = useState(initialUi);
    const [copiedBtn, setCopiedBtn] = useState<string | null>(null);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [overrides, setOverrides] = useState<any>({});
    const [isSaving, setIsSaving] = useState(false);

    if (isLoading) {
        return (
            <div className="w-full max-w-[1600px] mx-auto rounded-2xl flex flex-col p-6 overflow-hidden relative" style={cardStyle}>
                <div className="absolute top-0 left-0 right-0 h-px animate-pulse" style={{ background: 'linear-gradient(90deg, transparent, #1240CC, transparent)' }} />
                <div className="animate-pulse space-y-6 flex-1 mt-4">
                    <div className="h-12 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }} />
                    <div className="grid grid-cols-2 gap-4">
                        <div className="h-8 rounded" style={{ background: 'rgba(255,255,255,0.05)' }} />
                        <div className="h-8 rounded" style={{ background: 'rgba(255,255,255,0.05)' }} />
                    </div>
                </div>
            </div>
        );
    }

    if (!ui) {
        return (
            <div className="w-full max-w-[1600px] mx-auto rounded-2xl flex items-center justify-center p-8 text-center text-sm" style={{ ...cardStyle, color: 'rgba(255,255,255,0.25)' }}>
                A la espera de datos para mostrar el informe.
            </div>
        );
    }

    const handleCopy = (text: string, type: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopiedBtn(type);
        setTimeout(() => setCopiedBtn(null), 2000);
    };

    const handleSave = async () => {
        setIsSaving(true);
        const mergedUI = JSON.parse(JSON.stringify(ui));
        for (const sec of Object.keys(overrides)) {
            for (const k of Object.keys(overrides[sec])) {
                const manualVal = overrides[sec][k];
                if (!mergedUI[sec]) mergedUI[sec] = {};
                if (!mergedUI[sec][k]) mergedUI[sec][k] = { confidence: 1, status_color: 'verde' };
                mergedUI[sec][k].value = manualVal ? String(manualVal).trim() : null;
                mergedUI[sec][k].source = "manual";
                mergedUI[sec][k].editedAt = Date.now();
                mergedUI[sec][k].status_color = "verde";
            }
        }
        try {
            if (docId) {
                await fetch("/api/orion/document-intelligence/history", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "UPSERT_RECORD", payload: { id: docId, extractedFields: mergedUI } })
                });
            }
            setUi(mergedUI);
            setIsEditing(false);
            setOverrides({});
        } finally {
            setIsSaving(false);
        }
    };

    const getVal = (sec: any, key: string) => {
        if (!sec) return (ui as any)[key]?.value || "";
        if (overrides[sec] && overrides[sec][key] !== undefined) return overrides[sec][key];
        return (ui as any)[sec]?.[key]?.value || "";
    };

    const handleChange = (sec: any, key: string, value: string) => {
        if (!sec) { setOverrides({ ...overrides, root: { ...(overrides.root || {}), [key]: value } }); return; }
        setOverrides({ ...overrides, [sec]: { ...(overrides[sec] || {}), [key]: value } });
    };

    const isManual = (sec: any, key: string) => {
        if (!sec) return overrides.root && overrides.root[key] !== undefined;
        if (overrides[sec] && overrides[sec][key] !== undefined) return true;
        return (ui as any)[sec]?.[key]?.source === "manual";
    };

    const CopyIcon = ({ type, className = "" }: { type: string, className?: string }) => copiedBtn === type
        ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" className={className}><polyline points="20 6 9 17 4 12" /></svg>
        : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`cursor-pointer transition-opacity ${className}`} style={{ color: 'rgba(255,255,255,0.3)' }}><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>;

    const StatusBadge = ({ isDetected }: { isDetected: boolean }) => (
        <div className={`w-2 h-2 rounded-full ${isDetected ? 'bg-emerald-400' : 'bg-red-400'}`} title={isDetected ? 'Campo detectado' : 'Campo faltante'} />
    );

    const licensePlate = getVal('identification', 'license_plate');
    const vin = getVal('identification', 'vin');
    const brand = getVal('vehicleCommercial', 'brand');
    const model = getVal('vehicleCommercial', 'commercial_name') || getVal('vehicleCommercial', 'model');
    const service = getVal('vehicleCommercial', 'service');
    const titular = getVal('holder', 'full_name');
    const obsVal = getVal('observations', 'observations') || (ui as any).observations?.value;

    const leftTechFields = [
        { sec: 'vehicleTechnical', key: 'power_kw', label: 'Potencia', suffix: 'kW' },
        { sec: '', key: '_computed_cv', label: 'Caballos', suffix: 'CV', isComputed: true },
        { sec: 'vehicleTechnical', key: 'engine_displacement_cc', label: 'Cilindrada', suffix: 'cc' },
        { sec: 'vehicleTechnical', key: 'max_mass_kg', label: 'Masa máxima (MMA)', suffix: 'kg' },
        { sec: 'vehicleTechnical', key: 'mass_in_service_kg', label: 'Masa servicio', suffix: 'kg' },
        { sec: 'vehicleTechnical', key: 'seats', label: 'Plazas', suffix: 'plazas' },
        { sec: 'vehicleTechnical', key: 'fuel_raw', label: 'Combustible', suffix: '' }
    ];

    const advancedTechFields = [
        { sec: 'vehicleCommercial', key: 'type', label: 'Tipo / Variante / Versión' },
        { sec: 'vehicleTechnical', key: 'homologation_code', label: 'Homologación' },
        { sec: 'vehicleTechnical', key: 'power_to_weight_ratio', label: 'Relación potencia/peso' },
    ];

    const identificationFields = [
        { sec: 'identification', key: 'license_plate', label: 'Matrícula' },
        { sec: 'identification', key: 'vin', label: 'Bastidor' },
        { sec: 'holder', key: 'full_name', label: 'Titular' },
        { sec: 'vehicleCommercial', key: 'service', label: 'Servicio' }
    ];

    const FieldEditor = ({ sec, fieldKey, label, suffix = "", isComputed = false }: { sec: string, fieldKey: string, label: string, suffix?: string, isComputed?: boolean }) => {
        let currentVal = getVal(sec, fieldKey);
        const isMan = isManual(sec, fieldKey);

        if (isComputed && fieldKey === '_computed_cv') {
            const kw = getVal('vehicleTechnical', 'power_kw');
            if (kw) currentVal = (parseFloat(kw as string) * 1.35962).toFixed(1);
        }

        const isDetected = !!currentVal && currentVal !== "—";

        if (!isEditing) {
            const displayVal = currentVal ? `${currentVal} ${suffix}`.trim() : "—";
            return (
                <div className="flex flex-col py-2 group" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="flex items-center gap-1.5 mb-1">
                        <StatusBadge isDetected={isDetected} />
                        <span className="text-[11px] font-semibold tracking-wide" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</span>
                        {isMan && <span className="ml-1 text-[8px] px-1 rounded uppercase" style={{ color: '#1240CC', background: 'rgba(18,64,204,0.1)' }}>Editado</span>}
                        {currentVal && (
                            <button onClick={() => handleCopy(String(currentVal), label)} className="opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
                                <CopyIcon type={label} />
                            </button>
                        )}
                    </div>
                    <span className="text-sm font-medium" style={{ color: isDetected ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.2)' }}>
                        {displayVal}
                    </span>
                </div>
            );
        }

        if (isComputed) return null;

        return (
            <div className="flex flex-col py-2" style={{ borderBottom: '1px dashed rgba(18,64,204,0.15)' }}>
                <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wide flex-1" style={{ color: '#1240CC' }}>{label}</span>
                    {isMan && <span className="text-[8px] px-1 rounded" style={{ color: '#1240CC', background: 'rgba(18,64,204,0.1)' }}>EDITADO</span>}
                </div>
                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        value={currentVal || ""}
                        onChange={(e) => handleChange(sec, fieldKey, e.target.value)}
                        className="w-full text-sm font-semibold text-white px-2 py-1 outline-none rounded transition-colors"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }}
                        placeholder="—"
                    />
                    {suffix && <span className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{suffix}</span>}
                </div>
            </div>
        );
    };

    return (
        <div className="flex-1 w-full max-w-[1600px] mx-auto min-w-[340px] rounded-2xl flex flex-col overflow-hidden relative animate-in slide-in-from-right-8 duration-300" style={cardStyle}>
            <div className="flex-1 overflow-y-auto custom-scrollbar">

                {/* 1. HEADER */}
                <div className="px-8 pt-8 pb-6 flex flex-col relative" style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="flex justify-between items-start mb-4">
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-3">
                                <h1 className="text-4xl font-black text-white tracking-widest uppercase">
                                    {licensePlate || 'SIN MATRÍCULA'}
                                </h1>
                                {licensePlate && (
                                    <button onClick={() => handleCopy(licensePlate as string, 'HeaderPlate')} title="Copiar Matrícula" className="mt-1">
                                        <CopyIcon type="HeaderPlate" className="w-5 h-5" />
                                    </button>
                                )}
                            </div>
                            <div className="text-lg font-bold" style={{ color: 'rgba(255,255,255,0.4)' }}>
                                {[brand, model].filter(Boolean).join(" ")}
                            </div>
                            {service && (
                                <div className="mt-2 text-sm font-semibold inline-flex px-3 py-1 rounded w-max" style={{ color: '#1240CC', background: 'rgba(18,64,204,0.08)', border: '1px solid rgba(18,64,204,0.2)' }}>
                                    Servicio: {service}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col gap-1 text-sm font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>
                        <div className="flex items-center gap-2 group">
                            <span className="w-16 uppercase text-[10px] font-bold tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Titular</span>
                            <span className="text-white/70 truncate">{titular || "—"}</span>
                            {titular && (
                                <button onClick={() => handleCopy(titular as string, 'HeaderTitular')} title="Copiar Titular" className="opacity-0 group-hover:opacity-100 transition-opacity">
                                    <CopyIcon type="HeaderTitular" className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                        <div className="flex items-center gap-2 group">
                            <span className="w-16 uppercase text-[10px] font-bold tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Bastidor</span>
                            <span className="text-white/70 font-mono">{vin || "—"}</span>
                            {vin && (
                                <button onClick={() => handleCopy(vin as string, 'HeaderVIN')} title="Copiar Bastidor" className="opacity-0 group-hover:opacity-100 transition-opacity">
                                    <CopyIcon type="HeaderVIN" className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* 2. MAIN BODY */}
                <div className="p-4 sm:p-6 lg:p-8 flex flex-col gap-6 lg:gap-8 w-full">

                    {/* Edit header */}
                    <div className="flex justify-between items-center pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                        <h3 className="text-sm font-black text-white uppercase tracking-widest">Información Principal</h3>
                        <button
                            onClick={() => isEditing ? setIsEditing(false) : setIsEditing(true)}
                            className="text-[10px] font-bold px-4 py-1.5 rounded-full uppercase transition-all flex items-center gap-1.5"
                            style={isEditing
                                ? { color: '#F59E0B', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }
                                : { color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }
                            }
                        >
                            {isEditing ? (
                                <>Descartar Cambios</>
                            ) : (
                                <>
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                    Editar informe
                                </>
                            )}
                        </button>
                    </div>

                    {/* Principal Grid */}
                    <div className="rounded-xl p-6" style={panelStyle}>
                        <h4 className="text-[10px] font-bold uppercase tracking-widest mb-4" style={{ color: 'rgba(255,255,255,0.3)' }}>Información Principal</h4>
                        <div className="grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] gap-x-8 gap-y-2">
                            {identificationFields.map(f => (
                                <FieldEditor key={f.key} sec={f.sec} fieldKey={f.key} label={f.label} />
                            ))}
                        </div>
                    </div>

                    {/* Tech Specs */}
                    <div className="rounded-xl p-6" style={panelStyle}>
                        <h4 className="text-[10px] font-bold uppercase tracking-widest mb-4" style={{ color: 'rgba(255,255,255,0.3)' }}>Especificaciones Técnicas</h4>
                        <div className="grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] gap-x-8 gap-y-2">
                            {leftTechFields.map(f => (
                                <FieldEditor key={f.key} sec={f.sec} fieldKey={f.key} label={f.label} suffix={f.suffix} isComputed={f.isComputed} />
                            ))}
                        </div>
                    </div>

                    {/* Fechas importantes */}
                    <div className="rounded-xl p-6" style={panelStyle}>
                        <h4 className="text-[10px] font-bold uppercase tracking-widest mb-4" style={{ color: 'rgba(255,255,255,0.3)' }}>Fechas importantes</h4>
                        <div className="grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] gap-x-8 gap-y-2">
                            {(() => {
                                const bDate = getVal('identification', 'first_registration_date');
                                const iDate = getVal('identification', 'registration_date');
                                const i2Date = getVal('identification', 'issue_date');
                                const hasB = bDate && bDate !== '—';
                                const hasI = iDate && iDate !== '—';
                                return (
                                    <>
                                        {(hasB || isEditing) && <FieldEditor sec="identification" fieldKey="first_registration_date" label="Primera matriculación (B)" />}
                                        {((!hasB && hasI) || isEditing) && <FieldEditor sec="identification" fieldKey="registration_date" label="Fecha matriculación (I)" />}
                                        {((i2Date && i2Date !== '—') || isEditing) && <FieldEditor sec="identification" fieldKey="issue_date" label="Fecha Emisión (I.2)" />}
                                        <FieldEditor sec="" fieldKey="next_itv" label="Próxima ITV" />
                                    </>
                                );
                            })()}
                        </div>
                    </div>

                    {/* Observations */}
                    {(obsVal || isEditing) && (
                        <div className="rounded-xl p-6" style={{ background: 'rgba(18,64,204,0.04)', border: '1px solid rgba(18,64,204,0.15)' }}>
                            <h4 className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: '#1240CC' }}>Observaciones</h4>
                            {isEditing ? (
                                <textarea
                                    value={(getVal('observations', 'observations') as string) || (getVal('', 'observations') as string) || ""}
                                    onChange={(e) => handleChange('', 'observations', e.target.value)}
                                    className="w-full text-sm text-white p-3 rounded-lg outline-none"
                                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(18,64,204,0.2)' }}
                                    rows={3}
                                    placeholder="Sin observaciones documentadas..."
                                />
                            ) : (
                                <p className="text-sm font-mono leading-relaxed whitespace-pre-wrap" style={{ color: 'rgba(255,255,255,0.6)' }}>
                                    {obsVal || "Sin observaciones documentadas."}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Advanced Tech (collapsible) */}
                    <div className="flex flex-col gap-4 mt-2">
                        <button
                            onClick={() => setShowAdvanced(!showAdvanced)}
                            className="w-max mx-auto py-2 px-6 flex items-center justify-center gap-2 text-[11px] font-bold transition-colors rounded-full"
                            style={{ color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}
                        >
                            {showAdvanced ? "Ocultar datos técnicos" : "Datos técnicos avanzados"}
                            <svg className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>

                        {(showAdvanced || isEditing) && (
                            <div className="animate-in slide-in-from-top-4 fade-in duration-300 rounded-xl p-6" style={panelStyle}>
                                <div className="grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] gap-x-8 gap-y-2">
                                    {advancedTechFields.map(f => (
                                        <FieldEditor key={f.key} sec={f.sec} fieldKey={f.key} label={f.label} suffix={(f as any).suffix} />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ACTION BAR (Edit Mode) */}
            {isEditing && (
                <div className="p-5 flex gap-3 shrink-0 animate-in slide-in-from-bottom-2 z-10" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(2,6,23,0.97)' }}>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex-1 font-bold py-3.5 px-4 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                        style={{ background: '#1240CC', color: '#020617' }}
                        onMouseEnter={e => { if (!isSaving) (e.currentTarget as HTMLElement).style.background = '#5AEAFF'; }}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#1240CC'}
                    >
                        {isSaving ? (
                            <>
                                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                Guardando cambios...
                            </>
                        ) : (
                            <>
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                </svg>
                                Guardar Cambios Manuales
                            </>
                        )}
                    </button>
                    <button
                        onClick={() => setIsEditing(false)}
                        className="px-6 font-bold rounded-xl transition-colors"
                        style={{ color: 'rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                    >
                        Cancelar
                    </button>
                </div>
            )}
        </div>
    );
}
