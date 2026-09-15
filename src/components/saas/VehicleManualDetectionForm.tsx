"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import VehicleReportCard, { ReportCardModel } from "@/components/saas/VehicleReportCard";
import { decodeFieldValue, decodeCL } from "@/core/pipelines/ficha_tecnica/dictionary-decoder";
import { estimateDate } from "@/core/_source_of_truth/plates/engine";
import { DocumentService } from "@/services/document-service";

const sectionLabelStyle: React.CSSProperties = {
    color: 'rgba(255,255,255,0.3)',
    borderBottom: '1px solid rgba(255,255,255,0.07)',
};

const fieldLabelStyle: React.CSSProperties = {
    color: 'rgba(255,255,255,0.35)',
};

const FUEL_OPTIONS = [
    { value: 'D', label: 'Diésel' },
    { value: 'G', label: 'Gasolina' },
    { value: 'E', label: 'Eléctrico' },
    { value: 'X', label: 'Híbrido Gasolina (HEV / MHEV)' },
    { value: 'Y', label: 'Híbrido Diésel (HEV / MHEV)' },
    { value: 'P', label: 'Híbrido Gasolina Enchufable (PHEV)' },
    { value: 'R', label: 'Híbrido Diésel Enchufable (PHEV)' },
    { value: 'Z', label: 'Eléctrico con generador (Range Ext.)' },
    { value: 'L', label: 'Gas Licuado / Gas Natural (GLP / GNC)' },
    { value: 'B', label: 'Bio-Ethanol / Biodiesel' },
    { value: 'H', label: 'Hidrógeno' },
];

const INITIAL_FORM = {
    plate: "", E: "", CL: "", J: "", J1: "", D1: "", D3: "",
    acabado: "", P1: "", P2: "", powerCv: "", P3: "", F2: "",
    S1: "", fechaPrimeraMatriculacion: "", G: "",
    esHibridoManual: false, P21: "",
};

export default function VehicleManualDetectionForm() {
    const [isLoading, setIsLoading] = useState(false);
    const [saved, setSaved] = useState(false);
    const [cvManuallyEdited, setCvManuallyEdited] = useState(false);
    const [catalogoCandidatos, setCatalogoCandidatos] = useState<any[]>([]);
    const [catalogoLoading, setCatalogoLoading] = useState(false);
    const [catalogoSeleccionado, setCatalogoSeleccionado] = useState<string | null>(null);
    const [catalogoSeleccionadoData, setCatalogoSeleccionadoData] = useState<any | null>(null);
    const [catalogoOpen, setCatalogoOpen] = useState(false);
    const [fuelOpen, setFuelOpen] = useState(false);
    const debounceRef = useRef<NodeJS.Timeout>(undefined);
    const fuelRef = useRef<HTMLDivElement>(null);

    const [formData, setFormData] = useState(INITIAL_FORM);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        const upperValue = value.toUpperCase();

        if (name === 'powerCv') setCvManuallyEdited(true);

        // Si se edita marca o modelo manualmente, limpiar vínculo de catálogo
        if ((name === 'D1' || name === 'D3') && catalogoSeleccionado) {
            setCatalogoSeleccionado(null);
            setCatalogoSeleccionadoData(null);
        }

        setFormData(prev => {
            const next = { ...prev, [name]: upperValue };
            if (name === 'P2' && !cvManuallyEdited) {
                const kw = parseFloat(upperValue.replace(',', '.'));
                next.powerCv = !isNaN(kw) ? String(Math.round(kw * 1.35962)) : "";
            }
            return next;
        });
        setSaved(false);
    };

    const getDecoded = (code: string, val: string) => {
        if (!val) return null;
        const decoded = decodeFieldValue(code, val);
        if (decoded.includes("No disponible") || decoded === "Dato vacío") return null;
        return decoded;
    };

    const fullCategoria = getDecoded("J", formData.J);
    const fullCarroceria = getDecoded("J.1", formData.J1);
    const decodedCL = decodeCL(formData.CL);

    const vehicleClassLabel = decodedCL ? decodedCL.business_label : formData.CL ? String(formData.CL).trim() : null;

    let ueCategoryLabel = formData.J || null;
    if (fullCategoria) {
        const parts = fullCategoria.split(/[,\.]/);
        ueCategoryLabel = parts[0].trim();
        ueCategoryLabel = ueCategoryLabel.charAt(0).toUpperCase() + ueCategoryLabel.slice(1);
    }

    const bodyLabel = fullCarroceria ? fullCarroceria.split('(')[0].trim() : formData.J1 || null;
    const makeModel = `${formData.D1 || ''} ${formData.D3 || ''}`.trim() || null;

    const resParts = [];
    if (makeModel) resParts.push(makeModel);
    if (vehicleClassLabel) resParts.push(vehicleClassLabel.charAt(0).toUpperCase() + vehicleClassLabel.slice(1).toLowerCase());
    else if (formData.CL) resParts.push(`Clase vehículo: ${formData.CL}`);
    if (bodyLabel) resParts.push(bodyLabel);
    if (formData.S1) resParts.push(`${formData.S1} plazas`);

    let motorStr = "";
    if (formData.P2 && formData.powerCv) motorStr = `${formData.P2} kW (${formData.powerCv} CV)`;
    else if (formData.P2) motorStr = `${formData.P2} kW`;
    if (formData.P1) motorStr += (motorStr ? ` · ${formData.P1} cc` : `${formData.P1} cc`);

    let mmaStr = formData.F2 ? `MMA ${formData.F2} kg` : "";
    let techLine = [motorStr, mmaStr].filter(Boolean).join(" · ");
    let resumen = [resParts.join(" · "), techLine].filter(Boolean).join("\n");

    let fechaMatriculacionEstimada = "";
    if (formData.plate) {
        const est = estimateDate(formData.plate);
        if (est) {
            fechaMatriculacionEstimada = est.month ? `${String(est.month).padStart(2, '0')}/${est.year}` : `${est.year}`;
        }
    }

    const uiModel: ReportCardModel = {
        plate: formData.plate,
        E: formData.E,
        S1: formData.S1,
        P1: formData.P1,
        P2: formData.P2,
        powerCv: formData.powerCv,
        F2: formData.F2,
        J: formData.J,
        J1: formData.J1,
        CL: formData.CL,
        makeModel,
        fuel: getDecoded("P.3", formData.P3) || formData.P3 || null,
        fechaEmision: null,
        fechaPrimeraMatriculacion: formData.fechaPrimeraMatriculacion || null,
        fechaMatriculacionEstimada: fechaMatriculacionEstimada || null,
        vehicleClassLabel,
        vehicleClassCode: formData.CL,
        ueCategoryLabel,
        ueCategoryCode: formData.J,
        bodyLabel,
        bodyCode: formData.J1,
        fullCategoria,
        fullCarroceria,
        fullClase: null,
        decodedCL,
        resumen,
        P21: formData.esHibridoManual ? (formData.P21 || null) : null,
        cvTermico: formData.esHibridoManual && formData.P2
            ? String(Math.round(parseFloat(formData.P2) * 1.35962))
            : null,
        cvTotal: formData.esHibridoManual && formData.P21
            ? String(Math.round((parseFloat(formData.P2 || '0') + parseFloat(formData.P21 || '0')) * 1.35962))
            : null,
        esHibrido: formData.esHibridoManual,
        catalogoVersion: catalogoSeleccionadoData?.version || null,
        catalogoIdVeh: catalogoSeleccionadoData?.id_veh || null,
        catalogoScore: catalogoSeleccionadoData?.score || null,
        usedModel: 'manual-entry',
        ocrQuality: { quality: 'high' }
    };

    const versionesUnicas = useMemo(() => {
        const map = new Map<string, any>();
        for (const c of catalogoCandidatos) {
            const key = c.version || '';
            if (!map.has(key) || c.score > map.get(key).score) {
                map.set(key, c);
            }
        }
        return Array.from(map.values()).sort((a, b) => b.score - a.score);
    }, [catalogoCandidatos]);

    const handleSelectCandidato = (c: any) => {
        setCatalogoSeleccionado(c.id_veh);
        setCatalogoSeleccionadoData(c);
        setCvManuallyEdited(false);
        setFormData(prev => ({
            ...prev,
            D1: c.marca || prev.D1,
            D3: c.modelo || prev.D3,
            acabado: c.version || prev.acabado,
            P2: c.kw ? String(c.kw) : prev.P2,
            P1: c.cilindrada ? String(c.cilindrada) : prev.P1,
            S1: c.num_plazas_min ? String(c.num_plazas_min) : prev.S1,
            P3: c.combustible || prev.P3,
            G: c.tara ? String(c.tara) : prev.G,
            F2: c.pma && c.pma > 0 ? String(c.pma) : prev.F2,
        }));
    };

    const handleLimpiarCatalogo = () => {
        setCatalogoSeleccionado(null);
        setCatalogoSeleccionadoData(null);
    };

    useEffect(() => {
        const hasData = formData.D1 || formData.D3;
        if (!hasData) { setCatalogoCandidatos([]); return; }

        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            setCatalogoLoading(true);
            try {
                const anioMatch = (formData.fechaPrimeraMatriculacion || '').match(/(\d{4})/);
                const anioReal = anioMatch ? parseInt(anioMatch[1]) : undefined;
                const anioEstimadoMatch = fechaMatriculacionEstimada.match(/(\d{4})/);
                const anioEstimado = anioEstimadoMatch ? parseInt(anioEstimadoMatch[1]) : undefined;
                const anio = anioReal ?? anioEstimado;

                const res = await fetch('/api/catalogo/search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        marca: formData.D1 || undefined,
                        modelo: formData.D3 || undefined,
                        acabado: formData.acabado || undefined,
                        tara: formData.G ? parseFloat(formData.G) : undefined,
                        kw: formData.P2 ? parseFloat(formData.P2) : undefined,
                        cilindrada: formData.P1 ? parseFloat(formData.P1) : undefined,
                        plazas: formData.S1 ? parseInt(formData.S1) : undefined,
                        combustible: formData.P3 || undefined,
                        kwElectrico: formData.P21 ? parseFloat(formData.P21) : undefined,
                        anio,
                    }),
                });
                if (res.ok) {
                    const { candidates } = await res.json();
                    setCatalogoCandidatos(candidates || []);
                    if (candidates?.length > 0) setCatalogoOpen(true);
                }
            } catch { /* silencioso */ } finally {
                setCatalogoLoading(false);
            }
        }, 600);

        return () => clearTimeout(debounceRef.current);
    }, [formData.D1, formData.D3, formData.acabado, formData.G, formData.P2, formData.P1, formData.S1, formData.P3, formData.P21, formData.fechaPrimeraMatriculacion, formData.plate]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (fuelRef.current && !fuelRef.current.contains(e.target as Node)) {
                setFuelOpen(false);
            }
        };
        if (fuelOpen) document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [fuelOpen]);

    const handleSave = async () => {
        setIsLoading(true);
        try {
            const recordPayload = {
                id: `manual_${Date.now()}`,
                filename: `Manual_${formData.plate}.json`,
                uploadTime: new Date().toISOString(),
                filesize: 1024,
                status: "completed" as "completed",
                source: "manual",
                progress: 100,
                approved: true,
                extractedFields: {
                    ...formData,
                    registrationEstimatedOrion: fechaMatriculacionEstimada || null,
                    firstRegistrationReal: formData.fechaPrimeraMatriculacion || null,
                    catalogoIdVeh: catalogoSeleccionadoData?.id_veh || null,
                    catalogoVersion: catalogoSeleccionadoData?.version || null,
                    catalogoScore: catalogoSeleccionadoData?.score || null,
                },
                usedModel: "manual",
                ocrQuality: { quality: "high", confidenceScore: 1 }
            };

            await fetch('/api/orion/document-intelligence/history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(recordPayload)
            });

            await DocumentService.loadHistoryIfNeeded();
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (error) {
            alert("Error al guardar el vehículo.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex-1 flex flex-col lg:flex-row gap-6 lg:gap-8 animate-in fade-in duration-500 min-h-0">
            {/* Left: Form */}
            <div
                className="lg:w-[400px] xl:w-[450px] shrink-0 flex flex-col h-full rounded-2xl overflow-hidden"
                style={{
                    background: 'rgba(2,6,23,0.8)',
                    border: '1px solid rgba(255,255,255,0.08)',
                }}
            >
                {/* Header */}
                <div className="p-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                    <h2 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                        <div className="w-1.5 h-4 rounded-full" style={{ background: '#1240CC' }} />
                        Variables Semánticas
                    </h2>
                    <p className="text-[10px] mt-1 uppercase tracking-widest font-bold" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        Entrada Manual Interactiva
                    </p>
                </div>

                {/* Scrollable fields */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5">

                    {/* Identidad */}
                    <div className="space-y-4">
                        <h3 className="text-[10px] font-black uppercase tracking-widest pb-2" style={sectionLabelStyle}>Identidad</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-widest" style={fieldLabelStyle}>Matrícula</label>
                                <input name="plate" value={formData.plate} onChange={handleChange} className="orion-input font-mono font-bold uppercase text-xs" />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-widest truncate" style={fieldLabelStyle}>Bastidor (E)</label>
                                <input name="E" value={formData.E} onChange={handleChange} className="orion-input font-mono font-bold uppercase text-xs" />
                            </div>
                        </div>
                    </div>

                    {/* Matriculación */}
                    <div className="space-y-4">
                        <h3 className="text-[10px] font-black uppercase tracking-widest pb-2" style={sectionLabelStyle}>Matriculación</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-widest truncate" style={fieldLabelStyle}>Actual (ORIÓN, est.)</label>
                                <input
                                    value={fechaMatriculacionEstimada}
                                    readOnly
                                    className="orion-input font-mono font-bold uppercase text-xs cursor-not-allowed opacity-50"
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-widest truncate" style={fieldLabelStyle}>1ª Mat. (Real)</label>
                                <input name="fechaPrimeraMatriculacion" value={formData.fechaPrimeraMatriculacion} onChange={handleChange} placeholder="MM/AAAA" className="orion-input font-mono font-bold uppercase text-xs" />
                            </div>
                        </div>
                        <p className="text-[10px] leading-tight" style={{ color: 'rgba(255,255,255,0.3)' }}>
                            Rellena &quot;1ª Mat. (Real)&quot; solo si la 1ª matriculación no coincide con la actual (rematriculación).
                        </p>
                    </div>

                    {/* Catálogo */}
                    <div className="space-y-4">
                        <h3 className="text-[10px] font-black uppercase tracking-widest pb-2" style={sectionLabelStyle}>Catálogo</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-widest truncate" style={fieldLabelStyle}>Clasificación (C.L)</label>
                                <input name="CL" value={formData.CL} onChange={handleChange} className="orion-input font-mono font-bold uppercase text-xs" />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-widest truncate" style={fieldLabelStyle}>Categoría UE (J)</label>
                                <input name="J" value={formData.J} onChange={handleChange} className="orion-input font-mono font-bold uppercase text-xs" />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-widest truncate" style={fieldLabelStyle}>Carrocería UE (J.1)</label>
                                <input name="J1" value={formData.J1} onChange={handleChange} className="orion-input font-mono font-bold uppercase text-xs" />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-widest" style={fieldLabelStyle}>Plazas (S.1)</label>
                                <input name="S1" value={formData.S1} onChange={handleChange} className="orion-input font-mono font-bold uppercase text-xs" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mt-3">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-widest" style={fieldLabelStyle}>Marca (D.1)</label>
                                <input name="D1" value={formData.D1} onChange={handleChange} className="orion-input font-mono font-bold uppercase text-xs" />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-widest" style={fieldLabelStyle}>Modelo (D.3)</label>
                                <input name="D3" value={formData.D3} onChange={handleChange} className="orion-input font-mono font-bold uppercase text-xs" />
                            </div>
                            <div className="flex flex-col gap-1.5 col-span-2">
                                <label className="text-[10px] font-bold uppercase tracking-widest" style={fieldLabelStyle}>Acabado / Versión</label>
                                <input name="acabado" value={formData.acabado} onChange={handleChange} placeholder="Ej: 40 TDI QUATTRO S-TRONIC" className="orion-input font-mono font-bold uppercase text-xs" />
                            </div>
                        </div>
                    </div>

                    {/* Planta Motriz */}
                    <div className="space-y-4">
                        <h3 className="text-[10px] font-black uppercase tracking-widest pb-2" style={sectionLabelStyle}>Planta Motriz</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-widest truncate" style={fieldLabelStyle}>Potencia kW (P.2)</label>
                                <input name="P2" value={formData.P2} onChange={handleChange} className="orion-input font-mono font-bold uppercase text-xs" />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <div className="flex items-center justify-between">
                                    <label className="text-[10px] font-bold uppercase tracking-widest" style={fieldLabelStyle}>Caballos CV</label>
                                    {cvManuallyEdited && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setCvManuallyEdited(false);
                                                const kw = parseFloat(formData.P2.replace(',', '.'));
                                                setFormData(prev => ({ ...prev, powerCv: !isNaN(kw) ? String(Math.round(kw * 1.35962)) : "" }));
                                            }}
                                            style={{ color: '#1240CC' }}
                                            title="Recalcular automáticamente desde kW"
                                        >
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                                                <path d="M3 3v5h5" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                                <input name="powerCv" value={formData.powerCv} onChange={handleChange} className="orion-input font-mono font-bold uppercase text-xs" />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-widest truncate" style={fieldLabelStyle}>Cilindrada (P.1)</label>
                                <input name="P1" value={formData.P1} onChange={handleChange} className="orion-input font-mono font-bold uppercase text-xs" />
                            </div>
                            <div className="flex flex-col gap-1.5 relative" ref={fuelRef}>
                                <label className="text-[10px] font-bold uppercase tracking-widest truncate" style={fieldLabelStyle}>Alimentación (P.3)</label>
                                <button
                                    type="button"
                                    onClick={() => setFuelOpen(o => !o)}
                                    className="orion-input font-mono font-bold text-xs text-left flex items-center justify-between gap-2"
                                >
                                    <span style={{ color: formData.P3 ? 'white' : 'rgba(255,255,255,0.25)' }}>
                                        {formData.P3 ? FUEL_OPTIONS.find(o => o.value === formData.P3)?.label : 'Selecciona combustible'}
                                    </span>
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                                        className="shrink-0 transition-transform"
                                        style={{ color: 'rgba(255,255,255,0.3)', transform: fuelOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                                    >
                                        <polyline points="6 9 12 15 18 9" />
                                    </svg>
                                </button>
                                {fuelOpen && (
                                    <div
                                        className="absolute top-full left-0 right-0 z-50 mt-1 rounded-xl overflow-y-auto custom-scrollbar"
                                        style={{
                                            background: 'rgba(2,6,23,0.97)',
                                            border: '1px solid rgba(255,255,255,0.12)',
                                            maxHeight: '220px',
                                        }}
                                    >
                                        {FUEL_OPTIONS.map(opt => {
                                            const isSelected = formData.P3 === opt.value;
                                            return (
                                                <button
                                                    key={opt.value}
                                                    type="button"
                                                    onClick={() => {
                                                        setFormData(prev => ({ ...prev, P3: opt.value }));
                                                        setSaved(false);
                                                        setFuelOpen(false);
                                                    }}
                                                    className="w-full text-left px-3 py-2 text-xs font-bold font-mono transition-colors"
                                                    style={{
                                                        color: isSelected ? 'white' : 'rgba(255,255,255,0.65)',
                                                        background: isSelected ? 'rgba(18,64,204,0.1)' : 'transparent',
                                                        borderLeft: isSelected ? '2px solid #1240CC' : '2px solid transparent',
                                                    }}
                                                    onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; }}
                                                    onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                                                >
                                                    {opt.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-widest truncate" style={fieldLabelStyle}>Tara / Masa (G)</label>
                                <input name="G" value={formData.G} onChange={handleChange} placeholder="Ej: 1910" className="orion-input font-mono font-bold uppercase text-xs" />
                            </div>

                            {/* Toggle híbrido */}
                            <div className="flex items-center gap-3 col-span-2 mt-1">
                                <button
                                    type="button"
                                    onClick={() => setFormData(prev => ({ ...prev, esHibridoManual: !prev.esHibridoManual }))}
                                    className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest transition-colors"
                                    style={{ color: formData.esHibridoManual ? '#1240CC' : 'rgba(255,255,255,0.3)' }}
                                >
                                    <div
                                        className="w-8 h-4 rounded-full transition-colors relative"
                                        style={{ background: formData.esHibridoManual ? 'rgba(18,64,204,0.4)' : 'rgba(255,255,255,0.1)' }}
                                    >
                                        <div
                                            className="absolute top-0.5 w-3 h-3 rounded-full transition-all"
                                            style={{
                                                background: formData.esHibridoManual ? '#1240CC' : 'rgba(255,255,255,0.4)',
                                                left: formData.esHibridoManual ? '18px' : '2px'
                                            }}
                                        />
                                    </div>
                                    Vehículo híbrido
                                </button>
                            </div>

                            {/* Campo P.2.1 — solo visible si es híbrido */}
                            {formData.esHibridoManual && (
                                <div className="flex flex-col gap-1.5 col-span-2">
                                    <label className="text-[10px] font-bold uppercase tracking-widest" style={fieldLabelStyle}>
                                        Motor eléctrico kW (P.2.1)
                                    </label>
                                    <input
                                        name="P21"
                                        value={formData.P21}
                                        onChange={handleChange}
                                        placeholder="Ej: 13.19"
                                        className="orion-input font-mono font-bold uppercase text-xs"
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                </div>

                {/* Footer: Save button */}
                <div className="p-5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                    <button
                        onClick={handleSave}
                        disabled={isLoading || saved || !formData.plate}
                        className="w-full py-3 rounded-lg flex items-center justify-center gap-2 text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        style={saved
                            ? { background: '#10B981', color: '#020617' }
                            : { background: '#1240CC', color: '#020617' }
                        }
                        onMouseEnter={e => { if (!isLoading && !saved && formData.plate) (e.currentTarget as HTMLElement).style.background = '#5AEAFF'; }}
                        onMouseLeave={e => { if (!isLoading && !saved) (e.currentTarget as HTMLElement).style.background = saved ? '#10B981' : '#1240CC'; }}
                    >
                        {isLoading ? (
                            <div className="w-4 h-4 border-2 border-[#020617]/30 border-t-[#020617] rounded-full animate-spin" />
                        ) : saved ? (
                            <>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                                Guardado
                            </>
                        ) : (
                            <>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
                                Registrar vehículo
                            </>
                        )}
                    </button>
                    {!formData.plate && !saved && (
                        <p className="text-center text-[10px] font-bold mt-2 uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.25)' }}>
                            Introduce la matrícula para registrar
                        </p>
                    )}
                    {saved && (
                        <div className="flex items-center justify-between mt-2">
                            <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">
                                Vehículo incorporado con éxito
                            </p>
                            <button
                                onClick={() => {
                                    setFormData(INITIAL_FORM);
                                    setCatalogoSeleccionado(null);
                                    setCatalogoSeleccionadoData(null);
                                    setCatalogoCandidatos([]);
                                    setCvManuallyEdited(false);
                                    setSaved(false);
                                }}
                                className="text-[10px] font-bold uppercase tracking-widest transition-colors"
                                style={{ color: '#1240CC' }}
                            >
                                + Nueva entrada
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Right: Report Card + Catálogo */}
            <div className="flex-1 flex flex-col gap-4 min-h-0 min-w-0">
                <VehicleReportCard ui={uiModel} />

                {/* Catálogo — visible cuando D1 o D3 tienen contenido */}
                {!!(formData.D1 || formData.D3) && (
                    <div className="rounded-xl shrink-0 overflow-hidden" style={{ background: 'rgba(2,6,23,0.85)', border: '1px solid rgba(255,255,255,0.1)' }}>

                        {/* Header colapsable */}
                        <button
                            onClick={() => setCatalogoOpen(o => !o)}
                            className="w-full flex items-center justify-between px-4 py-3 transition-colors"
                            style={{ background: 'rgba(255,255,255,0.02)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                        >
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>
                                    Catálogo
                                </span>
                                {catalogoLoading ? (
                                    <svg className="animate-spin w-3 h-3" style={{ color: '#1240CC' }} fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                ) : (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ color: versionesUnicas.length > 0 ? '#1240CC' : 'rgba(255,255,255,0.2)', background: versionesUnicas.length > 0 ? 'rgba(18,64,204,0.12)' : 'rgba(255,255,255,0.04)' }}>
                                        {versionesUnicas.length > 0 ? `${versionesUnicas.length} ${versionesUnicas.length === 1 ? 'versión' : 'versiones'}` : 'Sin versiones'}
                                    </span>
                                )}
                            </div>
                            <svg
                                width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                                className="transition-transform"
                                style={{ color: 'rgba(255,255,255,0.3)', transform: catalogoOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                            >
                                <polyline points="6 9 12 15 18 9" />
                            </svg>
                        </button>

                        {/* Contenido desplegable */}
                        {catalogoOpen && (
                            <div className="px-3 pb-3 flex flex-col gap-1">

                                {/* Badge candidato seleccionado */}
                                {catalogoSeleccionadoData && (
                                    <div
                                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg mb-1"
                                        style={{ background: 'rgba(18,64,204,0.12)', border: '1px solid rgba(18,64,204,0.3)' }}
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#1240CC" strokeWidth="3">
                                                <polyline points="20 6 9 17 4 12" />
                                            </svg>
                                            <span className="text-[11px] font-bold truncate" style={{ color: '#3366FF' }}>
                                                {catalogoSeleccionadoData.marca} {catalogoSeleccionadoData.modelo} {catalogoSeleccionadoData.version}
                                                {catalogoSeleccionadoData.fec_ini_comerc ? ` · ${new Date(catalogoSeleccionadoData.fec_ini_comerc).getFullYear()}` : ''}
                                                {catalogoSeleccionadoData.fec_fin_comerc ? `–${new Date(catalogoSeleccionadoData.fec_fin_comerc).getFullYear()}` : ''}
                                                <span style={{ fontFamily: 'monospace', color: 'rgba(255,255,255,0.6)' }}>{` · ID: ${catalogoSeleccionadoData.id_veh}`}</span>
                                            </span>
                                        </div>
                                        <button
                                            title="Limpia la selección. Los campos del formulario no se restauran."
                                            onClick={e => { e.stopPropagation(); handleLimpiarCatalogo(); }}
                                            className="text-[10px] font-bold shrink-0 transition-colors px-1.5 py-0.5 rounded"
                                            style={{ color: 'rgba(255,255,255,0.4)' }}
                                            onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                                            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}
                                        >
                                            × Limpiar
                                        </button>
                                    </div>
                                )}

                                {/* Lista de versiones únicas */}
                                {catalogoCandidatos.length === 0 && !catalogoLoading && (
                                    <p className="text-xs py-2 px-1" style={{ color: 'rgba(255,255,255,0.25)' }}>
                                        {formData.D1 || formData.D3
                                            ? 'Sin versiones para estos datos. Prueba a simplificar el modelo o verifica el año.'
                                            : 'Rellena Marca y Modelo para buscar en el catálogo.'}
                                    </p>
                                )}

                                <div className="overflow-y-auto custom-scrollbar" style={{ maxHeight: '320px' }}>
                                {versionesUnicas.map((c: any, i: number) => {
                                    const yearIni = c.fec_ini_comerc ? new Date(c.fec_ini_comerc).getFullYear() : null;
                                    const rawYearFin = c.fec_fin_comerc ? new Date(c.fec_fin_comerc).getFullYear() : null;
                                    const currentYear = new Date().getFullYear();
                                    const yearFinStr = !rawYearFin || rawYearFin >= currentYear ? 'actualidad' : String(rawYearFin);
                                    const yearStr = yearIni ? `${yearIni}–${yearFinStr}` : '';
                                    const pvp = c.pvp && c.pvp > 0
                                        ? `${(Math.round(c.pvp * 10) / 10).toLocaleString('es-ES')}K €`
                                        : null;
                                    const isSelected = catalogoSeleccionado === c.id_veh;
                                    const scoreColor = c.score >= 80 ? '#10B981' : c.score >= 70 ? '#F59E0B' : '#1240CC';
                                    const infoLine = [
                                        yearStr,
                                        c.kw ? `${c.kw} kW` : null,
                                        c.combustible || null,
                                    ].filter(Boolean).join(' · ');
                                    return (
                                        <div
                                            key={c.id_veh || i}
                                            onClick={() => handleSelectCandidato(c)}
                                            className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-lg cursor-pointer transition-colors"
                                            style={{
                                                borderBottom: i < versionesUnicas.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                                                background: isSelected ? 'rgba(18,64,204,0.15)' : 'rgba(255,255,255,0.02)',
                                                borderLeft: isSelected ? '3px solid #1240CC' : '3px solid transparent',
                                            }}
                                            onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(18,64,204,0.08)'; }}
                                            onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'; }}
                                        >
                                            <div className="flex flex-col min-w-0 gap-0.5">
                                                <span className="text-xs font-bold truncate" style={{ color: 'rgba(255,255,255,0.85)' }}>
                                                    {c.version || '(sin versión)'}
                                                </span>
                                                {infoLine && (
                                                    <span className="text-[10px] truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>
                                                        {infoLine}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex flex-col items-end gap-0.5 shrink-0">
                                                <span className="text-xs font-black" style={{ color: scoreColor }}>{c.score}%</span>
                                                {pvp && (
                                                    <span className="text-[10px] font-bold" style={{ color: 'rgba(255,255,255,0.6)' }}>{pvp}</span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
