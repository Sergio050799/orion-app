declare const describe: any;
declare const test: any;
declare const it: any;
declare const expect: any;

import { extractPermisoV1 } from '../../pipelines/permiso/permisoExtractor.v1';
import { PermissionCirculationRecord } from '../../pipelines/permiso/permiso.types';
import * as path from 'path';

describe('Permiso V1 Extractor Local Verification', () => {
    it('Should correctly extract holder, avoid B fallback to I, clean observations, and populated D models', async () => {
        // Mocking a perfect raw text simulating Azure OCR layout output but strictly local
        const mockOcrText = `
PERMISO DE CIRCULACIÓN
A 0000XXX
B 
I 10-05-2024
I.2 11-05-2024
C.1.1 APELLIDOS DE PRUEBA
C.1.2 NOMBRE PRUEBA
C.4 c
D.1 MERCEDES-BENZ
D.2 TIPO X
D.3 VITO TOURER
D.4 FURGONETA
F.1 3000
OBSERVACIONES:
C.1.1
D.1
MO
Próxima ITV: 10-05-2028
Documento válido
        `;

        const result = extractPermisoV1(mockOcrText);

        expect(result).toBeDefined();

        // Assert A
        expect(result.identification.license_plate?.value).toBe("0000XXX");

        // Assert Dates: B empty, I populated
        expect(result.identification.first_registration_date?.value).toBeFalsy();
        expect(result.identification.registration_date?.value).toBe("10-05-2024");
        expect(result.identification.issue_date?.value).toBe("11-05-2024");

        // Assert Holder Full (Persona Física = C.1.2 + C.1.1)
        expect(result.holder.full_name?.value).toBe("NOMBRE PRUEBA APELLIDOS DE PRUEBA");

        // Assert Commercial Fields
        expect(result.vehicleCommercial.brand?.value).toBe("MERCEDES-BENZ");
        expect(result.vehicleCommercial.type?.value).toBe("TIPO X");
        expect(result.vehicleCommercial.commercial_name?.value).toBe("VITO TOURER");
        expect(result.vehicleCommercial.service?.value).toBe("FURGONETA");

        // Assert Observations (Cleaned of C.1.1, D.1, MO)
        const obsClean = result.observations?.value;
        expect(obsClean).toContain("Próxima ITV: 10-05-2028");
        expect(obsClean).toContain("Documento válido");
        expect(obsClean).not.toContain("C.1.1");
        expect(obsClean).not.toContain("MO"); // Should have been stripped

        // Next ITV natively extracted
        expect(result.next_itv?.value).toBe("10-05-2028");
    });
});
