# Do Not Repeat (Anti-Patterns)

This document lists errors and patterns identified during the Panel 3 prototype phase that MUST NOT be repeated.

## 1. Duplication of Core Structures
- **Error**: Creating `src/components/orion/panel-3` while `src/app/orion/panel-3` also contained logic.
- **Rule**: Keep logic in `src/core` or `src/lib`, UI in `src/components`, and Pages in `src/app`. Do not mix.

## 2. Data Core Splitting
- **Error**: Creating `src/core/dictionaries` (plural) and `src/core/dictionary` (singular) simultaneously.
- **Rule**: Use a single source of truth.

## 3. Mock APIs in Production
- **Error**: `src/app/api/orion` was used as a mock API but deployed as real routes.
- **Rule**: Use Next.js Server Actions or a real backend pattern, but do not clutter `src/app/api` with prototype mocks.

## 4. Parallel Routing
- **Error**: Creating `src/panel` alongside `src/app`.
- **Rule**: Follow Next.js App Router conventions strictly.

## 5. Dependency Overload
- **Error**: Adding generic libraries (`zod`, `lucide-react`) without a clear architectural need, leading to bloat.
- **Rule**: Verify native capabilities before adding libs.
