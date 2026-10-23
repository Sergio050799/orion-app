# Interface Design — ORION Design System

## Propósito
Persiste las decisiones de diseño de ORION entre sesiones. Consulta este archivo ANTES de tocar cualquier componente visual.

## Identidad visual
- **Tema**: Obsidian Black (`#050607` base), monocromático con acento azul eléctrico
- **Filosofía**: Data-dense pero respirable. Profesional, sin adornos, funcional primero.
- **Referencia**: Numora, Linear, Vercel dashboard

## Tokens canónicos (usar SIEMPRE estos, nunca hardcodear colores)
```
Background:   var(--t-bg)         #050607
Surface:      var(--t-surface)    #0b0c0f
Line:         var(--t-line)       rgba(255,255,255,0.08)
Line soft:    var(--t-line-soft)  rgba(255,255,255,0.06)
Text:         var(--t-text)       #f4f4f5
Text 2:       var(--t-text-2)     #8d9198
Text 3:       var(--t-text-3)     #6d727a
Blue accent:  var(--t-blue)       #4387ff
Green:        var(--t-green)      #20c982
Red:          var(--t-red)        #ef4d5a
Amber:        var(--t-amber)      #f0b94d
```

## Patrones de componente — REGLAS FIJAS

### Section Title (cabecera de sección dentro de una hoja)
```
fontSize: 10, fontWeight: 900, color: var(--t-text-3)
textTransform: uppercase, letterSpacing: 0.1em, marginBottom: 14
```
CSS class: `.orion-section-title`

### KPI Card (caja de métrica)
```
borderRadius: 8, padding: '10px 14px'
background: var(--t-surface), border: 1px solid var(--t-line)
```
Label: fontSize:10, fontWeight:700, color:var(--t-text-3), uppercase
Value: fontSize:26-28, fontWeight:700, color:var(--t-text), letterSpacing:-0.5px

### Action Button (pill primario)
```
padding: '8px 16px', fontSize: 11, fontWeight: 700
borderRadius: 8, border: 1px solid var(--t-line)
background: transparent, color: var(--t-text)
transition: all 0.15s
```
Hover: `background: var(--t-line-soft), borderColor: rgba(255,255,255,0.15)`
Active: `transform: scale(0.97)`

### Action Button (pill azul / primario)
```
background: var(--t-blue), color: #fff, border: none
padding: '8px 16px', fontSize: 11, fontWeight: 700, borderRadius: 8
```

### Table Header (th)
```
fontSize: 10-11, fontWeight: 700-800, color: var(--t-text-3)
borderBottom: 1px solid var(--t-line), padding: 8px 10px
textAlign: left, userSelect: none, whiteSpace: nowrap
```

### Table Row hover
```
background: var(--t-line-soft) on hover
transition: background 0.1s
```

### Page Container (contenido de cada hoja)
```
padding: 24px 32px, maxWidth: 900px para hojas de formulario
overflow-y: auto con custom-scrollbar
flex: 1, minHeight: 0
```

### Divider entre secciones
```
height: 1, background: var(--t-line), margin: 28px 0
```

## Reglas anti-patrón
- NUNCA hardcodear colores hex en componentes nuevos
- NUNCA mezclar `orion-*` tokens con `--t-*` tokens en el mismo componente
- NUNCA usar `position: fixed` dentro de un contenedor con `overflow: hidden` (usar portal)
- SIEMPRE `flex-shrink: 0` en hijos de flex-column con `overflow-y: auto`
- Los modales SIEMPRE via `createPortal` a `document.body` con `zIndex: 9999`

## Spacing scale
4, 8, 12, 14, 16, 20, 24, 28, 32, 40, 48px

## Bordes y radios
- Inputs/botones pequeños: `borderRadius: 6-8px`
- Cards/panels: `borderRadius: 10-12px`
- Modales: `borderRadius: 16-18px`
- NUNCA mezclar radios distintos en el mismo nivel visual
