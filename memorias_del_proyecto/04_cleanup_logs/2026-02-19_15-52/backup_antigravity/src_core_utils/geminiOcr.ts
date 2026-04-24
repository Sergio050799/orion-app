/* eslint-disable */
import { analyzeDocument, type GeminiOcrResult } from "@/app/actions/analyze-document";

export { type GeminiOcrResult };

export async function processDocumentWithGemini(file: File): Promise<GeminiOcrResult> {
    const formData = new FormData();
    formData.append("file", file);

    try {
        const result = await analyzeDocument(formData);

        // Pass through exact result from Server Action (contains json, csv, filename)
        return result;

    } catch (error: any) {
        // eslint-disable-next-line no-console
        console.error("OCR Error:", error);
        return {
            json: {},
            csv: "",
            filename: "",
            confidence: {},
            error: error.message || "Failed to process document"
        };
    }
}
