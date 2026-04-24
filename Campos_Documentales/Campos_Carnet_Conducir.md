# DOCUMENTO: CARNET_CONDUCIR

**Nombre oficial:** PERMISO DE CONDUCCIÓN — REINO DE ESPAÑA
**Normativa:** Directiva UE 2006/126/CE (formato europeo estandarizado)
**Versiones conocidas:** V1 (formato actual, plástico, campos numéricos)

---

## CARA DELANTERA (ANVERSO)

Título visible en el documento: `PERMISO DE CONDUCCIÓN  REINO DE ESPAÑA`

| Código | Nombre del campo | Tipo | Ejemplo ficticio | Notas OCR |
|--------|-----------------|------|-----------------|-----------|
| `1` | Apellidos | texto | `GARCIA LOPEZ` | Puede ocupar 2 líneas si son apellidos largos |
| `2` | Nombre | texto | `CARLOS` | Siempre en línea propia |
| `3` | Fecha de nacimiento | fecha (DD-MM-YYYY) | `15-04-1985` | Misma línea que país de nacimiento |
| `3` | País de nacimiento | texto | `ESPAÑA` | Aparece a la derecha de la fecha en el campo 3 |
| `4a` | Fecha de expedición | fecha (DD-MM-YYYY) | `10-01-2020` | |
| `4b` | Fecha de caducidad | fecha (DD-MM-YYYY) | `10-01-2030` | |
| `4c` | Código de autoridad expedidora | texto | `28-00` | Jefatura Provincial de Tráfico. Formato: `NN-NN` |
| `5` | Número NIF/DNI | texto | `12345678-Z` | Formato: 8 dígitos + guión + letra. Puede aparecer sin guión. |
| `6` | Fotografía | imagen | — | No extraíble por OCR |
| `7` | Firma | imagen | — | No extraíble por OCR |
| `9` | Categorías vigentes | lista | `AM A1 A2 A B` | Pie del anverso. Lista de códigos separados por espacio. |

### Notas de clasificación (para el detector)
- El texto `PERMISO DE CONDUCCIÓN` es el marcador más fiable para clasificar este tipo de documento.
- Los campos usan **códigos numéricos** (`1.`, `2.`, `3.`, `4a`, `4b`, `4c`, `5.`, `9.`) como prefijo — esto es el identificador de extracción.
- El campo `3` tiene dos valores en la misma línea: fecha a la izquierda, país a la derecha.
- El campo `4c` aparece en la misma línea que `4a` (expedición), no en línea propia.

---

## CARA TRASERA (REVERSO)

El reverso contiene una tabla de categorías con sus fechas individuales, más dos campos laterales.

### Campos del margen izquierdo

| Código | Nombre del campo | Tipo | Ejemplo ficticio | Notas OCR |
|--------|-----------------|------|-----------------|-----------|
| `13` | Dirección del titular | texto | — | Opcional. En la mayoría de carnets españoles aparece en blanco. |
| `14` | Condiciones específicas del titular | texto | — | Opcional. Normalmente en blanco. |

### Tabla de categorías (columnas 9 / 10 / 11 / 12)

**⚠️ FORMATO DE FECHA EN EL REVERSO: `DD.MM.YY` (puntos, año de 2 dígitos) — distinto al anverso (`DD-MM-YYYY`)**

| Código | Nombre del campo | Tipo | Ejemplo ficticio | Notas OCR |
|--------|-----------------|------|-----------------|-----------|
| `9` | Categoría | texto | `B` | Una fila por cada categoría de la lista completa |
| `10` | Fecha de expedición de la categoría | fecha (DD.MM.YY) | `04.02.97` | Fecha en que se obtuvo esa categoría concreta |
| `11` | Fecha de caducidad de la categoría | fecha (DD.MM.YY) | `29.06.28` | Fecha límite de validez. Puede coincidir con `4b` del anverso. |
| `12` | Códigos de restricción | texto/número | `01.01` | Códigos UE de restricción. La mayoría de filas están vacías. |

### Categorías posibles (lista completa estándar UE — 15 filas fijas en el reverso)
`AM` `A1` `A2` `A` `B1` `B` `BE` `C1` `C1E` `C` `CE` `D1` `D1E` `D` `DE`

### Notas críticas para el extractor del reverso
- Las filas de categorías **no autorizadas** muestran guiones (`------` o `--------`) en las columnas 10, 11 y 12. El extractor debe ignorar estas filas — no son datos.
- Las **15 filas existen siempre** en el documento, independientemente de cuántas categorías tenga el titular. Solo tienen datos las que están autorizadas.
- Cada categoría lleva un **pictograma** (icono del vehículo) junto al código — el OCR puede generar ruido o ignorarlo. No es un campo de datos.
- El texto `A RCM-FNMT` en el margen inferior izquierdo es la impresora oficial del documento. No es un campo de datos.
- La **leyenda del reverso** (texto pequeño rotado en el margen derecho) dice: *"1. Apellidos. 2. Nombre. 3. Fecha y lugar de nacimiento. 4a. Fecha de expedición. 4b. Fecha de expiración. 4c. Expedido por. 5. Número del permiso. 10. Válido hasta el. 11. Válido desde el. 12. Códigos."* — es texto fijo del documento, no extraer.
- **Para V1 del extractor**: extraer solo el listado de categorías autorizadas del campo `9` del **anverso**.
- **Para V2 del extractor** (escalable): parsear la tabla del reverso fila a fila, extraer categoría + fechas solo cuando columna 10 no sea guiones.

---

## CAMPOS MÍNIMOS OBLIGATORIOS (para que el extractor no falle)

Los siguientes campos deben encontrarse o el documento se considera no leído:
1. `1` — Apellidos
2. `2` — Nombre
3. `4b` — Fecha de caducidad
4. `5` — Número NIF/DNI
5. `9` — Al menos una categoría

---

## EJEMPLO COMPLETO (datos ficticios)

### Anverso
```
PERMISO DE CONDUCCIÓN  REINO DE ESPAÑA

1.  GARCIA LOPEZ
2.  CARLOS
3.  15-04-1985        ESPAÑA
4a. 10-01-2020   4c. 28-00
4b. 10-01-2030
5.  12345678-Z
9.  AM  B
```

### Reverso
```
        9.          10.         11.         12.
        AM 🛵       10.01.20    10.01.30
        A1 🏍       --------    --------
        A2 🏍       --------    --------
        A  🏍       --------    --------
        B1 🚗       --------    --------
        B  🚗       10.02.97    10.01.30
        C1 🚛       --------    --------
        C  🚛       --------    --------
        D1 🚌       --------    --------
        D  🚌       --------    --------
        BE 🚗🚌     --------    --------
       C1E 🚛       --------    --------
        CE 🚛       --------    --------
       D1E 🚌       --------    --------
        DE 🚌       --------    --------
```
