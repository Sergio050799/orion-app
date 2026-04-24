import { CarnetConducirRecord } from "./carnet.types";
import { FieldValue, createEmptyFieldValue } from "../permiso/permiso.types";

// ─── Categorías válidas UE (campo 9) ────────────────────────────────────────
const VALID_CATEGORIES = new Set([
    "AM", "A1", "A2", "A", "B1", "B", "BE",
    "C1", "C1E", "C", "CE", "D1", "D1E", "D", "DE"
]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normLine(s: string): string {
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

function getLines(analyzeResult: any): string[] {
    if (analyzeResult?.pages?.length > 0) {
        return analyzeResult.pages.flatMap((p: any) => p.lines?.map((l: any) => l.content) || []);
    }
    if (analyzeResult?.content) {
        return analyzeResult.content.split(/\r?\n/);
    }
    return [];
}

function makeField<T>(val: T | null): FieldValue<T> {
    if (val === null || val === undefined || (Array.isArray(val) && val.length === 0)) {
        return createEmptyFieldValue<T>();
    }
    return { value: val, confidence: 0.9, status_color: "verde", source: "ocr" };
}

// ─── Identity Field Map ───────────────────────────────────────────────────────
// Diseño escalable: el DNI futuro solo necesita un mapa distinto pasado a extractIdentityDoc.

interface IdentityFieldDef {
    key: string;
    pattern: RegExp;
    postProcess?: (m: RegExpMatchArray, linesNorm: string[], i: number) => string | null;
    extraUsedLines?: (m: RegExpMatchArray, linesNorm: string[], i: number) => number[];
}

/**
 * Extractor genérico de documento de identidad.
 * Recibe las líneas OCR normalizadas (NFD) y un mapa de campos.
 * Retorna result (clave → valor) y usedIndices (líneas consumidas).
 */
function extractIdentityDoc(
    linesNorm: string[],
    fieldMap: IdentityFieldDef[]
): { result: Record<string, string | null>; usedIndices: Set<number> } {
    const result: Record<string, string | null> = {};
    const usedIndices = new Set<number>();

    for (const field of fieldMap) {
        result[field.key] = null;
        for (let i = 0; i < linesNorm.length; i++) {
            const m = linesNorm[i].match(field.pattern);
            if (m) {
                usedIndices.add(i);
                if (field.extraUsedLines) {
                    for (const idx of field.extraUsedLines(m, linesNorm, i)) {
                        usedIndices.add(idx);
                    }
                }
                if (field.postProcess) {
                    result[field.key] = field.postProcess(m, linesNorm, i);
                } else {
                    result[field.key] = (m[1] || "").trim() || null;
                }
                break;
            }
        }
    }

    return { result, usedIndices };
}

// ─── Mapa de campos — Carnet de Conducir ─────────────────────────────────────

const CARNET_FIELD_MAP: IdentityFieldDef[] = [
    {
        key: "apellidos",
        pattern: /^\s*1[\s.]+(.+)/,
        extraUsedLines: (_m, linesNorm, i) => {
            if (i + 1 < linesNorm.length) {
                const next = linesNorm[i + 1].trim();
                if (next && !/^\s*\d+[\s.]/.test(next) && !/^\d{2}-\d{2}-\d{4}/.test(next)) {
                    return [i + 1];
                }
            }
            return [];
        },
        postProcess: (m, linesNorm, i) => {
            let value = m[1].trim();
            // Apellidos compuestos pueden ocupar 2 líneas OCR
            if (i + 1 < linesNorm.length) {
                const next = linesNorm[i + 1].trim();
                // La siguiente línea es continuación si no empieza con código numérico
                if (next && !/^\s*\d+[\s.]/.test(next) && !/^\d{2}-\d{2}-\d{4}/.test(next)) {
                    value = `${value} ${next}`.trim();
                }
            }
            return value || null;
        }
    },
    {
        key: "nombre",
        pattern: /^\s*2[\s.]+(.+)/
    },
    {
        key: "fecha_nacimiento",
        pattern: /^\s*3[\s.]+(\d{2}\s*[-./]\s*\d{2}\s*[-./]\s*\d{2,4})/,
        postProcess: (m) => {
            const raw = (m[1] || "").trim();
            return raw ? raw.replace(/\s*[-./]\s*/g, "-") : null;
        }
    },
    {
        // Estrategia A: fecha + país en la misma línea ("3. 15-04-1985  ESPAÑA")
        // Estrategia B: país en línea suelta — se resuelve con segundo pase post-extracción
        key: "pais_nacimiento",
        pattern: /^\s*3[\s.]+\d{2}\s*[-./]\s*\d{2}\s*[-./]\s*\d{2,4}\s{2,}(.+)/,
        postProcess: (m) => {
            const inline = m[1]?.trim();
            return inline || null;
        }
    },
    {
        // 4a y 4c en la misma línea: "4a. 29-06-2018   4c. 28-00"
        // Separador opcional — OCR puede producir "4a.29-06-2018" o "4a.17 - 12 - 2021" con espacios
        key: "fecha_expedicion",
        pattern: /\b4\s*[aA][.\s]*(\d{2}\s*[-./]\s*\d{2}\s*[-./]\s*\d{2,4})/,
        postProcess: (m) => {
            const raw = (m[1] || "").trim();
            return raw ? raw.replace(/\s*[-./]\s*/g, "-") : null;
        }
    },
    {
        key: "codigo_autoridad",
        pattern: /\b4\s*[cC][\s.]+(\d{2}-\d{2})\b/
    },
    {
        key: "fecha_caducidad",
        pattern: /\b4\s*[bB][\s.]+(\d{2}-\d{2}-\d{4})/
    },
    {
        // DNI: 12345678Z | 12345678-Z | 12345678 Z
        // NIE: X1234567Z | X-1234567-Z | X 1234567 Z (X, Y, Z inicial)
        key: "nif",
        pattern: /^\s*5[\s.]+([XYZxyz][-\s]?\d{7}[-\s]*[A-Z]|\d{8}[-\s]*[A-Z])/,
        postProcess: (m) => {
            const raw = (m[1] || "").trim();
            return raw ? raw.replace(/[-\s]/g, "").toUpperCase() : null;
        }
    },
    {
        key: "categorias",
        pattern: /^\s*9[\s.]+(.+)/,
        postProcess: (m) => {
            const tokens = m[1].toUpperCase().split(/\s+/);
            const valid = tokens.filter(t => VALID_CATEGORIES.has(t));
            return valid.length > 0 ? valid.join(" ") : null;
        }
    }
];

// ─── Extractor público ────────────────────────────────────────────────────────

export function extractCarnet(analyzeResult: any): CarnetConducirRecord {
    const lines = getLines(analyzeResult);
    const linesNorm = lines.map(normLine).filter(l => l.length > 0);

    const { result: raw, usedIndices } = extractIdentityDoc(linesNorm, CARNET_FIELD_MAP);

    const categoriasArr = raw.categorias ? raw.categorias.split(" ") : [];

    const record: CarnetConducirRecord = {
        identification: {
            apellidos:        makeField(raw.apellidos),
            nombre:           makeField(raw.nombre),
            fecha_nacimiento: makeField(raw.fecha_nacimiento),
            pais_nacimiento:  makeField(raw.pais_nacimiento),
            nif:              makeField(raw.nif),
        },
        validity: {
            fecha_expedicion: makeField(raw.fecha_expedicion),
            fecha_caducidad:  makeField(raw.fecha_caducidad),
            codigo_autoridad: makeField(raw.codigo_autoridad),
        },
        categories: {
            lista: makeField<string[]>(categoriasArr.length > 0 ? categoriasArr : null),
        },
        meta: {
            document_version: "V1" as const,
            detected_type: "CARNET_CONDUCIR" as const,
            warnings: []
        }
    };

    // Segundo pase — pais_nacimiento: línea suelta solo letras mayúsculas
    if (!record.identification.pais_nacimiento?.value) {
        const EXCLUDE = new Set([
            "PERMISO DE CONDUCCION",
            "PERMISO DE CONDUCCION REINO DE ESPANA",
            "REINO DE ESPANA"
        ]);
        const countryLine = linesNorm.find((l, idx) => {
            if (usedIndices.has(idx)) return false;
            const clean = l.trim();
            return (
                /^[A-Z\s]{3,}$/.test(clean) &&
                !EXCLUDE.has(clean) &&
                !/^\d/.test(clean) &&
                !clean.match(/^\d*[a-zA-Z][.\s]/)
            );
        });
        if (countryLine) {
            record.identification.pais_nacimiento = makeField(countryLine.trim());
        }
    }

    // EXTRACTION_FAILED si todos los campos obligatorios son null
    const mandatoriesOk = [
        record.identification.apellidos.value,
        record.identification.nombre.value,
        record.validity.fecha_caducidad.value,
        record.identification.nif.value,
    ].some(v => v !== null);

    if (!mandatoriesOk) {
        throw new Error("EXTRACTION_FAILED: Carnet clasificado pero no se encontraron campos obligatorios (apellidos, nombre, fecha_caducidad, nif).");
    }

    return record;
}
