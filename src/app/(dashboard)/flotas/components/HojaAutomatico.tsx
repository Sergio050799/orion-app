"use client";

import React, { useState, useRef, useMemo } from 'react';
import { generarPlantillaExcel } from '@/core/flotas/plantilla';
import { normalizeTipoVehiculo, TIPO_VEHICULO_OPTS } from '@/core/flotas/normalizador';
import type { FlotaHeader } from './types';
import { listarCarpetas, listarCorredores, type FlotaCarpeta } from '@/core/flotas';

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
    anyo_fabricacion: string;
    cif_nif: string;
    tomador: string;
    fecha_vencimiento: string;
    cia_actual: string;
    num_poliza_actual: string;
    uso: string;
    adr: string;
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
    log: { plate: string; ok: boolean; marca?: string; modelo?: string; fromCache?: boolean }[];
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
    background: 'var(--t-surface)',
    border: '1px solid var(--t-line)',
    borderRadius: 12,
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
                        <h2 style={{ margin: 0, fontSize: 16, color: 'var(--t-text)', fontWeight: 700 }}>Silverdat</h2>
                        <p style={{ margin: 0, fontSize: 11, color: 'var(--t-text-2)' }}>Credenciales DAT / fastVALUATE</p>
                    </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <input autoFocus placeholder="DAT N. Cliente" value={datId} onChange={e => setDatId(e.target.value)} className="orion-input" style={{ fontSize: 13 }} onKeyDown={e => { if (e.key === 'Enter') handleLogin(); }} />
                    <input placeholder="Usuario" value={user} onChange={e => setUser(e.target.value)} className="orion-input" style={{ fontSize: 13 }} onKeyDown={e => { if (e.key === 'Enter') handleLogin(); }} />
                    <input placeholder="Contraseña" type="password" value={pass} onChange={e => setPass(e.target.value)} className="orion-input" style={{ fontSize: 13 }} onKeyDown={e => { if (e.key === 'Enter') handleLogin(); }} />
                </div>
                {error && <pre style={{ margin: '10px 0 0', fontSize: 11, color: '#ef4444', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 100, overflow: 'auto', background: 'rgba(239,68,68,0.06)', padding: 8, borderRadius: 8 }}>{error}</pre>}
                <p style={{ margin: '12px 0', fontSize: 10, color: 'var(--t-text-3)', lineHeight: 1.4 }}>Las credenciales NO se guardan. Solo para esta sesión.</p>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={handleLogin} disabled={loading || !datId.trim() || !user.trim() || !pass.trim()} style={{ flex: 1, fontSize: 12, fontWeight: 700, padding: '10px 0', borderRadius: 10, background: loading ? 'rgba(245,158,11,0.3)' : 'linear-gradient(135deg, #d97706, #f59e0b)', color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer' }}>
                        {loading ? 'Conectando...' : 'Iniciar sesión'}
                    </button>
                    <button onClick={onClose} style={{ fontSize: 12, padding: '10px 16px', borderRadius: 10, background: 'transparent', color: 'var(--t-text-2)', border: '1px solid var(--t-line)', cursor: 'pointer' }}>Cancelar</button>
                </div>
            </div>
        </div>
    );
}

type ProcessMode = 'con' | 'sin';

// ─── Estado helpers ───────────────────────────────────────────────────────────

function estadoBg(estado: string) {
    switch (estado) {
        case 'CONTRATADA': return 'rgba(16,185,129,0.15)';
        case 'OFERTADA':   return 'rgba(59,130,246,0.15)';
        case 'EN ESTUDIO': return 'rgba(245,158,11,0.15)';
        case 'RECHAZADA':  return 'rgba(239,68,68,0.15)';
        default:           return 'rgba(61,112,255,0.15)';
    }
}
function estadoColor(estado: string) {
    switch (estado) {
        case 'CONTRATADA': return '#10b981';
        case 'OFERTADA':   return '#3b82f6';
        case 'EN ESTUDIO': return '#f59e0b';
        case 'RECHAZADA':  return '#ef4444';
        default:           return '#BDD4FF';
    }
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
                cif_nif: v.cif_nif,
                tomador: v.tomador,
                cia_actual: v.cia_actual,
                num_poliza_actual: cleanPoliza(polizaRaw),
                fecha_vencimiento: v.fecha_vencimiento,
                uso: v.uso,
                adr: v.adr,
                ambito: v.ambito,
                coberturas_solicitadas: v.coberturas_solicitadas,
                lunas: v.lunas,
                frq: v.frq,
                asistencia: v.asistencia,
                prima_referencia: finalPrima > 0 ? finalPrima.toFixed(2) : '',
                vin: v.vin,
                fecha_matriculacion: v.fecha_matriculacion,
                anyo_fabricacion: v.anyo_fabricacion || '',
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
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t-amber)', marginBottom: 8 }}>Paso 3 de 3</div>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-text)', margin: '0 0 8px' }}>Confirmar oferta</h2>
                <p style={{ fontSize: 13, color: 'var(--t-text-2)', margin: 0 }}>
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
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>Cambio masivo</span>
                        <select value={bulkFrom} onChange={e => setBulkFrom(e.target.value)} style={{ background: 'var(--t-bg)', color: 'var(--t-text)', border: '1px solid var(--t-line)', borderRadius: 8, padding: '6px 10px', fontSize: 12, cursor: 'pointer', flex: '1 1 140px' }}>
                            <option value="">— Sin tipo —</option>
                            {presentTypes.filter(Boolean).map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <span style={{ fontSize: 11, color: 'var(--t-text-3)', flexShrink: 0 }}>→</span>
                        <select value={bulkTo} onChange={e => setBulkTo(e.target.value)} style={{ background: 'var(--t-bg)', color: 'var(--t-text)', border: '1px solid var(--t-line)', borderRadius: 8, padding: '6px 10px', fontSize: 12, cursor: 'pointer', flex: '1 1 140px' }}>
                            <option value="">— Tipo nuevo —</option>
                            {TIPO_VEHICULO_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                        <button onClick={applyBulk} disabled={!bulkTo} style={{ padding: '7px 18px', borderRadius: 8, background: bulkTo ? 'linear-gradient(135deg,#1240CC,#3366FF)' : 'var(--t-line)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: bulkTo ? 'pointer' : 'not-allowed', flexShrink: 0 }}>
                            Aplicar
                        </button>
                        {bulkFrom === '' && <span style={{ fontSize: 10, color: 'var(--t-text-3)', flex: '100%' }}>Selecciona un tipo origen para cambiar todos los vehículos de ese tipo, o deja vacío para asignar a los que no tienen tipo.</span>}
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
                                <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: 'var(--t-text)', minWidth: 100 }}>{v.matricula}</span>
                                {v.marca && <span style={{ fontSize: 12, color: 'var(--t-text-3)', flex: 1 }}>{v.marca} {v.modelo}</span>}
                                <select
                                    value={tipoOverrides[v.matricula] || ''}
                                    onChange={e => setTipoOverrides(prev => ({ ...prev, [v.matricula]: e.target.value }))}
                                    style={{
                                        background: 'var(--t-bg)', color: 'var(--t-text)', border: '1px solid rgba(245,158,11,0.4)',
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
                    { label: 'Sin tipo', value: vehicles.filter(v => !effectiveTipo(v)).length, color: vehicles.some(v => !effectiveTipo(v)) ? 'var(--t-amber)' : 'var(--t-text-3)' },
                    { label: 'Grupos', value: Object.keys(groups).length, color: 'var(--t-blue)' },
                ].map(({ label, value, color }) => (
                    <div key={label} style={{ flex: '1 1 120px', ...glass, padding: '12px 16px', textAlign: 'center' }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--t-text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
                    </div>
                ))}
            </div>

            {/* Resumen por grupo (tipo + cobertura del Excel) */}
            <div style={{ ...glass, padding: 20, marginBottom: 20 }}>
                <p style={{ margin: '0 0 14px', fontSize: 12, fontWeight: 700, color: 'var(--t-text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Resumen por tipología y cobertura</p>
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
                                background: 'var(--t-line-soft)',
                                border: '1px solid var(--t-line)',
                            }}>
                                <div>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: g.tipo ? 'var(--t-text)' : 'var(--t-amber)' }}>
                                        {g.tipo || 'Sin tipo'}
                                    </span>
                                    <div style={{ fontSize: 10, color: 'var(--t-text-3)', marginTop: 2 }}>
                                        {g.vehList.map(v => v.matricula).slice(0, 3).join(', ')}{g.vehList.length > 3 ? ` +${g.vehList.length - 3}` : ''}
                                    </div>
                                </div>
                                <div>
                                    {g.cob
                                        ? <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-blue)', background: 'rgba(18,64,204,0.08)', padding: '3px 9px', borderRadius: 20 }}>{g.cob}</span>
                                        : <span style={{ fontSize: 11, color: 'var(--t-text-3)' }}>—</span>
                                    }
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--t-blue)' }}>{g.vehList.length}</span>
                                    <div style={{ fontSize: 9, color: 'var(--t-text-3)', textTransform: 'uppercase' }}>veh.</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: avgPrima > 0 ? 'var(--t-text)' : 'var(--t-text-3)' }}>
                                        {avgPrima > 0 ? `€${avgPrima.toFixed(2)}` : '—'}
                                    </div>
                                    <div style={{ fontSize: 9, color: 'var(--t-text-3)', textTransform: 'uppercase' }}>media/veh</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: 14, fontWeight: 800, color: totalGrupo > 0 ? 'var(--t-amber)' : 'var(--t-text-3)' }}>
                                        {totalGrupo > 0 ? `€${totalGrupo.toFixed(0)}` : '—'}
                                    </div>
                                    <div style={{ fontSize: 9, color: 'var(--t-text-3)', textTransform: 'uppercase' }}>total grupo</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Global discount */}
            <div style={{ ...glass, padding: 16, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text-2)', flexShrink: 0 }}>Descuento global</label>
                    <input
                        type="number" min="0" max="100" step="0.5"
                        value={globalDiscount}
                        onChange={e => setGlobalDiscount(e.target.value)}
                        className="orion-input"
                        style={{ fontSize: 14, fontWeight: 700, width: 80, textAlign: 'center' }}
                    />
                    <span style={{ fontSize: 13, color: 'var(--t-text-3)' }}>%</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, color: 'var(--t-text-3)' }}>Prima total</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#f59e0b' }}>€{totalPrima.toFixed(0)}</div>
                </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={onBack} style={{
                    padding: '12px 24px', borderRadius: 10,
                    background: 'transparent', color: 'var(--t-text-2)',
                    border: '1px solid var(--t-line)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
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
                anyo_fabricacion: r['anyo_fabricacion'] || '',
                cif_nif: r['cif_nif'] || '',
                tomador: r['tomador'] || '',
                fecha_vencimiento: r['fecha_vencimiento'] || '',
                cia_actual: r['cia_actual'] || '',
                num_poliza_actual: r['num_poliza_actual'] || r['n_poliza_actual'] || '',
                uso: r['uso'] || 'Particular',
                adr: r['adr'] || 'No',
                ambito: r['ambito'] || r['ámbito'] || 'Nacional',
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

// ─── HojaAutomatico ───────────────────────────────────────────────────────────

export default function HojaAutomatico({ header, carpetaActiva, onComplete, onVehiclesProcessed, onHeaderUpdate }: Props) {
    const savedVehicles = carpetaActiva?.automaticoVehicles as ProcessedVehicle[] | undefined;

    // ── Phase ──────────────────────────────────────────────────────────────────
    const [phase, setPhase] = useState<'input' | 'processing' | 'confirm'>(
        savedVehicles && savedVehicles.length > 0 ? 'confirm' : 'input'
    );

    // ── Upload state ───────────────────────────────────────────────────────────
    const [downloadLoading, setDownloadLoading] = useState(false);
    const [uploadedRows, setUploadedRows] = useState<Record<string, string>[] | null>(null);
    const [parseError, setParseError] = useState('');
    const [mode, setMode] = useState<ProcessMode>('con');
    const [flotasMatch, setFlotasMatch] = useState<FlotaCarpeta[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const detectedHeaderRef = useRef<Partial<FlotaHeader>>({});

    // ── Silverdat state ────────────────────────────────────────────────────────
    const [progress, setProgress] = useState<ProgressState>({ current: 0, total: 0, log: [] });
    const [sdError, setSdError] = useState('');
    const [showSdModal, setShowSdModal] = useState(false);
    const [sdFinished, setSdFinished] = useState(false);
    const [cacheCount, setCacheCount] = useState(0);
    const abortRef = useRef(false);
    const allProcessedRef = useRef<ProcessedVehicle[]>([]);
    const failedRowsRef = useRef<Record<string, string>[]>([]);

    // ── Confirm state ──────────────────────────────────────────────────────────
    const [processedVehicles, setProcessedVehicles] = useState<ProcessedVehicle[]>(savedVehicles ?? []);

    const NO_LUNAS = new Set(['semirremolque', 'industrial no matriculado']);

    const polizaMap = useMemo<Record<string, string>>(() => {
        const map: Record<string, string> = {};
        for (const row of (uploadedRows ?? [])) {
            const mat = (row['matricula'] || '').trim().toUpperCase();
            if (!mat) continue;
            const pol = row['num_poliza_actual'] || row['n_poliza_actual'] || '';
            if (pol) map[mat] = pol;
        }
        return map;
    }, [uploadedRows]);

    const { duplicadas, seenCounts } = useMemo(() => {
        const seen = new Map<string, number>();
        (uploadedRows ?? []).forEach(r => {
            const mat = r['matricula']?.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            if (mat) seen.set(mat, (seen.get(mat) ?? 0) + 1);
        });
        return {
            duplicadas: Array.from(seen.entries()).filter(([, n]) => n > 1).map(([m]) => m),
            seenCounts: seen,
        };
    }, [uploadedRows]);

    // ── Download ───────────────────────────────────────────────────────────────
    const handleDownload = async () => {
        setDownloadLoading(true);
        try {
            const blob = await generarPlantillaExcel(
                carpetaActiva ?? { nombre: header.tomador || 'Flota', header },
                listarCorredores().map(c => c.nombre),
            );
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `plantilla_${(carpetaActiva?.nombre || 'flota').replace(/[/\\:*?"<>|]/g, '')}.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
        } finally { setDownloadLoading(false); }
    };

    // ── File parse ─────────────────────────────────────────────────────────────
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
            for (let c = range.s.c; c <= range.e.c; c++) {
                const cell = ws[XLSX.utils.encode_cell({ r: 4, c })] as XlsxCell | undefined;
                headers.push(cell ? String(cell.v).toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') : `col_${c}`);
            }

            const rows: Record<string, string>[] = [];
            for (let r = 5; r <= range.e.r; r++) {
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

            const rawPer = cellStr(ws[XLSX.utils.encode_cell({ r: 2, c: 1 })] as XlsxCell).toLowerCase();
            const parsedPer = rawPer.includes('mensual') ? 'mensual' :
                              rawPer.includes('bimestral') ? 'bimestral' :
                              rawPer.includes('trimestral') ? 'trimestral' :
                              rawPer.includes('semestral') ? 'semestral' :
                              rawPer.includes('anual') ? 'anual' : undefined;
            const detectedHeader: Partial<FlotaHeader> = {
                cif:      cellStr(ws[XLSX.utils.encode_cell({ r: 1, c: 1 })] as XlsxCell),
                tomador:  cellStr(ws[XLSX.utils.encode_cell({ r: 1, c: 3 })] as XlsxCell),
                actividad: cellStr(ws[XLSX.utils.encode_cell({ r: 1, c: 6 })] as XlsxCell),
                efecto:   cellStr(ws[XLSX.utils.encode_cell({ r: 2, c: 3 })] as XlsxCell),
                ...(parsedPer ? { periodicidad: parsedPer } : {}),
            };
            const labels = new Set(['cif:', 'tomador:', 'actividad:', 'periodicidad:', 'efecto:', 'estudio:']);
            for (const k of Object.keys(detectedHeader) as (keyof FlotaHeader)[]) {
                const v = detectedHeader[k] as string;
                if (!v || labels.has(v.toLowerCase())) delete detectedHeader[k];
            }
            detectedHeaderRef.current = detectedHeader;

            // Detectar si esta flota ya existe en el sistema
            // eslint-disable-next-line no-misleading-character-class
            const normalize = (s?: string) =>
                (s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
            const cifNorm     = normalize(detectedHeader.cif);
            const tomadorNorm = normalize(detectedHeader.tomador);
            const matches = listarCarpetas().filter(c => {
                if (carpetaActiva && c.id === carpetaActiva.id) return false;
                const cCif     = normalize(c.header.cif);
                const cTomador = normalize(c.header.tomador);
                const cNombre  = normalize(c.nombre);
                const cifOk    = cifNorm.length > 3 && cCif.length > 3 && cifNorm === cCif;
                const tomOk    = tomadorNorm.length > 3 && cTomador.length > 3 &&
                    (cTomador.includes(tomadorNorm) || tomadorNorm.includes(cTomador));
                const nombreOk = tomadorNorm.length > 3 && cNombre.length > 3 &&
                    (cNombre.includes(tomadorNorm) || tomadorNorm.includes(cNombre));
                return cifOk || tomOk || nombreOk;
            });
            setFlotasMatch(matches);
            setUploadedRows(withPlate);
        } catch (err: unknown) {
            setParseError((err instanceof Error ? err.message : null) || 'Error al leer el archivo');
        }
    };

    // ── Silverdat query ────────────────────────────────────────────────────────
    const querySilverdat = async (mat: string): Promise<{ vehicle?: SilverdatVehicle; noSession?: boolean; fromCache?: boolean }> => {
        const ctrl = new AbortController();
        const poll = setInterval(() => { if (abortRef.current) ctrl.abort(); }, 200);
        try {
            const res = await fetch('/api/silverdat/enrich', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    matriculas: [mat],
                    carpeta_id:     carpetaActiva?.id     ?? '',
                    carpeta_nombre: carpetaActiva?.nombre ?? '',
                    corredor_id:    carpetaActiva?.corredor_id ?? '',
                }),
                signal: ctrl.signal,
            });
            if (res.status === 401) return { noSession: true };
            const data = await res.json();
            if (data.ok && data.results?.[0]?.ok && data.results[0].vehicle) {
                return { vehicle: data.results[0].vehicle as SilverdatVehicle, fromCache: !!data.results[0].fromCache };
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
            anyo_fabricacion: sd?.anyo_fabricacion || '',
            cif_nif: row['cif_nif'] || '',
            tomador: row['tomador'] || '',
            fecha_vencimiento: row['fecha_vencimiento'] || '',
            cia_actual: row['cia_actual'] || '',
            num_poliza_actual: row['num_poliza_actual'] || row['n_poliza_actual'] || '',
            uso: row['uso'] || 'Particular',
            adr: row['adr'] || 'No',
            ambito: row['ambito'] || row['ámbito'] || 'Nacional',
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
        setSdError('');
        setSdFinished(false);

        // Dedup: same plate only queried once even if duplicated in input
        const seenMats = new Set<string>();
        const uniqueRows = rows.filter(r => {
            const mat = r['matricula']?.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            if (!mat || seenMats.has(mat)) return false;
            seenMats.add(mat);
            return true;
        });

        const processed: ProcessedVehicle[] = mergeWith ? [...mergeWith] : [];
        const mergeMap = new Map(processed.map(v => [v.matricula, v]));
        let done = 0;
        setProgress({ current: 0, total: uniqueRows.length, log: [] });

        const processOne = async (row: Record<string, string>) => {
            if (abortRef.current) return;
            const matricula = row['matricula'].trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            let sd: SilverdatVehicle | undefined;
            let id_veh: string | undefined;

            const result = await querySilverdat(matricula);
            if (result.noSession) { setSdError('Sesión Silverdat expirada. Reinicia y vuelve a hacer login.'); abortRef.current = true; return; }
            sd = result.vehicle;
            if (result.fromCache) setCacheCount(n => n + 1);
            if (abortRef.current) return;

            try {
                const rowMarca = row['marca'] || '';
                const rowModelo = row['modelo'] || '';
                const body: Record<string, string | number> = {};
                if (sd?.marca)      body.marca      = sd.marca;
                else if (rowMarca)  body.rawText    = [rowMarca, rowModelo].filter(Boolean).join(' ');
                if (sd?.modelo)     body.modelo     = sd.modelo;
                if (sd?.kw)         body.kw         = sd.kw;
                if (sd?.cilindrada) body.cilindrada = sd.cilindrada;
                if (Object.keys(body).length > 0) {
                    const catData = await (await fetch('/api/catalogo/search', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                    })).json();
                    const lista = catData.candidates ?? catData.candidatos ?? [];
                    if (lista.length > 0) id_veh = lista[0].id_veh;
                }
            } catch { /* catálogo opcional */ }

            const vehicle = buildVehicle(row, sd, id_veh);
            mergeMap.set(matricula, vehicle);
            done++;
            setProgress(p => ({ current: done, total: uniqueRows.length, log: [...p.log, { plate: matricula, ok: !!sd, marca: sd?.marca, modelo: sd?.modelo?.split(' ')[0], fromCache: !!result.fromCache }] }));
        };

        // 3 workers en paralelo — cola compartida
        let queueIdx = 0;
        const worker = async () => {
            while (!abortRef.current) {
                const myIdx = queueIdx++;
                if (myIdx >= uniqueRows.length) break;
                await processOne(uniqueRows[myIdx]);
                if (!abortRef.current && myIdx < uniqueRows.length - 1)
                    await new Promise(r => setTimeout(r, 200));
            }
        };
        await Promise.all([worker(), worker(), worker()]);

        if (!abortRef.current) {
            const all = Array.from(mergeMap.values());
            allProcessedRef.current = all;
            failedRowsRef.current = uniqueRows.filter(r => {
                const mat = r['matricula'].trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                return !mergeMap.get(mat)?.sd_ok;
            });
            setSdFinished(true);
        }
    };

    const checkAndRun = async (rows: Record<string, string>[]) => {
        try {
            const sessionData = await (await fetch('/api/silverdat/login')).json();
            if (!sessionData.hasSession) { setShowSdModal(true); return; }
        } catch { setShowSdModal(true); return; }
        setPhase('processing');
        runProcess(rows);
    };

    const handleProcesar = () => {
        if (!uploadedRows) return;
        if (detectedHeaderRef.current && Object.keys(detectedHeaderRef.current).length > 0) {
            onHeaderUpdate?.(detectedHeaderRef.current);
        }
        if (mode === 'sin') {
            const vehicles = rowsToVehicles(uploadedRows);
            setProcessedVehicles(vehicles);
            onVehiclesProcessed?.(vehicles);
            setPhase('confirm');
        } else {
            checkAndRun(uploadedRows.filter(r => r['matricula']?.trim()));
        }
    };

    const handleRetry = async () => {
        const failed = failedRowsRef.current;
        if (!failed.length) return;
        setSdFinished(false);
        try {
            const sessionData = await (await fetch('/api/silverdat/login')).json();
            if (!sessionData.hasSession) { setShowSdModal(true); return; }
        } catch { setShowSdModal(true); return; }
        runProcess(failed, allProcessedRef.current);
    };

    const handleConfirmProcessed = () => {
        const all = allProcessedRef.current;
        setProcessedVehicles(all);
        onVehiclesProcessed?.(all);
        setPhase('confirm');
    };

    // ── Derived ────────────────────────────────────────────────────────────────
    const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
    const failedCount = failedRowsRef.current.length;
    const okCount = allProcessedRef.current.filter(v => v.sd_ok).length;

    // ── Render ─────────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-full min-h-0">
            {showSdModal && (
                <SilverdatModal
                    onClose={() => setShowSdModal(false)}
                    onSuccess={() => {
                        setShowSdModal(false);
                        if (uploadedRows) {
                            setPhase('processing');
                            runProcess(uploadedRows.filter(r => r['matricula']?.trim()));
                        }
                    }}
                />
            )}

            {/* ── Cabecera ── */}
            <div className="sh" style={{ flexShrink: 0, padding: '20px 32px', borderBottom: '1px solid var(--line)' }}>
                <div>
                    <h2><b>02</b>AUTOMÁTICO</h2>
                    <p>Descarga la plantilla, rellena los vehículos e importa el Excel.</p>
                </div>
                <div className="acts">
                    {phase === 'input' && uploadedRows && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--quiet)' }}>
                            {uploadedRows.length} veh.
                        </span>
                    )}
                    {phase === 'processing' && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-amber)' }}>
                            {progress.current}/{progress.total}
                        </span>
                    )}
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }} className="custom-scrollbar">
                {phase === 'confirm' ? (
                    <Step3
                        vehicles={processedVehicles}
                        onComplete={onComplete}
                        onBack={() => setPhase('input')}
                        polizaMap={polizaMap}
                    />
                ) : (
                    <>
                        {/* Banner flota ya registrada */}
                        {flotasMatch.length > 0 && (
                            <div style={{ padding: '13px 16px', background: 'rgba(245,158,11,0.07)', borderLeft: '2px solid var(--t-amber)', color: 'var(--t-amber)', fontSize: 12, marginBottom: 20 }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 800, marginBottom: 8 }}>Esta flota ya está registrada en Orion</div>
                                        {flotasMatch.map(c => (
                                            <div key={c.id} style={{ fontSize: 11, color: 'var(--t-text-2)', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                <span style={{ fontWeight: 700 }}>{c.nombre}</span>
                                                {c.header.tomador && <span style={{ color: 'var(--t-text-3)' }}>{c.header.tomador}</span>}
                                                <span style={{ padding: '1px 8px', borderRadius: 20, fontSize: 10, fontWeight: 800, background: estadoBg(c.estado), color: estadoColor(c.estado) }}>{c.estado}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <button onClick={() => setFlotasMatch([])} style={{ background: 'none', border: 'none', color: 'var(--t-text-3)', cursor: 'pointer', padding: '2px 4px', flexShrink: 0, fontSize: 16, lineHeight: 1 }}>✕</button>
                                </div>
                            </div>
                        )}

                        {/* ── Tri layout ── */}
                        <div className="tri">

                            {/* Col 1 — Descargar */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                <div>
                                    <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t-text-3)' }}>01 · Descargar</p>
                                    <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: 'var(--t-text)' }}>Plantilla de vehículos</h3>
                                    <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: 'var(--t-text-3)' }}>Plantilla MMT para 200 vehículos, con coberturas opcionales y formato corporativo.</p>
                                </div>
                                <button
                                    onClick={handleDownload}
                                    disabled={downloadLoading}
                                    style={{ padding: '10px 14px', border: '1px solid var(--t-line)', borderRadius: 6, fontSize: 12, fontWeight: 600, background: 'transparent', color: 'var(--t-text)', cursor: downloadLoading ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
                                >
                                    {downloadLoading ? 'Generando...' : 'Descargar plantilla'}
                                </button>
                            </div>

                            {/* Col 2 — Subir */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <div>
                                    <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t-text-3)' }}>02 · Subir</p>
                                    <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: 'var(--t-text)' }}>Importar plantilla</h3>
                                </div>
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    onDragOver={e => e.preventDefault()}
                                    onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                                    style={{
                                        border: `1px dashed ${uploadedRows ? 'var(--t-blue)' : 'var(--t-line)'}`,
                                        borderRadius: 7, textAlign: 'center', padding: '22px 12px',
                                        cursor: 'pointer', background: 'transparent',
                                    }}
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--t-blue)'}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = uploadedRows ? 'var(--t-blue)' : 'var(--t-line)'}
                                >
                                    <strong style={{ display: 'block', fontSize: 13, color: uploadedRows ? 'var(--t-green)' : 'var(--t-text)', margin: '0 0 4px' }}>
                                        {uploadedRows ? `✓ ${uploadedRows.length} vehículos` : 'Seleccionar o arrastrar'}
                                    </strong>
                                    {!uploadedRows && <span style={{ fontSize: 11, color: 'var(--t-text-3)' }}>.xlsx</span>}
                                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
                                </div>
                                {parseError && <p style={{ margin: 0, fontSize: 12, color: 'var(--t-red)', fontWeight: 600 }}>{parseError}</p>}
                                {uploadedRows && duplicadas.length > 0 && (
                                    <div style={{ padding: '9px 12px', background: 'rgba(239,68,68,0.09)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 7 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-red)' }}>{duplicadas.length} dup.</span>
                                            <button
                                                onClick={() => {
                                                    const firstSeen = new Set<string>();
                                                    setUploadedRows(uploadedRows!.filter(r => {
                                                        const mat = r['matricula']?.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                                                        if (!mat) return true;
                                                        if (firstSeen.has(mat)) return false;
                                                        firstSeen.add(mat); return true;
                                                    }));
                                                }}
                                                style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: 'var(--t-red)', border: 'none', borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}
                                            >Eliminar</button>
                                        </div>
                                        <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                            {duplicadas.slice(0, 4).map(m => (
                                                <span key={m} style={{ fontSize: 10, fontWeight: 800, color: 'var(--t-red)', fontFamily: 'monospace', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 3, padding: '1px 5px' }}>
                                                    {m} ×{seenCounts.get(m)}
                                                </span>
                                            ))}
                                            {duplicadas.length > 4 && <span style={{ fontSize: 10, color: 'var(--t-text-3)' }}>+{duplicadas.length - 4}</span>}
                                        </div>
                                    </div>
                                )}
                                {uploadedRows && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                        {uploadedRows.slice(0, 6).map((r, i) => (
                                            <span key={i} style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-3)', background: 'var(--t-line-soft)', border: '1px solid var(--t-line)', borderRadius: 3, padding: '1px 6px', fontFamily: 'monospace' }}>
                                                {r['matricula']}
                                            </span>
                                        ))}
                                        {uploadedRows.length > 6 && <span style={{ fontSize: 10, color: 'var(--t-text-3)' }}>+{uploadedRows.length - 6} más</span>}
                                    </div>
                                )}
                            </div>

                            {/* Col 3 — Modo / Progreso */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {phase === 'input' ? (
                                    <>
                                        <div>
                                            <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t-text-3)' }}>03 · Procesar</p>
                                            <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: 'var(--t-text)' }}>Modo de procesado</h3>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {(['con', 'sin'] as const).map(m => (
                                                <button key={m} onClick={() => setMode(m)} style={{
                                                    padding: '12px 14px', textAlign: 'left', cursor: 'pointer',
                                                    background: mode === m ? 'rgba(18,64,204,0.07)' : 'transparent',
                                                    border: `1px solid ${mode === m ? 'var(--t-blue)' : 'var(--t-line)'}`,
                                                    borderRadius: 8, color: 'var(--t-text)',
                                                }}>
                                                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4, color: mode === m ? 'var(--t-text)' : 'var(--t-text-2)' }}>
                                                        {m === 'con' ? 'Con Silverdat' : 'Solo plantilla'}
                                                    </div>
                                                    <div style={{ fontSize: 11, color: 'var(--t-text-3)', lineHeight: 1.5 }}>
                                                        {m === 'con' ? 'Datos técnicos automáticos (marca, modelo, KW, año).' : 'Carga directa del Excel sin esperas.'}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                        <button
                                            onClick={handleProcesar}
                                            disabled={!uploadedRows}
                                            style={{
                                                marginTop: 4, padding: '12px 0', borderRadius: 8,
                                                background: uploadedRows ? 'linear-gradient(135deg,#1240CC,#3366FF)' : 'transparent',
                                                border: uploadedRows ? 'none' : '1px solid var(--t-line)',
                                                color: uploadedRows ? '#fff' : 'var(--t-text-3)',
                                                fontSize: 12, fontWeight: 700, cursor: uploadedRows ? 'pointer' : 'not-allowed',
                                            }}
                                        >
                                            {mode === 'sin' ? 'Cargar vehículos' : 'Iniciar Silverdat'}
                                        </button>
                                    </>
                                ) : (
                                    // processing phase
                                    <>
                                        <div>
                                            <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t-amber)' }}>03 · Procesando</p>
                                            <h3 style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 700, color: 'var(--t-text)' }}>Silverdat</h3>
                                            <p style={{ margin: '0 0 10px', fontSize: 11, color: 'var(--t-text-3)' }}>{progress.total} vehículos</p>
                                        </div>
                                        {/* Barra de progreso */}
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                                <span style={{ fontSize: 12, fontWeight: 700, color: sdFinished ? 'var(--t-green)' : 'var(--t-amber)' }}>{pct}%</span>
                                                <span style={{ fontSize: 11, color: 'var(--t-text-3)' }}>{progress.current}/{progress.total}</span>
                                            </div>
                                            <div style={{ height: 3, borderRadius: 4, background: 'var(--t-line)', overflow: 'hidden' }}>
                                                <div style={{ height: '100%', borderRadius: 4, transition: 'width 0.4s ease', width: `${pct}%`, background: sdFinished ? 'linear-gradient(90deg,#10b981,#34d399)' : 'linear-gradient(90deg,#d97706,#f59e0b)' }} />
                                            </div>
                                        </div>
                                        {/* Log últimas entradas */}
                                        <div style={{ overflowY: 'auto', maxHeight: 150, display: 'flex', flexDirection: 'column', gap: 1 }}>
                                            {progress.log.slice(-10).map((entry, i) => (
                                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0', fontSize: 11 }}>
                                                    <span style={{ color: entry.ok ? 'var(--t-green)' : 'var(--t-red)', flexShrink: 0 }}>{entry.ok ? '✓' : '✗'}</span>
                                                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--t-text)', flexShrink: 0 }}>{entry.plate}</span>
                                                    {entry.ok && <span style={{ color: 'var(--t-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.marca}</span>}
                                                    {entry.ok && entry.fromCache && <span style={{ fontSize: 9, color: '#6366f1', fontWeight: 700, flexShrink: 0 }}>hist.</span>}
                                                </div>
                                            ))}
                                        </div>
                                        {sdError && <p style={{ margin: 0, fontSize: 11, color: 'var(--t-red)', fontWeight: 600 }}>{sdError}</p>}
                                        {!sdFinished ? (
                                            <button onClick={() => { abortRef.current = true; }} style={{
                                                fontSize: 11, fontWeight: 700, padding: '7px 0', borderRadius: 6,
                                                background: 'rgba(239,68,68,0.10)', color: '#ef4444',
                                                border: '1px solid rgba(239,68,68,0.25)', cursor: 'pointer',
                                            }}>Detener</button>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                <div style={{ display: 'flex', gap: 6 }}>
                                                    <div style={{ flex: 1, textAlign: 'center', padding: '8px 4px', borderRadius: 6, background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.18)' }}>
                                                        <div style={{ fontSize: 18, fontWeight: 800, color: '#10b981' }}>{okCount}</div>
                                                        <div style={{ fontSize: 9, color: 'var(--t-text-3)', textTransform: 'uppercase' }}>SD ✓</div>
                                                    </div>
                                                    {cacheCount > 0 && (
                                                        <div style={{ flex: 1, textAlign: 'center', padding: '8px 4px', borderRadius: 6, background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.18)' }}>
                                                            <div style={{ fontSize: 18, fontWeight: 800, color: '#818cf8' }}>{cacheCount}</div>
                                                            <div style={{ fontSize: 9, color: 'var(--t-text-3)', textTransform: 'uppercase' }}>Caché</div>
                                                        </div>
                                                    )}
                                                    <div style={{ flex: 1, textAlign: 'center', padding: '8px 4px', borderRadius: 6, background: failedCount > 0 ? 'rgba(245,158,11,0.07)' : 'rgba(16,185,129,0.07)', border: `1px solid ${failedCount > 0 ? 'rgba(245,158,11,0.18)' : 'rgba(16,185,129,0.18)'}` }}>
                                                        <div style={{ fontSize: 18, fontWeight: 800, color: failedCount > 0 ? 'var(--t-amber)' : 'var(--t-green)' }}>{failedCount}</div>
                                                        <div style={{ fontSize: 9, color: 'var(--t-text-3)', textTransform: 'uppercase' }}>Sin datos</div>
                                                    </div>
                                                </div>
                                                {failedCount > 0 && (
                                                    <button onClick={handleRetry} style={{
                                                        padding: '8px 0', borderRadius: 6,
                                                        background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.3)',
                                                        color: '#f59e0b', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                                    }}>Segunda barrida ({failedCount})</button>
                                                )}
                                                <button onClick={() => window.open('/api/silverdat/historial-txt', '_blank')} style={{
                                                    padding: '7px 0', borderRadius: 6,
                                                    background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.3)',
                                                    color: '#818cf8', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                                }}>Historial TXT</button>
                                                <button onClick={handleConfirmProcessed} style={{
                                                    padding: '10px 0', borderRadius: 8,
                                                    background: 'linear-gradient(135deg,#1240CC,#2563eb)',
                                                    border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                                }}>Confirmar → Paso 3</button>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
