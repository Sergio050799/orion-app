# ORION — IMPLEMENTATION PLAN

Versión: 1.0
Estado: Plan de ejecución (previo a codificación)
Objetivo: Construir ORION v1 con precisión normativa, cero ambigüedad y validación rápida.

---

## 0. Principios no negociables

1. **Verdad normativa**: ORION solo procesa campos definidos en `itv_master_dictionary.json` y el esquema oficial (Apéndice II).
2. **Sin PDFs almacenados**: El documento original se elimina tras extracción exitosa.
3. **Sin inferencias**: Si un dato no existe en ficha, se almacena `null` y se marca como “no disponible”.
4. **Derivados marcados**: Cualquier cálculo (ej. CV desde P.2) debe marcarse como `DERIVED`.
5. **Validación humana obligatoria**: sin “OK” no hay exportación.
6. **Auditoría completa**: logging obligatorio de acciones clave.
7. **Nodos stateless** (cuando sea posible): lógica determinística, sin estado persistente en la capa de proceso.

---

## 1. Alcance operativo del MVP (ORION v1)

### 1.1 Funcionalidad incluida (end-to-end)

* Registro/Login (Supabase Auth)
* Subida múltiple de PDFs
* Procesamiento OCR (Azure Document Intelligence)
* Extracción y mapeo a campos normativos (schema)
* Normalización y validación
* Vista lista (Core Field Set)
* Vista expandida (“Mostrar todos los campos normativos”)
* Checkbox de confirmación humana
* Export (CSV/JSON)
* Logging/Auditoría

### 1.2 Fuera de alcance v1

* Resolución de “versión exacta” vía catálogos externos (SilverDAT/KM77)
* Motor de tarificación / pricing
* Integraciones con terceros
* 2FA (se deja preparado)

---

## 2. Arquitectura funcional (componentes)

### 2.1 Frontend (UI)

Responsabilidades:

* Login/Logout
* Upload multi-PDF
* Listado de trabajos/procesos (jobs)
* Tabla de resultados (Core)
* Expandir para “Full Schema”
* Confirmación humana
* Exportación

### 2.2 Backend API

Responsabilidades:

* Crear job de procesamiento
* Firmar/gestionar subidas a storage temporal
* Invocar OCR (o delegar a Worker)
* Exponer resultados a UI (por usuario)
* Gestión de export y auditoría
* Reglas de autorización (RBAC)

### 2.3 Worker OCR / Processing

Responsabilidades:

* Enviar PDF a Azure Document Intelligence
* Recibir JSON
* Ejecutar nodos:

  * `FieldExtractionMapper`
  * `CanonicalNormalizer`
* Persistir resultados
* Eliminar PDF tras éxito
* Registrar logs

### 2.4 Base de datos (Supabase)

Responsabilidad:

* Usuarios (Auth)
* Registros canónicos (vehicle_records)
* Jobs/procesos
* Logs/auditoría
* Exports

---

## 3. Flujo End-to-End (Camino del Dato)

### 3.1 Flujo: Upload → OCR → Normalización → UI → Validación → Export

1. **Usuario autenticado** inicia un “Job”
2. Usuario **sube 1..N PDFs**
3. Sistema marca job como `UPLOADED`
4. Worker toma el job:

   * envía PDF a Azure
   * recibe JSON
   * mapea campos normativos (Node 1)
   * normaliza/valida (Node 2)
5. Se persiste:

   * `raw_extraction` (opcional, si se decide guardar)
   * `canonical_vehicle_record` (obligatorio)
6. **Eliminación PDF** (inmediata tras éxito)
7. Job pasa a `READY_FOR_REVIEW`
8. UI muestra:

   * lista Core
   * expandible Full Schema
9. Usuario revisa y marca:

   * `USER_CONFIRMED = true/false`
10. Si confirmado:

* habilita export

11. Export genera archivo y registra log
12. Job pasa a `COMPLETED`

---

## 4. Nodos de lógica (deterministas y auditables)

### Nodo 1 — FieldExtractionMapper

**Input:** JSON Azure Document Intelligence
**Output:** `raw_extraction` (solo campos del schema)

Reglas:

* Solo mapear keys/campos que existan en `itv_master_dictionary.json`.
* Guardar `confidence` si está disponible.
* Nunca “inventar” campos.

Validación mínima:

* Si faltan campos críticos, marcar `needs_review = true` pero nunca bloquear el job.

---

### Nodo 2 — CanonicalNormalizer

**Input:** `raw_extraction`
**Output:** `canonical_vehicle_record`

Incluye:

#### 4.2.1 Normalización de tipos

* numéricos: convertir decimal/comas
* strings: trim, normalización básica OCR
* unidades: según diccionario

#### 4.2.2 Transformaciones DERIVED

* `CV = round(P.2 * 1.35962)`

  * solo si `P.2` existe y es numérico
  * `source="DERIVED"`

#### 4.2.3 Decodificación C.L

* Validar regex `^\d{4}$`
* Separar:

  * construcción = primeros 2
  * utilización = últimos 2
* Lookup en diccionario maestro
* Si inválido: `needs_review = true`

#### 4.2.4 Flags de calidad

* `needs_review = true` si:

  * C.L inválido
  * VIN con longitud inconsistente
  * valores numéricos corruptos en campos críticos (P.2, S.1, V.7)
* Aun así se muestra al usuario (con warning)

---

## 5. UI/UX (sin diseño todavía, solo comportamiento)

### 5.1 Pantallas mínimas

* Login / Register / Reset Password
* Dashboard de Jobs
* Results (tabla)
* Export panel

### 5.2 Tabla Core (prioridad visual)

Columnas:

* Matrícula (si existe)
* VIN (E)
* Marca (D.1)
* Denominación (D.3)
* Plazas (S.1)
* kW (P.2)
* CV (DERIVED)
* C.L (código + construcción/uso)
* Categoría UE (J)
* Fecha matriculación (si existe / future module)

### 5.3 Expandible “Full Schema”

Botón:

* “Mostrar todos los campos normativos”
  Muestra todos los campos que existan (no inventa ausentes).

### 5.4 Confirmación humana

Checkbox obligatorio:

* “Confirmo que he revisado la información y coincide con la ficha”

Sin marcar:

* Export deshabilitado

---

## 6. Seguridad, privacidad y eliminación del PDF

### 6.1 Eliminación del PDF (punto crítico)

Definir el momento exacto:

* Tras recibir JSON OCR válido
* Tras persistir `canonical_vehicle_record`
* Solo entonces: delete del archivo del storage temporal

Si falla procesamiento:

* PDF puede mantenerse temporalmente (TTL corto) para reintento
* y se elimina por política automática (ej. 24h máximo)

### 6.2 Aislamiento por usuario (multi-tenant)

* Row Level Security (RLS) en Supabase
* Cada record vinculado a `user_id`
* Export vinculado a `user_id`

---

## 7. Auditoría (Logging)

Eventos mínimos:

* USER_REGISTERED
* USER_LOGIN
* JOB_CREATED
* FILE_UPLOADED
* OCR_STARTED
* OCR_COMPLETED
* NORMALIZATION_COMPLETED
* PDF_DELETED
* USER_CONFIRMED_TRUE / USER_CONFIRMED_FALSE
* EXPORT_CREATED
* EXPORT_DOWNLOADED

Campos mínimos por log:

* timestamp
* user_id
* job_id
* action
* metadata (json)

---

## 8. Protocolo de Validación (7 días)

### Objetivo

Validar que ORION:

* extrae consistentemente el Core Field Set
* marca correctamente needs_review
* exporta datos coherentes
* cumple eliminación del PDF y logging

### Dataset inicial

* 50 fichas (sintéticas o anonimizadas) variadas

### Métricas mínimas

* % extracción correcta P.2
* % validación correcta C.L (regex + decode)
* % jobs completados sin error
* tiempo medio por ficha
* tasa de `needs_review`

Kill Switch (producto):

* Si tras 60 días no hay 1 cliente de pago → archivar constelación y reciclar Nodos.

---

## 9. Entregables para iniciar el código (siguiente paso)

Tras este documento, se crea:

1. `DATA_MODEL.md` (tablas y columnas)
2. `src/core/` skeleton:

   * extraction/
   * normalization/
   * validators/
   * models/
   * dictionaries/ (ya existe)

---

## 10. Definición de “DONE” (MVP)

ORION v1 se considera listo cuando:

* Usuario puede registrarse y loguearse
* Subir múltiples PDFs
* Obtener tabla Core + expandible Full Schema
* Marcar OK y exportar
* PDF se elimina tras éxito
* Logs se registran correctamente
* Validación 7 días completada con dataset de prueba
