declare const describe: any;
declare const test: any;
declare const it: any;
declare const expect: any;

import { extractPermisoV1 } from '../../pipelines/permiso/permisoExtractor.v1';

const mockOcrText = `
PERMISO DE CIRCULACIÓN
A 1234BCD
B 15-05-2018
C.1.1 GARZON BAQUERO
C.1.2 FREDY ALEXANDER
C.1.3 C/ MOCLIN 15
C.4 12345678Z
D.1 RENAULT
D.3 MEGANE
D.4 PARTICULAR
E VF123456789012345
F.1 1800
P.1 1500
P.2 80.0
S.1 5
I 15-05-2018
I.2 20-05-2018
OBSERVACIONES:
Documento válido si acompaña ITV en vigor
C.1.1
Próxima ITV: 14-04-2026
D.1
D.4
Opcional de fábrica
`;

const mockAnalyzeResult = {
    content: mockOcrText,
    pages: [{
        lines: mockOcrText.split('\n').filter(l => l.trim()).map(l => ({ content: l.trim() }))
    }]
};

async function runTest() {
    console.log("Running Permiso V1 local smoke test...");
    const record = extractPermisoV1(mockAnalyzeResult);

    // Assert 1: Holder Full Name
    const holder = record.holder.full_name?.value;
    if (holder !== "FREDY ALEXANDER GARZON BAQUERO C/ MOCLIN 15") {
        throw new Error(`Titular was incorrect. Expected 'FREDY ALEXANDER GARZON BAQUERO C/ MOCLIN 15', got '${holder}'`);
    } else {
        console.log("✅ Titular (Persona) correctly extracted:", holder);
    }

    // Assert 2: Observations Clean
    const obs = record.observations?.value || "";
    if (obs.includes("C.1.1") || obs.includes("D.1") || obs.includes("D.4")) {
        throw new Error(`Observations were not cleaned properly. Got: \n${obs}`);
    } else if (!obs.includes("Documento válido si acompaña ITV en vigor")) {
        throw new Error(`Observations missing valid text. Got: \n${obs}`);
    } else {
        console.log("✅ Observaciones correctly cleaned:\n" + obs);
    }

    // Assert 3: Fechas
    const firstReg = record.identification.first_registration_date?.value;
    if (firstReg !== "15-05-2018") {
        throw new Error(`Primera Matriculacion B was incorrect. Got: ${firstReg}`);
    } else {
        console.log("✅ Primera Matriculacion B correct:", firstReg);
    }

    const regI = record.identification.registration_date?.value;
    if (regI !== "15-05-2018") throw new Error(`Registration Date I incorrect. Got: ${regI}`);
    console.log("✅ Fecha Matr. I correct:", regI);

    const issueI2 = record.identification.issue_date?.value;
    if (issueI2 !== "20-05-2018") throw new Error(`Issue Date I.2 incorrect. Got: ${issueI2}`);
    console.log("✅ Fecha Emision I.2 correct:", issueI2);

    const nextItv = record.next_itv?.value;
    if (nextItv !== "14-04-2026") {
        throw new Error(`Próxima ITV was incorrect. Got: ${nextItv}`);
    } else {
        console.log("✅ Próxima ITV correct:", nextItv);
    }

    // Assert 4: Table Mappings
    if (record.identification.license_plate?.value !== "1234BCD") throw new Error("Plate (A) missing");
    if (record.vehicleCommercial.brand?.value !== "RENAULT") throw new Error("Brand (D.1) missing");
    if (record.vehicleCommercial.commercial_name?.value !== "MEGANE") throw new Error("Model (D.3) missing. Got: " + record.vehicleCommercial.commercial_name?.value);
    if (record.vehicleTechnical.power_kw?.value !== 80) throw new Error("Power kW (P.2) missing");

    console.log("✅ Base fields (A, D.1, D.3, P.2) perfectly extracted.");

    // Assert 5: Company Test
    const companyMock = {
        content: `C.1.1 TRANSPORTES SA\nC.1.3 AV MADRID 10`,
        pages: [{ lines: [{ content: `C.1.1 TRANSPORTES SA` }, { content: `C.1.3 AV MADRID 10` }] }]
    };
    const companyRecord = extractPermisoV1(companyMock);
    if (companyRecord.holder.full_name?.value !== "TRANSPORTES SA AV MADRID 10") {
        throw new Error(`Company holder extracted incorrectly. Got ${companyRecord.holder.full_name?.value}`);
    } else {
        console.log("✅ Titular (Empresa) correctly extracted:", companyRecord.holder.full_name?.value);
    }

    // Assert 6: Strict Date Isolation Test
    const noBMock = {
        content: `PERMISO DE CIRCULACION\nA 1234BCD\nI 12-12-2020\nI.2 13-12-2020`,
        pages: [{ lines: [{ content: 'PERMISO DE CIRCULACION' }, { content: 'A 1234BCD' }, { content: 'I 12-12-2020' }, { content: 'I.2 13-12-2020' }] }]
    };
    const noBRecord = extractPermisoV1(noBMock);
    if (noBRecord.identification.first_registration_date?.value) {
        throw new Error(`B was extracted when it didn't exist! Value: ${noBRecord.identification.first_registration_date?.value}`);
    }
    if (noBRecord.identification.registration_date?.value !== "12-12-2020") throw new Error("I extracted incorrectly");
    console.log("✅ Strict Date Separation correctly extracted (No B, Only I).");

    console.log("🎉 All Permiso V1 Smoke Tests Passed!");
}

runTest().catch(e => {
    console.error(e.message);
    const fs = require('fs');
    fs.writeFileSync('smoke_err.txt', e.stack);
});
