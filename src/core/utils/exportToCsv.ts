import { DocumentRecord } from "@/services/document-service";
import { decodeFieldValue, decodeCL } from "@/core/pipelines/ficha_tecnica/dictionary-decoder";
import { estimateDate } from "@/core/_source_of_truth/plates/engine";

export function exportDocumentsToCsv(records: DocumentRecord[], filename: string = "orion_export.csv") {
    if (records.length === 0) return;

    // Headers
    const headers = [
        "Nº",
        "Matrícula",
        "Clase Vehículo",
        "Categoría UE",
        "Marca",
        "Modelo",
        "Carrocería",
        "CV",
        "Año Mat. ORIÓN",
        "Estado",
        "Aprobado",
        "Dcto. Emisión",
        "Bastidor (E)",
        "Combustible"
    ];

    const getDecodedVal = (code: string, rawStr: string | undefined): string => {
        if (!rawStr) return "---";
        const val = decodeFieldValue(code, rawStr);
        return val.includes("No disponible") ? rawStr : val;
    };

    const escapeCsv = (val: unknown) => {
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
    };

    const rows = records.map((doc, i) => {
        const raw = (doc.extractedFields || {}) as Record<string, string | number | null | undefined>;

        let claseText = "---";
        const clDecoded = decodeCL(raw.CL);
        if (clDecoded) {
            claseText = clDecoded.business_label.charAt(0).toUpperCase() + clDecoded.business_label.slice(1).toLowerCase();
        } else if (raw.CL) {
            claseText = String(raw.CL);
        }

        let uCat = "---";
        if (raw.J) {
            const decJ = getDecodedVal("J", raw.J);
            uCat = decJ !== "---" ? decJ.split('.')[0] : raw.J;
        }

        let body = "---";
        if (raw.J1) {
            const decJ1 = getDecodedVal("J.1", raw.J1);
            body = decJ1 !== "---" ? decJ1.split('(')[0].trim() : raw.J1;
        }

        let estYear = "---";
        if (raw.plate) {
            const est = estimateDate(raw.plate);
            if (est) estYear = est.year.toString();
        }

        return [
            (i + 1).toString(),
            raw.plate || "---",
            claseText,
            uCat,
            raw.D1 || "---",
            raw.D3 || "---",
            body,
            raw.powerCv || "---",
            estYear,
            doc.status,
            doc.approved ? "Sí" : "No",
            raw.issueDateRaw || "---",
            raw.E || "---",
            getDecodedVal("P.3", raw.P3 || raw.P1)
        ].map(escapeCsv).join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });

    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
