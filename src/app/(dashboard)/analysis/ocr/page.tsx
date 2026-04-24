"use client";

import { useState, useEffect, useCallback } from "react";
import { DocumentService, DocumentRecord } from "@/services/document-service";
import OcrUploadBar from "./components/OcrUploadBar";
import OcrDocumentsTable from "./components/OcrDocumentsTable";
import OcrReportPreview from "./components/OcrReportPreview";
import OcrKpiStrip from "./components/OcrKpiStrip";
import OcrBulkActionsBar from "./components/OcrBulkActionsBar";
import OcrBulkUploadQueue from "./components/OcrBulkUploadQueue";
import type { UploadMeta } from './components/UploadTypeModal';
import { exportDocumentsToCsv } from "@/core/utils/exportToCsv";

interface Toast { msg: string; type: 'error' | 'success' | 'info'; }

export default function OCRAnalysisPage() {
    const [documents, setDocuments] = useState<DocumentRecord[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [activeId, setActiveId] = useState<string | null>(null);
    const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
    const [kpis, setKpis] = useState({ processed: 0, pending: 0, failed: 0, today: 0 });
    const [toast, setToast] = useState<Toast | null>(null);
    const [bulkQueue, setBulkQueue] = useState<{ files: File[]; meta: UploadMeta } | null>(null);

    const showToast = useCallback((msg: string, type: Toast['type'] = 'info') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 4000);
    }, []);

    useEffect(() => {
        DocumentService.loadHistoryIfNeeded().then(() => {
            setDocuments(DocumentService.getDocuments());
            setKpis(DocumentService.getKPIs());
            DocumentService.startPollerIfInFlight();
        });

        const unsubscribe = DocumentService.subscribe(() => {
            setDocuments(DocumentService.getDocuments());
            setKpis(DocumentService.getKPIs());
        });

        return () => { unsubscribe(); };
    }, []);

    const handleUploadFiles = useCallback(async (files: File[], meta?: UploadMeta) => {
        await DocumentService.uploadDocuments(files, meta);
        setDocuments(DocumentService.getDocuments());
    }, []);

    const handleBulkProcess = useCallback(async (files: File[], meta: UploadMeta) => {
        setBulkQueue(null);
        await DocumentService.uploadDocuments(files, meta);
        setDocuments(DocumentService.getDocuments());
    }, []);

    const handleApprove = async (id: string) => {
        await DocumentService.toggleApprove(id);
    };

    const handleExport = (id: string) => {
        const doc = documents.find(d => d.id === id);
        if (doc) {
            exportDocumentsToCsv([doc], `orion_doc_${id}.csv`);
        }
    };

    const handleBulkApprove = async () => {
        for (const id of Array.from(selectedIds)) {
            const doc = documents.find(d => d.id === id);
            if (doc && !doc.approved) {
                await DocumentService.toggleApprove(id);
            }
        }
        setSelectedIds(new Set());
    };

    const handleBulkDelete = () => {
        DocumentService.deleteDocuments(selectedIds);
        setSelectedIds(new Set());
    };

    const handleClearHistory = () => {
        if (confirm("¿Estás seguro de querer limpiar TODO el historial de documentos en Zona 3? Esta acción no se puede deshacer.")) {
            DocumentService.clearHistory();
            setSelectedIds(new Set());
            setActiveId(null);
        }
    };

    const handleBulkExport = () => {
        const toExport = documents.filter(d => selectedIds.has(d.id));
        if (toExport.length > 0) {
            exportDocumentsToCsv(toExport, `orion_bulk_export_${Date.now()}.csv`);
        }
    };

    const handleBulkExportZip = async () => {
        const docIds = Array.from(selectedIds);
        try {
            const res = await fetch("/api/orion/documents/export-zip", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ docIds })
            });
            if (res.ok) {
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `orion_mixed_export_${Date.now()}.zip`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            } else {
                showToast("Error exportando ZIP. Asegúrate de seleccionar documentos tipo Mixed.", 'error');
            }
        } catch {
            showToast("Error al exportar ZIP. Inténtalo de nuevo.", 'error');
        }
    };

    const handleBulkExportExcel = async () => {
        if (selectedIds.size === 0) return;
        try {
            const res = await fetch('/api/export/excel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: Array.from(selectedIds) }),
            });
            if (res.ok) {
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `orion_export_${Date.now()}.xlsx`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            } else {
                showToast("Error al exportar Excel.", 'error');
            }
        } catch {
            showToast("Error al exportar Excel. Inténtalo de nuevo.", 'error');
        }
    };

    const handleBulkReprocess = () => {
        for (const id of Array.from(selectedIds)) {
            DocumentService.reprocessDocument(id);
        }
    };

    const handleDocLocalUpdate = useCallback((id: string, changes: Partial<DocumentRecord>) => {
        DocumentService.updateLocalOnly(id, changes);
        setDocuments([...DocumentService.getDocuments()]);
    }, []);

    const activeDoc = documents.find(d => d.id === activeId) || null;

    const toastColors = {
        error: 'bg-red-500/10 border-red-500/30 text-red-400',
        success: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
        info: 'bg-[#6366f1]/10 border-[#6366f1]/30 text-[#6366f1]',
    };

    return (
        <div className="h-full flex flex-col space-y-4 animate-in fade-in duration-500 relative">

            {/* Toast */}
            {toast && (
                <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-semibold backdrop-blur-md shadow-lg animate-in slide-in-from-bottom-4 duration-300 ${toastColors[toast.type]}`}>
                    {toast.type === 'error' && <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                    {toast.type === 'success' && <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                    {toast.type === 'info' && <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                    {toast.msg}
                    <button onClick={() => setToast(null)} className="ml-2 opacity-60 hover:opacity-100 transition-opacity">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
            )}

            <OcrUploadBar
                onUploadFiles={handleUploadFiles}
            />

            {/* Cola de subida masiva */}
            {bulkQueue && (
                <OcrBulkUploadQueue
                    files={bulkQueue.files}
                    meta={bulkQueue.meta}
                    onProcess={handleBulkProcess}
                    onCancel={() => setBulkQueue(null)}
                />
            )}

            <OcrBulkActionsBar
                selectedIds={selectedIds}
                onApprove={handleBulkApprove}
                onDelete={handleBulkDelete}
                onExport={handleBulkExport}
                onExportZip={handleBulkExportZip}
                onExportExcel={handleBulkExportExcel}
                onReprocess={handleBulkReprocess}
                onClearAll={handleClearHistory}
            />

            <div className={`flex gap-6 min-h-0 overflow-hidden ${documents.length > 0 ? 'flex-1' : 'shrink-0'}`}>
                <OcrDocumentsTable
                    documents={documents}
                    selectedIds={selectedIds}
                    onChangeSelection={setSelectedIds}
                    activeId={activeId}
                    activeSegmentId={activeSegmentId}
                    onRowClick={(id) => { setActiveId(id); setActiveSegmentId(null); }}
                    onSegmentClick={(docId, segId) => { setActiveId(docId); setActiveSegmentId(segId); }}
                    onApproveRow={handleApprove}
                    onExportRow={handleExport}
                    onReprocessRow={(id) => DocumentService.reprocessDocument(id)}
                />

                <OcrReportPreview
                    doc={activeDoc}
                    activeSegmentId={activeSegmentId}
                    onReupload={async (files) => {
                        await DocumentService.uploadDocuments(Array.from(files));
                        setDocuments(DocumentService.getDocuments());
                    }}
                    onDocUpdate={handleDocLocalUpdate}
                />
            </div>

            <OcrKpiStrip kpis={kpis} />
        </div>
    );
}
