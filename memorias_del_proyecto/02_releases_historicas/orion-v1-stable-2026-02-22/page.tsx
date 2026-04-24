"use client";

import { useState, useEffect } from "react";
import VehicleReportPanel from "@/components/saas/report/VehicleReportPanel";
import { DocumentService, DocumentRecord } from "@/services/document-service";

export default function OCRAnalysisPage() {
    const [documents, setDocuments] = useState<DocumentRecord[]>([]);
    const [activeReport, setActiveReport] = useState<string | null>(null);
    const [activeDocId, setActiveDocId] = useState<string | null>(null);
    const [kpis, setKpis] = useState({ processed: 0, pending: 0, failed: 0, today: 0 });

    useEffect(() => {
        const interval = setInterval(() => {
            setDocuments(DocumentService.getDocuments());
            setKpis(DocumentService.getKPIs());
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            await DocumentService.uploadDocuments(e.target.files);
            setDocuments(DocumentService.getDocuments());
            // Clear input so same file can be uploaded again if needed
            e.target.value = '';
        }
    };

    const handleSelectDoc = (doc: DocumentRecord) => {
        if (doc.status === "completed" && doc.reportMarkdown) {
            setActiveReport(doc.reportMarkdown);
            setActiveDocId(doc.id);
        } else {
            setActiveReport(doc.status === "completed" ? "# ORION\\n\\nInforme no disponible (reportMarkdown null)." : null);
            setActiveDocId(doc.status === "completed" ? doc.id : null);
        }
    };


    return (
        <div className="h-full flex flex-col space-y-4 animate-in fade-in duration-500">

            {/* KPI Row */}
            <div className="grid grid-cols-4 gap-4 h-24 shrink-0">
                <div className="bg-white dark:bg-slate-900/30 border border-slate-200 dark:border-white/5 p-5 flex items-center justify-between rounded-2xl shadow-sm">
                    <div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Hoy</div>
                        <div className="text-3xl font-black text-slate-900 dark:text-white">{kpis.today}</div>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-400">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-900/30 border border-slate-200 dark:border-white/5 p-5 flex items-center justify-between rounded-2xl shadow-sm">
                    <div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Analizados</div>
                        <div className="text-3xl font-black text-emerald-500 dark:text-emerald-400">{kpis.processed}</div>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center text-emerald-500 dark:text-emerald-400">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-900/30 border border-slate-200 dark:border-white/5 p-5 flex items-center justify-between rounded-2xl shadow-sm">
                    <div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">En Cola</div>
                        <div className="text-3xl font-black text-amber-500 dark:text-amber-400">{kpis.pending}</div>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center text-amber-500 dark:text-amber-400">
                        {kpis.pending > 0 ? <div className="w-5 h-5 rounded-full border-[3px] border-amber-400 border-t-transparent animate-spin" /> : <span className="text-sm font-bold">0</span>}
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-900/30 border border-slate-200 dark:border-white/5 p-5 flex items-center justify-between rounded-2xl shadow-sm">
                    <div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Fallidos</div>
                        <div className="text-3xl font-black text-red-500 dark:text-red-400">{kpis.failed}</div>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center text-red-500 dark:text-red-400">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                    </div>
                </div>
            </div>

            {/* Main Content Area - Dynamic Layout */}
            <div className={`flex gap-6 min-h-0 overflow-hidden ${activeReport ? 'flex-row' : 'flex-col'}`}>

                {/* LIST / UPLOAD SECTION */}
                <div className={`flex flex-col gap-4 transition-all duration-300 ease-in-out ${activeReport ? 'flex-1 overflow-hidden' : 'h-full shrink-0'}`}>

                    {/* Header Controls (Only when not showing report) */}
                    {!activeReport && (
                        <div className="flex items-center justify-between shrink-0 mb-2">
                            <div>
                                <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Análisis de Documentos</h1>
                                <p className="text-sm text-slate-500 mt-1">Sube fichas técnicas (PDF/Imagen) para procesar.</p>
                            </div>

                            <div className="relative group overflow-hidden rounded-xl border-dashed border-2 border-slate-300 dark:border-white/20 hover:border-blue-500 dark:hover:border-[#3CE0FF] bg-slate-50 dark:bg-slate-900/50 hover:bg-blue-50 dark:hover:bg-[#3CE0FF]/10 transition-all cursor-pointer">
                                <input type="file" multiple className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" onChange={handleUpload} />
                                <div className="px-6 py-3 flex items-center gap-3">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400 group-hover:text-blue-500 dark:group-hover:text-[#3CE0FF] shrink-0"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                                    <span className="text-sm font-bold text-slate-600 dark:text-slate-300 group-hover:text-blue-600 dark:group-hover:text-[#3CE0FF]">Subir Nueva Ficha</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Active Upload (when report is open) */}
                    {activeReport && (
                        <div className="shrink-0 group relative overflow-hidden rounded-xl border-dashed border-2 border-slate-300 dark:border-white/20 hover:border-blue-500 dark:hover:border-[#3CE0FF] bg-white dark:bg-slate-900/50 transition-all cursor-pointer flex items-center justify-center p-4">
                            <input type="file" multiple className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" onChange={handleUpload} />
                            <div className="flex items-center gap-2">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400 group-hover:text-blue-500 dark:group-hover:text-[#3CE0FF]"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                                <span className="text-xs font-bold text-slate-500 group-hover:text-blue-600 dark:group-hover:text-[#3CE0FF] uppercase tracking-widest">Subir Otro</span>
                            </div>
                        </div>
                    )}

                    {/* Document List Table */}
                    <div className="flex-1 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-white/5 rounded-2xl overflow-hidden flex flex-col shadow-sm">
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            <table className="w-full text-left whitespace-nowrap">
                                <thead className="bg-slate-50 dark:bg-[#0F172A] sticky top-0 z-10 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.05)]">
                                    <tr>
                                        <th className="py-3 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-10 text-center">STS</th>
                                        <th className="py-3 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Archivo</th>
                                        <th className="py-3 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Matrícula</th>
                                        <th className="py-3 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Marca</th>
                                        <th className="py-3 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Modelo</th>
                                        <th className="py-3 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Plazas</th>
                                        <th className="py-3 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">CV</th>
                                        <th className="py-3 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-12 text-center">Acción</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                    {documents.map(doc => {
                                        const firstLines = doc.extractedPreview?.firstLines;
                                        const isActive = doc.id === activeDocId;

                                        return (
                                            <tr
                                                key={doc.id}
                                                onClick={() => handleSelectDoc(doc)}
                                                className={`cursor-pointer transition-colors group ${isActive ? 'bg-blue-50 dark:bg-[#3CE0FF]/10' : 'hover:bg-slate-50 dark:hover:bg-white/[0.02]'}`}
                                            >
                                                <td className="py-4 px-4 text-center align-middle">
                                                    {doc.status === "completed" && <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 mx-auto shadow-[0_0_8px_rgba(16,185,129,0.3)]" title="Completado" />}
                                                    {doc.status === "processing" && <div className="w-2.5 h-2.5 rounded-full bg-amber-500 mx-auto animate-pulse" title="Procesando" />}
                                                    {doc.status === "failed" && <div className="w-2.5 h-2.5 rounded-full bg-red-500 mx-auto" title="Fallido" />}
                                                </td>
                                                <td className="py-2 px-4 align-middle">
                                                    <div className="text-xs font-bold text-slate-700 dark:text-white truncate max-w-[150px]">
                                                        {doc.fileName}
                                                    </div>

                                                    {doc.ocrQuality && (
                                                        <div className="flex gap-1 mt-1">
                                                            <span className={`text-[8px] px-1 font-bold uppercase tracking-wider rounded border ${doc.usedModel === 'prebuilt-layout' ? 'bg-purple-50 text-purple-600 border-purple-200' : 'bg-blue-50 text-blue-600 border-blue-200'}`}>
                                                                {doc.usedModel === 'prebuilt-layout' ? 'LAYOUT' : 'READ'}
                                                            </span>
                                                            <span className={`text-[8px] px-1 font-bold uppercase tracking-wider rounded border ${doc.ocrQuality.quality === 'low' ? 'bg-red-50 text-red-600 border-red-200' : doc.ocrQuality.quality === 'high' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-amber-50 text-amber-600 border-amber-200'}`}>
                                                                {doc.ocrQuality.quality}
                                                            </span>
                                                        </div>
                                                    )}

                                                    {firstLines && firstLines.length > 0 && (
                                                        <div className="text-[9px] text-slate-400 truncate max-w-[150px] mt-1" title={firstLines.join(" | ")}>
                                                            {firstLines[0]}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="py-4 px-4 align-middle">
                                                    {(doc.extractedFields?.plate) ? (
                                                        <div className="font-mono font-bold text-sm bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-white px-2 py-0.5 rounded tracking-wider inline-block">
                                                            {doc.extractedFields.plate}
                                                        </div>
                                                    ) : <span className="text-slate-400 text-xs">---</span>}
                                                </td>
                                                <td className="py-4 px-4 text-xs font-semibold text-slate-600 dark:text-slate-300 align-middle">
                                                    {doc.extractedFields?.D1 || '---'}
                                                </td>
                                                <td className="py-4 px-4 text-xs font-medium text-slate-600 dark:text-slate-300 align-middle truncate max-w-[120px]">
                                                    {doc.extractedFields?.D3 || '---'}
                                                </td>
                                                <td className="py-4 px-4 text-xs text-slate-600 dark:text-slate-400 align-middle">
                                                    {doc.extractedFields?.S1 || '---'}
                                                </td>
                                                <td className="py-4 px-4 text-xs text-slate-600 dark:text-slate-400 align-middle">
                                                    {doc.extractedFields?.powerCv || '---'}
                                                </td>
                                                <td className="py-4 px-4 align-middle text-center">
                                                    {isActive && (
                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`mx-auto ${isActive ? 'text-blue-500 dark:text-[#3CE0FF]' : 'text-slate-400 group-hover:text-blue-500 dark:group-hover:text-[#3CE0FF]'}`}><polyline points="9 18 15 12 9 6" /></svg>
                                                    )}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* RIGHT COLUMN: Report Panel */}
                {activeReport && (
                    <div className="flex-[2] min-w-0 rounded-2xl relative animate-in slide-in-from-right-10 fade-in duration-300 flex flex-col overflow-hidden">
                        <VehicleReportPanel
                            markdown={activeReport}
                            onClose={() => { setActiveReport(null); setActiveDocId(null); }}
                            className="h-full"
                        />
                    </div>
                )}

            </div>
        </div>
    );
}
