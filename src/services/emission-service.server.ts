import type { CatalogoCandidato, CatalogoVehiculo } from "@/core/catalogo/catalogoDataSource";

export interface EmisionDocumento {
    id: string;
    paginaIndex: number;
    docCategory: 'ficha' | 'permiso' | 'autorizacion';
    docSubtype?: 'moderna' | 'antigua';
    estado: 'pendiente' | 'procesando' | 'completo' | 'error';
    documentRecordId?: string;
    matricula?: string;
    propietario?: string;
    marca?: string;
    modelo?: string;
    tipoDocumento?: string;
    catalogoCandidatos?: CatalogoCandidato[];
    catalogoSeleccionado?: CatalogoVehiculo | null;
    extractedFields?: any;
    error?: string;
}

export interface EmisionRecord {
    id: string;
    numero: number;
    fecha: string;
    estado: 'etiquetando' | 'procesando' | 'completa' | 'error';
    documentos: EmisionDocumento[];
    totalVehiculos: number;
    duplicados: string[];
    resumen: {
        fichas: number;
        permisos: number;
        autorizaciones: number;
    };
}

declare global {
    var _emisionStore: EmisionRecord[] | undefined;
    var _emisionCounter: number | undefined;
}

function getStore(): EmisionRecord[] {
    if (!global._emisionStore) global._emisionStore = [];
    return global._emisionStore;
}

function nextNumero(): number {
    if (!global._emisionCounter) global._emisionCounter = 0;
    return ++global._emisionCounter;
}

export const EmisionService = {
    list(): EmisionRecord[] {
        return [...getStore()].sort((a, b) =>
            new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
        );
    },

    get(id: string): EmisionRecord | null {
        return getStore().find(e => e.id === id) ?? null;
    },

    create(documentos: EmisionDocumento[]): EmisionRecord {
        const record: EmisionRecord = {
            id: crypto.randomUUID(),
            numero: nextNumero(),
            fecha: new Date().toISOString(),
            estado: 'procesando',
            documentos,
            totalVehiculos: 0,
            duplicados: [],
            resumen: {
                fichas: documentos.filter(d => d.docCategory === 'ficha').length,
                permisos: documentos.filter(d => d.docCategory === 'permiso').length,
                autorizaciones: documentos.filter(d => d.docCategory === 'autorizacion').length,
            }
        };
        getStore().unshift(record);
        return record;
    },

    update(id: string, patch: Partial<EmisionRecord>): void {
        const store = getStore();
        const idx = store.findIndex(e => e.id === id);
        if (idx >= 0) store[idx] = { ...store[idx], ...patch };
    },

    updateDocumento(emisionId: string, docId: string, patch: Partial<EmisionDocumento>): EmisionDocumento | null {
        const store = getStore();
        const idx = store.findIndex(e => e.id === emisionId);
        if (idx < 0) return null;
        const docIdx = store[idx].documentos.findIndex(d => d.id === docId);
        if (docIdx < 0) return null;
        store[idx].documentos[docIdx] = { ...store[idx].documentos[docIdx], ...patch };
        return store[idx].documentos[docIdx];
    },

    computeStats(emision: EmisionRecord): void {
        const matriculas = emision.documentos.map(d => d.matricula).filter(Boolean) as string[];
        const duplicados = matriculas.filter((m, i) => matriculas.indexOf(m) !== i);
        emision.totalVehiculos = new Set(matriculas).size;
        emision.duplicados = [...new Set(duplicados)];
    },

    delete(id: string): boolean {
        const store = getStore();
        const idx = store.findIndex(e => e.id === id);
        if (idx < 0) return false;
        store.splice(idx, 1);
        return true;
    },

    deleteDocumento(emisionId: string, docId: string): boolean {
        const store = getStore();
        const idx = store.findIndex(e => e.id === emisionId);
        if (idx < 0) return false;
        const docIdx = store[idx].documentos.findIndex(d => d.id === docId);
        if (docIdx < 0) return false;
        store[idx].documentos.splice(docIdx, 1);
        // Recalcular stats tras borrar el documento
        this.computeStats(store[idx]);
        return true;
    },
};

// Helper: detecta si un valor es un código interno de fabricante
// (ej: "E/D/ YHT2-52E4AN(1E)") en vez de un nombre de modelo legible
export function isInternalCode(val: string): boolean {
    if (!val) return false;
    return /\//.test(val) || /^[A-Z0-9\-]{12,}$/.test(val.replace(/\s+/g, ''));
}

// Helper: extrae campos clave de extractedFields según el tipo de documento
export function extractKeyFields(documentType: string, ef: any): {
    matricula?: string; propietario?: string; marca?: string; modelo?: string;
} {
    if (!ef) return {};

    // Permisos V1/V2 y Autorización: estructura anidada
    if (documentType === 'PERMISO_V1' || documentType === 'PERMISO_V2') {
        return {
            matricula: ef.identification?.license_plate?.value ?? undefined,
            propietario: ef.holder?.full_name?.value ?? undefined,
            marca: ef.vehicleCommercial?.brand?.value ?? undefined,
            modelo: ef.vehicleCommercial?.model?.value ?? undefined,
        };
    }

    // Ficha técnica: D3 tiene preferencia. D2 solo si no es código interno de fabricante.
    const d3 = ef.D3 ?? undefined;
    const d2Raw = ef.D2 ?? undefined;
    const d2 = d2Raw && !isInternalCode(d2Raw) ? d2Raw : undefined;

    return {
        matricula: ef.plate ?? ef.A ?? undefined,
        propietario: undefined, // fichas no tienen titular
        marca: ef.D1 ?? undefined,
        modelo: d3 ?? d2 ?? undefined,
    };
}
