import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';

export interface OptimizationParams {
    inputBuffer: Buffer;
    mimeType: string;
    maxBytes?: number; // Configurable limit
    maxLongSide?: number;
}

export interface OptimizationResult {
    buffer: Buffer;
    mimeTypeOut: string;
    optimized: boolean;
    steps: string[];
    beforeBytes: number;
    afterBytes: number;
}

export async function optimizeForAzure({
    inputBuffer,
    mimeType,
    maxBytes = 4_000_000, // Very conservative 4MB limit for Azure Layout
    maxLongSide = 2500
}: OptimizationParams): Promise<OptimizationResult> {
    const beforeBytes = inputBuffer.length;

    // Default fallback
    const result: OptimizationResult = {
        buffer: inputBuffer,
        mimeTypeOut: mimeType,
        optimized: false,
        steps: [],
        beforeBytes,
        afterBytes: beforeBytes
    };

    // If not an image, return original (e.g. PDFs)
    if (!mimeType.startsWith('image/')) {
        return result;
    }

    result.steps.push(`Original Size: ${Math.round(beforeBytes / 1024)}KB.`);
    result.optimized = true;
    result.mimeTypeOut = 'application/pdf'; // Always output PDF to unify extractor paths

    try {
        let currentImage = sharp(inputBuffer);
        const metadata = await currentImage.metadata();
        const width = metadata.width || 0;
        const height = metadata.height || 0;
        const isLandscape = width > height;

        // Strip EXIF, flatten onto white, and apply OCR enhancements
        currentImage = currentImage
            .rotate()
            .flatten({ background: '#FFFFFF' })
            .grayscale()
            .normalize()
            .median(3)           // elimina ruido salt-and-pepper sin borrar bordes de texto
            .gamma(1.4)          // aclara sombras sin quemar zonas claras
            .linear(1.1, -15)    // micro-boost contraste: sube rango medio, baja glare leve
            .sharpen({ sigma: 1.2 });

        result.steps.push('Stripped metadata, flattened, grayscaled, normalized contrast, adaptive threshold (median+gamma+linear), and sharpened for OCR.');

        // 1. Initial Scale Down if needed
        const largestSide = Math.max(width, height);
        let targetSize = maxLongSide;

        if (largestSide > targetSize) {
            currentImage = currentImage.resize({
                width: isLandscape ? targetSize : undefined,
                height: !isLandscape ? targetSize : undefined,
                fit: 'inside',
                withoutEnlargement: true
            });
            result.steps.push(`Resized to fit inside ${targetSize}px (${width}x${height} -> target).`);
        }

        // 2. Compress to JPEG to embed in PDF
        let currentQuality = 85;
        let pBuffer = await currentImage.clone().jpeg({ quality: currentQuality, mozjpeg: true }).toBuffer();

        // 3. Iterative Compression Loop (only if file is huge)
        const qualitySteps = [75, 65, 50];
        const scaleSteps = [2000, 1600, 1400];

        let qIdx = 0;
        let sIdx = 0;

        while (pBuffer.length > (maxBytes - 100000) && (qIdx < qualitySteps.length || sIdx < scaleSteps.length)) {
            if (qIdx < qualitySteps.length) {
                currentQuality = qualitySteps[qIdx];
                pBuffer = await currentImage.clone().jpeg({ quality: currentQuality, mozjpeg: true }).toBuffer();
                qIdx++;
            } else if (sIdx < scaleSteps.length) {
                targetSize = scaleSteps[sIdx];
                currentImage = currentImage.resize({
                    width: isLandscape ? targetSize : undefined,
                    height: !isLandscape ? targetSize : undefined,
                    fit: 'inside',
                    withoutEnlargement: true
                });
                currentQuality = 75;
                qIdx = 1;
                pBuffer = await currentImage.clone().jpeg({ quality: currentQuality, mozjpeg: true }).toBuffer();
                sIdx++;
            }
        }

        result.steps.push(`Image payload stabilized at ${Math.round(pBuffer.length / 1024)}KB via auto-compression.`);

        // 4. Wrap the optimized image into a 1-page PDF
        const pdfDoc = await PDFDocument.create();
        const img = await pdfDoc.embedJpg(pBuffer);
        const page = pdfDoc.addPage([img.width, img.height]);
        page.drawImage(img, {
            x: 0,
            y: 0,
            width: img.width,
            height: img.height,
        });

        const pdfBytes = await pdfDoc.save();
        const finalBuffer = Buffer.from(pdfBytes);

        result.buffer = finalBuffer;
        result.afterBytes = finalBuffer.length;
        result.steps.push(`Wrapped inside a 1-page PDF. Final Size: ${Math.round(result.afterBytes / 1024)}KB.`);

        if (result.afterBytes > maxBytes) {
            const err: any = new Error("No se pudo reducir el archivo por debajo del límite");
            err.code = "AZURE_INPUT_TOO_LARGE_AFTER_OPTIMIZE";
            throw err;
        }

        return result;

    } catch (e: any) {
        if (e.code === "AZURE_INPUT_TOO_LARGE_AFTER_OPTIMIZE") {
            throw e;
        }
        // Sharp optimization failed, returning original
        result.optimized = false;
        result.steps.push(`Failed optimization: ${e.message}`);
        result.buffer = inputBuffer;
        result.mimeTypeOut = mimeType;
        result.afterBytes = beforeBytes;
        return result;
    }
}
