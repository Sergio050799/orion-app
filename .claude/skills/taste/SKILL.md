# Taste Skill — Dirección de diseño ORION

Calibración de los 3 dials de diseño para ORION.

## Dials calibrados para ORION

| Dial | Valor | Descripción |
|---|---|---|
| Design variance | **LOW (2/5)** | Consistencia máxima. Un solo lenguaje visual. |
| Motion intensity | **LOW-MEDIUM (2/5)** | Útil, no decorativo. |
| Visual density | **MEDIUM-HIGH (4/5)** | App de datos. Maximizar info visible. |

## Dirección de estilo: "Obsidian Pro"
- Fondo casi negro, no azul oscuro (evitar el exceso de azul)
- Texto monocromático: blanco → gris → gris oscuro (jerarquía)
- Un solo acento azul eléctrico (#4387ff) — para acciones y links
- NADA de gradientes en componentes internos (solo en el logo/branding)
- Sombras mínimas — bordes claros en lugar de sombras
- Densidad alta pero con padding generoso (respirar sin desperdiciar)

## Anti-patrones a eliminar en ORION
- ❌ Glassmorphism (`backdrop-filter: blur`) dentro de las hojas → reservado para login
- ❌ Gradientes en botones internos → usar solid color
- ❌ Múltiples colores de acento en el mismo componente
- ❌ Sombras de `box-shadow: 0 30px 80px...` en elementos internos
- ❌ Border-radius > 12px en elementos de datos (tablas, grids)
- ❌ Iconos decorativos sin función

## Qué hace que ORION se sienta premium
1. **Consistencia tipográfica**: mismos tamaños de fuente en componentes equivalentes
2. **Espaciados alineados**: todo en múltiplos de 4
3. **Estados completos**: cada botón tiene hover, active, disabled
4. **Feedback inmediato**: transiciones < 150ms en clicks
5. **Datos primero**: la UI desaparece, los datos hablan

## Inspiración visual
- Linear (simplicidad + densidad)
- Vercel dashboard (monocromo + azul acento)
- Raycast (tipografía + spacing)
- Numora (dark + tablas de datos)
