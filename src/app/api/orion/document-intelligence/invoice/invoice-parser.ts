import { KNOWN_VENDOR_TAX_IDS } from "@/core/utils/vendorRegistry";

export interface PageEvidenceEntry {
    pageIndex: number;
    textPreview: string;
    score: number;
    reasons: string[];
    classification: string;
}

export interface TaxBreakdownEntry {
    kind: string;
    rate: number | null;
    amount: number;
    isWithholding?: boolean;
}

export interface LineItemEntry {
    description: string | null;
    quantity: number | null;
    unitPrice: number | null;
    amount: number | null;
    taxRate?: number | null;
    _pageNumber?: number;
}

export function parseNumber(val: unknown): number | null {
    if (val === null || val === undefined) return null;
    if (typeof val === 'number') return val;
    let s = String(val).trim();
    // Remove currency symbols and spaces
    s = s.replace(/[€$a-zA-Z\s]/g, '');
    // Handle European format "1.234,56" or "1234,56"
    if (s.match(/,\d{1,2}$/)) {
        s = s.replace(/\./g, '').replace(',', '.');
    }
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
}

// Map Azure prebuilt-invoice fields to our internal InvoiceRecord
export function parseAzureInvoice(analyzeResult: any): any { // TODO: K-2 Phase 2 — tipar AzureAnalyzeResult + InvoiceRecord retorno
    const doc = analyzeResult.documents && analyzeResult.documents[0];
    const fields = doc?.fields || {};
    let hasInferredData = false;

    // --- PAGE RELEVANCE SCORING ---
    const pageEvidence: PageEvidenceEntry[] = [];
    let selectedPages: number[] = [];
    let hasUsageDetail = false;

    if (analyzeResult.pages && Array.isArray(analyzeResult.pages)) {
        analyzeResult.pages.forEach((page: { lines?: { content: string }[]; words?: { content: string }[]; pageNumber?: number }, idx: number) => {
            let pageText = "";
            if (page.lines) {
                pageText = page.lines.map((l: { content: string }) => l.content).join(" ");
            } else if (page.words) {
                pageText = page.words.map((w: { content: string }) => w.content).join(" ");
            }
            pageText = pageText.toUpperCase().replace(/\s+/g, ' ');

            let score = 0;
            const reasons: string[] = [];

            // Positive
            if (pageText.includes("TOTAL FACTURA") || pageText.includes("IMPORTE TOTAL")) { score += 5; reasons.push("+5 Total"); }
            if (pageText.includes("BASE IMPONIBLE") || pageText.includes("SUBTOTAL")) { score += 4; reasons.push("+4 Base"); }
            if (pageText.includes(" IVA ") || pageText.includes("I.V.A")) { score += 4; reasons.push("+4 IVA"); }
            if (pageText.includes("VENCIMIENTO") || pageText.includes("FECHA VENCIMIENTO")) { score += 3; reasons.push("+3 Vencimiento"); }
            if (pageText.includes("Nº FACTURA") || pageText.match(/NUMERO\s+FACTURA/) || pageText.match(/FACTURA\s+N/)) { score += 3; reasons.push("+3 Factura"); }
            if (pageText.includes("RESUMEN") || pageText.includes("RESUMEN DE FACTURA") || pageText.includes("RESUMEN POR SERVICIO")) { score += 2; reasons.push("+2 Resumen"); }
            if (pageText.includes("CUOTA") || pageText.includes("TARIFA") || pageText.includes("SERVICIO") || pageText.includes("ENERGÍA")) { score += 2; reasons.push("+2 Conceptos"); }
            if (pageText.match(/(IBERDROLA|VODAFONE|MOVISTAR|ORANGE)/)) { score += 2; reasons.push("+2 Vendor"); }

            // Negative
            if (pageText.includes("DETALLE CONSUMO")) { score -= 8; reasons.push("-8 Detalle Consumo"); }
            if (pageText.includes("DETALLE DE LLAMADAS")) { score -= 8; reasons.push("-8 Detalle Llamadas"); }
            if (pageText.match(/REGISTRO.*DURACI[OÓ]N/) || pageText.includes("Nº LLAMADAS")) { score -= 7; reasons.push("-7 Registro/Duracion"); }
            if (pageText.match(/TEL[EÉ]FONO/) && (pageText.match(/\d{9}/g)?.length || 0) > 10) { score -= 7; reasons.push("-7 Telefono masivo"); }
            if (pageText.match(/TR[AÁ]FICO/) || pageText.match(/DATOS MB/) || pageText.match(/\bGB\b/)) { score -= 6; reasons.push("-6 Datos/Trafico"); }
            if (pageText.includes("ORIGEN") && pageText.includes("DESTINO") && pageText.includes("HORA")) { score -= 6; reasons.push("-6 Origen/Destino"); }

            // Estimate rows
            const approximateRows = page.lines ? page.lines.length : (pageText.length / 50);
            if (approximateRows > 80) { score -= 5; reasons.push("-5 Demasiadas Lineas"); }

            // Digits ratio
            const digitsMatch = pageText.match(/\d/g);
            const digitsRatio = digitsMatch ? digitsMatch.length / (pageText.length || 1) : 0;
            if (digitsRatio > 0.25) { score -= 4; reasons.push("-4 Ratio Digitos"); }

            let classification = "UNKNOWN";
            if (score >= 6) classification = "ACCOUNTING_SUMMARY";
            else if (score <= -4) classification = "USAGE_DETAIL";

            if (classification === "USAGE_DETAIL") hasUsageDetail = true;

            const pageIndex = page.pageNumber || (idx + 1);
            pageEvidence.push({
                pageIndex,
                textPreview: pageText.substring(0, 100),
                score,
                reasons,
                classification
            });
        });

        const accountingPages = pageEvidence.filter(p => p.classification === "ACCOUNTING_SUMMARY").map(p => p.pageIndex);
        const unknownPages = pageEvidence.filter(p => p.classification === "UNKNOWN").map(p => p.pageIndex);

        if (accountingPages.length > 0) {
            selectedPages = accountingPages;
        } else {
            selectedPages = unknownPages;
        }

        if (selectedPages.length === 0) {
            selectedPages = pageEvidence.filter(p => p.score > -4).map(p => p.pageIndex);
            if (selectedPages.length === 0) selectedPages = [1];
        }
    }

    const pagesUsed = selectedPages.join(", ");

    const getValue = (field: any) => field ? (field.valueString || field.valueDate || field.valueNumber || field.content || null) : null;

    // --- EXTRACT FIELDS (Hierarchical + Regex) ---
    const content = analyzeResult.content || "";
    const regexFromContent = (regex: RegExp, group: number = 0) => {
        const match = content.match(regex);
        return match && match[group] ? match[group].trim() : null;
    };

    let vendorName = getValue(fields.VendorName) ??
        getValue(fields.SupplierName) ??
        getValue(fields.CustomerName) ??
        regexFromContent(/(BORCELLE|[A-Z].*S\.L\.|[A-Z].*S\.A\.)/, 1);

    let customerTaxId = getValue(fields.CustomerTaxId) ?? null;

    let vendorTaxId = getValue(fields.VendorTaxId) ?? getValue(fields.SupplierTaxId) ?? null;
    let taxIdSource: "azure_vendor" | "azure_customer" | "regex_context" | "vendor_registry" | "manual" | "unknown" = "unknown";
    let taxIdConfidence = 0;
    let taxIdCandidates: Array<{ value: string; score: number; reason: string; page?: number }> = [];

    if (vendorTaxId) {
        taxIdSource = "azure_vendor";
        taxIdConfidence = 0.9;
    }

    // 2.3 Regex & Context scoring for vendorTaxId if invalid or empty
    if (!vendorTaxId || vendorTaxId === customerTaxId) {
        // Collect text blocks (to maintain page awareness)
        let pageTexts = analyzeResult.pages ? analyzeResult.pages.map((p: { pageNumber?: number; pageIndex?: number; lines?: { content: string }[] }) => ({
            pageIndex: p.pageNumber || p.pageIndex || 1,
            text: p.lines ? p.lines.map((l: { content: string }) => l.content).join(" ") : ""
        })) : [{ pageIndex: 1, text: content }];

        const candidatesMap = new Map<string, any>();

        // standard CIF / NIF Regex
        const cifRegex = /\b([ABCDEFGHJNPQRSUVW]\s*-?\s*\d{7}\s*[0-9A-J])\b/gi;
        const nifRegex = /\b(\d{8}\s*[A-Z])\b/gi;

        pageTexts.forEach((pt: { pageIndex: number; text: string }) => {
            const pageTxt = pt.text.toUpperCase();
            const processMatch = (m: RegExpExecArray) => {
                let rawVal = m[1];
                let val = rawVal.replace(/[\s\-\.]/g, ''); // Normalize A-123 -> A123
                if (!candidatesMap.has(val)) {
                    candidatesMap.set(val, { val, rawVal, index: m.index, pageText: pageTxt, pageIndex: pt.pageIndex, score: 0, reasons: [] });
                }
            };

            let m;
            while ((m = cifRegex.exec(pageTxt)) !== null) processMatch(m);
            while ((m = nifRegex.exec(pageTxt)) !== null) processMatch(m);
        });

        // Score candidates
        for (const candidate of candidatesMap.values()) {
            const { index, pageText } = candidate;
            const windowStart = Math.max(0, index - 150);
            const windowEnd = Math.min(pageText.length, index + 150);
            const context = pageText.substring(windowStart, windowEnd);

            // Positives
            if (context.match(/VODAFONE|WWW\.VODAFONE|VODAFONE\.ES/)) {
                candidate.score += 30;
                candidate.reasons.push("+30 Vendor proximity");
            }
            if (context.match(/C\.I\.F\.|CIF:|CIF\s|NIF:|NIF\s/)) {
                candidate.score += 20;
                candidate.reasons.push("+20 CIF/NIF literal");
            }
            if (!context.match(/TITULAR|CLIENTE|DESTINATARIO|M\.M\.T|SEGUROS/)) {
                candidate.score += 10;
                candidate.reasons.push("+10 No Customer keywords");
            }

            // Negatives
            if (context.match(/TITULAR|CLIENTE|DESTINATARIO/)) {
                candidate.score -= 40;
                candidate.reasons.push("-40 Titular/Cliente literal");
            }
            if (context.match(/M\.?M\.?T\.?|SEGUROS|MUTUA/)) {
                candidate.score -= 30;
                candidate.reasons.push("-30 Customer Name");
            }
            if (context.match(/MADRID|TRAFALGAR|AVENIDA|CALLE|C\//) && !context.match(/VODAFONE|IBERDROLA|ENDESA|NATURGY|ORANGE|TELEFONICA/)) {
                candidate.score -= 25;
                candidate.reasons.push("-25 Customer Address context");
            }
        }

        const sorted = Array.from(candidatesMap.values()).sort((a, b) => b.score - a.score);
        taxIdCandidates = sorted.map(c => ({ value: c.val, score: c.score, reason: c.reasons.join(", "), page: c.pageIndex }));

        const safeCustomerTaxId = customerTaxId ? customerTaxId.replace(/[\s\-\.]/g, '') : null;
        if (sorted.length > 0 && sorted[0].score >= 25 && sorted[0].val !== safeCustomerTaxId) {
            vendorTaxId = sorted[0].rawVal;
            taxIdSource = "regex_context";
            taxIdConfidence = 0.7;
        } else {
            vendorTaxId = null; // nullify to allow manual mode if Azure failed
            taxIdSource = "unknown";
            taxIdConfidence = 0;
        }
    }

    // 2.4 Registry Override (Deterministic)
    if (vendorName) {
        const normalized = vendorName.toUpperCase().replace(/\s/g, '');
        for (const [key, cifs] of Object.entries(KNOWN_VENDOR_TAX_IDS)) {
            if (normalized.includes(key) && cifs.length > 0) {
                vendorTaxId = cifs[1] || cifs[0]; // prefer hyphenated format if available
                taxIdSource = "vendor_registry";
                taxIdConfidence = 1.0;
                break;
            }
        }
    }

    // 1) Guard final
    if (vendorTaxId && customerTaxId && vendorTaxId.replace(/[\-\s]/g, '') === customerTaxId.replace(/[\-\s]/g, '')) {
        vendorTaxId = null;
        if (taxIdSource !== "vendor_registry") {
            taxIdSource = "unknown";
            taxIdConfidence = 0;
        }
    }

    let invoiceNumber = getValue(fields.InvoiceId) ??
        getValue(fields.InvoiceNumber) ??
        regexFromContent(/(N[º°o]\s*[:\-]?\s*[A-Z0-9\-]+)/, 1);

    let issueDate = getValue(fields.InvoiceDate) ??
        getValue(fields.IssueDate) ??
        regexFromContent(/Fecha[:\s]*([0-9]{2}[\/\-][0-9]{2}[\/\-][0-9]{4})/, 1);

    if (typeof issueDate === 'string' && issueDate.includes('/')) {
        const parts = issueDate.split('/');
        if (parts.length === 3 && parts[2].length === 4) {
            issueDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
    }

    let dueDate = getValue(fields.DueDate) ?? regexFromContent(/VENCIMIENTO[:\s]*([0-9]{2}[\/\-][0-9]{2}[\/\-][0-9]{4})/, 1);

    // Safety clean
    if (typeof dueDate === 'string' && dueDate.includes('/')) {
        const parts = dueDate.split('/');
        if (parts.length === 3 && parts[2].length === 4) {
            dueDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
    }

    // Totals
    let subtotal = parseNumber(getValue(fields.SubTotal)) ?? parseNumber(getValue(fields.AmountDue)) ?? parseNumber(regexFromContent(/BASE\s*IMPONIBLE\s*([0-9.,]+)/i, 1));
    let taxTotal = parseNumber(getValue(fields.TotalTax)) ?? parseNumber(getValue(fields.TaxTotal)) ?? parseNumber(regexFromContent(/IVA\s*[0-9]{1,2}%\s*([0-9.,]+)/i, 1));
    let total = parseNumber(getValue(fields.InvoiceTotal)) ?? parseNumber(getValue(fields.Total)) ?? parseNumber(getValue(fields.AmountDue)) ?? parseNumber(regexFromContent(/TOTAL\s*([0-9.,]+)/i, 1));

    let currency = fields.InvoiceTotal?.currencySymbol ?? "EUR";

    let taxBreakdown: TaxBreakdownEntry[] = [];
    const ivaMatches: RegExpMatchArray[] = Array.from(content.matchAll(/IVA\s+(\d+(?:[\.,]\d+)?)\s*%\s*(?:[:\-])?\s*([\d\.,]+)/ig));
    ivaMatches.forEach((match) => {
        taxBreakdown.push({
            kind: "IVA",
            rate: parseNumber(match[1]),
            amount: parseNumber(match[2]) || 0
        });
        hasInferredData = true;
    });

    const irpfMatches: RegExpMatchArray[] = Array.from(content.matchAll(/IRPF\s+(\d+(?:[\.,]\d+)?)\s*%\s*(?:[:\-])?\s*([\d\.,]+)/ig));
    irpfMatches.forEach((match) => {
        taxBreakdown.push({
            kind: "IRPF",
            rate: parseNumber(match[1]),
            amount: parseNumber(match[2]) || 0,
            isWithholding: true
        });
        hasInferredData = true;
    });

    if (!taxTotal && taxBreakdown.length > 0) {
        taxTotal = taxBreakdown.reduce((sum, tax) => sum + (tax.isWithholding ? -tax.amount : tax.amount), 0);
    }

    // --- LINE ITEMS FILTERING ---
    let lineItems: LineItemEntry[] = [];
    if (fields.Items && fields.Items.valueArray) {
        fields.Items.valueArray.forEach((item: any) => {
            const itemFields = item.valueObject;
            if (itemFields) {
                // Find bounding region to get page number if not natively mapped
                let pageNumber = undefined;
                if (item.boundingRegions && item.boundingRegions.length > 0) {
                    pageNumber = item.boundingRegions[0].pageNumber;
                }

                lineItems.push({
                    description: getValue(itemFields.Description) ?? getValue(itemFields.Name) ?? getValue(itemFields.Text),
                    quantity: parseNumber(getValue(itemFields.Quantity)),
                    unitPrice: parseNumber(getValue(itemFields.UnitPrice) ?? getValue(itemFields.Price)),
                    amount: parseNumber(getValue(itemFields.Amount) ?? getValue(itemFields.LineTotal)),
                    taxRate: parseNumber(getValue(itemFields.TaxRate)),
                    _pageNumber: pageNumber
                });
            }
        });
    }

    // Filter Items
    lineItems = lineItems.filter(item => {
        if (!item.amount && !item.unitPrice) return false;

        const desc = item.description?.toUpperCase() || "";
        if (!/[A-Z]/.test(desc)) return false; // Must contain letters

        // Anti-pattern
        if (desc.match(/LLAMADA|DURACI[OÓ]N|MIN|SEG|SMS|\bMB\b|\bGB\b|TR[AÁ]FICO|ROAMING/)) return false;
        if (desc.match(/\b\d{9,}\b/)) return false; // Phone numbers inside desc

        // Page strict
        if (item._pageNumber && !selectedPages.includes(item._pageNumber)) return false;

        return true;
    });

    // --- FALLBACK LINE ITEMS (Telco / Utilities) ---
    if (lineItems.length === 0 || lineItems.every(li => li.amount === null || li.amount === 0)) {
        let fallbackItems: LineItemEntry[] = [];

        // Use text ONLY from selected pages
        const selectedTextBlocks = analyzeResult.pages
            ? analyzeResult.pages.filter((p: { pageNumber?: number; pageIndex?: number }) => selectedPages.includes(p.pageNumber || p.pageIndex || 0)).map((p: { lines?: { content: string }[] }) => p.lines ? p.lines.map((l: { content: string }) => l.content).join('\n') : "").join('\n')
            : content;

        const lines = selectedTextBlocks.split('\n');

        // Regex for CUOTA / SERVICIOS (Telco / utilities standard)
        // Matches "Cuota mensual algo 12.30"
        const cuotaRegex = /(?:CUOTA|TARIFA|SERVICIO|INFINITY|BUSINESS|ATENCI[OÓ]N|ENERG[IÍ]A|CARGOS|ALQUILER|IMPUESTO)[a-zA-Z\s\-\.]+\s+([0-9]+[.,][0-9]{2})\b/gi;

        let m;
        while ((m = cuotaRegex.exec(selectedTextBlocks)) !== null) {
            fallbackItems.push({
                description: m[0].substring(0, m[0].lastIndexOf(m[1])).trim(),
                quantity: 1,
                unitPrice: parseNumber(m[1]),
                amount: parseNumber(m[1])
            });
            hasInferredData = true;
        }

        // Standard fallback if nothing else
        if (fallbackItems.length === 0) {
            const lineRegex = /(.+?)\s+([0-9]+)\s+([0-9.,]+)\s+([0-9.,]+)/;
            for (const line of lines) {
                const match = line.match(lineRegex);
                if (match && /[A-Z]/i.test(match[1])) {
                    fallbackItems.push({
                        description: match[1].trim(),
                        quantity: parseNumber(match[2]),
                        unitPrice: parseNumber(match[3]),
                        amount: parseNumber(match[4])
                    });
                    hasInferredData = true;
                }
            }
        }

        if (fallbackItems.length > 0) {
            lineItems = fallbackItems;
        }
    }

    // Clean internal props
    lineItems.forEach(item => delete item._pageNumber);

    let lineItemsCollapsed = false;
    if (lineItems.length > 80) {
        lineItemsCollapsed = true;
    }

    const confidence = doc?.confidence ?? 0.99;

    return {
        vendorName,
        vendorTaxId,
        invoiceNumber,
        issueDate,
        dueDate,
        currency,
        subtotal,
        taxTotal,
        total,
        taxBreakdown,
        lineItems,
        notes: null,
        confidence,
        hasInferredData,
        pageEvidence,
        selectedPages,
        hasUsageDetail,
        lineItemsCollapsed,
        pagesUsed,
        customerTaxId,
        taxIdSource,
        taxIdConfidence,
        taxIdCandidates
    };
}
