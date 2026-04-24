import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';

// Disable worker (use main thread in Node)
// pdfjs.GlobalWorkerOptions.workerSrc = ''; // REMOVED per user request

/**
 * Renders the first page of a PDF to a high-res PNG buffer.
 * @param pdfBuffer The raw PDF buffer.
 * @param pageNum Page number to render (default 1).
 * @param targetDpi Target DPI for rendering (default 300).
 * @returns Promise<Buffer> containing the PNG image.
 */
export async function renderPdfPageToPng(pdfBuffer: Buffer, pageNum = 1, targetDpi = 300): Promise<Buffer> {
    // Convert Buffer to Uint8Array for pdfjs
    const uint8Array = new Uint8Array(pdfBuffer);

    // Load document
    const loadingTask = pdfjs.getDocument({
        data: uint8Array,
        disableFontFace: true,
        verbosity: 0,
        // @ts-ignore - disableWorker might be missing in types but is required
        disableWorker: true
    });

    const pdfDocument = await loadingTask.promise;

    if (pageNum > pdfDocument.numPages) {
        throw new Error(`PDF only has ${pdfDocument.numPages} pages, requested page ${pageNum}`);
    }

    const page = await pdfDocument.getPage(pageNum);

    // Calculate scale: standard PDF is 72 DPI. So 300 DPI = 300/72 scale.
    const scale = targetDpi / 72;
    const viewport = page.getViewport({ scale });

    // Create canvas
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');

    // Render
    const renderContext = {
        canvasContext: context as any, // Cast because types might differ slightly
        viewport: viewport,
    };

    await page.render(renderContext as any).promise;

    // Convert to PNG buffer
    const pngBuffer = await canvas.encode('png');

    // Clean memory if possible (though GC handles most)
    page.cleanup();
    loadingTask.destroy();

    return Buffer.from(pngBuffer);
}
