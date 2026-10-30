# ORION V2 — PLAN DE EJECUCIÓN
Generado: 2026-10-13 | Responsable: SPIKE

---

## 1. INVENTARIO DE REQUISITOS

### Documentos encontrados
| Carpeta | Archivo | Tipo |
|---|---|---|
| `01_PLANTILLA_FLOTAS_MMT` | `01_SPIKE_ACTUALIZACION_PLANTILLA_FLOTAS.md` | Instrucciones |
| `01_PLANTILLA_FLOTAS_MMT` | `Plantilla_Flotas..xlsx` | Plantilla base |
| `02_DATOS_GENERALES` | `02_SPIKE_DATOS_GENERALES_Y_FECHAS.md` | Instrucciones |
| `02_DATOS_GENERALES` | `ORION_DATOS_GENERALES_FINAL_REFERENCIA.html` | Referencia visual |
| `03_ESTUDIO_INTEGRAL` | `03_SPIKE_REDISENO_INTEGRAL_ESTUDIO.md` | Instrucciones |
| `03_ESTUDIO_INTEGRAL` | `ORION_ESTUDIO_INTEGRAL_V2.html` | Referencia visual |
| `04_FLOTAS_VEHICULOS_DOCUMENTAL` | `04_SPIKE_FLOTAS_VEHICULOS_DOCUMENTAL.md` | Instrucciones |
| `04_FLOTAS_VEHICULOS_DOCUMENTAL` | `orion-flotas.html` | Referencia visual Flotas |
| `04_FLOTAS_VEHICULOS_DOCUMENTAL` | `ORION_VEHICULOS_REFERENCIA.html` | Referencia visual Vehículos |

### Proyectos reales de ORION
| Proyecto | Ruta | Stack |
|---|---|---|
| Frontend | `C:\Users\garci\Documents\GitHub\Orion_APP` | Next.js 16.1.6 + React 19.2.3 + TypeScript |
| Backend API | `C:\Users\garci\Documents\GitHub\orion-api` | Flask + SQLite (puerto 3001) |
| Admin panel | `C:\Users\garci\Documents\GitHub\orion-admin` | Next.js separado (puerto 3002) |

### Sistema de diseño actual
- **Tokens `--t-*`**: definidos en `globals.css` líneas 537-576. Son el sistema aprobado.
  - `data-theme="dark"` = Obsidian Black  
  - `data-theme="light"` = Monochrome Hybrid
- **Tokens `--orion-*`**: sistema blue gradient antiguo. A reemplazar en zonas rediseñadas.
- Dashboard y Corredores ya usan `--t-*` (aprobado y funciona).
- CarpetaScreen migrado a `--t-*` en sesión 12/10 (en local, pendiente de commit).
- `--t-blue: #4387ff` (dark) / `#2b6cb0` (light) — azul corporativo del nuevo sistema.

---

## 2. ARCHIVOS Y COMPONENTES AFECTADOS

### TAREA 01 — Plantilla Excel y coberturas nuevas
| Archivo | Tipo de cambio |
|---|---|
| `Plantilla_Flotas..xlsx` (fuente en Downloads) | Modificar: añadir ANIMALES y SEGURO DEL CONDUCTOR tras LUNAS; extender a 204 filas; eliminar pie fila 107 |
| `src/app/(dashboard)/flotas/components/types.ts` | Ampliar `FlotaRow` (si existe) o confirmar campos en ColDef de HojaOriginal/HojaTrabajos |
| `src/app/(dashboard)/flotas/components/HojaOriginal.tsx` | Añadir columnas ANIMALES y SEGURO DEL CONDUCTOR al ColDef; actualizar importador |
| `src/app/(dashboard)/flotas/components/HojaTrabajos.tsx` | Ídem; coordinar con HojaOriginal |
| `src/app/(dashboard)/flotas/components/HojaInforme.tsx` | Mostrar coberturas ANIMALES/SEGURO DEL CONDUCTOR en sección cobAnexo y descripción tipología |
| `src/core/flotas/` | Revisar parsers/importadores para mapeo por nombre de columna (no posición) |
| Plantilla final guardada en `public/` o ruta de descarga | Sustituir por versión actualizada |

**Nota técnica crítica**: la memoria `feedback_xlsx_estilos.md` documenta que xlsx v0.18.5 ignora cellStyles. Usar ExcelJS (ya instalado `^4.4.0`) para cualquier operación sobre la plantilla con formato.

### TAREA 02 — Datos Generales y fecha única
| Archivo | Tipo de cambio |
|---|---|
| `src/app/(dashboard)/flotas/components/HojaDatosGenerales.tsx` | Rediseño completo con referencia HTML; eliminar campos visuales indicados; mantener datos internos |
| `src/app/(dashboard)/flotas/page.tsx` | Cambiar tab inicial de apertura a `'DATOS GENERALES'`; asegurar que `fechaVencimiento` es el campo canónico |
| `src/app/(dashboard)/flotas/components/types.ts` | `FlotaHeader.fechaVencimiento` ya existe como opcional; verificar que todos los consumidores lo usan |
| `src/app/(dashboard)/dashboard/page.tsx` | Verificar que usa `carpeta.header.fechaVencimiento` (línea ~273) |
| `src/app/(dashboard)/flotas/components/FlotasContratadas.tsx` | Verificar fuente de vencimiento |
| `src/app/(dashboard)/flotas/components/HojaInforme.tsx` | `fechaVctoDisplay` ya usa fallback correcto (memoria confirmada) |
| `src/app/(dashboard)/flotas/components/HojaPreEmision.tsx` | Verificar que no mantiene fecha de vencimiento independiente |

**Campos a ocultar visualmente** (no borrar datos): Importar Excel (en DatosGenerales), bloque Póliza vigente, Póliza actual, Tarifa acordada, Fecha inicio, Fecha emisión, Efecto duplicado, Periodicidad duplicada.

**Conservar para otros componentes**: `efecto` (OFERTA recibos línea ~660), `fechaEmision` (recibos.ts cálculo períodos), `periodicidad` (HojaOferta + recibos.ts).

**Bug a corregir**: `autoCompletarAno()` en HojaDatosGenerales hace suposición silenciosa de año en fecha dd/mm. El documento pide evitarlo.

### TAREA 03 — Estudio integral (8 hojas)
| Archivo | Tipo de cambio |
|---|---|
| `src/app/(dashboard)/flotas/page.tsx` | Encabezado global; pestañas flotas abiertas con X; migrar a `--t-*` |
| `src/app/(dashboard)/flotas/components/CarpetaScreen.tsx` | Ya migrado a `--t-*` (sesión 12/10); verificar y ajustar si falta algo |
| `src/app/(dashboard)/flotas/components/HojaDatosGenerales.tsx` | Ya cubierto en T02 |
| `src/app/(dashboard)/flotas/components/HojaAutomatico.tsx` | Visual `--t-*`; conservar 3 pasos reales |
| `src/app/(dashboard)/flotas/components/HojaOriginal.tsx` | Visual `--t-*`; coordinar nuevas coberturas T01 |
| `src/app/(dashboard)/flotas/components/HojaTrabajos.tsx` | Visual `--t-*`; coordinar nuevas coberturas T01 |
| `src/app/(dashboard)/flotas/components/HojaSincoUnificado.tsx` | Visual `--t-*`; flujo vertical conservado |
| `src/app/(dashboard)/flotas/components/HojaInforme.tsx` | Visual `--t-*`; eliminar botón CALCULAR ORION tras verificar dependencias |
| `src/app/(dashboard)/flotas/components/HojaOferta.tsx` | **NO REDISEÑAR**; solo adaptar elementos externos compartidos |
| `src/app/(dashboard)/flotas/components/HojaPreEmision.tsx` | Visual `--t-*`; conservar catálogo |
| `src/app/(dashboard)/flotas/components/HeaderBlock.tsx` | Visual `--t-*` |

### TAREA 04 — Flotas portfolio, Vehículos, Documental
| Archivo | Tipo de cambio |
|---|---|
| `src/app/(dashboard)/flotas/page.tsx` | Portfolio: eliminar fondo azul marino; indicadores numéricos sin tarjetas; tabla `--t-*` |
| `src/app/(dashboard)/analysis/vehiculos/page.tsx` | Rediseño Identificar + Masivo con referencia HTML |
| `src/app/(dashboard)/analysis/vehiculos/IdentificacionMasiva.tsx` | Visual `--t-*`; conservar procesamiento real |
| `src/components/saas/layout/Topbar.tsx` | Ocultar enlace Documental de la barra global (reversible) |
| `src/app/(dashboard)/gestion-documental/page.tsx` | **NO TOCAR**: solo ocultar navegación |

---

## 3. DEPENDENCIAS ENTRE TAREAS

```
T01 (Plantilla) ──────────────────────────────────►  T03 (ORIGINAL+TRABAJO nuevas columnas)
                                                        │
T02 (Datos Generales + fecha única) ──────────────►  T03 (Datos Generales integrado)
                                                        │
                                                     T03 (Estudio completo)
                                                        │
T04 usa fecha canónica de T02 ◄──────────────────────┘
```

**Orden estricto**: T01 → T02 → T03 → T04

T03 integra el resultado de T01 (columnas nuevas) y T02 (Datos Generales). No empezar T03 si T01 y T02 no están verificadas.

T04 necesita que el vencimiento canónico (`carpeta.header.fechaVencimiento`) esté consolidado por T02.

---

## 4. RIESGOS TÉCNICOS

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| ExcelJS para editar plantilla — dynamic import requerido (memoria) | Media | Alto | Usar dynamic import de ExcelJS; no usar xlsx para estilos |
| `autoCompletarAno()` en HojaDatosGenerales puede perder fechas históricas | Media | Alto | Solo eliminar el auto-complete del UI; conservar parseFechaHoja |
| Conflicto fecha TRABAJO vs header al abrir flotas antiguas | Alta | Medio | Leer ambas, mostrar discrepancia, no sobrescribir; documentar |
| Botón CALCULAR ORION puede tener listeners o dependencias ocultas | Media | Medio | Auditar antes de eliminar; solo eliminar el botón, no el cálculo |
| Pestañas abiertas (flotas abiertas) — estado compartido en page.tsx | Media | Medio | Usar el estado openCarpetas ya existente; no reinventar |
| CarpetaScreen migrado en local pero no commiteado — branch out of sync | Alta | Alto | Verificar git status antes de cualquier cambio |
| Documental oculto pero rutas directas aún accesibles | Baja | Bajo | Documentar comportamiento; no agregar redirect destructivo |
| react-data-grid en ORIGINAL/TRABAJO — no modificar motor | Alta (si se toca) | Crítico | Solo estilos CSS sobre `.rdg-*`, nunca cambiar el componente |

---

## 5. ESTRATEGIA DE COPIAS DE SEGURIDAD

### Datos críticos en localStorage
El almacenamiento de carpetas/estudios vive en localStorage del navegador. Una copia de archivos del repositorio **NO respalda** estos datos.

**Antes de empezar**:
1. Abrir ORION en el navegador con los estudios reales.
2. Exportar manualmente cada estudio importante usando "Descargar todo".
3. Guardar esos ZIPs en una carpeta externa segura.
4. Verificar que los JSONs del localStorage se pueden exportar (ver instrucciones abajo).

**Exportar localStorage** (ejecutar en consola del navegador):
```js
// Exportar todas las carpetas
const data = {};
for (let i = 0; i < localStorage.length; i++) {
  const k = localStorage.key(i);
  data[k] = localStorage.getItem(k);
}
console.log(JSON.stringify(data, null, 2));
// Copiar y guardar en archivo .json
```

### Copias de archivos de código
Antes de cada tarea, crear backup de los archivos que se van a modificar:
```
Orion_APP/src/app/(dashboard)/flotas/components/HojaDatosGenerales.tsx.bak_v2_preT02
Orion_APP/src/app/(dashboard)/flotas/page.tsx.bak_v2_preT02
etc.
```
El proyecto ya tiene precedente de usar `.bak` y `.bak2` — seguir ese patrón.

### Base de datos orion-api
El VPS tiene los datos reales. En local solo hay `orion-api/orion.db` que es una copia de trabajo. No se modificará la BD durante este paquete de mejoras (las tareas son todas frontend excepto los nuevos campos de API si aplica).

---

## 6. ESTRATEGIA DE COMPATIBILIDAD

### Plantilla Excel (T01)
- El importador debe detectar columnas **por nombre** (header matching), no por posición.
- Para plantillas antiguas sin ANIMALES/SEGURO DEL CONDUCTOR: los campos quedan vacíos/undefined — no inventar `'No'` por defecto en registros existentes.
- Para plantillas nuevas: procesar normalmente.
- Conservar compatibilidad con los valores actuales de todas las demás columnas.

### Estudios guardados (T02)
- `FlotaHeader.fechaVencimiento` ya existe como campo opcional en tipos.
- Los estudios sin ese campo simplemente mostrarán vacío en el nuevo input de fecha.
- No hacer migración automática de `efecto` → `fechaVencimiento`.
- El Dashboard ya usa `fechaVencimiento` como primera opción; comportamiento sin cambios.

### Estilos (T03/T04)
- Los tokens `--t-*` ya existen en globals.css y coexisten con `--orion-*`.
- Las zonas no rediseñadas seguirán usando `--orion-*` sin conflicto.
- No borrar tokens antiguos: pueden ser usados por componentes fuera del alcance.

---

## 7. PRUEBAS PREVISTAS

### T01
- [ ] Descargar nueva plantilla y verificar 200 filas, sin firma en fila 107
- [ ] Comprobar desplegables Si/No en ANIMALES y SEGURO DEL CONDUCTOR
- [ ] Importar plantilla nueva y verificar mapeo correcto de columnas
- [ ] Importar plantilla antigua y verificar que no se desplazan columnas
- [ ] Guardar y recuperar estudio con ambas coberturas
- [ ] Generar Informe SINCO con vehículos con combinaciones distintas
- [ ] Verificar integridad del XLSX abriéndolo en Excel real

### T02
- [ ] Abrir estudio nuevo → abre en Datos Generales
- [ ] Abrir estudio antiguo → abre en Datos Generales
- [ ] Guardar fecha de vencimiento y verificar en Dashboard
- [ ] Verificar fecha en FlotasContratadas
- [ ] Verificar fecha en INFORME
- [ ] Verificar que OFERTA conserva `efecto` y `periodicidad`
- [ ] Verificar que recibos no cambian sus fechas

### T03
- [ ] Las 8 hojas cargan sin errores de consola
- [ ] Alternar entre hojas conserva datos
- [ ] Pestañas abiertas: cambiar expediente sin volver al listado
- [ ] Cerrar pestaña: no elimina expediente, avisa si hay cambios sin guardar
- [ ] Guardar y recuperar en ambos temas
- [ ] OFERTA sin cambios de diseño
- [ ] Descargar todo genera archivos válidos

### T04
- [ ] Flotas: indicadores reales (no hardcoded del HTML)
- [ ] Flotas: filtros funcionan en ambos temas
- [ ] Flotas: fecha vencimiento procede de `header.fechaVencimiento`
- [ ] Vehículos Identificar: consulta real funciona
- [ ] Vehículos Masivo: descarga plantilla, sube Excel, procesa
- [ ] Documental: no aparece en Topbar
- [ ] Escáner: sigue apareciendo

---

## 8. ORDEN DE EJECUCIÓN POR FASES

### FASE 0 — Pre-arranque (antes de cualquier código)
1. Verificar git status del proyecto: confirmar qué está commiteado y qué no
2. Exportar localStorage con estudios reales (ver sección 5)
3. Copiar plantilla Excel de Downloads a directorio de trabajo

### TAREA 01 — Plantilla Excel y coberturas (4 subfases)
**01-A**: Editar `Plantilla_Flotas..xlsx` con ExcelJS
  - Eliminar texto fila 107
  - Añadir columnas ANIMALES y SEGURO DEL CONDUCTOR con validación Si/No
  - Extender formato, bordes, validaciones hasta fila 204
  - Guardar plantilla actualizada en `public/` o ruta de descarga

**01-B**: Actualizar tipos
  - `types.ts`: confirmar/añadir campos en tipos de vehículo

**01-C**: Actualizar HojaOriginal y HojaTrabajos
  - Añadir ColDef para las dos nuevas columnas
  - Actualizar importador por nombre de columna
  - Verificar compatibilidad con plantillas antiguas

**01-D**: Actualizar HojaInforme
  - Mostrar ANIMALES y SEGURO DEL CONDUCTOR en cobAnexo
  - No atribuir cobertura a tipología si no todos los vehículos la tienen
  - Verificar PDF

### TAREA 02 — Datos Generales y fecha única (3 subfases)
**02-A**: Cambiar tab de apertura inicial en `flotas/page.tsx`
  - Default `activeTab = 'DATOS GENERALES'` al abrir desde listado

**02-B**: Rediseño visual de HojaDatosGenerales
  - Implementar layout del HTML de referencia con tokens `--t-*`
  - Eliminar campos visuales indicados (sin borrar datos)
  - Conservar lógica de guardado, corredor, historial previo

**02-C**: Unificar fuente de vencimiento
  - Auditar consumidores de `fechaVencimiento`
  - Verificar Dashboard, FlotasContratadas, Informe, Pre-emisión
  - Documentar discrepancias si las hay; no sobrescribir silenciosamente

### TAREA 03 — Estudio integral (6 subfases = fases A-F del MD)
**03-A**: Sistema común (page.tsx)
  - Encabezado con `--t-*`; pestañas abiertas con X; navegación superior

**03-B**: Datos Generales y Automático (ya cubierto por T02; adaptar Automático)

**03-C**: ORIGINAL y TRABAJO
  - Aplicar `--t-*`; coordinar nuevas columnas de T01

**03-D**: SINCO e INFORME
  - Flujo vertical SINCO; eliminar botón CALCULAR ORION (previa auditoría)
  - Resumen económico con valores reales

**03-E**: OFERTA y PRE-EMISIÓN
  - OFERTA: solo adaptar encabezado/pestañas externas, nada más
  - PRE-EMISIÓN: estilos `--t-*`; conservar catálogo

**03-F**: Descargar todo
  - Auditar qué genera actualmente
  - Corregir archivos vacíos o rotos
  - No sustituir por HTML estático

### TAREA 04 — Flotas, Vehículos, Documental (4 subfases)
**04-1**: Auditoría localizada de componentes reales

**04-2**: Portfolio Flotas
  - Eliminar fondo azul marino
  - Indicadores grandes sin tarjetas
  - Tabla con `--t-*`

**04-3**: Vehículos (Identificar + Masivo)
  - Aplicar layout HTML de referencia
  - Conservar procesamiento real; no reimplementar motores

**04-4**: Documental
  - Ocultar enlace en Topbar
  - Documentar comportamiento de ruta directa

---

## 9. REGLA DE VALIDACIÓN ANTES DE AVANZAR

Cada tarea se valida con:
1. TypeScript: `next build` sin errores de tipo
2. Compilación: `npm run build` exitosa
3. Pruebas funcionales en navegador (ambos temas)
4. Ningún dato de demostración hardcodeado

**No avanzar a la siguiente tarea si la anterior rompe funcionalidades existentes.**

---

## 10. DOCUMENTOS A GENERAR

Al completar cada tarea:
- `ORION_TAREA_01_PLANTILLA_FLOTAS_RESULTADOS.md`
- `ORION_TAREA_02_DATOS_GENERALES_RESULTADOS.md`
- `ORION_TAREA_03_ESTUDIO_INTEGRAL_RESULTADOS.md`
- `ORION_TAREA_04_FLOTAS_VEHICULOS_DOCUMENTAL_RESULTADOS.md`

Al finalizar el paquete:
- `ORION_V2_INFORME_FINAL.md`

---

## ESTADO ACTUAL

| Tarea | Estado |
|---|---|
| T01 — Plantilla Excel | PENDIENTE |
| T02 — Datos Generales | PENDIENTE |
| T03 — Estudio integral | PENDIENTE |
| T04 — Flotas/Vehículos/Documental | PENDIENTE |

**Próximo paso**: FASE 0 — verificar git status y estado del código antes de empezar T01.
