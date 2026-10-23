# Cleanup — Eliminar marcas de IA del código ORION

Ejecutar después de cualquier sesión de generación de código intensiva.

## Qué eliminar

### Comentarios redundantes (AI slop)
```
// Handle the case where...
// This function...
// We need to...
// Added for the X flow
// Used by Y component
// Note: this is important because...
```
Los buenos nombres de variable/función NO necesitan comentario.

### Docstrings multi-línea innecesarios
Si el código ya se explica solo, borrar el docstring.
Solo dejar comentarios cuando el WHY no es obvio (invariante oculta, workaround de bug).

### Código defensivo excesivo
```
// Patrones a eliminar:
if (arr && arr.length && arr.length > 0) → usar if (arr?.length)
try { } catch (e) { console.log(e) } → o maneja el error o no pongas try/catch
typeof x !== 'undefined' → usar x !== undefined
!!variable → usar Boolean(variable) o simplemente variable
```

### Type escapes innecesarios
```typescript
// Eliminar:
as any  (salvo que sea inevitable)
// @ts-ignore (investigar y arreglar el tipo)
// eslint-disable-next-line  (investigar y arreglar)
```

### Atributos de accesibilidad falsos
```
aria-label="button"  // descripción inútil
role="button" en un <button>  // redundante
```

### Console.log olvidados
Buscar y eliminar todos los `console.log` que no sean de producción necesaria.

## Cómo ejecutar en ORION
```bash
# Buscar console.logs
grep -r "console\.log" src/ --include="*.tsx" --include="*.ts"

# Buscar as any
grep -r "as any" src/ --include="*.tsx" --include="*.ts"

# Buscar comentarios largos
grep -rn "// ──\|// ===\|// ---" src/ --include="*.tsx"
```

## Regla de oro
El código limpiado debe pasar el test: "¿Podría un desarrollador senior sin contexto entender esto solo leyendo los nombres?"
Si sí → eliminar el comentario.
Si no → escribir un comentario mejor (el WHY, no el QUÉ).
