import { resolveDocType, type SingleDocType } from "@/core/pipelines/_shared/docType";
import type { DocumentRecord } from "./document-types";

// Re-export for consumers that import from this file
export type { DocumentRecord } from "./document-types";
export type { ExtractedFields } from "./document-types";

let documents: DocumentRecord[] = [];
let isLoaded = false;
let isProcessingLoopRunning = false;
let isReconcileLoopRunning = false;

// Notify subscribers of changes (useful for React hooks matching the queue in real-time)
type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
    listeners.forEach(l => l());
}

function getStableResolvedType(incomingDoc: Partial<DocumentRecord>, existingDoc?: Partial<DocumentRecord>): SingleDocType {
    const incoming = resolveDocType(incomingDoc);
    if (incoming !== "UNKNOWN") return incoming;
    if (existingDoc) return resolveDocType(existingDoc);
    return "UNKNOWN";
}

export const DocumentService = {
    subscribe(listener: Listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
    },

    startPollerIfInFlight() {
        if (isReconcileLoopRunning) return;

        const checkInFlight = () => documents.some(d => d.status === "queued" || d.status === "processing");
        if (!checkInFlight()) return;

        isReconcileLoopRunning = true;
        const poller = setInterval(async () => {
            if (!checkInFlight()) {
                clearInterval(poller);
                isReconcileLoopRunning = false;
                return;
            }

            try {
                const res = await fetch("/api/orion/document-intelligence/history");
                if (res.ok) {
                    const data = await res.json();
                    const remoteDocs = data.summary.records || [];
                    let hasUpdates = false;
                    const now = Date.now();

                    documents.forEach(localDoc => {
                        if (localDoc.status === "queued" || localDoc.status === "processing") {
                            const remoteDoc = remoteDocs.find((rd: DocumentRecord) => rd.id === localDoc.id);

                            // Rehydrate from backend if it finished
                            if (remoteDoc && (remoteDoc.status === "completed" || remoteDoc.status === "failed")) {
                                const resolvedType = getStableResolvedType(remoteDoc, localDoc);
                                this.updateLocalOnly(localDoc.id, {
                                    ...remoteDoc,
                                    detectedType: resolvedType,
                                    documentType: (remoteDoc.documentType && remoteDoc.documentType !== "UNKNOWN")
                                        ? remoteDoc.documentType
                                        : (localDoc.documentType ?? resolvedType),
                                    uiHint: undefined
                                });
                                hasUpdates = true;
                            }
                            // Watchdog anti-colgado (if we don't have remote info or remote is still processing)
                            else if (localDoc.status === "processing" && localDoc.startedAt) {
                                const elapsed = now - (localDoc.updatedAt || localDoc.startedAt);

                                if (elapsed > 120000 && localDoc.uiHint !== "stalled") {
                                    this.updateLocalOnly(localDoc.id, {
                                        uiHint: "stalled",
                                        status: "failed",
                                        error: "Proceso colgado detectado por el guardián global.",
                                        errorMessage: "Timeout: El proceso excedió 120 segundos sin terminar."
                                    });
                                    hasUpdates = true;
                                } else if (elapsed > 45000 && localDoc.uiHint !== "aborted_client_waiting_reconcile" && localDoc.uiHint !== "stalled") {
                                    this.updateLocalOnly(localDoc.id, { uiHint: "aborted_client_waiting_reconcile" });
                                    hasUpdates = true;
                                }
                            }
                        }
                    });

                    if (hasUpdates) notify();
                }
            } catch (e) { }
        }, 1500);
    },

    async loadHistoryIfNeeded() {
        if (isLoaded) return;
        try {
            const res = await fetch("/api/orion/document-intelligence/history");
            if (res.ok) {
                const data = await res.json();
                let loadedDocs = data.summary.records || [];
                let needsPersist = false;

                // Watchdog: Check for stale processing documents
                const now = Date.now();
                                loadedDocs = loadedDocs.map((doc: DocumentRecord) => {
                    const localDoc = documents.find(d => d.id === doc.id);
                    const resolvedType = getStableResolvedType(doc, localDoc);
                    const docWithType = {
                        ...doc,
                        detectedType: resolvedType,
                        documentType: (doc.documentType && doc.documentType !== "UNKNOWN")
                            ? doc.documentType
                            : (localDoc?.documentType ?? resolvedType)
                    };
                    if (doc.status === "processing") {
                        needsPersist = true;
                        const lastActive = doc.heartbeatAt || doc.updatedAt || now;
                        if (now - lastActive > 120000) { // 2 minutes stale
                            return {
                                ...docWithType,
                                status: "failed",
                                progress: 0,
                                error: "Proceso quedó colgado tras recarga/timeout. Reintenta.",
                                errorMessage: "Stale process detected during rehydration.",
                                errorCode: "STALE_PROCESS",
                                updatedAt: now
                            };
                        } else {
                            return {
                                ...docWithType,
                                status: "queued",
                                progress: Math.min(doc.progress || 0, 5),
                                updatedAt: now
                            };
                        }
                    }
                    return docWithType;
                });

                documents = loadedDocs;
                isLoaded = true;
                notify();

                if (needsPersist) {
                    await fetch("/api/orion/document-intelligence/history", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "UPSERT_RECORDS", payload: loadedDocs })
                    });
                    this.processQueue();
                }

                this.startPollerIfInFlight();
            }
        } catch (e) {
            console.error("Failed to load history", e);
        }
    },

    async _persistRecord(record: Partial<DocumentRecord> & { id: string }) {
        try {
            const res = await fetch("/api/orion/document-intelligence/history", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "UPSERT_RECORD", payload: record })
            });
            if (res.ok) {
                const data = await res.json();
                documents = (data.summary.records || []).map((d: DocumentRecord) => {
                    const existing = documents.find(doc => doc.id === d.id);
                    const resolvedType = getStableResolvedType(d, existing);
                    return {
                        ...d,
                        detectedType: resolvedType,
                        documentType: (d.documentType && d.documentType !== "UNKNOWN")
                            ? d.documentType
                            : (existing?.documentType ?? resolvedType)
                    };
                });
                notify();
            }
        } catch (e) {
            console.error("Failed to persist record", e);
        }
    },

    async uploadDocument(file: File): Promise<DocumentRecord> {
        await this.loadHistoryIfNeeded();

        const docId = crypto.randomUUID();
        const newDoc: DocumentRecord = {
            id: docId,
            source: "ocr",
            fileName: file.name,
            createdAt: new Date().toISOString(),
            uploadDate: new Date().toLocaleTimeString(),
            status: "queued", // Initial state
            progress: 0,
            detectedType: "UNKNOWN",
            documentType: "UNKNOWN",
            approved: false,
            error: null,
            snapshotPath: null
        };

        // UI Optimistic Update
        documents = [newDoc, ...documents];
        notify();

        // 1. Immediately persist "queued" state
        newDoc.updatedAt = Date.now();
        await this._persistRecord(newDoc);

        // 2. We don't dispatch it automatically here anymore if we want a strict physical queue.
        // However, for single uploads matching previous behavior, we can trigger the processing loop instantly.
        this.processQueue();

        return newDoc;
    },

    async uploadDocuments(files: FileList | File[], meta?: { docCategory?: string; docSubtype?: string }): Promise<DocumentRecord[]> {
        await this.loadHistoryIfNeeded();
        const fileArray = Array.from(files);

        const newRecords: DocumentRecord[] = fileArray.map(file => ({
            id: Math.random().toString(36).substring(7),
            source: "ocr",
            fileName: file.name,
            createdAt: new Date().toISOString(),
            uploadDate: new Date().toLocaleTimeString(),
            status: "queued",
            progress: 0,
            detectedType: "UNKNOWN",
            documentType: "UNKNOWN",
            approved: false,
            error: null,
            snapshotPath: null,
            updatedAt: Date.now(),
            ...(meta?.docCategory ? { docCategory: meta.docCategory as DocumentRecord['docCategory'] } : {}),
            ...(meta?.docSubtype ? { docSubtype: meta.docSubtype as DocumentRecord['docSubtype'] } : {}),
            // Attach file strictly temporarily for the queue processor
            _file: file
        }));

        // Optimistic
        documents = [...newRecords, ...documents];
        notify();

        // Persist all via UPSERT_RECORDS
        try {
            // Strip the temporary _file blob before sending to JSON API
            const safePayload = newRecords.map(({ _file, ...rest }) => rest);
            const res = await fetch("/api/orion/document-intelligence/history", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "UPSERT_RECORDS", payload: safePayload })
            });
            if (res.ok) {
                const data = await res.json();
                // We must merge the file blobs back into the memory array so the processor can read them
                const updatedDocs = data.summary.records.map((r: DocumentRecord) => {
                    const mem = documents.find(d => d.id === r.id);
                    const resolvedType = getStableResolvedType(r, mem);
                    const normalized = {
                        ...r,
                        detectedType: resolvedType,
                        documentType: (r.documentType && r.documentType !== "UNKNOWN")
                            ? r.documentType
                            : (mem?.documentType ?? resolvedType)
                    };
                    return mem && mem._file ? { ...normalized, _file: mem._file } : normalized;
                });
                documents = updatedDocs;
                notify();
            }
        } catch (e) {
            console.error("Failed to persist queue", e);
        }

        // Start runner
        this.processQueue();

        return newRecords;
    },

    // A simple sequential loop runner
    async processQueue() {
        if (isProcessingLoopRunning) return;
        isProcessingLoopRunning = true;

        try {
            while (true) {
                const next = documents.find(d => d.status === "queued" && d._file);
                if (!next) break; // Nothing left with a blob attached

                // Mark as processing
                await this.updateRecord(next.id, {
                    status: "processing",
                    progress: 10,
                    startedAt: Date.now(),
                    updatedAt: Date.now(),
                    heartbeatAt: Date.now(),
                    attempts: (next.attempts || 0) + 1
                });

                const file = next._file as File;

                // Progressive progress UX (simulated)
                let fakeProgress = 10;
                let progressInterval = setInterval(async () => {
                    const doc = documents.find(d => d.id === next.id);
                    if (doc && doc.status === "processing") {
                        if (fakeProgress < 35) fakeProgress += 5; // Optimization phase
                        else if (fakeProgress < 65) fakeProgress += 2; // Azure transit
                        else if (fakeProgress < 85) fakeProgress += 1; // Azure processing

                        // Only bump if the real progress isn't already higher
                        const nextProg = Math.max(doc.progress, fakeProgress);
                        this.updateLocalOnly(next.id, {
                            progress: nextProg,
                            heartbeatAt: Date.now() // Keep UI alive
                        });
                    }
                }, 1500);

                const abortController = new AbortController();
                const timeoutId = setTimeout(() => abortController.abort(), 90000); // 90s timeout

                try {
                    const formData = new FormData();
                    formData.append("file", file);
                    formData.append("docId", next.id); // Pass docId to allow backend heartbeat reporting
                    if (next.docCategory) formData.append("docCategory", next.docCategory);
                    if (next.docSubtype) formData.append("docSubtype", next.docSubtype);

                    // Route ALL documents to 'analyze'. The backend will internally upgrade
                    // to the 'mixed-pipeline' if it detects a PDF with > 1 pages.
                    const endpoint = "/api/orion/document-intelligence/analyze";

                    const response = await fetch(endpoint, {
                        method: "POST",
                        body: formData,
                        signal: abortController.signal
                    });
                    clearTimeout(timeoutId);
                    clearInterval(progressInterval);

                    if (response.ok) {
                        const data = await response.json();
                        const detectedTypeFromPayload = data.detectedType ?? data.documentType;
                        const documentTypeFromPayload = data.documentType ?? data.detectedType;
                        const resolvedType = getStableResolvedType(
                            {
                                detectedType: detectedTypeFromPayload,
                                documentType: documentTypeFromPayload,
                                extractedFields: data.extractedFields
                            },
                            next
                        );
                        await this.updateRecord(next.id, {
                            status: "completed",
                            progress: 100,
                            detectedType: resolvedType,
                            documentType: documentTypeFromPayload ?? next.documentType ?? resolvedType,
                            summary: `${data.extractedFields?.plate || '---'} - ${data.extractedFields?.D1 || '---'} ${data.extractedFields?.D3 || '---'}`,
                            extractedPreview: data.extractedPreview,
                            extractedFields: data.extractedFields,
                            decoded: data.decoded,
                            isMixedPdf: data.isMixedPdf,
                            pagesTotal: data.pagesTotal,
                            pagesTotalDetected: data.pagesTotalDetected,
                            pipelineUsed: data.pipelineUsed,
                            pipelineReason: data.pipelineReason,
                            pageMap: data.pageMap,
                            segments: data.segments,
                            vehicleGroups: data.vehicleGroups,
                            optimization: data.optimization,
                            updatedAt: Date.now()
                        });
                    } else {
                        const errData = await response.json().catch(() => ({}));
                        clearInterval(progressInterval);
                        await this.updateRecord(next.id, {
                            status: "failed",
                            progress: 0,
                            error: errData.error || "Error en el servidor API",
                            errorMessage: errData.fullError || errData.error || "No details provided.",
                            errorCode: errData.errorCode || "API_ERROR",
                            updatedAt: Date.now()
                        });
                    }
                } catch (error: unknown) {
                    clearTimeout(timeoutId);
                    clearInterval(progressInterval);
                    const isTimeout = error instanceof Error && error.name === 'AbortError';

                    if (isTimeout) {
                        // Crucial Phase 26 Fix: Do not prematurely fail. Let the reconcile poller wait for the backend.
                        await this.updateRecord(next.id, {
                            status: "processing",
                            uiHint: "aborted_client_waiting_reconcile",
                            updatedAt: Date.now()
                        });
                        this.startPollerIfInFlight();
                    } else {
                        await this.updateRecord(next.id, {
                            status: "failed",
                            progress: 0,
                            error: (error instanceof Error ? error.message : null) || "Error de red",
                            summary: "Error interno o de red",
                            errorMessage: (error instanceof Error ? (error.stack || error.message) : null) || "Error desconocido en el cliente",
                            errorCode: "NETWORK_ERROR",
                            updatedAt: Date.now()
                        });
                    }
                }

                // Clear file blob to free memory
                const docRecord = documents.find(d => d.id === next.id);
                if (docRecord) {
                    delete docRecord._file;
                }
            } // end while
        } finally {
            isProcessingLoopRunning = false;
        }
    },

    updateLocalOnly(id: string, patch: Partial<DocumentRecord>) {
        const index = documents.findIndex(d => d.id === id);
        if (index !== -1) {
            documents[index] = { ...documents[index], ...patch };
            notify();
        }
    },

    async updateRecord(id: string, patch: Partial<DocumentRecord>) {
        this.updateLocalOnly(id, patch);
        const record = documents.find(d => d.id === id);
        if (record) {
            // Strip file blobs before sending to network
            const { _file, ...safePayload } = record;
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
        if (!doc || doc.status !== "failed") return;

        const fileToUse = file || doc._file;
        if (!fileToUse) {
            await this.updateRecord(id, {
                status: "failed",
                error: "El archivo original ya no está en memoria. Sube el documento de nuevo."
            });
            return;
        }

        doc._file = fileToUse;
        await this.updateRecord(id, { status: "queued", progress: 0, error: null });
        this.processQueue();
    },

    getDocuments(): DocumentRecord[] {
        return [...documents];
    },

    async deleteDocuments(ids: Set<string>) {
        const idsArr = Array.from(ids);
        documents = documents.filter(d => !ids.has(d.id));
        notify();
        await fetch("/api/orion/document-intelligence/history", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "DELETE_RECORDS", payload: idsArr })
        });
    },

    async clearHistory() {
        documents = [];
        notify();
        await fetch("/api/orion/document-intelligence/history", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "CLEAR_HISTORY", payload: [] })
        });
    },

    getKPIs() {
        return {
            processed: documents.filter(d => d.status === "completed").length,
            pending: documents.filter(d => d.status === "queued" || d.status === "processing").length,
            failed: documents.filter(d => d.status === "failed").length,
            approved: documents.filter(d => d.approved).length,
            today: documents.length
        };
    }
};







