import { FieldValue } from "../permiso/permiso.types";

export interface CarnetConducirRecord {
    // Anverso
    identification: {
        apellidos:          FieldValue<string>;   // campo 1 — puede ocupar 2 líneas
        nombre:             FieldValue<string>;   // campo 2
        fecha_nacimiento:   FieldValue<string>;   // campo 3 — formato DD-MM-YYYY
        pais_nacimiento:    FieldValue<string>;   // campo 3 — misma línea que fecha
        nif:                FieldValue<string>;   // campo 5 — NIF/DNI del titular
    };
    validity: {
        fecha_expedicion:   FieldValue<string>;   // campo 4a — formato DD-MM-YYYY
        fecha_caducidad:    FieldValue<string>;   // campo 4b — formato DD-MM-YYYY
        codigo_autoridad:   FieldValue<string>;   // campo 4c — ej: "28-00"
    };
    categories: {
        lista:              FieldValue<string[]>; // campo 9 — array de códigos: ["AM","B"]
    };
    meta: {
        document_version: "V1";
        detected_type: "CARNET_CONDUCIR";
        warnings: string[];
    };
    // Reverso (V2 — reservado para implementación futura)
    categories_detail?: {
        [categoria: string]: {
            fecha_expedicion: FieldValue<string>; // campo 10 — formato DD.MM.YY
            fecha_caducidad:  FieldValue<string>; // campo 11 — formato DD.MM.YY
            restricciones:    FieldValue<string>; // campo 12
        }
    };
}
