import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

export const runtime = "nodejs";

// Stable single-source-of-truth path for local DEV
const SUMMARY_DIR = path.join(process.cwd(), "src", "core", "_source_of_truth", "runtime_snapshots", "document_intelligence");
const SUMMARY_FILE = path.join(SUMMARY_DIR, "summary.json");
const TMP_FILE = path.join(SUMMARY_DIR, `summary_${crypto.randomUUID()}.tmp`);

// Ensure directory exists
async function ensureDir() {
    try {
        await fs.access(SUMMARY_DIR);
    } catch {
        await fs.mkdir(SUMMARY_DIR, { recursive: true });
    }
}

// Atomic read with fallback
export async function readSummary() {
    await ensureDir();
    try {
        const data = await fs.readFile(SUMMARY_FILE, "utf-8");
        return JSON.parse(data);
    } catch (e: any) {
        if (e.code === 'ENOENT') {
            return { version: 1, updatedAt: new Date().toISOString(), records: [] };
        }
        throw e;
    }
}

// Atomic write using a tmp file approach
export async function writeSummaryAtomic(summaryObj: any) {
    await ensureDir();
    summaryObj.updatedAt = new Date().toISOString();
    const data = JSON.stringify(summaryObj, null, 2);
    // write to temp
    await fs.writeFile(TMP_FILE, data, "utf-8");
    // atomically rename over existing
    await fs.rename(TMP_FILE, SUMMARY_FILE);
}

export async function GET() {
    try {
        const summary = await readSummary();
        return NextResponse.json({ ok: true, summary }, { status: 200 });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { action, payload } = body;

        const summary = await readSummary();

        if (action === "UPSERT_RECORD") {
            const index = summary.records.findIndex((r: any) => r.id === payload.id);
            if (index >= 0) {
                summary.records[index] = { ...summary.records[index], ...payload };
            } else {
                summary.records.unshift(payload); // add to top
            }
        }
        else if (action === "UPSERT_RECORDS") {
            for (const record of payload) {
                const index = summary.records.findIndex((r: any) => r.id === record.id);
                if (index >= 0) {
                    summary.records[index] = { ...summary.records[index], ...record };
                } else {
                    summary.records.unshift(record);
                }
            }
        }
        else if (action === "CLEAR_HISTORY") {
            summary.records = [];
        }
        else if (action === "DELETE_RECORDS") {
            const idsToDelete = new Set(payload); // payload is array of string ids
            summary.records = summary.records.filter((r: any) => !idsToDelete.has(r.id));
        }
        else {
            return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });
        }

        await writeSummaryAtomic(summary);
        return NextResponse.json({ ok: true, summary }, { status: 200 });

    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
    }
}
