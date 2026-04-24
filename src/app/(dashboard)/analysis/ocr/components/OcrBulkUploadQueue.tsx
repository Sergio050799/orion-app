import React, { useState, useEffect, useCallback } from 'react';
import { autoScanFiles } from '@/core/utils/autoScan';
import type { UploadMeta } from './UploadTypeModal';

interface FileEntry {
    id: string;
    file: File;
    processedFile?: File;
    status: 'pending' | 'scanning' | 'ready' | 'error';
    errorMsg?: string;
}

interface OcrBulkUploadQueueProps {
    files: File[];
    meta: UploadMeta;
    onProcess: (files: File[], meta: UploadMeta) => Promise<void>;
    onCancel: () => void;
}

function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const catLabel: Record<string, string> = {
    ficha: 'Ficha Técnica', permiso: 'Permiso', autorizacion: 'Autorización', carnet: 'Carnet',
};

export default function OcrBulkUploadQueue({ files, meta, onProcess, onCancel }: OcrBulkUploadQueueProps) {
    const [entries, setEntries] = useState<FileEntry[]>(() =>
        files.map((f, i) => ({ id: `${i}-${f.name}`, file: f, status: 'pending' }))
    );
    const [processing, setProcessing] = useState(false);
    const [globalProgress, setGlobalProgress] = useState(0);

    // Run preprocessing on mount
    useEffect(() => {
        let cancelled = false;

        const run = async () => {
            const imageFiles = files.filter(f => f.type.startsWith('image/'));
            const otherFiles = files.filter(f => !f.type.startsWith('image/'));

            // Mark images as scanning
            setEntries(prev => prev.map(e =>
                e.file.type.startsWith('image/') ? { ...e, status: 'scanning' } : { ...e, status: 'ready', processedFile: e.file }
            ));

            if (imageFiles.length === 0) return;

            try {
                const processed = await autoScanFiles(imageFiles, (done) => {
                    if (cancelled) return;
                    // Mark each done file as ready
                    setEntries(prev => {
                        const next = [...prev];
                        let doneCount = 0;
                        for (const entry of next) {
                            if (entry.status === 'ready' && entry.file.type.startsWith('image/')) doneCount++;
                        }
                        // Mark the next pending image as ready
                        for (const entry of next) {
                            if (entry.status === 'scanning' && entry.file.type.startsWith('image/')) {
                                const idx = imageFiles.findIndex(f => f.name === entry.file.name && f.size === entry.file.size);
                                if (idx !== -1 && idx < done) {
                                    entry.status = 'ready';
                                    entry.processedFile = processed[idx];
                                }
                            }
                        }
                        return next;
                    });
                });

                if (cancelled) return;

                // Final sync: map processed files back to entries
                setEntries(prev => prev.map(e => {
                    if (!e.file.type.startsWith('image/')) return e;
                    const idx = imageFiles.findIndex(f => f.name === e.file.name && f.size === e.file.size);
                    if (idx !== -1) return { ...e, status: 'ready', processedFile: processed[idx] };
                    return { ...e, status: 'error', errorMsg: 'No procesado' };
                }));
            } catch {
                if (!cancelled) {
                    setEntries(prev => prev.map(e =>
                        e.file.type.startsWith('image/') && e.status === 'scanning'
                            ? { ...e, status: 'error', errorMsg: 'Error al optimizar' }
                            : e
                    ));
                }
            }
        };

        run();
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const removeEntry = (id: string) => {
        setEntries(prev => prev.filter(e => e.id !== id));
    };

    const readyCount = entries.filter(e => e.status === 'ready').length;
    const totalCount = entries.length;

    const handleProcessAll = useCallback(async () => {
        if (entries.length === 0) return;
        setProcessing(true);
        setGlobalProgress(0);

        const readyEntries = entries.filter(e => e.status === 'ready');
        const filesToSend = readyEntries.map(e => e.processedFile || e.file);

        // Simulate progress per file
        let done = 0;
        const updateProgress = () => {
            done++;
            setGlobalProgress(Math.round((done / filesToSend.length) * 100));
        };

        try {
            // Send in batches — call onProcess once with all files, or sequentially
            // Since the service processes them sequentially anyway, send them all at once
            await onProcess(filesToSend, meta);
            updateProgress();
        } finally {
            setProcessing(false);
        }
    }, [entries, meta, onProcess]);

    const statusIcon = (status: FileEntry['status']) => {
        if (status === 'pending' || status === 'scanning') return (
            <svg className="animate-spin w-4 h-4 shrink-0" style={{ color: '#6366f1' }} fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
        );
        if (status === 'ready') return (
            <svg className="w-4 h-4 shrink-0" style={{ color: '#10B981' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
            </svg>
        );
        return (
            <svg className="w-4 h-4 shrink-0" style={{ color: '#EF4444' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
        );
    };

    return (
        <div
            className="rounded-2xl flex flex-col shrink-0 animate-in fade-in slide-in-from-top-4 duration-300"
            style={{ background: 'rgba(2,6,23,0.7)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)' }}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div>
                    <h2 className="text-sm font-black text-white uppercase tracking-wider">Cola de subida masiva</h2>
                    <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                        {catLabel[meta.docCategory] || meta.docCategory}
                        {meta.docSubtype && ` · ${meta.docSubtype}`}
                    </p>
                </div>

                {/* KPI strip */}
                <div className="flex items-center gap-4 text-[11px] font-bold">
                    <span style={{ color: 'rgba(255,255,255,0.5)' }}>{totalCount} doc{totalCount !== 1 ? 's' : ''}</span>
                    <span style={{ color: readyCount === totalCount ? '#10B981' : '#6366f1' }}>
                        Preparados: {readyCount}/{totalCount}
                    </span>
                    <button
                        onClick={onCancel}
                        className="ml-2 p-1.5 rounded-lg transition-colors"
                        style={{ color: 'rgba(255,255,255,0.3)' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* File list */}
            <div className="max-h-56 overflow-y-auto custom-scrollbar px-5 py-3 flex flex-col gap-2">
                {entries.map(entry => (
                    <div
                        key={entry.id}
                        className="flex items-center gap-3 rounded-lg px-3 py-2"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                        {statusIcon(entry.status)}
                        <span className="text-xs font-medium flex-1 truncate" style={{ color: 'rgba(255,255,255,0.7)' }} title={entry.file.name}>
                            {entry.file.name}
                        </span>
                        <span className="text-[10px] font-mono shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }}>
                            {formatBytes(entry.file.size)}
                        </span>
                        {entry.errorMsg && (
                            <span className="text-[10px] shrink-0" style={{ color: '#EF4444' }}>{entry.errorMsg}</span>
                        )}
                        {!processing && (
                            <button
                                onClick={() => removeEntry(entry.id)}
                                className="shrink-0 p-0.5 rounded transition-colors"
                                style={{ color: 'rgba(255,255,255,0.2)' }}
                                onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.2)')}
                                title="Quitar"
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="M18 6L6 18M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>
                ))}
                {entries.length === 0 && (
                    <p className="text-xs text-center py-4" style={{ color: 'rgba(255,255,255,0.3)' }}>Sin archivos en cola.</p>
                )}
            </div>

            {/* Progress bar */}
            {processing && (
                <div className="px-5 pb-2">
                    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                        <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${globalProgress}%`, background: '#6366f1' }}
                        />
                    </div>
                    <p className="text-[10px] mt-1.5 font-bold" style={{ color: '#6366f1' }}>
                        Procesando... {globalProgress}%
                    </p>
                </div>
            )}

            {/* Footer actions */}
            <div className="flex gap-3 px-5 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <button
                    onClick={handleProcessAll}
                    disabled={processing || entries.length === 0 || readyCount === 0}
                    className="flex-1 text-sm font-black py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-40"
                    style={{ background: '#6366f1', color: '#020617' }}
                    onMouseEnter={e => { if (!processing) (e.currentTarget as HTMLElement).style.background = '#5AEAFF'; }}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#6366f1'}
                >
                    {processing ? (
                        <>
                            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Procesando...
                        </>
                    ) : (
                        <>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                            </svg>
                            Procesar todo ({readyCount} listos)
                        </>
                    )}
                </button>
                <button
                    onClick={onCancel}
                    disabled={processing}
                    className="px-5 text-xs font-bold rounded-xl transition-colors disabled:opacity-40"
                    style={{ color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                    Cancelar
                </button>
            </div>
        </div>
    );
}
