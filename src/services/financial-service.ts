export interface InvoiceLineItem {
    description?: string;
    quantity?: number;
    unitPrice?: number;
    amount?: number;
    taxRate?: number;
}

export interface InvoiceTaxBreakdown {
    kind: "IVA" | "IRPF" | "OTRO";
    rate?: number;
    amount: number;
    isWithholding?: boolean;
}

export interface InvoiceRecord {
    vendorName?: string | null;
    vendorTaxId?: string | null;
    invoiceNumber?: string | null;
    issueDate?: string | null;
    dueDate?: string | null;
    currency?: string | null;
    subtotal?: number | null;
    taxTotal?: number | null;
    total?: number | null;
    taxBreakdown?: InvoiceTaxBreakdown[];
    hasInferredData?: boolean;
    lineItems?: InvoiceLineItem[];
    notes?: string | null;
    confidence?: number;
    // Multi-page Invoice Advanced Extraction
    pageEvidence?: any[];
    selectedPages?: number[];
    hasUsageDetail?: boolean;
    lineItemsCollapsed?: boolean;
    pagesUsed?: string;
    // Tax ID telemetry & determinism
    customerTaxId?: string | null;
    taxIdConfidence?: number;
    taxIdSource?: "azure_vendor" | "azure_customer" | "regex_context" | "vendor_registry" | "manual" | "unknown";
    taxIdCandidates?: Array<{ value: string; score: number; reason: string; page?: number }>;

    // Manual editing tracking
    originalValues?: Partial<Omit<InvoiceRecord, 'originalValues'>>;
}

export interface InvoiceDocumentRecord {
    id: string;
    source: "invoice-ocr" | "manual";
    fileName: string;
    createdAt: string;
    status: "queued" | "processing" | "completed" | "failed";
    progress: number;
    approved: boolean;
    error: string | null;
    snapshotPath: string | null;
    invoice: InvoiceRecord | null;
}

let documents: InvoiceDocumentRecord[] = [];
let isLoaded = false;

// Notify subscribers of changes (useful for React hooks matching the queue in real-time)
type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
    listeners.forEach(l => l());
}

export const FinancialService = {
    subscribe(listener: Listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
    },

    async loadHistoryIfNeeded() {
        if (isLoaded) return;
        try {
            const res = await fetch("/api/orion/document-intelligence/history-financial");
            if (res.ok) {
                const data = await res.json();
                documents = data.summary.records || [];
                isLoaded = true;
                notify();
            }
        } catch {
            // History not available yet
        }
    },

    async _persistRecord(record: Partial<InvoiceDocumentRecord> & { id: string }) {
        try {
            const res = await fetch("/api/orion/document-intelligence/history-financial", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "UPSERT_RECORD", payload: record })
            });
            if (res.ok) {
                const data = await res.json();
                documents = data.summary.records;
                notify();
            }
        } catch (e) {
            console.error("Failed to persist financial record", e);
        }
    },

    async uploadDocuments(files: FileList | File[]): Promise<InvoiceDocumentRecord[]> {
        await this.loadHistoryIfNeeded();
        const fileArray = Array.from(files);

        const newRecords: InvoiceDocumentRecord[] = fileArray.map(file => ({
            id: Math.random().toString(36).substring(7),
            source: "invoice-ocr",
            fileName: file.name,
            createdAt: new Date().toISOString(),
            status: "queued",
            progress: 0,
            approved: false,
            error: null,
            snapshotPath: null,
            invoice: null,
            // Attach file strictly temporarily for the queue processor
            _file: file
        } as any));

        // Optimistic
        documents = [...newRecords, ...documents];
        notify();

        // Persist all via UPSERT_RECORDS
        try {
            // Strip the temporary _file blob before sending to JSON API
            const safePayload = newRecords.map(({ _file, ...rest }: any) => rest);
            const res = await fetch("/api/orion/document-intelligence/history-financial", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "UPSERT_RECORDS", payload: safePayload })
            });
            if (res.ok) {
                const data = await res.json();
                // We must merge the file blobs back into the memory array so the processor can read them
                const updatedDocs = data.summary.records.map((r: InvoiceDocumentRecord) => {
                    const mem = documents.find(d => d.id === r.id);
                    return mem && (mem as any)._file ? { ...r, _file: (mem as any)._file } : r;
                });
                documents = updatedDocs;
                notify();
            }
        } catch (e) {
            console.error("Failed to persist financial queue", e);
        }

        // Start runner
        this.processQueue();

        return newRecords;
    },

    // A simple sequential loop runner
    async processQueue() {
        const isAlreadyRunning = documents.some(d => d.status === "processing");
        if (isAlreadyRunning) return; // Prevent concurrent processing

        const next = documents.find(d => d.status === "queued" && (d as any)._file);
        if (!next) return; // Nothing left with a blob attached

        // Mark as processing
        await this.updateRecord(next.id, { status: "processing", progress: 10 });

        const file = (next as any)._file as File;

        // Fake progressive progress
        let progressInterval = setInterval(() => {
            const doc = documents.find(d => d.id === next.id);
            if (doc && doc.status === "processing" && doc.progress < 85) {
                this.updateLocalOnly(next.id, { progress: doc.progress + 5 });
            }
        }, 800);

        try {
            const formData = new FormData();
            formData.append("file", file);

            const response = await fetch("/api/orion/document-intelligence/invoice", {
                method: "POST",
                body: formData
            });

            clearInterval(progressInterval);

            if (response.ok) {
                const data = await response.json();
                // Preservar manual overrides si existían y el usuario indicó "no sobrescribir en reprocesos"
                const memDoc = documents.find(d => d.id === next.id);
                let mergedInvoice = data.invoice;
                if (memDoc?.invoice?.originalValues) {
                    const overrides = Object.keys(memDoc.invoice.originalValues);
                    if (overrides.length > 0) {
                        mergedInvoice = {
                            ...data.invoice,
                            originalValues: data.invoice?.originalValues || {}
                        };
                        overrides.forEach(k => {
                            if (memDoc.invoice && k in memDoc.invoice) {
                                (mergedInvoice as any)[k] = (memDoc.invoice as any)[k];
                                (mergedInvoice.originalValues as any)[k] = data.invoice ? (data.invoice as any)[k] : null; // save new azure value as original
                            }
                        });
                        if (memDoc.invoice.taxIdSource === "manual") mergedInvoice.taxIdSource = "manual";
                    }
                }

                await this.updateRecord(next.id, {
                    status: "completed",
                    progress: 100,
                    invoice: mergedInvoice,
                    snapshotPath: data.snapshotPath
                });
            } else {
                const data = await response.json().catch(() => null);
                await this.updateRecord(next.id, {
                    status: "failed",
                    progress: 0,
                    error: data?.error || `API failed (${response.status})`
                });
            }
        } catch (error) {
            clearInterval(progressInterval);
            await this.updateRecord(next.id, {
                status: "failed",
                progress: 0,
                error: "Error de red"
            });
        }

        // Clear file blob to free memory
        const docRecord = documents.find(d => d.id === next.id);
        if (docRecord) {
            delete (docRecord as any)._file;
        }

        // Continue queue
        this.processQueue();
    },

    updateLocalOnly(id: string, patch: Partial<InvoiceDocumentRecord>) {
        const index = documents.findIndex(d => d.id === id);
        if (index !== -1) {
            documents[index] = { ...documents[index], ...patch };
            notify();
        }
    },

    async updateRecord(id: string, patch: Partial<InvoiceDocumentRecord>) {
        this.updateLocalOnly(id, patch);
        const record = documents.find(d => d.id === id);
        if (record) {
            // Strip file blobs before sending to network
            const { _file, ...safePayload } = record as any;
            await this._persistRecord(safePayload);
        }
    },

    async toggleApprove(id: string) {
        const doc = documents.find(d => d.id === id);
        if (doc) {
            await this.updateRecord(id, { approved: !doc.approved });
        }
    },

    async reprocessDocument(id: string, file?: File) {
        const doc = documents.find(d => d.id === id);
        if (doc && doc.status === "failed") {
            // Re-enqueue
            await this.updateRecord(id, { status: "queued", progress: 0, error: null });
            if (file) {
                (doc as any)._file = file;
            }
            this.processQueue();
        }
    },

    async deleteRecords(ids: string[]) {
        try {
            const res = await fetch("/api/orion/document-intelligence/history-financial", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "DELETE_RECORDS", payload: ids })
            });
            if (res.ok) {
                const data = await res.json();
                documents = data.summary.records;
                notify();
            }
        } catch (e) {
            console.error("Failed to delete financial records", e);
        }
    },

    getDocuments(): InvoiceDocumentRecord[] {
        return [...documents];
    },

    getKPIs() {
        return {
            processed: documents.filter(d => d.status === "completed").length,
            pending: documents.filter(d => d.status === "queued" || d.status === "processing").length,
            failed: documents.filter(d => d.status === "failed").length,
            totalEuros: documents.filter(d => d.status === "completed" && d.invoice?.total).reduce((acc, d) => acc + (d.invoice?.total || 0), 0)
        };
    }
};
