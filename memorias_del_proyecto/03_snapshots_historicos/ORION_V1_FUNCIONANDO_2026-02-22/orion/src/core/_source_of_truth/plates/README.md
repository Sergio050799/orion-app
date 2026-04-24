# ORIÓN — core/plates

Nodo de estimación cronológica para matrículas españolas **post-2000** (formato `0000-BBB`).

## Qué hace
- Convierte la matrícula a un índice global (serie en base-20 + número).
- Busca el tramo entre “anclas” (`month_end` / `observed`).
- Estima fecha aproximada por interpolación lineal.

## Qué NO hace
- Matrículas provinciales antiguas (ej: `M-1234-ZA`).
- Matrículas especiales (diplomáticas, militares, etc.).

## Dataset
`anchors.es.0000BBB.json` es el corazón del sistema. Añadir nuevas anclas no requiere tocar el código.

## Output esperado
- estimated_date (YYYY-MM-DD)
- estimated_year, estimated_month (si aplica)
- confidence + bounds + method
