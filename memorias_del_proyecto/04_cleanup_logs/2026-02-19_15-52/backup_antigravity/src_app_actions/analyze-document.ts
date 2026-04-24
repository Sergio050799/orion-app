/* eslint-disable */
"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { renderPdfPageToPng } from "@/core/utils/pdf-renderer";
import sharp from "sharp";

export interface GeminiOcrResult {
    json: Record<string, string | null>;
    csv: string;
    filename: string;
    confidence?: Record<string, number>;
    error?: string;
}

// Helper to count valid fields
function countValidFields(data: any): number {
    if (!data || typeof data !== 'object') return 0;
    return Object.values(data).filter(v => v !== null && v !== "" && v !== undefined && String(v).trim().length > 0).length;
}

// Helper to call Gemini (private)
async function extractWithGemini(base64: string, mimeType: string, modelId: string): Promise<{ data: any, confidence: any, raw: string }> {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: modelId });

    const parts = [{ inlineData: { data: base64, mimeType } }];
    const PROMPT = `
Este documento es una ficha ITV española en TABLA. 
Debes localizar y extraer los valores asociados a los códigos: C.L, D.1, D.3, J, J.1, R, P.1, P.2, P.3, S.1, F.4, F.5, F.6.
Devuelve SOLO un JSON válido con esas claves exactas. 
Si un valor no aparece, null. 
No inventes. No devuelvas texto fuera del JSON.
    `;

    try {
        const result = await model.generateContent([PROMPT, ...parts]);
        const response = await result.response;
        const text = response.text();

        // Clean JSON
        let jsonStr = text.replace(/```json/g, "").replace(/```/g, "").trim();
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) jsonStr = jsonMatch[0];

        const parsed = JSON.parse(jsonStr);
        return {
            data: parsed.data || parsed,
            confidence: parsed.confidence || {},
            raw: text
        };
    } catch (e) {
        console.error("[Gemini Internal] Error:", e);
        return { data: {}, confidence: {}, raw: "" };
    }
}

export async function analyzeDocument(formData: FormData): Promise<GeminiOcrResult> {
    const file = formData.get("file") as File | null;

    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing");
    if (!file) throw new Error("No file provided");

    const allowedTypes = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
    if (!allowedTypes.includes(file.type)) {
        throw new Error(`Unsupported file type: ${file.type}. Please use PDF or Image.`);
    }

    // eslint-disable-next-line no-console
    console.log(`[Gemini] Processing file: ${file.name} (${file.type}, ${file.size} bytes)`);

    try {
        let bestResult = { data: {}, confidence: {} };
        let bestScore = -1;
        let bestRot = 0;

        if (file.type === "application/pdf") {
            const pdfBytes = Buffer.from(await file.arrayBuffer());
            // 1. High-res render 400 DPI
            const basePng = await renderPdfPageToPng(pdfBytes, 1, 400);

            // 2. Multi-rotation loop
            const rotations = [0, 90, 180, 270];

            for (const rot of rotations) {
                // Rotate
                // eslint-disable-next-line no-console
                console.log(`[OCR] Trying rotation ${rot}...`);
                const imgBuffer = await sharp(basePng).rotate(rot).toBuffer();
                const base64 = imgBuffer.toString("base64");

                // Call Gemini
                // Use Flash 2.5 for images (we converted PDF to image)
                const extraction = await extractWithGemini(base64, "image/png", "gemini-2.5-flash");
                const score = countValidFields(extraction.data);

                // eslint-disable-next-line no-console
                console.log(`[OCR] rot=${rot} score=${score} sample=${JSON.stringify(extraction.data).slice(0, 50)}...`);

                if (score > bestScore) {
                    bestScore = score;
                    bestResult = extraction;
                    bestRot = rot;
                }

                // Opt: Early exit if good enough? User said "Seleccionar el mejor".
                // We'll run all to be safe, unless score is very high (e.g. > 10 keys).
                if (score >= 10) break;
            }
        } else {
            // Image path
            const bytes = await file.arrayBuffer();
            const base64 = Buffer.from(bytes).toString("base64");
            const extraction = await extractWithGemini(base64, file.type, "gemini-2.5-flash"); // Flash for Image
            bestResult = extraction;
            bestScore = countValidFields(extraction.data);
        }

        // eslint-disable-next-line no-console
        console.log(`[OCR] FINAL: bestRot=${bestRot} bestScore=${bestScore}`);

        if (bestScore < 2) {
            throw new Error(`Extraction empty/low quality (${bestScore} fields). Please try a clearer image.`);
        }

        const data: any = bestResult.data;

        // CSV Generation
        const columns = ["C.L", "D.1", "D.3", "J", "J.1", "R", "P.1", "P.2", "P.3", "S.1", "F.4", "F.5", "F.6"];
        const header = columns.join(",");
        const row = columns.map(col => {
            const val = data[col] || "";
            return `"${String(val).replace(/"/g, '""')}"`;
        }).join(",");

        const csvContent = `\ufeff${header}\n${row}`;
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `ITV_Report_${timestamp}.csv`;

        return {
            json: data,
            csv: csvContent,
            filename,
            confidence: bestResult.confidence || {}
        };

    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new Error(`Gemini Error: ${msg}`);
    }
}
