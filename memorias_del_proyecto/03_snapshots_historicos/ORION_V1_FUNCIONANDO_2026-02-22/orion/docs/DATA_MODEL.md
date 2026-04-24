# ORION — DATA MODEL (Supabase/Postgres)
Version: 1.0
Status: Baseline (Designed for long-term extensibility)
Scope: ORION v1 (Core + Full Schema + Audit)

---

## 0) Design Principles

1. **Truth Source**: Field semantics come from `itv_master_dictionary.json`.
2. **No PDF Persistence**: PDFs are never stored long-term. Only structured data + logs.
3. **Hybrid Storage**:
   - Core fields stored as typed columns for performance.
   - Full schema stored as EAV rows by `field_code` for extensibility and audit.
4. **Auditability**: Every critical user/system action is logged.
5. **Multi-tenant by design**: Every row is owned by `user_id` and protected by RLS.
6. **Schema versioning**: Records include `schema_version` matching the dictionary version.

---

## 1) Entity Overview

- **jobs**: A processing batch initiated by a user upload (can include multiple PDFs).
- **job_files**: Each uploaded PDF (ephemeral storage reference + deletion status).
- **vehicle_records**: Canonical vehicle record (Core fields + flags).
- **vehicle_field_values**: Full schema values (EAV) keyed by `field_code`.
- **ocr_raw_payloads** (optional but recommended): Raw JSON from Azure DI for trace/debug.
- **audit_logs**: Immutable actions log.
- **exports**: Export requests and generated artifacts metadata.

---

## 2) Enumerations

### 2.1 Job Status
- `CREATED`
- `UPLOADED`
- `PROCESSING`
- `READY_FOR_REVIEW`
- `COMPLETED`
- `FAILED`

### 2.2 Value Source
- `OCR`
- `DERIVED`
- `USER_CONFIRMED`

### 2.3 Review Status
- `PENDING`
- `CONFIRMED_OK`
- `CONFIRMED_NOT_OK`

---

## 3) Tables

> Note: `auth.users` is managed by Supabase Auth.
> All business tables include `user_id uuid not null` referencing `auth.users(id)`.

---

### 3.1 `jobs`

Represents a user-initiated processing batch.

**Columns**
- `id uuid pk`
- `user_id uuid not null`
- `status text not null` (see Job Status)
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `total_files int not null default 0`
- `processed_files int not null default 0`
- `failed_files int not null default 0`
- `notes text null`

**Indexes**
- `(user_id, created_at desc)`
- `(status)`

---

### 3.2 `job_files`

Tracks each uploaded PDF file (temporary reference). No permanent storage allowed.

**Columns**
- `id uuid pk`
- `job_id uuid not null references jobs(id) on delete cascade`
- `user_id uuid not null`
- `original_filename text not null`
- `storage_path text not null` (TEMPORARY path/handle)
- `sha256 text null` (optional integrity)
- `status text not null` (e.g. `UPLOADED`, `OCR_DONE`, `DELETED`, `FAILED`)
- `uploaded_at timestamptz not null default now()`
- `deleted_at timestamptz null`
- `delete_verified boolean not null default false`
- `error_code text null`
- `error_message text null`

**Indexes**
- `(job_id)`
- `(user_id, uploaded_at desc)`

---

### 3.3 `vehicle_records`

Canonical record per processed vehicle document (Core Field Set in typed columns).
One `job_file` -> typically one `vehicle_record` (if needed, allow 1:N later).

**Columns**
- `id uuid pk`
- `user_id uuid not null`
- `job_id uuid not null references jobs(id) on delete cascade`
- `job_file_id uuid not null references job_files(id) on delete cascade`

**Core Fields (typed)**
- `matricula text null`
- `vin_e text null`  (E)
- `marca_d1 text null` (D.1)
- `denominacion_d3 text null` (D.3)
- `tipo_variante_version_d2 text null` (D.2)

- `plazas_s1 int null` (S.1)

- `kw_p2 numeric null` (P.2)
- `cv_derived int null` (DERIVED from P.2)

- `cl_code text null` (C.L raw)
- `cl_construccion_code text null` (first 2)
- `cl_utilizacion_code text null` (last 2)
- `cl_construccion_desc text null`
- `cl_utilizacion_desc text null`

- `categoria_j text null` (J)

- `co2_v7 numeric null` (V.7)

- `fecha_matriculacion date null`
- `fecha_matriculacion_source text null` (`OCR` or `CALCULATED`)

**Quality / Review**
- `needs_review boolean not null default false`
- `review_status text not null default 'PENDING'`
- `reviewed_at timestamptz null`
- `reviewed_by uuid null` (user/admin)
- `review_comment text null`

**Versioning**
- `schema_version text not null` (matches dictionary version)
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

**Indexes**
- `(user_id, created_at desc)`
- `(job_id)`
- `(job_file_id)`
- `(vin_e)`
- `(matricula)`
- `(marca_d1, denominacion_d3)`
- `(needs_review, review_status)`

---

### 3.4 `vehicle_field_values` (Full Schema EAV)

Stores any field from the normative schema as rows.
This allows adding new fields without DB migrations.

**Columns**
- `id uuid pk`
- `user_id uuid not null`
- `vehicle_record_id uuid not null references vehicle_records(id) on delete cascade`

- `field_code text not null` (e.g. "P.2", "C.L", "D.1")
- `label text null` (optional snapshot; truth remains dictionary)
- `value_text text null`
- `value_num numeric null`
- `value_date date null`
- `value_bool boolean null`

- `unit text null`
- `source text not null` (`OCR`, `DERIVED`, `USER_CONFIRMED`)
- `confidence numeric null` (0..1 if available)
- `needs_review boolean not null default false`

- `created_at timestamptz not null default now()`

**Constraints**
- Exactly one of (`value_text`, `value_num`, `value_date`, `value_bool`) should be non-null (enforced in app or via check constraints later).

**Unique**
- `(vehicle_record_id, field_code)` unique (one value per field code in v1)

**Indexes**
- `(vehicle_record_id)`
- `(field_code)`
- `(user_id, field_code)`

---

### 3.5 `ocr_raw_payloads` (Optional but recommended)

Raw Azure DI JSON response for technical traceability (NOT the PDF).
Store minimal necessary to debug mapping.

**Columns**
- `id uuid pk`
- `user_id uuid not null`
- `job_file_id uuid not null references job_files(id) on delete cascade`
- `payload jsonb not null`
- `provider text not null default 'azure_document_intelligence'`
- `created_at timestamptz not null default now()`

**Indexes**
- `(job_file_id)`
- GIN index on `payload` if needed (later)

---

### 3.6 `audit_logs`

Immutable audit trail.

**Columns**
- `id uuid pk`
- `user_id uuid not null`
- `job_id uuid null`
- `job_file_id uuid null`
- `vehicle_record_id uuid null`

- `action text not null` (e.g. USER_LOGIN, OCR_COMPLETED, EXPORT_CREATED)
- `metadata jsonb null`
- `created_at timestamptz not null default now()`

**Indexes**
- `(user_id, created_at desc)`
- `(action, created_at desc)`
- `(vehicle_record_id)`

---

### 3.7 `exports`

Tracks exports and access.

**Columns**
- `id uuid pk`
- `user_id uuid not null`
- `job_id uuid null`
- `export_format text not null` (CSV, JSON)
- `status text not null` (CREATED, READY, FAILED)
- `filters jsonb null` (e.g. only confirmed)
- `storage_path text null` (generated file path)
- `created_at timestamptz not null default now()`
- `downloaded_at timestamptz null`

**Indexes**
- `(user_id, created_at desc)`
- `(job_id)`

---

## 4) RLS (Row Level Security)

For all tables:
- Enable RLS
- Policy: `user_id = auth.uid()`

For Admin role (optional later):
- Admin can read all rows if `auth.jwt() ->> 'role' = 'admin'` (or dedicated table).

---

## 5) Data Lifecycle Rules (Privacy)

- `job_files.storage_path` must point to TEMP storage.
- On success, the system sets:
  - `deleted_at` + `delete_verified=true`
  - and triggers physical delete.
- Hard rule: no permanent PDF storage. Only structured data + logs.

---

## 6) Why this model is “best long-term”

- Core fields allow fast UI + filtering + analytics without heavy joins.
- EAV allows adding new normative fields without schema migrations.
- Raw payload storage enables reliable debugging and mapping improvements.
- Audit logs provide enterprise-grade traceability.
- Works for multi-tenant by default with Supabase RLS.

---

## 7) Next doc after this

Create: `src/core/models/` typed contracts:

- `RawExtraction`
- `CanonicalVehicleRecord`
- `FieldValue`

And mapping rules that link:
Azure JSON → `vehicle_field_values` + `vehicle_records` (core subset).
