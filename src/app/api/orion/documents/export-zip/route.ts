import { NextRequest, NextResponse } from "next/server";
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

function findDocumentDir(docId: string): string | null {
    const snapshotsDir = path.join(process.cwd(), "src", "core", "_source_of_truth", "runtime_snapshots", "document_intelligence");
    if (!fs.existsSync(snapshotsDir)) return null;

    const dates = fs.readdirSync(snapshotsDir);
    for (const dateFolder of dates) {
        const datePath = path.join(snapshotsDir, dateFolder);
        if (fs.statSync(datePath).isDirectory()) {
            const docPath = path.join(datePath, `doc_${docId}`);
            if (fs.existsSync(docPath)) {
                return docPath;
            }
        }
    }
    return null;
}

export async function POST(req: NextRequest) {
    try {
        const { docIds } = await req.json();

        if (!docIds || !Array.isArray(docIds)) {
            return new NextResponse("Invalid docIds payload", { status: 400 });
        }

        const zip = new JSZip();

        for (const docId of docIds) {
            const docDir = findDocumentDir(docId);
            if (!docDir) continue;

            const summaryPath = path.join(docDir, "summary.json");
            if (!fs.existsSync(summaryPath)) continue;

            const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
            if (!summary.isMixedPdf || !summary.vehicleGroups) continue;

            for (const group of summary.vehicleGroups) {
                const identifier = group.matricula || group.bastidor || "Vehiculo_Desconocido";
                // Create a folder for the identifier
                const folder = zip.folder(identifier);
                if (!folder) continue;

                for (const doc of group.documents) {
                    const segFile = path.join(docDir, `segment_${doc.segmentId}.pdf`);
                    if (fs.existsSync(segFile)) {
                        folder.file(`${doc.type}_${doc.segmentId.slice(0, 6)}.pdf`, fs.readFileSync(segFile));
                    }
                }
            }
        }

        const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

        return new NextResponse(zipBuffer as unknown as BodyInit, {
            headers: {
                "Content-Type": "application/zip",
                "Content-Disposition": `attachment; filename="orion_mixed_export_${Date.now()}.zip"`
            }
        });
    } catch (error) {
        console.error("Export ZIP Error:", error);
        return new NextResponse("Internal server error", { status: 500 });
    }
}
