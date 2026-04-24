# ORION — Core Data Contracts (Models)
Version: 1.0
Status: Source of truth for internal types (pre-code)
Scope: Defines the canonical shapes used by ORION core nodes.

> Nota: Este documento define contratos lógicos (tipos/objetos) para que los agentes y el código
> trabajen con estructuras consistentes. El significado de los campos (labels, unidades, etc.)
> viene del `itv_master_dictionary.json`.

---

## 0) Principios

1. **Normative Schema First**  
   - Cualquier campo extraído se referencia por `field_code` (ej. `"P.2"`, `"C.L"`, `"D.1"`).
   - No se crean campos “inventados”. Si no existe en el schema, no existe.

2. **Separación de capas**
   - `RawExtraction`: salida del OCR mapeada (sin diccionarios, sin derivados).
   - `CanonicalVehicleRecord`: registro normalizado + derivados + flags.
   - `FieldValue`: EAV normativo (full schema).
   - `AuditEvent`: log de acciones y trazabilidad.

3. **Derivados explícitos**
   - Campos calculados llevan `source="DERIVED"` y fórmula documentada.

4. **Calidad y revisión**
   - El sistema nunca “bloquea” por falta de datos: marca `needs_review` y sigue.

---

## 1) Tipos base

### 1.1 `UUID`
- Tipo: `string` (formato UUID v4)

### 1.2 `ISODate`
- Tipo: `string` con formato `YYYY-MM-DD`

### 1.3 `ISODateTime`
- Tipo: `string` ISO 8601 con zona (ej. `2026-02-12T10:20:30Z`)

---

## 2) Enumeraciones

### 2.1 `ValueSource`
- `OCR`
- `DERIVED`
- `USER_CONFIRMED`

### 2.2 `JobStatus`
- `CREATED`
- `UPLOADED`
- `PROCESSING`
- `READY_FOR_REVIEW`
- `COMPLETED`
- `FAILED`

### 2.3 `ReviewStatus`
- `PENDING`
- `CONFIRMED_OK`
- `CONFIRMED_NOT_OK`

---

## 3) Objeto: `FieldValue` (Full Schema EAV)

Representa un campo normativo (por `field_code`) con su valor y metadatos.

**Propósito**
- Guardar cualquier campo del schema sin migraciones futuras.
- Permite auditoría (fuente, confianza, revisión).

**Shape**
```json
{
  "field_code": "P.2",
  "label": "Potencia del motor (kW)",
  "unit": "kW",
  "value": {
    "type": "number",
    "number": 74.0
  },
  "source": "OCR",
  "confidence": 0.92,
  "needs_review": false
}
````

**Reglas**

* `field_code` es obligatorio.
* `value.type` ∈ {`string`,`number`,`date`,`boolean`,`null`}
* Solo un valor activo:

  * si `type="number"` entonces `number` no null, el resto null, etc.

**Value union**

```json
{ "type": "string",  "string": "..." }
{ "type": "number",  "number": 123.45 }
{ "type": "date",    "date": "YYYY-MM-DD" }
{ "type": "boolean", "boolean": true }
{ "type": "null" }
```

---

## 4) Objeto: `RawExtraction`

Salida del **Nodo 1 (FieldExtractionMapper)**.

**Propósito**

* Capturar el resultado mapeado desde Azure DI (sin diccionarios, sin derivados).
* Debe ser lo más fiel posible al OCR.

**Shape**

```json
{
  "job_id": "uuid",
  "job_file_id": "uuid",
  "user_id": "uuid",
  "schema_version": "vX.Y",

  "fields": [
    {
      "field_code": "D.1",
      "label": "Marca",
      "unit": null,
      "value": { "type": "string", "string": "FORD" },
      "source": "OCR",
      "confidence": 0.88,
      "needs_review": false
    }
  ],

  "meta": {
    "provider": "azure_document_intelligence",
    "provider_model": "string|null",
    "created_at": "ISODateTime"
  }
}
```

**Reglas**

* `fields[]` solo incluye `field_code` existentes en el diccionario.
* No se añade `CV` aquí (porque es derivado).
* Si un campo no aparece: no se “fuerza”. Simplemente no está o se guarda `null` si tu estrategia lo requiere.
* `confidence` es opcional si Azure no lo entrega.

---

## 5) Objeto: `CanonicalVehicleRecord`

Salida del **Nodo 2 (CanonicalNormalizer)**.

**Propósito**

* Crear un registro canónico estable para UI/consultas rápidas.
* Aplicar diccionarios y derivados.
* Marcar flags de calidad.

**Shape**

```json
{
  "vehicle_record_id": "uuid",
  "user_id": "uuid",
  "job_id": "uuid",
  "job_file_id": "uuid",
  "schema_version": "vX.Y",

  "core": {
    "matricula": "string|null",
    "vin_e": "string|null",
    "marca_d1": "string|null",
    "denominacion_d3": "string|null",
    "tipo_variante_version_d2": "string|null",

    "plazas_s1": 5,

    "kw_p2": 74.0,
    "cv_derived": 101,

    "cl_code": "1000",
    "cl_construccion_code": "10",
    "cl_utilizacion_code": "00",
    "cl_construccion_desc": "Turismo",
    "cl_utilizacion_desc": "Sin especificar",

    "categoria_j": "M1",
    "co2_v7": 120.0,

    "fecha_matriculacion": "YYYY-MM-DD|null",
    "fecha_matriculacion_source": "OCR|CALCULATED|null"
  },

  "quality": {
    "needs_review": false,
    "review_status": "PENDING",
    "warnings": [
      "string"
    ]
  },

  "ui": {
    "core_fields_order": [
      "matricula", "vin_e", "marca_d1", "denominacion_d3",
      "plazas_s1", "kw_p2", "cv_derived", "cl_code", "categoria_j"
    ],
    "full_schema_available": true
  },

  "timestamps": {
    "created_at": "ISODateTime",
    "updated_at": "ISODateTime"
  }
}
```

**Reglas**

* `cv_derived` solo existe si `kw_p2` es numérico válido.
* `cl_*` solo se completa si `cl_code` cumple regex `^\d{4}$`.
* Si falla una validación crítica:

  * `needs_review=true`
  * añadir texto en `warnings[]`
* `full_schema_available=true` si existen `FieldValue` asociados (EAV).

---

## 6) Objeto: `Job`

**Propósito**

* Controlar el batch y su estado.

**Shape**

```json
{
  "job_id": "uuid",
  "user_id": "uuid",
  "status": "UPLOADED",
  "total_files": 3,
  "processed_files": 2,
  "failed_files": 0,
  "created_at": "ISODateTime",
  "updated_at": "ISODateTime"
}
```

---

## 7) Objeto: `AuditEvent`

**Propósito**

* Auditoría inmutable.

**Shape**

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "job_id": "uuid|null",
  "job_file_id": "uuid|null",
  "vehicle_record_id": "uuid|null",
  "action": "OCR_COMPLETED",
  "metadata": { "any": "json" },
  "created_at": "ISODateTime"
}
```

**Acciones mínimas**

* USER_REGISTERED
* USER_LOGIN
* JOB_CREATED
* FILE_UPLOADED
* OCR_STARTED
* OCR_COMPLETED
* NORMALIZATION_COMPLETED
* PDF_DELETED
* USER_CONFIRMED_TRUE
* USER_CONFIRMED_FALSE
* EXPORT_CREATED
* EXPORT_DOWNLOADED

---

## 8) Node Contracts

### 8.1 Node 1: `FieldExtractionMapper`

* Input: `AzureDocumentIntelligencePayload`
* Output: `RawExtraction`

Constraints:

* Only schema fields.
* No derived fields.

### 8.2 Node 2: `CanonicalNormalizer`

* Input: `RawExtraction`
* Output: `CanonicalVehicleRecord` + `FieldValue[]` (normalized + derived)

Constraints:

* Derived fields allowed (CV).
* Dictionary lookups allowed (C.L decode).
* Set `needs_review` when validations fail.

---

## 9) Notes for Agents (Non-negotiable)

* Do not create new field codes.
* All UI labels can be derived from dictionary; code uses `field_code`.
* Any new transformation must be documented in ORION_SPECS and reflected in contracts.
* Deleting PDF is mandatory after successful extraction and persistence.