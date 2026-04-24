import type { SingleDocType } from "@/core/pipelines/_shared/docType";
import type { CatalogoCandidato, CatalogoVehiculo } from "@/core/catalogo/catalogoDataSource";
import type { PermissionCirculationRecord } from "@/core/pipelines/permiso/permiso.types";
import type { CarnetConducirRecord } from "@/core/pipelines/carnet/carnet.types";

/**
 * Union type para extractedFields segun tipo de documento.
 * Record<string, unknown> cubre UNKNOWN, MIXED y best-effort.
 */
export type ExtractedFields = PermissionCirculationRecord | CarnetConducirRecord | Record<string, unknown>;

export interface DocumentRecord {
    id: string;
    source: "ocr" | "manual";
    fileName: string;
    uploadDate: string; // we'll map this to createdAt locally for UI retro-compatibility or just use createdAt
    createdAt: string;
    status: "queued" | "processing" | "completed" | "failed";
    progress: number;
    approved: boolean;
    error: string | null;
    errorMessage?: string; // Full error stack or detailed message
    errorCode?: string; // '429', '400', '500', 'TIMEOUT', etc.
    snapshotPath: string | null;

    // Watchdog and queue tracking
    updatedAt?: number;
    startedAt?: number;
    heartbeatAt?: number;
    attempts?: number;
    uiHint?: string;

    // Extracted payloads
    extractedFields?: Record<string, unknown> | null;
    decoded?: Record<string, unknown> | null;
    reportModel?: Record<string, unknown> | null;
    reportMarkdown?: string;

    // UI meta
    summary?: string;
    usedModel?: string;
    detectedType?: SingleDocType;
    documentType?: SingleDocType | "MIXED_DOCUMENT";
    detectedTypeLocked?: boolean;
    detectedTypeEvidence?: { evidence?: string[]; scoreV1?: number; scoreV2?: number };
    extractorUsed?: string;
    classifierEvidence?: { evidence?: string[]; scoreV1?: number; scoreV2?: number };
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
    extractedPreview?: {
        pageCount?: number;
        firstLines?: string[];
    };

    // Phase 24: Mixed PDF Support
    isMixedPdf?: boolean;
    pagesTotal?: number;
    pagesTotalDetected?: number;
    pipelineUsed?: "simple" | "mixed";
    pipelineReason?: string;
    pageMap?: Array<{
        pageIndex: number;
        rotationApplied: number;
        detectedType: "FICHA_TECNICA" | "PERMISO_COMPLETO" | "PERMISO_TARJETA" | "UNKNOWN";
        confidence: number;
    }>;
    segments?: Array<{
        id: string;
        type: string;
        pages: number[];
        extractionStatus: "pending" | "done" | "failed";
        extractedData?: Record<string, unknown>;
    }>;
    vehicleGroups?: Array<{
        id: string;
        matricula?: string;
        bastidor?: string;
        documents: Array<{
            segmentId: string;
            type: string;
            pages: number[];
            status: string;
        }>;
    }>;
    optimization?: {
        optimized: boolean;
        beforeBytes: number;
        afterBytes: number;
        steps: string[];
    };

    // Phase 7: Catalogo
    catalogoCandidatos?: CatalogoCandidato[];
    catalogoSeleccionado?: CatalogoVehiculo | null;

    // Phase 7: Tipo de documento informado en la subida
    docCategory?: 'ficha' | 'permiso' | 'autorizacion' | 'carnet';
    docSubtype?: 'moderna' | 'antigua' | 'anverso' | 'reverso' | 'ambas';

    /** @internal Transient file blob for queue processing — NOT persisted to JSON */
    _file?: File;
}
