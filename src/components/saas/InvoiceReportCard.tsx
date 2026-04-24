import React, { useState } from 'react';
import { InvoiceDocumentRecord, FinancialService } from "@/services/financial-service";

interface InvoiceReportCardProps {
    doc: InvoiceDocumentRecord | null;
    isLoading?: boolean;
    isExpanded?: boolean;
    onToggleExpand?: () => void;
}

const cardStyle: React.CSSProperties = {
    background: 'rgba(2,6,23,0.85)',
    border: '1px solid rgba(255,255,255,0.08)',
    backdropFilter: 'blur(24px)',
};

const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.15)',
    color: 'white',
};

export default function InvoiceReportCard({ doc, isLoading, isExpanded = false, onToggleExpand }: InvoiceReportCardProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [editForm, setEditForm] = useState({
        vendorName: '',
        vendorTaxId: '',
        issueDate: '',
        dueDate: '',
        invoiceNumber: ''
    });

    if (isLoading) {
        return (
            <div className="flex-[0.8] xl:flex-[0.6] min-w-[400px] rounded-2xl flex flex-col p-6 overflow-hidden relative" style={cardStyle}>
                <div className="absolute top-0 left-0 right-0 h-px animate-pulse" style={{ background: 'linear-gradient(90deg, transparent, #10B981, transparent)' }} />
                <div className="animate-pulse space-y-6 flex-1 mt-4">
                    <div className="h-12 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }} />
                    <div className="grid grid-cols-3 gap-4">
                        {[1,2,3].map(i => <div key={i} className="h-8 rounded" style={{ background: 'rgba(255,255,255,0.05)' }} />)}
                    </div>
                </div>
            </div>
        );
    }

    if (!doc || !doc.invoice) {
        return (
            <div className="flex-[0.8] xl:flex-[0.6] min-w-[400px] rounded-2xl flex items-center justify-center p-8 text-center text-sm" style={{ ...cardStyle, color: 'rgba(255,255,255,0.25)' }}>
                <div className="max-w-[200px]">
                    <svg className="w-12 h-12 mx-auto mb-4 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
                    </svg>
                    A la espera de datos para mostrar la factura.
                </div>
            </div>
        );
    }

    const { invoice } = doc;

    const formatCurrency = (val: number | null | undefined) => {
        if (typeof val !== 'number') return '—';
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
    };

    const getCategory = (vendorName?: string | null) => {
        if (!vendorName) return { label: 'SERVICIOS', accent: 'rgba(255,255,255,0.3)', bg: 'rgba(255,255,255,0.05)' };
        const lower = vendorName.toLowerCase();
        if (lower.includes('vodafone') || lower.includes('movistar') || lower.includes('orange'))
            return { label: 'TELCO', accent: '#a78bfa', bg: 'rgba(167,139,250,0.1)' };
        if (lower.includes('iberdrola') || lower.includes('endesa') || lower.includes('naturgy') || lower.includes('repsol') || lower.includes('agua') || lower.includes('elect') || lower.includes('gas'))
            return { label: 'ENERGÍA', accent: '#6366f1', bg: 'rgba(99,102,241,0.08)' };
        return { label: 'SERVICIOS', accent: 'rgba(255,255,255,0.3)', bg: 'rgba(255,255,255,0.05)' };
    };

    const handleEditStart = () => {
        setEditForm({
            vendorName: invoice.vendorName || '',
            vendorTaxId: invoice.vendorTaxId || '',
            issueDate: invoice.issueDate || '',
            dueDate: invoice.dueDate || '',
            invoiceNumber: invoice.invoiceNumber || ''
        });
        setIsEditMode(true);
    };

    const handleSaveEdit = async () => {
        const payload = {
            vendorName: editForm.vendorName,
            vendorTaxId: editForm.vendorTaxId,
            issueDate: editForm.issueDate,
            dueDate: editForm.dueDate,
            invoiceNumber: editForm.invoiceNumber,
            originalValues: invoice.originalValues || {}
        } as any;

        if (editForm.vendorTaxId !== invoice.vendorTaxId) { payload.taxIdSource = 'manual'; payload.taxIdConfidence = 1; }
        if (editForm.vendorName !== invoice.vendorName && !('vendorName' in payload.originalValues)) payload.originalValues.vendorName = invoice.vendorName;
        if (editForm.vendorTaxId !== invoice.vendorTaxId && !('vendorTaxId' in payload.originalValues)) payload.originalValues.vendorTaxId = invoice.vendorTaxId;
        if (editForm.issueDate !== invoice.issueDate && !('issueDate' in payload.originalValues)) payload.originalValues.issueDate = invoice.issueDate;
        if (editForm.dueDate !== invoice.dueDate && !('dueDate' in payload.originalValues)) payload.originalValues.dueDate = invoice.dueDate;
        if (editForm.invoiceNumber !== invoice.invoiceNumber && !('invoiceNumber' in payload.originalValues)) payload.originalValues.invoiceNumber = invoice.invoiceNumber;

        await FinancialService.updateRecord(doc.id, { invoice: { ...invoice, ...payload } as any });
        setIsEditMode(false);
    };

    const handleRevert = async () => {
        if (!invoice.originalValues) return;
        const reverted = { ...invoice };
        Object.keys(invoice.originalValues).forEach(k => { (reverted as any)[k] = (invoice.originalValues as any)[k]; });
        reverted.originalValues = {};
        await FinancialService.updateRecord(doc.id, { invoice: reverted as any });
    };

    const category = getCategory(invoice.vendorName);
    const hasIRPF = invoice.taxBreakdown?.some(t => t.kind === "IRPF");
    const irpfAmount = hasIRPF ? invoice.taxBreakdown!.filter(t => t.kind === "IRPF").reduce((acc, curr) => acc + curr.amount, 0) : 0;
    const numPagesDetetected = invoice.pageEvidence?.length || 1;
    const hasManualOverrides = invoice.originalValues && Object.keys(invoice.originalValues).length > 0;

    const editedBadge = (
        <span className="text-[8px] px-1.5 py-0.5 rounded uppercase font-bold" style={{ color: '#F59E0B', background: 'rgba(245,158,11,0.1)' }}>Editado</span>
    );

    const labelStyle: React.CSSProperties = { color: 'rgba(255,255,255,0.3)' };

    return (
        <div className={`w-full h-full rounded-2xl flex flex-col overflow-hidden relative animate-in fade-in slide-in-from-bottom-2 duration-500 ${isExpanded ? 'max-w-[1400px] mx-auto' : ''}`} style={cardStyle}>

            {/* Header Toolbar */}
            <div className="p-3 shrink-0 flex items-center justify-between" style={{ background: 'rgba(0,0,0,0.25)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <span className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" /></svg>
                    Vista Detalle
                </span>

                <div className="flex items-center gap-2">
                    {hasManualOverrides && !isEditMode && (
                        <button
                            onClick={handleRevert}
                            className="text-[9px] flex items-center gap-1 font-bold uppercase tracking-widest px-2 py-1 rounded transition-colors mr-2"
                            style={{ color: '#F59E0B', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}
                        >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
                            Revertir a automático
                        </button>
                    )}
                    {onToggleExpand && (
                        <button
                            onClick={onToggleExpand}
                            className="text-[10px] px-3 py-1.5 rounded-lg font-bold uppercase tracking-widest flex items-center gap-1.5 focus:outline-none transition-colors"
                            style={{ color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                        >
                            {isExpanded ? (
                                <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 14h6v6" /><path d="M20 10h-6V4" /><path d="M14 10l7-7" /><path d="M3 21l7-7" /></svg> Volver a Split Grid</>
                            ) : (
                                <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" /></svg> Expandir Informe</>
                            )}
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar relative">

                {/* 1. COMPACT HEADER */}
                <div className="px-6 py-4 shrink-0 flex flex-col gap-4 relative group" style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                    {!isEditMode && (
                        <button
                            onClick={handleEditStart}
                            className="absolute right-6 top-6 opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-full z-10"
                            style={{ color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.08)' }}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </button>
                    )}

                    <div className="flex justify-between items-center pr-8">
                        {isEditMode ? (
                            <input
                                type="text"
                                value={editForm.invoiceNumber}
                                onChange={e => setEditForm(f => ({ ...f, invoiceNumber: e.target.value }))}
                                className="px-3 py-1 rounded text-2xl font-mono font-black tracking-widest uppercase w-64 focus:outline-none"
                                style={inputStyle}
                                placeholder="FACTURA S/N"
                            />
                        ) : (
                            <div className="flex items-center gap-3 min-w-0">
                                <h2 className="font-mono text-2xl font-black text-white tracking-widest uppercase break-words">
                                    {invoice.invoiceNumber || 'FACTURA S/N'}
                                </h2>
                                <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-widest" style={{ color: category.accent, background: category.bg, border: `1px solid ${category.accent}30` }}>
                                    {category.label}
                                </span>
                                {hasManualOverrides && invoice.originalValues?.invoiceNumber && editedBadge}
                            </div>
                        )}
                        <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                            {invoice.hasInferredData && (
                                <span className="text-[9px] px-2 py-1 rounded font-bold uppercase tracking-widest flex items-center gap-1 cursor-help" style={{ color: '#6366f1', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)' }} title="Algunos campos han sido reconstruidos mediante reglas contables.">
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>
                                    Validación Automática
                                </span>
                            )}
                            <span className="text-[9px] px-2 py-1 rounded font-bold uppercase tracking-widest cursor-help" style={{ color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} title="Procesamiento automatizado de alta precisión para facturas">
                                DOCUMENT INTELLIGENCE
                            </span>
                        </div>
                    </div>

                    <div className={`grid gap-4 ${isExpanded ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2'}`}>
                        {/* Proveedor */}
                        <div className="flex flex-col min-w-0">
                            <span className="text-[9px] font-bold uppercase tracking-wider mb-0.5 flex items-center gap-1.5" style={labelStyle}>
                                Proveedor
                                {hasManualOverrides && invoice.originalValues && 'vendorName' in invoice.originalValues && editedBadge}
                            </span>
                            {isEditMode ? (
                                <input type="text" value={editForm.vendorName} onChange={e => setEditForm(f => ({ ...f, vendorName: e.target.value }))} className="px-2 py-1 rounded text-xs focus:outline-none w-full" style={inputStyle} placeholder="Razón Social" />
                            ) : (
                                <span className="text-xs font-semibold text-white/75 truncate" title={invoice.vendorName || ''}>{invoice.vendorName || '—'}</span>
                            )}
                        </div>

                        {/* CIF */}
                        <div className="flex flex-col min-w-0">
                            <span className="text-[9px] font-bold uppercase tracking-wider mb-0.5 flex items-center gap-1.5" style={labelStyle}>
                                CIF Proveedor
                                {hasManualOverrides && invoice.originalValues && 'vendorTaxId' in invoice.originalValues && editedBadge}
                            </span>
                            {isEditMode ? (
                                <input type="text" value={editForm.vendorTaxId} onChange={e => setEditForm(f => ({ ...f, vendorTaxId: e.target.value.toUpperCase() }))} className="px-2 py-1 rounded text-xs focus:outline-none w-full font-mono uppercase" style={inputStyle} placeholder="A12345678" />
                            ) : (
                                <span className="text-xs font-semibold text-white/75 truncate">{invoice.vendorTaxId || '—'}</span>
                            )}
                        </div>

                        {/* Fecha Emisión */}
                        <div className="flex flex-col min-w-0">
                            <span className="text-[9px] font-bold uppercase tracking-wider mb-0.5 flex items-center gap-1.5" style={labelStyle}>
                                Fecha Emisión
                                {hasManualOverrides && invoice.originalValues && 'issueDate' in invoice.originalValues && editedBadge}
                            </span>
                            {isEditMode ? (
                                <input type="text" value={editForm.issueDate} onChange={e => setEditForm(f => ({ ...f, issueDate: e.target.value }))} className="px-2 py-1 rounded text-xs focus:outline-none w-full" style={inputStyle} placeholder="YYYY-MM-DD" />
                            ) : (
                                <span className="text-xs font-bold truncate" style={{ color: '#6366f1' }}>{invoice.issueDate || '—'}</span>
                            )}
                        </div>

                        {/* Vencimiento */}
                        <div className="flex flex-col min-w-0">
                            <span className="text-[9px] font-bold uppercase tracking-wider mb-0.5 flex items-center gap-1.5" style={labelStyle}>
                                Vencimiento
                                {hasManualOverrides && invoice.originalValues && 'dueDate' in invoice.originalValues && editedBadge}
                            </span>
                            {isEditMode ? (
                                <input type="text" value={editForm.dueDate} onChange={e => setEditForm(f => ({ ...f, dueDate: e.target.value }))} className="px-2 py-1 rounded text-xs focus:outline-none w-full" style={inputStyle} placeholder="YYYY-MM-DD" />
                            ) : (
                                <span className="text-xs font-semibold text-white/75 truncate">{invoice.dueDate || '—'}</span>
                            )}
                        </div>
                    </div>

                    {isEditMode && (
                        <div className="flex justify-end gap-2 mt-2 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                            <button onClick={() => setIsEditMode(false)} className="text-xs px-3 py-1.5 rounded transition-colors" style={{ color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.06)' }}>Cancelar</button>
                            <button onClick={handleSaveEdit} className="text-xs px-4 py-1.5 font-bold tracking-wide rounded transition-all" style={{ background: '#6366f1', color: '#020617' }}>Guardar</button>
                        </div>
                    )}
                </div>

                {/* CIF Cliente */}
                {invoice.customerTaxId && (
                    <div className="px-6 py-1.5 flex items-center justify-between" style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <span className="text-[10px] uppercase font-bold" style={{ color: 'rgba(255,255,255,0.3)' }}>Datos Cliente</span>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>CIF Cliente recabado:</span>
                            <span className="text-xs font-mono font-medium text-white/50">{invoice.customerTaxId}</span>
                        </div>
                    </div>
                )}

                {/* 2. TOTALES */}
                <div className="p-6 flex flex-col gap-4 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.01)' }}>
                    <div className={`grid gap-3 ${isExpanded ? 'grid-cols-1 md:grid-cols-4 lg:grid-cols-4' : 'grid-cols-2'}`}>
                        {/* Base Imponible */}
                        <div className={`flex flex-col rounded-xl min-w-0 overflow-hidden animate-in fade-in slide-in-from-bottom-2 fill-mode-both delay-75 ${isExpanded ? 'px-5 py-4' : 'px-4 h-[92px] justify-center'}`} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <span className={`font-bold uppercase tracking-widest mb-1 ${isExpanded ? 'text-[10px]' : 'text-[9px] opacity-70'}`} style={{ color: 'rgba(255,255,255,0.35)' }}>Base Imponible</span>
                            <span className={`font-black text-white tabular-nums tracking-tight leading-none whitespace-nowrap ${isExpanded ? 'text-2xl xl:text-3xl' : 'text-xl md:text-2xl'}`}>{formatCurrency(invoice.subtotal)}</span>
                        </div>

                        {/* IVA Total */}
                        <div className={`flex flex-col rounded-xl min-w-0 overflow-hidden animate-in fade-in slide-in-from-bottom-2 fill-mode-both delay-100 ${isExpanded ? 'px-5 py-4' : 'px-4 h-[92px] justify-center'}`} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <span className={`font-bold uppercase tracking-widest mb-1 ${isExpanded ? 'text-[10px]' : 'text-[9px] opacity-70'}`} style={{ color: 'rgba(255,255,255,0.35)' }}>IVA Total</span>
                            <span className={`font-black text-white tabular-nums tracking-tight leading-none whitespace-nowrap ${isExpanded ? 'text-2xl xl:text-3xl' : 'text-xl md:text-2xl'}`}>
                                {invoice.taxBreakdown?.some(t => t.kind === "IVA")
                                    ? formatCurrency(invoice.taxBreakdown.filter(t => t.kind === "IVA").reduce((acc, curr) => acc + curr.amount, 0))
                                    : formatCurrency(invoice.taxTotal)}
                            </span>
                        </div>

                        {/* IRPF */}
                        {hasIRPF && (
                            <div className={`flex flex-col rounded-xl min-w-0 overflow-hidden animate-in fade-in slide-in-from-bottom-2 fill-mode-both delay-150 ${isExpanded ? 'px-5 py-4' : 'px-4 h-[92px] justify-center'}`} style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)' }}>
                                <span className={`font-bold uppercase tracking-widest mb-1 ${isExpanded ? 'text-[10px]' : 'text-[9px] opacity-70'}`} style={{ color: 'rgba(239,68,68,0.7)' }}>Retención (IRPF)</span>
                                <span className={`font-black tabular-nums tracking-tight leading-none whitespace-nowrap ${isExpanded ? 'text-2xl xl:text-3xl' : 'text-xl md:text-2xl'}`} style={{ color: '#EF4444' }}>
                                    -{formatCurrency(irpfAmount)}
                                </span>
                            </div>
                        )}

                        {/* Total Factura (highlight) */}
                        <div
                            className={`flex flex-col rounded-xl min-w-0 flex-1 relative overflow-hidden animate-in fade-in slide-in-from-bottom-2 fill-mode-both delay-200 ${isExpanded ? (hasIRPF ? 'px-5 py-4 md:col-start-1 lg:col-start-auto' : 'px-5 py-4 md:col-start-1 lg:col-span-2 lg:col-start-auto') : 'px-4 h-[92px] justify-center col-span-2 md:col-span-1'}`}
                            style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.3)' }}
                        >
                            <div className="absolute left-0 top-0 bottom-0 w-[5px] rounded-r-full" style={{ background: '#10B981' }} />
                            <span className={`font-bold uppercase tracking-widest mb-1 flex items-center gap-1.5 ${isExpanded ? 'text-xs' : 'text-[10px] opacity-80'}`} style={{ color: '#10B981' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                                Total Factura
                            </span>
                            <span className={`font-black text-white tabular-nums tracking-tight leading-none whitespace-nowrap scale-[1.15] origin-left ${isExpanded ? 'text-4xl xl:text-5xl' : 'text-3xl md:text-4xl'}`}>
                                {formatCurrency(invoice.total)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* 3. LINE ITEMS */}
                <div className="p-6">
                    <div className="text-[10px] font-black uppercase tracking-widest mb-4 flex flex-col sm:flex-row sm:items-center justify-between pb-2 gap-2" style={{ color: 'rgba(255,255,255,0.3)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <div className="flex items-center gap-2">
                            <span>Conceptos ({invoice.lineItems?.length || 0})</span>
                            {invoice.lineItemsCollapsed && (
                                <span className="px-2 py-0.5 rounded text-[9px] font-bold" style={{ color: '#F59E0B', background: 'rgba(245,158,11,0.1)' }}>Resumen (+80 líneas)</span>
                            )}
                        </div>
                    </div>

                    {invoice.hasUsageDetail && (
                        <div className="mb-4 text-xs px-3 py-2 rounded-lg flex items-center gap-2" style={{ color: '#6366f1', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}>
                            <svg className="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                            Se han omitido páginas de detalle de consumo para mostrar únicamente información contable relevante.
                        </div>
                    )}

                    {invoice.lineItems && invoice.lineItems.length > 0 ? (
                        <>
                            <div className="min-w-0 overflow-x-auto md:overflow-visible mb-6">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                            <th className="py-2 pr-4 text-[10px] font-bold uppercase tracking-widest min-w-[240px] md:min-w-0 w-full" style={{ color: 'rgba(255,255,255,0.3)' }}>Descripción</th>
                                            <th className="py-2 px-4 text-[10px] font-bold uppercase tracking-widest text-right whitespace-nowrap w-[80px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Cant.</th>
                                            <th className="py-2 px-4 text-[10px] font-bold uppercase tracking-widest text-right whitespace-nowrap w-[100px]" style={{ color: 'rgba(255,255,255,0.3)' }}>P. Unit</th>
                                            <th className="py-2 px-4 text-[10px] font-bold uppercase tracking-widest text-right whitespace-nowrap w-[80px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Imp.</th>
                                            <th className="py-2 pl-4 text-[10px] font-bold uppercase tracking-widest text-right whitespace-nowrap w-[110px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(invoice.lineItemsCollapsed ? invoice.lineItems.slice(0, 30) : invoice.lineItems).map((item, idx) => (
                                            <tr
                                                key={idx}
                                                className="group transition-colors"
                                                style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'}
                                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}
                                            >
                                                <td className="py-4 pr-4 text-sm font-semibold text-white/75 min-w-0">
                                                    <div className="line-clamp-2" title={item.description || ''}>{item.description || '—'}</div>
                                                </td>
                                                <td className="py-4 px-4 text-xs font-mono font-medium text-right whitespace-nowrap tabular-nums w-[80px]" style={{ color: 'rgba(255,255,255,0.5)' }}>{item.quantity ?? '—'}</td>
                                                <td className="py-4 px-4 text-sm font-mono font-medium text-right whitespace-nowrap tabular-nums w-[100px]" style={{ color: 'rgba(255,255,255,0.5)' }}>{formatCurrency(item.unitPrice)}</td>
                                                <td className="py-4 px-4 text-xs font-mono font-medium text-right whitespace-nowrap tabular-nums w-[80px]" style={{ color: 'rgba(255,255,255,0.5)' }}>{item.taxRate ? `${item.taxRate}%` : '—'}</td>
                                                <td className="py-4 pl-4 text-sm font-mono font-bold text-right whitespace-nowrap tabular-nums w-[110px] group-hover:text-[#6366f1] transition-colors text-white/80">{formatCurrency(item.amount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="flex justify-end pt-4 px-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                <div className="flex items-center gap-4">
                                    <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>SUBTOTAL CONCEPTOS:</span>
                                    <span className="text-sm font-black font-mono tabular-nums text-white/80">
                                        {formatCurrency(invoice.lineItemsCollapsed ? invoice.subtotal : invoice.lineItems.reduce((acc, current) => acc + (current.amount || 0), 0))}
                                    </span>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="text-xs italic py-4" style={{ color: 'rgba(255,255,255,0.3)' }}>No se detectaron líneas de detalle en la factura.</div>
                    )}
                </div>

                {/* 4. INTELIGENCIA DE ARCHIVO */}
                <div className="p-6 pt-0">
                    <div className="text-[10px] font-black uppercase tracking-widest mb-3 flex items-center justify-between pt-2" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        <div className="flex items-center gap-2">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                            Inteligencia de Archivo
                        </div>
                    </div>

                    <div className="relative overflow-hidden rounded-xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                            {[
                                { label: 'Archivo Original', value: doc.fileName },
                                { label: 'Confianza de extracción', value: `${(invoice.confidence ? invoice.confidence * 100 : 99).toFixed(0)}%` },
                                { label: 'Páginas Detectadas', value: `${numPagesDetetected} ${numPagesDetetected === 1 ? 'página' : 'páginas'}` },
                            ].map(row => (
                                <div key={row.label} className="flex justify-between items-center pb-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'rgba(255,255,255,0.3)' }}>{row.label}</span>
                                    <span className="text-xs font-semibold text-white/60 truncate max-w-[200px]" title={row.value}>{row.value}</span>
                                </div>
                            ))}
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'rgba(255,255,255,0.3)' }}>Páginas Contables</span>
                                <div className="flex items-center gap-3">
                                    <span className="text-xs font-bold text-white/60">{invoice.pagesUsed || '1'}</span>
                                    {invoice.pageEvidence && (
                                        <button
                                            onClick={() => setIsModalOpen(true)}
                                            className="text-[9px] px-2 py-1 rounded font-bold tracking-widest uppercase flex items-center gap-1 transition-colors"
                                            style={{ color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                                        >
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                                            Ver Filtro
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>

            {/* TRANSPARENCY MODAL */}
            {isModalOpen && (
                <div className="absolute inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200 rounded-2xl" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
                    <div className="rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90%] flex flex-col overflow-hidden animate-in slide-in-from-bottom-8" style={{ background: 'rgba(2,6,23,0.97)', border: '1px solid rgba(255,255,255,0.12)' }}>
                        <div className="p-4 flex justify-between items-center" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
                            <div>
                                <h3 className="font-bold text-white">Transparencia de Análisis OCR</h3>
                                <p className="text-[10px] uppercase tracking-widest mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Métricas de Relevance Scoring Multipage</p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="p-1 rounded-lg transition-colors" style={{ color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.06)' }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto min-h-0 flex-1 custom-scrollbar" style={{ background: 'rgba(0,0,0,0.2)' }}>
                            <div className="mb-6 p-4 rounded-xl text-xs leading-relaxed" style={{ color: '#6366f1', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}>
                                <strong>ORION</strong> ha omitido automáticamente páginas para optimizar la exactitud de lectura de la factura. Sólo las páginas clasificadas como <code className="px-1 py-0.5 rounded text-[10px] mx-1" style={{ background: 'rgba(99,102,241,0.15)' }}>ACCOUNTING_SUMMARY</code> se han retenido.
                            </div>

                            <div className="space-y-3">
                                {(((invoice.pageEvidence as { pageIndex: number, classification: string, textPreview: string, score: number, reasons: string[] }[]) || [])).map((ev, idx: number) => (
                                    <div key={idx} className="p-4 rounded-xl text-sm flex flex-col sm:flex-row gap-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="font-bold text-white">Página {ev.pageIndex}</span>
                                                <span
                                                    className="text-[9px] px-2 py-0.5 rounded font-bold tracking-widest uppercase"
                                                    style={ev.classification === 'ACCOUNTING_SUMMARY'
                                                        ? { color: '#10B981', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }
                                                        : ev.classification === 'USAGE_DETAIL'
                                                            ? { color: '#EF4444', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }
                                                            : { color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.05)' }
                                                    }
                                                >
                                                    {ev.classification}
                                                </span>
                                            </div>
                                            <div className="text-xs italic mb-2 pl-3 py-1 line-clamp-3" style={{ color: 'rgba(255,255,255,0.4)', borderLeft: '2px solid rgba(255,255,255,0.1)' }}>
                                                &quot;{ev.textPreview}...&quot;
                                            </div>
                                        </div>
                                        <div className="w-56 shrink-0 p-3 rounded-lg" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                            <div className="text-[10px] uppercase font-black mb-1 flex items-center justify-between" style={{ color: 'rgba(255,255,255,0.35)' }}>
                                                Scoring
                                                <span className={`text-xs ${ev.score > 0 ? 'text-emerald-400' : ev.score < 0 ? 'text-red-400' : 'text-white/30'}`}>{ev.score > 0 ? `+${ev.score}` : ev.score}</span>
                                            </div>
                                            <ul className="text-[10px] font-mono font-medium space-y-1 mt-2">
                                                {ev.reasons.map((r: string, rIdx: number) => (
                                                    <li key={rIdx} className={`flex items-start gap-1 ${r.startsWith('+') ? 'text-emerald-400' : 'text-red-400'}`}>
                                                        <span className="shrink-0 mt-0.5">{r.startsWith('+') ? '↑' : '↓'}</span>
                                                        <span>{r.substring(2)}</span>
                                                    </li>
                                                ))}
                                                {ev.reasons.length === 0 && <li className="italic" style={{ color: 'rgba(255,255,255,0.3)' }}>No patterns detected.</li>}
                                            </ul>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="p-4 flex justify-between items-center shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
                            <a
                                href={`/api/orion/document-intelligence/history-financial/download?snapshot=${encodeURIComponent(doc.snapshotPath || '')}`}
                                target="_blank"
                                className="text-xs font-bold transition-colors inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
                                style={{ color: '#6366f1', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                                JSON Raw
                            </a>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
