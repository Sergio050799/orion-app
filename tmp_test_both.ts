import { classifyDocument } from './src/core/documentClassifier';
import { extractPermisoV1 } from './src/core/extractors/permisoExtractor.v1';
import { extractPermisoV2 } from './src/core/extractors/permisoExtractor.v2';

const mockV1 = {
    content: `
  PERMISO DE CIRCULACIÓN
  A 1234ABC
  C.1.1 DOE
  C.1.2 JOHN
  D.1 SEAT
  D.3 IBIZA
  E VSS12345678901234
  P.1 1600
  P.2 80
  P.3 G
  S.1 5
  D.4 PARTICULAR
  `
};

const classV1 = classifyDocument(mockV1);
console.log("CLASSIFICATION V1:", classV1.type);
console.log("EVIDENCE V1:", classV1.evidence);

if (classV1.type === "PERMISO_V1") {
    const extracted = extractPermisoV1(mockV1);
    console.log("V1 TITULAR:", extracted.holder.full_name.value);
    console.log("V1 SERVICE:", extracted.vehicleCommercial.service?.value);
}

const mockV2 = {
    content: `AUTORIZACIÓN PROVISIONAL DE CIRCULACIÓN
Matrícula: 5543KZT
Bastidor: VSS99988877766554
DATOS TÉCNICOS
DATOS GENERALES
Titular: RENTING ENTERPRISE SL
Marca: PEUGEOT
Modelo: 3008
Servicio: ALQUILER SIN CONDUCTOR
Color: GRIS
`
};

const classV2 = classifyDocument(mockV2);
console.log("\nCLASSIFICATION V2:", classV2.type);
console.log("EVIDENCE V2:", classV2.evidence);

if (classV2.type === "PERMISO_V2") {
    const extracted = extractPermisoV2(mockV2);
    console.log("V2 TITULAR:", extracted.holder.full_name.value);
    console.log("V2 SERVICE:", extracted.vehicleCommercial.service?.value);
}
