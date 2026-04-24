import React from 'react';

interface OcrBulkActionsBarProps {
    selectedIds: Set<string>;
    onApprove: () => void;
    onDelete: () => void;
    onExport: () => void;
    onExportZip: () => void;
    onExportExcel: () => void;
    onReprocess: () => void;
    onClearAll: () => void;
}

const ghostBtnStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.6)',
};

export default function OcrBulkActionsBar({
    selectedIds, onApprove, onDelete, onExport, onExportZip, onExportExcel, onReprocess, onClearAll
}: OcrBulkActionsBarProps) {

    if (selectedIds.size === 0) return (
        <div className="flex justify-end p-2 animate-in fade-in">
            <button
                onClick={onClearAll}
                className="px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all"
                style={{ color: '#EF4444', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.15)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Limpiar todo el historial
            </button>
        </div>
    );

    return (
        <div
            className="px-4 py-3 rounded-xl flex items-center justify-between shrink-0 animate-in fade-in slide-in-from-top-4 duration-200"
            style={{
                background: 'rgba(99,102,241,0.06)',
                border: '1px solid rgba(99,102,241,0.18)',
                backdropFilter: 'blur(12px)',
            }}
        >
            <div className="flex items-center gap-2 text-sm font-bold" style={{ color: '#6366f1' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                {selectedIds.size} {selectedIds.size === 1 ? 'fila seleccionada' : 'filas seleccionadas'}
            </div>

            <div className="flex gap-2">
                <button
                    onClick={onApprove}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg transition-all"
                    style={ghostBtnStyle}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(99,102,241,0.4)'; (e.currentTarget as HTMLElement).style.color = '#6366f1'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.6)'; }}
                >
                    Aprobar Selección
                </button>
                <button
                    onClick={onExport}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg transition-all"
                    style={ghostBtnStyle}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(99,102,241,0.4)'; (e.currentTarget as HTMLElement).style.color = '#6366f1'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.6)'; }}
                >
                    Exportar
                </button>
                <button
                    onClick={onExportZip}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg transition-all"
                    style={ghostBtnStyle}
                    title="Descargar documentos mixtos ordenados por vehículo (ZIP)"
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(99,102,241,0.4)'; (e.currentTarget as HTMLElement).style.color = '#6366f1'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.6)'; }}
                >
                    Exportar ZIP Ordenado
                </button>
                <button
                    onClick={onExportExcel}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5"
                    style={ghostBtnStyle}
                    title="Exportar selección a Excel (.xlsx)"
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(34,197,94,0.5)'; (e.currentTarget as HTMLElement).style.color = '#22C55E'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.6)'; }}
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Exportar Excel
                </button>
                <button
                    onClick={onReprocess}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg transition-all"
                    style={ghostBtnStyle}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(245,158,11,0.5)'; (e.currentTarget as HTMLElement).style.color = '#F59E0B'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.6)'; }}
                >
                    Reprocesar
                </button>
                <button
                    onClick={onDelete}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg transition-all"
                    style={ghostBtnStyle}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(239,68,68,0.5)'; (e.currentTarget as HTMLElement).style.color = '#EF4444'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.6)'; }}
                >
                    Eliminar
                </button>
            </div>
        </div>
    );
}
