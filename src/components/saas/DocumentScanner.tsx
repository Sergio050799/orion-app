"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";

interface Corner { x: number; y: number; }

interface DocumentScannerProps {
    onConfirm: (file: File) => void;
    onCancel: () => void;
    initialImage?: Blob;  // Si se proporciona, carga directamente sin mostrar el file picker
}

type CvStatus = "idle" | "loading" | "ready" | "error";
type ScanState = "idle" | "scanning" | "done";

// Singleton — OpenCV carga una sola vez por sesión
let cvPromise: Promise<void> | null = null;

function loadOpenCV(): Promise<void> {
    if (cvPromise) return cvPromise;
    cvPromise = new Promise<void>((resolve, reject) => {
        if (typeof window === "undefined") { reject(new Error("SSR")); return; }
        if ((window as any).cv?.Mat) { resolve(); return; }
        const script = document.createElement("script");
        script.src = "https://docs.opencv.org/4.8.0/opencv.js";
        script.async = true;
        script.onload = () => {
            const cv = (window as any).cv;
            if (cv?.Mat) resolve();
            else if (cv) cv.onRuntimeInitialized = () => resolve();
            else reject(new Error("OpenCV no disponible"));
        };
        script.onerror = () => reject(new Error("Error cargando OpenCV.js"));
        document.head.appendChild(script);
    });
    return cvPromise;
}

function drawOverlay(canvas: HTMLCanvasElement, img: HTMLImageElement, corners: Corner[], scale: number) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Sombra semitransparente fuera del área seleccionada
    ctx.fillStyle = "rgba(2,6,23,0.5)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Recortar zona del documento
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    ctx.lineTo(corners[1].x, corners[1].y);
    ctx.lineTo(corners[3].x, corners[3].y);
    ctx.lineTo(corners[2].x, corners[2].y);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    // Borde del área seleccionada
    ctx.strokeStyle = "#6366f1";
    ctx.lineWidth = 2 / scale;
    ctx.shadowColor = "rgba(99,102,241,0.6)";
    ctx.shadowBlur = 8 / scale;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    ctx.lineTo(corners[1].x, corners[1].y);
    ctx.lineTo(corners[3].x, corners[3].y);
    ctx.lineTo(corners[2].x, corners[2].y);
    ctx.closePath();
    ctx.stroke();
    ctx.shadowBlur = 0;
}

export default function DocumentScanner({ onConfirm, onCancel, initialImage }: DocumentScannerProps) {
    const [cvStatus, setCvStatus] = useState<CvStatus>("idle");
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
    const [corners, setCorners] = useState<Corner[] | null>(null);
    const [dragging, setDragging] = useState<number | null>(null);
    const [scanState, setScanState] = useState<ScanState>("idle");
    const [resultDataUrl, setResultDataUrl] = useState<string | null>(null);
    const [resultFile, setResultFile] = useState<File | null>(null);
    const [error, setError] = useState<string | null>(null);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imgRef = useRef<HTMLImageElement | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const scaleRef = useRef<number>(1);

    // Carga OpenCV al montar
    useEffect(() => {
        setCvStatus("loading");
        loadOpenCV()
            .then(() => setCvStatus("ready"))
            .catch(() => setCvStatus("error"));
    }, []);

    // Si llega initialImage, cargarla directamente (saltar el file picker)
    useEffect(() => {
        if (!initialImage) return;
        const syntheticFile = new File([initialImage], 'page.jpg', { type: initialImage.type || 'image/jpeg' });
        setImageFile(syntheticFile);
        setCorners(null);
        setResultDataUrl(null);
        setResultFile(null);
        setScanState("idle");
        setError(null);
        const reader = new FileReader();
        reader.onload = ev => setImageDataUrl(ev.target?.result as string);
        reader.readAsDataURL(initialImage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);  // Solo al montar — initialImage no cambia en el ciclo de vida del componente

    // Carga imagen en canvas y detecta bordes
    useEffect(() => {
        if (!imageDataUrl || !canvasRef.current || cvStatus !== "ready") return;
        const img = new Image();
        img.onload = () => {
            imgRef.current = img;
            const canvas = canvasRef.current!;
            const maxW = (containerRef.current?.clientWidth ?? 600) - 16;
            const maxH = 360;
            const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
            scaleRef.current = scale;
            canvas.width = img.naturalWidth * scale;
            canvas.height = img.naturalHeight * scale;

            const ctx = canvas.getContext("2d")!;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            // Detección con jscanify
            try {
                const jscanify = require("jscanify/client");
                const scanner = new jscanify();
                const tmp = document.createElement("canvas");
                tmp.width = img.naturalWidth;
                tmp.height = img.naturalHeight;
                tmp.getContext("2d")!.drawImage(img, 0, 0);
                const cvImg = (window as any).cv.imread(tmp);
                const contour = scanner.findPaperContour(cvImg);
                if (contour) {
                    const pts = scanner.getCornerPoints(contour, cvImg);
                    const { topLeftCorner, topRightCorner, bottomLeftCorner, bottomRightCorner } = pts;
                    if (topLeftCorner && topRightCorner && bottomLeftCorner && bottomRightCorner) {
                        const detected: Corner[] = [
                            { x: topLeftCorner.x * scale,    y: topLeftCorner.y * scale },
                            { x: topRightCorner.x * scale,   y: topRightCorner.y * scale },
                            { x: bottomLeftCorner.x * scale, y: bottomLeftCorner.y * scale },
                            { x: bottomRightCorner.x * scale, y: bottomRightCorner.y * scale },
                        ];
                        setCorners(detected);
                        cvImg.delete();
                        return;
                    }
                }
                cvImg.delete();
            } catch (e) { /* fallback */ }

            // Fallback: esquinas en el borde
            const pad = 12;
            setCorners([
                { x: pad, y: pad },
                { x: canvas.width - pad, y: pad },
                { x: pad, y: canvas.height - pad },
                { x: canvas.width - pad, y: canvas.height - pad },
            ]);
        };
        img.src = imageDataUrl;
    }, [imageDataUrl, cvStatus]);

    // Redibuja overlay cuando cambian las esquinas
    useEffect(() => {
        if (!canvasRef.current || !imgRef.current || !corners) return;
        drawOverlay(canvasRef.current, imgRef.current, corners, scaleRef.current);
    }, [corners]);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setImageFile(file);
        setCorners(null);
        setResultDataUrl(null);
        setResultFile(null);
        setScanState("idle");
        setError(null);
        const reader = new FileReader();
        reader.onload = ev => setImageDataUrl(ev.target?.result as string);
        reader.readAsDataURL(file);
    }, []);

    // Coordenadas en espacio del canvas desde evento mouse/touch
    const getCanvasPos = useCallback((e: React.MouseEvent | React.TouchEvent): Corner | null => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const clientX = "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const clientY = "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
        return {
            x: (clientX - rect.left) * (canvas.width / rect.width),
            y: (clientY - rect.top) * (canvas.height / rect.height),
        };
    }, []);

    const startDrag = useCallback((idx: number) => setDragging(idx), []);
    const stopDrag = useCallback(() => setDragging(null), []);

    const moveDrag = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        if (dragging === null || !corners) return;
        const pos = getCanvasPos(e);
        if (!pos) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const next = [...corners];
        next[dragging] = {
            x: Math.max(0, Math.min(canvas.width, pos.x)),
            y: Math.max(0, Math.min(canvas.height, pos.y)),
        };
        setCorners(next);
    }, [dragging, corners, getCanvasPos]);

    const handleScan = useCallback(async () => {
        if (!imageDataUrl || !corners || !imgRef.current) return;
        setScanState("scanning");
        setError(null);
        try {
            const jscanify = require("jscanify/client");
            const scanner = new jscanify();
            const img = imgRef.current;
            const scale = scaleRef.current;
            const toOrig = (c: Corner): Corner => ({ x: c.x / scale, y: c.y / scale });
            const [tl, tr, bl, br] = corners.map(toOrig);

            const w = Math.round(Math.max(
                Math.hypot(tr.x - tl.x, tr.y - tl.y),
                Math.hypot(br.x - bl.x, br.y - bl.y)
            ));
            const h = Math.round(Math.max(
                Math.hypot(bl.x - tl.x, bl.y - tl.y),
                Math.hypot(br.x - tr.x, br.y - tr.y)
            ));

            const src = document.createElement("canvas");
            src.width = img.naturalWidth;
            src.height = img.naturalHeight;
            src.getContext("2d")!.drawImage(img, 0, 0);

            const result = scanner.extractPaper(src, w, h, {
                topLeftCorner: tl, topRightCorner: tr,
                bottomLeftCorner: bl, bottomRightCorner: br,
            });

            if (!result) throw new Error("No se pudo extraer el documento.");

            result.toBlob((blob: Blob | null) => {
                if (!blob) {
                    setError("Error generando la imagen.");
                    setScanState("idle");
                    return;
                }
                const ext = imageFile?.name.endsWith(".pdf") ? "jpg" : (imageFile?.name.split(".").pop() || "jpg");
                const name = (imageFile?.name || "scan").replace(/\.[^.]+$/, `_scan.${ext}`);
                const file = new File([blob], name, { type: "image/jpeg" });
                setResultFile(file);
                setResultDataUrl(result.toDataURL("image/jpeg", 0.92));
                setScanState("done");
            }, "image/jpeg", 0.92);
        } catch (err: any) {
            setError(err?.message || "Error al escanear.");
            setScanState("idle");
        }
    }, [imageDataUrl, corners, imageFile]);

    // Posición CSS de los handles sobre el canvas
    const handleStyle = (corner: Corner): React.CSSProperties => {
        const canvas = canvasRef.current;
        if (!canvas) return {};
        const rect = canvas.getBoundingClientRect();
        return {
            left: corner.x * (rect.width / canvas.width) - 12,
            top: corner.y * (rect.height / canvas.height) - 12,
        };
    };

    const modalStyle: React.CSSProperties = {
        background: 'rgba(2,6,23,0.97)',
        border: '1px solid rgba(255,255,255,0.1)',
        backdropFilter: 'blur(32px)',
    };

    const panelStyle: React.CSSProperties = {
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}>
            <div
                ref={containerRef}
                className="w-full max-w-4xl flex flex-col overflow-hidden rounded-2xl shadow-2xl animate-in slide-in-from-bottom-4 duration-300"
                style={modalStyle}
            >
                {/* Accent line */}
                <div className="absolute top-0 left-0 right-0 h-px rounded-t-2xl" style={{ background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.5), transparent)' }} />

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                    <div>
                        <h2 className="text-sm font-black text-white uppercase tracking-widest">Escáner de Documentos</h2>
                        <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                            Corrige la perspectiva antes de procesar con OCR
                        </p>
                    </div>
                    <button
                        onClick={onCancel}
                        className="p-1.5 rounded-lg transition-colors"
                        style={{ color: 'rgba(255,255,255,0.35)' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'white')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-5 flex flex-col gap-4 overflow-y-auto custom-scrollbar">

                    {/* Estado OpenCV */}
                    {cvStatus === "loading" && (
                        <div className="flex items-center gap-3 text-sm rounded-xl p-4" style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', color: 'rgba(255,255,255,0.5)' }}>
                            <svg className="animate-spin w-4 h-4 shrink-0" style={{ color: '#6366f1' }} fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            <span>Cargando escáner <span style={{ color: '#6366f1' }}>(OpenCV.js)</span>...</span>
                        </div>
                    )}

                    {cvStatus === "error" && (
                        <div className="text-sm rounded-xl p-4" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: '#F59E0B' }}>
                            Escáner no disponible — sin conexión o error de red. Puedes subir la imagen directamente.
                        </div>
                    )}

                    {/* Zona de selección de imagen */}
                    {!imageDataUrl && (
                        <label
                            className="flex flex-col items-center justify-center gap-3 rounded-xl p-10 cursor-pointer transition-all"
                            style={{ border: '2px dashed rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.02)' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(99,102,241,0.4)'; (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.04)'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.12)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'; }}
                        >
                            <svg className="w-12 h-12" style={{ color: 'rgba(255,255,255,0.2)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.4)' }}>Seleccionar imagen del documento</span>
                            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>JPG · PNG — no PDFs</span>
                            <input type="file" className="hidden" accept="image/*" onChange={handleFileSelect} />
                        </label>
                    )}

                    {/* Dos paneles: original + resultado */}
                    {imageDataUrl && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                            {/* Panel izquierdo — original con handles */}
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>
                                        Original
                                    </span>
                                    {corners && cvStatus === "ready" && (
                                        <span className="text-[9px] font-bold px-2 py-0.5 rounded uppercase" style={{ color: '#6366f1', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.18)' }}>
                                            Arrastra las esquinas
                                        </span>
                                    )}
                                    {!corners && cvStatus === "ready" && (
                                        <span className="text-[9px] font-bold animate-pulse" style={{ color: '#F59E0B' }}>
                                            Detectando bordes...
                                        </span>
                                    )}
                                </div>

                                <div
                                    className="relative select-none rounded-xl overflow-hidden"
                                    style={panelStyle}
                                    onMouseMove={moveDrag}
                                    onMouseUp={stopDrag}
                                    onMouseLeave={stopDrag}
                                    onTouchMove={e => { e.preventDefault(); moveDrag(e); }}
                                    onTouchEnd={stopDrag}
                                >
                                    <canvas
                                        ref={canvasRef}
                                        className="w-full block"
                                        style={{ cursor: dragging !== null ? "grabbing" : "default" }}
                                    />
                                    {/* Handles arrastrables */}
                                    {corners?.map((corner, idx) => (
                                        <div
                                            key={idx}
                                            className="absolute rounded-full border-2 border-white flex items-center justify-center"
                                            style={{
                                                ...handleStyle(corner),
                                                position: "absolute",
                                                width: '24px',
                                                height: '24px',
                                                background: '#6366f1',
                                                boxShadow: '0 0 10px rgba(99,102,241,0.6)',
                                                cursor: 'grab',
                                                touchAction: 'none',
                                            }}
                                            onMouseDown={e => { e.preventDefault(); startDrag(idx); }}
                                            onTouchStart={e => { e.preventDefault(); startDrag(idx); }}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Panel derecho — resultado del escáner */}
                            <div className="flex flex-col gap-2">
                                <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>
                                    Resultado corregido
                                </span>

                                <div
                                    className="flex-1 rounded-xl flex items-center justify-center min-h-[160px]"
                                    style={panelStyle}
                                >
                                    {scanState === "idle" && (
                                        <div className="text-center p-6">
                                            <svg className="w-10 h-10 mx-auto mb-2" style={{ color: 'rgba(255,255,255,0.12)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                                                <polyline points="9 22 9 12 15 12 15 22" />
                                            </svg>
                                            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>Pulsa "Escanear" para ver el resultado</p>
                                        </div>
                                    )}

                                    {scanState === "scanning" && (
                                        <div className="text-center p-6 flex flex-col items-center gap-3">
                                            <svg className="animate-spin w-8 h-8" style={{ color: '#6366f1' }} fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                            </svg>
                                            <p className="text-xs font-bold animate-pulse" style={{ color: '#6366f1' }}>Corrigiendo perspectiva...</p>
                                        </div>
                                    )}

                                    {scanState === "done" && resultDataUrl && (
                                        <img
                                            src={resultDataUrl}
                                            alt="Resultado escaneado"
                                            className="w-full rounded-xl block"
                                        />
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Cambiar imagen (si ya hay una) */}
                    {imageDataUrl && (
                        <label
                            className="w-max text-[10px] font-bold uppercase tracking-widest cursor-pointer transition-colors"
                            style={{ color: 'rgba(255,255,255,0.3)' }}
                            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
                        >
                            ↩ Cambiar imagen
                            <input type="file" className="hidden" accept="image/*" onChange={handleFileSelect} />
                        </label>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="text-sm rounded-xl p-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444' }}>
                            {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-4 flex items-center gap-3 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                    <button
                        onClick={onCancel}
                        className="px-5 py-2.5 text-sm font-bold rounded-xl transition-colors"
                        style={{ color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.09)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                    >
                        Cancelar
                    </button>

                    <div className="flex-1" />

                    {/* Subir sin escanear — fallback */}
                    {imageFile && (
                        <button
                            onClick={() => onConfirm(imageFile)}
                            className="px-5 py-2.5 text-sm font-bold rounded-xl transition-colors"
                            style={{ color: 'rgba(255,255,255,0.4)', background: 'transparent', border: '1px solid rgba(255,255,255,0.09)' }}
                            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}
                            title="Subir sin corregir perspectiva"
                        >
                            Subir sin escanear
                        </button>
                    )}

                    {/* Escanear */}
                    {scanState !== "done" && (
                        <button
                            onClick={handleScan}
                            disabled={!imageDataUrl || !corners || scanState === "scanning" || cvStatus !== "ready"}
                            className="px-6 py-2.5 text-sm font-black rounded-xl transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{ background: '#6366f1', color: '#020617', boxShadow: '0 0 16px rgba(99,102,241,0.25)' }}
                            onMouseEnter={e => { if (!e.currentTarget.disabled) (e.currentTarget as HTMLElement).style.boxShadow = '0 0 28px rgba(99,102,241,0.45)'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 0 16px rgba(99,102,241,0.25)'; }}
                        >
                            {scanState === "scanning" ? (
                                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                            ) : (
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <rect x="3" y="3" width="18" height="18" rx="2" />
                                    <path d="M3 9h18M9 21V9" />
                                </svg>
                            )}
                            {scanState === "scanning" ? "Procesando..." : "Escanear"}
                        </button>
                    )}

                    {/* Usar esta imagen — solo cuando hay resultado */}
                    {scanState === "done" && resultFile && (
                        <button
                            onClick={() => onConfirm(resultFile)}
                            className="px-6 py-2.5 text-sm font-black rounded-xl transition-all flex items-center gap-2 animate-in fade-in duration-200"
                            style={{ background: '#10B981', color: '#020617', boxShadow: '0 0 16px rgba(16,185,129,0.3)' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 0 28px rgba(16,185,129,0.5)'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 0 16px rgba(16,185,129,0.3)'; }}
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <polyline points="20 6 9 17 4 12" strokeWidth="2.5" />
                            </svg>
                            Usar esta imagen
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
