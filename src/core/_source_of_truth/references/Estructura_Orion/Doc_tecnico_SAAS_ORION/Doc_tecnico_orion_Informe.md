# ORION — TECHNICAL SPECIFICATION: VEHICLE REPORT PANEL (ZONE 2)

Version: 1.1  
Status: Production Ready  
Scope: Presentation Layer & Application Integration  
Author: CosmosCore  

---

# 1. COMPONENT PURPOSE

The **Vehicle Report Panel (Zone 2)** is the primary validation and auditing interface for extracted vehicle data.

It follows the principle of **Progressive Disclosure**, separating:

1. Human Presentation (Executive Summary)
2. Technical Grid (Engineering Audit)

This component:

- Consumes a `ValidatedVehicleDTO` from the Application Layer
- Triggers correction and validation Use Cases
- Acts as the operational decision point for document approval

---

# 2. LAYOUT & STRUCTURE

The panel is vertically divided into:

1. Top Action Bar
2. Header Area (Human View)
3. Body Area (Technical View)

---

# 3. HEADER AREA — HUMAN PRESENTATION

## 3.1 Visual Identification Block

Displays:

- Plate number (EU visual style or monospace)
- Make & model → `D.1 + D.3`
- Commercial motor string → derived from Domain

Example:

```
(P.1 / 1000).toFixed(1) + " " + P.3_decoded + " - " + CV + " CV"
```

---

## 3.2 Human-Readable Summary

Natural language, no technical codes.

Source fields:

- C.L
- J
- J.1
- P.3
- S.1

Template:

Vehículo [Turismo] en variante [Berlina], destinado al transporte de personas (hasta [5] plazas). Motorización [Diésel].

---

# 4. BODY AREA — TECHNICAL DATA GRID

Excel-like validation structure.

## 4.1 Column Definition

| CÓDIGO | DESCRIPCIÓN TÉCNICA | VALOR EXTRAÍDO | UNIDAD |

---

## 4.2 LOGICAL BLOCKS

### Block A — Legal & Structural Identification

- E → VIN
- C.L → ITV Classification
- J → EU Category
- J.1 → Bodywork

---

### Block B — Powertrain

- P.3 → Fuel
- P.1 → Engine capacity (cm³)
- P.2 → Power (kW)
- Auto → Calculated power (CV)
- V.9 → Emissions level

---

### Block C — Masses & Dimensions

- F.2 → MMA (kg)
- G → Kerb mass (kg)
- F.6 → Length (m)
- F.5 → Width (m)
- S.1 → Seats

---

# 5. HIGH-PERFORMANCE SAAS INTERACTIONS

## 5.1 Inline Editing

Behavior:

- Click → cell becomes input
- Enter / blur → triggers:

```
UpdateDocumentField(documentId, fieldKey, newValue)
```

Validation:

- Enforced by Domain schemas

---

## 5.2 Confidence Indicators

Linked to `ConfidenceScore`.

| Confidence | UI Behavior |
|------------|------------|
High (>95%) | Normal rendering |
Medium/Low | Amber dashed underline + ⚠ |
Missing critical | Red highlight → blocks approval |

---

## 5.3 Split-View Validation (Source of Truth)

Displays:

- Original PDF/Image
- Highlighted OCR bounding box for selected field

---

## 5.4 Cross-Validation Alerts

If Domain detects inconsistencies:

Example:

Fuel = Diesel + Emissions = 0

UI shows warning banner between header and grid.

---

# 6. ARCHITECTURE & DATA FLOW

## 6.1 Data Consumption

The component:

```
VehicleReport.tsx
```

MUST:

- Be logic-free
- Consume immutable `ValidatedVehicleDTO`

---

## 6.2 Triggered Use Cases

- UpdateDocumentField
- ApproveVehicleValidation
- FlagForManualReview

---

# 7. STATE MANAGEMENT

## Loading

- Header skeleton
- Grid skeleton
- Actions disabled

## Empty

Message:

Select a document to start validation

## Error

- Error banner
- Retry action

---

# 8. APPROVAL FLOW CONTROL

Approval is dynamically enabled.

## Blocking Conditions

- Missing critical fields
- Domain inconsistencies
- Validation status = error

## UI Feedback

Disabled button + tooltip with reason.

---

# 9. AUDIT TRAIL

Every manual edit generates:

- User
- Timestamp
- Field
- Previous value
- New value

UI Action:

View Change History

---

# 10. KEYBOARD NAVIGATION

- Tab → next cell
- Shift + Tab → previous
- Enter → save
- Esc → cancel

Optimized for high-volume operational workflows.

---

# 11. PERFORMANCE REQUIREMENTS

- Load time < 300ms after selection
- Optimistic UI updates
- No full re-render on single cell edit

---

# 12. RESPONSIVENESS STRATEGY

≥1440px → Full layout  
1280px → Collapsible blocks  
<1280px → Tab view (Human / Technical)

---

# 13. DATA CONTRACT — VALIDATEDVEHICLEDTO

Single immutable object.

Must contain:

## Human View

- Plate
- Make & model
- Commercial engine
- Natural language summary

## Technical Grid

Grouped structured data.

## Metadata

- Confidence per field
- Validation status
- Domain alerts
- Approval eligibility flag

---

# 14. ADDITIONAL USE CASES

- GetDocumentAuditTrail
- ReprocessDocument
- LockDocumentForEditing

---

# 15. CONCURRENT EDIT PROTECTION

When a user edits:

Document becomes soft-locked.

Other users see:

Document currently being edited by [User].

---

# 16. NON-FUNCTIONAL REQUIREMENTS

## UX

- Real-time feedback
- Zero cognitive overload
- Human-in-the-loop validation flow

## Maintainability

- DTO-driven UI
- Domain isolation

## Security Ready

- User tracking in audit trail
- Role-based approval (future)

---

# END OF SPECIFICATION
