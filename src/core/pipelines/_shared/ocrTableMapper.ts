import type { DocumentRecord } from "@/services/document-service";
import { resolveDocType } from "@/core/pipelines/_shared/docType";
import { estimateDate } from "@/core/_source_of_truth/plates/engine";

/**
 * Robustly converts a field value or object to a string for UI display.
 * Prevents React object-child crashes.
 */
export function toText(x: any): string {
    if (x === null || x === undefined) return "-";

    if (typeof x === "object" && !Array.isArray(x)) {
        if ("value" in x) return toText((x as any).value);
        return "-";
    }

    if (Array.isArray(x)) {
        if (x.length === 0) return "-";
        return x.map(item => toText(item)).join(", ");
    }

    const str = String(x).trim();
    return str === "" ? "-" : str;
}

/**
 * Fallback getter for backward and mixed compatibility
 */
export function getCompatibleVehicleData(doc: any) {
    if (!doc) return {};
    return doc.extractedData ||
        doc.extractedFields ||
        doc.extracted ||
        doc.result?.extractedData ||
        doc.uiModel ||
        doc.segments?.find((s: any) => s.type === "FICHA_TECNICA")?.extractedData ||
        doc.segments?.[0]?.extractedData ||
        doc.vehicleGroups?.[0]?.documents?.find((d: any) => d.type === "FICHA_TECNICA")?.extractedData ||
        {};
}

export function getTableMapping(doc: DocumentRecord) {
    const resolvedType = resolveDocType(doc);
    const isPermiso = resolvedType.startsWith("PERMISO_");

    let fields: any = {};
    let legacyData: any = {};

    if (isPermiso && !doc.isMixedPdf) {
        fields = doc.extractedFields || {};
    } else {
        legacyData = getCompatibleVehicleData(doc) || {};
    }

    const unwrapField = (v: any) => {
        if (v === null || v === undefined) return null;
        if (typeof v === "object" && !Array.isArray(v)) {
            if ("value" in v) return (v as any).value ?? null;
            return null;
        }
        return v;
    };

    const getPermisoBrand = () => {
        const f = fields;
        return unwrapField(f.vehicleCommercial?.brand) ?? unwrapField(f.D1) ?? unwrapField(f.fields?.D1) ?? "-";
    };

    const getPermisoModel = () => {
        const f = fields;
        const debugD3 = Array.isArray(f.meta?._debugExtract)
            ? f.meta._debugExtract.find((d: any) => d?.key === "D.3 (Modelo)" || d?.key === "D3" || d?.key === "D.3")?.value
            : null;

        return unwrapField(f.vehicleCommercial?.model) ??
            unwrapField(f.vehicleCommercial?.commercial_name) ??
            unwrapField(f.D3) ??
            unwrapField(f.fields?.D3) ??
            unwrapField(debugD3) ??
            "-";
    };

    const getPermisoPlate = () => {
        const f = fields;
        return unwrapField(f.identification?.license_plate) ?? unwrapField(f.A) ?? unwrapField(f.fields?.A) ?? "-";
    };

    const getPermisoService = () => {
        const f = fields;
        return unwrapField(f.vehicleCommercial?.service) ?? unwrapField(f.D4) ?? unwrapField(f.fields?.D4) ?? "-";
    };

    const getPermisoCV = () => {
        const f = fields;
        const powerRaw = f.vehicleTechnical?.power_kw?.value ?? f.vehicleTechnical?.power_kw ?? f.P2?.value ?? f.P2 ?? f.fields?.P2?.value;
        if (!powerRaw) return "-";
        const num = parseFloat(toText(powerRaw).replace(",", "."));
        if (isNaN(num) || num === 0) return "-";
        return String(Math.round(num * 1.35962));
    };

    const getPermisoYear = () => {
        const f = fields;
        const bDate = toText(f.identification?.first_registration_date?.value ?? f.B?.value ?? f.B ?? f.fields?.B?.value);
        const iDate = toText(f.identification?.registration_date?.value ?? f.I?.value ?? f.I ?? f.fields?.I?.value);

        const dateStr = bDate !== "-" ? bDate : (iDate !== "-" ? iDate : null);
        if (dateStr) {
            const match = dateStr.match(/\d{4}/);
            if (match) return match[0];
        }

        const plate = toText(getPermisoPlate());
        if (plate !== "-" && plate.match(/^[0-9]{4}[B-Z]{3}$/)) {
            return "EST ORION";
        }
        return "-";
    };

    // Legacy/Ficha path untouched in behavior, only safe rendering defaults.
    const legacyBrand = legacyData.D1 || legacyData.vehicleCommercial?.brand?.value || "-";
    const legacyModel = legacyData.D3 || legacyData.vehicleCommercial?.model?.value || legacyData.vehicleCommercial?.commercial_name?.value || "-";
    const legacyPlate = legacyData.plate ?? legacyData.A ?? legacyData.identification?.license_plate?.value ?? legacyData.identification?.vin?.value ?? "-";
    const legacyService = (legacyData.D4 ?? legacyData.vehicleCommercial?.service?.value) || "-";
    const legacyCV = (legacyData.powerCv || legacyData.P2 || legacyData.vehicleTechnical?.power_kw?.value)
        ? (() => {
            const p = toText(legacyData.powerCv || legacyData.P2 || legacyData.vehicleTechnical?.power_kw?.value);
            const num = parseFloat(p.replace(",", "."));
            return isNaN(num) || num === 0 ? "-" : String(Math.round(num * 1.35962));
        })()
        : "-";
    const legacyYear = (() => {
        const b = toText(legacyData.B || legacyData.identification?.first_registration_date?.value);
        const i = toText(legacyData.I || legacyData?.meta?._debugExtract?.find?.((d: any) => d.key === "I (Fecha Matr.)")?.value);
        const ds = b !== "-" ? b : (i !== "-" ? i : null);
        if (ds) {
            const m = ds.match(/\d{4}/);
            if (m) return m[0];
        }
        // Fallback: estimar año desde matrícula (igual que la tarjeta de detalle)
        const plate = toText(legacyData.plate ?? legacyData.A);
        if (plate !== "-") {
            const est = estimateDate(plate);
            if (est) return String(est.year);
        }
        return "-";
    })();

    return {
        docType: toText(resolvedType || legacyData?.meta?.detected_type || legacyData.CL || legacyData.J),
        plate: toText(isPermiso ? getPermisoPlate() : legacyPlate),
        brand: toText(doc.isMixedPdf ? "-" : (isPermiso ? getPermisoBrand() : legacyBrand)),
        model: toText(doc.isMixedPdf ? "-" : (isPermiso ? getPermisoModel() : legacyModel)),
        service: toText(doc.isMixedPdf ? "-" : (isPermiso ? getPermisoService() : legacyService)),
        cv: doc.isMixedPdf ? "-" : (isPermiso ? getPermisoCV() : legacyCV),
        year: doc.isMixedPdf ? "-" : (isPermiso ? getPermisoYear() : legacyYear)
    };
}

