// Azure Document Intelligence types — basado en campos que Orion realmente usa.
// NO cubre toda la API de Azure, solo lo consumido por nuestros pipelines.

export interface AzureLine {
    content: string;
}

export interface AzureWord {
    content: string;
}

export interface AzureParagraph {
    content: string;
}

export interface AzureBoundingRegion {
    pageNumber: number;
}

export interface AzurePage {
    pageNumber?: number;
    pageIndex?: number;
    lines?: AzureLine[];
    words?: AzureWord[];
    angle?: number;
}

export interface AzureFieldValue {
    valueString?: string;
    valueDate?: string;
    valueNumber?: number;
    content?: string;
    currencySymbol?: string;
    valueArray?: AzureFieldValue[];
    valueObject?: Record<string, AzureFieldValue>;
    boundingRegions?: AzureBoundingRegion[];
}

export interface AzureDocument {
    fields?: Record<string, AzureFieldValue>;
    confidence?: number;
}

export interface AzureAnalyzeResult {
    content?: string;
    pages?: AzurePage[];
    paragraphs?: AzureParagraph[];
    documents?: AzureDocument[];
}

/**
 * Wrapper de la respuesta completa de Azure (status polling).
 * `analyzeResult` es null hasta que `status === "succeeded"`.
 */
export interface AzureOperationResult {
    status: string;
    analyzeResult?: AzureAnalyzeResult;
    error?: unknown;
}

/**
 * Error tipado para errores de Azure con status HTTP y código de error.
 * Reemplaza el patrón `(errObj as any).status = 408`.
 */
export class AzureError extends Error {
    status: number;
    errorCode: string;

    constructor(message: string, status: number, errorCode: string) {
        super(message);
        this.name = "AzureError";
        this.status = status;
        this.errorCode = errorCode;
    }
}
