"use client";

import React, { useState, useMemo } from 'react';
import { InvoiceDocumentRecord } from "@/services/financial-service";
import { exportInvoicesToXlsx } from "@/core/utils/exportInvoicesToXlsx";

interface Props {
    docs: InvoiceDocumentRecord[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    onReprocess: (id: string) => void;
    onDelete: (ids: string[]) => void;
}

const thStyle: React.CSSProperties = {
    color: 'rgba(255,255,255,0.3)',
};

export default function InvoiceDocumentsTable({ docs, selectedId, onSelect, onReprocess, onDelete }: Props) {
    const [sortCol, setSortCol] = useState<'date' | 'vendor' | 'total' | 'filename'>('date');
    const [sortDesc, setSortDesc] = useState(true);
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const toggleSort = (col: typeof sortCol) => {
        if (sortCol === col) setSortDesc(!sortDesc);
        else { setSortCol(col); setSortDesc(true); }
    };

    const handleSelectAll = (checked: boolean) => {
        if (!checked) setSelectedIds(new Set());
        else setSelectedIds(new Set(sorted.map(d => d.id)));
    };

    const toggleSelect = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
        e.stopPropagation();
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelectedIds(next);
    };

    const sorted = useMemo(() => {
        let filtered = docs;
        if (filterStatus !== 'all') filtered = filtered.filter(d => d.status === filterStatus);

        return [...filtered].sort((a, b) => {
            let valA: any = '', valB: any = '';
            if (sortCol === 'date') { valA = a.invoice?.issueDate || a.createdAt; valB = b.invoice?.issueDate || b.createdAt; }
            else if (sortCol === 'vendor') { valA = a.invoice?.vendorName || ''; valB = b.invoice?.vendorName || ''; }
            else if (sortCol === 'total') { valA = a.invoice?.total || 0; valB = b.invoice?.total || 0; }
            else if (sortCol === 'filename') { valA = a.fileName.toLowerCase(); valB = b.fileName.toLowerCase(); }
            if (valA < valB) return sortDesc ? 1 : -1;
            if (valA > valB) return sortDesc ? -1 : 1;
            return 0;
        });
    }, [docs, sortCol, sortDesc, filterStatus]);

    const formatCurrency = (val: number | null | undefined, currency: string | null | undefined) => {
        if (typeof val !== 'number') return '—';
        return `${val.toLocaleString('es-ES', { minimumFractionDigits: 2 })} ${currency || '€'}`;
    };

    return (
        <div className="glass-card rounded-2xl overflow-hidden flex flex-col min-h-0 h-full animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Toolbar */}
            <div
                className="p-4 flex items-center justify-between shrink-0"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}
            >
                <div className="flex items-center gap-4">
                    <select
                        value={filterStatus}
                        onChange={e => setFilterStatus(e.target.value)}
                        className="orion-input text-xs font-bold uppercase tracking-widest rounded-lg px-3 py-1.5 w-auto"
                    >
                        <option value="all">Todos ({docs.length})</option>
                        <option value="completed">Completados</option>
                        <option value="processing">En Proceso</option>
                        <option value="queued">En Cola</option>
                        <option value="failed">Fallidos</option>
                    </select>
                </div>
                {selectedIds.size > 0 && (
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold mr-2" style={{ color: 'rgba(255,255,255,0.4)' }}>{selectedIds.size} seleccionados</span>
                        <button
                            onClick={() => {
                                const selectedDocs = docs.filter(d => selectedIds.has(d.id));
                                exportInvoicesToXlsx(selectedDocs, `ORION_Facturas_${new Date().toISOString().split('T')[0]}.xlsx`);
                            }}
                            className="text-[10px] px-3 py-1.5 rounded-lg font-bold uppercase tracking-widest flex items-center gap-1.5 transition-colors"
                            style={{ color: '#10B981', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                            Exportar
                        </button>
                        <button
                            onClick={() => { onDelete(Array.from(selectedIds)); setSelectedIds(new Set()); }}
                            className="text-[10px] px-3 py-1.5 rounded-lg font-bold uppercase tracking-widest flex items-center gap-1.5 transition-colors"
                            style={{ color: '#EF4444', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                            Eliminar Historial
                        </button>
                    </div>
                )}
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                    <thead
                        className="sticky top-0 z-10"
                        style={{ background: 'rgba(2,6,23,0.95)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                    >
                        <tr>
                            <th className="py-3 px-3 w-10">
                                <input
                                    type="checkbox"
                                    checked={selectedIds.size > 0 && selectedIds.size === sorted.length}
                                    onChange={(e) => handleSelectAll(e.target.checked)}
                                    style={{ accentColor: '#6366f1' }}
                                />
                            </th>
                            <th className="th cursor-pointer hover:text-[#6366f1] transition-colors" style={thStyle} onClick={() => toggleSort('filename')}>
                                Archivo {sortCol === 'filename' && (sortDesc ? '↓' : '↑')}
                            </th>
                            <th className="th cursor-pointer hover:text-[#6366f1] transition-colors" style={thStyle} onClick={() => toggleSort('vendor')}>
                                Proveedor {sortCol === 'vendor' && (sortDesc ? '↓' : '↑')}
                            </th>
                            <th className="th cursor-pointer hover:text-[#6366f1] transition-colors" style={thStyle} onClick={() => toggleSort('date')}>
                                Fecha {sortCol === 'date' && (sortDesc ? '↓' : '↑')}
                            </th>
                            <th className="th text-right cursor-pointer hover:text-[#6366f1] transition-colors" style={thStyle} onClick={() => toggleSort('total')}>
                                Total {sortCol === 'total' && (sortDesc ? '↓' : '↑')}
                            </th>
                            <th className="th text-center" style={thStyle}>Estado</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="py-12 text-center text-sm font-semibold border-0" style={{ color: 'rgba(255,255,255,0.3)' }}>
                                    No hay facturas para mostrar en este momento.
                                </td>
                            </tr>
                        ) : sorted.map(doc => {
                            const active = selectedId === doc.id;
                            const isCheck = selectedIds.has(doc.id);

                            return (
                                <tr
                                    key={doc.id}
                                    onClick={() => onSelect(doc.id)}
                                    className="group cursor-pointer transition-colors"
                                    style={{
                                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                                        background: active ? 'rgba(99,102,241,0.05)' : undefined,
                                    }}
                                    onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'; }}
                                    onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = ''; }}
                                >
                                    <td className="py-3 px-3" onClick={e => e.stopPropagation()}>
                                        <input
                                            type="checkbox"
                                            checked={isCheck}
                                            onChange={(e) => toggleSelect(doc.id, e)}
                                            style={{ accentColor: '#6366f1' }}
                                        />
                                    </td>
                                    <td className="py-3 px-3">
                                        <div className="text-xs font-bold truncate max-w-[200px] text-white/75" title={doc.fileName}>{doc.fileName}</div>
                                    </td>
                                    <td className="py-3 px-3">
                                        <div className="flex flex-col">
                                            <div className="text-xs font-semibold truncate max-w-[150px] text-white/70" title={doc.invoice?.vendorName || ''}>
                                                {doc.invoice?.vendorName || <span style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>}
                                            </div>
                                            {doc.invoice?.vendorTaxId && (
                                                <div className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.3)' }}>{doc.invoice.vendorTaxId}</div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-3 px-3">
                                        <div className="flex flex-col">
                                            <div className="text-xs font-mono truncate" style={{ color: 'rgba(255,255,255,0.55)' }}>
                                                {doc.invoice?.issueDate || <span style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>}
                                            </div>
                                            {doc.invoice?.invoiceNumber && (
                                                <div className="text-[10px] truncate" style={{ color: 'rgba(255,255,255,0.3)' }} title={doc.invoice.invoiceNumber}>Nº {doc.invoice.invoiceNumber}</div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-3 px-3 text-right">
                                        <div className="text-xs font-black whitespace-nowrap text-white/80">{formatCurrency(doc.invoice?.total, doc.invoice?.currency)}</div>
                                    </td>
                                    <td className="py-3 px-3 text-center">
                                        {doc.status === 'completed' && (
                                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[9px] font-bold uppercase tracking-widest" style={{ color: '#10B981', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Completado
                                            </span>
                                        )}
                                        {doc.status === 'queued' && (
                                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[9px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                                <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />Cola
                                            </span>
                                        )}
                                        {doc.status === 'processing' && (
                                            <div className="flex flex-col gap-1 items-center justify-center w-[70px] mx-auto">
                                                <div className="w-full rounded-full h-1.5 overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                                                    <div className="h-1.5 rounded-full transition-all duration-300" style={{ width: `${doc.progress}%`, background: '#6366f1' }} />
                                                </div>
                                                <span className="text-[9px] font-bold animate-pulse" style={{ color: '#6366f1' }}>{doc.progress}%</span>
                                            </div>
                                        )}
                                        {doc.status === 'failed' && (
                                            <div className="flex items-center justify-center gap-2">
                                                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[9px] font-bold uppercase tracking-widest" style={{ color: '#EF4444', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }} title={doc.error || ''}>
                                                    <div className="w-1.5 h-1.5 rounded-full bg-red-400" />Error
                                                </span>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onReprocess(doc.id); }}
                                                    style={{ color: 'rgba(255,255,255,0.4)' }}
                                                    className="hover:text-[#6366f1] transition-colors"
                                                    title="Reintentar"
                                                >
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
