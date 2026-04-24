import { extractPermisoV1 } from './src/core/extractors/permisoExtractor.v1';

const mockAnalyzeResult = {
    pages: [{
        lines: [
            { content: "A 7958MZZ" },
            { content: "B H" }, // Invalid Date token
            { content: "C.1.1 ALDO MARCOS S.L." },
            { content: "D.1 MERCEDES-BENZ" },
            { content: "D.3 VITO TOURER" },
            { content: "E WDF44781513XXXXXX" },
            { content: "D.4 PARTICULAR" }, // Valid service
            { content: "P.2 120" },
            { content: "1ª MATRICULACIÓN 05/02/2020" },
            { content: "VÁLIDO HASTA 05/02/2028" },
            { content: "JEFATURA MADRID" }
        ]
    }]
};

const result = extractPermisoV1(mockAnalyzeResult);

console.log("Plate (A):", result.identification.license_plate.value);
console.log("Date (B):", result.identification.first_registration_date.value);
console.log("Issue Date:", result.identification.issue_date.value);
console.log("Valid Until:", result.identification.validity_until.value);
console.log("Jefatura:", result.identification.issuing_authority.value);
console.log("Brand (D.1):", result.vehicleCommercial.brand.value);
console.log("Titular (C.1.1):", result.holder.full_name.value);
console.log("Service (D.4):", result.vehicleCommercial.service?.value); // Should be PARTICULAR
console.log("Warnings:", result.meta.warnings);
console.log("Debug trace:", JSON.stringify(result.meta.debugSources, null, 2));
