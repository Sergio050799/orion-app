import React, { useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { preloadOpenCV, autoScanFiles } from '@/core/utils/autoScan';
import UploadTypeModal, { type UploadMeta } from './UploadTypeModal';

const DocumentScanner = dynamic(
    () => import('@/components/saas/DocumentScanner'),
    { ssr: false }
);

interface OcrUploadBarProps {
    onUploadFiles: (files: File[], meta?: UploadMeta) => Promise<void>;
}

export default function OcrUploadBar({ onUploadFiles }: OcrUploadBarProps) {
    const [scannerOpen, setScannerOpen] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [scanProgress, setScanProgress] = useState({ done: 0, total: 0 });

    useEffect(() => {
        preloadOpenCV();
    }, []);

    const handleScannerConfirm = useCallback(async (file: File) => {
        setScannerOpen(false);
        await onUploadFiles([file]);
    }, [onUploadFiles]);

    const handleModalConfirm = useCallback(async (rawFiles: File[], meta: UploadMeta) => {
        setModalOpen(false);

        const imageFiles = rawFiles.filter(f => f.type.startsWith('image/'));
        const otherFiles = rawFiles.filter(f => !f.type.startsWith('image/'));

        if (imageFiles.length === 0) {
            await onUploadFiles(rawFiles, meta);
            return;
        }

        setScanning(true);
        setScanProgress({ done: 0, total: imageFiles.length });
        try {
            const processed = await autoScanFiles(imageFiles, (done, total) => setScanProgress({ done, total }));
            await onUploadFiles([...processed, ...otherFiles], meta);
        } finally {
            setScanning(false);
            setScanProgress({ done: 0, total: 0 });
        }
    }, [onUploadFiles]);

    const progressLabel = scanProgress.total > 1
        ? `Optimizando ${scanProgress.done}/${scanProgress.total}...`
        : 'Optimizando...';

    const pillStyle: React.CSSProperties = {
        color: '#6366f1',
        background: 'rgba(99,102,241,0.08)',
        border: '1px solid rgba(99,102,241,0.2)',
    };

    return (
        <>
            <div className="glass-card flex items-center justify-between shrink-0 rounded-2xl p-4 animate-in fade-in slide-in-from-top-4 duration-300">
                <div>
                    <h1 className="text-xl font-black text-white uppercase tracking-tight">Análisis Fichas (OCR)</h1>
                    <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
                        Fichas técnicas · Permisos · Carnets · Autorizaciones
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    {/* Escáner */}
                    <button
                        onClick={() => setScannerOpen(true)}
                        title="Corrige la perspectiva antes de subir"
                        className="flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all"
                        style={pillStyle}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.14)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.08)')}
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <path d="M3 9h18M9 21V9" />
                        </svg>
                        Escáner
                    </button>

                    {scanning ? (
                        <div
                            className="flex items-center gap-3 px-5 py-2 rounded-xl"
                            style={{ border: '2px solid rgba(99,102,241,0.4)', background: 'rgba(99,102,241,0.06)' }}
                        >
                            <svg className="animate-spin w-4 h-4 shrink-0" style={{ color: '#6366f1' }} fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            <span className="text-sm font-bold animate-pulse" style={{ color: '#6366f1' }}>{progressLabel}</span>
                        </div>
                    ) : (
                        <button
                            onClick={() => setModalOpen(true)}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all"
                            style={pillStyle}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.14)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.08)')}
                        >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="17 8 12 3 7 8" />
                                <line x1="12" y1="3" x2="12" y2="15" />
                            </svg>
                            Subir documento
                        </button>
                    )}
                </div>
            </div>

            {modalOpen && (
                <UploadTypeModal
                    isBulk={false}
                    onConfirm={handleModalConfirm}
                    onCancel={() => setModalOpen(false)}
                />
            )}

            {scannerOpen && (
                <DocumentScanner
                    onConfirm={handleScannerConfirm}
                    onCancel={() => setScannerOpen(false)}
                />
            )}
        </>
    );
}
