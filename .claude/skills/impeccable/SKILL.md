# Impeccable — UI Audit & Polish para ORION

Basado en la filosofía de Paul Bakaus. Modo: **product** (dashboard/app de datos).

## Comandos disponibles

### /impeccable audit
Detecta los 27 anti-patrones más comunes. Busca:
1. Mezcla de tokens `--t-*` con colores hardcodeados
2. Inconsistencia en tamaños de fuente entre componentes similares
3. Espaciados inconsistentes (no siguen el spacing scale)
4. Botones sin estados hover/active
5. Inputs sin transición de focus
6. Tables sin row-hover
7. Secciones sin separación visual clara
8. Jerarquía tipográfica rota (h1>h2>body)
9. Uso de `position:fixed` dentro de `overflow:hidden`
10. `flex-shrink` no definido en scrollable containers
11. Colores de texto con contraste < 4.5:1
12. Animaciones sin `prefers-reduced-motion` guard
13. Bordes de radios inconsistentes dentro del mismo componente
14. Sombras hardcodeadas en lugar de tokens
15. Componentes sin cursor pointer en elementos interactivos
16. Loading states sin skeleton/spinner
17. Datos vacíos sin empty state
18. Mensajes de error sin estilo visual claro
19. Tablas sin sticky header en listas largas
20. Formularios sin label visible (solo placeholder)
21. Texto truncado sin tooltip
22. Iconos sin título/aria-label
23. Z-index aleatorios sin sistema
24. Transiciones > 300ms en interacciones frecuentes
25. `!important` en CSS (señal de specificity war)
26. Inline styles que duplican clases CSS existentes
27. Componentes con >3 variantes inline (extraer a constante)

### /impeccable critique
UX review completo:
- Jerarquía visual: ¿el ojo sabe adónde ir primero?
- Information architecture: ¿los datos están agrupados con lógica?
- Feedback loop: ¿el usuario sabe qué está pasando?
- Error handling: ¿los errores son claros y accionables?
- Empty states: ¿qué ve el usuario cuando no hay datos?

### /impeccable polish
Pasada final antes de considerar una feature terminada:
- Revisar todos los estados: default, hover, active, focus, loading, empty, error
- Alinear espaciados al spacing scale
- Verificar que los colores usan tokens
- Añadir transiciones donde falten
- Revisar contraste de texto

### /impeccable typeset
Sistema tipográfico de ORION:
- Kicker/label: 10px, weight 900, uppercase, tracking 0.1em, color --t-text-3
- Caption: 11px, weight 600, color --t-text-2
- Body: 12-13px, weight 400-500, color --t-text
- Heading small: 14-16px, weight 700, color --t-text
- Heading: 18-22px, weight 800, color --t-text
- Display: 24-32px, weight 800, letterSpacing -0.025em

### /impeccable colorize
Solo usar los tokens `--t-*`. Nunca hardcodear.
Semántica del color en ORION:
- Azul `--t-blue`: acción primaria, links, focus
- Verde `--t-green`: éxito, positivo, activo
- Rojo `--t-red`: error, peligro, eliminar
- Ámbar `--t-amber`: advertencia, pendiente, atención
- Gris texto: --t-text → --t-text-2 → --t-text-3 (jerarquía descendente)
