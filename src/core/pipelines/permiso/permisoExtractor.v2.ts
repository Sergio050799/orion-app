import { createEmptyFieldValue, PermissionCirculationRecord } from "./permiso.types";
import { parseNumberEU, sanitizeVIN, normalizeValue } from "../_shared/formatUtils";

export function extractPermisoV2(analyzeResult: any): PermissionCirculationRecord {
    const record: PermissionCirculationRecord = {
        identification: {
            license_plate: createEmptyFieldValue(),
            vin: createEmptyFieldValue(),
            first_registration_date: createEmptyFieldValue(),
            registration_date: createEmptyFieldValue(),
            issue_date: createEmptyFieldValue(),
            validity_until: createEmptyFieldValue(),
            issuing_authority: createEmptyFieldValue(),
        },
        holder: {
            full_name: createEmptyFieldValue(),
        },
        vehicleCommercial: {
            brand: createEmptyFieldValue(),
            model: createEmptyFieldValue(),
            commercial_name: createEmptyFieldValue(),
            type: createEmptyFieldValue(),
            variant: createEmptyFieldValue(),
            version: createEmptyFieldValue(),
            color: createEmptyFieldValue(),
            service: createEmptyFieldValue(),
            renting: createEmptyFieldValue(),
        },
        vehicleTechnical: {
            fuel_raw: createEmptyFieldValue(),
            engine_displacement_cc: createEmptyFieldValue(),
            power_kw: createEmptyFieldValue(),
            seats: createEmptyFieldValue(),
            max_mass_kg: createEmptyFieldValue(),
            homologation_code: createEmptyFieldValue(),
            max_mass_loaded_kg: createEmptyFieldValue(),
            mass_in_service_kg: createEmptyFieldValue(),
            co2_g_km: createEmptyFieldValue(),
            power_to_weight_ratio: createEmptyFieldValue(),
        },
        meta: {
            document_version: "V2",
            detected_type: "PERMISO_V2",
            warnings: []
        }
    };

    let bestText = "";
    let lines: string[] = [];

    if (analyzeResult?.pages && analyzeResult.pages.length > 0) {
        lines = analyzeResult.pages.flatMap((p: any) => p.lines?.map((l: any) => l.content) || []);
        bestText = lines.join(" \n ");
    } else if (analyzeResult?.content) {
        bestText = analyzeResult.content;
        lines = bestText.split(/\r?\n/);
    }

    if (!bestText) {
        record.meta.warnings.push("No text found for Permiso V2 extraction.");
        return record;
    }

    const upperLines = lines.map(l => l.toUpperCase().replace(/\s+/g, " ").trim()).filter(l => l.length > 0);
    // linesNorm: sin acentos — para matching de regexes robusto contra OCR con/sin tildes
    const linesNorm = lines.map(l => l.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim()).filter(l => l.length > 0);

    const setField = (obj: any, val: string | null, validator?: (v: string) => any) => {
        if (!val || val === "." || val === "—") return;
        if (validator) {
            const res = validator(val);
            if (res.valid) {
                obj.value = res.parsed !== undefined ? res.parsed : val;
                obj.confidence = 0.9;
                obj.status_color = "verde";
            }
        } else {
            obj.value = normalizeValue(val);
            obj.confidence = 0.8;
            obj.status_color = val.length < 3 ? "naranja" : "verde";
        }
    };

    const sanitizeVINWrapper = (v: string) => {
        const res = sanitizeVIN(v);
        if (res.warning) record.meta.warnings.push(res.warning);
        return res;
    };

    const parseNumber = (v: string) => {
        const parsed = parseNumberEU(v);
        return parsed !== null ? { valid: true, parsed } : { valid: false };
    };

    const parseDate = (v: string) => {
        const m = v.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
        return m ? { valid: true, parsed: `${m[1]}/${m[2]}/${m[3]}` } : { valid: false, parsed: v };
    };

    // STOP LABELS to prevent capturing labels as values. Matches case-insensitive and ignores diacritics.
    const STOP_LABELS = [
        "REF", "BASTIDOR", "CILINDRADA", "MATRICULA", "MATRÍCULA", "TITULAR", "JEFATURA", "SERVICIO",
        "RENTING", "COLOR", "PROPULSION", "PROPULSIÓN", "DATOS TECNICOS", "DATOS TÉCNICOS",
        "DATOS GENERALES", "POTENCIA", "CO2", "MASA", "CONTRASEÑA", "BASE", "VARIANTE",
        "VERSION", "VERSIÓN", "TIPO", "MODELO", "MARCA", "VALIDO HASTA", "VÁLIDO HASTA",
        "NIVE", "PROCEDENCIA", "N CVF", "NO CVF", "MARCA BASE", "TIPO BASE", "VARIANTE BASE",
        "VERSION BASE", "CONTRASENA HOMOLOG", "MOM BASE", "PLAZAS DE PIE"
    ];

    const isStopLabel = (str: string) => {
        const normalized = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[:\-]/g, "").trim();
        // Líneas con 4+ palabras son probablemente valores (ej: "JEFATURA PROVINCIAL DE ASTURIAS"), no etiquetas
        if (normalized.split(/\s+/).length >= 4) return false;
        return STOP_LABELS.some(stop => normalized === stop || normalized.startsWith(stop));
    };

    // Helper function for V2 labels reading using lines array
    // linesNorm para matching (sin acentos — robusto contra OCR con/sin tildes)
    // lines para el valor devuelto (texto original sin alterar)
    // valuePattern: regex opcional — si se pasa, el look-ahead salta candidatos que no la cumplen
    // (útil para campos numéricos que tienen texto no numérico en líneas intermedias, ej: cilindrada/GASOLINA)
    const extractLabelValue = (labelVariations: RegExp, validator?: (v: string) => any, valuePattern?: RegExp): string | null => {
        for (let i = 0; i < linesNorm.length; i++) {
            const m = linesNorm[i].match(labelVariations);
            if (m) {
                // Valor en la misma línea
                const inlineRaw = (m[1] || "").trim();
                // OCR de JPG puede usar "." o ";" como separador en vez de ":"
                // Eliminar ruido de puntuación inicial antes de evaluar el valor inline
                const inlineClean = inlineRaw.replace(/^[.;,]\s*/, "").trim();
                if (inlineClean && inlineClean !== ":") {
                    if (!isStopLabel(inlineClean) && (!valuePattern || valuePattern.test(inlineClean))) {
                        return inlineClean;
                    }
                }
                // Formato tabla: label y valor en líneas separadas
                // Look-ahead de hasta 5 líneas — salta labels intermedios (terminan en ":") como "REF:"
                for (let j = i + 1; j < linesNorm.length && j <= i + 5; j++) {
                    const next = linesNorm[j].trim();
                    if (!next) continue;
                    if (next.endsWith(":")) continue; // label intermedio → saltar
                    if (isStopLabel(next)) break;     // valor que parece stop label → parar
                    if (valuePattern && !valuePattern.test(next)) continue; // saltar si no cumple patrón
                    return next;
                }
            }
        }
        return null;
    };

    // --- IDENTIFICACION ---
    // MATRÍCULA — escaneo dedicado: acepta ".", ";" o ":" como separador (OCR de JPG varía)
    // Solo acepta patrón válido de matrícula española en el look-ahead (evita artifacts como "Ret")
    {
        const PLATE_FULL = /^(\d{4}[B-DF-HJ-NP-TV-Z]{3}|[A-Z]{1,2}\d{4}[A-Z]{1,2})$/i;
        const PLATE_INLINE = /\b(\d{4}[B-DF-HJ-NP-TV-Z]{3}|[A-Z]{1,2}\d{4}[A-Z]{1,2})\b/i;
        // Busca "MATRICULA" seguido de separador (no "MATRICULACION" sin separador)
        const matLabelIdx = linesNorm.findIndex(l => /^MATRICULA[.:;]/.test(l) || /^MATR[IÍ]CULA[.:;]/.test(l));
        if (matLabelIdx >= 0) {
            const sameLineRest = linesNorm[matLabelIdx].replace(/^MATR[IÍ]?CULA[.:;]\s*/i, "").trim();
            const inlinePlate = sameLineRest.match(PLATE_INLINE);
            if (inlinePlate) {
                setField(record.identification.license_plate, inlinePlate[1].toUpperCase().replace(/\s/g, ""));
            } else {
                for (let j = matLabelIdx + 1; j <= matLabelIdx + 5 && j < linesNorm.length; j++) {
                    const candidate = linesNorm[j].trim().replace(/\s+/g, "");
                    if (!candidate) continue;
                    if (PLATE_FULL.test(candidate)) {
                        setField(record.identification.license_plate, candidate.toUpperCase());
                        break;
                    }
                }
            }
        }
    }

    const bastidor = extractLabelValue(/(?:BASTIDOR)\s*[:]?\s*(.*)/);
    if (bastidor) setField(record.identification.vin, bastidor, sanitizeVINWrapper);

    // Captura de fecha opcionalizada (*): si la fecha está en la línea siguiente dispara look-ahead
    const fExp = extractLabelValue(/(?:FECHA EXPEDICI[OÓ]N)\s*[.:;]?\s*([\d./\-]*)/);
    if (fExp) setField(record.identification.issue_date, fExp, parseDate);

    const fMat = extractLabelValue(/(?:FECHA MATRICULACI[OÓ]N)\s*[.:;]?\s*([\d./\-]*)/);
    if (fMat) setField(record.identification.first_registration_date, fMat, parseDate);

    const valido = extractLabelValue(/(?:V[AÁ]LIDO HASTA)\s*[.:;]?\s*([\d./\-]*)/);
    if (valido) setField(record.identification.validity_until, valido, parseDate);

    const jefatura = extractLabelValue(/(?:JEFATURA)\s*[:]?\s*(.*)/);
    if (jefatura) setField(record.identification.issuing_authority, jefatura);

    // --- TITULAR ---
    // valuePattern /.{3,}/ descarta valores de 1-2 chars ("E") que son nombres truncados
    // por saltos de línea del OCR — fuerza look-ahead a la línea siguiente con el nombre completo
    const titular = extractLabelValue(/(?:TITULAR)\s*[:]?\s*(.*)/, undefined, /^.{3,}/);
    if (titular) setField(record.holder.full_name, titular);


    // --- COMERCIAL ---
    const marca = extractLabelValue(/^(?:MARCA)\s*[:]?\s*(.*)/);
    if (marca) setField(record.vehicleCommercial.brand, marca);

    let modelo = extractLabelValue(/^(?:MODELO)\s*[.:;]?\s*(.*)/);
    // Si modelo capturó un VIN/bastidor (12+ chars alfanumérico sin espacios), descartar
    if (modelo && /^[A-Z0-9]{12,}$/i.test(modelo.replace(/\s/g, ""))) {
        modelo = null;
    }
    // Fallback JPG: en documentos de imagen el valor de Modelo ("IBIZA") aparece como línea
    // huérfana justo después del valor de Marca, porque el OCR lee la tabla por columnas.
    if (!modelo) {
        const marcaIdx = linesNorm.findIndex(l => /^MARCA\s*[.:;]/.test(l) && !/^MARCA\s+BASE/.test(l));
        if (marcaIdx >= 0) {
            let brandValueIdx = -1;
            for (let j = marcaIdx + 1; j <= marcaIdx + 2 && j < linesNorm.length; j++) {
                if (linesNorm[j] && !linesNorm[j].includes(":") && !linesNorm[j].endsWith(".")) {
                    brandValueIdx = j; break;
                }
            }
            if (brandValueIdx >= 0 && brandValueIdx + 1 < linesNorm.length) {
                const candidate = linesNorm[brandValueIdx + 1];
                if (candidate && !candidate.includes(":") && !candidate.endsWith(".")
                    && !isStopLabel(candidate) && candidate.length >= 2 && candidate.length <= 30
                    && !/^[A-Z0-9]{12,}$/i.test(candidate)) {
                    modelo = candidate;
                }
            }
        }
    }
    if (modelo) setField(record.vehicleCommercial.model, modelo);

    const variante = extractLabelValue(/^(?:VARIANTE)\s*[:]?\s*(.*)/);
    if (variante) setField(record.vehicleCommercial.variant, variante);

    const version = extractLabelValue(/^(?:VERSI[OÓ]N)\s*[:]?\s*(.*)/);
    if (version) setField(record.vehicleCommercial.version, version);

    const tipo = extractLabelValue(/^(?:TIPO)\s*[:]?\s*(.*)/);
    if (tipo) setField(record.vehicleCommercial.type, tipo);

    const color = extractLabelValue(/(?:COLOR)\s*[:]?\s*(.*)/);
    if (color) {
        if (!record.vehicleCommercial.color) record.vehicleCommercial.color = createEmptyFieldValue();
        setField(record.vehicleCommercial.color, color);
    }

    const servicio = extractLabelValue(/(?:SERVICIO)\s*[:]?\s*(.*)/);
    if (servicio) {
        if (!record.vehicleCommercial.service) record.vehicleCommercial.service = createEmptyFieldValue();
        setField(record.vehicleCommercial.service, servicio);
    }

    const renting = extractLabelValue(/(?:RENTING)\s*[:]?\s*(.*)/);
    if (renting) {
        if (!record.vehicleCommercial.renting) record.vehicleCommercial.renting = createEmptyFieldValue();
        setField(record.vehicleCommercial.renting, renting);
    }

    // --- TÉCNICA ---
    const propul = extractLabelValue(/(?:PROPULSI[OÓ]N)\s*[:]?\s*(.*)/);
    if (propul) setField(record.vehicleTechnical.fuel_raw, propul);

    // valuePattern numérico: salta líneas como "GASOLINA" que aparecen entre CILINDRADA: y su valor
    const cilindrada = extractLabelValue(/(?:CILINDRADA)\s*:\s*(.*)/, parseNumber, /^[\d.,\s]+$/);
    if (cilindrada) setField(record.vehicleTechnical.engine_displacement_cc, cilindrada, parseNumber);

    const plazas = extractLabelValue(/(?:PLAZAS)\s*:\s*(.*)/); // colon requerido evita match en "PLAZAS DE PIE:"
    if (plazas) setField(record.vehicleTechnical.seats, plazas, parseNumber);

    const mmkg = extractLabelValue(/(?:MASA M[AÁ]XIMA)\s*(?!EN CARGA|EN CIRCULACIÓN)[:]?\s*([\d.,\s]+)/);
    if (mmkg) {
        if (!record.vehicleTechnical.max_mass_kg) record.vehicleTechnical.max_mass_kg = createEmptyFieldValue();
        setField(record.vehicleTechnical.max_mass_kg, mmkg, parseNumber);
    }

    const mmlLoaded = extractLabelValue(/(?:MASA M[AÁ]XIMA EN CARGA)\s*[:]?\s*([\d.,\s]+)/);
    if (mmlLoaded) {
        if (!record.vehicleTechnical.max_mass_loaded_kg) record.vehicleTechnical.max_mass_loaded_kg = createEmptyFieldValue();
        setField(record.vehicleTechnical.max_mass_loaded_kg, mmlLoaded, parseNumber);
    }

    const minSrv = extractLabelValue(/(?:MASA EN CIRCULACI[OÓ]N)\s*[:]?\s*([\d.,\s]+)/);
    if (minSrv) {
        if (!record.vehicleTechnical.mass_in_service_kg) record.vehicleTechnical.mass_in_service_kg = createEmptyFieldValue();
        setField(record.vehicleTechnical.mass_in_service_kg, minSrv, parseNumber);
    }

    const homologation = extractLabelValue(/(?:CONTRASEÑA HOMOLOGACI[OÓ]N)\s*[:]?\s*(.*)/);
    if (homologation) {
        if (!record.vehicleTechnical.homologation_code) record.vehicleTechnical.homologation_code = createEmptyFieldValue();
        setField(record.vehicleTechnical.homologation_code, homologation);
    }

    const co2 = extractLabelValue(/(?:CO2)\s*[:]?\s*([\d.,\s]+)/);
    if (co2) {
        if (!record.vehicleTechnical.co2_g_km) record.vehicleTechnical.co2_g_km = createEmptyFieldValue();
        setField(record.vehicleTechnical.co2_g_km, co2, parseNumber);
    }

    // PO[TL]ENCIA: el OCR de JPG confunde "t"→"l" → "Polencia" en vez de "Potencia"
    const potKw = extractLabelValue(/(?:PO[TL]ENCIA\s+NETA\s+M[AÁ]XIMA)\s*:\s*(.*)/, parseNumber, /^[\d.,\s]+$/);
    if (potKw) setField(record.vehicleTechnical.power_kw, potKw, parseNumber);

    // Calcular caballos (CV) desde KW si tenemos el valor
    if (record.vehicleTechnical.power_kw.value !== null) {
        const kwVal = typeof record.vehicleTechnical.power_kw.value === 'number'
            ? record.vehicleTechnical.power_kw.value
            : parseFloat(String(record.vehicleTechnical.power_kw.value));
        if (!isNaN(kwVal) && kwVal > 0) {
            record.vehicleTechnical.power_cv = createEmptyFieldValue();
            record.vehicleTechnical.power_cv.value = Math.round(kwVal * 1.36);
            record.vehicleTechnical.power_cv.confidence = 0.95;
            record.vehicleTechnical.power_cv.status_color = "verde";
        }
    }

    const ptwr = extractLabelValue(/(?:RELACI[OÓ]N POTENCIA\/PESO)\s*[:]?\s*([\d.,\s]+)/);
    if (ptwr) {
        if (!record.vehicleTechnical.power_to_weight_ratio) record.vehicleTechnical.power_to_weight_ratio = createEmptyFieldValue();
        setField(record.vehicleTechnical.power_to_weight_ratio, ptwr, parseNumber);
    }

    // --- CAMPOS AUTORIZACIÓN PROVISIONAL: CAMPOS ADICIONALES ---

    // Ref
    const ref = extractLabelValue(/^(?:REF)\s*[:]?\s*(.*)/);
    if (ref && ref.trim().length > 0 && !isStopLabel(ref)) {
        record.identification.ref = createEmptyFieldValue();
        setField(record.identification.ref, ref);
    }

    // Nive (hash electrónico del vehículo — NO es el bastidor)
    const nive = extractLabelValue(/^(?:NIVE)\s*[:]?\s*(.*)/);
    if (nive) {
        record.identification.nive = createEmptyFieldValue();
        setField(record.identification.nive, nive);
    }

    // Procedencia
    const procedencia = extractLabelValue(/(?:PROCEDENCIA)\s*[:]?\s*(.*)/);
    if (procedencia) {
        record.vehicleCommercial.procedencia = createEmptyFieldValue();
        setField(record.vehicleCommercial.procedencia, procedencia);
    }

    // No. CVF
    const cvfRaw = extractLabelValue(/(?:N[º°o]?\.?\s*CVF)\s*[:]?\s*([\d.,]+)/);
    if (cvfRaw) {
        record.vehicleCommercial.no_cvf = createEmptyFieldValue();
        setField(record.vehicleCommercial.no_cvf, cvfRaw, parseNumber);
    }

    // Marca Base (distinto de Marca)
    const marcaBase = extractLabelValue(/^(?:MARCA\s+BASE)\s*[:]?\s*(.*)/);
    if (marcaBase && !isStopLabel(marcaBase)) {
        record.vehicleCommercial.marca_base = createEmptyFieldValue();
        setField(record.vehicleCommercial.marca_base, marcaBase);
    }

    // Tipo Base
    const tipoBase = extractLabelValue(/^(?:TIPO\s+BASE)\s*[:]?\s*(.*)/);
    if (tipoBase && !isStopLabel(tipoBase)) {
        record.vehicleTechnical.tipo_base = createEmptyFieldValue();
        setField(record.vehicleTechnical.tipo_base, tipoBase);
    }

    // Variante Base
    const varianteBase = extractLabelValue(/^(?:VARIANTE\s+BASE)\s*[:]?\s*(.*)/);
    if (varianteBase && !isStopLabel(varianteBase)) {
        record.vehicleTechnical.variante_base = createEmptyFieldValue();
        setField(record.vehicleTechnical.variante_base, varianteBase);
    }

    // Version Base
    const versionBase = extractLabelValue(/^(?:VERSI[OÓ]N\s+BASE)\s*[:]?\s*(.*)/);
    if (versionBase && !isStopLabel(versionBase)) {
        record.vehicleTechnical.version_base = createEmptyFieldValue();
        setField(record.vehicleTechnical.version_base, versionBase);
    }

    // Contraseña Homolog. Base
    const contHomBase = extractLabelValue(/(?:CONTRASE[NÑ]A\s+HOMOLOG[^\s]*\s+BASE)\s*[:]?\s*(.*)/);
    if (contHomBase && !isStopLabel(contHomBase)) {
        record.vehicleTechnical.contrasena_homologacion_base = createEmptyFieldValue();
        setField(record.vehicleTechnical.contrasena_homologacion_base, contHomBase);
    }

    // MOM Base
    const momBase = extractLabelValue(/^(?:MOM\s+BASE)\s*[:]?\s*(.*)/);
    if (momBase && !isStopLabel(momBase)) {
        record.vehicleTechnical.mom_base = createEmptyFieldValue();
        setField(record.vehicleTechnical.mom_base, momBase);
    }

    // Plazas de pie (distinto de "Plazas:" — regex más específico evita colisión)
    const plazasDePie = extractLabelValue(/(?:PLAZAS\s+DE\s+PIE)\s*[:]?\s*(\d{1,2})/);
    if (plazasDePie) {
        if (!record.vehicleTechnical.standing_seats) record.vehicleTechnical.standing_seats = createEmptyFieldValue();
        setField(record.vehicleTechnical.standing_seats, plazasDePie, parseNumber);
    }

    // License Plate Regex Fallback (if missing or invalid like REF:)
    if (!record.identification.license_plate.value || isStopLabel(record.identification.license_plate.value)) {
        const plateRegex = /\b(\d{4}\s?[B-DF-HJ-NP-TV-Z]{3}|[A-Z]{1,2}\s?\d{4}\s?[A-Z]{1,2})\b/i;
        // Buscar directamente en bestText (preserva word boundaries en saltos de línea)
        // No squish con replace(/\s+/g,"") — "Ret8215NJW" perdería el boundary antes de "8215"
        const plateMatch = bestText.match(plateRegex);
        if (plateMatch) {
            record.identification.license_plate.value = plateMatch[1].toUpperCase().replace(/\s/g, "");
            record.identification.license_plate.confidence = 0.6;
            record.identification.license_plate.status_color = "naranja";
            record.meta.warnings.push("Matrícula extraída mediante Regex espacial por fallo de etiqueta principal.");
        }
    }

    // Validation
    if (!record.identification.vin.value || record.identification.vin.value.length !== 17) {
        record.identification.vin.status_color = "rojo";
        record.identification.vin.confidence = 0.5;
        // The sanitizeVIN might have already pushed a warning, avoid double pushing.
        if (!record.meta.warnings.some(w => w.includes("Bastidor"))) {
            record.meta.warnings.push("Bastidor no encontrado o longitud inválida.");
        }
    }
    if (!record.identification.license_plate.value) {
        record.identification.license_plate.status_color = "rojo";
        record.identification.license_plate.confidence = 0.1;
        record.meta.warnings.push("Matrícula no encontrada.");
    }

    // Make sure we never use a string matching "BASE:" for brand
    if (record.vehicleCommercial.brand.value && record.vehicleCommercial.brand.value.includes("BASE:")) {
        record.vehicleCommercial.brand.value = null;
        record.vehicleCommercial.brand.status_color = "rojo";
    }

    return record;
}
