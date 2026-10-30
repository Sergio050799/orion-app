# ORION V2 — CORRECCIÓN DE FIDELIDAD VISUAL

**Fecha:** 13/10/2026  
**Estado:** COMPLETADO — Build OK (52 páginas, 0 errores TypeScript)  
**Alcance:** Exclusivamente local. Sin commits. Sin pushes. Sin despliegues.

---

## Resumen ejecutivo

**Fase 1 (T04):** Sustitución de tonos navy/blue-glass por tokens `--t-*` en 7 zonas (FlotaGrid, HojaInforme, HojaOriginal, HojaTrabajos, HojaSincoUnificado, emission/page, analysis/vehiculos).

**Fase 2 (esta sesión):** Correcciones estructurales tras auditoría contra los HTML de referencia. Además del color, se modificaron layouts, jerarquías y componentes UI para que coincidan con los patrones de diseño aprobados:
- `ORION_ESTUDIO_INTEGRAL_V2.html` → patrón `.stepitem`, `.uploader`, `.option-pair/.choice`, `.processline`, `.metricline`
- `ORION_VEHICULOS_REFERENCIA.html` → patrón `.intro/.heading`, `.segmented`, `.content` grid, `.result`, `.empty`

---

## Archivos modificados

### 1. `src/app/(dashboard)/emission/page.tsx` — Flotas portfolio

| Elemento | Antes | Después |
|---|---|---|
| Orden composición | H1 → Filtros → KPIs → Tabla | H1 → **KPIs** → Filtros → Tabla |
| Comisión formato | `${f.comision}%` (fontSize 12) | `${f.comision.toFixed(1).replace('.', ',')} %` (fontSize 14) |
| Comisión color | `var(--t-text-2)` cuando tiene valor | `var(--t-text)` cuando tiene valor |
| Comisión ancho columna | `minmax(0,72px)` | `minmax(0,90px)` |
| Celdas tabla (nombre, corredor, periodicidad, fechas) | fontSize 12–13 | fontSize 14 |
| Sub-línea días restantes | fontSize 10 | fontSize 11 |

### 2. `src/app/(dashboard)/flotas/components/HojaOriginal.tsx` — Tab ORIGINAL

| Elemento | Antes | Después |
|---|---|---|
| Toolbar bg | `rgba(6,14,50,0.3)` | `var(--t-surface)` |
| Toolbar border | `rgba(61,112,255,0.12)` | `var(--t-line)` |
| Botón "Re-subir Excel" bg | `rgba(6,14,50,0.5)` | `transparent` |
| Botón "Re-subir Excel" border | `rgba(61,112,255,0.22)` | `var(--t-line)` |
| Botón "Re-subir Excel" color | `rgba(178,198,245,0.8)` | `var(--t-text-2)` |
| Botón "Añadir vehículos" bg | `rgba(18,64,204,0.15)` | `transparent` |
| Botón "Añadir vehículos" border | `rgba(51,102,255,0.3)` | `var(--t-line)` |
| Botón "Añadir vehículos" color | `#BDD4FF` | `var(--t-blue)` |
| Texto ayuda toolbar | `rgba(178,198,245,0.4)` | `var(--t-text-3)` |
| Pantalla vacía bg | `rgba(0,7,45,0.6)` | `transparent` |
| Icono central bg/border | navy + `rgba(51,102,255,0.3)` | `var(--t-line-soft)` + `var(--t-line)` |
| Icono central stroke | `#3366FF` | `var(--t-blue)` |
| Heading "Cargar datos" color | `#FFFFFF` | `var(--t-text)` |
| Subtítulo heading color | `rgba(178,198,245,0.55)` | `var(--t-text-2)` |
| Card "Subir Excel" bg/border | `rgba(18,64,204,0.12)` + `rgba(51,102,255,0.3)` | `var(--t-surface)` + `var(--t-line)` |
| Card "Subir Excel" hover | navy más oscuro | `var(--t-line-soft)` + `var(--t-blue)` border |
| Card "Subir Excel" stroke | `#3366FF` | `var(--t-blue)` |
| Card "Subir Excel" título | `#FFFFFF` | `var(--t-text)` |
| Card "Subir Excel" sub | `rgba(178,198,245,0.5)` | `var(--t-text-3)` |
| Card "Rellenar manual" bg/border | `rgba(6,14,50,0.5)` + `rgba(61,112,255,0.18)` | `var(--t-surface)` + `var(--t-line)` |
| Card "Rellenar manual" stroke | `rgba(178,198,245,0.7)` | `var(--t-text-2)` |
| Card "Rellenar manual" título | `#BDD4FF` | `var(--t-text)` |
| Card "Rellenar manual" sub | `rgba(178,198,245,0.4)` | `var(--t-text-3)` |

### 3. `src/app/(dashboard)/flotas/components/HojaSincoUnificado.tsx` — Tab SINCO

| Elemento | Antes | Después |
|---|---|---|
| `sectionTitle` color | `rgba(178,198,245,0.5)` | `var(--t-text-3)` |
| `kpiBox` bg | `rgba(6,14,50,0.4)` | `var(--t-surface)` |
| `kpiBox` border | `rgba(61,112,255,0.16)` | `var(--t-line)` |
| KPI label color | `rgba(178,198,245,0.6)` | `var(--t-text-3)` |
| KPI value color | `#FFFFFF` | `var(--t-text)` |
| Contador vehículos | `rgba(178,198,245,0.6)` | `var(--t-text-2)` |
| Botón "Volcar a TRABAJO" bg | `rgba(18,64,204,0.15)` | `transparent` |
| Botón "Volcar a TRABAJO" border | `rgba(18,64,204,0.3)` | `var(--t-line)` |
| Botón "Volcar a TRABAJO" color | `#3366FF` | `var(--t-blue)` |
| "Mostrar en informe" color inactivo | `rgba(178,198,245,0.45)` | `var(--t-text-3)` |
| "Mostrar en informe" color activo | `#3366FF` | `var(--t-blue)` |
| Input Daños Propios bg | `rgba(6,14,50,0.55)` | `var(--t-bg)` |
| Input Daños Propios border | `rgba(61,112,255,0.3)` | `var(--t-line)` |
| Input Daños Propios valor normal | `#FFFFFF` | `var(--t-text)` |
| Input Daños Propios valor >0 | `#f87171` (hardcoded) | `var(--t-red)` |
| Input focus border | `rgba(18,64,204,0.7)` | `var(--t-blue)` |
| Input blur border | `rgba(61,112,255,0.3)` | `var(--t-line)` |
| Divisor horizontal | `rgba(61,112,255,0.16)` | `var(--t-line)` |

### 4. `src/app/(dashboard)/flotas/components/HojaTrabajos.tsx` — Tab TRABAJO

| Elemento | Antes | Después |
|---|---|---|
| SilverdatModal botón "Cancelar" bg | `rgba(6,14,50,0.5)` | `transparent` |
| SilverdatModal botón "Cancelar" border | `rgba(61,112,255,0.22)` | `var(--t-line)` |
| SilverdatModal botón "Cancelar" color | `#BDD4FF` | `var(--t-text-2)` |

### 5. `src/app/(dashboard)/flotas/components/HojaAutomatico.tsx` — Tab AUTOMÁTICO (Fase 2)

Reescritura estructural completa del Step 1 según patrón `.stepitem` de la referencia. Adicionalmente, tokens finales en Steps 2 y 3.

**Step 1 — layout anterior:** header centrado + 3 tarjetas glass (descargar, subir, modo) + botón CTA ancho completo con gradiente.

**Step 1 — layout nuevo:**

| Elemento | Patrón aplicado |
|---|---|
| Header con badge "PASO 1 DE 3" | `.shead`: flex space-between, badge `border:1px solid var(--t-line)` |
| Pasos numerados con líneas | `.processline`: círculos 26×26, activo fondo `var(--t-blue)`, líneas `height:1 var(--t-line)` |
| Descarga plantilla | `.stepitem`: flex gap:18, número `01` `var(--t-text-3)`, botón `border:1px solid var(--t-line) transparent` |
| Subir Excel | `.uploader`: `border:1px dashed var(--t-line); background:transparent; padding:33px 20px; borderRadius:7` |
| Selector modo | `.option-pair`: grid 1fr 1fr, activo `rgba(18,64,204,0.05) + border var(--t-blue)`, inactivo `transparent + var(--t-line)` |
| Botón Continuar | derecha alineado; activo `linear-gradient(135deg,#1240CC,#3366FF)`; inactivo `transparent + var(--t-line)` |

**Steps 2 y 3 — tokens pendientes corregidos:**

| Elemento | Antes | Después |
|---|---|---|
| Barra progreso alto | 8px | 3px |
| Barra progreso fondo | `rgba(61,112,255,0.15)` | `var(--t-line)` |
| Log entry border | `rgba(61,112,255,0.07)` | `var(--t-line)` |
| Filas grupo tabla | `rgba(18,64,204,0.08)` | `var(--t-line-soft)` |
| Texto tabla | `rgba(178,198,245,x)` | `var(--t-text-*)` tokens |
| Bulk selects bg | `rgba(6,14,50,0.7)` | `var(--t-bg)` |
| Indicadores paso activo | gradiente amber | `var(--t-blue)` |
| Líneas conectoras pasos | `rgba(61,112,255,0.12)` h:2 | `var(--t-line)` h:1 |
| Botón Volver | navy bg | `transparent + var(--t-line) + var(--t-text-2)` |
| SilverdatModal h2 | `#FFFFFF` | `var(--t-text)` |
| Label descuento / "Prima total" | `rgba(178,198,245,0.7)` | `var(--t-text-2)` / `var(--t-text-3)` |

### 6. `src/app/(dashboard)/analysis/vehiculos/page.tsx` — Vehículos (Fase 2)

Reescritura estructural completa según patrón de `ORION_VEHICULOS_REFERENCIA.html`.

| Elemento | Antes | Después |
|---|---|---|
| Header | flex space-between, h1 26px sin border | `.intro/.heading`: `borderLeft:3px solid var(--t-blue)`, h1 34px letterSpacing:-1.2px, subtítulo 13px |
| Divider bajo header | — | `borderTop:1px solid var(--t-line)` full-width |
| Toggle Individual/Masivo | 2 botones separados, rounded corners custom, boxShadow inset | `.segmented`: wrapper `border:1px solid var(--t-line); padding:3; borderRadius:7`, botones `border:0` |
| Grid contenido | `flex gap:22` | `grid gridTemplateColumns:360px minmax(0,1fr); gap:43; alignItems:start` |
| Panel izquierdo | `GLASS` (surface bg + line border) + `flex:0 0 320px` | bare `{position:sticky, top:16}` sin background ni borde |
| Selector de modo | flex gap:6 botones colored por modo | grid 1fr 1fr, mismos `.choice` activo/inactivo que Automático |
| Botón Consultar | gradiente `linear-gradient` | `background:var(--t-blue); border:1px solid var(--t-blue)` |
| Panel derecho | `flex:1; flexDirection:column; gap:12` | `borderLeft:1px solid var(--t-line); paddingLeft:42; flexDirection:column; gap:12` |
| Estado vacío | SVG con opacity:0.3 + texto | `.empty`: flex column centrado, símbolo `▱` fontSize:35 `var(--t-text-3)`, h2 18px, párrafo 13px |

### 7. `src/app/(dashboard)/flotas/components/HojaSincoUnificado.tsx` — KpiPanel (Fase 2)

Cambio estructural en `KpiPanel`: de tarjetas individuales a `.metricline` plano.

| Elemento | Antes | Después |
|---|---|---|
| Layout KPIs | `grid repeat(3,1fr) gap:10` — cada métrica con `kpiBox` (surface bg + line border + padding 10×14) | `grid repeat(N,1fr)` — contenedor único con `borderTop/Bottom:1px solid var(--t-line); padding:17px 0`, sin cajas individuales |
| Label KPI | fontSize:10 color token | `fontSize:10; textTransform:uppercase; letterSpacing:0.06em; marginBottom:4` |
| Valor KPI | `var(--t-text)` normal | `fontSize:27; letterSpacing:-0.5px; fontWeight:700; display:block` |

### 8. `src/app/(dashboard)/flotas/components/HojaPreEmision.tsx` — Pre-Emisión (Fase 2)

Corrección de colores hardcoded light-mode restantes.

| Elemento | Antes | Después |
|---|---|---|
| ManualSearchPanel bg | `#f0f4ff` | `var(--t-line-soft)` |
| ManualSearchPanel border | `#c8d8f5` | `var(--t-line)` |
| `Fld` label | `#6b7280` | `var(--t-text-3)` |
| `inS` input style | `#d1d5db / #fff / #111827` | `var(--t-line) / var(--t-bg) / var(--t-text)` |
| Buscar (ManualSearchPanel) | `#1240CC` bg | `var(--t-blue)` |
| SimilarModal completo | fondo blanco, texto oscuro | surface `var(--t-surface)`, borde `var(--t-line)`, texto `var(--t-text-*)` tokens |
| SimilarModal cancelar | `#f3f4f6 / #e5e7eb / #6b7280` | `transparent / var(--t-line) / var(--t-text-2)` |
| SimilarModal aplicar | `#1240CC` | `linear-gradient(135deg,#1240CC,#3366FF)` |
| Editable marca/modelo input | `#d1d5db / #111827 / #374151` | `var(--t-line) / var(--t-text) / var(--t-text-2)` |
| Año color — fábrica / placa / sin dato | `#f97316 / #1240CC / #6b7280` | `var(--t-amber) / var(--t-blue) / var(--t-text-3)` |
| Versión select | `#d1d5db / #fff` | `var(--t-line) / var(--t-bg)` + `color:var(--t-text)` |
| Buscar toggle btn | `rgba(18,64,204,...) + #1240CC` | `transparent + var(--t-line) + var(--t-blue)` |
| Status button colores | `#dc2626 / #1240CC` | `var(--t-red) / var(--t-blue)` |
| ID column cell | `#6b7280 / #111827` | `var(--t-text-3) / var(--t-text)` |
| DirectIdCell button/input/confirm | `rgba(18,64,204,x) / #1240CC` | `transparent/var(--t-line)/var(--t-blue)` |
| BulkIdInput label/input/apply | `#6b7280 / #a5b8e8 / #1240CC` | `var(--t-text-3) / var(--t-line) / var(--t-blue)` |
| Download Excel button | `#059669` | `var(--t-green)` |

---

## Zonas auditadas sin cambios necesarios

- **FlotaGrid.tsx** — Corregido en Fase 1
- **HojaInforme.tsx** — Corregido en Fase 1
- **analysis/vehiculos/IdentificacionMasiva.tsx** — Corregido en Fase 1

---

## Conservado intencionalmente (no tocar)

- Botones acción primaria: `linear-gradient(135deg,#1240CC,#3366FF)`
- Botones export verde: `#20c982`
- Silverdat modal: `rgba(8,22,72,0.97)` + `rgba(245,158,11,0.3)` border
- Progress bar amber fill (Silverdat brand)
- Banner SINCO VPS: amber `rgba(234,179,8,0.06)` + `rgba(234,179,8,0.2)` border
- Documental: sigue oculto en nav, accesible por URL directa

---

## Validación

```
✓ npm run build — 52 páginas compiladas, 0 errores TypeScript
✓ Turbopack compiled successfully in 10.7s
✓ Ninguna zona NO-ALCANCE modificada
✓ Sin commits, pushes ni despliegues
```
