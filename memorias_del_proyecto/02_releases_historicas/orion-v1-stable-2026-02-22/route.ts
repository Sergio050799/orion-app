import { NextRequest, NextResponse } from "next/server";
import { processDocumentWithAzure } from "@/core/services/azure-doc-int";

export const runtime = "nodejs";
export const maxDuration = 60; // Extend generic Vercel timeouts if eventually hosted

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;

        if (!file) {
            return NextResponse.json({ ok: false, error: "No file provided in form-data payload." }, { status: 400 });
        }

        if (!ALLOWED_MIME_TYPES.includes(file.type)) {
            return NextResponse.json({ ok: false, error: "Invalid file type. Only application/pdf, image/jpeg, and image/png are allowed." }, { status: 400 });
        }

        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json({ ok: false, error: "File exceeds 15MB maximum size limit." }, { status: 400 });
        }

        // Convert the File back to Node Buffer for internal FS writing and network payload
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const result = await processDocumentWithAzure(buffer, file.type, file.name);

        let reportMarkdown: string | null = null;
        if (result.paths?.mdPath) {
            const fsp = require('fs').promises;
            try {
                reportMarkdown = await fsp.readFile(result.paths.mdPath, 'utf8');
            } catch (e) {
                console.warn("[ORION API] Could not read report.md", e);
            }
        }

        return NextResponse.json({
            ok: true,
            docId: result.docId,
            usedModel: result.usedModel,
            ocrQuality: result.ocrQuality,
            extractedFields: result.extractedFields,
            decoded: result.decoded,
            paths: result.paths,
            extractedPreview: result.extractedPreview,
            reportMarkdown
        }, { status: 200 });

    } catch (error: any) {
        console.error("[ORION API] Azure Document Intelligence Analyze Error:", error);

        let status = 500;
        let errorMessage = error.message || "Internal server error";

        // Map Azure standard error codes to HTTP context
        if (errorMessage.includes("Missing Azure Document")) status = 500;
        if (errorMessage.includes("401") || errorMessage.includes("403")) status = 401;
        if (errorMessage.includes("failed (400)")) status = 400;

        return NextResponse.json({
            ok: false,
            error: errorMessage
        }, { status: status });
    }
}
