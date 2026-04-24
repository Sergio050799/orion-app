import React from 'react';
import { DocumentRecord } from "@/services/document-service";
import { getTableMapping, toText, getCompatibleVehicleData } from "@/core/pipelines/_shared/ocrTableMapper";

interface OcrDocumentsTableProps {
    documents: DocumentRecord[];
    selectedIds: Set<string>;
    onChangeSelection: (ids: Set<string>) => void;
    activeId: string | null;
    activeSegmentId?: string | null;
    onRowClick: (id: string) => void;
    onSegmentClick?: (docId: string, segmentId: string) => void;
    onApproveRow: (id: string) => void;
    onExportRow: (id: string) => void;
    onReprocessRow: (id: string) => void;
}

export default function OcrDocumentsTable({
    documents, selectedIds, onChangeSelection, activeId, activeSegmentId, onRowClick, onSegmentClick, onApproveRow, onExportRow, onReprocessRow
}: OcrDocumentsTableProps) {
    const [expandedMixIds, setExpandedMixIds] = React.useState<Set<string>>(new Set());
    const [errorDoc, setErrorDoc] = React.useState<DocumentRecord | null>(null);
    const [debugDoc, setDebugDoc] = React.useState<any>(null);

    const toggleSelectAll = () => {
        if (selectedIds.size === documents.length && documents.length > 0) {
            onChangeSelection(new Set());
        } else {
            onChangeSelection(new Set(documents.map(d => d.id)));
        }
    };

    return (
        <div className="glass-card flex-1 flex flex-col overflow-hidden min-w-[600px] animate-in fade-in duration-500 rounded-2xl">
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <table className="w-full text-left whitespace-nowrap">
                    <thead
                        className="sticky top-0 z-10"
                        style={{
                            background: 'rgba(2,6,23,0.95)',
                            borderBottom: '1px solid rgba(255,255,255,0.07)',
                        }}
                    >
                        <tr>
                            <th className="py-3 px-4 w-10 text-center">
                                <input
                                    type="checkbox"
                                    checked={documents.length > 0 && selectedIds.size === documents.length}
                                    onChange={toggleSelectAll}
                                    className="rounded cursor-pointer"
                                    style={{ accentColor: '#6366f1' }}
                                />
                            </th>
                            <th className="th w-12 text-center">Nº</th>
                            <th className="th">Estado</th>
                            <th className="th">Matrícula</th>
                            <th className="th">Tipo</th>
                            <th className="th">Servicio</th>
                            <th className="th">Marca</th>
                            <th className="th">Modelo</th>
                            <th className="th">CV</th>
                            <th className="th">Año Mat.</th>
                            <th className="th text-center">Aprobado</th>
                            <th className="th text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {documents.length === 0 && (
                            <tr>
                                <td colSpan={12} className="text-center py-12 text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
                                    No hay documentos analizados.
                                </td>
                            </tr>
                        )}
                        {documents.map((doc, index) => {
                            const isSelected = selectedIds.has(doc.id);
                            const isActive = activeId === doc.id;

                            const m = getTableMapping(doc);

                            return (
                                <React.Fragment key={doc.id}>
                                    <tr
                                        onClick={() => onRowClick?.(doc.id)}
                                        className="cursor-pointer group transition-colors relative"
                                        style={{
                                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                                            background: isActive ? 'rgba(99,102,241,0.05)' : undefined,
                                        }}
                                        onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'; }}
                                        onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = ''; }}
                                    >
                                        {/* Checkbox */}
                                        <td className="py-3 px-4 w-10 relative">
                                            {isActive && (
                                                <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-r-full" style={{ background: '#6366f1' }} />
                                            )}
                                            <div onClick={(e) => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 rounded cursor-pointer"
                                                    style={{ accentColor: '#6366f1' }}
                                                    checked={selectedIds.has(doc.id)}
                                                    onChange={() => {
                                                        const next = new Set(selectedIds);
                                                        if (next.has(doc.id)) next.delete(doc.id); else next.add(doc.id);
                                                        onChangeSelection(next);
                                                    }}
                                                />
                                            </div>
                                        </td>

                                        {/* Filename / Nº */}
                                        <td className="py-3 px-4">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold text-white/80" title={doc.fileName}>
                                                    {doc.fileName.length > 35 ? doc.fileName.substring(0, 35) + '...' : doc.fileName}
                                                </span>
                                                <div className="flex items-center gap-1.5 mt-1">
                                                    <span className="text-[10px] font-medium tracking-wide" style={{ color: 'rgba(255,255,255,0.3)' }}>
                                                        {doc.uploadDate}
                                                    </span>
                                                    {doc.optimization?.optimized && (
                                                        <span
                                                            className="text-[9px] font-bold px-1.5 py-0.5 rounded ml-2 cursor-help tracking-wide"
                                                            style={{ color: '#6366f1', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}
                                                            title={`Optimizado: ${Math.round((doc.optimization.beforeBytes || 0) / 1024)}KB -> ${Math.round((doc.optimization.afterBytes || 0) / 1024)}KB.\nDetalles:\n${doc.optimization.steps?.join('\n') || ''}`}
                                                        >
                                                            ⚡ OPTIMIZADO
                                                        </span>
                                                    )}
                                                    {(doc.status === 'completed' && getCompatibleVehicleData(doc)?._v2Debug && getCompatibleVehicleData(doc)?._v2Debug?.foundTokens?.D1 === 0) ? (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setDebugDoc(getCompatibleVehicleData(doc)._v2Debug); }}
                                                            className="text-[9px] font-bold px-1.5 py-0.5 rounded ml-2 tracking-wide transition-colors"
                                                            style={{ color: '#d946ef', background: 'rgba(217,70,239,0.1)', border: '1px solid rgba(217,70,239,0.25)' }}
                                                        >
                                                            DEBUG OCR
                                                        </button>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </td>

                                        {/* Estado */}
                                        <td className="py-3 px-4 align-middle">
                                            <div className="flex items-center gap-1.5">
                                                {doc.status === "completed" && <><span className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-xs font-bold text-emerald-400">Completado</span></>}
                                                {doc.status === "processing" && !doc.uiHint && <><span className="w-2 h-2 rounded-full bg-[#6366f1] animate-pulse" /><span className="text-xs font-bold" style={{ color: '#6366f1' }}>Procesando {doc.progress}%</span></>}
                                                {doc.status === "processing" && doc.uiHint === "aborted_client_waiting_reconcile" && <><span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" /><span className="text-xs font-bold text-orange-400">Verificando estado...</span></>}
                                                {doc.status === "processing" && doc.uiHint === "stalled" && <><span className="w-2 h-2 rounded-full bg-red-400" /><span className="text-xs font-bold text-red-400">Atascado (Timeout)</span></>}
                                                {doc.status === "queued" && <><span className="w-2 h-2 rounded-full bg-amber-400" /><span className="text-xs font-bold text-amber-400">En cola</span></>}
                                                {doc.status === "failed" && <><span className="w-2 h-2 rounded-full bg-red-400" /><span className="text-xs font-bold text-red-400">Fallido</span></>}
                                            </div>
                                            {(doc.status === 'processing' || doc.status === 'queued') && (
                                                <div className="w-full h-1 rounded overflow-hidden mt-1 max-w-[100px]" style={{ background: 'rgba(255,255,255,0.08)' }}>
                                                    <div
                                                        className="h-full transition-all duration-300 ease-out rounded"
                                                        style={{
                                                            width: `${doc.progress}%`,
                                                            background: doc.uiHint === "aborted_client_waiting_reconcile" ? '#F97316' : doc.uiHint === "stalled" ? '#EF4444' : '#6366f1',
                                                        }}
                                                    />
                                                </div>
                                            )}
                                            {doc.status === 'failed' && (
                                                <div className="flex flex-col gap-0.5 mt-1">
                                                    <span className="text-[10px] text-red-400 truncate max-w-[120px]" title={doc.error || ''}>{doc.error}</span>
                                                    {(doc.errorMessage || doc.errorCode) && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setErrorDoc(doc); }}
                                                            className="text-[10px] font-bold hover:underline self-start px-1.5 py-0.5 rounded transition-colors"
                                                            style={{ color: '#EF4444', background: 'rgba(239,68,68,0.1)' }}
                                                        >
                                                            Ver error
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </td>

                                        {/* Matrícula */}
                                        <td className="py-3 px-4 align-middle">
                                            {doc.isMixedPdf ? (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); const next = new Set(expandedMixIds); if (next.has(doc.id)) next.delete(doc.id); else next.add(doc.id); setExpandedMixIds(next); }}
                                                    className="text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 transition-colors"
                                                    style={{ color: '#6366f1', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}
                                                >
                                                    Ver vehículos ({doc.vehicleGroups?.length || 0})
                                                    <svg className={`w-3 h-3 transition-transform ${expandedMixIds.has(doc.id) ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                    </svg>
                                                </button>
                                            ) : m.plate !== '-' ? (
                                                <div className="font-mono font-bold text-sm px-2 py-0.5 rounded tracking-widest inline-block uppercase" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.85)' }}>
                                                    {m.plate}
                                                </div>
                                            ) : <span className="text-xs font-mono" style={{ color: 'rgba(255,255,255,0.25)' }}>-</span>}
                                        </td>

                                        {/* Tipo */}
                                        <td className="py-3 px-4 text-xs font-medium align-middle" style={{ color: 'rgba(255,255,255,0.5)' }}>
                                            {doc.isMixedPdf
                                                ? <span className="text-[10px] font-bold px-2 py-0.5 rounded tracking-wider" style={{ color: '#a78bfa', background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)' }}>MIXED PDF</span>
                                                : m.docType
                                            }
                                        </td>

                                        {/* Servicio */}
                                        <td className="py-3 px-4 text-xs font-medium align-middle" style={{ color: 'rgba(255,255,255,0.5)' }}>
                                            {!doc.isMixedPdf && m.service !== '-' ? (
                                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap opacity-80" style={{ color: '#6366f1', background: 'rgba(99,102,241,0.08)' }} title={m.service}>
                                                    {m.service}
                                                </span>
                                            ) : '-'}
                                        </td>

                                        {/* Marca */}
                                        <td className="py-3 px-4 text-xs font-bold align-middle max-w-[120px] truncate" style={{ color: 'rgba(255,255,255,0.75)' }} title={m.brand}>
                                            {m.brand}
                                        </td>

                                        {/* Modelo */}
                                        <td className="py-3 px-4 text-xs font-medium align-middle max-w-[150px] truncate" style={{ color: 'rgba(255,255,255,0.5)' }} title={m.model}>
                                            {m.model}
                                        </td>

                                        {/* CV */}
                                        <td className="py-3 px-4 text-xs font-mono align-middle" style={{ color: 'rgba(255,255,255,0.5)' }}>
                                            {m.cv}
                                        </td>

                                        {/* Año */}
                                        <td className="py-3 px-4 text-xs align-middle font-mono" style={{ color: 'rgba(255,255,255,0.5)' }}>
                                            {m.year}
                                        </td>

                                        {/* Aprobado */}
                                        <td className="py-3 px-4 align-middle text-center">
                                            {doc.status === "completed" && !doc.isMixedPdf && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onApproveRow(doc.id); }}
                                                    className="w-6 h-6 rounded-full inline-flex items-center justify-center transition-all"
                                                    style={doc.approved
                                                        ? { background: '#10B981', border: '1px solid #10B981' }
                                                        : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)' }
                                                    }
                                                    title={doc.approved ? "Desmarcar" : "Aprobar Documento"}
                                                >
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={doc.approved ? 'white' : 'rgba(255,255,255,0.3)'} strokeWidth="3">
                                                        <polyline points="20 6 9 17 4 12" />
                                                    </svg>
                                                </button>
                                            )}
                                        </td>

                                        {/* Acciones */}
                                        <td className="py-3 px-4 align-middle text-right">
                                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {doc.status === "failed" && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onReprocessRow(doc.id); }}
                                                        className="px-2 py-1 text-xs font-bold rounded transition-colors"
                                                        style={{ color: 'rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                                                    >
                                                        Reprocesar
                                                    </button>
                                                )}
                                                {doc.status === "completed" && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onExportRow(doc.id); }}
                                                        className="px-2 py-1 text-xs font-bold rounded transition-colors"
                                                        style={{ color: 'rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                                                    >
                                                        Exportar
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>

                                    {/* Mixed PDF expansion */}
                                    {doc.isMixedPdf && expandedMixIds.has(doc.id) && (
                                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.01)' }}>
                                            <td colSpan={12} className="p-0">
                                                <div className="py-4 pl-16 pr-8">
                                                    <h4 className="text-[10px] uppercase font-black tracking-widest mb-3 pb-2" style={{ color: 'rgba(255,255,255,0.3)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                                                        Vehículos Detectados ({doc.vehicleGroups?.length || 0})
                                                    </h4>
                                                    <div className="flex flex-col gap-3">
                                                        {doc.vehicleGroups?.map((group, gIdx) => (
                                                            <div
                                                                key={group.id || gIdx}
                                                                className="p-3 rounded-xl flex flex-col md:flex-row gap-4 items-start md:items-center justify-between transition-colors"
                                                                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
                                                            >
                                                                <div className="flex flex-col gap-1">
                                                                    <div className="flex items-center gap-3">
                                                                        <span className="font-mono font-bold text-sm px-2.5 py-1 rounded" style={{ color: 'rgba(255,255,255,0.85)', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}>
                                                                            {group.matricula || 'S/M'}
                                                                        </span>
                                                                        <span className="text-xs font-mono" style={{ color: 'rgba(255,255,255,0.35)' }} title="Bastidor">
                                                                            {group.bastidor || 'Bastidor no detectado'}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                                <div className="flex flex-wrap gap-2 items-center">
                                                                    {group.documents?.map((seg) => {
                                                                        const isActiveSeg = activeSegmentId === seg.segmentId;
                                                                        return (
                                                                            <button
                                                                                key={seg.segmentId}
                                                                                onClick={(e) => { e.stopPropagation(); onSegmentClick?.(doc.id, seg.segmentId); }}
                                                                                className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-all"
                                                                                style={isActiveSeg
                                                                                    ? { color: '#6366f1', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)' }
                                                                                    : { color: 'rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }
                                                                                }
                                                                            >
                                                                                <svg className="w-3.5 h-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                                                </svg>
                                                                                {seg.type === 'FICHA_TECNICA' ? 'Ficha Técnica'
                                                                                    : seg.type === 'PERMISO_COMPLETO' ? 'Permiso (Completo)'
                                                                                    : seg.type === 'PERMISO_TARJETA' ? 'Permiso (Tarjeta)'
                                                                                    : seg.type}
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        ))}
                                                        {!doc.vehicleGroups?.length && (
                                                            <div className="text-xs py-2" style={{ color: 'rgba(255,255,255,0.3)' }}>
                                                                No se detectaron subdocumentos. Mostrando informe estándar.
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Modal: Error */}
            {errorDoc && (
                <div
                    className="fixed inset-0 flex items-center justify-center z-50 animate-in fade-in zoom-in-95 duration-200"
                    style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
                    onClick={(e) => { e.stopPropagation(); setErrorDoc(null); }}
                >
                    <div
                        className="rounded-2xl max-w-lg w-full p-6 shadow-2xl m-4 flex flex-col max-h-[90vh]"
                        style={{ background: 'rgba(2,6,23,0.97)', border: '1px solid rgba(239,68,68,0.3)', backdropFilter: 'blur(24px)' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-lg font-black text-white mb-1 flex items-center gap-2">
                            <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Detalle del Error
                        </h3>
                        <p className="text-xs mb-4 font-mono" style={{ color: 'rgba(255,255,255,0.35)' }}>Documento: {errorDoc.fileName}</p>

                        {errorDoc.errorCode && (
                            <div className="mb-4">
                                <span className="text-[10px] font-bold uppercase tracking-widest block mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Código</span>
                                <span className="font-mono text-sm px-2 py-1 rounded inline-block" style={{ color: '#EF4444', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
                                    {errorDoc.errorCode}
                                </span>
                            </div>
                        )}

                        <div className="mb-4 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <span className="text-[10px] font-bold uppercase tracking-widest block mb-2" style={{ color: 'rgba(255,255,255,0.3)' }}>Logs Básicos de Ejecución</span>
                            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.5)' }}>
                                <div><span style={{ color: 'rgba(255,255,255,0.3)' }}>Heartbeat:</span> {errorDoc.heartbeatAt ? new Date(errorDoc.heartbeatAt).toLocaleTimeString() : 'N/A'}</div>
                                <div><span style={{ color: 'rgba(255,255,255,0.3)' }}>Intentos:</span> {errorDoc.attempts || 1}</div>
                                <div><span style={{ color: 'rgba(255,255,255,0.3)' }}>Total Páginas:</span> {errorDoc.pagesTotal || '?'}</div>
                                <div><span style={{ color: 'rgba(255,255,255,0.3)' }}>Progreso:</span> {errorDoc.progress}%</div>
                                <div className="col-span-2"><span style={{ color: 'rgba(255,255,255,0.3)' }}>Inicio:</span> {errorDoc.startedAt ? new Date(errorDoc.startedAt).toLocaleTimeString() : 'N/A'}</div>
                            </div>
                        </div>

                        <div className="flex-1 min-h-0 overflow-y-auto mb-6 rounded-xl p-4 custom-scrollbar" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <span className="text-[10px] font-bold uppercase tracking-widest block mb-2" style={{ color: 'rgba(255,255,255,0.3)' }}>Traza o Mensaje Completo</span>
                            <pre className="text-[11px] font-mono whitespace-pre-wrap break-words" style={{ color: 'rgba(255,255,255,0.7)' }}>{errorDoc.errorMessage || errorDoc.error}</pre>
                        </div>

                        <div className="flex justify-end gap-3 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                            <button
                                onClick={() => navigator.clipboard.writeText(errorDoc.errorMessage || errorDoc.error || '')}
                                className="px-4 py-2 text-xs font-bold rounded-xl transition-colors"
                                style={{ color: 'rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                            >
                                Copiar
                            </button>
                            <button
                                onClick={async () => {
                                    const { DocumentService } = await import('@/services/document-service');
                                    DocumentService.reprocessDocument(errorDoc.id);
                                    setErrorDoc(null);
                                }}
                                className="px-4 py-2 text-xs font-bold rounded-xl transition-all"
                                style={{ color: '#020617', background: '#6366f1' }}
                                onMouseEnter={e => (e.currentTarget.style.background = '#5AEAFF')}
                                onMouseLeave={e => (e.currentTarget.style.background = '#6366f1')}
                            >
                                Reintentar
                            </button>
                            <button
                                onClick={() => setErrorDoc(null)}
                                className="px-4 py-2 text-xs font-bold rounded-xl transition-colors"
                                style={{ color: 'rgba(255,255,255,0.6)', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)' }}
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Debug OCR */}
            {debugDoc && (
                <div
                    className="fixed inset-0 flex items-center justify-center z-50 animate-in fade-in"
                    style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
                    onClick={(e) => { e.stopPropagation(); setDebugDoc(null); }}
                >
                    <div
                        className="rounded-2xl max-w-2xl w-full p-6 shadow-2xl m-4 flex flex-col max-h-[90vh]"
                        style={{ background: 'rgba(2,6,23,0.97)', border: '1px solid rgba(217,70,239,0.25)', backdropFilter: 'blur(24px)' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-lg font-black mb-4 text-white flex items-center gap-2">
                            <span style={{ color: '#d946ef' }}>⬡</span> Diagnóstico OCR (Fallback V2)
                        </h3>

                        <div className="mb-4 flex gap-4 text-xs font-bold font-mono" style={{ color: 'rgba(255,255,255,0.4)' }}>
                            <div>Source: <span style={{ color: '#d946ef' }}>{debugDoc.bestSource}</span></div>
                            <div>Len: <span className="text-white/70">{debugDoc.fullTextLen} chars</span></div>
                            <div>Lines: <span className="text-white/70">{debugDoc.linesCount}</span></div>
                        </div>

                        <div className="flex-1 min-h-0 overflow-y-auto mb-4 rounded-xl p-4 custom-scrollbar" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <span className="text-[10px] font-bold uppercase tracking-widest block mb-2" style={{ color: 'rgba(255,255,255,0.3)' }}>RAW OCR TEXT SAMPLE (FIRST 500 CHARS)</span>
                            <pre className="text-[11px] font-mono whitespace-pre-wrap break-words" style={{ color: 'rgba(255,255,255,0.7)' }}>{debugDoc.sampleFirst500}</pre>
                        </div>

                        <div className="mb-4">
                            <span className="text-[10px] font-bold uppercase tracking-widest block mb-2" style={{ color: 'rgba(255,255,255,0.3)' }}>TOKENS FOUND</span>
                            <pre className="text-xs font-mono p-3 rounded-lg" style={{ background: 'rgba(0,0,0,0.3)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                {JSON.stringify(debugDoc.foundTokens, null, 2)}
                            </pre>
                        </div>

                        <div className="flex justify-end gap-3 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                            <button
                                onClick={() => setDebugDoc(null)}
                                className="px-4 py-2 font-bold rounded-xl transition-all text-xs"
                                style={{ color: '#020617', background: '#6366f1' }}
                                onMouseEnter={e => (e.currentTarget.style.background = '#5AEAFF')}
                                onMouseLeave={e => (e.currentTarget.style.background = '#6366f1')}
                            >
                                Cerrar Debug
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
