export type DocumentType = "FICHA_TECNICA" | "PERMISO_V1" | "PERMISO_V2" | "CARNET_CONDUCIR" | "UNKNOWN";
export type SingleDocType = DocumentType;

export function resolveDocType(doc: any): DocumentType {
    const raw = doc?.detectedType
        ?? doc?.documentType
        ?? doc?.extractedFields?.meta?.detected_type
        ?? "UNKNOWN";

    if (raw === "PERMISO_COMPLETO") return "PERMISO_V1";
    if (raw === "PERMISO_TARJETA") return "PERMISO_V2";

    if (raw === "FICHA_TECNICA" || raw === "PERMISO_V1" || raw === "PERMISO_V2" || raw === "CARNET_CONDUCIR" || raw === "UNKNOWN") {
        return raw;
    }
    return "UNKNOWN";
}
