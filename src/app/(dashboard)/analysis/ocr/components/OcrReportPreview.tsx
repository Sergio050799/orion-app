import React, { useState } from 'react';
import { DocumentRecord } from "@/services/document-service";
import { decodeFieldValue, decodeCL } from "@/core/pipelines/ficha_tecnica/dictionary-decoder";
import { estimateDate } from "@/core/_source_of_truth/plates/engine";
import VehicleReportCard, { ReportCardModel } from "@/components/saas/VehicleReportCard";
import CarnetReportCard from "@/components/saas/CarnetReportCard";
import { resolveDocType } from "@/core/pipelines/_shared/docType";

interface OcrReportPreviewProps {
    doc: DocumentRecord | null;
    activeSegmentId?: string | null;
    onReupload?: (files: FileList) => void;
    onDocUpdate?: (id: string, changes: Partial<DocumentRecord>) => void;
}

// ── Catalog Panel ────────────────────────────────────────────────────────────
function CatalogPanel({ doc, onDocUpdate }: { doc: DocumentRecord; onDocUpdate?: (id: string, changes: Partial<DocumentRecord>) => void }) {
    const [saving, setSaving] = useState(false);
    const [showManual, setShowManual] = useState(false);
    const [manualFields, setManualFields] = useState<Record<string, string>>({});

    const candidates = doc.catalogoCandidatos;
    if (!candidates || candidates.length === 0) return null;

    const topScore = candidates[0].score ?? 0;
    const selected = doc.catalogoSeleccionado;

    const handleSelect = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const idVeh = e.target.value;
        if (!idVeh) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/orion/documents/${doc.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ catalogoSeleccionado: idVeh }),
            });
            if (res.ok) {
                const updated = await res.json();
                onDocUpdate?.(doc.id, updated);
            }
        } finally {
            setSaving(false);
        }
    };

    const manualFieldDefs = [
        { key: 'marca', label: 'Marca' }, { key: 'modelo', label: 'Modelo' },
        { key: 'año', label: 'Año' }, { key: 'kw', label: 'kW' },
        { key: 'plazas', label: 'Plazas' }, { key: 'dimensiones', label: 'Dimensiones' },
        { key: 'pesos', label: 'Pesos (kg)' },
    ];

    return (
        <div
            className="shrink-0 px-6 py-4 flex flex-col gap-3"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(99,102,241,0.03)' }}
        >
            <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#6366f1' }}>
                    Vehículo identificado
                </h4>
                <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{
                        color: topScore >= 80 ? '#10B981' : topScore >= 60 ? '#F59E0B' : '#EF4444',
                        background: topScore >= 80 ? 'rgba(16,185,129,0.1)' : topScore >= 60 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
                    }}
                >
                    Coincidencia: {topScore}%
                </span>
            </div>

            {/* Dropdown candidatos */}
            <div className="relative">
                <select
                    className="w-full text-xs font-bold px-3 py-2.5 rounded-xl appearance-none outline-none transition-all"
                    style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(99,102,241,0.2)',
                        color: 'rgba(255,255,255,0.8)',
                    }}
                    defaultValue={typeof selected === 'object' && selected !== null ? (selected as any).id_veh ?? (candidates[0]?.id_veh ?? '') : (candidates[0]?.id_veh ?? '')}
                    onChange={handleSelect}
                    disabled={saving}
                >
                    <option value="">-- Seleccionar versión final --</option>
                    {candidates.map((c: any) => (
                        <option key={c.id_veh} value={c.id_veh} style={{ background: '#020617' }}>
                            {c.marca} {c.modelo} — {c.version} · {c.kw}kw/{c.cv}cv · {c.num_plazas_min}pl · {c.fec_ini_comerc?.slice(0,4)}–{c.fec_fin_comerc?.slice(0,4)}  →  {c.score ?? 0}%
                        </option>
                    ))}
                </select>
                {saving && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <svg className="animate-spin w-3.5 h-3.5" style={{ color: '#6366f1' }} fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                    </div>
                )}
            </div>

            {/* Añadir manualmente */}
            <button
                onClick={() => setShowManual(!showManual)}
                className="text-[10px] font-bold self-start transition-colors"
                style={{ color: showManual ? '#F59E0B' : 'rgba(255,255,255,0.35)' }}
                onMouseEnter={e => { if (!showManual) { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.7)'; } }}
                onMouseLeave={e => { if (!showManual) { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.35)'; } }}
            >
                {showManual ? '▲ Ocultar formulario manual' : '▼ Añadir detalles manualmente'}
            </button>

            {showManual && (
                <div className="grid grid-cols-2 gap-2 animate-in fade-in duration-200">
                    {manualFieldDefs.map(({ key, label }) => (
                        <div key={key} className="flex flex-col gap-1">
                            <label className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>{label}</label>
                            <input
                                type="text"
                                value={manualFields[key] || ''}
                                onChange={e => setManualFields(prev => ({ ...prev, [key]: e.target.value }))}
                                className="text-xs px-2 py-1 rounded-lg outline-none text-white"
                                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                                placeholder="—"
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export function normalizeVehicleForBusinessView(doc: DocumentRecord, segmentData?: any): ReportCardModel {
    const raw = segmentData || doc.extractedFields || {};

    let J2 = raw.J2 || null;
    if (J2 && (typeof J2 !== 'string' || J2.toUpperCase() === "F.7" || J2.toUpperCase() === "F7")) {
        J2 = null;
    }

    // Azure lee la tabla con off-by-one: J.1=null y J.2="AA" cuando debería ser J.1="AA".
    // Si J2 tiene un código de carrocería de 2 letras decodificable y J1 está vacío → promover J2→J1.
    let J1 = raw.J1 || null;
    if (!J1 && J2 && typeof J2 === 'string') {
        const probe = decodeFieldValue("J.1", J2);
        if (!probe.includes("No disponible") && probe !== "Dato vacío") {
            J1 = J2;
            J2 = null;
        }
    }
    // Deduplicar: si J2 == J1 (extraído dos veces), anular J2
    if (J2 && J1 && J2.toUpperCase() === J1.toUpperCase()) {
        J2 = null;
    }

    const getDecoded = (code: string, val: string) => {
        if (!val) return null;
        const decoded = decodeFieldValue(code, val);
        if (decoded.includes("No disponible") || decoded === "Dato vacío") return null;
        return decoded;
    };

    const fullCategoria = getDecoded("J", raw.J);
    const fullCarroceria = getDecoded("J.1", J1);
    const fullClase = getDecoded("J.2", J2);
    const decodedCL = decodeCL(raw.CL);

    const vehicleClassLabel = decodedCL ? decodedCL.business_label : raw.CL ? String(raw.CL).trim() : null;
    const vehicleClassCode = raw.CL || null;

    let ueCategoryLabel = raw.J || null;
    if (fullCategoria) {
        const parts = fullCategoria.split(/[,\.]/);
        ueCategoryLabel = parts[0].trim();
        ueCategoryLabel = ueCategoryLabel.charAt(0).toUpperCase() + ueCategoryLabel.slice(1);
    }
    const ueCategoryCode = raw.J || null;

    const bodyLabel = fullCarroceria ? fullCarroceria.split('(')[0].trim() : J1 || null;
    const bodyCode = J1 || null;

    const claseLabel = fullClase ? fullClase.substring(0, 50) + (fullClase.length > 50 ? '...' : '') : J2 || null;
    const claseCode = J2 || null;

    const fechaEmision = raw.issueDateRaw || null;
    const fechaPrimeraMatriculacion = raw.B || null;

    let fechaMatriculacionEstimada = null;
    if (raw.plate) {
        const est = estimateDate(raw.plate);
        if (est) {
            fechaMatriculacionEstimada = est.month ? `${String(est.month).padStart(2, '0')}/${est.year}` : `${est.year}`;
        }
    }

    const makeModel = `${raw.D1 || ''} ${raw.D3 || ''}`.trim() || null;

    const resParts = [];
    if (makeModel) resParts.push(makeModel);

    if (vehicleClassLabel) {
        resParts.push(vehicleClassLabel.charAt(0).toUpperCase() + vehicleClassLabel.slice(1).toLowerCase());
    } else if (raw.CL) {
        resParts.push(`Clase vehículo: ${raw.CL} (sin diccionario)`);
    }

    if (bodyLabel) {
        resParts.push(bodyLabel);
    }
    if (raw.S1) resParts.push(`${raw.S1} plazas`);

    let motorStr = "";
    if (raw.P2 && raw.powerCv) motorStr = `${raw.P2} kW (${raw.powerCv} CV)`;
    else if (raw.P2) motorStr = `${raw.P2} kW`;
    if (raw.P1) motorStr += (motorStr ? ` · ${raw.P1} cc` : `${raw.P1} cc`);

    let mmaStr = "";
    if (raw.F2) mmaStr = `MMA ${raw.F2} kg`;

    let techLine = [motorStr, mmaStr].filter(Boolean).join(" · ");

    const dimParts = [];
    if (raw.F6) dimParts.push(raw.F6);
    if (raw.F5) dimParts.push(raw.F5);
    if (raw.F4) dimParts.push(raw.F4);
    let dimsStr = dimParts.length === 3 ? `${dimParts.join("×")} mm` : "";

    let dateLine = "";
    if (fechaEmision) dateLine += `Emisión ${fechaEmision}`;
    if (fechaMatriculacionEstimada) dateLine += (dateLine ? ` · Mat. ORIÓN ${fechaMatriculacionEstimada} (estim.)` : `Mat. ORIÓN ${fechaMatriculacionEstimada} (estim.)`);

    let resumen = [resParts.join(" · "), techLine, dimsStr, dateLine].filter(Boolean).join("\n");

    return {
        // Raw Keys
        plate: raw.plate,
        E: raw.E,
        S1: raw.S1,
        P1: raw.P1,
        P2: raw.P2,
        powerCv: raw.powerCv,
        F2: raw.F2,
        F4: raw.F4,
        F5: raw.F5,
        F6: raw.F6,
        J: raw.J,
        J1: raw.J1,
        J2: J2,
        CL: raw.CL,

        // Processed UI Keys
        makeModel,
        fuel: getDecoded("P.3", raw.P3) || raw.P3 || null,
        fechaEmision,
        fechaPrimeraMatriculacion,
        fechaMatriculacionEstimada,

        vehicleClassLabel,
        vehicleClassCode,
        ueCategoryLabel,
        ueCategoryCode,
        bodyLabel,
        bodyCode,
        claseLabel,
        claseCode,

        fullCategoria,
        fullCarroceria,
        fullClase,
        decodedCL,
        resumen: resumen || "No hay datos suficientes para generar un resumen.",

        // Pass badges through
        usedModel: doc.usedModel,
        ocrQuality: doc.ocrQuality
    };
}

const devPanelStyle: React.CSSProperties = {
    background: 'rgba(245,158,11,0.08)',
    borderBottom: '1px solid rgba(245,158,11,0.2)',
    color: 'rgba(251,191,36,0.9)',
};

const devPanelNeutralStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.03)',
    borderBottom: '1px solid rgba(255,255,255,0.07)',
    color: 'rgba(255,255,255,0.4)',
};

function DevPipelineMeta({ resolvedType, doc, variant = 'neutral' }: { resolvedType: string | null, doc: DocumentRecord, variant?: 'amber' | 'neutral' }) {
    const style = variant === 'amber' ? devPanelStyle : devPanelNeutralStyle;
    return (
        <details className="text-[10px] p-2 font-mono w-full shrink-0 rounded-t-xl z-10 relative" style={style}>
            <summary className="font-bold cursor-pointer uppercase outline-none">Dev Pipeline Meta</summary>
            <div className="flex gap-4 mt-2">
                <div className="whitespace-nowrap"><span className="opacity-50">T:</span> {resolvedType || <span className="text-red-400 font-bold">MISSING PIPELINE METADATA</span>}</div>
                <div className="whitespace-nowrap"><span className="opacity-50">E:</span> {doc.extractorUsed || <span className="text-red-400 font-bold">MISSING PIPELINE METADATA</span>}</div>
                <div className="truncate flex-1" title={doc.classifierEvidence?.evidence?.join(', ')}>
                    <span className="opacity-50">EVI:</span> {doc.classifierEvidence?.evidence?.slice(0, 3).join(', ') || <span className="text-red-400 font-bold">MISSING PIPELINE METADATA</span>}
                </div>
            </div>
        </details>
    );
}

export default function OcrReportPreview({ doc, activeSegmentId, onReupload, onDocUpdate }: OcrReportPreviewProps) {
    if (!doc) {
        return <VehicleReportCard ui={null} />;
    }

    if (doc.status === "processing") {
        return <VehicleReportCard ui={null} isLoading={true} />;
    }

    if (doc.status === "failed") {
        return (
            <div
                className="w-80 min-w-[320px] p-6 flex flex-col h-full shrink-0"
                style={{ borderLeft: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.04)' }}
            >
                <div className="flex items-center gap-2 mb-4" style={{ color: '#EF4444' }}>
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <h3 className="text-sm font-black uppercase tracking-wider">Error de Procesamiento</h3>
                </div>

                <div
                    className="rounded-xl p-4 flex-1 overflow-y-auto custom-scrollbar"
                    style={{ background: 'rgba(2,6,23,0.6)', border: '1px solid rgba(239,68,68,0.1)' }}
                >
                    <div className="mb-4">
                        <span className="text-[10px] font-bold uppercase tracking-widest block mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Archivo</span>
                        <span className="text-xs font-mono break-all" style={{ color: 'rgba(255,255,255,0.6)' }}>{doc.fileName}</span>
                    </div>

                    <div className="mb-4">
                        <span className="text-[10px] font-bold uppercase tracking-widest block mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Código de Error</span>
                        <span className="inline-block font-mono text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(239,68,68,0.15)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.25)' }}>
                            {doc.errorCode || 'UNKNOWN'}
                        </span>
                    </div>

                    <div className="mb-4">
                        <span className="text-[10px] font-bold uppercase tracking-widest block mb-2" style={{ color: 'rgba(255,255,255,0.3)' }}>Detalle Técnico</span>
                        <pre className="text-[10px] font-mono whitespace-pre-wrap break-words" style={{ color: 'rgba(255,255,255,0.45)' }}>{doc.errorMessage || doc.error || 'Sin detalles'}</pre>
                    </div>
                </div>

                <div className="mt-4 flex gap-2">
                    <button
                        onClick={async () => {
                            const { DocumentService } = await import('@/services/document-service');
                            DocumentService.reprocessDocument(doc.id);
                        }}
                        className="flex-1 text-xs font-bold py-2 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
                        style={{ background: 'rgba(239,68,68,0.15)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.25)' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.25)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.15)'; }}
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        Reintentar
                    </button>
                </div>
            </div>
        );
    }

    if (doc.isMixedPdf) {
        const safeGroups = doc.vehicleGroups && doc.vehicleGroups.length > 0 ? doc.vehicleGroups : [];

        if (safeGroups.length === 0) {
            return <VehicleReportCard ui={normalizeVehicleForBusinessView(doc)} />;
        }

        const autoActiveSegmentId = activeSegmentId || safeGroups[0]?.documents[0]?.segmentId;

        if (!autoActiveSegmentId) {
            return <VehicleReportCard ui={normalizeVehicleForBusinessView(doc)} />;
        }

        const activeSegment = doc.segments?.find(s => s.id === autoActiveSegmentId);
        const businessData = normalizeVehicleForBusinessView(doc, activeSegment?.extractedData);

        if (!activeSegment) {
            return <VehicleReportCard ui={businessData} />;
        }

        if (activeSegment.type === "FICHA_TECNICA") {
            return <VehicleReportCard ui={businessData} />;
        } else {
            const PermisoReportCard = require('@/components/saas/PermisoReportCard').default;
            return <PermisoReportCard key={autoActiveSegmentId} ui={activeSegment.extractedData || null} docId={doc.id} />;
        }
    }

    const resolvedType = resolveDocType(doc);

    if (resolvedType === "PERMISO_V1" || resolvedType === "PERMISO_V2") {
        const PermisoReportCard = require('@/components/saas/PermisoReportCard').default;
        const isDevView = process.env.NEXT_PUBLIC_ORION_DEV_DEBUG === "true";
        return (
            <div className="flex flex-col h-full w-full">
                {isDevView && <DevPipelineMeta resolvedType={resolvedType} doc={doc} variant="amber" />}
                <PermisoReportCard key={doc.id} ui={doc.extractedFields as any} docId={doc.id} />
            </div>
        );
    }

    if (resolvedType === "CARNET_CONDUCIR") {
        const isDevView = process.env.NEXT_PUBLIC_ORION_DEV_DEBUG === "true";
        return (
            <div className="flex flex-col h-full w-full">
                {isDevView && <DevPipelineMeta resolvedType={resolvedType} doc={doc} />}
                <CarnetReportCard ui={doc.extractedFields as any} />
            </div>
        );
    }

    const uiModel = normalizeVehicleForBusinessView(doc);
    const isDevView = process.env.NEXT_PUBLIC_ORION_DEV_DEBUG === "true";

    if (resolvedType === "UNKNOWN") {
        return (
            <div className="flex flex-col h-full w-full">
                {isDevView && <DevPipelineMeta resolvedType={resolvedType} doc={doc} />}
                <div className="w-full flex-grow flex items-center justify-center p-6 text-center">
                    <div className="max-w-sm w-full">
                        <div
                            className="rounded-2xl p-8 flex flex-col items-center gap-5"
                            style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.18)' }}
                        >
                            <svg className="w-14 h-14 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <div>
                                <h2 className="text-lg font-black mb-1 text-white">Tipo de documento no reconocido</h2>
                                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
                                    El sistema no pudo clasificar este documento. Acepta <strong className="text-white/70">Fichas Técnicas</strong> y <strong className="text-white/70">Permisos de Circulación</strong> en PDF o imagen.
                                </p>
                            </div>
                            <div
                                className="rounded-xl px-4 py-3 w-full text-left space-y-1"
                                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
                            >
                                <p className="font-bold uppercase tracking-widest text-[10px] mb-2" style={{ color: 'rgba(255,255,255,0.3)' }}>Qué puedes hacer</p>
                                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>· Intenta con una foto más nítida y bien encuadrada</p>
                                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>· Asegúrate de que el documento esté completo y sin recortar</p>
                                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>· Usa el escáner de documentos para corregir la perspectiva</p>
                            </div>
                            <div className="flex gap-3 w-full">
                                <button
                                    onClick={async () => {
                                        const { DocumentService } = await import('@/services/document-service');
                                        DocumentService.reprocessDocument(doc.id);
                                    }}
                                    className="flex-1 text-xs font-bold py-2.5 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
                                    style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.25)' }}
                                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(245,158,11,0.25)'; }}
                                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(245,158,11,0.15)'; }}
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                    Reintentar
                                </button>
                                {onReupload && (
                                    <label
                                        className="flex-1 text-xs font-bold py-2.5 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
                                        style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.09)' }}
                                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; }}
                                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; }}
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                        Subir nueva versión
                                        <input type="file" className="hidden" accept="image/*,.pdf" onChange={e => e.target.files && onReupload(e.target.files)} />
                                    </label>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full w-full overflow-hidden">
            {isDevView && <DevPipelineMeta resolvedType={resolvedType} doc={doc} />}
            {doc.catalogoCandidatos && doc.catalogoCandidatos.length > 0 && (
                <CatalogPanel doc={doc} onDocUpdate={onDocUpdate} />
            )}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                <VehicleReportCard ui={uiModel} />
            </div>
        </div>
    );
}
