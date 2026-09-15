import React, { useState } from 'react';
import { CarnetConducirRecord } from '@/core/pipelines/carnet/carnet.types';

interface CarnetReportCardProps {
    ui: CarnetConducirRecord | null;
    isLoading?: boolean;
}

const ALL_CATEGORIES = ['AM', 'A1', 'A2', 'A', 'B1', 'B', 'BE', 'C1', 'C1E', 'C', 'CE', 'D1', 'D1E', 'D', 'DE'];

const cardStyle: React.CSSProperties = {
    background: 'rgba(2,6,23,0.92)',
    border: '1px solid rgba(255,255,255,0.08)',
};

const panelStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)',
};

/** Parsea DD-MM-YYYY y devuelve estado de vigencia */
function getExpiryStatus(dateStr: string | null | undefined): 'valid' | 'soon' | 'expired' | null {
    if (!dateStr) return null;
    const parts = dateStr.split('-');
    if (parts.length !== 3) return null;
    const [d, m, y] = parts.map(Number);
    const date = new Date(y, m - 1, d);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays < 0) return 'expired';
    if (diffDays < 90) return 'soon';
    return 'valid';
}

const expiryColors = {
    valid:   { color: '#10B981', bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.2)',  label: 'En vigor' },
    soon:    { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.2)',  label: 'Próxima caducidad' },
    expired: { color: '#EF4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.2)',   label: 'Caducado' },
};

function val(field: any): string | null {
    return field?.value ?? null;
}

function DataRow({ label, value, mono = false }: { label: string; value?: string | null; mono?: boolean }) {
    return (
        <div className="flex flex-col py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <span className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
                {label}
            </span>
            <span
                className={`text-sm font-semibold ${mono ? 'font-mono' : ''}`}
                style={{ color: value ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.2)' }}
            >
                {value || '—'}
            </span>
        </div>
    );
}

export default function CarnetReportCard({ ui, isLoading }: CarnetReportCardProps) {
    const [copiedNif, setCopiedNif] = useState(false);

    if (isLoading) {
        return (
            <div className="w-full max-w-[1600px] mx-auto rounded-2xl flex flex-col p-6 overflow-hidden relative" style={cardStyle}>
                <div className="absolute top-0 left-0 right-0 h-px animate-pulse" style={{ background: 'linear-gradient(90deg, transparent, #1240CC, transparent)' }} />
                <div className="animate-pulse space-y-5 mt-4">
                    <div className="h-16 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)' }} />
                    <div className="h-10 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)' }} />
                    <div className="grid grid-cols-3 gap-3">
                        {Array.from({ length: 9 }).map((_, i) => (
                            <div key={i} className="h-10 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)' }} />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (!ui) {
        return (
            <div
                className="w-full max-w-[1600px] mx-auto rounded-2xl flex items-center justify-center p-8 text-sm text-center"
                style={{ ...cardStyle, color: 'rgba(255,255,255,0.25)' }}
            >
                A la espera de datos para mostrar el carnet.
            </div>
        );
    }

    const apellidos = val(ui.identification?.apellidos);
    const nombre = val(ui.identification?.nombre);
    const nif = val(ui.identification?.nif);
    const fechaNac = val(ui.identification?.fecha_nacimiento);
    const paisNac = val(ui.identification?.pais_nacimiento);
    const fechaExp = val(ui.validity?.fecha_expedicion);
    const fechaCad = val(ui.validity?.fecha_caducidad);
    const codigoAut = val(ui.validity?.codigo_autoridad);
    const categorias: string[] = ui.categories?.lista?.value || [];

    const nombreCompleto = [apellidos, nombre].filter(Boolean).join(', ');
    const expiryStatus = getExpiryStatus(fechaCad);
    const expiry = expiryStatus ? expiryColors[expiryStatus] : null;

    const handleCopyNif = () => {
        if (!nif) return;
        navigator.clipboard.writeText(nif);
        setCopiedNif(true);
        setTimeout(() => setCopiedNif(false), 2000);
    };

    return (
        <div
            className="flex-1 w-full max-w-[1600px] mx-auto min-w-[340px] rounded-2xl flex flex-col overflow-hidden relative animate-in slide-in-from-right-8 duration-300"
            style={cardStyle}
        >
            <div className="flex-1 overflow-y-auto custom-scrollbar">

                {/* ── HEADER ── */}
                <div
                    className="px-8 pt-8 pb-7 relative"
                    style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
                >
                    {/* Top accent */}
                    <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(18,64,204,0.45), transparent)' }} />

                    {/* Tipo documento */}
                    <div className="flex items-center gap-2 mb-4">
                        <span
                            className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg"
                            style={{ color: '#1240CC', background: 'rgba(18,64,204,0.1)', border: '1px solid rgba(18,64,204,0.2)' }}
                        >
                            Permiso de Conducción
                        </span>
                        {expiry && (
                            <span
                                className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg flex items-center gap-1.5"
                                style={{ color: expiry.color, background: expiry.bg, border: `1px solid ${expiry.border}` }}
                            >
                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: expiry.color }} />
                                {expiry.label}
                            </span>
                        )}
                    </div>

                    {/* NIF — dato principal */}
                    <div className="flex items-end gap-4 mb-3">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>NIF / Titular</p>
                            <div className="flex items-center gap-3">
                                <span className="text-4xl font-black text-white tracking-widest font-mono">
                                    {nif || '—'}
                                </span>
                                {nif && (
                                    <button
                                        onClick={handleCopyNif}
                                        className="mt-1 transition-opacity"
                                        title="Copiar NIF"
                                    >
                                        {copiedNif
                                            ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                                            : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'rgba(255,255,255,0.3)' }}><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                                        }
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Nombre completo */}
                    <p className="text-xl font-black tracking-wide" style={{ color: 'rgba(255,255,255,0.55)' }}>
                        {nombreCompleto || '—'}
                    </p>
                </div>

                {/* ── BODY ── */}
                <div className="p-4 sm:p-6 lg:p-8 flex flex-col gap-6">

                    {/* Datos personales + Vigencia */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                        {/* Datos personales */}
                        <div className="rounded-xl p-5" style={panelStyle}>
                            <h4 className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: 'rgba(255,255,255,0.28)' }}>
                                Datos Personales
                            </h4>
                            <DataRow label="Apellidos" value={apellidos} />
                            <DataRow label="Nombre" value={nombre} />
                            <DataRow label="Fecha de nacimiento" value={fechaNac} mono />
                            <DataRow label="País de nacimiento" value={paisNac} />
                        </div>

                        {/* Vigencia */}
                        <div className="rounded-xl p-5" style={panelStyle}>
                            <h4 className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: 'rgba(255,255,255,0.28)' }}>
                                Vigencia
                            </h4>
                            <DataRow label="Fecha de expedición" value={fechaExp} mono />

                            {/* Caducidad con indicador visual */}
                            <div className="flex flex-col py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <span className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
                                    Fecha de caducidad
                                </span>
                                <div className="flex items-center gap-2">
                                    <span
                                        className="text-sm font-semibold font-mono"
                                        style={{ color: expiry ? expiry.color : 'rgba(255,255,255,0.78)' }}
                                    >
                                        {fechaCad || '—'}
                                    </span>
                                    {expiry && expiryStatus === 'expired' && (
                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase" style={{ color: '#EF4444', background: 'rgba(239,68,68,0.1)' }}>
                                            CADUCADO
                                        </span>
                                    )}
                                    {expiry && expiryStatus === 'soon' && (
                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase" style={{ color: '#F59E0B', background: 'rgba(245,158,11,0.1)' }}>
                                            &lt; 90 días
                                        </span>
                                    )}
                                </div>
                            </div>

                            <DataRow label="Código de autoridad" value={codigoAut} mono />
                        </div>
                    </div>

                    {/* ── CATEGORÍAS ── El dato estrella */}
                    <div
                        className="rounded-xl p-6"
                        style={{
                            background: categorias.length > 0 ? 'rgba(18,64,204,0.04)' : 'rgba(255,255,255,0.02)',
                            border: categorias.length > 0 ? '1px solid rgba(18,64,204,0.15)' : '1px solid rgba(255,255,255,0.07)',
                        }}
                    >
                        <div className="flex items-center justify-between mb-5">
                            <h4
                                className="text-[10px] font-black uppercase tracking-widest"
                                style={{ color: categorias.length > 0 ? '#1240CC' : 'rgba(255,255,255,0.28)' }}
                            >
                                Categorías habilitadas
                            </h4>
                            {categorias.length > 0 && (
                                <span
                                    className="text-xs font-black px-3 py-1 rounded-full"
                                    style={{ color: '#1240CC', background: 'rgba(18,64,204,0.12)', border: '1px solid rgba(18,64,204,0.2)' }}
                                >
                                    {categorias.length} / {ALL_CATEGORIES.length}
                                </span>
                            )}
                        </div>

                        <div className="flex flex-wrap gap-2.5">
                            {ALL_CATEGORIES.map(cat => {
                                const hasIt = categorias.includes(cat);
                                return (
                                    <div
                                        key={cat}
                                        className="flex items-center justify-center rounded-xl font-black text-sm transition-all"
                                        style={hasIt ? {
                                            minWidth: '52px',
                                            padding: '10px 14px',
                                            color: '#020617',
                                            background: '#1240CC',
                                            boxShadow: '0 0 16px rgba(18,64,204,0.35)',
                                        } : {
                                            minWidth: '52px',
                                            padding: '10px 14px',
                                            color: 'rgba(255,255,255,0.18)',
                                            background: 'rgba(255,255,255,0.03)',
                                            border: '1px solid rgba(255,255,255,0.07)',
                                        }}
                                    >
                                        {cat}
                                    </div>
                                );
                            })}
                        </div>

                        {categorias.length === 0 && (
                            <p className="text-xs mt-3" style={{ color: 'rgba(255,255,255,0.25)' }}>
                                No se detectaron categorías en este documento.
                            </p>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
}
