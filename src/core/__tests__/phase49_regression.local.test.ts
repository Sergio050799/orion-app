declare const test: any;
declare const describe: any;
declare const it: any;
declare const expect: any;

import { classifyDocument } from '../router/documentClassifier';
import { getTableMapping } from '../pipelines/_shared/ocrTableMapper';
import { DocumentRecord } from '../../services/document-service';
import fs from 'fs';
import path from 'path';

describe('Phase 49 - Regression Tests', () => {

    describe('Document Classification (documentClassifier.ts)', () => {
        test('Should classify as FICHA_TECNICA when key terms are present', () => {
            const mockResult = {
                content: "TARJETA ITV CONTRASEÑA DE HOMOLOGACIÓN CLASE VEHICULO",
                pages: [{ lines: [{ content: "TARJETA ITV" }, { content: "HOMOLOGACIÓN" }] }]
            };
            const rawResult = classifyDocument(mockResult);
            // Determinstic routing should not fall back to permissions
            expect(rawResult.type).toBe('FICHA_TECNICA');
            expect(rawResult.confidence).toBeGreaterThan(0.5);
        });

        test('Should classify as PERMISO_V1 when D.1, C.1, A are present', () => {
            const mockResult = {
                content: "PERMISO DE CIRCULACIÓN C.1.1 D.1 A 1234BBB",
                pages: [{ lines: [{ content: "C.1.1" }, { content: "D.1" }, { content: "PERMISO" }] }]
            };
            const rawResult = classifyDocument(mockResult);
            // We assert deterministic routing properties without mapOcrToPermisoFormat
            expect(rawResult.type).toBe('PERMISO_V1');
        });

        test('Should return UNKNOWN when no strong indicators are present', () => {
            const mockResult = {
                content: "HELLO WORLD THIS IS A RANDOM DOCUMENT",
                pages: [{ lines: [{ content: "HELLO WORLD" }] }]
            };
            const classification = classifyDocument(mockResult);
            expect(classification.type).toBe('UNKNOWN');
        });
    });

    describe('Table Mapping (ocrTableMapper.ts)', () => {
        test('Should map PERMISO_V1 fields correctly using extractedFields', () => {
            const mockDoc: any = {
                id: 'test-1',
                documentType: 'PERMISO_V1',
                extractedFields: {
                    identification: {
                        license_plate: { value: '1234BBB' },
                        registration_date: { value: '01-01-2025' }
                    },
                    vehicleCommercial: {
                        brand: { value: 'TOYOTA' },
                        model: { value: 'PROACE MAX' },
                        service: { value: 'ALQUILER SIN CONDUCTOR' }
                    },
                    vehicleTechnical: {
                        power_kw: { value: '100' }
                    }
                }
            };

            const mapping = getTableMapping(mockDoc as DocumentRecord);
            expect(mapping.plate).toBe('1234BBB');
            expect(mapping.brand).toBe('TOYOTA');
            expect(mapping.model).toBe('PROACE MAX');
            expect(mapping.service).toBe('ALQUILER SIN CONDUCTOR');
            expect(mapping.cv).toBe('136'); // 100 * 1.35962 = 135.9 -> 136
            expect(mapping.year).toBe('2025');
        });

        test('Should maintain FICHA_TECNICA isolation using legacy data', () => {
            const mockDoc: any = {
                id: 'test-ficha',
                documentType: 'FICHA_TECNICA',
                extractedFields: {
                    D1: 'FORD',
                    D3: 'FOCUS',
                    A: '5555CCC',
                    P2: '80',
                    B: '20-10-2020'
                }
            };

            const mapping = getTableMapping(mockDoc as DocumentRecord);
            expect(mapping.brand).toBe('FORD');
            expect(mapping.plate).toBe('5555CCC');
            expect(mapping.cv).toBe('109'); // 80 * 1.35962 = 108.7 -> 109
            expect(mapping.year).toBe('2020');
        });
    });
});
