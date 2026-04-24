import React, { useState, useCallback, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { preloadOpenCV, autoScanFiles, waitForOpenCV } from '@/core/utils/autoScan';

const DocumentScanner = dynamic(
    () => import('@/components/saas/DocumentScanner'),
    { ssr: false }
);

export type PageLabel = 'ficha_moderna' | 'ficha_antigua' | 'permiso' | 'autorizacion' | null;

export interface LabeledPage {
    pageIndex: number;
    pdfPageNumber?: number;  // página dentro del PDF (1-based), solo si isFromPdf
    sourceFile?: File;       // archivo PDF original, solo si isFromPdf
    thumbnail: string;       // base64 JPEG 0.4 — solo para UI
    label: PageLabel;
    blob: Blob;              // para imágenes directas; fallback JPEG para PDFs hasta que Jerry confirme pageNumber
    isFromPdf: boolean;
    fileName: string;
}

interface EmissionUploadModalProps {
    onConfirm: (pages: LabeledPage[], files: File[]) => void;
    onCancel: () => void;
}

const PAGE_LABELS: { key: PageLabel; label: string; color: string }[] = [
    { key: 'ficha_moderna',  label: 'Ficha Moderna',  color: '#6366f1' },
    { key: 'ficha_antigua',  label: 'Ficha Antigua',  color: '#60A5FA' },
    { key: 'permiso',        label: 'Permiso',         color: '#34D399' },
    { key: 'autorizacion',   label: 'Autorización',    color: '#A78BFA' },
];

const labelToCategory: Record<string, { docCategory: string; docSubtype?: string }> = {
    ficha_moderna:  { docCategory: 'ficha', docSubtype: 'moderna' },
    ficha_antigua:  { docCategory: 'ficha', docSubtype: 'antigua' },
    permiso:        { docCategory: 'permiso' },
    autorizacion:   { docCategory: 'autorizacion' },
};

export { labelToCategory };

/** Recorta los bordes del documento en el thumbnail usando jscanify. Solo afecta al display. */
async function cropThumbnail(dataUrl: string): Promise<string> {
    try {
        await Promise.race([
            waitForOpenCV(),
            new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000)),
        ]);

        const img = new Image();
        await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = reject;
            img.src = dataUrl;
        });

        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext('2d')!.drawImage(img, 0, 0);

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const jscanify = require('jscanify/client');
        const scanner = new jscanify();
        const cvImg = (window as any).cv.imread(canvas);
        const contour = scanner.findPaperContour(cvImg);
        if (!contour) { cvImg.delete(); return dataUrl; }

        const pts = scanner.getCornerPoints(contour, cvImg);
        cvImg.delete();
        const { topLeftCorner: tl, topRightCorner: tr, bottomLeftCorner: bl, bottomRightCorner: br } = pts;
        if (!tl || !tr || !bl || !br) return dataUrl;

        const outW = Math.round(Math.max(
            Math.hypot(tr.x - tl.x, tr.y - tl.y),
            Math.hypot(br.x - bl.x, br.y - bl.y)
        ));
        const outH = Math.round(Math.max(
            Math.hypot(bl.x - tl.x, bl.y - tl.y),
            Math.hypot(br.x - tr.x, br.y - tr.y)
        ));
        // Si el crop elimina más del 40% del área → falso positivo (ej. fondo verde del permiso) → descartar
        const originalArea = canvas.width * canvas.height;
        const croppedArea = outW * outH;
        if (outW < 80 || outH < 80 || croppedArea < originalArea * 0.6) return dataUrl;

        const cropped = scanner.extractPaper(canvas, outW, outH, {
            topLeftCorner: tl, topRightCorner: tr,
            bottomLeftCorner: bl, bottomRightCorner: br,
        });
        if (!cropped) return dataUrl;

        return cropped.toDataURL('image/jpeg', 0.8);
    } catch {
        return dataUrl;
    }
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
    const res = await fetch(dataUrl);
    return res.blob();
}

async function rotateBlob(blob: Blob, degrees: number): Promise<Blob> {
    if (degrees === 0) return blob;
    const url = URL.createObjectURL(blob);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = url;
    });
    URL.revokeObjectURL(url);
    const rad = (degrees * Math.PI) / 180;
    const canvas = document.createElement('canvas');
    const swap = degrees === 90 || degrees === 270;
    canvas.width = swap ? img.height : img.width;
    canvas.height = swap ? img.width : img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(rad);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    return new Promise<Blob>((resolve) => canvas.toBlob(b => resolve(b!), 'image/jpeg', 0.85));
}

export default function EmissionUploadModal({ onConfirm, onCancel }: EmissionUploadModalProps) {
    const [step, setStep] = useState<'upload' | 'label'>('upload');
    const [pages, setPages] = useState<LabeledPage[]>([]);
    const [files, setFiles] = useState<File[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingMsg, setLoadingMsg] = useState('Generando previsualizaciones...');
    const [rotations, setRotations] = useState<Record<number, number>>({});
    const [autoPreprocess, setAutoPreprocess] = useState(true);
    const [scannerPage, setScannerPage] = useState<number | null>(null);
    const [confirming, setConfirming] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        preloadOpenCV();
    }, []);

    const rotate = (pageIndex: number) => {
        setRotations(prev => ({ ...prev, [pageIndex]: ((prev[pageIndex] || 0) + 90) % 360 }));
    };

    const handleFilesSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const selectedFiles = Array.from(e.target.files);
        setFiles(selectedFiles);
        setLoading(true);
        setLoadingMsg('Generando previsualizaciones...');

        const newPages: LabeledPage[] = [];
        let pageIdx = 0;

        for (const file of selectedFiles) {
            if (file.type.startsWith('image/')) {
                const thumbRaw = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (ev) => resolve(ev.target?.result as string);
                    reader.readAsDataURL(file);
                });
                const thumb = await cropThumbnail(thumbRaw);
                newPages.push({
                    pageIndex: pageIdx++,
                    thumbnail: thumb,
                    label: null,
                    blob: file,
                    isFromPdf: false,
                    fileName: file.name,
                });
            } else if (file.type === 'application/pdf') {
                setLoadingMsg(`Procesando ${file.name}...`);
                const arrayBuffer = await file.arrayBuffer();
                const pdfjsLib = await import('pdfjs-dist');
                pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

                for (let p = 1; p <= pdf.numPages; p++) {
                    const pdfPage = await pdf.getPage(p);

                    // Solo thumbnail (para UI) — escala 0.8 para legibilidad en el split panel
                    // El backend recibe el PDF original + pdfPageNumber (resolución nativa)
                    const thumbViewport = pdfPage.getViewport({ scale: 0.8 });
                    const thumbCanvas = document.createElement('canvas');
                    thumbCanvas.width = thumbViewport.width;
                    thumbCanvas.height = thumbViewport.height;
                    // pdfjs RenderParameters compat
                    await pdfPage.render({ canvasContext: thumbCanvas.getContext('2d')!, viewport: thumbViewport } as any).promise;
                    const thumbRaw = thumbCanvas.toDataURL('image/jpeg', 0.7);
                    const thumb = await cropThumbnail(thumbRaw);
                    const fallbackBlob = await dataUrlToBlob(thumb);

                    newPages.push({
                        pageIndex: pageIdx++,
                        pdfPageNumber: p,
                        sourceFile: file,
                        thumbnail: thumb,
                        label: null,
                        blob: fallbackBlob,
                        isFromPdf: true,
                        fileName: `${file.name.replace(/\.pdf$/i, '')}_p${p}.jpg`,
                    });
                }
            }
        }

        setPages(newPages);
        setRotations({});
        setLoading(false);
        setStep('label');
    }, []);

    const setLabel = (pageIndex: number, label: PageLabel) => {
        setPages(prev => prev.map(p => p.pageIndex === pageIndex ? { ...p, label } : p));
    };

    const handleConfirm = useCallback(async () => {
        if (!allLabeled) return;
        setConfirming(true);
        try {
            // Procesar páginas según tipo:
            // - PDFs: sin rotación ni autoScan (el backend recibe PDF original + pdfPageNumber)
            // - Imágenes directas: aplicar rotación y autoScan
            let finalPages = await Promise.all(pages.map(async p => {
                if (p.isFromPdf) {
                    // PDF: el blob para el backend no cambia (se envía sourceFile + pdfPageNumber)
                    // Pero el thumbnail de display sí refleja la rotación del usuario
                    const deg = rotations[p.pageIndex] || 0;
                    if (deg === 0) return p;
                    const thumbnail = await new Promise<string>(resolve => {
                        const img = new Image();
                        img.onload = () => {
                            const swap = deg === 90 || deg === 270;
                            const c = document.createElement('canvas');
                            c.width = swap ? img.height : img.width;
                            c.height = swap ? img.width : img.height;
                            const ctx = c.getContext('2d')!;
                            ctx.translate(c.width / 2, c.height / 2);
                            ctx.rotate((deg * Math.PI) / 180);
                            ctx.drawImage(img, -img.width / 2, -img.height / 2);
                            resolve(c.toDataURL('image/jpeg', 0.8));
                        };
                        img.src = p.thumbnail;
                    });
                    return { ...p, thumbnail };
                }

                // Imagen directa: aplicar rotación
                const deg = rotations[p.pageIndex] || 0;
                const rotatedBlob = await rotateBlob(p.blob, deg);

                let thumbnail = p.thumbnail;
                if (deg !== 0) {
                    const thumbUrl = URL.createObjectURL(rotatedBlob);
                    thumbnail = await new Promise<string>(resolve => {
                        const img = new Image();
                        img.onload = () => {
                            const c = document.createElement('canvas');
                            c.width = img.width; c.height = img.height;
                            c.getContext('2d')!.drawImage(img, 0, 0);
                            URL.revokeObjectURL(thumbUrl);
                            resolve(c.toDataURL('image/jpeg', 0.7));
                        };
                        img.src = thumbUrl;
                    });
                }

                return { ...p, blob: rotatedBlob, thumbnail };
            }));

            // Aplicar autoScan solo a imágenes directas
            if (autoPreprocess) {
                const imageIndexes = finalPages.map((p, i) => ({ p, i })).filter(({ p }) => !p.isFromPdf);
                if (imageIndexes.length > 0) {
                    try {
                        const imageFiles = imageIndexes.map(({ p }) => new File([p.blob], p.fileName, { type: 'image/jpeg' }));
                        const processed = await autoScanFiles(imageFiles, () => {});
                        const newFinalPages = [...finalPages];
                        imageIndexes.forEach(({ i }, idx) => {
                            newFinalPages[i] = { ...newFinalPages[i], blob: processed[idx] };
                        });
                        finalPages = newFinalPages;
                    } catch {
                        // Si falla el preprocesado, continuar con los originales
                    }
                }
            }

            onConfirm(finalPages, files);
        } finally {
            setConfirming(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pages, rotations, autoPreprocess, files, onConfirm]);

    const allLabeled = pages.length > 0 && pages.every(p => p.label !== null);

    const summary = PAGE_LABELS.map(l => ({
        ...l,
        count: pages.filter(p => p.label === l.key).length
    })).filter(l => l.count > 0);

    return (
        <>
        <div
            className="fixed inset-0 z-50 flex items-center justify-center animate-in fade-in duration-200"
            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
            onClick={onCancel}
        >
            <div
                className="w-full max-w-3xl max-h-[90vh] rounded-2xl flex flex-col shadow-2xl animate-in zoom-in-95 duration-200"
                style={{ background: 'rgba(2,6,23,0.98)', border: '1px solid rgba(255,255,255,0.1)' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                    <div>
                        <h2 className="text-base font-black text-white uppercase tracking-wider">Nueva Emisión</h2>
                        <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                            {step === 'upload' ? 'Paso 1 — Sube los archivos de la emisión' : 'Paso 2 — Etiqueta cada página'}
                        </p>
                    </div>
                    <button onClick={onCancel} className="p-1.5 rounded-lg transition-colors" style={{ color: 'rgba(255,255,255,0.3)' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* Step 1 — Upload */}
                {step === 'upload' && (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6">
                        {loading ? (
                            <div className="flex flex-col items-center gap-4">
                                <svg className="animate-spin w-8 h-8" style={{ color: '#6366f1' }} fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                <p className="text-sm font-bold" style={{ color: '#6366f1' }}>{loadingMsg}</p>
                            </div>
                        ) : (
                            <>
                                <div
                                    className="rounded-xl p-4 text-center max-w-sm"
                                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
                                >
                                    <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>Tipos aceptados</p>
                                    <div className="flex flex-wrap gap-2 justify-center">
                                        {['Ficha Técnica', 'Permiso', 'Autorización'].map(t => (
                                            <span key={t} className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: '#6366f1', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)' }}>{t}</span>
                                        ))}
                                    </div>
                                </div>
                                <label
                                    className="flex flex-col items-center gap-3 px-12 py-8 rounded-xl cursor-pointer transition-all font-bold text-sm"
                                    style={{ border: '2px dashed rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)' }}
                                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(99,102,241,0.5)'; (e.currentTarget as HTMLElement).style.color = '#6366f1'; }}
                                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.15)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.5)'; }}
                                >
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                                    </svg>
                                    Seleccionar archivos (PDF o imagen)
                                    <input ref={fileInputRef} type="file" className="hidden" multiple accept="image/*,.pdf" onChange={handleFilesSelected} />
                                </label>
                            </>
                        )}
                    </div>
                )}

                {/* Step 2 — Labeling */}
                {step === 'label' && (
                    <>
                        {/* Summary strip */}
                        <div className="px-6 py-3 flex items-center gap-4 flex-wrap" style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <span className="text-[11px] font-bold" style={{ color: 'rgba(255,255,255,0.4)' }}>{pages.length} páginas</span>
                            {summary.map(s => (
                                <span key={s.key} className="text-[11px] font-bold" style={{ color: s.color }}>
                                    {s.count} {s.label.toLowerCase()}{s.count !== 1 ? 's' : ''}
                                </span>
                            ))}
                            {!allLabeled && (
                                <span className="text-[11px] font-bold" style={{ color: '#F59E0B' }}>
                                    {pages.filter(p => !p.label).length} sin etiquetar
                                </span>
                            )}
                            {/* Toggle auto-preprocesar */}
                            <label className="flex items-center gap-2 ml-auto cursor-pointer">
                                <span className="text-[10px] font-bold" style={{ color: 'rgba(255,255,255,0.4)' }}>Auto-preprocesar (solo imágenes)</span>
                                <div
                                    onClick={() => setAutoPreprocess(p => !p)}
                                    className="w-8 h-4 rounded-full transition-colors relative cursor-pointer"
                                    style={{ background: autoPreprocess ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.1)' }}
                                >
                                    <div
                                        className="absolute top-0.5 w-3 h-3 rounded-full transition-all"
                                        style={{
                                            background: autoPreprocess ? '#6366f1' : 'rgba(255,255,255,0.3)',
                                            left: autoPreprocess ? '17px' : '2px',
                                        }}
                                    />
                                </div>
                            </label>
                        </div>

                        {/* Pages grid */}
                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                {pages.map(page => {
                                    const labelDef = PAGE_LABELS.find(l => l.key === page.label);
                                    const rotation = rotations[page.pageIndex] || 0;
                                    return (
                                        <div key={page.pageIndex} className="flex flex-col gap-2">
                                            {/* Thumbnail */}
                                            <div
                                                className="aspect-[3/4] rounded-lg overflow-hidden flex items-center justify-center relative"
                                                style={{
                                                    background: 'rgba(255,255,255,0.04)',
                                                    border: `1px solid ${labelDef ? labelDef.color + '55' : 'rgba(255,255,255,0.1)'}`,
                                                }}
                                            >
                                                {/* Botón escáner — esquina superior izquierda */}
                                                <button
                                                    onClick={() => setScannerPage(page.pageIndex)}
                                                    className="absolute top-1.5 left-1.5 p-1 rounded-lg transition-all z-10"
                                                    style={{ background: 'rgba(0,0,0,0.5)', color: 'rgba(255,255,255,0.6)' }}
                                                    title="Corregir perspectiva"
                                                    onMouseEnter={e => (e.currentTarget.style.color = '#6366f1')}
                                                    onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
                                                >
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                        <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" />
                                                    </svg>
                                                </button>

                                                {/* Botón rotación — esquina superior derecha */}
                                                <button
                                                    onClick={() => rotate(page.pageIndex)}
                                                    className="absolute top-1.5 right-1.5 p-1 rounded-lg transition-all z-10"
                                                    style={{ background: 'rgba(0,0,0,0.5)', color: 'rgba(255,255,255,0.6)' }}
                                                    title="Rotar 90°"
                                                    onMouseEnter={e => (e.currentTarget.style.color = '#6366f1')}
                                                    onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
                                                >
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38" />
                                                    </svg>
                                                </button>

                                                {page.thumbnail ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img
                                                        src={page.thumbnail}
                                                        alt={`Página ${page.pageIndex + 1}`}
                                                        className="w-full h-full object-contain transition-transform duration-300"
                                                        style={{ transform: `rotate(${rotation}deg)` }}
                                                    />
                                                ) : (
                                                    <div className="flex flex-col items-center gap-2 p-3">
                                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5">
                                                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                                                        </svg>
                                                        <span className="text-[9px] font-mono text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>
                                                            {page.fileName.slice(0, 20)}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Label badge */}
                                            {labelDef && (
                                                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full text-center" style={{ color: labelDef.color, background: labelDef.color + '18', border: `1px solid ${labelDef.color}40` }}>
                                                    {labelDef.label}
                                                </span>
                                            )}

                                            {/* Label selector */}
                                            <div className="grid grid-cols-2 gap-1">
                                                {PAGE_LABELS.map(l => (
                                                    <button
                                                        key={l.key}
                                                        onClick={() => setLabel(page.pageIndex, l.key)}
                                                        className="text-[9px] font-bold px-1.5 py-1 rounded-lg transition-all"
                                                        style={page.label === l.key ? {
                                                            color: l.color,
                                                            background: l.color + '20',
                                                            border: `1px solid ${l.color}50`,
                                                        } : {
                                                            color: 'rgba(255,255,255,0.3)',
                                                            background: 'rgba(255,255,255,0.03)',
                                                            border: '1px solid rgba(255,255,255,0.08)',
                                                        }}
                                                    >
                                                        {l.label.split(' ')[0]}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex gap-3 px-6 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                            <button
                                onClick={() => setStep('upload')}
                                className="px-5 text-xs font-bold rounded-xl transition-colors"
                                style={{ color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}
                            >
                                ← Volver
                            </button>
                            <button
                                onClick={handleConfirm}
                                disabled={!allLabeled || confirming}
                                className="flex-1 text-sm font-black py-2.5 px-4 rounded-xl transition-all disabled:opacity-30 flex items-center justify-center gap-2"
                                style={{ background: '#6366f1', color: '#020617' }}
                                onMouseEnter={e => { if (allLabeled && !confirming) (e.currentTarget as HTMLElement).style.background = '#5AEAFF'; }}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#6366f1'}
                            >
                                {confirming ? (
                                    <>
                                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                        Preparando...
                                    </>
                                ) : (
                                    <>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                                        </svg>
                                        Procesar emisión
                                    </>
                                )}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>

        {/* DocumentScanner overlay — para corrección de perspectiva por página */}
        {scannerPage !== null && (
            <DocumentScanner
                initialImage={pages.find(p => p.pageIndex === scannerPage)?.blob}
                onConfirm={async (file: File) => {
                    const thumb = await new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onload = ev => resolve(ev.target?.result as string);
                        reader.readAsDataURL(file);
                    });
                    setPages(prev => prev.map(p =>
                        p.pageIndex === scannerPage
                            ? { ...p, blob: file, thumbnail: thumb }
                            : p
                    ));
                    setScannerPage(null);
                }}
                onCancel={() => setScannerPage(null)}
            />
        )}
        </>
    );
}
