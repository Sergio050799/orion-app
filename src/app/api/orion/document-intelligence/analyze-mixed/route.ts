import { NextRequest, NextResponse } from "next/server";
import { processMixedDocument } from "@/core/router/azure-mixed-pipeline";
import { readSummary, writeSummaryAtomic } from "../history/route";

export const runtime = "nodejs";
export const maxDuration = 120; // Extend generic Vercel timeouts for multi-page processing

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
const ALLOWED_MIME_TYPES = ['application/pdf'];

export async function POST(req: NextRequest) {
    let docId: string | null = null;
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        docId = formData.get("docId") as string | null;

        if (!file) {
            return NextResponse.json({ ok: false, error: "No file provided in form-data payload." }, { status: 400 });
        }

        if (!ALLOWED_MIME_TYPES.includes(file.type)) {
            return NextResponse.json({ ok: false, error: "Invalid file type. Only application/pdf is allowed for mixed multi-page extraction." }, { status: 400 });
        }

        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json({ ok: false, error: "File exceeds 15MB maximum size limit." }, { status: 400 });
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const result = await processMixedDocument(buffer, file.type, file.name, docId);

        const finalData = {
            ok: true,
            docId: result.docId,
            isMixedPdf: result.isMixedPdf,
            pagesTotal: result.pagesTotal,
            pageMap: result.pageMap,
            segments: result.segments,
            vehicleGroups: result.vehicleGroups,
            paths: result.paths,
            extractedPreview: result.extractedPreview,
            usedModel: result.usedModel,
            documentType: result.documentType,
            extractorUsed: result.extractorUsed,
            classifierEvidence: result.classifierEvidence,
            ocrQuality: result.ocrQuality,
            extractedFields: result.extractedFields,
            decoded: result.decoded
        };

        if (docId) {
            try {
                const summary = await readSummary();
                const idx = summary.records.findIndex((r: any) => r.id === docId);
                if (idx >= 0) {
                    summary.records[idx] = {
                        ...summary.records[idx],
                        ...finalData,
                        status: "completed",
                        progress: 100,
                        updatedAt: Date.now()
                    };
                    await writeSummaryAtomic(summary);
                }
            } catch (histErr) { }
        }

        return NextResponse.json(finalData, { status: 200 });

    } catch (error: any) {
        let status = 500;
        let errorMessage = error.message || "Internal server error";
        let errorCode = "500";
        if (error.status) {
            status = error.status;
            errorCode = error.status.toString();
        }

        if (errorMessage.includes("Missing Azure")) { status = 500; errorCode = "CONFIG_ERROR"; }
        if (errorMessage.includes("401") || errorMessage.includes("403")) { status = 401; errorCode = "AUTH_ERROR"; }
        if (errorMessage.includes("failed (400)")) { status = 400; errorCode = "BAD_REQUEST"; }

        if (docId) { // Use the already available docId
            try {
                const summary = await readSummary();
                const idx = summary.records.findIndex((r: any) => r.id === docId);
                if (idx >= 0) {
                    summary.records[idx].status = "failed";
                    summary.records[idx].error = errorMessage;
                    summary.records[idx].updatedAt = Date.now();
                    await writeSummaryAtomic(summary);
                }
            } catch (histErr) { }
        }

        return NextResponse.json({
            ok: false,
            error: errorMessage,
            fullError: error.stack || errorMessage,
            errorCode: errorCode
        }, { status });
    }
}
