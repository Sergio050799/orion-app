import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { optimizeForAzure } from "@/core/pipelines/_shared/azureInputOptimizer";
import { parseAzureInvoice } from "./invoice-parser";

export const runtime = "nodejs";

const MAX_RETRIES = 30; // 60 seconds with 2s delay
const RETRY_DELAY_MS = 2000;

function sleep(ms: number) {
    return new Promise(r => setTimeout(r, ms));
}

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        const arrayBuffer = await file.arrayBuffer();
        let buffer = Buffer.from(new Uint8Array(arrayBuffer));
        let mimeType = file.type || "application/pdf";
        let optResult = null;

        if (mimeType.startsWith('image/')) {
            try {
                optResult = await optimizeForAzure({
                    inputBuffer: buffer as any,
                    mimeType: mimeType
                });
                if (optResult.optimized) {
                    buffer = optResult.buffer;
                    mimeType = optResult.mimeTypeOut;
                    console.log(`[FINANCIAL API] Image optimized: ${optResult.steps[optResult.steps.length - 1]}`);
                }
            } catch (optError: unknown) {
                if (optError instanceof Error && 'code' in optError && (optError as Error & { code: string }).code === "AZURE_INPUT_TOO_LARGE_AFTER_OPTIMIZE") {
                    return NextResponse.json({ error: (optError as Error).message, errorCode: (optError as Error & { code: string }).code }, { status: 400 });
                }
                console.warn("[FINANCIAL API] Optimization failed/skipped:", optError);
            }
        }

        const endpoint = process.env.AZURE_DOCINT_ENDPOINT!;
        const key = process.env.AZURE_DOCINT_KEY!;
        const apiVersion = process.env.AZURE_DOCINT_API_VERSION || '2024-02-29-preview';
        const cleanEndpoint = endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;
        const modelName = "prebuilt-invoice";

        const analyzeUrl = `${cleanEndpoint}/documentintelligence/documentModels/${modelName}:analyze?api-version=${apiVersion}`;


        const postRes = await fetch(analyzeUrl, {
            method: 'POST',
            headers: {
                'Ocp-Apim-Subscription-Key': key,
                'Content-Type': mimeType,
            },
            body: buffer as any
        });

        if (!postRes.ok) {
            const errorText = await postRes.text().catch(() => "");
            return NextResponse.json({ error: `Azure Analyze POST failed (${postRes.status}): ${errorText}` }, { status: postRes.status });
        }

        const operationLocation = postRes.headers.get('Operation-Location');
        if (!operationLocation) {
            return NextResponse.json({ error: "No Operation-Location header received from Azure" }, { status: 500 });
        }

        let analyzeResult: any = null;
        let attempts = 0;

        while (attempts < MAX_RETRIES) {
            await sleep(RETRY_DELAY_MS);
            attempts++;

            const statusRes = await fetch(operationLocation, {
                headers: { 'Ocp-Apim-Subscription-Key': key }
            });

            if (!statusRes.ok) {
                const errorText = await statusRes.text().catch(() => "");
                return NextResponse.json({ error: `Azure GET Status failed (${statusRes.status}): ${errorText}` }, { status: statusRes.status });
            }

            const data = await statusRes.json();
            if (data.status === "succeeded") {
                analyzeResult = data.analyzeResult;
                break;
            } else if (data.status === "failed") {
                return NextResponse.json({ error: "Azure Document Intelligence failed to process the document." }, { status: 500 });
            }
        }

        if (!analyzeResult) {
            return NextResponse.json({ error: "Azure Timeout: Factura no procesada a tiempo." }, { status: 504 });
        }

        // Parse
        const invoiceData = parseAzureInvoice(analyzeResult);

        // Save raw snapshot for robustness
        const outDir = path.join(process.cwd(), "src", "core", "_source_of_truth", "runtime_snapshots", "document_intelligence", "invoices_raw");
        try {
            await fs.access(outDir).catch(() => fs.mkdir(outDir, { recursive: true }));
        } catch { }

        const snapshotName = `invoice_${crypto.randomUUID()}.json`;
        const snapshotPath = path.join(outDir, snapshotName);
        await fs.writeFile(snapshotPath, JSON.stringify(analyzeResult, null, 2), "utf-8");

        // Validate basic failure conditions (rotation issues usually yield 0 fields)
        if (!invoiceData) {
            return NextResponse.json({
                error: "Dato vacío o Posible rotación requerida. No se encontraron campos de factura.",
                snapshotPath: snapshotName
            }, { status: 422 });
        }

        return NextResponse.json({
            ok: true,
            invoice: invoiceData,
            snapshotPath: snapshotName,
            optimization: optResult ? {
                optimized: optResult.optimized,
                beforeBytes: optResult.beforeBytes,
                afterBytes: optResult.afterBytes,
                steps: optResult.steps
            } : undefined
        });

    } catch (e: unknown) {
        console.error("[FINANCIAL] Invoice Route Error:", e);
        return NextResponse.json({ error: (e as Error).message || "Unknown error" }, { status: 500 });
    }
}
