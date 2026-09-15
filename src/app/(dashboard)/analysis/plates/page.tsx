"use client";

import { useState, useRef, useEffect } from "react";
import { resolvePlateFromSeed } from "@/core/_source_of_truth/plates/resolver";

interface PlateCalculation {
    plate: string;
    originalInput: string;
    date: string | null;
    age: string;
    isClassic: boolean;
    confidence: number;
    type: "Standard" | "Semirremolque" | "Unknown";
}

interface SilverdatVehicle {
    matricula: string;
    vin?: string;
    marca?: string;
    modelo?: string;
    version?: string;
    variante?: string;
    combustible?: string;
    kw?: number;
    cv?: number;
    cilindrada?: number;
    plazas?: number;
    puertas?: number;
    anyo_fabricacion?: string;
    fecha_matriculacion?: string;
    tara?: number;
    tipo_vehiculo?: string;
    etiqueta_dgt?: string;
    co2?: number;
    euro?: string;
    tipo_cambio?: string;
    color?: string;
    kilometraje?: number;
    precio_nuevo?: number;
    precio_nuevo_total?: number;
    valor_venta?: number;
    valor_compra?: number;
    num_titulares?: number;
    servicio?: string;
    tipo_alimentacion?: string;
    renting?: string;
}

const GLASS_CARD: React.CSSProperties = {
    background: 'rgba(12, 28, 82, 0.75)',
    border: '1px solid rgba(61, 112, 255, 0.22)',
    borderRadius: 22,
    boxShadow: '0 30px 80px -20px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.06) inset, 0 0 0 1px rgba(61,112,255,0.14) inset',
};

const BUTTON_PRIMARY: React.CSSProperties = {
    background: 'linear-gradient(135deg, #1240CC, #3366FF)',
    color: '#FFFFFF',
    border: 'none',
    cursor: 'pointer',
};

// ─── Silverdat login modal ────────────────────────────────────────────────────

function SilverdatModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
    const [datId, setDatId] = useState('');
    const [user, setUser] = useState('');
    const [pass, setPass] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleLogin = async () => {
        if (!datId.trim() || !user.trim() || !pass.trim()) return;
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/silverdat/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ datId: datId.trim(), user: user.trim(), pass: pass.trim() }),
            });
            const data = await res.json();
            if (data.ok) {
                onSuccess();
            } else {
                setError((data.error || 'Error de autenticación') + (data.debug ? `\n\nDEBUG: ${data.debug}` : ''));
            }
        } catch {
            setError('Error de conexión');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        }} onClick={onClose}>
            <div onClick={e => e.stopPropagation()} style={{
                width: 360, padding: 28, borderRadius: 18,
                background: 'rgba(8,22,72,0.97)', border: '1px solid rgba(245,158,11,0.25)',
                boxShadow: '0 30px 80px rgba(0,0,0,0.7)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #f59e0b, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: '#fff' }}>S</div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: 16, color: '#FFFFFF', fontWeight: 700 }}>Silverdat</h2>
                        <p style={{ margin: 0, fontSize: 11, color: 'rgba(178,198,245,0.6)' }}>Credenciales DAT / fastVALUATE</p>
                    </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <input autoFocus placeholder="DAT N. Cliente" value={datId} onChange={e => setDatId(e.target.value)} className="orion-input" style={{ fontSize: 13 }} onKeyDown={e => { if (e.key === 'Enter') handleLogin(); }} />
                    <input placeholder="Usuario" value={user} onChange={e => setUser(e.target.value)} className="orion-input" style={{ fontSize: 13 }} onKeyDown={e => { if (e.key === 'Enter') handleLogin(); }} />
                    <input placeholder="Contraseña" type="password" value={pass} onChange={e => setPass(e.target.value)} className="orion-input" style={{ fontSize: 13 }} onKeyDown={e => { if (e.key === 'Enter') handleLogin(); }} />
                </div>
                {error && <pre style={{ margin: '10px 0 0', fontSize: 11, color: '#ef4444', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 100, overflow: 'auto', background: 'rgba(239,68,68,0.06)', padding: 8, borderRadius: 8 }}>{error}</pre>}
                <p style={{ margin: '12px 0', fontSize: 10, color: 'rgba(178,198,245,0.42)', lineHeight: 1.4 }}>Las credenciales NO se guardan. Solo para esta sesión.</p>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={handleLogin} disabled={loading || !datId.trim() || !user.trim() || !pass.trim()} style={{ flex: 1, fontSize: 12, fontWeight: 700, padding: '10px 0', borderRadius: 10, background: loading ? 'rgba(245,158,11,0.3)' : 'linear-gradient(135deg, #d97706, #f59e0b)', color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer' }}>
                        {loading ? 'Conectando...' : 'Iniciar sesión'}
                    </button>
                    <button onClick={onClose} style={{ fontSize: 12, padding: '10px 16px', borderRadius: 10, background: 'rgba(6,14,50,0.5)', color: '#BDD4FF', border: '1px solid rgba(61,112,255,0.22)', cursor: 'pointer' }}>Cancelar</button>
                </div>
            </div>
        </div>
    );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PlatesAnalysisPage() {
    const [input, setInput] = useState("");
    const [results, setResults] = useState<PlateCalculation[]>([]);
    const [sdData, setSdData] = useState<Map<string, SilverdatVehicle>>(new Map());
    const [showSdModal, setShowSdModal] = useState(false);
    const [sdLoading, setSdLoading] = useState(false);
    const [sdError, setSdError] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const el = textareaRef.current;
        if (el) { el.style.height = 'auto'; el.style.height = `${Math.max(el.scrollHeight, 200)}px`; }
    }, [input]);

    const calculateAge = (year: number, month: number | null) => {
        const now = new Date();
        const calcMonth = month ? month - 1 : 0;
        const regDate = new Date(year, calcMonth);
        const diffMs = now.getTime() - regDate.getTime();
        const diffDate = new Date(diffMs);
        const years = Math.abs(diffDate.getUTCFullYear() - 1970);
        if (month) {
            const months = diffDate.getUTCMonth();
            return `${years}a ${months}m`;
        }
        return `~${years} años`;
    };

    const getTipoLabel = (type: string) => {
        if (type === "Semirremolque") return "Semi";
        if (type === "Standard") return "Turismo";
        return "?";
    };

    const parsePlates = (raw: string): string[] => {
        const upper = raw.toUpperCase();
        const plates: string[] = [];
        const regex = /\b(R[\s-]?\d{4}[\s-]?[A-Z]{3})\b|\b(\d{4}[\s-]?[B-DF-HJ-NP-TV-Z]{3})\b/g;
        let match;
        while ((match = regex.exec(upper)) !== null) {
            const plate = (match[1] || match[2]).replace(/[\s-]/g, '');
            plates.push(plate);
        }
        return [...new Set(plates)];
    };

    const resolveSingle = (normalizedPlate: string): PlateCalculation => {
        let isSemi = false;
        let lettersMatch = null;
        let canonicalPlate = normalizedPlate;

        if (/^R\d{4}[A-Z]{3}$/.test(normalizedPlate)) {
            isSemi = true;
            lettersMatch = normalizedPlate.slice(-3);
            canonicalPlate = `R-${normalizedPlate.slice(1, 5)}-${normalizedPlate.slice(5)}`;
        } else {
            const stdMatch = normalizedPlate.match(/(\d{4})([B-DF-HJ-NP-TV-Z]{3})/);
            if (stdMatch) {
                lettersMatch = stdMatch[2];
                canonicalPlate = `${stdMatch[1]} ${stdMatch[2]}`;
            }
        }

        const resolved = lettersMatch ? resolvePlateFromSeed(lettersMatch, isSemi) : null;

        if (resolved) {
            return {
                plate: canonicalPlate,
                originalInput: normalizedPlate,
                date: resolved.month ? `${resolved.month}/${resolved.year}` : `${resolved.year}`,
                age: calculateAge(resolved.year, resolved.month),
                isClassic: (new Date().getFullYear() - resolved.year) >= 25,
                confidence: resolved.confidence,
                type: resolved.type,
            };
        }
        return {
            plate: canonicalPlate || normalizedPlate,
            originalInput: normalizedPlate,
            date: null, age: "?", isClassic: false, confidence: 0, type: "Unknown",
        };
    };

    const handleCalculate = () => {
        const plates = parsePlates(input);
        if (plates.length === 0) return;
        setResults(plates.map(resolveSingle));
        setSdData(new Map());
        setSdError('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleCalculate();
        }
    };

    // ─── Silverdat ────────────────────────────────────────────────────────────

    const doEnrich = async () => {
        setSdLoading(true);
        setSdError('');
        try {
            const plates = results.map(r => r.originalInput);
            const res = await fetch('/api/silverdat/enrich', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ matriculas: plates }),
            });
            const data = await res.json();
            if (!data.ok) throw new Error(data.error || 'Error Silverdat');

            const newMap = new Map<string, SilverdatVehicle>();
            for (const r of data.results) {
                if (r.ok && r.vehicle) newMap.set(r.matricula, r.vehicle);
            }
            setSdData(newMap);
        } catch (err: any) {
            setSdError(err.message || 'Error consultando Silverdat');
        } finally {
            setSdLoading(false);
        }
    };

    const handleSilverdat = async () => {
        if (results.length === 0 || sdLoading) return;
        setSdError('');
        try {
            const sessionRes = await fetch('/api/silverdat/login');
            const sessionData = await sessionRes.json();
            if (!sessionData.hasSession) {
                setShowSdModal(true);
                return;
            }
        } catch { /* if check fails, show modal */ setShowSdModal(true); return; }
        await doEnrich();
    };

    const handleSdModalSuccess = () => {
        setShowSdModal(false);
        doEnrich();
    };

    // ─── Export ───────────────────────────────────────────────────────────────

    const handleExport = async () => {
        if (results.length === 0) return;

        if (sdData.size > 0) {
            const ExcelJS = (await import('exceljs')).default;
            const rows = results.map(r => {
                const sd = sdData.get(r.originalInput);
                return {
                    'Matrícula': r.plate,
                    'Fecha Estimada': r.date || 'N/A',
                    'Antigüedad': r.age,
                    'Tipo': r.type === 'Semirremolque' ? 'Semirremolque' : r.type === 'Standard' ? 'Turismo / Furgoneta' : 'Desconocido',
                    'Clásico': r.isClassic ? 'Sí' : 'No',
                    'VIN': sd?.vin || '',
                    'Marca': sd?.marca || '',
                    'Modelo': sd?.modelo || '',
                    'Versión': sd?.version || '',
                    'Variante': sd?.variante || '',
                    'Combustible': sd?.combustible || '',
                    'kW': sd?.kw ?? '',
                    'CV': sd?.cv ?? '',
                    'Cilindrada (cc)': sd?.cilindrada ?? '',
                    'Plazas': sd?.plazas ?? '',
                    'Puertas': sd?.puertas ?? '',
                    'Tipo Vehículo': sd?.tipo_vehiculo || '',
                    'Etiqueta DGT': sd?.etiqueta_dgt || '',
                    'CO2 (g/km)': sd?.co2 ?? '',
                    'Norma Euro': sd?.euro || '',
                    'Año Fabricación': sd?.anyo_fabricacion || '',
                    'Fecha Matriculación': sd?.fecha_matriculacion || '',
                    'Km': sd?.kilometraje ?? '',
                    'Precio Nuevo (€)': sd?.precio_nuevo ?? '',
                    'Precio Nuevo Total (€)': sd?.precio_nuevo_total ?? '',
                    'Valor Venta (€)': sd?.valor_venta ?? '',
                    'Valor Compra (€)': sd?.valor_compra ?? '',
                    'Nº Titulares': sd?.num_titulares ?? '',
                    'Servicio': sd?.servicio || '',
                    'Tipo Alimentación': sd?.tipo_alimentacion || '',
                    'Cambio': sd?.tipo_cambio || '',
                    'Tara (kg)': sd?.tara ?? '',
                    'Renting': sd?.renting || '',
                    'Color': sd?.color || '',
                };
            });
            const wb = new ExcelJS.Workbook();
            wb.creator = 'MMT Seguros';
            const ws = wb.addWorksheet('Matrículas');
            const headers = Object.keys(rows[0] ?? {});
            ws.columns = headers.map(h => ({ width: Math.max(h.length + 4, 14) }));

            const headerRow = ws.getRow(1);
            headers.forEach((h, i) => { headerRow.getCell(i + 1).value = h; });
            headerRow.height = 24;
            headerRow.eachCell(cell => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002F82' } };
                cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 9 };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.border = { bottom: { style: 'medium', color: { argb: 'FF002F82' } }, right: { style: 'thin', color: { argb: 'FFFFFFFF' } } };
            });

            rows.forEach((rowData, i) => {
                const row = ws.addRow(headers.map(h => (rowData as Record<string, unknown>)[h] ?? ''));
                row.height = 18;
                row.eachCell({ includeEmpty: true }, cell => {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFFFFFFF' : 'FFF0F4FA' } };
                    cell.font = { name: 'Calibri', size: 9, color: { argb: 'FF0A1628' } };
                    cell.alignment = { horizontal: 'left', vertical: 'middle' };
                    cell.border = { bottom: { style: 'thin', color: { argb: 'FFB8C8E8' } }, right: { style: 'thin', color: { argb: 'FFB8C8E8' } } };
                });
            });

            const buffer = await wb.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `consulta_matriculas_${new Date().toISOString().slice(0, 10)}.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
        } else {
            // Basic CSV without Silverdat
            const BOM = "﻿";
            const header = "Matrícula;Fecha Estimada;Antigüedad;Tipo";
            const rows = results.map(r =>
                `${r.plate};${r.date || "N/A"};${r.age};${r.type === "Semirremolque" ? "Semirremolque" : r.type === "Standard" ? "Turismo / Furgoneta" : "Desconocido"}`
            );
            const csv = BOM + [header, ...rows].join("\r\n");
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `consulta_matriculas_${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        }
    };

    const sdCount = sdData.size;
    const sdHasData = sdCount > 0;

    return (
        <div className="h-full w-full animate-in fade-in duration-500" style={{ maxWidth: 1200, margin: '0 auto', padding: '0 16px' }}>

            {showSdModal && (
                <SilverdatModal
                    onClose={() => setShowSdModal(false)}
                    onSuccess={handleSdModalSuccess}
                />
            )}

            {/* Zone Header */}
            <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                <div style={{ width: 4, height: 48, borderRadius: 2, background: 'linear-gradient(180deg, #1240CC, #3366FF)', marginTop: 2, flexShrink: 0 }} />
                <div>
                    <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#3366FF', marginBottom: 4 }}>
                        DGT &middot; Tráfico
                    </p>
                    <h1 style={{ fontSize: 28, fontWeight: 800, color: '#FFFFFF', margin: 0, lineHeight: 1.2 }}>
                        Consulta Matrículas
                    </h1>
                </div>
            </div>

            {/* Two-column layout */}
            <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>

                {/* LEFT — Input */}
                <div style={{ ...GLASS_CARD, padding: 24, flex: '0 0 340px', position: 'sticky', top: 16 }}>
                    <label style={{ fontSize: 10, fontWeight: 800, color: 'rgba(51,102,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8, display: 'block' }}>
                        Matrículas
                    </label>
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={"Pega aquí las matrículas...\n\n1234BBB 5678GKL 9012HHH\n\no una por línea:\n1234 BBB\n5678 GKL\nR 9012 BTS"}
                        spellCheck={false}
                        style={{
                            width: '100%', minHeight: 200,
                            background: 'rgba(6,14,50,0.55)',
                            border: '1px solid rgba(51,102,255,0.15)',
                            borderRadius: 12, color: '#FFFFFF',
                            fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Consolas, monospace',
                            fontSize: 14, fontWeight: 600, letterSpacing: '0.05em',
                            padding: '14px 16px', outline: 'none', resize: 'vertical', lineHeight: 1.8,
                            caretColor: '#3366FF',
                        }}
                    />

                    <p style={{ fontSize: 10, color: 'rgba(178,198,245,0.5)', marginTop: 8, marginBottom: 12, lineHeight: 1.5 }}>
                        Separadas por espacios, comas, o saltos de línea.
                    </p>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: results.length > 0 ? 10 : 0 }}>
                        <button
                            onClick={handleCalculate}
                            disabled={!input.trim()}
                            style={{
                                ...BUTTON_PRIMARY,
                                flex: 1, padding: '12px 0', borderRadius: 10,
                                fontSize: 12, fontWeight: 800,
                                letterSpacing: '0.08em', textTransform: 'uppercase',
                                opacity: input.trim() ? 1 : 0.4,
                                transition: 'opacity 0.2s',
                            }}
                        >
                            Consultar
                        </button>
                        {results.length > 0 && (
                            <button
                                onClick={handleExport}
                                title={sdHasData ? 'Exportar Excel con datos Silverdat' : 'Exportar CSV básico'}
                                style={{
                                    background: sdHasData ? 'rgba(16,185,129,0.12)' : 'rgba(51, 102, 255, 0.1)',
                                    border: `1px solid ${sdHasData ? 'rgba(16,185,129,0.3)' : 'rgba(51, 102, 255, 0.25)'}`,
                                    borderRadius: 10, color: sdHasData ? '#10b981' : '#3366FF',
                                    padding: '12px 14px', fontSize: 11, fontWeight: 700,
                                    letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
                                }}
                            >
                                {sdHasData ? 'XLSX' : 'CSV'}
                            </button>
                        )}
                    </div>

                    {/* Silverdat button */}
                    {results.length > 0 && (
                        <button
                            onClick={handleSilverdat}
                            disabled={sdLoading}
                            style={{
                                width: '100%', padding: '11px 0', borderRadius: 10,
                                background: sdLoading
                                    ? 'rgba(245,158,11,0.15)'
                                    : sdHasData
                                        ? 'rgba(16,185,129,0.12)'
                                        : 'linear-gradient(135deg, #d97706, #f59e0b)',
                                border: sdHasData ? '1px solid rgba(16,185,129,0.3)' : 'none',
                                color: sdHasData ? '#10b981' : '#fff',
                                fontSize: 12, fontWeight: 800,
                                letterSpacing: '0.08em', textTransform: 'uppercase',
                                cursor: sdLoading ? 'not-allowed' : 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                transition: 'all 0.2s',
                            }}
                        >
                            {sdLoading ? (
                                <>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 1s linear infinite' }}>
                                        <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity="0.2" />
                                        <path d="M21 12a9 9 0 00-9-9" />
                                    </svg>
                                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                                    Consultando Silverdat...
                                </>
                            ) : sdHasData ? (
                                <>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                                    {sdCount}/{results.length} con datos
                                </>
                            ) : (
                                'Consultar Silverdat'
                            )}
                        </button>
                    )}

                    {sdError && (
                        <p style={{ marginTop: 8, fontSize: 11, color: '#ef4444', fontWeight: 600 }}>{sdError}</p>
                    )}

                    {results.length > 0 && (
                        <div style={{ marginTop: 16, padding: '8px 12px', background: 'rgba(16,185,129,0.08)', borderRadius: 8, border: '1px solid rgba(16,185,129,0.2)' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981' }}>
                                {results.length} matrícula{results.length !== 1 ? 's' : ''} detectada{results.length !== 1 ? 's' : ''}
                            </span>
                        </div>
                    )}
                </div>

                {/* RIGHT — Results */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {results.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '80px 0', opacity: 0.3 }}>
                            <div style={{
                                width: 64, height: 64, borderRadius: '50%',
                                background: 'rgba(61, 112, 255, 0.12)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                margin: '0 auto 16px',
                            }}>
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3366FF" strokeWidth="1.5">
                                    <rect x="2" y="5" width="20" height="14" rx="2" />
                                    <line x1="2" y1="10" x2="22" y2="10" />
                                </svg>
                            </div>
                            <p style={{ color: '#BDD4FF', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                Introduce matrículas a la izquierda
                            </p>
                        </div>
                    ) : (
                        results.map((res, i) => {
                            const sd = sdData.get(res.originalInput);
                            return (
                                <div key={i} style={{
                                    ...GLASS_CARD,
                                    borderRadius: 14,
                                    overflow: 'hidden',
                                }}>
                                    {/* Row principal */}
                                    <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                                        {/* Mini plate badge */}
                                        <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                                            <div style={{
                                                width: 22, height: 36,
                                                background: 'linear-gradient(180deg, #003DA5, #002D7A)',
                                                borderRadius: '4px 0 0 4px',
                                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                                                border: '1px solid rgba(51, 102, 255, 0.3)', borderRight: 'none',
                                            }}>
                                                <svg width="10" height="10" viewBox="0 0 18 18" fill="none">
                                                    {[...Array(12)].map((_, j) => {
                                                        const angle = (j * 30 - 90) * Math.PI / 180;
                                                        const cx = 9 + 6 * Math.cos(angle);
                                                        const cy = 9 + 6 * Math.sin(angle);
                                                        return <circle key={j} cx={cx} cy={cy} r="0.8" fill="#FFD700" />;
                                                    })}
                                                </svg>
                                                <span style={{ color: '#FFF', fontSize: 6, fontWeight: 800 }}>E</span>
                                            </div>
                                            <div style={{
                                                height: 36,
                                                background: 'rgba(255,255,255,0.05)',
                                                borderRadius: '0 4px 4px 0',
                                                border: '1px solid rgba(61, 112, 255, 0.22)', borderLeft: 'none',
                                                display: 'flex', alignItems: 'center', padding: '0 10px',
                                            }}>
                                                <span style={{
                                                    fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Consolas, monospace',
                                                    fontSize: 16, fontWeight: 800, color: '#FFFFFF', letterSpacing: '0.08em', whiteSpace: 'nowrap',
                                                }}>
                                                    {res.plate}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Date */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            {res.date ? (
                                                <span style={{ fontSize: 18, fontWeight: 800, color: '#FFFFFF' }}>{res.date}</span>
                                            ) : (
                                                <span style={{ fontSize: 14, color: 'rgba(178,198,245,0.42)', fontStyle: 'italic' }}>Sin datos</span>
                                            )}
                                            {sd?.marca && (
                                                <div style={{ fontSize: 12, color: 'rgba(178,198,245,0.7)', marginTop: 2, fontWeight: 600 }}>
                                                    {sd.marca} {sd.modelo}
                                                </div>
                                            )}
                                        </div>

                                        {/* Age */}
                                        <div style={{ flexShrink: 0, textAlign: 'right' }}>
                                            <span style={{
                                                fontSize: 13, fontWeight: 700,
                                                color: res.date ? (res.isClassic ? '#F59E0B' : '#10B981') : 'rgba(178,198,245,0.42)',
                                            }}>
                                                {res.age}
                                            </span>
                                        </div>

                                        {/* Badges */}
                                        <div style={{ flexShrink: 0, display: 'flex', gap: 6 }}>
                                            {res.isClassic && res.date && (
                                                <span style={{
                                                    fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em',
                                                    color: '#F59E0B', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)',
                                                    borderRadius: 5, padding: '3px 8px',
                                                }}>Clásico</span>
                                            )}
                                            <span style={{
                                                fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                                                color: res.type === 'Semirremolque' ? '#a78bfa' : 'rgba(178,198,245,0.5)',
                                                background: res.type === 'Semirremolque' ? 'rgba(167,139,250,0.1)' : 'rgba(61,112,255,0.10)',
                                                border: `1px solid ${res.type === 'Semirremolque' ? 'rgba(167,139,250,0.25)' : 'rgba(61,112,255,0.16)'}`,
                                                borderRadius: 5, padding: '3px 8px',
                                            }}>{getTipoLabel(res.type)}</span>
                                            {res.confidence > 0 && res.confidence < 1 && (
                                                <span style={{
                                                    fontSize: 9, fontWeight: 700, color: '#F59E0B',
                                                    background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                                                    borderRadius: 5, padding: '3px 8px',
                                                }} title="Fecha estimada, no exacta">~</span>
                                            )}
                                            {sd && (
                                                <span style={{
                                                    fontSize: 9, fontWeight: 800, textTransform: 'uppercase',
                                                    color: '#f59e0b', background: 'rgba(245,158,11,0.1)',
                                                    border: '1px solid rgba(245,158,11,0.25)', borderRadius: 5, padding: '3px 8px',
                                                }}>SD</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Silverdat data panel */}
                                    {sd && (
                                        <div style={{
                                            borderTop: '1px solid rgba(245,158,11,0.15)',
                                            background: 'rgba(245,158,11,0.04)',
                                            padding: '12px 20px',
                                        }}>
                                            {/* Identificación */}
                                            {(sd.version || sd.vin) && (
                                                <p style={{ margin: '0 0 8px', fontSize: 12, color: 'rgba(178,198,245,0.6)', fontStyle: 'italic' }}>
                                                    {sd.version && <span>{sd.version}</span>}
                                                    {sd.vin && <span style={{ marginLeft: 12, fontFamily: 'monospace', fontSize: 11 }}>VIN: {sd.vin}</span>}
                                                </p>
                                            )}

                                            {/* Datos técnicos */}
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '6px 20px' }}>
                                                {[
                                                    ['Combustible', sd.combustible],
                                                    ['kW / CV', sd.kw != null ? `${sd.kw} kW / ${sd.cv ?? '—'} CV` : null],
                                                    ['Cilindrada', sd.cilindrada != null ? `${sd.cilindrada} cc` : null],
                                                    ['Plazas', sd.plazas != null ? String(sd.plazas) : null],
                                                    ['Puertas', sd.puertas != null ? String(sd.puertas) : null],
                                                    ['Tipo', sd.tipo_vehiculo],
                                                    ['Etiqueta DGT', sd.etiqueta_dgt],
                                                    ['CO2', sd.co2 != null ? `${sd.co2} g/km` : null],
                                                    ['Euro', sd.euro],
                                                    ['Tara', sd.tara != null ? `${sd.tara} kg` : null],
                                                    ['Cambio', sd.tipo_cambio],
                                                    ['Servicio', sd.servicio],
                                                    ['Km', sd.kilometraje != null ? `${sd.kilometraje.toLocaleString('es-ES')} km` : null],
                                                    ['Nº Titulares', sd.num_titulares != null ? String(sd.num_titulares) : null],
                                                    ['Fecha Mat.', sd.fecha_matriculacion],
                                                    ['Año Fab.', sd.anyo_fabricacion],
                                                ].filter(([, v]) => v).map(([label, val]) => (
                                                    <div key={String(label)} style={{ display: 'flex', flexDirection: 'column' }}>
                                                        <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(245,158,11,0.5)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
                                                        <span style={{ fontSize: 12, fontWeight: 600, color: '#FFFFFF' }}>{val}</span>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Valores */}
                                            {(sd.precio_nuevo || sd.valor_venta || sd.valor_compra) && (
                                                <div style={{ display: 'flex', gap: 20, marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(245,158,11,0.1)' }}>
                                                    {sd.precio_nuevo && (
                                                        <div>
                                                            <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(245,158,11,0.5)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block' }}>Precio Nuevo</span>
                                                            <span style={{ fontSize: 14, fontWeight: 700, color: '#f59e0b' }}>€{sd.precio_nuevo.toLocaleString('es-ES')}</span>
                                                        </div>
                                                    )}
                                                    {sd.valor_venta && (
                                                        <div>
                                                            <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(245,158,11,0.5)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block' }}>Valor Venta</span>
                                                            <span style={{ fontSize: 14, fontWeight: 700, color: '#fbbf24' }}>€{sd.valor_venta.toLocaleString('es-ES')}</span>
                                                        </div>
                                                    )}
                                                    {sd.valor_compra && (
                                                        <div>
                                                            <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(245,158,11,0.5)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block' }}>Valor Compra</span>
                                                            <span style={{ fontSize: 14, fontWeight: 700, color: '#fcd34d' }}>€{sd.valor_compra.toLocaleString('es-ES')}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Loading skeleton for this plate */}
                                    {sdLoading && !sd && (
                                        <div style={{
                                            borderTop: '1px solid rgba(245,158,11,0.1)',
                                            background: 'rgba(245,158,11,0.02)',
                                            padding: '12px 20px',
                                        }}>
                                            <div style={{ height: 10, width: '60%', borderRadius: 4, background: 'rgba(245,158,11,0.1)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                                            <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
