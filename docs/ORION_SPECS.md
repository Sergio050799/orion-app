# ORION — PRODUCT SPECIFICATION DOCUMENT

Versión: 2.1
Estado: Definición Técnica Formal
Owner: CosmosCore
Confidencialidad: Interno

---

# 1. PROPÓSITO

ORION es un sistema normativo de extracción, normalización y validación de fichas técnicas ITV españolas, basado exclusivamente en el esquema oficial definido en el Apéndice II y estructurado conforme al `itv_master_dictionary.json`.

ORION:

* No interpreta libremente.
* No infiere campos no normativos.
* No almacena documentos originales.
* No inventa valores.
* No sustituye validación humana final.

Convierte:

PDF ITV → JSON normativo estructurado → Registro canónico validable → Exportación auditada.

---

# 2. ALCANCE FUNCIONAL

## 2.1 Autenticación

ORION requiere:

* Registro de usuario
* Login (email + contraseña)
* Gestión de sesión segura (JWT)
* Separación multi-tenant por usuario
* Roles iniciales:

  * Admin
  * Operador

---

## 2.2 Logging Obligatorio

ORION registra:

* Usuario que sube documento
* Timestamp de procesamiento
* Timestamp de validación
* Exportaciones realizadas
* Cambios manuales (si habilitados en futuras versiones)

Logs inmutables y auditables.

---

# 3. FLUJO DEL SISTEMA

## 3.1 INPUT

* Subida múltiple de PDFs
* Tamaño máximo configurable
* Solo formato PDF

Proceso:

1. Envío a Azure AI Document Intelligence
2. Recepción de JSON estructurado
3. Eliminación inmediata del PDF
4. Persistencia solo de datos estructurados

---

# 4. CONTRATO DE DATOS (FUENTE ÚNICA)

Todos los campos soportados se rigen por:

`itv_master_dictionary.json`

El sistema solo reconoce campos definidos en el schema del diccionario.

Cada campo procesado tendrá:

* field_code (ej. P.2)
* label
* type
* unit (si aplica)
* source:

  * OCR
  * DERIVED
  * USER_CONFIRMED
* confidence (si aplica)
* needs_review (boolean)

---

# 5. CORE FIELD SET (MVP OPERATIVO)

Campos prioritarios visibles en UI principal:

1. Matrícula
2. E (VIN)
3. D.1 Marca
4. D.3 Denominación comercial
5. D.2 Tipo/Variante/Versión (si aparece)
6. P.2 Potencia (kW)
7. CV (DERIVED)
8. S.1 Plazas
9. C.L Clasificación (código + interpretación)
10. J Categoría UE
11. V.7 CO2 (si existe)
12. Fecha matriculación (según disponibilidad)

Regla:
Si un campo no aparece en ficha → se deja null.
No se inventa.

---

# 6. FULL SCHEMA COVERAGE

ORION soporta todos los campos definidos en el diccionario, incluidos:

* A.*
* B.*
* C.*
* D.*
* F.*
* G
* J.*
* L
* P.*
* S.*
* V.*

Estos se mostrarán bajo:

“Mostrar todos los campos normativos”

Nunca se descartan datos válidos.

---

# 7. REGLAS DE TRANSFORMACIÓN

## 7.1 Conversión kW → CV

Fuente:
P.2 (kW)

Fórmula:
CV = P.2 × 1.35962
CV = round(CV)

source = DERIVED

---

## 7.2 Interpretación C.L

C.L = 4 dígitos

Estructura:

* Digitos 1–2 → Construcción
* Digitos 3–4 → Utilización

Validación:
Regex: ^\d{4}$

Proceso:

1. Normalización OCR
2. Validación patrón
3. Separación
4. Lookup en diccionario interno:

   * cl_construccion_dict
   * cl_utilizacion_dict

Si inválido:
needs_review = true

---

## 7.3 Fecha Matriculación

Prioridad:

1. Fecha explícita en ficha
2. Si no existe → módulo matrícula + tabla mensual

source = OCR o CALCULATED

---

# 8. NODOS FUNCIONALES

## Nodo 1 — FieldExtractionMapper

Entrada:
JSON Azure DI

Salida:
raw_extraction

* No aplica diccionarios
* Solo mapea campos del schema

---

## Nodo 2 — CanonicalNormalizer

Entrada:
raw_extraction

Salida:
canonical_vehicle_record

Acciones:

* Normaliza tipos
* Aplica diccionarios
* Calcula derivados
* Marca needs_review si falla validación

---

## Nodo 3 — (Futuro) VersionResolver

No incluido en v2.1.

Requiere catálogo externo validado.

---

# 9. INTERFAZ DE USUARIO

## 9.1 Vista Principal (Core)

Tabla con:

* Matrícula
* Marca
* Modelo
* Plazas
* kW
* CV
* Año matriculación
* Construcción (desde C.L)

---

## 9.2 Vista Expandida

Botón:
“Mostrar todos los campos normativos”

Despliega:

Todos los campos soportados del schema.

---

# 10. VALIDACIÓN HUMANA

Antes de exportar:

Checkbox obligatorio:

☐ Confirmo que la información coincide con la ficha original

Sin confirmación:
Export bloqueado.

---

# 11. EXPORTACIÓN

Formatos:

* CSV
* JSON estructurado

Solo datos validados.

---

# 12. SEGURIDAD Y PROTECCIÓN DE DATOS

* No almacenamiento permanente de PDFs
* Arquitectura Zero Trust
* Aislamiento por usuario
* Sin datos sensibles fuera de entorno controlado
* Supabase como capa Auth + DB

---

# 13. MVP VS ESCALA

v2.1 es:

* Producto completo end-to-end
* Normativamente correcto
* Funcionalmente limitado a extracción y normalización

No incluye:

* Motor de pricing
* Scoring
* Integraciones externas
* Automatización de suscripción

---

# 14. PRINCIPIOS INNEGOCIABLES

* Sin ambigüedad
* Sin interpretación libre
* Sin campos inventados
* Sin almacenamiento de documento
* Sin decisiones automáticas sin validación humana

