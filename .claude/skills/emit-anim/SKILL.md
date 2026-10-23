# Emil Kowalski — Animaciones & Micro-interacciones ORION

Principios de animación de Emil Kowalski adaptados al estilo de ORION.

## Regla de oro
> "La animación que no notas es la mejor animación."
Orion es una app de datos. Las animaciones deben APOYAR la navegación, no distraer.

## Easing curves canónicas
```css
--ease-spring:   cubic-bezier(0.34, 1.56, 0.64, 1);   /* spring suave */
--ease-smooth:   cubic-bezier(0.4, 0, 0.2, 1);          /* standard */
--ease-out:      cubic-bezier(0, 0, 0.2, 1);             /* deceleración */
--ease-in:       cubic-bezier(0.4, 0, 1, 1);             /* aceleración */
--ease-snappy:   cubic-bezier(0.2, 0, 0, 1);             /* snappy exit */
```

## Duraciones
- Micro (hover, focus): 80-120ms
- Small (botones, toggle): 150ms
- Medium (panels, dropdowns): 200ms
- Large (modales, drawers): 280-320ms
- NUNCA > 400ms para interacciones frecuentes

## Patrones ORION

### Botones
```css
transition: background 120ms ease, transform 80ms ease, box-shadow 120ms ease;
:active { transform: scale(0.96); }
```

### Cards / Panels al aparecer
```css
animation: slideUp 200ms cubic-bezier(0.4, 0, 0.2, 1);
/* slideUp: from translateY(8px) opacity:0 to translateY(0) opacity:1 */
```

### Tab switching (hojas)
```css
animation: fadeIn 180ms ease-out;
```

### Loading skeleton
```css
background: linear-gradient(90deg, var(--t-line) 25%, var(--t-line-soft) 50%, var(--t-line) 75%);
background-size: 200% 100%;
animation: skeleton-shimmer 1.5s infinite;
```

### Row hover en tablas
```css
transition: background 80ms ease;
/* NO usar transform en rows — rompe sticky headers */
```

### Modal entrada
```css
/* overlay */ animation: fadeIn 200ms ease;
/* panel  */ animation: slideUp 250ms cubic-bezier(0.34, 1.56, 0.64, 1);
```

### Number counter (KPIs)
Cuando un número cambia: fade-out 80ms → fade-in 120ms (no slide)

## Frequency gate — ORION
Solo animar si:
1. El elemento aparece por primera vez en pantalla
2. El estado cambia por acción del usuario
3. El dato se actualiza (refetch, merge SINCO)

NO animar:
- Elementos que ya estaban visibles y no cambiaron
- Tablas completas al reordenar columnas
- Texto que el usuario está escribiendo

## `prefers-reduced-motion`
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```
Añadir a globals.css si no existe.
