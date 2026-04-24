# ORION — TECHNICAL ARCHITECTURE SPECIFICATION  
Version: 1.0  
Status: Production Foundation  
Scope: Core System (UI + Domain + Application + Infrastructure)  
Author: CosmosCore  

---

# 1. SYSTEM PURPOSE

ORIÓN is a SaaS platform designed for **operational intelligence in vehicle and technical document analysis**.

The system enables:

- License plate date estimation
- Vehicle identification through technical data
- Technical document processing via OCR
- Human-in-the-loop validation workflows

The architecture is designed to be:

- Cloud-ready (Azure)
- On-premise compatible
- Scalable
- Domain-driven
- API-first

---

# 2. ARCHITECTURAL PRINCIPLES

### 2.1 Layer Separation

The system MUST maintain strict separation between:

- Presentation layer (UI)
- Application layer (use cases)
- Domain layer (business logic)
- Infrastructure layer (providers)

### 2.2 Cloud Agnostic Core

Domain and application layers MUST NOT depend on:

- Azure
- External AI services
- Storage providers

Infrastructure is replaceable.

### 2.3 Feature-Based Structure

The system is organized by business capabilities, not by technical type.

---

# 3. APPLICATION SHELL (GLOBAL LAYOUT)

## 3.1 Top Bar (Persistent)

### Purpose

Global system access and contextual controls.

### Elements

- ORION logo + system name
- Organization selector (future multi-tenant support)
- Global search (future)
- Notifications (future)
- User avatar

---

## 3.2 Sidebar (Persistent)

### Navigation Root

```
Analysis
```

### Analysis Modules

```
- Plate calculation
- Vehicle detection
- Technical document OCR
```

### User Preferences

- Theme switch (dark / light)
- Font scale control

### User Section

- User name
- Profile access
- Logout

---

# 4. FUNCTIONAL MODULES

---

## 4.1 PLATE CALCULATION MODULE

### View A — Input

#### Supported Inputs

- Excel (.xlsx)
- CSV
- TXT
- Manual entry
- Bulk paste from spreadsheet

#### Validations

- Plate format
- Duplicate detection
- Empty values

---

### View B — Output

#### Result Table

Columns:

- Plate number
- Estimated year
- Estimated month
- Date range
- Confidence score
- Calculation method

#### Features

- Sorting
- Filtering
- Export

---

## 4.2 VEHICLE DETECTION MODULE

### View A — Input

Dynamic technical form.

#### Capabilities

- Field normalization
- Real-time validation

---

### View B — Output

Structured vehicle identification:

- Technical classification
- Derived technical values
- Standardized data output

This module consumes domain logic from:

```
domain/vehicles
```

---

## 4.3 TECHNICAL DOCUMENT OCR MODULE

### 4.3.1 Metrics Block (Top)

#### KPIs

- Processed documents
- Pending
- Failed
- Inconsistencies detected
- Approved

#### Visualization

- KPI cards
- Minimal charts

---

### 4.3.2 Upload & Processing Panel

#### Features

- Drag & drop upload
- Processing queue
- Status per document

#### Document States

- uploading
- processing
- processed
- error

---

### 4.3.3 Result Viewer

Displays extracted structured data.

#### Actions

- Approve
- Reject
- Mark for manual review

---

### 4.3.4 Global Documents Table

#### Columns

- Plate
- Make / model
- Status
- Confidence score
- Processing date

#### Features

- Multi-selection
- Bulk approval
- Filters
- Search
- Row → load result

---

# 5. SYSTEM LAYERS

---

## 5.1 PRESENTATION LAYER

Responsibilities:

- UI rendering
- State handling
- User interaction
- API communication

Must be independent from business logic.

---

## 5.2 APPLICATION LAYER

Contains:

### Use Cases

- Calculate plate estimation
- Classify vehicle
- Process technical document
- Approve validation
- Bulk approval

Coordinates domain services.

---

## 5.3 DOMAIN LAYER

### Entities

- Vehicle
- Plate
- TechnicalDocument

### Value Objects

- PlateNumber
- ConfidenceScore
- TechnicalData

### Domain Services

- PlateEstimationService
- VehicleClassificationService
- DocumentExtractionOrchestrator

This layer contains ALL business logic.

No external dependencies allowed.

---

## 5.4 INFRASTRUCTURE LAYER

### Purpose

External service integration.

### Adapters

- OCR provider
- File storage
- AI services

### Rule

Infrastructure is replaceable without modifying domain.

---

# 6. FOLDER STRUCTURE

```
/orion

 ├── app
 │   ├── layout
 │   ├── analysis
 │   │   ├── plates
 │   │   ├── vehicle-detection
 │   │   └── ocr
 │
 ├── domain
 │   ├── plates
 │   ├── vehicles
 │   └── documents
 │
 ├── application
 │   ├── use-cases
 │   └── services
 │
 ├── infrastructure
 │   ├── ocr
 │   ├── storage
 │   └── ai
 │
 ├── shared
 │   ├── ui
 │   ├── components
 │   ├── charts
 │   └── tables
 │
 ├── data
 │   ├── dictionaries
 │   ├── plates
 │   └── schemas
 │
 └── project-memory
```

---

# 7. SYSTEM STATES

All async processes must support:

- idle
- loading
- success
- error
- empty

---

# 8. SECURITY (BASE READY)

Prepared for:

- Authentication
- Role system
- Audit log

---

# 9. API STRUCTURE (FUTURE)

```
/api/plates
/api/vehicles
/api/documents
/api/validation
```

---

# 10. SCALABILITY ROADMAP

The architecture allows adding:

- Risk scoring
- Pricing engines
- Rule engines per insurer
- External integrations

without modifying the core domain.

---

# 11. AI & AZURE READINESS

Azure integration will occur ONLY in:

```
infrastructure/
```

Possible services:

- Azure Document Intelligence
- Azure Blob Storage
- Azure Functions
- Azure Service Bus

No Azure dependency is allowed in domain or application layers.

---

# 12. PROJECT MEMORY PURPOSE

The folder:

```
/project-memory
```

is the **single source of truth for AI builders**.

It will contain:

- Architecture specs
- Functional specs
- UI behavior definitions
- Domain dictionaries
- Processing rules

AI agents MUST read this folder before generating code.

---

# 13. NON-FUNCTIONAL REQUIREMENTS

### Performance

- Bulk processing support
- Async document pipeline

### UX

- Real-time feedback
- Recoverable errors
- Human validation flow

### Maintainability

- Modular architecture
- Replaceable providers

---

# 14. DEVELOPMENT RULES

1. Domain first.
2. UI consumes use cases — never domain directly.
3. No business logic in UI.
4. Infrastructure behind interfaces.
5. All modules must be independently testable.

---

# END OF DOCUMENT
