# ORION — Schema Versioning & Compatibility Policy
Version: 1.0
Status: Baseline policy (pre-code)
Scope: How ORION versions and evolves `itv_master_dictionary.json` and stays compatible over time.

---

## 0) Goal

Ensure ORION can **add fields and logic over time** without breaking:
- Existing records in DB
- UI rendering (Core + Full Schema)
- Exports
- Agentic development (no ambiguity)

This policy defines how changes are introduced, tracked, and validated.

---

## 1) Definitions

### 1.1 Dictionary
`itv_master_dictionary.json` is the **single source of truth** for:
- Field codes (e.g., "P.2", "C.L", "D.1")
- Labels, types, units
- Dictionaries (e.g., C.L decoding maps)
- Field grouping / display hints (if present)

### 1.2 Schema Version
A string stored in every canonical record and extraction output:
- `schema_version`

Example formats (choose one and keep it forever):
- `2026.02` (year.month)
- `v2.1.0` (semver)
- `2026-02-12` (date tag)

**Recommendation**: `YYYY.MM` for your context (monthly updates like matrícula tables).

---

## 2) Versioning Rules (Semantics)

### 2.1 PATCH (Backward compatible)
Changes that do NOT alter meaning or structure:
- Fix typos in labels/descriptions
- Add new dictionary entries (e.g. new C.L descriptions)
- Add non-breaking metadata (new display hint fields)

**Impact**
- No DB changes required
- Existing records remain valid

### 2.2 MINOR (Backward compatible additions)
Changes that add new capability without breaking old:
- Add new field codes to schema
- Add new optional fields in dictionary
- Add new derived fields (if clearly marked as DERIVED and optional)
- Add new validation rules that only set `needs_review` (never hard-fail)

**Impact**
- No DB migration required (EAV supports new fields)
- UI can show new fields under “Full Schema”
- Core fields remain stable

### 2.3 MAJOR (Breaking changes)
Changes that alter meaning/structure:
- Rename existing field codes
- Change the meaning of a field code
- Change data type in a way that invalidates stored values
- Remove field codes (discouraged)
- Change how C.L decoding works structurally (not just expanding mappings)

**Impact**
- Requires migration plan
- Requires explicit compatibility handling in code
- Must be approved and documented (see Governance)

---

## 3) Compatibility Contract (Never break these)

### 3.1 Field Codes are immutable
Once a `field_code` exists in production, it must never be renamed.

If a field needs replacement:
- Deprecate old field_code
- Introduce a new field_code
- Keep both for a transition period

### 3.2 Core Field Set is stable
Core UI fields (MVP fields) must remain stable in naming and meaning.

You may add new Core fields later, but do not change existing ones without a MAJOR.

### 3.3 EAV provides long-term extensibility
All new normative fields should be stored in:
- `vehicle_field_values` by `field_code`

This avoids schema migrations.

---

## 4) DB Versioning Strategy

### 4.1 Store schema version everywhere relevant
- `vehicle_records.schema_version`
- `ocr_raw_payloads` optionally include `schema_version` in metadata
- `exports` store `schema_version` for reproducibility (recommended)

### 4.2 Store derived fields with explicit source
- `source="DERIVED"`
- Document formula in ORION_SPECS and/or core contracts.

---

## 5) Dictionary Change Workflow (Governance)

Any dictionary change must include:

1. **Update dictionary file**
   - `src/core/dictionaries/itv_master_dictionary.json`

2. **Bump `schema_version`**
   - Apply chosen format (YYYY.MM recommended)

3. **Update CHANGELOG**
   - Create/append:
     - `src/core/dictionaries/CHANGELOG.md`

4. **Update docs**
   - If new fields/logic:
     - `docs/ORION_SPECS.md` (rules, derivations, UI impact)

5. **Validation Run**
   - Run validation tests with synthetic dataset
   - Confirm no regression on Core fields

---

## 6) Validation Requirements (Minimum)

### 6.1 Dictionary Integrity
- No duplicate field codes
- Each field has:
  - label
  - type
  - unit if relevant
- Dictionaries referenced by logic exist (e.g., C.L maps)

### 6.2 Backward Compatibility Tests
- Core fields extraction still works on previous test samples
- Existing DB records can still render in UI (Core + Full Schema)

---

## 7) Deprecation Policy

When a field or mapping becomes obsolete:

- Mark as `deprecated: true` in dictionary (recommended field)
- Keep it readable forever
- UI can hide deprecated fields by default but still show under “Full Schema” if present

---

## 8) Reproducibility Policy (Important)

Exports must be reproducible:
- Export should include `schema_version`
- If possible, include a header row/metadata section with:
  - schema_version
  - export timestamp
  - filters used

---

## 9) Notes for Agents (Non-negotiable)

- Never rename field codes.
- Always bump schema_version after modifying dictionary.
- Never introduce breaking changes without documenting a MAJOR plan.
- New fields should be optional by default.
- Any new derived field must specify:
  - formula
  - rounding policy
  - null handling
  - source="DERIVED"
