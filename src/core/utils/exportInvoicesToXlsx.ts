import * as XLSX from "xlsx";
import { InvoiceDocumentRecord } from "@/services/financial-service";

export async function exportInvoicesToXlsx(records: InvoiceDocumentRecord[], filename = "Facturas_ORION.xlsx") {
    // 1. Prepare Summary Sheet Data
    const summaryData = records.map(r => {
        const inv = r.invoice;
        const ivaTotal = inv?.taxBreakdown?.some(t => t.kind === "IVA")
            ? inv.taxBreakdown.filter(t => t.kind === "IVA").reduce((sum, t) => sum + t.amount, 0)
            : inv?.taxTotal || 0;

        const irpfTotal = inv?.taxBreakdown?.some(t => t.kind === "IRPF")
            ? inv.taxBreakdown.filter(t => t.kind === "IRPF").reduce((sum, t) => sum + t.amount, 0)
            : 0;

        return {
            "ID Documento": r.id,
            "Archivo": r.fileName,
            "Estado": r.status === 'completed' ? 'Completado' : r.status,
            "Confianza OCR": inv?.confidence ? `${Math.round(inv.confidence * 100)}%` : '—',
            "Proveedor": inv?.vendorName || '—',
            "NIF/CIF": inv?.vendorTaxId || '—',
            "Origen CIF": inv?.taxIdSource || '—',
            "CIF Cliente": inv?.customerTaxId || '—',
            "Fecha Emisión": inv?.issueDate || '—',
            "Nº Factura": inv?.invoiceNumber || '—',
            "Vencimiento": inv?.dueDate || '—',
            "Moneda": inv?.currency || 'EUR',
            "Base Imponible": inv?.subtotal || 0,
            "Total IVA": ivaTotal,
            "Retención IRPF": irpfTotal ? -irpfTotal : 0,
            "Total Factura": inv?.total || 0,
            "Líneas": inv?.lineItems?.length || 0,
            "Páginas Contables": inv?.pagesUsed || '—',
            "Detalle Consumo Ignorado": inv?.hasUsageDetail ? "SÍ" : "NO",
            "Conceptos Resumidos": inv?.lineItemsCollapsed ? "SÍ (+80 limitados en UI)" : "NO",
            "Datos Inferidos Regex": inv?.hasInferredData ? "SÍ" : "NO"
        };
    });

    // 2. Prepare Line Items Sheet Data
    const lineItemsData: any[] = [];
    records.forEach(r => {
        const inv = r.invoice;
        if (inv && inv.lineItems && inv.lineItems.length > 0) {
            inv.lineItems.forEach((item, index) => {
                lineItemsData.push({
                    "Archivo": r.fileName,
                    "Nº Factura": inv.invoiceNumber || '—',
                    "Proveedor": inv.vendorName || '—',
                    "Fecha Emisión": inv.issueDate || '—',
                    "Línea #": index + 1,
                    "Descripción": item.description || '—',
                    "Cantidad": item.quantity ?? '—',
                    "Precio Unitario": item.unitPrice ?? '—',
                    "Impuesto %": item.taxRate ? `${item.taxRate}%` : '—',
                    "Importe Línea": item.amount ?? '—'
                });
            });
        }
    });

    // 3. Create Book and Sheets
    const wb = XLSX.utils.book_new();

    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Resumen Facturas");

    const wsLines = XLSX.utils.json_to_sheet(lineItemsData.length > 0 ? lineItemsData : [{ "Aviso": "No se encontraron líneas de detalle" }]);
    XLSX.utils.book_append_sheet(wb, wsLines, "Líneas de Detalle");

    // Attempt mild column autosize for Summary
    const wscols = [
        { wch: 15 }, // ID
        { wch: 40 }, // Archivo
        { wch: 15 }, // Estado
        { wch: 15 }, // Confianza
        { wch: 35 }, // Proveedor
        { wch: 15 }, // NIF/CIF
        { wch: 15 }, // Fecha
        { wch: 20 }, // Nº Factura
        { wch: 15 }, // Vca
        { wch: 10 }, // Moneda
        { wch: 15 }, // Base
        { wch: 15 }, // Impuestos
        { wch: 15 }, // Total
        { wch: 10 }, // Lineas
    ];
    wsSummary['!cols'] = wscols;

    const wscolsLines = [
        { wch: 40 }, // Archivo
        { wch: 20 }, // Nº Fact
        { wch: 35 }, // Proveedor
        { wch: 15 }, // Fecha
        { wch: 10 }, // Linea #
        { wch: 50 }, // Descripción
        { wch: 12 }, // Cant
        { wch: 15 }, // P.Unit
        { wch: 15 }, // Impuesto
        { wch: 15 }, // Importe
    ];
    if (lineItemsData.length > 0) {
        wsLines['!cols'] = wscolsLines;
    }

    // 4. Trigger Download
    XLSX.writeFile(wb, filename);
}
