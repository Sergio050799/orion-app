"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { decodeFieldValue, decodeCL } from "@/core/pipelines/ficha_tecnica/dictionary-decoder";
import { estimateDate } from "@/core/_source_of_truth/plates/engine";
import { DocumentService } from "@/services/document-service";

/* ── design tokens ─────────────────────────────────────────── */

const glass: React.CSSProperties = {
    background: 'rgba(12, 28, 82, 0.75)',
    border: '1px solid rgba(61, 112, 255, 0.22)',
    borderRadius: 22,
    boxShadow:
        '0 30px 80px -20px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.06) inset, 0 0 0 1px rgba(61,112,255,0.14) inset',
};

const inputStyle: React.CSSProperties = {
    background: 'rgba(6,14,50,0.55)',
    border: '1px solid rgba(61,112,255,0.22)',
    borderRadius: 10,
    color: '#FFFFFF',
    fontSize: 13,
    padding: '10px 12px',
    outline: 'none',
    width: '100%',
    fontFamily: 'inherit',
};

const labelStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    color: 'rgba(70,120,255,0.8)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
};

const FUEL_OPTIONS = [
    { value: 'D', label: 'Diesel' },
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

/* ── ScoreRing ─────────────────────────────────────────────── */

function ScoreRing({ score, size = 44 }: { score: number; size?: number }) {
    const r = 18;
    const circ = 2 * Math.PI * r;
    const offset = circ - (score / 100) * circ;
    const color = score >= 85 ? '#3366FF' : score >= 70 ? '#BDD4FF' : '#7FA8D4';

    return (
        <svg width={size} height={size} viewBox="0 0 44 44">
            <circle
                cx="22" cy="22" r={r}
                fill="none"
                stroke="rgba(61,112,255,0.16)"
                strokeWidth="3.5"
            />
            <circle
                cx="22" cy="22" r={r}
                fill="none"
                stroke={color}
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeDasharray={circ}
                strokeDashoffset={offset}
                transform="rotate(-90 22 22)"
                style={{ transition: 'stroke-dashoffset 0.5s ease' }}
            />
            <text
                x="22" y="22"
                textAnchor="middle"
                dominantBaseline="central"
                fill={color}
                fontSize="11"
                fontWeight="800"
            >
                {score}
            </text>
        </svg>
    );
}

/* ── page ──────────────────────────────────────────────────── */

export default function VehicleDetectionPage() {
    const [isLoading, setIsLoading] = useState(false);
    const [saved, setSaved] = useState(false);
    const [cvManuallyEdited, setCvManuallyEdited] = useState(false);
    const [catalogoCandidatos, setCatalogoCandidatos] = useState<any[]>([]);
    const [catalogoLoading, setCatalogoLoading] = useState(false);
    const [catalogoSeleccionado, setCatalogoSeleccionado] = useState<string | null>(null);
    const [catalogoSeleccionadoData, setCatalogoSeleccionadoData] = useState<any | null>(null);
    const [fuelOpen, setFuelOpen] = useState(false);
    const [sortBy, setSortBy] = useState<'score' | 'precio' | 'anio'>('score');
    const debounceRef = useRef<NodeJS.Timeout>(undefined);
    const fuelRef = useRef<HTMLDivElement>(null);

    const [formData, setFormData] = useState(INITIAL_FORM);
    // Fields locked for manual input (won't be overwritten by catalog selection)
    const [manualFields, setManualFields] = useState<Set<string>>(new Set());
    // Fields auto-filled from catalog (show badge)
    const [catalogFields, setCatalogFields] = useState<Set<string>>(new Set());

    const toggleManualField = (name: string) => {
        setManualFields(prev => {
            const next = new Set(prev);
            if (next.has(name)) {
                next.delete(name);
            } else {
                next.add(name);
                // Clear catalog fill indicator when manually locked
                setCatalogFields(cf => { const n = new Set(cf); n.delete(name); return n; });
                setFormData(p => ({ ...p, [name]: '' }));
            }
            return next;
        });
    };

    /* ── handlers (unchanged logic) ── */

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        const upperValue = value.toUpperCase();
        if (name === 'powerCv') setCvManuallyEdited(true);
        if ((name === 'D1' || name === 'D3') && catalogoSeleccionado) {
            setCatalogoSeleccionado(null);
            setCatalogoSeleccionadoData(null);
        }
        // Mark field as manually edited → remove from catalog set
        setCatalogFields(prev => { const n = new Set(prev); n.delete(name); return n; });
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
        if (decoded.includes("No disponible") || decoded === "Dato vacio") return null;
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

    let fechaMatriculacionEstimada = "";
    if (formData.plate) {
        const est = estimateDate(formData.plate);
        if (est) {
            fechaMatriculacionEstimada = est.month ? `${String(est.month).padStart(2, '0')}/${est.year}` : `${est.year}`;
        }
    }

    const versionesUnicas = useMemo(() => {
        const map = new Map<string, any>();
        for (const c of catalogoCandidatos) {
            const key = c.version || '';
            if (!map.has(key) || c.score > map.get(key).score) {
                map.set(key, c);
            }
        }
        const arr = Array.from(map.values());
        if (sortBy === 'score') arr.sort((a, b) => b.score - a.score);
        else if (sortBy === 'precio') arr.sort((a, b) => (b.pvp || 0) - (a.pvp || 0));
        else if (sortBy === 'anio') {
            arr.sort((a, b) => {
                const ya = a.fec_ini_comerc ? new Date(a.fec_ini_comerc).getFullYear() : 0;
                const yb = b.fec_ini_comerc ? new Date(b.fec_ini_comerc).getFullYear() : 0;
                return yb - ya;
            });
        }
        return arr;
    }, [catalogoCandidatos, sortBy]);

    const handleSelectCandidato = (c: any) => {
        setCatalogoSeleccionado(c.id_veh);
        setCatalogoSeleccionadoData(c);
        setCvManuallyEdited(false);
        const autoFilled = new Set<string>();
        setFormData(prev => {
            const apply = (field: string, val: string | undefined) => {
                if (!val || manualFields.has(field)) return prev[field as keyof typeof prev];
                autoFilled.add(field);
                return val;
            };
            return {
                ...prev,
                D1: apply('D1', c.marca) as string,
                D3: apply('D3', c.modelo) as string,
                acabado: apply('acabado', c.version) as string,
                P2: apply('P2', c.kw ? String(c.kw) : undefined) as string,
                P1: apply('P1', c.cilindrada ? String(c.cilindrada) : undefined) as string,
                S1: apply('S1', c.num_plazas_min ? String(c.num_plazas_min) : undefined) as string,
                P3: apply('P3', c.combustible) as string,
                G: apply('G', c.tara ? String(c.tara) : undefined) as string,
                F2: apply('F2', c.pma && c.pma > 0 ? String(c.pma) : undefined) as string,
            };
        });
        setCatalogFields(autoFilled);
    };

    /* ── effects (unchanged logic) ── */

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
                }
            } catch { /* silent */ } finally {
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
            const resParts = [];
            if (makeModel) resParts.push(makeModel);
            if (vehicleClassLabel) resParts.push(vehicleClassLabel.charAt(0).toUpperCase() + vehicleClassLabel.slice(1).toLowerCase());
            else if (formData.CL) resParts.push(`Clase vehiculo: ${formData.CL}`);
            if (bodyLabel) resParts.push(bodyLabel);
            if (formData.S1) resParts.push(`${formData.S1} plazas`);

            let motorStr = "";
            if (formData.P2 && formData.powerCv) motorStr = `${formData.P2} kW (${formData.powerCv} CV)`;
            else if (formData.P2) motorStr = `${formData.P2} kW`;
            if (formData.P1) motorStr += (motorStr ? ` / ${formData.P1} cc` : `${formData.P1} cc`);

            let mmaStr = formData.F2 ? `MMA ${formData.F2} kg` : "";
            let techLine = [motorStr, mmaStr].filter(Boolean).join(" / ");
            let resumen = [resParts.join(" / "), techLine].filter(Boolean).join("\n");

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
            alert("Error al guardar el vehiculo.");
        } finally {
            setIsLoading(false);
        }
    };

    /* ── render helpers ── */

    const fieldBlock = (
        label: string,
        name: string,
        opts?: { placeholder?: string; readOnly?: boolean; value?: string; required?: boolean; fullWidth?: boolean }
    ) => {
        const fromCatalog = catalogFields.has(name);
        const isManualLocked = manualFields.has(name);
        return (
            <div className={opts?.fullWidth ? 'col-span-2' : ''} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <label style={labelStyle}>
                        {label}{opts?.required && <span style={{ color: '#3366FF', marginLeft: 3 }}>&middot;</span>}
                    </label>
                    {!opts?.readOnly && (
                        <button
                            type="button"
                            onClick={() => toggleManualField(name)}
                            title={isManualLocked ? 'Campo manual (clic para auto)' : fromCatalog ? 'Dato del catálogo (clic para editar manual)' : 'Manual'}
                            style={{
                                fontSize: 8, fontWeight: 800, padding: '1px 5px', borderRadius: 4, border: 'none',
                                cursor: 'pointer', letterSpacing: '0.04em',
                                background: isManualLocked ? 'rgba(239,68,68,0.2)' : fromCatalog ? 'rgba(51,102,255,0.2)' : 'transparent',
                                color: isManualLocked ? '#f87171' : fromCatalog ? '#3366FF' : 'transparent',
                                transition: 'all 0.15s',
                            }}>
                            {isManualLocked ? 'M' : fromCatalog ? 'C' : 'M'}
                        </button>
                    )}
                </div>
                <input
                    name={name}
                    value={opts?.value !== undefined ? opts.value : (formData as any)[name] ?? ''}
                    onChange={opts?.readOnly ? undefined : handleChange}
                    readOnly={opts?.readOnly || isManualLocked ? false : false}
                    placeholder={isManualLocked ? 'Entrada manual...' : opts?.placeholder}
                    style={{
                        ...inputStyle,
                        ...(opts?.readOnly ? { opacity: 0.45, cursor: 'not-allowed' } : {}),
                        ...(fromCatalog && !isManualLocked ? { borderColor: 'rgba(51,102,255,0.45)' } : {}),
                        ...(isManualLocked ? { borderColor: 'rgba(239,68,68,0.45)' } : {}),
                    }}
                />
            </div>
        );
    };

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', paddingTop: 8, gap: 0 }}
             className="animate-in fade-in duration-500">

            {/* ── Zone header ── */}
            <div style={{ marginBottom: 28, paddingLeft: 2 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(178,198,245,0.6)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6 }}>
                    Catalogo de vehiculos
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 4, height: 28, borderRadius: 4, background: 'linear-gradient(180deg, #1240CC, #3366FF)' }} />
                    <h1 style={{ fontSize: 26, fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.02em', margin: 0 }}>
                        Identificacion
                    </h1>
                </div>
            </div>

            {/* ── Two-column grid ── */}
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, minHeight: 0 }}>

                {/* ════════════ LEFT: Form card ════════════ */}
                <div style={{ ...glass, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                    {/* card header */}
                    <div style={{ padding: '24px 28px 18px', borderBottom: '1px solid rgba(61,112,255,0.14)' }}>
                        <h2 style={{ fontSize: 16, fontWeight: 800, color: '#FFFFFF', margin: 0 }}>
                            Datos del vehiculo
                        </h2>
                        <p style={{ fontSize: 12, color: 'rgba(178,198,245,0.6)', marginTop: 4 }}>
                            Rellena los campos. Los marcados con <span style={{ color: '#3366FF' }}>&middot;</span> son requeridos.
                        </p>
                    </div>

                    {/* scrollable form */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 16px' }} className="custom-scrollbar">
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

                            {/* Marca (select-like) */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <label style={labelStyle}>
                                    Marca (D.1)<span style={{ color: '#3366FF', marginLeft: 3 }}>&middot;</span>
                                </label>
                                <input
                                    name="D1"
                                    value={formData.D1}
                                    onChange={handleChange}
                                    placeholder="Ej: VOLKSWAGEN"
                                    style={inputStyle}
                                />
                            </div>

                            {/* Modelo */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <label style={labelStyle}>
                                    Modelo (D.3)<span style={{ color: '#3366FF', marginLeft: 3 }}>&middot;</span>
                                </label>
                                <input
                                    name="D3"
                                    value={formData.D3}
                                    onChange={handleChange}
                                    placeholder="Ej: GOLF"
                                    style={inputStyle}
                                />
                            </div>

                            {/* Potencia kW */}
                            {fieldBlock('Potencia kW (P.2)', 'P2', { placeholder: 'Ej: 110' })}

                            {/* Combustible (select dropdown) */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }} ref={fuelRef}>
                                <label style={labelStyle}>Combustible (P.3)</label>
                                <button
                                    type="button"
                                    onClick={() => setFuelOpen(o => !o)}
                                    style={{
                                        ...inputStyle,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        color: formData.P3 ? '#FFFFFF' : 'rgba(178,198,245,0.42)',
                                    }}
                                >
                                    <span>{formData.P3 ? FUEL_OPTIONS.find(o => o.value === formData.P3)?.label : 'Selecciona...'}</span>
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                                        style={{ color: 'rgba(178,198,245,0.5)', transform: fuelOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                                        <polyline points="6 9 12 15 18 9" />
                                    </svg>
                                </button>
                                {fuelOpen && (
                                    <div style={{
                                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: 4,
                                        background: 'rgba(3,10,42,0.97)', border: '1px solid rgba(51,102,255,0.22)',
                                        borderRadius: 12, maxHeight: 220, overflowY: 'auto',
                                        boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
                                    }} className="custom-scrollbar">
                                        {FUEL_OPTIONS.map(opt => {
                                            const isSel = formData.P3 === opt.value;
                                            return (
                                                <button
                                                    key={opt.value}
                                                    type="button"
                                                    onClick={() => {
                                                        setFormData(prev => ({ ...prev, P3: opt.value }));
                                                        setSaved(false);
                                                        setFuelOpen(false);
                                                    }}
                                                    style={{
                                                        display: 'block', width: '100%', textAlign: 'left',
                                                        padding: '8px 14px', fontSize: 12, fontWeight: 600,
                                                        color: isSel ? '#FFFFFF' : '#BDD4FF',
                                                        background: isSel ? 'rgba(51,102,255,0.15)' : 'transparent',
                                                        border: 'none', cursor: 'pointer',
                                                        borderLeft: isSel ? '2px solid #3366FF' : '2px solid transparent',
                                                    }}
                                                    onMouseEnter={e => { if (!isSel) (e.currentTarget.style.background = 'rgba(61,112,255,0.12)'); }}
                                                    onMouseLeave={e => { if (!isSel) (e.currentTarget.style.background = 'transparent'); }}
                                                >
                                                    {opt.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Anio (fecha primera matriculacion) */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <label style={labelStyle}>Anio (1a Mat.)</label>
                                <input
                                    name="fechaPrimeraMatriculacion"
                                    value={formData.fechaPrimeraMatriculacion}
                                    onChange={handleChange}
                                    placeholder="MM/AAAA"
                                    style={inputStyle}
                                />
                            </div>

                            {/* Plazas */}
                            {fieldBlock('Plazas (S.1)', 'S1', { placeholder: 'Ej: 5' })}

                            {/* Cilindrada */}
                            {fieldBlock('Cilindrada (P.1)', 'P1', { placeholder: 'Ej: 1968' })}

                            {/* MMA */}
                            {fieldBlock('MMA (F.2)', 'F2', { placeholder: 'Ej: 2350' })}

                            {/* Bastidor VIN — full width */}
                            {fieldBlock('Bastidor VIN (E)', 'E', { placeholder: 'Ej: WVWZZZ1KZYW000001', fullWidth: true })}

                            {/* Matricula — full width */}
                            {fieldBlock('Matricula', 'plate', { placeholder: 'Ej: 1234 ABC', required: true, fullWidth: true })}

                            {/* Classification fields */}
                            {fieldBlock('Clase vehiculo (CL)', 'CL', { placeholder: 'Ej: 1000' })}
                            {fieldBlock('Categoria UE (J)', 'J', { placeholder: 'Ej: M1' })}
                            {fieldBlock('Carroceria (J.1)', 'J1', { placeholder: 'Ej: AA' })}
                            <input type="hidden" name="G" value={formData.G} />
                            <input type="hidden" name="acabado" value={formData.acabado} />
                            <input type="hidden" name="powerCv" value={formData.powerCv} />
                        </div>

                        {/* Hibrido toggle */}
                        <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
                            <button
                                type="button"
                                onClick={() => setFormData(prev => ({ ...prev, esHibridoManual: !prev.esHibridoManual }))}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    color: formData.esHibridoManual ? '#3366FF' : 'rgba(178,198,245,0.5)',
                                    fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                                }}
                            >
                                <div style={{
                                    width: 32, height: 16, borderRadius: 8, position: 'relative',
                                    background: formData.esHibridoManual ? 'rgba(51,102,255,0.35)' : 'rgba(178,198,245,0.18)',
                                    transition: 'background 0.2s',
                                }}>
                                    <div style={{
                                        position: 'absolute', top: 2, width: 12, height: 12, borderRadius: 6,
                                        background: formData.esHibridoManual ? '#3366FF' : 'rgba(178,198,245,0.5)',
                                        left: formData.esHibridoManual ? 18 : 2,
                                        transition: 'left 0.2s, background 0.2s',
                                    }} />
                                </div>
                                Vehiculo hibrido
                            </button>
                        </div>

                        {formData.esHibridoManual && (
                            <div style={{ marginTop: 12 }}>
                                {fieldBlock('Motor electrico kW (P.2.1)', 'P21', { placeholder: 'Ej: 13.19' })}
                            </div>
                        )}
                    </div>

                    {/* card footer */}
                    <div style={{ padding: '16px 28px 20px', borderTop: '1px solid rgba(61,112,255,0.14)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 11, color: 'rgba(178,198,245,0.6)' }}>
                                {catalogoLoading
                                    ? 'Buscando...'
                                    : `${versionesUnicas.length} coincidencia${versionesUnicas.length !== 1 ? 's' : ''} encontrada${versionesUnicas.length !== 1 ? 's' : ''} en catalogo SINCO`}
                            </span>
                            <button
                                onClick={handleSave}
                                disabled={isLoading || saved || !formData.plate}
                                style={{
                                    padding: '10px 24px',
                                    borderRadius: 10,
                                    border: 'none',
                                    fontWeight: 700,
                                    fontSize: 13,
                                    cursor: isLoading || saved || !formData.plate ? 'not-allowed' : 'pointer',
                                    color: '#FFFFFF',
                                    background: saved ? '#10B981' : 'linear-gradient(135deg, #1240CC, #3366FF)',
                                    opacity: (!formData.plate && !saved) ? 0.5 : 1,
                                    transition: 'opacity 0.2s',
                                }}
                            >
                                {isLoading ? 'Guardando...' : saved ? 'Guardado' : 'Registrar vehiculo'}
                            </button>
                        </div>
                        {saved && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: '#10B981', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                    Vehiculo incorporado con exito
                                </span>
                                <button
                                    onClick={() => {
                                        setFormData(INITIAL_FORM);
                                        setCatalogoSeleccionado(null);
                                        setCatalogoSeleccionadoData(null);
                                        setCatalogoCandidatos([]);
                                        setCvManuallyEdited(false);
                                        setSaved(false);
                                    }}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 700, color: '#3366FF', textTransform: 'uppercase', letterSpacing: '0.08em' }}
                                >
                                    + Nueva entrada
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* ════════════ RIGHT: Results card ════════════ */}
                <div style={{ ...glass, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                    {/* card header */}
                    <div style={{ padding: '24px 28px 18px', borderBottom: '1px solid rgba(61,112,255,0.14)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                        <div>
                            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#FFFFFF', margin: 0 }}>
                                Resultados
                            </h2>
                            <p style={{ fontSize: 12, color: 'rgba(178,198,245,0.6)', marginTop: 4 }}>
                                Ordenados por score de coincidencia
                            </p>
                        </div>
                        {/* Sort dropdown */}
                        <select
                            value={sortBy}
                            onChange={e => setSortBy(e.target.value as any)}
                            style={{
                                ...inputStyle,
                                width: 'auto',
                                padding: '6px 12px',
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: 'pointer',
                                appearance: 'auto' as any,
                            }}
                        >
                            <option value="score">Score</option>
                            <option value="precio">Precio</option>
                            <option value="anio">Anio</option>
                        </select>
                    </div>

                    {/* results list */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px 20px' }} className="custom-scrollbar">

                        {catalogoLoading && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
                                <svg className="animate-spin" style={{ color: '#3366FF', width: 24, height: 24 }} fill="none" viewBox="0 0 24 24">
                                    <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                            </div>
                        )}

                        {!catalogoLoading && versionesUnicas.length === 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', textAlign: 'center' }}>
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(51,102,255,0.25)" strokeWidth="1.5" style={{ marginBottom: 16 }}>
                                    <circle cx="11" cy="11" r="8" />
                                    <path d="m21 21-4.3-4.3" />
                                </svg>
                                <p style={{ fontSize: 13, color: 'rgba(178,198,245,0.5)', maxWidth: 260, lineHeight: 1.5 }}>
                                    {formData.D1 || formData.D3
                                        ? 'Sin versiones para estos datos. Prueba a simplificar el modelo o verifica el anio.'
                                        : 'Rellena Marca y Modelo para buscar coincidencias en el catalogo.'}
                                </p>
                            </div>
                        )}

                        {!catalogoLoading && versionesUnicas.map((c: any, i: number) => {
                            const yearIni = c.fec_ini_comerc ? new Date(c.fec_ini_comerc).getFullYear() : null;
                            const rawYearFin = c.fec_fin_comerc ? new Date(c.fec_fin_comerc).getFullYear() : null;
                            const currentYear = new Date().getFullYear();
                            const yearFinStr = !rawYearFin || rawYearFin >= currentYear ? 'actualidad' : String(rawYearFin);
                            const yearStr = yearIni ? `${yearIni} - ${yearFinStr}` : '';
                            const pvp = c.pvp && c.pvp > 0
                                ? `${(Math.round(c.pvp * 10) / 10).toLocaleString('es-ES')}K`
                                : null;
                            const isSelected = catalogoSeleccionado === c.id_veh;
                            const infoLine = [
                                yearStr,
                                c.kw ? `${c.kw} kW` : null,
                                c.combustible || null,
                            ].filter(Boolean).join(' / ');

                            return (
                                <div
                                    key={c.id_veh || i}
                                    onClick={() => handleSelectCandidato(c)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: 16,
                                        padding: '14px 16px',
                                        marginBottom: 8,
                                        borderRadius: 14,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        background: isSelected ? 'rgba(61,112,255,0.16)' : 'rgba(3,10,42,0.35)',
                                        border: isSelected
                                            ? '1px solid rgba(51,102,255,0.45)'
                                            : '1px solid rgba(61,112,255,0.12)',
                                        boxShadow: isSelected
                                            ? '0 0 20px rgba(51,102,255,0.15), 0 0 0 1px rgba(51,102,255,0.2) inset'
                                            : 'none',
                                    }}
                                    onMouseEnter={e => {
                                        if (!isSelected) {
                                            (e.currentTarget as HTMLElement).style.background = 'rgba(61,112,255,0.12)';
                                            (e.currentTarget as HTMLElement).style.borderColor = 'rgba(51,102,255,0.22)';
                                        }
                                    }}
                                    onMouseLeave={e => {
                                        if (!isSelected) {
                                            (e.currentTarget as HTMLElement).style.background = 'rgba(3,10,42,0.35)';
                                            (e.currentTarget as HTMLElement).style.borderColor = 'rgba(61,112,255,0.12)';
                                        }
                                    }}
                                >
                                    {/* left: marca / modelo / meta */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {c.marca} {c.modelo}
                                        </div>
                                        <div style={{ fontSize: 11, color: '#BDD4FF', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {c.version || '(sin version)'}
                                        </div>
                                        {infoLine && (
                                            <div style={{ fontSize: 10, color: 'rgba(178,198,245,0.6)', marginTop: 3 }}>
                                                {infoLine}
                                            </div>
                                        )}
                                    </div>

                                    {/* right: ScoreRing + price */}
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                                        <ScoreRing score={c.score} />
                                        {pvp && (
                                            <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(178,198,245,0.6)' }}>
                                                {pvp} &euro;
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
