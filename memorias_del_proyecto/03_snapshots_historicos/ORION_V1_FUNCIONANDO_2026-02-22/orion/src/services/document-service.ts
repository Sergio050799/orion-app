import { ValidatedVehicleDTO } from "@/types/vehicle";

export interface DocumentRecord {
    id: string;
    fileName: string;
    uploadDate: string;
    status: "processing" | "completed" | "failed";
    vehicleId?: string;
    summary?: string; // e.g. "Azure OK"
    usedModel?: string;
    ocrQuality?: {
        ocrChars: number;
        nonEmptyLines: number;
        fieldsFoundCount: number;
        quality: string;
    };
    paths?: {
        jsonPath: string;
        mdPath: string;
    };
    extractedFields?: any;
    decoded?: any;
    extractedPreview?: {
        pageCount?: number;
        firstLines?: string[];
    };
    reportMarkdown?: string;
}

// In-memory store for the session
let documents: DocumentRecord[] = [];
let vehicles: Record<string, ValidatedVehicleDTO> = {};

export const DocumentService = {

    async uploadDocument(file: File): Promise<DocumentRecord> {
        // 1. Create initial record
        const docId = Math.random().toString(36).substring(7);
        const newDoc: DocumentRecord = {
            id: docId,
            fileName: file.name,
            uploadDate: new Date().toLocaleTimeString(),
            status: "processing"
        };

        // Add to top of queue
        documents = [newDoc, ...documents];

        // 2. Fire and forget real API call
        (async () => {
            try {
                const formData = new FormData();
                formData.append("file", file);

                const response = await fetch("/api/orion/document-intelligence/analyze", {
                    method: "POST",
                    body: formData
                });

                const docIndex = documents.findIndex(d => d.id === docId);
                if (docIndex !== -1) {
                    if (response.ok) {
                        const data = await response.json();
                        documents[docIndex] = {
                            ...documents[docIndex],
                            status: "completed",
                            summary: `${data.extractedFields?.plate || '---'} - ${data.extractedFields?.D1 || '---'} ${data.extractedFields?.D3 || '---'}`,
                            extractedPreview: data.extractedPreview,
                            extractedFields: data.extractedFields,
                            decoded: data.decoded,
                            usedModel: data.usedModel,
                            ocrQuality: data.ocrQuality,
                            paths: data.paths,
                            reportMarkdown: data.reportMarkdown
                        };
                    } else {
                        const data = await response.json().catch(() => null);
                        documents[docIndex] = {
                            ...documents[docIndex],
                            status: "failed",
                            summary: data?.error ? `API: ${data.error}` : `API failed (${response.status})`
                        };
                    }
                }

            } catch (error) {
                const docIndex = documents.findIndex(d => d.id === docId);
                if (docIndex !== -1) {
                    documents[docIndex] = {
                        ...documents[docIndex],
                        status: "failed",
                        summary: "Error de red"
                    };
                }
            }
        })();

        return newDoc;
    },

    async uploadDocuments(files: FileList | File[]): Promise<DocumentRecord[]> {
        const fileArray = Array.from(files);
        // We dispatch them all individually to simulate parallel queues that resolve at different times
        const promises = fileArray.map(f => this.uploadDocument(f));
        // We return immediately to not block UI. The UI polls getDocuments()
        return Promise.all(promises);
    },

    getDocuments(): DocumentRecord[] {
        return [...documents];
    },

    getVehicleResult(vehicleId: string): ValidatedVehicleDTO | undefined {
        return vehicles[vehicleId];
    },

    // KPI Calculations
    getKPIs() {
        return {
            processed: documents.filter(d => d.status === "completed").length,
            pending: documents.filter(d => d.status === "processing").length,
            failed: documents.filter(d => d.status === "failed").length,
            today: documents.length
        };
    }
};
