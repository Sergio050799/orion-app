"use client";

import React, { useState, useEffect, useRef } from "react";
import InvoiceKpiStrip from "./components/InvoiceKpiStrip";
import InvoiceDocumentsTable from "./components/InvoiceDocumentsTable";
import InvoiceReportCard from "@/components/saas/InvoiceReportCard";
import { FinancialService, InvoiceDocumentRecord } from "@/services/financial-service";

export default function FinancialAnalysisPage() {
    const [docs, setDocs] = useState<InvoiceDocumentRecord[]>(FinancialService.getDocuments());
    const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isReportExpanded, setIsReportExpanded] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        FinancialService.loadHistoryIfNeeded();
        const unsub = FinancialService.subscribe(() => {
            const freshDocs = FinancialService.getDocuments();
            setDocs(freshDocs);
            setSelectedDocId(prev => {
                if (prev) {
                    const stillExists = freshDocs.find(d => d.id === prev);
                    if (!stillExists && freshDocs.length > 0) return freshDocs[0].id;
                    return prev;
                } else if (freshDocs.length > 0) {
                    return freshDocs[0].id;
                }
                return null;
            });
        });
        return () => { unsub(); };
    }, []);

    const kpis = FinancialService.getKPIs();
    const activeDoc = docs.find(d => d.id === selectedDocId) || null;

    const handleFiles = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        await FinancialService.uploadDocuments(files);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    return (
        <div className="flex-1 flex flex-col h-[calc(100vh-56px)] min-h-0">
            <div className="flex-1 p-0 flex flex-col gap-6 w-full min-h-0">

                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 animate-in fade-in slide-in-from-top-4 duration-500">
                    <div>
                        <h1 className="text-xl font-black text-white uppercase tracking-widest flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                    <line x1="16" y1="13" x2="8" y2="13" />
                                    <line x1="16" y1="17" x2="8" y2="17" />
                                    <polyline points="10 9 9 9 8 9" />
                                </svg>
                            </div>
                            Financiera — Invoices
                        </h1>
                        <p className="text-xs font-bold uppercase tracking-widest mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
                            Extracción Continua Prebuilt-Invoice
                        </p>
                    </div>

                    {/* Drag & Drop Upload */}
                    <div
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
                        className="relative rounded-xl border-2 border-dashed p-4 flex items-center justify-center transition-all cursor-pointer"
                        style={{
                            borderColor: isDragging ? '#6366f1' : 'rgba(255,255,255,0.15)',
                            background: isDragging ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.03)',
                            boxShadow: isDragging ? '0 0 20px rgba(99,102,241,0.15)' : 'none',
                        }}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept=".pdf,image/*"
                            onChange={(e) => handleFiles(e.target.files)}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                        <div className="text-center pointer-events-none flex items-center gap-3">
                            <div className="p-2 rounded-full" style={{ background: isDragging ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)' }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={isDragging ? '#6366f1' : 'rgba(255,255,255,0.4)'} strokeWidth="2">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="17 8 12 3 7 8" />
                                    <line x1="12" y1="3" x2="12" y2="15" />
                                </svg>
                            </div>
                            <div className="flex flex-col items-start">
                                <span className="text-xs font-black uppercase tracking-widest" style={{ color: isDragging ? '#6366f1' : 'rgba(255,255,255,0.6)' }}>
                                    Suelte Facturas (PDF/Img) aquí
                                </span>
                                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>
                                    o haga clic para seleccionar
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
                    {/* Left Panel */}
                    {!isReportExpanded && (
                        <div className="lg:col-span-7 xl:col-span-6 flex flex-col h-full min-w-0">
                            <InvoiceKpiStrip data={kpis} />
                            <InvoiceDocumentsTable
                                docs={docs}
                                selectedId={selectedDocId}
                                onSelect={setSelectedDocId}
                                onReprocess={id => FinancialService.reprocessDocument(id)}
                                onDelete={ids => FinancialService.deleteRecords(ids)}
                            />
                        </div>
                    )}

                    {/* Right Panel */}
                    {activeDoc !== null && (
                        <div className={`${isReportExpanded ? 'lg:col-span-12 xl:col-span-12' : 'lg:col-span-5 xl:col-span-6'} flex flex-col h-full min-h-0 min-w-0 transition-all duration-300`}>
                            <InvoiceReportCard
                                doc={activeDoc}
                                isLoading={activeDoc?.status === "processing" || activeDoc?.status === "queued"}
                                isExpanded={isReportExpanded}
                                onToggleExpand={() => setIsReportExpanded(!isReportExpanded)}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
