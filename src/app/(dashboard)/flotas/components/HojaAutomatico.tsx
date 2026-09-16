"use client";

import React, { useState, useRef, useMemo } from 'react';
import { generarPlantillaExcel } from '@/core/flotas/plantilla';
import { normalizeTipoVehiculo, TIPO_VEHICULO_OPTS } from '@/core/flotas/normalizador';
import type { FlotaHeader } from './types';
import type { FlotaCarpeta } from '@/core/flotas';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SilverdatVehicle {
    matricula: string;
    vin?: string;
    marca?: string;
    modelo?: string;
    version?: string;
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
    precio_nuevo?: number;
    valor_venta?: number;
    valor_compra?: number;
    num_titulares?: number;
    servicio?: string;
    tipo_alimentacion?: string;
}

interface ProcessedVehicle {
    matricula: string;
    marca: string;
    modelo: string;
    tipo_vehiculo: string;
    kw: number;
    cv: number;
    combustible: string;
    fecha_matriculacion: string;
    fecha_vencimiento: string;
    cia_actual: string;
    num_poliza_actual: string;
    uso: string;
    ambito: string;
    coberturas_solicitadas: string;
    lunas: string;
    frq: string;
    asistencia: string;
    prima_referencia: string;   // from Excel (individual prima per vehicle)
    // Silverdat extras
    vin: string;
    etiqueta_dgt: string;
    euro: string;
    co2: string;
    precio_nuevo: number;
    valor_venta: number;
    // Catalog
    id_veh?: string;
    sd_ok: boolean;
}

interface ProgressState {
    current: number;
    total: number;
    log: { plate: string; ok: boolean; marca?: string; modelo?: string }[];
}

interface Props {
    header: FlotaHeader;
    carpetaActiva: FlotaCarpeta | null;
    onComplete: (rows: Record<string, string>[]) => void;
    onVehiclesProcessed?: (vehicles: ProcessedVehicle[]) => void;
    onHeaderUpdate?: (header: Partial<FlotaHeader>) => void;
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const glass: React.CSSProperties = {
    background: 'rgba(12, 28, 82, 0.5)',
    border: '1px solid rgba(61, 112, 255, 0.18)',
    borderRadius: 16,
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
        setLoading(true); setError('');
        try {
            const res = await fetch('/api/silverdat/login', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ datId: datId.trim(), user: user.trim(), pass: pass.trim() }),
            });
            const data = await res.json();
            if (data.ok) { onSuccess(); }
            else setError((data.error || 'Error de autenticación') + (data.debug ? `\n\nDEBUG: ${data.debug}` : ''));
        } catch { setError('Error de conexión'); }
        finally { setLoading(false); }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
            <div onClick={e => e.stopPropagation()} style={{ width: 360, padding: 28, borderRadius: 18, background: 'rgba(8,22,72,0.97)', border: '1px solid rgba(245,158,11,0.25)', boxShadow: '0 30px 80px rgba(0,0,0,0.7)' }}>
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

// ─── Mode toggle ─────────────────────────────────────────────────────────────

type ProcessMode = 'con' | 'sin';

function ModeToggle({ value, onChange }: { value: ProcessMode; onChange: (m: ProcessMode) => void }) {
    const options: { id: ProcessMode; title: string; desc: string; tag: string; accent: string; bg: string; tagBg: string }[] = [
        {
            id: 'con',
            title: 'Con Silverdat',
            desc: 'Enriquece cada vehículo con datos técnicos: marca, modelo, KW, tipo, año de matriculación.',
            tag: 'Completo',
            accent: '#f59e0b',
            bg: 'rgba(245,158,11,0.08)',
            tagBg: 'rgba(245,158,11,0.15)',
        },
        {
            id: 'sin',
            title: 'Solo plantilla',
            desc: 'Carga directamente los datos del Excel. Sin esperas. Ideal si ya tienes los datos completos.',
            tag: 'Rápido',
            accent: '#10b981',
            bg: 'rgba(16,185,129,0.07)',
            tagBg: 'rgba(16,185,129,0.15)',
        },
    ];

    return (
        <div style={{ display: 'flex', gap: 12 }}>
            {options.map(opt => {
                const active = value === opt.id;
                return (
                    <button
                        key={opt.id}
                        onClick={() => onChange(opt.id)}
                        style={{
                            flex: 1, textAlign: 'left', padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                            background: active ? opt.bg : 'rgba(12,28,82,0.4)',
                            border: `1.5px solid ${active ? opt.accent : 'rgba(61,112,255,0.15)'}`,
                            transition: 'all 0.18s',
                            position: 'relative', overflow: 'hidden',
                        }}
                    >
                        {active && (
                            <div style={{
                                position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                                background: opt.accent, borderRadius: '12px 12px 0 0',
                            }} />
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <div style={{
                                width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                                border: `2px solid ${active ? opt.accent : 'rgba(178,198,245,0.25)'}`,
                                background: active ? opt.accent : 'transparent',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                {active && <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff' }} />}
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 800, color: active ? '#FFFFFF' : 'rgba(178,198,245,0.55)' }}>
                                {opt.title}
                            </span>
                            <span style={{
                                marginLeft: 'auto', fontSize: 9, fontWeight: 800, letterSpacing: '0.08em',
                                textTransform: 'uppercase', padding: '2px 7px', borderRadius: 20,
                                background: active ? opt.tagBg : 'rgba(61,112,255,0.08)',
                                color: active ? opt.accent : 'rgba(178,198,245,0.35)',
                            }}>
                                {opt.tag}
                            </span>
                        </div>
                        <p style={{ margin: 0, fontSize: 11, color: active ? 'rgba(178,198,245,0.65)' : 'rgba(178,198,245,0.35)', lineHeight: 1.5 }}>
                            {opt.desc}
                        </p>
                    </button>
                );
            })}
        </div>
    );
}

// ─── Step 1: Upload ───────────────────────────────────────────────────────────

function Step1({
    header, carpetaActiva, onNext,
}: {
    header: FlotaHeader;
    carpetaActiva: FlotaCarpeta | null;
    onNext: (rows: Record<string, string>[], detectedHeader?: Partial<FlotaHeader>, mode?: ProcessMode) => void;
}) {
    const [downloadLoading, setDownloadLoading] = useState(false);
    const [uploadedRows, setUploadedRows] = useState<Record<string, string>[] | null>(null);
    const [parseError, setParseError] = useState('');
    const [mode, setMode] = useState<ProcessMode>('con');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const detectedHeaderRef = useRef<Partial<FlotaHeader>>({});

    const handleDownload = async () => {
        setDownloadLoading(true);
        try {
            const blob = await generarPlantillaExcel(carpetaActiva ?? { nombre: header.tomador || 'Flota', header });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `plantilla_${(carpetaActiva?.nombre || 'flota').replace(/[/\\:*?"<>|]/g, '')}.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
        } finally { setDownloadLoading(false); }
    };

    const handleFile = async (file: File) => {
        setParseError('');
        setUploadedRows(null);
        try {
            const XLSX = await import('xlsx');
            const buf = await file.arrayBuffer();
            const wb = XLSX.read(buf, { type: 'array', cellDates: true });
            const ws = wb.Sheets[wb.SheetNames[0]];

            // Convierte celda a string: fechas → dd/mm/yyyy, resto → texto formateado de Excel
            type XlsxCell = { t?: string; v?: unknown; w?: string };
            const cellStr = (cell: XlsxCell | undefined): string => {
                if (!cell) return '';
                if (cell.t === 'd' && cell.v instanceof Date) {
                    return cell.v.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
                }
                // Numeric cells: use raw value to avoid locale-formatted thousands separators
                if (cell.t === 'n') return String(cell.v ?? '');
                return (cell.w ?? String(cell.v ?? '')).trim();
            };

            // Data starts at row 6 (1-indexed), headers at row 5
            const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
            const headers: string[] = [];
            // Read headers from row 5 (0-indexed: row 4)
            for (let c = range.s.c; c <= range.e.c; c++) {
                const cell = ws[XLSX.utils.encode_cell({ r: 4, c })] as XlsxCell | undefined;
                headers.push(cell ? String(cell.v).toLowerCase().trim().replace(/ /g, '_') : `col_${c}`);
            }

            const rows: Record<string, string>[] = [];
            for (let r = 5; r <= range.e.r; r++) { // row 6+ (0-indexed: 5+)
                const row: Record<string, string> = {};
                let hasData = false;
                for (let c = range.s.c; c <= range.e.c; c++) {
                    const cell = ws[XLSX.utils.encode_cell({ r, c })] as XlsxCell | undefined;
                    const val = cellStr(cell);
                    row[headers[c - range.s.c]] = val;
                    if (val) hasData = true;
                }
                if (hasData) rows.push(row);
            }

            const withPlate = rows.filter(r => r['matricula']?.trim());
            if (withPlate.length === 0) throw new Error('No se encontraron matrículas en la plantilla');

            // Extract header info from rows 2-3 of the plantilla (CIF, Tomador, Actividad, etc.)
            const detectedHeader: Partial<FlotaHeader> = {
                cif:       cellStr(ws[XLSX.utils.encode_cell({ r: 1, c: 1 })] as XlsxCell),
                tomador:   cellStr(ws[XLSX.utils.encode_cell({ r: 1, c: 3 })] as XlsxCell),
                actividad: cellStr(ws[XLSX.utils.encode_cell({ r: 1, c: 6 })] as XlsxCell),
                formaPago: cellStr(ws[XLSX.utils.encode_cell({ r: 2, c: 1 })] as XlsxCell),
                efecto:    cellStr(ws[XLSX.utils.encode_cell({ r: 2, c: 3 })] as XlsxCell),
            };
            // Only keep values that are non-empty and not label text
            const labels = new Set(['cif:', 'tomador:', 'actividad:', 'forma de pago:', 'efecto:', 'estudio:']);
            for (const k of Object.keys(detectedHeader) as (keyof FlotaHeader)[]) {
                const v = detectedHeader[k] as string;
                if (!v || labels.has(v.toLowerCase())) delete detectedHeader[k];
            }
            detectedHeaderRef.current = detectedHeader;

            setUploadedRows(withPlate);
        } catch (err: unknown) {
            setParseError((err instanceof Error ? err.message : null) || 'Error al leer el archivo');
        }
    };

    return (
        <div style={{ maxWidth: 700, margin: '0 auto', padding: '32px 24px' }}>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#f59e0b', marginBottom: 8 }}>Paso 1 de 3</div>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: '#FFFFFF', margin: '0 0 8px' }}>Plantilla de vehículos</h2>
                <p style={{ fontSize: 13, color: 'rgba(178,198,245,0.6)', margin: 0 }}>
                    Descarga la plantilla, rellena los datos de los vehículos y súbela.
                </p>
            </div>

            {/* Download */}
            <div style={{ ...glass, padding: 24, marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                    <div>
                        <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: '#FFFFFF' }}>1. Descargar plantilla</p>
                        <p style={{ margin: 0, fontSize: 11, color: 'rgba(178,198,245,0.5)' }}>Excel con columnas: matrícula, marca, modelo, tipo, coberturas, prima referencia...</p>
                    </div>
                    <button
                        onClick={handleDownload}
                        disabled={downloadLoading}
                        style={{
                            flexShrink: 0, padding: '10px 20px', borderRadius: 10,
                            background: downloadLoading ? 'rgba(51,102,255,0.2)' : 'linear-gradient(135deg, #1240CC, #3366FF)',
                            color: '#fff', border: 'none', fontSize: 12, fontWeight: 700,
                            cursor: downloadLoading ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: 8,
                        }}
                    >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                        </svg>
                        {downloadLoading ? 'Generando...' : 'Descargar plantilla'}
                    </button>
                </div>
            </div>

            {/* Upload */}
            <div style={{ ...glass, padding: 24, marginBottom: 20 }}>
                <p style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: '#FFFFFF' }}>2. Subir plantilla rellena</p>
                <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); }}
                    onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                    style={{
                        border: '2px dashed rgba(61,112,255,0.3)',
                        borderRadius: 12, padding: '32px 24px', textAlign: 'center',
                        cursor: 'pointer', transition: 'border-color 0.2s',
                        background: 'rgba(18,64,204,0.05)',
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(61,112,255,0.55)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(61,112,255,0.3)'}
                >
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(61,112,255,0.6)" strokeWidth="1.5" style={{ margin: '0 auto 12px' }}>
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                    </svg>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'rgba(178,198,245,0.7)' }}>
                        {uploadedRows ? `✓ ${uploadedRows.length} vehículos detectados` : 'Haz click o arrastra tu Excel aquí'}
                    </p>
                    {!uploadedRows && <p style={{ margin: '4px 0 0', fontSize: 11, color: 'rgba(178,198,245,0.35)' }}>.xlsx</p>}
                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
                </div>

                {parseError && (
                    <p style={{ margin: '10px 0 0', fontSize: 12, color: '#ef4444', fontWeight: 600 }}>{parseError}</p>
                )}

                {uploadedRows && (() => {
                    const seen = new Map<string, number>();
                    uploadedRows.forEach(r => {
                        const mat = r['matricula']?.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                        if (mat) seen.set(mat, (seen.get(mat) ?? 0) + 1);
                    });
                    const duplicadas = Array.from(seen.entries()).filter(([, n]) => n > 1).map(([m]) => m);
                    return (
                        <>
                            {duplicadas.length > 0 && (
                                <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 10 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: '#ef4444' }}>
                                            {duplicadas.length} matrícula{duplicadas.length !== 1 ? 's' : ''} duplicada{duplicadas.length !== 1 ? 's' : ''}
                                        </span>
                                        <button
                                            onClick={() => {
                                                const firstSeen = new Set<string>();
                                                setUploadedRows(uploadedRows!.filter(r => {
                                                    const mat = r['matricula']?.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                                                    if (!mat) return true;
                                                    if (firstSeen.has(mat)) return false;
                                                    firstSeen.add(mat);
                                                    return true;
                                                }));
                                            }}
                                            style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: '#ef4444', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', flexShrink: 0 }}
                                        >
                                            Eliminar duplicadas
                                        </button>
                                    </div>
                                    <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                        {duplicadas.map(m => (
                                            <span key={m} style={{ fontSize: 11, fontWeight: 800, color: '#ef4444', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 4, padding: '2px 8px', fontFamily: 'monospace' }}>
                                                {m} ×{seen.get(m)}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 10 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: '#10b981' }}>
                                    {uploadedRows.length} vehículo{uploadedRows.length !== 1 ? 's' : ''} detectados
                                    {duplicadas.length > 0 && <span style={{ color: '#f59e0b', fontWeight: 700 }}> · {duplicadas.length} dup.</span>}
                                </span>
                                <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                    {uploadedRows.slice(0, 8).map((r, i) => {
                                        const mat = r['matricula']?.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                                        const isDup = duplicadas.includes(mat);
                                        return (
                                            <span key={i} style={{ fontSize: 10, fontWeight: 700, color: isDup ? '#ef4444' : 'rgba(178,198,245,0.6)', background: isDup ? 'rgba(239,68,68,0.1)' : 'rgba(61,112,255,0.1)', border: `1px solid ${isDup ? 'rgba(239,68,68,0.3)' : 'rgba(61,112,255,0.15)'}`, borderRadius: 4, padding: '2px 7px', fontFamily: 'monospace' }}>
                                                {r['matricula']}
                                            </span>
                                        );
                                    })}
                                    {uploadedRows.length > 8 && <span style={{ fontSize: 10, color: 'rgba(178,198,245,0.4)' }}>+{uploadedRows.length - 8} más</span>}
                                </div>
                            </div>
                        </>
                    );
                })()}
            </div>

            {/* Mode selector */}
            <div style={{ ...glass, padding: 20, marginBottom: 20 }}>
                <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: 'rgba(178,198,245,0.55)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    3. Modo de procesado
                </p>
                <ModeToggle value={mode} onChange={setMode} />
            </div>

            <button
                onClick={() => uploadedRows && onNext(uploadedRows, detectedHeaderRef.current, mode)}
                disabled={!uploadedRows}
                style={{
                    width: '100%', padding: '14px 0', borderRadius: 12,
                    background: !uploadedRows
                        ? 'rgba(100,116,139,0.2)'
                        : mode === 'sin'
                            ? 'linear-gradient(135deg, #059669, #10b981)'
                            : 'linear-gradient(135deg, #d97706, #f59e0b)',
                    color: '#fff', border: 'none', fontSize: 13, fontWeight: 800,
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                    cursor: uploadedRows ? 'pointer' : 'not-allowed',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                    transition: 'background 0.2s',
                }}
            >
                {mode === 'sin' ? 'Cargar datos directamente' : 'Iniciar procesado con Silverdat'}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            </button>
        </div>
    );
}

// ─── Step 2: Processing ───────────────────────────────────────────────────────

function Step2({
    uploadedRows,
    onComplete,
}: {
    uploadedRows: Record<string, string>[];
    onComplete: (vehicles: ProcessedVehicle[]) => void;
}) {
    const [progress, setProgress] = useState<ProgressState>({ current: 0, total: uploadedRows.length, log: [] });
    const [error, setError] = useState('');
    const [showSdModal, setShowSdModal] = useState(false);
    const [started, setStarted] = useState(false);
    const [finished, setFinished] = useState(false);
    const abortRef = useRef(false);
    const allProcessedRef = useRef<ProcessedVehicle[]>([]);
    const failedRowsRef = useRef<Record<string, string>[]>([]);

    const NO_LUNAS = new Set(['semirremolque', 'industrial no matriculado']);

    const querySilverdat = async (mat: string): Promise<{ vehicle?: SilverdatVehicle; noSession?: boolean }> => {
        const ctrl = new AbortController();
        const poll = setInterval(() => { if (abortRef.current) ctrl.abort(); }, 200);
        try {
            const res = await fetch('/api/silverdat/enrich', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ matriculas: [mat] }),
                signal: ctrl.signal,
            });
            if (res.status === 401) return { noSession: true };
            const data = await res.json();
            if (data.ok && data.results?.[0]?.ok && data.results[0].vehicle) {
                return { vehicle: data.results[0].vehicle as SilverdatVehicle };
            }
            return {};
        } catch { return {}; }
        finally { clearInterval(poll); }
    };

    const buildVehicle = (row: Record<string, string>, sd?: SilverdatVehicle, id_veh?: string): ProcessedVehicle => {
        const matricula = row['matricula'].trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        const tipoRaw = sd?.tipo_vehiculo || row['tipo_vehiculo'] || inferTipoFromMat(matricula);
        const tipo = normalizeTipoVehiculo(tipoRaw) || '';
        const sinLunas = NO_LUNAS.has(tipo.toLowerCase());
        return {
            matricula,
            marca: sd?.marca || row['marca'] || '',
            modelo: sd?.modelo || row['modelo'] || '',
            tipo_vehiculo: tipo,
            kw: sd?.kw || parseFloat(row['kw'] || '0') || 0,
            cv: sd?.cv || parseFloat(row['cv'] || '0') || 0,
            combustible: sd?.combustible || '',
            fecha_matriculacion: sd?.fecha_matriculacion || '',
            fecha_vencimiento: row['fecha_vencimiento'] || '',
            cia_actual: row['cia_actual'] || '',
            num_poliza_actual: row['num_poliza_actual'] || row['n_poliza_actual'] || '',
            uso: row['uso'] || 'Particular',
            ambito: row['ambito'] || 'Nacional',
            coberturas_solicitadas: row['coberturas_solicitadas'] || '',
            lunas: sinLunas ? 'No' : (row['lunas'] || 'No'),
            frq: row['frq'] || '',
            asistencia: row['asistencia'] || 'no',
            prima_referencia: row['prima_referencia'] || row['prima referencia'] || '',
            vin: sd?.vin || '',
            etiqueta_dgt: sd?.etiqueta_dgt || '',
            euro: sd?.euro || '',
            co2: sd?.co2 != null ? String(sd.co2) : '',
            precio_nuevo: sd?.precio_nuevo || 0,
            valor_venta: sd?.valor_venta || 0,
            id_veh,
            sd_ok: !!sd,
        };
    };

    const runProcess = async (rows: Record<string, string>[], mergeWith?: ProcessedVehicle[]) => {
        abortRef.current = false;
        setError('');
        setFinished(false);

        const processed: ProcessedVehicle[] = mergeWith ? [...mergeWith] : [];
        const mergeMap = new Map(processed.map(v => [v.matricula, v]));

        let done = 0;
        setProgress({ current: 0, total: rows.length, log: [] });

        const processOne = async (row: Record<string, string>) => {
            if (abortRef.current) return;
            const matricula = row['matricula'].trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            let sd: SilverdatVehicle | undefined;
            let id_veh: string | undefined;

            let result = await querySilverdat(matricula);
            if (result.noSession) { setError('Sesión Silverdat expirada. Reinicia y vuelve a hacer login.'); abortRef.current = true; return; }
            sd = result.vehicle;

            if (!sd && !abortRef.current) {
                await new Promise(r => setTimeout(r, 800));
                if (!abortRef.current) {
                    result = await querySilverdat(matricula);
                    if (result.noSession) { setError('Sesión Silverdat expirada.'); abortRef.current = true; return; }
                    sd = result.vehicle;
                }
            }
            if (abortRef.current) return;

            if (sd?.marca || sd?.kw) {
                try {
                    const params = new URLSearchParams();
                    if (sd?.marca) params.set('marca', sd.marca);
                    if (sd?.modelo) params.set('modelo', sd.modelo.split(' ')[0]);
                    if (sd?.kw) params.set('kw', String(sd.kw));
                    if (sd?.cilindrada) params.set('cilindrada', String(sd.cilindrada));
                    const catData = await (await fetch(`/api/catalogo/search?${params}`)).json();
                    if (catData.ok && catData.candidatos?.length > 0) id_veh = catData.candidatos[0].id_veh;
                } catch { /* catálogo opcional */ }
            }

            const vehicle = buildVehicle(row, sd, id_veh);
            mergeMap.set(matricula, vehicle);

            done++;
            setProgress(p => ({ current: done, total: rows.length, log: [...p.log, { plate: matricula, ok: !!sd, marca: sd?.marca, modelo: sd?.modelo?.split(' ')[0] }] }));
        };

        // 3 workers en paralelo — cola compartida
        let queueIdx = 0;
        const worker = async () => {
            while (!abortRef.current) {
                const myIdx = queueIdx++;
                if (myIdx >= rows.length) break;
                await processOne(rows[myIdx]);
                if (!abortRef.current && myIdx < rows.length - 1)
                    await new Promise(r => setTimeout(r, 200));
            }
        };
        await Promise.all([worker(), worker(), worker()]);

        if (!abortRef.current) {
            const all = Array.from(mergeMap.values());
            allProcessedRef.current = all;
            failedRowsRef.current = rows.filter(r => {
                const mat = r['matricula'].trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                return !mergeMap.get(mat)?.sd_ok;
            });
            setFinished(true);
        }
    };

    const checkAndRun = async () => {
        setStarted(true);
        const rows = uploadedRows.filter(r => r['matricula']?.trim());
        try {
            const sessionData = await (await fetch('/api/silverdat/login')).json();
            if (!sessionData.hasSession) { setShowSdModal(true); return; }
        } catch { setShowSdModal(true); return; }
        runProcess(rows);
    };

    const handleRetry = async () => {
        const failed = failedRowsRef.current;
        if (!failed.length) return;
        try {
            const sessionData = await (await fetch('/api/silverdat/login')).json();
            if (!sessionData.hasSession) { setShowSdModal(true); return; }
        } catch { setShowSdModal(true); return; }
        runProcess(failed, allProcessedRef.current);
    };

    const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
    const failedCount = failedRowsRef.current.length;
    const okCount = allProcessedRef.current.filter(v => v.sd_ok).length;

    return (
        <div style={{ maxWidth: 700, margin: '0 auto', padding: '32px 24px' }}>
            {showSdModal && (
                <SilverdatModal
                    onClose={() => { setShowSdModal(false); setStarted(false); }}
                    onSuccess={() => { setShowSdModal(false); runProcess(uploadedRows.filter(r => r['matricula']?.trim())); }}
                />
            )}

            <div style={{ textAlign: 'center', marginBottom: 32 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#f59e0b', marginBottom: 8 }}>Paso 2 de 3</div>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: '#FFFFFF', margin: '0 0 8px' }}>Procesado automático</h2>
                <p style={{ fontSize: 13, color: 'rgba(178,198,245,0.6)', margin: 0 }}>
                    Consultando Silverdat y catálogo SINCO para {progress.total} vehículos
                </p>
            </div>

            {!started ? (
                <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 13, color: 'rgba(178,198,245,0.6)', marginBottom: 24 }}>
                        Se consultará Silverdat por cada matrícula (~{Math.ceil(progress.total * 0.5)} segundos)
                    </p>
                    <button onClick={checkAndRun} style={{
                        padding: '14px 32px', borderRadius: 12,
                        background: 'linear-gradient(135deg, #d97706, #f59e0b)',
                        color: '#fff', border: 'none', fontSize: 13, fontWeight: 800,
                        letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer',
                    }}>
                        Iniciar
                    </button>
                </div>
            ) : (
                <>
                    {/* Progress bar */}
                    <div style={{ ...glass, padding: 20, marginBottom: 20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#FFFFFF' }}>Progreso</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b' }}>{progress.current}/{progress.total}</span>
                                {progress.current < progress.total && (
                                    <button onClick={() => { abortRef.current = true; }} style={{
                                        fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
                                        background: 'rgba(239,68,68,0.15)', color: '#ef4444',
                                        border: '1px solid rgba(239,68,68,0.3)', cursor: 'pointer',
                                    }}>⬛ Detener</button>
                                )}
                            </div>
                        </div>
                        <div style={{ height: 8, borderRadius: 4, background: 'rgba(61,112,255,0.15)', overflow: 'hidden' }}>
                            <div style={{
                                height: '100%', borderRadius: 4, transition: 'width 0.4s ease',
                                width: `${pct}%`,
                                background: progress.current === progress.total ? 'linear-gradient(90deg, #10b981, #34d399)' : 'linear-gradient(90deg, #d97706, #f59e0b)',
                            }} />
                        </div>
                        {progress.current < progress.total && (
                            <p style={{ margin: '8px 0 0', fontSize: 11, color: 'rgba(178,198,245,0.5)' }}>
                                Restante estimado: ~{Math.ceil((progress.total - progress.current) * 2.5)}s · Consulta secuencial para fiabilidad máxima
                            </p>
                        )}
                    </div>

                    {/* Log */}
                    <div style={{ ...glass, padding: 16, maxHeight: 220, overflowY: 'auto' }}>
                        {progress.log.length === 0 ? (
                            <p style={{ margin: 0, fontSize: 12, color: 'rgba(178,198,245,0.4)', textAlign: 'center' }}>Iniciando...</p>
                        ) : (
                            progress.log.map((entry, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', borderBottom: i < progress.log.length - 1 ? '1px solid rgba(61,112,255,0.07)' : 'none' }}>
                                    <span style={{ fontSize: 12, color: entry.ok ? '#10b981' : '#ef4444', flexShrink: 0 }}>{entry.ok ? '✓' : '✗'}</span>
                                    <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: '#FFFFFF', flexShrink: 0 }}>{entry.plate}</span>
                                    {entry.ok && <span style={{ fontSize: 11, color: 'rgba(178,198,245,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.marca} {entry.modelo}</span>}
                                    {!entry.ok && <span style={{ fontSize: 11, color: 'rgba(239,68,68,0.6)' }}>Sin datos Silverdat</span>}
                                </div>
                            ))
                        )}
                    </div>

                    {error && <p style={{ marginTop: 12, fontSize: 12, color: '#ef4444', fontWeight: 600 }}>{error}</p>}

                    {/* Resumen + acciones post-proceso */}
                    {finished && (
                        <div style={{ ...glass, padding: 20, marginTop: 16 }}>
                            <div style={{ display: 'flex', gap: 16, marginBottom: 16, justifyContent: 'center' }}>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: 24, fontWeight: 900, color: '#10b981' }}>{okCount}</div>
                                    <div style={{ fontSize: 10, color: 'rgba(178,198,245,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Con Silverdat</div>
                                </div>
                                <div style={{ width: 1, background: 'rgba(61,112,255,0.2)' }} />
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: 24, fontWeight: 900, color: failedCount > 0 ? '#f59e0b' : '#10b981' }}>{failedCount}</div>
                                    <div style={{ fontSize: 10, color: 'rgba(178,198,245,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Sin datos</div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                {failedCount > 0 && (
                                    <button onClick={handleRetry} style={{
                                        flex: 1, padding: '11px 0', borderRadius: 10,
                                        background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)',
                                        color: '#f59e0b', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                    }}>
                                        Segunda barrida ({failedCount} matrícula{failedCount !== 1 ? 's' : ''})
                                    </button>
                                )}
                                <button onClick={() => onComplete(allProcessedRef.current)} style={{
                                    flex: 1, padding: '11px 0', borderRadius: 10,
                                    background: 'linear-gradient(135deg, #1240CC, #2563eb)',
                                    border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                }}>
                                    Continuar → Paso 3
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ─── Step 3: Offer builder ────────────────────────────────────────────────────

function Step3({
    vehicles,
    onComplete,
    onBack,
    polizaMap,
}: {
    vehicles: ProcessedVehicle[];
    onComplete: (rows: Record<string, string>[]) => void;
    onBack: () => void;
    polizaMap?: Record<string, string>;
}) {
    const [globalDiscount, setGlobalDiscount] = useState('0');
    const [tipoOverrides, setTipoOverrides] = useState<Record<string, string>>({});
    const [bulkFrom, setBulkFrom] = useState('');
    const [bulkTo, setBulkTo] = useState('');

    const discount = Math.max(0, Math.min(100, parseFloat(globalDiscount) || 0));

    const effectiveTipo = (v: ProcessedVehicle) =>
        tipoOverrides[v.matricula] || v.tipo_vehiculo || '';

    // Group by tipo + cobertura from Excel (no default — respect what the Excel has)
    const groups = useMemo(() => {
        const result: Record<string, { tipo: string; cob: string; vehList: ProcessedVehicle[] }> = {};
        for (const v of vehicles) {
            const t = tipoOverrides[v.matricula] || v.tipo_vehiculo || '';
            const c = v.coberturas_solicitadas || '';
            const key = `${t}||${c}`;
            if (!result[key]) result[key] = { tipo: t, cob: c, vehList: [] };
            result[key].vehList.push(v);
        }
        return result;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vehicles, tipoOverrides]);

    const cleanPoliza = (p: string) => p.replace(/[\s\-\.\/]/g, '');

    const handleApply = () => {
        const rows: Record<string, string>[] = vehicles.map(v => {
            const prima = parseFloat(v.prima_referencia || '0') || 0;
            const finalPrima = prima * (1 - discount / 100);
            const polizaRaw = v.num_poliza_actual || polizaMap?.[v.matricula] || '';
            return {
                matricula: v.matricula,
                marca: v.marca,
                modelo: v.modelo,
                tipo_vehiculo: effectiveTipo(v) || 'Turismo',
                kw: v.kw > 0 ? String(v.kw) : '',
                cv: v.cv > 0 ? String(v.cv) : '',
                cia_actual: v.cia_actual,
                num_poliza_actual: cleanPoliza(polizaRaw),
                fecha_vencimiento: v.fecha_vencimiento,
                uso: v.uso,
                ambito: v.ambito,
                coberturas_solicitadas: v.coberturas_solicitadas,
                lunas: v.lunas,
                frq: v.frq,
                asistencia: v.asistencia,
                prima_referencia: finalPrima > 0 ? finalPrima.toFixed(2) : '',
                vin: v.vin,
                fecha_matriculacion: v.fecha_matriculacion,
                combustible: v.combustible,
                etiqueta_dgt: v.etiqueta_dgt,
                euro: v.euro,
                co2: v.co2,
            };
        });
        onComplete(rows);
    };

    // Total uses individual vehicle primas from Excel
    const totalPrima = vehicles.reduce((sum, v) => {
        return sum + (parseFloat(v.prima_referencia || '0') || 0) * (1 - discount / 100);
    }, 0);

    const sdOkCount = vehicles.filter(v => v.sd_ok).length;
    const sdOkPlates  = vehicles.filter(v => v.sd_ok).map(v => v.matricula);
    const sdFailPlates = vehicles.filter(v => !v.sd_ok).map(v => v.matricula);

    return (
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 24px' }}>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#f59e0b', marginBottom: 8 }}>Paso 3 de 3</div>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: '#FFFFFF', margin: '0 0 8px' }}>Confirmar oferta</h2>
                <p style={{ fontSize: 13, color: 'rgba(178,198,245,0.6)', margin: 0 }}>
                    {vehicles.length} vehículos · primas y coberturas del Excel
                </p>
            </div>

            {/* Cambio masivo de tipología */}
            {(() => {
                const presentTypes = Array.from(new Set(vehicles.map(v => effectiveTipo(v)))).sort();
                const applyBulk = () => {
                    if (!bulkTo) return;
                    setTipoOverrides(prev => {
                        const next = { ...prev };
                        vehicles.forEach(v => {
                            const cur = tipoOverrides[v.matricula] || v.tipo_vehiculo || '';
                            if (bulkFrom === '' ? !cur : cur === bulkFrom) {
                                next[v.matricula] = bulkTo;
                            }
                        });
                        return next;
                    });
                    setBulkFrom('');
                    setBulkTo('');
                };
                return (
                    <div style={{ ...glass, padding: 16, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(178,198,245,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>Cambio masivo</span>
                        <select value={bulkFrom} onChange={e => setBulkFrom(e.target.value)} style={{ background: 'rgba(6,14,50,0.7)', color: '#BDD4FF', border: '1px solid rgba(61,112,255,0.3)', borderRadius: 8, padding: '6px 10px', fontSize: 12, cursor: 'pointer', flex: '1 1 140px' }}>
                            <option value="">— Sin tipo —</option>
                            {presentTypes.filter(Boolean).map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <span style={{ fontSize: 11, color: 'rgba(178,198,245,0.4)', flexShrink: 0 }}>→</span>
                        <select value={bulkTo} onChange={e => setBulkTo(e.target.value)} style={{ background: 'rgba(6,14,50,0.7)', color: '#BDD4FF', border: '1px solid rgba(61,112,255,0.3)', borderRadius: 8, padding: '6px 10px', fontSize: 12, cursor: 'pointer', flex: '1 1 140px' }}>
                            <option value="">— Tipo nuevo —</option>
                            {TIPO_VEHICULO_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                        <button onClick={applyBulk} disabled={!bulkTo} style={{ padding: '7px 18px', borderRadius: 8, background: bulkTo ? 'linear-gradient(135deg, #1240CC, #3366FF)' : 'rgba(18,64,204,0.2)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: bulkTo ? 'pointer' : 'not-allowed', flexShrink: 0 }}>
                            Aplicar
                        </button>
                        {bulkFrom === '' && <span style={{ fontSize: 10, color: 'rgba(178,198,245,0.35)', flex: '100%' }}>Selecciona un tipo origen para cambiar todos los vehículos de ese tipo, o deja vacío para asignar a los que no tienen tipo.</span>}
                    </div>
                );
            })()}

            {/* Tipos pendientes */}
            {vehicles.some(v => !effectiveTipo(v)) && (
                <div style={{ ...glass, padding: 16, marginBottom: 20, border: '1px solid rgba(245,158,11,0.35)', background: 'rgba(245,158,11,0.07)' }}>
                    <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        Tipos de vehículo pendientes — asigna antes de continuar
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {vehicles.filter(v => !effectiveTipo(v)).map(v => (
                            <div key={v.matricula} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#FFFFFF', minWidth: 100 }}>{v.matricula}</span>
                                {v.marca && <span style={{ fontSize: 12, color: 'rgba(178,198,245,0.5)', flex: 1 }}>{v.marca} {v.modelo}</span>}
                                <select
                                    value={tipoOverrides[v.matricula] || ''}
                                    onChange={e => setTipoOverrides(prev => ({ ...prev, [v.matricula]: e.target.value }))}
                                    style={{
                                        background: 'rgba(6,14,50,0.7)', color: '#fff', border: '1px solid rgba(245,158,11,0.4)',
                                        borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', minWidth: 160,
                                    }}
                                >
                                    <option value="">— Seleccionar tipo —</option>
                                    {TIPO_VEHICULO_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
                                </select>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Stats */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                {[
                    { label: 'Total vehículos', value: vehicles.length, color: '#3366FF' },
                    { label: 'Con Silverdat', value: sdOkCount, color: '#10b981' },
                    { label: 'Sin tipo', value: vehicles.filter(v => !effectiveTipo(v)).length, color: vehicles.some(v => !effectiveTipo(v)) ? '#f59e0b' : 'rgba(178,198,245,0.3)' },
                    { label: 'Grupos', value: Object.keys(groups).length, color: '#a78bfa' },
                ].map(({ label, value, color }) => (
                    <div key={label} style={{ flex: '1 1 120px', ...glass, padding: '12px 16px', textAlign: 'center' }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(178,198,245,0.5)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
                    </div>
                ))}
            </div>

            {/* Resumen por grupo (tipo + cobertura del Excel) */}
            <div style={{ ...glass, padding: 20, marginBottom: 20 }}>
                <p style={{ margin: '0 0 14px', fontSize: 12, fontWeight: 700, color: 'rgba(178,198,245,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Resumen por tipología y cobertura</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {Object.entries(groups).map(([key, g]) => {
                        const groupPrimas = g.vehList.map(v => parseFloat(v.prima_referencia || '0') || 0);
                        const avgPrima = groupPrimas.length > 0 ? groupPrimas.reduce((s, p) => s + p, 0) / groupPrimas.length : 0;
                        const totalGrupo = groupPrimas.reduce((s, p) => s + p, 0) * (1 - discount / 100);
                        return (
                            <div key={key} style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr auto 64px 130px 120px',
                                alignItems: 'center', gap: 12,
                                padding: '12px 16px', borderRadius: 10,
                                background: 'rgba(18,64,204,0.08)',
                                border: '1px solid rgba(61,112,255,0.12)',
                            }}>
                                <div>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: g.tipo ? '#FFFFFF' : '#f59e0b' }}>
                                        {g.tipo || 'Sin tipo'}
                                    </span>
                                    <div style={{ fontSize: 10, color: 'rgba(178,198,245,0.4)', marginTop: 2 }}>
                                        {g.vehList.map(v => v.matricula).slice(0, 3).join(', ')}{g.vehList.length > 3 ? ` +${g.vehList.length - 3}` : ''}
                                    </div>
                                </div>
                                <div>
                                    {g.cob
                                        ? <span style={{ fontSize: 11, fontWeight: 700, color: '#3D7BFF', background: 'rgba(61,112,255,0.12)', padding: '3px 9px', borderRadius: 20 }}>{g.cob}</span>
                                        : <span style={{ fontSize: 11, color: 'rgba(178,198,245,0.3)' }}>—</span>
                                    }
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <span style={{ fontSize: 18, fontWeight: 800, color: '#3366FF' }}>{g.vehList.length}</span>
                                    <div style={{ fontSize: 9, color: 'rgba(178,198,245,0.4)', textTransform: 'uppercase' }}>veh.</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: avgPrima > 0 ? '#FFFFFF' : 'rgba(178,198,245,0.3)' }}>
                                        {avgPrima > 0 ? `€${avgPrima.toFixed(2)}` : '—'}
                                    </div>
                                    <div style={{ fontSize: 9, color: 'rgba(178,198,245,0.4)', textTransform: 'uppercase' }}>media/veh</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: 14, fontWeight: 800, color: totalGrupo > 0 ? '#f59e0b' : 'rgba(178,198,245,0.3)' }}>
                                        {totalGrupo > 0 ? `€${totalGrupo.toFixed(0)}` : '—'}
                                    </div>
                                    <div style={{ fontSize: 9, color: 'rgba(178,198,245,0.4)', textTransform: 'uppercase' }}>total grupo</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Global discount */}
            <div style={{ ...glass, padding: 16, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: 'rgba(178,198,245,0.7)', flexShrink: 0 }}>Descuento global</label>
                    <input
                        type="number" min="0" max="100" step="0.5"
                        value={globalDiscount}
                        onChange={e => setGlobalDiscount(e.target.value)}
                        className="orion-input"
                        style={{ fontSize: 14, fontWeight: 700, width: 80, textAlign: 'center' }}
                    />
                    <span style={{ fontSize: 13, color: 'rgba(178,198,245,0.5)' }}>%</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, color: 'rgba(178,198,245,0.5)' }}>Prima total</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#f59e0b' }}>€{totalPrima.toFixed(0)}</div>
                </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={onBack} style={{
                    padding: '12px 24px', borderRadius: 10,
                    background: 'rgba(6,14,50,0.5)', color: '#BDD4FF',
                    border: '1px solid rgba(61,112,255,0.22)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 8,
                }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                    Volver
                </button>
                <button onClick={handleApply} style={{
                    flex: 1, padding: '14px 0', borderRadius: 12,
                    background: 'linear-gradient(135deg, #1240CC, #3366FF)',
                    color: '#fff', border: 'none', fontSize: 13, fontWeight: 800,
                    letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                }}>
                    Aplicar a TRABAJO y continuar
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                </button>
            </div>
        </div>
    );
}

// ─── Tipo helpers ─────────────────────────────────────────────────────────────

// Matrículas españolas empezando por R = remolque/semirremolque
function inferTipoFromMat(matricula: string): string {
    return /^R\d/i.test(matricula.replace(/[^a-zA-Z0-9]/g, '')) ? 'Remolque' : '';
}

// ─── Conversor sin Silverdat ──────────────────────────────────────────────────

function rowsToVehicles(rows: Record<string, string>[]): ProcessedVehicle[] {
    const NO_LUNAS = new Set(['semirremolque', 'industrial no matriculado']);
    return rows
        .filter(r => r['matricula']?.trim())
        .map(r => {
            const mat = r['matricula'].trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            const tipoRaw = r['tipo_vehiculo'] || inferTipoFromMat(mat);
            const tipo = normalizeTipoVehiculo(tipoRaw) || '';
            const sinLunas = NO_LUNAS.has(tipo.toLowerCase());
            const kw = parseFloat(r['kw'] || '0') || 0;
            return {
                matricula: r['matricula'].trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase(),
                marca: r['marca'] || '',
                modelo: r['modelo'] || '',
                tipo_vehiculo: tipo,
                kw,
                cv: parseFloat(r['cv'] || '0') || (kw > 0 ? Math.round(kw * 1.35962) : 0),
                combustible: r['combustible'] || '',
                fecha_matriculacion: r['fecha_matriculacion'] || '',
                fecha_vencimiento: r['fecha_vencimiento'] || '',
                cia_actual: r['cia_actual'] || '',
                num_poliza_actual: r['num_poliza_actual'] || r['n_poliza_actual'] || '',
                uso: r['uso'] || 'Particular',
                ambito: r['ambito'] || 'Nacional',
                coberturas_solicitadas: r['coberturas_solicitadas'] || '',
                lunas: sinLunas ? 'No' : (r['lunas'] || 'No'),
                frq: r['frq'] || '',
                asistencia: r['asistencia'] || 'no',
                prima_referencia: r['prima_referencia'] || r['prima referencia'] || '',
                vin: '',
                etiqueta_dgt: '',
                euro: '',
                co2: '',
                precio_nuevo: 0,
                valor_venta: 0,
                sd_ok: false,
            };
        });
}

// ─── HojaAutomatico (main wizard) ─────────────────────────────────────────────

export default function HojaAutomatico({ header, carpetaActiva, onComplete, onVehiclesProcessed, onHeaderUpdate }: Props) {
    // Recover from saved carpeta state (cross-session persistence)
    const savedVehicles = carpetaActiva?.automaticoVehicles as ProcessedVehicle[] | undefined;
    const [step, setStep] = useState<1 | 2 | 3>(savedVehicles && savedVehicles.length > 0 ? 3 : 1);
    const [uploadedRows, setUploadedRows] = useState<Record<string, string>[]>([]);
    const [processedVehicles, setProcessedVehicles] = useState<ProcessedVehicle[]>(savedVehicles ?? []);

    const handleStep1Done = (rows: Record<string, string>[], detectedHeader?: Partial<FlotaHeader>, mode: ProcessMode = 'con') => {
        setUploadedRows(rows);
        if (detectedHeader && Object.keys(detectedHeader).length > 0) {
            onHeaderUpdate?.(detectedHeader);
        }
        if (mode === 'sin') {
            const vehicles = rowsToVehicles(rows);
            setProcessedVehicles(vehicles);
            onVehiclesProcessed?.(vehicles);
            setStep(3);
        } else {
            setStep(2);
        }
    };

    const handleStep2Done = (vehicles: ProcessedVehicle[]) => {
        setProcessedVehicles(vehicles);
        setStep(3);
        onVehiclesProcessed?.(vehicles);
    };

    const handleStep3Done = (rows: Record<string, string>[]) => {
        onComplete(rows);
    };

    const polizaMap = useMemo<Record<string, string>>(() => {
        const map: Record<string, string> = {};
        for (const row of uploadedRows) {
            const mat = (row['matricula'] || '').trim().toUpperCase();
            if (!mat) continue;
            const pol = row['num_poliza_actual'] || row['n_poliza_actual'] || '';
            if (pol) map[mat] = pol;
        }
        return map;
    }, [uploadedRows]);

    return (
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }} className="custom-scrollbar">
            {/* Breadcrumb steps */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '20px 0 0', marginBottom: 8 }}>
                {[1, 2, 3].map((s, i) => (
                    <React.Fragment key={s}>
                        <div style={{
                            width: 28, height: 28, borderRadius: '50%',
                            background: step === s ? 'linear-gradient(135deg, #d97706, #f59e0b)' : step > s ? 'rgba(16,185,129,0.2)' : 'rgba(61,112,255,0.12)',
                            border: step === s ? 'none' : step > s ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(61,112,255,0.2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 800,
                            color: step === s ? '#fff' : step > s ? '#10b981' : 'rgba(178,198,245,0.4)',
                        }}>
                            {step > s ? '✓' : s}
                        </div>
                        {i < 2 && (
                            <div style={{
                                width: 40, height: 2, borderRadius: 1,
                                background: step > s ? 'rgba(16,185,129,0.4)' : 'rgba(61,112,255,0.12)',
                            }} />
                        )}
                    </React.Fragment>
                ))}
            </div>

            {step === 1 && (
                <Step1
                    header={header}
                    carpetaActiva={carpetaActiva}
                    onNext={handleStep1Done}
                />
            )}
            {step === 2 && (
                <Step2
                    uploadedRows={uploadedRows}
                    onComplete={handleStep2Done}
                />
            )}
            {step === 3 && (
                <Step3
                    vehicles={processedVehicles}
                    onComplete={handleStep3Done}
                    onBack={() => setStep(1)}
                    polizaMap={polizaMap}
                />
            )}
        </div>
    );
}
