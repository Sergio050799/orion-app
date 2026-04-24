"use client";
// autoScan.ts — corrección automática de perspectiva antes del upload
// Usa jscanify + OpenCV.js (mismo stack que el Escáner manual)
// Si falla por cualquier motivo → devuelve el archivo original sin tocar

let cvPromise: Promise<void> | null = null;

/** Precarga OpenCV en background. Llamar al montar el componente de upload. */
export function preloadOpenCV(): void {
    if (typeof window === "undefined") return;
    if (cvPromise) return;
    cvPromise = new Promise<void>((resolve, reject) => {
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
}

export function waitForOpenCV(): Promise<void> {
    if (!cvPromise) preloadOpenCV();
    return cvPromise!;
}

/**
 * ¿El documento detectado ocupa casi todo el frame?
 * Si las 4 esquinas están dentro del 12% del borde de la imagen,
 * no hay nada que corregir — evitar degradar calidad innecesariamente.
 */
function isFullFrame(
    tl: { x: number; y: number }, tr: { x: number; y: number },
    bl: { x: number; y: number }, br: { x: number; y: number },
    imgW: number, imgH: number
): boolean {
    const m = 0.12;
    return (
        tl.x < imgW * m       && tl.y < imgH * m &&
        tr.x > imgW * (1 - m) && tr.y < imgH * m &&
        bl.x < imgW * m       && bl.y > imgH * (1 - m) &&
        br.x > imgW * (1 - m) && br.y > imgH * (1 - m)
    );
}

export interface AutoScanResult {
    file: File;
    corrected: boolean;
}

/**
 * Intenta corregir perspectiva y recortar un archivo de imagen.
 * - PDFs → pasan sin modificar
 * - Imágenes que llenan el frame → pasan sin modificar
 * - Cualquier error → devuelve original (nunca lanza)
 */
export async function autoScanImage(file: File): Promise<AutoScanResult> {
    if (!file.type.startsWith("image/")) return { file, corrected: false };

    try {
        // Esperar OpenCV con timeout de 8s — si no está listo, skip
        await Promise.race([
            waitForOpenCV(),
            new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000)),
        ]);

        // Dibujar imagen en canvas a resolución nativa
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
        bitmap.close();

        // Detectar bordes del documento
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const jscanify = require("jscanify/client");
        const scanner = new jscanify();

        const cvImg = (window as any).cv.imread(canvas);
        const contour = scanner.findPaperContour(cvImg);

        if (!contour) {
            cvImg.delete();
            return { file, corrected: false };
        }

        const pts = scanner.getCornerPoints(contour, cvImg);
        cvImg.delete();

        const { topLeftCorner: tl, topRightCorner: tr, bottomLeftCorner: bl, bottomRightCorner: br } = pts;
        if (!tl || !tr || !bl || !br) return { file, corrected: false };

        // Si el documento ya llena el frame, no corregir
        if (isFullFrame(tl, tr, bl, br, canvas.width, canvas.height)) {
            return { file, corrected: false };
        }

        // Calcular dimensiones del output corregido
        const outW = Math.round(Math.max(
            Math.hypot(tr.x - tl.x, tr.y - tl.y),
            Math.hypot(br.x - bl.x, br.y - bl.y)
        ));
        const outH = Math.round(Math.max(
            Math.hypot(bl.x - tl.x, bl.y - tl.y),
            Math.hypot(br.x - tr.x, br.y - tr.y)
        ));

        // Sanity check: no generar imágenes absurdamente pequeñas
        if (outW < 200 || outH < 200) return { file, corrected: false };

        const result = scanner.extractPaper(canvas, outW, outH, {
            topLeftCorner: tl, topRightCorner: tr,
            bottomLeftCorner: bl, bottomRightCorner: br,
        });

        if (!result) return { file, corrected: false };

        return new Promise<AutoScanResult>(resolve => {
            result.toBlob((blob: Blob | null) => {
                if (!blob) { resolve({ file, corrected: false }); return; }
                const name = file.name.replace(/\.[^.]+$/, "_scan.jpg");
                resolve({
                    file: new File([blob], name, { type: "image/jpeg" }),
                    corrected: true,
                });
            }, "image/jpeg", 0.92);
        });

    } catch {
        // Cualquier error (OpenCV no disponible, jscanify falla, etc.) → original
        return { file, corrected: false };
    }
}

/**
 * Procesa un array de archivos en paralelo.
 * PDFs pasan directamente. Imágenes pasan por autoScanImage.
 */
export async function autoScanFiles(
    files: File[],
    onProgress?: (done: number, total: number) => void
): Promise<File[]> {
    let done = 0;
    const results = await Promise.all(
        files.map(async (f) => {
            const r = await autoScanImage(f);
            done++;
            onProgress?.(done, files.length);
            return r.file;
        })
    );
    return results;
}
