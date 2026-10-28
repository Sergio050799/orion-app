# ORION · Sistema de diseño v1

Fuente única para **Zonas**, **Informes** y **Plantillas**. Si algo no está aquí, no se inventa en cada pieza: se añade aquí primero.

## 1. Principios
1. **Simplicidad V6, distribución V3.** Sin tarjetas con borde: la jerarquía la dan las reglas finas, el tamaño y el espacio.
2. **El número es el protagonista.** Primero la cifra, después el gráfico, al final el detalle.
3. **Todo dato se puede auditar.** Clic en cualquier gráfico, KPI o fila abre un panel con la lectura ampliada y, al final, el **Anexo de fórmulas**. Los informes terminan con el mismo anexo, resumido.
4. **Una identidad para tres soportes.** Mismos tokens, mismo orden de lectura, misma voz en pantalla, PDF y Excel.

## 2. Marca: ORION y cliente
| Marca | Dónde aparece | Fuente del dato |
|---|---|---|
| **ORION** (hexágono con satélite + palabra) | Cabecera de la app, login, pie de informes y plantillas ("Generado con ORION") | Fijo |
| **Cliente** (nombre y logo) | Eyebrow de cada zona, cabecera de informes, cabecera de plantillas y ofertas | `cliente.nombre`, `cliente.logo` — cambia con el cliente activo |

- Logo ORION: `assets/orion-logo-white.png` (fondo oscuro) y `assets/orion-logo-ink.png` (fondo claro y PDF). Misma forma que el original, solo cambia la tinta. En CSS se usa como máscara con `currentColor`.
- Área libre alrededor del logo: ½ de su alto. Tamaño mínimo: 20 px en pantalla, 7 mm en papel.
- Si el cliente no tiene logo, se muestran sus iniciales en un cuadrado con borde, nunca el logo de ORION.

## 3. Color
Tokens en `tokens.css`. Oscuro por defecto; claro bajo `[data-theme="light"]`.
- **Neutros:** `--bg` negro azulado `#0d111b`, `--soft`, `--hover`, `--line`; tinta en tres niveles (`--text`, `--sub`, `--quiet`).
- **Acento único:** `--blue`. Se usa en navegación activa, series actuales, enlaces y botón principal. Nada más lleva acento.
- **Estados de cartera:** gama de azules de un solo tono. Contratadas = azul más intenso, En estudio = intermedio, Ofertadas = claro, Rechazadas = gris azulado (fuera de la gama). Siempre con etiqueta y cifra, nunca solo color. Validada con el validador ordinal de dataviz (luminosidad monótona, saltos visibles, un solo tono).
- **Aviso:** ámbar `--warn`, solo para urgencias (vencimientos en menos de 15 días).

## 4. Tipografía
- **Display:** Space Grotesk 500–600, para títulos de zona y cifras de KPI (`letter-spacing` −.05em en cifras grandes).
- **Cuerpo:** Inter 400–600. Cifras siempre con `tabular-nums`.
- **Etiquetas:** 10–11 px, mayúsculas, `letter-spacing` .08–.17em, color `--quiet`.
- Escala: 10 · 11 · 12 · 14 · 17/22 (títulos) · 34–48 (H1) · 30–48 (KPI).

## 5. Estructura de zona (Dashboard, Corredores, Estudio, Flotas, Vehículos)
1. Cabecera fija: logo ORION, 6 zonas, entorno, tema, usuario.
2. Introducción: eyebrow con **cliente · zona**, H1, fecha y acciones (filtro + informe).
3. Fila de 5 KPIs separados por reglas verticales.
4. Rejilla de análisis en dos columnas (1,46 : 1) con regla vertical.
5. Rejilla inferior en dos columnas: tablas.
6. Panel de detalle lateral, igual en todas las zonas.
7. Pie con "ORION · datos de demostración".

## 6. Gráficos: forma según el trabajo del dato
| Trabajo | Forma | Regla |
|---|---|---|
| Tendencia con comparación | Curva con relleno, periodo actual vs anterior punteado | Una sola escala. Interpolación monótona: la curva nunca supera los valores reales. Punto final relleno y etiquetas directas |
| Cifra principal | KPI con variación | Una cifra no es un gráfico |
| Parte de un todo (≤ 6) | Anillo con lista | La lista lleva cifra y porcentaje |
| Magnitud entre categorías | Barras horizontales de **un solo color** | Sin rampa de color por barra |
| Ranking | Barras ordenadas, la seleccionada resaltada | El resto, en el mismo azul más tenue |
| Pocas filas con fecha | Tabla | Sin gráfico |
- Nunca doble eje. Dos magnitudes distintas = pestañas o dos gráficos.
- Cuadrícula tenue, ejes recesivos, marcas finas (línea 2,6 px, barras 8 px).
- Hover: cruz + tooltip con valor actual, anterior y variación. Zona de clic mayor que la marca.

## 7. Panel de detalle (clic en cualquier gráfico)
Orden fijo: **etiqueta de tipo → título → descripción → 2-4 cifras → desglose (tabla) → Anexo · cómo calcula ORION.**
El anexo lista cada fórmula con su sustitución numérica real. Es lo que permite a dirección auditar un resultado.

## 8. Informes (A4)
Misma maqueta para todos: cabecera con **cliente** a la izquierda y referencia/fecha a la derecha → eyebrow y título → datos del tomador → banda de KPIs → secciones numeradas → **Anexo de fórmulas resumido (siempre última sección)** → pie "ORION · Documento confidencial · Generado con ORION · página x de y".

## 9. Plantillas (Excel / ZIP)
Cabecera con nombre del cliente, bloque de datos (CIF, tomador, vencimiento), cabeceras de tabla en `--blue`, filas con banda `--soft`, cifras alineadas a la derecha, pie con marca ORION. Mismas columnas y nombres que los informes.

## 10. Movimiento
Entrada de curva 1,05 s con `ease-out`; barras 0,85 s; panel lateral 0,35 s. Botones suben 1 px al pasar. Se respeta `prefers-reduced-motion`.

## 11. Reglas añadidas en la revisión 2
- **Saludo** ("Buenos días / tardes / noches, {usuario}") como H1 de la zona. Sin eyebrow de cliente en pantalla; el cliente vive en pie, informes y plantillas.
- **Filtro de cartera** (Toda · En estudio · Ofertadas · Contratadas · Rechazadas): cambia KPIs, gráfico, anillo, categorías, corredores, renovaciones y actividad. Los paneles de detalle también respetan el filtro.
- **Líneas verticales alineadas:** KPI 3|4 = gráfico|estado = categorías|corredores (60 %); KPI 2|3 = renovaciones|actividad (40 %). Rejillas 3fr|2fr y 2fr|3fr.
- **Controles del gráfico fijos** a la izquierda, encima de las cifras: no se mueven al cambiar de magnitud o periodo.
- **Sin enlaces de texto** ("ver detalle", "historial", flechas). Todo lo visual es pulsable y abre el panel de detalle.
- **Vehículos por categoría** muestra por categoría: en estudio, ofertados, contratados, rechazados y total, con barra apilada y tasa de contratación en el detalle.
- **Actividad reciente:** operación, módulo, usuario, hora. Al pulsar, el panel muestra qué hizo, sobre qué flota, en qué zona y el antes/después de cada campo.
- **Sugerencias de mejora** al final de cada zona.
- **Escala tipográfica** subida: mínimo 12 px en etiquetas, 13–14,5 px en datos secundarios, 15 px en cuerpo.
- **Vista de dispositivo:** añadiendo `#vista` a la URL aparecen los botones PC, Tableta y Móvil. El diseño responde al ancho del contenedor, no de la ventana.

## 12. Formato de números (regla de ORION)
- **Miles con punto, decimales con coma**, también en cifras de cuatro dígitos: `2.055`, `1.316.000 €`, `29,4 %`.
- Porcentaje y euro llevan un espacio antes del símbolo: `50 %`, `100.316,00 €`. Variaciones con signo: `+24,2 %`, `−33,3 %` (signo menos tipográfico).
- Se aplica igual en pantalla, informes (PDF) y plantillas (Excel con formato `es-ES`). Una sola función de formato por soporte, nunca a mano.
- Fechas `24/10/2026` en tablas y `24 de octubre de 2026` en textos.

## 13. Listas largas y alineación
- **Listas largas** (más de 7 elementos, p. ej. corredores): se muestran los 7 primeros y una fila final «Otros (n)» que suma el resto. La lista completa, ordenada, está en el panel de detalle.
- **Alineación:** primera columna a la izquierda; todas las columnas de datos **centradas** bajo su cabecera, en tablas de pantalla, paneles de detalle e informes.
- Las cifras destacadas de una misma zona (p. ej. total y variación del gráfico) tienen el **mismo tamaño**.

## 14. Pendiente de funcionalidad (anotado, no diseñado aún)
- **Flotas históricas rellenables:** las flotas de hace dos años no tienen vehículos. Alta manual por **tramos** (10 · 25 · 50 · 100 · 250 · 500 · 1.000 · más de 1.000 vehículos) y categorías presentes (1ª, 2ª, 3ª), para que los KPI de vehículos y la comparación interanual funcionen. En el Dashboard se marcan las cifras estimadas.

## 15. Zona Corredores (v2) — control de datos
La zona **es el maestro de corredores**: alta, edición, eliminación y asignación de flotas. Se conecta con **Estudio** (nueva flota ya asignada al corredor) y **Flotas** (la flota vinculada aparece bajo su corredor).
- Estructura: H1 + botones «Nuevo corredor» (principal) y «Descargar informe» → filtros globales (sucursal, comercial, estado) → 5 KPI (corredores con desglose Titán/Mediación, flotas asignadas y sin corredor, tasa de contratación, **comisión media** simple y ponderada, prima ofertada) → «Cartera por corredor» | «Titán y Mediación» → Directorio → pie. **Sin panel de sugerencias en esta zona.**
- Sucursales: **Titán** y **Mediación** (valores `TITAN`, `MEDIACION`) más «Sin asignar». Un corredor pertenece a una; sus flotas, también.
- Directorio: Corredor (con código), Sucursal, Comercial, CIF, Comisión, Periodicidad, Flotas, Contratación. Se ordena pulsando la cabecera (la activa va en azul con subrayado). Buscador ancho: nombre, CIF, comercial o código. Pagina de 20 en 20. Sin columna de última actividad.
- Escala: probado con 120 corredores y 440 flotas. Gráficos: top 7 + «Otros corredores (n)»; listas de panel: 8 y «Mostrar más»; vincular flotas con buscador.
- Formulario simplificado: Nombre (único obligatorio), Sucursal, Comercial, CIF, Comisión %, Periodicidad. «Contacto y datos del perceptor» (email, teléfono, código, ID perceptor, observaciones) va plegado. Código `COR-nnn` automático. Valida comisión 0–100, CIF repetido y email.
- Ficha del corredor (panel): acciones Editar, Nueva flota, Vincular flotas, Eliminar; ficha completa; flotas vinculadas con Desvincular (confirmación en línea); vincular con buscador (flotas sin corredor primero; mover desde otro corredor); eliminar pregunta si las flotas quedan sin corredor o se eliminan.
- La tasa de contratación se calcula siempre sobre toda la cartera del corredor.

## 16. Sin flechas
Ninguna flecha ni chevrón en ORION: ni en botones, ni en migas, ni en variaciones, ni en selectores. Los selectores usan el icono de filtro (tres líneas); las secciones plegables, «+» y «−». El orden de una tabla se indica con la cabecera activa y el texto del subtítulo.

## 17. Comerciales
- El comercial es una entidad propia y **trabaja en una sola sucursal** (Titán o Mediación). Se crea desde «Nuevo comercial» (arriba, junto a «Nuevo corredor») o desde el formulario del corredor, con la sucursal obligatoria.
- Antidúplicados: ORION compara el nombre sin tildes, mayúsculas ni orden («Santos Laura» = «Laura Santos») y avisa de nombres casi iguales («Laura Santoz»). Si existe, indica cuál usar.
- En el formulario de corredor el selector de comercial solo muestra los de la sucursal elegida; al elegir un comercial se rellena su sucursal.
- Los filtros de la zona listan los comerciales de esta entidad, tengan o no corredores.

## 18. Zona Estudio de flotas (v2)
Es donde se pasa el 80 % del tiempo: estudiar, sacar oferta, descargar proyectos. Dos vistas: **lista de carpetas** y **zona de trabajo** de cada flota. Ficheros del repo que sustituye: `flotas/page.tsx`, `CarpetaScreen.tsx`, `HojaDatosGenerales.tsx`, `HojaAutomatico.tsx`, `HojaOriginal.tsx`, `HojaTrabajos.tsx`, `HojaSinco*.tsx`, `HojaInforme.tsx`, `HojaOferta.tsx`, `HojaPreEmision.tsx`, `FichaContratada.tsx`.
- **Lista:** H1 + «Nueva carpeta» (principal), «Plantilla», «Descargar informe» → filtros Estado (por defecto «En estudio»), Sucursal, Corredor → 5 KPI → «Dónde está cada estudio» (embudo por primer paso pendiente) | «Requieren atención» → tabla Carpetas (Carpeta, Corredor, Sucursal, Veh., Estado, Avance x/8, Modificada), buscador ancho, orden por cabecera, 20 por página.
- **Zona de trabajo:** «Todas las flotas», chips de carpetas abiertas (×), chip **Silverdat conectado (naranja) / desconectado (rojo)**, cabecera (nombre, corredor, sucursal, vehículos, estado) con Guardar · Cambiar estado · Descargar todo, y 8 pestañas con punto de completado.
- **Estados (5):** En estudio · **Estudiada** (nuevo: el usuario marca que el estudio está terminado, aún sin oferta enviada) · Ofertada · Contratada · Rechazada. Contratada exige fecha; Rechazada, motivo. Las contratadas abren una **ficha** («Abrir estudio» vuelve a los pasos). Color de Estudiada: lavanda `--st-estudiada`. El Dashboard y Corredores siguen mostrando 4 estados hasta que se actualicen (pendiente: añadir «Estudiada» allí).

## 19. Mejoras de funcionalidad por zona (leer antes de implementar)
Lista de cambios sobre el comportamiento original. Todo lo que no aparece aquí se mantiene como está en el código actual.

### Corredores (afecta también a Estudio paso 01)
1. **Comisión base y comisión extra.** El corredor tiene `comisionBase` (siempre) y `comisionExtra` (solo si llega a los objetivos de la compañía). Sustituye al campo único `porcentajeComision`. Formulario: «Comisión base %» y «Comisión extra %» (ambas 0–100). Directorio: columnas «Com. base» y «Com. extra». KPI: comisión **base** media (simple y ponderada por flotas) + extra media.
2. **Comercial** pertenece a una sola sucursal; alta con antiduplicados (ver §17).

### Estudio · lista
3. Nuevo estado **Estudiada** (ver §18). Filtro, KPI, tabla y panel de atención lo incluyen.
4. Ordenar por cualquier columna (cabecera activa en azul). Se mantiene.

### Paso 01 · Datos generales (`HojaDatosGenerales.tsx`, `FlotaHeader`)
5. **Comisión de la flota:** dos campos, «Comisión base %» y «Comisión extra %», que parten de los del corredor; si difieren se avisa «Distinta a la del corredor». Al cambiar de corredor se reinician.
6. **Actividad y Periodicidad** son desplegables. **Forma de pago** es un desplegable con dos valores: **Interna** o **Externa**.
7. **Varios tomadores:** lista con nombre y CIF, botón «Añadir tomador», uno marcado como **principal** (sale en informe y oferta; el resto se cuenta como «+n tomadores»). Se mantiene un único «CIF empresa».
8. **Se elimina «Nº póliza actual»** de la ficha (sigue existiendo por vehículo en Original/Trabajo).
9. **Una sola fecha:** «Fecha de efecto» = vencimiento de la póliza actual = efecto de la nueva (normalmente la flota se emite en esa fecha). Se quitan «Fecha de efecto», «Fecha de inicio» y «Vencimiento» sueltos. **Informes:** muestran esa fecha como *fecha de vencimiento*. **Dashboard y Flotas:** usan esa fecha como *fecha de efecto* y calculan de ella el **vencimiento interno de ORION** (+1 año). Campo derivado, solo lectura.

### Paso 02 · Automático (`HojaAutomatico.tsx`)
10. El paso 3 tiene **solo dos modos**, en este orden: **Solo plantilla** (por defecto) y **Con Silverdat**. Se quita «Procesado automático».
11. **Silverdat** al elegirlo (o al pulsar el chip) abre una **ventana emergente** con tres campos: **Nº de cliente DAT, Usuario, Contraseña**. Las credenciales no se guardan. Hay opción de **Desconectar**.
12. **Color de Silverdat** (`--silver`, naranja): *conectado* = naranja (`--silver`); *desconectado* = rojo (`--sdoff`). Visible siempre en la cabecera de la zona de trabajo y en los botones de Silverdat, para saber cuándo está activo y se está pagando. Sin conexión no se puede procesar con Silverdat ni añadir columnas Silverdat en Trabajo.
13. «Ajuste global %» sustituye a «Descuento global %» (ver 24). «Confirmar oferta» se sustituye por «Ver oferta».

### Pasos 03 Original · 04 Trabajo · 05 SINCO — solo lectura y flujo lineal
14. Las tres hojas **no se editan en pantalla** (se retiran «Rellenar a mano» y la edición en celdas). Para modificar: **descargar la plantilla rellena, editarla y subirla**.
15. **Flujo lineal:** Original → Trabajo → SINCO → Informe → Oferta → Pre-emisión. Un cambio en Original se propaga a **todos** los pasos siguientes. Un cambio en Trabajo se propaga a SINCO, Informe, Oferta y Pre-emisión, pero **Original no se modifica nunca**; solo cambia al subir otra plantilla.
16. Al subir plantilla se **conservan** los datos del paso 02 (**prima solicitada y tipología**), los ajustes de oferta, las primas MMT y texto editados del informe y los IDs de catálogo ya asignados (misma matrícula). Si cambian matrículas, hay que repetir la consulta SINCO. El panel lateral «Subir plantilla» lo explica antes de cargar.
17. SINCO queda **tal cual** (consulta, importación, KPI con anexo de fórmulas).

### Paso 04 · Trabajo — normalizar Nº póliza SINCO (`normalizarPoliza`, `detectarClaveFlota`)
18. El aviso de «Posible clave de flota» pasa **abajo del todo** de la hoja y solo aparece si las pólizas comparten un comienzo largo (≥ 6 dígitos comunes y ≥ 8 vehículos). Opciones: **5 últimos dígitos** (por defecto) o **«Se repite hasta el dígito N»**: ORION cambia esos N primeros dígitos por ceros y **después** toma los 5 últimos. Hay vista previa (3 columnas: póliza actual, 5 últimos, con ceros) y «Volver a los 5 últimos». El cambio llega a la consulta SINCO, al informe y a pre-emisión.
19. Las cabeceras de todas las tablas son **más oscuras en modo claro y más claras en modo oscuro** (`--head`).

### Paso 06 · Informe (`HojaInforme.tsx`)
20. Campos **editables**: la **prima MMT unitaria** de cada tipología × cobertura (clave `tipo||cobertura`, guardada como `primasMmtInforme`), la interpretación técnica y su texto. Valor por defecto: el de la oferta (prioridad) y, si no, el de la tarifa. Botón «Recalcular desde la oferta». Las celdas distintas del defecto se marcan en ámbar.
21. Tabla de primas con columnas: **Tipología · Cobertura · Nº Veh. · Prima solicitada (unitaria) · Total solicitada · Prima MMT (unitaria, editable) · Total MMT · Diferencia**. Total = prima unitaria × Nº Veh.; Diferencia = Total MMT − Total solicitada. La cabecera «Veh.» pasa a **«Nº Veh.»**.
22. Se incluye la **consulta SINCO global de la flota y desglosada por tipología** (Nº Veh., con SINCO, siniestros, antigüedad, siniestros/año, frecuencia), con su anexo de fórmulas.
23. El tomador mostrado es el principal (+n); la fecha es la de vencimiento (ver 9). El PDF y el Excel descargables se rediseñan en la fase de informes y plantillas.

### Paso 07 · Oferta (`HojaOferta.tsx`)
24. Se **quita el descuento global** y se sustituye por **«Ajuste global %»** (aumento o disminución, con signo). Fórmula: prima = tarifa × (1 + ajuste cobertura) × (1 + ajuste global).
25. Se **retira «Confirmar oferta»**: el cambio de estado se hace arriba con «Cambiar estado». Queda «Descargar oferta (Excel)».

### Paso 08 · Pre-emisión (`HojaPreEmision.tsx`, `/api/catalogo/search`)
26. Es la zona donde se **busca el vehículo en el catálogo**. El algoritmo sugiere modelos según los datos disponibles; por fila: si hay **candidatos** → desplegable «Seleccionar acabado» con % de coincidencia + botón «Buscar»; si **no hay** → «Sin coincidencias · Buscar» (panel de búsqueda manual por marca, modelo y año); si ya está **asignado** → versión + × para cambiar. El ID y el año son editables (Enter para volver a buscar).
27. **IDs idénticos:** al asignar una versión, ORION aplica **automáticamente el mismo ID** a los vehículos sin asignar con misma marca, modelo, kW y tipo (`strictKey`). Para los **muy parecidos** (misma marca y modelo, kW dentro del 5 %) abre una ventana emergente con casillas, mostrando las diferencias, y se aplica solo a los marcados (`areSimilar`, `SimilarModal`). Contador «Grupos con el mismo ID» y marca «mismo ID ×n» en la fila.
28. Estados de fila: Asignado, Pendiente, Sin catálogo (se retira «Similar» como estado). «Generar pre-emisión» exige que no queden pendientes.

### Datos y supuestos a confirmar con Sergio
- Forma de pago *Interna* = cobramos nosotros; *Externa* = cobra el corredor y nos paga a nosotros (CONFIRMADO).
- Fecha única: se asume que *fecha de efecto* = *vencimiento de la póliza actual*, y que el vencimiento interno de ORION es efecto + 1 año.
- Estudiada es un estado manual (no se marca solo al completar los 8 pasos).
- Silverdat: naranja = conectado, rojo = desconectado (CONFIRMADO).

## 20. Zona FLOTAS (registro y control de flotas)

**Para qué sirve:** es el registro único de TODAS las flotas (cualquier estado, también años anteriores). Se usa como control: saber si nos piden una flota que ya estudiamos, qué se hizo y por qué se rechazó.
**Sustituye en el original:** `FlotasContratadas.tsx`, `FichaContratada.tsx`, `api/flotas/historicas`, `api/flotas/importar`.

Estructura (`flotas.main.html`, `flotas.js`, `flotas.css`):
1. **Comprobar flota**: buscador ancho (nombre, CIF o tomador). Coincidencia exacta de CIF = 100, mismo nombre = 95, contiene = 70, parecido (distancia ≤ 2) = 50; también mira otros tomadores. Resultado con tres mensajes: «Ya hay un estudio en curso», «Ya tenemos esta flota», «Hay flotas con nombre parecido» o «No hay ninguna flota» (con botón Nueva carpeta). Cada resultado muestra estado, último movimiento, corredor, nº estudios y vehículos, y «Ver ficha».
2. Filtros: estado, sucursal, corredor, vencimiento próximo (60 días).
3. KPI: Flotas registradas, Tasa de contratación, Vencen en 60 días, Estudios rechazados, Prima contratada. Todos abren panel con Desglose y anexo de fórmulas.
4. Gráficos: Vencimientos de las contratadas (12 meses) y Por qué se rechazan (top 7 + Otros). Clic abre detalle.
5. **Registro**: Flota, Corredor, Estado, Veh., Prima, Efecto, Vence ORION, Estudios, Último movimiento. Ordenable, 20 por página.
6. **Ficha** (panel): motivo si está rechazada, datos (CIF, actividad, tomadores, compañía, periodicidad, forma de pago, efecto, vencimiento ORION), corredor/sucursal/comercial/comisión base+extra, **Historial** con «Añadir nota», **Estudios anteriores** (año, estado, prima, motivo), **Documentos generados** con Descargar, y «Vehículos sin detalle» (tramos 10·25·50·100·250·500·1.000·más de 1.000 + categorías 1ª/2ª/3ª, marcado «estimado»).
7. ~~Importar flotas~~ y ~~Nueva carpeta~~: ELIMINADOS de Flotas (CONFIRMADO). Las carpetas nuevas y la importación por Excel se hacen solo desde Estudio. Flotas es solo consulta y control. `api/flotas/importar` se usa desde Estudio.

Reglas: usa fecha de efecto; el vencimiento ORION = efecto + 1 año y solo existe en contratadas. Se mantiene «Último movimiento» aquí (solo se quitó en Corredores). Cifras coherentes con el Dashboard (90 flotas: 15 en estudio + 11 estudiadas, 14 ofertadas, 45 contratadas, 5 rechazadas). Sin flechas.
Pendiente: Dashboard y Corredores deben añadir el estado Estudiada.

### 19 bis · Mejoras de la ronda 3 (Estudio: oferta e informe)
29. **Fecha única (CONFIRMADO):** en Datos generales solo hay la fecha de vencimiento de la flota (póliza actual); la póliza de MMT empieza ese mismo día. No hay otra fecha.
30. **Estado «Estudiada»:** ORION lo PROPONE al terminar la oferta (aviso con botón para aceptar); el usuario puede aceptarlo o ignorarlo. Aviso en la pestaña Oferta: «Oferta completa · Marcar como estudiada».
31. **Oferta, precio propio por vehículo (`F.po`, clave = índice de vehículo `v.i`):** cada fila de la tabla tiene la «Prima ofertada MMT» editable; hay herramienta «Precio propio para [tipología] [cobertura] [prima] · Aplicar a ese grupo» y «Quitar precios propios». Un precio propio manda sobre tarifa, ajuste de cobertura y ajuste global; se ve con fondo ámbar. `priceV(v,F)` devuelve `F.po[v.i]` si existe; Automático, Oferta e Informe usan `priceV`, así que todo cuadra. En producción guardar el precio por matrícula.
32. **Daños propios (original `DanosPropiosSection` en `HojaSincoUnificado.tsx` y `danosPropiosItems` en `HojaInforme.tsx`):** en SINCO hay casilla «Mostrar en el informe» (por defecto desmarcada), nº de siniestros de daños propios y 5 KPI (Vehículos, Siniestros, Antigüedad media, Siniestros/año, Frecuencia). Si la casilla está marcada el informe incluye la sección «Siniestralidad daños propios» antes de la composición. Estado en `F.dp={show,n}`. Siniestros/año = siniestros ÷ antigüedad media; Frecuencia = Siniestros/año ÷ vehículos × 100.
33. **Cabecera del informe:** arriba a la izquierda MMT Seguros / Departamento Técnico; arriba a la derecha, en tres líneas: corredor, comercial, fecha del informe. Se elimina «Informe técnico · EST-…». El título es el nombre de la flota (no «Análisis técnico de flotas»); debajo: CIF · actividad, y «Fecha de vencimiento · Nº de tomadores».
34. **Anexo con (*):** cada fórmula del anexo empieza por (*) y la misma marca (*) va en la cabecera de la columna/KPI que explica (Antigüedad, Sin./año, Frecuencia, Total solicitada, Total MMT, Diferencia, daños propios). Pensado para impresión.
35. **Pie del informe:** solo «Documento confidencial · Generado con ORION». Se elimina «Página 1 de 1» y el prefijo «ORION ·» (en los informes impresos con varias páginas la paginación se decidirá en la fase de informes).

36. **Motivos de rechazo (lista cerrada, `MOTIVOS` en `estudio.js`):** Precio · Siniestralidad · Actividad · ADR · Antigüedad de los vehículos · Tipología de vehículos · Falta de documentación · Prefiere seguir con su aseguradora · Sin respuesta del corredor · Otro. En «Cambiar estado → Rechazada» se elige de esta lista y hay un comentario opcional (`F.obs`). Flotas agrupa por este motivo en «Por qué se rechazan» (top 7 + Otros). Un solo catálogo para Estudio, Flotas, Corredores y Dashboard.
37. **Arquitectura:** Flotas es el registro central (una ficha por CIF). Estudio, Corredores y Dashboard leen de ahí.
38. **REGLA GLOBAL DEL ANEXO «Cómo calcula ORION» (todas las zonas):** el anexo solo contiene CÁLCULOS reales (operaciones con ÷ × Σ SUMA PROMEDIO CONTARA o sumas/restas con cifras, preferiblemente con los números del caso). NO lleva definiciones, orígenes del dato, reglas de negocio ni notas explicativas (p. ej. «Motivo: el que se anotó al cambiar el estado», «Vencimiento ORION = fecha de efecto + 1 año», «Datos de demostración»). Si un panel no tiene ningún cálculo, no se muestra el bloque Anexo ni su título. Se aplica con el filtro `calcF` dentro de `annex()` (corredores.js, estudio.js) y en el render del Dashboard. Excepción: las columnas calculadas de Trabajo (Nº póliza SINCO, Año matr.) mantienen su regla (`keep:true`). Motivo: no cargar ORION con texto que no aporta.

## 21. Zona VEHÍCULOS + Pre-emisión (UN SOLO MOTOR DE IDENTIFICACIÓN)

**Regla de arquitectura (Sergio):** Vehículos y Estudio · 08 Pre-emisión son el mismo flujo. NO programar dos lógicas. En el prototipo ambos usan `ident.js` (motor compartido); en producción debe ser un único componente/servicio (hoy `HojaPreEmision.tsx` + `analysis/vehiculos/page.tsx` + `IdentificacionMasiva.tsx` duplican la lógica).
**Sustituye en el original:** `app/(dashboard)/analysis/vehiculos/page.tsx`, `IdentificacionMasiva.tsx`, `flotas/components/HojaPreEmision.tsx`, `components/saas/VehicleManualDetectionForm.tsx` y `SilverdatChip.tsx`. APIs que se conservan: `/api/catalogo/search`, `/api/silverdat/login|enrich`, `resolvePlateFromSeed` (algoritmo de año, SIN CAMBIOS; el prototipo solo lo aproxima).

**Flujo único:** matrícula → año por algoritmo ORION → datos (Excel/plantilla o Silverdat) → búsqueda del ID en el catálogo → asignar. Búsqueda en catálogo con los criterios del original (`searchCatalogForSd`): marca, modelo limpio, versión, cilindrada, plazas, combustible, puertas, año de fabricación y kW; reintentos sin kW (híbridos), año−1, año+1 y sin año; si la primera coincidencia es ≥ 90 % se asigna sola; si no, se elige el acabado (máx. 5 sin duplicar versión).

**Motor compartido (`ident.js`)**
- Tabla única: Matrícula · Marca y modelo · Tipo · kW · Año · [columnas extra de la zona] · ID catálogo · Versión/acabado · Estado.
- Estados: Asignado / Pendiente de elegir / Sin catálogo. KPI clicables que filtran (Vehículos, Asignados, Pendientes, Sin catálogo, IDs distintos).
- Barra: buscador (matrícula, marca, modelo), filtro por estado, «Buscar pendientes en catálogo», «Aceptar coincidencias ≥ 90 %» (asigna en bloque y propaga).
- Mismo ID: al asignar una versión, los vehículos con marca|modelo|kW|tipo idénticos reciben el mismo ID («· mismo ID ×n»); los muy parecidos (misma marca y modelo, kW dentro del 5 %) se preguntan en una ventana con casillas.
- Editar ID o año + Enter vuelve a buscar. «Buscar» abre fila con Marca y modelo, kW y Año (sirve también para vehículos sin datos).
- Silverdat (chip rojo = desconectado, naranja = conectado) y ventana de conexión son compartidos.
- Contexto por zona (`IC`): `list()`, `cols`, `matCell`, `after`. Pre-emisión usa la lista de Trabajo de la carpeta; Vehículos usa la lista del lote.

**Vehículos (zona):** KPI (Vehículos consultados · Identificados en catálogo · Vehículos en flotas [cuadra con Dashboard: 2.055] · Marca principal · Antigüedad media), espacio «Identificar vehículos» (1 Añadir matrículas [pegar lista; formatos 1234 BCD, 1234-BCD, R-1234-BCD; las no reconocidas se cuentan], 2 Subir Excel [matricula obligatoria; marca, modelo, tipo, kW y año opcionales], 3 Modo: «Solo año» [algoritmo ORION; si el Excel trae marca y modelo busca catálogo] o «Con Silverdat» [completa todos los datos]), gráficos «Marcas más frecuentes» (top 7 + Otras, filtro por estado de la flota) y «Vehículos por categoría» (misma clasificación del Dashboard: 1ª/2ª/3ª/Sin clasificar), y «Lotes recientes» (cada identificación se guarda como lote; clic abre el lote).
- Ficha del vehículo (clic en la matrícula): año y antigüedad, fecha de matriculación, datos técnicos con su origen (Algoritmo ORION / Plantilla / Silverdat), clásico (≥ 25 años) y catálogo. Solo se muestran los campos con dato; si faltan, se avisa que Silverdat los completa.
- Las flotas contratadas anteriores no tienen vehículos cargados (ver Flotas): no suman en las marcas.
- Anexo de cálculos solo con cálculos reales (regla 38): antigüedad = año actual − año; CV = kW × 1,36; porcentajes.
Pendiente: Excel real de exportación (columnas del original: Matrícula, Tipo, Marca, Modelo, Versión, ID Catálogo, Año, Combustible, kW, CV, Plazas, Tara, Estado).

## 22. Búsqueda en catálogo · diagnóstico y mejoras propuestas (PENDIENTE DE APROBAR)

Fuente revisada: `core/catalogo/catalogoDataSource.csv.ts`, `app/api/catalogo/search/route.ts`, `analysis/vehiculos/page.tsx` (`searchCatalogForSd`) y la ficha `catalogo_vehiculos_estructura.txt` (dim_vehiculos.csv, ~143.000 filas, 23 columnas).

### Fallos detectados en el código actual
1. **Empates que se aceptan como acierto.** La puntuación se normaliza solo con los campos que se envían. Con marca + modelo, TODAS las versiones del modelo sacan 100 %. El cliente hace `if (top.score >= 90) return [top]` y asigna una versión cualquiera.
2. **Dato ausente en el catálogo = ventaja.** Si el catálogo tiene kW, cilindrada, tara o cv a 0/vacío, ese criterio ni puntúa ni entra en el denominador: un registro incompleto empata con uno que coincide en todo.
3. **Plazas mal tratadas.** `parseNum('')` devuelve 0, así que `veh.num_plazas_max ?? 99` nunca aplica el 99; los registros sin plazas pierden los 8 puntos aunque encajen.
4. **Año contradictorio.** El comentario dice «solo puntuación, nunca filtro duro», pero `scoreVehiculo` devuelve 0 si el año cae fuera de `fec_ini/fec_fin_comerc`. El cliente lo compensa con hasta 5 búsquedas (año, año−1, año+1, sin año, sin kW). Además suma 3 sobre un máximo de 4.
5. **Heurística de camiones aplicada a coches.** Regex `^([A-Za-z]+)\s*(\d{3,4})` convierte «C 220», «A 180» o «E 300» en `SERIE C/A/E`. Solo debe aplicarse a tractoras y camiones (id_clase pesado), y vivir en el servidor, no en la pantalla.
6. **Híbridos.** Silverdat da kW térmico y el catálogo kW combinado; hoy se arregla repitiendo la búsqueda sin kW.
7. **Rendimiento.** Carga el CSV completo en memoria con `split(sep)` (si una versión contiene el separador, se desplazan las columnas), recorre todo el bucket de marca y calcula Levenshtein por fila (modelo y versión). Una búsqueda por matrícula, en serie, hasta 5 veces cada una.
8. **Se descartan alternativas válidas.** Devuelve máx. 20 y el cliente deduplica por texto de versión y recorta a 5; versiones con el mismo texto pero distinto id_veh/periodo se pierden.
9. **Porcentaje engañoso.** 100 % con 2 criterios comparados parece igual de fiable que 95 % con 9.

### Mejoras propuestas (por orden de impacto)
A. **Confianza real, no porcentaje.** Tres niveles: Exacta (primer candidato único: ≥ 90 y ≥ 8 puntos sobre el segundo) se asigna sola; Probable (2 a 5 candidatos) se elige en lista; Dudosa/Sin coincidencia pide completar datos. Mostrar «criterios comparados: 7 de 9» y por qué coincide («marca, modelo, kW ±3 %, combustible») y qué difiere.
B. **Dato ausente penaliza suavemente** (en vez de ignorarse) y corregir plazas, año y parseNum (vacío ≠ 0).
C. **Año = ventana DURA de comercialización (regla del negocio):** un ID solo es válido si el año de primera matriculación está entre `fec_ini_comerc` y `fec_fin_comerc` (fin vacío = vigente). Si no, la emisión falla con «Este vehículo no corresponde con el año asignado». La causa raíz eran los reintentos en cascada del cliente (año-1, año+1, sin año) que devolvían IDs fuera de ventana. Reglas: (1) una sola búsqueda con el año exacto, sin cascada; (2) candidatos fuera de ventana NO seleccionables; (3) escribir a mano un ID fuera de ventana se bloquea con ese mensaje (indica periodo y año); (4) «mismo ID» solo se propaga a vehículos idénticos/similares cuyo año esté dentro de la ventana; (5) si se edita el año y el ID asignado queda fuera de ventana, el ID se invalida y se vuelve a buscar; (6) si hay Silverdat, usar su fecha de matriculación en vez del año del algoritmo de matrícula; (7) el selector muestra el periodo («2017–2025», «desde 2019»).
D. **Usar `id_clase`** para acotar por tipo de vehículo (turismo, TT, furgoneta, camión, remolque) antes de puntuar: evita Transit furgoneta vs turismo y reduce el espacio de búsqueda.
E. **Texto de `version` estructurado al cargar el catálogo:** extraer cilindrada «1.0», cv «95cv», motor «TSI/TDI/PureTech/eTSI» y acabado «Style/FR/Life/Allure» y compararlos con los datos de Silverdat. Es el dato más discriminante hoy desaprovechado.
F. **Agrupar por configuración antes de buscar:** clave marca|modelo|kW|combustible|año. Una flota de 300 vehículos suele tener 30 a 60 configuraciones: se busca una vez por configuración y se asigna a todo el grupo (es la lógica de «mismo ID ×n», pero antes de buscar). 5 a 10 veces menos búsquedas. Endpoint por lotes `POST /api/catalogo/match-batch`.
G. **Memoria de asignaciones:** guardar cada asignación confirmada (clave de configuración → id_veh, usuario, fecha). La siguiente vez, esa configuración aparece primero como «Ya asignado N veces». Con el tiempo es la mayor mejora de acierto.
H. **Caché de Silverdat por matrícula** (p. ej. 30 días): evita pagar dos veces la misma consulta.
I. **Alias de modelos pesados en el servidor** (Scania R450 → SERIE R, Volvo FH 460, DAF XF 480, MAN TGX, Actros) con conversión cv a kW solo para clases pesadas.
J. **Búsqueda manual en cascada** Marca, Modelo, Versión (desplegables alimentados por el catálogo, con búsqueda de texto libre) en lugar de campos de texto sueltos. Más fiable que difuso cuando no hay Silverdat.
K. **Índice precalculado al subir el catálogo en orion-admin:** columnas normalizadas (marca_n, modelo_n sin espacios ni guiones, tokens de versión, cv y cilindrada extraídos, año ini/fin) en SQLite/DuckDB o índice en memoria con claves por marca y modelo. Lectura CSV con parser real (comillas) y validación de columnas. Recarga al cambiar la carpeta de fecha.
L. **Medir antes y después:** con asignaciones históricas ya validadas (matrícula a id_veh) calcular acierto en el primer resultado, acierto en los 5 primeros, % automático correcto y % sin coincidencia. Sin esa medida no se sabe si un cambio mejora o empeora.


### 22 bis · Base de datos vectorial para el catálogo (opinión)
No como núcleo. El catálogo es estructurado (marca, modelo, kW, cc, plazas, ventana de años): lo correcto es filtro duro (marca, ventana de años, combustible) + coincidencia exacta/normalizada + puntuación numérica por tolerancias. Los embeddings solo aportan en texto libre (modelo/versión mal escritos, «C 220» vs «Clase C 220») y no entienden bien números ni la ventana de años. Recomendación híbrida: filtros duros, luego léxico/fuzzy sobre modelo+versión (embeddings opcionales como recall adicional) y puntuación numérica final. Validar con asignaciones históricas reales (acierto top-1/top-3) antes de cambiar nada.

### 21 bis · KPIs finales de Vehículos
4 KPIs: Vehículos consultados este mes · Identificados en catálogo % · Pendientes de revisar (por elegir + sin catálogo) · Consultas a Silverdat. Gráficos: Marcas más frecuentes y Vehículos por categoría. Detalle por clic con anexo solo si hay cálculo.

### 22 ter · Búsqueda manual en cascada (solo si falla la automática)
Cuando el ID no se encuentra solo (estado «Sin catálogo» o «Por elegir» sin buen candidato), el botón de búsqueda abre una cascada guiada: 1 Marca → 2 Modelo (solo los de esa marca) → 3 Año de primera matriculación → 4 Versión (solo versiones comercializadas ese año, con su periodo e ID). No es la vía principal: primero filtros duros + léxico + puntuación (22 bis). Es un único componente del motor compartido `ident.js` (Vehículos y Pre-emisión). Al elegir versión se rellenan marca/modelo del vehículo si estaban vacíos y se aplica la regla de ventana dura (22 C).

### 19 ter · Flota ya registrada al crear carpeta en Estudio
Al «Crear carpeta», si el CIF o el nombre normalizado ya existen en el registro de Flotas (en cualquier estado: en estudio, estudiada, ofertada, contratada, rechazada), NO se crea directamente: se muestra el panel «Flota ya registrada» con el resumen (estado, corredor, vehículos, prima ofertada, compañía actual, vencimiento, y motivo de rechazo si es rechazada). Acciones: «Abrir ficha»; «Crear estudio nuevo» (renovación, solo si no está ya en estudio; el anterior queda en su historial); «Volver» (vuelve al formulario con los datos). Si ya está en estudio solo se permite abrir su ficha.

### 22 quater · Selección múltiple y «mismo ID» por lote (motor compartido)
Casilla por fila y «seleccionar todos» (solo lo visible según buscador/filtro). Con filas marcadas aparece la barra «N vehículos seleccionados · Asignar el mismo ID · Quitar selección». Flujo: el usuario escribe un ID (o usa una de las versiones sugeridas para el primer vehículo) y pulsa Continuar. Reglas: (1) ventana dura de años: los vehículos cuyo año no está en el periodo del ID NO se asignan (se informa cuántos y siguen marcados); no se sobrescribe el año, porque la emisión fallaría; (2) si los vehículos asignables tienen distinta marca o modelo según la plantilla original, aparece una confirmación con el desglose por marca/modelo, cuántos ya tenían otro ID (se sustituye) y una casilla obligatoria «Estoy seguro…» que habilita «Sobrescribir y asignar»; (3) si coinciden marca y modelo se asigna directamente; (4) botón «Deshacer última asignación» restaura el estado previo. Mismo componente en Vehículos y Pre-emisión.

### 22 quinquies · Sustitución de datos para la emisión (sustituye a la regla 1 de 22 quater)
Motivo: la descarga de emisión se genera con el ID asignado; si el año del vehículo queda fuera del periodo del ID, la emisión sigue fallando. Por eso, en el «mismo ID» por lote, el suscriptor puede FORZAR la asignación: (1) aviso con desglose (marcas/modelos distintos con top 7 + «Otros (n)», años fuera de periodo con «año → año sustituido», IDs previos que se sustituyen); (2) obligatorio: motivo (mín. 3 caracteres) + casilla «Estoy seguro…»; (3) el año para la emisión pasa al extremo más cercano del periodo del ID; el año original se guarda en `v.orig.anyo` y la fila muestra «· año sustituido» con el original en el tooltip; (4) opción «Solo a los que encajan (N)» si el resto coincide en marca/modelo; (5) REGISTRO persistente (`IDLOG`): fecha y hora, ID, nº de vehículos, motivo, matrículas con año de→a y marcas/modelos mezclados; botón «Registro de sustituciones (n)»; el Excel de emisión debe incluir una hoja «Sustituciones» con este registro; (6) «Deshacer última asignación» restaura cat, año y orig y elimina la entrada del registro. Producción: guardar usuario, y mantener el dato original en columnas aparte (`anyo_original`, `marca_original`, `modelo_original`).
Selección visible: casilla personalizada (marcada en azul con check), fila resaltada con barra azul a la izquierda, barra superior con icono de selección y botón principal «Asignar el mismo ID». Sin flechas.

### 22 sexies · No perder la posición al editar (regla global)
Ninguna acción (filtrar, buscar, elegir versión, escribir ID/año, seleccionar, asignar por lote, redibujar el área de trabajo) puede subir la página al inicio. Implementación: `keepY` (tabla de identificación) y `keepBox` (área de trabajo de Estudio `renderWs`, cuerpo de Vehículos `renderBody`) guardan `scrollTop` del contenedor `#scroll` y lo restauran; si la tabla se acorta (p. ej. al filtrar), se añade el mínimo `min-height` necesario para no alterar la posición. El scroll solo se reinicia al CAMBIAR de carpeta/paso o de vista. Los modales y paneles usan `preventScroll` al enfocar.

### 22 septies · Botones de la barra de identificación (nota interna)
- «Buscar pendientes en catálogo»: recorre solo «Sin catálogo» con marca y modelo, busca (año exacto, ventana dura) y, si hay candidatos, los pasa a «Pendiente». No asigna nada ni toca los «Asignados».
- «Aceptar coincidencias ≥ 90 %»: recorre solo «Pendiente» cuyo mejor candidato tiene ≥ 90 % y está dentro de la ventana de años del vehículo; lo asigna SOLO si el segundo candidato está al menos 5 puntos por debajo (empates cercanos se eligen a mano; el aviso indica cuántos) y lo propaga a idénticos (marca|modelo|kW|tipo) con año dentro de la ventana. Lo que queda < 90 % se elige a mano. 90 es el umbral con el que el servidor original ya devuelve un único resultado como seguro.

## 23. LOGIN (v3 · línea de luz)
Pantalla única, SOLO OSCURA a propósito (azul noche con un toque violeta lavanda solo en el núcleo de la luz; sin selector de tema). Marca ORION. Sin flechas. Una columna centrada: línea de luz (aro) con el logo, «Pulsa para acceder», panel de acceso y lema «Del caos al orden.» (Space Grotesk 400, «orden» en degradado azul-lavanda; Inter para el resto).
Aro: una sola línea de luz suave, más intensa abajo y más fina arriba (perfil de ancho/alfa variable), con núcleo casi blanco, cuerpo azul-lavanda y halo azul profundo; resplandor interior azul noche. SIN conos de color, SIN vectores girando, SIN cabezas luminosas. Se dibuja una vez en un lienzo (`makeRing`, 1100 px) y se escala (no se redibuja al cambiar de tamaño). Revelado: nace abajo y se extiende a los dos lados con borde suave (máscara cónica), curva ease-in-out, en ~3 s. Reposo: respira ±1 %, y gira como mucho ~6° hacia el cursor (suavizado). IMPORTANTE: no redimensionar el canvas en `ResizeObserver` (borra el aro antes de pintar y parpadea); se comprueba el tamaño dentro del propio frame.
Logo: PNG blanco-lavanda con halo detrás, destello (sheen) que lo cruza cada 8 s y respiración de luz; ORION con letras que salen del centro (I, luego R y O, luego O y N) con desenfoque→nítido y resplandor que pulsa.
Fondo: casi negro, una sola luz azul oscura estática detrás del aro y viñeta. Puntos de luz (no estrellas): círculos suaves, parallax muy leve y se apartan del cursor.
Secuencia y suavidad: todo con curvas (`cubic-bezier`) sin saltos; al saltar la intro el tiempo se acelera de forma gradual (no se corta). Clic o Enter/Espacio en el logo: el aro se encoge (1,4 s) mientras el panel se despliega (1,2 s) y sus campos entran escalonados; Esc o clic fuera lo recoge. Intro completa una vez por sesión; `prefers-reduced-motion`: directo en reposo sin animación. Formulario siempre en el DOM (gestores de contraseñas), cerrado con `inert`.
Lógica conservada: error genérico «Usuario o contraseña incorrectos.», intentos restantes desde el 3.º, bloqueo 15 min al 5.º (real en servidor), recuperar acceso con respuesta genérica, éxito con acceso al Dashboard. Prototipo: demo / orion2026. Producción: conservar `POST /api/auth/login` y `login(username)` del AuthContext; límite de intentos y 2FA según política.

### 23 bis · Login: desenfoque gaussiano y tarjeta de acceso (v4)
Resplandores: el aro se compone de 4 capas, cada una con su propio desenfoque gaussiano (`blurInto`: `ctx.filter` o, si no existe, reducción y ampliación): halo amplio, resplandor, cuerpo y núcleo (núcleo con desenfoque mínimo y doble pasada). Logo: halo grande difuso (`.mg`, 8cqw) + halo cercano (`.mg2`, 4,4cqw) + `drop-shadow` doble; ORION con tres sombras de luz de radios crecientes. Regla: ningún resplandor con borde duro ni con la silueta reconocible del logo.
Tarjeta de acceso: borde degradado de 1 px (luz desde arriba-izquierda) + línea de luz superior, fondo cristal oscuro, sombra profunda. Cabecera: etiqueta «Acceso seguro» (azul, mayúsculas con espaciado), título «Iniciar sesión» y subtítulo. Campos de 48 px con icono (usuario, candado), etiquetas en minúscula de 13 px, foco con halo azul. Fila «Recordarme» (casilla propia) + «¿Olvidaste la contraseña?». Aviso «Bloq Mayús está activado» en la contraseña. Mensaje de error solo ocupa espacio cuando existe. Botón principal con brillo interior y destello al pasar el cursor. Pie de tarjeta: acceso demo. Al abrir, el aro se reduce más (≈150 px) para que todo quepa en 900 px de alto; el lema baja de tamaño.

### 23 ter · Login: luz del logo sin siluetas (corrección)
Causa del efecto «vectores detrás del logo»: `filter: blur()` y `drop-shadow()` aplicados al MISMO elemento que lleva `mask` se calculan antes del recorte de la máscara, así que la máscara dejaba contornos duros del logo (copias a distinta escala). Regla: nunca poner filtro de desenfoque/sombra en un elemento con `mask`; el filtro va en un contenedor padre. Ahora: halo radial circular (misma forma que el aro de luz), una copia del logo muy desenfocada dentro de un contenedor (`.mgw`, 6,5cqw, opacidad ≈ .3) y una sombra de luz doble sobre el contenedor del logo (`.mkw`). La luz de ORION es ~40 % más tenue. Sin `transform: scale` en los resplandores.

## 24. Estado «Estudiada» (Dashboard · Corredores · Estudio · Flotas · Vehículos)
- Cinco estados en todo ORION: En estudio, Estudiada, Ofertada, Contratada, Rechazada (`ESIDS`). Cartera demo: 18 / 8 / 14 / 45 / 5 = 90 flotas.
- Dashboard: donut y leyenda con 5 estados; tabla «Vehículos por categoría» con columna «Estudiados» (`.es`); en móvil se ocultan `.es` y `.rj`. Fórmulas del anexo actualizadas (18 + 8 + 14 + 45 + 5 = 90).
- Corredores: reparto estudio/estudiada por corredor 5/3, 5/2, 3/2, 3/1, 1/0, 1/0, 0/0, 0/0; el generador de corredores extra (`assemble_c.py`) incluye `estudiada`.
- Estudio: `est3 = f.st==='estudiada'` (ya no se deduce de id%3).
- Cabeceras de tabla con `--head` (más oscura en claro, más clara en oscuro).
- Aviso para Claude Code: no volver a usar `.replace(' ','')` sobre código JS generado (rompía `const CATST`).

## 25. Informes A4 (`informes.html`) — maqueta de los tres documentos
- **Formato:** hoja A4 en pantalla 794 × 1123 px, escalada con `--s` para caber en cualquier ancho (móvil incluido); al imprimir `@page A4, margin 0`, cada `.pw` es una página (1122 px), sin transform. «Descargar PDF» = `window.print()` en la maqueta; en producción se genera en servidor con el mismo HTML/CSS.
- **El papel siempre es blanco** (también con la app en modo oscuro). Tinta `#18243a`, acento y cabeceras de tabla en `#002F82` (único azul; cabecera sólida con texto blanco; los valores antiguos `#17399a`/`#1b2a44` quedan obsoletos); filas pares `#f7f9fd`; `print-color-adjust: exact`.
- **Cabecera (primera página):** izquierda «MMT Seguros» + «Departamento Técnico»; derecha corredor · comercial · fecha. Páginas siguientes: cabecera reducida (`.ph.slim`) con el nombre del documento o de la flota. **Pie en todas las páginas:** solo «Documento confidencial · Generado con ORION».
- **Orden:** título → datos → banda de KPIs (`.kb`) → secciones numeradas con `h4` → **Anexo · cómo se calcula siempre la última sección**. Cada fórmula empieza por (*) y la misma marca va en la cabecera de columna o KPI que explica. Solo cálculos reales (÷ × Σ − +).
- **Formato numérico:** puntos de millar siempre (`2.055`, `1.215,00 €`), coma decimal, `50 %`, signo `−` (U+2212). Las celdas numéricas llevan `white-space:nowrap`; una cifra nunca se parte en dos líneas. Porcentajes pequeños con 2 decimales para no mostrar `−0,0 %`.
- **Documentos:**
  1. *Análisis técnico de flotas* (2 págs.): KPIs · 1 Composición · 2 Siniestralidad SINCO · 3 Comparativa de primas · 4 Interpretación técnica · 5 Anexo. Título = nombre de la flota; debajo CIF · actividad y vencimiento · nº de tomadores. La cadena de redondeo es r2(antigüedad) → Sin./año → Frecuencia para que el anexo cuadre al recalcular a mano.
  2. *Vehículos por categoría* (2 págs.): KPIs · 1 Categoría × estado · 2 Distribución (barras apiladas con la paleta de estados) · 3 Flotas por estado · 4 Anexo. Cinco estados (incluye Estudiados).
  3. *Oferta* (5 págs., **documento para el cliente final**): se descarga en el paso 07 Oferta **junto a la plantilla Excel** (dos botones: «Descargar plantilla Excel» y «Descargar PDF»). **No muestra** corredor, comercial, «Prima solicitada», diferencias ni anexo de fórmulas. Contenido: datos de efecto, periodicidad y validez (30 días) → KPIs (vehículos, tipologías, coberturas, prima total anual) → 1 Resumen de primas por tipología y cobertura → 2 Resumen por cobertura (nº vehículos, prima, % de la prima) → 3 Coberturas incluidas (rejilla de 2 columnas; un bloque por cobertura y por remolque/no remolque, con ✓ y solo el nombre, **sin descripciones ni límites**; las garantías salen de `cobAnexo` en `HojaOferta.tsx`: base = Responsabilidad civil obligatoria · Responsabilidad civil voluntaria (hasta 50 millones) · Defensa jurídica y reclamación de daños · Seguro del Conductor (22.550 €), este último **no en remolques**; + Lunas (Terceros solo si la fila lleva lunas; Ampliado y Todo Riesgo siempre; nunca en semirremolque) + Robo + Incendio (Ampliado y Todo Riesgo) + «Daños propios con franquicia» (Todo Riesgo) + «Asistencia en Viaje» si el vehículo la lleva) → 4 Detalle por vehículo (matrícula, tipología, marca, modelo, cobertura, franquicia, prima; 36 filas por página; total solo en la última página, no repetido en cada una como en el PDF original). Tomador, periodicidad y vencimiento van en la cabecera porque son iguales para toda la flota.
     - Base real: `HojaOferta.tsx` + `primas.ts` + `coberturas.ts`. **Nada inventado:** «Fenómenos atmosféricos», «Valor venal», «Remolque y depósito» y las descripciones NO existen en el código y se retiraron. Catálogo real: productos Terceros · Terceros con Luna (= Terceros + lunas) · Terceros Ampliado · Todo Riesgo con Franquicia; turismo y furgoneta (cat. 1) **no admiten Terceros**; franquicias cat. 1: 120 · 180 · 240 · 300 · 450 · 600 · 750 €, cat. 2: 1.800 €; semirremolque sin lunas; industriales solo Terceros sin franquicia ni asistencia; asistencia Oro / Oro+ (Oro+ solo cat. 1); extras Animales (turismo, furgoneta) y Pérdida total (cabeza tractora, camión, semirremolque). **Pendiente de corregir en producción:** el título del bloque está fijo en «Todo Riesgo con Franquicia 1.800 €» aunque la franquicia varíe; en la maqueta el título va sin importe y la franquicia se ve por vehículo. Si existe una garantía «Fenómenos atmosféricos» en el negocio, hay que añadirla primero al catálogo del código.
- **Producción:** las tres piezas leen los mismos datos que Estudio (`priceV`, `sstats`, `infRows`); hay que comprobar el desbordamiento de página (la maqueta mide el espacio libre sobre el pie). Si una tabla no cabe, continúa en una página con cabecera reducida.

- **Excel de oferta:** la prima y la franquicia son **numéricas** (formato `#.##0,00 €`), nunca texto como «1442,00 €»; así se pueden sumar y ordenar. Se mantienen las columnas originales (TOMADOR · TIPOLOGÍA · MATRÍCULA · MARCA · MODELO · COBERTURAS · PERIODICIDAD · VENCIMIENTO · PRIMA OFERTADA MMT).

- **Las coberturas cambian según la categoría (confirmado por Sergio):** en 2.ª categoría solo se ofrece franquicia de **1.800 €** (título «Todo Riesgo con Franquicia 1.800 €», correcto en el código); en 1.ª categoría la franquicia es de 120 a 750 € y varía por vehículo. El anexo de coberturas de la oferta se divide por categoría además de por cobertura y remolque. La Asistencia Oro+ solo existe en 1.ª categoría. (Se retira la nota anterior de «corregir el título fijo 1.800 €».)

## 26. Plantillas (`plantillas.html` + `make_templates.py` + `build_plantillas.py`)
- **Pantalla:** H1 «Plantillas» → tabla de 8 archivos (plantilla, dónde se descarga, quién la usa, hojas, columnas, «Descargar»). Pulsar una fila abre el panel de detalle (etiqueta · título · descripción · 4 cifras · archivo/dónde/hojas · «Descargar ejemplo» · tabla **Estructura** por hoja con Columna/Tipo/Regla · **Anexo** solo si hay cálculos reales: INFORME, SINCO y Oferta).
- **Las 8 plantillas** (nombres de archivo reales, para no romper el lector de ORION): `plantilla_{FLOTA}.xlsx` (la rellena el corredor) · `Plantilla_Identificacion_Vehiculos.xlsx` · `ESTUDIO.xlsx` (6 hojas: DATOS_GENERALES, ORIGINAL, TRABAJO, SINCO, INFORME, OFERTA) · `TRABAJO.xlsx` · `SINCO_{CIF}.xlsx` · `PRE-EMISION.xlsx` (+ hoja «Sustituciones» = registro IDLOG) · `OFERTA_PLANTILLA.xlsx` (+ hoja «Coberturas») · `{FLOTA} - {CORREDOR}_{dd-mm-aaaa}.zip` (ESTUDIO + OFERTA_PLANTILLA).
- **Reglas de diseño del Excel:** las plantillas que lee la máquina (ORIGINAL, TRABAJO, SINCO, PRE-EMISION, Identificación, hojas del proyecto) llevan **las cabeceras en la fila 1 con los nombres originales** (snake_case o MAYÚSCULAS según el archivo); las que lee una persona (plantilla de estudio, oferta) llevan banda azul MMT Seguros, subtítulo, cabecera `#1B2A44`, filas cebra `#F7F9FD`, congelado de paneles y pie «Documento confidencial · Generado con ORION». Primera columna a la izquierda, resto centradas.
- **Tipos reales, nunca texto:** fechas como fecha (`dd/mm/aaaa`), primas, franquicias y valores como número con formato `#.##0,00 €` (se ve `1.442,00 €` en Excel en español), enteros con `#.##0`. **Antes** la prima iba como texto «1442,00 €» y las fechas como texto.
- **Fórmulas reales:** `INFORME` calcula Prima Referencia Total = Num Vehiculos × Prima Referencia Media y Prima MMT Total = Num Vehiculos × Prima MMT, con fila TOTAL = SUMA; la oferta suma el total al pie. El total de la oferta (87.878,00 €) coincide con el PDF.
- **Plantilla de estudio:** NO SE REDISEÑA. Es el archivo original del cliente (hoja «Estudio de Flotas» + «_CORREDORES» oculta, cabecera en filas 1-4, 200 filas, listas desplegables). Solo cambian los datos de cabecera y la lista de corredores. Sin hoja «Instrucciones»; `plantilla.ts` no se toca.
- **Oferta:** columnas TOMADOR · TIPOLOGÍA · MATRÍCULA · MARCA · MODELO · COBERTURAS · **FRANQUICIA (nueva)** · PERIODICIDAD · VENCIMIENTO · PRIMA OFERTADA MMT. Hoja «Coberturas» idéntica al PDF (por categoría, remolque y cobertura, con las garantías de `HojaOferta.tsx`).
- **Datos:** los de los informes (misma flota ficticia, 106 vehículos, 101 con SINCO y 32 siniestros, que cuadran con el informe técnico).
- **Producción:** generar con `exceljs`/`openpyxl` desde los mismos datos de Estudio; mantener la hoja «Sustituciones» en PRE-EMISION; el corredor elegido se rellena en la plantilla de estudio; la lista de corredores sale del registro de Corredores.

### Reglas añadidas (informes y plantillas) — para que Claude Code no se confunda
- **Un único azul:** `#002F82` (cliente MMT) en todo informe y plantilla: cabeceras de tabla sólidas con texto blanco, títulos, filas de total (fondo `#eaf0fa`), pie y bandas. Prohibido `#17399a`, `#1b2a44` y otros azules. Gráfico «Vehículos por categoría»: SOLO gama de azules, de oscuro a claro: En estudio `#002F82`, Estudiados `#2f5db3`, Ofertados `#6f97d8`, Contratados `#a9c4ec`, Rechazados `#d3dff2`. Nada de colores no azules.
- **Pie de página:** «Documento confidencial» a la izquierda y «Página n de N» a la derecha (PDF); en Excel pie «Documento confidencial · Página &P de &N». **Nunca** el nombre ORION en documentos ni plantillas.
- **Oferta (cliente final):** banda azul `#002F82` con el logo de MMT (`assets/mmt_logo.png`, el mismo de la plantilla original) en todas las páginas; el Excel de oferta conserva el logo y la banda.
- **Seguridad de importación (varias hojas/páginas):** los PDF son solo salida, ORION nunca los lee. Los importadores leen únicamente la PRIMERA hoja (`wb.SheetNames[0]`), así que ninguna hoja auxiliar (Instrucciones, Sustituciones, Coberturas) puede ir antes de la de datos. Se leen como texto formateado: en archivos que se vuelven a subir las primas/franquicias van con formato `0.00` sin «€» ni separador de miles; las fechas `dd/mm/aaaa`.
- **Comportamiento previo, no introducido:** en la plantilla de estudio y en ESTUDIO.xlsx las celdas «CIF:»/«CIF» se detectan como cabecera (fila 2) y generan filas sin matrícula; ya ocurre con los archivos originales. Corregir en `parser.ts` ignorando filas sin matrícula si se desea.
- **Coberturas:** solo los nombres del código (HojaOferta.tsx); «Fenómenos atmosféricos» pendiente de confirmar nombre exacto, no existe en el código revisado.
- **ESTUDIO.xlsx:** además de las 6 hojas originales lleva al final `INFORME_TECNICO` (composición de la flota + siniestralidad SINCO con antigüedad, siniestros/año y frecuencia con fórmulas y anexo (*)). Va al final para no alterar la importación (solo se lee la primera hoja).
- **Oferta Excel:** el logo va en la hoja «Oferta»; la hoja «Coberturas» y la página de coberturas del PDF NO llevan logo.

## 27. Implementación en el código real (rediseño de front, octubre 2026)
Solo presentación: no se ha tocado lógica de negocio, endpoints ni modelos de datos (excepciones menores listadas abajo).

### Sistema
- **Un solo sistema de tokens**: `globals.css` (tokens globales, tema oscuro por defecto y claro de trabajo) + `src/styles/orion-ui.css` (primitivas `.pg …`, panel de detalle `.dr-*`, modal `.sdm-*`, Vehículos) + `flotas/estudio-css.ts` (`ESTUDIO_CSS`, ámbito `.es`, ya con los mismos tokens; lo importan Estudio y Vehículos masivo).
- **Formato** único en `src/lib/fmt.ts` (`dec`, `nf`, `eur`, `eur2`, `pc`, `signedPc`): puntos de millar incluso con 4 cifras, coma decimal, `50 %`, `+24,2 %`, signo `−` U+2212. Prohibido `toLocaleString('es-ES')` para mostrar cifras (omite el punto en 4 cifras). Fechas `dd/mm/aaaa`.
- **Panel de detalle** `DetailDrawer`: lo abre cualquier KPI, barra o fila; el anexo «cómo calcula ORION» solo aparece si hay cálculos reales (÷ × Σ).
- **Sin flechas ni chevrons**: selectores con el icono de filtro (3 líneas), desplegables «+» / «−». Se retiraron `→`, `◄` y SVG de flechas (p. ej. diferencias de pre-emisión ahora «KW: a frente a b»).
- **Responsive**: consultas de contenedor `@container app` (≤ 900 y ≤ 640 px) en `orion-ui.css` y en el CSS del Dashboard; KPIs a 2 columnas, rejillas a 1; tablas anchas con scroll horizontal propio; en ≤ 640 px el nombre «ORION» de la barra se oculta para que quepa la navegación. Auditado a 390 / 820 / 1440 px sin scroll horizontal de página.
- Hidratación: `DetailDrawer` monta solo en cliente (`useSyncExternalStore`).

### Zonas
- **Flotas** (`/emission`): registro de control (comprobador, filtros, 5 KPIs, vencimientos 12 meses, motivos de rechazo con top 7 + «Otros», directorio ordenable con ficha en panel; edición solo en CONTRATADA). «Descargar informe» = Excel del directorio filtrado (cabecera `#002F82`, pie «Documento confidencial · Página n de N»).
- **Vehículos** (`/analysis/vehiculos`): identificación individual y masiva con el mismo motor, `SilverdatModal` compartido (también lo usa el paso 02 de Estudio). **Escáner**: página «En mantenimiento».
- **Estudio · paso 02 Automático**: «Confirmar oferta» reescrito con clases `.es` (resumen, cambio masivo de tipología sin flecha, resumen por tipología y cobertura, descuento global, total).
- **Admin**: panel de detalle, tablas de versión, mensajes con `nf`.

### Informes y plantillas en código
- **Informe técnico A4** (`buildPdfHtml`, `HojaInforme.tsx`): papel blanco, tinta `#18243a`, único azul `#002F82` (cabeceras sólidas, títulos, total `#eaf0fa`, filas pares `#f7f9fd`). Cabecera «MMT Seguros · Departamento Técnico» + corredor y fecha; páginas siguientes con cabecera reducida. Pie: «Documento confidencial» / «Página n de N». Sin la palabra ORION. Secciones numeradas y «Anexo · cómo se calcula» con marca (*). Cifras con `nf`/`dec`, celdas numéricas `nowrap` y centradas.
- **Oferta A4** (`buildOfertaPdfHtml`, `HojaOferta.tsx`) — documento para el cliente final, vertical, paginado por altura estimada: banda `#002F82` con logo MMT en todas las páginas; fecha de efecto, periodicidad, validez 30 días; KPIs; 1 Resumen por tipología y cobertura; 2 Resumen por cobertura (% de la prima = prima ÷ total); 3 Coberturas incluidas (solo nombres, de `cobAnexo`); 4 Detalle por vehículo (30 filas/página, total solo en la última). Sin corredor, comercial, prima solicitada ni diferencias.
- **Excel de oferta** (`/api/flotas/oferta/excel`): prima y franquicia **numéricas** (`#,##0.00 "€"`), vencimiento como fecha, columna **FRANQUICIA** nueva (solo Todo Riesgo), total con `SUM`, paneles congelados, pie «Documento confidencial / Página &P de &N», un único azul. Cuerpo: campo opcional `franquicia`.
- **ESTUDIO.xlsx** (`descargarTodo`, `flotas/page.tsx`): hoja final `INFORME_TECNICO` (composición con `SUM`, siniestralidad SINCO con fórmulas: siniestros/año = Σ ÷ antigüedad; frecuencia = siniestros/año ÷ vehículos con SINCO; anexo (*)). Va al final: el importador solo lee la primera hoja.
- No cambia: `plantilla.ts` (plantilla de estudio del cliente), cabeceras de archivos que ORION vuelve a leer.

### Pendientes / a confirmar
- Nombre exacto de «Fenómenos atmosféricos» (no existe en el código; no se muestra).
- El zip «Descargar todo» llama a la oferta sin `cobAnexo` (la hoja «Coberturas» solo sale al descargar desde el paso 07).

### 27 bis · Búsqueda manual en el catálogo: desplegables en cascada (Vehículos y Pre-emisión)
- Un único componente compartido, `src/components/saas/CatalogCascade.tsx`, sustituye a los campos de texto libre de «Identificar en catálogo a mano» (Vehículos) y del panel «Buscar» de Pre-emisión.
- Orden: **Marca → Modelo → Año → Versión**, cada desplegable con solo las opciones válidas del paso anterior; después, filtros opcionales de **combustible, potencia (kW) y plazas** que acotan la lista de versiones. Sin flechas: iconos de 3 líneas.
- Preselección con lo que ya sabe el vehículo (marca/modelo de Silverdat o de la fila, año de matriculación). El servidor resuelve alias de marca (VW, MERCEDES-BENZ → MERCEDES).
- Datos: `GET /api/catalogo/cascada?marca=&modelo=&anyo=&combustible=&kw=&plazas=` (solo lectura, filtrado **exacto**; no usa la puntuación difusa de `/api/catalogo/search`, que sigue siendo la vía automática). El año aplica la ventana de comercialización como filtro duro (regla 22 C). Máximo 300 versiones por consulta.
- Al elegir versión y pulsar «Usar esta versión» se devuelve el mismo objeto que antes (`id_veh`, versión, kW, combustible, plazas, tara…), por lo que el resto del flujo (asignar ID, «mismo ID» por lote, exportar) no cambia.

### 27 ter · Categoría y Tipo de vehículo al inicio de la cascada
- Orden definitivo: **Categoría → Tipo → Marca → Modelo → Año → Versión** (+ filtros de combustible, kW y plazas). «Todas las categorías» y «Todos los tipos» son las opciones por defecto y se pueden cambiar. Al elegir categoría, el desplegable Tipo solo ofrece los de esa categoría; al elegir tipo o categoría, el desplegable de marcas muestra cuántas quedan.
- Categorías: **1.ª** turismo / todoterreno, furgoneta y furgón (hasta 3.500 kg de PMA). **2.ª** camión rígido, cabeza tractora, remolque / semirremolque, industrial / especial y minibús / autocar. **3.ª** solo motos. «Sin clasificar» no tiene categoría.
- La tipología sale de la columna **`id_clase`** del catálogo mensual con una tabla por clase (`src/core/catalogo/tipologia.ts`, `CLASE_TIPO` + prefijos MOT3/CIC3/REMOL). El peso solo corrige furgonetas y furgones: **PMA superior a 3.500 kg = 2.ª categoría** (camión rígido). Un camión (CAMI) nunca baja a 1.ª aunque pese menos. Sin PMA vale el tipo de la clase.
- **Minibús / autocar**: 2.ª categoría y **no admitido**: aparece marcado en el desplegable y en la fila, se muestra el aviso «Este tipo de vehículo no se admite en flotas…» y no se puede seleccionar.
- Cada fila de versión indica «n.ª categoría · Tipo» (p. ej. una furgoneta de 4.250 kg sale como 2.ª categoría · Camión rígido).
- Catálogo mensual: una `id_clase` nueva no rompe nada: queda en «Sin clasificar» (visible con «Todas las categorías») y el cargador deja un aviso en el registro con las clases pendientes. Se resuelve añadiendo una línea a la tabla.
- Layout: 3 columnas (Categoría, Tipo, Marca / Modelo, Año, Versión); 2 columnas por debajo de 760 px y 1 por debajo de 460 px.

## 28. Coberturas, INFORME configurador, OFERTA, EMISIÓN (paso 09) y plantilla del corredor (octubre 2026)
Pendiente de revisión de Sergio antes de pasar a Spike.

### 28.1 Catálogo único de coberturas (`core/flotas/catalogoCoberturas.ts`)
- Una sola fuente para INFORME, OFERTA, EMISIÓN y plantilla del corredor: productos (Terceros, Terceros ampliado, Todo riesgo con franquicia, Terceros ampliado con franquicia de moto…), franquicias por categoría, coberturas opcionales (`camposDe`) y traducción a los códigos de ID_cobertura (`aEmision`).
- Franquicias: **1.ª categoría** 120, 180, 240, 300, 450, 600, 750, 950 y 1.200 (nunca «sin franquicia»); **2.ª categoría** 1.800 y 2.400; **motos** 300 a 3.000 según el archivo de IDs. Terceros y Terceros ampliado no llevan franquicia.
- Los desplegables con borde de las capturas son coberturas **opcionales** (AV, conductor, defensa jurídica, animales, lunas…); las fijas se muestran como texto.
- Solo se usan IDs del archivo ID_cobertura. **RC en reposo** aún no tiene ID: queda como aviso de emisión, no bloquea el resto.
- Motos: defensa jurídica con las opciones del archivo de IDs.

### 28.2 INFORME · «Coberturas por tipología»
- Tabla sobre el papel del informe: Tipología | Pidió el corredor | Nº veh. | Cobertura | Franquicia | Coberturas (abre panel) | Estado.
- Estados: Confirmada (azul), Propuesta y Falta franquicia (aviso), No admitida. ORION propone a partir de lo que pidió el corredor (producto y franquicia más frecuente); cualquier edición confirma la fila.
- Cambios masivos: casillas, «Marcar tipología» y «Copiar a las n filas marcadas»; el mensaje indica las filas omitidas y por qué. «Confirmar propuestas» confirma todo de golpe.
- Panel de coberturas: campos agrupados (texto fijo / selectores), «Avisos para la emisión» y «Códigos que se emitirán».
- Guardado en `carpeta.configCoberturas` (clave `TIPONORM||COBERTURA SOLICITADA`).

### 28.3 OFERTA
- Con configuración confirmada, la oferta toma de INFORME cobertura, franquicia, lunas, asistencia, animales y prima; esas columnas quedan bloqueadas («Definido en INFORME»). La prima solo se desvía a mano con `_primaOverride`.
- El anexo de coberturas se construye con `garantiasOferta` (texto para el cliente: «Daños propios con franquicia de 450 €», «Seguro del conductor (22.550 €)»…). Desaparece el «1.800 €» fijo.
- Aviso para minibús/autocar (no admitidos).

### 28.4 EMISIÓN (paso 09)
- Nueva pestaña tras PRE-EMISIÓN (ahora **9 pasos**; `.stp8` más compacto para que quepan a 1440 px).
- «Datos de la emisión»: ID cliente, ID flota, ID colectivo (manuales), fecha de efecto (por defecto la de DATOS GENERALES) y **ID perceptor** de solo lectura tomado del corredor.
- «Valores comunes»: adquisición, uso, garaje, elementos de seguridad, kilómetros, ámbito, frecuencia, CP de circulación, conducción indistinta, tipo de empresa, propietario, cobro externo, periodicidad.
- «Avisos» (bloqueantes y no bloqueantes) y vista previa por vehículo; al pulsar una fila, panel con todas las columnas que se emiten.
- «Descargar Excel de emisión»: plantilla oficial de 110 columnas (`public/templates/PLANTILLA_EMISION_POLIZA.xlsx`, en blanco), máx. 1.000 vehículos. Lógica pura en `core/flotas/emision.ts`; relleno del XLSX en `emisionXlsx.ts`; endpoint `POST /api/flotas/emision-masiva/excel`.

### 28.5 Plantilla del corredor
- Desplegables encadenados **Tipo → Cobertura → Franquicia** (hoja oculta `_LISTAS` + nombres definidos + `INDIRECT`), con validación estricta. Se añade «Motocicleta» como tipo y «Terceros Ampliado con Franquicia».
- El importador (`normalizador.ts`) reconoce esos valores.

### 28.6 Sin flechas
- Los `select` dentro del panel de detalle usan el icono de 3 líneas, como el resto.

### 28.7 Ajustes tras la revisión de Sergio (parche v4.2)
- **Tipografías propias**: Inter y Space Grotesk se sirven desde `src/app/fonts` con `next/font/local` (variables `--font-inter` y `--font-display`). Sin ellas los KPI y títulos pierden tamaño y carácter. No volver a `next/font/google`.
- **Botón Silverdat** (`.mini.sd`): contorno naranja, nunca relleno sólido (el relleno solo en los botones de los modales).
- **PDF de oferta con paginación medida**: el documento mide la altura real de cada bloque y reparte el contenido en el propio navegador (`PAGINADOR` en `HojaOferta.tsx`). Las tablas se parten por filas con el título «(continúa)» y el total solo en la última página sin quedarse solo; las coberturas son tarjetas en dos columnas que se colocan en la columna más corta, y si una no cabe se prueba con la siguiente más pequeña antes de abrir página; un título nunca queda huérfano al final de una hoja. Texto largo en celdas con salto de línea (nada se pisa).
- **Paso 02 Automático · Confirmar oferta**: ocupa todo el ancho como el resto de pasos (antes 980 px pegado a la izquierda). Cambio masivo, descuento global y prima total en la rejilla de tres columnas del propio paso.
- **INFORME**: el configurador «Coberturas por tipología» es una hoja blanca con el mismo formato y ancho que la hoja del informe; ambas ocupan el ancho completo de la página (`.paper.wide`).
